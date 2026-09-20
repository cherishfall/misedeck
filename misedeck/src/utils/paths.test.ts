// Tests for the shared path comparison helpers (issue #159).
// Run via `npm run test` (node:test through tsx — no extra framework).

import assert from "node:assert/strict";
import { test } from "node:test";

import { isPathUnder, normalizePathForCompare } from "./paths";

test("isPathUnder: forward-slash child under forward-slash parent", () => {
  assert.equal(isPathUnder("/Users/dev/proj", "/Users/dev/proj/mise.toml"), true);
});

test("isPathUnder: Windows backslash paths (the beta11 4.2-M4 bug)", () => {
  assert.equal(
    isPathUnder("C:\\Users\\dev\\proj", "C:\\Users\\dev\\proj\\mise.toml"),
    true,
  );
  // The whole point of the ticket: backslash paths must not all fall
  // through to "global".
  assert.equal(isPathUnder("C:\\Users\\dev\\proj", "C:\\Users\\dev\\other\\mise.toml"), false);
});

test("isPathUnder: mixed separators match", () => {
  assert.equal(isPathUnder("C:\\Users/dev\\proj", "C:/Users/dev/proj/mise.toml"), true);
  assert.equal(isPathUnder("/Users/dev/proj", "\\Users\\dev\\proj\\mise.toml"), true);
});

test("isPathUnder: exact match counts as under (cwd's own mise.toml)", () => {
  assert.equal(isPathUnder("/Users/dev/proj", "/Users/dev/proj"), true);
  assert.equal(isPathUnder("/Users/dev/proj/", "/Users/dev/proj"), true);
});

test("isPathUnder: trailing slash on the parent is harmless (both separators)", () => {
  assert.equal(isPathUnder("/Users/dev/proj/", "/Users/dev/proj/mise.toml"), true);
  assert.equal(isPathUnder("C:\\Users\\dev\\proj\\", "C:\\Users\\dev\\proj\\mise.toml"), true);
});

test("isPathUnder: segment-aware — a sibling sharing a name prefix is not under", () => {
  assert.equal(isPathUnder("/foo/bar", "/foo/barbaz/mise.toml"), false);
  assert.equal(isPathUnder("C:\\foo\\bar", "C:\\foo\\barbaz\\mise.toml"), false);
});

test("isPathUnder: case folding by default (macOS / Windows volumes)", () => {
  assert.equal(isPathUnder("/Users/Dev/Proj", "/users/dev/proj/mise.toml"), true);
  assert.equal(isPathUnder("C:\\Users\\Dev", "c:\\users\\dev\\mise.toml"), true);
});

test("isPathUnder: caseSensitive option preserves Linux semantics", () => {
  assert.equal(
    isPathUnder("/Users/Dev", "/users/dev/mise.toml", { caseInsensitive: false }),
    false,
  );
  assert.equal(
    isPathUnder("/Users/dev", "/Users/dev/mise.toml", { caseInsensitive: false }),
    true,
  );
});

test("isPathUnder: filesystem roots", () => {
  assert.equal(isPathUnder("/", "/etc/mise/config.toml"), true);
  assert.equal(isPathUnder("/", "/"), true);
  assert.equal(isPathUnder("C:\\", "C:\\Users\\dev\\mise.toml"), true);
  assert.equal(isPathUnder("C:\\", "D:\\Users\\dev\\mise.toml"), false);
});

test("isPathUnder: UNC share roots", () => {
  assert.equal(
    isPathUnder("\\\\server\\share\\proj", "\\\\server\\share\\proj\\mise.toml"),
    true,
  );
  assert.equal(isPathUnder("\\\\server\\share", "\\\\server\\other\\mise.toml"), false);
});

test("isPathUnder: empty paths are not under anything", () => {
  assert.equal(isPathUnder("", "/foo/mise.toml"), false);
  assert.equal(isPathUnder("/foo", ""), false);
});

test("normalizePathForCompare: unifies separators and collapses duplicates", () => {
  assert.equal(normalizePathForCompare("C:\\\\Users\\\\dev", { caseInsensitive: false }), "C:/Users/dev");
  assert.equal(normalizePathForCompare("//server/share", { caseInsensitive: false }), "/server/share");
});

test("normalizePathForCompare: keeps root and drive-root forms", () => {
  assert.equal(normalizePathForCompare("/", { caseInsensitive: false }), "/");
  assert.equal(normalizePathForCompare("C:\\", { caseInsensitive: false }), "C:/");
  assert.equal(normalizePathForCompare("c:/", { caseInsensitive: false }), "c:/");
  assert.equal(normalizePathForCompare("c:/"), "c:/");
});
