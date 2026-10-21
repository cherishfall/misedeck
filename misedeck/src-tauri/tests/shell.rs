// Integration tests for the shell-activation surface (issue #28).
//
//   * `ShellKind::classification` — the basename → enum mapping
//   * `rc_has_mise_activate` — the activation-line matcher; the
//      inline unit tests in `src/shell.rs` cover the same ground
//      and this file is a thin safety net for the wire shape.
//   * `rc_path_for` — the per-shell rc file resolver. We use
//      `tempfile` to set `$HOME` and assert the resolved path
//      points inside the tempdir under the well-known filename
//      (e.g. `.zshrc`, `.bashrc`, `config.fish`).
//   * `check_shell_activation_for` — the end-to-end probe with a
//      pre-populated rc file: when the file contains
//      `mise activate <shell>`, the status reports
//      `activated = Some(true)`; when it does not, the status reports
//      `activated = Some(false)`; when the shell family is unknown
//      and there is no rc to probe, or the rc file cannot be decoded,
//      the status reports `activated = None` (issues #166 and #254 —
//      "we cannot tell", never a false negative).
//
// We avoid touching the user's real `$HOME`; the env var is
// temporarily set to a tempdir for the duration of each test.
//
// `open_in_terminal` is exercised in `tests/terminal.rs` and is
// platform-gated (it actually launches a terminal on the host).

use std::path::PathBuf;
use std::sync::Mutex;

use misedeck_lib::shell::{
    check_shell_activation_for, classify_shell, detect_user_shell_from, rc_path_for,
    ActivationStatus, ShellKind,
};
#[cfg(unix)]
use misedeck_lib::shell::detect_user_shell;

// `std::env::set_var` is not thread-safe; the few tests in this
// file that touch `$HOME` run through this mutex so the
// `serial_test` macro can pair with them. Tests that don't touch
// `$HOME` skip the guard.
static HOME_LOCK: Mutex<()> = Mutex::new(());

fn tempdir() -> PathBuf {
    let dir = tempfile::tempdir().expect("tempdir");
    dir.keep()
}

#[test]
fn classify_shell_zsh() {
    assert_eq!(classify_shell("zsh", "/bin/zsh"), ShellKind::Zsh);
}

#[test]
fn classify_shell_bash() {
    assert_eq!(classify_shell("bash", "/bin/bash"), ShellKind::Bash);
}

#[test]
fn classify_shell_fish() {
    assert_eq!(classify_shell("fish", "/usr/bin/fish"), ShellKind::Fish);
}

#[test]
fn classify_shell_powershell() {
    assert_eq!(
        classify_shell("pwsh.exe", "C:\\Program Files\\PowerShell\\7\\pwsh.exe"),
        ShellKind::PowerShell
    );
    assert_eq!(
        classify_shell("powershell", "/usr/local/bin/powershell"),
        ShellKind::PowerShell
    );
}

#[test]
fn classify_shell_unknown_preserves_name() {
    match classify_shell("nu", "/usr/local/bin/nu") {
        ShellKind::Unknown { name } => assert_eq!(name, "/usr/local/bin/nu"),
        other => panic!("expected Unknown, got {other:?}"),
    }
}

// ---------- detect_user_shell (issue #255) ----------
//
// The audit found the shell probe had no test: `classify_shell` was the
// only covered function, so the env → passwd wiring (the R-1 fix) could
// regress silently. `detect_user_shell_from` is the pure decision half;
// the one test that touches the real environment reads `$SHELL` and is
// `#[serial]` because the env is process-wide.

#[test]
fn detect_user_shell_prefers_the_shell_env_over_the_passwd_entry() {
    // A terminal launch: `$SHELL` is the login shell login(1) exported.
    assert_eq!(
        detect_user_shell_from(Some("/usr/bin/fish"), Some("/bin/zsh")),
        ShellKind::Fish
    );
    assert_eq!(
        detect_user_shell_from(Some("/bin/bash"), None),
        ShellKind::Bash
    );
}

#[test]
fn detect_user_shell_falls_back_to_the_passwd_entry() {
    // Finder/Dock: launchd's session environment has no `SHELL`, so the
    // passwd entry (`getpwuid_r` → `pw_shell`) must take over (R-1).
    assert_eq!(
        detect_user_shell_from(None, Some("/bin/zsh")),
        ShellKind::Zsh
    );
    // A blank export is as absent as a missing one.
    assert_eq!(
        detect_user_shell_from(Some(""), Some("/usr/local/bin/fish")),
        ShellKind::Fish
    );
    assert_eq!(
        detect_user_shell_from(Some("   "), Some("/bin/bash")),
        ShellKind::Bash
    );
}

#[test]
fn detect_user_shell_is_unknown_when_both_sources_are_absent() {
    assert_eq!(
        detect_user_shell_from(None, None),
        ShellKind::Unknown {
            name: "unknown".to_string()
        }
    );
    assert_eq!(
        detect_user_shell_from(Some(""), Some("")),
        ShellKind::Unknown {
            name: "unknown".to_string()
        }
    );
}

#[test]
fn detect_user_shell_preserves_an_unrecognised_login_shell() {
    // An exotic login shell still flows through as Unknown with its raw
    // path so the banner can name it back to the user.
    match detect_user_shell_from(None, Some("/usr/local/bin/nu")) {
        ShellKind::Unknown { name } => assert_eq!(name, "/usr/local/bin/nu"),
        other => panic!("expected Unknown, got {other:?}"),
    }
}

#[cfg(unix)]
#[test]
#[serial_test::serial]
fn detect_user_shell_reads_the_real_shell_env() {
    // The one test that drives the public probe against the process
    // environment. Unix-only: on Windows `detect_user_shell` checks for
    // pwsh on PATH before `$SHELL`.
    let _guard = HOME_LOCK.lock().unwrap();
    let prev = std::env::var_os("SHELL");
    let _restore = ShellGuard::new(prev);
    // SAFETY: the lock serializes all process-env writes in this test
    // binary (the $HOME tests use the same lock).
    unsafe {
        std::env::set_var("SHELL", "/usr/bin/fish");
    }
    assert_eq!(detect_user_shell(), ShellKind::Fish);
}

#[test]
#[serial_test::serial]
fn rc_path_for_uses_temp_home() {
    let _guard = HOME_LOCK.lock().unwrap();
    let tmp = tempdir();
    let prev = std::env::var_os("HOME");
    // SAFETY: the lock above serializes all $HOME writes across
    // this test binary; no other thread reads it concurrently.
    unsafe {
        std::env::set_var("HOME", &tmp);
    }
    let _restore = HomeGuard::new(prev);

    assert_eq!(rc_path_for(&ShellKind::Zsh), tmp.join(".zshrc").to_string_lossy());
    assert_eq!(rc_path_for(&ShellKind::Bash), tmp.join(".bashrc").to_string_lossy());
    assert_eq!(
        rc_path_for(&ShellKind::Fish),
        tmp.join(".config").join("fish").join("config.fish").to_string_lossy()
    );
    // Unknown shells have no specific rc — empty string.
    assert!(rc_path_for(&ShellKind::Unknown { name: "x".to_string() }).is_empty());
}

// The activation probe — the user-facing path. Three shells,
// three rc files, three outcomes.
#[test]
#[serial_test::serial]
fn activation_zsh_with_line_reports_activated() {
    let _guard = HOME_LOCK.lock().unwrap();
    let tmp = tempdir();
    let prev = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &tmp);
    }
    let _restore = HomeGuard::new(prev);
    std::fs::write(tmp.join(".zshrc"), r#"eval "$(mise activate zsh)""#).unwrap();

    let status = check_shell_activation_for(&ShellKind::Zsh).expect("probe");
    assert_eq!(status.shell, ShellKind::Zsh);
    assert_eq!(
        status.activated,
        Some(true),
        "zshrc with `mise activate zsh` should be activated"
    );
    assert!(status.rc_path.ends_with(".zshrc"));
}

#[test]
#[serial_test::serial]
fn activation_zsh_without_line_reports_unactivated() {
    let _guard = HOME_LOCK.lock().unwrap();
    let tmp = tempdir();
    let prev = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &tmp);
    }
    let _restore = HomeGuard::new(prev);
    std::fs::write(
        tmp.join(".zshrc"),
        "# just a zshrc, no activation\nPATH=$PATH:/usr/local/bin\n",
    )
    .unwrap();

    let status = check_shell_activation_for(&ShellKind::Zsh).expect("probe");
    assert_eq!(status.shell, ShellKind::Zsh);
    assert_eq!(
        status.activated,
        Some(false),
        "zshrc without `mise activate` should NOT be activated"
    );
}

#[test]
#[serial_test::serial]
fn activation_bash_with_line_reports_activated() {
    let _guard = HOME_LOCK.lock().unwrap();
    let tmp = tempdir();
    let prev = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &tmp);
    }
    let _restore = HomeGuard::new(prev);
    std::fs::write(
        tmp.join(".bashrc"),
        "if command -v mise >/dev/null; then eval \"$(mise activate bash)\"; fi\n",
    )
    .unwrap();

    let status = check_shell_activation_for(&ShellKind::Bash).expect("probe");
    assert_eq!(status.activated, Some(true));
}

#[test]
#[serial_test::serial]
fn activation_fish_with_line_reports_activated() {
    let _guard = HOME_LOCK.lock().unwrap();
    let tmp = tempdir();
    let prev = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &tmp);
    }
    let _restore = HomeGuard::new(prev);
    let fish_dir = tmp.join(".config").join("fish");
    std::fs::create_dir_all(&fish_dir).unwrap();
    std::fs::write(fish_dir.join("config.fish"), "mise activate fish | source\n").unwrap();

    let status = check_shell_activation_for(&ShellKind::Fish).expect("probe");
    assert_eq!(status.activated, Some(true));
}

#[test]
#[serial_test::serial]
fn activation_unknown_shell_returns_empty_status() {
    let _guard = HOME_LOCK.lock().unwrap();
    let tmp = tempdir();
    let prev = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &tmp);
    }
    let _restore = HomeGuard::new(prev);

    let status = check_shell_activation_for(&ShellKind::Unknown {
        name: "nushell".to_string(),
    })
    .expect("probe");
    // Unknown shell: the probe cannot run, so the state is "we
    // cannot tell" (None) — NOT a false "not activated" (issue #166).
    assert_eq!(status.activated, None);
    assert!(status.rc_path.is_empty());
}

#[test]
#[serial_test::serial]
fn activation_missing_rc_reports_unactivated() {
    let _guard = HOME_LOCK.lock().unwrap();
    let tmp = tempdir();
    let prev = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &tmp);
    }
    let _restore = HomeGuard::new(prev);
    // No .zshrc written — file does not exist.
    let status = check_shell_activation_for(&ShellKind::Zsh).expect("probe");
    assert_eq!(status.activated, Some(false));
}

#[test]
#[serial_test::serial]
fn activation_undecodable_rc_reports_unknown() {
    // A file that exists but is not valid UTF-8 (or UTF-16) is
    // "cannot tell", not "not activated": the tri-state must stay
    // `None` so the UI never renders a false "activation missing"
    // warning (issues #166, #244, #254).
    let _guard = HOME_LOCK.lock().unwrap();
    let tmp = tempdir();
    let prev = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &tmp);
    }
    let _restore = HomeGuard::new(prev);
    std::fs::write(tmp.join(".zshrc"), [0x80, 0x81, 0x82]).unwrap();

    let status = check_shell_activation_for(&ShellKind::Zsh).expect("probe");
    assert_eq!(status.activated, None);
    assert!(
        status.rc_path.ends_with(".zshrc"),
        "the undecodable file is the one named, got {:?}",
        status.rc_path
    );
}

#[test]
#[serial_test::serial]
fn activation_falls_back_to_bash_profile_sibling() {
    // On macOS, the login shell sources `.bash_profile` first;
    // some users put the activation there instead of `.bashrc`.
    // The probe reads `.bashrc` first, then falls back to
    // `.bash_profile` when the primary is missing.
    let _guard = HOME_LOCK.lock().unwrap();
    let tmp = tempdir();
    let prev = std::env::var_os("HOME");
    unsafe {
        std::env::set_var("HOME", &tmp);
    }
    let _restore = HomeGuard::new(prev);
    // .bashrc absent; .bash_profile carries the activation.
    std::fs::write(tmp.join(".bash_profile"), r#"eval "$(mise activate bash)""#).unwrap();

    let status = check_shell_activation_for(&ShellKind::Bash).expect("probe");
    assert_eq!(
        status.activated,
        Some(true),
        "should fall back to .bash_profile and find the activation"
    );
    assert!(status.rc_path.ends_with(".bash_profile"));
}

#[test]
fn activation_status_serializes_with_camel_case_keys() {
    // Lock the on-the-wire shape so a stray rename does not
    // silently break the JS pattern-match.
    let status = ActivationStatus {
        shell: ShellKind::Zsh,
        rc_path: "/home/x/.zshrc".to_string(),
        activated: Some(false),
    };
    let v = serde_json::to_value(&status).unwrap();
    assert!(v.get("shell").is_some(), "must have `shell`, got {v:?}");
    assert!(v.get("rcPath").is_some(), "must have `rcPath` (camelCase), got {v:?}");
    assert!(
        v.get("rcContents").is_none(),
        "rc file text must not cross IPC (issue #254), got {v:?}"
    );
    assert_eq!(v["activated"], false, "`Some(false)` serializes as `false`");
}

#[test]
fn activation_status_unknown_serializes_null_activated() {
    // The unknown-shell branch carries `activated: None`; the wire
    // shape is the JSON `null` the frontend reads as "we cannot
    // tell" (issue #166).
    let status = ActivationStatus {
        shell: ShellKind::Unknown {
            name: "nushell".to_string(),
        },
        rc_path: String::new(),
        activated: None,
    };
    let v = serde_json::to_value(&status).unwrap();
    assert_eq!(v["activated"], serde_json::Value::Null);
    assert_eq!(v["shell"]["kind"], "unknown");
}

#[test]
fn shell_kind_serializes_with_camel_case_tag() {
    // The `tag = "kind", rename_all = "camelCase"` on the enum
    // means the on-the-wire shape is `{ "kind": "zsh" | "bash"
    // | "fish" | "powerShell" | { kind: "unknown", name: ... } }`.
    let z = serde_json::to_value(&ShellKind::Zsh).unwrap();
    assert_eq!(z["kind"], "zsh");
    let b = serde_json::to_value(&ShellKind::Bash).unwrap();
    assert_eq!(b["kind"], "bash");
    let ps = serde_json::to_value(&ShellKind::PowerShell).unwrap();
    assert_eq!(ps["kind"], "powerShell");
    let u = serde_json::to_value(&ShellKind::Unknown {
        name: "nushell".to_string(),
    })
    .unwrap();
    assert_eq!(u["kind"], "unknown");
    assert_eq!(u["name"], "nushell");
}

/// Restore `$HOME` on drop. The struct exists to make the
/// restoration happen even if a test body panics.
struct HomeGuard {
    prev: Option<std::ffi::OsString>,
}

impl HomeGuard {
    fn new(prev: Option<std::ffi::OsString>) -> Self {
        Self { prev }
    }
}

impl Drop for HomeGuard {
    fn drop(&mut self) {
        match self.prev.take() {
            Some(v) => unsafe { std::env::set_var("HOME", v) },
            None => unsafe { std::env::remove_var("HOME") },
        }
    }
}

/// Restore `$SHELL` on drop, for the one test that drives the real
/// `detect_user_shell` probe through the environment.
struct ShellGuard {
    prev: Option<std::ffi::OsString>,
}

impl ShellGuard {
    fn new(prev: Option<std::ffi::OsString>) -> Self {
        Self { prev }
    }
}

impl Drop for ShellGuard {
    fn drop(&mut self) {
        match self.prev.take() {
            Some(v) => unsafe { std::env::set_var("SHELL", v) },
            None => unsafe { std::env::remove_var("SHELL") },
        }
    }
}
