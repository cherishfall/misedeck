#!/usr/bin/env node
// `npm run lint:modal-focus` — a destructive confirmation never arms
// itself, and focus never leaves it (issue #227;
// docs/design/ui-ux-rules.md → Interaction integrity). The keyboard half
// of that cannot be checked statically, so the guard covers the two
// halves that can:
//   1. No `autoFocus` anywhere in src/. Initial focus is a decision, and
//      it lives in one place (components/ConfirmDialog/focusTarget.ts):
//      `autoFocus` hands it to whichever control happens to mount last,
//      which on a `danger` dialog is Uninstall / Unuse itself.
//   2. Only the shared `ConfirmDialog` declares a modal. `aria-modal`
//      tells assistive tech the page behind is inert but does not stop
//      Tab, so a second hand-rolled modal would ship without the trap
//      even with `aria-modal="true"` set.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(REPO_ROOT, "src");
const SHARED_DIALOG = "src/components/ConfirmDialog/ConfirmDialog.tsx";

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

const failures: string[] = [];

for (const file of listSource(SRC_DIR)) {
  const text = readFileSync(file, "utf8");
  const rel = relative(REPO_ROOT, file).split(sep).join("/");
  if (/\bautoFocus\b/.test(text)) {
    failures.push(
      `${rel}: autoFocus — a dialog's initial focus is chosen deliberately ` +
        "(see components/ConfirmDialog/focusTarget.ts), not by mount order",
    );
  }
  const isSharedDialog = resolve(file) === resolve(REPO_ROOT, SHARED_DIALOG);
  if (!isSharedDialog && /aria-modal|role="alertdialog"/.test(text)) {
    failures.push(
      `${rel}: a modal declared outside the shared ConfirmDialog — it would ` +
        "not inherit the focus trap",
    );
  }
}

if (failures.length > 0) {
  console.error("check-modal-focus failed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-modal-focus: ok");
