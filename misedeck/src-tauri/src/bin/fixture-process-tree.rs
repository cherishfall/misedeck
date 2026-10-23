// fixture-process-tree — the cross-platform twin of the two bash
// fixtures that drive the process-tree tests (issues #222 and #223).
//
// It replaces two bash fixtures that used to live in `tests/fixtures/`
// and have since been deleted:
//
//   * `hold-stdout-fixture` — a child that exits while a grandchild
//     still holds the stdout pipe open (issue #222).
//   * `tree-kill-fixture` — a child that starts a grandchild and then
//     waits (issue #223).
//
// Both were bash scripts, so `CreateProcess` on Windows refused them
// (os error 193: a file with no executable extension is not a valid
// Win32 application). The Windows CI leg therefore could not run
// either test at all — the whole `process_tree` module was
// `#[cfg(unix)]`, and the #222 case failed on every Windows host.
//
// This binary is the cross-platform implementation. It plays three
// roles, selected by the first argument *after* the runner's
// directory anchor is stripped:
//
//   fixture-process-tree grandchild  <seconds>
//   fixture-process-tree hold-stdout [seconds]
//   fixture-process-tree tree-kill   <pid-file>
//
// The runner always prepends `-C <anchor>` to the argv (issue #179),
// so the leading pair is stripped the same way `fixture-mise` strips
// it — the fixture's own arguments are what follows.
//
// The grandchild is this same binary re-executed in the `grandchild`
// role, so the fixture needs no shell, no `sleep`, and no `sh` — it
// runs identically on unix and on Windows.
//
// Two platform facts shape the implementation:
//
//   * The grandchild must **inherit the stdout handle** for the #222
//     case to mean anything: the runner's reader waits for EOF on the
//     pipe, and EOF only arrives once every write end is closed. A
//     grandchild that inherited a *different* stdout would not hold
//     the pipe open, and the test would pass for the wrong reason.
//     `Stdio::inherit()` is exactly that on both platforms.
//   * The grandchild must be a real **descendant** of the child, not
//     a detached process, because the Windows teardown is
//     `taskkill /F /T` (issue #223) and `/T` walks the parent/child
//     tree. A plain `spawn` gives that on both platforms: on unix the
//     runner's `setsid()` puts the child in a new session and the
//     grandchild inherits that group, so `killpg` reaches it too.
//
// The grandchild's lifetime is bounded by the sleep, so a test that
// fails before its kill assertion still cleans up after itself.

use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

/// Exit code the `hold-stdout` child returns. The #222 test asserts
/// this exact value survives the bounded reader join.
const HOLD_STDOUT_EXIT_CODE: i32 = 7;

/// How long the #222 grandchild holds the stdout pipe open. The
/// runner's reader gives up after one second (`READER_SHUTDOWN_BOUND`),
/// so anything well past that proves the reader — not the child's exit
/// — is what ends the run.
const HOLD_STDOUT_SECONDS: u64 = 10;

/// How long the #223 grandchild lives. Long enough that only an
/// explicit tree kill can end it.
const TREE_KILL_SECONDS: u64 = 300;

/// `CREATE_NO_WINDOW` from `winbase.h` (issue #240).
///
/// The runner spawns the child with this flag, so the child owns no
/// console. A console program spawned from a console-less parent gets
/// a **new, visible** console allocated for it — so without the flag
/// here, the grandchild would flash a black box on the user's screen
/// in the middle of a test run.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn main() {
    let args = own_args();
    let role = args.first().map(String::as_str).unwrap_or("");

    match role {
        "grandchild" => {
            // The long-lived half. It keeps the inherited stdout (and
            // stderr) open for the whole sleep, then exits quietly.
            let seconds: u64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            thread::sleep(Duration::from_secs(seconds));
        }
        "hold-stdout" => {
            let seconds: u64 = args
                .get(1)
                .and_then(|s| s.parse().ok())
                .unwrap_or(HOLD_STDOUT_SECONDS);
            hold_stdout(seconds);
        }
        "tree-kill" => {
            let pid_file = args.get(1).map(PathBuf::from).unwrap_or_default();
            tree_kill(&pid_file);
        }
        other => {
            eprintln!("fixture-process-tree: unknown role '{other}'");
            eprintln!("usage: fixture-process-tree (grandchild|hold-stdout|tree-kill) [arg]");
            std::process::exit(2);
        }
    }
}

/// The fixture's own arguments: the runner's leading `-C <anchor>`
/// pair is stripped, exactly as `fixture-mise` strips it (issue #179).
/// The pair is always present in a runner-driven invocation; the
/// grandchild is spawned directly by the fixture, so it has no pair
/// and the arguments are already its own.
fn own_args() -> Vec<String> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("-C") {
        return args[2.min(args.len())..].to_vec();
    }
    args
}

/// The #222 case: the child exits while the grandchild still holds the
/// stdout pipe.
///
/// The grandchild is spawned with the inherited stdout/stderr, so the
/// pipe's write end stays open in it. The child then prints its last
/// line and exits with `HOLD_STDOUT_EXIT_CODE`. A runner that waits
/// for EOF on the pipe never sees it — the test asserts the run still
/// returns, with the child's exit code and its buffered output intact.
fn hold_stdout(seconds: u64) {
    spawn_grandchild(seconds);
    // "leaving" is the line the test looks for in the drained buffer.
    let mut out = std::io::stdout();
    let _ = writeln!(out, "leaving");
    let _ = out.flush();
    std::process::exit(HOLD_STDOUT_EXIT_CODE);
}

/// The #223 case: the child starts a grandchild, reports its pid, and
/// then waits so the tree stays alive until the runner tears it down.
///
/// The pid goes to the file the test polls, so the test can assert the
/// grandchild is really gone afterwards (and not merely that the child
/// exited).
fn tree_kill(pid_file: &PathBuf) {
    if pid_file.as_os_str().is_empty() {
        eprintln!("fixture-process-tree tree-kill: pid file argument missing");
        std::process::exit(2);
    }
    let mut grandchild = spawn_grandchild(TREE_KILL_SECONDS);
    let pid = grandchild.id();
    if let Err(e) = fs::write(pid_file, pid.to_string()) {
        eprintln!(
            "fixture-process-tree tree-kill: cannot write {}: {e}",
            pid_file.display()
        );
        std::process::exit(2);
    }
    let mut out = std::io::stdout();
    let _ = writeln!(out, "grandchild {pid}");
    let _ = out.flush();
    // Wait for the grandchild. The runner kills the whole tree long
    // before the sleep ends; this only keeps the child alive so the
    // tree exists to be killed.
    let _ = grandchild.wait();
}

/// Spawn the grandchild: this same binary in the `grandchild` role,
/// inheriting stdout and stderr so it holds the runner's pipes open,
/// and detached from our own stdin so it never competes for input.
fn spawn_grandchild(seconds: u64) -> std::process::Child {
    let exe = env::current_exe().expect("current exe path");
    let mut cmd = Command::new(exe);
    cmd.arg("grandchild")
        .arg(seconds.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().expect("spawn grandchild")
}
