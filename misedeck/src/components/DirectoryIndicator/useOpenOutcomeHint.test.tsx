// The DirectoryIndicator strip's hint lifecycle (issue #228, hardened in
// issue #290).
//
// The regression this pins: the hint shows for 4 s on a dismiss timer, and
// the outcome effect re-runs when its formatter changes — which happens on
// a locale switch, because the formatter closes over `t`. The effect used
// to clear only the timer, so switching language inside that window left
// the old-language line on screen forever: the timer was gone and the
// outcome guard meant nothing re-showed it. Now the cleanup dismisses both.
//
// Run via `npm run test:ui` (node:test through tsx + jsdom); the hook is
// rendered with `renderHook`, so this asserts the real effect lifecycle,
// not a reimplementation of it.

import assert from "node:assert/strict";
import { test } from "node:test";

import { act, cleanup, renderHook } from "@testing-library/react";

import type { OpenTerminalOutcome } from "../../state/activationContext";
import { useOpenOutcomeHint, type OutcomeHintFormatter } from "./useOpenOutcomeHint";

const okOutcome: OpenTerminalOutcome = {
  kind: "ok",
  outcome: {
    platform: "macos",
    terminalApp: "Terminal",
    path: "/tmp/project",
    argv: ["open", "-a", "Terminal", "/tmp/project"],
  },
};

const formatEn: OutcomeHintFormatter = (outcome) =>
  outcome.kind === "ok"
    ? { kind: "ok", text: `opened in ${outcome.outcome.terminalApp}` }
    : { kind: "error", text: `failed: ${outcome.path ?? ""}` };

const formatZh: OutcomeHintFormatter = (outcome) =>
  outcome.kind === "ok"
    ? { kind: "ok", text: `已在 ${outcome.outcome.terminalApp} 打开` }
    : { kind: "error", text: `打开失败:${outcome.path ?? ""}` };

function renderHint(
  openOutcome: OpenTerminalOutcome | null,
  format: OutcomeHintFormatter,
  consume: () => unknown,
) {
  return renderHook(
    ({ outcome, formatter }: { outcome: OpenTerminalOutcome | null; formatter: OutcomeHintFormatter }) =>
      useOpenOutcomeHint(outcome, consume, formatter),
    { initialProps: { outcome: openOutcome, formatter: format } },
  );
}

test("an outcome shows its hint and is consumed", (t) => {
  t.after(cleanup);
  const consumed: OpenTerminalOutcome[] = [];
  const { result } = renderHint(okOutcome, formatEn, () => {
    consumed.push(okOutcome);
  });

  assert.equal(consumed.length, 1, "the outcome is consumed exactly once");
  assert.deepEqual(result.current.hint, { kind: "ok", text: "opened in Terminal" });
});

test("a formatter change while the hint is visible clears it instead of stranding it", (t) => {
  t.after(cleanup);
  const { result, rerender } = renderHint(okOutcome, formatEn, () => {});

  assert.deepEqual(result.current.hint, { kind: "ok", text: "opened in Terminal" });

  // A locale switch: the formatter is a new function (it closed over `t`).
  act(() => {
    rerender({ outcome: okOutcome, formatter: formatZh });
  });

  assert.equal(
    result.current.hint,
    null,
    "the stale-language line is gone, and no timer is left to hide it",
  );

  // Nothing puts it back, and the dismissed state is stable.
  act(() => {
    rerender({ outcome: okOutcome, formatter: formatZh });
  });
  assert.equal(result.current.hint, null);
});

test("dismiss clears the hint directly, and show sets it again", (t) => {
  t.after(cleanup);
  const { result } = renderHint(null, formatEn, () => {});

  act(() => {
    result.current.show("error", "no such directory");
  });
  assert.deepEqual(result.current.hint, { kind: "error", text: "no such directory" });

  act(() => {
    result.current.dismiss();
  });
  assert.equal(result.current.hint, null);
});
