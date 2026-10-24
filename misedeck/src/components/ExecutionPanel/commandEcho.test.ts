// Tests for the terminal-perspective command echo (issue #191): Global
// mode (`cwd === null`) renders the bare command body — no `-C $HOME` —
// while Directory mode keeps `-C <dir>` inline. The runner still anchors
// Global mode at `-C $HOME` internally (issue #179); only the echo
// changes. Run via `npm run test` (node:test through tsx).
//
// Issue #229 adds two invariants:
//   * the install echo follows the platform the executor runs on
//     (PowerShell on Windows, sh elsewhere) — it used to be
//     Unix-only, so "copy command" could not reproduce the run;
//   * argv tokens are single-quoted the way a shell needs them, so a
//     pasted `$HOME` / `$(…)` / backtick / `!` stays literal.
//
// The platform is injected, never read from `navigator`, so all three
// branches run on every OS in CI.

import assert from "node:assert/strict";
import { test } from "node:test";

import { commandEcho, hostPlatform } from "./commandEcho";

test("global mode omits -C $HOME from the mise echo", () => {
  assert.equal(
    commandEcho("mise", null, ["use", "-g", "go@1.26.7"]),
    "mise use -g go@1.26.7",
  );
  assert.equal(
    commandEcho("mise", null, ["unuse", "-g", "ant"]),
    "mise unuse -g ant",
  );
});

test("directory mode keeps -C <dir> inline", () => {
  assert.equal(
    commandEcho("mise", "/work/proj", ["use", "go@1.26.7"]),
    "mise -C /work/proj use go@1.26.7",
  );
});

test("shell-inert tokens stay bare on every platform", () => {
  for (const platform of ["windows", "macos", "linux"] as const) {
    assert.equal(
      commandEcho("mise", null, ["set", "KEY", "v1.2.3"], platform),
      "mise set KEY v1.2.3",
    );
  }
});

test("arguments containing spaces are single-quoted in both modes", () => {
  assert.equal(
    commandEcho("mise", null, ["set", "A B", "v"]),
    "mise set 'A B' v",
  );
  assert.equal(
    commandEcho("mise", "/work/proj", ["set", "A B", "v"]),
    "mise -C /work/proj set 'A B' v",
  );
});

test("a cwd containing spaces is quoted like any other argv token", () => {
  assert.equal(
    commandEcho("mise", "/Users/me/My Project", ["use", "go@1.26.7"]),
    "mise -C '/Users/me/My Project' use go@1.26.7",
  );
  assert.equal(
    commandEcho("selfUpdate", "/Users/me/My Project", []),
    "mise -C '/Users/me/My Project' self-update --yes",
  );
});

// Self-update used to be carved out of #191 and kept `-C $HOME` in the
// Global-mode echo. It was a scope boundary, not a rule: the anchor is
// the runner's, and a terminal user updating mise types the bare
// command. The working-directory line is what discloses the anchor.
test("self-update echo drops -C $HOME in global mode too", () => {
  assert.equal(commandEcho("selfUpdate", null, []), "mise self-update --yes");
});

// Issue #229: the echo promises a command line the user can paste.
// JSON quoting only fired on space/tab, so every other shell
// metacharacter changed meaning on the way to the terminal.
test("shell metacharacters are neutralised by single quotes", () => {
  assert.equal(
    commandEcho("mise", null, ["set", "URL", "$HOME/bin"]),
    "mise set URL '$HOME/bin'",
  );
  assert.equal(
    commandEcho("mise", null, ["set", "EVIL", "$(rm -rf /)"]),
    "mise set EVIL '$(rm -rf /)'",
  );
  assert.equal(
    commandEcho("mise", null, ["set", "B", "`whoami`"]),
    "mise set B '`whoami`'",
  );
  assert.equal(
    commandEcho("mise", null, ["set", "P", "a&b|c;d"]),
    "mise set P 'a&b|c;d'",
  );
  assert.equal(
    commandEcho("mise", null, ["set", "HI", "hello!"]),
    "mise set HI 'hello!'",
  );
  // Tabs are metacharacters for the shell's word splitter too.
  assert.equal(commandEcho("mise", null, ["set", "T", "a\tb"]), "mise set T 'a\tb'");
});

test("an embedded single quote is escaped the way the target shell needs", () => {
  // POSIX: close the quote, emit an escaped quote, reopen.
  assert.equal(
    commandEcho("mise", null, ["set", "Q", "it's"], "macos"),
    "mise set Q 'it'\\''s'",
  );
  assert.equal(
    commandEcho("mise", null, ["set", "Q", "it's"], "linux"),
    "mise set Q 'it'\\''s'",
  );
  // PowerShell doubles the quote inside a single-quoted string.
  assert.equal(
    commandEcho("mise", null, ["set", "Q", "it's"], "windows"),
    "mise set Q 'it''s'",
  );
});

test("the empty value is quoted so the shell still sees the token", () => {
  assert.equal(commandEcho("mise", null, ["set", "EMPTY", ""]), "mise set EMPTY ''");
});

// Issue #229: the executor runs `curl … | sh` on unix and
// `powershell -Command "irm … | iex"` on Windows; the echo must take
// the same branch or "copy command" cannot reproduce the run.
test("install echo follows the platform", () => {
  assert.equal(
    commandEcho("install", null, [], "windows"),
    "irm https://mise.jdx.dev/install.ps1 | iex",
  );
  assert.equal(
    commandEcho("install", null, [], "macos"),
    "curl -fsSL https://mise.jdx.dev/install.sh | sh",
  );
  assert.equal(
    commandEcho("install", null, [], "linux"),
    "curl -fsSL https://mise.jdx.dev/install.sh | sh",
  );
});

test("install echo is platform-independent of cwd and args", () => {
  assert.equal(
    commandEcho("install", "/work/proj", ["install", "(official script)"], "windows"),
    "irm https://mise.jdx.dev/install.ps1 | iex",
  );
});

test("hostPlatform classifies the webview user agent", () => {
  assert.equal(
    hostPlatform(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 Edg/126",
    ),
    "windows",
  );
  assert.equal(
    hostPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15"),
    "macos",
  );
  assert.equal(
    hostPlatform("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15"),
    "linux",
  );
  // An unknown agent falls through to the sh-based install, which is
  // right for every POSIX platform.
  assert.equal(hostPlatform("MiseDeck/1.0"), "linux");
});
