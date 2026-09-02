// DoctorPage — `mise doctor --json` rendered as a health page (issue
// #29). If the mise binary does not support `--json`, the runner
// captures the raw text and the page tints each line by status.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

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
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{t(I18N_KEYS.doctor.summary.status)}</span>
          <Badge
            variant={status.variant}
            leading={<span className={styles.statusDot} data-tone={status.dotTone} />}
          >
            {t(status.labelKey)}
          </Badge>
        </div>
        {data.version && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t(I18N_KEYS.labels.version)}</span>
            <span className={styles.summaryValue} title={data.version}>{data.version}</span>
          </div>
        )}
        {data.shell?.name && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t(I18N_KEYS.doctor.summary.shell)}</span>
            <span
              className={styles.summaryValue}
              title={`${data.shell.name} ${data.shell.version ?? ""}`.trim()}
            >
              {data.shell.name} {data.shell.version}
            </span>
          </div>
        )}
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{t(I18N_KEYS.doctor.summary.activated)}</span>
          <Badge variant={data.activated ? "success" : "warning"}>
            {data.activated ? t(I18N_KEYS.common.ok) : t(I18N_KEYS.doctor.summary.notActivated)}
          </Badge>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{t(I18N_KEYS.doctor.summary.shims)}</span>
          <Badge variant={data.shimsOnPath ? "success" : "warning"}>
            {data.shimsOnPath ? t(I18N_KEYS.common.ok) : t(I18N_KEYS.doctor.summary.notActivated)}
          </Badge>
        </div>
        {data.selfUpdateAvailable !== undefined && (
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{t(I18N_KEYS.doctor.summary.update)}</span>
            <Badge variant={data.selfUpdateAvailable ? "warning" : "success"}>
              {data.selfUpdateAvailable
                ? t(I18N_KEYS.doctor.summary.updateAvailable)
                : t(I18N_KEYS.doctor.summary.upToDate)}
            </Badge>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <span className={styles.sectionEyebrow}>{t(I18N_KEYS.doctor.eyebrow)}</span>
          <h2 className={styles.sectionTitle}>{t(I18N_KEYS.doctor.warnings.title)}</h2>
        </header>
        {warnings.length === 0 ? (
          <div className={styles.muted}>{t(I18N_KEYS.doctor.warnings.none)}</div>
        ) : (
          <ul className={styles.warningList}>
            {warnings.map((w, i) => (
              <li key={i} className={styles.warningItem}>
                <span className={styles.warningDot} aria-hidden="true" />
                <span className={styles.warningText}>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
              eyebrow={t(I18N_KEYS.doctor.eyebrow)}
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
