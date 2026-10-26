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
//
// It is read with `option_env!` because the fixture bins are behind the
// `fixtures` feature (see Cargo.toml: they must not be built during
// `tauri build`, which once packaged a fixture as the app). Without the
// feature the variable is simply absent, and the panic states the fix —
// a silent skip would let the suite go green having tested nothing.

use std::path::PathBuf;

/// What to tell whoever ran the suite without the fixture binaries.
pub const FIXTURES_HINT: &str = "the fixture binaries are behind the `fixtures` feature so that a release build contains exactly one binary — run `cargo test --all-targets --features fixtures`";

/// Path to the fixture the tests should spawn.
pub fn fixture_script() -> PathBuf {
    fixture_binary(
        "CARGO_BIN_EXE_fixture-mise",
        option_env!("CARGO_BIN_EXE_fixture-mise"),
        "fixture-mise",
    )
}

/// Resolve one of the harness binaries, failing with the command that
/// builds it.
///
/// `option_env!` rather than `env!` because the binaries are feature-gated
/// (see Cargo.toml): with `env!` the suite would not compile at all without
/// the feature, and a silent skip would let CI go green having tested
/// nothing. The existence check is not paranoia — cargo hands integration
/// tests the *expected* path even when the feature was off, so a stale
/// binary from an earlier build would otherwise be driven instead.
pub fn fixture_binary(var: &str, value: Option<&'static str>, name: &str) -> PathBuf {
    let path = value
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("{name} was not built (no {var}): {FIXTURES_HINT}"));
    assert!(
        path.exists(),
        "{name} is missing at {}: {FIXTURES_HINT}",
        path.display()
    );
    path
}
