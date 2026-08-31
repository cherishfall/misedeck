# Distribution via GitHub Releases and own Homebrew tap, unsigned

> [简体中文](../../zh-CN/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)

v1 ships as unsigned binaries on GitHub Releases plus a self-hosted Homebrew tap (`cherishfall/homebrew-tap`). No Apple notarization ($99/yr), no Windows code signing. Submitting to the official `homebrew-cask` repo is deferred until the project meets its notability bar (~50 stars); the tap requires no approval of any kind.

## Consequences

- First launch requires right-click → Open (macOS Gatekeeper quarantine); this must be documented in the README.
- Getting listed in mise's official docs (community projects) and bilingual README keywords are the primary discovery channels; the product is named **MiseDeck** (GitHub repo renamed to `cherishfall/misedeck`; GitHub keeps redirects from the old `cherishfall/mise-ui` name). SEO note: name match is a minor factor — docs listing, GitHub topics, and bilingual README keywords carry the weight.
