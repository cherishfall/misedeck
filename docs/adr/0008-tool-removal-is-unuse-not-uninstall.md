# Tool-level removal is `mise unuse`, and removal words split across mise's two axes

> [简体中文](../../zh-CN/docs/adr/0008-tool-removal-is-unuse-not-uninstall.md)

The Tools page's row-level Uninstall ran `mise uninstall <tool>@<version>`. That command deletes files but leaves the Config file's request untouched, so mise reinstalls the tool on the next install — the owner reported that uninstalling felt broken ("是不是缺一个卸载功能"). The root cause is a model mismatch: mise tracks a tool on two independent axes — *requested by a Config file* and *present on disk* — and gives each axis its own verb pair (`use`/`unuse` for config, `install`/`uninstall` for files). The GUI had compressed both axes into a single Uninstall button, and it picked the wrong one for the action users mean by "remove this tool".

**The GUI's action vocabulary maps one-to-one onto mise's four verbs, scoped by where each appears:**

| UI (en) | UI (zh) | Command | Scope |
|---|---|---|---|
| Use | 使用 | `mise use <tool>@<version>` | Version: activate, installing if missing — the primary mutation (version-management section: installed + not-installed rows) |
| Install | 安装 | `mise install <tool>@<version>` | Version: files only — the exception (not-installed rows) |
| Uninstall | 卸载 | `mise uninstall <tool>@<version>` | Version: delete one version's files (in-use + installed rows) |
| Unuse | 取消使用 | `mise unuse <tool>` | Tool: remove from config + prune installations (in-use rows only — beta13 amendment below) |
| Uninstall | 卸载 | `mise plugins uninstall <plugin>` | Plugin: remove a plugin (#164 addendum) |

*Copy as of beta13:* en "Install only" → "Install"; zh 删除此版本 → 卸载; Unuse's zh copy 卸载 → 取消使用 (the beta13 settlement, recorded in the amendment below).

*The orphan branch decided here is* **superseded (beta13, #187/#188/#189)**. It read: for a tool not declared in any Config file (an orphan installation, e.g. from a manual CLI `mise install`), the Unuse action runs `mise uninstall --all <tool>` instead — `unuse` has no request to remove and would error; the button copy does not change and the confirmation dialog shows the exact argv either way. This branch is retired: the main table no longer carries a row-level Unuse, so `unuse` is reachable only from the version-management section's in-use rows, where a config request always exists; orphan installations are cleaned one version at a time (`mise uninstall <tool>@<version>`) in the installed section, and `mise uninstall --all` never enters the GUI.

The English copy keeps mise's native verbs because the confirmation dialog echoes the exact command and the GUI teaches the CLI — a label/command mismatch would break that promise. The Chinese copy deliberately diverged for 卸载 in beta11: the common Chinese software sense of "卸载" is *remove completely*, which matched `unuse`'s semantics, not `uninstall`'s — pairing 卸载 with `mise uninstall` would have re-created the original bug in the user's head. *Superseded in beta13:* unuse's zh copy was renamed 取消使用, freeing 卸载 to pair honestly with per-version `mise uninstall`.

## Considered Options

- **Keep one Uninstall mapped to `mise uninstall`.** Rejected — that is the bug itself: files come back because the config request survives.
- **Label the tool-level action "Uninstall" in English while running `mise unuse`.** Rejected — the echoed command would contradict the button, and teaching the CLI is product principle 1.
- **Use 弃用 or 停用 as `unuse`'s Chinese word.** Rejected — neither pairs with anything on screen, and 停用 implies a reversible pause while `unuse` deletes files. The two removal verbs never share a scope in the UI (one lives on version rows, the other on tool rows), so no on-screen antonym pair is needed.
- **Give all four verbs equal prominence.** Rejected — install-only is a niche "hoard a version" action; elevating it adds a step to the main journey, which is `use`.

## Consequences

- `CONTEXT.md` gains Use / Unuse / Install / Uninstall entries fixing this mapping as project vocabulary.
- An active version's row offers no per-version Uninstall: its request lives in the Config file, so deleting its files only invites an immediate reinstall. Tool-level Unuse is the only way out of an active version. *(Superseded in beta13: the in-use section's rows now carry a working per-version Uninstall — danger, row-disabled with a Tooltip when the version is not on disk — and the confirm dialog teaches the reinstall consequence honestly.)*
- Orphan installations are removable through the same Unuse action (via `mise uninstall --all`); nothing on the Tools page is undeletable. *(Superseded in beta13: the GUI intentionally exposes no batch removal — orphan installations are uninstalled one version at a time; see the amendment below.)*
- The Tools page redesign (the version-management region below the table, registry search entry) builds on this vocabulary: not-installed rows are 使用/安装, installed rows are 使用/卸载, in-use rows are 取消使用/卸载, tool rows in the main table carry no removal action at all (only the ghost「版本管理」/ Manage versions entry).
- The command hint on the Tools page gains `mise unuse`.

## Addendum (beta11, issue #164)

Plugin-level removal joined the map: the Plugins page's Uninstall runs `mise plugins uninstall <plugin>` (issue #112). 卸载 therefore spans two scopes — tool level (`mise unuse <tool>`) and plugin level (`mise plugins uninstall <plugin>`) — while version-level removal stays "Uninstall" / 删除此版本 (`mise uninstall <tool>@<version>`) everywhere (zh 删除此版本 → 卸载 per the beta13 amendment below). The original premise that "the two removal verbs never share a scope in the UI" described the Tools page alone; the plugin uninstall shipped after this ADR and is recorded here as an explicit scope extension rather than left as undocumented drift.

## Amendment (beta13, issues #187/#188/#189/#190)

The beta13 structure redesign replaces this ADR's orphan branch and re-settles the copy. This ADR is **amended by beta13**, not revoked — its core principle (every label pairs with exactly the command it runs, so the confirmation dialog's teaching echo never contradicts its button) survives intact and now holds without exception:

- **Structure.** The main table's action column holds a single ghost「版本管理」/ Manage versions button (it expands the version-management region below the table, fills in the tool, and scrolls to it). Every version operation lives in that region's three sections, in fixed order — in use → installed → not installed. Tool-level Unuse appears only on in-use rows, where a config request always exists, so the orphan branch (the only label/command mismatch this ADR ever tolerated) is structurally gone.
- **No batch removal (product-level decision, owner-ratified).** The GUI intentionally exposes no batch install/uninstall: no "uninstall all versions" action exists anywhere, and `mise uninstall --all` never enters the GUI. Rationale: mise manages dev tools, where stability beats freshness (see `product-logic.md` → Guiding policies, no-"update everything" rule), and a user's tool set is small enough that per-version cleanup is not a burden. Orphan installations are removed one version at a time (`mise uninstall <tool>@<version>`) from the installed section.
- **Copy settlement.** Unuse's zh copy is 取消使用 (use's antonym), freeing 卸载 to pair with per-version `mise uninstall`; en copy settled on bare verbs (Use / Install / Uninstall / Unuse), dropping the "Install only" / 删除此版本 qualifiers. The beta11 zh divergence rationale above is retired with the rename.
- The beta11 addendum (plugin scope) stands unchanged.
