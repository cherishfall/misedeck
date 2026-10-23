// Shared helper for the integration tests: locate the `mise` stand-in the
// tests drive.
//
// Two implementations of the same fixture exist:
//
//   * `tests/fixtures/mise/fixture-mise` — a bash script. Unix only:
//     `CreateProcess` on Windows refuses a file with no executable
//     extension (os error 193), so every test that drove the fixture
//     failed there.
//   * the `fixture-mise` cargo binary (src/bin/fixture-mise.rs) — the
//     cross-platform twin. It replays the same recorded payloads, so the
//     Windows CI leg can run the whole integration suite instead of
//     `--lib` only.
//
// Both read the same payload directories and honour the same environment
// variables, so a test behaves identically on either platform.
//
// `CARGO_BIN_EXE_<name>` is set by cargo for integration tests and points
// at the freshly built binary; it is only defined for test targets, which
// is exactly where this module is used.

use std::path::PathBuf;

/// Path to the fixture the tests should spawn.
pub fn fixture_script() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_fixture-mise"))
}
