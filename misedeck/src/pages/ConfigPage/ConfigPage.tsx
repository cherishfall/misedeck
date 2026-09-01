// ConfigPage — the form-based config editor for the active directory
// context (issue #26). Edits the [tools] and [env] tables of the
// global config or the cwd's mise.toml via mise's own write
// commands. Per the architecture doc, no direct TOML edits; every
// mutation routes through the execution panel.
//
//   * mise use <tool>@<version>     — add / change a tool version
//   * mise use --remove <tool>      — remove a tool from the config
//   * mise set <KEY>=<value>        — set a [env] table value
//   * mise unset <KEY>              — remove a [env] table value
//
// The argv builders on the Rust side (mise_use_argv /
// mise_env_set_argv / etc., in `misedeck/src-tauri/src/mise.rs`)
// pin the exact shape of these commands so a future mise CLI
// change surfaces in tests, not in production. The JS side calls
// `useExecutionContext().run({cwd, args})` with the argv the
// Rust helpers produce, and inserts `-g` for the global context
// (so `mise use -g node@22` writes to `~/.config/mise/config.toml`
// instead of the process cwd's `mise.toml`).
//
// Trust gating (issue #25): every mutation button calls
// `useTrustGuard().allowed` before running. When the cwd's
// `mise.toml` is untrusted, the click handler focuses the trust
// banner so the user lands on the Trust action instead of the
// mutation silently no-op'ing. `useTrustGuard()` is the same
// surface #22 / #27 will use, so the pattern here is the
// canonical one.
//
// The page also surfaces the trust banner (when applicable) and
// invalidates the relevant TanStack queries on success so the
// preview page's config-source badges update after an edit.

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
import {
  useParsedEnv,
  useParsedToolsList,
} from "../../hooks/useToolsList";

import styles from "./ConfigPage.module.css";

// ---------- Row shapes ----------

interface ToolRow {
  /** Stable row id. */
  id: string;
  /** The tool name, e.g. "node". */
  tool: string;
  /** The version mise has in the config (or in `ls`), e.g. "22.11.0". */
  version: string;
}

interface EnvRow {
  /** Stable row id. */
  id: string;
  /** The env var name. */
  name: string;
  /** The value. */
  value: string;
}

// ---------- Args builders (mirror the Rust helpers) ----------
//
// The Rust side defines `mise_use_argv` / `mise_env_set_argv` /
// `mise_env_unset_argv` in pure form so a future mise CLI change
// surfaces in tests. The JS side duplicates the shape here so the
// page is self-contained (the only Rust call is
// `run_mise_command({cwd, args})`, which accepts the prebuilt argv
// verbatim). Keep the two in lockstep — the Rust `tests/config.rs`
// asserts the exact strings.
//
// In the global context (cwd === null) we need to pass `-g` so
// mise writes to `~/.config/mise/config.toml` instead of the
// process cwd's `mise.toml`. The Rust side doesn't add this flag
// because the runner treats cwd as a separate concern.

function miseUseAddArgs(tool: string, version: string, cwd: string | null): string[] {
  return cwd === null
    ? ["use", "-g", `${tool}@${version}`]
    : ["use", `${tool}@${version}`];
}
function miseUseRemoveArgs(tool: string, cwd: string | null): string[] {
  return cwd === null
    ? ["use", "-g", "--remove", tool]
    : ["use", "--remove", tool];
}
function miseEnvSetArgs(key: string, value: string, cwd: string | null): string[] {
  return cwd === null
    ? ["set", "-g", `${key}=${value}`]
    : ["set", `${key}=${value}`];
}
function miseEnvUnsetArgs(key: string, cwd: string | null): string[] {
  return cwd === null ? ["unset", "-g", key] : ["unset", key];
}

// ---------- Page ----------

export function ConfigPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();
  const { state: execState, run } = useExecutionContext();
  const { state: trust } = useTrust();
  const trustAction = useTrustAction();
  const guard = useTrustGuard();
  // The trust banner is rendered by the page itself (so the guard
  // can scroll to it on a blocked mutation). The ref is forwarded
  // to the banner; the focus function is what the mutation
  // handlers call when the guard blocks.
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const focusTrustBanner = useCallback(() => {
    const el = bannerRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Move focus to the Trust button so keyboard users land on
      // the action, not just the banner.
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

  const tools = useParsedToolsList();
  const env = useParsedEnv();

  // After a successful config write, the read queries become stale.
  // The execution panel reducer's `status` is the single source of
  // truth for "is a write in flight" and its terminal outcome; we
  // observe the `running → ok` transition (the same transition the
  // trust action uses) and invalidate the dependent queries so the
  // preview page's config-source badges update after an edit.
  const lastWriteStatusRef = useRef<ExecutionStatus>("idle");
  useEffect(() => {
    const prev = lastWriteStatusRef.current;
    lastWriteStatusRef.current = execState.status;
    if (prev === "running" && execState.status === "ok") {
      void queryClient.invalidateQueries({ queryKey: ["tools", "ls", cwd] });
      void queryClient.invalidateQueries({ queryKey: ["tools", "env", cwd] });
      void queryClient.invalidateQueries({ queryKey: ["tools", "env", null] });
    }
  }, [execState.status, cwd, queryClient]);

  // The execution panel reducer is the single source of truth for
  // "is a write in flight". We render the page with a single
  // "running" flag for the submit buttons. The panel also shows
  // the live command + logs.
  const isRunning = execState.status === "running";

  // Run a write command. Every entry point checks the trust guard
  // first; on block, the page focuses the trust banner and returns
  // without running.
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

  // The tools list comes from `mise ls --json`, which reports
  // installed tool versions — not strictly the config table. The
  // editor uses it as a starting point (the user can change a
  // version or remove a tool that is already installed) and the
  // "add" form below for new tools. A directory with no installed
  // tools still shows the "add" form so the user can start fresh.
  const toolRows: ToolRow[] = useMemo(() => {
    if (!tools.data) return [];
    const rows: ToolRow[] = [];
    for (const { tool, items } of tools.data) {
      const active = items.find((it) => it.active) ?? items[0];
      if (!active) continue;
      rows.push({
        id: `${tool}@${active.version}`,
        tool,
        version: active.version,
      });
    }
    return rows;
  }, [tools.data]);

  // The env list is the resolved env from `mise env --json`. The
  // editor shows every var; the user can edit the value (or the
  // name) and click Save to write to the config. The
  // `reconcileEnvSources` pass is in the preview page; here we
  // just use the raw resolved map.
  const envRows: EnvRow[] = useMemo(() => {
    if (!env.data) return [];
    return env.data.map((e) => ({ id: e.name, name: e.name, value: e.value }));
  }, [env.data]);

  // Mise-missing state.
  if (detect.isPending) {
    return <ConfigLoading />;
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

  const toolColumns: TableColumn<ToolRow>[] = [
    {
      key: "tool",
      header: t(I18N_KEYS.preview.columns.tool),
      cell: (r) => <span className={styles.cellTool}>{r.tool}</span>,
    },
    {
      key: "version",
      header: t(I18N_KEYS.preview.columns.version),
      cell: (r) => <span className={styles.cellVersion}>{r.version}</span>,
    },
    {
      key: "actions",
      header: t(I18N_KEYS.config.toolsSection.saveButton),
      cell: (r) => <ToolRowEditor row={r} onWrite={runWrite} disabled={isRunning} />,
    },
  ];

  const envColumns: TableColumn<EnvRow>[] = [
    {
      key: "name",
      header: t(I18N_KEYS.preview.columns.name),
      cell: (r) => <span className={styles.cellEnvName}>{r.name}</span>,
    },
    {
      key: "value",
      header: t(I18N_KEYS.preview.columns.value),
      cell: (r) => <span className={styles.cellEnvValue}>{r.value || "—"}</span>,
    },
    {
      key: "actions",
      header: t(I18N_KEYS.config.envSection.saveButton),
      cell: (r) => <EnvRowEditor row={r} onWrite={runWrite} disabled={isRunning} />,
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{t(I18N_KEYS.config.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.config.title)}</h1>
          <p className={styles.hint}>{t(I18N_KEYS.config.subtitle)}</p>
          <ScopeBadge cwd={cwd} />
        </header>


        {/* Trust banner (issue #25). Re-uses the same forwardRef
            pattern the preview page uses so the guard can focus
            it on a blocked mutation. */}
        <TrustBanner
          ref={bannerRef}
          trust={trust}
          running={trustAction.running}
          lastResult={trustAction.lastResult}
          lastError={trustAction.lastError}
          onTrust={trustAction.run}
        />

        {/* ---------- Tools section ---------- */}
        <section className={styles.section} data-testid="config-section-tools">
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>
              {t(I18N_KEYS.config.eyebrow)}
            </span>
            <h2 className={styles.sectionTitle}>
              {t(I18N_KEYS.config.toolsSection.title)}
            </h2>
          </header>

          <Table<ToolRow>
            columns={toolColumns}
            rows={toolRows}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                eyebrow={t(I18N_KEYS.config.eyebrow)}
                title={t(I18N_KEYS.config.toolsSection.emptyTitle)}
                body={t(I18N_KEYS.config.toolsSection.emptyBody)}
              />
            }
          />

          <AddToolForm onWrite={runWrite} disabled={isRunning} />
        </section>

        {/* ---------- Env section ---------- */}
        <section className={styles.section} data-testid="config-section-env">
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>
              {t(I18N_KEYS.config.eyebrow)}
            </span>
            <h2 className={styles.sectionTitle}>
              {t(I18N_KEYS.config.envSection.title)}
            </h2>
          </header>

          <Table<EnvRow>
            columns={envColumns}
            rows={envRows}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                eyebrow={t(I18N_KEYS.config.eyebrow)}
                title={t(I18N_KEYS.config.envSection.emptyTitle)}
                body={t(I18N_KEYS.config.envSection.emptyBody)}
              />
            }
          />

          <AddEnvForm onWrite={runWrite} disabled={isRunning} />
        </section>
      </div>
    </PageShell>
  );
}

function ConfigLoading() {
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
        {isGlobal
          ? t(I18N_KEYS.config.scope.global)
          : t(I18N_KEYS.config.scope.project)}
      </Badge>
      {!isGlobal && (
        <span className={styles.scopePath} data-testid="config-cwd">
          {cwd}
        </span>
      )}
    </div>
  );
}

// ---------- Row editors (per-row save / remove) ----------

/**
 * The inline editor for one tool row. The version is editable so
 * the user can bump a tool without re-typing its name. Save
 * dispatches `mise use <tool>@<version>`; Remove dispatches
 * `mise use --remove <tool>`. Both go through `onWrite` (the
 * page's `runWrite`) so the trust guard is checked first.
 */
function ToolRowEditor({
  row,
  onWrite,
  disabled,
}: {
  row: ToolRow;
  onWrite: (builder: (cwd: string | null) => string[]) => void | Promise<void>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(row.version);
  // Reset local state when the row's underlying version changes
  // (e.g. a refetch after another tool's edit).
  useEffect(() => {
    setVersion(row.version);
  }, [row.version]);
  const dirty = version !== row.version;
  return (
    <span className={styles.rowEditor}>
      <input
        type="text"
        className={styles.input}
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder={t(I18N_KEYS.config.toolsSection.versionPlaceholder)}
        disabled={disabled}
        data-testid={`config-tool-version-${row.tool}`}
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={() => onWrite((cwd) => miseUseAddArgs(row.tool, version, cwd))}
        disabled={disabled || !dirty || version.length === 0}
        data-testid={`config-tool-save-${row.tool}`}
      >
        {t(I18N_KEYS.config.toolsSection.saveButton)}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onWrite((cwd) => miseUseRemoveArgs(row.tool, cwd))}
        disabled={disabled}
        data-testid={`config-tool-remove-${row.tool}`}
      >
        {t(I18N_KEYS.config.toolsSection.removeButton)}
      </Button>
    </span>
  );
}

/**
 * The inline editor for one env row. The name is editable so the
 * user can rename (e.g. NODE_ENV → NODE_ENV_PROD); Save with a
 * new name removes the old and adds the new. Remove dispatches
 * `mise unset <name>`.
 */
function EnvRowEditor({
  row,
  onWrite,
  disabled,
}: {
  row: EnvRow;
  onWrite: (builder: (cwd: string | null) => string[]) => void | Promise<void>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(row.name);
  const [value, setValue] = useState(row.value);
  useEffect(() => {
    setName(row.name);
    setValue(row.value);
  }, [row.name, row.value]);
  const dirty = name !== row.name || value !== row.value;
  const onSave = () => {
    // If the user renamed the var, remove the old key first so a
    // half-renamed config doesn't leave the previous name in the
    // [env] table. We don't chain the runs because the runner
    // already rejects concurrent runs and the panel will show
    // each step; the first run's success is enough to keep the
    // remove flowing. (If the user wants to roll back, they can
    // hit Remove on the new row.)
    if (name !== row.name) {
      void onWrite((cwd) => miseEnvUnsetArgs(row.name, cwd));
    }
    void onWrite((cwd) => miseEnvSetArgs(name, value, cwd));
  };
  return (
    <span className={styles.rowEditor}>
      <input
        type="text"
        className={styles.inputName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t(I18N_KEYS.config.envSection.namePlaceholder)}
        disabled={disabled}
        data-testid={`config-env-name-${row.name}`}
        spellCheck={false}
        autoComplete="off"
      />
      <input
        type="text"
        className={styles.inputValue}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(I18N_KEYS.config.envSection.valuePlaceholder)}
        disabled={disabled}
        data-testid={`config-env-value-${row.name}`}
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={onSave}
        disabled={disabled || !dirty || name.length === 0 || value.length === 0}
        data-testid={`config-env-save-${row.name}`}
      >
        {t(I18N_KEYS.config.envSection.saveButton)}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onWrite((cwd) => miseEnvUnsetArgs(row.name, cwd))}
        disabled={disabled}
        data-testid={`config-env-remove-${row.name}`}
      >
        {t(I18N_KEYS.config.envSection.removeButton)}
      </Button>
    </span>
  );
}

// ---------- Add forms (one each) ----------

/**
 * The "add a tool" form at the bottom of the tools section. The
 * user types a tool name and version; Add dispatches
 * `mise use <tool>@<version>`. The form is local state only — no
 * submit-on-Enter, no auto-clear on success (the panel's exit
 * state would race the form's local state, and the user can
 * re-submit the same values if they want). The trust guard is
 * applied by `onWrite`.
 */
function AddToolForm({
  onWrite,
  disabled,
}: {
  onWrite: (builder: (cwd: string | null) => string[]) => void | Promise<void>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [tool, setTool] = useState("");
  const [version, setVersion] = useState("");
  const onAdd = () => {
    void onWrite((cwd) => miseUseAddArgs(tool, version, cwd));
  };
  return (
    <div className={styles.addForm} data-testid="config-add-tool">
      <span className={styles.addLabel}>
        {t(I18N_KEYS.config.toolsSection.addToolLabel)}
      </span>
      <input
        type="text"
        className={styles.input}
        value={tool}
        onChange={(e) => setTool(e.target.value)}
        placeholder={t(I18N_KEYS.config.toolsSection.toolPlaceholder)}
        disabled={disabled}
        data-testid="config-add-tool-name"
        spellCheck={false}
        autoComplete="off"
      />
      <input
        type="text"
        className={styles.input}
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder={t(I18N_KEYS.config.toolsSection.versionPlaceholder)}
        disabled={disabled}
        data-testid="config-add-tool-version"
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={onAdd}
        disabled={disabled || tool.length === 0 || version.length === 0}
        data-testid="config-add-tool-button"
      >
        {t(I18N_KEYS.config.toolsSection.addButton)}
      </Button>
    </div>
  );
}

/**
 * The "add an env var" form. Same pattern as `AddToolForm`: name
 * + value + Add button. The trust guard is applied by `onWrite`.
 */
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
    <div className={styles.addForm} data-testid="config-add-env">
      <span className={styles.addLabel}>
        {t(I18N_KEYS.config.envSection.addEnvLabel)}
      </span>
      <input
        type="text"
        className={styles.inputName}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t(I18N_KEYS.config.envSection.namePlaceholder)}
        disabled={disabled}
        data-testid="config-add-env-name"
        spellCheck={false}
        autoComplete="off"
      />
      <input
        type="text"
        className={styles.inputValue}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t(I18N_KEYS.config.envSection.valuePlaceholder)}
        disabled={disabled}
        data-testid="config-add-env-value"
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        variant="primary"
        size="sm"
        onClick={onAdd}
        disabled={disabled || name.length === 0 || value.length === 0}
        data-testid="config-add-env-button"
      >
        {t(I18N_KEYS.config.envSection.addButton)}
      </Button>
    </div>
  );
}

// ---------- Trust banner (issue #25; reused from DirectoryPreview) ----------

interface TrustBannerProps {
  trust: ReturnType<typeof useTrust>["state"];
  running: boolean;
  lastResult: "ok" | "error" | null;
  lastError: string | null;
  onTrust: () => void;
}

/**
 * Renders nothing in every state except `untrusted`, so it is
 * safe to drop into the page unconditionally. The `ref` is what
 * `useTrustGuard` consumers focus when a mutation is blocked.
 */
const TrustBanner = forwardRef<HTMLDivElement, TrustBannerProps>(function TrustBanner(
  { trust, running, lastResult, lastError, onTrust },
  ref,
) {
  const { t } = useTranslation();
  if (trust.kind !== "untrusted") return null;
  return (
    <div ref={ref} data-testid="config-trust-banner">
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
            data-testid="config-trust-button"
          >
            {running
              ? t(I18N_KEYS.trust.busy)
              : t(I18N_KEYS.trust.banner.action)}
          </Button>
        }
      >
        {t(I18N_KEYS.config.guard.untrustedBody)}
        {trust.path ? <span className={styles.trustPath}> · {trust.path}</span> : null}
      </Banner>
      {lastResult === "ok" && (
        <div className={styles.trustNote} data-testid="config-trust-ok">
          {t(I18N_KEYS.trust.ok)}
        </div>
      )}
      {lastResult === "error" && (
        <div className={styles.trustNote} data-testid="config-trust-error">
          {t(I18N_KEYS.trust.error)}
          {lastError ? <> · {lastError}</> : null}
        </div>
      )}
    </div>
  );
});
