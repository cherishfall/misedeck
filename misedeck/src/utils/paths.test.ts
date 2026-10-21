// Tests for the shared path comparison helpers (issue #159).
// Run via `npm run test` (node:test through tsx — no extra framework).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ENV_VALUE_CELL_CHARS,
  SOURCE_CELL_CHARS,
  columnCharBudget,
  isPathUnder,
  normalizePathForCompare,
  shortenPathTail,
} from "./paths";

test("isPathUnder: forward-slash child under forward-slash parent", () => {
  assert.equal(isPathUnder("/Users/dev/proj", "/Users/dev/proj/mise.toml"), true);
});

test("isPathUnder: Windows backslash paths (the beta11 4.2-M4 bug)", () => {
  assert.equal(
    isPathUnder("C:\\Users\\dev\\proj", "C:\\Users\\dev\\proj\\mise.toml"),
    true,
  );
  // The whole point of the ticket: backslash paths must not all fall
  // through to "global".
  assert.equal(isPathUnder("C:\\Users\\dev\\proj", "C:\\Users\\dev\\other\\mise.toml"), false);
});

test("isPathUnder: mixed separators match", () => {
  assert.equal(isPathUnder("C:\\Users/dev\\proj", "C:/Users/dev/proj/mise.toml"), true);
  assert.equal(isPathUnder("/Users/dev/proj", "\\Users\\dev\\proj\\mise.toml"), true);
});

test("isPathUnder: exact match counts as under (cwd's own mise.toml)", () => {
  assert.equal(isPathUnder("/Users/dev/proj", "/Users/dev/proj"), true);
  assert.equal(isPathUnder("/Users/dev/proj/", "/Users/dev/proj"), true);
});

test("isPathUnder: trailing slash on the parent is harmless (both separators)", () => {
  assert.equal(isPathUnder("/Users/dev/proj/", "/Users/dev/proj/mise.toml"), true);
  assert.equal(isPathUnder("C:\\Users\\dev\\proj\\", "C:\\Users\\dev\\proj\\mise.toml"), true);
});

test("isPathUnder: segment-aware — a sibling sharing a name prefix is not under", () => {
  assert.equal(isPathUnder("/foo/bar", "/foo/barbaz/mise.toml"), false);
  assert.equal(isPathUnder("C:\\foo\\bar", "C:\\foo\\barbaz\\mise.toml"), false);
});

test("isPathUnder: case folding by default (macOS / Windows volumes)", () => {
  assert.equal(isPathUnder("/Users/Dev/Proj", "/users/dev/proj/mise.toml"), true);
  assert.equal(isPathUnder("C:\\Users\\Dev", "c:\\users\\dev\\mise.toml"), true);
});

test("isPathUnder: caseSensitive option preserves Linux semantics", () => {
  assert.equal(
    isPathUnder("/Users/Dev", "/users/dev/mise.toml", { caseInsensitive: false }),
    false,
  );
  assert.equal(
    isPathUnder("/Users/dev", "/Users/dev/mise.toml", { caseInsensitive: false }),
    true,
  );
});

test("isPathUnder: filesystem roots", () => {
  assert.equal(isPathUnder("/", "/etc/mise/config.toml"), true);
  assert.equal(isPathUnder("/", "/"), true);
  assert.equal(isPathUnder("C:\\", "C:\\Users\\dev\\mise.toml"), true);
  assert.equal(isPathUnder("C:\\", "D:\\Users\\dev\\mise.toml"), false);
});

test("isPathUnder: UNC share roots", () => {
  assert.equal(
    isPathUnder("\\\\server\\share\\proj", "\\\\server\\share\\proj\\mise.toml"),
    true,
  );
  assert.equal(isPathUnder("\\\\server\\share", "\\\\server\\other\\mise.toml"), false);
});

test("isPathUnder: empty paths are not under anything", () => {
  assert.equal(isPathUnder("", "/foo/mise.toml"), false);
  assert.equal(isPathUnder("/foo", ""), false);
});

test("normalizePathForCompare: unifies separators and collapses duplicates", () => {
  assert.equal(normalizePathForCompare("C:\\\\Users\\\\dev", { caseInsensitive: false }), "C:/Users/dev");
  assert.equal(normalizePathForCompare("//server/share", { caseInsensitive: false }), "/server/share");
});

test("normalizePathForCompare: keeps root and drive-root forms", () => {
  assert.equal(normalizePathForCompare("/", { caseInsensitive: false }), "/");
  assert.equal(normalizePathForCompare("C:\\", { caseInsensitive: false }), "C:/");
  assert.equal(normalizePathForCompare("c:/", { caseInsensitive: false }), "c:/");
  assert.equal(normalizePathForCompare("c:/"), "c:/");
});

test("shortenPathTail: short paths pass through unchanged", () => {
  assert.equal(shortenPathTail("/Users/dev/mise.toml", 40), "/Users/dev/mise.toml");
  assert.equal(shortenPathTail("mise.toml", 40), "mise.toml");
  assert.equal(shortenPathTail("", 40), "");
});

test("shortenPathTail: long paths keep the tail and a leading ellipsis", () => {
  const short = shortenPathTail("/Users/dev/AiCodingProjects/mise-ui/mise.toml", 30);
  assert.ok(short.startsWith("…/"), short);
  assert.ok(short.endsWith("/mise-ui/mise.toml"), short);
  assert.ok(short.length <= 30, short);
});

test("shortenPathTail: a path exactly at the budget is not elided", () => {
  // Off-by-one guard: the whole path (no ellipsis, no extra segment) fits,
  // so shortening it would lose information for nothing.
  const exact = "/Users/dev/mise.toml";
  assert.equal(exact.length, 20);
  assert.equal(shortenPathTail(exact, 20), exact);
  // One character over the budget does elide.
  assert.equal(shortenPathTail(exact, 19), "…/dev/mise.toml");
});

test("shortenPathTail: the file name survives even when it alone exceeds the budget", () => {
  const short = shortenPathTail("/a/b/very-long-configuration-file-name.toml", 10);
  assert.equal(short, "…/very-long-configuration-file-name.toml");
});

test("shortenPathTail: Windows separators stay backslashes", () => {
  const short = shortenPathTail("C:\\Users\\dev\\AiCodingProjects\\mise-ui\\mise.toml", 30);
  assert.ok(short.startsWith("…\\"), short);
  assert.ok(!short.includes("/"), short);
  assert.ok(short.endsWith("\\mise.toml"), short);
});

test("shortenPathTail: values with no separator are not treated as paths", () => {
  const token = "registry:https://example.com/a/very/long/tool/identifier";
  assert.equal(shortenPathTail(token, 10), token);
});

// ---------- Wide-character budgets (issue #258) ----------

test("shortenPathTail: CJK counts as two columns, not UTF-16 units", () => {
  const path = "/Users/dev/一个很长的项目名称/mise.toml";
  // 30 UTF-16 units but 39 mono columns: the old length guard returned
  // this untouched, so the CSS end-ellipsis cut the head off a line that
  // already overflowed. The wide segment alone consumes 18 columns.
  assert.equal(path.length, 30);
  assert.equal(shortenPathTail(path, 30), "…/一个很长的项目名称/mise.toml");
});

test("shortenPathTail: mixed ASCII + CJK drops the segment that no longer fits", () => {
  // Old code kept `app/` (13 UTF-16 units ≤ 14) although the rendered
  // line was 17 columns wide; the wide basename must own the budget.
  assert.equal(shortenPathTail("/Users/dev/app/说明文档.md", 14), "…/说明文档.md");
});

test("shortenPathTail: a CJK path exactly at the column budget is not elided", () => {
  const exact = "/项目/我的应用/mise.toml";
  assert.equal(exact.length, 18); // 24 display columns
  assert.equal(shortenPathTail(exact, 24), exact);
  // One column over the budget does elide, keeping the tail.
  assert.equal(shortenPathTail(exact, 23), "…/我的应用/mise.toml");
});

test("shortenPathTail: a CJK basename longer than the budget still survives", () => {
  assert.equal(
    shortenPathTail("/a/b/我的项目文件名称.toml", 10),
    "…/我的项目文件名称.toml",
  );
});

test("shortenPathTail: Windows separators with CJK segments stay backslashes", () => {
  assert.equal(
    shortenPathTail("C:\\Users\\dev\\项目\\mise.toml", 16),
    "…\\项目\\mise.toml",
  );
});

test("shortenPathTail: ASCII budgeting is unchanged", () => {
  assert.equal(
    shortenPathTail("/Users/dev/AiCodingProjects/mise-ui/mise.toml", 30),
    "…/mise-ui/mise.toml",
  );
});

// ---------- Measured column budgets (issue #225) ----------

test("columnCharBudget: the 216px Source column measures 26 characters", () => {
  // 216px − 2×12px padding = 192px of text; 192 / 7.2px per mono char.
  assert.equal(columnCharBudget(216), 26);
  assert.equal(SOURCE_CELL_CHARS, 26);
});

test("SOURCE_CELL_CHARS boundary: a path exactly at the budget is not elided", () => {
  // Same off-by-one shape as the #216 test above.
  const exact = `/${"d".repeat(13)}/config.toml`;
  assert.equal(exact.length, SOURCE_CELL_CHARS);
  assert.equal(shortenPathTail(exact, SOURCE_CELL_CHARS), exact);
  // One character over the budget does elide — and keeps the file name.
  const over = `/${"d".repeat(14)}/config.toml`;
  assert.equal(over.length, SOURCE_CELL_CHARS + 1);
  assert.equal(shortenPathTail(over, SOURCE_CELL_CHARS), "…/config.toml");
});

test("SOURCE_CELL_CHARS: global and project config sources stay separable", () => {
  // The #225 defect: at the old 18-char budget both rendered
  // `…/mise/config.toml`. The widened budget keeps the discriminating
  // directory segment (`.config/mise` vs `.mise`).
  const globalConfig = "/Users/lifan/.config/mise/config.toml";
  const projectConfig = "/Users/lifan/AiCodingProjects/mise-ui/.mise/config.toml";
  const globalShort = shortenPathTail(globalConfig, SOURCE_CELL_CHARS);
  const projectShort = shortenPathTail(projectConfig, SOURCE_CELL_CHARS);
  assert.equal(globalShort, "…/.config/mise/config.toml");
  assert.equal(projectShort, "…/.mise/config.toml");
  assert.notEqual(globalShort, projectShort);
  // Neither may be re-truncated by the cell's end ellipsis: each budget
  // character is 7.2px and the 216px column offers 192px of text.
  assert.ok(globalShort.length * 7.2 <= 216 - 24, globalShort);
  assert.ok(projectShort.length * 7.2 <= 216 - 24, projectShort);
});

test("ENV_VALUE_CELL_CHARS: the 320px Env Value column measures 41 characters", () => {
  assert.equal(columnCharBudget(320), 41);
  assert.equal(ENV_VALUE_CELL_CHARS, 41);
});

test("ENV_VALUE_CELL_CHARS boundary: a value exactly at the budget is not elided", () => {
  const exact = `/${"d".repeat(36)}/bin`;
  assert.equal(exact.length, ENV_VALUE_CELL_CHARS);
  assert.equal(shortenPathTail(exact, ENV_VALUE_CELL_CHARS), exact);
  const over = `/${"d".repeat(37)}/bin`;
  assert.equal(over.length, ENV_VALUE_CELL_CHARS + 1);
  assert.equal(shortenPathTail(over, ENV_VALUE_CELL_CHARS), "…/bin");
});

test("ENV_VALUE_CELL_CHARS: GOBIN / GOROOT / JAVA_HOME stay distinguishable", () => {
  // The #225 defect: the tail-truncating CSS ellipsis collapsed all
  // three to `/Users/lifan/.local/share/mise/insta…`. Head-elision at
  // the measured budget keeps the tool + version tail of each.
  const gobin = shortenPathTail(
    "/Users/lifan/.local/share/mise/installs/node/22.11.0/bin",
    ENV_VALUE_CELL_CHARS,
  );
  const goroot = shortenPathTail(
    "/Users/lifan/.local/share/mise/installs/go/1.23.2",
    ENV_VALUE_CELL_CHARS,
  );
  const javaHome = shortenPathTail(
    "/Users/lifan/.local/share/mise/installs/java/openjdk-21",
    ENV_VALUE_CELL_CHARS,
  );
  for (const short of [gobin, goroot, javaHome]) {
    assert.ok(short.startsWith("…/"), short);
    assert.ok(short.length <= ENV_VALUE_CELL_CHARS, short);
    // Fits the 320px column's text box: no CSS end-ellipsis re-cut.
    assert.ok(short.length * 7.2 <= 320 - 24, short);
  }
  assert.equal(gobin, "…/share/mise/installs/node/22.11.0/bin");
  assert.equal(goroot, "…/.local/share/mise/installs/go/1.23.2");
  assert.equal(javaHome, "…/share/mise/installs/java/openjdk-21");
  assert.equal(new Set([gobin, goroot, javaHome]).size, 3);
});
