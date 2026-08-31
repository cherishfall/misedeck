# Getting Started (golden path for ticket #17)

> [简体中文](../../zh-CN/docs/agents/getting-started.md)

The exact, known-good path to a running skeleton. Follow it literally; improvise nothing.

## Prerequisites

- Node 22+ (`node --version`)
- Rust toolchain: `curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh`, then restart the shell and check `cargo --version`
- macOS: Xcode Command Line Tools (`xcode-select --install`)

## Scaffold

```bash
npm create tauri-app@latest misedeck -- --template react-ts --manager npm --yes
cd misedeck
npm install
npm run tauri dev   # a window opens; this proves the toolchain works
```

Layout after scaffolding: `src/` is the React frontend, `src-tauri/` is the Rust shell, `src-tauri/tauri.conf.json` is the app config, `src-tauri/capabilities/` holds Tauri 2 permissions.

## Then implement ticket #17

1. Add the stack libraries per `docs/agents/architecture.md` (react-router v7, react-i18next, @tanstack/react-query) — install them now even if #17 only uses some.
2. Write the first Tauri command `detect_mise` per the contract in `docs/agents/conventions.md`: run `mise version --json`, return the typed result or `AppError` (`MISE_NOT_FOUND` / `MISE_TOO_OLD`).
3. Render the result in the single starter page: version + binary path, or the not-installed state.
4. Build the fixture-mise harness and unit tests per the Testing section of `conventions.md`.

## Tauri 2 gotchas (learned the hard way, do not rediscover)

- Every frontend call to a command goes through `invoke` from `@tauri-apps/api/core`; command names are snake_case in Rust and identical in `invoke`.
- Any new core/plugin API used from the frontend must be added to `src-tauri/capabilities/default.json`, or the call fails silently in production builds.
- Spawning processes: use `tauri-plugin-shell` (add to Cargo.toml, `tauri.conf.json` plugins, and capabilities), not `std::process` from command handlers that need streaming; streaming to the UI uses `tauri::ipc::Channel`.
