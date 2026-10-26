// Render-level wiring for the shared Table's column resize (issue #104),
// hardened in issue #290: the width is persisted once, on pointerup, from
// the latest map — never from inside a state updater (StrictMode invokes
// an updater twice, so the side effect ran twice per drag).
//
// Run via `npm run test:ui` (node:test through tsx + jsdom).

import assert from "node:assert/strict";
import { test } from "node:test";

import { act, cleanup, render } from "@testing-library/react";

import { Table } from "./Table";

interface Row {
  name: string;
}

const columns = [
  { key: "name", header: "Name", cell: (r: Row) => r.name, width: "120px", minWidth: "10px" },
];
const rows: Row[] = [{ name: "go" }];

/** jsdom has no `PointerEvent`, and `fireEvent` then drops `clientX`;
 *  a bubbling `MouseEvent` of the same type carries what the drag reads. */
function pointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  target: EventTarget,
  clientX: number,
): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX }),
    );
  });
}

function handleOf(container: HTMLElement): HTMLElement {
  const handle = container.querySelector<HTMLElement>('[class*="resizeHandle"]');
  assert.ok(handle, "the fixed-width column renders a resize handle");
  return handle;
}

test("a column drag persists its width once, on pointerup", (t) => {
  t.after(cleanup);
  localStorage.clear();
  const { container } = render(
    <Table
      columns={columns}
      rows={rows}
      rowKey={(r) => r.name}
      resizeKey="ticket-290"
      fixed
    />,
  );

  const stored = () => localStorage.getItem("misedeck.tableWidths.ticket-290");
  assert.equal(stored(), null, "nothing is written before the drag ends");

  pointer("pointerdown", handleOf(container), 100);
  assert.equal(document.body.style.userSelect, "none", "the drag locks text selection");
  assert.equal(stored(), null, "a move alone does not persist");

  pointer("pointermove", window, 140);
  assert.equal(stored(), null, "persistence waits for the gesture to end");

  pointer("pointerup", window, 140);
  assert.equal(document.body.style.userSelect, "", "the selection lock is released");
  const widths = JSON.parse(stored() ?? "{}") as Record<string, number>;
  assert.deepEqual(widths, { name: 40 }, "the final width is what lands in storage");
});

test("a cancelled drag also persists what was dragged", (t) => {
  t.after(cleanup);
  localStorage.clear();
  const { container } = render(
    <Table
      columns={columns}
      rows={rows}
      rowKey={(r) => r.name}
      resizeKey="ticket-290-cancel"
      fixed
    />,
  );

  pointer("pointerdown", handleOf(container), 100);
  pointer("pointermove", window, 130);
  pointer("pointercancel", window, 130);

  const widths = JSON.parse(
    localStorage.getItem("misedeck.tableWidths.ticket-290-cancel") ?? "{}",
  ) as Record<string, number>;
  assert.deepEqual(widths, { name: 30 });
});
