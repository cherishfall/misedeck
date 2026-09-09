# Visual Language

> [简体中文](../../zh-CN/docs/design/visual-language.md)

The design system foundation for MiseDeck's UI. Rewritten in issue #37: the hacker-HUD aesthetic from the first sprint (#33) is retired, and the visual language is now **derived from [mise.jdx.dev](https://mise.jdx.dev)** — MiseDeck reads as part of the mise family in both light and dark themes (product-logic policy 6, "Visual inheritance"). Implemented as tokens in `misedeck/src/tokens.css`; every UI ticket derives colors, type, and motion from here — it never invents new ones.

## Principles

1. **Brand inheritance.** Both themes follow mise.jdx.dev's look: warm parchment light, warm charcoal dark, the wine/rose brand accent. A user coming from the mise site should feel the app is the same product, not a reskin of something else.
2. **Mono is the voice of data.** Versions, paths, commands, logs, and badges are set in JetBrains Mono — the same face the mise site uses for code. Display type carries the editorial serif signature; UI type stays quiet.
3. **Flat and quiet.** Solid surfaces, 1px warm-neutral borders, 8px radius. No glow, no translucency stacking, no animated decoration. Color does the talking.
4. **Two themes from day one.** Dark and light are designed counterparts from the same token slots — never an inversion. The toggle is a two-state light/dark switch (default light), fully manual.

## Themes

The theme *setting* is `light` / `dark` (default `light`, fully manual — no system mode), persisted in `localStorage("misedeck.theme")` by the `ThemeProvider` (`src/state/themeContext.tsx`). The *resolved* theme (`light` | `dark`) drives `html[data-theme]`; an inline bootstrap script in `index.html` applies it before first paint so neither theme ever flashes. Token values: dark is the default in `:root`; light overrides live under `[data-theme="light"]`. `color-scheme` is set per theme so native affordances (scrollbars, form controls) match.

## Color

All color is CSS custom properties; components consume semantic names only. The palette values are derived from mise.jdx.dev's custom VitePress theme.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--void` | `#141010` | `#FDF8F3` | app background — warm near-black / parchment |
| `--hull` | `#1C1614` | `#F5EDE3` | chrome: sidebar (the panel base) |
| `--hull-soft` | `#1F1816` | `#F0E6DA` | chrome: top toolbar |
| `--hull-deep` | `#261E1A` | `#E8DDD0` | chrome: execution deck |
| `--panel` | `#221C1A` | `#F8F0E2` | elevated surface: popover / dialog / banner / panel |
| `--beam` | `#C75B7A` | `#8B2252` | brand accent (mise rose/wine) — active states, focus, links |
| `--ice` | `#9E9288` | `#7D7068` | secondary info — labels, log prefixes, quiet metadata |
| `--flare` | `#C5975B` | `#9A7245` | attention — outdated versions, warnings |
| `--breach` | `#C44536` | `#C44536` | destructive / errors — terracotta |
| `--grove` | `#8FA86E` | `#6B7F4E` | success — installed / ready / ok — olive |
| `--text` | `#EDE6DF` | `#2A1F1A` | primary text |
| `--dim` | `#C9BFB5` | `#5A4D42` | secondary text, inactive icons |

Derived (computed via `color-mix` from the tokens above, never hardcoded):

- `--panel` is its own warm elevated value, distinct from `--hull`, sitting *between* `--void` and `--hull` in both themes (light `#F8F0E2`, dark `#221C1A`). Elevation is carried by both shadow (the lift) and a distinguishable warm tint (the identity): a raised surface must read as separate from both the page and the chrome, so it neither merges into the void nor sinks into the sidebar. Consumed by FloatingMenu (popover), ConfirmDialog, Banner, Panel, and the Tasks/Doctor/Tools cards.
- The chrome surfaces form a three-level warm hierarchy, all derived from mise's warm parchment / charcoal family:
  - `--hull` — sidebar (the middle weight).
  - `--hull-soft` — top toolbar, the lightest chrome (mise `bg-alt` role).
  - `--hull-deep` — execution deck, the deepest chrome (mise `bg-mute` role); data settles inward.
- `--line`: `text` at 16% — default borders and dividers (neutral warm, not accent-tinted)
- `--line-strong`: `text` at 34% — emphasized borders
- `--beam-soft`: `beam` at 60% — accent edges (active nav, primary borders)
- `--tint-{info,success,warning,danger}` + `-bg` variants: tinted borders/washes for state components (Banner, Badge, Panel tones)

Semantic discipline:

- **beam** marks *current state* (active version, selected nav, focus) and carries the brand.
- **flare** marks *actionable drift* (a newer version exists, a warning). This document owns only the color semantic; how outdated versions render (the upgrade-path glyph) is bound in `ui-ux-rules.md`.
- **breach** is only destructive actions and real errors.
- **grove** is only success/ready states.
- No `text-shadow` glow anywhere; emphasis comes from color and weight, not luminescence.

## Typography

| Role | Face | Usage |
|---|---|---|
| Display | Cormorant Garamond 500–600, normal case, no tracking | page titles, the wordmark (italic) |
| UI / nav | Space Grotesk 400–600 | nav items, buttons, prose |
| Data | JetBrains Mono 400–600 | versions, paths, commands, logs, badges |
| Eyebrow | JetBrains Mono 400–600, uppercase, letter-spacing ≈ .18em, `--ice` | mode/section labels only (the toolbar mode indicator); Latin-only — zh-CN eyebrows drop uppercase and tracking |

- The serif display face is the editorial signature of mise.jdx.dev — it is spent on titles and the wordmark only, never on data or controls.
- zh-CN: display text falls back to `Songti SC` / `SimSun` (Chinese serifs), UI text to `PingFang SC` / `system-ui`; Latin data keeps JetBrains Mono.
- Base size 14px (`--size-base`), data exactly 12px (`--size-data` — a single value, not a range), eyebrows 10px (`--size-label`) as standalone decoration, display 26px (`--size-display`). No fluid type; desktop-app density.
- Page-header eyebrows (`MISE / X` above the display title) are retired (beta9): the sidebar already marks the current page and the display title names it, so the row was pure duplication — mise.jdx.dev's eyebrow names a section inside one long page, a role MiseDeck's per-page titles already fill. The eyebrow survives as the toolbar's mode label (`当前目录 / Global mode`) and as standalone decoration (empty states); because the toolbar label shares a baseline with 12px controls it renders at `--size-data` — eyebrow-styled (mono, `--ice`, Latin uppercase + tracking) but never below the shared-line floor (`ui-ux-rules.md` visual balance). zh-CN eyebrows render with `letter-spacing: normal` — CJK has no uppercase and wide tracking scatters Han glyphs; the mono face and `--ice` carry the role there.
- A section label names a section once: never repeat a label inside that page's cards, never stack identical labels down one page.

## Layout

The chrome (sidebar, directory indicator, execution panel placement) is owned by `docs/design/product-logic.md`; this document owns the surfaces inside it.

- Panels: solid `--panel` fill, 1px `--line` border, 8px radius. No backdrop blur, no corner ornament.
- Spacing comes from the `--space-*` scale (2 / 4 / 6 / 8 / 10 / 12 / 14 / 16 / 22 / 26px; half-step indices slot between base steps, e.g. `--space-1-5` = 6px) — the scale is the source of truth; there is no arithmetic grid beneath it. Hardcoded px paddings/margins/gaps are rejected by `npm run lint:css-spacing`.
- No background decoration: the app background is a flat `--void`. Elevation (popovers) is a single quiet shadow derived from `--void`.

## Motion

Only two ambient motions exist in the system:

1. Attention pulse on `flare`/`breach` status dots (soft opacity/scale breathing, ~1.6s).
2. Log caret blink (~1.1s steps).

Everything else is a ≤120ms ease-out state change (hover, focus, panel slide). All ambient motion is disabled under `prefers-reduced-motion`. If a screen needs a third ambient animation, the design is wrong, not the rule.

## Guardrails (what keeps this in the mise family)

- No glow effects (text-shadow / box-shadow luminescence), no glassmorphism, no animated gradient lines, no corner brackets — the HUD vocabulary is retired.
- Borders are solid — no dashed or dotted borders anywhere.
- No cool blue-gray palettes; surfaces are warm (parchment / charcoal) in both themes.
- No sci-fi or display gimmick fonts; character comes from the serif display face + mono data.
- No decorative numbering (01/02/03) in product UI, no emoji icons; the only decorative glyph is → (used in upgrade paths).
- Light theme is parchment, not a white corporate reskin: warm surfaces, wine accent, taupe secondary text.

### Chrome surface hierarchy (issue #78)

The three chrome panels and the elevated surfaces are mapped by *role* from mise.jdx.dev's published palette, but not copied verbatim:

- **Elevated surfaces (`--panel`) deliberately do not take mise's `--vp-c-bg-elv` exact values.** Its light `#FFFFFF` is a neutral white (off the warm family) and its dark `#202127` is a blue-grey (blue > red, off-brand). Instead `--panel` uses warm values that sit *between* page and sidebar so a floating surface stays distinguishable from both — shadow carries the lift, color carries the identity.
- **Dark `--hull-soft` (top toolbar) deviates from mise's `bg-alt` (`#161618`).** At mise's ~50px decorative nav strip that near-black is invisible-but-fine; MiseDeck's top toolbar is a ~22px functional chrome bar that needs to read as a distinct surface, so its dark value is lifted to `#1F1816` — still within the warm charcoal family, no new hue. The light value follows mise's `bg-alt` role.
- The hierarchy stays inside the warm parchment / warm charcoal family throughout; no new hue is introduced.
