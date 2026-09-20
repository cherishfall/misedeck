// TrustBanner — the single trust-gate banner every page renders
// (issues #25 / #141). The component owns the `useTrust()` /
// `useTrustAction()` wiring, so a page only drops in
//
//   <TrustBanner body={I18N_KEYS.<page>.guard.untrustedBody} />
//
// and pairs it with `useTrustBannerFocus()` for the guard contract:
// when `useTrustGuard()` blocks a mutation, the page calls `focus()`
// so the user lands on the banner instead of a silently dead button.
//
// Renders nothing in every state except `untrusted`, so it is safe to
// drop into a page unconditionally. The one-click `Trust` action
// routes through the execution panel (so the `mise trust` attempt is
// visible alongside any other panel activity); on success the trust
// query invalidates itself, the banner disappears, and the success
// closes the loop in-page with the shared SuccessBar (issue #145) —
// the bar lives outside the banner's `untrusted` early return because
// the re-probe flips the trust state within milliseconds, which made
// the old in-banner note vanish before it could be read. Failures are
// unchanged: the panel auto-opens and the error note stays under the
// banner.

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { useTrust, useTrustAction } from "../../state/trustContext";
import { Banner } from "../Banner/Banner";
import { Button } from "../Button/Button";
import { SuccessBar } from "../SuccessBar/SuccessBar";
import { Tooltip } from "../Tooltip/Tooltip";

import styles from "./TrustBanner.module.css";

interface TrustBannerProps {
  /** i18n key for the page-specific body line, e.g.
   *  `I18N_KEYS.env.guard.untrustedBody`. */
  body: string;
}

export const TrustBanner = forwardRef<HTMLDivElement, TrustBannerProps>(
  function TrustBanner({ body }, ref) {
    const { t } = useTranslation();
    const { state: trust } = useTrust();
    const { running, lastResult, lastError, run } = useTrustAction();
    // The success bar must survive the banner itself: on Ok the trust
    // query re-probes and `trust.kind` flips away from `untrusted`
    // within milliseconds (issue #145). `dismissed` is cleared whenever
    // the terminal flag moves off "ok", so a later re-run re-arms the
    // bar.
    const [dismissed, setDismissed] = useState(false);
    useEffect(() => {
      if (lastResult !== "ok") setDismissed(false);
    }, [lastResult]);
    const justTrusted = lastResult === "ok" && !dismissed;
    if (trust.kind !== "untrusted" && !justTrusted) return null;
    return (
      <div ref={ref} data-testid="trust-banner">
        {trust.kind === "untrusted" && (
          <>
            <Banner
              tone="warning"
              label={t(I18N_KEYS.trust.banner.label)}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  loading={running}
                  disabled={running}
                  onClick={() => void run()}
                  data-testid="trust-button"
                >
                  {running ? t(I18N_KEYS.trust.busy) : t(I18N_KEYS.trust.banner.action)}
                </Button>
              }
            >
              {t(body)}
              {trust.path ? (
                <Tooltip text={trust.path}>
                  <span className={styles.trustPath}> · {trust.path}</span>
                </Tooltip>
              ) : null}
            </Banner>
            {lastResult === "error" && (
              <div className={styles.trustNote} data-testid="trust-error">
                {t(I18N_KEYS.trust.error)}
                {lastError ? <> · {lastError}</> : null}
              </div>
            )}
          </>
        )}
        {justTrusted && (
          <SuccessBar
            message={t(I18N_KEYS.trust.success)}
            onDismiss={() => setDismissed(true)}
          />
        )}
      </div>
    );
  },
);

/** The other half of the `useTrustGuard()` contract: when the guard
 *  blocks a mutation, call `focus()` so the page scrolls to its trust
 *  banner and lands focus on the Trust button instead of running.
 *  Pass `ref` to the page's `<TrustBanner>`. */
export function useTrustBannerFocus() {
  const ref = useRef<HTMLDivElement | null>(null);
  const focus = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  return { ref, focus };
}
