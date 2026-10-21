#!/usr/bin/env node
// `npm run lint:argv-parity` — the tools page's argv exists twice: the
// TypeScript builders in `src/pages/ToolsPage/toolActionArgs.ts` build
// what the app actually dispatches, and the Rust builders in
// `src-tauri/src/mise.rs` are the "pinned contract" that until now only
// a comment kept aligned (audit R-13, issue #255). Two languages cannot
// agree at compile time, so both sides are asserted against one
// checked-in case table:
//
//   * this script executes the TS half against
//     `src-tauri/tests/fixtures/argv-parity.json` and runs in
//     `npm run ci` (and therefore the Windows CI leg);
//   * `src-tauri/tests/argv_parity.rs` executes the Rust half against
//     the same file under `cargo test`.
//
// A one-sided change fails the half that drifted: this script for TS,
// the Rust test for Rust. A new builder with no table case fails the
// coverage check below.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  miseInstallArgs,
  miseLinkArgs,
  miseUninstallArgs,
  miseUnuseArgs,
  miseUpgradeArgs,
  miseUseArgs,
} from "../src/pages/ToolsPage/toolActionArgs.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const TABLE_FILE = join(REPO_ROOT, "src-tauri", "tests", "fixtures", "argv-parity.json");

/** Any non-null cwd means Directory mode; `null` means Global mode. */
const DIRECTORY = "/tmp/misedeck-argv-parity";

interface Case {
  builder: string;
  tool: string;
  version?: string;
  path?: string;
  global?: boolean;
  argv: string[];
}

interface Table {
  cases: Case[];
}

function build(c: Case): string[] {
  const version = c.version ?? "";
  switch (c.builder) {
    case "install":
      return miseInstallArgs(c.tool, version);
    case "uninstall":
      return miseUninstallArgs(c.tool, version);
    case "use":
      return miseUseArgs(c.tool, version, c.global ? null : DIRECTORY);
    case "unuse":
      return miseUnuseArgs(c.tool, c.global ? null : DIRECTORY);
    case "link":
      return miseLinkArgs(c.tool, version, c.path ?? "");
    case "upgrade":
      return miseUpgradeArgs(c.tool);
    default:
      throw new Error(
        `unknown builder ${JSON.stringify(c.builder)} in ${TABLE_FILE} — ` +
          "add it to this script and tests/argv_parity.rs together",
      );
  }
}

const table = JSON.parse(readFileSync(TABLE_FILE, "utf8")) as Table;
const failures: string[] = [];

if (!Array.isArray(table.cases) || table.cases.length === 0) {
  failures.push(`no cases found in ${TABLE_FILE}`);
}

const covered = new Set<string>();
for (const c of table.cases) {
  covered.add(c.builder);
  const actual = build(c);
  if (JSON.stringify(actual) !== JSON.stringify(c.argv)) {
    failures.push(
      `TS builder ${JSON.stringify(c.builder)} drifted: expected ${JSON.stringify(c.argv)}, got ${JSON.stringify(actual)}`,
    );
  }
}

for (const builder of ["install", "uninstall", "use", "unuse", "link", "upgrade"]) {
  if (!covered.has(builder)) {
    failures.push(`the table has no ${JSON.stringify(builder)} case — every tools-page builder must be covered`);
  }
}

if (failures.length > 0) {
  console.error("check-argv-parity failed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-argv-parity: ok (${table.cases.length} case(s))`);
