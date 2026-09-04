# UI/UX Rules

> [简体中文](../../zh-CN/docs/design/ui-ux-rules.md)

Binding interaction and presentation rules for every page, component, style, and piece of copy in MiseDeck. `visual-language.md` owns tokens (color, type, spacing, motion); this document owns *behavior*. Both were distilled from real beta review cycles — each rule below exists because its violation shipped and a human had to catch it.

## The one-question test

Before shipping any screen, ask: **could a mise CLI user predict what this screen does?** (ADR-0004.) If the answer needs product knowledge the CLI does not have, the design is wrong, not the user.

## Data honesty

- Render data exactly as mise reports it. Paths, versions, backend names, and identifiers keep their original case — `vfox:mise-plugins/vfox-1password` stays as-is. Uppercase + wide tracking is for section labels only, never for data.
- Missing data renders as `—` or the column is dropped. Never fill a column with a hardcoded or fabricated value — a wrong fact is worse than no fact.
- When the GUI mirrors a CLI default (e.g. `mise settings ls` shows only explicitly-set keys), keep the CLI behavior as the default; any wider view is an explicit opt-in control labeled with its flag (`--all`).

## Teaching

- Every mutating action shows the exact mise command — including confirmations. A confirmation is a teaching moment: "This will run `mise uninstall go@1.27.0`."
- Empty states guide inside the GUI: show the button or the resolved global data. An empty state that tells the user to go run a CLI command has failed its job.
- Long result lists (queries, logs, versions) are clearable and paginate past ~10 rows: render the first page of 10 and show a pager (prev / page X of Y · N total / next / jump-to-page) instead of folding behind a "show all N" button. Page size is a free numeric input floored at 10.

## Interaction integrity

- Destructive actions (uninstall, unset, overwrite) always confirm first.
- A control that would be a no-op right now renders disabled — an active-looking button that does nothing ("Upgrade all" when everything is current) reads as broken.
- Every feature stays reachable in every layout state. Collapsing the sidebar hides labels, not capabilities — language, theme, and every page keep an icon entry.
- No dead ends: anything the user can browse offers its natural next step (a Registry row offers "Install…").

## Layout & typography

- Long data never breaks mid-token: fixed table layout + `nowrap` + `text-overflow: ellipsis` + a `title` tooltip is the single default, and **every ellipsized cell must show its full value on hover**. Flex/grid cells carrying data get `min-width: 0`. Scroll containers are reserved for full-browse surfaces (execution log, file content viewers) — a data table never demands horizontal scrolling to read ordinary columns. (Tightened after beta 6: the old "ellipsis or scroll" two-option rule let every page pick differently.)
- Table headers sit exactly over their columns; every button and input lives under a labeled header.
- Status reads as `label: value badge` on one line, badge adjacent to the item it describes. No loose two-column grids where a badge's ownership is ambiguous.
- zh-CN copy: no orphan characters on a trailing line; inline code spans are `nowrap`.
- Both languages get the same visual treatment — if English is a styled banner, Chinese is the same banner, not a plain sentence.

## Window shrink behavior

The window has a minimum size; its job is preventing unusability, not preventing overflow — content adapts. Four layers, one rule each:

- Window: the minimum size keeps the layout usable; nothing downstream may rely on it to prevent squeezing.
- Chrome: the sidebar keeps its fixed (collapsible) width; the toolbar path ellipsizes; the content area clips — a page-level horizontal scrollbar is a bug.
- Content: tables use fixed layout with declared column widths; action and input columns keep their intrinsic width; long data follows the ellipsis rule above; prose keeps soft wrapping.
- Inputs: every input is wide enough for its full placeholder — a cut-off hint is a bug (half a convention teaches the wrong convention).

## Action buttons

One vocabulary, four variants (color/type semantics owned by `visual-language.md`; usage is bound here):

| Variant | Meaning | Examples |
| --- | --- | --- |
| `primary` | The row's main action, when no higher-priority action competes | run, install, add, save |
| `secondary` | Routine actions | switch, edit, choose directory |
| `danger` | Destructive / sensitive | uninstall, remove |
| `ghost` | Dismissive or low-frequency | cancel, open in editor |

- One global action, one visual role: an action that appears on several surfaces (e.g. "choose directory") renders the same variant from the same shared component everywhere. A bespoke re-implementation of an existing button style is a bug.
- Known exception, intentional: the execution panel keeps monospace controls — it is the app's terminal context. Do not "unify" its buttons onto the UI-font Button.

## Execution panel

- The panel never opens on command start. A closed panel stays closed; an open panel stays open — a new run must not yank away a transcript being read.
- The single exception: a run that **fails** while the panel is closed opens the panel once. Failure is too easy to miss in an affordance dot alone.
- Success and cancellation while closed surface through the reopen affordance's tone dot.
- Header order is status → copy command → close; close is a text button like copy, never a bare glyph.

## Chrome & themes

- Window chrome (title bar) follows the resolved theme; verify, because it is configured on the Rust side, not in CSS.
- Light and dark are designed counterparts. A screen is done when it has been *seen* in both.

## Copy

- All strings through i18n. Vocabulary comes from `CONTEXT.md` only. Retired from UI copy: "Context/上下文" and "project/项目" — say "current directory/当前目录".
- Outdated versions render as the upgrade path: `2026.8.14 ▹ 2026.9.0`, never as raw CLI prose, never as color alone.
- Popovers and menus render inside the app window; never as separate overlay windows.

## Floating layers

Popovers and menus — the language switcher, the directory recents menu, and
any future floating surface — share one primitive, `FloatingMenu`. These
rules keep them consistent; hand-rolling a second popover is a bug.

- Render through `createPortal` into `document.body` — never a separate
  overlay window (see `Copy` above). Custom properties live on `:root`, so
  themed tokens still inherit at body level. Portaling is exactly what lets
  the collapsed 55px rail stop clipping the 120px language menu.
- Position by hand from the trigger's `getBoundingClientRect`; accept a
  `placement` prop (`up` / `down`) and an alignment. No positioning library —
  the project is zero-UI / zero-positioning-library. No auto-flip beyond the
  requested placement.
- Click-outside is judged against the **trigger ref and the portal container
  ref together**. Once portaled, the menu renders outside its old root;
  testing only the old root misreads an in-menu click as "outside" and closes
  it instantly.
- z-index comes from `var(--z-popover)` (60) — above `--z-deck` (40), below
  `--z-modal` (100). Never hardcode a `z-index` on a popover; the token is the
  single source of truth.
- Follow the WAI-ARIA Menu Button Pattern: Arrow Up/Down move between items,
  Home/End jump to first/last, Enter/Space select (native button activation),
  Escape closes, Tab closes and moves focus out. On open, focus enters the
  first item; on close, focus returns to the trigger (except when Tab closed
  it). Link trigger to menu with `aria-controls`; keep `role="menu"` /
  `role="menuitem"`, `aria-haspopup="menu"`, `aria-expanded`, and
  `aria-current` on the active item.
- No entrance animation. `visual-language.md` permits only two ambient
  motions; a popover fading or sliding in is a bug.

## Verify economically

Default verification for a UI change is cheap: build, run the page you touched once, and self-audit the diff mechanically — data cells carry `nowrap`/`min-width: 0`, colors come from tokens, strings are i18n keys, retired vocabulary is absent, contrast is sound by token values. Reach for screenshots or a manual click-through only when the change restructures layout, or a human asks. If nobody saw the rendered result, mark the issue "not visually verified" and move on. Never claim visual verification you did not perform.

## Retired vocabulary (hard guardrails)

The hacker-HUD style is retired (visual-language guardrails). In practice this means: section labels carry no prompt glyphs (`▸`); labels may be uppercase-tracked mono, body text and data may not; emphasis comes from color and weight. Pair every removal with the positive form above — the goal is mise-family calm, not bareness.
