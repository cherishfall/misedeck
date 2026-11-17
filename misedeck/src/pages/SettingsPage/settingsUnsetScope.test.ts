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

// Issue #305: mise reports source paths canonically (macOS /tmp is a
// symlink to /private/tmp), so the caller must pass the canonical cwd
// (resolved through the backend's `canonicalize_cwd`). The raw path
// misclasses the active directory's own config as out of scope and
// wrongly disables Unset; the canonical one keeps it enabled.
test("A canonical cwd keeps the symlinked active directory's row in scope", () => {
  // The bug, kept as documentation: raw cwd vs canonical source.
  assert.equal(settingsUnsetInScope("/private/tmp/x/mise.toml", "/tmp/x", false), false);
  // Canonical against canonical: the row is the cwd's own config.
  assert.equal(settingsUnsetInScope("/private/tmp/x/mise.toml", "/private/tmp/x", false), true);
  // A genuine ancestor source through the canonical prefix stays in
  // scope (unset writes the nearest local config, which shadows it).
  assert.equal(settingsUnsetInScope("/private/tmp/mise.toml", "/private/tmp/x", false), true);
});
