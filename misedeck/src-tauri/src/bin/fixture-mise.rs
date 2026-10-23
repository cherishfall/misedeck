// fixture-mise — a tiny stand-in for the real `mise` binary, used by the
// integration tests.
//
// This is the cross-platform twin of `tests/fixtures/mise/fixture-mise`
// (the bash script). The bash script cannot run on Windows: `CreateProcess`
// refuses a file with no executable extension (os error 193), so every
// integration test that drives the fixture failed there. This binary
// replays the same recorded payloads on every platform, which lets the
// Windows CI leg run the full integration suite instead of `--lib` only.
//
// Layout (identical to the bash fixture):
//   tests/fixtures/mise/
//     fixture-mise        ← bash version (unix)
//     <slug>/             ← one dir per test case
//       stdout            ← bytes written to stdout
//       stderr            ← bytes written to stderr
//       exit_code         ← integer exit code
//
// The default slug is the argv joined by `-` (argv `version --json` →
// slug `version---json`), after stripping a leading `-C <dir>` pair — the
// runner always prepends the directory context (issue #179), and the
// fixture dirs are named by payload, not by context. Tests override the
// slug with the FIXTURE_MISE_SLUG environment variable so the same argv
// can drive multiple scenarios (success, too-old, parse-failed,
// command-failed) without duplicating the script.
//
// Two optional logs mirror the bash fixture:
//   FIXTURE_MISE_CALL_LOG — one line per call, the argv
//   FIXTURE_MISE_ENV_LOG  — one line per call, the argv plus MISE_SAFE
//
// The payload files are copied byte-for-byte. `stdout` in particular may
// hold bytes that are not valid UTF-8 (the invalid-utf8-output case), so
// it is never read as a string.

use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// The payload directory is anchored at compile time: `CARGO_MANIFEST_DIR`
/// is the crate root, so `tests/fixtures/mise` sits next to the recorded
/// payloads. The binary itself lives under `target/<profile>/`, far away
/// from them, so the current-exe path cannot be used as the anchor.
const PAYLOAD_DIR: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/mise"
);

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();

    let fixture_dir = PathBuf::from(PAYLOAD_DIR);

    let joined = args.join(" ");
    if let Some(log) = env::var_os("FIXTURE_MISE_CALL_LOG") {
        append_line(&log, &joined);
    }
    if let Some(log) = env::var_os("FIXTURE_MISE_ENV_LOG") {
        let safe = env::var("MISE_SAFE").unwrap_or_else(|_| "<unset>".to_string());
        append_line(&log, &format!("{joined} MISE_SAFE={safe}"));
    }

    let slug = match env::var("FIXTURE_MISE_SLUG") {
        Ok(slug) if !slug.is_empty() => slug,
        _ => {
            // Drop the runner's leading `-C <dir>` (always present since
            // #179) before deriving the slug from the payload argv.
            let payload: &[String] = if args.first().map(|a| a == "-C").unwrap_or(false) {
                &args[2.min(args.len())..]
            } else {
                &args[..]
            };
            payload.join("-")
        }
    };

    let dir = fixture_dir.join(&slug);
    if !dir.is_dir() {
        eprintln!("fixture-mise: no fixture for slug '{slug}' (argv: {joined})");
        eprintln!("fixture-mise: looked in {}", dir.display());
        return ExitCode::from(127);
    }

    if let Some(bytes) = read_payload(&dir.join("stdout")) {
        let mut out = std::io::stdout();
        let _ = out.write_all(&bytes);
        let _ = out.flush();
    }

    if let Some(bytes) = read_payload(&dir.join("stderr")) {
        let mut err = std::io::stderr();
        let _ = err.write_all(&bytes);
        let _ = err.flush();
    }

    match read_payload(&dir.join("exit_code")) {
        Some(bytes) => {
            let text = String::from_utf8_lossy(&bytes);
            // The recorded exit code is a full 32-bit value, so it goes
            // through `process::exit` rather than `ExitCode::from`, which
            // only covers u8. Windows exit codes are 32-bit; the cast
            // keeps the value the shell would see.
            let code: i32 = text.trim().parse().unwrap_or(0);
            std::process::exit(code);
        }
        None => ExitCode::SUCCESS,
    }
}

/// Read a payload file as raw bytes. A missing file is not an error —
/// the bash fixture treats every payload as optional.
fn read_payload(path: &Path) -> Option<Vec<u8>> {
    fs::read(path).ok()
}

/// Append one line to an optional call log. A log that cannot be written
/// is not fatal — the test that reads it will fail with a clearer message.
fn append_line(path: &std::ffi::OsStr, line: &str) {
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}
