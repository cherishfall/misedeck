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
// from `var(--token)` in CSS files and from string literals in TS/TSX
// (the StyleGuide lists tokens as `var(--…)` strings).

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

  // TS/TSX string literals (e.g. the StyleGuide token table).
  for (const file of listFiles(SRC_DIR, [".ts", ".tsx"])) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(REF_RE)) {
      const files = referenced.get(m[1]) ?? new Set();
      files.add(file);
      referenced.set(m[1], files);
    }
  }

  const dangling = [...referenced.keys()].filter((t) => !defined.has(t)).sort();
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
