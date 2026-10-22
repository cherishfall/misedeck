# MiseDeck's own update check is manual, and it stops at the Release page

> [简体中文](../../zh-CN/docs/adr/0009-app-update-check-is-manual-and-ends-at-the-release-page.md)

> **Status (2026-10):** accepted; one premise has expired. The decision — a manual, bounded check that ends at the Release page — stands. Premise 2 below ("every MiseDeck release is a prerelease", so `releases/latest` resolves to nothing) described the beta era: v1.0.0 shipped as a stable release (`isPrerelease: false`), so `latest` now resolves. The transport stays the Atom feed, because it lists every release — prereleases included — without a manifest or a signing key.

MiseDeck had no way to say which build was running, and no way to learn that a newer one existed. Fifteen betas shipped before anyone asked. The obvious fix is Tauri's updater plugin; the honest fix is less than that, because three constraints make in-place updating worse than useless here.

**1. The builds are unsigned.** There is no Apple Developer ID and no notarization (README → Known limitations), and every macOS install needs `xattr -dr com.apple.quarantine` before it will launch. The Tauri updater swaps the `.app` bundle in place; Gatekeeper then re-assesses the new bundle and reports it as damaged. Auto-update would not remove that step — it would add a way for the app to brick itself, and the user would still end up in the terminal. Tauri's minisign signature protects the bytes, not the Gatekeeper verdict.

**2. Every MiseDeck release is a prerelease.** `release.yml` marks any tag containing `-beta` as a prerelease, so GitHub's "Latest" marker never moves to it. The documented static-manifest route (`releases/latest/download/latest.json`) therefore resolves to nothing at all — the update feed cannot see this project's own releases. Making it work means either abandoning prerelease marking (losing the visual distinction on the Releases page) or generating and uploading a manifest plus `.sig` artifacts per release, in CI, from a signing key that — per Tauri's own documentation — cannot be recovered: lose it once and installed users are stranded forever.

**3. GitHub is slow-to-unreachable here, and the app has never made a network request.** MiseDeck's only egress so far is a shell command that runs `curl | sh` for mise's installer, handed to the platform's own tools. A 100 MB auto-download over that path fails often and fails late; a link handed to the browser fails cheaply and lets the user's own proxy or download manager do the work.

**The decision: the check is manual, bounded, and ends with a link.**

- The running version comes from the Tauri context (`getVersion()`), never from a literal in the UI. It powers both the display and the comparison, so the two can never disagree.
- The check runs only when the user asks. Nothing fires at launch: a cold start that blocks on a throttled request is worse than not knowing, and making it safe would need throttling plus persisted state — a feature, not a detail.
- Transport is `curl` against `https://github.com/cherishfall/misedeck/releases.atom`, bounded at 8 seconds. The feed sits on `github.com` (reachable where `api.github.com` often is not), needs no token and no rate budget, and — decisive — lists prereleases. Ordering is semver, so `1.0.0-beta.17` beats `1.0.0-beta.16` and a final release beats its own betas.
- Every failure — offline, proxy, timeout, no curl, unparseable feed — collapses into one sentence and a retry. No modal, no automatic retry, no interrupting a mise command that is already running.
- A newer build yields its Release page. The app never links directly at a binary and never downloads one.

## Considered Options

- **`tauri-plugin-updater` with a `latest.json` endpoint.** Rejected on all three constraints at once: it forces minisign signing that cannot be disabled, needs `createUpdaterArtifacts` plus CI secrets, its documented GitHub route cannot see prereleases, and on an un-notarized macOS build the swapped bundle is reported as damaged on next launch.
- **Auto-download with the browser handling the transfer.** Rejected as a middle step that helps nobody: it still cannot install anything, so the user downloads the same file they would have downloaded from the link.
- **A silent check at launch, surfacing a dot on the version.** Rejected for this cycle, not forever: it is the right end state, but it needs a last-checked timestamp, a throttle, and a "newer version" bit that survives restarts. That is a state machine worth its own ticket; bolting it onto the first network call the app ever makes would be two features in one commit.
- **GitHub's REST API instead of the Atom feed.** Rejected on reachability: `api.github.com` is the host most likely to be unreachable from the network conditions this project's users actually have, and it adds an unauthenticated rate budget that the feed does not have.
- **An HTTP client crate (reqwest / the http plugin).** Rejected: a single GET does not justify a TLS dependency tree when the project already delegates network work to platform tools, and `curl` inherits the machine's proxy configuration for free.
- **Putting the version and the check in an About page.** Rejected: the sidebar footer already holds the app's other two self-descriptions (language, theme). One surface for "this app", pages for "mise", means the position itself disambiguates the number.

## Consequences

- Displaying the version needs no new capability — `core:default` already grants `core:app:allow-version`.
- The update check is the app's first and only outbound request. It lives behind one Tauri command; a second surface that wants the network must justify itself there.
- The vocabulary is fixed by this decision: every string names MiseDeck as the subject ("Check for MiseDeck updates", "MiseDeck is up to date") because `update`, `upgrade`, `release` and "new version" already mean mise or a Tool elsewhere in the app. The version number is never captioned "Version", which `labels.version` owns.
- `README.md`'s "No auto-update" limitation stays true and stays written. It is rewritten only if Apple signing arrives, at which point a new ADR supersedes this one.
- A release still ships nothing extra: no manifest, no `.sig`, no CI secrets. The feed is generated by GitHub from the tags that already exist.
- Windows/Linux parity is preserved by using `curl` on every platform (Windows 10 1803+ bundles `curl.exe`) instead of a PowerShell branch that no machine in the review loop can run.

## Revision — launch-time silent check (issue #238, 2026-10-22)

The "nothing fires at launch" bullet above is superseded in one respect: MiseDeck now checks silently, at most once per 24 hours, after launch. The constraints do not move — the check still uses the same eight-second `curl`, every failure stays silent, it still ends at the Release page, and it never opens a panel, a modal, or a notification. What changed is that the state machine this decision deferred now exists.

- Ten seconds after the shell mounts, a fire-and-forget check runs if the last attempt is older than 24 hours, or if the stored timestamp is in the future (clock skew counts as due instead of silencing the check indefinitely). The attempt timestamp is written before the request, so a crash or a kill mid-check cannot cause a second request on the next launch.
- The attempt timestamp and, when one was found, the newer build's version and Release URL persist in `localStorage` under `misedeck.updateCheck.v1`. A failed check records the attempt and keeps a previously stored build.
- A stored build is ignored and cleared once the running version is no longer older than it — that is how upgrading removes the marker.
- A stored (or freshly found) newer build renders a dot on the sidebar's version line. The line's accessible name and tooltip name the newer build, so the dot never relies on color alone; clicking the line opens the same four-state panel, already showing the available version. The dot uses `--flare`, the existing attention color: no new token, no new color, no new animation.
- The manual Check action is unchanged. Manual attempts also refresh the stored timestamp and marker, so the next launch inside the window stays quiet.
- The startup path never awaits the check: it is scheduled after mount, its rejection is swallowed, and no UI opens on its own. Offline launches pay nothing measurable.

