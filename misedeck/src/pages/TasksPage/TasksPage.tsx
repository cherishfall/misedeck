// TasksPage — the tasks table for the current directory (issue #27);
// in the Global context it lists the globally resolved tasks
// (issue #48), matching `mise tasks ls` in the home directory.
//
//   * `mise tasks ls --json`   → table rows (name, run, description,
//                                depends, actions)
//   * `mise run <name>`        → Run button; output streams to the
//                                existing execution panel
//   * `mise tasks add <name> … -- <run>`   → Edit form save; writes
//                                go through the execution panel
//                                (no direct TOML edits per the
//                                architecture doc)
//   * `mise tasks edit --path <name>`       → returns the path of
//                                the file that defines the task;
//                                fed to `tauri-plugin-opener` for
//                                the "open the TOML directly"
//                                affordance
//
// All mutations and the open-in-editor side-effect go through
// `useTrustGuard()` — when the cwd's `mise.toml` is untrusted,
// the click handlers focus the trust banner instead of
// executing. The pattern is the same one the env page
// (#41) uses; the trust banner lives on the preview page
// (#25) and the JS side navigates to it via a `key` prefix
// shared with the preview's banner.

import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { openPath as openExternalPath } from "@tauri-apps/plugin-opener";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import {
  useTrust,
  useTrustAction,
  useTrustGuard,
} from "../../state/trustContext";
import { detectMise, isAppError, tasksEditPath } from "../../api/mise";
import { useExecutionContext } from "../../components/ExecutionPanel";
import type { ExecutionStatus } from "../../components/ExecutionPanel";
import {
  taskRunDisplay,
  parseDependsInput,
} from "../../api/miseTools";
import {
  Banner,
  Button,
  EmptyState,
  PageShell,
  Table,
  type TableColumn,
} from "../../components";
import { useParsedTasksList } from "../../hooks/useTasksList";

import type { MiseTask } from "../../types/tauri";

import styles from "./TasksPage.module.css";

// ---------- Row shapes ----------

interface TaskRow {
  /** Stable row id. */
  id: string;
  /** The task name. */
  name: string;
  /** The run command, joined from `MiseTask.run`. Empty when the
   *  task has no `run` lines. */
  run: string;
  /** Free-text description. */
  description: string;
  /** Names this task depends on. */
  depends: string[];
  /** True when `hide = true` in the TOML. */
  hide: boolean;
}

// ---------- Args builders (mirror the Rust helpers) ----------
//
// The Rust side defines `mise_run_task_argv` and
// `mise_tasks_add_argv` in pure form. The JS side duplicates the
// shape so the page is self-contained — the only Rust call is
// `useExecutionContext().run({cwd, args})`, which accepts the
// prebuilt argv verbatim. Keep the two in lockstep — the Rust
// `tests/tasks.rs` asserts the exact strings.
//
// The Rust builder for `tasks add` takes the run as a slice of
// shell tokens; the JS form passes the user's free-text run as a
// single token because mise's `run` field is a string (multi-line
// runs are written as a single quoted value in the TOML, and
// `mise tasks add` quotes the run verbatim when it sees a single
// token). This is the same shape `mise use <tool>@<version>`
// uses — the tool spec is a single argv token and the runner's
// shell-metacharacter check rejects unsafe input.

function miseRunTaskArgs(name: string): string[] {
  return ["run", name];
}

function miseTasksAddArgs(
  name: string,
  run: string,
  depends: string[],
): string[] {
  const argv: string[] = ["tasks", "add"];
  for (const dep of depends) {
    if (dep.length === 0) continue;
    argv.push("--depends", dep);
  }
  argv.push(name);
  argv.push("--");
  argv.push(run);
  return argv;
}

// ---------- Page ----------

export function TasksPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();
  const { state: execState, run } = useExecutionContext();
  const { state: trust } = useTrust();
  const trustAction = useTrustAction();
  const guard = useTrustGuard();
  // The trust banner is rendered by the page itself so the guard
  // can scroll to it on a blocked mutation. The ref is forwarded
  // to the banner; the focus function is what the mutation
  // handlers call when the guard blocks.
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const focusTrustBanner = useCallback(() => {
    const el = bannerRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const btn = el.querySelector<HTMLButtonElement>("button");
      btn?.focus();
    }
  }, []);

  // First check: is mise available at all? Same gate every page
  // uses. When mise is missing, render the missing state — the
  // rest of the queries are pointless.
  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const tasks = useParsedTasksList();

  // After a successful task write, the read query becomes stale.
  // Observe the running → ok transition (the same transition the
  // env page and the trust action use) and invalidate the
  // task list so the table refreshes with the new shape.
  const lastWriteStatusRef = useRef<ExecutionStatus>("idle");
  useEffect(() => {
    const prev = lastWriteStatusRef.current;
    lastWriteStatusRef.current = execState.status;
    if (prev === "running" && execState.status === "ok") {
      void queryClient.invalidateQueries({ queryKey: ["tasks", "ls", cwd] });
    }
  }, [execState.status, cwd, queryClient]);

  // The execution panel reducer is the single source of truth
  // for "is a write in flight". A single `running` flag feeds
  // every action button so the user can't fire two mutations
  // at once.
  const isRunning = execState.status === "running";

  // Run a task via the panel. The trust guard is checked first
  // (running a task in an untrusted directory would also fail
  // — the runner would set MISE_SAFE=1 — so we surface the
  // banner up front).
  const runTask = useCallback(
    async (name: string) => {
      if (!guard.allowed) {
        focusTrustBanner();
        return;
      }
      if (isRunning) return;
      await run({ cwd, args: miseRunTaskArgs(name) });
    },
    [guard.allowed, focusTrustBanner, isRunning, run, cwd],
  );

  // Save a task edit via the panel. Same trust-guard pattern.
  const saveTask = useCallback(
    async (name: string, runCmd: string, depends: string[]) => {
      if (!guard.allowed) {
        focusTrustBanner();
        return;
      }
      if (isRunning) return;
      if (runCmd.trim().length === 0) {
        // mise's `tasks add -- <empty>` is rejected. Refuse here
        // so the panel doesn't fill with a wasted failed run.
        return;
      }
      await run({ cwd, args: miseTasksAddArgs(name, runCmd, depends) });
    },
    [guard.allowed, focusTrustBanner, isRunning, run, cwd],
  );

  // Open the file that defines the task in the OS default editor.
  // The "open the TOML directly" affordance is gated by the trust
  // guard because it touches the same file the user has not yet
  // trusted. The path is sourced from `mise tasks edit --path`,
  // which the Rust runner returns as the file mise would edit;
  // we ship the path to `tauri-plugin-opener` (a read-only
  // effect on the filesystem).
  const openInEditor = useCallback(
    async (name: string) => {
      if (!guard.allowed) {
        focusTrustBanner();
        return;
      }
      const res = await tasksEditPath(cwd, name);
      if (res.kind === "err") {
        // Surface the failure as a transient page-level message
        // — the panel is for mise invocations, this is a UI-side
        // error from the plugin call.
        setEditorError(t(I18N_KEYS.tasks.openEditorError.body));
        return;
      }
      if (!res.path) {
        setEditorError(t(I18N_KEYS.tasks.openEditorError.body));
        return;
      }
      setEditorError(null);
      try {
        await openExternalPath(res.path);
      } catch {
        setEditorError(t(I18N_KEYS.tasks.openEditorError.body));
      }
    },
    [guard.allowed, focusTrustBanner, cwd, t],
  );

  // Track the open-in-editor error so the user can see why
  // nothing happened. Cleared on each new attempt.
  const [editorError, setEditorError] = useState<string | null>(null);

  // The edit form is per-row; `editingName === row.name` opens
  // the form below that row. The form is a single child
  // rendered outside the table so the table's strict
  // <table><tbody> structure stays valid (rendering the form
  // inside a <td> would violate HTML semantics).
  const [editingName, setEditingName] = useState<string | null>(null);
  const beginEdit = useCallback((name: string) => {
    setEditorError(null);
    setEditingName((cur) => (cur === name ? null : name));
  }, []);
  const cancelEdit = useCallback(() => setEditingName(null), []);
  const onEditSaved = useCallback(() => setEditingName(null), []);

  // Task rows. Defensive copy + hide-aware display.
  const taskRows: TaskRow[] = useMemo(() => {
    if (!tasks.data) return [];
    return tasks.data.map((t) => ({
      id: t.name,
      name: t.name,
      run: taskRunDisplay(t.run),
      description: t.description,
      depends: t.depends,
      hide: t.hide,
    }));
  }, [tasks.data]);

  // Mise-missing state.
  if (detect.isPending) {
    return <TasksLoading />;
  }
  const detectValue = detect.data;
  if (detectValue && detectValue.kind === "err" && isAppError(detectValue.err)) {
    if (detectValue.err.code === "MISE_NOT_FOUND" || detectValue.err.code === "MISE_TOO_OLD") {
      return (
        <PageShell>
          <div className={styles.page}>
            <EmptyState
              eyebrow={t(I18N_KEYS.states.notInstalled.title)}
              title={t(I18N_KEYS.tools.missing.title)}
              body={t(I18N_KEYS.tools.missing.body)}
            />
          </div>
        </PageShell>
      );
    }
  }

  // No separate Global empty state: issue #48 renders the globally
  // resolved task list instead, matching `mise tasks ls` in the
  // home directory.

  const tasksError = tasks.error?.kind === "err" ? tasks.error.err : null;

  const columns: TableColumn<TaskRow>[] = [
    {
      key: "name",
      header: t(I18N_KEYS.tasks.columns.name),
      width: "22%",
      cell: (r) => (
        <span className={styles.cellName} title={r.name}>
          <span className={styles.taskName}>{r.name}</span>
          {r.hide && (
            <span className={styles.taskHidden}>hide</span>
          )}
        </span>
      ),
    },
    {
      key: "run",
      header: t(I18N_KEYS.tasks.columns.run),
      width: "28%",
      cell: (r) =>
        r.run ? (
          <code className={styles.cellRun}>{r.run}</code>
        ) : (
          <span className={styles.cellRunEmpty}>—</span>
        ),
    },
    {
      key: "description",
      header: t(I18N_KEYS.tasks.columns.description),
      cell: (r) =>
        r.description ? (
          <span className={styles.cellDescription}>{r.description}</span>
        ) : (
          <span className={styles.cellDescriptionEmpty}>—</span>
        ),
    },
    {
      key: "depends",
      header: t(I18N_KEYS.tasks.columns.depends),
      width: "180px",
      cell: (r) =>
        r.depends.length > 0 ? (
          <span className={styles.cellDepends}>
            {r.depends.map((d) => (
              <span key={d} className={styles.dependsTag}>
                {d}
              </span>
            ))}
          </span>
        ) : (
          <span className={styles.dependsEmpty}>—</span>
        ),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.tasks.columns.actions),
      width: "200px",
      cell: (r) => (
        <span className={styles.cellActions}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void runTask(r.name)}
            disabled={isRunning}
            data-testid={`tasks-run-${r.name}`}
          >
            {t(I18N_KEYS.tasks.runButton)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => beginEdit(r.name)}
            disabled={isRunning}
            data-testid={`tasks-edit-${r.name}`}
          >
            {t(I18N_KEYS.tasks.editButton)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void openInEditor(r.name)}
            disabled={isRunning}
            data-testid={`tasks-open-${r.name}`}
          >
            {t(I18N_KEYS.tasks.openInEditorButton)}
          </Button>
        </span>
      ),
    },
  ];

  // The currently-edited task — used to inject the edit form
  // below the table so the user can see what they are editing
  // while the form is open. `null` when no row is being edited.
  const editingTask = useMemo(
    () => (editingName ? tasks.data?.find((t) => t.name === editingName) ?? null : null),
    [editingName, tasks.data],
  );

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{t(I18N_KEYS.tasks.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.tasks.title)}</h1>
          <p className={styles.commandHint}>{t(I18N_KEYS.tasks.commandHint)}</p>
          <p className={styles.hint}>{t(I18N_KEYS.tasks.subtitle)}</p>
        </header>

        <div className={styles.toolbar}>
          <span className={styles.toolbarHint}>
            {tasks.data
              ? `${tasks.data.length} ${t(I18N_KEYS.tasks.columns.name).toLowerCase()}`
              : t(I18N_KEYS.common.loading)}
          </span>
          <button
            type="button"
            className={styles.refresh}
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: ["tasks", "ls", cwd] })
            }
            disabled={tasks.isPending}
            data-testid="tasks-refresh"
          >
            {t(I18N_KEYS.common.refresh)}
          </button>
        </div>


        {/* Trust banner (issue #25). Same forwardRef pattern
            the config / preview pages use so the guard can focus
            it on a blocked mutation. */}
        <TrustBanner
          ref={bannerRef}
          trust={trust}
          running={trustAction.running}
          lastResult={trustAction.lastResult}
          lastError={trustAction.lastError}
          onTrust={trustAction.run}
        />

        {editorError && (
          <div className={styles.errorState} data-testid="tasks-editor-error">
            <div className={styles.errorLabel}>
              {t(I18N_KEYS.tasks.openEditorError.title)}
            </div>
            <p className={styles.errorBody}>{editorError}</p>
          </div>
        )}

        {tasksError && (
          <div className={styles.errorState} data-testid="tasks-read-error">
            <div className={styles.errorLabel}>
              {t(I18N_KEYS.tasks.readError.title)}
            </div>
            <p className={styles.errorBody}>{t(I18N_KEYS.tasks.readError.body)}</p>
            {tasksError.stderr && (
              <pre className={styles.errorStderr}>{tasksError.stderr}</pre>
            )}
          </div>
        )}

        {!tasksError && (
          <>
            <Table<TaskRow>
              columns={columns}
              rows={taskRows}
              rowKey={(r) => r.id}
              fixed
              empty={
                <EmptyState
                    title={t(I18N_KEYS.tasks.empty.title)}
                  body={t(I18N_KEYS.tasks.empty.body)}
                />
              }
            />

            {editingTask && (
              <EditForm
                key={editingTask.name}
                task={editingTask}
                onSave={async (runCmd, depends) => {
                  await saveTask(editingTask.name, runCmd, depends);
                  onEditSaved();
                }}
                onCancel={cancelEdit}
                disabled={isRunning}
              />
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function TasksLoading() {
  const { t } = useTranslation();
  return (
    <PageShell>
      <div className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.dot} aria-hidden="true" />
          <span>{t(I18N_KEYS.common.loading)}</span>
        </div>
      </div>
    </PageShell>
  );
}

// ---------- Edit form ----------

/**
 * The inline editor for one task row. The name is read-only
 * (v1 does not support renaming — `mise tasks add` updates in
 * place but the rename path is non-trivial). The run and
 * depends fields are editable. Save dispatches
 * `mise tasks add <name> [--depends ...] -- <run>` through
 * the execution panel; the trust guard is applied by the
 * page's `saveTask` so the form is local state only.
 */
function EditForm({
  task,
  onSave,
  onCancel,
  disabled,
}: {
  task: MiseTask;
  onSave: (runCmd: string, depends: string[]) => void | Promise<void>;
  onCancel: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [run, setRun] = useState(taskRunDisplay(task.run));
  const [dependsText, setDependsText] = useState(task.depends.join(", "));
  // Reset local state if the user opens a different task while
  // the form is mounted.
  useEffect(() => {
    setRun(taskRunDisplay(task.run));
    setDependsText(task.depends.join(", "));
  }, [task.name, task.run, task.depends]);

  const depends = useMemo(() => parseDependsInput(dependsText), [dependsText]);
  const dirty =
    run !== taskRunDisplay(task.run) ||
    depends.join(",") !== task.depends.join(",");
  const valid = run.trim().length > 0;

  return (
    <div
      className={styles.editForm}
      data-testid={`tasks-edit-form-${task.name}`}
    >
      <h3 className={styles.editFormTitle}>
        {t(I18N_KEYS.tasks.editForm.title)} · {task.name}
      </h3>
      <p className={styles.editFormSub}>
        {t(I18N_KEYS.tasks.editForm.dependsHelp)}
      </p>

      <div className={styles.editFormField}>
        <label className={styles.editFormLabel} htmlFor="tasks-edit-name">
          {t(I18N_KEYS.tasks.columns.name)}
        </label>
        <input
          id="tasks-edit-name"
          name="name"
          type="text"
          className={styles.editFormInput}
          value={task.name}
          disabled
          readOnly
        />
      </div>

      <div className={styles.editFormField}>
        <label className={styles.editFormLabel} htmlFor="tasks-edit-run">
          {t(I18N_KEYS.tasks.editForm.runLabel)}
        </label>
        <input
          id="tasks-edit-run"
          name="run"
          type="text"
          className={styles.editFormInput}
          value={run}
          onChange={(e) => setRun(e.target.value)}
          placeholder={t(I18N_KEYS.tasks.editForm.runPlaceholder)}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <div className={styles.editFormField}>
        <label className={styles.editFormLabel} htmlFor="tasks-edit-depends">
          {t(I18N_KEYS.tasks.editForm.dependsLabel)}
        </label>
        <input
          id="tasks-edit-depends"
          name="depends"
          type="text"
          className={styles.editFormInput}
          value={dependsText}
          onChange={(e) => setDependsText(e.target.value)}
          placeholder={t(I18N_KEYS.tasks.editForm.dependsPlaceholder)}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <div className={styles.editFormActions}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void onSave(run, depends)}
          disabled={disabled || !dirty || !valid}
          data-testid={`tasks-edit-save-${task.name}`}
        >
          {t(I18N_KEYS.tasks.editForm.saveButton)}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={disabled}
          data-testid={`tasks-edit-cancel-${task.name}`}
        >
          {t(I18N_KEYS.tasks.editForm.cancelButton)}
        </Button>
        {!valid && (
          <span className={styles.editFormError}>
            {t(I18N_KEYS.tasks.editForm.runLabel)} required
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- Trust banner (issue #25) ----------
//
// Same forwardRef pattern the config / preview pages use.
// Renders nothing in every state except `untrusted`, so it is
// safe to drop into the page unconditionally. The one-click
// `Trust` action routes through the execution panel so the
// `mise trust` attempt is visible alongside any other panel
// activity; on success the trust query invalidates itself and
// the banner disappears.

interface TrustBannerProps {
  trust: ReturnType<typeof useTrust>["state"];
  running: boolean;
  lastResult: "ok" | "error" | null;
  lastError: string | null;
  onTrust: () => void;
}

const TrustBanner = forwardRef<HTMLDivElement, TrustBannerProps>(
  function TrustBanner({ trust, running, lastResult, lastError, onTrust }, ref) {
    const { t } = useTranslation();
    if (trust.kind !== "untrusted") return null;
    return (
      <div ref={ref} data-testid="tasks-trust-banner">
        <Banner
          tone="warning"
          label={t(I18N_KEYS.trust.banner.label)}
          action={
            <Button
              variant="primary"
              size="sm"
              loading={running}
              disabled={running}
              onClick={onTrust}
              data-testid="tasks-trust-button"
            >
              {running
                ? t(I18N_KEYS.trust.busy)
                : t(I18N_KEYS.trust.banner.action)}
            </Button>
          }
        >
          {t(I18N_KEYS.tasks.guard.untrustedBody)}
          {trust.path ? (
            <span className={styles.contextPath} title={trust.path}> · {trust.path}</span>
          ) : null}
        </Banner>
        {lastResult === "ok" && (
          <div className={styles.editFormHelp} data-testid="tasks-trust-ok">
            {t(I18N_KEYS.trust.ok)}
          </div>
        )}
        {lastResult === "error" && (
          <div className={styles.editFormError} data-testid="tasks-trust-error">
            {t(I18N_KEYS.trust.error)}
            {lastError ? <> · {lastError}</> : null}
          </div>
        )}
      </div>
    );
  },
);
