// SettingsPage — `mise settings ls --json-extended` rendered with
// sources; changes go through `mise settings set` / `mise settings
// unset` and the execution panel (issue #29).
//
// The page follows the same trust-guarded mutation pattern as the
// config editor (#26): every mutating button checks `useTrustGuard()`
// first, and the trust banner is focused when a write is blocked.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  forwardRef,
  useCallback,
  useEffect,
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
import { useParsedSettingsList } from "../../hooks/useIssue29";
import type { SettingsItem } from "../../types/tauri";

import styles from "./SettingsPage.module.css";

// ---------- Args builders ----------

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

  const settings = useParsedSettingsList();

  const lastWriteStatusRef = useRef<ExecutionStatus>("idle");
  useEffect(() => {
    const prev = lastWriteStatusRef.current;
    lastWriteStatusRef.current = execState.status;
    if (prev === "running" && execState.status === "ok") {
      void queryClient.invalidateQueries({ queryKey: ["settings", "ls", cwd] });
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

  if (detect.isPending) {
    return <SettingsLoading />;
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
      cell: (r) => <span className={styles.cellKey}>{r.key}</span>,
    },
    {
      key: "value",
      header: t(I18N_KEYS.settings.columns.value),
      cell: (r) => <span className={styles.cellValue}>{formatValue(r.value)}</span>,
    },
    {
      key: "type",
      header: t(I18N_KEYS.settings.columns.type),
      cell: (r) => (r.type ? <Badge variant="info">{r.type}</Badge> : <span className={styles.dim}>—</span>),
    },
    {
      key: "source",
      header: t(I18N_KEYS.settings.columns.source),
      cell: (r) => <span className={styles.cellSource}>{r.source ?? "—"}</span>,
    },
    {
      key: "actions",
      header: t(I18N_KEYS.settings.columns.actions),
      cell: (r) => <RowEditor row={r} onWrite={runWrite} disabled={isRunning} />,
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{t(I18N_KEYS.settings.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.settings.title)}</h1>
          <p className={styles.hint}>{t(I18N_KEYS.settings.hint)}</p>
          <ScopeBadge cwd={cwd} />
        </header>

        <div className={styles.toolbar}>
          <span className={styles.toolbarHint}>
            {settings.data
              ? `${settings.data.length} ${t(I18N_KEYS.settings.columns.key).toLowerCase()}`
              : t(I18N_KEYS.common.loading)}
          </span>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["settings", "ls", cwd] })}
            disabled={settings.isPending}
            data-testid="settings-refresh"
          >
            {t(I18N_KEYS.common.refresh)}
          </button>
        </div>


        <TrustBanner
          ref={bannerRef}
          trust={trust}
          running={trustAction.running}
          lastResult={trustAction.lastResult}
          lastError={trustAction.lastError}
          onTrust={trustAction.run}
        />

        {settingsError && (
          <div className={styles.errorState} data-testid="settings-read-error">
            <div className={styles.errorLabel}>{t(I18N_KEYS.settings.error.title)}</div>
            <p className={styles.errorBody}>{t(I18N_KEYS.settings.error.body)}</p>
            {settingsError.stderr && (
              <pre className={styles.errorStderr}>{settingsError.stderr}</pre>
            )}
          </div>
        )}

        {!settingsError && (
          <>
            <Table<SettingsItem>
              columns={columns}
              rows={settings.data ?? []}
              rowKey={(r) => r.key}
              empty={
                <EmptyState
                  eyebrow={t(I18N_KEYS.settings.eyebrow)}
                  title={t(I18N_KEYS.settings.empty.title)}
                  body={t(I18N_KEYS.settings.empty.body)}
                />
              }
            />
            <AddSettingForm onWrite={runWrite} disabled={isRunning} />
          </>
        )}
      </div>
    </PageShell>
  );
}

function SettingsLoading() {
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

function ScopeBadge({ cwd }: { cwd: string | null }) {
  const { t } = useTranslation();
  const isGlobal = cwd === null;
  return (
    <div className={styles.scopeRow}>
      <Badge variant={isGlobal ? "default" : "info"}>
        {isGlobal
          ? t(I18N_KEYS.config.scope.global)
          : t(I18N_KEYS.config.scope.project)}
      </Badge>
      {!isGlobal && (
        <span className={styles.scopePath} data-testid="settings-cwd">
          {cwd}
        </span>
      )}
    </div>
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

function RowEditor({
  row,
  onWrite,
  disabled,
}: {
  row: SettingsItem;
  onWrite: (builder: (cwd: string | null) => string[]) => void | Promise<void>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(formatValue(row.value));
  useEffect(() => {
    setValue(formatValue(row.value));
  }, [row.value]);
  const dirty = value !== formatValue(row.value);
  return (
    <span className={styles.rowEditor}>
      <input
        type="text"
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(I18N_KEYS.settings.valuePlaceholder)}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={() => onWrite((cwd) => miseSettingsSetArgs(row.key, value, cwd))}
        disabled={disabled || !dirty || value.length === 0}
      >
        {t(I18N_KEYS.settings.saveButton)}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onWrite((cwd) => miseSettingsUnsetArgs(row.key, cwd))}
        disabled={disabled}
      >
        {t(I18N_KEYS.settings.unsetButton)}
      </Button>
    </span>
  );
}

function AddSettingForm({
  onWrite,
  disabled,
}: {
  onWrite: (builder: (cwd: string | null) => string[]) => void | Promise<void>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const onAdd = () => {
    void onWrite((cwd) => miseSettingsSetArgs(key, value, cwd));
  };
  return (
    <div className={styles.addForm} data-testid="settings-add">
      <span className={styles.addLabel}>{t(I18N_KEYS.settings.addSettingLabel)}</span>
      <input
        type="text"
        className={styles.inputName}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={t(I18N_KEYS.settings.keyPlaceholder)}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
      />
      <input
        type="text"
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(I18N_KEYS.settings.valuePlaceholder)}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={onAdd}
        disabled={disabled || key.length === 0 || value.length === 0}
      >
        {t(I18N_KEYS.settings.addButton)}
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
    <div ref={ref} data-testid="settings-trust-banner">
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
            data-testid="settings-trust-button"
          >
            {running ? t(I18N_KEYS.trust.busy) : t(I18N_KEYS.trust.banner.action)}
          </Button>
        }
      >
        {t(I18N_KEYS.settings.guard.untrustedBody)}
        {trust.path ? <span className={styles.trustPath}> · {trust.path}</span> : null}
      </Banner>
      {lastResult === "ok" && (
        <div className={styles.trustNote} data-testid="settings-trust-ok">
          {t(I18N_KEYS.trust.ok)}
        </div>
      )}
      {lastResult === "error" && (
        <div className={styles.trustNote} data-testid="settings-trust-error">
          {t(I18N_KEYS.trust.error)}
          {lastError ? <> · {lastError}</> : null}
        </div>
      )}
    </div>
  );
});
