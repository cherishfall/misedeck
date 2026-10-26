// Integration tests for the app update check (issue #236, coverage #255).
//
// `check` fetches the release feed with curl; a test that hit the network
// would be slow, flaky and dependent on GitHub. `check_with` is the seam
// the production `check` delegates to: the same fetch-result → feed-shape
// → version-comparison path, fed from tests/fixtures/update/. The parse
// helpers are unit-tested in `src/update.rs`; these tests pin the whole
// check, including the curl-failure pass-through and the captive-portal
// branch (audit R-3/R-17).

use std::path::PathBuf;

use misedeck_lib::mise::{code, AppError};
use misedeck_lib::update::{check_with, RELEASES_FEED_URL};

fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/update")
        .join(name);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

#[test]
fn check_reports_a_newer_prerelease_from_a_recorded_feed() {
    let feed = fixture("releases.atom");
    let newest = check_with("1.0.0-beta.16", |current| {
        // The version is the request's User-Agent; the fetch must see it.
        assert_eq!(current, "1.0.0-beta.16");
        Ok(feed.clone())
    })
    .expect("a recorded feed is a successful check")
    .expect("beta.17 is newer than beta.16");

    assert_eq!(newest.version, "1.0.0-beta.17");
    assert_eq!(
        newest.url,
        "https://github.com/cherishfall/misedeck/releases/tag/v1.0.0-beta.17"
    );
    assert_eq!(newest.published_at.as_deref(), Some("2026-11-02T09:14:00Z"));
    assert!(
        newest
            .url
            .starts_with(RELEASES_FEED_URL.trim_end_matches("/releases.atom")),
        "the link must stay on the releases host, got {:?}",
        newest.url
    );
}

#[test]
fn check_reports_current_on_a_real_feed_with_nothing_newer() {
    let feed = fixture("releases.atom");
    let result = check_with("1.0.0-beta.17", |_| Ok(feed.clone()))
        .expect("a recorded feed is a successful check");
    assert!(
        result.is_none(),
        "the running build is current, not an error"
    );
}

#[test]
fn check_passes_a_fetch_failure_through_unchanged() {
    let err = check_with("1.0.0-beta.16", |_| {
        Err(AppError::command_failed(
            "the release feed request did not succeed",
            "curl: (6) Could not resolve host",
        ))
    })
    .expect_err("a failed fetch is a failed check");

    assert_eq!(err.code, code::COMMAND_FAILED);
    assert_eq!(err.message, "the release feed request did not succeed");
    assert_eq!(err.stderr, "curl: (6) Could not resolve host");
}

#[test]
fn check_rejects_a_captive_portal_body_instead_of_claiming_current() {
    let page = fixture("captive-portal.html");
    let err = check_with("1.0.0-beta.16", |_| Ok(page.clone()))
        .expect_err("a 200 HTML block page is not a release feed");

    assert_eq!(err.code, code::COMMAND_FAILED);
    assert!(
        err.message.contains("not an Atom feed"),
        "the check must name the shape failure, got {:?}",
        err.message
    );
}
