// Tests for the shared post-write invalidation helper (issue #285).
// Run via `npm run test` (node:test through tsx — no extra framework).

import assert from "node:assert/strict";
import { test } from "node:test";
import type { QueryClient } from "@tanstack/react-query";

import {
  CONFIG_DEPENDENT_FAMILIES,
  CONFIG_DEPENDENT_STALE_TIME,
  configDependentKeys,
  invalidateConfigDependents,
} from "./configDependents";

const CWD = "/Users/dev/proj";

test("configDependentKeys: every config-dependent family, directory cwd first then Global", () => {
  assert.deepEqual(configDependentKeys(CWD), [
    ["tools", "config", CWD],
    ["tools", "config", null],
    ["tools", "lockfile", CWD],
    ["tools", "lockfile", null],
    ["tools", "ls", CWD],
    ["tools", "ls", null],
    ["tools", "env", CWD],
    ["tools", "env", null],
    ["env", "ls", CWD],
    ["env", "ls", null],
    ["tasks", "ls", CWD],
    ["tasks", "ls", null],
    ["plugins", "ls", CWD],
    ["plugins", "ls", null],
  ]);
});

test("configDependentKeys: pinned family list is exactly the documented set", () => {
  // The key set is the contract: a new family needs a deliberate edit
  // here, so an accidental addition or drop fails the gate.
  assert.deepEqual(
    CONFIG_DEPENDENT_FAMILIES.map((f) => [...f]),
    [
      ["tools", "config"],
      ["tools", "lockfile"],
      ["tools", "ls"],
      ["tools", "env"],
      ["env", "ls"],
      ["tasks", "ls"],
      ["plugins", "ls"],
    ],
  );
});

test("configDependentKeys: Global context yields only the Global keys, no duplicates", () => {
  const keys = configDependentKeys(null);
  assert.equal(keys.length, CONFIG_DEPENDENT_FAMILIES.length);
  assert.deepEqual(
    keys,
    CONFIG_DEPENDENT_FAMILIES.map((family) => [...family, null]),
  );
});

test("configDependentKeys: one entry per family per context (no duplicate keys)", () => {
  const keys = configDependentKeys(CWD).map((k) => JSON.stringify(k));
  assert.equal(new Set(keys).size, keys.length);
});

test("configDependentKeys: network-backed outdated and upstream ls-remote stay out", () => {
  const keys = configDependentKeys(CWD).map((k) => k[1]);
  assert.equal(keys.includes("outdated"), false);
  assert.equal(keys.includes("ls-remote"), false);
});

test("invalidateConfigDependents: invalidates exactly the pure key set, in order", () => {
  const invalidated: unknown[] = [];
  const fake = {
    invalidateQueries: (arg: { queryKey: unknown }) => {
      invalidated.push(arg.queryKey);
      return Promise.resolve();
    },
  } as unknown as QueryClient;

  invalidateConfigDependents(fake, CWD);

  assert.deepEqual(invalidated, configDependentKeys(CWD));
});

test("config-dependent reads refetch on mount, not after the app's 30s default", () => {
  assert.equal(CONFIG_DEPENDENT_STALE_TIME, 0);
});
