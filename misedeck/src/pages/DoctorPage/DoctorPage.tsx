// DoctorPage — `mise doctor --json` rendered as a health page (issue
// #29). If the mise binary does not support `--json`, the runner
// captures the raw text and the page tints each line by status.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { detectMise, isAppError } from "../../api/mise";
import {
  Badge,
  Button,
  CommandHint,
  CopyButton,
  EmptyState,
  PageShell,
  ProgressDot,
  QueryHint,
  Table,
  type TableColumn,
  Tooltip,
  useRegisterPageRefresh,
} from "../../components";
import { useParsedDoctor } from "../../hooks/useIssue29";
import { useActivation } from "../../state/activationContext";
import type { DoctorLine, DoctorPayload } from "../../types/tauri";

import styles from "./DoctorPage.module.css";

interface ToolsetRow {
  tool: string;
  version: string;
  id: string;
}

export function DoctorPage() {
  const { t } = useTranslation();
  const { cwd } = useDirectory();
  const queryClient = useQueryClient();

  const detect = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const doctor = useParsedDoctor();

  // Top-toolbar refresh (issue #98): invalidate this page's query.
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["doctor", cwd] });
  }, [queryClient, cwd]);
  useRegisterPageRefresh(onRefresh);

  if (detect.isPending) {
    return <DoctorLoading />;
  }
  const detectValue = detect.data;
  if (detectValue && detectValue.kind === "err" && isAppError(detectValue.err)) {
    if (detectValue.err.code === "MISE_NOT_FOUND" || detectValue.err.code === "MISE_TOO_OLD") {
      return (
        <PageShell>
          <div className={styles.page}>
            <EmptyState
              eyebrow={t(I18N_KEYS.states.notInstalled.title)}
              title={t(I18N_KEYS.doctor.missing.title)}
              body={t(I18N_KEYS.doctor.missing.body)}
            />
          </div>
        </PageShell>
      );
    }
  }

  const doctorError = doctor.error?.kind === "err" ? doctor.error.err : null;

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{t(I18N_KEYS.doctor.title)}</h1>
          <CommandHint>{t(I18N_KEYS.doctor.commandHint)}</CommandHint>
          <p className={styles.hint}>{t(I18N_KEYS.doctor.hint)}</p>
        </header>

        <div className={styles.toolbar}>
          {/* Four-state dispatch (issues #199/#204), same as the
              Tasks/Settings hints: a failed read renders failure + retry
              in the hint itself, never a fake loading. */}
          <QueryHint
            status={
              doctor.isPending ? "loading" : doctorError ? "error" : "ok"
            }
            text={t(I18N_KEYS.doctor.statusLabel)}
            onRetry={onRefresh}
          />
        </div>


        {doctorError && (
          <div className={styles.errorState} data-testid="doctor-read-error">
            <div className={styles.errorLabel}>{t(I18N_KEYS.doctor.error.title)}</div>
            <p className={styles.errorBody}>{t(I18N_KEYS.doctor.error.body)}</p>
            {doctorError.stderr && (
              <pre className={styles.errorStderr}>{doctorError.stderr}</pre>
            )}
          </div>
        )}

        {!doctorError && doctor.data && (
          <DoctorContent data={doctor.data} t={t} />
        )}
      </div>
    </PageShell>
  );
}

function DoctorContent({
  data,
  t,
}: {
  data: DoctorPayload;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const { cwd } = useDirectory();
  // The activation row answers "did I activate mise in my shell?" — that
  // is the rc-file probe (`shell_activation_check`, issue #28), not
  // `mise doctor`'s own `activated` field, which describes the GUI
  // subprocess environment and is necessarily false here (issue #92).
  // The probe is tri-state (issue #166): `null` means it could not
  // run (unknown shell family) — rendered as "—" below and excluded
  // from the page-level Warn derivation, never reported as a false
  // "not activated".
  const activation = useActivation();
  const rcActivated: boolean | null =
    activation.state.kind === "ok" ? activation.state.status.activated : null;

  // Hooks stay unconditional (rules of hooks): this memo must run before
  // the raw-text early return below, not after it.
  const toolsetRows: ToolsetRow[] = useMemo(() => {
    const toolset = data.toolset ?? {};
    const out: ToolsetRow[] = [];
    for (const [tool, items] of Object.entries(toolset)) {
      if (!Array.isArray(items)) continue;
      const first = items[0];
      if (first && typeof first === "object" && "version" in first) {
        out.push({ id: `${tool}-${String(first.version)}`, tool, version: String(first.version) });
      }
    }
    out.sort((a, b) => a.tool.localeCompare(b.tool));
    return out;
  }, [data.toolset]);

  if (data.rawLines && data.rawLines.length > 0) {
    return (
      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t(I18N_KEYS.doctor.rawTitle)}</h2>
        </header>
        <div className={styles.rawLines}>
          {data.rawLines.map((line, i) => (
            <DoctorRawLine key={i} line={line} />
          ))}
        </div>
      </section>
    );
  }

  const warnings = data.warnings ?? [];
  // Pull the mise-self-update notice out of the raw warnings and re-render
  // it as a localized upgrade path. The remaining warnings (if any) keep
  // their own list below. This keeps English CLI prose out of a zh-CN UI.
  // Each warning is parsed at most once, and the winner is excluded from
  // the remaining list by index — two warnings with identical text must
  // not be filtered out together.
  let updateWarningIndex = -1;
  let upgrade: { current: string; latest: string } | null = null;
  for (const [i, w] of warnings.entries()) {
    const parsed = parseUpgradePath([w]);
    if (parsed) {
      updateWarningIndex = i;
      upgrade = parsed;
      break;
    }
  }
  const otherWarnings =
    updateWarningIndex !== -1
      ? warnings.filter((_, i) => i !== updateWarningIndex)
      : warnings;
  const status = doctorStatus(data, rcActivated);

  const toolsetColumns: TableColumn<ToolsetRow>[] = [
    {
      key: "tool",
      header: t(I18N_KEYS.doctor.columns.tool),
      sortValue: (r) => r.tool,
      cell: (r) => <Tooltip text={r.tool}><span className={styles.cellTool}>{r.tool}</span></Tooltip>,
    },
    {
      key: "version",
      header: t(I18N_KEYS.doctor.columns.version),
      sortValue: (r) => r.version,
      sortVersion: true,
      cell: (r) => <Tooltip text={r.version}><span className={styles.cellVersion}>{r.version}</span></Tooltip>,
    },
  ];

  return (
    <>
      <section className={styles.summary}>
        <StatusRow label={t(I18N_KEYS.doctor.summary.status)} t={t}>
          <Badge
            variant={status.variant}
            size="inline"
            leading={<span className={styles.statusDot} data-tone={status.dotTone} />}
          >
            {t(status.labelKey)}
          </Badge>
        </StatusRow>
        {data.version && (
          <StatusRow label={t(I18N_KEYS.labels.version)} t={t}>
            <Tooltip text={data.version}><span className={styles.statusValueText}>{data.version}</span></Tooltip>
          </StatusRow>
        )}
        {data.shell?.name && (
          <StatusRow label={t(I18N_KEYS.doctor.summary.shell)} t={t}>
            <Tooltip text={`${data.shell.name} ${data.shell.version ?? ""}`.trim()}>
              <span className={styles.statusValueText}>
                {data.shell.name} {data.shell.version ?? ""}
              </span>
            </Tooltip>
          </StatusRow>
        )}
        <StatusRow label={t(I18N_KEYS.doctor.summary.activated)} t={t}>
          {rcActivated === null ? (
            <span className={styles.muted}>—</span>
          ) : (
            <Badge variant={rcActivated ? "success" : "warning"} size="inline">
              {rcActivated ? t(I18N_KEYS.doctor.summary.activatedValue) : t(I18N_KEYS.doctor.summary.notActivated)}
            </Badge>
          )}
        </StatusRow>
      </section>

      {upgrade && (
        <UpgradeNotice current={upgrade.current} latest={upgrade.latest} t={t} />
      )}

      {otherWarnings.length > 0 && (
        <section className={styles.section}>
          <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{t(I18N_KEYS.doctor.warnings.title)}</h2>
          </header>
          <ul className={styles.warningList}>
            {otherWarnings.map((w, i) => (
              <li key={i} className={styles.warningItem}>
                <span className={styles.warningDot} aria-hidden="true" />
                <span className={styles.warningText}>{w}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t(I18N_KEYS.doctor.configFiles.title)}</h2>
        </header>
        {(data.configFiles ?? []).length === 0 ? (
          <div className={styles.muted}>{t(I18N_KEYS.doctor.configFiles.none)}</div>
        ) : (
          <ul className={styles.fileList}>
            {(data.configFiles ?? []).map((path, i) => (
              <li key={i} className={styles.fileItem}><Tooltip text={path}>{path}</Tooltip></li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t(I18N_KEYS.doctor.toolset.title)}</h2>
        </header>
        <Table<ToolsetRow>
          columns={toolsetColumns}
          rows={toolsetRows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              title={t(I18N_KEYS.doctor.toolset.emptyTitle)}
              body={t(
                cwd === null
                  ? I18N_KEYS.doctor.toolset.emptyBodyGlobal
                  : I18N_KEYS.doctor.toolset.emptyBodyDirectory,
              )}
            />
          }
        />
      </section>
    </>
  );
}

function DoctorRawLine({ line }: { line: DoctorLine }) {
  return (
    <div className={`${styles.rawLine} ${styles[`rawLine-${line.status}`]}`}>
      <span className={styles.rawStatus}>{line.status}</span>
      <span className={styles.rawText}>{line.text}</span>
    </div>
  );
}

function doctorStatus(
  data: DoctorPayload,
  rcActivated: boolean | null,
): {
  variant: "success" | "warning";
  dotTone: "beam" | "flare";
  labelKey: string;
} {
  // Note: the raw-text fallback (`data.rawLines`) early-returns its own
  // view in DoctorContent above, so those lines never reach this
  // derivation — only the structured JSON payload does.
  const warnings = data.warnings ?? [];
  if (warnings.length > 0 || rcActivated === false) {
    return { variant: "warning", dotTone: "flare", labelKey: I18N_KEYS.doctor.status.warn };
  }
  return { variant: "success", dotTone: "beam", labelKey: I18N_KEYS.doctor.status.ok };
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** A single `label: value` health row. The badge (or value) sits
 *  immediately after the label so its ownership is never ambiguous.
 *  The colon is locale-owned via `doctor.summary.labelWithColon`
 *  (ASCII `: ` in en, fullwidth `：` in zh — same precedent as
 *  `theme.switcherCurrent`); the row's flex gap separates "label:"
 *  from the value. */
function StatusRow({
  label,
  t,
  children,
}: {
  label: string;
  t: TFn;
  children: ReactNode;
}) {
  return (
    <div className={styles.statusRow}>
      <span className={styles.statusLabel}>
        {t(I18N_KEYS.doctor.summary.labelWithColon, { label })}
      </span>
      <span className={styles.statusValue}>{children}</span>
    </div>
  );
}

/** Extract the `current → latest` pair from a mise self-update warning.
 *  Matches `… version <latest> available … currently on <current> …`. */
function parseUpgradePath(warnings: string[]): { current: string; latest: string } | null {
  for (const w of warnings) {
    const exact = w.match(/version\s+(\d[\w.]*)\s+available[^\n,]*?currently on\s+(\d[\w.]*)/i);
    if (exact && exact[1] && exact[2]) return { latest: exact[1], current: exact[2] };
    const alt = w.match(/currently on\s+(\d[\w.]*)[^\n,]*?version\s+(\d[\w.]*)\s+available/i);
    if (alt && alt[1] && alt[2]) return { current: alt[1], latest: alt[2] };
  }
  return null;
}

/** The self-update notice: a localized upgrade path with a copy
 *  action outlet for `mise self-update` (issue #59). The copy
 *  affordance is the shared CopyButton (issue #107) — no bespoke
 *  button. */
function UpgradeNotice({
  current,
  latest,
  t,
}: {
  current: string;
  latest: string;
  t: TFn;
}) {
  const navigate = useNavigate();

  return (
    <section className={styles.upgrade} aria-label={t(I18N_KEYS.doctor.updateNotice.title)}>
      <header className={styles.sectionHead}>
        <h2 className={styles.upgradeTitle}>{t(I18N_KEYS.doctor.updateNotice.title)}</h2>
      </header>
      <p className={styles.upgradeFraming}>{t(I18N_KEYS.doctor.updateNotice.framing)}</p>
      <div className={styles.upgradePath}>
        <Tooltip text={current}><span className={styles.upgradeCurrent}>{current}</span></Tooltip>
        <span className="upgrade-arrow" aria-hidden="true">→</span>
        <Tooltip text={latest}><span className={styles.upgradeLatest}>{latest}</span></Tooltip>
      </div>
      <CopyButton text="mise self-update" className={styles.upgradeCopy} />
      {/* Close the loop (issue #112): HomePage owns the one-click
          `mise self-update`; this ghost link points there. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/")}
        data-testid="doctor-update-on-home"
      >
        {t(I18N_KEYS.doctor.updateNotice.updateOnHome)}
      </Button>
    </section>
  );
}

function DoctorLoading() {
  const { t } = useTranslation();
  return (
    <PageShell>
      <div className={styles.page}>
        <div className={styles.loading}>
          <ProgressDot tone="dim" />
          <span>{t(I18N_KEYS.common.loading)}</span>
        </div>
      </div>
    </PageShell>
  );
}
