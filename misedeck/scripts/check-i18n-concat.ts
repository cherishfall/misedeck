#!/usr/bin/env node
// `npm run lint:i18n-concat` — forbid translated-string concatenation
// (issue #115). Word order, punctuation, and plural rules differ across
// locales, so a translated string must never be glued to another string
// in code — the whole phrase belongs in the resource file with
// `{{interpolation}}` placeholders.
//
// The check parses `src/**/*.{ts,tsx}` with the TypeScript AST and
// flags any `t(...)` call that appears:
//   1. as an operand of a `+` binary expression  (`t(...) + x`, `x + t(...)`)
//   2. inside a template-literal substitution    (`${t(...)}`, `` `${n} ${t(...)}` ``)
//
// Legitimate exceptions (none today) belong in the ALLOWLIST below as
// `relative/path:line` entries with a reason — never silence the check
// by restructuring code to dodge the patterns.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "src");

/** `file:line` entries exempt from the check, each with a recorded reason. */
const ALLOWLIST = new Map<string, string>([
  // Example: ["src/components/Foo/Foo.tsx:42", "reason the join is locale-safe"],
]);

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

/** Does this subtree contain a call to `t(...)`? */
function containsTCall(node: ts.Node): boolean {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "t"
  ) {
    return true;
  }
  let found = false;
  node.forEachChild((child) => {
    if (!found && containsTCall(child)) found = true;
  });
  return found;
}

function checkFile(file: string): string[] {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const problems: string[] = [];
  const report = (node: ts.Node, why: string): void => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    const at = `${relative(REPO_ROOT, file)}:${line + 1}`;
    if (ALLOWLIST.has(at)) return;
    problems.push(`${at}  ${why}`);
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (containsTCall(node.left) || containsTCall(node.right))
    ) {
      report(node, "translated string joined with `+` — move the whole phrase into the resource file");
    }
    if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        if (containsTCall(span.expression)) {
          report(span, "t(...) inside a template literal — use a {{placeholder}} interpolation key instead");
        }
      }
    }
    node.forEachChild(visit);
  };
  sf.forEachChild(visit);
  return problems;
}

function main(): void {
  const problems: string[] = [];
  for (const file of listFiles(SRC_DIR, [".ts", ".tsx"])) {
    problems.push(...checkFile(file));
  }
  if (problems.length > 0) {
    console.error(
      "i18n concatenation check FAILED — never concatenate translated strings; word order and punctuation are locale-owned.",
    );
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      "\n  Put the entire phrase in en.json + zh-CN.json with {{placeholders}} and pass the parts via t(key, { ... }).",
    );
    process.exit(1);
  }
  console.log(
    `i18n concatenation OK — no t(...) joined with \`+\` or embedded in template literals (${ALLOWLIST.size} allowlisted).`,
  );
}

main();
