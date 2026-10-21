import assert from "node:assert/strict";
import test from "node:test";

import { parseTasksLsPayload, taskEditBlock } from "./miseTools";

const CWD = "/work/project";

function task(overrides: Record<string, unknown> = {}) {
  const parsed = parseTasksLsPayload([
    {
      name: "build",
      run: ["echo hi"],
      source: `${CWD}/mise.toml`,
      dir: CWD,
      ...overrides,
    },
  ]);
  assert.equal(parsed.length, 1);
  return parsed[0];
}

test("a plain task defined in the active directory edits inline", () => {
  assert.equal(taskEditBlock(task(), CWD), null);
  // Missing/empty dir means the config's own directory.
  assert.equal(taskEditBlock(task({ dir: "" }), CWD), null);
});

test("a task from another config is scope-blocked", () => {
  assert.equal(
    taskEditBlock(task({ source: "/work/mise.toml", dir: "/work" }), CWD),
    "scope",
  );
  assert.equal(
    taskEditBlock(
      task({
        source: `${CWD}/nested/mise.toml`,
        dir: `${CWD}/nested`,
      }),
      CWD,
    ),
    "scope",
  );
  assert.equal(taskEditBlock(task(), null), "scope");
});

test("a file task is scope-blocked", () => {
  assert.equal(
    taskEditBlock(task({ file: `${CWD}/mise-tasks/build` }), CWD),
    "scope",
  );
});

test("fields the form cannot write block inline edit", () => {
  for (const extra of [
    { aliases: ["b"] },
    { dir: `${CWD}/sub` },
    { hide: true },
    { shell: "bash" },
    { sources: ["src/**"] },
    { outputs: ["dist/**"] },
    { env: ["FOO=bar"] },
    { depends_post: ["clean"] },
    { wait_for: ["db"] },
    { quiet: true },
    { silent: true },
    { raw: true },
    { interactive: true },
    { tools: { node: "22" } },
    { timeout: 10 },
    { usage: "build [--release]" },
    { args: ["--release"] },
  ]) {
    assert.equal(
      taskEditBlock(task(extra), CWD),
      "lossy",
      JSON.stringify(extra),
    );
  }
});

test("a task with no run cannot be saved by the form", () => {
  assert.equal(taskEditBlock(task({ run: [] }), CWD), "lossy");
});
