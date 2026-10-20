#!/usr/bin/env node
// `npm run lint:nested-interactive` — no interactive element is nested
// inside another (issue #228; docs/design/ui-ux-rules.md → Interaction
// integrity).
//
// The bug was `<Link><Button>` in `MiseMissingState`: invalid markup
// (`<a><button>`) and two activation paths for one Enter — the link's
// and the button's. Nothing about it looked wrong in review, so the
// check is mechanical: any router link, anchor, or button whose body
// contains another focusable control fails the build.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = join(ROOT, "src");

/** The containers that must not hold another control, and how each
 *  container's own tags are spelled. */
const CONTAINERS = [
  { name: "<Link>", open: /<Link\b[^>]*?>/g, close: "</Link>" },
  { name: "<a>", open: /<a\b[^>]*?>/g, close: "</a>" },
  { name: "<button>", open: /<button\b[^>]*?>/g, close: "</button>" },
];

/** What counts as a nested control inside one of those containers. */
const NESTED =
  /<(Button|IconButton|CopyButton|button|input|select|textarea|a|Link)\b/;

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

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

const failures: string[] = [];

for (const file of listSource(SRC_DIR)) {
  const text = readFileSync(file, "utf8");
  for (const container of CONTAINERS) {
    for (const match of text.matchAll(container.open)) {
      const start = match.index + match[0].length;
      const end = text.indexOf(container.close, start);
      if (end === -1) continue;
      const body = text.slice(start, end);
      const nested = body.match(NESTED);
      if (!nested) continue;
      const rel = relative(ROOT, file).split(sep).join("/");
      failures.push(
        `${rel}:${lineOf(text, start)}: ${container.name} contains ` +
          `<${nested[1]}> — nested interactive controls are invalid markup ` +
          "and give one Enter two activation paths; style the container as " +
          "the button, or use a Button with navigate()",
      );
    }
  }
}

if (failures.length > 0) {
  console.error("check-nested-interactive failed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-nested-interactive: ok");
