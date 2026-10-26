// Shell detection + per-shell activation check (issue #28).
//
// The activation entry points in MiseDeck need to know two things
// about the user's environment:
//   1. Which shell are they running? (drives the line we ask them to
//      add to their rc file — `eval "$(mise activate bash)"` vs
//      `mise activate fish | source`).
//   2. Does their rc file already contain a `mise activate` line? If
//      yes, the activation banner stays hidden; if no, the banner
//      shows the one-liner to copy.
//
// We do NOT run `mise activate` to inspect the shell — we only need
// to know whether the user has activated mise in their interactive
// shell. Reading the rc file directly and matching for the
// activation line is the simplest reliable way; it is also the
// approach `mise doctor` documents in its "shell startup"
// check.
//
// Per-shell rc files (all home-relative; `~` below is the home
// directory `dirs::home_dir()` resolves — `$HOME` on unix, the
// profile known folder on Windows, issue #229):
//   * zsh        → `~/.zshrc`  (and `.zshenv` as a fallback)
//   * bash       → `~/.bashrc` on Linux;
//                  `~/.bash_profile` (and `.bashrc`) on macOS,
//                  where the user shell defaults to bash but the
//                  login rc differs.
//   * fish       → `~/.config/fish/config.fish`
//   * pwsh       → `~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`,
//                  the documented per-user-current-host default for
//                  pwsh 6+. Windows PowerShell 5.1 uses the sibling
//                  `~/Documents/WindowsPowerShell/…` path, which the
//                  probe checks too (issue #244) — and which it names
//                  as the primary when pwsh 7 is not installed, because
//                  on such a machine the `Documents/PowerShell`
//                  directory does not exist at all. There is no
//                  `$PROFILE` *environment* variable — `$PROFILE` is a
//                  PowerShell variable, invisible to a spawned process —
//                  so the lookup always missed (issue #229).

use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::mise::AppError;
// `code` is referenced by the Linux branch below. The import is
// gated on Linux so macOS / Windows builds don't see a dead
// `code::TERMINAL_NOT_FOUND` reference; the reference itself
// lives in the only branch that can ever use it.
#[cfg(all(unix, not(target_os = "macos")))]
use crate::mise::code;

/// Shell family we detected. `Unknown` keeps the shape total so
/// future / exotic shells still flow through the same UI without a
/// hard error — the banner shows a generic "shell not recognised"
/// hint instead of "shell X is missing activation".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ShellKind {
    Zsh,
    Bash,
    Fish,
    PowerShell,
    /// A shell we cannot confidently match (custom login shell,
    /// nushell, xonsh, …). `name` is the raw value from `$SHELL`
    /// or the Windows registry so the UI can show it back to the
    /// user in the banner body.
    Unknown {
        name: String,
    },
}

impl ShellKind {
    /// The activation line the banner asks the user to copy. The
    /// shape mirrors what `mise help activate` documents:
    ///   * zsh / bash  → `eval "$(mise activate <shell>)"`
    ///   * fish        → `mise activate fish | source`
    ///   * pwsh        → `mise activate pwsh | Out-String | Invoke-Expression`
    ///   * unknown     → a generic one-liner that works for most
    ///     POSIX shells, with the caveat that the
    ///     user should consult `mise help activate`.
    pub fn activation_line(&self) -> String {
        match self {
            ShellKind::Zsh => r#"eval "$(mise activate zsh)""#.to_string(),
            ShellKind::Bash => r#"eval "$(mise activate bash)""#.to_string(),
            ShellKind::Fish => "mise activate fish | source".to_string(),
            ShellKind::PowerShell => {
                "mise activate pwsh | Out-String | Invoke-Expression".to_string()
            }
            ShellKind::Unknown { .. } => {
                // Best-effort; works for sh / dash / ksh. Tell the
                // user to read `mise help activate` for the exact
                // line their shell wants.
                r#"eval "$(mise activate sh)""#.to_string()
            }
        }
    }

    /// Human-friendly label for the UI. Kept short so it fits in the
    /// banner body: "zsh", "bash", "fish", "PowerShell", or the raw
    /// shell name when unknown.
    pub fn display_name(&self) -> String {
        match self {
            ShellKind::Zsh => "zsh".to_string(),
            ShellKind::Bash => "bash".to_string(),
            ShellKind::Fish => "fish".to_string(),
            ShellKind::PowerShell => "PowerShell".to_string(),
            ShellKind::Unknown { name } => name.clone(),
        }
    }
}

/// Result of a single shell-activation probe. The JS side consumes
/// `ShellActivationResult` (the Tauri command wrapper) which carries
/// one of these plus a `kind` discriminator.
///
/// Deliberately carries only the decision, never the rc file text: the
/// contents can hold tokens and PATs, the UI only renders `rcPath`, and
/// shipping the whole file across IPC on every launch was an
/// unnecessary exposure (issue #254).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationStatus {
    pub shell: ShellKind,
    /// Absolute path of the rc file the probe decided on. Empty
    /// when we could not determine one (e.g. no home directory
    /// resolvable in a sandboxed test).
    pub rc_path: String,
    /// Tri-state, and the three states are not two:
    ///
    ///   * `Some(true)` — the rc file contains a `mise activate` line
    ///     (or `mise activate <shell>`) that satisfies the matcher below.
    ///   * `Some(false)` — the probe ran and found no such line.
    ///   * `None` — the probe could not decide: the shell family is
    ///     unknown (no rc file to inspect), or the rc file exists but
    ///     could not be decoded (`RcFile::Undecodable`).
    ///
    /// `None` serializes as JSON `null` and must stay `null` on the
    /// wire. It is "cannot tell", not a negative fact: the UI renders
    /// "—" and excludes it from status derivation (issue #166). A
    /// frontend that reads it as `false` would resurrect the exact false
    /// "activation missing" warning this tri-state exists to prevent
    /// (issue #254).
    pub activated: Option<bool>,
}

/// Detect the user's shell. Order of preference:
///
///   Unix:    `$SHELL` (the login shell set by login(1)/getty), then the
///            passwd entry — a Finder/Dock launch inherits launchd's
///            session environment, which has no `SHELL`, so most macOS
///            users would otherwise be told "unknown shell" (issue #253).
///            The path's basename is matched against the known set
///            (`zsh`, `bash`, `fish`). Other basenames fall through
///            to `Unknown` with the raw name preserved.
///   Windows: `$SHELL` first — Git Bash / WSL export a unix-style shell
///            path, and honoring it is what makes their activation
///            instructions reachable (Windows PowerShell 5.1 is present
///            on effectively every machine, so probing it first used to
///            yield `PowerShell` for everyone). A recognized unix-style
///            `$SHELL` (`zsh` / `bash` / `fish`) wins; otherwise `pwsh`
///            on `PATH` (via `where.exe`) or the absolute System32
///            Windows PowerShell decides `PowerShell` (issue #277).
///
/// The function never fails: an undetectable shell returns
/// `Unknown { name: "unknown" }` and the UI surfaces that.
pub fn detect_user_shell() -> ShellKind {
    #[cfg(target_os = "windows")]
    {
        let env_shell = std::env::var_os("SHELL").map(|s| s.to_string_lossy().into_owned());
        detect_windows_shell(
            env_shell.as_deref(),
            windows_pwsh_on_path(),
            windows_powershell_present(),
        )
    }

    #[cfg(unix)]
    {
        let env_shell = std::env::var_os("SHELL").map(|s| s.to_string_lossy().into_owned());
        let passwd_shell = passwd_login_shell();
        detect_user_shell_from(env_shell.as_deref(), passwd_shell.as_deref())
    }
    #[cfg(not(any(unix, target_os = "windows")))]
    {
        let raw = std::env::var_os("SHELL").map(|s| s.to_string_lossy().into_owned());
        detect_user_shell_from(raw.as_deref(), None)
    }
}

/// Decide the Windows shell from what `$SHELL` says and what the two
/// PowerShell probes found.
///
/// Pure so the order is testable on every host (the probe results and
/// the env value are injected; convention: `detect_user_shell_from`).
/// Windows includes a unix-like shell for Git Bash and WSL, and those
/// users need that shell's rc file, not a PowerShell profile. An
/// unrecognized `$SHELL` (a custom shell, or PowerShell itself) does not
/// beat an installed PowerShell — it only provides the fallback name
/// when neither probe succeeds (issue #277).
pub fn detect_windows_shell(
    env_shell: Option<&str>,
    has_pwsh: bool,
    has_windows_powershell: bool,
) -> ShellKind {
    let env_shell = env_shell.map(str::trim).filter(|s| !s.is_empty());
    if let Some(raw) = env_shell {
        if let kind @ (ShellKind::Zsh | ShellKind::Bash | ShellKind::Fish) =
            classify_shell_path(raw)
        {
            return kind;
        }
    }
    if has_pwsh || has_windows_powershell {
        return ShellKind::PowerShell;
    }
    match env_shell {
        Some(raw) => classify_shell_path(raw),
        None => ShellKind::Unknown {
            name: "unknown".to_string(),
        },
    }
}

/// Is `pwsh.exe` on `PATH`? `where.exe` is spawned via its absolute
/// System32 path and only the search is delegated to it — the binary it
/// reports is never executed. Spawning the bare name `pwsh.exe` (the old
/// probe) let `CreateProcess` resolve the current directory first, a
/// binary-planting surface closed by #253 elsewhere (issue #277).
#[cfg(target_os = "windows")]
fn windows_pwsh_on_path() -> bool {
    let where_exe = crate::process_tree::system32("where.exe");
    // `system32` falls back to the bare name when `%SystemRoot%` is
    // missing; spawning that would reopen the planting surface. A real
    // Windows always has SystemRoot, so skipping is safe.
    if !Path::new(&where_exe).is_absolute() {
        return false;
    }
    let mut cmd = Command::new(where_exe);
    cmd.arg("pwsh.exe")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // A GUI process spawning a console program must not flash a window
    // (issue #240).
    crate::process_tree::hide_console_window(&mut cmd);
    match cmd.spawn() {
        Ok(mut child) => wait_with_timeout(&mut child, PROBE_TIMEOUT)
            .map(|status| status.success())
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// Is Windows PowerShell 5.1 present? It lives at a fixed System32 path,
/// so a file check is enough — no bare-name spawn, no `PATH` search
/// (issue #277).
#[cfg(target_os = "windows")]
fn windows_powershell_present() -> bool {
    let powershell = crate::process_tree::windows_powershell();
    let path = Path::new(&powershell);
    path.is_absolute() && path.is_file()
}

/// Classify what the login-shell sources say.
///
/// This is the decision half of `detect_user_shell`, split out so the
/// env → passwd fallback is testable without mutating the process
/// environment or the OS (the test seam is "what the two sources say",
/// issue #255). A missing or blank value from both sources is `Unknown`,
/// never a guess.
pub fn detect_user_shell_from(env_shell: Option<&str>, passwd_shell: Option<&str>) -> ShellKind {
    match resolve_login_shell(env_shell, passwd_shell) {
        Some(raw) => classify_shell_path(&raw),
        None => ShellKind::Unknown {
            name: "unknown".to_string(),
        },
    }
}

/// Pick the shell path to classify: `$SHELL` when it says something, the
/// passwd entry otherwise.
///
/// `$SHELL` is the truth where it exists, but it is a *login shell's*
/// export: a `.app` started from Finder or the Dock inherits launchd's
/// user-session environment instead, which does not set it. The passwd
/// entry (`getpwuid_r` → `pw_shell`) is the same login shell `login(1)`
/// would have exported, so falling back to it keeps the activation
/// banner able to name the rc file the user actually edits (issue #253).
///
/// Pure and argument-driven so the fallback is testable without mutating
/// the process environment (the test seam is "what the two sources say",
/// not the OS). A blank value from either source counts as absent.
#[cfg_attr(not(unix), allow(dead_code))]
fn resolve_login_shell(env_shell: Option<&str>, passwd_shell: Option<&str>) -> Option<String> {
    fn non_blank(raw: &str) -> Option<String> {
        let trimmed = raw.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    }
    env_shell
        .and_then(non_blank)
        .or_else(|| passwd_shell.and_then(non_blank))
}

/// The login shell from the passwd entry (`getpwuid_r`), the fallback
/// source for `$SHELL`. `None` when the lookup fails or the entry's
/// shell is empty.
#[cfg(unix)]
fn passwd_login_shell() -> Option<String> {
    use std::ffi::CStr;

    // SAFETY: `getuid` has no preconditions and cannot fail.
    let uid = unsafe { libc::getuid() };

    // `sysconf` reports the buffer size the platform documents for
    // `getpwuid_r`; 16 KiB is a generous cap when it does not answer.
    let mut size = unsafe { libc::sysconf(libc::_SC_GETPW_R_SIZE_MAX) };
    if size <= 0 {
        size = 16 * 1024;
    }
    let mut buf = vec![0 as libc::c_char; size as usize];
    // SAFETY: an all-zero `passwd` is a valid out-parameter slot;
    // `getpwuid_r` overwrites it and points `result` at it on success.
    let mut passwd: libc::passwd = unsafe { std::mem::zeroed() };
    let mut result: *mut libc::passwd = std::ptr::null_mut();
    // SAFETY: `buf` is `buf.len()` bytes, which is the length passed, and
    // it outlives every read of the strings `passwd` points into.
    let rc =
        unsafe { libc::getpwuid_r(uid, &mut passwd, buf.as_mut_ptr(), buf.len(), &mut result) };
    if rc != 0 || result.is_null() || passwd.pw_shell.is_null() {
        return None;
    }
    // SAFETY: `pw_shell` is NUL-terminated and points into `buf`, which
    // is still alive here.
    let shell = unsafe { CStr::from_ptr(passwd.pw_shell) }.to_string_lossy();
    let trimmed = shell.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// Classify a shell path: match the basename against the known families,
/// keeping the raw path for the `Unknown` label.
fn classify_shell_path(raw: &str) -> ShellKind {
    match Path::new(raw).file_name() {
        Some(basename) => classify_shell(&basename.to_string_lossy(), raw),
        None => classify_shell(raw, raw),
    }
}

pub fn classify_shell(basename: &str, raw: &str) -> ShellKind {
    let lower = basename.to_ascii_lowercase();
    // strip any `.exe` suffix on Windows shells
    let lower = lower.strip_suffix(".exe").unwrap_or(&lower);
    match lower {
        "zsh" => ShellKind::Zsh,
        "bash" => ShellKind::Bash,
        "fish" => ShellKind::Fish,
        "pwsh" | "powershell" => ShellKind::PowerShell,
        _ => ShellKind::Unknown {
            name: raw.to_string(),
        },
    }
}

/// Upper bound for the `which`-style presence probe. Windows `pwsh`
/// cold start can take a couple of seconds; anything past this is
/// treated as "not present" so a hung probe can never stall the
/// command that triggered it (issue #210).
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// Upper bound for the launchers that hand the window off and exit
/// (`open -a`, `cmd /c start`, the server-forwarding Linux trio). One
/// that blocks longer is reported as a failure instead of pinning the
/// command thread. Foreground emulators never go through this bound —
/// they are spawned and released (issue #253).
const LAUNCH_TIMEOUT: Duration = Duration::from_secs(10);

/// Wait for `child`, giving up after `timeout`. Returns `None` when the
/// deadline passes (the child is killed and reaped first so it cannot
/// outlive the probe) or when the wait itself fails. Polling keeps this
/// std-only — no extra crate for what is a two-call helper.
fn wait_with_timeout(child: &mut Child, timeout: Duration) -> Option<ExitStatus> {
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status),
            Ok(None) => {}
            Err(_) => return None,
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        thread::sleep(Duration::from_millis(25));
    }
}

// Only the Linux `linux_terminal_plan` call site uses this, so on every
// other host it is dead code and `-D warnings` would reject it. Scope the
// allowance to exactly those hosts instead of blanket-allowing it
// everywhere (issue #278) — the platform-specific `cfg_attr` pattern the
// rest of this file uses.
#[cfg_attr(not(all(unix, not(target_os = "macos"))), allow(dead_code))]
fn which_exists(name: &str) -> bool {
    // Probe the binary by trying to spawn it with a no-op arg. The
    // path is resolved by the OS, so a missing binary returns
    // `NotFound` and a present binary either runs (success) or
    // rejects the arg (non-zero exit) — both are fine for our
    // presence check. The wait is bounded: `status()` would wait
    // forever on a binary that hangs during startup.
    let mut cmd = Command::new(name);
    cmd.arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());
    // Windows: the probe is a console program spawned from a GUI
    // process — without this flag it flashes a console window (issue #240).
    crate::process_tree::hide_console_window(&mut cmd);
    match cmd.spawn() {
        Ok(mut child) => wait_with_timeout(&mut child, PROBE_TIMEOUT)
            .map(|s| s.success() || s.code().is_some())
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// Compute the rc file path for the given shell. The function does
/// not check that the file exists — `check_shell_activation` reads
/// it and surfaces the `NotFound` case as `activated = Some(false)`. The
/// returned path is always absolute; an empty `String` is returned
/// when no home directory can be resolved (only happens in extreme
/// sandboxes).
///
/// Home is resolved through `dirs::home_dir()`, never the `HOME` env
/// var: Windows has no `HOME`, so every rc path there came back empty
/// and the probe reported `activated: null` forever (issue #229). This
/// is the same resolution `mise.rs` uses for the mise candidates and
/// the Global-mode anchor (issues #208, #179).
pub fn rc_path_for(shell: &ShellKind) -> String {
    let Some(home) = dirs::home_dir() else {
        return String::new();
    };
    rc_path_for_in_with(&home, shell, powershell_seven_installed())
}

/// Is a PowerShell 7+ (`pwsh.exe`) installed?
///
/// This decides which of the two PowerShell profiles is the one worth
/// naming. The two hosts read different files, and a Windows machine
/// with only the inbox 5.1 has no `Documents/PowerShell` directory at
/// all — pointing the banner there sends the user to create a file
/// their shell will never read.
#[cfg(target_os = "windows")]
fn powershell_seven_installed() -> bool {
    windows_pwsh_on_path()
}

/// Off Windows the question does not arise: `ShellKind::PowerShell` is
/// only produced by the Windows detection, so keep the pwsh 7 shape and
/// let the injected-home tests stay meaningful everywhere.
#[cfg(not(target_os = "windows"))]
fn powershell_seven_installed() -> bool {
    true
}

/// The rc path for `shell` under an explicitly given home directory.
///
/// The home is a parameter so the path *shape* is testable on every
/// platform. `rc_path_for` above cannot be tested that way: the
/// production resolver reads `dirs::home_dir()`, which on unix honors
/// `$HOME` but on Windows goes to `SHGetKnownFolderPath` and ignores
/// `$HOME` entirely — a test that faked a home through the env var
/// therefore exercised a different code path on each platform, and on
/// Windows it silently read the real user profile instead. Injecting
/// the home keeps one assertion meaningful everywhere (issue #229).
pub fn rc_path_for_in(home: &Path, shell: &ShellKind) -> String {
    rc_path_for_in_with(home, shell, true)
}

/// The rc path for `shell` under `home`, with the host question "is
/// pwsh 7 installed?" injected.
///
/// `has_pwsh` only matters for `ShellKind::PowerShell`. Both profiles
/// stay in the candidate list either way (`rc_sibling_paths_in_with`),
/// so activation found in the *other* PowerShell's file is still
/// reported as activated — what changes is which file is named when the
/// user has to be told where to add the line (issue #244 follow-up).
pub fn rc_path_for_in_with(home: &Path, shell: &ShellKind, has_pwsh: bool) -> String {
    let path: PathBuf = match shell {
        ShellKind::Zsh => home.join(".zshrc"),
        ShellKind::Bash => {
            // On macOS the login shell sources `.bash_profile`;
            // on Linux it sources `.bashrc`. Honor `.bashrc`
            // (the interactive-non-login default) so the probe
            // hits the file users typically edit; the
            // `.bash_profile` sibling is checked as a fallback
            // in `check_shell_activation`.
            home.join(".bashrc")
        }
        ShellKind::Fish => home.join(".config").join("fish").join("config.fish"),
        ShellKind::PowerShell => {
            // PowerShell's documented per-user-current-host profile for
            // pwsh 6/7. Verified on a real Windows desktop: the path
            // is the one `about_Profiles` documents, derived from the
            // same `dirs::home_dir()` the rest of the probe uses.
            // Windows PowerShell 5.1's profile lives beside it under
            // `WindowsPowerShell/` and is checked through
            // `rc_sibling_paths` (issue #244).
            //
            // Without pwsh 7 installed that path is the *wrong* primary:
            // the directory does not exist, 5.1 never reads it, and the
            // banner would ask the user to create a file for a shell
            // they do not have. The inbox 5.1 profile is the primary in
            // that case, and the pwsh 7 one becomes the sibling.
            if has_pwsh {
                powershell7_profile(home)
            } else {
                windows_powershell_profile(home)
            }
        }
        ShellKind::Unknown { .. } => {
            // No specific rc to suggest; the UI surfaces a
            // generic "we could not detect your shell" hint.
            return String::new();
        }
    };
    path.to_string_lossy().to_string()
}

/// Return the alternative rc paths the matcher should also inspect
/// (e.g. `.bash_profile` alongside `.bashrc` for bash on macOS).
/// Empty list when there are no siblings worth checking.
pub fn rc_sibling_paths(shell: &ShellKind) -> Vec<String> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    rc_sibling_paths_in_with(&home, shell, powershell_seven_installed())
}

/// The sibling rc paths under an explicitly given home directory.
/// Same injection seam as [`rc_path_for_in`].
pub fn rc_sibling_paths_in(home: &Path, shell: &ShellKind) -> Vec<String> {
    rc_sibling_paths_in_with(home, shell, true)
}

/// The sibling rc paths under `home`, with the pwsh-7 question injected.
/// Always the *other* PowerShell's profile, whichever one the primary
/// turned out to be — the pair is symmetric, so an activation line in
/// either file is honoured (issues #244, and the 5.1-only machine that
/// prompted [`powershell_seven_installed`]).
pub fn rc_sibling_paths_in_with(home: &Path, shell: &ShellKind, has_pwsh: bool) -> Vec<String> {
    match shell {
        ShellKind::Bash => vec![home.join(".bash_profile").to_string_lossy().to_string()],
        ShellKind::Zsh => vec![home.join(".zshenv").to_string_lossy().to_string()],
        // Windows ships two PowerShells with two different profiles:
        // pwsh 6+ reads `Documents/PowerShell`, Windows PowerShell 5.1
        // reads `Documents/WindowsPowerShell`. Both are probed; the one
        // that is *not* primary is the sibling. A machine with only 5.1
        // used to read a path the user had never seen and report
        // "activation missing" against it (issue #244).
        ShellKind::PowerShell => {
            let other = if has_pwsh {
                windows_powershell_profile(home)
            } else {
                powershell7_profile(home)
            };
            vec![other.to_string_lossy().to_string()]
        }
        _ => Vec::new(),
    }
}

/// The pwsh 6/7 per-user profile.
fn powershell7_profile(home: &Path) -> PathBuf {
    home.join("Documents")
        .join("PowerShell")
        .join("Microsoft.PowerShell_profile.ps1")
}

/// The inbox Windows PowerShell 5.1 per-user profile.
fn windows_powershell_profile(home: &Path) -> PathBuf {
    home.join("Documents")
        .join("WindowsPowerShell")
        .join("Microsoft.PowerShell_profile.ps1")
}

/// Read the rc file at `path`. A missing file is `RcFile::Missing`; an
/// existing one is decoded with BOM awareness (issue #244).
///
/// Encoding is not decoration: on Windows a profile written by Notepad
/// ("Unicode") is UTF-16 LE, and reading it with `read_to_string` failed
/// with `InvalidData`, which the caller propagated as a command error —
/// the activation banner degraded to an error state instead of saying
/// "cannot tell". A UTF-8 BOM is worse: the read succeeds, but the first
/// line carries a leading `U+FEFF` that `trim_start` does not strip
/// (a BOM is not whitespace), so a first-line `mise activate` missed.
/// Only I/O failures that are not `NotFound` still propagate.
pub fn read_rc_file(path: &str) -> Result<RcFile, std::io::Error> {
    if path.is_empty() {
        return Ok(RcFile::Missing);
    }
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(RcFile::Missing),
        Err(e) => return Err(e),
    };
    Ok(decode_rc_bytes(&bytes))
}

/// What a rc file turned out to be (issue #244).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RcFile {
    /// No such file (or no path worth probing).
    Missing,
    /// Decoded text — the only case the activation matcher can judge.
    Text(String),
    /// The file exists but is neither BOM-tagged UTF-16 nor valid UTF-8
    /// (a legacy single-byte encoding). Guessing would risk a false
    /// "not activated", so the probe reports "cannot tell" instead —
    /// the `None` state from issue #166.
    Undecodable,
}

/// Decode rc-file bytes: UTF-8 BOM (stripped), UTF-16 LE/BE BOM
/// (decoded), otherwise valid UTF-8 only. A file that is none of those
/// is `Undecodable` rather than lossily mangled — a wrong decode turns
/// `mise activate` into mojibake and reports a false negative.
pub fn decode_rc_bytes(bytes: &[u8]) -> RcFile {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        // UTF-8 BOM: the body is ordinary UTF-8.
        return match std::str::from_utf8(rest) {
            Ok(text) => RcFile::Text(text.to_string()),
            Err(_) => RcFile::Undecodable,
        };
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return RcFile::Text(decode_utf16(rest, true));
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return RcFile::Text(decode_utf16(rest, false));
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => RcFile::Text(text.to_string()),
        Err(_) => RcFile::Undecodable,
    }
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> String {
    let units: Vec<u16> = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| {
            if little_endian {
                u16::from_le_bytes([pair[0], pair[1]])
            } else {
                u16::from_be_bytes([pair[0], pair[1]])
            }
        })
        .collect();
    String::from_utf16_lossy(&units)
}

/// Decide whether the rc file contents already contain a
/// `mise activate` line. The match is intentionally simple: a
/// non-comment line containing the substring `mise activate` (any
/// shell-respecting form) is enough. Comment lines (starting with
/// `#` for POSIX shells or `# ` for fish, or `;` for INI-style
/// rc files) are skipped so a commented-out activation does not
/// count as "activated". This is a one-liner greppable match, not
/// a parser: `mise activate` may appear in `eval "$(mise activate
/// zsh)"`, in a sourced file, in `mise activate fish | source`,
/// or in a more elaborate conditional — all satisfy the user.
pub fn rc_has_mise_activate(contents: &str) -> bool {
    contents.lines().any(line_is_mise_activate)
}

fn line_is_mise_activate(line: &str) -> bool {
    let trimmed = line.trim_start();
    if trimmed.is_empty() {
        return false;
    }
    // Skip common comment markers; we still want to detect the
    // substring on actual code lines. Some users also wrap the
    // call in `[[ -x mise ]] && eval ...` — those are real lines.
    if trimmed.starts_with('#') {
        return false;
    }
    if trimmed.starts_with("//") {
        return false;
    }
    if trimmed.starts_with(';') {
        return false;
    }
    trimmed.contains("mise activate")
}

/// Detect the user shell, read its rc file, and decide whether
/// `mise activate` is present. Convenience wrapper that combines
/// `detect_user_shell`, `rc_path_for`, `read_rc_file`, and
/// `rc_has_mise_activate`. Returns `ActivationStatus` with
/// `activated = Some(false)` when the probe ran and found nothing (a
/// read failure on a non-`NotFound` IO error is propagated as a
/// CommandFailed AppError by the caller — this function returns the
/// structured status for the happy path only).
pub fn check_shell_activation() -> Result<ActivationStatus, std::io::Error> {
    let shell = detect_user_shell();
    check_shell_activation_for(&shell)
}

/// Same as `check_shell_activation` but for a caller-provided shell
/// (used by the tests and by the future "force re-check" affordance
/// if one is ever added).
///
/// `activated` is tri-state: `Some(true)` when an activation line was
/// found, `Some(false)` when a readable rc file exists without one (or
/// none exists), and `None` when the answer cannot be known — an
/// unknown shell with no rc path, or an rc file that exists but cannot
/// be decoded. `None` is "cannot tell", never "not activated".
pub fn check_shell_activation_for(shell: &ShellKind) -> Result<ActivationStatus, std::io::Error> {
    // Home comes from `dirs::home_dir()`, never `$HOME` — Windows has
    // no `HOME` and the known folder is the only correct answer there
    // (issue #229). A home that cannot be resolved at all leaves the
    // probe with nothing to read, which is "cannot tell" (`None`).
    let Some(home) = dirs::home_dir() else {
        return Ok(ActivationStatus {
            shell: shell.clone(),
            rc_path: String::new(),
            activated: None,
        });
    };
    check_shell_activation_for_in(&home, shell)
}

/// The activation probe against an explicitly given home directory.
///
/// Same injection seam as [`rc_path_for_in`]: the production entry
/// point resolves the home through the platform API, which differs
/// between unix (`$HOME`) and Windows (the known folder), so a test
/// that faked a home through the env var exercised a different path on
/// each platform. Injecting it keeps one assertion meaningful
/// everywhere (issue #229).
pub fn check_shell_activation_for_in(
    home: &Path,
    shell: &ShellKind,
) -> Result<ActivationStatus, std::io::Error> {
    check_shell_activation_for_in_with(home, shell, powershell_seven_installed())
}

/// The activation probe with both seams injected: the home directory
/// and the "is pwsh 7 installed?" answer. The second one decides which
/// PowerShell profile the banner names when neither file has an
/// activation line (issue #244 follow-up).
pub fn check_shell_activation_for_in_with(
    home: &Path,
    shell: &ShellKind,
    has_pwsh: bool,
) -> Result<ActivationStatus, std::io::Error> {
    let primary = rc_path_for_in_with(home, shell, has_pwsh);
    let siblings = rc_sibling_paths_in_with(home, shell, has_pwsh);

    // No specific rc for unknown shells — the probe cannot run, so
    // the status carries `activated: None` (not `Some(false)`): the
    // UI surfaces a generic "we could not detect your shell" message
    // instead of reporting "not activated", which would be a false
    // warning for a whole class of environments (issue #166).
    if primary.is_empty() {
        return Ok(ActivationStatus {
            shell: shell.clone(),
            rc_path: String::new(),
            activated: None,
        });
    }

    // Primary file first, then the shell's siblings (`.bash_profile`,
    // `.zshenv`, the Windows PowerShell 5.1 profile). An activation line
    // in any of them wins; the first readable file that lacks it is the
    // one the banner names. A file that exists but cannot be decoded is
    // "cannot tell", never "not activated" (issues #166, #244).
    let mut first_unactivated: Option<String> = None;
    let mut undecodable: Option<String> = None;
    for candidate in std::iter::once(&primary).chain(siblings.iter()) {
        match read_rc_file(candidate)? {
            RcFile::Missing => continue,
            RcFile::Text(text) => {
                if rc_has_mise_activate(&text) {
                    return Ok(ActivationStatus {
                        shell: shell.clone(),
                        rc_path: candidate.clone(),
                        activated: Some(true),
                    });
                }
                if first_unactivated.is_none() {
                    first_unactivated = Some(candidate.clone());
                }
            }
            RcFile::Undecodable => {
                if undecodable.is_none() {
                    undecodable = Some(candidate.clone());
                }
            }
        }
    }

    if let Some(rc_path) = first_unactivated {
        return Ok(ActivationStatus {
            shell: shell.clone(),
            rc_path,
            activated: Some(false),
        });
    }

    if let Some(rc_path) = undecodable {
        return Ok(ActivationStatus {
            shell: shell.clone(),
            rc_path,
            activated: None,
        });
    }

    // Nothing exists on disk: report "not activated" for the primary
    // path, which is also the path the banner tells the user to edit.
    Ok(ActivationStatus {
        shell: shell.clone(),
        rc_path: primary,
        activated: Some(false),
    })
}

// ---------- Open-in-terminal (issue #28) ----------
//
// "Open the current directory in a terminal with mise activated" is
// the third affordance. The behaviour is platform-specific:
//
//   * macOS   → `open -a Terminal <path>` (always Terminal.app —
//                honouring the user's default terminal would need
//                a third-party call; the working agreement is
//                "the macOS experience is solid", not "honour
//                iTerm"). The terminal will land in the user's
//                home directory, not at `path`, because `open -a`
//                does not accept a `--working-directory` flag.
//                That is documented as a limitation; the
//                "Copy command" affordance is the precise
//                alternative.
//   * Windows → `cmd /c start "" cmd` opens a console window whose
//                working directory is the path. The directory is the
//                child's cwd, not command-line text: cmd.exe re-parses
//                its line and expands `%…%` even inside quotes, so no
//                quoting can make an arbitrary directory safe (issues
//                #210 → #242, see `windows_cmd_start_plan`). `start`
//                with the directory itself is *not* a terminal launch —
//                it opens File Explorer (issue #242).
//   * Linux   → probe `LINUX_TERMINALS` in order (Debian's alternatives
//                entry, the current GNOME/Fedora defaults, the legacy
//                trio, then standalone emulators), each with its own
//                cwd flag; the child also gets `current_dir`, so an
//                emulator that ignores the flag still opens in the right
//                place (issue #245). Server-forwarding wrappers are
//                waited on; foreground emulators are spawned and
//                released, because they outlive the click (issue #253).
//                If none is found, return `TERMINAL_NOT_FOUND` so the UI
//                surfaces the copyable command instead. The probe is a
//                `which` lookup; we do not actually launch the terminal
//                here — we hand the argv to the shell so the user can
//                take the same action manually if the spawn ever fails.
//
// All three code paths are cross-platform enough to be called from
// a single `open_in_terminal(path: Option<&str>)` entry point; the
// result carries the platform label so the UI can show what
// actually happened (e.g. "Opened Terminal.app at <path>").

/// Result of an open-in-terminal attempt. The `platform` field is
/// a human label ("macOS" / "Windows" / "Linux" / "FreeBSD") so the
/// UI's success toast can be platform-aware without re-doing the
/// classification. `terminal_app` is the exact app the command
/// targeted (e.g. "Terminal.app", "gnome-terminal") — useful for
/// debugging and for the UI's success line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOpenOutcome {
    pub platform: String,
    pub terminal_app: String,
    /// The path the terminal was opened at (always absolute;
    /// empty when `path` was `None` and the platform has no
    /// sensible home fallback).
    pub path: String,
    /// The exact argv the command ran with. Surfaced in debug
    /// logs and in the "Copy command" fallback when the launch
    /// itself failed.
    pub argv: Vec<String>,
}

/// The `cmd.exe` invocation that opens a window at a directory
/// (issue #242).
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub struct WindowsCmdStartPlan {
    /// Human-readable argv reported in `TerminalOpenOutcome`.
    pub argv: Vec<String>,
}

/// Plan the Windows launch.
///
/// `start` with a **directory** argument is not a terminal launch: it
/// hands the folder to ShellExecute, so the user got File Explorer with
/// a "opened cmd.exe at …" toast (issue #242). The target is now `cmd`
/// itself, and the directory is handed over as the child's **working
/// directory** (`Command::current_dir`) rather than as text in the
/// command line — which also supersedes #210's environment-variable
/// hand-off. cmd.exe parses its command line and expands `%NAME%` even
/// inside quotes, so *no* directory string can be made safe there;
/// keeping it out of the command line entirely is the only structural
/// fix. `C:\50%off%`, `C:\A & B` and `C:\caret^dir` now arrive intact
/// because they never pass through a parser.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn windows_cmd_start_plan() -> WindowsCmdStartPlan {
    // `start "" cmd`: the empty argument is `start`'s title, which must
    // be present or `start` treats the command as the title and opens
    // nothing. The new console window inherits the inherited cwd.
    //
    // Both `cmd.exe` references are the absolute `%SystemRoot%\System32`
    // copy: `CreateProcess` searches the current directory before `PATH`,
    // so a bare name runs a binary planted where the app was started
    // (issue #253).
    #[cfg(target_os = "windows")]
    let cmd = crate::process_tree::system32("cmd.exe");
    #[cfg(not(target_os = "windows"))]
    let cmd = "cmd.exe".to_string();
    WindowsCmdStartPlan {
        argv: vec![
            cmd.clone(),
            "/c".to_string(),
            "start".to_string(),
            String::new(),
            cmd,
        ],
    }
}

/// One Linux terminal candidate (issue #245).
///
/// Every launch also sets the child's working directory (`current_dir`),
/// which is what most emulators actually honour — the flag is belt and
/// braces for the ones that would otherwise start in `$HOME`. A spec with
/// no flags (`x-terminal-emulator`, whose target is unknown by design)
/// relies on the inherited cwd alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LinuxTerminalSpec {
    pub binary: &'static str,
    /// Argv tail placed before the path.
    pub args: &'static [&'static str],
    /// True when the path joins the last flag with `=` (the GNOME / KDE
    /// `--flag=<path>` form), false when it is its own argv element.
    pub equals_form: bool,
    /// True when the binary hands the window to a long-lived server and
    /// exits immediately (`gnome-terminal`, `konsole`, `xfce4-terminal`).
    /// Those are the only candidates whose exit status means anything, so
    /// they are the only ones worth waiting for.
    ///
    /// False for a **foreground** emulator (`kgx`, `ptyxis`, `kitty`,
    /// `alacritty`, `foot`, `wezterm`, `urxvt`): it runs for as long as
    /// its window is open, so waiting on it meant waiting out
    /// `LAUNCH_TIMEOUT` and then killing the terminal the user had just
    /// opened — reported as a failed launch (issue #253). Spawn success is
    /// the success signal for those.
    pub returns_immediately: bool,
}

/// Probe order for Linux (issue #245). `x-terminal-emulator` comes first
/// because on Debian it is the user's declared choice; then the current
/// defaults of the big distros (Ubuntu 24.04 ships GNOME Console `kgx`,
/// Fedora 40+ `ptyxis`, both of which dropped `gnome-terminal`), then the
/// long-standing ones, then standalone emulators a developer installed.
///
/// `returns_immediately` is true only for the server-forwarding trio; see
/// its doc comment. `x-terminal-emulator` is a symlink whose target is
/// unknown, and it may resolve to a foreground emulator, so it is treated
/// as one — not waiting costs nothing, waiting on the wrong target kills
/// the terminal.
pub const LINUX_TERMINALS: &[LinuxTerminalSpec] = &[
    LinuxTerminalSpec {
        binary: "x-terminal-emulator",
        // Debian alternative: the target could be anything, so no flag
        // is safe to pass. The inherited cwd still lands the shell in
        // the right directory.
        args: &[],
        equals_form: false,
        returns_immediately: false,
    },
    LinuxTerminalSpec {
        binary: "kgx",
        args: &["--working-directory"],
        equals_form: true,
        returns_immediately: false,
    },
    LinuxTerminalSpec {
        binary: "ptyxis",
        args: &["--working-directory"],
        equals_form: true,
        returns_immediately: false,
    },
    LinuxTerminalSpec {
        binary: "gnome-terminal",
        args: &["--working-directory"],
        equals_form: true,
        returns_immediately: true,
    },
    LinuxTerminalSpec {
        binary: "konsole",
        args: &["--workdir"],
        equals_form: true,
        returns_immediately: true,
    },
    LinuxTerminalSpec {
        binary: "xfce4-terminal",
        args: &["--working-directory"],
        equals_form: true,
        returns_immediately: true,
    },
    LinuxTerminalSpec {
        binary: "alacritty",
        args: &["--working-directory"],
        equals_form: false,
        returns_immediately: false,
    },
    LinuxTerminalSpec {
        binary: "kitty",
        args: &["--directory"],
        equals_form: false,
        returns_immediately: false,
    },
    LinuxTerminalSpec {
        binary: "wezterm",
        args: &["start", "--cwd"],
        equals_form: false,
        returns_immediately: false,
    },
    LinuxTerminalSpec {
        binary: "foot",
        args: &["--working-directory"],
        equals_form: true,
        returns_immediately: false,
    },
    LinuxTerminalSpec {
        binary: "urxvt",
        args: &["-cd"],
        equals_form: false,
        returns_immediately: false,
    },
];

/// argv for one candidate at `path`. Pure, so the per-terminal flag
/// shapes are testable without launching anything.
pub fn linux_terminal_argv(spec: &LinuxTerminalSpec, path: &str) -> Vec<String> {
    let mut argv = vec![spec.binary.to_string()];
    match spec.args.split_last() {
        None => {}
        Some((last, init)) => {
            argv.extend(init.iter().map(|a| a.to_string()));
            if spec.equals_form {
                argv.push(format!("{last}={path}"));
            } else {
                argv.push((*last).to_string());
                argv.push(path.to_string());
            }
        }
    }
    argv
}

/// Pick the first available terminal from `LINUX_TERMINALS` and build its
/// argv. `available` is injected so the order and the argv shapes are
/// unit-tested on every platform; production passes `which_exists`.
pub fn linux_terminal_plan(
    path: &str,
    mut available: impl FnMut(&str) -> bool,
) -> Option<(LinuxTerminalSpec, Vec<String>)> {
    for spec in LINUX_TERMINALS {
        if available(spec.binary) {
            return Some((*spec, linux_terminal_argv(spec, path)));
        }
    }
    None
}

pub fn open_in_terminal(path: Option<&str>) -> Result<TerminalOpenOutcome, AppError> {
    // Resolve the target path: caller-supplied (must exist and be
    // a directory) or the home directory as a fallback. Home comes
    // from `dirs::home_dir()` — `$HOME` is unset on Windows, which
    // made this arm fail every time there (issue #229).
    let resolved = match path {
        Some(p) if !p.is_empty() => {
            let pb = PathBuf::from(p);
            if !pb.is_dir() {
                return Err(AppError::command_failed(
                    format!("open_in_terminal: not a directory: {p}"),
                    String::new(),
                ));
            }
            pb
        }
        _ => dirs::home_dir().ok_or_else(|| {
            AppError::command_failed("open_in_terminal: no home directory to open", String::new())
        })?,
    };
    let path_str = resolved.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        let argv: Vec<String> = vec![
            "open".to_string(),
            "-a".to_string(),
            "Terminal".to_string(),
            resolved.to_string_lossy().to_string(),
        ];
        run_argv(&argv, "macOS", "Terminal.app", &path_str)?;
        Ok(TerminalOpenOutcome {
            platform: "macOS".to_string(),
            terminal_app: "Terminal.app".to_string(),
            path: path_str,
            argv,
        })
    }

    #[cfg(target_os = "windows")]
    {
        // A `cmd` window rooted at the directory (issue #242). The
        // directory travels as the child's working directory — see
        // `windows_cmd_start_plan` for why it must not appear in the
        // command line.
        let plan = windows_cmd_start_plan();
        run_cmd_start(&resolved, &plan.argv, &path_str)?;
        Ok(TerminalOpenOutcome {
            platform: "Windows".to_string(),
            terminal_app: "cmd.exe".to_string(),
            path: path_str,
            argv: plan.argv,
        })
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // Linux (and other Unixes that are not macOS). The table covers
        // the current defaults of the major distros, not just the 2015
        // trio (issue #245); the cwd is set on the child as well as
        // passed as a flag, so an emulator that ignores its own flag
        // still opens in the right directory.
        match linux_terminal_plan(&path_str, which_exists) {
            Some((spec, argv)) => {
                let (bin, args) = argv.split_first().expect("argv is non-empty");
                let mut cmd = Command::new(bin);
                cmd.args(args).current_dir(&resolved);
                // A server-forwarding wrapper exits once it handed the
                // window off, so its exit status is real. A foreground
                // emulator stays alive for the window's lifetime — waiting
                // on it would kill the terminal at the deadline and report
                // a launch that visibly worked as a failure (issue #253).
                if spec.returns_immediately {
                    run_prepared(cmd, "Linux", spec.binary, &path_str, &argv)?;
                } else {
                    spawn_and_release(cmd, "Linux", spec.binary, &path_str, &argv)?;
                }
                Ok(TerminalOpenOutcome {
                    platform: "Linux".to_string(),
                    terminal_app: spec.binary.to_string(),
                    path: path_str,
                    argv,
                })
            }
            None => Err(AppError::new(
                code::TERMINAL_NOT_FOUND,
                "errors.terminalNotFound",
                String::new(),
            )),
        }
    }
}

/// Launcher for the Windows `start` path (issue #242). The directory is
/// the child's working directory, never command-line text; the new
/// console window `start` creates inherits it.
///
/// The wrapper itself is deliberately *not* given
/// `CREATE_NO_WINDOW` (issue #240): suppressing it risks suppressing the
/// console `start` hands to the new window, and the wrapper lives for a
/// few milliseconds anyway.
#[cfg(target_os = "windows")]
fn run_cmd_start(dir: &Path, argv: &[String], path: &str) -> Result<(), AppError> {
    let (bin, args) = argv.split_first().expect("plan argv is non-empty");
    let mut cmd = Command::new(bin);
    cmd.args(args).current_dir(dir);
    run_prepared(cmd, "Windows", "cmd.exe", path, argv)
}

/// Helper: spawn an argv in the background (the terminal launches
/// detached and returns immediately). The spawn errors are
/// translated into `AppError::command_failed` so the UI can surface
/// them; a success exit status is the only "ok" path because we
/// don't wait for the terminal to actually render a prompt.
/// `terminal_app` is included in the error message so the user
/// can see which app the launch attempted.
#[cfg(target_os = "macos")]
fn run_argv(
    argv: &[String],
    platform: &str,
    terminal_app: &str,
    path: &str,
) -> Result<(), AppError> {
    if argv.is_empty() {
        return Err(AppError::command_failed(
            "open_in_terminal: empty argv",
            String::new(),
        ));
    }
    let (bin, args) = argv.split_first().expect("non-empty");
    let mut cmd = Command::new(bin);
    cmd.args(args);
    run_prepared(cmd, platform, terminal_app, path, argv)
}

/// Give a prepared launcher no inherited stdio and start it. The terminal
/// owns its own window; a child that outlived us holding app pipes would
/// only block on a full pipe. Spawn errors carry the argv so the UI's
/// failure text names the exact command that did not start.
fn spawn_launcher(
    mut cmd: Command,
    platform: &str,
    terminal_app: &str,
    path: &str,
    argv: &[String],
) -> Result<Child, AppError> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn().map_err(|e| {
        AppError::command_failed(
            format!(
                "{platform} terminal launch via {terminal_app} failed for {path}: {e} (argv: {argv:?})"
            ),
            String::new(),
        )
    })
}

/// Spawn a launcher and wait for it under `LAUNCH_TIMEOUT`. Only for the
/// wrappers that hand the window off and exit (`open -a`, `cmd /c start`,
/// the server-forwarding Linux trio); one that is still running at the
/// deadline is killed and reported as a failure so a hung binary cannot
/// pin the command thread.
fn run_prepared(
    cmd: Command,
    platform: &str,
    terminal_app: &str,
    path: &str,
    argv: &[String],
) -> Result<(), AppError> {
    let mut child = spawn_launcher(cmd, platform, terminal_app, path, argv)?;
    match wait_with_timeout(&mut child, LAUNCH_TIMEOUT) {
        Some(s) if s.success() => Ok(()),
        Some(s) => Err(AppError::command_failed(
            format!(
                "{platform} terminal launch via {terminal_app} exited with status {s} for {path} (argv: {argv:?})"
            ),
            String::new(),
        )),
        None => Err(AppError::command_failed(
            format!(
                "{platform} terminal launch via {terminal_app} failed or did not finish within {}s for {path} (argv: {argv:?})",
                LAUNCH_TIMEOUT.as_secs()
            ),
            String::new(),
        )),
    }
}

/// Spawn a foreground emulator and release it: `spawn` success is success
/// (issue #253).
///
/// The emulator lives until the user closes its window, which is hours,
/// not `LAUNCH_TIMEOUT` — so there is nothing to wait for and nothing to
/// kill. The `Child` is handed to a detached thread whose only job is to
/// `wait()` on it, so the exit is reaped instead of leaving a zombie
/// behind. A thread per launch is cheap and bounded by the user's clicks.
///
/// Only the Linux branch has foreground candidates; the helper is
/// unit-tested on every platform.
#[cfg_attr(not(all(unix, not(target_os = "macos"))), allow(dead_code))]
fn spawn_and_release(
    cmd: Command,
    platform: &str,
    terminal_app: &str,
    path: &str,
    argv: &[String],
) -> Result<(), AppError> {
    let mut child = spawn_launcher(cmd, platform, terminal_app, path, argv)?;
    thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_shell_handles_known_basename() {
        assert_eq!(classify_shell("zsh", "/bin/zsh"), ShellKind::Zsh);
        assert_eq!(classify_shell("bash", "/bin/bash"), ShellKind::Bash);
        assert_eq!(classify_shell("fish", "/usr/bin/fish"), ShellKind::Fish);
        assert_eq!(
            classify_shell("pwsh.exe", "C:\\Program Files\\PowerShell\\7\\pwsh.exe"),
            ShellKind::PowerShell
        );
    }

    #[test]
    fn classify_shell_handles_unknown() {
        let u = classify_shell("nu", "/usr/local/bin/nu");
        match u {
            ShellKind::Unknown { name } => assert_eq!(name, "/usr/local/bin/nu"),
            other => panic!("expected Unknown, got {other:?}"),
        }
    }

    #[test]
    fn rc_has_mise_activate_matches_known_lines() {
        assert!(rc_has_mise_activate(r#"eval "$(mise activate zsh)""#));
        assert!(rc_has_mise_activate(
            "if command -v mise &> /dev/null; then eval \"$(mise activate bash)\"; fi"
        ));
        assert!(rc_has_mise_activate("mise activate fish | source"));
        // Sourced snippets count too.
        assert!(rc_has_mise_activate(
            "source ~/.local/share/mise/bin/mise activate bash"
        ));
    }

    #[test]
    fn rc_has_mise_activate_ignores_comments() {
        // POSIX comment.
        assert!(!rc_has_mise_activate("# eval \"$(mise activate zsh)\""));
        // Fish comment.
        assert!(!rc_has_mise_activate("# mise activate fish | source"));
        // The actual line is blank/no mise-activate, so the file
        // does not count as activated even though it has lines.
        assert!(!rc_has_mise_activate(
            "\n# a comment\n\nPATH=$PATH:/usr/local/bin"
        ));
    }

    #[test]
    fn rc_has_mise_activate_returns_false_on_empty() {
        assert!(!rc_has_mise_activate(""));
        assert!(!rc_has_mise_activate("\n\n   \n"));
    }

    /// Issue #244: Windows profiles are routinely written as UTF-16
    /// ("Unicode" in Notepad) or carry a UTF-8 BOM. Both used to lose
    /// the activation line — one as a read error, one as a `U+FEFF`
    /// glued to the first line.
    #[test]
    fn decode_rc_bytes_handles_boms() {
        let line = "mise activate pwsh | Out-String | Invoke-Expression";

        // Plain UTF-8, no BOM.
        assert_eq!(
            decode_rc_bytes(line.as_bytes()),
            RcFile::Text(line.to_string())
        );

        // UTF-8 BOM: stripped, so the first line is matchable.
        let mut utf8_bom = vec![0xEF, 0xBB, 0xBF];
        utf8_bom.extend_from_slice(line.as_bytes());
        match decode_rc_bytes(&utf8_bom) {
            RcFile::Text(text) => {
                assert_eq!(text, line);
                assert!(rc_has_mise_activate(&text), "BOM must not hide the line");
            }
            other => panic!("expected text, got {other:?}"),
        }

        // UTF-16 LE / BE with their BOMs.
        for little_endian in [true, false] {
            let units: Vec<u16> = line.encode_utf16().collect();
            let mut bytes = if little_endian {
                vec![0xFF, 0xFE]
            } else {
                vec![0xFE, 0xFF]
            };
            for unit in &units {
                let pair = if little_endian {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                };
                bytes.extend_from_slice(&pair);
            }
            match decode_rc_bytes(&bytes) {
                RcFile::Text(text) => {
                    assert_eq!(text, line);
                    assert!(
                        rc_has_mise_activate(&text),
                        "UTF-16 (le={little_endian}) must decode matchably"
                    );
                }
                other => panic!("expected text, got {other:?}"),
            }
        }
    }

    /// A legacy single-byte file is neither UTF-8 nor BOM-tagged: the
    /// probe must report "cannot tell" instead of guessing a decode that
    /// would hide the activation line (issue #244, #166).
    #[test]
    fn decode_rc_bytes_marks_undecodable_instead_of_guessing() {
        // 0xFF is never valid UTF-8, and the file carries no BOM.
        assert_eq!(
            decode_rc_bytes(b"mise activate \xFF\x00"),
            RcFile::Undecodable
        );
        assert!(matches!(
            decode_rc_bytes(b"plain ascii"),
            RcFile::Text(ref text) if text == "plain ascii"
        ));
    }

    /// The PowerShell probe must look at both profiles (issues #229,
    /// #244) *and* name the one belonging to the PowerShell that is
    /// actually installed: a 5.1-only machine has no `Documents/PowerShell`
    /// directory at all, so naming that path sends the user to create a
    /// file their shell will never read.
    ///
    /// Home and the pwsh answer are both injected, so this holds on every
    /// host with either separator — this file runs on the Windows CI leg
    /// too, where a real host probe would make the assertion depend on
    /// whether pwsh 7 happens to be installed on the runner.
    #[test]
    fn powershell_rc_paths_follow_the_installed_host() {
        let home = Path::new("/home/test");
        for (has_pwsh, primary_dir, sibling_dir) in [
            (true, "PowerShell", "WindowsPowerShell"),
            (false, "WindowsPowerShell", "PowerShell"),
        ] {
            let primary =
                PathBuf::from(rc_path_for_in_with(home, &ShellKind::PowerShell, has_pwsh));
            assert_eq!(
                primary.file_name().unwrap().to_string_lossy(),
                "Microsoft.PowerShell_profile.ps1"
            );
            assert_eq!(
                primary
                    .parent()
                    .unwrap()
                    .file_name()
                    .unwrap()
                    .to_string_lossy(),
                primary_dir,
                "primary profile for has_pwsh={has_pwsh}"
            );
            assert_eq!(
                primary
                    .parent()
                    .unwrap()
                    .parent()
                    .unwrap()
                    .file_name()
                    .unwrap()
                    .to_string_lossy(),
                "Documents"
            );

            let siblings = rc_sibling_paths_in_with(home, &ShellKind::PowerShell, has_pwsh);
            assert_eq!(siblings.len(), 1);
            let sibling = Path::new(&siblings[0]);
            assert_eq!(
                sibling
                    .parent()
                    .unwrap()
                    .file_name()
                    .unwrap()
                    .to_string_lossy(),
                sibling_dir,
                "sibling profile for has_pwsh={has_pwsh}"
            );
            // The two must never collapse onto the same file: the pair is
            // what makes "activated in the other PowerShell" detectable.
            assert_ne!(siblings[0], primary.to_string_lossy().to_string());
        }
    }

    /// The end-to-end decision: with no profile on disk, the reported
    /// path is the installed PowerShell's, not always the pwsh 7 one.
    #[test]
    fn missing_profiles_name_the_installed_powershell() {
        let home = std::env::temp_dir().join(format!("misedeck-shell-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).expect("temp home");

        let five_one =
            check_shell_activation_for_in_with(&home, &ShellKind::PowerShell, false).unwrap();
        assert_eq!(five_one.activated, Some(false));
        assert_eq!(
            Path::new(&five_one.rc_path)
                .parent()
                .unwrap()
                .file_name()
                .unwrap()
                .to_string_lossy(),
            "WindowsPowerShell"
        );

        let seven =
            check_shell_activation_for_in_with(&home, &ShellKind::PowerShell, true).unwrap();
        assert_eq!(seven.activated, Some(false));
        assert_eq!(
            Path::new(&seven.rc_path)
                .parent()
                .unwrap()
                .file_name()
                .unwrap()
                .to_string_lossy(),
            "PowerShell"
        );

        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn activation_line_matches_shell() {
        assert!(ShellKind::Zsh
            .activation_line()
            .contains("mise activate zsh"));
        assert!(ShellKind::Bash
            .activation_line()
            .contains("mise activate bash"));
        assert!(ShellKind::Fish
            .activation_line()
            .contains("mise activate fish"));
        assert!(ShellKind::PowerShell
            .activation_line()
            .contains("mise activate pwsh"));
    }

    #[test]
    fn windows_cmd_start_plan_keeps_the_directory_out_of_the_command_line() {
        // `start` with a directory argument opens File Explorer, so the
        // target is `cmd` and the directory is the child's cwd (issues
        // #210 → #242). Nothing that a cmd parser could re-interpret may
        // appear in the argv, for any directory shape.
        //
        // The `cmd.exe` tokens are the absolute System32 copy on Windows
        // and the bare name elsewhere (issue #253) — the directory still
        // never reaches the argv either way.
        #[cfg(target_os = "windows")]
        let cmd = crate::process_tree::system32("cmd.exe");
        #[cfg(not(target_os = "windows"))]
        let cmd = "cmd.exe".to_string();
        let plan = windows_cmd_start_plan();
        assert_eq!(
            plan.argv,
            vec![
                cmd.clone(),
                "/c".to_string(),
                "start".to_string(),
                String::new(),
                cmd
            ]
        );
        for dir in [
            r"C:\A & B",
            r"C:\50%off%",
            r"C:\caret^dir",
            r"C:\paren(dir)",
            r"C:\bang!dir",
            r"C:\space dir",
            r"\\server\share",
        ] {
            assert!(
                !plan.argv.iter().any(|arg| arg.contains(dir)),
                "directory leaked into the cmd argv: {dir}"
            );
        }
    }

    /// Issue #253: a Finder/Dock launch has no `$SHELL`, so the passwd
    /// entry must take over. Fixture-injected — the environment is not
    /// touched, which is the point of `resolve_login_shell` being pure.
    #[test]
    fn resolve_login_shell_falls_back_to_the_passwd_entry() {
        // The normal terminal launch: the env var wins.
        assert_eq!(
            resolve_login_shell(Some("/bin/zsh"), Some("/bin/bash")).as_deref(),
            Some("/bin/zsh")
        );
        // Finder/Dock: no `SHELL` at all → the passwd entry.
        assert_eq!(
            resolve_login_shell(None, Some("/bin/zsh")).as_deref(),
            Some("/bin/zsh")
        );
        // An empty / whitespace-only value is as absent as a missing one
        // (some launchd sessions export an empty string).
        assert_eq!(
            resolve_login_shell(Some(""), Some("/usr/local/bin/fish")).as_deref(),
            Some("/usr/local/bin/fish")
        );
        assert_eq!(
            resolve_login_shell(Some("  "), Some("/bin/bash")).as_deref(),
            Some("/bin/bash")
        );
        // Both sources empty: still "unknown", never a guess.
        assert_eq!(resolve_login_shell(None, None), None);
        assert_eq!(resolve_login_shell(Some(""), Some("")), None);
        // The value is trimmed before it is classified.
        assert_eq!(
            resolve_login_shell(Some(" /bin/zsh\n"), None).as_deref(),
            Some("/bin/zsh")
        );
    }

    /// The classified fallback result: `/bin/zsh` from passwd still means
    /// `ShellKind::Zsh`, i.e. the banner gets a real rc path.
    #[test]
    fn classify_shell_path_handles_a_passwd_shell() {
        assert_eq!(classify_shell_path("/bin/zsh"), ShellKind::Zsh);
        assert_eq!(classify_shell_path("/usr/local/bin/fish"), ShellKind::Fish);
        match classify_shell_path("/opt/weird/nu") {
            ShellKind::Unknown { name } => assert_eq!(name, "/opt/weird/nu"),
            other => panic!("expected Unknown, got {other:?}"),
        }
    }

    /// Issue #277: Windows PowerShell 5.1 is present on effectively every
    /// machine, so the old order always answered `PowerShell` and Git Bash
    /// / WSL users got an activation line for the wrong shell. A
    /// recognized unix-style `$SHELL` now wins.
    #[test]
    fn windows_shell_prefers_a_recognized_unix_shell_env() {
        assert_eq!(
            detect_windows_shell(Some("C:/Program Files/Git/bin/bash.exe"), true, true),
            ShellKind::Bash
        );
        assert_eq!(
            detect_windows_shell(Some("/usr/bin/zsh"), false, true),
            ShellKind::Zsh
        );
        assert_eq!(
            detect_windows_shell(
                Some("C:/Users/u/AppData/Local/Programs/fish/fish.exe"),
                false,
                false
            ),
            ShellKind::Fish
        );
    }

    /// Without a recognized unix-style `$SHELL`, either PowerShell probe
    /// decides. An unrecognized value does not beat an installed
    /// PowerShell — it only names the fallback shell.
    #[test]
    fn windows_shell_falls_back_to_powershell() {
        assert_eq!(
            detect_windows_shell(None, true, false),
            ShellKind::PowerShell
        );
        assert_eq!(
            detect_windows_shell(None, false, true),
            ShellKind::PowerShell
        );
        assert_eq!(
            detect_windows_shell(Some("   "), true, true),
            ShellKind::PowerShell
        );
        assert_eq!(
            detect_windows_shell(Some("/opt/weird/nu"), true, false),
            ShellKind::PowerShell
        );
        // `$SHELL` naming PowerShell itself is not a unix-style shell, so
        // the probe still decides (and agrees).
        assert_eq!(
            detect_windows_shell(
                Some("C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"),
                true,
                false
            ),
            ShellKind::PowerShell
        );
    }

    /// Nothing to decide with: keep the raw `$SHELL` name, or `unknown`.
    #[test]
    fn windows_shell_keeps_an_unrecognized_shell_when_no_powershell_is_found() {
        match detect_windows_shell(Some("/opt/weird/nu"), false, false) {
            ShellKind::Unknown { name } => assert_eq!(name, "/opt/weird/nu"),
            other => panic!("expected Unknown, got {other:?}"),
        }
        assert_eq!(
            detect_windows_shell(None, false, false),
            ShellKind::Unknown {
                name: "unknown".to_string()
            }
        );
    }

    /// Issue #253, the Linux classes: the server-forwarding trio is
    /// waited on, every foreground emulator is spawned and released.
    #[test]
    fn linux_terminal_specs_separate_wrappers_from_foreground_emulators() {
        let spec = |binary: &str| {
            LINUX_TERMINALS
                .iter()
                .find(|s| s.binary == binary)
                .unwrap_or_else(|| panic!("{binary} missing from the probe table"))
        };

        // Wrappers that fork to a server and exit: their status is real.
        for binary in ["gnome-terminal", "konsole", "xfce4-terminal"] {
            assert!(
                spec(binary).returns_immediately,
                "{binary} exits immediately; its exit status is meaningful"
            );
        }
        // Foreground emulators: spawn success is success. `x-terminal-emulator`
        // is a symlink to an unknown target, so it must not be waited on.
        for binary in [
            "kgx",
            "ptyxis",
            "kitty",
            "alacritty",
            "foot",
            "wezterm",
            "urxvt",
            "x-terminal-emulator",
        ] {
            assert!(
                !spec(binary).returns_immediately,
                "{binary} stays in the foreground; waiting would kill it"
            );
        }
    }

    /// Spawn success returns immediately for a foreground launcher even
    /// though the child is still alive.
    #[cfg(unix)]
    #[test]
    fn spawn_and_release_does_not_wait_for_a_foreground_child() {
        let started = Instant::now();
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "sleep 2"]);
        spawn_and_release(cmd, "test", "sh", "/tmp", &["sh".to_string()])
            .expect("spawn must succeed");
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "a foreground launcher must not be waited on, took {:?}",
            started.elapsed()
        );
    }

    /// The wrapper class still waits: that is the only way its exit status
    /// can be reported as the launch result.
    #[cfg(unix)]
    #[test]
    fn run_prepared_waits_for_a_wrapper_that_exits() {
        let started = Instant::now();
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "sleep 1"]);
        run_prepared(cmd, "test", "sh", "/tmp", &["sh".to_string()])
            .expect("a clean exit is a successful launch");
        assert!(
            started.elapsed() >= Duration::from_millis(900),
            "a wrapper that exits must be waited on, took {:?}",
            started.elapsed()
        );
    }

    /// A wrapper that fails is still a failure; `spawn_and_release` reports
    /// spawn errors the same way.
    #[cfg(unix)]
    #[test]
    fn run_prepared_reports_a_non_zero_wrapper_exit() {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "exit 4"]);
        let err = run_prepared(cmd, "test", "sh", "/tmp", &["sh".to_string()])
            .expect_err("a non-zero exit is a failed launch");
        assert!(err.message.contains("status"), "got {:?}", err.message);
    }

    /// The rc resolver must agree with `dirs::home_dir()` on every
    /// platform — never with the `HOME` env var, which Windows does
    /// not set (issue #229). This runs under `cargo test --lib` on
    /// the `windows-latest` job, so it is the one place the Windows
    /// claim is actually executed. NOT verified on a real Windows
    /// desktop — only on the Windows runner.
    #[test]
    fn rc_path_for_anchors_every_shell_at_home_dir() {
        let home = dirs::home_dir().expect("test environment has a home dir");
        let home = home.to_string_lossy().to_string();
        for (shell, suffix) in [
            (ShellKind::Zsh, ".zshrc"),
            (ShellKind::Bash, ".bashrc"),
            (ShellKind::Fish, "config.fish"),
            (ShellKind::PowerShell, "Microsoft.PowerShell_profile.ps1"),
        ] {
            let rc = rc_path_for(&shell);
            assert!(
                rc.starts_with(&home),
                "{shell:?} rc path {rc:?} must start with home {home:?}"
            );
            assert!(
                rc.ends_with(suffix),
                "{shell:?} rc path {rc:?} ends with {suffix}"
            );
            assert!(!rc.is_empty());
        }
        // Unknown shells have no rc to probe — not a path under home.
        assert!(rc_path_for(&ShellKind::Unknown {
            name: "nu".to_string()
        })
        .is_empty());
    }

    /// Issue #245: the probe order and each emulator's cwd flag shape.
    /// Pure, so this runs on every platform — including the Windows and
    /// macOS legs where no Linux terminal exists.
    #[test]
    fn linux_terminal_plan_prefers_the_distro_defaults() {
        // Nothing installed: no plan, so the caller returns
        // TERMINAL_NOT_FOUND and the copyable command takes over.
        assert!(linux_terminal_plan("/x", |_| false).is_none());

        // A stock Ubuntu 24.04 (GNOME Console, no gnome-terminal).
        let (spec, argv) = linux_terminal_plan("/x", |bin| matches!(bin, "kgx")).expect("plan");
        assert_eq!(spec.binary, "kgx");
        assert_eq!(argv, vec!["kgx", "--working-directory=/x"]);

        // A Fedora 40+ box.
        let (spec, _) = linux_terminal_plan("/x", |bin| bin == "ptyxis").expect("plan");
        assert_eq!(spec.binary, "ptyxis");

        // Debian: the alternatives symlink wins, and it gets no flag
        // because its target is unknown (the inherited cwd carries it).
        let (spec, argv) = linux_terminal_plan("/x", |bin| {
            matches!(bin, "x-terminal-emulator" | "gnome-terminal")
        })
        .expect("plan");
        assert_eq!(spec.binary, "x-terminal-emulator");
        assert_eq!(argv, vec!["x-terminal-emulator"]);

        // A developer box with only kitty: separate-argument form.
        let (_, argv) = linux_terminal_plan("/x", |bin| bin == "kitty").expect("plan");
        assert_eq!(argv, vec!["kitty", "--directory", "/x"]);

        // wezterm takes a subcommand before its flag.
        let (_, argv) = linux_terminal_plan("/x", |bin| bin == "wezterm").expect("plan");
        assert_eq!(argv, vec!["wezterm", "start", "--cwd", "/x"]);
    }

    /// The old trio must still be reachable — an install that only has
    /// konsole keeps working.
    #[test]
    fn linux_terminal_plan_keeps_the_legacy_trio() {
        for binary in ["gnome-terminal", "konsole", "xfce4-terminal"] {
            let (spec, argv) = linux_terminal_plan("/p", |bin| bin == binary).expect("plan");
            assert_eq!(spec.binary, binary);
            assert!(argv.last().unwrap().contains("/p"));
        }
        let (_, argv) = linux_terminal_plan("/p", |bin| bin == "konsole").expect("plan");
        assert_eq!(argv, vec!["konsole", "--workdir=/p"]);
    }

    /// Paths are data here (argv, never a shell line): spaces and shell
    /// metacharacters must survive verbatim.
    #[test]
    fn linux_terminal_argv_keeps_hostile_paths_intact() {
        let spec = LINUX_TERMINALS
            .iter()
            .find(|s| s.binary == "gnome-terminal")
            .expect("spec");
        for path in ["/tmp/a b", "/tmp/$(rm -rf /)", "/tmp/x&y"] {
            let argv = linux_terminal_argv(spec, path);
            assert_eq!(
                argv,
                vec![
                    "gnome-terminal".to_string(),
                    format!("--working-directory={path}")
                ]
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn wait_with_timeout_reaps_a_hung_child() {
        let started = Instant::now();
        let mut hung = Command::new("sh")
            .args(["-c", "sleep 30"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn");
        assert!(wait_with_timeout(&mut hung, Duration::from_millis(100)).is_none());
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "the timeout must fire promptly, took {:?}",
            started.elapsed()
        );
    }

    #[cfg(unix)]
    #[test]
    fn wait_with_timeout_returns_the_exit_status() {
        let mut quick = Command::new("sh")
            .args(["-c", "exit 3"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn");
        let status = wait_with_timeout(&mut quick, Duration::from_secs(5)).expect("status");
        assert_eq!(status.code(), Some(3));
    }
}
