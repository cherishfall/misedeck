#!/usr/bin/env node
// `npm run lint:i18n` — enforce that en.json and zh-CN.json have the
// exact same key set at every level. A key present in one and missing
// in the other is a build error (we ship only what is translated).
//
// The `I18N_KEYS` constant in `src/i18n/keys.ts` is the canonical
// catalog; this script reads the JSON resource files directly because
// they are the deployment surface, and compares them by leaf key path.
//
// Guard 1 — call-site keys: greps `src/**/*.{ts,tsx}` for `t("…")`
// string-literal call sites and flags any literal that is not a known
// key. This is a guardrail, not a parser, so it warns by default; the
// JSON parity check is what fails the build.
//
// Guard 2 — interpolation (issue #85): parses the catalog and every
// call site with the TypeScript AST and verifies that the `{{var}}`
// placeholders in a translated string exactly match the parameters the
// call site passes — in BOTH locales. This exists because
// `tools.confirm.uninstall.title` shipped with single braces `{tool}`,
// which i18next does not interpolate (default delimiters are `{{ }}`),
// so the uninstall dialog rendered a literal "{tool}". Dynamically
// keyed calls are skipped on purpose: a guard that false-positives is
// a guard that gets ignored.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

// ---------------------------------------------------------------------------
// Guard 2 — interpolation placeholders vs call-site params (issue #85)
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

function sourceKind(file: string): ts.ScriptKind {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/** Walk every node in a source file, pre-order. */
function walkNodes(root: ts.SourceFile, fn: (node: ts.Node) => void): void {
  const visit = (node: ts.Node): void => {
    fn(node);
    node.forEachChild(visit);
  };
  root.forEachChild(visit);
}

/**
 * Build the map from the I18N_KEYS constant path used at call sites
 * (e.g. "tools.confirm.uninstall.title") to the dotted resource key
 * (e.g. "tools.confirm.uninstall.title"). The two happen to mirror
 * each other today, but the catalog is the source of truth — a future
 * rename in keys.ts must not silently break the guard.
 */
function parseKeysCatalog(): Map<string, string> {
  const keysFile = join(I18N_DIR, "keys.ts");
  const sf = ts.createSourceFile(
    keysFile,
    readFileSync(keysFile, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  let catalog: ts.ObjectLiteralExpression | undefined;
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== "I18N_KEYS" || !decl.initializer) {
        continue;
      }
      // Unwrap `... as const` (and parens) before expecting the object literal.
      let init: ts.Expression = decl.initializer;
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) {
        init = init.expression;
      }
      if (ts.isObjectLiteralExpression(init)) {
        catalog = init;
      }
    }
  }
  if (!catalog) {
    throw new Error("I18N_KEYS object literal not found in src/i18n/keys.ts");
  }

  const map = new Map<string, string>();
  const visit = (obj: ts.ObjectLiteralExpression, path: string[]): void => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const nameNode = prop.name;
      if (!ts.isIdentifier(nameNode) && !ts.isStringLiteral(nameNode)) continue;
      const name = nameNode.text;
      if (ts.isObjectLiteralExpression(prop.initializer)) {
        visit(prop.initializer, [...path, name]);
      } else if (ts.isStringLiteral(prop.initializer)) {
        map.set([...path, name].join("."), prop.initializer.text);
      }
    }
  };
  visit(catalog, []);
  return map;
}

function lookupString(root: JsonObject, dotted: string): string | undefined {
  let node: JsonValue = root;
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

interface SiteInfo {
  file: string;
  line: number;
  /** Constant path after the I18N_KEYS root, e.g. "tools.confirm.uninstall.title". */
  key: string;
  /**
   * Param names passed at the call site. null = dynamic site the guard
   * deliberately skips (spread, computed property, non-literal object).
   */
  params: ReadonlySet<string> | null;
}

/** Recognize `t(I18N_KEYS.a.b.c, {...})`; anything else returns null (skip). */
function describeTCall(file: string, sf: ts.SourceFile, call: ts.CallExpression): SiteInfo | null {
  const callee = call.expression;
  if (!(ts.isIdentifier(callee) && callee.text === "t")) return null;
  if (call.arguments.length === 0) return null;

  const first = call.arguments[0]!;
  if (!ts.isPropertyAccessExpression(first)) return null;

  const parts: string[] = [];
  let cursor: ts.Expression = first;
  while (ts.isPropertyAccessExpression(cursor)) {
    parts.unshift(cursor.name.text);
    cursor = cursor.expression;
  }
  if (!(ts.isIdentifier(cursor) && cursor.text === "I18N_KEYS")) return null;

  let params: Set<string> | null = new Set();
  if (call.arguments.length >= 2) {
    const second = call.arguments[1]!;
    if (ts.isObjectLiteralExpression(second)) {
      for (const prop of second.properties) {
        // Shorthand `{ tool }` and explicit `{ tool: x }` both count.
        const nameOk =
          (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) &&
          (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name));
        if (!nameOk) return null; // computed / spread — unverifiable, skip
        params.add(prop.name.text);
      }
    } else {
      params = null; // dynamic second argument — skip
    }
  }

  const { line } = sf.getLineAndCharacterOfPosition(call.getStart());
  return { file, line: line + 1, key: parts.join("."), params };
}

function checkInterpolation(): number {
  const keyMap = parseKeysCatalog();
  const en = loadJson(EN_FILE);
  const zh = loadJson(ZH_CN_FILE);
  const locales: ReadonlyArray<readonly [string, JsonObject]> = [
    ["en", en],
    ["zh-CN", zh],
  ];

  const problems: string[] = [];
  let checked = 0;
  let skipped = 0;

  for (const file of listFiles(SRC_DIR, [".ts", ".tsx"])) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      sourceKind(file),
    );
    walkNodes(sf, (node) => {
      if (!ts.isCallExpression(node)) return;
      const site = describeTCall(file, sf, node);
      if (!site) return;
      if (site.params === null) {
        skipped += 1;
        return;
      }
      checked += 1;

      const dotted = keyMap.get(site.key);
      if (dotted === undefined) {
        problems.push(`${relative(REPO_ROOT, file)}:${site.line}  unresolved key I18N_KEYS.${site.key}`);
        return;
      }
      const where = `${relative(REPO_ROOT, file)}:${site.line}`;
      for (const [locale, root] of locales) {
        const text = lookupString(root, dotted);
        if (text === undefined) {
          problems.push(`${where}  key "${dotted}" missing from ${locale}.json`);
          continue;
        }
        const placeholders = new Set<string>(
          [...text.matchAll(PLACEHOLDER)].map((m) => m[1]!),
        );
        const unused = [...site.params].filter((p) => !placeholders.has(p)).sort();
        const unfilled = [...placeholders].filter((p) => !site.params?.has(p)).sort();
        if (unused.length > 0 || unfilled.length > 0) {
          const pass = [...site.params].sort().join(", ");
          const have = [...placeholders].sort().join(", ");
          problems.push(
            `${where}  ${locale}  "${dotted}" — call passes {${pass}}, string uses {${have}}` +
              (unused.length > 0 ? `; params with no placeholder: ${unused.join(", ")}` : "") +
              (unfilled.length > 0 ? `; placeholders with no param: ${unfilled.join(", ")}` : ""),
          );
        }
      }
    });
  }

  if (problems.length > 0) {
    console.error(
      `i18n interpolation check FAILED — placeholders must match t() call params in both locales.`,
    );
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      "\n  i18next interpolates `{{name}}` only. A single-brace `{name}` renders literally.",
    );
    return 1;
  }
  console.log(
    `i18n interpolation OK — ${checked} t(I18N_KEYS…) call site(s) match their {{placeholders}} in en + zh-CN` +
      (skipped > 0 ? ` (${skipped} dynamic site(s) skipped by design)` : "") +
      ".",
  );
  return 0;
}

function main(): void {
  const en = loadJson(EN_FILE);
  const zh = loadJson(ZH_CN_FILE);
  const parityExit = checkParity(en, zh);
  const literalExit = checkLiteralCallSites();
  const interpolationExit = checkInterpolation();
  process.exit(parityExit || literalExit || interpolationExit);
}

main();
