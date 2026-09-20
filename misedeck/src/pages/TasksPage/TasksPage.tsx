// TasksPage — the tasks table for the current directory (issue #27);
// in the Global context it lists the globally resolved tasks
// (issue #48), matching `mise tasks ls` in the home directory.
//
//   * `mise tasks ls --json`   → table rows (name, run, description,
//                                depends, actions)
//   * `mise run <name>`        → Run button; output streams to the
//                                existing execution panel
//   * `mise tasks add <name> … -- <run words>`   → the shared task
//                                form's save (row edit and the empty
//                                state's create entry, issue #161);
//                                writes go through the execution
//                                panel (no direct TOML edits per the
//                                architecture doc)
//   * `mise tasks edit --path <name>`       → Open in editor; runs
//                                through the execution panel like
//                                every user-triggered mise call
//                                (ADR-0005), the returned path fed to
//                                `tauri-plugin-opener`
//
// All mutations and the open-in-editor side-effect go through
// `useTrustGuard()` — when the cwd's `mise.toml` is untrusted,
// the click handlers focus the trust banner instead of
// executing. The banner itself is the shared `TrustBanner`
// component (issues #25 / #141); the focus hook is the guard
// contract's other half.

import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { openPath as openExternalPath } from "@tauri-apps/plugin-opener";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { useTrustGuard } from "../../state/trustContext";
import { detectMise, isAppError } from "../../api/mise";
import { useOwnRun } from "../../components/ExecutionPanel";
import {
  taskRunDisplay,
  parseDependsInput,
  parseRunInput,
} from "../../api/miseTools";
import {
  Button,
  CommandHint,
  EmptyState,
  KeyForm,
  ListLoading,
  PageShell,
  SuccessBar,
  Suggestions,
  Table,
  type TableColumn,
  TableFilter,
  Tooltip,
  TrustBanner,
  useRegisterPageRefresh,
  useTrustBannerFocus,
} from "../../components";
import { useParsedTasksList } from "../../hooks/useTasksList";
import { useTableFilter } from "../../hooks/useTableFilter";

import type { ConfigFile, MiseTask } from "../../types/tauri";

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
// shell words; the JS form passes the user's run draft split the
// same way (issue #161): the run field is a `<textarea>` edited
// one command per line, and save splits each line into shell
// words — the same splitting an interactive shell would apply —
// so `mise tasks add` receives the command exactly as the user
// typed it. (`mise tasks add` writes `run` as
// `shell_words::join(RUN)`, one string with each word re-quoted
// as needed; sending a whole line as a single token would store
// it quoted and the task would not run.) The runner's value-token
// check (issue #160) lets these words through regardless, so the
// split is about argv fidelity, not about the guardrail.

function miseRunTaskArgs(name: string): string[] {
  return ["run", name];
}

function miseTasksEditPathArgs(name: string): string[] {
  return ["tasks", "edit", "--path", name];
}

function miseConfigLsArgs(): string[] {
  return ["config", "ls", "--json"];
}

function miseTasksAddArgs(
  name: string,
  description: string,
  depends: string[],
  runWords: string[],
): string[] {
  const argv: string[] = ["tasks", "add"];
  if (description.length > 0) {
    argv.push("--description", description);
  }
  for (const dep of depends) {
    if (dep.length === 0) continue;
    argv.push("--depends", dep);
  }
  argv.push(name);
  argv.push("--");
  argv.push(...runWords);
  return argv;
}

// ---------- Page ----------

export function TasksPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();
  const guard = useTrustGuard();
  // The trust banner is the shared component; the focus hook is what
  // the mutation handlers call when the guard blocks (issues
  // #25 / #141).
  const { ref: bannerRef, focus: focusTrustBanner } = useTrustBannerFocus();

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

  // In-page success confirmation (issue #145): a successful save
  // closes the loop here with a short-lived bar; failures are
  // unchanged — the panel still auto-opens.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Top-toolbar refresh (issue #98).
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tasks", "ls", cwd] });
  }, [queryClient, cwd]);
  useRegisterPageRefresh(onRefresh);

  // Per-action run-locking (issue #138): each command-firing action gets
  // its own hook, so a control freezes only while *its* command is in
  // flight. Browsing and drafting never lock (issue #135).
  const taskRun = useOwnRun();
  const saveRun = useOwnRun();
  const editorRun = useOwnRun();
  const configRun = useOwnRun();

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
      if (taskRun.isRunning) return;
      await taskRun.run({ cwd, args: miseRunTaskArgs(name) });
    },
    [guard.allowed, focusTrustBanner, taskRun.isRunning, taskRun.run, cwd],
  );

  // Save a task create/edit via the panel. Same trust-guard
  // pattern. On this run's own success, refresh the task list so
  // the table shows the new shape. Returns whether the save ran —
  // the caller closes the form only on `true` (issue #161): a
  // failed run, a trust block, or an empty run keeps the draft
  // open so nothing the user typed is lost.
  const saveTask = useCallback(
    async (
      name: string,
      description: string,
      depends: string[],
      runWords: string[],
    ): Promise<boolean> => {
      if (!guard.allowed) {
        focusTrustBanner();
        return false;
      }
      if (saveRun.isRunning) return false;
      if (runWords.length === 0) {
        // mise's `tasks add -- <empty>` is rejected. Refuse here
        // so the panel doesn't fill with a wasted failed run.
        return false;
      }
      const res = await saveRun.run({ cwd, args: miseTasksAddArgs(name, description, depends, runWords) });
      if (res.kind !== "ok") return false;
      void queryClient.invalidateQueries({ queryKey: ["tasks", "ls", cwd] });
      return true;
    },
    [guard.allowed, focusTrustBanner, saveRun.isRunning, saveRun.run, cwd, queryClient],
  );

  // Open the file that defines the task in the OS default editor.
  // The "open the TOML directly" affordance is gated by the trust
  // guard because it touches the same file the user has not yet
  // trusted. `mise tasks edit --path` is a user-triggered mise
  // invocation, so it runs through the execution panel (ADR-0005);
  // on success the echoed path from stdout goes to
  // `tauri-plugin-opener` (a read-only effect on the filesystem).
  const openInEditor = useCallback(
    async (name: string) => {
      if (!guard.allowed) {
        focusTrustBanner();
        return;
      }
      if (editorRun.isRunning) return;
      const res = await editorRun.run({ cwd, args: miseTasksEditPathArgs(name) });
      if (res.kind === "err") {
        // The failed run auto-opens the panel with stderr; the
        // page-level message explains what the attempt was for.
        setEditorError(t(I18N_KEYS.tasks.openEditorError.body));
        return;
      }
      if (res.outcome.exitCode !== 0) {
        setEditorError(t(I18N_KEYS.tasks.openEditorError.body));
        return;
      }
      const path = res.outcome.stdout.trim();
      if (!path) {
        setEditorError(t(I18N_KEYS.tasks.openEditorError.body));
        return;
      }
      setEditorError(null);
      try {
        await openExternalPath(path);
      } catch {
        setEditorError(t(I18N_KEYS.tasks.openEditorError.body));
      }
    },
    [guard.allowed, focusTrustBanner, editorRun.isRunning, editorRun.run, cwd, t],
  );

  // Track the open-in-editor error so the user can see why
  // nothing happened. Cleared on each new attempt.
  const [editorError, setEditorError] = useState<string | null>(null);

  // The empty state's way out (issue #112): open the config file
  // that would define tasks in the OS editor. Same route as the
  // per-row open-in-editor — the path lookup is a user-triggered
  // mise invocation, so it runs through the execution panel
  // (ADR-0005) and the returned path goes to
  // `tauri-plugin-opener`. `mise config ls --json` reports the
  // loaded files in precedence order, highest first; that top file
  // is where a new `[tasks]` entry belongs.
  const openConfigInEditor = useCallback(
    async () => {
      if (!guard.allowed) {
        focusTrustBanner();
        return;
      }
      if (configRun.isRunning) return;
      const res = await configRun.run({ cwd, args: miseConfigLsArgs() });
      if (res.kind === "err" || res.outcome.exitCode !== 0) {
        setEditorError(t(I18N_KEYS.tasks.openConfigError.body));
        return;
      }
      let path: string | null = null;
      try {
        const parsed: unknown = JSON.parse(res.outcome.stdout);
        if (Array.isArray(parsed)) {
          const first = parsed[0] as ConfigFile | undefined;
          if (first && typeof first.path === "string" && first.path) {
            path = first.path;
          }
        }
      } catch {
        path = null;
      }
      if (!path) {
        setEditorError(t(I18N_KEYS.tasks.openConfigError.body));
        return;
      }
      setEditorError(null);
      try {
        await openExternalPath(path);
      } catch {
        setEditorError(t(I18N_KEYS.tasks.openConfigError.body));
      }
    },
    [guard.allowed, focusTrustBanner, configRun.isRunning, configRun.run, cwd, t],
  );

  // The task form is per-row when editing (`editingName === row.name`
  // opens the form below the table) and single-instance when creating
  // (`addingTask`, the empty state's "create task" entry, issue #161).
  // The two are mutually exclusive: opening one closes the other. The
  // form is a single child rendered outside the table so the table's
  // strict <table><tbody> structure stays valid (rendering the form
  // inside a <td> would violate HTML semantics).
  const [editingName, setEditingName] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const beginEdit = useCallback((name: string) => {
    setAddingTask(false);
    setEditorError(null);
    setEditingName((cur) => (cur === name ? null : name));
  }, []);
  const beginAdd = useCallback(() => {
    setEditorError(null);
    setEditingName(null);
    setAddingTask(true);
  }, []);
  const cancelForm = useCallback(() => {
    setEditingName(null);
    setAddingTask(false);
  }, []);

  // Task rows. `mise tasks ls` already filters hidden tasks upstream,
  // so no hide badge is rendered (beta11 4.4-m1; surfacing it would
  // need `--hidden`, which the hint rules bar as an internal flag).
  const taskRows: TaskRow[] = useMemo(() => {
    if (!tasks.data) return [];
    return tasks.data.map((t) => ({
      id: t.name,
      name: t.name,
      run: taskRunDisplay(t.run),
      description: t.description,
      depends: t.depends,
    }));
  }, [tasks.data]);

  // Text filter over the full row set (issue #106), shared with the
  // tools / env / settings tables via `useTableFilter`.
  const filter = useTableFilter(taskRows, (r) =>
    [r.name, r.run, r.description, r.depends.join(" ")].join("\n"),
  );

  // The currently-edited task — used to inject the edit form
  // below the table so the user can see what they are editing
  // while the form is open. `null` when no row is being edited.
  // Hook placement: this memo must stay above the conditional
  // early returns below — hooks after a conditional return break
  // the rules of hooks and can white-screen the page on remount
  // (beta11 4.4-M1).
  const editingTask = useMemo(
    () => (editingName ? tasks.data?.find((t) => t.name === editingName) ?? null : null),
    [editingName, tasks.data],
  );

  // Mise-missing or list-loading state. The list-level gate (issue
  // #146) covers the `mise tasks ls` read too: while it is pending —
  // first load or a directory switch — the shared ListLoading renders
  // instead of the "no tasks" empty state (which the toolbar's
  // "Loading…" count would otherwise contradict).
  if (detect.isPending || tasks.isPending) {
    return <ListLoading />;
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
      width: "200px",
      minWidth: "140px",
      sortValue: (r) => r.name,
      cell: (r) => (
        <Tooltip text={r.name}>
          <span className={styles.cellName}>{r.name}</span>
        </Tooltip>
      ),
    },
    {
      key: "run",
      header: t(I18N_KEYS.tasks.columns.run),
      width: "260px",
      minWidth: "180px",
      sortValue: (r) => r.run ?? "",
      cell: (r) =>
        r.run ? (
          <Tooltip text={r.run}>
            <code className={styles.cellRun}>{r.run}</code>
          </Tooltip>
        ) : (
          <span className={styles.cellRunEmpty}>—</span>
        ),
    },
    {
      key: "description",
      header: t(I18N_KEYS.tasks.columns.description),
      sortValue: (r) => r.description ?? "",
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
      sortValue: (r) => r.depends.join(", "),
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
            disabled={taskRun.isRunning}
            data-testid={`tasks-run-${r.name}`}
          >
            {t(I18N_KEYS.tasks.runButton)}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => beginEdit(r.name)}
            data-testid={`tasks-edit-${r.name}`}
          >
            {t(I18N_KEYS.tasks.editButton)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void openInEditor(r.name)}
            disabled={editorRun.isRunning}
            data-testid={`tasks-open-${r.name}`}
          >
            {t(I18N_KEYS.tasks.openInEditorButton)}
          </Button>
        </span>
      ),
    },
  ];

  // Which task form to render, if any: the create form (`task:
  // null`) or the row edit form. The `added` flag picks the
  // success-bar message once the save runs.
  const formFor: { key: string; task: MiseTask | null; added: boolean } | null =
    addingTask
      ? { key: "tasks-new", task: null, added: true }
      : editingTask
        ? { key: editingTask.name, task: editingTask, added: false }
        : null;

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{t(I18N_KEYS.tasks.title)}</h1>
          <CommandHint>{t(I18N_KEYS.tasks.commandHint)}</CommandHint>
          <p className={styles.hint}>{t(I18N_KEYS.tasks.subtitle)}</p>
        </header>

        {/* In-page success confirmation (issue #145): set by a
            successful save below, auto-dismisses after a few seconds.
            Null renders nothing. */}
        <SuccessBar
          message={successMessage}
          onDismiss={() => setSuccessMessage(null)}
        />

        <div className={styles.toolbar}>
          <span className={styles.toolbarHint}>
            {tasks.data
              ? filter.active
                ? t(I18N_KEYS.tasks.countFiltered, {
                    count: filter.rows.length,
                    total: tasks.data.length,
                  })
                : t(I18N_KEYS.tasks.count, { count: tasks.data.length })
              : t(I18N_KEYS.common.loading)}
          </span>
          <TableFilter
            value={filter.query}
            onChange={filter.setQuery}
            placeholder={t(I18N_KEYS.tasks.filterPlaceholder)}
            testId="tasks-filter"
          />
        </div>


        {/* Trust banner (issues #25 / #141) — shared component; the
            ref lets the guard scroll to and focus it on a blocked
            mutation. */}
        <TrustBanner
          ref={bannerRef}
          body={I18N_KEYS.tasks.guard.untrustedBody}
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
              rows={filter.rows}
              rowKey={(r) => r.id}
              fixed
              resizeKey="tasks"
              className={styles.tasksTable}
              empty={
                filter.active ? (
                  <EmptyState
                    title={t(I18N_KEYS.common.filter.noMatchTitle)}
                    body={t(I18N_KEYS.common.filter.noMatchBody)}
                  />
                ) : (
                  <EmptyState
                    title={t(I18N_KEYS.tasks.empty.title)}
                    body={t(I18N_KEYS.tasks.empty.body)}
                    action={
                      <span className={styles.emptyActions}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={beginAdd}
                          data-testid="tasks-add-new"
                        >
                          {t(I18N_KEYS.tasks.empty.addTask)}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void openConfigInEditor()}
                          disabled={configRun.isRunning}
                          data-testid="tasks-open-config"
                        >
                          {t(I18N_KEYS.tasks.empty.openConfig)}
                        </Button>
                      </span>
                    }
                  />
                )}
            />

            {/* The shared task form: the row editor (`editingTask`)
                or the empty state's create entry (`addingTask`,
                issue #161) — never both, the begin* callbacks
                clear each other. The page closes the form only
                when the save actually ran; a failed run or a trust
                block keeps the draft. */}
            {formFor && (
              <TaskForm
                key={formFor.key}
                task={formFor.task}
                dependsListId="tasks-depends-suggestions"
                onSave={async (name, runWords, depends, description) => {
                  const ok = await saveTask(name, description, depends, runWords);
                  if (!ok) return;
                  setSuccessMessage(
                    t(
                      formFor.added
                        ? I18N_KEYS.tasks.success.added
                        : I18N_KEYS.tasks.success.saved,
                      { name },
                    ),
                  );
                  cancelForm();
                }}
                onCancel={cancelForm}
                disabled={saveRun.isRunning}
              />
            )}

            {/* Task names on the page, referenced as completion by the
                edit form's depends input (issue #109). The edited task's
                own name is excluded — suggesting it would invite a
                self-dependency (beta11 4.4-m2). */}
            <Suggestions
              id="tasks-depends-suggestions"
              options={taskRows
                .map((r) => r.name)
                .filter((n) => n !== formFor?.task?.name)}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}

// ---------- Task form (create + edit) ----------

/**
 * The inline task form, shared by the row editor and the empty
 * state's "create task" entry (issue #161). Editing an existing
 * task renders the name read-only (v1 does not support renaming —
 * `mise tasks add` updates in place but the rename path is
 * non-trivial); creating leaves the name editable. Both modes
 * edit the run, depends, and description — the same fields
 * `mise tasks add` writes, so a save never silently drops a
 * field mise would otherwise wipe (the command replaces the
 * task's whole TOML table).
 *
 * The run field is a `<textarea>` edited one command per line.
 * Enter inserts a newline there instead of submitting (issue
 * #109's Enter-submits convention binds single-line inputs; the
 * Save button, or Enter in the other fields, still submits), and
 * Escape cancels via the shared `KeyForm`. On save the draft is
 * split into shell words per line (`parseRunInput`) and
 * dispatched as `mise tasks add <name> [--description …]
 * [--depends …]… -- <run words>` through the execution panel;
 * the trust guard is applied by the page's `saveTask` so the
 * form is local state only. The page closes the form only when
 * the save ran — a failed run or a trust block keeps the draft.
 *
 * Run-locking (issue #135): `disabled` gates only the Save /
 * submit control — the command-firing part. The draft inputs
 * and Cancel stay editable through a running command because
 * drafting is never locked.
 */
function TaskForm({
  task,
  dependsListId,
  onSave,
  onCancel,
  disabled,
}: {
  /** The task being edited, or `null` when creating a new task
   *  (the empty state's entry point). */
  task: MiseTask | null;
  /** Datalist id the depends input references for task-name completion
   *  (issue #109); the page renders the shared <datalist> once. */
  dependsListId: string;
  onSave: (
    name: string,
    runWords: string[],
    depends: string[],
    description: string,
  ) => void | Promise<void>;
  onCancel: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const isNew = task === null;
  const [name, setName] = useState(task?.name ?? "");
  const [run, setRun] = useState(task ? task.run.join("\n") : "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dependsText, setDependsText] = useState(task?.depends.join(", ") ?? "");
  // Reset local state if the user opens a different task while
  // the form is mounted.
  useEffect(() => {
    setName(task?.name ?? "");
    setRun(task ? task.run.join("\n") : "");
    setDescription(task?.description ?? "");
    setDependsText(task?.depends.join(", ") ?? "");
  }, [task?.name, task?.run, task?.description, task?.depends]);

  const runWords = useMemo(() => parseRunInput(run), [run]);
  const depends = useMemo(() => parseDependsInput(dependsText), [dependsText]);
  const dirty = isNew
    ? name.trim().length > 0 ||
      run.trim().length > 0 ||
      dependsText.trim().length > 0 ||
      description.trim().length > 0
    : run !== task.run.join("\n") ||
      depends.join(",") !== task.depends.join(",") ||
      description !== task.description;
  const valid = name.trim().length > 0 && runWords.length > 0;

  const nameId = isNew ? "tasks-add-name" : "tasks-edit-name";
  const runId = isNew ? "tasks-add-run" : "tasks-edit-run";
  const descriptionId = isNew ? "tasks-add-description" : "tasks-edit-description";
  const dependsId = isNew ? "tasks-add-depends" : "tasks-edit-depends";
  const saveTestId = isNew ? "tasks-add-save" : `tasks-edit-save-${task.name}`;
  const cancelTestId = isNew ? "tasks-add-cancel" : `tasks-edit-cancel-${task.name}`;

  return (
    <KeyForm
      className={styles.editForm}
      testId={isNew ? "tasks-add-form" : `tasks-edit-form-${task.name}`}
      onSubmit={() => void onSave(name.trim(), runWords, depends, description.trim())}
      onRevert={onCancel}
      submitDisabled={disabled || !dirty || !valid}
    >
      <h3 className={styles.editFormTitle}>
        {isNew ? (
          t(I18N_KEYS.tasks.editForm.addTitle)
        ) : (
          <>
            {t(I18N_KEYS.tasks.editForm.title)} · {task.name}
          </>
        )}
      </h3>
      <p className={styles.editFormSub}>
        {t(I18N_KEYS.tasks.editForm.dependsHelp)}
      </p>

      <div className={styles.editFormField}>
        {isNew ? (
          <label className={styles.editFormLabel} htmlFor={nameId}>
            {t(I18N_KEYS.tasks.columns.name)}
          </label>
        ) : (
          <span className={styles.editFormLabel}>
            {t(I18N_KEYS.tasks.columns.name)}
          </span>
        )}
        {isNew ? (
          <input
            id={nameId}
            name="name"
            type="text"
            className={styles.editFormInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(I18N_KEYS.tasks.editForm.namePlaceholder)}
            spellCheck={false}
            autoComplete="off"
          />
        ) : (
          // v1 does not support renaming: the name is fixed for an
          // existing task, so it renders as read-only text — never an
          // editable input (ui-ux-rules :29, beta11 4.4-m3).
          <span
            className={styles.editFormReadonly}
            data-testid={`tasks-edit-name-${task.name}`}
          >
            {task.name}
          </span>
        )}
      </div>

      <div className={styles.editFormField}>
        <label className={styles.editFormLabel} htmlFor={runId}>
          {t(I18N_KEYS.tasks.editForm.runLabel)}
        </label>
        <textarea
          id={runId}
          name="run"
          className={styles.editFormTextarea}
          value={run}
          onChange={(e) => setRun(e.target.value)}
          placeholder={t(I18N_KEYS.tasks.editForm.runPlaceholder)}
          spellCheck={false}
          autoComplete="off"
          rows={4}
        />
      </div>

      <div className={styles.editFormField}>
        <label className={styles.editFormLabel} htmlFor={descriptionId}>
          {t(I18N_KEYS.tasks.columns.description)}
        </label>
        <input
          id={descriptionId}
          name="description"
          type="text"
          className={styles.editFormInput}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t(I18N_KEYS.tasks.editForm.descriptionPlaceholder)}
          autoComplete="off"
        />
      </div>

      <div className={styles.editFormField}>
        <label className={styles.editFormLabel} htmlFor={dependsId}>
          {t(I18N_KEYS.tasks.editForm.dependsLabel)}
        </label>
        <input
          id={dependsId}
          name="depends"
          type="text"
          className={styles.editFormInput}
          value={dependsText}
          onChange={(e) => setDependsText(e.target.value)}
          placeholder={t(I18N_KEYS.tasks.editForm.dependsPlaceholder)}
          spellCheck={false}
          autoComplete="off"
          list={dependsListId}
        />
      </div>

      <div className={styles.editFormActions}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void onSave(name.trim(), runWords, depends, description.trim())}
          disabled={disabled || !dirty || !valid}
          data-testid={saveTestId}
        >
          {t(I18N_KEYS.tasks.editForm.saveButton)}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          data-testid={cancelTestId}
        >
          {t(I18N_KEYS.tasks.editForm.cancelButton)}
        </Button>
        {!valid && (
          <span className={styles.editFormError}>
            {t(
              isNew && name.trim().length === 0
                ? I18N_KEYS.tasks.editForm.nameRequired
                : I18N_KEYS.tasks.editForm.runRequired,
            )}
          </span>
        )}
      </div>
    </KeyForm>
  );
}

