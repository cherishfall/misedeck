// ErrorBoundary — the app root's render-failure net (issue #214).
//
// Before this, any exception thrown while rendering a page unmounted
// the whole React tree and left a blank window. The boundary keeps the
// failure inside the app: the fallback renders the shared error recipe
// (danger panel + breach dot + mono label) inside the normal shell, so
// the user still has navigation, and it offers "Back to Home" plus a
// copyable diagnostic behind a disclosure (ui-ux-rules.md: raw
// diagnostic output is collapsed by default).
//
// Placement matters: `main.tsx` mounts it inside the providers and the
// router but around <Routes>, so the fallback can use i18n, the theme,
// the directory context, and the shell chrome. Navigating anywhere
// resets the boundary (`resetKey`), which is also what makes the
// fallback's sidebar links live rather than dead.

import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { I18N_KEYS } from "../../i18n/keys";
import { formatErrorDetails, formatErrorSummary } from "../../utils/errorSummary";

import { Button } from "../Button/Button";
import { CopyButton } from "../CopyButton/CopyButton";
import { PageShell } from "../PageShell/PageShell";
import { Panel } from "../Panel/Panel";
import { ProgressDot } from "../ProgressDot/ProgressDot";

import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this value clears a caught error — the router passes the
   *  current pathname so navigating away from a broken page recovers. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
  componentStack: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, componentStack: "" };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null, componentStack: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          componentStack={this.state.componentStack}
          onReset={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: unknown;
  componentStack: string;
  onReset: () => void;
}

function ErrorFallback({ error, componentStack, onReset }: ErrorFallbackProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const summary = formatErrorSummary(error) || t(I18N_KEYS.errors.unknown);
  const details = formatErrorDetails(error, componentStack) || summary;

  const backHome = () => {
    onReset();
    navigate("/");
  };

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{t(I18N_KEYS.errorBoundary.title)}</h1>
        </header>

        <Panel tone="danger" className={styles.state}>
          <div className={styles.stateIndicator}>
            <ProgressDot tone="breach" />
            <span className={styles.stateLabel}>
              {t(I18N_KEYS.errorBoundary.label)}
            </span>
          </div>
          <p className={styles.stateBody}>{t(I18N_KEYS.errorBoundary.body)}</p>
          <pre className={styles.summary} data-testid="error-boundary-summary">
            {summary}
          </pre>
          <div className={styles.actions}>
            <Button
              variant="primary"
              size="sm"
              onClick={backHome}
              data-testid="error-boundary-home"
            >
              {t(I18N_KEYS.errorBoundary.homeButton)}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((v) => !v)}
              data-testid="error-boundary-details-toggle"
            >
              {t(I18N_KEYS.errorBoundary.detailsLabel)}
            </Button>
          </div>
          {detailsOpen && (
            <div className={styles.details}>
              <pre
                className={styles.detailsText}
                role="region"
                aria-label={t(I18N_KEYS.errorBoundary.detailsLabel)}
                tabIndex={0}
              >
                {details}
              </pre>
              <CopyButton text={details} className={styles.detailsCopy} />
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
