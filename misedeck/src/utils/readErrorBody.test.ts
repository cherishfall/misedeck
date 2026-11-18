// Read-failure card body (issue #270): a PARSE_FAILED error has no
// stderr, so its parse detail is the body; stderr-backed failures keep
// the #262 conditional copy.
//
// The parse detail is the key-shaped message of issue #310 — one
// catalog message with the command that ran and the expected shape as
// parameters — so the card renders it in the reader's locale instead of
// MiseDeck's English prose. The two locale tests below are the guard
// for that: the same key-shaped detail must resolve to the English and
// to the Chinese sentence.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { TFunction } from "i18next";

import i18n from "../i18n";
import { parseAppErrorMessage, parseFailedMessage, resolveAppErrorMessage } from "./appError";
import { readErrorBody } from "./readErrorBody";

const WITH = "error.body";
const WITHOUT = "error.bodyNoStderr";
const t = ((key: string) => key) as unknown as TFunction;

if (!i18n.isInitialized) {
  await new Promise<void>((resolve) => {
    i18n.on("initialized", () => resolve());
  });
}

test("PARSE_FAILED renders its parse detail, not the no-stderr copy", async () => {
  await i18n.changeLanguage("en");
  const body = readErrorBody(
    {
      code: "PARSE_FAILED",
      message: parseFailedMessage("mise ls --json", "objectByTool"),
      stderr: "",
    },
    i18n.t,
    WITH,
    WITHOUT,
  );
  assert.equal(
    body,
    "MiseDeck could not parse the payload mise ls --json returned: expected an object keyed by tool.",
  );
});

test("the same parse failure resolves to the Chinese sentence", async () => {
  await i18n.changeLanguage("zh-CN");
  const body = readErrorBody(
    {
      code: "PARSE_FAILED",
      message: parseFailedMessage("mise ls --json", "objectByTool"),
      stderr: "",
    },
    i18n.t,
    WITH,
    WITHOUT,
  );
  assert.equal(
    body,
    "MiseDeck 无法解析 mise ls --json 返回的内容：预期为一个以工具为键的对象。",
  );
});

test("a key-shaped message with several parameters resolves", async () => {
  await i18n.changeLanguage("en");
  const message = parseFailedMessage("mise env --json", "objectByVariable");
  const parsed = parseAppErrorMessage(message);
  assert.equal(parsed.key, "errors.parseFailed");
  assert.deepEqual(parsed.params, {
    cmd: "mise env --json",
    shape: "objectByVariable",
  });
  assert.equal(
    resolveAppErrorMessage(message, i18n.t),
    "MiseDeck could not parse the payload mise env --json returned: expected an object keyed by variable.",
  );
});

test("a parse failure that names no shape still reads as a sentence", async () => {
  await i18n.changeLanguage("en");
  assert.equal(
    resolveAppErrorMessage("errors.parseFailed|cmd=mise ls --json", i18n.t),
    "MiseDeck could not parse the payload mise ls --json returned: expected the documented shape.",
  );
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
