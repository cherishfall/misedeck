# MiseDeck — Product Logic

> [简体中文](../../../zh-CN/docs/design/product-logic.md)

Status: ratified by product owner (beta.3 feedback round, 2026-09). This document is the single source of truth for **what the product shows and how it behaves**. Visual styling lives in `docs/design/visual-language.md`; domain vocabulary in `CONTEXT.md`; the three product principles in `AGENTS.md`.

## Positioning

MiseDeck is the **GUI edition of the mise CLI**. Its purpose is not to replace the terminal but to **teach it**: every screen is a projection of a real mise command surface, so a user who only ever clicks around gradually learns the commands they could have typed.

North-star feeling: *"I always know which mise command this screen is showing me."*

## Guiding policies

1. **Navigation mirrors mise's pillars.** mise is "dev tools, env vars, and tasks per project". The sidebar's main group is exactly those, plus the directory lens (Preview) and the extension surface (Plugins). Nothing else earns a top-level slot.
2. **No invented concepts.** A page exists only if a mise command (or command family) backs it. Page nouns and verbs come from `CONTEXT.md` / mise's own CLI vocabulary (`use`, `install`, `set`, `run`, `trust`, `doctor`…).
3. **The command is always visible.** Every page header names the CLI equivalent of what the page does (e.g. Tools → `mise ls` / `mise use`). Every mutation still streams through the execution panel showing the exact argv (AGENTS.md non-negotiable).
4. **Chrome gets out of the way.** Navigation is a collapsible sidebar; the directory indicator appears only when relevant; the execution panel appears only when something runs; read-only pages carry no execution chrome.
5. **Data is data, labels are labels.** Typography styling (uppercase, tracking) may apply to labels, never to data — paths, versions, commands, values render exactly as mise reports them.
6. **Visual inheritance.** Light and dark themes both follow mise.jdx.dev's look, so the app reads as part of the mise family, not a generic hacker skin.

## Information architecture

```
┌──────────────────────────┬────────────────────────────────┐
│ MiseDeck                 │  [Directory indicator — only   │
│ a faithful GUI for mise  │   when a directory is picked]  │
│                          ├────────────────────────────────┤
│ ▸ Preview                │                                │
│ ▸ Tools                  │         Page content           │
│ ▸ Env                    │                                │
│ ▸ Tasks                  │                                │
│ ▸ Plugins                │                                │
│                          │                                │
│ ─────────                │                                │
│ Doctor                   │                                │
│ Settings                 │                                │
│                          ├────────────────────────────────┤
│ 🌐 English ▾   ☾        │  [Execution panel — on demand] │
└──────────────────────────┴────────────────────────────────┘
```

- **Sidebar** is collapsible to an icon rail; state persists across launches.
- **Brand lockup** (proper-case `MiseDeck` + smaller tagline, one unit) sits at the sidebar top; clicking it goes Home (mise status / guided install / self-update). Home is not a nav item.
- **Main group**: Preview → Tools → Env → Tasks → Plugins (order = priority).
- **Bottom group**: Doctor, Settings — the app's own machinery.
- **Footer**: language menu (compact dropdown: globe + current locale, scalable to more locales) and theme toggle (system / light / dark, default system).
- **Directory indicator**: a slim strip at the top of the content area, rendered **only when a directory context is active** (hidden in Global). Shows `当前目录 / Directory` + the real-case path, with Open-in-Terminal, Copy-Command, pick/recent actions. The word "Context/上下文" is retired from UI copy (the domain term *Directory context* stays in the glossary).
- **Styleguide** leaves the product navigation; its route survives in dev mode only.

## Page inventory (target state)

| Page | Backs onto | Sells the workflow |
|---|---|---|
| Home (brand click) | `mise version`, `mise self-update`, install script | mise detected? install/update it |
| Preview | `mise -C <dir> ls` + `mise env` + `mise config` (file precedence) + `mise.lock` | "what mise resolves in this directory" — resolved tools, resolved env, loaded config files in precedence order, lockfile; trust state surfaced |
| Tools | `mise ls`, `mise ls-remote`, `mise use`, `mise install`, `mise uninstall`, `mise upgrade`, `mise outdated` | installed ≠ active; switch/install/upgrade/uninstall |
| Env | `mise env`, `mise set`, `mise unset` | env vars are first-class, per directory or global |
| Tasks | `mise tasks ls`, `mise run`, `mise tasks add/edit` | list, run, light edit for the active directory |
| Plugins | `mise registry`, `mise plugins ls` | browse shorthands → backends; installed plugins |
| Doctor | `mise doctor` | health check |
| Settings | `mise settings ls/set/unset` | edit mise settings |

**The Config editor page is dissolved.** It conflated two first-class concepts and overlapped the Tools page:

- its `[tools]` editing → already lives on **Tools** (`mise use` / `--remove`);
- its `[env]` editing → becomes the **Env** page (`mise set` / `mise unset`);
- config-file visibility (which files load, in what order, their content) → moves to **Preview** (`mise config`), because "what mise sees here" is exactly Preview's job.

The `/config` route redirects to `/preview` for one release, then is removed.

## Interaction rules

1. **Execution panel on demand.** Hidden by default. Slides up when a command runs (exact argv + live log), dismissible when idle, re-openable from anywhere. Pages with no mutating action (Doctor, Preview-aside-from-trust, Plugins) never show it. All mutations still go through it — visibility changed, the contract did not.
2. **Trust and activation banners stay in-page.** `mise trust` and `mise activate` are mise's own gates; banners surface them where they bite (Preview/Tools/Env/Tasks/Settings; activation banner global but dismissible).
3. **Window discipline.** Body never scrolls horizontally; naturally wide content (JSON, tables, logs) scrolls inside its own container. A minimum window size applies; default and minimum sizes are content-aware — the exact mechanism (runtime measurement vs design-time constants) is an open question deferred to the implementing ticket.
4. **Directory context is one thing.** The strip is the only place the directory is chosen or shown; every page consumes it (`mise -C <dir>`), no page hardcodes a directory (architecture.md).
5. **i18n everywhere.** en + zh-CN for all copy; the language menu is the only locale control.
6. **Empty states teach.** A page with nothing to show (no directory picked, no tools, no tasks) says which command would populate it.

## Relationship to existing docs

- Supersedes the chrome/layout portions of `visual-language.md` (top nav, fixed context bar, always-docked execution deck). The rewrite of `visual-language.md` toward mise's website look landed in #37; this document still owns the chrome, that one owns the surfaces inside it.
- ADR-0004 stands; this document operationalizes it. No new concepts were added — *Preview* and *Directory indicator* are presentations of `mise -C` resolution, not new domain nouns.

## Out of scope (roadmap, not now)

Environments (`MISE_ENV` profiles) as a first-class UI, hooks editing, lockfile management beyond viewing, `mise watch`, monorepo task syntax, public misedeck CLI (issue #11), deep-water backends (issue #12).
