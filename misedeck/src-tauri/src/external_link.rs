//! Opening a web link in the user's own browser (#248).
//!
//! A bare `<a target="_blank">` is inert inside the app's webview. Neither
//! WKWebView nor WebView2 will create a window the app never asked for, so
//! the click is swallowed and the user sees nothing at all — every external
//! link in the app (the Release page, the mise docs, the download link)
//! looked broken while the markup was perfectly correct. The OS browser is
//! the only right destination anyway: navigating the shell away from `/`
//! would throw the app away.
//!
//! Two rules make the handoff safe:
//!
//! 1. **The scheme check lives here, not in the DOM.** One caller renders a
//!    URL that came off the network — `check_app_update` returns whichever
//!    `html_url` the GitHub feed carried — so "it is only a link in our own
//!    markup" is not a property the frontend can guarantee. Only `http` and
//!    `https` pass: `javascript:`, `data:` and `file:` would each be a way
//!    for a remote payload to reach something local.
//! 2. **The opener plugin launches it.** It already knows the per-platform
//!    dance (`open` on macOS, `ShellExecute` on Windows, xdg-open / gio on
//!    Linux), and it does it without a shell, so a URL full of `;` is just a
//!    URL.
//!
//! Nothing else in the app opens a URL, so this module is the whole surface.

use tauri_plugin_opener::OpenerExt;

use crate::mise::AppError;

/// Longest URL the command will pass on. Every link the app renders is
/// well under 100 bytes; the bound exists so that a runaway string can
/// never become a mile-long command line.
const MAX_URL_LEN: usize = 2048;

/// Accept `raw` if it is a plain `http`/`https` URL, and return the
/// trimmed form to hand to the opener.
///
/// Rejections are all the same failure to the user ("this link could not
/// be opened"); the message carries the reason for the log.
pub fn validate(raw: &str) -> Result<&str, AppError> {
    let url = raw.trim();

    if url.is_empty() {
        return Err(reject("empty url"));
    }
    if url.len() > MAX_URL_LEN {
        return Err(reject("url is too long"));
    }
    // Whitespace and control characters never appear in a URL we render,
    // and they are the shape a command-line injection would take if the
    // opener ever fell back to a shell on some platform.
    if url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(reject("url contains whitespace or control characters"));
    }

    // The scheme is case-insensitive (RFC 3986 §3.1), so decide on the
    // lowercased copy and slice the original by the same byte count —
    // both prefixes are ASCII, so the offsets line up.
    let lower = url.to_ascii_lowercase();
    let rest = if lower.starts_with("https://") {
        &url["https://".len()..]
    } else if lower.starts_with("http://") {
        &url["http://".len()..]
    } else {
        return Err(reject("url is not http(s)"));
    };

    // An authority is mandatory: `https://` alone, or `https:///path`,
    // would ask the OS to open nothing in particular.
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() {
        return Err(reject("url has no host"));
    }
    if authority.starts_with('@') || authority.starts_with(':') {
        return Err(reject("url has no host before its credentials or port"));
    }

    Ok(url)
}

/// Hand `raw` to the OS default browser.
pub fn open(app: &tauri::AppHandle, raw: &str) -> Result<(), AppError> {
    let url = validate(raw)?;
    app.opener().open_url(url, None::<&str>).map_err(|e| {
        AppError::command_failed(
            format!("open_external: the system browser refused the request: {e}"),
            String::new(),
        )
    })
}

fn reject(reason: &str) -> AppError {
    AppError::command_failed(format!("open_external: {reason}"), String::new())
}

#[cfg(test)]
mod tests {
    use super::validate;

    #[test]
    fn release_page_urls_pass_through_unchanged() {
        for url in [
            "https://github.com/cherishfall/misedeck/releases",
            "https://github.com/jdx/mise/releases",
            "https://mise.jdx.dev/installing.html",
            "http://localhost:1420/",
        ] {
            assert_eq!(validate(url).unwrap(), url, "{url} must survive verbatim");
        }
    }

    #[test]
    fn surrounding_whitespace_is_trimmed_not_rejected() {
        assert_eq!(
            validate("  https://example.com/a  ").unwrap(),
            "https://example.com/a"
        );
    }

    #[test]
    fn the_scheme_is_case_insensitive() {
        assert_eq!(
            validate("HTTPS://Example.COM/Path").unwrap(),
            "HTTPS://Example.COM/Path",
            "the original casing is preserved; only the check is folded"
        );
    }

    #[test]
    fn script_and_file_schemes_are_refused() {
        // Each of these would reach something local if it got through:
        // the first executes in the webview's context, the second and
        // third reach the filesystem.
        for url in [
            "javascript:alert(1)",
            "JavaScript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "file:///etc/passwd",
            "ftp://example.com/x",
            "mailto:someone@example.com",
        ] {
            assert!(validate(url).is_err(), "{url} must be refused");
        }
    }

    #[test]
    fn a_missing_host_is_refused() {
        for url in ["https://", "https:///path", "http://?q=1", "http://#frag"] {
            assert!(validate(url).is_err(), "{url} must be refused");
        }
        // …while a host with no path is fine.
        assert_eq!(
            validate("https://example.com").unwrap(),
            "https://example.com"
        );
    }

    #[test]
    fn whitespace_and_control_characters_are_refused() {
        for url in [
            "https://example.com/a b",
            "https://example.com/a\ninjected",
            "https://example.com/\u{0}",
            "https://example.com/\u{7}",
        ] {
            assert!(validate(url).is_err(), "{url:?} must be refused");
        }
    }

    #[test]
    fn an_absurdly_long_url_is_refused() {
        let long = format!("https://example.com/{}", "a".repeat(4096));
        assert!(validate(&long).is_err());
    }

    #[test]
    fn an_empty_string_is_refused() {
        assert!(validate("").is_err());
        assert!(validate("   ").is_err());
    }
}
