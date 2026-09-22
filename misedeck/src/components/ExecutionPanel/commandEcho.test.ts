// Tests for the terminal-perspective command echo (issue #191): Global
// mode (`cwd === null`) renders the bare command body — no `-C $HOME` —
// while Directory mode keeps `-C <dir>` inline. The runner still anchors
// Global mode at `-C $HOME` internally (issue #179); only the echo
// changes. Run via `npm run test` (node:test through tsx).

import assert from "node:assert/strict";
import { test } from "node:test";

import { commandEcho } from "./commandEcho";

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

test("arguments containing spaces are JSON-quoted in both modes", () => {
  assert.equal(
    commandEcho("mise", null, ["set", "A B", "v"]),
    'mise set "A B" v',
  );
  assert.equal(
    commandEcho("mise", "/work/proj", ["set", "A B", "v"]),
    'mise -C /work/proj set "A B" v',
  );
});

test("self-update echo is out of #191 scope and keeps -C $HOME", () => {
  assert.equal(
    commandEcho("selfUpdate", null, []),
    "mise -C $HOME self-update --yes",
  );
});

test("install echo is the fixed install script", () => {
  assert.equal(
    commandEcho("install", null, []),
    "curl -fsSL https://mise.jdx.dev/install.sh | sh",
  );
});
