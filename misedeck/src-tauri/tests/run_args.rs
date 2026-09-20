// Integration tests for the `run_mise_command` argv validation
// (issue #160). The original guardrail rejected ANY token containing
// a shell metacharacter, which made common values — a task's `run`
// command (`npm run build && npm run test`), an env value containing
// `&` — impossible to save from the GUI. The check now applies only
// to flag tokens (tokens starting with `-`); value tokens pass
// through because the runner spawns mise without a shell, so argv
// has no injection surface. These tests cover both sides: values
// are accepted, flag-region metacharacters are still rejected.

use misedeck_lib::mise::{code, validate_run_args};

fn argv(tokens: &[&str]) -> Vec<String> {
    tokens.iter().map(|s| s.to_string()).collect()
}

// ---------- Value tokens pass through ----------

#[test]
fn run_command_with_double_ampersand_is_accepted() {
    // The exact shape TasksPage saves: run is a single token after `--`.
    let args = argv(&["tasks", "add", "build", "--", "npm run build && npm run test"]);
    assert!(validate_run_args(&args).is_ok());
}

#[test]
fn run_command_with_dollar_expansion_is_accepted() {
    let args = argv(&["tasks", "add", "greet", "--", "echo $HOME"]);
    assert!(validate_run_args(&args).is_ok());
}

#[test]
fn run_command_with_pipe_semicolon_and_backtick_are_accepted() {
    for run in [
        "cat foo.txt | grep bar",
        "echo a; echo b",
        "echo `git rev-parse HEAD`",
        "echo $(date)",
    ] {
        let args = argv(&["tasks", "add", "demo", "--", run]);
        assert!(
            validate_run_args(&args).is_ok(),
            "run value {run:?} should pass through"
        );
    }
}

#[test]
fn env_set_value_with_ampersand_is_accepted() {
    let args = argv(&[
        "env",
        "set",
        "DATABASE_URL",
        "postgres://u:p@host/db?sslmode=require&connect_timeout=5",
    ]);
    assert!(validate_run_args(&args).is_ok());
}

#[test]
fn plain_flags_and_positionals_are_accepted() {
    let args = argv(&["tasks", "ls", "--json"]);
    assert!(validate_run_args(&args).is_ok());
}

// ---------- Flag-region metacharacters are still rejected ----------

#[test]
fn flag_token_with_semicolon_is_rejected() {
    let args = argv(&["tasks", "ls", "--json;echo pwned"]);
    let err = validate_run_args(&args).expect_err("flag with ; should be rejected");
    assert_eq!(err.code, code::COMMAND_FAILED);
    assert!(
        err.message.contains("flag arg contains shell metacharacter"),
        "message should name the flag-region rule, got {:?}",
        err.message
    );
}

#[test]
fn flag_token_with_dollar_is_rejected() {
    // `--description` takes a value, but a *flag-shaped* token carrying
    // `$` can only arise from a malformed argv builder — the
    // defense-in-depth tripwire still fires.
    let args = argv(&["tasks", "add", "build", "--description$(evil)", "x"]);
    let err = validate_run_args(&args).expect_err("flag with $ should be rejected");
    assert_eq!(err.code, code::COMMAND_FAILED);
}

#[test]
fn flag_token_with_pipe_ampersand_and_backtick_are_rejected() {
    for flag in ["--a|b", "--a&b", "--a`b`", "--a\nb"] {
        let args = argv(&["tasks", "ls", flag]);
        assert!(
            validate_run_args(&args).is_err(),
            "flag {flag:?} should be rejected"
        );
    }
}

#[test]
fn value_in_flag_position_starting_with_dash_is_rejected() {
    // Even in a value slot, a leading-dash token with metacharacters
    // trips the wire — by issue #160 the dash shape *is* the flag region.
    let args = argv(&["env", "set", "FOO", "-x;y"]);
    assert!(validate_run_args(&args).is_err());
}

// ---------- Empty argv ----------

#[test]
fn empty_args_are_rejected() {
    let err = validate_run_args(&[]).expect_err("empty argv should be rejected");
    assert_eq!(err.code, code::COMMAND_FAILED);
}
