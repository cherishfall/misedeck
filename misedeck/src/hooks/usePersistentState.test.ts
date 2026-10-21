// Persistence guards (issue #257): a denied / throwing localStorage must
// fall back to the declared initial value instead of taking the boot path
// down. The theme and language keys pass an identity codec because their
// on-disk format is a raw string shared with non-React readers.

import assert from "node:assert/strict";
import test from "node:test";

import { loadPersistent, savePersistent } from "./usePersistentState";

/** Replace `globalThis.localStorage` for one test and restore it after. */
function withStorage<T>(stub: Pick<Storage, "getItem" | "setItem">, fn: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: stub,
  });
  try {
    return fn();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "localStorage", previous);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }
}

test("loadPersistent falls back when storage throws", () => {
  const denied: Pick<Storage, "getItem" | "setItem"> = {
    getItem() {
      throw new Error("storage denied");
    },
    setItem() {
      throw new Error("storage denied");
    },
  };
  withStorage(denied, () => {
    assert.equal(loadPersistent("misedeck.test", "fallback"), "fallback");
    // The raw-string codec used by the theme and language keys is guarded
    // by the same try/catch.
    assert.equal(
      loadPersistent("misedeck.test", "light", (raw) => raw),
      "light",
    );
    assert.doesNotThrow(() => savePersistent("misedeck.test", "value"));
    assert.doesNotThrow(() => savePersistent("misedeck.test", "dark", (value) => value));
  });
});

test("loadPersistent round-trips JSON and honours a raw-string codec", () => {
  const store = new Map<string, string>();
  const memory: Pick<Storage, "getItem" | "setItem"> = {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
  withStorage(memory, () => {
    savePersistent("json", { open: true });
    assert.deepEqual(loadPersistent("json", { open: false }), { open: true });

    // Raw codec: the value reaches storage without JSON quotes, which is
    // what index.html's pre-paint script and i18next's detector read.
    savePersistent("raw", "dark", (value) => value);
    assert.equal(store.get("raw"), "dark");
    assert.equal(loadPersistent("raw", "light", (raw) => raw), "dark");
  });
});

test("loadPersistent falls back when a raw value fails its decoder", () => {
  const store = new Map<string, string>([["theme", "system"]]);
  const memory: Pick<Storage, "getItem" | "setItem"> = {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
  withStorage(memory, () => {
    const theme = loadPersistent("theme", "light", (raw) =>
      raw === "light" || raw === "dark" ? raw : "light",
    );
    assert.equal(theme, "light");
  });
});
