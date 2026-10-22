import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseJumpTarget } from "./paginationJump";

describe("parseJumpTarget", () => {
  it("accepts a whole number inside the page range", () => {
    assert.equal(parseJumpTarget("1", 3), 1);
    assert.equal(parseJumpTarget("3", 3), 3);
    assert.equal(parseJumpTarget(" 2 ", 3), 2);
  });

  it("rejects an empty or whitespace-only draft", () => {
    assert.equal(parseJumpTarget("", 3), null);
    assert.equal(parseJumpTarget("   ", 3), null);
  });

  it("rejects zero, negatives and values past the last page", () => {
    assert.equal(parseJumpTarget("0", 3), null);
    assert.equal(parseJumpTarget("-1", 3), null);
    assert.equal(parseJumpTarget("4", 3), null);
    assert.equal(parseJumpTarget("1", 0), null);
  });

  it("rejects fractions, NaN and Infinity", () => {
    assert.equal(parseJumpTarget("1.5", 3), null);
    assert.equal(parseJumpTarget("NaN", 3), null);
    assert.equal(parseJumpTarget("Infinity", 3), null);
    assert.equal(parseJumpTarget("2abc", 3), null);
  });
});
