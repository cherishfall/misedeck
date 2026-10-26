// Theme bootstrap (#37, #54): read the persisted theme (light / dark,
// default light — fully manual, no system mode) and set
// `html[data-theme]` before first paint, so tokens.css never flashes the
// wrong theme. Values persisted by older builds (`system`, or anything
// unknown) migrate to light. The ThemeProvider
// (`src/state/themeContext.tsx`) takes over after React mounts.
//
// Served verbatim from `public/` and loaded as a classic script in
// `index.html`'s head: a classic head script blocks parsing, so it runs
// before the first paint — the same timing the inline version had. It is
// deliberately not inline: the app ships under `default-src 'self'`
// (src-tauri/tauri.conf.json), which blocks inline `<script>` blocks in
// the bundled build (dev has no CSP, so an inline block only breaks in
// release). Guarded by `npm run lint:csp-inline`.
(function () {
  var theme = "light";
  try {
    var stored = window.localStorage.getItem("misedeck.theme");
    if (stored === "light" || stored === "dark") {
      theme = stored;
    }
  } catch (e) {
    /* storage unavailable — fall back to light */
  }
  document.documentElement.dataset.theme = theme;
})();
