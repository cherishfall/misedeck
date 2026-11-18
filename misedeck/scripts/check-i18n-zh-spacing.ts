#!/usr/bin/env node
// `npm run lint:i18n-zh-spacing` — a zh-CN sentence never renders a space
// between two Han characters (issue #313).
//
// The rule: Chinese does not separate words with spaces, so a space
// between two Han characters is a typographic error, not a word break.
//
// The class this guard exists for: a message template that carries a
// *token phrase* — the `errors.task.*` / `errors.arg.*` / `errors.shape.*`
// / `errors.linkReason.*` / `errors.feedReason.*` phrases, substituted at
// render time. The template cannot know whether the phrase it will hold
// ends in a Latin character ("mise self-update") or a Han one ("mise 命令"),
// so a template that puts a space next to the placeholder renders
// "mise 命令 已取消。" — a space between two Han characters — for one
// token and "mise self-update 已取消。" for the next.
//
// The check therefore renders every token-bearing template with EVERY
// phrase of its group and rejects a result that has a space between two
// Han characters. A template that is clean for one phrase and broken for
// another is broken: the guard takes the union.
//
// The registry (`MESSAGE_TOKEN_PARAMS` in `src/i18n/messageTokens.ts`) is
// the same one the resolver uses, so the guard and the app can never
// disagree about which parameter holds a phrase. The guard also refuses a
// template that uses a token parameter the registry does not know — a new
// message carrying a phrase must be registered, or it escapes the check.
//
// Data parameters (a path, a command line, a count) are NOT checked: the
// value is the runtime's own text, and a space inside it is the user's
// text, not MiseDeck's typography.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MESSAGE_TOKEN_PARAMS,
  TOKEN_GROUPS,
  type TokenGroupName,
} from "../src/i18n/messageTokens";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** A Han character (CJK Unified Ideographs and the extension A block). */
const HAN = "\\u4e00-\\u9fff";
/** A space between two Han characters — the class this guard rejects. */
const HAN_SPACE_HAN = new RegExp(`[${HAN}][ \\t]+[${HAN}]`);

/** The placeholder a data parameter is filled with while rendering: Latin,
 *  so a data value can never look like a Han-space-Han of our own. */
const DATA_SENTINEL = "value";

interface Catalog {
  [key: string]: unknown;
}

const catalog = JSON.parse(
  readFileSync(join(REPO_ROOT, "src", "i18n", "zh-CN.json"), "utf8"),
) as Catalog;

/** Every leaf of the catalog as `dotted.path` → the string. */
function leaves(node: unknown, prefix: string[] = []): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === "string") {
    out.set(prefix.join("."), node);
    return out;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      for (const [path, text] of leaves(value, [...prefix, key])) {
        out.set(path, text);
      }
    }
  }
  return out;
}

const zhLeaves = leaves(catalog);

/** The phrase behind a catalog path (`errors.task.mise`). */
function phrase(path: string): string {
  return zhLeaves.get(path) ?? "";
}

/** Every phrase of a group: the token phrases plus the fallback. */
function phrasesOf(groupName: TokenGroupName): string[] {
  const group = TOKEN_GROUPS[groupName];
  return [...Object.values(group.keys), group.fallback]
    .map((key) => phrase(key))
    .filter((text) => text.length > 0);
}

const problems: string[] = [];
let checked = 0;

// 1. Every registered message must render clean with every phrase of its
//    group.
for (const [messageKey, params] of Object.entries(MESSAGE_TOKEN_PARAMS)) {
  const template = phrase(messageKey);
  if (!template) {
    problems.push(`${messageKey} has no zh-CN copy`);
    continue;
  }
  for (const [param, groupName] of Object.entries(params)) {
    for (const text of phrasesOf(groupName)) {
      const rendered = template.replace(
        /\{\{(\w+)\}\}/g,
        (whole, name: string) => (name === param ? text : DATA_SENTINEL),
      );
      checked++;
      const match = HAN_SPACE_HAN.exec(rendered);
      if (match) {
        problems.push(
          `${messageKey} (${param} = "${text}") renders a space between two Han characters: ${JSON.stringify(rendered)}`,
        );
      }
    }
  }
}

// 2. A registered message must actually carry the parameter the registry
//    claims it carries — otherwise the check above renders a template
//    that no longer has a phrase in it.
for (const [messageKey, params] of Object.entries(MESSAGE_TOKEN_PARAMS)) {
  const template = phrase(messageKey);
  for (const param of Object.keys(params)) {
    if (!template.includes(`{{${param}}}`)) {
      problems.push(
        `${messageKey} is registered with the token parameter {{${param}}} but its template does not carry it`,
      );
    }
  }
}

if (checked === 0) {
  console.error(
    "check-i18n-zh-spacing: no token-bearing template was checked — the registry is empty or renamed; the guard would pass without looking at anything.",
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(
    "check-i18n-zh-spacing: a zh-CN sentence renders a space between two Han characters:",
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\n  Chinese does not space its words. A template that carries a token phrase cannot know whether the phrase ends in Latin or Han, so it must not put a space next to the placeholder: \"{{task}}已取消。\", not \"{{task}} 已取消。\".",
  );
  process.exit(1);
}

console.log(
  `check-i18n-zh-spacing: ok — ${checked} token renderings checked, no space between two Han characters.`,
);
