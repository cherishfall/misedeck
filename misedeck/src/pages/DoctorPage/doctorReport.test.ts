// Tests for the Doctor report's clipboard composition (#238).
// Pure text assembly — no DOM, no Tauri, no clipboard.

import assert from "node:assert/strict";
import { test } from "node:test";

import { composeDoctorReport, doctorReportBody } from "./doctorReport";

test("composeDoctorReport: header, blank line, verbatim body", () => {
  const body = "[OK] mise\n[WARN] something\n";
  assert.equal(
    composeDoctorReport("MiseDeck 1.0.0-beta.17", body),
    "MiseDeck 1.0.0-beta.17\n\n[OK] mise\n[WARN] something\n",
  );
});

test("composeDoctorReport: the body is not trimmed or rewritten", () => {
  const body = "  leading spaces\n\ttab line  \n\n";
  const report = composeDoctorReport("MiseDeck 1.0.0-beta.17", body);
  assert.ok(report.endsWith(body), "the body must survive exactly");
  assert.equal(report.slice(0, report.length - body.length), "MiseDeck 1.0.0-beta.17\n\n");
});

test("doctorReportBody: rawText wins over rawLines", () => {
  const body = doctorReportBody(
    {
      rawText: "verbatim from mise\nsecond line",
      rawLines: [{ text: "a different parse", status: "ok" }],
    },
    { rawLines: [] },
  );
  assert.equal(body, "verbatim from mise\nsecond line");
});

test("doctorReportBody: raw lines join back with newlines, in order", () => {
  const body = doctorReportBody(
    {
      rawLines: [
        { text: "[OK] one", status: "ok" },
        { text: "no status", status: "neutral" },
        { text: "[ERROR] three", status: "error" },
      ],
    },
    null,
  );
  assert.equal(body, "[OK] one\nno status\n[ERROR] three");
});

test("doctorReportBody: the structured payload is mise's data, pretty-printed", () => {
  const raw = {
    version: "2026.10.0",
    warnings: ["one"],
    config_files: ["/home/u/.config/mise/config.toml"],
  };
  const body = doctorReportBody({ version: "2026.10.0" }, raw);
  assert.deepEqual(JSON.parse(body), raw);
  assert.ok(body.includes("\n  "), "pretty-printed for a bug report");
});
