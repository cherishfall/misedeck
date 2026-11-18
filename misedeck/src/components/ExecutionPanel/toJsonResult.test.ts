// The runner's JSON reduction (ADR-0005): a clean run whose stdout is
// not JSON becomes a PARSE_FAILED error, and the detail is the
// key-shaped parse failure (issue #310) — the command that ran and the
// shape MiseDeck expected — so it resolves through the catalog in every
// locale instead of rendering the JS runtime's English message.

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFailedMessage } from "../../utils/appError";
import { toJsonResult } from "./useExecution";

test("toJsonResult: unparsable stdout is a key-shaped PARSE_FAILED error", () => {
  const result = toJsonResult(
    {
      kind: "ok",
      outcome: {
        stdout: "not json",
        stderr: "mise: warning",
        exitCode: 0,
        durationMs: 12,
        timedOut: false,
      },
    },
    ["ls", "--json"],
  );
  assert.equal(result.kind, "err");
  const err = result.kind === "err" ? result.err : null;
  assert.equal(err?.code, "PARSE_FAILED");
  assert.equal(
    err?.message,
    parseFailedMessage("mise ls --json", "validJson"),
  );
  assert.equal(err?.stderr, "mise: warning");
});

test("toJsonResult: a clean JSON payload still parses", () => {
  const result = toJsonResult(
    {
      kind: "ok",
      outcome: {
        stdout: '{"node": []}',
        stderr: "",
        exitCode: 0,
        durationMs: 12,
        timedOut: false,
      },
    },
    ["ls", "--json"],
  );
  assert.equal(result.kind, "ok");
  assert.deepEqual(result.kind === "ok" ? result.value : null, { node: [] });
});
