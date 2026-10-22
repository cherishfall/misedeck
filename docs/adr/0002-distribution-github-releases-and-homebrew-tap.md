# Distribution via GitHub Releases only, unsigned

> [简体中文](../../zh-CN/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)

> **Status (2026-10):** accepted. GitHub Releases is implemented (`release.yml`) and is the **only** distribution channel. v1 ships **no Homebrew tap** — no tap repository, no cask, no tap publishing step in CI. A tap is a post-1.0 option (issue #263).

v1 ships as unsigned binaries on GitHub Releases only: one release per tag, carrying the macOS `.dmg`, the Windows NSIS installer, the Linux `.deb` / `.rpm` / `.AppImage`, and a single release-wide `SHA256SUMS`. No Apple notarization ($99/yr), no Windows code signing, no package manager in between. Users download a file and clear Gatekeeper or SmartScreen themselves (README → Install).

**Why no tap in v1.** A tap is a second repository plus a per-release push: every tag needs a cask version bump, a checksum, and a CI job holding a token that can write to that repository. None of that is hard, but all of it can fail independently of the release users actually download — and the half-state already did damage: the release template shipped `brew install --cask cherishfall/tap/misedeck` for a tap that did not exist, so every macOS user who followed it got a 404. One channel that works beats two where one is a promise.

## Considered Options

- **Self-hosted Homebrew tap (`cherishfall/homebrew-tap`) publishing a cask.** Deferred to **post-1.0**, not rejected. It needs the tap repository, a cask updated per release, and a CI step with write access to a second repository — a distribution surface to maintain, where v1's job is proving the app itself. Revisit once the release cadence settles.
- **A cask in the official `homebrew-cask` repository.** Deferred to post-1.0 as well: it is gated on the project meeting that repository's notability bar (~50 stars), so it is out of reach for the first release regardless of what else changes.

## Consequences

- First launch requires clearing macOS Gatekeeper quarantine — `xattr -dr com.apple.quarantine /Applications/MiseDeck.app`, or **System Settings → Privacy & Security → Open Anyway**; this must be documented in the README.
- Getting listed in mise's official docs (community projects) and bilingual README keywords are the primary discovery channels; the product is named **MiseDeck** (GitHub repo renamed to `cherishfall/misedeck`; GitHub keeps redirects from the old `cherishfall/mise-ui` name). SEO note: name match is a minor factor — docs listing, GitHub topics, and bilingual README keywords carry the weight.
- **Three names, fixed (#250).** Display name `MiseDeck`; slug `misedeck` for the repo, npm package and cargo binary — a one-word brand keeps one token, the way GitHub's repo is `github` and not `git-hub` (Spring Boot only needs `spring-boot` because its brand is two words with a space); bundle identifier `io.github.cherishfall.misedeck` — the domain-less convention GitHub documents for its own hosting, where `com.github.*` would instead claim github.com's namespace. The identifier is frozen from the first public release: macOS preferences, keychain items, privacy grants and the Windows uninstall entry are all keyed to it, so changing it later presents every user with what looks like a fresh install.
