// The DirectoryIndicator strip's hint lifecycle (issue #228, hardened in
// issues #290 and #298).
//
// The regressions these pin:
//   - The hint shows for 4 s on a dismiss timer, and a locale switch
//     inside that window re-resolves the visible line in the new language
//     instead of stranding the old-language line (#290) or clearing it
//     (#298's first design traded one bug for the other).
//   - Production's `consumeOpenOutcome` nulls the outcome, which re-runs
//     the outcome effect — the hint must SURVIVE that re-run (#298: the
//     old cleanup dismissed the hint one frame after it appeared, and the
//     old test's fake `consume` never changed the outcome, so production
//     wiring went untested).
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
  dismissMs = 4000,
) {
  return renderHook(
    ({
      outcome,
      formatter,
      dismissMs: ms,
    }: {
      outcome: OpenTerminalOutcome | null;
      formatter: OutcomeHintFormatter;
      dismissMs: number;
    }) => useOpenOutcomeHint(outcome, consume, formatter, ms),
    { initialProps: { outcome: openOutcome, formatter: format, dismissMs } },
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("an outcome shows its hint and is consumed", (t) => {
  t.after(cleanup);
  const consumed: OpenTerminalOutcome[] = [];
  const { result } = renderHint(okOutcome, formatEn, () => {
    consumed.push(okOutcome);
  });

  assert.equal(consumed.length, 1, "the outcome is consumed exactly once");
  assert.deepEqual(result.current.hint, { kind: "ok", text: "opened in Terminal" });
});

test("a formatter change while the hint is visible re-resolves it in the new language", (t) => {
  t.after(cleanup);
  const { result, rerender } = renderHint(okOutcome, formatEn, () => {});

  assert.deepEqual(result.current.hint, { kind: "ok", text: "opened in Terminal" });

  // A locale switch: the formatter is a new function (it closed over `t`),
  // and the strip re-renders with it.
  act(() => {
    rerender({ outcome: okOutcome, formatter: formatZh, dismissMs: 4000 });
  });

  assert.deepEqual(
    result.current.hint,
    { kind: "ok", text: "已在 Terminal 打开" },
    "the line rewrites in place — never stale-language",
  );

  act(() => {
    rerender({ outcome: okOutcome, formatter: formatEn, dismissMs: 4000 });
  });
  assert.deepEqual(result.current.hint, { kind: "ok", text: "opened in Terminal" });
});

test("the dismiss timer still takes a re-resolved hint down", async (t) => {
  t.after(cleanup);
  const { result, rerender } = renderHint(okOutcome, formatEn, () => {}, 60);

  assert.ok(result.current.hint, "the hint shows");
  act(() => {
    rerender({ outcome: okOutcome, formatter: formatZh, dismissMs: 60 });
  });
  assert.ok(result.current.hint, "the locale switch does not clear it");

  await act(async () => {
    await sleep(120);
  });
  assert.equal(
    result.current.hint,
    null,
    "the original timer fires — no stranded line (#290's original bug)",
  );
});

test("consuming the outcome (production nulls it) does not clear the hint (#298)", (t) => {
  t.after(cleanup);
  // Like the real provider: consume flips the outcome to null, so the
  // next render passes outcome=null and the effect re-runs through its
  // cleanup. The hint must survive.
  let current: OpenTerminalOutcome | null = okOutcome;
  const consume = () => {
    current = null;
  };
  const { result, rerender } = renderHint(current, formatEn, consume);

  assert.deepEqual(result.current.hint, { kind: "ok", text: "opened in Terminal" });

  // The provider's setState lands: the strip re-renders with a null
  // outcome, exactly one render after the hint appeared.
  act(() => {
    rerender({ outcome: current, formatter: formatEn, dismissMs: 4000 });
  });

  assert.deepEqual(
    result.current.hint,
    { kind: "ok", text: "opened in Terminal" },
    "the hint survives the consumption re-render",
  );
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
