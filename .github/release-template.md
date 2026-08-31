# MiseDeck <version>

First stable release of MiseDeck, a faithful desktop GUI for [mise](https://mise.jdx.dev). Cross-platform (macOS polished, Windows / Linux beta).

## What's in v1

- **Global tool management**: install, uninstall, switch, upgrade, and see outdated badges in one table.
- **Directory context**: resolved tools, env vars, and lockfile previews with config-source badges.
- **Config editor**: form-based `[tools]` and `[env]` editing for global and per-directory `mise.toml`.
- **Tasks**: list, run with live output, and simple edits.
- **Trust UX**: read-only untrusted directories with one-click trust.
- **Settings, doctor, and plugin/backend browsing**.
- **mise self-management**: guided install when mise is missing and one-click self-update.
- **Activation helpers**: open the current directory in a terminal, copy the activation command, and check shell setup.
- **English and Simplified Chinese UI**.

> [English](../README.md) · [简体中文](../zh-CN/README.md)

## Install

### macOS

```bash
brew install --cask cherishfall/tap/misedeck
```

Or download the `.dmg` from the assets below, open it, and drag MiseDeck to Applications.

> **First launch (unsigned)**: the binary is **not notarized** (per [ADR-0002](../docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)). macOS Gatekeeper will block the first open. Right-click the app in Applications → **Open** → confirm. Subsequent launches work normally.

### Windows (beta)

Download the `.exe` installer and run it.

> **SmartScreen (unsigned)**: the binary is **not code-signed**. Windows SmartScreen will show "Windows protected your PC" — click **More info** → **Run anyway**.

### Linux (beta)

Pick the package that matches your distro:

- `.deb` — Debian / Ubuntu
- `.rpm` — Fedora / RHEL
- `.AppImage` — portable, no install

## Verify

A `SHA256SUMS` file is attached below. Verify before installing:

```sh
# macOS / Linux
shasum -a 256 -c SHA256SUMS

# Windows (PowerShell)
Get-FileHash -Algorithm SHA256 .\<file-you-downloaded>
```

## Notes

- MiseDeck v1 is distributed **unsigned** on every platform, by design. Code signing and Apple notarization are out of scope for v1.
- Windows and Linux builds are labeled **beta** in this release.
- MiseDeck is a community project, not affiliated with or endorsed by the official mise project.
