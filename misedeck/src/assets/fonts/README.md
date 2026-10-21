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
which permits bundling and redistribution with software. The OFL requires
the copyright notice and licence to travel with the font files, so the full
licence text for each family ships in the app bundle under `public/fonts/`
(copied to `dist/fonts/` by Vite; served at `/fonts/…`):

| Font | Licence file | Required copyright line |
| --- | --- | --- |
| Cormorant Garamond | [`OFL-CormorantGaramond.txt`](../../../public/fonts/OFL-CormorantGaramond.txt) | Copyright 2015 The Cormorant Project Authors (github.com/CatharsisFonts/Cormorant) |
| Space Grotesk | [`OFL-SpaceGrotesk.txt`](../../../public/fonts/OFL-SpaceGrotesk.txt) | Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk) |
| JetBrains Mono | [`OFL-JetBrainsMono.txt`](../../../public/fonts/OFL-JetBrainsMono.txt) | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) |

The copyright lines above are the ones embedded in the fonts' `name` tables,
so they match the files that are actually bundled.

They are *not* covered by MiseDeck's own licence (see the repository
`LICENSE`), and they may not be sold on their own.
