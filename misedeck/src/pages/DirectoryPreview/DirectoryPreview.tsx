// DirectoryPreview — the read-only directory resolved-state view (issue #24).
//
//   * mise -C <dir> ls --json   → resolved tools (reuses #21's runner
//                                 hook; the `cwd` arg drives `-C`)
//   * mise -C <dir> env --json  → resolved env vars, each row badged
//                                 with GLOBAL / PROJECT / TOOL / DEFAULT
//   * <dir>/mise.lock           → read-only pre block when present;
//                                 a muted "missing" line when not
//
// The page consumes the same Table / Badge / EmptyState / PageShell
// primitives the tools page (#21) uses. The directory context comes
// from `useDirectory()`; when no directory is picked, the page
// renders a single "Pick a directory" empty state and never
// invokes the runner. Switching back to Global re-uses the global
// tools page at /tools — the directory preview is meaningful only
// when a project is selected.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { detectMise, isAppError } from "../../api/mise";
import { reconcileEnvSources, type EnvSource } from "../../api/miseTools";
import {
  useParsedEnv,
  useParsedGlobalEnv,
  useParsedOutdatedTools,
  useParsedToolsList,
  useLockfile,
} from "../../hooks/useToolsList";
import {
  Badge,
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
  /** "GLOBAL" or "THIS PROJECT" — derived from `source.path`. */
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
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();

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
  // is unique to the project is correctly marked as `project`.
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
    void queryClient.invalidateQueries({ queryKey: ["tools", "env", null] });
  };

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

  // No directory picked — show the "Pick a directory" empty state.
  if (cwd === null) {
    return (
      <PageShell>
        <div className={styles.page}>
          <header className={styles.head}>
            <div className={styles.eyebrow}>{t(I18N_KEYS.preview.eyebrow)}</div>
            <h1 className={styles.title}>{t(I18N_KEYS.preview.title)}</h1>
            <p className={styles.hint}>{t(I18N_KEYS.preview.hint)}</p>
          </header>
          <div className={styles.signalLine} aria-hidden="true" />
          <EmptyState
            eyebrow={t(I18N_KEYS.preview.eyebrow)}
            title={t(I18N_KEYS.preview.empty.title)}
            body={t(I18N_KEYS.preview.empty.body)}
          />
        </div>
      </PageShell>
    );
  }

  // The page is meaningful only when a directory is picked.
  const toolsError = tools.error?.kind === "err" ? tools.error.err : null;
  const envError = env.error?.kind === "err" ? env.error.err : null;
  const lockfileError =
    lockfile.data && lockfile.data.kind === "err" ? lockfile.data.err : null;
  const lockfileContent =
    lockfile.data && lockfile.data.kind === "ok" ? lockfile.data.content : undefined;

  // Tool rows: pick the active version per tool, badge by source.
  const toolRows: ToolRow[] = useMemo(() => {
    if (!tools.data) return [];
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
          <p className={styles.hint}>{t(I18N_KEYS.preview.hint)}</p>
          <div className={styles.contextPath} data-testid="preview-cwd">
            {cwd}
          </div>
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

        <div className={styles.signalLine} aria-hidden="true" />

        {/* ---------- Resolved tools ---------- */}
        <section className={styles.section} data-testid="preview-section-tools">
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>{t(I18N_KEYS.preview.eyebrow)}</span>
            <h2 className={styles.sectionTitle}>{t(I18N_KEYS.preview.sections.tools)}</h2>
          </header>
          {toolsError && (
            <div className={styles.errorState}>
              <div className={styles.errorLabel}>{t(I18N_KEYS.preview.toolsError.title)}</div>
              <p className={styles.errorBody}>{t(I18N_KEYS.preview.toolsError.body)}</p>
              {toolsError.stderr && (
                <pre className={styles.errorStderr}>{toolsError.stderr}</pre>
              )}
            </div>
          )}
          {!toolsError && (
            <Table<ToolRow>
              columns={toolColumns}
              rows={toolRows}
              rowKey={(r) => r.id}
              empty={
                <EmptyState
                  eyebrow={t(I18N_KEYS.preview.eyebrow)}
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
                  eyebrow={t(I18N_KEYS.preview.eyebrow)}
                  title={t(I18N_KEYS.preview.env.emptyTitle)}
                  body={t(I18N_KEYS.preview.env.emptyBody)}
                />
              }
            />
          )}
        </section>

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
