# MiseDeck

> [简体中文](./zh-CN/README.md)

**A desktop GUI for [mise](https://mise.jdx.dev), the polyglot tool version manager.** It is built from mise's own concepts, not an invented layer on top: each page mirrors a part of the CLI, and every change it makes runs a real `mise` command, shown verbatim — command, logs, exit code — in the execution panel.

> **Status: public beta, `v1.0.0-beta.14`** (14 builds since August 2026). 1.0 is not final; copy and layout still change between betas. macOS on Apple Silicon is the polished target; Linux is packaged but unverified; Windows is experimental.

## Why

- **Resolved, not guessed**: installed tools, active versions, outdated upgrades, per-directory overrides — every row labeled with the config file it came from.
- **Nothing hidden**: writes go through the CLI, and the execution panel keeps the command that ran and what it printed.
- **Directory-aware without a terminal**: point the app at a directory and see what mise resolves there.

## Features

Every page works on **Global** (`mise -g`) or on a **directory** you choose; recent directories are remembered. Directory-scoped writes stay disabled until that directory's config is trusted.

| Page | What it does | Commands |
| --- | --- | --- |
| **Home** | Version gate, guided install when mise is missing, one-click self-update | `mise version`, `mise self-update` |
| **Tools** | Installed and active tools; registry search; install / use / uninstall per version; switch version; upgrade outdated; link a local build; filter, paginate | `mise ls`, `mise registry`, `mise ls-remote`, `mise install`, `mise use`, `mise uninstall`, `mise upgrade`, `mise unuse`, `mise outdated`, `mise link` |
| **Overview** | Resolved tools and env, config files in precedence order with contents, `mise.lock` — each row with its source | `mise ls`, `mise env`, `mise config ls` |
| **Env** | Add, edit, rename, unset vars; source badges; warns when a var is defined outside the write scope | `mise env`, `mise set`, `mise unset` |
| **Tasks** | List, filter, run with live output, create and edit, open the config in your editor | `mise tasks ls`, `mise run`, `mise tasks add`, `mise tasks edit` |
| **Settings** | View, filter, edit, unset settings, including `--all`; table-typed keys are read-only with an explanation | `mise settings ls`, `mise settings set`, `mise settings unset` |
| **Doctor** | Status, shell activation, warnings, config files, resolved toolset; tinted raw output as fallback | `mise doctor` |
| **Plugins** | Installed plugins; install from a git URL; uninstall | `mise plugins ls`, `mise plugins install`, `mise plugins uninstall` |

Beyond the pages:

- **Execution panel**: exact argv, working directory, streamed logs, duration, exit code, copy-command, cancel, dismiss. Several commands can run at once.
- **Trust**: an untrusted directory is read-only, with a banner and a one-click `mise trust`.
- **Shell activation**: detects a missing `mise activate` line in your shell rc and shows what to add; can open a terminal at the current directory.
- **Failures stay visible**: a failed load or command keeps its stderr and a retry on screen instead of rendering an empty page.
- Bilingual UI (English / 简体中文) and light/dark themes.

## Requirements

- **mise ≥ 2025.1.0** — MiseDeck calls the CLI rather than bundling it; the Home page can install it for you.
- **macOS on Apple Silicon** for the prebuilt app; Linux x86_64 packages are attached but unverified; Windows x64 is experimental.
- Building from source: Rust stable and Node.js 22+.

## Install

Prebuilt (unsigned) binaries are attached to [GitHub Releases](https://github.com/cherishfall/misedeck/releases).

### macOS (Apple Silicon)

1. Download `misedeck_<version>_aarch64.dmg` from the latest release.
2. Open the DMG and drag **misedeck** into `/Applications`.
3. The first launch is blocked by Gatekeeper — see below.

### macOS: the build is unsigned

Published macOS builds carry no Apple Developer ID signature and are not notarized, so Gatekeeper treats them as untrusted:

| What you see | When |
| --- | --- |
| *"misedeck" is damaged and can't be opened. You should move it to the Trash.* | after dragging the app out of the DMG — the most common symptom |
| *"misedeck" cannot be opened because the developer cannot be verified.* | first double-click |
| *"misedeck" cannot be opened because Apple cannot check it for malicious software.* | same, on newer macOS |

Nothing is corrupt — it is the quarantine flag (`com.apple.quarantine`) that macOS puts on unsigned downloads. Clear it on the installed copy:

```bash
xattr -dr com.apple.quarantine /Applications/misedeck.app
```

Then open the app normally. No `sudo` needed; `-d` deletes the attribute, `-r` applies it to the whole bundle.

Without a terminal: launch once and dismiss the dialog, open **System Settings → Privacy & Security → Security**, click **Open Anyway**, authenticate, then open the app again and confirm **Open**.

If it still refuses:

- Run the copy in `/Applications`, not the one inside the mounted DMG (that copy is read-only).
- Check the flag is gone: `xattr -p com.apple.quarantine /Applications/misedeck.app` should answer *No such xattr*.
- Re-apply after every reinstall — each new download carries the flag again.
- Don't disable Gatekeeper system-wide (`sudo spctl --master-disable`); clearing this one app is the narrow fix.

### Linux x86_64

- Debian/Ubuntu: `misedeck_<version>_amd64.deb`
- Fedora/RHEL: `misedeck-<version>-1.x86_64.rpm`
- Any distro: `misedeck_<version>_amd64.AppImage` — `chmod +x`, then run.

Packaged by CI, never exercised on a real desktop by the maintainer. Expect rough edges.

### Windows x64 — experimental

Each release attaches `misedeck_<version>_x64-setup.exe`. Windows is not verified yet: the maintainer is testing on real hardware now, and finding the mise binary on Windows is still being fixed ([#208](https://github.com/cherishfall/misedeck/issues/208)). Expect it not to work yet; reports help.

## Run from source

The repo root is not the app: `package.json` lives in the `misedeck/` subdirectory, and every npm command has to run from there.

```bash
git clone https://github.com/cherishfall/misedeck.git
cd misedeck/misedeck   # repo root → app directory (package.json is here)
npm install
```

Already have a clone? `cd <repo>/misedeck` first — running `npm install` at the repo root fails with `ENOENT … package.json`.

### Development

```bash
npm run tauri dev
```

This starts the Vite dev server on `localhost:1420` and opens the app window against it. Frontend edits hot-reload; changes under `src-tauri/` rebuild the Rust side and restart the window. The first launch compiles everything from scratch (minutes), later ones are incremental.

`npm run dev` on its own only serves the frontend in a browser — the Rust backend and its commands are missing, so use `npm run tauri dev` to actually exercise the app.

Extra prerequisites on top of Rust stable + Node 22: macOS needs the Xcode Command Line Tools (`xcode-select --install`); Linux needs the WebKitGTK/GTK development packages listed in [`.github/workflows/release.yml`](./.github/workflows/release.yml).

### Build installers

```bash
npm run tauri build
```

Bundles land in `src-tauri/target/release/bundle/` — `dmg/` and `macos/` on macOS, `nsis/` on Windows, `deb/`, `rpm/`, `appimage/` on Linux. macOS builds come out unsigned, exactly like the released ones.

`npm run ci` runs what CI runs: typecheck, tests, the i18n/CSS lint guards, and a production frontend build.

## Known limitations

- macOS builds are unsigned and not notarized (see above).
- No auto-update: download a new build, and re-apply the `xattr` fix afterwards.
- Cancel is a soft cancel — it stops MiseDeck waiting, it does not kill the `mise` child process.
- Windows is experimental ([#208](https://github.com/cherishfall/misedeck/issues/208)); Linux is unverified.
- No Intel macOS build; build from source if you need one.
- Beta: UI copy and layout can change between releases.

## Screenshots

Images in [`docs/screenshots/`](./docs/screenshots/) predate the sidebar, light theme, and scope switcher, so they no longer match the app. Fresh ones are being captured for 1.0.

## Contributing

See [AGENTS.md](./AGENTS.md), the glossary in [CONTEXT.md](./CONTEXT.md), and [docs/adr/](./docs/adr/). Bugs and feedback: [Issues](https://github.com/cherishfall/misedeck/issues).

## Disclaimer

MiseDeck is a community project, not affiliated with or endorsed by the official mise project.

## License

[MIT](./LICENSE)
