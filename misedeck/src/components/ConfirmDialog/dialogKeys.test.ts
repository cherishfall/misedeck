import assert from "node:assert/strict";
import test from "node:test";

import { handleDialogKey, subscribeDialogKeys } from "./dialogKeys";

function keyEvent(key: string, shiftKey = false) {
  const calls = { prevented: 0, stopped: 0 };
  return {
    event: {
      key,
      shiftKey,
      preventDefault: () => {
        calls.prevented += 1;
      },
      stopPropagation: () => {
        calls.stopped += 1;
      },
    },
    calls,
  };
}

test("Escape cancels and stops propagation before a nested form sees it", () => {
  let cancels = 0;
  const { event, calls } = keyEvent("Escape");
  handleDialogKey(event, null, () => {
    cancels += 1;
  });
  assert.equal(cancels, 1);
  assert.equal(calls.prevented, 1);
  assert.equal(calls.stopped, 1);
});

test("dialog keys are registered in the capture phase", () => {
  const registrations: boolean[] = [];
  const target = {
    addEventListener: (_type: string, _listener: EventListener, capture?: boolean) => {
      registrations.push(capture === true);
    },
    removeEventListener: (_type: string, _listener: EventListener, capture?: boolean) => {
      registrations.push(capture === true);
    },
  };
  const unsubscribe = subscribeDialogKeys(target, () => null, () => {});
  unsubscribe();
  assert.deepEqual(registrations, [true, true]);
});

test("Tab moves focus within the dialog", () => {
  let focused = "";
  const first = {
    focus: () => {
      focused = "first";
    },
  } as unknown as HTMLElement;
  const second = {
    focus: () => {
      focused = "second";
    },
  } as unknown as HTMLElement;
  const root = {
    querySelectorAll: () => [first, second],
    ownerDocument: { activeElement: first },
    focus: () => {
      focused = "root";
    },
  } as unknown as HTMLElement;

  const { event, calls } = keyEvent("Tab");
  handleDialogKey(event, root, () => {});
  assert.equal(focused, "second");
  assert.equal(calls.prevented, 1);
  assert.equal(calls.stopped, 1);
});

test("Tab with nothing focusable parks on the dialog instead of escaping", () => {
  let focused = "";
  const root = {
    querySelectorAll: () => [],
    ownerDocument: { activeElement: null },
    focus: () => {
      focused = "root";
    },
  } as unknown as HTMLElement;

  const { event, calls } = keyEvent("Tab", true);
  handleDialogKey(event, root, () => {});
  assert.equal(focused, "root");
  assert.equal(calls.prevented, 1);
});
