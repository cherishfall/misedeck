#!/usr/bin/env node
// `npm run lint:page-layout` — keep the page content box in one home.
//
// PageShell's `.main` owns the page's padding, width and centring, so
// every page's title and content start at the same left edge (issue
// #226): a second box — a page-level `max-width`, or an auto margin that
// centres one — is what made Home / Plugins / Doctor sit on their own
// baseline and jump sideways when switching pages.
//
// Two mechanically checkable rules:
//   1. No `.page` rule declares the box (width / max-width / padding /
//      margin). The page root is a vertical stack and nothing else.
//   2. No page stylesheet centres anything with an auto margin — a
//      narrower reading measure, where one is justified, is declared
//      left-aligned inside the shared box, with its reason in a comment.
//
// `src/tokens.css` is exempt — it is where `--layout-page-max-width` is
// defined.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "src");
const PAGES_DIR = join(SRC_DIR, "pages");
const EXEMPT = new Set([join(SRC_DIR, "tokens.css")]);

const BOX_PROPS = ["width", "max-width", "padding", "margin"];

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
  return text.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** Declarations of a block, as `[property, value]` pairs. */
function declarations(block) {
  return block
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .map((d) => {
      const at = d.indexOf(":");
      return at === -1 ? null : [d.slice(0, at).trim(), d.slice(at + 1).trim()];
    })
    .filter((d) => d !== null);
}

function main() {
  /** @type {string[]} */
  const violations = [];

  for (const file of listFiles(SRC_DIR)) {
    if (EXEMPT.has(file)) continue;
    // Remove comments so a documented reason never reads as a violation.
    const text = stripCssComments(readFileSync(file, "utf8"));
    const where = relative(REPO_ROOT, file);

    for (const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim();
      const decls = declarations(rule[2]);

      // Rule 1: `.page` must not declare the content box.
      const isPageRule = /(^|[\s,])(\.page)(\s|,|$|[:.])/.test(selector);
      if (isPageRule) {
        for (const [prop, value] of decls) {
          if (BOX_PROPS.some((p) => prop === p || prop.startsWith(`${p}-`))) {
            violations.push(
              `  ${where}  .page declares "${prop}: ${value}" — the page box belongs to PageShell's .main`,
            );
          }
        }
      }

      // Rule 2: no page stylesheet centres a box of its own.
      if (file.startsWith(PAGES_DIR)) {
        for (const [prop, value] of decls) {
          if (/^margin(-[a-z-]+)?$/.test(prop) && /(^|\s)auto(\s|$)/.test(value)) {
            violations.push(
              `  ${where}  "${prop}: ${value}" — a page centres nothing itself; the shared box is PageShell's .main`,
            );
          }
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log("page-layout OK — one page box, declared in PageShell only.");
    process.exit(0);
  }

  console.error("page-layout check FAILED:");
  for (const v of violations) console.error(v);
  console.error(
    "\n  One page content width and one left baseline, owned by PageShell.module.css `.main` (issue #226).",
  );
  process.exit(1);
}

main();
