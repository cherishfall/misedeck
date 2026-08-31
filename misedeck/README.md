# MiseDeck — Frontend

> [简体中文](../zh-CN/misedeck-README.md)

The React + Tauri 2 frontend for [MiseDeck](https://github.com/cherishfall/misedeck).

## Develop

```bash
# from this directory
npm install
npm run tauri dev      # opens the desktop app
```

## Verify

```bash
npm run ci             # typecheck + i18n parity guard + production build
```

`npm run ci` is the green-bar gate. It runs, in order:

1. `npm run typecheck` — `tsc --noEmit`.
2. `npm run lint:i18n` — `en.json` and `zh-CN.json` must have the same key set.
3. `npm run build` — `tsc --noEmit && vite build`.

## i18n

UI copy is in `src/i18n/en.json` and `src/i18n/zh-CN.json`, routed through
`react-i18next`. The canonical key catalog is `src/i18n/keys.ts`. The
language switcher is at `src/components/LanguageSwitcher/`. See
[docs/agents/i18n.md](../docs/agents/i18n.md) (or
[简体中文](../zh-CN/docs/agents/i18n.md)) for the full conventions —
naming, how to add a string, the detection chain, and the error-code
contract.

## Tauri + React + Typescript (original scaffold README)

This template should help get you started developing with Tauri, React and Typescript in Vite.

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
