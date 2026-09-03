// DirectoryPreview — the read-only directory resolved-state view (issue #24).
//
//   * mise -C <dir> ls --json   → resolved tools (reuses #21's runner
//                                 hook; the `cwd` arg drives `-C`)
//   * mise -C <dir> env --json  → resolved env vars, each row badged
//                                 with GLOBAL / DIRECTORY / TOOL / DEFAULT
//   * mise config ls --json     → loaded config files in precedence
//                                 order (highest first), each with a
//                                 read-only content view (issue #42);
//                                 rendered in the Global directory
//                                 context too
//   * <dir>/mise.lock           → read-only pre block when present;
//                                 a muted "missing" line when not
//                                 (the runner reports `null` for the
//                                 Global context)
//
// The page also surfaces the trust UX (issue #25): when the cwd's
// `mise.toml` is not yet trusted, a `Banner tone="warning"` is
// rendered at the top with a one-click `Trust` action that
// streams `mise trust` through the existing execution panel. The
// banner disappears on success because the trust query
// invalidates itself when the streaming run returns Ok.
//
// The page consumes the same Table / Badge / EmptyState / PageShell
// primitives the tools page (#21) uses. The directory context comes
// from `useDirectory()`. Issue #48 made the page truthful in the
// Global context: the env / config / lockfile sections render the
// globally resolved data (matching `mise env` / `mise config` in the
// home directory), and only the resolved-tools section falls back to
// an EmptyState — which carries the "Choose directory…" entry point
// (the same Tauri dialog picker the directory indicator uses).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { forwardRef, useMemo, useRef, useState } from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { pickDirectory } from "../../directory/pickDirectory";
import { useTrust, useTrustAction } from "../../state/trustContext";
import { detectMise, isAppError } from "../../api/mise";
import { reconcileEnvSources, type EnvSource } from "../../api/miseTools";
import type { ConfigFile } from "../../types/tauri";
import {
  useConfigFiles,
  useParsedEnv,
  useParsedGlobalEnv,
  useParsedOutdatedTools,
  useParsedToolsList,
  useLockfile,
} from "../../hooks/useToolsList";
import {
  Banner,
  Badge,
  Button,
  EmptyState,
  PageShell,
  Table,
  type TableColumn,
} from "../../components";

import styles from "./DirectoryPreview.module.css";

// ---------- Row shapes ----------

interface ToolRow {
  id: string;
  tool: string;
  version: string;
  /** "GLOBAL" or "THIS DIRECTORY" — derived from `source.path`. */
  source: "global" | "project";
  /** True when this row appears in the outdated map. */
  outdated: boolean;
  latest: string;
}

interface EnvRow {
  id: string;
  name: string;
  value: string;
  source: EnvSource;
  sourceDetail?: string;
}

// ---------- Helpers ----------

/**
 * Classify a tool's config source: did the version come from the
 * global mise config, or from the project's mise.toml? We compare
 * `source.path` against the cwd: when the path is under the cwd, the
 * project is the source of truth; otherwise the global config (or
 * some other ancestor) is.
 */
function toolSourceKind(
  sourcePath: string | undefined,
  cwd: string,
): "global" | "project" {
  if (!sourcePath) return "global";
  // A path is "project" if it lives under the cwd (or matches it
  // exactly). Normalise the trailing slash so `/foo/bar/` matches
  // `/foo/bar/mise.toml`.
  const dir = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return sourcePath.startsWith(dir) ? "project" : "global";
}

/** Map a tool's source category to the badge variant. */
function toolSourceVariant(
  source: "global" | "project",
): "default" | "info" {
  return source === "project" ? "info" : "default";
}

/** Map an env var's source category to the badge variant. */
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

// ---------- Page ----------

export function DirectoryPreview() {
  const { t } = useTranslation();
  const { cwd, setDirectory } = useDirectory();
  const queryClient = useQueryClient();
  // Trust UX (issue #25): when the cwd's `mise.toml` is not
  // trusted, render a Banner at the top with a one-click Trust
  // action. The Banner is the prescribed surface (per architecture
  // doc + `components/Banner/Banner.tsx`); the action routes
  // through the existing execution panel so the trust attempt is
  // visible alongside any other mutation.
  const { state: trust } = useTrust();
  const trustAction = useTrustAction();
  const bannerRef = useRef<HTMLDivElement | null>(null);

  // First check: is mise available at all? Same gate the tools page
  // uses. When mise is missing, render the missing state — the rest
  // of the queries are pointless.
  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const tools = useParsedToolsList();
  const outdated = useParsedOutdatedTools();
  const env = useParsedEnv();
  const globalEnv = useParsedGlobalEnv();
  const lockfile = useLockfile();

  // Reconcile env sources against the global context so a var that
  // is unique to the current directory is correctly marked as
  // `project` (the directory-scoped source).
  const envEntries = useMemo(() => {
    if (!env.data) return null;
    if (!globalEnv) return env.data;
    return reconcileEnvSources(env.data, globalEnv);
  }, [env.data, globalEnv]);

  const onRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tools", "ls", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "outdated", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "env", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "lockfile", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "config", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "env", null] });
  };

  // The "Choose directory…" action (issue #48): the same Tauri
  // dialog picker the directory indicator uses, shared via
  // `directory/pickDirectory.ts` so the two call sites cannot drift.
  // A successful pick switches the app-level directory context, which
  // re-keys every query on the page.
  const onPickDirectory = () => {
    void pickDirectory(t, setDirectory);
  };

  // Every hook stays above the early returns below so the hook
  // order is stable across the detect / Global / directory states.
  const toolsError = tools.error?.kind === "err" ? tools.error.err : null;
  const envError = env.error?.kind === "err" ? env.error.err : null;
  const lockfileError =
    lockfile.data && lockfile.data.kind === "err" ? lockfile.data.err : null;
  const lockfileContent =
    lockfile.data && lockfile.data.kind === "ok" ? lockfile.data.content : undefined;

  // Tool rows: pick the active version per tool, badge by source.
  // Directory-scoped only — the Global context renders the
  // "Choose directory…" empty state instead (the global tools list
  // already lives at /tools).
  const toolRows: ToolRow[] = useMemo(() => {
    if (!tools.data || cwd === null) return [];
    const outdatedByTool = new Map<string, { latest: string }>();
    for (const item of outdated.data ?? []) {
      if (item.latest) outdatedByTool.set(item.name, { latest: item.latest });
    }
    const out: ToolRow[] = [];
    for (const { tool, items } of tools.data) {
      const active = items.find((it) => it.active) ?? items[0];
      if (!active) continue;
      const srcPath = active.source?.path;
      out.push({
        id: `${tool}@${active.version}`,
        tool,
        version: active.version,
        source: toolSourceKind(srcPath, cwd),
        outdated: outdatedByTool.has(tool),
        latest: outdatedByTool.get(tool)?.latest ?? "",
      });
    }
    return out;
  }, [tools.data, outdated.data, cwd]);

  // Env rows: use the reconciled entries.
  const envRows: EnvRow[] = useMemo(() => {
    if (!envEntries) return [];
    return envEntries.map((e) => ({
      id: e.name,
      name: e.name,
      value: e.value,
      source: e.source,
      sourceDetail: e.sourceDetail,
    }));
  }, [envEntries]);

  // Mise-missing state.
  if (detect.isPending) {
    return <PreviewLoading />;
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
      cell: (r) => (
        <span className={styles.cellTool}>
          <span className={styles.toolName}>{r.tool}</span>
        </span>
      ),
    },
    {
      key: "version",
      header: t(I18N_KEYS.preview.columns.version),
      cell: (r) => <span className={styles.cellVersion}>{r.version}</span>,
    },
    {
      key: "source",
      header: t(I18N_KEYS.preview.columns.source),
      cell: (r) => (
        <Badge variant={toolSourceVariant(r.source)}>
          {r.source === "project"
            ? t(I18N_KEYS.preview.toolSource.project)
            : t(I18N_KEYS.preview.toolSource.global)}
        </Badge>
      ),
    },
  ];

  const envColumns: TableColumn<EnvRow>[] = [
    {
      key: "name",
      header: t(I18N_KEYS.preview.columns.name),
      cell: (r) => <span className={styles.cellEnvName}>{r.name}</span>,
      width: "240px",
    },
    {
      key: "value",
      header: t(I18N_KEYS.preview.columns.value),
      cell: (r) => (
        <span className={styles.cellEnvValue}>
          <span className={styles.envValueText}>{r.value || "—"}</span>
        </span>
      ),
    },
    {
      key: "source",
      header: t(I18N_KEYS.preview.columns.source),
      cell: (r) => {
        const label =
          r.source === "tool" && r.sourceDetail
            ? `${t(I18N_KEYS.preview.source.tool)} · ${r.sourceDetail}`
            : t(I18N_KEYS.preview.source[r.source]);
        return <Badge variant={envSourceVariant(r.source)}>{label}</Badge>;
      },
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{t(I18N_KEYS.preview.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.preview.title)}</h1>
          <p className={styles.commandHint}>{t(I18N_KEYS.preview.commandHint)}</p>
          <p className={styles.hint}>{t(I18N_KEYS.preview.hint)}</p>
        </header>

        <div className={styles.toolbar}>
          <span className={styles.toolbarHint}>
            {outdated.data && outdated.data.length > 0
              ? t(I18N_KEYS.tools.outdatedBadge) + ` (${outdated.data.length})`
              : t(I18N_KEYS.tools.noOutdated)}
          </span>
          <button
            type="button"
            className={styles.refresh}
            onClick={onRefresh}
            disabled={tools.isPending || env.isPending || lockfile.isPending}
            data-testid="preview-refresh"
          >
            {t(I18N_KEYS.preview.refresh)}
          </button>
        </div>


        {/* ---------- Trust banner (issue #25) ---------- */}
        <TrustBanner
          ref={bannerRef}
          trust={trust}
          running={trustAction.running}
          lastResult={trustAction.lastResult}
          lastError={trustAction.lastError}
          onTrust={trustAction.run}
        />

        {/* ---------- Resolved tools ---------- */}
        <section className={styles.section} data-testid="preview-section-tools">
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>{t(I18N_KEYS.preview.eyebrow)}</span>
            <h2 className={styles.sectionTitle}>{t(I18N_KEYS.preview.sections.tools)}</h2>
          </header>
          {cwd === null && (
            <EmptyState
              title={t(I18N_KEYS.preview.empty.title)}
              body={t(I18N_KEYS.preview.empty.body)}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void onPickDirectory()}
                  data-testid="preview-choose-directory"
                >
                  {t(I18N_KEYS.preview.empty.action)}
                </Button>
              }
            />
          )}
          {cwd !== null && toolsError && (
            <div className={styles.errorState}>
              <div className={styles.errorLabel}>{t(I18N_KEYS.preview.toolsError.title)}</div>
              <p className={styles.errorBody}>{t(I18N_KEYS.preview.toolsError.body)}</p>
              {toolsError.stderr && (
                <pre className={styles.errorStderr}>{toolsError.stderr}</pre>
              )}
            </div>
          )}
          {cwd !== null && !toolsError && (
            <Table<ToolRow>
              columns={toolColumns}
              rows={toolRows}
              rowKey={(r) => r.id}
              empty={
                <EmptyState
                  title={t(I18N_KEYS.tools.empty.title)}
                  body={t(I18N_KEYS.tools.empty.body)}
                />
              }
            />
          )}
        </section>

        {/* ---------- Resolved env ---------- */}
        <section className={styles.section} data-testid="preview-section-env">
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>{t(I18N_KEYS.preview.eyebrow)}</span>
            <h2 className={styles.sectionTitle}>{t(I18N_KEYS.preview.sections.env)}</h2>
          </header>
          {envError && (
            <div className={styles.errorState}>
              <div className={styles.errorLabel}>{t(I18N_KEYS.preview.env.errorTitle)}</div>
              <p className={styles.errorBody}>{t(I18N_KEYS.preview.env.errorBody)}</p>
              {envError.stderr && (
                <pre className={styles.errorStderr}>{envError.stderr}</pre>
              )}
            </div>
          )}
          {!envError && (
            <Table<EnvRow>
              columns={envColumns}
              rows={envRows}
              rowKey={(r) => r.id}
              empty={
                <EmptyState
                  title={t(I18N_KEYS.preview.env.emptyTitle)}
                  body={t(I18N_KEYS.preview.env.emptyBody)}
                />
              }
            />
          )}
        </section>

        {/* ---------- Config files (issue #42) ---------- */}
        <ConfigFilesSection />

        {/* ---------- Lockfile ---------- */}
        <section className={styles.section} data-testid="preview-section-lockfile">
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>{t(I18N_KEYS.preview.lockfile.eyebrow)}</span>
            <h2 className={styles.sectionTitle}>{t(I18N_KEYS.preview.lockfile.title)}</h2>
          </header>
          {lockfileError && (
            <div className={styles.errorState}>
              <div className={styles.errorLabel}>{t(I18N_KEYS.preview.lockfile.errorTitle)}</div>
              <p className={styles.errorBody}>{t(I18N_KEYS.preview.lockfile.errorBody)}</p>
              {lockfileError.stderr && (
                <pre className={styles.errorStderr}>{lockfileError.stderr}</pre>
              )}
            </div>
          )}
          {!lockfileError && lockfileContent === null && (
            <div className={styles.lockfileMuted} data-testid="preview-lockfile-missing">
              {t(I18N_KEYS.preview.lockfile.missing)}
            </div>
          )}
          {!lockfileError && lockfileContent === "" && (
            <div className={styles.lockfileMuted} data-testid="preview-lockfile-empty">
              {t(I18N_KEYS.preview.lockfile.empty)}
            </div>
          )}
          {!lockfileError && lockfileContent !== null && lockfileContent !== "" && (
            <pre className={styles.lockfile} data-testid="preview-lockfile-content">
              {lockfileContent}
            </pre>
          )}
        </section>
      </div>
    </PageShell>
  );
}

// ---------- Config files (issue #42) ----------

/**
 * The config files mise loads for the active context, in the
 * precedence order `mise config ls --json` reports (highest first).
 * Each file's raw text is shown behind a read-only expand toggle.
 * Rendered in both Global (global config files) and directory
 * contexts — the runner keys the query off the directory context,
 * so switching contexts refetches.
 */
function ConfigFilesSection() {
  const { t } = useTranslation();
  const configFiles = useConfigFiles();

  const configError =
    configFiles.data && configFiles.data.kind === "err" ? configFiles.data.err : null;
  const files =
    configFiles.data && configFiles.data.kind === "ok" ? configFiles.data.files : null;

  return (
    <section className={styles.section} data-testid="preview-section-config">
      <header className={styles.sectionHead}>
        <span className={styles.sectionEyebrow}>{t(I18N_KEYS.preview.eyebrow)}</span>
        <h2 className={styles.sectionTitle}>{t(I18N_KEYS.preview.sections.config)}</h2>
        <p className={styles.configOrderNote}>{t(I18N_KEYS.preview.config.orderNote)}</p>
      </header>
      {configError && (
        <div className={styles.errorState}>
          <div className={styles.errorLabel}>{t(I18N_KEYS.preview.config.errorTitle)}</div>
          <p className={styles.errorBody}>{t(I18N_KEYS.preview.config.errorBody)}</p>
          {configError.stderr && (
            <pre className={styles.errorStderr}>{configError.stderr}</pre>
          )}
        </div>
      )}
      {!configError && configFiles.isPending && (
        <div className={styles.lockfileMuted} data-testid="preview-config-loading">
          {t(I18N_KEYS.common.loading)}
        </div>
      )}
      {!configError && files !== null && files.length === 0 && (
        <div className={styles.lockfileMuted} data-testid="preview-config-empty">
          {t(I18N_KEYS.preview.config.empty)}
        </div>
      )}
      {!configError && files !== null && files.length > 0 && (
        <ol className={styles.configList}>
          {files.map((file, index) => (
            <ConfigFileRow key={file.path} file={file} rank={index + 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** One loaded config file: rank, path, pinned tools, and an
 *  expandable read-only content view. */
function ConfigFileRow({ file, rank }: { file: ConfigFile; rank: number }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <li className={styles.configFile} data-testid="preview-config-file">
      <div className={styles.configFileHead}>
        <span className={styles.configRank}>{rank}</span>
        <span className={styles.configPath}>{file.path}</span>
        {file.tools.length > 0 && (
          <span className={styles.configTools}>{file.tools.join(", ")}</span>
        )}
        <button
          type="button"
          className={styles.refresh}
          onClick={() => setExpanded((v) => !v)}
          data-testid="preview-config-toggle"
        >
          {expanded ? t(I18N_KEYS.preview.config.hide) : t(I18N_KEYS.preview.config.view)}
        </button>
      </div>
      {expanded &&
        (file.content !== null ? (
          <pre className={styles.lockfile} data-testid="preview-config-content">
            {file.content}
          </pre>
        ) : (
          <div className={styles.lockfileMuted} data-testid="preview-config-unreadable">
            {t(I18N_KEYS.preview.config.unreadable)}
          </div>
        ))}
    </li>
  );
}

function PreviewLoading() {
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

// ---------- Trust banner (issue #25) ----------

interface TrustBannerProps {
  trust: ReturnType<typeof useTrust>["state"];
  running: boolean;
  lastResult: "ok" | "error" | null;
  lastError: string | null;
  onTrust: () => void;
}

/**
 * The trust gate. Renders nothing in every state except
 * `untrusted`, so it is safe to drop into the page unconditionally.
 * The one-click `Trust` action routes through the execution panel
 * (so the `mise trust` attempt is visible alongside any other
 * panel activity), and on success the trust query invalidates
 * itself and the banner disappears.
 *
 * `ref` is forwarded so future mutating actions can scroll the
 * user to the banner instead of running.
 */
const TrustBanner = forwardRef<HTMLDivElement, TrustBannerProps>(function TrustBanner(
  { trust, running, lastResult, lastError, onTrust },
  ref,
) {
  const { t } = useTranslation();
  if (trust.kind !== "untrusted") return null;
  return (
    <div ref={ref} data-testid="preview-trust-banner">
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
            data-testid="preview-trust-button"
          >
            {running
              ? t(I18N_KEYS.trust.busy)
              : t(I18N_KEYS.trust.banner.action)}
          </Button>
        }
      >
        {t(I18N_KEYS.trust.banner.body)}
        {trust.path ? (
          <span className={styles.trustPath}> · {trust.path}</span>
        ) : null}
      </Banner>
      {lastResult === "ok" && (
        <div className={styles.trustNote} data-testid="preview-trust-ok">
          {t(I18N_KEYS.trust.ok)}
        </div>
      )}
      {lastResult === "error" && (
        <div className={styles.trustNote} data-testid="preview-trust-error">
          {t(I18N_KEYS.trust.error)}
          {lastError ? <> · {lastError}</> : null}
        </div>
      )}
    </div>
  );
});
