# MiseDeck v<version>

A faithful GUI over [mise](https://mise.jdx.dev). Cross-platform (macOS polished, Windows / Linux beta).

> **Looking for the README in your language?** [English](../README.md) · [简体中文](../zh-CN/README.md)

## Highlights

See the full changelog in the README: [CHANGELOG](../CHANGELOG.md) (kept in the bilingual README until #32 lands).

## Install

### macOS

Download the `.dmg`, open it, and drag MiseDeck to Applications.

> **First launch (unsigned)**: the binary is **not notarized** (per
> [ADR-0002 — Distribution via GitHub Releases and own Homebrew tap, unsigned](../docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)).
> macOS Gatekeeper will block the first open. Right-click the app in
> Applications → **Open** → confirm. Subsequent launches work normally.
> For Homebrew users: the tap at `cherishfall/homebrew-tap` ships a
> cask that carries the same caveat.

### Windows (beta)

Download the `.exe` installer and run it.

> **SmartScreen (unsigned)**: the binary is **not code-signed** (see
> the same ADR-0002 above). Windows SmartScreen will show
> "Windows protected your PC" — click **More info** → **Run anyway**.
> Windows / Linux builds are labeled **beta** in this release.

### Linux (beta)

Pick the package that matches your distro. All three formats are
attached below.

- `.deb` — Debian / Ubuntu
- `.rpm` — Fedora / RHEL
- `.AppImage` — portable, no install

After installing, run `misedeck` from your application launcher or
terminal.

## Gatekeeper / SmartScreen note

MiseDeck v1 is distributed **unsigned** on every platform, by design.
This is documented in
[ADR-0002 — Distribution via GitHub Releases and own Homebrew tap, unsigned](../docs/adr/0002-distribution-github-releases-and-homebrew-tap.md).
Code signing and Apple notarization are out of scope for v1; revisit
once the project crosses the notability bar.

If a security prompt from macOS or Windows blocks the launch, follow
the per-platform steps above. This is expected, not a bug.

## Verify

A `SHA256SUMS` file is attached below. Verify before installing:

```sh
# macOS / Linux
shasum -a 256 -c SHA256SUMS

# Windows (PowerShell)
Get-FileHash -Algorithm SHA256 .\<file-you-downloaded>
```

Compare the hash in `SHA256SUMS` to the one printed for your file.

## Full Changelog

See [CHANGELOG](../CHANGELOG.md) in the bilingual README, and the
commit history between this tag and the previous one.
