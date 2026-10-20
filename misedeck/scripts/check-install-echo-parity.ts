#!/usr/bin/env node
// `npm run lint:install-echo-parity` — the guided-install echo the UI
// shows and the command the Rust executor actually spawns must be the
// same line, per platform (issue #229). They live in two languages, so
// nothing at compile time can keep them equal: the frontend used to
// promise `curl … | sh` while the Windows runner executed
// `powershell -Command "irm … | iex"`, and "copy command" produced a
// line that could never reproduce the run.
//
// The check is textual on purpose: it reads the install one-liners out
// of `src-tauri/src/install.rs` (`INSTALL_SCRIPT_LINE`, both cfg
// branches) and out of the frontend's `INSTALL_SCRIPT_LINES` map, and
// fails when the two sets are not identical. A branch that disappears
// from either file, or a URL that changes on one side only, breaks CI
// at generation time instead of reaching a Windows user.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const RUST_FILE = join(REPO_ROOT, "src-tauri", "src", "install.rs");
const TS_FILE = join(REPO_ROOT, "src", "components", "ExecutionPanel", "commandEcho.ts");

/** The install one-liner as written in either language. */
const LINE = /"(?:irm|curl -fsSL) https:\/\/mise\.jdx\.dev\/install\.(?:sh|ps1) \| (?:iex|sh)"/g;

function lines(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const found = text.match(LINE) ?? [];
  return [...new Set(found.map((m) => m.slice(1, -1)))].sort();
}

const failures: string[] = [];
const rust = lines(RUST_FILE);
const ts = lines(TS_FILE);

if (rust.length === 0) {
  failures.push(`no install one-liner found in ${RUST_FILE} — did INSTALL_SCRIPT_LINE move?`);
}
if (ts.length === 0) {
  failures.push(`no install one-liner found in ${TS_FILE} — did INSTALL_SCRIPT_LINES move?`);
}
if (rust.length !== ts.length || rust.some((line, i) => line !== ts[i])) {
  failures.push(
    `install echo drift: Rust has [${rust.join(" | ")}], the UI has [${ts.join(" | ")}]`,
  );
}

if (failures.length > 0) {
  console.error("check-install-echo-parity failed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-install-echo-parity: ok (${rust.length} platform line(s))`);
