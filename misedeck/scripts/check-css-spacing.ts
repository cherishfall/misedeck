#!/usr/bin/env node
// `npm run lint:css-spacing` — reject hardcoded px literals in
// padding/margin/gap declarations in app CSS. The spacing scale lives in
// `src/tokens.css` (`--space-*`, derived from docs/design/visual-language.md);
// every component and page must reference those tokens instead of inventing
// ad-hoc values (issue #126).
//
// Exemptions (documented in ui-ux-rules.md): 1px borders and 4px
// small-element radius — neither is a padding/margin/gap property, so this
// check needs no value exemptions. `0` is unitless and always allowed.
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

// padding / margin / gap and their longhands (padding-top, margin-inline,
// row-gap, …). The value is captured up to the terminating `;` and scanned
// for px literals.
const DECL_RE =
  /(?:^|[;{])\s*(?:row-|column-)?(?:padding|margin|gap)(?:-[a-z-]+)?\s*:\s*([^;}]+)/g;
const PX_RE = /(\d+(?:\.\d+)?)px\b/g;

function main() {
  /** @type {{file: string, line: number, match: string}[]} */
  const violations = [];

  for (const file of listFiles(SRC_DIR)) {
    if (EXEMPT.has(file)) continue;
    const lines = stripCssComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const decl of line.matchAll(DECL_RE)) {
        for (const px of decl[1].matchAll(PX_RE)) {
          if (Number.parseFloat(px[1]) === 0) continue;
          violations.push({ file, line: i + 1, match: decl[0].trim() });
          break;
        }
      }
    });
  }

  if (violations.length === 0) {
    console.log("css-spacing OK — no hardcoded spacing px literals in src/.");
    process.exit(0);
  }

  console.error("css-spacing check FAILED — hardcoded spacing literals found:");
  for (const v of violations) {
    console.error(`  ${relative(REPO_ROOT, v.file)}:${v.line}  ${v.match}`);
  }
  console.error(
    "\n  Use a spacing token from src/tokens.css (--space-*). Documented exemptions: 1px borders, 4px small-element radius.",
  );
  process.exit(1);
}

main();
