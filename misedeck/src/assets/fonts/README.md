# Bundled webfonts

Six files, 152 KiB total. Committed on purpose — see `src/fonts.css` for why.

| File | Family | Subset |
| --- | --- | --- |
| `cormorant-garamond-latin.woff2` | Cormorant Garamond | latin |
| `cormorant-garamond-latin-ext.woff2` | Cormorant Garamond | latin-ext |
| `space-grotesk-latin.woff2` | Space Grotesk | latin |
| `space-grotesk-latin-ext.woff2` | Space Grotesk | latin-ext |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | latin |
| `jetbrains-mono-latin-ext.woff2` | JetBrains Mono | latin-ext |

All three families are **variable** fonts, so one file per family+subset
covers every weight the UI uses (400 / 500 / 600). CJK is not bundled: the
UI's Chinese text falls through to the platform stack in `--font-ui`
(PingFang SC / Microsoft YaHei / Noto Sans CJK SC).

## Source

Downloaded once from the Google Fonts CSS API with a modern user agent
(`?family=…&display=swap`), latin + latin-ext subsets only. To regenerate,
request the same query and keep the `latin` / `latin-ext` blocks; the
`@font-face` weight ranges in `src/fonts.css` come from each family's
published axis range.

- Cormorant Garamond — https://fonts.google.com/specimen/Cormorant+Garamond
- Space Grotesk — https://fonts.google.com/specimen/Space+Grotesk
- JetBrains Mono — https://fonts.google.com/specimen/JetBrains+Mono

## Licence

All three families are licensed under the **SIL Open Font License 1.1**,
which permits bundling and redistribution with software. The full licence
text lives with each upstream project (linked above); the OFL requires the
copyright notice and licence to travel with the font files, so this file is
part of that notice.

They are *not* covered by MiseDeck's own licence (see the repository
`LICENSE`), and they may not be sold on their own.
