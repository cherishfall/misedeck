# Tool-level removal is `mise unuse`, and removal words split across mise's two axes

> [简体中文](../../zh-CN/docs/adr/0008-tool-removal-is-unuse-not-uninstall.md)

The Tools page's row-level Uninstall ran `mise uninstall <tool>@<version>`. That command deletes files but leaves the Config file's request untouched, so mise reinstalls the tool on the next install — the owner reported that uninstalling felt broken ("是不是缺一个卸载功能"). The root cause is a model mismatch: mise tracks a tool on two independent axes — *requested by a Config file* and *present on disk* — and gives each axis its own verb pair (`use`/`unuse` for config, `install`/`uninstall` for files). The GUI had compressed both axes into a single Uninstall button, and it picked the wrong one for the action users mean by "remove this tool".

**The GUI's action vocabulary maps one-to-one onto mise's four verbs, scoped by where each appears:**

| UI (en) | UI (zh) | Command | Scope |
|---|---|---|---|
| Use | 使用 | `mise use <tool>@<version>` | Version: activate, installing if missing — the primary mutation |
| Install only | 仅安装 | `mise install <tool>@<version>` | Version: files only — the exception |
| Uninstall | 删除此版本 | `mise uninstall <tool>@<version>` | Version: delete files of a non-active version |
| Unuse | 卸载 | `mise unuse <tool>` | Tool: remove from config + prune installations |

For a tool not declared in any Config file (an orphan installation, e.g. from a manual CLI `mise install`), the Unuse action runs `mise uninstall --all <tool>` instead — `unuse` has no request to remove and would error. The button copy does not change; the confirmation dialog shows the exact argv either way, per the teaching rule.

The English copy keeps mise's native verbs because the confirmation dialog echoes the exact command and the GUI teaches the CLI — a label/command mismatch would break that promise. The Chinese copy deliberately diverges for 卸载: the common Chinese software sense of "卸载" is *remove completely*, which is `unuse`'s semantics, not `uninstall`'s. Pairing 卸载 with `mise uninstall` would re-create the original bug in the user's head.

## Considered Options

- **Keep one Uninstall mapped to `mise uninstall`.** Rejected — that is the bug itself: files come back because the config request survives.
- **Label the tool-level action "Uninstall" in English while running `mise unuse`.** Rejected — the echoed command would contradict the button, and teaching the CLI is product principle 1.
- **Use 弃用 or 停用 as `unuse`'s Chinese word.** Rejected — neither pairs with anything on screen, and 停用 implies a reversible pause while `unuse` deletes files. The two removal verbs never share a scope in the UI (one lives on version rows, the other on tool rows), so no on-screen antonym pair is needed.
- **Give all four verbs equal prominence.** Rejected — install-only is a niche "hoard a version" action; elevating it adds a step to the main journey, which is `use`.

## Consequences

- `CONTEXT.md` gains Use / Unuse / Install / Uninstall entries fixing this mapping as project vocabulary.
- An active version's row offers no per-version Uninstall: its request lives in the Config file, so deleting its files only invites an immediate reinstall. Tool-level Unuse is the only way out of an active version.
- Orphan installations are removable through the same Unuse action (via `mise uninstall --all`); nothing on the Tools page is undeletable.
- The Tools page redesign (expandable version center, registry search entry) builds on this vocabulary: 使用/仅安装 on remote rows, 使用/删除此版本 on installed rows, 卸载 on tool rows.
- The command hint on the Tools page gains `mise unuse`.
