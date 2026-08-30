# Architecture

> [简体中文](./architecture.zh-CN.md)

Layering, top to bottom. Each layer only talks to the one below it.

```
React UI (src/)
  └─ Tauri commands (src-tauri/)   ← typed API boundary, separable by design
       └─ mise runner              ← builds argv, spawns mise, parses output
            └─ mise CLI            ← the only way the app touches mise state
```

## Rules

- **The app never edits mise config files directly and never parses mise internals.** All state reads go through `mise ... --json`; all writes go through mise write commands (`mise use`, `mise config set`, `mise settings set`, `mise trust`, …). Known JSON gaps (`plugins ls`, `search`, `tool-alias ls`) fall back to table parsing behind the runner, never in UI code.
- **Directory context** (see CONTEXT.md): a single app-level state, defaulting to Global. Every runner call receives it and passes `-C <dir>` when set. No page hardcodes a directory.
- **The command layer is separable** (ADR-0003, issue #11): Tauri commands are thin — validate input, call the runner, shape the result. Anything reusable without a UI belongs in the runner, so a future public CLI can sit on the same layer.
- **Execution panel** (issue #15) is the single path for mutations: it shows the exact command being run and streams its logs. Read-only queries may skip the panel.
- **Trust** (issue #6): read-only views of untrusted directories run with `MISE_SAFE=1`; mutating or env-evaluating actions check trust first and route the user to the trust banner.
- **i18n**: UI copy lives in en + zh-CN resource files keyed by string ID; components consume keys.
- **Frontend state**: server state (mise data) is fetched per directory context and cached by (context, query); UI state (selected tab, panel open) stays local. No persistence beyond recent-directory list and user preferences.

## Data shapes

Prefer mise `--json` output mapped to typed structs at the runner boundary; the frontend consumes only those typed shapes, never raw CLI output.

## Stack (prescribed — do not substitute)

Mid-capability models implement these tickets; every unprescribed choice is a chance for drift. Pin majors here; lockfiles pin the rest.

- **Build**: Vite + React 19 + TypeScript `strict`. Package manager: npm.
- **Routing**: react-router v7.
- **i18n**: react-i18next; resources at `src/i18n/en.json` and `src/i18n/zh-CN.json`, flat string IDs.
- **Server state**: TanStack Query v5; cache key = `[directoryContext, queryName, params]`.
- **Local state**: React state/context only. No Redux, no zustand.
- **Styling**: design tokens as CSS custom properties in a single tokens file + CSS modules per component. No CSS frameworks.
- **Rust**: tauri 2 stable, serde/serde_json, tokio for spawning. Streaming to the execution panel uses `tauri::ipc::Channel`, one message per output line. Any new crate needs a reason stated in the PR.
- **Directory context type**: `enum DirContext { Global, Dir(PathBuf) }`, serialized to the frontend as `{ kind: "global" } | { kind: "dir", path: string }`.
