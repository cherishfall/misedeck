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
// query invalidates itself and the banner disappears.

import { forwardRef, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { useTrust, useTrustAction } from "../../state/trustContext";
import { Banner } from "../Banner/Banner";
import { Button } from "../Button/Button";
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
    if (trust.kind !== "untrusted") return null;
    return (
      <div ref={ref} data-testid="trust-banner">
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
        {lastResult === "ok" && (
          <div className={styles.trustNote} data-testid="trust-ok">
            {t(I18N_KEYS.trust.ok)}
          </div>
        )}
        {lastResult === "error" && (
          <div className={styles.trustNote} data-testid="trust-error">
            {t(I18N_KEYS.trust.error)}
            {lastError ? <> · {lastError}</> : null}
          </div>
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
