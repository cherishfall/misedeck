// DoctorPage — `mise doctor --json` rendered as a health page (issue
// #29). If the mise binary does not support `--json`, the runner
// captures the raw text and the page tints each line by status.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMemo, useState, type ReactNode } from "react";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { detectMise, isAppError } from "../../api/mise";
import {
  Badge,
  EmptyState,
  PageShell,
  Table,
  type TableColumn,
} from "../../components";
import { useParsedDoctor } from "../../hooks/useIssue29";
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
              title={t(I18N_KEYS.tools.missing.title)}
              body={t(I18N_KEYS.tools.missing.body)}
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
          <div className={styles.eyebrow}>{t(I18N_KEYS.doctor.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.doctor.title)}</h1>
          <p className={styles.commandHint}>{t(I18N_KEYS.doctor.commandHint)}</p>
          <p className={styles.hint}>{t(I18N_KEYS.doctor.hint)}</p>
        </header>

        <div className={styles.toolbar}>
          <span className={styles.toolbarHint}>
            {doctor.data ? t(I18N_KEYS.doctor.statusLabel) : t(I18N_KEYS.common.loading)}
          </span>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["doctor", cwd] })}
            disabled={doctor.isPending}
            data-testid="doctor-refresh"
          >
            {t(I18N_KEYS.common.refresh)}
          </button>
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
  if (data.rawLines && data.rawLines.length > 0) {
    return (
      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>{t(I18N_KEYS.doctor.eyebrow)}</span>
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
  let updateWarningText: string | null = null;
  for (const w of warnings) {
    if (parseUpgradePath([w])) {
      updateWarningText = w;
      break;
    }
  }
  const upgrade = updateWarningText ? parseUpgradePath([updateWarningText]) ?? null : null;
  const otherWarnings = updateWarningText
    ? warnings.filter((w) => w !== updateWarningText)
    : warnings;
  const status = doctorStatus(data);

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

  const toolsetColumns: TableColumn<ToolsetRow>[] = [
    {
      key: "tool",
      header: t(I18N_KEYS.doctor.columns.tool),
      cell: (r) => <span className={styles.cellTool} title={r.tool}>{r.tool}</span>,
    },
    {
      key: "version",
      header: t(I18N_KEYS.doctor.columns.version),
      cell: (r) => <span className={styles.cellVersion} title={r.version}>{r.version}</span>,
    },
  ];

  return (
    <>
      <section className={styles.summary}>
        <StatusRow label={t(I18N_KEYS.doctor.summary.status)}>
          <Badge
            variant={status.variant}
            leading={<span className={styles.statusDot} data-tone={status.dotTone} />}
          >
            {t(status.labelKey)}
          </Badge>
        </StatusRow>
        {data.version && (
          <StatusRow label={t(I18N_KEYS.labels.version)}>
            <span className={styles.statusValueText} title={data.version}>{data.version}</span>
          </StatusRow>
        )}
        {data.shell?.name && (
          <StatusRow label={t(I18N_KEYS.doctor.summary.shell)}>
            <span
              className={styles.statusValueText}
              title={`${data.shell.name} ${data.shell.version ?? ""}`.trim()}
            >
              {data.shell.name} {data.shell.version}
            </span>
          </StatusRow>
        )}
        <StatusRow label={t(I18N_KEYS.doctor.summary.activated)}>
          <Badge variant={data.activated ? "success" : "warning"}>
            {data.activated ? t(I18N_KEYS.common.ok) : t(I18N_KEYS.doctor.summary.notActivated)}
          </Badge>
        </StatusRow>
        <StatusRow label={t(I18N_KEYS.doctor.summary.shims)}>
          <Badge variant={data.shimsOnPath ? "success" : "warning"}>
            {data.shimsOnPath ? t(I18N_KEYS.common.ok) : t(I18N_KEYS.doctor.summary.notActivated)}
          </Badge>
        </StatusRow>
      </section>

      {upgrade && (
        <UpgradeNotice current={upgrade.current} latest={upgrade.latest} t={t} />
      )}

      {otherWarnings.length > 0 && (
        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <span className={styles.sectionEyebrow}>{t(I18N_KEYS.doctor.eyebrow)}</span>
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
          <span className={styles.sectionEyebrow}>{t(I18N_KEYS.doctor.eyebrow)}</span>
          <h2 className={styles.sectionTitle}>{t(I18N_KEYS.doctor.configFiles.title)}</h2>
        </header>
        {(data.configFiles ?? []).length === 0 ? (
          <div className={styles.muted}>{t(I18N_KEYS.doctor.configFiles.none)}</div>
        ) : (
          <ul className={styles.fileList}>
            {(data.configFiles ?? []).map((path, i) => (
              <li key={i} className={styles.fileItem} title={path}>{path}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>{t(I18N_KEYS.doctor.eyebrow)}</span>
          <h2 className={styles.sectionTitle}>{t(I18N_KEYS.doctor.toolset.title)}</h2>
        </header>
        <Table<ToolsetRow>
          columns={toolsetColumns}
          rows={toolsetRows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              title={t(I18N_KEYS.doctor.toolset.emptyTitle)}
              body={t(I18N_KEYS.doctor.toolset.emptyBody)}
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

function doctorStatus(data: DoctorPayload): {
  variant: "success" | "warning" | "danger";
  dotTone: "beam" | "flare" | "breach";
  labelKey: string;
} {
  if (data.rawLines && data.rawLines.some((l) => l.status === "error")) {
    return { variant: "danger", dotTone: "breach", labelKey: I18N_KEYS.doctor.status.error };
  }
  if (data.rawLines && data.rawLines.some((l) => l.status === "warn")) {
    return { variant: "warning", dotTone: "flare", labelKey: I18N_KEYS.doctor.status.warn };
  }
  const warnings = data.warnings ?? [];
  if (warnings.length > 0 || data.activated === false || data.shimsOnPath === false) {
    return { variant: "warning", dotTone: "flare", labelKey: I18N_KEYS.doctor.status.warn };
  }
  return { variant: "success", dotTone: "beam", labelKey: I18N_KEYS.doctor.status.ok };
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** A single `label: value` health row. The badge (or value) sits
 *  immediately after the label so its ownership is never ambiguous. */
function StatusRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.statusRow}>
      <span className={styles.statusLabel}>{label}</span>
      <span className={styles.statusSep}>:</span>
      <span className={styles.statusValue}>{children}</span>
    </div>
  );
}

/** Extract the `current ▹ latest` pair from a mise self-update warning.
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
 *  action outlet for `mise self-update` (issue #59). */
function UpgradeNotice({
  current,
  latest,
  t,
}: {
  current: string;
  latest: string;
  t: TFn;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const command = "mise self-update";
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        const ta = document.createElement("textarea");
        ta.value = command;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — leave the affordance inert */
    }
  };

  return (
    <section className={styles.upgrade} aria-label={t(I18N_KEYS.doctor.updateNotice.title)}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionEyebrow}>{t(I18N_KEYS.doctor.eyebrow)}</span>
        <h2 className={styles.upgradeTitle}>{t(I18N_KEYS.doctor.updateNotice.title)}</h2>
      </header>
      <p className={styles.upgradeFraming}>{t(I18N_KEYS.doctor.updateNotice.framing)}</p>
      <div className={styles.upgradePath}>
        <span className={styles.upgradeCurrent} title={current}>{current}</span>
        <span className={styles.upgradeArrow} aria-hidden="true">▹</span>
        <span className={styles.upgradeLatest} title={latest}>{latest}</span>
      </div>
      <button
        type="button"
        className={styles.upgradeAction}
        onClick={() => void onCopy()}
        data-testid="doctor-self-update-copy"
      >
        {copied
          ? t(I18N_KEYS.doctor.updateNotice.copied)
          : t(I18N_KEYS.doctor.updateNotice.copy)}
      </button>
    </section>
  );
}

function DoctorLoading() {
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
