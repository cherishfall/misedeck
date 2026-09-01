// Integration tests for the config-file hierarchy (issue #42).
//
// `mise_config_files` backs the Preview page's Config files section:
// `mise config ls --json` reports the files mise loads, highest
// precedence first, and the runner must preserve that order verbatim.
// (The config-editor argv tests from issue #26 were removed with the
// Config page in #43.)

use std::path::PathBuf;

use serial_test::serial;

fn fixture_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mise/fixture-mise")
}

/// Set FIXTURE_MISE_SLUG for the duration of the closure so the
/// fixture script serves the right recorded response, then clear it.
/// Always pair with `#[serial]`.
fn with_slug<F: FnOnce()>(slug: &str, f: F) {
    unsafe {
        std::env::set_var("FIXTURE_MISE_SLUG", slug);
    }
    f();
    unsafe {
        std::env::remove_var("FIXTURE_MISE_SLUG");
    }
}

#[test]
#[serial]
fn config_files_preserve_mise_precedence_order() {
    let script = fixture_script();
    with_slug("config-ls---json", || {
        let files = misedeck_lib::mise::mise_config_files(&script, None)
            .expect("config ls --json fixture should yield Ok");
        // mise emits the array highest-precedence-first; the runner
        // must preserve that order verbatim.
        assert_eq!(files.len(), 2, "files = {files:?}");
        assert_eq!(files[0].path, "/nonexistent/misedeck-test/src/app/mise.toml");
        assert_eq!(files[1].path, "/nonexistent/misedeck-test/.config/mise/config.toml");
        assert_eq!(files[0].tools, vec!["node".to_string(), "python".to_string()]);
        assert_eq!(files[1].tools, vec!["go".to_string()]);
        // The fixture paths do not exist on disk, so the content view
        // falls back to None rather than failing the whole section.
        assert_eq!(files[0].content, None);
        assert_eq!(files[1].content, None);
    });
}
