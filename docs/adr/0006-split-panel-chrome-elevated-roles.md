# Split `--panel` into chrome (sidebar / toolbar / deck) and elevated (popover / dialog / banner / panel) roles

> [简体中文](../../zh-CN/docs/adr/0006-split-panel-chrome-elevated-roles.md)

In issue #78 the three chrome panels — sidebar, top toolbar, execution deck — shared one flat surface color (`--hull`), which read bland in light mode and lacked hierarchy in dark mode. The fix introduces a three-level *chrome* hierarchy (`--hull` → sidebar, `--hull-soft` → toolbar, `--hull-deep` → deck) mapped by role from mise.jdx.dev's palette, and decouples `--panel` from `--hull` so elevated surfaces get their own warm value. This ADR records the three decisions that shaped the token split, because each is hard to reverse, surprising without context, and carries a real trade-off.

**Decision 1 — `--panel` is no longer an alias of `--hull`; it is the *elevated* role, `--hull` is the *chrome* role.** The trap this avoids: `--panel: var(--hull)` was consumed by 11 components (FloatingMenu, ConfirmDialog, Banner, Panel, and the Tasks/Doctor/Tools cards). Simply retinting `--hull` for the sidebar would have dragged every popover and dialog along, turning floating surfaces from "brighter than the page" into "darker than the page" and destroying the elevation cue. Giving `--panel` its own warm literal (`#F8F0E2` / `#221C1A`) means the 11 elevated consumers follow automatically with zero component edits; only the three chrome surfaces (sidebar, toolbar, deck) get explicit rewiring. The split is the whole point — chrome and elevation are different roles and must be addressable independently.

**Decision 2 — dark `--hull-soft` deviates from mise's `bg-alt` (`#161618`).** At mise's ~50px decorative nav strip that near-black is invisible-but-acceptable; MiseDeck's top toolbar is a ~22px *functional* chrome bar that must read as a distinct surface. The dark value is lifted to `#1F1816` — a warm transition between `--hull` (`#1C1614`) and `--hull-deep` (`#261E1A`) — staying inside the warm charcoal family with no new hue. The light value follows mise's `bg-alt` role.

**Decision 3 — `--panel` does not take mise's `bg-elv` exact values.** mise's light `#FFFFFF` is a neutral white (off the warm family) and its dark `#202127` is a blue-grey (blue 39 > red 32, off-brand). Instead `--panel` uses warm values that sit *between* `--void` and `--hull` in both themes — in light `~2.4%` below the page and `~1.3%` above the sidebar; in dark `~21%` above the sidebar and `~14%` below the deck. The gap keeps a raised surface distinguishable from both the page and the chrome; the lift itself stays on the existing shadow, color only carries identity.

## Considered Options

- **Retint `--hull` and leave `--panel` as an alias.** Rejected — silently flips every popover/dialog/banner from floating to sinking, killing the elevation cue (Decision 1).
- **Drop the chrome hierarchy and only recolor elevated surfaces.** Rejected — the owner explicitly asked for the three chrome panels to stop looking flat and identical; a single elevated recolor leaves the reported problem unsolved.
- **Use mise's `bg-alt` exactly for the dark toolbar (`#161618`).** Rejected — invisible at a 22px functional bar height; the upstream value was tuned for a ~50px decorative strip (Decision 2).
- **Copy mise's `--vp-c-bg-elv` (`#FFFFFF` / `#202127`) for `--panel`.** Rejected — neutral white and blue-grey are both off-brand; the warm between-value keeps identity without leaving the family (Decision 3).

## Consequences

- `--hull` is chrome-only (sidebar); `--hull-soft` (toolbar) and `--hull-deep` (deck) are new chrome tokens, all within the warm parchment / charcoal family.
- `--panel` is elevated-only with its own warm literal in both themes; the 11 elevated consumers need no edits and stay "floating".
- `color-mix(var(--hull) N%, transparent)` tints (≈15 usages: Button, Table, Banner, nav hovers, deck log) follow the new hull color automatically — expected, not a regression.
- No border-radius, shadow, glassmorphism, or gradient changes; `--void`, `--beam`, `--line`, `--ice`, `--flare`, `--breach`, `--grove`, `--text`, `--dim` are untouched.
- `lint:css-tokens` is the guard: every referenced token is defined, so the two new tokens must exist before components may use them.
