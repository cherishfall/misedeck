#!/usr/bin/env node
// `npm run lint:i18n-ellipsis` — button labels never carry a trailing
// "…" (issue #122 / beta9 Issue 4). The ellipsis is the old "this opens
// a dialog" GUI convention; MiseDeck buttons read as plain verbs.
// Ellipses stay only where the semantics differ: input placeholders
// (a hint, not an action) and in-progress copy (loading / busy states).
//
// The check walks both locale resource files and flags any string value
// ending in "…" whose key is not allowlisted. Allowlist entries are
// full key paths with a reason — never reword copy to dodge the check.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOCALES = ["en.json", "zh-CN.json"];

/**
 * Full key paths allowed to end in "…", each with its reason. Any key
 * containing "placeholder" is allowed without an entry — placeholders
 * are hints, not button labels.
 */
const ALLOWLIST = new Map<string, string>([
  ["common.loading", "in-progress state label, not a button"],
  ["trust.busy", "in-progress state label, not a button"],
  ["states.detecting", "in-progress state label, not a button"],
]);

function collectViolations(
  node: unknown,
  path: string[],
  out: string[],
): void {
  if (typeof node === "string") {
    if (node.endsWith("…")) {
      const key = path.join(".");
      const isPlaceholder = path.some((p) => p.toLowerCase().includes("placeholder"));
      if (!isPlaceholder && !ALLOWLIST.has(key)) {
        out.push(`${key} = ${JSON.stringify(node)}`);
      }
    }
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      collectViolations(v, [...path, k], out);
    }
  }
}

let failed = false;
for (const locale of LOCALES) {
  const file = join(REPO_ROOT, "src", "i18n", locale);
  const data = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const violations: string[] = [];
  collectViolations(data, [], violations);
  if (violations.length > 0) {
    failed = true;
    console.error(`check-i18n-ellipsis: ${locale} has trailing-ellipsis button copy:`);
    for (const v of violations) console.error(`  ${v}`);
  }
}

if (failed) {
  console.error(
    "Button labels never end in \"…\"; placeholders and in-progress copy may. " +
      "Drop the suffix or add an allowlist entry with a reason.",
  );
  process.exit(1);
}
console.log("check-i18n-ellipsis: ok");
