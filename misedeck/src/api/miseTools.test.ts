// Tests for the run-draft splitter that backs the task form's
// save (issue #161). Run via `npm run test` (node:test through
// tsx — no extra framework).

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseRunInput } from "./miseTools";

test("parseRunInput: splits a single line into shell words", () => {
  assert.deepEqual(parseRunInput("npm run build"), ["npm", "run", "build"]);
});

test("parseRunInput: multiple lines contribute words in order", () => {
  assert.deepEqual(parseRunInput("npm ci\nnpm run build"), [
    "npm",
    "ci",
    "npm",
    "run",
    "build",
  ]);
});

test("parseRunInput: drops blank and whitespace-only lines", () => {
  assert.deepEqual(parseRunInput("echo one\n\necho two\n"), [
    "echo",
    "one",
    "echo",
    "two",
  ]);
});

test("parseRunInput: double-quoted segment stays one word, quotes stripped", () => {
  assert.deepEqual(parseRunInput('echo "hello world"'), ["echo", "hello world"]);
});

test("parseRunInput: single-quoted segment stays one word, quotes stripped", () => {
  assert.deepEqual(parseRunInput("echo 'hi there'"), ["echo", "hi there"]);
});

test("parseRunInput: empty quoted argument survives", () => {
  assert.deepEqual(parseRunInput('echo ""'), ["echo", ""]);
});

test("parseRunInput: backslash escape keeps a space inside one word", () => {
  assert.deepEqual(parseRunInput("echo a\\ b"), ["echo", "a b"]);
});

test("parseRunInput: metacharacter words pass through verbatim", () => {
  assert.deepEqual(parseRunInput("npm run build && npm test"), [
    "npm",
    "run",
    "build",
    "&&",
    "npm",
    "test",
  ]);
});

test("parseRunInput: apostrophe inside double quotes is ordinary text", () => {
  assert.deepEqual(parseRunInput('echo "it\'s" ok'), ["echo", "it's", "ok"]);
});

test("parseRunInput: unbalanced quote keeps the whole line as one literal word", () => {
  assert.deepEqual(parseRunInput("echo 'unclosed"), ["echo 'unclosed"]);
  assert.deepEqual(parseRunInput("echo it's fine"), ["echo it's fine"]);
});
