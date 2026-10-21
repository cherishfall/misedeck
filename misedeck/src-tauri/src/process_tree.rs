// Process-tree spawn and termination for every child MiseDeck runs
// (issue #223).
//
// Killing the direct child is not enough. `install.rs` spawns
// `sh -c "curl … | sh"` and `mise run` spawns the task shell: when the
// direct child dies, its children keep running — `curl` and the
// installer keep writing shims, a task shell keeps holding the pipe.
// The same is true when the window closes: the app exits and every
// child is reparented and left behind.
//
// So every child is spawned into its own process group and terminated
// as a group:
//
//   * unix    — `pre_exec` + `setsid()`; the child becomes a session
//               and group leader, so `pgid == pid`, and `killpg`
//               reaches every descendant that did not create its own
//               group.
//   * windows — `CREATE_NEW_PROCESS_GROUP`; `taskkill /F /T /PID`
//               walks the parent/child tree and force-kills it.
//
// A process-wide registry tracks the groups this process started. It
// exists for two reasons: the app-exit hook needs to kill everything
// still alive, and a cancel request needs to find the thread that owns
// the child. The kill itself always runs on the thread holding the
// `Child` handle, which is what keeps a recycled pid from ever being
// signalled: an entry is removed from the registry the moment its
// child is reaped (a reaped pid is free for reuse), and `terminate_all`
// signals while holding the registry lock so no owner can reap between
// the lookup and the kill.

use std::collections::{HashMap, HashSet};
use std::io;
use std::path::Path;
#[cfg(windows)]
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus};
use std::sync::{Mutex, MutexGuard};

use once_cell::sync::Lazy;

/// `CREATE_NEW_PROCESS_GROUP` from `winbase.h`. `std::process::Command`
/// does not expose it as a named constant, so the raw flag is spelled
/// out here (the only Windows-specific literals in this module).
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// `CREATE_NO_WINDOW` from `winbase.h` (issue #240).
///
/// The release binary is a GUI-subsystem process (`main.rs`), so it owns
/// no console. A console program spawned from a console-less parent gets
/// a **new console allocated by Windows, with a visible window** — which
/// is why every `mise` invocation, the install script's `powershell` and
/// the `pwsh --version` probe all flashed a black box on Windows.
/// `CREATE_NO_WINDOW` gives the child a console the user cannot see.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct Registry {
    /// pid → process group of every child this process spawned and has
    /// not reaped. The group id equals the child's pid on both
    /// platforms (a new group whose leader is the child), but the two
    /// are kept apart so the kill call site says what it means.
    children: HashMap<u32, u32>,
    /// Run ids whose cancel arrived before their runner observed it.
    cancelled: HashSet<String>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            children: HashMap::new(),
            cancelled: HashSet::new(),
        }
    }
}

static REGISTRY: Lazy<Mutex<Registry>> = Lazy::new(|| Mutex::new(Registry::default()));

/// The registry lock, surviving poisoning: it holds pids and run ids
/// and no partial invariant, and a panic elsewhere must not make
/// process teardown panic in `Drop` (a double panic aborts the app).
fn registry() -> MutexGuard<'static, Registry> {
    REGISTRY
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Start `cmd`'s child in its own process group / session, so the whole
/// tree can be signalled later. Called by `ChildGuard::spawn`; a bare
/// `Command::spawn` elsewhere (the terminal launcher, tests) stays in
/// the app's group, which is what those call sites want.
fn detach_into_process_group(cmd: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;

        // SAFETY: `setsid` is async-signal-safe and touches no memory
        // of the process that is about to `exec`. Running it in
        // `pre_exec` is the documented way to put the child in a new
        // session: after `fork` the child is not a group leader, so
        // `setsid` cannot fail with `EPERM` here.
        unsafe {
            cmd.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        // A new group is what lets `taskkill /T` (and a future
        // Ctrl-Break style cancel) treat the child's subtree as one
        // unit instead of inheriting the app's group.
        //
        // Both flags in one call: `Command::creation_flags` **assigns**
        // the flag word (it does not OR into it), so a second call would
        // silently drop the first — the exact way the console window
        // suppression was lost before issue #240.
        cmd.creation_flags(child_creation_flags());
    }
}

/// The `CreateProcess` flag word every tracked child gets: its own
/// process group (tree teardown) **and** no console window (issue #240).
/// Named so a test can assert the combination — `creation_flags` takes
/// the word whole, and there is no getter to read it back from a
/// `Command`.
#[cfg(windows)]
fn child_creation_flags() -> u32 {
    CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
}

/// Hide the console window Windows allocates for a console program this
/// GUI process spawns (issue #240). For the children `ChildGuard` owns,
/// `detach_into_process_group` already sets the flag; this is for the
/// spawns that deliberately stay in the app's group (presence probes,
/// the update check's `curl`). No-op off Windows.
///
/// NOT for `shell::run_cmd_start`: the whole point of that spawn is to
/// open a *visible* window, and suppressing the wrapper's console risks
/// hiding the window `start` creates.
#[cfg(windows)]
pub(crate) fn hide_console_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;

    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn hide_console_window(_cmd: &mut Command) {}

/// `…\System32\<parts…>` — where Windows keeps the system binaries this
/// app is entitled to run (issue #253).
///
/// `CreateProcess` searches the **current directory** before `PATH`, so
/// spawning `taskkill` / `curl.exe` / `powershell` / `cmd.exe` by bare
/// name runs whatever file happens to sit in the directory the app was
/// started from. Resolving the system copy explicitly removes the class:
/// a planted binary is never considered, whatever the search order says.
///
/// `parts` is a path inside `System32`, not always one file name:
/// `powershell.exe` sits in `System32\WindowsPowerShell\v1.0\`, not
/// directly under `System32`. `system_root` is injected so the join is
/// testable on every platform; `None` (no `%SystemRoot%`, i.e. a
/// non-Windows build) falls back to the bare name rather than inventing a
/// path.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn system32_under(system_root: Option<&Path>, parts: &[&str]) -> String {
    let Some(root) = system_root else {
        return parts.join("\\");
    };
    let mut path = root.join("System32");
    for part in parts {
        path.push(part);
    }
    path.to_string_lossy().into_owned()
}

/// The absolute System32 binary for this Windows machine.
#[cfg(windows)]
pub(crate) fn system32(program: &str) -> String {
    let root = std::env::var_os("SystemRoot").map(PathBuf::from);
    system32_under(root.as_deref(), &[program])
}

/// `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`.
///
/// Not `System32\powershell.exe`: Windows PowerShell 5.1 lives in its own
/// versioned folder, which is precisely why the install command used a
/// `PATH` lookup. The planted-binary argument is the same as `system32`,
/// and a wrong guess here would break the one path a user without mise
/// takes on day one.
#[cfg(windows)]
pub(crate) fn windows_powershell() -> String {
    let root = std::env::var_os("SystemRoot").map(PathBuf::from);
    system32_under(
        root.as_deref(),
        &["WindowsPowerShell", "v1.0", "powershell.exe"],
    )
}

/// Force-kill one process group. Signal-only: it never reaps, so the
/// owner of the `Child` handle stays responsible for `wait()`.
#[cfg(unix)]
fn kill_group(group: u32) {
    // SAFETY: `killpg` only delivers a signal; no pointer is involved.
    unsafe {
        libc::killpg(group as libc::pid_t, libc::SIGKILL);
    }
}

#[cfg(windows)]
fn kill_group(group: u32) {
    // `taskkill /T` walks the child's descendants, `/F` forces them
    // (no `WM_CLOSE` handshake that a console process would ignore).
    // Its output is discarded: failure is handled by the caller's
    // `child.kill()` fallback, and a process that already exited is a
    // normal outcome, not an error.
    //
    // Absolute System32 path (issue #253): a bare `taskkill` resolves
    // through the current directory first, so a planted binary would run
    // here with the app's privileges.
    let _ = Command::new(system32("taskkill.exe"))
        .args(["/F", "/T", "/PID", &group.to_string()])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
}

/// Platforms with neither `setsid` nor `taskkill` fall back to killing
/// the direct child only (see `ChildGuard::terminate_tree`).
#[cfg(not(any(unix, windows)))]
fn kill_group(_group: u32) {}

/// Ask the runner that owns `run_id` to tear down its process tree
/// (issue #223). The request is a flag, not a signal: the runner
/// polling loop observes it within one slice (~50 ms) and kills from
/// the thread that owns the `Child`, so a cancel can never touch a pid
/// the app does not own. A cancel for an unknown or already finished
/// run is a no-op.
pub fn request_cancel(run_id: &str) {
    if run_id.is_empty() {
        // A blank id belongs to no run; remembering it would only leak.
        return;
    }
    registry().cancelled.insert(run_id.to_string());
}

/// Consume a pending cancel request for `run_id`.
pub(crate) fn take_cancel(run_id: &str) -> bool {
    registry().cancelled.remove(run_id)
}

/// Kill every live process tree this app started. Called from Tauri's
/// `ExitRequested` / `Exit` (issue #223): closing the window during an
/// install or a `mise run` must not leave `curl`/`sh` writing shims in
/// the background.
///
/// The signals are sent while the registry lock is held so an owner
/// cannot reap (and free the pid for reuse) between the lookup and the
/// kill. Owners reap afterwards in their own threads; this function
/// never waits.
pub(crate) fn terminate_all() {
    let state = registry();
    for group in state.children.values() {
        kill_group(*group);
    }
}

/// A spawned child that is tracked in the registry and killed as a
/// process tree on drop unless it has already been reaped.
///
/// The guard also closes a panic hole: a panic while the runner thread
/// waits (in the loop, in a reader join, in `on_event`) drops the
/// guard, which kills the tree instead of leaving it orphaned.
pub(crate) struct ChildGuard {
    child: Option<Child>,
    pid: u32,
    group: u32,
    run_id: Option<String>,
    /// True once the child has been reaped. A reaped pid is free for
    /// reuse, so from that point on the guard must never signal the
    /// group again.
    reaped: bool,
}

impl ChildGuard {
    /// Spawn `cmd` into its own process group and register the group
    /// for cancel and app-exit cleanup. `run_id` links the child to the
    /// execution panel's run so `cancel_run` can stop it.
    pub(crate) fn spawn(cmd: &mut Command, run_id: Option<&str>) -> io::Result<Self> {
        detach_into_process_group(cmd);
        let child = cmd.spawn()?;
        let pid = child.id();
        // The child is unreaped from here on, so its pid cannot be
        // reused; registering before anyone can cancel is safe.
        registry().children.insert(pid, pid);
        Ok(Self {
            child: Some(child),
            pid,
            group: pid,
            run_id: run_id.map(str::to_string),
            reaped: false,
        })
    }

    /// The guarded child. Panics if the tree was already terminated,
    /// which would be a bug in the caller — every call site reads the
    /// child while the guard still owns it.
    pub(crate) fn child(&mut self) -> &mut Child {
        self.child.as_mut().expect("child guard already terminated")
    }

    /// Reap the child if it has exited, unregistering it in the same
    /// step. The unregistration is what makes the registry's promise
    /// ("only pids we still own") hold: a pid leaves the map before it
    /// can be reused.
    ///
    /// The registry lock is held across the `try_wait` call on purpose.
    /// Reaping frees the pid, so if `terminate_all` could look the group
    /// up between the reap and the removal it might signal a pid that
    /// already belongs to an unrelated process. Holding the lock across
    /// both makes the pair atomic: either the kill sees a live child, or
    /// the entry is already gone. `try_wait` is a single `waitpid`, so
    /// the contention this adds is bounded by one syscall.
    pub(crate) fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        let Some(child) = self.child.as_mut() else {
            return Ok(None);
        };
        let mut state = registry();
        let status = child.try_wait()?;
        if status.is_some() {
            self.reaped = true;
            self.unregister_locked(&mut state);
        }
        Ok(status)
    }

    /// Kill the whole process tree and reap the direct child. Used by
    /// timeout, by a cancel request, and by `Drop`.
    ///
    /// The group kill is the real mechanism; `child.kill()` is the
    /// fallback for the cases where it cannot work (the group left the
    /// process group, `taskkill` is missing, a platform with neither
    /// `setsid` nor `taskkill`). Killing the direct child is always
    /// correct — it is the process we spawned.
    pub(crate) fn terminate_tree(&mut self) {
        if self.reaped {
            return;
        }
        kill_group(self.group);
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.reaped = true;
        let mut state = registry();
        self.unregister_locked(&mut state);
    }

    fn unregister_locked(&mut self, state: &mut Registry) {
        state.children.remove(&self.pid);
        // A cancel that arrived after the run finished must not linger
        // and hit a future run that reused the id.
        if let Some(run_id) = self.run_id.take() {
            state.cancelled.remove(&run_id);
        }
    }
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        self.terminate_tree();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    /// Poll `predicate` for up to `bound`, returning as soon as it holds.
    fn wait_until(bound: Duration, mut predicate: impl FnMut() -> bool) -> bool {
        let deadline = Instant::now() + bound;
        while Instant::now() < deadline {
            if predicate() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        predicate()
    }

    /// App-exit cleanup (issue #223): a registered child that started a
    /// grandchild is gone — both processes — after `terminate_all`.
    ///
    /// Unix-only: it relies on `sh` and on signalling the group, and
    /// the Windows CI job runs `cargo test --lib` but has no fixture
    /// shell to drive.
    #[cfg(unix)]
    #[test]
    fn terminate_all_kills_a_registered_tree() {
        let dir = tempfile::tempdir().expect("tempdir");
        let pid_file = dir.path().join("grandchild.pid");
        let script = format!("sleep 60 & echo $! > {}; wait", pid_file.display());
        let mut cmd = Command::new("sh");
        cmd.args(["-c", &script]);
        let mut guard = ChildGuard::spawn(&mut cmd, None).expect("spawn");

        let pid = wait_until(Duration::from_secs(5), || {
            std::fs::read_to_string(&pid_file)
                .ok()
                .and_then(|s| s.trim().parse::<i32>().ok())
                .is_some()
        });
        assert!(pid, "fixture did not report its grandchild pid");
        let grandchild: i32 = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        assert!(
            alive(grandchild),
            "grandchild {grandchild} must be running before the teardown"
        );

        terminate_all();

        assert!(
            wait_until(Duration::from_secs(5), || !alive(grandchild)),
            "grandchild {grandchild} survived terminate_all"
        );
        // The owner still reaps its own child: the registry kills, it
        // never waits.
        let status = wait_until(Duration::from_secs(5), || {
            matches!(guard.try_wait(), Ok(Some(_)))
        });
        assert!(
            status,
            "the direct child was not reaped after terminate_all"
        );
    }

    #[cfg(unix)]
    fn alive(pid: i32) -> bool {
        // SAFETY: signal 0 only checks for existence/ownership.
        unsafe { libc::kill(pid, 0) == 0 }
    }

    /// Issue #253: system binaries are addressed under `System32`, never
    /// by bare name. The join is pure, so the assertion runs on every
    /// platform — including the nested PowerShell shape, which is the one
    /// a naive `System32\<name>` join would get wrong.
    #[test]
    fn system32_paths_are_built_from_the_injected_root() {
        let root = Path::new("/sysroot");
        assert_eq!(
            std::path::PathBuf::from(system32_under(Some(root), &["taskkill.exe"])),
            root.join("System32").join("taskkill.exe")
        );
        assert_eq!(
            std::path::PathBuf::from(system32_under(
                Some(root),
                &["WindowsPowerShell", "v1.0", "powershell.exe"],
            )),
            root.join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        );
        // No `%SystemRoot%` (non-Windows builds, tests): the bare name is
        // reported rather than a made-up path.
        assert_eq!(system32_under(None, &["curl.exe"]), "curl.exe");
    }

    /// On a real Windows process `%SystemRoot%` is always set, so every
    /// helper must produce an absolute path, and PowerShell's must point
    /// at its versioned folder.
    #[cfg(windows)]
    #[test]
    fn system32_resolves_to_absolute_system_paths() {
        for (resolved, name) in [
            (PathBuf::from(system32("taskkill.exe")), "taskkill.exe"),
            (PathBuf::from(system32("curl.exe")), "curl.exe"),
            (PathBuf::from(system32("cmd.exe")), "cmd.exe"),
        ] {
            assert!(resolved.is_absolute(), "got {}", resolved.display());
            assert_eq!(
                resolved
                    .parent()
                    .and_then(|p| p.file_name())
                    .map(|n| n.to_string_lossy().to_string()),
                Some("System32".to_string()),
                "got {}",
                resolved.display()
            );
            assert_eq!(
                resolved.file_name().map(|n| n.to_string_lossy().to_string()),
                Some(name.to_string())
            );
        }

        let powershell = PathBuf::from(windows_powershell());
        assert!(powershell.is_absolute(), "got {}", powershell.display());
        assert_eq!(
            powershell.file_name().map(|n| n.to_string_lossy().to_string()),
            Some("powershell.exe".to_string())
        );
        assert_eq!(
            powershell
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string()),
            Some("v1.0".to_string()),
            "Windows PowerShell 5.1 lives in System32\\WindowsPowerShell\\v1.0 (got {})",
            powershell.display()
        );
    }

    /// Issue #240: both flags must reach `CreateProcess` together — the
    /// process-group one for tree teardown, the no-window one so the GUI
    /// process never flashes a console on the user's screen.
    #[cfg(windows)]
    #[test]
    fn windows_spawn_flag_word_carries_group_and_no_window() {
        assert_eq!(CREATE_NEW_PROCESS_GROUP, 0x0000_0200);
        assert_eq!(CREATE_NO_WINDOW, 0x0800_0000);
        assert_eq!(child_creation_flags(), 0x0800_0200);

        // `creation_flags` assigns rather than ORs; two separate calls
        // would leave only the last flag. Prove the single call still
        // launches (the flag word is accepted by CreateProcess).
        //
        // Polled, not a single `try_wait`: `cmd /c exit 0` is fast but not
        // synchronous, and asserting on the first poll would be a
        // coin-flip on a loaded runner.
        let mut cmd = Command::new("cmd.exe");
        cmd.args(["/c", "exit", "0"]);
        let mut guard = ChildGuard::spawn(&mut cmd, None).expect("spawn");
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        loop {
            match guard.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if std::time::Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                Ok(None) => panic!("hidden child did not exit within 10s"),
                Err(e) => panic!("try_wait failed: {e}"),
            }
        }
    }
}
