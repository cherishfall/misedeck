// Tests for the run-draft splitter that backs the task form's
// save (issue #161) and the task run arguments (issue #260). Run
// via `npm run test` (node:test through tsx — no extra framework).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isEnvWriteScopeMismatch,
  miseRunTaskArgs,
  parseDoctorPayload,
  parseInstalledPlugin,
  parseLsRemotePayload,
  parseOutdatedItem,
  parseRegistryItem,
  parseRunInput,
  splitShellWords,
} from "./miseTools";

// Wire-shape guard for `mise ls-remote --json <tool>` (issue #224):
// rows lifted verbatim from the real `mise ls-remote --json node`
// output (verified against mise 2026.10.15). mise emits snake_case
// `created_at`; the parser used to read a camelCase `createdAt`, so
// the Created column rendered "—" everywhere and filtering by a date
// fragment never matched. Pin the exact field here so it cannot drift
// again — the fixture payload (`src-tauri/tests/fixtures/mise/
// ls-remote---json-go/stdout`) already ships the same field.
test("parseLsRemotePayload: reads mise's snake_case created_at", () => {
  const payload = [
    { version: "0.1.14", created_at: "2011-08-26T00:00:00.0Z" },
    { version: "0.1.15", created_at: "2011-08-26T00:00:00.0Z" },
    { version: "22.11.0", created_at: "2024-10-29T00:00:00.0Z" },
  ];
  assert.deepEqual(parseLsRemotePayload(payload), [
    { version: "0.1.14", createdAt: "2011-08-26T00:00:00.0Z" },
    { version: "0.1.15", createdAt: "2011-08-26T00:00:00.0Z" },
    { version: "22.11.0", createdAt: "2024-10-29T00:00:00.0Z" },
  ]);
});

test("parseLsRemotePayload: a row without created_at keeps the column's em-dash fallback", () => {
  assert.deepEqual(parseLsRemotePayload([{ version: "1.0.0" }]), [
    { version: "1.0.0", createdAt: undefined },
  ]);
});

test("parseLsRemotePayload: a non-array payload yields no rows", () => {
  assert.deepEqual(parseLsRemotePayload({ version: "1.0.0" }), []);
  assert.deepEqual(parseLsRemotePayload(null), []);
});

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

// `splitShellWords` also backs the optional arguments field on the
// task run dialog (issue #260). These pin the argv shapes the builder
// receives — the words are passed to mise after `--`, never joined
// into a shell command line.
test("splitShellWords: empty and whitespace-only input yields no words", () => {
  assert.deepEqual(splitShellWords(""), []);
  assert.deepEqual(splitShellWords("   \t\r"), []);
});

test("splitShellWords: flags, quoted phrases, and spaces stay distinct words", () => {
  assert.deepEqual(
    splitShellWords('--release "hello world" --flag=value two words'),
    ["--release", "hello world", "--flag=value", "two", "words"],
  );
});

test("splitShellWords: an empty quoted argument survives", () => {
  assert.deepEqual(splitShellWords('--name ""'), ["--name", ""]);
});

test("splitShellWords: an escaped space joins one word", () => {
  assert.deepEqual(splitShellWords("hello\\ world"), ["hello world"]);
});

test("miseRunTaskArgs: no arguments keeps the plain run argv", () => {
  assert.deepEqual(miseRunTaskArgs("build"), ["run", "build"]);
});

test("miseRunTaskArgs: an empty argument list adds no --", () => {
  assert.deepEqual(miseRunTaskArgs("build", splitShellWords("   ")), [
    "run",
    "build",
  ]);
});

test("miseRunTaskArgs: split words stay verbatim argv elements after --", () => {
  const argv = miseRunTaskArgs(
    "deploy",
    splitShellWords('staging "hello world" --flag=value'),
  );
  assert.deepEqual(argv, [
    "run",
    "deploy",
    "--",
    "staging",
    "hello world",
    "--flag=value",
  ]);
  // The quoted phrase is one element, not two rejoined words.
  assert.equal(argv.length, 6);
});

// Write-scope check for env rows (issue #182): the write target is
// chosen by the mode, so a row whose sourcePath sits on the other side
// is a mismatch the confirm dialog must warn about.
test("isEnvWriteScopeMismatch: directory mode flags a global config source", () => {
  assert.equal(isEnvWriteScopeMismatch("/home/u/.config/mise/config.toml", "/repo"), true);
  assert.equal(isEnvWriteScopeMismatch(String.raw`C:\Users\u\.config\mise\config.toml`, String.raw`C:\repo`), true);
});

test("isEnvWriteScopeMismatch: directory mode accepts a current-directory config source", () => {
  assert.equal(isEnvWriteScopeMismatch("/repo/mise.toml", "/repo"), false);
  assert.equal(isEnvWriteScopeMismatch("/repo/.mise/config.toml", "/repo"), false);
});

// A parent config is outside the active directory: `mise unset` exits 0
// without removing the value, and `mise set` only shadows it (#268).
test("isEnvWriteScopeMismatch: directory mode flags a parent config source", () => {
  assert.equal(isEnvWriteScopeMismatch("/repo/mise.toml", "/repo/child"), true);
  assert.equal(isEnvWriteScopeMismatch(String.raw`C:\repo\mise.toml`, String.raw`C:\repo\child`), true);
});

test("isEnvWriteScopeMismatch: directory mode is segment-aware and case-folded", () => {
  // `/repo/childhood` is not inside `/repo/child`.
  assert.equal(isEnvWriteScopeMismatch("/repo/childhood/mise.toml", "/repo/child"), true);
  // macOS/Windows case differences on the same directory stay in scope.
  assert.equal(isEnvWriteScopeMismatch("/Repo/Mise.toml", "/repo"), false);
});

test("isEnvWriteScopeMismatch: global mode accepts only the global config", () => {
  assert.equal(isEnvWriteScopeMismatch("/home/u/.config/mise/config.toml", null), false);
  assert.equal(isEnvWriteScopeMismatch(String.raw`C:\Users\u\.config\mise\config.toml`, null), false);
  assert.equal(isEnvWriteScopeMismatch("/repo/mise.toml", null), true);
});

// Wire-shape guard for `mise outdated --json` (issue #259). Without
// `--bump`, mise reports only in-range targets; the retired `bump`
// field is not part of the row any more. Captured from mise
// 2026.10.15 on this repo (a pinned tool that only has an out-of-range
// release does not appear at all).
test("parseOutdatedItem: reads the in-range latest and drops bump", () => {
  const row = parseOutdatedItem({
    name: "rust",
    requested: "latest",
    current: "stable",
    bump: null,
    latest: "stable",
  });
  assert.deepEqual(row, {
    name: "rust",
    requested: "latest",
    current: "stable",
    latest: "stable",
    source: undefined,
  });
  assert.ok(!("bump" in (row as object)), "bump must not survive parsing");
});

// `mise plugins ls --urls` is a four-column table; the app pipes it so
// mise prints no header (verified against mise 2026.10.15). A plugin
// with no remote prints its name alone — the Source cell must render
// "—" and never borrow the ref (issue #259).
test("parseInstalledPlugin: keeps url, ref, and sha", () => {
  const row = parseInstalledPlugin({
    name: "direnv",
    url: "https://github.com/asdf-community/asdf-direnv.git",
    ref: "HEAD",
    sha: "0c76b16",
  });
  assert.deepEqual(row, {
    name: "direnv",
    url: "https://github.com/asdf-community/asdf-direnv.git",
    ref: "HEAD",
    sha: "0c76b16",
    source: "https://github.com/asdf-community/asdf-direnv.git",
  });
});

test("parseInstalledPlugin: an absent URL leaves source undefined", () => {
  const row = parseInstalledPlugin({ name: "asdf-demo", url: "", ref: "", sha: "" });
  assert.equal(row?.source, undefined);
  assert.equal(row?.url, undefined);
  assert.equal(row?.name, "asdf-demo");
});

test("parseDoctorPayload: maps the errors array", () => {
  const payload = parseDoctorPayload({
    warnings: ["a warning"],
    errors: ["config file is not trusted: ~/project/mise.toml"],
  });
  assert.deepEqual(payload.errors, ["config file is not trusted: ~/project/mise.toml"]);
  assert.deepEqual(payload.warnings, ["a warning"]);
});

test("parseRegistryItem: keeps bins for the lowest search tier", () => {
  const row = parseRegistryItem({
    short: "1password",
    backends: ["aqua:1password/cli"],
    bins: ["op"],
    description: "Password manager",
    aliases: ["1password-cli"],
  });
  assert.deepEqual(row?.bins, ["op"]);
});
