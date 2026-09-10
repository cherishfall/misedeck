#!/usr/bin/env node
// `npm run lint:css-tracking` — reject hardcoded letter-spacing literals
// in app CSS. The tracking scale lives in `src/tokens.css` (`--tracking-*`,
// derived from docs/design/visual-language.md); every component and page
// must reference those tokens instead of inventing ad-hoc values
// (issue #127).
//
// Allowed without a token: `normal`, `0`, `inherit` / `initial` / `unset`
// (resets — see ui-ux-rules.md "Data honesty" for the reset rule).
//
// `tokens.css` is exempt — it is where the token values are defined.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "src");
const EXEMPT = new Set([join(SRC_DIR, "tokens.css")]);

function listFiles(dir) {
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
      out.push(...listFiles(full));
    } else if (name.endsWith(".css")) {
      out.push(full);
    }
  }
  return out;
}

function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

const DECL_RE = /letter-spacing\s*:\s*([^;}]+)/g;
const ALLOWED_RE = /^\s*(var\(|normal\b|0\b|inherit\b|initial\b|unset\b)/;

function main() {
  /** @type {{file: string, line: number, match: string}[]} */
  const violations = [];

  for (const file of listFiles(SRC_DIR)) {
    if (EXEMPT.has(file)) continue;
    const lines = stripCssComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const decl of line.matchAll(DECL_RE)) {
        if (ALLOWED_RE.test(decl[1])) continue;
        violations.push({ file, line: i + 1, match: decl[0].trim() });
      }
    });
  }

  if (violations.length === 0) {
    console.log("css-tracking OK — no hardcoded letter-spacing literals in src/.");
    process.exit(0);
  }

  console.error("css-tracking check FAILED — hardcoded letter-spacing literals found:");
  for (const v of violations) {
    console.error(`  ${relative(REPO_ROOT, v.file)}:${v.line}  ${v.match}`);
  }
  console.error(
    "\n  Use a tracking token from src/tokens.css (--tracking-*). Resets (normal / 0 / inherit) are allowed.",
  );
  process.exit(1);
}

main();
