import assert from "node:assert/strict";
import { test } from "node:test";

import { settingsUnsetInScope } from "./settingsUnsetScope";

test("Global mode accepts a global-config source", () => {
  assert.equal(
    settingsUnsetInScope("/Users/me/.config/mise/config.toml", null, false),
    true,
  );
});

test("Global mode rejects a project-sourced row", () => {
  assert.equal(
    settingsUnsetInScope("/Users/me/project/mise.toml", null, false),
    false,
  );
});

test("Directory mode accepts a config in the cwd or an ancestor", () => {
  assert.equal(
    settingsUnsetInScope("/Users/me/project/mise.toml", "/Users/me/project", false),
    true,
  );
  assert.equal(
    settingsUnsetInScope("/Users/me/mise.toml", "/Users/me/project", false),
    true,
  );
});

test("Directory mode rejects a config outside the cwd tree", () => {
  assert.equal(
    settingsUnsetInScope("/Users/me/other/mise.toml", "/Users/me/project", false),
    false,
  );
});

test("Directory mode rejects a global-config source even inside the cwd tree", () => {
  assert.equal(
    settingsUnsetInScope("/Users/me/.config/mise/config.toml", "/Users/me", false),
    false,
  );
});

test("Sourceless rows follow the view: explicit in scope, --all out of scope", () => {
  assert.equal(settingsUnsetInScope(undefined, null, false), true);
  assert.equal(settingsUnsetInScope(undefined, null, true), false);
});
