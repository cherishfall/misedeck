// EnvPage — first-class env-vars management for the active context
// (issue #41).
//
//   * mise env --json-extended  → list resolved env vars with source
//   * mise set <KEY>=<value>    → add / change an env var
//   * mise unset <KEY>          → remove an env var
//
// All mutations route through the execution panel so the exact argv
// and live log are visible. Mutations are trust-gated in directory
// contexts; the trust banner follows the same pattern as Preview.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { useTrust, useTrustAction, useTrustGuard } from "../../state/trustContext";
import { detectMise, isAppError } from "../../api/mise";
import { useExecutionContext } from "../../components/ExecutionPanel";
import type { ExecutionStatus } from "../../components/ExecutionPanel";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  PageShell,
  Table,
  type TableColumn,
} from "../../components";
import { useParsedEnvList } from "../../hooks/useEnvList";
import type { EnvSource } from "../../api/miseTools";

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
  const { state: execState, run } = useExecutionContext();
  const { state: trust } = useTrust();
  const trustAction = useTrustAction();
  const guard = useTrustGuard();
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const focusTrustBanner = useCallback(() => {
    const el = bannerRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const btn = el.querySelector<HTMLButtonElement>("button");
      btn?.focus();
    }
  }, []);

  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const env = useParsedEnvList();

  // After a successful env write, refresh both the active context and
  // the global context (so switching contexts doesn't show stale data),
  // plus the preview page's env query.
  const lastWriteStatusRef = useRef<ExecutionStatus>("idle");
  useEffect(() => {
    const prev = lastWriteStatusRef.current;
    lastWriteStatusRef.current = execState.status;
    if (prev === "running" && execState.status === "ok") {
      void queryClient.invalidateQueries({ queryKey: ["env", "ls", cwd] });
      void queryClient.invalidateQueries({ queryKey: ["env", "ls", null] });
      void queryClient.invalidateQueries({ queryKey: ["tools", "env", cwd] });
      void queryClient.invalidateQueries({ queryKey: ["tools", "env", null] });
      // Active env queries must refetch immediately so the table updates
      // visibly after a mutation; invalidateQueries alone is not enough
      // when the query is still within staleTime (issue #41).
      void queryClient.refetchQueries({ queryKey: ["env", "ls", cwd], type: "active" });
      void queryClient.refetchQueries({ queryKey: ["env", "ls", null], type: "active" });
    }
  }, [execState.status, cwd, queryClient]);

  const isRunning = execState.status === "running";

  const runWrite = useCallback(
    async (builder: (cwd: string | null) => string[]) => {
      if (!guard.allowed) {
        focusTrustBanner();
        return;
      }
      if (isRunning) return;
      const args = builder(cwd);
      await run({ cwd, args });
    },
    [guard.allowed, focusTrustBanner, isRunning, run, cwd],
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

  if (detect.isPending) {
    return <EnvLoading />;
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
      cell: (r) => <span className={styles.cellName} title={r.name}>{r.name}</span>,
      width: "220px",
    },
    {
      key: "value",
      header: t(I18N_KEYS.env.columns.value),
      cell: (r) => (
        <span className={styles.cellValue} title={r.value || undefined}>
          {r.value || "—"}
        </span>
      ),
    },
    {
      key: "source",
      header: t(I18N_KEYS.env.columns.source),
      cell: (r) => <EnvSourceCell row={r} />,
      width: "220px",
    },
    {
      key: "actions",
      header: t(I18N_KEYS.env.columns.actions),
      cell: (r) => <EnvRowActions row={r} onWrite={runWrite} disabled={isRunning} />,
      width: "360px",
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{t(I18N_KEYS.env.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.env.title)}</h1>
          <p className={styles.commandHint}>{t(I18N_KEYS.env.commandHint)}</p>
          <p className={styles.hint}>{t(I18N_KEYS.env.hint)}</p>
          <ScopeBadge cwd={cwd} />
        </header>

        <TrustBanner
          ref={bannerRef}
          trust={trust}
          running={trustAction.running}
          lastResult={trustAction.lastResult}
          lastError={trustAction.lastError}
          onTrust={trustAction.run}
        />

        <section className={styles.section} data-testid="env-section">
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>{t(I18N_KEYS.env.eyebrow)}</span>
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
            <Table<EnvRow>
              columns={columns}
              rows={envRows}
              rowKey={(r) => r.id}
              className={styles.tableFixed}
              empty={
                <EmptyState
                  eyebrow={t(I18N_KEYS.env.eyebrow)}
                  title={t(I18N_KEYS.env.empty.title)}
                  body={t(I18N_KEYS.env.empty.body)}
                />
              }
            />
          )}

          <AddEnvForm onWrite={runWrite} disabled={isRunning} />
        </section>
      </div>
    </PageShell>
  );
}

function EnvLoading() {
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

// ---------- Scope badge ----------

function ScopeBadge({ cwd }: { cwd: string | null }) {
  const { t } = useTranslation();
  const isGlobal = cwd === null;
  return (
    <div className={styles.scopeRow}>
      <Badge variant={isGlobal ? "default" : "info"}>
        {isGlobal ? t(I18N_KEYS.env.scope.global) : t(I18N_KEYS.env.scope.project)}
      </Badge>
      {!isGlobal && (
        <span className={styles.scopePath} data-testid="env-cwd" title={cwd}>
          {cwd}
        </span>
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
 * A row is editable only when its value is config-file-sourced. Tool
 * vars (`tool`) and host-inherited vars (`default`) are not written by
 * mise config, so `mise set` / `mise unset` must never target them
 * (issue #58).
 */
function isConfigSource(source: EnvSource): boolean {
  return source === "project" || source === "global";
}

function EnvSourceCell({ row }: { row: EnvRow }) {
  const { t } = useTranslation();
  const label =
    row.source === "tool" && row.sourceDetail
      ? `${t(I18N_KEYS.env.source.tool)} · ${row.sourceDetail}`
      : t(I18N_KEYS.env.source[row.source]);
  // Tool-injected and host-inherited rows cannot be set via `mise set`;
  // the badge carries a CLI-terms tooltip explaining why (issue #58).
  const tooltip = !isConfigSource(row.source)
    ? row.source === "tool" && row.sourceDetail
      ? t(I18N_KEYS.env.tooltip.tool, { tool: row.sourceDetail })
      : t(I18N_KEYS.env.tooltip.default)
    : undefined;
  return (
    <div className={styles.sourceCell}>
      <Badge variant={envSourceVariant(row.source)} title={tooltip}>
        {label}
      </Badge>
      {row.sourcePath && (
        <span className={styles.sourcePath} title={row.sourcePath}>
          {row.sourcePath}
        </span>
      )}
    </div>
  );
}

// ---------- Row actions ----------

function EnvRowActions({
  row,
  onWrite,
  disabled,
}: {
  row: EnvRow;
  onWrite: (builder: (cwd: string | null) => string[]) => void | Promise<void>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
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
  // can only target config-file-sourced rows, so expose no actions.
  if (!isConfigSource(row.source)) {
    return null;
  }

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
      void onWrite((cwd) => miseEnvUnsetArgs(row.name, cwd));
    }
    void onWrite((cwd) => miseEnvSetArgs(name, value, cwd));
    setEditing(false);
  };

  if (editing) {
    return (
      <span className={styles.rowEditor}>
        <input
          type="text"
          className={styles.inputName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(I18N_KEYS.env.namePlaceholder)}
          disabled={disabled}
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
          disabled={disabled}
          data-testid={`env-value-${row.name}`}
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={disabled || !dirty || name.length === 0 || value.length === 0}
          data-testid={`env-save-${row.name}`}
        >
          {t(I18N_KEYS.common.save)}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={cancelEdit}
          disabled={disabled}
          data-testid={`env-cancel-${row.name}`}
        >
          {t(I18N_KEYS.common.cancel)}
        </Button>
      </span>
    );
  }

  return (
    <span className={styles.rowActions}>
      <Button
        variant="ghost"
        size="sm"
        onClick={startEdit}
        disabled={disabled}
        data-testid={`env-edit-${row.name}`}
      >
        {t(I18N_KEYS.env.editButton)}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onWrite((cwd) => miseEnvUnsetArgs(row.name, cwd))}
        disabled={disabled}
        data-testid={`env-remove-${row.name}`}
      >
        {t(I18N_KEYS.env.removeButton)}
      </Button>
    </span>
  );
}

// ---------- Add form ----------

function AddEnvForm({
  onWrite,
  disabled,
}: {
  onWrite: (builder: (cwd: string | null) => string[]) => void | Promise<void>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const onAdd = () => {
    void onWrite((cwd) => miseEnvSetArgs(name, value, cwd));
  };
  return (
    <div className={styles.addForm} data-testid="env-add">
      <span className={styles.addLabel}>{t(I18N_KEYS.env.addLabel)}</span>
      <input
        type="text"
        className={styles.inputName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t(I18N_KEYS.env.namePlaceholder)}
        disabled={disabled}
        data-testid="env-add-name"
        spellCheck={false}
        autoComplete="off"
      />
      <input
        type="text"
        className={styles.inputValue}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(I18N_KEYS.env.valuePlaceholder)}
        disabled={disabled}
        data-testid="env-add-value"
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={onAdd}
        disabled={disabled || name.length === 0 || value.length === 0}
        data-testid="env-add-button"
      >
        {t(I18N_KEYS.env.addButton)}
      </Button>
    </div>
  );
}

// ---------- Trust banner ----------

interface TrustBannerProps {
  trust: ReturnType<typeof useTrust>["state"];
  running: boolean;
  lastResult: "ok" | "error" | null;
  lastError: string | null;
  onTrust: () => void;
}

const TrustBanner = forwardRef<HTMLDivElement, TrustBannerProps>(function TrustBanner(
  { trust, running, lastResult, lastError, onTrust },
  ref,
) {
  const { t } = useTranslation();
  if (trust.kind !== "untrusted") return null;
  return (
    <div ref={ref} data-testid="env-trust-banner">
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
            data-testid="env-trust-button"
          >
            {running ? t(I18N_KEYS.trust.busy) : t(I18N_KEYS.trust.banner.action)}
          </Button>
        }
      >
        {t(I18N_KEYS.env.guard.untrustedBody)}
        {trust.path ? <span className={styles.trustPath}> · {trust.path}</span> : null}
      </Banner>
      {lastResult === "ok" && (
        <div className={styles.trustNote} data-testid="env-trust-ok">
          {t(I18N_KEYS.trust.ok)}
        </div>
      )}
      {lastResult === "error" && (
        <div className={styles.trustNote} data-testid="env-trust-error">
          {t(I18N_KEYS.trust.error)}
          {lastError ? <> · {lastError}</> : null}
        </div>
      )}
    </div>
  );
});
