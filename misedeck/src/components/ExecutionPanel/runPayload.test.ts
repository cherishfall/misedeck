import assert from "node:assert/strict";
import { test } from "node:test";

import { runMiseCommandPayload } from "./runPayload";

const request = { cwd: "/tmp/project", args: ["ls", "--json"] };

test("runMiseCommandPayload: readOnly defaults to false", () => {
  assert.deepEqual(runMiseCommandPayload(request, undefined), {
    cwd: "/tmp/project",
    args: ["ls", "--json"],
    readOnly: false,
  });
  const backgroundOnly: { background?: boolean; readOnly?: boolean } = {
    background: true,
  };
  assert.equal(runMiseCommandPayload(request, backgroundOnly).readOnly, false);
});

test("runMiseCommandPayload: forwards an explicit readOnly flag only", () => {
  assert.equal(runMiseCommandPayload(request, { readOnly: true }).readOnly, true);
  assert.equal(runMiseCommandPayload(request, { readOnly: false }).readOnly, false);
  // The argv never decides: the same read args without the flag stay unsafe.
  assert.equal(runMiseCommandPayload(request, {}).readOnly, false);
});
