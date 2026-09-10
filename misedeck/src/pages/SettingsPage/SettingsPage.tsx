// SettingsPage — `mise settings ls --json-extended` rendered with
// sources; changes go through `mise settings set` / `mise settings
// unset` and the execution panel (issue #29). Editing matches the
// setting's data type (booleans get a two-state control), the add
// form completes key names from `mise settings ls --all`, and an
// opt-in "--all" toggle reveals unset keys (issue #52).
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
import { useOwnRun } from "../../components/ExecutionPanel";
import {
  Badge,
  Banner,
  Button,
  CommandHint,
  EmptyState,
  KeyForm,
  PageShell,
  Suggestions,
  Table,
  type TableColumn,
  TableFilter,
  Tooltip,
  useRegisterPageRefresh,
} from "../../components";
import { useParsedSettingsList } from "../../hooks/useIssue29";
import { useTableFilter } from "../../hooks/useTableFilter";
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

  const [showAll, setShowAll] = useState(false);
  // The explicit (CLI-faithful) list is the default view; the `--all`
  // list backs both the opt-in "show all" view and the add form's
  // key-name completion, so it is always fetched.
  const explicitSettings = useParsedSettingsList(false);
  const allSettings = useParsedSettingsList(true);
  const settings = showAll ? allSettings : explicitSettings;

  const writeRun = useOwnRun();

  // Top-toolbar refresh (issue #98): the prefix key covers both the
  // explicit and the `--all` settings queries.
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["settings", "ls", cwd] });
  }, [queryClient, cwd]);
  useRegisterPageRefresh(onRefresh);

  // Per-action run-lock (issue #138): `writeRun` wraps the panel runner and
  // its in-flight flag is true only while the command *this* callback
  // dispatched is running, so a long install elsewhere never disables
  // this page's Save / Add. The read query refreshes on this run's own
  // success (not on a global status transition).
  const runWrite = useCallback(
    async (builder: (cwd: string | null) => string[]) => {
      if (!guard.allowed) {
        focusTrustBanner();
        return;
      }
      if (writeRun.isRunning) return;
      const res = await writeRun.run({ cwd, args: builder(cwd) });
      if (res.kind === "ok") {
        void queryClient.invalidateQueries({ queryKey: ["settings", "ls", cwd] });
      }
    },
    [guard.allowed, focusTrustBanner, writeRun.isRunning, writeRun.run, cwd, queryClient],
  );

  // Text filter over the full row set (issue #106), shared with the
  // tools / env / tasks tables via `useTableFilter`.
  const filter = useTableFilter(settings.data ?? [], (r) =>
    [r.key, formatValue(r.value), r.type ?? "", r.source ?? ""].join("\n"),
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
      width: "240px",
      minWidth: "160px",
      sortValue: (r) => r.key,
      cell: (r) => <Tooltip text={r.key}><span className={styles.cellKey}>{r.key}</span></Tooltip>,
    },
    {
      key: "value",
      header: t(I18N_KEYS.settings.columns.value),
      sortValue: (r) => formatValue(r.value),
      cell: (r) => <span className={styles.cellValue}>{formatValue(r.value)}</span>,
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
      width: "140px",
      sortValue: (r) => r.source ?? "",
      cell: (r) => (r.source ? <Tooltip text={r.source}><span className={styles.cellSource}>{r.source}</span></Tooltip> : <span className={styles.cellSource}>—</span>),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.settings.columns.actions),
      width: "210px",
      cell: (r) => <RowEditor row={r} onWrite={runWrite} disabled={writeRun.isRunning} />,
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{t(I18N_KEYS.settings.title)}</h1>
          <CommandHint>{t(I18N_KEYS.settings.commandHint)}</CommandHint>
          <p className={styles.hint}>{t(I18N_KEYS.settings.hint)}</p>
          <ScopeBadge cwd={cwd} />
        </header>

        <div className={styles.toolbar}>
          <span className={styles.toolbarHint}>
            {settings.data
              ? t(I18N_KEYS.settings.count, { count: settings.data.length })
              : t(I18N_KEYS.common.loading)}
          </span>
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
              rows={filter.rows}
              rowKey={(r) => r.key}
              fixed
              resizeKey="settings"
              className={styles.settingsTable}
              empty={
                filter.active ? (
                  <EmptyState
                    title={t(I18N_KEYS.common.filter.noMatchTitle)}
                    body={t(I18N_KEYS.common.filter.noMatchBody)}
                  />
                ) : (
                  <EmptyState
                    title={t(I18N_KEYS.settings.empty.title)}
                    body={t(I18N_KEYS.settings.empty.body)}
                  />
                )
              }
            />
            <AddSettingForm
              onWrite={runWrite}
              disabled={writeRun.isRunning}
              keySuggestions={allSettings.data?.map((r) => r.key) ?? []}
            />
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
      <Badge variant={isGlobal ? "default" : "info"} size="inline">
        {isGlobal
          ? t(I18N_KEYS.env.scope.global)
          : t(I18N_KEYS.env.scope.project)}
      </Badge>
      {!isGlobal && (
        <Tooltip text={cwd}>
          <span className={styles.scopePath} data-testid="settings-cwd">{cwd}</span>
        </Tooltip>
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
  /** True while a foreground command runs. Run-locking (issue #135)
   *  gates only command-firing controls — Save / submit and Unset.
   *  Editing the draft value never locks. */
  disabled: boolean;
}) {
  const { t } = useTranslation();
  // Boolean-typed settings edit through a two-state control, not a
  // free text field (issue #52).
  const isBool = row.type === "boolean" || typeof row.value === "boolean";
  const [value, setValue] = useState(formatValue(row.value));
  const [checked, setChecked] = useState(row.value === true);
  useEffect(() => {
    setValue(formatValue(row.value));
    setChecked(row.value === true);
  }, [row.value]);
  const dirty = isBool
    ? checked !== (row.value === true)
    : value !== formatValue(row.value);
  // Escape reverts the draft to the row's current value (issue #109).
  const onRevert = () => {
    setValue(formatValue(row.value));
    setChecked(row.value === true);
  };
  return (
    <KeyForm
      className={styles.rowEditor}
      onSubmit={() =>
        onWrite((cwd) =>
          miseSettingsSetArgs(row.key, isBool ? String(checked) : value, cwd),
        )
      }
      onRevert={onRevert}
      submitDisabled={disabled || !dirty || (!isBool && value.length === 0)}
    >
      {isBool ? (
        <input
          type="checkbox"
          className={styles.boolToggle}
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          aria-label={`${row.key}: ${formatValue(row.value)}`}
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
        onClick={() =>
          onWrite((cwd) =>
            miseSettingsSetArgs(row.key, isBool ? String(checked) : value, cwd),
          )
        }
        disabled={disabled || !dirty || (!isBool && value.length === 0)}
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
    </KeyForm>
  );
}

function AddSettingForm({
  onWrite,
  disabled,
  keySuggestions,
}: {
  onWrite: (builder: (cwd: string | null) => string[]) => void | Promise<void>;
  /** True while a foreground command runs; locks only the Add submit
   *  (run-locking, issue #135) — drafting the inputs never locks. */
  disabled: boolean;
  /** Known setting keys from `mise settings ls --all`, offered as
   *  completion on the key field (issue #52). */
  keySuggestions: string[];
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const onAdd = () => {
    void onWrite((cwd) => miseSettingsSetArgs(key, value, cwd));
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
      submitDisabled={disabled || key.length === 0 || value.length === 0}
    >
      <span className={styles.addLabel}>{t(I18N_KEYS.settings.addSettingLabel)}</span>
      <input
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
        disabled={disabled || key.length === 0 || value.length === 0}
      >
        {t(I18N_KEYS.settings.addButton)}
      </Button>
    </KeyForm>
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
        {trust.path ? <Tooltip text={trust.path}><span className={styles.trustPath}> · {trust.path}</span></Tooltip> : null}
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
