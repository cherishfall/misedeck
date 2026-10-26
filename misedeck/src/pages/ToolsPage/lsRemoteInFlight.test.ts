// One `mise ls-remote --json <tool>` per key at a time (issue #290).
//
// The section's guard used to be "is the query cache empty?", which only
// answers "has a read finished". Selecting A, deselecting, and selecting A
// again inside the read's several-second window dispatched it twice — and
// StrictMode's double mount re-ran the effect on every first selection.
// `dispatchOnce` closes that gap; these tests pin the three states that
// matter: reuse while in flight, a fresh dispatch once settled, and
// independent keys.

import assert from "node:assert/strict";
import { test } from "node:test";

import { dispatchOnce, inFlightCount, resetInFlight } from "./lsRemoteInFlight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a second call with the same key reuses the in-flight promise", async (t) => {
  t.after(resetInFlight);
  resetInFlight();
  const gate = deferred<string>();
  let dispatches = 0;
  const dispatch = () => {
    dispatches += 1;
    return gate.promise;
  };

  const first = dispatchOnce("dir\u0000java", dispatch);
  const second = dispatchOnce("dir\u0000java", dispatch);
  assert.equal(dispatches, 1, "the command is dispatched once");
  assert.equal(second, first, "the caller gets the same promise");

  gate.resolve("done");
  assert.equal(await first, "done");
  assert.equal(await second, "done");
  await Promise.resolve();
  assert.equal(inFlightCount(), 0, "the key is released once it settles");
});

test("a call after the first settles dispatches again", async (t) => {
  t.after(resetInFlight);
  resetInFlight();
  let dispatches = 0;
  const dispatch = async () => {
    dispatches += 1;
    return dispatches;
  };

  assert.equal(await dispatchOnce("dir\u0000go", dispatch), 1);
  await Promise.resolve();
  assert.equal(await dispatchOnce("dir\u0000go", dispatch), 2);
  assert.equal(dispatches, 2);
});

test("different keys run independently, and a rejection releases its key", async (t) => {
  t.after(resetInFlight);
  resetInFlight();
  const gate = deferred<string>();
  let failures = 0;
  const failing = () =>
    gate.promise.catch((reason: unknown) => {
      failures += 1;
      throw reason;
    });

  const failingRun = dispatchOnce("dir\u0000rust", failing);
  const otherRun = dispatchOnce("global\u0000rust", async () => "other");
  assert.equal(await otherRun, "other");
  assert.equal(inFlightCount(), 1, "the other key is still in flight");

  gate.reject(new Error("boom"));
  await assert.rejects(failingRun, /boom/);
  assert.equal(failures, 1);
  await Promise.resolve();
  assert.equal(inFlightCount(), 0, "a failed read releases its key for the retry button");
});
