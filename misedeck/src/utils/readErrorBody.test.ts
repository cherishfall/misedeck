// Read-failure card body (issue #270): a PARSE_FAILED error has no
// stderr, so its parse detail is the body; stderr-backed failures keep
// the #262 conditional copy.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { TFunction } from "i18next";

import { readErrorBody } from "./readErrorBody";

const WITH = "error.body";
const WITHOUT = "error.bodyNoStderr";
const t = ((key: string) => key) as unknown as TFunction;

test("PARSE_FAILED renders its parse detail, not the no-stderr copy", () => {
  const body = readErrorBody(
    {
      code: "PARSE_FAILED",
      message: "mise ls --json did not return an object keyed by tool",
      stderr: "",
    },
    t,
    WITH,
    WITHOUT,
  );
  assert.equal(body, "mise ls --json did not return an object keyed by tool");
});

test("a stderr-backed failure keeps the conditional body choice", () => {
  assert.equal(
    readErrorBody(
      { code: "COMMAND_FAILED", message: "boom", stderr: "error: boom" },
      t,
      WITH,
      WITHOUT,
    ),
    WITH,
  );
  assert.equal(
    readErrorBody(
      { code: "COMMAND_FAILED", message: "boom", stderr: "" },
      t,
      WITH,
      WITHOUT,
    ),
    WITHOUT,
  );
});
