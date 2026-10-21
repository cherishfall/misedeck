// Tests for the settings list argv (issue #273).

import assert from "node:assert/strict";
import { test } from "node:test";

import { settingsLsArgs } from "./settingsLsArgs";

test("settingsLsArgs: the default view scopes to the directory config", () => {
  assert.deepEqual(settingsLsArgs(false, true), [
    "settings",
    "ls",
    "--json-extended",
    "--local",
  ]);
});

test("settingsLsArgs: Show all drops --local so defaults and global rows appear", () => {
  assert.deepEqual(settingsLsArgs(true, true), [
    "settings",
    "ls",
    "--json-extended",
    "--all",
  ]);
});

test("settingsLsArgs: Global mode never passes --local", () => {
  assert.deepEqual(settingsLsArgs(false, false), [
    "settings",
    "ls",
    "--json-extended",
  ]);
  assert.deepEqual(settingsLsArgs(true, false), [
    "settings",
    "ls",
    "--json-extended",
    "--all",
  ]);
});
