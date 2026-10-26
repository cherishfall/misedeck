#!/usr/bin/env node
// `npm run lint:csp-inline` — keep the bundled app's inline code out of
// the CSP's way (issue #290).
//
// The app ships under `default-src 'self'`
// (src-tauri/tauri.conf.json), so the *parsed* inline forms are refused in
// a release build while dev — which serves through Vite's devUrl and gets
// no CSP at all — never shows the failure. Measured in WKWebView (the
// Tauri macOS runtime) and Chromium, production React 19 bundle:
//
//   blocked   <script>…</script>, <style>…</style>, style="…" attributes,
//             el.setAttribute("style", …)
//   allowed   React's `style={{…}}` prop and `el.style.foo = …` (both
//             apply through the CSSOM), and CSSOM custom properties
//
// So the guard checks exactly the blocked half:
//   1. `index.html` carries no inline <script>, <style>, or style attribute.
//   2. `src/**` never reaches the parsed-attribute path
//      (`setAttribute("style", …)`, `cssText`) or `insertRule` (CSP ties
//      CSSOM rule insertion to 'unsafe-eval').
//
// The allowed forms are the mechanism, not a loophole: the execution
// panel's height, the table column widths, and the floating layers'
// coordinates all go through React's style prop.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(ROOT, "src");
const INDEX_HTML = join(ROOT, "index.html");

/** Inline forms the release CSP refuses inside index.html. */
const HTML_BANS: Array<{ pattern: RegExp; detail: string }> = [
  {
    pattern: /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i,
    detail: "inline <script> — move it to public/ and reference it with src",
  },
  {
    pattern: /<style\b/i,
    detail: "inline <style> — put the rules in a CSS module or tokens.css",
  },
  {
    pattern: /\sstyle\s*=\s*["']/i,
    detail: 'style="…" attribute — blocked as style-src-attr',
  },
];

/** Inline forms the release CSP refuses inside src/. */
const TS_BANS: Array<{ pattern: RegExp; detail: string }> = [
  {
    pattern: /\bsetAttribute\(\s*["'`]style["'`]/,
    detail:
      "setAttribute(\"style\", …) — the parsed-attribute path CSP blocks; " +
      "use the React style prop or a CSS class",
  },
  {
    pattern: /\.cssText\b/,
    detail: "cssText assignment — CSP ties it to 'unsafe-eval'",
  },
  {
    pattern: /\.insertRule\(/,
    detail: "CSSOM insertRule — CSP ties it to 'unsafe-eval'",
  },
];

function listSource(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".vite") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSource(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const failures: string[] = [];

const rawHtml = readFileSync(INDEX_HTML, "utf8");
// Comments are prose, not markup — and they legitimately name the forms
// this guard bans. Blank them out without moving any line.
const html = rawHtml.replace(/<!--[\s\S]*?-->/g, (comment) =>
  comment.replace(/[^\n]/g, " "),
);
for (const { pattern, detail } of HTML_BANS) {
  const match = pattern.exec(html);
  if (match !== null) {
    const line = html.slice(0, match.index).split("\n").length;
    failures.push(`index.html:${line}: ${detail}`);
  }
}

for (const file of listSource(SRC_DIR)) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).split(sep).join("/");
  for (const { pattern, detail } of TS_BANS) {
    const match = pattern.exec(text);
    if (match === null) continue;
    const line = text.slice(0, match.index).split("\n").length;
    failures.push(`${rel}:${line}: ${detail}`);
  }
}

if (failures.length > 0) {
  console.error(
    "csp-inline check FAILED — the app ships under `default-src 'self'`; " +
      "these forms only fail in a release build.",
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\n  React's style prop and `el.style.foo = …` apply through the CSSOM " +
      "and stay allowed — only the parsed inline forms are blocked.",
  );
  process.exit(1);
}

console.log(
  "csp-inline check OK — no inline script/style/attribute on the CSP path.",
);
