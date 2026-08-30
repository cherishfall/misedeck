# MiseDeck

> [简体中文](./README.zh-CN.md)

**A desktop GUI for [mise](https://mise.jdx.dev), the polyglot tool version manager.** Faithful to the command line you already know: every screen maps to a mise command, and every action shows you the exact command it runs.

> Early development — v1 is being built. See the [spec](../../issues/16) and [tickets](../../issues?q=label%3Aready-for-agent).

## Why

- **See everything**: installed tools, active versions, outdated upgrades, per-directory overrides with their config source — no mental PATH math.
- **Act safely**: every mutation shows the exact `mise` command and its live logs. Nothing happens in a black box.
- **Learn as you go**: the GUI teaches the CLI instead of hiding it.
- **Per-directory without the terminal**: point the app at a directory and see (and edit) what mise would resolve there.

## Features (v1)

- Global tool management: install, uninstall, switch, upgrade, outdated badges
- Directory context: resolved tools and env vars per directory, with config-source badges
- Config editing: `[tools]` and `[env]` forms for global and per-directory `mise.toml`
- Tasks: list, run with live output, simple edit
- Trust UX: untrusted directories are read-only until you say otherwise
- Settings, doctor, plugin/backend browsing
- English and Simplified Chinese UI

## Install

Coming with the first release: unsigned builds on GitHub Releases and `brew install --cask cherishfall/tap/misedeck`. macOS first; Windows and Linux beta builds follow from CI.

## For contributors

Agent-friendly by design: start at [AGENTS.md](./AGENTS.md), the glossary in [CONTEXT.md](./CONTEXT.md), and decisions in [docs/adr/](./docs/adr/).

## Disclaimer

MiseDeck is a community project, not affiliated with or endorsed by the official mise project.

## License

[MIT](./LICENSE)
