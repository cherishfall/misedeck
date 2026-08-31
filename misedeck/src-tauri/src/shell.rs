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
// Per-shell rc files:
//   * zsh        → `$HOME/.zshrc`  (and `.zshenv` as a fallback)
//   * bash       → `$HOME/.bashrc` on Linux;
//                  `$HOME/.bash_profile` (and `.bashrc`) on macOS,
//                  where the user shell defaults to bash but the
//                  login rc differs.
//   * fish       → `$HOME/.config/fish/config.fish`
//   * pwsh       → `$PROFILE` (per-user, current host) — a one-liner
//                  `$PROFILE` env var is set by PowerShell on startup
//                  and points at the user profile. We honour it when
//                  present; otherwise we fall back to a documented
//                  best-effort path under `Documents/PowerShell/`.

use std::path::{Path, PathBuf};
use std::process::Command;

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
    Unknown { name: String },
}

impl ShellKind {
    /// The activation line the banner asks the user to copy. The
    /// shape mirrors what `mise help activate` documents:
    ///   * zsh / bash  → `eval "$(mise activate <shell>)"`
    ///   * fish        → `mise activate fish | source`
    ///   * pwsh        → `mise activate pwsh | Out-String | Invoke-Expression`
    ///   * unknown     → a generic one-liner that works for most
    ///                    POSIX shells, with the caveat that the
    ///                    user should consult `mise help activate`.
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationStatus {
    pub shell: ShellKind,
    /// Absolute path of the rc file the probe decided on. Empty
    /// when we could not determine one (e.g. `$HOME` unset on a
    /// sandboxed test).
    pub rc_path: String,
    /// The actual text the probe inspected, for the UI's
    /// debug-only path. Empty when the file does not exist.
    pub rc_contents: String,
    /// True when the rc file contains a `mise activate` line (or
    /// `mise activate <shell>`) that satisfies the matcher below.
    pub activated: bool,
}

/// Detect the user's shell. Order of preference:
///
///   Unix:    `$SHELL` (the login shell set by login(1)/getty) — the
///            path's basename is matched against the known set
///            (`zsh`, `bash`, `fish`). Other basenames fall through
///            to `Unknown` with the raw name preserved.
///   Windows: read `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Once`
///            is overkill; we use the simpler heuristic of `pwsh`
///            / `powershell` on PATH. If neither is present, the
///            user is on a unix-style shell (git-bash / WSL) and
///            `$SHELL` drives the result.
///
/// The function never fails: an undetectable shell returns
/// `Unknown { name: "unknown" }` and the UI surfaces that.
pub fn detect_user_shell() -> ShellKind {
    #[cfg(target_os = "windows")]
    {
        if which_exists("pwsh.exe") || which_exists("powershell.exe") {
            return ShellKind::PowerShell;
        }
        // Fall through to the Unix-style $SHELL check below — WSL /
        // git-bash run a Unix shell under Windows.
    }

    let raw = match std::env::var_os("SHELL") {
        Some(s) => s.to_string_lossy().to_string(),
        None => return ShellKind::Unknown { name: "unknown".to_string() },
    };
    let path = Path::new(&raw);
    let basename = match path.file_name() {
        Some(n) => n.to_string_lossy().to_string(),
        None => raw.clone(),
    };
    classify_shell(&basename, &raw)
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
        _ => ShellKind::Unknown { name: raw.to_string() },
    }
}

#[allow(dead_code)]
fn which_exists(name: &str) -> bool {
    // Probe the binary by trying to spawn it with a no-op arg. The
    // path is resolved by the OS, so a missing binary returns
    // `NotFound` and a present binary either runs (success) or
    // rejects the arg (non-zero exit) — both are fine for our
    // presence check.
    Command::new(name)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null())
        .status()
        .map(|s| s.success() || s.code().is_some())
        .unwrap_or(false)
}

/// Compute the rc file path for the given shell. The function does
/// not check that the file exists — `check_shell_activation` reads
/// it and surfaces the `NotFound` case as `activated = false`. The
/// returned path is always absolute; an empty `String` is returned
/// when `$HOME` is unset (only happens in extreme sandboxes).
pub fn rc_path_for(shell: &ShellKind) -> String {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return String::new();
    };
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
        ShellKind::PowerShell => match std::env::var_os("PROFILE") {
            Some(p) => PathBuf::from(p),
            None => {
                // Best-effort fallback: PowerShell's documented
                // default per-user profile path on Windows.
                home.join("Documents")
                    .join("PowerShell")
                    .join("Microsoft.PowerShell_profile.ps1")
            }
        },
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
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };
    match shell {
        ShellKind::Bash => vec![home.join(".bash_profile").to_string_lossy().to_string()],
        ShellKind::Zsh => vec![home.join(".zshenv").to_string_lossy().to_string()],
        _ => Vec::new(),
    }
}

/// Read the rc file at `path` into a `String`. Returns `None` when
/// the file does not exist (the `NotFound` IO error), `Some(s)` on
/// success (which may be the empty string), and propagates other IO
/// errors. Kept in this module so the test seam is one function
/// call away from the matcher.
pub fn read_rc_file(path: &str) -> Result<Option<String>, std::io::Error> {
    if path.is_empty() {
        return Ok(None);
    }
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
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
/// `activated = false` on any error (read failure on a non-`NotFound`
/// IO error is propagated as a CommandFailed AppError by the
/// caller — this function returns the structured status for the
/// happy path only).
pub fn check_shell_activation() -> Result<ActivationStatus, std::io::Error> {
    let shell = detect_user_shell();
    check_shell_activation_for(&shell)
}

/// Same as `check_shell_activation` but for a caller-provided shell
/// (used by the tests and by the future "force re-check" affordance
/// if one is ever added).
pub fn check_shell_activation_for(shell: &ShellKind) -> Result<ActivationStatus, std::io::Error> {
    let primary = rc_path_for(shell);
    let siblings = rc_sibling_paths(shell);

    // No specific rc for unknown shells — surface an empty
    // status so the UI can render a generic "we could not detect
    // your shell" message instead of probing a random file.
    if primary.is_empty() {
        return Ok(ActivationStatus {
            shell: shell.clone(),
            rc_path: String::new(),
            rc_contents: String::new(),
            activated: false,
        });
    }

    // Read the primary rc file first. On NotFound, fall through to
    // the siblings (the .bash_profile / .zshenv case).
    let (rc_path, contents) = match read_rc_file(&primary)? {
        Some(c) => (primary.clone(), c),
        None => {
            // Try siblings.
            let mut found: Option<(String, String)> = None;
            for sib in &siblings {
                if let Some(c) = read_rc_file(sib)? {
                    found = Some((sib.clone(), c));
                    break;
                }
            }
            match found {
                Some((path, c)) => (path, c),
                None => (primary.clone(), String::new()),
            }
        }
    };

    let activated = rc_has_mise_activate(&contents);
    Ok(ActivationStatus {
        shell: shell.clone(),
        rc_path,
        rc_contents: contents,
        activated,
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
//   * Windows → `cmd /c start "" <path>` opens a new cmd window
//                rooted at the path. The PowerShell equivalent is
//                `Start-Process -WorkingDirectory <path>
//                powershell` but `cmd /c start` is the smallest
//                dependable surface that does not require a
//                present user profile.
//   * Linux   → best-effort probe: try `gnome-terminal`, then
//                `konsole`, then `xfce4-terminal`, each with a
//                `--working-directory=` flag. If none is found,
//                return `TERMINAL_NOT_FOUND` so the UI surfaces
//                the copyable command instead. The probe is a
//                `which` lookup; we do not actually launch the
//                terminal here — we hand the argv to the shell so
//                the user can take the same action manually if
//                the spawn ever fails.
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

pub fn open_in_terminal(path: Option<&str>) -> Result<TerminalOpenOutcome, AppError> {
    // Resolve the target path: caller-supplied (must exist and be
    // a directory) or `$HOME` as a fallback.
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
        _ => std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| {
                AppError::command_failed("open_in_terminal: $HOME unset", String::new())
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
        return Ok(TerminalOpenOutcome {
            platform: "macOS".to_string(),
            terminal_app: "Terminal.app".to_string(),
            path: path_str,
            argv,
        });
    }

    #[cfg(target_os = "windows")]
    {
        // `cmd /c start "" <path>` opens a new cmd window rooted
        // at <path>. The empty quoted string is the "title"
        // argument (otherwise `start` treats <path> as the title
        // and the command does not run).
        let argv: Vec<String> = vec![
            "cmd".to_string(),
            "/c".to_string(),
            "start".to_string(),
            "".to_string(),
            resolved.to_string_lossy().to_string(),
        ];
        run_argv(&argv, "Windows", "cmd.exe", &path_str)?;
        return Ok(TerminalOpenOutcome {
            platform: "Windows".to_string(),
            terminal_app: "cmd.exe".to_string(),
            path: path_str,
            argv,
        });
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // Linux (and other Unixes that are not macOS). Best-effort
        // probe for a common terminal. The list is short on
        // purpose — adding "kde-open" / "exo-open" / etc. is
        // easy but each adds a maintenance surface; the common
        // three cover the bulk of the Linux desktop world.
        let path_for_arg = path_str.clone();
        for (binary, argv_factory) in [
            (
                "gnome-terminal",
                Box::new(move |p: String| vec![
                    "gnome-terminal".to_string(),
                    format!("--working-directory={p}"),
                ]) as Box<dyn Fn(String) -> Vec<String>>,
            ),
            (
                "konsole",
                Box::new(move |p: String| vec![
                    "konsole".to_string(),
                    format!("--workdir={p}"),
                ]),
            ),
            (
                "xfce4-terminal",
                Box::new(move |p: String| vec![
                    "xfce4-terminal".to_string(),
                    format!("--working-directory={p}"),
                ]),
            ),
        ] {
            if which_exists(binary) {
                let argv = argv_factory(path_str.clone());
                run_argv(&argv, "Linux", binary, &path_for_arg)?;
                return Ok(TerminalOpenOutcome {
                    platform: "Linux".to_string(),
                    terminal_app: binary.to_string(),
                    path: path_str,
                    argv,
                });
            }
        }
        return Err(AppError::new(
            code::TERMINAL_NOT_FOUND,
            "no terminal emulator detected on this Linux system",
            String::new(),
        ));
    }
}

/// Helper: spawn an argv in the background (the terminal launches
/// detached and returns immediately). The spawn errors are
/// translated into `AppError::command_failed` so the UI can surface
/// them; a success exit status is the only "ok" path because we
/// don't wait for the terminal to actually render a prompt.
/// `terminal_app` is included in the error message so the user
/// can see which app the launch attempted.
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
    let status = Command::new(bin)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(AppError::command_failed(
            format!(
                "{platform} terminal launch via {terminal_app} exited with status {s} for {path} (argv: {argv:?})"
            ),
            String::new(),
        )),
        Err(e) => Err(AppError::command_failed(
            format!(
                "{platform} terminal launch via {terminal_app} failed for {path}: {e} (argv: {argv:?})"
            ),
            String::new(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_shell_handles_known_basename() {
        assert_eq!(classify_shell("zsh", "/bin/zsh"), ShellKind::Zsh);
        assert_eq!(classify_shell("bash", "/bin/bash"), ShellKind::Bash);
        assert_eq!(classify_shell("fish", "/usr/bin/fish"), ShellKind::Fish);
        assert_eq!(classify_shell("pwsh.exe", "C:\\Program Files\\PowerShell\\7\\pwsh.exe"), ShellKind::PowerShell);
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
        assert!(rc_has_mise_activate(
            r#"eval "$(mise activate zsh)""#
        ));
        assert!(rc_has_mise_activate(
            "if command -v mise &> /dev/null; then eval \"$(mise activate bash)\"; fi"
        ));
        assert!(rc_has_mise_activate("mise activate fish | source"));
        // Sourced snippets count too.
        assert!(rc_has_mise_activate("source ~/.local/share/mise/bin/mise activate bash"));
    }

    #[test]
    fn rc_has_mise_activate_ignores_comments() {
        // POSIX comment.
        assert!(!rc_has_mise_activate(
            "# eval \"$(mise activate zsh)\""
        ));
        // Fish comment.
        assert!(!rc_has_mise_activate(
            "# mise activate fish | source"
        ));
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

    #[test]
    fn activation_line_matches_shell() {
        assert!(ShellKind::Zsh.activation_line().contains("mise activate zsh"));
        assert!(ShellKind::Bash.activation_line().contains("mise activate bash"));
        assert!(ShellKind::Fish.activation_line().contains("mise activate fish"));
        assert!(ShellKind::PowerShell.activation_line().contains("mise activate pwsh"));
    }
}
