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
// The check is manual by design (ADR-0009). MiseDeck's network egress
// starts here, when the user asks for it, and ends at a link — the app
// never downloads or installs a build itself.

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

  useEffect(() => {
    let alive = true;
    void getAppVersion().then((value) => {
      if (alive) setVersion(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  const runCheck = useCallback(async () => {
    setCheck({ kind: "checking" });
    try {
      const result = await checkAppUpdate();
      if (result.status === "available") {
        setCheck({ kind: "available", version: result.version, url: result.url });
      } else if (result.status === "current") {
        setCheck({ kind: "current", version: result.version });
      } else {
        setCheck({ kind: "error" });
      }
    } catch {
      // The command collapses its own failures; a rejected invoke means
      // the bridge itself is gone. Same sentence either way.
      setCheck({ kind: "error" });
    }
  }, []);

  // A missing version is a dead Tauri context, not a reason to break the
  // shell: render a placeholder and keep the Release page reachable.
  const shown = version ?? "—";
  const triggerLabel = t(I18N_KEYS.about.triggerLabel, { version: shown });
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
            title={collapsed ? triggerLabel : undefined}
          >
            {collapsed ? (
              <span className={styles.glyph} aria-hidden="true">
                <TagGlyph />
              </span>
            ) : (
              <span className={styles.version}>{shown}</span>
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
