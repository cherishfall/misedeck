import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { detectMise } from "./api/mise";
import type { AppError, AppErrorCode, DetectMiseOk } from "./types/tauri";

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
  const query = useQuery({
    queryKey: ["mise", "detect"],
    queryFn: detectMise,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const view = toViewState(query.data);

  return (
    <div className="app-shell">
      <header className="wordmark">
        <span className="wordmark__name">{t("app.wordmark")}</span>
        <span className="wordmark__tagline">{t("app.tagline")}</span>
      </header>

      <main className="starter">
        <div className="starter__panel">
          <div className="signal-line" aria-hidden="true" />
          <div className="corner corner--tl" aria-hidden="true" />
          <div className="corner corner--br" aria-hidden="true" />

          <div className="starter__eyebrow">{t("starter.eyebrow")}</div>
          <h1 className="starter__title">{t("starter.title")}</h1>
          <p className="starter__hint">{t("starter.hint")}</p>

          {view.status === "loading" && (
            <div className="state state--loading">
              <span className="dot dot--dim" />
              <span className="state__label">{t("states.detecting")}</span>
            </div>
          )}

          {view.status === "ready" && view.ok && (
            <div className="state state--ready">
              <div className="state__indicator">
                <span className="dot dot--beam" />
                <span className="state__label">{t("states.ready")}</span>
              </div>
              <dl className="data">
                <div className="data__row">
                  <dt className="data__label">{t("labels.version")}</dt>
                  <dd className="data__value data__value--beam">{view.ok.versionDate}</dd>
                </div>
                <div className="data__row">
                  <dt className="data__label">{t("labels.binary")}</dt>
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
                <span className="state__label">{t("states.notInstalled.title")}</span>
              </div>
              <p className="state__body">
                {t("states.notInstalled.body", {
                  url: "https://mise.jdx.dev/installing.html",
                })}
              </p>
              <p className="state__hint">{t("states.notInstalled.installHint")}</p>
            </div>
          )}

          {view.status === "tooOld" && view.err && (
            <div className="state state--too-old">
              <div className="state__indicator">
                <span className="dot dot--flare" />
                <span className="state__label">{t("states.tooOld.title")}</span>
              </div>
              <p className="state__body">
                {(() => {
                  const params = parseMessageParams(view.err.message);
                  return t("states.tooOld.body", {
                    found: params.found ?? "—",
                    minimum: params.minimum ?? "—",
                  });
                })()}
              </p>
            </div>
          )}

          {view.status === "commandFailed" && view.err && (
            <div className="state state--command-failed">
              <div className="state__indicator">
                <span className="dot dot--breach" />
                <span className="state__label">{t("states.commandFailed.title")}</span>
              </div>
              <p className="state__body">{t("states.commandFailed.body")}</p>
              {view.err.stderr && (
                <pre className="state__stderr">{view.err.stderr}</pre>
              )}
            </div>
          )}

          {view.status === "parseFailed" && (
            <div className="state state--parse-failed">
              <div className="state__indicator">
                <span className="dot dot--breach" />
                <span className="state__label">{t("states.parseFailed.title")}</span>
              </div>
              <p className="state__body">{t("states.parseFailed.body")}</p>
            </div>
          )}

          {view.status === "timeout" && (
            <div className="state state--timeout">
              <div className="state__indicator">
                <span className="dot dot--breach" />
                <span className="state__label">{t("errors.timeout")}</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
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
