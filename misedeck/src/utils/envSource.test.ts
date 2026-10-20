import assert from "node:assert/strict";
import { test } from "node:test";

import type { EnvSource } from "../api/miseTools";
import { envSourceVariant } from "./envSource";

test("envSourceVariant: a config- or tool-provided source is info, never warning", () => {
  for (const source of ["project", "tool"] as EnvSource[]) {
    assert.equal(envSourceVariant(source), "info");
  }
});

test("envSourceVariant: global and host-inherited sources stay neutral", () => {
  for (const source of ["global", "default"] as EnvSource[]) {
    assert.equal(envSourceVariant(source), "default");
  }
});
