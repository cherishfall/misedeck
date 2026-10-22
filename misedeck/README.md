# MiseDeck — Frontend

> [简体中文](../zh-CN/misedeck/README.md)

The React + Tauri 2 frontend for [MiseDeck](https://github.com/cherishfall/misedeck).

## Develop

```bash
# from this directory
npm install
npm run tauri dev      # opens the desktop app
```

## Verify

```bash
npm run ci             # the full frontend gate: typecheck, tests, every lint guard, production build
```

`npm run ci` is the green-bar gate. It runs, in order:

1. `npm run typecheck` — `tsc --noEmit`.
2. `npm run lint:eslint` — the React Hooks rules only (`rules-of-hooks`, `exhaustive-deps`), with zero warnings allowed.
3. `npm run test` — unit tests (`tsx --test "src/**/*.test.ts"`).
4. `npm run lint:i18n` — `en.json` and `zh-CN.json` must have the same key set, and every `t("…")` call site must name a known key.
5. `npm run lint:i18n-concat` — a translated string is never concatenated with another string; the whole phrase lives in the resource file.
6. `npm run lint:css-tokens` — every `var(--*)` reference must resolve to a defined token, and every defined token must be referenced somewhere in `src/`.
7. `npm run lint:css-font-size` — font sizes come from the type-scale tokens, no ad-hoc `px` / `rem`.
8. `npm run lint:css-spacing` — padding / margin / gap come from the spacing tokens.
9. `npm run lint:css-tracking` — letter-spacing comes from the tracking tokens.
10. `npm run lint:i18n-ellipsis` — no button label ends in `…` (placeholders and in-progress copy excepted).
11. `npm run lint:command-hint` — command hints show only commands a user can type, through the shared component.
12. `npm run lint:install-echo-parity` — the guided-install line the UI shows is the line the Rust executor spawns, per platform.
13. `npm run lint:argv-parity` — the tools-page argv builders in TS and `src-tauri/src/mise.rs` agree, per the shared case table.
14. `npm run lint:modal-focus` — no `autoFocus` anywhere (initial focus lives in the shared dialog's `focusTarget.ts`); only one modal implementation.
15. `npm run lint:nested-interactive` — no interactive control nested inside another.
16. `npm run lint:page-layout` — page padding, width and centring stay in `PageShell`.
17. `npm run lint:invoke-wrapper` — every Tauri `invoke` goes through `src/api/invoke.ts`, so a rejected command reaches the global failure notice by default.
18. `npm run build` — `tsc --noEmit && vite build`.

This is the frontend half only. The Rust checks (`cargo check`, `cargo test`) run in `ci.yml`; see [docs/agents/ci.md](../docs/agents/ci.md) for the full gate.

## i18n

UI copy is in `src/i18n/en.json` and `src/i18n/zh-CN.json`, routed through
`react-i18next`. The canonical key catalog is `src/i18n/keys.ts`. The
language switcher is at `src/components/LanguageSwitcher/`. See
[docs/agents/i18n.md](../docs/agents/i18n.md) (or
[简体中文](../zh-CN/docs/agents/i18n.md)) for the full conventions —
naming, how to add a string, the detection chain, and the error-code
contract.
