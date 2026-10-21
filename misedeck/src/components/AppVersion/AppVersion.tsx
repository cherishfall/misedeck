// AppVersion — the running build's own version, and the panel it opens
// (#235) where the user can ask whether a newer build exists (#236).
//
// Placement rationale lives in the CSS module header; the short version:
// language, theme and the app's version are all facts about *this app*,
// while every page is about mise. Putting the version in the mise status
// panel on Home — or on the top toolbar, where the "hint left, actions
// right" rule owns the row — would make two different numbers look like
// the same kind of thing.
//
// The version string itself is never translated and never captioned with
// "Version": `labels.version` already means mise's version.
//
// The check is manual when the user asks, and — since #238 — silently
// at most once per throttle window after launch. Both paths stop at a
// link: the app never downloads or installs a build itself (ADR-0009,
// revision). A newer build known from either path renders a dot on the
// version line; the panel it opens is the same four-state panel.

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { RELEASES_URL, getAppVersion } from "../../api/app";
import { checkAppUpdate } from "../../api/appUpdate";
import { I18N_KEYS } from "../../i18n/keys";
import { Button } from "../Button/Button";
import { ExternalLink } from "../ExternalLink/ExternalLink";
import { FloatingMenu } from "../FloatingMenu";
import { ProgressDot } from "../ProgressDot/ProgressDot";
import { UpgradeArrow } from "../UpgradeArrow/UpgradeArrow";

import { summarizeCheck, type UpdateCheckState } from "./appVersionCopy";
import {
  LAUNCH_CHECK_DELAY_MS,
  applyCheckResult,
  isCheckDue,
  isStoredUpdateNewer,
  loadUpdateState,
  saveUpdateState,
  type AvailableUpdate,
} from "./appUpdateState";
import styles from "./AppVersion.module.css";

interface AppVersionProps {
  /** Collapsed sidebar rail: the version string does not fit in 56px, so
   *  the trigger degrades to a glyph button carrying the version in its
   *  tooltip / accessible name. Never hidden — the rail keeps every
   *  capability reachable (ui-ux-rules.md). */
  collapsed?: boolean;
}

export function AppVersion({ collapsed = false }: AppVersionProps) {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<UpdateCheckState>({ kind: "idle" });
  // The build a persisted or launch-time check told us about. Its only
  // visual is the dot; the panel seeded from it is the same four-state
  // panel a manual check uses.
  const [knownUpdate, setKnownUpdate] = useState<AvailableUpdate | null>(null);

  useEffect(() => {
    let alive = true;
    void getAppVersion().then((value) => {
      if (!alive) return;
      setVersion(value);
      if (value === null) return;
      // A marker belongs to a build still newer than this one. Upgrading
      // past it is the only thing that makes it stale — clear the stored
      // copy so the dot does not survive the upgrade (ADR-0009 revision).
      const stored = loadUpdateState();
      const marker = isStoredUpdateNewer(stored.available, value)
        ? stored.available
        : null;
      if (stored.available !== null && marker === null) {
        saveUpdateState({ ...stored, available: null });
      }
      if (marker !== null) {
        setKnownUpdate(marker);
        setCheck((prev) =>
          prev.kind === "idle"
            ? { kind: "available", version: marker.version, url: marker.url }
            : prev,
        );
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Record an attempt before the request leaves, so a crash or a kill
   *  mid-check cannot buy a second attempt on the next launch. */
  const beginAttempt = useCallback(() => {
    const now = Date.now();
    const stored = loadUpdateState();
    saveUpdateState({ ...stored, lastAttemptAt: now });
    return { stored, attemptedAt: now };
  }, []);

  const showMarker = useCallback((marker: AvailableUpdate | null) => {
    setKnownUpdate(marker);
    if (marker !== null) {
      setCheck((prev) =>
        prev.kind === "idle"
          ? { kind: "available", version: marker.version, url: marker.url }
          : prev,
      );
    }
  }, []);

  const runCheck = useCallback(async () => {
    setCheck({ kind: "checking" });
    const { stored, attemptedAt } = beginAttempt();
    try {
      const result = await checkAppUpdate();
      if (result.status === "available") {
        setCheck({ kind: "available", version: result.version, url: result.url });
      } else if (result.status === "current") {
        setCheck({ kind: "current", version: result.version });
      } else {
        setCheck({ kind: "error" });
      }
      const next = applyCheckResult(
        { ...stored, lastAttemptAt: attemptedAt },
        result,
        version,
        Date.now(),
      );
      saveUpdateState(next);
      showMarker(next.available);
    } catch {
      // The command collapses its own failures; a rejected invoke means
      // the bridge itself is gone. Same sentence either way.
      setCheck({ kind: "error" });
    }
  }, [beginAttempt, showMarker, version]);

  // The silent launch check (#238): fire-and-forget after the shell has
  // settled, at most once per window, with every failure swallowed. It
  // never opens the panel, never writes a notification, and never awaits
  // anything on the startup path.
  const runSilentCheck = useCallback(
    async (running: string) => {
      const current = loadUpdateState();
      if (!isCheckDue(current.lastAttemptAt, Date.now())) return;
      const attemptedAt = Date.now();
      saveUpdateState({ ...current, lastAttemptAt: attemptedAt });
      try {
        const result = await checkAppUpdate();
        const next = applyCheckResult(
          { ...current, lastAttemptAt: attemptedAt },
          result,
          running,
          Date.now(),
        );
        saveUpdateState(next);
        showMarker(next.available);
        // A panel seeded from the old marker must not keep claiming a
        // build the feed just disowned. Only an already-open "available"
        // state is corrected; nothing opens on its own.
        if (result.status === "current") {
          setCheck((prev) =>
            prev.kind === "available"
              ? { kind: "current", version: result.version }
              : prev,
          );
        } else if (result.status === "available") {
          setCheck((prev) =>
            prev.kind === "available"
              ? { kind: "available", version: result.version, url: result.url }
              : prev,
          );
        }
      } catch {
        // Offline, proxy, curl missing, bridge gone: all the same quiet
        // outcome. The attempt timestamp already throttles the next
        // launch, and nothing may surface from a check nobody asked for.
      }
    },
    [showMarker],
  );

  useEffect(() => {
    if (version === null) return;
    const timer = window.setTimeout(() => {
      void runSilentCheck(version);
    }, LAUNCH_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [runSilentCheck, version]);

  // A missing version is a dead Tauri context, not a reason to break the
  // shell: render a placeholder and keep the Release page reachable.
  const shown = version ?? "—";
  // With a known newer build the trigger's name and tooltip say so — the
  // dot itself is decorative and never the only channel (ui-ux-rules.md).
  const triggerLabel =
    knownUpdate !== null
      ? t(I18N_KEYS.about.triggerLabelUpdate, {
          version: shown,
          available: knownUpdate.version,
        })
      : t(I18N_KEYS.about.triggerLabel, { version: shown });
  const summary = summarizeCheck(check);

  const statusText =
    summary.statusKey === null
      ? null
      : check.kind === "available"
        ? t(summary.statusKey, { version: check.version })
        : t(summary.statusKey);

  return (
    <div className={collapsed ? styles.colophonCollapsed : styles.colophon}>
      <FloatingMenu
        open={open}
        onOpenChange={setOpen}
        placement="up"
        align="start"
        role="dialog"
        aria-label={t(I18N_KEYS.about.panelLabel)}
        trigger={(tp) => (
          <button
            type="button"
            className={collapsed ? styles.railTrigger : styles.trigger}
            onClick={tp.onClick}
            aria-haspopup={tp["aria-haspopup"]}
            aria-expanded={tp["aria-expanded"]}
            aria-controls={tp["aria-controls"]}
            ref={tp.ref}
            aria-label={triggerLabel}
            title={collapsed || knownUpdate !== null ? triggerLabel : undefined}
          >
            {collapsed ? (
              <span className={styles.glyph} aria-hidden="true">
                <TagGlyph />
              </span>
            ) : (
              <span className={styles.version}>{shown}</span>
            )}
            {knownUpdate !== null && (
              <span className={styles.updateDot} aria-hidden="true" />
            )}
          </button>
        )}
      >
        <div className={styles.panel}>
          <div className={styles.head}>
            <span className={styles.name}>{t(I18N_KEYS.about.name)}</span>
            <span className={styles.versionValue}>{shown}</span>
          </div>
          <div className={styles.divider} />

          {/* Always mounted so a result is announced when it arrives;
              empty until the user asks. */}
          <div className={styles.status} role="status" aria-live="polite">
            {statusText !== null && (
              <span className={styles.statusLine} data-tone={summary.statusTone}>
                {summary.busy && <ProgressDot tone="ice" />}
                {statusText}
              </span>
            )}
            {check.kind === "available" && (
              <span className={styles.versionPair}>
                {shown}
                <UpgradeArrow />
                {check.version}
              </span>
            )}
          </div>

          <div className={styles.actions}>
            {summary.action === "download" && check.kind === "available" ? (
              <ExternalLink className={styles.download} href={check.url}>
                {t(I18N_KEYS.about.download, { version: check.version })}
              </ExternalLink>
            ) : (
              <span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={summary.busy}
                  onClick={() => void runCheck()}
                >
                  {t(
                    summary.action === "retry"
                      ? I18N_KEYS.common.retry
                      : I18N_KEYS.about.check,
                  )}
                </Button>
              </span>
            )}
            <ExternalLink className={styles.link} href={RELEASES_URL}>
              {t(I18N_KEYS.about.releasePage)}
            </ExternalLink>
          </div>
        </div>
      </FloatingMenu>
    </div>
  );
}

/** A luggage-tag outline: the one geometric mark in the shell that reads
 *  as "release / build label" rather than as a navigation destination. */
function TagGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M7.1 2.5H3.6a1.1 1.1 0 0 0-1.1 1.1v3.5l6 6a1.4 1.4 0 0 0 2 0l3.3-3.3a1.4 1.4 0 0 0 0-2l-5.7-5.3Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="5.7" cy="5.7" r="1.05" fill="currentColor" />
    </svg>
  );
}
