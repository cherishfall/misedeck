#!/usr/bin/env node
// `npm run lint:css-tokens` — enforce that every `var(--token)` referenced
// in the app resolves to a token that is actually defined. A dangling
// reference fails silently in the browser (the whole declaration is
// dropped), which is how the TasksPage shipped with broken padding,
// colors, and radii (issue #35). This check makes that class of bug a
// build error.
//
// Definitions are collected from every `--token: <value>` declaration in
// `src/**/*.css` (tokens.css is the source of truth, but component CSS may
// legitimately declare local custom properties). References are collected
// from `var(--token)` in CSS files and from string literals in TS/TSX.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "src");

function listFiles(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".vite") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full, exts));
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

const DEF_RE = /(--[A-Za-z][A-Za-z0-9_-]*)\s*:/g;
const REF_RE = /var\(\s*(--[A-Za-z][A-Za-z0-9_-]*)/g;

/**
 * Font-stack integrity (issue #246).
 *
 * `--font-mono`'s first entry is not cosmetic: `src/utils/paths.ts`
 * derives every path column's character budget from a 0.6em advance,
 * which is JetBrains Mono's. Bundling the font (issue #241) is what makes
 * that constant true on macOS, Windows and Linux alike — so the first
 * entry must stay the bundled family, and `fonts.css` must actually ship
 * the file it points at. A CSS-only rename would otherwise reintroduce
 * the ~2-character overstatement Windows had with Consolas.
 */
function checkFontStacks() {
  const failures = [];
  let tokens;
  let fonts;
  try {
    tokens = readFileSync(join(SRC_DIR, "tokens.css"), "utf8");
    fonts = readFileSync(join(SRC_DIR, "fonts.css"), "utf8");
  } catch {
    failures.push("src/tokens.css or src/fonts.css is missing (font stacks cannot be checked)");
    return failures;
  }

  const bundled = new Set(
    [...fonts.matchAll(/font-family:\s*"([^"]+)"/g)].map((m) => m[1]),
  );
  if (bundled.size === 0) {
    failures.push("src/fonts.css declares no @font-face families — did the webfonts move?");
  }

  for (const [token, family] of [
    ["--font-mono", "JetBrains Mono"],
    ["--font-ui", "Space Grotesk"],
    ["--font-display", "Cormorant Garamond"],
  ]) {
    const decl = new RegExp(`${token}:\\s*([^;]+);`).exec(stripCssComments(tokens));
    if (!decl) {
      failures.push(`${token} is not declared in src/tokens.css`);
      continue;
    }
    const first = decl[1].trim().split(",")[0].replace(/["']/g, "").trim();
    if (first !== family) {
      failures.push(
        `${token} starts with "${first}", but the bundled family is "${family}" — the first entry must be the bundled face`,
      );
    }
    if (!bundled.has(first)) {
      failures.push(`${token} names "${first}" first, but src/fonts.css does not bundle it`);
    }
  }

  for (const m of fonts.matchAll(/url\("([^"]+)"\)/g)) {
    const file = join(SRC_DIR, m[1].replace(/^\.\//, ""));
    try {
      statSync(file);
    } catch {
      failures.push(`src/fonts.css references a missing file: ${m[1]}`);
    }
  }

  return failures;
}

function main() {
  const defined = new Set();
  /** @type {Map<string, Set<string>>} token → files that reference it */
  const referenced = new Map();

  for (const file of listFiles(SRC_DIR, [".css"])) {
    const text = stripCssComments(readFileSync(file, "utf8"));
    for (const m of text.matchAll(DEF_RE)) defined.add(m[1]);
    for (const m of text.matchAll(REF_RE)) {
      const files = referenced.get(m[1]) ?? new Set();
      files.add(file);
      referenced.set(m[1], files);
    }
  }

  // TS/TSX string literals.
  for (const file of listFiles(SRC_DIR, [".ts", ".tsx"])) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(REF_RE)) {
      const files = referenced.get(m[1]) ?? new Set();
      files.add(file);
      referenced.set(m[1], files);
    }
  }

  const dangling = [...referenced.keys()].filter((t) => !defined.has(t)).sort();
  const fontFailures = checkFontStacks();
  if (fontFailures.length > 0) {
    console.error("css-tokens check FAILED — font stack integrity:");
    for (const failure of fontFailures) console.error(`  - ${failure}`);
    console.error(
      "\n  The bundled families live in src/fonts.css; the first entry of --font-mono must stay",
    );
    console.error("  JetBrains Mono (utils/paths.ts hardcodes its 0.6em advance, issue #246).");
    process.exit(1);
  }
  if (dangling.length === 0) {
    console.log(
      `css-tokens OK — ${referenced.size} referenced token(s), all defined (${defined.size} definition(s) found).`,
    );
    process.exit(0);
  }

  console.error("css-tokens check FAILED — these var(--*) references resolve to nothing:");
  for (const token of dangling) {
    console.error(`\n  ${token}`);
    for (const file of [...referenced.get(token)].sort()) {
      console.error(`    referenced in ${relative(REPO_ROOT, file)}`);
    }
  }
  console.error(
    "\n  Map the reference to an existing token in src/tokens.css, or add the token there.",
  );
  process.exit(1);
}

main();
