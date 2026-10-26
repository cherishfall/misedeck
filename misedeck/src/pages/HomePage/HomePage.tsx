// HomePage — the mise status page (issue #44). The sidebar's first
// navigation entry and the app's landing page (issue #62); it heads
// the main group in docs/design/product-logic.md. The page's jobs are
// guided install and self-update: it probes `mise version --json` at
// startup and renders one panel per detection state (missing / too old /
// ready / error). A successful self-update closes the loop in-page with
// a short-lived confirmation bar (issue #145); failures still auto-open
// the panel. The guided-install button is run-locked (issue #166) and a
// successful install invalidates the detect probe, so the page resolves
// itself instead of asking for a relaunch; the ready state's RAW payload
// sits behind a collapsed-by-default disclosure (beta11, Q3).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCallback, useId, useState } from "react";

import { detectMise } from "../../api/mise";
import { I18N_KEYS } from "../../i18n/keys";
import type { AppError, AppErrorCode, DetectMiseOk } from "../../types/tauri";
import { parseAppErrorMessage } from "../../utils/appError";
import { formatErrorSummary } from "../../utils/errorSummary";
import { readErrorBody } from "../../utils/readErrorBody";
import { compareVersions } from "../../utils/versions";
import { invalidateConfigDependents } from "../../hooks/configDependents";

import {
  Button,
  CommandHint,
  ConfirmDialog,
  CopyButton,
  DataRow,
  ExternalLink,
  PageShell,
  Panel,
  ProgressDot,
  SuccessBar,
  UpgradeArrow,
  useRegisterPageRefresh,
} from "../../components";
import { commandEcho, useExecutionContext } from "../../components/ExecutionPanel";

import styles from "./HomePage.module.css";

interface ViewState {
  status:
    | "loading"
    | "ready"
    | "notFound"
    | "tooOld"
    | "commandFailed"
    | "parseFailed"
    | "timeout"
    | "probeFailed";
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
    default:
      return { status: "commandFailed", err: value.err };
  }
}

export function HomePage() {
  const { t } = useTranslation();
  const { runInstall, runSelfUpdate } = useExecutionContext();
  const queryClient = useQueryClient();

  // Self-update confirmation (issue #125): the runner passes `--yes`,
  // so mise's own `[Y/n]` prompt is bypassed — the GUI confirms first.
  // `latest` is only known in the ready state; the too-old gate knows
  // the found version but not the newest release.
  const [pendingSelfUpdate, setPendingSelfUpdate] = useState<{
    current: string;
    latest?: string;
  } | null>(null);

  // Per-command run-lock for the self-update confirm (issue #138): the
  // Confirm button locks only while *this* command is in flight, not for
  // any unrelated command running elsewhere.
  const [selfUpdateRunning, setSelfUpdateRunning] = useState(false);

  // Per-command run-lock for the guided install (issue #166): this was
  // the last unguarded command button site-wide — a double click used
  // to fire two installers concurrently.
  const [installRunning, setInstallRunning] = useState(false);

  // In-page success confirmation (issue #145): a successful
  // self-update closes the loop here with a short-lived bar; failures
  // are unchanged — the panel still auto-opens.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successTick, setSuccessTick] = useState(0);

  const query = useQuery({
    queryKey: ["mise", "detect"],
    // HomePage owns a rejected probe: the `probeFailed` card below
    // renders the summary with a retry (issue #262), so the global
    // failure notice stays out of it (issue #249).
    queryFn: () => detectMise({ reportFailure: false }),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const view: ViewState = query.isError
    ? { status: "probeFailed" }
    : toViewState(query.data);
  // A rejected detection query has no AppError union to classify — the
  // page still owes the user the failure text, so the IPC rejection
  // summary takes the same diagnostic block as stderr (issue #262).
  const detectErrorSummary = query.isError ? formatErrorSummary(query.error) : "";

  // After a successful self-update the cached version is stale; refetch
  // so the next render reflects the new version (or a too-old gate
  // that has now resolved).
  const onSelfUpdateOk = () => {
    void queryClient.invalidateQueries({ queryKey: ["mise", "detect"] });
    // A new mise binary can resolve config differently, so the cached
    // config-derived views describe the old binary. `self-update` and the
    // guided install are Global operations, so the Global variants are
    // the ones that exist; per-directory caches refetch on mount
    // (`staleTime: 0`, issue #285).
    invalidateConfigDependents(queryClient, null);
  };

  // Guided install (issue #166): run-locked so a double click cannot
  // fire two installers; on success the not-found state resolves
  // itself — invalidate the detect probe exactly like the self-update
  // path, so the page flips to ready instead of telling the user to
  // relaunch the app. On failure the command now resolves `{kind:"err"}`
  // (issue #172): nothing here needs to handle it — the execution panel
  // auto-opens with the script's stderr (the shared runner contract),
  // the page stays in the not-found state instead of feigning success,
  // and `finally` releases the run-lock either way.
  const onGuidedInstall = () => {
    if (installRunning) return;
    setInstallRunning(true);
    void runInstall()
      .then((res) => {
        if (res.kind === "ok") {
          void queryClient.invalidateQueries({ queryKey: ["mise", "detect"] });
          // The reads that ran while mise was missing cached their
          // failure; drop them the same way a self-update does (#285).
          invalidateConfigDependents(queryClient, null);
        }
      })
      .finally(() => setInstallRunning(false));
  };

  // Diagnostic-grade raw output is collapsed by default (beta11, Q3);
  // the disclosure expands to the full block with the copy affordance.
  const [rawOpen, setRawOpen] = useState(false);
  // The trigger names the revealed block (`aria-labelledby`), so the
  // section is announced once instead of being labelled twice.
  const rawLabelId = useId();
  const rawBlockId = useId();

  // Top-toolbar refresh (issue #98): the version probe is the page's
  // only query.
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["mise", "detect"] });
  }, [queryClient]);
  useRegisterPageRefresh(onRefresh);

  // `mise version --json` reports the newest published release as `latest`;
  // it is absent when the probe could not fetch it. The compare is
  // directional (issue #99): only a strictly newer latest offers an
  // update — an equal or locally-newer install shows nothing.
  const latest =
    view.ok && typeof view.ok.raw.latest === "string"
      ? view.ok.raw.latest
      : undefined;
  const updateAvailable =
    view.status === "ready" &&
    latest !== undefined &&
    compareVersions(latest, view.ok?.versionDate ?? "") > 0;

  // The too-old gate's found/minimum ride the `key|param=value` wire
  // format (docs/agents/conventions.md), parsed once here via the shared
  // parser rather than hand-split at each render site. A missing param
  // degrades to "—" — the gate never breaks on a malformed payload.
  const tooOldParams =
    view.status === "tooOld" && view.err
      ? parseAppErrorMessage(view.err.message).params
      : undefined;

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{t(I18N_KEYS.home.title)}</h1>
          <CommandHint>{t(I18N_KEYS.home.commandHint)}</CommandHint>
          <p className={styles.hint}>{t(I18N_KEYS.home.hint)}</p>
        </header>

        {/* In-page success confirmation (issue #145): set by a
            successful self-update below, auto-dismisses after a few
            seconds. Null renders nothing. */}
        <SuccessBar
          message={successMessage}
          tick={successTick}
          onDismiss={() => setSuccessMessage(null)}
        />

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
            {/* DataRow renders its own <dl> (issue #257); the wrapper is a
                plain container, not a second description list. */}
            <div className={styles.dataList}>
              <DataRow
                label={t(I18N_KEYS.labels.version)}
                value={view.ok.versionDate}
                tone="beam"
              />
              <DataRow label={t(I18N_KEYS.labels.binary)} value={view.ok.binaryPath} />
              {updateAvailable && (
                <DataRow
                  label={t(I18N_KEYS.labels.latestVersion)}
                  value={
                    <span className={styles.latestValue}>
                      <span>
                        {view.ok.versionDate}{" "}
                        <UpgradeArrow />{" "}
                        {latest}
                      </span>
                      <ExternalLink
                        className={styles.fallback}
                        href="https://github.com/jdx/mise/releases"
                      >
                        {t(I18N_KEYS.miseManagement.releaseNotesLink)}
                      </ExternalLink>
                    </span>
                  }
                  tone="flare"
                />
              )}
            </div>
            {/* Diagnostic-grade raw output (the `mise version --json`
                payload) renders collapsed by default behind a
                disclosure (beta11, Q3); expanded is the previous
                full block, copy affordance included.

                The trigger carries the section's only visible label
                (beta18): the revealed block is a `region` named *by
                that trigger*, the same disclosure contract
                ErrorBoundary and the config-file viewer use. Before
                this, the block was a `DataRow` whose row label was the
                trigger's own text, so expanding printed "RAW" twice —
                once as the button, once as the `<dt>` above the
                payload. */}
            <div className={styles.rawSection}>
              <Button
                variant="ghost"
                size="sm"
                id={rawLabelId}
                aria-expanded={rawOpen}
                aria-controls={rawOpen ? rawBlockId : undefined}
                onClick={() => setRawOpen((v) => !v)}
                data-testid="home-raw-toggle"
              >
                {t(I18N_KEYS.home.rawLabel)}
              </Button>
              {rawOpen && (
                <div className={styles.rawWrap}>
                  <pre
                    id={rawBlockId}
                    className={styles.rawText}
                    role="region"
                    aria-labelledby={rawLabelId}
                    tabIndex={0}
                    data-testid="home-raw-output"
                  >
                    {JSON.stringify(view.ok.raw, null, 2)}
                  </pre>
                  <CopyButton
                    text={JSON.stringify(view.ok.raw, null, 2)}
                    className={styles.rawCopy}
                  />
                </div>
              )}
            </div>
            {updateAvailable && (
              <div className={styles.stateActions}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (view.ok) {
                      setPendingSelfUpdate({
                        current: view.ok.versionDate,
                        latest,
                      });
                    }
                  }}
                  data-testid="ready-self-update"
                >
                  {t(I18N_KEYS.miseManagement.selfUpdateButton)}
                </Button>
              </div>
            )}
          </Panel>
        )}

        {view.status === "notFound" && (
          <Panel className={styles.state}>
            <div className={styles.stateIndicator}>
              <ProgressDot tone="flare" />
              <span className={styles.stateLabel}>
                {t(I18N_KEYS.states.notInstalled.title)}
              </span>
            </div>
            <p className={styles.stateBody}>
              {t(I18N_KEYS.states.notInstalled.body)}
            </p>
            <div className={styles.stateActions}>
              <Button
                variant="primary"
                size="sm"
                disabled={installRunning}
                onClick={onGuidedInstall}
                data-testid="not-found-guided-install"
              >
                {installRunning
                  ? t(I18N_KEYS.miseManagement.guidedInstallInstalling)
                  : t(I18N_KEYS.miseManagement.guidedInstallButton)}
              </Button>
              <ExternalLink
                className={styles.fallback}
                href="https://mise.jdx.dev/installing.html"
              >
                {t(I18N_KEYS.states.notInstalled.installHint)}
              </ExternalLink>
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
              {t(I18N_KEYS.states.tooOld.body, {
                found: tooOldParams?.found ?? "—",
                minimum: tooOldParams?.minimum ?? "—",
              })}
            </p>
            {/* No dead end (issue #213): `mise self-update` cannot
                replace a binary owned by a package manager, so the
                package-manager route and the reinstall routes are named
                here instead of leaving self-update as the only exit. */}
            <p className={styles.stateBody}>
              {t(I18N_KEYS.states.tooOld.packageManagerHint)}
            </p>
            <div className={styles.stateActions}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setPendingSelfUpdate({ current: tooOldParams?.found ?? "—" });
                }}
                data-testid="too-old-self-update"
              >
                {t(I18N_KEYS.miseManagement.selfUpdateButton)}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={installRunning}
                onClick={onGuidedInstall}
                data-testid="too-old-guided-install"
              >
                {installRunning
                  ? t(I18N_KEYS.miseManagement.guidedInstallInstalling)
                  : t(I18N_KEYS.miseManagement.guidedInstallButton)}
              </Button>
              <ExternalLink
                className={styles.fallback}
                href="https://mise.jdx.dev/installing.html"
              >
                {t(I18N_KEYS.states.notInstalled.installHint)}
              </ExternalLink>
              <ExternalLink
                className={styles.fallback}
                href="https://github.com/jdx/mise/releases"
              >
                {t(I18N_KEYS.miseManagement.releaseNotesLink)}
              </ExternalLink>
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
            <p className={styles.stateBody}>
              {readErrorBody(
                view.err,
                t,
                I18N_KEYS.states.commandFailed.body,
                I18N_KEYS.states.commandFailed.bodyNoStderr,
              )}
            </p>
            {view.err.stderr && <pre className={styles.stderr}>{view.err.stderr}</pre>}
          </Panel>
        )}

        {view.status === "probeFailed" && (
          <Panel tone="danger" className={styles.state}>
            <div className={styles.stateIndicator}>
              <ProgressDot tone="breach" />
              <span className={styles.stateLabel}>
                {t(I18N_KEYS.states.probeFailed.title)}
              </span>
            </div>
            <p className={styles.stateBody}>{t(I18N_KEYS.states.probeFailed.body)}</p>
            {detectErrorSummary && (
              <pre className={styles.stderr}>{detectErrorSummary}</pre>
            )}
            <div className={styles.stateActions}>
              <Button
                variant="secondary"
                size="sm"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
                data-testid="home-detect-retry"
              >
                {t(I18N_KEYS.common.retry)}
              </Button>
            </div>
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
              <span className={styles.stateLabel}>
                {t(I18N_KEYS.errors.timeout)}
              </span>
            </div>
          </Panel>
        )}

        <ConfirmDialog
          open={pendingSelfUpdate !== null}
          title={
            pendingSelfUpdate ? t(I18N_KEYS.miseManagement.confirmSelfUpdate.title) : ""
          }
          body={
            pendingSelfUpdate
              ? pendingSelfUpdate.latest
                ? t(I18N_KEYS.miseManagement.confirmSelfUpdate.bodyWithLatest, {
                    current: pendingSelfUpdate.current,
                    latest: pendingSelfUpdate.latest,
                  })
                : t(I18N_KEYS.miseManagement.confirmSelfUpdate.bodyUnknownLatest, {
                    current: pendingSelfUpdate.current,
                  })
              : ""
          }
          command={commandEcho("selfUpdate", null, [])}
          // Global-mode context line (#191): the echo no longer carries
          // the runner's `-C $HOME`, so the dialog states the directory
          // the update really runs in.
          cwd={null}
          confirmLabel={t(I18N_KEYS.miseManagement.selfUpdateButton)}
          cancelLabel={t(I18N_KEYS.common.cancel)}
          danger={false}
          confirmBusy={selfUpdateRunning}
          onConfirm={() => {
            setPendingSelfUpdate(null);
            setSelfUpdateRunning(true);
            void runSelfUpdate()
              .then((res) => {
                // Success closes the loop in-page (issue #145); the
                // exact command stays in the execution panel's
                // transcript. The version refetch happens either way,
                // as before.
                if (res.kind === "ok") {
                  setSuccessMessage(t(I18N_KEYS.home.success.selfUpdated));
                  setSuccessTick((n) => n + 1);
                }
                onSelfUpdateOk();
              })
              .finally(() => setSelfUpdateRunning(false));
          }}
          onCancel={() => setPendingSelfUpdate(null)}
        />
      </div>
    </PageShell>
  );
}
