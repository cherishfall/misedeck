# MiseDeck

> [简体中文](./zh-CN/README.md)

**A desktop GUI for [mise](https://mise.jdx.dev), the polyglot tool version manager.** MiseDeck mirrors the CLI instead of hiding it: every screen maps to a mise command, and every action shows you the exact command it runs, with its live output.

> **Status: public beta — `v1.0.0-beta.14`.** Fourteen beta builds since August 2026 have filled in the v1 surface; 1.0 is not final, and screens, copy, and behaviour still move between betas. macOS (Apple Silicon) is the polished target. Linux packages are built but untested by the maintainer. Windows is not supported yet.

## Why

- **See everything**: installed tools, active versions, outdated upgrades, per-directory overrides with their config source — no mental PATH math.
- **Act safely**: every mutation shows the exact `mise` command and its live logs. Nothing happens in a black box.
- **Learn as you go**: the GUI teaches the CLI instead of hiding it.
- **Per-directory without the terminal**: point the app at a directory and see (and edit) what mise would resolve there.

## Features

Everything is scoped either to **Global** (`mise -g`) or to a **directory** you pick — recents are remembered. Directory-scoped writes stay disabled until you trust that directory's config.

| Page | What you can do | Commands behind it |
| --- | --- | --- |
| **Home** | Check that mise is present and new enough, guided install when it is missing, one-click self-update | `mise version`, `mise self-update` |
| **Tools** | Installed and active tools for the scope; registry search; install, use, uninstall per version; switch the active version; upgrade outdated tools; link a locally built directory; filter and paginate | `mise registry`, `mise ls`, `mise ls-remote`, `mise install`, `mise use`, `mise upgrade`, `mise unuse`, `mise uninstall`, `mise outdated`, `mise link` |
| **Overview** | Resolved tools, resolved env, config files in precedence order with their contents, and `mise.lock` — each row carrying its source | `mise ls`, `mise env`, `mise config ls` |
| **Env** | Add, edit, rename, and unset env vars, with source badges and warnings when a var is defined outside the write scope | `mise env`, `mise set`, `mise unset` |
| **Tasks** | List and filter tasks, run them with live output, create and edit them, open the config in your editor, see dependencies | `mise tasks ls`, `mise run`, `mise tasks add`, `mise tasks edit` |
| **Settings** | View, filter, edit, and unset mise settings (including `--all`); table-typed keys are read-only with an explanation | `mise settings ls`, `mise settings set`, `mise settings unset` |
| **Doctor** | Structured health report — status, shell activation, warnings, config files, resolved toolset — with a tinted raw-output fallback | `mise doctor` |
| **Plugins** | Installed plugins, install a custom plugin from a git URL, uninstall | `mise plugins ls`, `mise plugins install`, `mise plugins uninstall` |

Cross-cutting:

- **Execution panel**: every command runs here — exact argv, working directory, streamed logs, duration, exit code, copy-command, cancel, dismiss. Several commands can run at once; switch between runs.
- **Trust**: an untrusted directory is read-only, with a banner explaining why and a one-click `mise trust`.
- **Shell activation**: detects a missing `mise activate` line in your shell rc, shows the line, and can open a terminal at the current directory.
- **Bilingual UI** (English / 简体中文) and **light and dark themes**.
- **Failure is visible**: failed loads and failed commands stay on screen with stderr and a retry, instead of quietly rendering an empty page.

## Requirements

- **mise ≥ 2025.1.0.** MiseDeck runs the CLI; it does not bundle it. If mise is missing or too old, the Home page walks you through the official install script or `mise self-update`.
- **macOS on Apple Silicon** for the current prebuilt app. Linux x86_64 builds are attached but untested. Windows: see [Known limitations](#known-limitations).
- Building from source: Rust stable, Node.js 22+.

## Install

Prebuilt (unsigned) binaries are on [GitHub Releases](https://github.com/cherishfall/misedeck/releases). There is no Homebrew cask yet.

### macOS (Apple Silicon) — the supported target

1. Download `misedeck_<version>_aarch64.dmg` from the latest release.
2. Open the DMG and drag **misedeck** into `/Applications`.
3. Launch it once — Gatekeeper will refuse it. Read the next section before you assume the app is broken.

### macOS: "damaged" or "cannot be verified" is expected on first launch

The macOS builds are **not signed with an Apple Developer ID and not notarized**, so macOS treats the download as untrusted. Depending on how you launched it, you get one of these:

| What you see | Typical trigger |
| --- | --- |
| *"misedeck" is damaged and can't be opened. You should move it to the Trash.* | Dragging the app out of the DMG — the most common symptom |
| *"misedeck" cannot be opened because the developer cannot be verified.* | Double-clicking the app for the first time |
| *"misedeck" cannot be opened because Apple cannot check it for malicious software.* | Same, on newer macOS |

None of these mean the download is corrupt — it is Gatekeeper's quarantine flag (`com.apple.quarantine`) on an unsigned app.

**Fix (recommended), one command for the installed copy:**

```bash
xattr -dr com.apple.quarantine /Applications/misedeck.app
```

Then open the app normally. `-d` deletes the attribute, `-r` applies it recursively to the bundle. No `sudo` needed — you own the app you just installed.

**Fix without the terminal:**

1. Try to open the app once, then dismiss the dialog.
2. Open **System Settings → Privacy & Security** and scroll to **Security**.
3. Click **Open Anyway**, authenticate, then open the app again and confirm **Open**.

**If it still refuses to open:**

- Run the copy in `/Applications`, never the one inside the mounted DMG (the DMG's copy is read-only and rejects the fix).
- Verify the flag is gone: `xattr -p com.apple.quarantine /Applications/misedeck.app` should answer *No such xattr*.
- Re-run the `xattr` command after every reinstall or update — each fresh download carries the flag again.
- Do **not** turn Gatekeeper off system-wide (`sudo spctl --master-disable`). Clearing the flag on this one app is the narrow, sufficient fix.

### Linux x86_64 — built, not tested by the maintainer

- Debian/Ubuntu: `misedeck_<version>_amd64.deb`
- Fedora/RHEL: `misedeck-<version>-1.x86_64.rpm`
- Any distro: `misedeck_<version>_amd64.AppImage` — `chmod +x` it, then run.

Expect rough edges: this leg is compiled by CI but has never been exercised on a real desktop by the maintainer. Reports are welcome.

### Windows

Not supported yet. Windows installers still appear on Releases because CI builds the whole matrix, but MiseDeck cannot locate the mise binary on Windows — treat those files as non-functional previews. Progress is tracked in [#208](https://github.com/cherishfall/misedeck/issues/208).

## Build from source

```bash
git clone https://github.com/cherishfall/misedeck.git
cd misedeck/misedeck
npm install
npm run tauri build
```

Installers land in `misedeck/src-tauri/target/release/bundle/`. For development, `npm run tauri dev`. On Linux, install the WebKitGTK/GTK development packages listed in [`.github/workflows/release.yml`](./.github/workflows/release.yml) first.

## Known limitations

- **Not code-signed or notarized** (macOS). See the install section above.
- **No auto-update.** Download a new build from Releases; re-run the `xattr` fix after installing it.
- **Cancel is a soft cancel.** It stops MiseDeck from waiting and lets you keep working; it does not kill the child `mise` process.
- **Windows is not usable yet** ([#208](https://github.com/cherishfall/misedeck/issues/208)), and **Linux is untested**.
- **Apple Silicon only.** There is no Intel macOS build; build from source if you need one.
- Betas move fast: UI copy and layout can change between releases.

## Screenshots

The images in [`docs/screenshots/`](./docs/screenshots/) come from an earlier beta — the app has since gained a sidebar, a light theme, and a Global/directory scope switcher, so they no longer match the current UI. Fresh screenshots are being captured for 1.0.

## Contributing

Agent-friendly by design: start at [AGENTS.md](./AGENTS.md), the glossary in [CONTEXT.md](./CONTEXT.md), and decisions in [docs/adr/](./docs/adr/). Bugs and feedback belong in [Issues](https://github.com/cherishfall/misedeck/issues).

## Disclaimer

MiseDeck is a community project, not affiliated with or endorsed by the official mise project.

## License

[MIT](./LICENSE)
