#!/usr/bin/env node
// `npm run lint:i18n` — enforce that en.json and zh-CN.json have the
// exact same key set at every level. A key present in one and missing
// in the other is a build error (we ship only what is translated).
//
// The `I18N_KEYS` constant in `src/i18n/keys.ts` is the canonical
// catalog; this script reads the JSON resource files directly because
// they are the deployment surface, and compares them by leaf key path.
//
// Optional heuristic: also greps `src/**/*.{ts,tsx}` for `t("…")`
// string-literal call sites. We flag any literal that is not a known
// key — this is a guardrail, not a parser, so it warns by default but
// the JSON parity check is what fails the build.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const I18N_DIR = join(REPO_ROOT, "src", "i18n");
const EN_FILE = join(I18N_DIR, "en.json");
const ZH_CN_FILE = join(I18N_DIR, "zh-CN.json");
const SRC_DIR = join(REPO_ROOT, "src");

type JsonObject = { [k: string]: JsonValue };
type JsonValue = string | JsonObject | JsonValue[];

function loadJson(path: string): JsonObject {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as JsonValue;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected object at ${path}, got ${Array.isArray(parsed) ? "array" : typeof parsed}`);
  }
  return parsed as JsonObject;
}

/** Walk a JSON object and yield every leaf key path, e.g. "states.notInstalled.body". */
function* walkKeys(value: JsonValue, prefix: string[] = []): Generator<string> {
  if (typeof value === "string") {
    yield prefix.join(".");
    return;
  }
  if (Array.isArray(value)) {
    // We do not support arrays of objects yet; a string is fine.
    for (const v of value) {
      if (typeof v === "string") {
        yield prefix.join(".");
        return;
      }
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      yield* walkKeys(v, [...prefix, k]);
    }
  }
}

function diff(a: Set<string>, b: Set<string>): { onlyA: string[]; onlyB: string[] } {
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  for (const k of a) if (!b.has(k)) onlyA.push(k);
  for (const k of b) if (!a.has(k)) onlyB.push(k);
  onlyA.sort();
  onlyB.sort();
  return { onlyA, onlyB };
}

function listFiles(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  let entries: string[];
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
      out.push(...listFiles(full, exts));
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function checkParity(en: JsonObject, zh: JsonObject): number {
  const enKeys = new Set<string>(walkKeys(en));
  const zhKeys = new Set<string>(walkKeys(zh));
  const { onlyA: enOnly, onlyB: zhOnly } = diff(enKeys, zhKeys);

  let exit = 0;
  if (enOnly.length > 0 || zhOnly.length > 0) {
    console.error("i18n parity check FAILED — en.json and zh-CN.json must share the same key set.");
    if (enOnly.length > 0) {
      console.error("\n  present in en.json, MISSING from zh-CN.json:");
      for (const k of enOnly) console.error(`    - ${k}`);
    }
    if (zhOnly.length > 0) {
      console.error("\n  present in zh-CN.json, MISSING from en.json:");
      for (const k of zhOnly) console.error(`    - ${k}`);
    }
    console.error(
      "\n  Add the missing translation in the same commit, or remove the unused key.",
    );
    exit = 1;
  } else {
    console.log(
      `i18n parity OK — ${enKeys.size} leaf key(s) identical across en.json and zh-CN.json.`,
    );
  }
  return exit;
}

function stripComments(text: string): string {
  // Strip /* ... */ block comments and // line comments so the regex
  // doesn't pick up false positives from the catalog's own examples
  // (e.g. `t("nave.toolz")` inside a JSDoc). This is good-enough: a
  // //-comment containing a quoted t("...") call is rare, and if it
  // happens the warning is harmless.
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function checkLiteralCallSites(): number {
  // Heuristic: look for t("…") / t('…') string literals in src/**.{ts,tsx}.
  // Anything outside the known key set is reported as a warning.
  const known = new Set<string>(walkKeys(loadJson(EN_FILE)));
  const re = /\bt\(\s*["']([a-zA-Z][a-zA-Z0-9_.]*)["']/g;

  const files = listFiles(SRC_DIR, [".ts", ".tsx"]);
  const unknownByFile = new Map<string, string[]>();
  for (const file of files) {
    const text = stripComments(readFileSync(file, "utf8"));
    for (const match of text.matchAll(re)) {
      const key = match[1];
      if (!known.has(key)) {
        const list = unknownByFile.get(file) ?? [];
        list.push(key);
        unknownByFile.set(file, list);
      }
    }
  }

  if (unknownByFile.size === 0) {
    console.log("i18n call-site scan OK — every t('...') literal is a known key.");
    return 0;
  }
  // Warnings only; the parity check is the hard error.
  console.warn(
    "\ni18n call-site scan — these t('...') literals are not in the key set (warning, not error):",
  );
  for (const [file, keys] of [...unknownByFile.entries()].sort()) {
    for (const k of keys) {
      console.warn(`  ${relative(REPO_ROOT, file)}  →  t("${k}")`);
    }
  }
  return 0;
}

function main(): void {
  const en = loadJson(EN_FILE);
  const zh = loadJson(ZH_CN_FILE);
  const parityExit = checkParity(en, zh);
  const literalExit = checkLiteralCallSites();
  process.exit(parityExit || literalExit);
}

main();
