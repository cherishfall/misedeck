// Tests for the error-boundary formatters (issue #214). The boundary
// renders whatever was thrown, including non-Error values, so the
// summary must never be empty or "undefined".

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatErrorDetails, formatErrorSummary } from "./errorSummary";

test("formatErrorSummary: Error renders as Name: message", () => {
  assert.equal(formatErrorSummary(new TypeError("boom")), "TypeError: boom");
});

test("formatErrorSummary: a thrown string is the summary", () => {
  assert.equal(formatErrorSummary("  render failed  "), "render failed");
});

test("formatErrorSummary: empty payloads have no summary", () => {
  assert.equal(formatErrorSummary(null), "");
  assert.equal(formatErrorSummary(undefined), "");
});

test("formatErrorSummary: objects fall back to JSON", () => {
  assert.equal(formatErrorSummary({ reason: "bad" }), '{"reason":"bad"}');
});

test("formatErrorSummary: circular objects do not throw", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.equal(typeof formatErrorSummary(circular), "string");
});

test("formatErrorDetails: stack and component stack are separated", () => {
  const error = new Error("boom");
  const details = formatErrorDetails(error, "\n  at Page\n  at App");
  assert.ok(details.startsWith("Error: boom"));
  assert.ok(details.includes("at Page"));
  assert.ok(details.includes("\n\n"));
});

test("formatErrorDetails: a non-Error falls back to the summary", () => {
  assert.equal(formatErrorDetails("render failed", null), "render failed");
});
