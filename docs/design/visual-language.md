# Visual Language

> [简体中文](../../zh-CN/docs/design/visual-language.md)

The design system foundation for MiseDeck's UI. Rewritten in issue #37: the hacker-HUD aesthetic from the first sprint (#33) is retired, and the visual language is now **derived from [mise.jdx.dev](https://mise.jdx.dev)** — MiseDeck reads as part of the mise family in both light and dark themes (product-logic policy 6, "Visual inheritance"). Implemented as tokens in `misedeck/src/tokens.css`; every UI ticket derives colors, type, and motion from here — it never invents new ones.

## Principles

1. **Brand inheritance.** Both themes follow mise.jdx.dev's look: warm parchment light, warm charcoal dark, the wine/rose brand accent. A user coming from the mise site should feel the app is the same product, not a reskin of something else.
2. **Mono is the voice of data.** Versions, paths, commands, logs, and badges are set in JetBrains Mono — the same face the mise site uses for code. Display type carries the editorial serif signature; UI type stays quiet.
3. **Flat and quiet.** Solid surfaces, 1px warm-neutral borders, 8px radius. No glow, no translucency stacking, no animated decoration. Color does the talking.
4. **Two themes from day one.** Dark and light are designed counterparts from the same token slots — never an inversion. Both follow the system preference by default.

## Themes

The theme *setting* is `system` / `light` / `dark` (default `system`), persisted in `localStorage("misedeck.theme")` by the `ThemeProvider` (`src/state/themeContext.tsx`). The *resolved* theme (`light` | `dark`) drives `html[data-theme]`; an inline bootstrap script in `index.html` applies it before first paint so neither theme ever flashes. Token values: dark is the default in `:root`; light overrides live under `[data-theme="light"]`. `color-scheme` is set per theme so native affordances (scrollbars, form controls) match.

## Color

All color is CSS custom properties; components consume semantic names only. The palette values are derived from mise.jdx.dev's custom VitePress theme.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--void` | `#141010` | `#FDF8F3` | app background — warm near-black / parchment |
| `--hull` | `#1C1614` | `#FFFFFF` | panel surface base |
| `--beam` | `#C75B7A` | `#8B2252` | brand accent (mise rose/wine) — active states, focus, links |
| `--ice` | `#9E9288` | `#7D7068` | secondary info — labels, log prefixes, quiet metadata |
| `--flare` | `#C5975B` | `#9A7245` | attention — outdated versions, warnings |
| `--breach` | `#C44536` | `#C44536` | destructive / errors — terracotta |
| `--grove` | `#8FA86E` | `#6B7F4E` | success — installed / ready / ok — olive |
| `--text` | `#EDE6DF` | `#2A1F1A` | primary text |
| `--dim` | `#C9BFB5` | `#5A4D42` | secondary text, inactive icons |

Derived (computed via `color-mix` from the tokens above, never hardcoded):

- `--panel`: solid `hull` — the panel fill
- `--line`: `text` at 16% — default borders and dividers (neutral warm, not accent-tinted)
- `--line-strong`: `text` at 34% — emphasized borders
- `--beam-soft`: `beam` at 60% — accent edges (active nav, primary borders)
- `--tint-{info,success,warning,danger}` + `-bg` variants: tinted borders/washes for state components (Banner, Badge, Panel tones)

Semantic discipline:

- **beam** marks *current state* (active version, selected nav, focus) and carries the brand.
- **flare** marks *actionable drift* (a newer version exists, a warning). Outdated is always rendered as the upgrade path `22.11.0 ▹ 22.20.0`, never as color alone.
- **breach** is only destructive actions and real errors.
- **grove** is only success/ready states.
- No `text-shadow` glow anywhere; emphasis comes from color and weight, not luminescence.

## Typography

| Role | Face | Usage |
|---|---|---|
| Display | Cormorant Garamond 500–600, normal case, no tracking | page titles, the wordmark (italic) |
| UI / nav | Space Grotesk 400–600 | nav items, buttons, prose |
| Data | JetBrains Mono 400–600 | versions, paths, commands, logs, badges, section labels (uppercase, letter-spacing ≈ .18em) |

- The serif display face is the editorial signature of mise.jdx.dev — it is spent on titles and the wordmark only, never on data or controls.
- zh-CN: display text falls back to `Songti SC` / `SimSun` (Chinese serifs), UI text to `PingFang SC` / `system-ui`; Latin data keeps JetBrains Mono.
- Base size 14px, data 11–13px, section labels 10px, display 26px. No fluid type; desktop-app density.
- Section eyebrows read `▸ MISE / TOOLS` — mono, uppercase, tracked, `--ice`.

## Layout

The chrome (sidebar, directory indicator, execution panel placement) is owned by `docs/design/product-logic.md`; this document owns the surfaces inside it.

- Panels: solid `--panel` fill, 1px `--line` border, 8px radius. No backdrop blur, no corner ornament.
- Spacing on a 4px grid; common gaps 14 / 16 / 22 / 26px.
- No background decoration: the app background is a flat `--void`. Elevation (popovers) is a single quiet shadow derived from `--void`.

## Motion

Only two ambient motions exist in the system:

1. Attention pulse on `flare`/`breach` status dots (soft opacity/scale breathing, ~1.6s).
2. Log caret blink (~1.1s steps).

Everything else is a ≤120ms ease-out state change (hover, focus, panel slide). All ambient motion is disabled under `prefers-reduced-motion`. If a screen needs a third ambient animation, the design is wrong, not the rule.

## Guardrails (what keeps this in the mise family)

- No glow effects (text-shadow / box-shadow luminescence), no glassmorphism, no animated gradient lines, no corner brackets — the HUD vocabulary is retired.
- No cool blue-gray palettes; surfaces are warm (parchment / charcoal) in both themes.
- No sci-fi or display gimmick fonts; character comes from the serif display face + mono data.
- No decorative numbering (01/02/03) in product UI, no emoji icons; glyphs are geometric (▸ ▹).
- Light theme is parchment, not a white corporate reskin: warm surfaces, wine accent, taupe secondary text.
