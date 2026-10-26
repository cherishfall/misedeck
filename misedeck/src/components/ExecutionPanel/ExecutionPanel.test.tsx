// Render-level wiring for the execution panel (issue #291): the reducer's
// run lifecycle seen through the real component tree instead of the pure
// `executionState` reducer alone — a settled run's chip leaves "running"
// and gains its close affordance, a genuinely running run stays protected,
// and a failure opens a closed panel.
//
// Run via `npm run test:ui` (node:test through tsx + jsdom).
//
// Only the Tauri IPC boundary is faked, and at the same seam production
// uses: `src/api/invoke.ts` forwards to `window.__TAURI_INTERNALS__.invoke`,
// and `Channel` (see `useExecution`) asks the same object for callback ids.
// No test imports `@tauri-apps/api` directly — `lint:invoke-wrapper` keeps
// `src/api/invoke.ts` the app's only invoke import, tests included.

import assert from "node:assert/strict";
import { test } from "node:test";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import i18n from "../../i18n";
import { ExecutionPanel } from "./ExecutionPanel";
import { ExecutionProvider, useExecutionContext } from "./ExecutionContext";
import type { RunCommandResult } from "./useExecution";

if (!i18n.isInitialized) {
  await new Promise<void>((resolve) => {
    i18n.on("initialized", () => resolve());
  });
}
await i18n.changeLanguage("en");

type InvokeScript = (
  command: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

const scripts: InvokeScript[] = [];
let callbackSeq = 0;

// `window`, not `globalThis`: global-jsdom copies the window's properties
// onto the Node global, but the two objects stay distinct, and the Tauri
// API reads the jsdom `window`.
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: (command: string, args: Record<string, unknown>) => {
      const script = scripts.shift();
      assert.ok(script, `unexpected invocation of ${command}`);
      return script(command, args);
    },
    transformCallback: () => ++callbackSeq,
  },
});

/** A run whose IPC call is resolved by the test, so "still running" is a
 *  real pending promise rather than a status the reducer was told to fake. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function okOutcome(exitCode: number, durationMs: number): RunCommandResult {
  return {
    kind: "ok",
    outcome: { stdout: "", stderr: "", exitCode, durationMs, timedOut: false },
    newVersion: null,
  };
}

/** Reaches into the provider so the test drives the same `run()` /
 *  `removeRun()` the pages call. */
let ctx: ReturnType<typeof useExecutionContext> | null = null;

function Probe() {
  ctx = useExecutionContext();
  return null;
}

function ctl(): ReturnType<typeof useExecutionContext> {
  assert.ok(ctx, "the probe must render inside the provider first");
  return ctx;
}

function renderPanel() {
  return render(
    <ExecutionProvider>
      <Probe />
      <ExecutionPanel />
    </ExecutionProvider>,
  );
}

function toneOf(chip: HTMLElement): string | null {
  return chip.querySelector("[data-tone]")?.getAttribute("data-tone") ?? null;
}

test("a settled run's chip leaves running and gains its close affordance; a running run stays protected", async (t) => {
  t.after(cleanup);
  ctx = null;
  // The panel's open state is persisted; start every test from closed.
  localStorage.clear();

  renderPanel();
  assert.equal(screen.queryByTestId("execution-log"), null, "the panel starts closed");
  await act(async () => {
    ctl().openPanel();
  });

  const first = deferred<RunCommandResult>();
  const second = deferred<RunCommandResult>();
  scripts.push(() => first.promise, () => second.promise);

  let firstRun!: Promise<RunCommandResult>;
  await act(async () => {
    firstRun = ctl().run({ cwd: null, args: ["ls"] });
  });
  await act(async () => {
    // Deliberately un-awaited: this run stays in flight for the whole test.
    void ctl().run({ cwd: null, args: ["install"] });
  });

  const firstChip = screen.getByTitle("mise ls");
  const secondChip = screen.getByTitle("mise install");
  assert.equal(toneOf(firstChip), "beam");
  assert.equal(toneOf(secondChip), "beam");
  assert.equal(
    screen.queryAllByTestId("execution-run-close").length,
    0,
    "a running run offers no close affordance",
  );

  // No Channel Exit event ever arrives — the invoke result is what settles
  // the run (issue #286), so the chip must leave "running" instead of
  // sticking as a zombie.
  await act(async () => {
    first.resolve(okOutcome(0, 25));
    await firstRun;
  });

  assert.equal(toneOf(firstChip), "ok", "the settled chip reports its outcome");
  assert.equal(toneOf(secondChip), "beam", "the other run is untouched");
  assert.equal(screen.queryAllByTestId("execution-run-close").length, 1);

  // Running runs are protected (ADR-0005): the panel is the only surface
  // for an in-flight mise invocation, so asking to remove one is a no-op.
  const runningId = ctl().activeRunId;
  assert.ok(runningId);
  await act(async () => {
    ctl().removeRun(runningId);
  });
  assert.equal(screen.getAllByTestId("execution-run-chip").length, 2);

  // A settled run, by contrast, closes.
  await act(async () => {
    fireEvent.click(screen.getByTestId("execution-run-close"));
  });
  assert.equal(screen.queryByTitle("mise ls"), null);
  assert.ok(
    screen.getByText("mise install") !== null,
    "the running run's echo stays in the panel",
  );
});

test("a run that fails while the panel is closed opens it and reports the failure", async (t) => {
  t.after(cleanup);
  ctx = null;
  localStorage.clear();

  const failing = deferred<RunCommandResult>();
  scripts.push(() => failing.promise);

  renderPanel();
  assert.equal(screen.queryByTestId("execution-log"), null);

  let run!: Promise<RunCommandResult>;
  await act(async () => {
    run = ctl().run({ cwd: null, args: ["run", "build"] });
  });
  assert.equal(
    screen.queryByTestId("execution-log"),
    null,
    "starting a run does not yank a closed panel open",
  );

  await act(async () => {
    failing.resolve({
      kind: "err",
      err: { code: "COMMAND_FAILED", message: "errors.unknown", stderr: "boom" },
    });
    await run;
  });

  assert.ok(
    screen.getByTestId("execution-log") !== null,
    "a failure opens the closed panel once",
  );
  assert.ok(
    document.querySelector('[data-tone="fail"]') !== null,
    "the status dot reports the failure",
  );
  assert.ok(
    screen.getByText(i18n.t("execution.statusFailedNoCode", { duration: "0.0" })) !== null,
    "the header states the failure",
  );
});
