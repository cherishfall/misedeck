# Site + README feedback cycle — 2026-11-19

Owner reviewed the landing page after the review loop shipped (v1.0.6 live) and
reported five problems. All fixed in this cycle. No GitHub issue was filed for
them; this document is the record.

## What the owner reported, and what was done

1. **The site's icon was not the app's icon.** The landing page and changelog
   carried a placeholder "M" mark (`icon.svg`, a data-URI favicon). Both pages
   now use `icon.png`, copied from the app's own `src-tauri/icons/128x128@2x.png`
   (256 px), for the favicon, apple-touch-icon, header brand, and hero.
   `icon.svg` is deleted. The changelog generator's template was updated with
   the same head, so regeneration cannot resurrect the placeholder.
2. **Screenshot order followed nothing in particular.** The site showed
   tools → env → overview → doctor (no Home, no Plugins). The section now shows
   nine shots in the app's navigation order: Home, Overview, Tools,
   Tools · version management, Env, Tasks, Plugins, Doctor, Settings — Home
   first, reading left-to-right, top-to-bottom.
3. **The Tools page deserved more than one shot.** The version-management view
   (active / installed / not-installed, per-version actions) is the app's
   signature flow. Captured fresh for go on this machine, added to the site and
   the README screenshot table (`tools-versions-{en,zh-CN}`).
4. **No way to see a screenshot full size.** Every shot frame is now a button
   that opens a native `<dialog>` lightbox (`showModal()`, `closedby="any"`
   light dismiss with a pointer-position fallback for Safari, scroll
   containment per the dialog guides, `autofocus` on Close, caption cloned at
   open time so the language toggle needs no extra wiring).
5. **The screenshots were 1.0.3-era.** All 16 README PNGs and all 17 site webps
   re-captured from the running 1.0.6 app (the debug binary rebuilt at 1.0.6;
   the old binary predated the version bump by one minute).

Copy pass on the landing page and both READMEs, applying the `i-have-adhd`
principles (answer first, no recaps, concrete numbers) plus ordinary product
copy discipline: the README's changelog-style status blockquote is compressed
to one status sentence + platform state + a link to the release notes; the
landing page's longest FAQ answer is split into scannable sentences with the
facts intact; a zh spacing slip (`mise use过的`) fixed.

## Rules codified (AGENTS.md, en + zh, public-site section)

- The site keeps saying the **app's real icon** (`icon.png` copied from
  `src-tauri/icons`, never a placeholder mark).
- Screenshots sit in the **app's navigation order, Home first**; a feature the
  site singles out carries its own capture.

## README ↔ landing page cross-links

- README + zh README carry a top nav line: `Landing page · Changelog` (the
  "Website" section keeps the long-form link). Mirrors the owner's PageMask
  repo, whose README leads with its landing page.
- `gh repo edit cherishfall/mise-deck --homepage` + bilingual description, again
  matching the PageMask About pattern (done after the push; recorded in the
  session report).

## Capture-harness lessons (re-create if another visual pass is needed)

- The harness from the review loop was rebuilt: temporary `src/__shotSeed.ts`
  (imported first in `main.tsx`) reads `public/shot.json` with a **synchronous
  XHR** (so language/theme are in place before i18next and the router init —
  no reload, one mount) and runs capture actions after mount; the window size
  is temporarily set to 1280×861 in `tauri.conf.json` and the debug binary
  rebuilt; the Vite dev server serves `shot.json` fresh per request. All
  temporary files restored after the pass; `npm run ci` green on the restored
  tree.
- **screencapture can silently write nothing**: when the captured app is a
  grandchild of the sandboxed shell (launched inside a script), a
  `screencapture -l<winid>` into the repo's `docs/screenshots/` returns 0 and
  writes no file, while the same capture into `/tmp` works and an inline shell
  capture into `docs/` works too. The failure mode looked like "the app
  reports version 1.0.3" — it was the stale November 18 file being re-cropped
  over and over, because the target file already existed and mtime was never
  checked. Rule: capture to `/tmp/<name>.png`, verify mtime/size, then copy
  into the repo — and never diagnose a screenshot pipeline without checking
  the output file's mtime first.
- Kill **every** MiseDeck instance before each capture, including the
  installed `/Applications` copy, and wait until zero remain: a stale debug
  instance from an older build loads the current Vite UI through devUrl but
  answers `getVersion()` from its own old binary.

## Proactive sweep (same class, adjacent)

Checked against the live site and code, clean:

- Version chip: `v1.0.6`, matches the latest published release (the generator
  asserts it).
- Install file names: generated from the release assets (1.0.6 set) ✓.
- Changelog: regenerated this cycle from the current generator; 22 releases,
  bilingual splitting intact, no `icon.svg` reference left ✓.
- og:image points at a fresh capture (tools.webp, re-converted this cycle);
  dimensions still 1920×1292 ✓.
- Site palette/typography untouched — tokens remain the app's
  (visual-language.md) ✓; site copy follows CONTEXT.md vocabulary (Use / 卸载 /
  Unuse / Config file …) ✓; new captions use it too.
- Landing FAQ claims still match the app's behavior (two outbound requests,
  no bundling, unsigned builds) — verified against the app README §Known
  limitations ✓.
- The eight-page feature grid on the landing page matches the app's pages and
  commands ✓ (the Tools card command list unchanged).
- README screenshot table order was already navigation order; it gains the
  tools-versions row in position ✓.
