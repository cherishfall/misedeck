#!/usr/bin/env node
// `npm run lint:invoke-wrapper` — every Tauri `invoke` goes through
// `src/api/invoke.ts` (issue #249).
//
// That wrapper is what makes a rejected command visible by default: it
// forwards the rejection to the global failure-notice queue unless the
// call site opts out because it renders the failure itself. A direct
// import from `@tauri-apps/api/core` bypasses the default and silently
// drops the notice, which is exactly the bug #249 exists to prevent.
//
// The guard is AST-based so aliases (`invoke as tauriInvoke`) and
// namespace imports (`import * as core`) cannot slip past. Only the
// wrapper itself may name the module's `invoke`; `Channel` and
// `isTauri` are not `invoke` calls and stay importable everywhere.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(ROOT, "src");
const WRAPPER_FILE = join(SRC_DIR, "api", "invoke.ts");
const TAURI_CORE = "@tauri-apps/api/core";

function listSource(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".vite") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSource(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

interface Violation {
  line: number;
  detail: string;
}

function inspect(file: string): Violation[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: Violation[] = [];

  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === TAURI_CORE
    ) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        violations.push({
          line: lineOf(node),
          detail: "namespace import exposes `invoke`",
        });
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = element.propertyName ?? element.name;
          if (imported.text === "invoke") {
            violations.push({
              line: lineOf(node),
              detail: "imports `invoke` from @tauri-apps/api/core",
            });
          }
        }
      }
    }

    const dynamicSpecifier =
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
        ? node.arguments[0]
        : undefined;
    if (
      dynamicSpecifier !== undefined &&
      ts.isStringLiteral(dynamicSpecifier) &&
      dynamicSpecifier.text === TAURI_CORE
    ) {
      violations.push({
        line: lineOf(node),
        detail: "dynamic import exposes `invoke`",
      });
    }

    node.forEachChild(visit);
  };

  source.forEachChild(visit);
  return violations;
}

const failures: string[] = [];
for (const file of listSource(SRC_DIR)) {
  if (file === WRAPPER_FILE) continue;
  for (const violation of inspect(file)) {
    const rel = relative(ROOT, file).split(sep).join("/");
    failures.push(`${rel}:${violation.line}: ${violation.detail}`);
  }
}

if (failures.length > 0) {
  console.error(
    "invoke-wrapper check FAILED — Tauri `invoke` must be imported from src/api/invoke.ts.",
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\n  Route the call through `src/api/invoke.ts` instead. A call site that" +
      " already renders the failure passes `{ reportFailure: false }`.",
  );
  process.exit(1);
}

console.log(
  "invoke-wrapper check OK — every Tauri invoke goes through src/api/invoke.ts.",
);
