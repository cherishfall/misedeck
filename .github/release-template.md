# MiseDeck v<version>

> [English](https://github.com/cherishfall/misedeck/blob/master/README.md) · [简体中文](https://github.com/cherishfall/misedeck/blob/master/zh-CN/README.md)

A stable release of MiseDeck, a faithful desktop GUI for [mise](https://mise.jdx.dev). Cross-platform (macOS polished, Windows / Linux beta).

## What's in v1

Eight pages, each one a part of the mise CLI:

- **Home**: version gate, guided install when mise is missing, one-click self-update.
- **Tools**: install, uninstall, switch, upgrade, and outdated badges in one table.
- **Overview**: resolved tools, env vars, config files in precedence order, and `mise.lock` — each row labeled with its source.
- **Env**: add, edit, rename, and unset environment variables, with source badges.
- **Tasks**: list, run with live output, create and edit.
- **Settings**: view, filter, edit, and unset settings, including `--all`.
- **Doctor**: status, shell activation, warnings, config files, and resolved toolset.
- **Plugins**: installed plugins, install from a git URL, uninstall.

Beyond the pages: the execution panel (exact command, live logs, exit code, copy-command, cancel), read-only untrusted directories with one-click `mise trust`, terminal and activation helpers, light/dark themes, and an English / Simplified Chinese UI.

## Install

GitHub Releases is the only distribution channel — v1 ships no Homebrew formula or cask (per [ADR-0002](https://github.com/cherishfall/misedeck/blob/master/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)).

### macOS

Download the `.dmg` from the assets below, open it, and drag MiseDeck to Applications.

> **First launch (unsigned)**: the binary is **not notarized** (per [ADR-0002](https://github.com/cherishfall/misedeck/blob/master/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)). macOS Gatekeeper will block the first open and may report that the app is damaged. After dragging `MiseDeck.app` to `/Applications`, remove the quarantine flag from Terminal:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/MiseDeck.app
> ```
>
> Then launch normally. Subsequent launches work without extra steps.

### Windows (beta)

Download the `.exe` installer and run it.

> **SmartScreen (unsigned)**: the binary is **not code-signed**. Windows SmartScreen will show "Windows protected your PC" — click **More info** → **Run anyway**.

### Linux (beta)

Pick the package that matches your distro:

- `.deb` — Debian / Ubuntu
- `.rpm` — Fedora / RHEL
- `.AppImage` — portable, no install

## Verify

`SHA256SUMS` is attached below and lists **every** asset in this release — run it from the folder you downloaded into.

```sh
# macOS
shasum -a 256 -c SHA256SUMS

# Linux
sha256sum -c SHA256SUMS

# Windows (PowerShell) — one file at a time
Get-FileHash -Algorithm SHA256 .\MiseDeck_<version>_x64-setup.exe
```

This catches a truncated download, a proxy that served the wrong file, or an asset replaced after upload. It does not prove who built the binary — the builds are unsigned (see Notes).

## Notes

- MiseDeck v1 is distributed **unsigned** on every platform, by design. Code signing and Apple notarization are out of scope for v1.
- Windows and Linux builds are labeled **beta** in this release.
- MiseDeck is a community project, not affiliated with or endorsed by the official mise project.
