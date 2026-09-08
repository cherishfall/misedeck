#!/usr/bin/env node
// `npm run lint:css-font-size` — reject hardcoded font-size px/rem literals
// in app CSS. The type scale lives in `src/tokens.css` (`--size-display` /
// `--size-base` / `--size-data` / `--size-label`, derived from
// docs/design/visual-language.md); every component and page must reference
// those tokens instead of inventing ad-hoc sizes (issue #116).
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

const LITERAL_RE = /font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)\b/g;

function main() {
  /** @type {{file: string, line: number, match: string}[]} */
  const violations = [];

  for (const file of listFiles(SRC_DIR)) {
    if (EXEMPT.has(file)) continue;
    const lines = stripCssComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(LITERAL_RE)) {
        violations.push({ file, line: i + 1, match: m[0].trim() });
      }
    });
  }

  if (violations.length === 0) {
    console.log("css-font-size OK — no hardcoded font-size px/rem literals in src/.");
    process.exit(0);
  }

  console.error("css-font-size check FAILED — hardcoded font-size literals found:");
  for (const v of violations) {
    console.error(`  ${relative(REPO_ROOT, v.file)}:${v.line}  ${v.match}`);
  }
  console.error(
    "\n  Use a type token from src/tokens.css (--size-display / --size-base / --size-data / --size-label).",
  );
  process.exit(1);
}

main();
