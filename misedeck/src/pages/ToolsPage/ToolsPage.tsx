// ToolsPage — the read-only global tools list (issue #21).
//
//   * mise ls --json         → table rows (tool, version, requested,
//                              backend, source, latest, actions)
//   * mise outdated --json   → outdated badges on the rows that
//                              appear in the map
//   * mise ls-remote --json  → upstream versions for the kebab menu
//                              (wired in #22 mutations; for now the
//                              action column renders a disabled
//                              kebab so the column header is reserved)
//
// The page is read-only; the architecture-doc principle
// (ADR-0004: faithful GUI over mise's command surface) keeps the
// mutation surface in the execution panel. The page reuses the
// `ExecutionPanel` so any future "view logs" action lands without a
// new panel.

import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { detectMise, isAppError } from "../../api/mise";
import {
  useParsedOutdatedTools,
  useParsedToolsList,
} from "../../hooks/useToolsList";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  EmptyState,
  IconButton,
  MiseMissingState,
  PageShell,
  Table,
  type TableColumn,
} from "../../components";

import styles from "./ToolsPage.module.css";

interface ToolRow {
  tool: string;
  version: string;
  requested: string;
  backend: string;
  source: string;
  /** True when this row appears in the outdated map. */
  outdated: boolean;
  /** The latest version from the outdated map (empty when up to date). */
  latest: string;
  /** Stable key. */
  id: string;
}

export function ToolsPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();

  // First check: is mise even available? If not, render the missing
  // state and don't even try the tools queries.
  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const tools = useParsedToolsList();
  const outdated = useParsedOutdatedTools();

  const onRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tools", "ls", cwd] });
    void queryClient.invalidateQueries({ queryKey: ["tools", "outdated", cwd] });
  };

  const rows = useMemo<ToolRow[]>(() => {
    if (!tools.data) return [];
    const outdatedByTool = new Map<string, { latest: string }>();
    for (const item of outdated.data ?? []) {
      if (item.latest) outdatedByTool.set(item.name, { latest: item.latest });
    }
    const out: ToolRow[] = [];
    for (const { tool, items } of tools.data) {
      // Pick the active version when there is one; otherwise the
      // most recent installed version. mise orders its items with
      // the active row first when there is one.
      const active = items.find((it) => it.active) ?? items[0];
      if (!active) continue;
      const outdatedEntry = outdatedByTool.get(tool);
      out.push({
        id: `${tool}@${active.version}`,
        tool,
        version: active.version,
        requested: active.requestedVersion ?? "—",
        backend: "core",
        source: active.source?.path ?? (active.source?.type ?? "—"),
        outdated: outdatedEntry !== undefined,
        latest: outdatedEntry?.latest ?? "",
      });
    }
    return out;
  }, [tools.data, outdated.data]);

  // Mise-missing state.
  if (detect.isPending) {
    return <ToolsLoading />;
  }
  const detectValue = detect.data;
  if (detectValue && detectValue.kind === "err" && isAppError(detectValue.err)) {
    if (detectValue.err.code === "MISE_NOT_FOUND" || detectValue.err.code === "MISE_TOO_OLD") {
      return (
        <PageShell>
          <div className={styles.page}>
            <MiseMissingState />
          </div>
        </PageShell>
      );
    }
  }

  // Tools-error state (mise is up but the read failed).
  const toolsError = tools.error?.kind === "err" ? tools.error.err : null;

  const columns: TableColumn<ToolRow>[] = [
    {
      key: "tool",
      header: t(I18N_KEYS.tools.columns.tool),
      cell: (r) => (
        <span className={styles.cellTool}>
          <span className={styles.toolName}>{r.tool}</span>
        </span>
      ),
    },
    {
      key: "version",
      header: t(I18N_KEYS.tools.columns.version),
      cell: (r) => (
        <span
          className={r.outdated ? styles.cellVersionOutdated : styles.cellVersion}
        >
          {r.version}
        </span>
      ),
    },
    {
      key: "requested",
      header: t(I18N_KEYS.tools.columns.requested),
      cell: (r) => <span className={styles.cellRequested}>{r.requested}</span>,
    },
    {
      key: "backend",
      header: t(I18N_KEYS.tools.columns.backend),
      cell: (r) => <Badge variant="info">{r.backend}</Badge>,
    },
    {
      key: "source",
      header: t(I18N_KEYS.tools.columns.source),
      cell: (r) => <span className={styles.cellSource}>{r.source}</span>,
    },
    {
      key: "latest",
      header: t(I18N_KEYS.tools.columns.latest),
      cell: (r) =>
        r.outdated ? (
          <span className={styles.cellLatest}>
            <span className={styles.arrow} aria-hidden="true">▹</span>
            <span className={styles.latestValue}>{r.latest}</span>
            <Badge variant="warning">{t(I18N_KEYS.tools.outdatedBadge)}</Badge>
          </span>
        ) : (
          <span className={styles.dim}>—</span>
        ),
    },
    {
      key: "actions",
      header: t(I18N_KEYS.tools.columns.actions),
      cell: () => (
        <span className={styles.cellActions}>
          <IconButton
            aria-label="menu"
            variant="ghost"
            size="sm"
            disabled
            data-testid="tools-row-kebab"
          >
            ⋯
          </IconButton>
        </span>
      ),
    },
  ];

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{t(I18N_KEYS.tools.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.tools.title)}</h1>
          <p className={styles.hint}>{t(I18N_KEYS.tools.hint)}</p>
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
            disabled={tools.isPending || outdated.isPending}
            data-testid="tools-refresh"
          >
            {t(I18N_KEYS.tools.refresh)}
          </button>
        </div>

        <div className={styles.signalLine} aria-hidden="true" />

        {toolsError && (
          <div className={styles.errorState}>
            <div className={styles.errorLabel}>{t(I18N_KEYS.tools.error.title)}</div>
            <p className={styles.errorBody}>{t(I18N_KEYS.tools.error.body)}</p>
            {toolsError.stderr && (
              <pre className={styles.errorStderr}>{toolsError.stderr}</pre>
            )}
          </div>
        )}

        {!toolsError && (
          <Table<ToolRow>
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                eyebrow={t(I18N_KEYS.tools.eyebrow)}
                title={t(I18N_KEYS.tools.empty.title)}
                body={t(I18N_KEYS.tools.empty.body)}
              />
            }
          />
        )}
      </div>
    </PageShell>
  );
}

function ToolsLoading() {
  const { t } = useTranslation();
  return (
    <PageShell>
      <div className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.loadingLabel}>{t(I18N_KEYS.common.loading)}</span>
        </div>
      </div>
    </PageShell>
  );
}
