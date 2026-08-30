# v1 scope: core layer plus presentation layer

> [简体中文](./0003-v1-scope-core-plus-presentation.zh-CN.md)

v1 covers mise's **core layer** (Tools install/switch/upgrade/outdated, Tasks view/run/edit, env var management, settings, plugin/backend browsing, global vs project config) and the **presentation layer** (Lockfile viewing, `mise doctor` diagnostics, config-hierarchy visualization showing which value comes from which file). The **deep-water layer** — `mise bootstrap`, `mise oci`, `mise deps`, `mise mcp` — is explicitly out of v1 and lives on the roadmap.

## Considered Options

- Literal "full support" including bootstrap/oci/deps: rejected — 3-4x the scope for a narrow audience.
- Core layer only: rejected — the presentation layer (especially config-hierarchy visualization) is the GUI's unique value over the CLI and over the existing `likaia/mise_gui` competitor, which covers mainly tool versions.

## Consequences

- README must phrase coverage as "covers mise's core workflows" rather than "full support", to avoid expectation mismatch.
- Integration is by shelling out to the user's installed mise CLI, preferring `--json` output; when mise is absent or too old, the app detects it and offers a guided one-click install / self-update in v1 (upgraded from "v1.x" per the Q11 discussion; see issue #30).
- No public `mise-deck` CLI or agent skill in v1: the Tauri command layer already IS the "one UI action → a group of mise commands" wrapper, kept separable so it can be extracted later. For AI agents, evaluate `mise mcp` (mise's own MCP server) before building a custom CLI.
