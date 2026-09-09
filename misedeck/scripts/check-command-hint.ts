#!/usr/bin/env node
// `npm run lint:command-hint` — command hints teach only commands a user
// can actually type, and the shared CommandHint component is the single
// implementation (issue #124, docs/design/ui-ux-rules.md → command hint).
//
// The check enforces two mechanically checkable halves of that rule:
//   1. No `*.commandHint` value in en.json / zh-CN.json contains a long
//      flag (`--flag`). Long flags in hints are internal fetch flags the
//      GUI passes for its own plumbing (`--json`, `--json-extended`,
//      `--path`, …); a genuinely user-facing long flag belongs in the
//      ALLOWLIST below with a reason.
//   2. No `.commandHint` CSS block outside the shared component
//      (src/components/CommandHint/CommandHint.module.css) — per-page
//      copies drift (only ToolsPage ever had the 60ch cap).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "src");
const SHARED_CSS = "src/components/CommandHint/CommandHint.module.css";

/** `locale:key` entries allowed to carry a long flag, each with a reason. */
const ALLOWLIST = new Map<string, string>([
  // Example: ["en:tools.commandHint", "--global is a user-facing flag here"],
]);

const failures: string[] = [];

// 1. Internal flags in hint strings.
for (const locale of ["en", "zh-CN"]) {
  const file = join(SRC_DIR, "i18n", `${locale}.json`);
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  const walk = (node: unknown, path: string[]): void => {
    if (typeof node === "string") {
      const key = path[path.length - 1];
      if (key === "commandHint") {
        const flags = node.match(/ --[a-z][a-z-]*/g) ?? [];
        const allowlisted = ALLOWLIST.has(`${locale}:${path.join(".")}`);
        if (flags.length > 0 && !allowlisted) {
          failures.push(
            `${locale}.json ${path.join(".")}: internal flag(s) ${flags.join(", ")} — hints list only user-facing commands`,
          );
        }
      }
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    }
  };
  walk(data, []);
}

// 2. Per-page .commandHint CSS copies.
function listCss(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".vite") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listCss(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

for (const file of listCss(SRC_DIR)) {
  const rel = relative(REPO_ROOT, file);
  if (rel === SHARED_CSS) continue;
  if (/\.commandHint\b/.test(readFileSync(file, "utf8"))) {
    failures.push(
      `${rel}: .commandHint defined outside the shared CommandHint component — use <CommandHint> instead`,
    );
  }
}

if (failures.length > 0) {
  console.error("check-command-hint failed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-command-hint: ok");
