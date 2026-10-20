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
use std::process::{Child, Command, ExitStatus};
use std::sync::{Mutex, MutexGuard};

use once_cell::sync::Lazy;

/// `CREATE_NEW_PROCESS_GROUP` from `winbase.h`. `std::process::Command`
/// does not expose it as a named constant, so the raw flag is spelled
/// out here (the only Windows-specific literal in this module).
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

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
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
    }
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
    let _ = Command::new("taskkill")
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
    pub(crate) fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        let Some(child) = self.child.as_mut() else {
            return Ok(None);
        };
        let status = child.try_wait()?;
        if status.is_some() {
            self.reaped = true;
            self.unregister();
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
        self.unregister();
    }

    fn unregister(&mut self) {
        let mut state = registry();
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
}
