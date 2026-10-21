// Tests for the run-draft splitter that backs the task form's
// save (issue #161) and the task run arguments (issue #260). Run
// via `npm run test` (node:test through tsx — no extra framework).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  configScopeForPath,
  isConfigFilesResult,
  isDoctorPayload,
  isEnvWriteScopeMismatch,
  miseRunTaskArgs,
  parseDoctorPayload,
  parseEnvExtendedPayload,
  parseFailedError,
  parseInstalledPlugin,
  parseLsRemotePayload,
  parseOutdatedItem,
  parseReadPayload,
  parseRegistryItem,
  parseRunInput,
  readDoctorPayload,
  readEnvExtendedPayload,
  readEnvPayload,
  readLsRemotePayload,
  readOutdatedPayload,
  readPluginsLsPayload,
  readRegistryPayload,
  readSettingsPayload,
  readTasksLsPayload,
  readToolsLsPayload,
  reconcileEnvSources,
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

// ---------- Top-level shape validation (issue #270) ----------
//
// The Rust boundary guarantees valid JSON, not the documented shape.
// A wrong top-level shape must become a PARSE_FAILED error — coercing
// it to `[]`/`{}` used to render a valid-looking empty page, and
// doctor's `{}` a green "Status: OK".

function assertParseFailed(
  parsed: { data: unknown; error: { kind: string; err?: { code: string; message: string } } | null },
  detail: RegExp,
) {
  assert.equal(parsed.data, null);
  assert.ok(parsed.error && parsed.error.kind === "err");
  assert.equal(parsed.error.err?.code, "PARSE_FAILED");
  assert.match(parsed.error.err?.message ?? "", detail);
}

test("parseReadPayload: a rejected shape is a PARSE_FAILED error, an accepted one parses", () => {
  const rejected = parseReadPayload(
    [],
    (v) => v !== null && typeof v === "object" && !Array.isArray(v),
    "expected an object",
    () => ({ ok: true }),
  );
  assertParseFailed(rejected, /expected an object/);

  const accepted = parseReadPayload({ a: 1 }, () => true, "unused", () => 42);
  assert.deepEqual(accepted, { data: 42, error: null });
});

test("parseFailedError: carries the detail and an empty stderr", () => {
  assert.deepEqual(parseFailedError("detail"), {
    code: "PARSE_FAILED",
    message: "detail",
    stderr: "",
  });
});

test("readToolsLsPayload: an object parses, a bare array is rejected", () => {
  const ok = readToolsLsPayload({ node: [{ version: "22.0.0", installed: true, active: true }] });
  assert.equal(ok.error, null);
  assert.deepEqual(ok.data?.map((g) => g.tool), ["node"]);

  assertParseFailed(readToolsLsPayload([{ version: "22.0.0" }]), /object keyed by tool/);
  assertParseFailed(readToolsLsPayload("nope"), /object keyed by tool/);
});

test("readOutdatedPayload: an object parses, a bare array is rejected", () => {
  const ok = readOutdatedPayload({ node: { name: "node", latest: "22.1.0" } });
  assert.equal(ok.error, null);
  assert.equal(ok.data?.[0].name, "node");

  assertParseFailed(readOutdatedPayload([]), /object keyed by tool/);
});

test("readLsRemotePayload: an array parses, an object is rejected", () => {
  const ok = readLsRemotePayload([{ version: "1.0.0" }]);
  assert.equal(ok.error, null);
  assert.equal(ok.data?.[0].version, "1.0.0");

  assertParseFailed(readLsRemotePayload({ version: "1.0.0" }), /did not return an array/);
});

test("readEnvPayload: an object parses, an array is rejected", () => {
  const ok = readEnvPayload({ FOO: "bar" });
  assert.equal(ok.error, null);
  assert.equal(ok.data?.[0].name, "FOO");

  assertParseFailed(readEnvPayload(["FOO"]), /object keyed by variable/);
});

test("readEnvExtendedPayload: an object parses, an array is rejected", () => {
  const ok = readEnvExtendedPayload({ FOO: { value: "bar" } });
  assert.equal(ok.error, null);
  assert.equal(ok.data?.[0].value, "bar");

  assertParseFailed(readEnvExtendedPayload([{ name: "FOO" }]), /object keyed by variable/);
});

test("readTasksLsPayload: an array parses, an object is rejected", () => {
  const ok = readTasksLsPayload([{ name: "build", run: ["echo"] }]);
  assert.equal(ok.error, null);
  assert.equal(ok.data?.[0].name, "build");

  assertParseFailed(readTasksLsPayload({ tasks: [] }), /did not return an array/);
});

test("readSettingsPayload: an object parses, an array is rejected", () => {
  const ok = readSettingsPayload({ experimental: { value: true } });
  assert.equal(ok.error, null);
  assert.equal(ok.data?.[0].key, "experimental");

  assertParseFailed(readSettingsPayload([]), /object keyed by setting/);
});

test("readRegistryPayload: an array parses, an object is rejected", () => {
  const ok = readRegistryPayload([{ short: "node" }]);
  assert.equal(ok.error, null);
  assert.equal(ok.data?.[0].short, "node");

  assertParseFailed(readRegistryPayload({ node: {} }), /did not return an array/);
});

test("readPluginsLsPayload: an array parses, an object is rejected", () => {
  const ok = readPluginsLsPayload([{ name: "direnv" }]);
  assert.equal(ok.error, null);
  assert.equal(ok.data?.[0].name, "direnv");

  assertParseFailed(readPluginsLsPayload({ direnv: {} }), /did not return an array/);
});

test("isDoctorPayload: a version or the rawLines fallback is a report, anything else is not", () => {
  assert.equal(isDoctorPayload({ version: "2026.10.15" }), true);
  assert.equal(isDoctorPayload({ rawLines: [] }), true);
  assert.equal(isDoctorPayload({ rawLines: [{ text: "ok", status: "ok" }] }), true);

  assert.equal(isDoctorPayload({}), false);
  assert.equal(isDoctorPayload({ unexpected: true }), false);
  assert.equal(isDoctorPayload({ version: 1 }), false);
  assert.equal(isDoctorPayload({ rawLines: "text" }), false);
  assert.equal(isDoctorPayload([]), false);
  assert.equal(isDoctorPayload(null), false);
});

test("readDoctorPayload: an unusable object never becomes a green report", () => {
  const ok = readDoctorPayload({ version: "2026.10.15", warnings: [], errors: [] });
  assert.equal(ok.error, null);
  assert.equal(ok.data?.version, "2026.10.15");

  assertParseFailed(readDoctorPayload({}), /unrecognized report object/);
  assertParseFailed(readDoctorPayload({ unexpected: true }), /unrecognized report object/);
  assertParseFailed(readDoctorPayload([]), /unrecognized report object/);
});

test("isConfigFilesResult: accepts the documented ok/err union only", () => {
  const row = { path: "/p/mise.toml", tools: ["node"], override: false, content: "x" };
  assert.equal(isConfigFilesResult({ kind: "ok", files: [row] }), true);
  assert.equal(isConfigFilesResult({ kind: "ok", files: [] }), true);
  assert.equal(
    isConfigFilesResult({
      kind: "err",
      err: { code: "COMMAND_FAILED", message: "boom", stderr: "boom" },
    }),
    true,
  );

  assert.equal(isConfigFilesResult({ kind: "ok" }), false);
  assert.equal(isConfigFilesResult({ kind: "ok", files: [{ path: "/p" }] }), false);
  assert.equal(
    isConfigFilesResult({ kind: "ok", files: [{ ...row, tools: "node" }] }),
    false,
  );
  assert.equal(
    isConfigFilesResult({ kind: "ok", files: [{ ...row, content: 1 }] }),
    false,
  );
  assert.equal(isConfigFilesResult({ kind: "err", err: { code: "X" } }), false);
  assert.equal(isConfigFilesResult({ kind: "other" }), false);
  assert.equal(isConfigFilesResult(null), false);
  assert.equal(isConfigFilesResult([]), false);
});

// Issue #274: a config outside the active directory is a parent
// config, not the global one; the global one is recognised by its
// documented path wherever it sits.
test("configScopeForPath: cwd, parent, and global configs classify apart", () => {
  const cwd = "/Users/demo/project";
  assert.equal(configScopeForPath("/Users/demo/project/mise.toml", cwd), "project");
  assert.equal(configScopeForPath("/Users/demo/mise.toml", cwd), "parent");
  assert.equal(
    configScopeForPath("/Users/demo/.config/mise/config.toml", cwd),
    "global",
  );
  // A global config can sit inside the directory tree; it is still
  // global, never project.
  assert.equal(
    configScopeForPath("/Users/demo/project/.config/mise/config.toml", cwd),
    "global",
  );
  assert.equal(configScopeForPath(undefined, cwd), undefined);
});

test("parseEnvExtendedPayload: Directory mode tags parent config rows as parent", () => {
  const rows = parseEnvExtendedPayload(
    {
      FROM_PROJECT: { value: "1", source: "/Users/demo/project/mise.toml" },
      FROM_PARENT: { value: "2", source: "/Users/demo/mise.toml" },
      FROM_GLOBAL: {
        value: "3",
        source: "/Users/demo/.config/mise/config.toml",
      },
      FROM_TOOL: { value: "4", tool: "rust" },
    },
    "/Users/demo/project",
  );
  const byName = new Map(rows.map((r) => [r.name, r]));
  assert.equal(byName.get("FROM_PROJECT")?.source, "project");
  assert.equal(byName.get("FROM_PARENT")?.source, "parent");
  assert.equal(byName.get("FROM_PARENT")?.sourcePath, "/Users/demo/mise.toml");
  assert.equal(byName.get("FROM_GLOBAL")?.source, "global");
  assert.equal(byName.get("FROM_TOOL")?.source, "tool");
});

test("reconcileEnvSources: a parent tag survives the global cross-check", () => {
  const entries = [
    {
      name: "FROM_PARENT",
      value: "2",
      source: "parent" as const,
      sourcePath: "/Users/demo/mise.toml",
    },
  ];
  reconcileEnvSources(entries, []);
  assert.equal(entries[0].source, "parent");
});
