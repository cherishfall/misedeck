# MiseDeck

> [简体中文](./zh-CN/CONTEXT.md)

MiseDeck is an open-source desktop GUI client for [mise](https://mise.jdx.dev), the polyglot tool version manager. It covers mise's core workflows with guided UX, targeting macOS first and Windows/Linux as beta.

## Language

**Tool**:
A runtime or CLI that mise manages (node, python, ripgrep, …). Identified as `backend:name`; bare names resolve through the Registry.
_Avoid_: runtime, package, program

**Backend**:
A package ecosystem mise installs Tools from (`core`, `asdf`, `aqua`, `ubi`, `cargo`, `npm`, `pipx`, `vfox`, …).
_Avoid_: source, provider, installer

**Plugin**:
An asdf-style or vfox-style extension that teaches mise how to install Tools. Registry-backed (shortname) or custom (git URL / local path).
_Avoid_: extension, addon

**Registry**:
mise's built-in mapping of Tool shorthands to Backends (`mise registry`).
_Avoid_: catalog, index

**Config file**:
A TOML file (`mise.toml`, `.mise.toml`, `mise.<env>.toml`, `.config/mise/config.toml`, …) declaring Tools, env vars, Tasks, and settings. Files merge by directory precedence; writes target the lowest-precedence file in the highest-precedence directory.
_Avoid_: manifest, config (unqualified)

**Environment**:
A named config profile loaded via `MISE_ENV` / `-E` (e.g. `mise.staging.toml`). Each Environment gets its own Lockfile.
_Avoid_: profile, mode

**Task**:
A runnable unit defined in a Config file (`[tasks.x]`) or as an executable file task under `mise-tasks/` / `.mise/tasks/`, with dependency graph and env support.
_Avoid_: script, job, command

**Lockfile**:
`mise.lock` — pinned Tool versions with per-platform URLs, checksums, and provenance.
_Avoid_: lock, snapshot

**Trust**:
mise's security gate: env/hooks/Tasks from an untrusted Config file do not run until the user trusts it (`mise trust`). The GUI must surface this, never silently bypass it.
_Avoid_: approval, whitelist

**Directory context**:
The directory MiseDeck acts as if invoked from — mise's own `cwd` model. Defaults to Global; pointing it at a directory makes every page operate on that directory (`mise -C <dir>`). There is no project registration or project entity.
_Avoid_: project, workspace, scope switcher

**Shims**:
`~/.local/share/mise/shims` executables — the activation mode suited to IDEs, CI, and GUI-spawned processes, as opposed to interactive shell activation.
_Avoid_: symlinks, wrappers

**Use**:
`mise use <tool>@<version>` — activate a Tool version: installs it if missing and writes the request to the Config file. The primary mutation; installing without using is the exception. UI copy: "Use" / 使用.
_Avoid_: enable, activate, set as default

**Unuse**:
`mise unuse <tool>` — remove a Tool from the Config file and prune installations no longer referenced. The real tool-level removal; `mise uninstall` only deletes files. See ADR-0008. UI copy: "Unuse" / 卸载.
_Avoid_: uninstall, remove, delete (at tool level)

**Install**:
`mise install <tool>@<version>` — download a Tool version's files only; does not write the Config file, so the Tool is not on PATH from this alone. UI copy: "Install only" / 仅安装.
_Avoid_: setup

**Uninstall**:
`mise uninstall <tool>@<version>` — delete one installed Tool version's files only; the Config file keeps its request, so a still-requested version will be reinstalled on the next install. UI copy: "Uninstall" / 删除此版本.
_Avoid_: remove, delete (at version level)
