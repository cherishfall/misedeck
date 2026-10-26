// Render-level wiring for ConfirmDialog (issue #291): what `focusTarget.ts`
// and `dialogKeys.ts` decide, seen through the real component and a real
// DOM (jsdom) instead of the pure helpers alone — the modal's focus landing
// spot, the capture-phase key handling, the Tab cycle inside the dialog,
// and focus returning to the opener.
//
// Run via `npm run test:ui` (node:test through tsx + jsdom; see
// `scripts/test-dom-env.mjs`). Assertions are behavior and DOM semantics —
// no snapshots.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ComponentProps } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import i18n from "../../i18n";
import { ConfirmDialog } from "./ConfirmDialog";

// `src/i18n` kicks off initialization on import; wait for it so the
// assertions compare against catalog copy rather than raw keys.
if (!i18n.isInitialized) {
  await new Promise<void>((resolve) => {
    i18n.on("initialized", () => resolve());
  });
}
await i18n.changeLanguage("en");

const CONFIRM_BUSY_COPY = i18n.t("common.confirmBusy");

/** A stable label for whatever currently holds focus. Comparing the DOM
 *  nodes themselves would make a failing `assert.equal` inspect a jsdom
 *  element — and through it the whole document — to build its message. */
function focusedLabel(): string {
  const el = document.activeElement;
  if (!el || el === document.body) return "body";
  return (
    el.getAttribute("data-testid") ??
    el.textContent?.trim() ??
    el.tagName.toLowerCase()
  );
}

function dialogProps(
  overrides: Partial<ComponentProps<typeof ConfirmDialog>> = {},
): ComponentProps<typeof ConfirmDialog> {
  return {
    open: true,
    title: "Uninstall node?",
    body: "This removes the tool.",
    command: "mise uninstall node",
    confirmLabel: "Uninstall",
    cancelLabel: "Cancel",
    confirmBusy: false,
    onConfirm: () => {},
    onCancel: () => {},
    ...overrides,
  };
}

test("busy: Confirm is disabled and aria-describedby names the in-dialog reason", (t) => {
  t.after(cleanup);
  render(<ConfirmDialog {...dialogProps({ confirmBusy: true })} />);

  const confirm = screen.getByTestId("confirm-dialog-confirm") as HTMLButtonElement;
  const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;

  assert.equal(confirm.disabled, true);
  assert.equal(cancel.disabled, false, "Cancel stays enabled — the lock must not trap the user");

  const describedBy = confirm.getAttribute("aria-describedby");
  assert.ok(describedBy, "a disabled Confirm must point at the reason it is disabled");
  const reason = document.getElementById(describedBy);
  assert.ok(reason, "aria-describedby must resolve to a rendered element");
  assert.equal(reason.textContent, CONFIRM_BUSY_COPY);
  assert.ok(
    screen.getByRole("alertdialog").contains(reason),
    "the reason lives inside the dialog, where the user is",
  );
});

test("not busy: Confirm carries no aria-describedby", (t) => {
  t.after(cleanup);
  render(<ConfirmDialog {...dialogProps()} />);

  const confirm = screen.getByTestId("confirm-dialog-confirm") as HTMLButtonElement;
  assert.equal(confirm.disabled, false);
  assert.equal(confirm.hasAttribute("aria-describedby"), false);
});

test("a destructive dialog opens on Cancel and returns focus to its opener on close", (t) => {
  t.after(cleanup);
  let confirmed = 0;

  function Harness({ open }: { open: boolean }) {
    return (
      <>
        <button type="button" data-testid="opener">
          Open
        </button>
        <ConfirmDialog
          {...dialogProps({
            open,
            onConfirm: () => {
              confirmed += 1;
            },
          })}
        />
      </>
    );
  }

  const { rerender } = render(<Harness open={false} />);
  const opener = screen.getByTestId("opener");
  opener.focus();
  assert.equal(focusedLabel(), "opener");

  rerender(<Harness open={true} />);
  const cancel = screen.getByRole("button", { name: "Cancel" });
  assert.equal(
    focusedLabel(),
    "Cancel",
    "opening with Enter must land on Cancel, not arm the destructive button",
  );

  // Enter is not a dialog-level shortcut: only the focused button's own
  // activation can confirm. jsdom does not synthesize the native click,
  // so the assertion here is that the dialog itself never maps Enter to
  // onConfirm.
  fireEvent.keyDown(cancel, { key: "Enter" });
  assert.equal(confirmed, 0);

  rerender(<Harness open={false} />);
  assert.equal(
    focusedLabel(),
    "opener",
    "focus returns to whatever opened the dialog",
  );
});

test("Tab cycles inside the open dialog and wraps at both ends", (t) => {
  t.after(cleanup);
  render(
    <>
      <button type="button" data-testid="behind">
        Behind the overlay
      </button>
      <ConfirmDialog {...dialogProps()} />
    </>,
  );

  const cancel = screen.getByRole("button", { name: "Cancel" });
  const confirm = screen.getByTestId("confirm-dialog-confirm");

  cancel.focus();
  assert.equal(
    fireEvent.keyDown(cancel, { key: "Tab" }),
    false,
    "the dialog owns Tab (preventDefault), so the page behind stays unreachable",
  );
  assert.equal(focusedLabel(), "confirm-dialog-confirm");

  fireEvent.keyDown(confirm, { key: "Tab" });
  assert.equal(focusedLabel(), "Cancel", "Tab wraps at the end of the cycle");

  fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
  assert.equal(focusedLabel(), "confirm-dialog-confirm", "Shift-Tab wraps at the start");
});

test("Tab in a busy dialog keeps focus on the only focusable control", (t) => {
  t.after(cleanup);
  render(<ConfirmDialog {...dialogProps({ confirmBusy: true })} />);

  const cancel = screen.getByRole("button", { name: "Cancel" });
  cancel.focus();

  assert.equal(fireEvent.keyDown(cancel, { key: "Tab" }), false);
  assert.equal(
    focusedLabel(),
    "Cancel",
    "with nothing else focusable, focus parks on Cancel instead of escaping",
  );
});

test("Escape is handled in the capture phase, before a nested form can swallow it", (t) => {
  t.after(cleanup);
  let cancels = 0;
  let nestedBubbleSawKey = 0;

  render(
    // Mirrors KeyForm: a bubble-phase keydown handler that stops the
    // event so the form does not act on keys meant for its fields.
    <div
      onKeyDown={(event) => {
        nestedBubbleSawKey += 1;
        event.stopPropagation();
      }}
    >
      <ConfirmDialog
        {...dialogProps({
          onCancel: () => {
            cancels += 1;
          },
        })}
      />
    </div>,
  );

  const cancel = screen.getByRole("button", { name: "Cancel" });
  const notPrevented = fireEvent.keyDown(cancel, { key: "Escape" });

  assert.equal(cancels, 1, "Escape cancels the dialog");
  assert.equal(notPrevented, false, "Escape is consumed by the dialog");
  assert.equal(
    nestedBubbleSawKey,
    0,
    "capture phase — the nested bubble handler never sees the key",
  );
});
