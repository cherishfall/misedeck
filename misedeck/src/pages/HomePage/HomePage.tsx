// HomePage — the mise status page (issue #44). Reached by clicking the
// brand lockup in the sidebar; it is deliberately not a nav item
// (docs/design/product-logic.md). The page's jobs are guided install and
// self-update: it probes `mise version --json` at startup and renders one
// panel per detection state (missing / too old / ready / error).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { detectMise } from "../../api/mise";
import { I18N_KEYS } from "../../i18n/keys";
import type { AppError, AppErrorCode, DetectMiseOk } from "../../types/tauri";

import {
  Button,
  DataRow,
  PageShell,
  Panel,
  ProgressDot,
} from "../../components";
import { useExecutionContext } from "../../components/ExecutionPanel";

import styles from "./HomePage.module.css";

interface ViewState {
  status:
    | "loading"
    | "ready"
    | "notFound"
    | "tooOld"
    | "commandFailed"
    | "parseFailed"
    | "timeout";
  ok?: DetectMiseOk;
  err?: AppError;
}

function toViewState(
  value: { kind: "ok"; ok: DetectMiseOk } | { kind: "err"; err: AppError } | undefined,
): ViewState {
  if (value === undefined) return { status: "loading" };
  if (value.kind === "ok") return { status: "ready", ok: value.ok };
  switch (value.err.code as AppErrorCode) {
    case "MISE_NOT_FOUND":
      return { status: "notFound", err: value.err };
    case "MISE_TOO_OLD":
      return { status: "tooOld", err: value.err };
    case "TIMEOUT":
      return { status: "timeout", err: value.err };
    case "PARSE_FAILED":
      return { status: "parseFailed", err: value.err };
    case "COMMAND_FAILED":
    case "UNTRUSTED":
    default:
      return { status: "commandFailed", err: value.err };
  }
}

export function HomePage() {
  const { t } = useTranslation();
  const { runInstall, runSelfUpdate } = useExecutionContext();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const view = toViewState(query.data);

  // After a successful self-update the cached version is stale; refetch
  // so the next render reflects the new version (or a too-old gate
  // that has now resolved).
  const onSelfUpdateOk = () => {
    void queryClient.invalidateQueries({ queryKey: ["mise", "detect"] });
  };

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <div className={styles.eyebrow}>{t(I18N_KEYS.home.eyebrow)}</div>
          <h1 className={styles.title}>{t(I18N_KEYS.home.title)}</h1>
          <p className={styles.commandHint}>{t(I18N_KEYS.home.commandHint)}</p>
          <p className={styles.hint}>{t(I18N_KEYS.home.hint)}</p>
        </header>

        {view.status === "loading" && (
          <Panel className={styles.state}>
            <div className={styles.stateIndicator}>
              <ProgressDot tone="dim" />
              <span className={styles.stateLabel}>{t(I18N_KEYS.states.detecting)}</span>
            </div>
          </Panel>
        )}

        {view.status === "ready" && view.ok && (
          <Panel className={styles.state}>
            <div className={styles.stateIndicator}>
              <ProgressDot tone="grove" />
              <span className={styles.stateLabel}>{t(I18N_KEYS.states.ready)}</span>
            </div>
            <dl className={styles.dataList}>
              <DataRow
                label={t(I18N_KEYS.labels.version)}
                value={view.ok.versionDate}
                tone="beam"
              />
              <DataRow label={t(I18N_KEYS.labels.binary)} value={view.ok.binaryPath} />
              <DataRow
                label="RAW"
                value={JSON.stringify(view.ok.raw, null, 2)}
                block
                full
              />
            </dl>
          </Panel>
        )}

        {view.status === "notFound" && (
          <Panel className={styles.state}>
            <div className={styles.stateIndicator}>
              <ProgressDot tone="dim" />
              <span className={styles.stateLabel}>
                {t(I18N_KEYS.states.notInstalled.title)}
              </span>
            </div>
            <p className={styles.stateBody}>
              {t(I18N_KEYS.states.notInstalled.body, {
                url: "https://mise.jdx.dev/installing.html",
              })}
            </p>
            <div className={styles.stateActions}>
              <Button
                variant="primary"
                size="md"
                onClick={runInstall}
                data-testid="not-found-guided-install"
              >
                {t(I18N_KEYS.miseManagement.guidedInstallButton)}
              </Button>
              <a
                className={styles.fallback}
                href="https://mise.jdx.dev/installing.html"
                target="_blank"
                rel="noreferrer"
              >
                {t(I18N_KEYS.states.notInstalled.installHint)}
              </a>
            </div>
          </Panel>
        )}

        {view.status === "tooOld" && view.err && (
          <Panel tone="warning" className={styles.state}>
            <div className={styles.stateIndicator}>
              <ProgressDot tone="flare" />
              <span className={styles.stateLabel}>{t(I18N_KEYS.states.tooOld.title)}</span>
            </div>
            <p className={styles.stateBody}>
              {(() => {
                const params = parseMessageParams(view.err.message);
                return t(I18N_KEYS.states.tooOld.body, {
                  found: params.found ?? "—",
                  minimum: params.minimum ?? "—",
                });
              })()}
            </p>
            <div className={styles.stateActions}>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  void runSelfUpdate().then(onSelfUpdateOk);
                }}
                data-testid="too-old-self-update"
              >
                {t(I18N_KEYS.miseManagement.selfUpdateButton)}
              </Button>
              <a
                className={styles.fallback}
                href="https://github.com/jdx/mise/releases"
                target="_blank"
                rel="noreferrer"
              >
                {t(I18N_KEYS.miseManagement.releaseNotesLink)}
              </a>
            </div>
          </Panel>
        )}

        {view.status === "commandFailed" && view.err && (
          <Panel tone="danger" className={styles.state}>
            <div className={styles.stateIndicator}>
              <ProgressDot tone="breach" />
              <span className={styles.stateLabel}>
                {t(I18N_KEYS.states.commandFailed.title)}
              </span>
            </div>
            <p className={styles.stateBody}>{t(I18N_KEYS.states.commandFailed.body)}</p>
            {view.err.stderr && <pre className={styles.stderr}>{view.err.stderr}</pre>}
          </Panel>
        )}

        {view.status === "parseFailed" && (
          <Panel tone="danger" className={styles.state}>
            <div className={styles.stateIndicator}>
              <ProgressDot tone="breach" />
              <span className={styles.stateLabel}>
                {t(I18N_KEYS.states.parseFailed.title)}
              </span>
            </div>
            <p className={styles.stateBody}>{t(I18N_KEYS.states.parseFailed.body)}</p>
          </Panel>
        )}

        {view.status === "timeout" && (
          <Panel tone="danger" className={styles.state}>
            <div className={styles.stateIndicator}>
              <ProgressDot tone="breach" />
              <span className={styles.stateLabel}>{t(I18N_KEYS.errors.timeout)}</span>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

/**
 * The Rust side encodes i18n keys with pipe-delimited params, e.g.
 *   "errors.miseTooOld|found=2024.12.31|min=2025.1.0"
 * Parse them out for `react-i18next`'s `t(key, { params })` call.
 */
function parseMessageParams(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = message.split("|");
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    const k = parts[i].slice(0, eq);
    const v = parts[i].slice(eq + 1);
    out[k] = v;
  }
  return out;
}
