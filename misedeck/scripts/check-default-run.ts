#!/usr/bin/env node
// `npm run lint:default-run` — keep a bare `cargo run` pointed at the app.
//
// The package builds the app binary plus the two fixture harnesses under
// src/bin/ (behind the `fixtures` feature). Cargo counts every bin target
// when it picks the default one for `cargo run` — including bins whose
// `required-features` are unmet — so without `default-run` it refuses with
// "could not determine which binary to run", and `npm run tauri dev` can no
// longer work out which process to watch. That is how #286's dev session
// failed; #287 added `default-run`, and this guard keeps it there.
//
// The guard fails when:
//   1. the package builds more than one binary and `[package].default-run`
//      is unset;
//   2. `default-run` names a target that does not exist;
//   3. `default-run` names a feature-gated harness — a bare `cargo run`
//      would then fail with "target requires features"; or
//   4. `default-run` names anything other than the app binary.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TAURI_DIR = join(ROOT, "src-tauri");
const MANIFEST = process.argv[2]
  ? resolve(process.argv[2])
  : join(TAURI_DIR, "Cargo.toml");

let packageName: string | null = null;
let defaultRun: string | null = null;
const explicitBins: Array<{ name: string | null; line: number; gated: boolean }> =
  [];

let section: "package" | "bin" | "other" = "other";
let currentBin: (typeof explicitBins)[number] | null = null;

for (const [index, line] of readFileSync(MANIFEST, "utf8").split("\n").entries()) {
  const heading = /^\s*\[\[?([^\]]+)\]\]?\s*(?:#.*)?$/.exec(line);
  if (heading !== null) {
    const name = heading[1].trim();
    section = name === "package" ? "package" : name === "bin" ? "bin" : "other";
    if (section === "bin") {
      currentBin = { name: null, line: index + 1, gated: false };
      explicitBins.push(currentBin);
    }
    continue;
  }
  if (section === "package") {
    const run = /^\s*default-run\s*=\s*"([^"]*)"/.exec(line);
    if (run !== null) defaultRun = run[1];
    if (packageName === null) {
      const name = /^\s*name\s*=\s*"([^"]*)"/.exec(line);
      if (name !== null) packageName = name[1];
    }
  } else if (section === "bin" && currentBin !== null) {
    const name = /^\s*name\s*=\s*"([^"]*)"/.exec(line);
    if (name !== null) currentBin.name = name[1];
    if (/^\s*required-features\s*=/.test(line)) currentBin.gated = true;
  }
}

const binNames = new Set<string>();
const gatedNames = new Set<string>();
const hasAppMain = existsSync(join(TAURI_DIR, "src/main.rs"));
if (hasAppMain && packageName !== null) binNames.add(packageName);
for (const bin of explicitBins) {
  if (bin.name === null) continue;
  binNames.add(bin.name);
  if (bin.gated) gatedNames.add(bin.name);
}
const binDir = join(TAURI_DIR, "src/bin");
if (existsSync(binDir)) {
  for (const name of readdirSync(binDir)) {
    const full = join(binDir, name);
    if (name.endsWith(".rs")) binNames.add(basename(name, ".rs"));
    else if (statSync(full).isDirectory() && existsSync(join(full, "main.rs")))
      binNames.add(name);
  }
}

const listing = [...binNames].sort().join(", ");
const failures: string[] = [];

if (binNames.size > 1 && defaultRun === null) {
  failures.push(
    `[package] has no default-run, but the package builds ${binNames.size} binaries (${listing}); ` +
      `\`cargo run\` would refuse to pick one — add default-run = "${packageName ?? "<app bin>"}"`,
  );
}
if (defaultRun !== null && !binNames.has(defaultRun)) {
  failures.push(
    `default-run = "${defaultRun}" does not name a bin target (bins: ${listing})`,
  );
}
if (defaultRun !== null && gatedNames.has(defaultRun)) {
  failures.push(
    `default-run = "${defaultRun}" points at a feature-gated harness; a bare \`cargo run\` would fail — point it at the app binary`,
  );
}
if (defaultRun !== null && hasAppMain && packageName !== null && defaultRun !== packageName) {
  failures.push(
    `default-run = "${defaultRun}" is not the app binary ("${packageName}"); \`npm run tauri dev\` would watch the wrong process`,
  );
}

if (failures.length > 0) {
  console.error(
    "default-run check FAILED — a bare `cargo run` (and `npm run tauri dev`) must start the app.",
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  binNames.size > 1
    ? `default-run check OK — ${binNames.size} bins, bare \`cargo run\` starts "${defaultRun}".`
    : "default-run check OK — one bin target; nothing to disambiguate.",
);
