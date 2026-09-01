import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { detectMise } from "./api/mise";
import { I18N_KEYS } from "./i18n/keys";
import type { AppError, AppErrorCode, DetectMiseOk } from "./types/tauri";

import { PageShell } from "./components/PageShell/PageShell";
import { Button } from "./components/Button/Button";
import { useExecutionContext } from "./components/ExecutionPanel";

import "./App.css";

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

function App() {
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
      <div className="starter">
        <div className="starter__panel">
          <div className="starter__eyebrow">{t(I18N_KEYS.starter.eyebrow)}</div>
          <h1 className="starter__title">{t(I18N_KEYS.starter.title)}</h1>
          <p className="starter__command">{t(I18N_KEYS.starter.commandHint)}</p>
          <p className="starter__hint">{t(I18N_KEYS.starter.hint)}</p>

          {view.status === "loading" && (
            <div className="state state--loading">
              <span className="dot dot--dim" />
              <span className="state__label">{t(I18N_KEYS.states.detecting)}</span>
            </div>
          )}

          {view.status === "ready" && view.ok && (
            <div className="state state--ready">
              <div className="state__indicator">
                <span className="dot dot--grove" />
                <span className="state__label">{t(I18N_KEYS.states.ready)}</span>
              </div>
              <dl className="data">
                <div className="data__row">
                  <dt className="data__label">{t(I18N_KEYS.labels.version)}</dt>
                  <dd className="data__value data__value--beam">{view.ok.versionDate}</dd>
                </div>
                <div className="data__row">
                  <dt className="data__label">{t(I18N_KEYS.labels.binary)}</dt>
                  <dd className="data__value">{view.ok.binaryPath}</dd>
                </div>
                <div className="data__row data__row--full">
                  <dt className="data__label">RAW</dt>
                  <dd className="data__value data__value--raw">
                    {JSON.stringify(view.ok.raw, null, 2)}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {view.status === "notFound" && (
            <div className="state state--not-found">
              <div className="state__indicator">
                <span className="dot dot--dim" />
                <span className="state__label">
                  {t(I18N_KEYS.states.notInstalled.title)}
                </span>
              </div>
              <p className="state__body">
                {t(I18N_KEYS.states.notInstalled.body, {
                  url: "https://mise.jdx.dev/installing.html",
                })}
              </p>
              <div className="state__actions">
                <Button
                  variant="primary"
                  size="md"
                  onClick={runInstall}
                  data-testid="not-found-guided-install"
                >
                  {t(I18N_KEYS.miseManagement.guidedInstallButton)}
                </Button>
                <a
                  className="state__fallback"
                  href="https://mise.jdx.dev/installing.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(I18N_KEYS.states.notInstalled.installHint)}
                </a>
              </div>
            </div>
          )}

          {view.status === "tooOld" && view.err && (
            <div className="state state--too-old">
              <div className="state__indicator">
                <span className="dot dot--flare" />
                <span className="state__label">{t(I18N_KEYS.states.tooOld.title)}</span>
              </div>
              <p className="state__body">
                {(() => {
                  const params = parseMessageParams(view.err.message);
                  return t(I18N_KEYS.states.tooOld.body, {
                    found: params.found ?? "—",
                    minimum: params.minimum ?? "—",
                  });
                })()}
              </p>
              <div className="state__actions">
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
                  className="state__fallback"
                  href="https://github.com/jdx/mise/releases"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(I18N_KEYS.miseManagement.releaseNotesLink)}
                </a>
              </div>
            </div>
          )}

          {view.status === "commandFailed" && view.err && (
            <div className="state state--command-failed">
              <div className="state__indicator">
                <span className="dot dot--breach" />
                <span className="state__label">
                  {t(I18N_KEYS.states.commandFailed.title)}
                </span>
              </div>
              <p className="state__body">{t(I18N_KEYS.states.commandFailed.body)}</p>
              {view.err.stderr && (
                <pre className="state__stderr">{view.err.stderr}</pre>
              )}
            </div>
          )}

          {view.status === "parseFailed" && (
            <div className="state state--parse-failed">
              <div className="state__indicator">
                <span className="dot dot--breach" />
                <span className="state__label">
                  {t(I18N_KEYS.states.parseFailed.title)}
                </span>
              </div>
              <p className="state__body">{t(I18N_KEYS.states.parseFailed.body)}</p>
            </div>
          )}

          {view.status === "timeout" && (
            <div className="state state--timeout">
              <div className="state__indicator">
                <span className="dot dot--breach" />
                <span className="state__label">{t(I18N_KEYS.errors.timeout)}</span>
              </div>
            </div>
          )}
        </div>
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

export default App;
