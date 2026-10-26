// The shell-activation probe returns locale-independent state
// (issue #286): the error copy stays the raw key-shaped
// `AppError.message` until render, so the provider's probe callback can
// depend on `[]` — a locale switch re-renders the banner copy and never
// re-fires `shell_activation_check` (no loading flash, no discarded
// "Check again" result).

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActivationStatus, AppError } from "../types/tauri";
import { probeShellActivation } from "./activationProbe";

const status: ActivationStatus = {
  shell: { kind: "zsh" },
  rcPath: "/Users/me/.zshrc",
  activated: false,
};

test("an ok probe maps to the status unchanged", async () => {
  const state = await probeShellActivation(async () => ({ kind: "ok", ok: status }));
  assert.deepEqual(state, { kind: "ok", status });
});

test("an err probe keeps the message unresolved (resolution is a render concern)", async () => {
  const err: AppError = {
    code: "MISE_NOT_FOUND",
    message: "errors.miseNotFound",
    stderr: "",
  };
  const state = await probeShellActivation(async () => ({ kind: "err", err }));
  assert.deepEqual(state, { kind: "error", message: "errors.miseNotFound" });
  // The key + params survive verbatim, so the same stored state renders
  // in whichever locale is active — no dependency on `t` at probe time.
  assert.notEqual((state as { message: string }).message, "");
});

test("key-shaped params survive for locale-aware resolution", async () => {
  const state = await probeShellActivation(async () => ({
    kind: "err",
    err: {
      code: "MISE_TOO_OLD",
      message: "errors.miseTooOld|found=2024.1.0|minimum=2025.12.5",
      stderr: "",
    } as AppError,
  }));
  assert.equal(
    (state as { message: string }).message,
    "errors.miseTooOld|found=2024.1.0|minimum=2025.12.5",
  );
});

test("a thrown IPC error becomes an error state instead of rejecting", async () => {
  const state = await probeShellActivation(async () => {
    throw new Error("ipc closed");
  });
  assert.deepEqual(state, { kind: "error", message: "ipc closed" });
});
