//! MiseDeck's own update check (#236, spec #234).
//!
//! Scope, deliberately narrow: find out whether a newer MiseDeck build
//! exists, and hand the user a link to its Release page. This module does
//! not download, verify or install anything — ADR-0009 records why.
//!
//! Three decisions shape the transport:
//!
//! 1. **curl, not an HTTP client.** `install.rs` already hands network
//!    work to whatever the platform ships, so this adds no TLS dependency
//!    tree, inherits the machine's proxy settings for free, and uses the
//!    same certificate store the browser does. Missing curl is just a
//!    failed check, not a broken app.
//! 2. **The Atom feed, not `api.github.com`.** The feed lives on
//!    github.com — the host that is usually reachable where
//!    api.github.com is not — needs no token and no rate budget, and is
//!    tiny (a few KB for ten releases).
//! 3. **The Atom feed, not `latest.json`.** Decisive, this one: every
//!    MiseDeck tag is a prerelease (`release.yml` marks anything with
//!    `-beta` as such), and `releases/latest/download/latest.json` only
//!    follows the non-prerelease "Latest" marker. A static manifest route
//!    would see nothing at all.
//!
//! Parsing is a few dozen lines over a fixed, documented feed shape
//! rather than a new XML crate; the fixtures in `tests` pin every
//! assumption it makes.

use std::process::Command;

use semver::Version;
use serde::Serialize;

use crate::mise::AppError;

/// Every MiseDeck release, newest first, prereleases included.
pub const RELEASES_FEED_URL: &str =
    "https://github.com/cherishfall/misedeck/releases.atom";

/// How long the whole request may take. A check the user asked for should
/// answer or give up; it must never sit in the background for a minute on
/// a throttled connection.
const MAX_TIME_S: &str = "8";
const CONNECT_TIMEOUT_S: &str = "5";

/// The outcome the panel renders. Tagged so the frontend branches on the
/// variant instead of on a boolean plus optional fields.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum AppUpdateResult {
    /// A newer build exists. `url` is that build's Release page; the app
    /// never links straight at a binary — the user picks the artifact.
    #[serde(rename_all = "camelCase")]
    Available {
        version: String,
        url: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        published_at: Option<String>,
    },
    /// The running build is the newest one the feed knows about.
    Current { version: String },
    /// The check itself failed (offline, throttled, throttled proxy, no
    /// curl, unparseable feed). One state, one sentence, retryable.
    Err { err: AppError },
}

/// One release as the feed describes it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseTag {
    /// Tag with any leading `v` stripped, e.g. `1.0.0-beta.17`.
    pub version: String,
    /// The tag's Release page.
    pub url: String,
    pub published_at: Option<String>,
}

/// Fetch the feed and decide. Blocking — call through `spawn_run`.
pub fn check(current_version: &str) -> Result<Option<ReleaseTag>, AppError> {
    let feed = fetch_feed(current_version)?;
    Ok(pick_newest(current_version, &parse_release_tags(&feed)))
}

/// `curl -fsSL --max-time 8 --connect-timeout 5 -A misedeck/<version>`.
/// One code path on every platform: Windows 10 1803+ ships `curl.exe`,
/// and a Windows-specific PowerShell branch would be a second thing to
/// keep honest with no real machine in the loop (issue #208).
fn fetch_feed(current_version: &str) -> Result<String, AppError> {
    let program = if cfg!(target_os = "windows") {
        "curl.exe"
    } else {
        "curl"
    };
    let mut cmd = Command::new(program);
    cmd.arg("-fsSL")
        .arg("--max-time")
        .arg(MAX_TIME_S)
        .arg("--connect-timeout")
        .arg(CONNECT_TIMEOUT_S)
        .arg("-A")
        .arg(format!("misedeck/{current_version}"))
        .arg(RELEASES_FEED_URL);
    // Windows: `curl.exe` is a console program and this is a GUI
    // process — without the flag a console window flashes on every
    // update check (issue #240).
    crate::process_tree::hide_console_window(&mut cmd);
    let output = cmd
        .output()
        .map_err(|err| {
            AppError::new(
                "app_update_check_failed",
                format!("could not run curl: {err}"),
                String::new(),
            )
        })?;

    if !output.status.success() {
        return Err(AppError::new(
            "app_update_check_failed",
            "the release feed request did not succeed",
            String::from_utf8_lossy(&output.stderr).into_owned(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Pull one `ReleaseTag` out of every `<entry>` in the feed.
///
/// Only two fields matter and both have a stable shape in GitHub's feed:
/// an `href` containing `/releases/tag/<tag>`, and an RFC-3339
/// `<updated>`. Anything that does not look like a release (a draft, a
/// malformed entry, a foreign link) is skipped rather than guessed at.
pub fn parse_release_tags(feed: &str) -> Vec<ReleaseTag> {
    let mut tags = Vec::new();
    for entry in entry_blocks(feed) {
        let Some(url) = release_href(entry) else {
            continue;
        };
        let version = strip_v_prefix(&tag_from_url(&url));
        if version.is_empty() {
            continue;
        }
        tags.push(ReleaseTag {
            version,
            url,
            published_at: element_text(entry, "updated").map(str::to_string),
        });
    }
    tags
}

/// The newest tag strictly newer than `current_version`.
///
/// Semver ordering, so `1.0.0-beta.17` beats `1.0.0-beta.16` and a
/// prerelease never beats its own final release. Unparsable tags are
/// ignored — a stray tag in the feed must not become a phantom update.
pub fn pick_newest(current_version: &str, tags: &[ReleaseTag]) -> Option<ReleaseTag> {
    let current = Version::parse(&strip_v_prefix(current_version)).ok()?;
    tags.iter()
        .filter_map(|tag| {
            Version::parse(&tag.version)
                .ok()
                .map(|version| (version, tag))
        })
        .filter(|(version, _)| *version > current)
        .max_by(|left, right| left.0.cmp(&right.0))
        .map(|(_, tag)| tag.clone())
}

fn entry_blocks(feed: &str) -> Vec<&str> {
    let mut blocks = Vec::new();
    let mut rest = feed;
    while let Some(start) = rest.find("<entry") {
        let entry = &rest[start..];
        // An unterminated entry is a truncated response, not a release:
        // dropping it beats inventing a version from a half-read tag.
        let Some(end) = entry.find("</entry>") else {
            break;
        };
        blocks.push(&entry[..end]);
        rest = &entry[end..];
    }
    blocks
}

/// The full `https://…/releases/tag/<tag>` href of an entry. Walking back
/// to the opening quote keeps the host out of this module: whatever the
/// feed names, that is what we link to.
fn release_href(entry: &str) -> Option<String> {
    const NEEDLE: &str = "/releases/tag/";
    let at = entry.find(NEEDLE)?;
    let quote = entry[..at].rfind('"')?;
    let tail = &entry[quote + 1..];
    let end = tail.find('"')?;
    Some(tail[..end].to_string())
}

fn tag_from_url(url: &str) -> String {
    url.rsplit('/').next().unwrap_or_default().to_string()
}

fn strip_v_prefix(tag: &str) -> String {
    tag.trim()
        .strip_prefix('v')
        .or_else(|| tag.trim().strip_prefix('V'))
        .unwrap_or_else(|| tag.trim())
        .to_string()
}

fn element_text<'a>(entry: &'a str, name: &str) -> Option<&'a str> {
    let open = format!("<{name}>");
    let close = format!("</{name}>");
    let start = entry.find(&open)? + open.len();
    let rest = &entry[start..];
    let end = rest.find(&close)?;
    let text = rest[..end].trim();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Trimmed from a real feed response: two entries, one of them a
    /// prerelease — the case the whole design turns on.
    const FEED: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes from misedeck</title>
  <entry>
    <id>tag:github.com,2008:Repository/1/v1.0.0-beta.17</id>
    <updated>2026-11-02T09:14:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/cherishfall/misedeck/releases/tag/v1.0.0-beta.17"/>
    <title>v1.0.0-beta.17</title>
  </entry>
  <entry>
    <id>tag:github.com,2008:Repository/1/v1.0.0-beta.16</id>
    <updated>2026-10-21T02:43:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/cherishfall/misedeck/releases/tag/v1.0.0-beta.16"/>
    <title>v1.0.0-beta.16</title>
  </entry>
</feed>"#;

    #[test]
    fn parses_every_entry_with_tag_url_and_date() {
        let tags = parse_release_tags(FEED);
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].version, "1.0.0-beta.17");
        assert_eq!(
            tags[0].url,
            "https://github.com/cherishfall/misedeck/releases/tag/v1.0.0-beta.17"
        );
        assert_eq!(tags[0].published_at.as_deref(), Some("2026-11-02T09:14:00Z"));
        assert_eq!(tags[1].version, "1.0.0-beta.16");
    }

    #[test]
    fn a_prerelease_counts_as_an_update() {
        let tags = parse_release_tags(FEED);
        let newest = pick_newest("1.0.0-beta.16", &tags).expect("a newer beta exists");
        assert_eq!(newest.version, "1.0.0-beta.17");
    }

    #[test]
    fn being_on_the_newest_build_reports_nothing() {
        let tags = parse_release_tags(FEED);
        assert!(pick_newest("1.0.0-beta.17", &tags).is_none());
    }

    #[test]
    fn a_final_release_beats_its_own_prereleases() {
        let tags = vec![
            ReleaseTag {
                version: "1.0.0-beta.17".into(),
                url: "https://example.invalid/beta".into(),
                published_at: None,
            },
            ReleaseTag {
                version: "1.0.0".into(),
                url: "https://example.invalid/final".into(),
                published_at: None,
            },
        ];
        let newest = pick_newest("1.0.0-beta.17", &tags).expect("final beats beta");
        assert_eq!(newest.version, "1.0.0");
    }

    #[test]
    fn a_lower_build_is_not_an_update() {
        let tags = parse_release_tags(FEED);
        assert!(pick_newest("1.0.0-beta.18", &tags).is_none());
    }

    #[test]
    fn tags_that_are_not_semver_are_ignored() {
        let tags = vec![
            ReleaseTag {
                version: "nightly".into(),
                url: "https://example.invalid/nightly".into(),
                published_at: None,
            },
            ReleaseTag {
                version: "1.0.0-beta.16".into(),
                url: "https://example.invalid/16".into(),
                published_at: None,
            },
        ];
        assert!(pick_newest("1.0.0-beta.16", &tags).is_none());
    }

    #[test]
    fn an_unparsable_current_version_never_claims_an_update() {
        let tags = parse_release_tags(FEED);
        assert!(pick_newest("not-a-version", &tags).is_none());
    }

    #[test]
    fn an_empty_feed_yields_no_tags() {
        assert!(parse_release_tags("").is_empty());
        assert!(
            parse_release_tags(r#"<?xml version="1.0"?><feed></feed>"#).is_empty(),
            "a feed with no entries must not invent one"
        );
    }

    #[test]
    fn a_truncated_feed_yields_only_complete_entries() {
        let second_entry = FEED
            .find("<entry>\n    <id>tag:github.com,2008:Repository/1/v1.0.0-beta.16")
            .expect("fixture has two entries");
        let tags = parse_release_tags(&FEED[..second_entry]);
        assert_eq!(tags.len(), 1, "only the closed entry survives");
        assert_eq!(tags[0].version, "1.0.0-beta.17");
    }

    #[test]
    fn an_entry_cut_off_mid_response_is_dropped() {
        let mid = FEED
            .find("</entry>")
            .expect("fixture has a closed entry")
            - 40;
        let tags = parse_release_tags(&FEED[..mid]);
        assert!(
            tags.is_empty(),
            "a half-read entry must not become a version"
        );
    }
}
