// EnvPage — first-class env-vars management for the active context
// (issue #41).
//
//   * mise env --json-extended  → list resolved env vars with source
//   * mise set <KEY>=<value>    → add / change an env var
//   * mise unset <KEY>          → remove an env var
//
// All mutations route through the execution panel so the exact argv
// and live log are visible; a successful write closes the loop in-page
// with a short-lived confirmation bar (issue #145). Mutations are
// trust-gated in directory contexts; the trust banner follows the
// same pattern as Preview.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useParsedEnvList } from "../../hooks/useEnvList";
import { useTableFilter } from "../../hooks/useTableFilter";
import { isEnvWriteScopeMismatch, type EnvSource } from "../../api/miseTools";

import styles from "./EnvPage.module.css";

// ---------- Row shape ----------

interface EnvRow {
  /** Stable row id. */
  id: string;
  /** The env var name. */
  name: string;
  /** The resolved value. */
  value: string;
  /** Source badge category. */
  source: EnvSource;
  /** Tool name or other detail for the badge. */
  sourceDetail?: string;
  /** Absolute path of the config file mise reported. */
  sourcePath?: string;
}

// ---------- Args builders (mirror the Rust helpers) ----------

/** Outcome of a page write: "ok" only when the command ran and
 *  succeeded — add forms clear their draft on "ok" (issue #153). */
type WriteOutcome = "ok" | "err";

function miseEnvSetArgs(key: string, value: string, cwd: string | null): string[] {
  return cwd === null ? ["set", "-g", `${key}=${value}`] : ["set", `${key}=${value}`];
}

function miseEnvUnsetArgs(key: string, cwd: string | null): string[] {
  return cwd === null ? ["unset", "-g", key] : ["unset", key];
}

// ---------- Page ----------

export function EnvPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();
  const guard = useTrustGuard();
  // Guard-blocked mutations focus the shared trust banner (issues
  // #25 / #141) instead of running.
  const { ref: bannerRef, focus: focusTrustBanner } = useTrustBannerFocus();

  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const env = useParsedEnvList();
  const envWrite = useOwnRun();

  // In-page success confirmation (issue #145): a successful write
  // closes the loop here with a short-lived bar; failures are
  // unchanged — the panel still auto-opens.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successTick, setSuccessTick] = useState(0);

  // Top-toolbar refresh (issue #98): invalidate both the active and the
  // global env queries, plus the preview page's env query.
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["env", "ls", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["env", "ls", null] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "env", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "env", null] });
  }, [queryClient, cwd]);
  useRegisterPageRefresh(onRefresh);

  // Family-level run-lock (issue #138): the whole set/unset family
  // shares one `useOwnRun`, so while one write is in flight every
  // write control on the page freezes. The serialization is
  // deliberate: concurrent `mise set` / `mise unset` processes race
  // their read-modify-write on the same TOML and silently lose a key
  // (beta11 4.3-B1). The flag is true only while the command *this*
  // callback dispatched is running. On this run's own success, refresh
  // both the active and global env queries (so switching contexts shows
  // fresh data) plus the preview page's env query; active queries
  // refetch immediately so the table updates visibly (issue #41). The
  // optional `successMessage` closes the loop in-page (issue #145) —
  // `successTick` bumps with it so a repeated identical message still
  // re-arms the bar's timer (issue #172). Resolves to "ok" only when
  // the command ran and succeeded, so callers can chain form cleanup
  // (clear-on-success, issue #153) on the result.
  const runWrite = useCallback(
    async (builder: (cwd: string | null) => string[], successMessage?: string): Promise<WriteOutcome> => {
      if (!guard.allowed) {
        focusTrustBanner();
        return "err";
      }
      if (envWrite.isRunning) return "err";
      const res = await envWrite.run({ cwd, args: builder(cwd) });
      if (res.kind === "ok") {
        void queryClient.invalidateQueries({ queryKey: ["env", "ls", cwd] });
        void queryClient.invalidateQueries({ queryKey: ["env", "ls", null] });
        void queryClient.invalidateQueries({ queryKey: ["tools", "env", cwd] });
        void queryClient.invalidateQueries({ queryKey: ["tools", "env", null] });
        void queryClient.refetchQueries({ queryKey: ["env", "ls", cwd], type: "active" });
        void queryClient.refetchQueries({ queryKey: ["env", "ls", null], type: "active" });
        if (successMessage !== undefined) {
          setSuccessMessage(successMessage);
          setSuccessTick((n) => n + 1);
        }
        return "ok";
      }
      return "err";
    },
    [guard.allowed, focusTrustBanner, envWrite.isRunning, envWrite.run, cwd, queryClient],
  );

  const envRows: EnvRow[] = useMemo(() => {
    if (!env.data) return [];
    return env.data.map((e) => ({
      id: e.name,
      name: e.name,
      value: e.value,
      source: e.source,
      sourceDetail: e.sourceDetail,
      sourcePath: e.sourcePath,
    }));
  }, [env.data]);

  // Config-sourced names offered as completion on the Add form's var-name
  // input (issue #109); read-only injected / host-inherited names (PATH etc.)
  // stay out of the list — picking one would submit an overwrite of a
  // value mise controls (beta11 4.3-m5, issue #153). The row editor's
  // name field deliberately has no datalist: suggesting existing keys
  // there guides a rename onto a key that already exists (beta11 4.3-B1).
  const suggestionNames = useMemo(
    () => envRows.filter((r) => isConfigSource(r.source)).map((r) => r.name),
    [envRows],
  );

  // Every resolved env var name. An Add or a rename onto one of these
  // overwrites that var's value, so both paths confirm first (issue
  // #170); read-only injected / host-inherited names are included on
  // purpose — `mise set` overwrites those too.
  const existingNames = useMemo(() => envRows.map((r) => r.name), [envRows]);

  // Text filter over the full row set (issue #106), shared with the
  // tools / tasks / settings tables via `useTableFilter`.
  const filter = useTableFilter(envRows, (r) =>
    [r.name, r.value, r.sourceDetail ?? "", r.sourcePath ?? ""].join("\n"),
  );

  // Mise-missing or list-loading state. The list-level gate (issue
  // #146) covers the `mise env` read too: while it is pending — first
  // load or a directory switch — the shared ListLoading renders
  // instead of the table's "no data" empty state.
  if (detect.isPending || env.isPending) {
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

  const envError = env.error?.kind === "err" ? env.error.err : null;

  const columns: TableColumn<EnvRow>[] = [
    {
      key: "name",
      header: t(I18N_KEYS.env.columns.name),
      sortValue: (r) => r.name,
      cell: (r) => <Tooltip text={r.name}><span className={styles.cellName}>{r.name}</span></Tooltip>,
      width: "220px",
    },
    {
      key: "value",
      header: t(I18N_KEYS.env.columns.value),
      sortValue: (r) => r.value,
      cell: (r) => (
        <Tooltip text={r.value}>
          <span className={styles.cellValue}>{r.value || "—"}</span>
        </Tooltip>
      ),
    },
    {
      key: "source",
      header: t(I18N_KEYS.env.columns.source),
      sortValue: (r) => `${r.source} ${r.sourceDetail ?? ""}`.trim(),
      cell: (r) => <EnvSourceCell row={r} />,
      width: "220px",
    },
    {
      key: "actions",
      header: t(I18N_KEYS.env.columns.actions),
      cell: (r) => (
        <EnvRowActions
          row={r}
          cwd={cwd}
          onWrite={runWrite}
          disabled={envWrite.isRunning}
          existingNames={existingNames}
        />
      ),
      // Sized for the two rest-state buttons (Edit / Unset) — the
      // inline editor wraps inside the cell (beta11, issue #148).
      width: "220px",
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{t(I18N_KEYS.env.title)}</h1>
          <CommandHint>{t(I18N_KEYS.env.commandHint)}</CommandHint>
          <p className={styles.hint}>{t(cwd === null ? I18N_KEYS.env.hintGlobal : I18N_KEYS.env.hint)}</p>
          <ScopeBadge cwd={cwd} />
        </header>

        {/* In-page success confirmation (issue #145): set by every
            successful write below, auto-dismisses after a few
            seconds. Null renders nothing. */}
        <SuccessBar
          message={successMessage}
          tick={successTick}
          onDismiss={() => setSuccessMessage(null)}
        />

        <TrustBanner
          ref={bannerRef}
          body={I18N_KEYS.env.guard.untrustedBody}
        />

        <section className={styles.section} data-testid="env-section">
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{t(I18N_KEYS.env.listTitle)}</h2>
          </header>

          {envError && (
            <div className={styles.errorState}>
              <div className={styles.errorLabel}>{t(I18N_KEYS.env.error.title)}</div>
              <p className={styles.errorBody}>{t(I18N_KEYS.env.error.body)}</p>
              {envError.stderr && <pre className={styles.errorStderr}>{envError.stderr}</pre>}
            </div>
          )}

          {!envError && (
            <>
              <div className={styles.filterBar}>
                <TableFilter
                  value={filter.query}
                  onChange={filter.setQuery}
                  placeholder={t(I18N_KEYS.env.filterPlaceholder)}
                  testId="env-filter"
                />
              </div>
              <Table<EnvRow>
                columns={columns}
                rows={filter.rows}
                rowKey={(r) => r.id}
                fixed
                resizeKey="env"
                className={styles.envTable}
                empty={
                  filter.active ? (
                    <EmptyState
                      title={t(I18N_KEYS.common.filter.noMatchTitle)}
                      body={t(I18N_KEYS.common.filter.noMatchBody)}
                    />
                  ) : (
                    <EmptyState
                      title={t(I18N_KEYS.env.empty.title)}
                      body={t(I18N_KEYS.env.empty.body)}
                    />
                  )
                }
              />
            </>
          )}

          <AddEnvForm
            onWrite={runWrite}
            disabled={envWrite.isRunning}
            cwd={cwd}
            existingNames={existingNames}
          />

          {/* Existing keys, referenced as completion by the Add form's
              var-name input datalist (issue #109). Rendered once for the
              page. */}
          <Suggestions id="env-name-suggestions" options={suggestionNames} />
        </section>
      </div>
    </PageShell>
  );
}

// ---------- Scope badge ----------

function ScopeBadge({ cwd }: { cwd: string | null }) {
  const { t } = useTranslation();
  const isGlobal = cwd === null;
  return (
    <div className={styles.scopeRow}>
      <Badge variant={isGlobal ? "default" : "info"} size="inline">
        {isGlobal ? t(I18N_KEYS.env.scope.global) : t(I18N_KEYS.env.scope.project)}
      </Badge>
      {!isGlobal && (
        <Tooltip text={cwd}>
          <span className={styles.scopePath} data-testid="env-cwd">{cwd}</span>
        </Tooltip>
      )}
    </div>
  );
}

// ---------- Source cell ----------

function envSourceVariant(source: EnvSource): "default" | "info" | "warning" {
  switch (source) {
    case "project":
      return "info";
    case "tool":
      return "warning";
    case "global":
    case "default":
    default:
      return "default";
  }
}

/**
 * A row is editable when mise reported a config-file source path for
 * it (`sourcePath` present ⇒ config-writable, beta11 4.3-C1, issue
 * #156): that covers plain config rows and config-requested tool
 * vars (CARGO_HOME etc.), which `mise set` overwrites and takes
 * effect. Pure injections (`tool` with no sourcePath) and
 * host-inherited vars (`default`) are not written by mise config, so
 * `mise set` / `mise unset` must never target them (issue #58; the
 * beta4 U1 decision still holds for that subset).
 */
function isConfigSource(source: EnvSource): boolean {
  return source === "project" || source === "global";
}

function EnvSourceCell({ row }: { row: EnvRow }) {
  const { t } = useTranslation();
  // A row with a tool contributor (pure injection or config-requested)
  // renders the combined「Current directory · rust」label via the
  // shared toolDetail template (issue #156).
  const label = row.sourceDetail
    ? t(I18N_KEYS.env.source.toolDetail, {
        source: t(I18N_KEYS.env.source[row.source]),
        detail: row.sourceDetail,
      })
    : t(I18N_KEYS.env.source[row.source]);
  // The badge tooltip tells the truth per row kind (issue #156):
  // pure injections and host-inherited rows cannot be set via
  // `mise set`; a config-requested tool var CAN — `mise set`
  // overrides it. The shared Tooltip is the only hover-detail layer
  // (ui-ux-rules: layout/typography) — the badge's native `title`
  // exception is retired (issue #154). For rows with no reachable
  // action this is the secondary contact only: the action cell's "—"
  // carries the same reason on its own Tooltip (issue #185).
  const tooltip = !isConfigSource(row.source)
    ? row.source === "tool" && row.sourceDetail
      ? t(I18N_KEYS.env.tooltip.tool, { tool: row.sourceDetail })
      : t(I18N_KEYS.env.tooltip.default)
    : row.sourceDetail
      ? t(I18N_KEYS.env.tooltip.configTool, { tool: row.sourceDetail })
      : undefined;
  const badge = <Badge variant={envSourceVariant(row.source)}>{label}</Badge>;
  return (
    <div className={styles.sourceCell}>
      {tooltip ? <Tooltip text={tooltip}>{badge}</Tooltip> : badge}
      {row.sourcePath && (
        <Tooltip text={row.sourcePath}>
          <span className={styles.sourcePath}>{row.sourcePath}</span>
        </Tooltip>
      )}
    </div>
  );
}

// ---------- Row actions ----------

function EnvRowActions({
  row,
  cwd,
  onWrite,
  disabled,
  existingNames,
}: {
  row: EnvRow;
  cwd: string | null;
  onWrite: (
    builder: (cwd: string | null) => string[],
    successMessage?: string,
  ) => Promise<WriteOutcome>;
  /** True while a foreground command runs. Run-locking (issue #135)
   *  gates only command-firing controls — the draft's Save / submit.
   *  Opening and editing the draft (Edit, inputs, Cancel) never locks,
   *  and neither does Unset: it only opens the confirm dialog, whose
   *  own Confirm button is run-aware (see ConfirmDialog). */
  disabled: boolean;
  /** Every resolved env var name. A rename onto one of these
   *  overwrites that var's value, so the confirm copy says so
   *  honestly before the two commands run (issue #170). */
  existingNames: string[];
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmingUnset, setConfirmingUnset] = useState(false);
  const [confirmingRename, setConfirmingRename] = useState(false);
  const [confirmingRenameOverwrite, setConfirmingRenameOverwrite] = useState(false);
  const [confirmingOutOfScopeSet, setConfirmingOutOfScopeSet] = useState(false);
  const [name, setName] = useState(row.name);
  const [value, setValue] = useState(row.value);
  // Reset the draft only while not actively editing, so an open editor
  // keeps its own edits across refetches (issue #58).
  useEffect(() => {
    if (!editing) {
      setName(row.name);
      setValue(row.value);
    }
  }, [row.name, row.value, editing]);

  // Tool- and host-sourced rows are read-only: `mise set` / `mise unset`
  // can only target config-file-sourced rows, so the action cell carries
  // no buttons — a dim "—" placeholder instead of a blank cell (issue
  // #148). The "—" itself must carry the no-action reason on its own
  // Tooltip (issue #185; ui-ux-rules: hover on "—" must say why); the
  // source-badge Tooltip in EnvSourceCell stays as a secondary contact.
  if (!isConfigSource(row.source)) {
    const reason =
      row.source === "tool" && row.sourceDetail
        ? t(I18N_KEYS.env.tooltip.tool, { tool: row.sourceDetail })
        : t(I18N_KEYS.env.tooltip.default);
    return (
      <Tooltip text={reason}>
        <span className={styles.dim}>—</span>
      </Tooltip>
    );
  }

  // Write-scope check (issue #182): the write target is chosen by the
  // mode (cwd === null → the global config via `-g`; otherwise the
  // current directory's config), not by where the row is defined. A
  // config row whose sourcePath falls outside that scope would be
  // written to a different config file than its definition — a shadow
  // entry or a silent no-op — so every confirm dialog for the row
  // carries the out-of-scope warning below.
  const outOfScope =
    row.sourcePath !== undefined && isEnvWriteScopeMismatch(row.sourcePath, cwd);

  const dirty = name !== row.name || value !== row.value;
  const startEdit = () => {
    setName(row.name);
    setValue(row.value);
    setEditing(true);
  };
  const cancelEdit = () => {
    setName(row.name);
    setValue(row.value);
    setEditing(false);
  };
  const onSave = () => {
    if (name !== row.name) {
      // Renaming is unset old key + set new key. Dispatching both in the
      // same tick raced two mise processes on the same TOML and silently
      // lost a key (beta11 4.3-B1), and the unset ran without a confirm
      // (ui-ux-rules: "uninstall, unset, overwrite always confirm first").
      // It confirms first, then runs the two commands sequentially.
      // Renaming onto a key that already exists also overwrites that
      // var's value — a silent data loss until the rename checked for
      // it (issue #170) — so that variant gets its own overwrite copy.
      if (existingNames.includes(name)) {
        setConfirmingRenameOverwrite(true);
      } else {
        setConfirmingRename(true);
      }
      return;
    }
    // A value-only save normally runs without a dialog; an out-of-scope
    // row confirms first (issue #182) — the write would land in a
    // different config file than the row's definition, and the dialog
    // says so before the command runs.
    if (outOfScope) {
      setConfirmingOutOfScopeSet(true);
      return;
    }
    void doSaveValue();
  };
  // Value-only save: the editor closes only on success so a failed or
  // trust-blocked write keeps the draft (beta11 4.3-B1).
  const doSaveValue = async () => {
    const outcome = await onWrite(
      (cwd) => miseEnvSetArgs(name, value, cwd),
      t(I18N_KEYS.env.success.set, { name }),
    );
    if (outcome === "ok") setEditing(false);
  };
  // Sequential, never concurrent: the set runs only after the unset
  // succeeds, so the two mise processes can never interleave their
  // read-modify-write on the same TOML (beta11 4.3-B1). Any failure
  // keeps the draft open; the success bar fires only after the set
  // completes (issue #145).
  const doRename = async () => {
    setConfirmingRename(false);
    const unsetOutcome = await onWrite((cwd) => miseEnvUnsetArgs(row.name, cwd));
    if (unsetOutcome !== "ok") return;
    const setOutcome = await onWrite(
      (cwd) => miseEnvSetArgs(name, value, cwd),
      t(I18N_KEYS.env.success.set, { name }),
    );
    if (setOutcome === "ok") setEditing(false);
  };

  if (editing) {
    return (
      <>
        {/* An empty value is legal — `mise set KEY=` writes an empty
            string, the same ruling as the Add form (issue #153); only
            the name must be non-empty. */}
        <KeyForm
          className={styles.rowEditor}
          onSubmit={onSave}
          onRevert={cancelEdit}
          submitDisabled={disabled || !dirty || name.length === 0}
        >
          <input
            type="text"
            className={styles.inputName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(I18N_KEYS.env.namePlaceholder)}
            data-testid={`env-name-${row.name}`}
            spellCheck={false}
            autoComplete="off"
          />
          <input
            type="text"
            className={styles.inputValue}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t(I18N_KEYS.env.valuePlaceholder)}
            data-testid={`env-value-${row.name}`}
            spellCheck={false}
            autoComplete="off"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={disabled || !dirty || name.length === 0}
            data-testid={`env-save-${row.name}`}
          >
            {t(I18N_KEYS.common.save)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={cancelEdit}
            data-testid={`env-cancel-${row.name}`}
          >
            {t(I18N_KEYS.common.cancel)}
          </Button>
        </KeyForm>
        {/* Renaming confirms first and the dialog teaches both exact
            commands in execution order (unset old key, then set new
            key) — same ConfirmDialog the row actions use for remove. */}
        <ConfirmDialog
          open={confirmingRename}
          confirmBusy={disabled}
          title={t(I18N_KEYS.env.confirm.rename.title, { from: row.name, to: name })}
          body={t(I18N_KEYS.env.confirm.rename.body)}
          command={[
            commandEcho("mise", cwd, miseEnvUnsetArgs(row.name, cwd)),
            commandEcho("mise", cwd, miseEnvSetArgs(name, value, cwd)),
          ]}
          confirmLabel={t(I18N_KEYS.common.save)}
          cancelLabel={t(I18N_KEYS.common.cancel)}
          onConfirm={() => {
            void doRename();
          }}
          onCancel={() => setConfirmingRename(false)}
        >
          {outOfScope && <OutOfScopeWarning sourcePath={row.sourcePath} />}
        </ConfirmDialog>
        {/* Renaming onto an existing key overwrites that var's value
            (issue #170), so this variant's copy says so honestly while
            still teaching both exact commands in execution order. Same
            sequential doRename as the plain rename confirm. */}
        <ConfirmDialog
          open={confirmingRenameOverwrite}
          confirmBusy={disabled}
          title={t(I18N_KEYS.env.confirm.renameOverwrite.title, { from: row.name, to: name })}
          body={t(I18N_KEYS.env.confirm.renameOverwrite.body, { to: name })}
          command={[
            commandEcho("mise", cwd, miseEnvUnsetArgs(row.name, cwd)),
            commandEcho("mise", cwd, miseEnvSetArgs(name, value, cwd)),
          ]}
          confirmLabel={t(I18N_KEYS.common.save)}
          cancelLabel={t(I18N_KEYS.common.cancel)}
          onConfirm={() => {
            setConfirmingRenameOverwrite(false);
            void doRename();
          }}
          onCancel={() => setConfirmingRenameOverwrite(false)}
        >
          {outOfScope && <OutOfScopeWarning sourcePath={row.sourcePath} />}
        </ConfirmDialog>
        {/* A value-only save of an out-of-scope row (issue #182) gets the
            confirmation the destructive paths already carry: without it
            the write would land silently in a different config file than
            the row's definition. Same doSaveValue as the direct path —
            only the gate in front of it changes. */}
        <ConfirmDialog
          open={confirmingOutOfScopeSet}
          confirmBusy={disabled}
          title={t(I18N_KEYS.env.confirm.update.title, { name })}
          body={t(I18N_KEYS.env.confirm.update.body)}
          command={commandEcho("mise", cwd, miseEnvSetArgs(name, value, cwd))}
          confirmLabel={t(I18N_KEYS.common.save)}
          cancelLabel={t(I18N_KEYS.common.cancel)}
          onConfirm={() => {
            setConfirmingOutOfScopeSet(false);
            void doSaveValue();
          }}
          onCancel={() => setConfirmingOutOfScopeSet(false)}
        >
          <OutOfScopeWarning sourcePath={row.sourcePath} />
        </ConfirmDialog>
      </>
    );
  }

  return (
    <span className={styles.rowActions}>
      <Button
        variant="secondary"
        size="sm"
        onClick={startEdit}
        data-testid={`env-edit-${row.name}`}
      >
        {t(I18N_KEYS.env.editButton)}
      </Button>
      <Button
        variant="danger"
        size="sm"
        onClick={() => setConfirmingUnset(true)}
        data-testid={`env-unset-${row.name}`}
      >
        {t(I18N_KEYS.env.unsetButton)}
      </Button>
      {/* Removing an env var is destructive, so it confirms first and the
          dialog teaches the exact command that will run (ui-ux-rules:
          "uninstall, unset, overwrite always confirm"). Same ConfirmDialog
          the tools page uses for uninstall. */}
      <ConfirmDialog
        open={confirmingUnset}
        confirmBusy={disabled}
        title={t(I18N_KEYS.env.confirm.unset.title, { name: row.name })}
        body={t(I18N_KEYS.env.confirm.unset.body)}
        command={commandEcho("mise", cwd, miseEnvUnsetArgs(row.name, cwd))}
        confirmLabel={t(I18N_KEYS.env.unsetButton)}
        cancelLabel={t(I18N_KEYS.common.cancel)}
        onConfirm={() => {
          setConfirmingUnset(false);
          void onWrite(
            (cwd) => miseEnvUnsetArgs(row.name, cwd),
            t(I18N_KEYS.env.success.unset, { name: row.name }),
          );
        }}
        onCancel={() => setConfirmingUnset(false)}
      >
        {outOfScope && <OutOfScopeWarning sourcePath={row.sourcePath} />}
      </ConfirmDialog>
    </span>
  );
}

/** Out-of-write-scope warning (issue #182) rendered inside a row's
 *  confirm dialogs when the row's sourcePath sits outside the current
 *  write scope — the same pattern and tone as the Settings page's
 *  `unsetOutOfScope` copy, naming the row's actual source path. */
function OutOfScopeWarning({ sourcePath }: { sourcePath?: string }) {
  const { t } = useTranslation();
  if (!sourcePath) return null;
  return (
    <p className={styles.scopeWarning}>
      {t(I18N_KEYS.env.confirm.outOfScopeWarning, { source: sourcePath })}
    </p>
  );
}

// ---------- Add form ----------

function AddEnvForm({
  onWrite,
  disabled,
  cwd,
  existingNames,
}: {
  onWrite: (
    builder: (cwd: string | null) => string[],
    successMessage?: string,
  ) => Promise<WriteOutcome>;
  /** True while a foreground command runs; locks only the Add submit
   *  (run-locking, issue #135) — drafting the inputs never locks. */
  disabled: boolean;
  /** Active directory context, echoed in the overwrite confirmation. */
  cwd: string | null;
  /** Every resolved env var name; an Add targeting one of these
   *  overwrites, so it confirms first (issue #153). */
  existingNames: string[];
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  // A successful add clears the draft (issue #153): adding the next
  // var must not require manual clearing.
  const doAdd = async () => {
    const outcome = await onWrite(
      (cwd) => miseEnvSetArgs(name, value, cwd),
      t(I18N_KEYS.env.success.set, { name }),
    );
    if (outcome === "ok") {
      setName("");
      setValue("");
    }
  };
  const onAdd = () => {
    // Overwrite is destructive (ui-ux-rules: "uninstall, unset,
    // overwrite always confirm first"), so an existing name opens the
    // confirm dialog before dispatching.
    if (existingNames.includes(name)) {
      setConfirmingOverwrite(true);
      return;
    }
    void doAdd();
  };
  // Escape clears the draft (issue #109).
  const onRevert = () => {
    setName("");
    setValue("");
  };
  return (
    <KeyForm
      className={styles.addForm}
      testId="env-add"
      onSubmit={onAdd}
      onRevert={onRevert}
      submitDisabled={disabled || name.length === 0}
    >
      <span className={styles.addLabel}>{t(I18N_KEYS.env.addLabel)}</span>
      <input
        type="text"
        className={styles.inputName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t(I18N_KEYS.env.namePlaceholder)}
        data-testid="env-add-name"
        spellCheck={false}
        autoComplete="off"
        list="env-name-suggestions"
      />
      <input
        type="text"
        className={styles.inputValue}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(I18N_KEYS.env.valuePlaceholder)}
        data-testid="env-add-value"
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={onAdd}
        disabled={disabled || name.length === 0}
        data-testid="env-add-button"
      >
        {t(I18N_KEYS.env.addButton)}
      </Button>
      {/* Adding an existing name overwrites its value, so it confirms
          first and the dialog teaches the exact command (ui-ux-rules).
          Same ConfirmDialog the row actions use for remove. */}
      <ConfirmDialog
        open={confirmingOverwrite}
        confirmBusy={disabled}
        title={t(I18N_KEYS.env.confirm.overwrite.title, { name })}
        body={t(I18N_KEYS.env.confirm.overwrite.body, { name })}
        command={commandEcho("mise", cwd, miseEnvSetArgs(name, value, cwd))}
        confirmLabel={t(I18N_KEYS.env.addButton)}
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

