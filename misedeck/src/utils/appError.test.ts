// The key-shaped COMMAND_FAILED class (issue #311).
//
// MiseDeck authored its command-failure details as hardcoded English
// ("mise trust --show exited with status 1"), and every UI site that
// displays `err.message` renders it verbatim — so a zh-CN UI showed
// English prose on the trust banner and wherever else a command failed.
//
// The detail is key-shaped now: one catalog message per failure kind,
// with the data — the command that ran, the exit status, the path, the
// OS error — as parameters. These tests are the guard for that: the
// same key-shaped detail must resolve to the English sentence and to
// the Chinese one, and the wire format must survive a parameter value
// that carries the delimiter.
//
// mise's own stderr is NOT part of this: it stays in the `stderr` field
// of the error, verbatim — the CLI's output is data, not copy.

import assert from "node:assert/strict";
import { test } from "node:test";

import i18n from "../i18n";
import {
  MESSAGE_TOKEN,
  RUN_CANCELLED_MESSAGE,
  decodeParamValue,
  encodeParamValue,
  ipcFailedMessage,
  keyedMessage,
  parseAppErrorMessage,
  resolveAppErrorMessage,
} from "./appError";

if (!i18n.isInitialized) {
  await new Promise<void>((resolve) => {
    i18n.on("initialized", () => resolve());
  });
}

/** The Rust side's own detail for a failed `mise trust --show`. */
const TRUST_FAILED =
  "errors.commandFailed|cmd=mise trust --show|code=1";

test("a key-shaped COMMAND_FAILED resolves to the English sentence", async () => {
  await i18n.changeLanguage("en");
  assert.equal(
    resolveAppErrorMessage(TRUST_FAILED, i18n.t),
    "mise trust --show exited with status 1.",
  );
});

test("the same command failure resolves to the Chinese sentence", async () => {
  await i18n.changeLanguage("zh-CN");
  assert.equal(
    resolveAppErrorMessage(TRUST_FAILED, i18n.t),
    "mise trust --show 以状态码 1 结束。",
  );
});

test("the multi-parameter wire format parses", async () => {
  await i18n.changeLanguage("en");
  const message = keyedMessage("errors.commandFailed", {
    cmd: "mise registry",
    code: "2",
  });
  assert.equal(message, "errors.commandFailed|cmd=mise registry|code=2");
  const parsed = parseAppErrorMessage(message);
  assert.equal(parsed.key, "errors.commandFailed");
  assert.deepEqual(parsed.params, { cmd: "mise registry", code: "2" });
});

test("a parameter value cannot break the wire format", async () => {
  await i18n.changeLanguage("en");
  // The `|` delimiter is the one character the format cannot carry raw:
  // a value that contains one would split the message into bogus
  // parameters and the reader would see a truncated value.
  const message = keyedMessage("errors.invalidArg", {
    arg: "flag",
    value: "--run=a|b",
  });
  assert.equal(message, "errors.invalidArg|arg=flag|value=--run=a%7Cb");
  const parsed = parseAppErrorMessage(message);
  assert.equal(parsed.key, "errors.invalidArg");
  assert.deepEqual(parsed.params, { arg: "flag", value: "--run=a|b" });
});

test("the percent-encoding round-trips", () => {
  assert.equal(encodeParamValue("100%"), "100%25");
  assert.equal(encodeParamValue("a|b"), "a%7Cb");
  assert.equal(decodeParamValue("100%25"), "100%");
  assert.equal(decodeParamValue("a%7Cb"), "a|b");
  // The escape itself round-trips: a literal `%7C` in the value comes
  // back as `%7C`, not as a pipe.
  assert.equal(decodeParamValue(encodeParamValue("%7C")), "%7C");
});

test("a token parameter resolves to the catalog's phrase", async () => {
  await i18n.changeLanguage("en");
  // `task` is a token, not prose: the catalog holds the phrase in both
  // locales, so the Rust side emits it without knowing the language.
  const message = keyedMessage("errors.backgroundTaskFailed", {
    task: MESSAGE_TOKEN.task.trust,
  });
  assert.equal(message, "errors.backgroundTaskFailed|task=trust");
  assert.equal(
    resolveAppErrorMessage(message, i18n.t),
    "The background task for mise trust failed.",
  );
  await i18n.changeLanguage("zh-CN");
  assert.equal(
    resolveAppErrorMessage(message, i18n.t),
    "mise trust 的后台任务失败。",
  );
});

test("a failure that names no token still reads as a sentence", async () => {
  await i18n.changeLanguage("en");
  assert.equal(
    resolveAppErrorMessage("errors.cancelled", i18n.t),
    "the operation was cancelled.",
  );
});

test("the frontend's own runtime failure carries the runtime's text", async () => {
  await i18n.changeLanguage("en");
  const message = ipcFailedMessage("ipc closed");
  assert.equal(message, "errors.ipcFailed|detail=ipc closed");
  assert.equal(
    resolveAppErrorMessage(message, i18n.t),
    "MiseDeck could not complete the request: ipc closed",
  );
  await i18n.changeLanguage("zh-CN");
  assert.equal(
    resolveAppErrorMessage(message, i18n.t),
    "MiseDeck 无法完成该请求：ipc closed",
  );
});

test("the runner's cancellation signature is the key-shaped form", () => {
  // The Rust side emits exactly this message for a cancelled run
  // (`src-tauri/src/mise.rs`), and the execution panel matches it to
  // settle a cancel-racing rejection as cancelled. It is a
  // cross-language contract.
  assert.equal(RUN_CANCELLED_MESSAGE, "errors.cancelled|task=mise");
});

test("a raw detail string still renders verbatim", () => {
  // The resolver's escape hatch: a message that is not key-shaped is
  // data and renders as it is.
  assert.equal(resolveAppErrorMessage("boom", i18n.t), "boom");
});
