#!/usr/bin/env node
// `npm run lint:page-layout` — keep the page content box in one home.
//
// PageShell's `.main` owns the page's padding, width and centring, so
// every page's title and content start at the same left edge (issue
// #226): a second box — a page-level `max-width`, or an auto margin that
// centres one — is what made Home / Plugins / Doctor sit on their own
// baseline and jump sideways when switching pages.
//
// Four mechanically checkable rules:
//   1. No `.page` rule declares the box (width / max-width / padding /
//      margin). The page root is a vertical stack and nothing else.
//   2. No page stylesheet centres anything with an auto margin — a
//      narrower reading measure, where one is justified, is declared
//      left-aligned inside the shared box, with its reason in a comment.
//   3. A symmetric auto margin (both inline sides `auto`) must come with
//      a definite width (issue #265, V-6): on a flex item auto margins
//      suppress `align-items: stretch`, so the box shrink-wraps to its
//      content and centres itself. `.main` is a flex item in
//      PageShell — without its `width: 100%` a narrow page state (a
//      failed read, an empty list) collapsed into a centred column and
//      the title left baseline moved with the state.
//   4. A data table's declared width floor must fit the default
//      window's content column (issue #265, V-1): a table that declares
//      a `min-width` above it opens the page with a horizontal scroller
//      and clips its trailing Actions column. The budget is derived
//      from the real numbers below, not restated.
//
// `src/tokens.css` is exempt — it is where `--layout-page-max-width` is
// defined, and rules 3–4 read its values.
//
// Consequence for adding a column: a new table column either fits
// inside the budget or the column budget has to be re-cut. The check
// names the arithmetic, so the fix is one number, not an investigation.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "src");
const PAGES_DIR = join(SRC_DIR, "pages");
const TOKENS_FILE = join(SRC_DIR, "tokens.css");
const TAURI_CONF = join(REPO_ROOT, "src-tauri", "tauri.conf.json");
const EXEMPT = new Set([TOKENS_FILE]);

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

/** Read a `--name: <n>px` value out of tokens.css. */
function pxToken(text, name) {
  const match = new RegExp(`--${name}:\\s*([\\d.]+)px`).exec(text);
  return match === null ? null : Number.parseFloat(match[1]);
}

/** The default window's width, from the Tauri config (1200 at v1). */
function defaultWindowWidth() {
  const conf = JSON.parse(readFileSync(TAURI_CONF, "utf8"));
  const width = conf?.app?.windows?.[0]?.width;
  return typeof width === "number" ? width : null;
}

/**
 * The inline space a table inside a page actually gets at the default
 * window (issue #265): window − sidebar − its 1px border, capped by the
 * page box's `max-width`, minus the page's `--space-6` padding on both
 * sides, minus the two classic-scrollbar gutters — PageShell's `.main`
 * (`scrollbar-gutter: stable`) and the table's own `.scroller`. Overlay
 * scrollbars (macOS) give the table those 30px back; a budget that fits
 * here fits everywhere.
 */
function contentColumnBudget(violations) {
  const tokens = readFileSync(TOKENS_FILE, "utf8");
  const nav = pxToken(tokens, "layout-nav-width");
  const pageMax = pxToken(tokens, "layout-page-max-width");
  const pad = pxToken(tokens, "space-6");
  const windowWidth = defaultWindowWidth();
  if (nav === null || pageMax === null || pad === null || windowWidth === null) {
    violations.push(
      "  could not derive the default content column — check --layout-nav-width," +
        " --layout-page-max-width and --space-6 in tokens.css, and app.windows[0].width in tauri.conf.json",
    );
    return null;
  }
  const SCROLLBAR_PX = 15; // Windows classic scrollbar: page gutter + table scroller gutter
  const box = Math.min(windowWidth - nav - 1, pageMax);
  return Math.floor(box - 2 * pad - 2 * SCROLLBAR_PX);
}

/**
 * True when a margin declaration puts `auto` on *both* inline sides —
 * the centring form (`margin: 0 auto`, `margin-inline: auto`). A lone
 * `margin-left: auto` / `margin-right: auto` only right-aligns an item
 * inside a row and is not centring.
 */
function centersWithAutoMargin(prop, value) {
  const tokens = value.split(/\s+/).filter((token) => token.length > 0);
  if (prop === "margin-inline") return tokens[0] === "auto";
  if (prop !== "margin") return false;
  // Expand the 1–4 value shorthand and test the two inline sides.
  const right = tokens.length === 1 ? tokens[0] : tokens[1];
  const left = tokens.length <= 2 ? right : tokens.length === 3 ? tokens[1] : tokens[3];
  return right === "auto" && left === "auto";
}

function main() {
  /** @type {string[]} */
  const violations = [];

  const budget = contentColumnBudget(violations);

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

      // Rule 3: a symmetric auto margin needs a definite width, or the
      // flex item shrink-wraps and centres on a baseline of its own.
      const autoInlineMargin = decls.find(([prop, value]) => centersWithAutoMargin(prop, value));
      const declaresWidth = decls.some(([prop]) => prop === "width" || prop === "inline-size");
      if (autoInlineMargin !== undefined && !declaresWidth) {
        violations.push(
          `  ${where}  "${autoInlineMargin[0]}: ${autoInlineMargin[1]}" without a width — auto inline margins suppress ` +
            "`align-items: stretch` on a flex item, so the box shrink-wraps and a narrow page state sits on its own " +
            "left baseline (issue #265, V-6). Declare `width: 100%` beside it.",
        );
      }

      // Rule 4: a table's width floor must fit the default window's
      // content column.
      if (budget !== null && /\.\w*[Tt]able\b/.test(selector)) {
        for (const [prop, value] of decls) {
          if (prop !== "min-width") continue;
          const floor = Number.parseFloat(value);
          if (!Number.isFinite(floor)) continue;
          if (floor > budget) {
            violations.push(
              `  ${where}  "${selector}" declares "min-width: ${value}" — over the ${budget}px content column at the ` +
                "default 1200×720 window, so the page opens horizontally scrolled and clips its trailing column " +
                "(issue #265, V-1). Trim a column and update the sum in the comment.",
            );
          }
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log(
      `page-layout OK — one page box, declared in PageShell only; table floors fit the ${budget}px content column.`,
    );
    process.exit(0);
  }

  console.error("page-layout check FAILED:");
  for (const v of violations) console.error(v);
  console.error(
    "\n  One page content width and one left baseline, owned by PageShell.module.css `.main` (issues #226, #265).",
  );
  process.exit(1);
}

main();
