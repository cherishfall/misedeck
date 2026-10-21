// Pure queue behavior behind the global failure notices (issue #249):
// rejection mapping, dedupe, cap, and dismissal. Timers live in the
// component and are not exercised here.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_FAILURE_NOTICES,
  createFailureNoticeStore,
  dismissFailure,
  enqueueFailure,
  normalizeFailure,
  type FailureNotice,
} from "./failureNotices";

function notice(id: number, identity: string): FailureNotice {
  return { id, identity, error: null, detail: identity };
}

test("normalizeFailure: an AppError keeps the structured payload", () => {
  const error = {
    code: "COMMAND_FAILED" as const,
    message: "mise failed",
    stderr: "boom",
  };
  const normalized = normalizeFailure(error);
  assert.equal(normalized.error, error);
  assert.equal(normalized.identity, "COMMAND_FAILED|mise failed");
  assert.equal(normalized.detail, "");
});

test("normalizeFailure: an Error becomes bridge detail", () => {
  const normalized = normalizeFailure(new Error("  bridge gone  "));
  assert.equal(normalized.error, null);
  assert.equal(normalized.detail, "bridge gone");
  assert.equal(normalized.identity, "bridge|bridge gone");
});

test("normalizeFailure: a thrown string is the detail", () => {
  const normalized = normalizeFailure("  offline  ");
  assert.equal(normalized.detail, "offline");
  assert.equal(normalized.identity, "bridge|offline");
});

test("normalizeFailure: an undescribable value falls back to unknown", () => {
  const normalized = normalizeFailure(null);
  assert.equal(normalized.detail, "");
  assert.equal(normalized.identity, "bridge|unknown");
});

test("enqueueFailure: appends in order", () => {
  const list = enqueueFailure([notice(1, "a")], notice(2, "b"));
  assert.deepEqual(
    list.map((n) => n.id),
    [1, 2],
  );
});

test("enqueueFailure: an identical failure replaces the old one", () => {
  const list = enqueueFailure(
    [notice(1, "a"), notice(2, "b")],
    notice(3, "a"),
  );
  assert.deepEqual(
    list.map((n) => n.id),
    [2, 3],
  );
});

test("enqueueFailure: caps at MAX_FAILURE_NOTICES, newest kept", () => {
  const list = [
    notice(1, "a"),
    notice(2, "b"),
    notice(3, "c"),
  ].reduce((acc, next) => enqueueFailure(acc, next), [] as FailureNotice[]);
  const capped = enqueueFailure(list, notice(4, "d"));
  assert.equal(capped.length, MAX_FAILURE_NOTICES);
  assert.deepEqual(
    capped.map((n) => n.identity),
    ["b", "c", "d"],
  );
});

test("dismissFailure: removes only the matching id", () => {
  const list = dismissFailure([notice(1, "a"), notice(2, "b")], 1);
  assert.deepEqual(
    list.map((n) => n.id),
    [2],
  );
});

test("store: reports, notifies subscribers, and dismisses", () => {
  const store = createFailureNoticeStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.report({ code: "TIMEOUT", message: "errors.timeout", stderr: "" });
  const first = store.getSnapshot();
  assert.equal(first.length, 1);
  assert.equal(first[0]?.identity, "TIMEOUT|errors.timeout");
  assert.equal(notifications, 1);

  store.report(new Error("bridge gone"));
  const second = store.getSnapshot();
  assert.equal(second.length, 2);
  assert.equal(second[1]?.identity, "bridge|bridge gone");
  // Snapshot identity changes on every mutation, so
  // `useSyncExternalStore` re-reads.
  assert.notEqual(second, first);

  store.dismiss(second[0]!.id);
  assert.deepEqual(
    store.getSnapshot().map((n) => n.id),
    [second[1]!.id],
  );

  unsubscribe();
  store.report("later");
  assert.equal(notifications, 3);
});
