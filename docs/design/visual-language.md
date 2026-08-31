# Visual Language

> [简体中文](../../zh-CN/docs/design/visual-language.md)

The design system foundation for MiseDeck's UI. Produced by the design sprint in issue #33 (prototype: `docs/design/tools-page.prototype.html`, screenshots beside it); implemented as tokens and components by #20. Every UI ticket derives colors, type, and motion from here — it never invents new ones.

## Principles

1. **Faithful HUD.** The brief (#9): a sci-fi movie HUD — cool-color glow, translucent panels, luminous lines — executed at Linear-grade polish. The reference blend is JARVIS (electric cyan + amber holograms), not a neon-noir poster.
2. **Mono is the voice of data.** Versions, paths, commands, logs, and labels are set in a monospace face with luminous color — the data itself is the interface's ornament. Display type stays quiet.
3. **One signature, spent once.** The signal line (below) is the single memorable element. Everything around it is disciplined: flat surfaces, 1px borders, restrained glow.
4. **Two themes from day one.** Dark is the primary mood; light is a designed counterpart ("day-shift HUD"), never an inversion. Both come from the same token slots.

## Color

All color is CSS custom properties; components consume semantic names only. Dark values are the default; light overrides live under `[data-theme="light"]`.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--void` | `#04070C` | `#EDF2F7` | app background |
| `--hull` | `#0A1220` | `#FFFFFF` | panel surface base |
| `--beam` | `#3BE2FF` | `#0B8FB8` | primary signal — active states, focus, key data |
| `--ice` | `#7FB3E8` | `#4A6FA5` | secondary info — backends, log prefixes, links |
| `--flare` | `#FFB454` | `#B45309` | attention — outdated versions, warnings |
| `--breach` | `#FF5470` | `#D63B5C` | destructive / errors |
| `--text` | `#DCE9F5` | `#0F1C2B` | primary text |
| `--dim` | `#5F748C` | `#64748B` | secondary text, inactive icons |

Derived (computed via `color-mix` from the tokens above, never hardcoded):

- `--panel`: `hull` at 72% opacity — panel fill over the app background
- `--line`: `beam` at 16% — default borders and dividers
- `--line-strong`: `beam` at 40% — emphasized borders (execution deck, primary buttons)
- `--beam-soft`: `beam` at 60% — glow edges, active accents

Semantic discipline:

- **beam** marks *current state* (active version, selected nav, focus).
- **flare** marks *actionable drift* (a newer version exists, a warning). Outdated is always rendered as the upgrade path `22.11.0 ▹ 22.20.0`, never as color alone.
- **breach** is only destructive actions and real errors.
- Text glows (`text-shadow` with the token at 30–45%) only on luminous data: versions, the page title, command echoes. Body text never glows.

## Typography

| Role | Face | Usage |
|---|---|---|
| Display | Space Grotesk 600, tight tracking | page titles (uppercase, letter-spacing ≈ .14em), the wordmark (letter-spacing ≈ .32em) |
| UI / nav | Space Grotesk 400–500 | nav items, buttons, prose |
| Data | JetBrains Mono 400–600 | versions, paths, commands, logs, badges, section labels (uppercase, letter-spacing ≈ .18–.24em) |

- zh-CN text falls back to `PingFang SC` / `system-ui` for display and UI roles; Latin data (versions, commands) keeps JetBrains Mono.
- Base size 14px, data 11–13px, section labels 10–10.5px. No fluid type; desktop-app density.
- Section eyebrows read like HUD breadcrumbs: `▸ MANAGE / TOOLS`.

## Layout

```
┌──────────────────────────────────────────────┐
│ wordmark · directory context · status chips  │  context bar, 52px
├──────────┬───────────────────────────────────┤
│ nav      │  page head (eyebrow, title, meta) │
│ 196px    │  panels                           │
├──────────┴───────────────────────────────────┤
│ execution deck — command echo + live log     │  docked bottom
└──────────────────────────────────────────────┘
```

- The **execution deck** is docked at the bottom of every page — the product's signature behavior (every mutation shows the exact `mise` command and its streaming output).
- Panels: `--panel` fill, 1px `--line` border, 8px radius, `backdrop-filter` blur. **Corner brackets** (2px `--beam-soft` L-marks, top-left + bottom-right) frame the page's primary panel only — one per screen.
- Spacing on a 4px grid; common gaps 14 / 16 / 22 / 26px.
- The only background decoration: a faint dot grid fading out toward the bottom, plus one soft radial glow at the top. No gradients over content, no noise textures.

## Signature: the signal line

A 1px luminous line (`--line` base) carrying a slow traveling highlight (`--beam` gradient sweep, ~6s linear loop) — a data bus running through the interface. It anchors: the context bar's bottom edge, the execution deck's top edge, the active panel. Paired with the deck's blinking caret, it supplies the "data-flow" feel from the brief.

Rules: always horizontal or a 2px vertical edge tick; never diagonal, never more than one sweep per surface, never combined with other animated decoration.

## Motion

Only three ambient motions exist in the system:

1. Signal-line sweep (~6s linear).
2. Attention pulse on `flare` status dots (soft opacity/scale breathing).
3. Log caret blink (~1.1s steps).

Everything else is a ≤120ms ease-out state change (hover, panel slide). All motion is disabled under `prefers-reduced-motion`. If a screen needs a fourth animation, the design is wrong, not the rule.

## Guardrails (what keeps this from generic AI dark-mode)

- No acid-green-on-black, no purple/pink neon gradients, no glassmorphism stacking.
- No sci-fi display fonts (Orbitron et al.); character comes from mono data + tracking, not from letterforms shouting.
- No decorative numbering (01/02/03), no emoji icons; glyphs are geometric (▸ ◈ ≡ ▹).
- Light theme keeps the HUD grammar (brackets, mono data, tracked labels) on cool paper — not a white corporate reskin.
