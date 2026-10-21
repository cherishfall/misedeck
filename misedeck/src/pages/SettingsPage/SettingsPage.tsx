// SettingsPage — `mise settings ls --json-extended` rendered with
// sources; changes go through `mise settings set` / `mise settings
// unset` and the execution panel (issue #29). Editing matches the
// setting's data type (booleans get a two-state control), the add
// form completes key names from `mise settings ls --all`, and an
// opt-in "--all" toggle reveals unset keys (issue #52).
//
// Rows render read-only by default; an explicit Edit expands the
// inline form (ui-ux-rules: "read-only by default", the beta8 rule's
// last holdout — Env migrated in #58). Object/table-valued settings
// cannot be written wholesale by the CLI, so they render read-only
// (beta11 4.7-M2). Unset is destructive: it confirms first and is
// disabled when the key's source file is outside the current write
// scope, where `mise settings unset` would silently do nothing
// (beta11 4.7-M1/B1, issue #162).
//
// The page follows the same trust-guarded mutation pattern as the
// config editor (#26): every mutating button checks `useTrustGuard()`
// first, and the trust banner is focused when a write is blocked.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { useTrustGuard } from "../../state/trustContext";
import { detectMise, isAppError } from "../../api/mise";
import { useOwnRun } from "../../components/ExecutionPanel";
import {
  Badge,
  Button,
  commandEcho,
  CommandHint,
  ConfirmDialog,
  EmptyState,
  KeyForm,
  ListLoading,
  PageShell,
  QueryHint,
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
import { useParsedSettingsList } from "../../hooks/useIssue29";
import { useTableFilter } from "../../hooks/useTableFilter";
import {
  SOURCE_CELL_CHARS,
  shortenPathTail,
} from "../../utils/paths";
import type { SettingsItem } from "../../types/tauri";

import { settingsEmptyCopy } from "./settingsEmptyCopy";
import { settingsUnsetInScope } from "./settingsUnsetScope";
import { stderrBodyKey } from "../../utils/stderrBody";
import tableStyles from "../../components/Table/Table.module.css";
import styles from "./SettingsPage.module.css";

// ---------- Args builders ----------

/** Outcome of a page write: "ok" only when the command ran and
 *  succeeded — add forms clear their draft on "ok" (issue #153). */
type WriteOutcome = "ok" | "err";

function miseSettingsSetArgs(key: string, value: string, cwd: string | null): string[] {
  const args = ["settings", "set"];
  if (cwd !== null) args.push("--local");
  args.push(key, value);
  return args;
}

function miseSettingsUnsetArgs(key: string, cwd: string | null): string[] {
  const args = ["settings", "unset"];
  if (cwd !== null) args.push("--local");
  args.push(key);
  return args;
}

// ---------- Page ----------

export function SettingsPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();
  const guard = useTrustGuard();
  // Guard-blocked writes focus the shared trust banner (issues
  // #25 / #141) instead of running.
  const { ref: bannerRef, focus: focusTrustBanner } = useTrustBannerFocus();

  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const [showAll, setShowAll] = useState(false);
  // The empty card's "Add a setting" step lands focus on the add form's
  // key field (issue #226): the card must be able to complete the next
  // step it names, not point at a control outside itself.
  const addKeyRef = useRef<HTMLInputElement>(null);
  const focusAddKey = useCallback(() => {
    addKeyRef.current?.focus();
  }, []);
  // The explicit (CLI-faithful) list is the default view; the `--all`
  // list backs both the opt-in "show all" view and the add form's
  // key-name completion, so it is always fetched.
  const explicitSettings = useParsedSettingsList(false);
  const allSettings = useParsedSettingsList(true);
  const settings = showAll ? allSettings : explicitSettings;

  // Destructured into its two stable pieces (#258): `isRunning` is a
  // boolean and `run` a stable callback, so `runWrite` can name them in
  // its dependency list (exhaustive-deps) instead of the fresh object
  // `useOwnRun` returns each render.
  const { run: runSettingsWrite, isRunning: writeBusy } = useOwnRun();

  // In-page success confirmation (issue #145): a successful write
  // closes the loop here with a short-lived bar; failures are
  // unchanged — the panel still auto-opens.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successTick, setSuccessTick] = useState(0);

  // Top-toolbar refresh (issue #98): the prefix key covers both the
  // explicit and the `--all` settings queries.
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["settings", "ls", cwd] });
    // Re-probe trust so a failed check no longer blocks writes until a
    // relaunch (issue #262).
    void queryClient.invalidateQueries({ queryKey: ["mise", "trust", cwd] });
  }, [queryClient, cwd]);
  useRegisterPageRefresh(onRefresh);

  // Family-level run-lock (issue #138): the whole set/unset family
  // shares one `useOwnRun`, so this page's writes serialize — concurrent
  // `mise settings set` / `mise settings unset` processes would race
  // their read-modify-write on the same TOML (same rationale as the env
  // page's rename sequencing, beta11 4.3-B1). The flag is true only
  // while the command *this* callback dispatched is running, so a long
  // install elsewhere never disables this page's Save / Add. The read
  // query refreshes on this run's own success (not on a global status
  // transition). The optional `successMessage` closes the loop in-page
  // (issue #145) — `successTick` bumps with it so a repeated identical
  // message still re-arms the bar's timer (issue #172). Resolves to
  // "ok" only when the command ran and succeeded, so callers can chain
  // form cleanup (clear-on-success, issue #153) on the result.
  const runWrite = useCallback(
    async (builder: (cwd: string | null) => string[], successMessage?: string): Promise<WriteOutcome> => {
      if (!guard.allowed) {
        focusTrustBanner();
        return "err";
      }
      if (writeBusy) return "err";
      const res = await runSettingsWrite({ cwd, args: builder(cwd) });
      if (res.kind === "ok") {
        void queryClient.invalidateQueries({ queryKey: ["settings", "ls", cwd] });
        if (successMessage !== undefined) {
          setSuccessMessage(successMessage);
          setSuccessTick((n) => n + 1);
        }
        return "ok";
      }
      return "err";
    },
    [guard.allowed, focusTrustBanner, writeBusy, runSettingsWrite, cwd, queryClient],
  );

  // Text filter over the full row set (issue #106), shared with the
  // tools / env / tasks tables via `useTableFilter`.
  const filter = useTableFilter(settings.data ?? [], (r) =>
    [r.key, formatValue(r.value), r.type ?? "", r.source ?? ""].join("\n"),
  );

  // Empty-state copy (issue #218): an active filter explains itself; the
  // default (--all off) view points at the switch, because mise's
  // defaults exist even when nothing is explicitly configured. The card
  // carries that next step itself (issue #226).
  const emptyCopy = settingsEmptyCopy({ filterActive: filter.active, showAll });

  // A count of zero above the empty-state card says "there is nothing"
  // twice (issue #226) — the card below already carries that fact and
  // the next step. The filtered count still renders: "0 of 12 settings"
  // is information about the filter, not a second empty state.
  const settingsTotal = settings.data?.length ?? 0;
  const settingsCountText =
    settingsTotal === 0
      ? ""
      : t(I18N_KEYS.settings.count, { count: settingsTotal });

  // Mise-missing or list-loading state. The list-level gate (issue
  // #146) covers the `mise settings ls` read too: while it is pending —
  // first load or a directory switch — the shared ListLoading renders
  // instead of the table's "no data" empty state.
  if (detect.isPending || settings.isPending) {
    return (
      <ListLoading
        title={t(I18N_KEYS.settings.title)}
        commandHint={t(I18N_KEYS.settings.commandHint)}
      />
    );
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

  const settingsError = settings.error?.kind === "err" ? settings.error.err : null;

  const columns: TableColumn<SettingsItem>[] = [
    {
      key: "key",
      header: t(I18N_KEYS.settings.columns.key),
      width: "240px",
      minWidth: "160px",
      sortValue: (r) => r.key,
      cell: (r) => <Tooltip text={r.key}><span className={styles.cellKey}>{r.key}</span></Tooltip>,
    },
    {
      key: "value",
      header: t(I18N_KEYS.settings.columns.value),
      sortValue: (r) => formatValue(r.value),
      cell: (r) => (
        <Tooltip text={formatValue(r.value)}>
          <span className={styles.cellValue}>{formatValue(r.value)}</span>
        </Tooltip>
      ),
    },
    {
      key: "type",
      header: t(I18N_KEYS.settings.columns.type),
      width: "84px",
      sortValue: (r) => r.type ?? "",
      cell: (r) => (r.type ? <Badge variant="info" data>{r.type}</Badge> : <span className={styles.dim}>—</span>),
    },
    {
      key: "source",
      header: t(I18N_KEYS.settings.columns.source),
      width: "160px",
      sortValue: (r) => r.source ?? "",
      // Elide the head of long paths so the file name stays visible
      // (issue #216); the tooltip carries the full value. The budget
      // matches the 160px column — see `SOURCE_CELL_CHARS`.
      cell: (r) =>
        r.source ? (
          <Tooltip text={r.source}>
            <span className={styles.cellSource}>
              {shortenPathTail(r.source, SOURCE_CELL_CHARS)}
            </span>
          </Tooltip>
        ) : (
          <span className={styles.cellSource}>—</span>
        ),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.settings.columns.actions),
      // Sized for the two rest-state buttons (Edit / Unset) — the
      // inline editor wraps inside the cell (beta11, issue #148).
      width: "220px",
      cell: (r) => (
        <RowActions
          row={r}
          cwd={cwd}
          allView={showAll}
          onWrite={runWrite}
          disabled={writeBusy}
        />
      ),
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{t(I18N_KEYS.settings.title)}</h1>
          <CommandHint>{t(I18N_KEYS.settings.commandHint)}</CommandHint>
          <p className={styles.hint}>{t(cwd === null ? I18N_KEYS.settings.hintGlobal : I18N_KEYS.settings.hint)}</p>
        </header>

        {/* In-page success confirmation (issue #145): set by every
            successful write below, auto-dismisses after a few
            seconds. Null renders nothing. */}
        <SuccessBar
          message={successMessage}
          tick={successTick}
          onDismiss={() => setSuccessMessage(null)}
        />

        <div className={styles.toolbar}>
          {/* Four-state dispatch (issues #199/#204): the hint renders in
              every state, and a failed read renders failure + retry —
              never a fake loading that never resolves. */}
          <QueryHint
            status={
              settings.isPending ? "loading" : settings.error ? "error" : "ok"
            }
            text={settingsCountText}
            onRetry={() => {
              void queryClient.invalidateQueries({
                queryKey: ["settings", "ls", cwd],
              });
            }}
          />
          <div className={styles.toolbarActions}>
            <TableFilter
              value={filter.query}
              onChange={filter.setQuery}
              placeholder={t(I18N_KEYS.settings.filterPlaceholder)}
              testId="settings-filter"
            />
            <label className={styles.showAll}>
              <input
                type="checkbox"
                className={styles.showAllCheckbox}
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                data-testid="settings-show-all"
              />
              <span>{t(I18N_KEYS.settings.showAll)}</span>
            </label>
          </div>
        </div>


        <TrustBanner
          ref={bannerRef}
          body={I18N_KEYS.settings.guard.untrustedBody}
        />

        {settingsError && (
          <div className={styles.errorState} data-testid="settings-read-error">
            <div className={styles.errorLabel}>{t(I18N_KEYS.settings.error.title)}</div>
            <p className={styles.errorBody}>
              {t(
                stderrBodyKey(
                  settingsError.stderr,
                  I18N_KEYS.settings.error.body,
                  I18N_KEYS.settings.error.bodyNoStderr,
                ),
              )}
            </p>
            {settingsError.stderr && (
              <pre className={styles.errorStderr}>{settingsError.stderr}</pre>
            )}
          </div>
        )}

        {!settingsError && (
          <>
            <Table<SettingsItem>
              columns={columns}
              rows={filter.rows}
              rowKey={(r) => r.key}
              fixed
              resizeKey="settings"
              className={styles.settingsTable}
              empty={
                <EmptyState
                  title={t(emptyCopy.titleKey)}
                  body={t(emptyCopy.bodyKey)}
                  action={
                    /* The card's own next step (issue #226): the switch
                       this empty state talks about is reachable from
                       here, so the card no longer sends the user
                       looking for a control above or below it. A filter
                       with no matches offers none — its body explains
                       the filter and the filter box is in the toolbar,
                       the same shape as the Tasks empty state. */
                    emptyCopy.action === null ? undefined : (
                      <Button
                        variant="primary"
                        size="sm"
                        data-testid={`settings-empty-${emptyCopy.action.kind}`}
                        onClick={
                          emptyCopy.action.kind === "showAll"
                            ? () => setShowAll(true)
                            : focusAddKey
                        }
                      >
                        {t(emptyCopy.action.labelKey)}
                      </Button>
                    )
                  }
                />
              }
            />
            <AddSettingForm
              inputRef={addKeyRef}
              onWrite={runWrite}
              disabled={writeBusy}
              cwd={cwd}
              existingKeys={explicitSettings.data?.map((r) => r.key) ?? []}
              keySuggestions={allSettings.data?.map((r) => r.key) ?? []}
            />
          </>
        )}
      </div>
    </PageShell>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Whole-table (object) values: `mise settings set` cannot write them
 *  (the CLI rejects table-valued settings, beta11 4.7-M2), so these
 *  rows render read-only. Arrays stay editable as JSON text. */
function isObjectValue(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True when `mise settings unset [--local]` can actually remove this
 *  row. The command exits 0 without doing anything when the key lives
 *  in a different config file than the write target (beta11 4.7-M1),
 *  so an out-of-scope Unset renders disabled with its reason instead
 *  of silently failing. The rule lives in `settingsUnsetScope` so it is
 *  unit-tested; Global mode applies the same `isGlobalConfigPath`
 *  judgment as the Env page (issue #213). */
function unsetInScope(row: SettingsItem, cwd: string | null, allView: boolean): boolean {
  return settingsUnsetInScope(row.source, cwd, allView);
}

function RowActions({
  row,
  cwd,
  allView,
  onWrite,
  disabled,
}: {
  row: SettingsItem;
  /** Active directory context, echoed in the unset confirmation. */
  cwd: string | null;
  /** Whether the row comes from the opt-in `--all` view. */
  allView: boolean;
  onWrite: (
    builder: (cwd: string | null) => string[],
    successMessage?: string,
  ) => Promise<WriteOutcome>;
  /** True while a foreground command runs. Run-locking (issue #135)
   *  gates only command-firing controls — the draft's Save. Opening
   *  and editing the draft (Edit, inputs, Cancel) never locks, and
   *  neither does Unset: it only opens the confirm dialog, whose own
   *  Confirm button is run-aware (see ConfirmDialog). */
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmingUnset, setConfirmingUnset] = useState(false);
  // Boolean-typed settings edit through a two-state control, not a
  // free text field (issue #52).
  const isBool = row.type === "boolean" || typeof row.value === "boolean";
  const [value, setValue] = useState(formatValue(row.value));
  const [checked, setChecked] = useState(row.value === true);
  // Reset the draft only while not actively editing, so an open editor
  // keeps its own edits across refetches (issue #58).
  useEffect(() => {
    if (!editing) {
      setValue(formatValue(row.value));
      setChecked(row.value === true);
    }
  }, [row.value, editing]);

  // A row the CLI cannot write renders read-only (ui-ux-rules): the
  // action cell carries a dim "—" whose Tooltip says why (issue #148).
  if (isObjectValue(row.value)) {
    return (
      <Tooltip text={t(I18N_KEYS.settings.tooltip.objectReadOnly)}>
        <span className={styles.dim}>—</span>
      </Tooltip>
    );
  }

  const inScope = unsetInScope(row, cwd, allView);

  const dirty = isBool
    ? checked !== (row.value === true)
    : value !== formatValue(row.value);
  const startEdit = () => {
    setValue(formatValue(row.value));
    setChecked(row.value === true);
    setEditing(true);
  };
  const cancelEdit = () => {
    setValue(formatValue(row.value));
    setChecked(row.value === true);
    setEditing(false);
  };
  // The editor closes only on success so a failed or trust-blocked
  // write keeps the draft (beta11 4.3-B1 pattern, Env page).
  const doSave = async () => {
    const outcome = await onWrite(
      (cwd) => miseSettingsSetArgs(row.key, isBool ? String(checked) : value, cwd),
      t(I18N_KEYS.settings.success.set, { key: row.key }),
    );
    if (outcome === "ok") setEditing(false);
  };

  if (editing) {
    return (
      // An empty value is legal — `mise settings set KEY ""` writes an
      // empty string, the same ruling as the Add form (issue #172);
      // only a dirty draft is required to Save.
      <KeyForm
        className={styles.rowEditor}
        onSubmit={() => void doSave()}
        onRevert={cancelEdit}
        submitDisabled={disabled || !dirty}
      >
        {isBool ? (
          <input
            type="checkbox"
            className={styles.boolToggle}
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            aria-label={t(I18N_KEYS.settings.columns.value)}
          />
        ) : (
          <input
            type="text"
            className={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t(I18N_KEYS.settings.valuePlaceholder)}
            spellCheck={false}
            autoComplete="off"
          />
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => void doSave()}
          disabled={disabled || !dirty}
        >
          {t(I18N_KEYS.settings.saveButton)}
        </Button>
        <Button variant="ghost" size="sm" onClick={cancelEdit}>
          {t(I18N_KEYS.common.cancel)}
        </Button>
      </KeyForm>
    );
  }

  return (
    <span className={styles.rowActions}>
      <Button
        variant="secondary"
        size="sm"
        className={tableStyles.cellButton}
        onClick={startEdit}
      >
        {t(I18N_KEYS.settings.editButton)}
      </Button>
      {inScope ? (
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmingUnset(true)}
        >
          {t(I18N_KEYS.settings.unsetButton)}
        </Button>
      ) : (
        /* Out of the current write scope the command would silently
           do nothing, so the button renders disabled and the Tooltip
           says why (beta11 4.7-M1; ui-ux-rules: disabled control +
           discoverable reason). */
        <Tooltip
          focusable
          text={
            row.source
              ? t(I18N_KEYS.settings.tooltip.unsetOutOfScope, { source: row.source })
              : t(I18N_KEYS.settings.tooltip.unsetDefault)
          }
        >
          <span className={styles.rowActions}>
            <Button variant="danger" size="sm" disabled>
              {t(I18N_KEYS.settings.unsetButton)}
            </Button>
          </span>
        </Tooltip>
      )}
      {/* Unset is destructive, so it confirms first and the dialog
          teaches the exact command that will run (ui-ux-rules:
          "uninstall, unset, overwrite always confirm"). Same
          ConfirmDialog pattern as the env page's Remove. */}
      <ConfirmDialog
        open={confirmingUnset}
        confirmBusy={disabled}
        cwd={cwd}
        title={t(I18N_KEYS.settings.confirm.unset.title, { key: row.key })}
        body={cwd === null
          ? t(I18N_KEYS.settings.confirm.unset.bodyGlobal, { key: row.key })
          : t(I18N_KEYS.settings.confirm.unset.bodyDirectory, { key: row.key })}
        command={commandEcho("mise", cwd, miseSettingsUnsetArgs(row.key, cwd))}
        confirmLabel={t(I18N_KEYS.settings.unsetButton)}
        cancelLabel={t(I18N_KEYS.common.cancel)}
        onConfirm={() => {
          setConfirmingUnset(false);
          void onWrite(
            (cwd) => miseSettingsUnsetArgs(row.key, cwd),
            t(cwd === null
              ? I18N_KEYS.settings.success.unsetGlobal
              : I18N_KEYS.settings.success.unsetDirectory, { key: row.key }),
          );
        }}
        onCancel={() => setConfirmingUnset(false)}
      />
    </span>
  );
}

function AddSettingForm({
  inputRef,
  onWrite,
  disabled,
  cwd,
  existingKeys,
  keySuggestions,
}: {
  /** The key field — the empty state's "Add a setting" step focuses it
   *  (issue #226). */
  inputRef: RefObject<HTMLInputElement | null>;
  onWrite: (
    builder: (cwd: string | null) => string[],
    successMessage?: string,
  ) => Promise<WriteOutcome>;
  /** True while a foreground command runs; locks only the Add submit
   *  (run-locking, issue #135) — drafting the inputs never locks. */
  disabled: boolean;
  /** Active directory context, echoed in the overwrite confirmation. */
  cwd: string | null;
  /** Keys with an explicitly-set value in this context; an Add
   *  targeting one of these overwrites, so it confirms first
   *  (issue #153). */
  existingKeys: string[];
  /** Known setting keys from `mise settings ls --all`, offered as
   *  completion on the key field (issue #52). */
  keySuggestions: string[];
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  // A successful add clears the draft (issue #153): adding the next
  // setting must not require manual clearing.
  const doAdd = async () => {
    const outcome = await onWrite(
      (cwd) => miseSettingsSetArgs(key, value, cwd),
      t(I18N_KEYS.settings.success.set, { key }),
    );
    if (outcome === "ok") {
      setKey("");
      setValue("");
    }
  };
  const onAdd = () => {
    // Overwrite is destructive (ui-ux-rules: "uninstall, unset,
    // overwrite always confirm first"), so an existing key opens the
    // confirm dialog before dispatching.
    if (existingKeys.includes(key)) {
      setConfirmingOverwrite(true);
      return;
    }
    void doAdd();
  };
  // Escape clears the draft (issue #109).
  const onRevert = () => {
    setKey("");
    setValue("");
  };
  return (
    <KeyForm
      className={styles.addForm}
      testId="settings-add"
      onSubmit={onAdd}
      onRevert={onRevert}
      submitDisabled={disabled || key.length === 0}
    >
      <span className={styles.addLabel}>{t(I18N_KEYS.settings.addSettingLabel)}</span>
      <input
        ref={inputRef}
        type="text"
        className={styles.inputName}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={t(I18N_KEYS.settings.keyPlaceholder)}
        spellCheck={false}
        autoComplete="off"
        list="settings-key-suggestions"
      />
      <Suggestions id="settings-key-suggestions" options={keySuggestions} />
      <input
        type="text"
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(I18N_KEYS.settings.valuePlaceholder)}
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={onAdd}
        disabled={disabled || key.length === 0}
      >
        {t(I18N_KEYS.settings.addButton)}
      </Button>
      {/* Adding an existing key overwrites its value, so it confirms
          first and the dialog teaches the exact command (ui-ux-rules).
          Same ConfirmDialog pattern as the env page. */}
      <ConfirmDialog
        open={confirmingOverwrite}
        confirmBusy={disabled}
        cwd={cwd}
        title={t(I18N_KEYS.settings.confirm.overwrite.title, { key })}
        body={t(I18N_KEYS.settings.confirm.overwrite.body, { key })}
        command={commandEcho("mise", cwd, miseSettingsSetArgs(key, value, cwd))}
        confirmLabel={t(I18N_KEYS.settings.addButton)}
        cancelLabel={t(I18N_KEYS.common.cancel)}
        onConfirm={() => {
          setConfirmingOverwrite(false);
          void doAdd();
        }}
        onCancel={() => setConfirmingOverwrite(false)}
      />
    </KeyForm>
  );
}

