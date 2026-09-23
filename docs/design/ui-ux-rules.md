# UI/UX Rules

> [简体中文](../../zh-CN/docs/design/ui-ux-rules.md)

Binding interaction and presentation rules for every page, component, style, and piece of copy in MiseDeck. `visual-language.md` owns tokens (color, type, spacing, motion); this document owns *behavior*. Both were distilled from real beta review cycles — each rule below exists because its violation shipped and a human had to catch it. Documented conventions exempt from the token rule (see Layout & typography): 1px borders and 4px small-element radius.

## The one-question test

Before shipping any screen, ask: **could a mise CLI user predict what this screen does?** (ADR-0004.) If the answer needs product knowledge the CLI does not have, the design is wrong, not the user.

## Data honesty

- Render data exactly as mise reports it. Paths, versions, backend names, aliases, command names, and identifiers keep their original case — `vfox:mise-plugins/vfox-1password` stays as-is. Uppercase + wide tracking belongs to the section eyebrow alone (`visual-language.md`): every other label is normal case, and data never takes either. User input echoes verbatim too: a key-name field must display `myVar` as `myVar`, never `MYVAR` — visually uppercasing case-sensitive input is the UI lying about the stored value.
- Uppercase/tracking never reaches data, including by inheritance: `text-transform` and `letter-spacing` inherit, so any component that renders data (EmptyState, Badge, table cells) must reset `text-transform: none; letter-spacing: normal` at its root when an ancestor could carry label styling. Defend at the wrapped component, not at each call site.
- Missing data renders as `—` or the column is dropped. Never fill a column with a hardcoded or fabricated value — a wrong fact is worse than no fact.
- A state the app cannot detect renders as "unknown" (`—`), never as a negative fact. A probe that cannot run (e.g. the shell family is unknown, so there is no rc file to inspect) opts out of page-level status derivation — reporting "not activated" when the probe could not run is a false warning for a whole class of environments (beta11, issue #166). This is a revision of the beta7 Issue 6 probe choice: the data source stays, the unknown branch must not read as a fact.
- Diagnostic-grade raw output (RAW JSON payloads, raw command transcripts) renders collapsed by default behind a disclosure control — expanded is one click away with the copy affordance intact. A raw dump is never the daily view (beta11, issue #166).
- When the GUI mirrors a CLI default (e.g. `mise settings ls` shows only explicitly-set keys), keep the CLI behavior as the default; any wider view is an explicit opt-in control labeled with its flag (`--all`).

## Loading & empty states

- A page whose content is a data list gates on its list query, not just on mise detection: while the list read is pending — first load or a directory switch — the page renders the shared `ListLoading` state (`ProgressDot` + `common.loading`), never the empty state. An empty state means the query finished with nothing; flashing it during pending teaches "no data" before the data arrives (beta11, issue #146). One implementation, no per-page copies.
- A toolbar hint fed by an async query declares all four states — pending, empty, has-value, failure — and renders failure as failure (muted copy + a retry affordance), never as loading: a hint stuck on the loading copy after the query has failed presents progress that does not exist, and with no automatic retry it never resolves (beta14, issue #199).

## Teaching

- Every mutating action shows the exact mise command — including confirmations. A confirmation is a teaching moment: "This will run `mise uninstall go@1.27.0`."
- Empty states guide inside the GUI: show the button or the resolved global data. An empty state that tells the user to go run a CLI command has failed its job.
- Long result lists (queries, logs, versions) are clearable and paginate past ~10 rows: render the first page of 10 and show a pager (prev / page X of Y · N total / next / jump-to-page) instead of folding behind a "show all N" button. Page size is a free numeric input floored at 10.
- A page's command hint lists exactly the mise commands that page can run — no more (invented commands are bugs), no less (adding a feature without updating the hint is a bug). Only user-facing commands: internal fetch flags the GUI passes for its own plumbing (`--json`, `--json-extended`, `--path`, …) never appear in a hint. Order follows the page's top-to-bottom layout. Hints render through the shared `CommandHint` component — one implementation, no per-page copies — which caps the hint at `max-width: 60ch` and treats each command as an unbreakable unit: wrapping happens only between commands, never mid-command (beta9).
- A confirm dialog's single command must be completely readable: soft-wrap (`overflow-wrap: anywhere`, mid-token breaking acceptable — data honesty beats an unbreakable token), never a horizontal scroller (beta11, issue #143). This is the deliberate counterpart to the hint rule: a page hint wraps *between* its several commands, while a confirm dialog wraps *within* its one full command — the dialog is the teaching moment, so its command must survive a long `-C <path>` at any window width.

## Interaction integrity

- Destructive actions (uninstall, unset, overwrite) always confirm first.
- A control that would be a no-op right now renders disabled — an active-looking button that does nothing reads as broken. When the enabled state depends on a count, put the count in the label so the user can see the button has real work behind it (e.g. a bulk action that names how many rows it will act on).
- An action cell whose row has no reachable action renders a dim `—` — a blank action cell is a bug. The reason must be discoverable on the `—` itself: the `—` must carry a Tooltip stating why (the source-badge Tooltip remains a secondary contact, beta12, issue #185). A row whose single action is blocked renders a disabled button + Tooltip instead; two side-by-side disabled buttons are noise, not information (beta11, issue #148).
- Rows render read-only by default; an explicit Edit expands the inline form. A field the CLI cannot write (pure tool-injected env vars — ones with no config sourcePath; a config-requested tool var IS overridable via `mise set`, beta11 issue #156) or that must not be typed by hand (picker-owned path) renders as read-only text — never an editable input.
- Match the input to the data type: a boolean gets a two-state control; known key names get a datalist sourced from `mise settings ls --all`.
- Version switching picks from installed versions via a dropdown (`mise use` on selection) — never free typing, never a datalist: a version that does not exist on disk cannot be submitted (issue #132). The current version is marked (`aria-current`) and disabled, since re-selecting it would be a no-op. Installing a version that is not on disk yet belongs to the version-management region below the table (「版本管理」/ Manage versions), not the switch control (issues #178, #188).
- Version management (Tools page, issues #178/#188, superseding #133 and #134): the region below the tools table (「版本管理」/ Manage versions) searches the registry and, once a tool is picked, renders three version sections in a fixed order — in use (the active rows, topmost, never re-sorted; the active badge is the single active signal; row actions Unuse + Uninstall, the latter row-disabled with a Tooltip when the version is not on disk), installed (Use + Uninstall, both confirmed), and not installed (remote minus the on-disk set; Use primary — installs and activates — and Install secondary), with a pinned `latest` row at the top of the last section annotating the concrete version it resolves to. The in-use section's header carries the upgrade affordance: when `mise outdated` reports a newer in-range version, a hint names the target and a secondary Upgrade button runs `mise upgrade <tool>` within the range the config file writes — never `--bump` (beta13 Q9). Section order is constant: in use → installed → not installed. The version-descending sort uses a prefix-aware comparator (vendor prefixes like `graalvm-community-` plus metadata suffixes like `.LTS`/`+35`), and the filter and pagination are client-side so thousand-version lists (java) stay usable. Searching never installs: the pick only loads the version list, and every use/install/uninstall action names its exact version and confirms first (beta12 2-c, beta13).
- Prefer submit-and-catch over pre-flight validation against cached or stale state. Known stderr signatures map to actionable i18n messages — name the object, state the consequence, offer the in-GUI next step; the raw mise error is never swallowed — it stays in the execution-panel transcript.
- An inline form closes or clears its draft only when the write resolves ok (`res.kind === "ok"`); a failed run or a trust-blocked attempt keeps the draft open — nothing the user typed is lost (beta11, issue #163).
- Every feature stays reachable in every layout state. Collapsing the sidebar hides labels, not capabilities — language, theme, and every page keep an icon entry.
- No dead ends: anything the user can browse offers its natural next step. The Tools page's version-management entry is the main table row's ghost「版本管理」/ Manage versions button — it expands the region below the table, fills in the tool, and scrolls to it (#189) — or the region's own registry search directly (`mise use`, issues #178/#188); the Plugins page pairs installed-plugin management with the custom-plugin install form (`mise plugins install <name> <git-url>`, #164) — registry short names install from the Tools page's version-management search, git-URL plugins from the Plugins form.
- Copy failure must never be silent: any copy affordance whose clipboard write does not land shows visible feedback — a transient "Copy failed" state, same mechanism as the "Copied" acknowledgement. A click with no acknowledgement reads as a broken button (beta12, issue #183).

## Layout & typography

- Long data never breaks mid-token: fixed table layout + `nowrap` + `text-overflow: ellipsis` is the single default, and **every ellipsized cell must show its full value on hover** via the shared `Tooltip` primitive (~250ms hover intent, includes a copy button); native `title` is kept only for short icon/button labels. Flex/grid cells carrying data get `min-width: 0`. The chrome toolbar path is the explicit carve-out from the shared-line default: it owns a dedicated full-width second line below the actions row, truncate + hover for the full value (beta12, issue #176 — see Window shrink behavior → Chrome). Scroll containers are reserved for full-browse surfaces (execution log, file content viewers) — a data table never demands horizontal scrolling to read ordinary columns at normal window widths; below the table's declared `min-width` the table's own scroller scrolls horizontally rather than crushing its columns (issue #90 pattern). (Tightened after beta 6: the old "ellipsis or scroll" two-option rule let every page pick differently.)
- Table headers sit exactly over their columns and ellipsize rather than overflow into the next column; every button and input lives under a labeled header.
- Page content never repeats the directory context (mode or path) — the top bar's DirectoryIndicator strip is the only place either is shown (`product-logic.md` principle 4: every page consumes the strip). The strip sits above the content area's sole scroll container and stays visible at every scroll position, so a page-head scope badge re-showing mode + path is 100% redundant; teaching the write scope belongs to per-mode hint copy, row-level source badges/Tooltips, and confirm-dialog scope disclosure (beta14, issue #200).
- Status reads as `label: value badge` on one line, badge adjacent to the item it describes. No loose two-column grids where a badge's ownership is ambiguous.
- zh-CN copy: no orphan characters on a trailing line; inline code spans are `nowrap`.
- Both languages get the same visual treatment — if English is a styled banner, Chinese is the same banner, not a plain sentence.
- Elements sharing a visual line must be visually balanced: any text sharing a line or baseline with 12px+ content renders at `--size-data` or larger — quietness and hierarchy come from color and weight (`--ice`), never from a smaller size. `--size-label` (10px) is reserved for standalone decoration that shares no baseline with body or data text: table headers, chips inside cells, empty-state and loading labels. Controls paired in one row are the same height; the row is width-checked in both locales, with `max-width` + ellipsis defending against longer future strings. (beta9: generalized from the toolbar-row rule to every shared line; the toolbar-eyebrow and small-label exceptions are retired — the goal is visual balance, the size floor is just its enforcement.)
- Every flex action row declares its alignment — no bare `display: flex` without `justify-content` / `margin-left: auto`. Page-toolbar convention: hint left, actions right.
- Color, font-size, tracking, and spacing values come from tokens, never literals — a literal that happens to equal a token today is drift waiting to happen. Only the documented conventions (1px borders, 4px small-element radius) are exempt, as noted in the file header. Guarded by `npm run lint:css-tokens`, `npm run lint:css-font-size`, `npm run lint:css-spacing`, and `npm run lint:css-tracking`.

## Window shrink behavior

The window has a minimum size; its job is preventing unusability, not preventing overflow — content adapts. Four layers, one rule each:

- Window: the minimum size keeps the layout usable; nothing downstream may rely on it to prevent squeezing.
- Chrome: the sidebar keeps its fixed (collapsible) width; the toolbar keeps its fixed two-line form — the action group stays pinned to the right end of the first line and the path owns a full-width second line (truncate + hover for the full value); when even the first line cannot fit at the minimum window size, the action group wraps its buttons internally as the last resort instead of overflowing (beta12, issue #176, superseding beta11, issue #142); the content area clips — a page-level horizontal scrollbar is a bug (a table's own scroller, per the rule above, is not page-level).
- Content: tables use fixed layout with declared column widths; action and input columns keep their intrinsic width; long data follows the ellipsis rule above; prose keeps soft wrapping. A page container never absorbs a table's min-width widening — the page root is a flex child of `.main`, so it sets `min-width: 0` and lets flex stretch hold it at the content width; a declared table `min-width` is absorbed only by the table's own scroller, never by widening the page past the viewport (beta12, issue #177).
- Inputs: every input is wide enough for its full placeholder — a cut-off hint is a bug (half a convention teaches the wrong convention).

## Action buttons

One vocabulary, four variants (color/type semantics owned by `visual-language.md`; usage is bound here):

| Variant | Meaning | Examples |
| --- | --- | --- |
| `primary` | The row's main action, when no higher-priority action competes | run, install, add, save, choose directory |
| `secondary` | Routine actions | switch, edit |
| `danger` | Destructive / sensitive | uninstall, remove |
| `ghost` | Dismissive or low-frequency | cancel, open in editor, disclosure toggle |

- Parallel sections, same semantic slot, same variant family: when stacked tables or sections repeat one action at the same slot (e.g. per-version Uninstall across the in-use and installed sections), the variant family stays put — a slot that reads danger in one section must not drift to neutral secondary in another. Color meaning must not depend on which section a row happened to land in (beta13, issue #187 Issue 3).
- Parallel tables align their action columns on one grid: tables stacked in a region share a column template — the action column keeps one fixed width across all of them and a flex data column of matching role carries the slack — so every Actions header and cell lands on the same x (beta13, issue #187 Issue 3).

- One global action, one visual role: an action that appears on several surfaces (e.g. "choose directory") renders the same variant from the same shared component everywhere. A bespoke re-implementation of an existing button style is a bug.
- A trigger that expands/collapses a region is the shared Button: `variant="ghost"` `size="sm"`, with `aria-expanded` wired to the region's open state — never a bespoke bare-text button, and never a caret/chevron glyph (beta12, issue #184; consistent with the caret rulings under Glyphs & icons).
- A disclosure whose expanded content is panel-level (bordered/padded panel) renders as one full-width disclosure panel: the trigger sits in the panel's header row (the ghost Button above), and the expanded content fills the panel's width — never a dangling trigger floating above a separate content panel, and never a panel shrinking to content width because of a parent's alignment (beta14, issue #195). Content that is not panel-level (a `<pre>` dump, a data block) may fold under an inline trigger.
- Within a single button group, every button renders the same variant unless an explicit hierarchy reason says otherwise — one mixed-variant group reads as one broken group (beta12, issue #176).
- "Choose directory" renders `primary` everywhere — toolbar, empty state, forms (beta9 supersedes the beta8 toolbar-fallback/empty-state exception: a split presentation of one action read as two different buttons, which was worse than a loud one).
- Page-level primary buttons are right-aligned (toolbar convention: hint left, actions right, via `justify-content: space-between` or `margin-left: auto`) and always `size="sm"`; `md` is reserved for non-page-toolbar contexts.
- Known exception, intentional: the execution panel keeps monospace controls — it is the app's terminal context. Do not "unify" its buttons onto the UI-font Button.

## Execution panel

- The panel never opens on command start. A closed panel stays closed; an open panel stays open — a new run must not yank away a transcript being read.
- A run that **fails** while the panel is closed opens the panel once. Failure is too easy to miss in an affordance dot alone.
- Success closes the loop **in the page**, not in the panel: a short-lived confirmation bar (the shared `SuccessBar`) names what happened — `node@22.11.0 installed and activated` — and auto-dismisses after a few seconds (issue #144). The bar carries the result only; the exact command stays the execution panel's teaching echo, so the bar never repeats it. Cancellation while closed still surfaces through the reopen affordance's tone dot.
- Header order is status → copy command → Cancel (rendered only while running) → close, with close always rightmost. Close is a text button like copy, never a bare glyph; Cancel uses the shared Button's `secondary` variant — heavier than a text button but not `danger` (cancelling a command is a routine, non-destructive action). Close is a header fixture (issue #197): it renders unconditionally while the panel is open, in any status — running included, and the idle empty state after the history was cleared or the last run removed. A panel that cannot be closed is a bug. Dismissing only minimizes the panel (`close` flips `isOpen`; runs and in-flight commands are untouched — a command keeps running after the panel is collapsed, and the reopen affordance is the way back); it is never a cancel.
- The command echo is terminal-perspective (#191): it shows what a user would type in a terminal, not the runner's exact argv. Global mode renders the bare command body — no `-C $HOME` — with a separate "Working directory: ~ (home)" context line (the shared `ConfirmDialog` and the execution panel use the same shape); Directory mode keeps `-C <dir>` inline in the echo. The runner still anchors Global mode at `-C $HOME` internally (issue #179) — only the echo changes. The self-update echo (`mise -C $HOME self-update --yes`) is the one deliberate exception. Known limit: `upgrade` / `tasks run` have no `-g` flag, so pasting a Global-mode echo of those into a project directory means something different — the working-directory line is the disclosure that carries this.
- History keeps at most **3 finished runs**; pruning drops the oldest and happens only when a new command starts. A running run never counts toward the cap, may exceed it, and can never be closed or cleared — the panel is the only surface for an in-flight command (#138, #180).
- Every finished run's switcher chip carries a single-entry close control, and the switcher row offers **Clear** (the shared `common.clear` label) — Clear removes finished runs only; running runs always survive. Removing the active run falls back to the most recent remaining run, or the idle empty state when history is empty (#180).
- Run-locking (issue #135, refined by #138): a control disables only while the specific command *it* dispatched is in flight — locking is per action, not a global "at most one command at a time" rule, so several mise commands may run concurrently. Browsing of already-loaded data never locks: expanding/collapsing rows, filtering, sorting, and paginating all keep working through a multi-minute install. Opening an edit draft is not command-firing either — a row's Edit button, and the draft's inputs and Cancel, stay enabled during a run; only the form's Save locks. The same split holds for standing forms (add env var, add setting, the version-management search, link tool): their inputs and directory pickers stay editable, only the submit (Add / Use / Link) locks. Confirm dialogs are run-aware: the shared `ConfirmDialog` disables its own Confirm button while a command runs (Cancel always stays enabled), so the buttons that merely *open* a confirm dialog (Unset, Unuse, per-version Uninstall, plugin Uninstall) are not command-firing and never lock.

## Chrome & themes

- Window chrome (title bar) follows the resolved theme; verify, because it is configured on the Rust side, not in CSS.
- Light and dark are designed counterparts. A screen is done when it has been *seen* in both.
- Refresh is a page-level capability owned by the top toolbar: one shared refresh button, wired to the page's registered refresh (invalidate everything the page fetched). Pages and sections never place their own refresh buttons (beta8).

## Copy

- All strings through i18n — glyphs included: no hardcoded glyph literals in JSX; trailing glyphs go through the Button `trailing` prop; menu/popover triggers carry no caret glyph at all. One i18n key = one semantic role: the same word used as a state label and as an action trigger gets two keys — labels and actions evolve differently per locale. Vocabulary comes from `CONTEXT.md` only. Retired from UI copy: "Context/上下文" and "project/项目" — say "current directory/当前目录".
- Removal vocabulary splits by scope (ADR-0008, amended by beta13): tool-level removal is Unuse / 取消使用 and runs `mise unuse <tool>` — reachable only from the version-management section's in-use rows, where a config request always exists; per-version file deletion is Uninstall / 卸载 (`mise uninstall <tool>@<version>`); plugin removal is Uninstall / 卸载 (`mise plugins uninstall <plugin>`). `mise uninstall --all` never enters the GUI — the beta13 batch-operation ban (a product decision owned by `product-logic.md`). The binding rule is that a label always pairs with the command it actually runs: the confirmation dialog's teaching echo must never contradict its button.
- Button labels never end in "…" — the trailing ellipsis is the retired "opens a dialog" convention; buttons read as plain verbs (beta9). The ellipsis stays only where the semantics differ: input placeholders and in-progress copy (loading / busy). Guarded by `npm run lint:i18n-ellipsis`.
- Outdated versions render as the upgrade path: `2026.8.14 → 2026.9.0`, never as raw CLI prose, never as color alone.
- Popovers and menus render inside the app window; never as separate overlay windows.

## Glyphs & icons

- Icons and glyphs must match in size, style, and color.
- The same glyph renders the same everywhere — one span class, one token color; the upgrade-path arrow is always `--flare`.
- Menu/popover triggers carry no caret glyph — expandability is shown by interaction, not by a `▾` or chevron.
- Grandfathered: `›` (Pagination "Next ›") and `←` (back-to-Home link) — text glyphs inside labeled buttons/links, inheriting size and color, are allowed.
- Supersession note: the beta4 decision that the language-switcher chevron must stay as an expand affordance is superseded by beta8's caret removal — do not restore carets citing beta4.

## Floating layers

Popovers and menus — the language switcher, the directory recents menu, and
any future floating surface — share two primitives, each with its own job:
`FloatingMenu` for interactive menus (click), `Tooltip` for non-interactive
value display (hover). These rules keep them consistent; hand-rolling a third
floating layer is a bug.

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

## Verification

Verification rules live in `docs/agents/conventions.md` (Definition of done / Verification loop) — one rule, one home; this document does not restate them (beta9 consolidation).

## Retired vocabulary (hard guardrails)

The hacker-HUD style is retired (visual-language guardrails). In practice this means: section labels carry no prompt glyphs (`▸`); only the section eyebrow is uppercase-tracked mono — every other label, body text, and data is normal case; emphasis comes from color and weight; menu triggers carry no caret glyphs (`▾`, chevron SVGs; removed in beta8). Pair every removal with the positive form above — the goal is mise-family calm, not bareness.
