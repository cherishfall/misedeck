// Tests for the execution panel's history lifecycle state machine
// (issue #180): the finished-run cap, single-entry close, clear, and the
// running-run protections. Run via `npm run test` (node:test through tsx).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executionReducer,
  MAX_FINISHED_RUNS,
  type ExecState,
  type RunEntry,
} from "./executionState";

function emptyState(): ExecState {
  return { runs: [], activeRunId: null, isOpen: false };
}

/** Drive one run from start to a finished status, returning the new state. */
function startRun(state: ExecState, id: string): ExecState {
  return executionReducer(state, {
    type: "start",
    id,
    kind: "mise",
    request: { cwd: null, args: [id] },
  });
}

function finishRun(state: ExecState, id: string, exitCode = 0): ExecState {
  return executionReducer(state, { type: "exit", id, exitCode, durationMs: 10 });
}

/** `n` finished runs followed by the given still-running ids, in order. */
function historyWith(
  finishedIds: string[],
  runningIds: string[] = [],
): ExecState {
  let state = emptyState();
  for (const id of finishedIds) {
    state = finishRun(startRun(state, id), id);
  }
  for (const id of runningIds) {
    state = startRun(state, id);
  }
  return state;
}

function ids(state: ExecState): string[] {
  return state.runs.map((r) => r.id);
}

test("cap: starting a 5th finished run prunes the oldest finished", () => {
  let state = historyWith(["a", "b", "c"]);
  assert.deepEqual(ids(state), ["a", "b", "c"]);
  // Prune happens when a new command *starts*; the new run is still
  // running then, so the 4 finished entries only overfill the cap of 3
  // once a 5th command starts.
  state = finishRun(startRun(state, "d"), "d");
  assert.deepEqual(ids(state), ["a", "b", "c", "d"]);
  state = startRun(state, "e");
  assert.deepEqual(ids(state), ["b", "c", "d", "e"]);
  assert.equal(MAX_FINISHED_RUNS, 3);
});

test("cap: running runs do not count and are never pruned", () => {
  let state = historyWith(["a", "b", "c"], ["r1"]);
  state = startRun(state, "r2");
  // 3 finished (at cap) + 2 running — nothing is dropped.
  assert.deepEqual(ids(state), ["a", "b", "c", "r1", "r2"]);
  state = startRun(state, "d");
  assert.deepEqual(ids(state), ["a", "b", "c", "r1", "r2", "d"]);
  // Once d finishes, 4 finished overfill the cap; the next start prunes
  // the oldest finished only — running runs survive.
  state = finishRun(state, "d");
  state = startRun(state, "e");
  assert.deepEqual(ids(state), ["b", "c", "r1", "r2", "d", "e"]);
});

test("removeRun: a finished run is removed", () => {
  const state = historyWith(["a", "b"], ["r1"]);
  const next = executionReducer(state, { type: "removeRun", id: "a" });
  assert.deepEqual(ids(next), ["b", "r1"]);
  assert.equal(next.activeRunId, "r1");
});

test("removeRun: a running run is protected and cannot be removed", () => {
  const state = historyWith(["a"], ["r1"]);
  const next = executionReducer(state, { type: "removeRun", id: "r1" });
  assert.equal(next, state);
  assert.deepEqual(ids(next), ["a", "r1"]);
});

test("removeRun: an unknown id leaves state untouched", () => {
  const state = historyWith(["a"]);
  const next = executionReducer(state, { type: "removeRun", id: "nope" });
  assert.equal(next, state);
});

test("removeRun: removing the active run falls back to the most recent remaining", () => {
  let state = historyWith(["a", "b", "c"]);
  assert.equal(state.activeRunId, "c");
  state = executionReducer(state, { type: "removeRun", id: "c" });
  assert.equal(state.activeRunId, "b");
  assert.deepEqual(ids(state), ["a", "b"]);
});

test("removeRun: removing the last run falls back to the idle state", () => {
  let state = historyWith(["a"]);
  assert.equal(state.activeRunId, "a");
  state = executionReducer(state, { type: "removeRun", id: "a" });
  assert.deepEqual(state.runs, []);
  assert.equal(state.activeRunId, null);
});

test("removeRun: removing an inactive run keeps the active selection", () => {
  let state = historyWith(["a", "b", "c"]);
  state = executionReducer(state, { type: "select", id: "a" });
  state = executionReducer(state, { type: "removeRun", id: "b" });
  assert.equal(state.activeRunId, "a");
  assert.deepEqual(ids(state), ["a", "c"]);
});

test("clearRuns: clears finished runs and keeps running runs", () => {
  let state = historyWith(["a", "b", "c"], ["r1", "r2"]);
  state = executionReducer(state, { type: "clearRuns" });
  assert.deepEqual(ids(state), ["r1", "r2"]);
});

test("clearRuns: with only finished runs, falls back to the idle state", () => {
  let state = historyWith(["a", "b"]);
  state = executionReducer(state, { type: "clearRuns" });
  assert.deepEqual(state.runs, []);
  assert.equal(state.activeRunId, null);
});

test("clearRuns: a running active run stays active", () => {
  let state = historyWith(["a", "b"], ["r1"]);
  state = executionReducer(state, { type: "clearRuns" });
  assert.equal(state.activeRunId, "r1");
});

test("clearRuns: a finished active run falls back to the most recent running", () => {
  let state = historyWith(["a", "b"], ["r1", "r2"]);
  state = executionReducer(state, { type: "select", id: "a" });
  state = executionReducer(state, { type: "clearRuns" });
  assert.equal(state.activeRunId, "r2");
  assert.deepEqual(ids(state), ["r1", "r2"]);
});

test("clearRuns: with nothing finished, state is untouched", () => {
  const state = historyWith([], ["r1", "r2"]);
  const next = executionReducer(state, { type: "clearRuns" });
  assert.equal(next, state);
});

test("cancelled runs are finished and closable like any finished run", () => {
  let state = startRun(emptyState(), "a");
  state = executionReducer(state, { type: "cancel", id: "a" });
  const entry = state.runs.find((r) => r.id === "a") as RunEntry;
  assert.equal(entry.status, "cancelled");
  const next = executionReducer(state, { type: "removeRun", id: "a" });
  assert.deepEqual(next.runs, []);
  assert.equal(next.activeRunId, null);
});

// Issue #197: dismiss (close) is a panel fixture, usable in any state —
// including the empty state the panel used to get stuck in.

test("close: after clearRuns empties history, the panel can still be closed and reused", () => {
  let state = historyWith(["a", "b"]);
  state = executionReducer(state, { type: "open" });
  assert.equal(state.isOpen, true);
  state = executionReducer(state, { type: "clearRuns" });
  assert.deepEqual(state.runs, []);
  state = executionReducer(state, { type: "close" });
  assert.equal(state.isOpen, false);
  // The panel keeps working: a new command starts from the empty state.
  state = startRun(state, "c");
  assert.deepEqual(ids(state), ["c"]);
  assert.equal(state.isOpen, false);
});

test("close: closing while running does not touch the run state", () => {
  let state = historyWith(["a"], ["r1"]);
  state = executionReducer(state, { type: "open" });
  state = executionReducer(state, { type: "close" });
  assert.equal(state.isOpen, false);
  assert.deepEqual(ids(state), ["a", "r1"]);
  const running = state.runs.find((r) => r.id === "r1") as RunEntry;
  assert.equal(running.status, "running");
  assert.deepEqual(running.lines, []);
});

test("close: after removeRun empties the last run, the panel can still be closed", () => {
  let state = historyWith(["a"]);
  state = executionReducer(state, { type: "open" });
  state = executionReducer(state, { type: "removeRun", id: "a" });
  assert.deepEqual(state.runs, []);
  state = executionReducer(state, { type: "close" });
  assert.equal(state.isOpen, false);
});
