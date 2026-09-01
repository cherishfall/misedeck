// MiseMissingState — the small "mise isn't on this machine" panel
// used by any page that needs mise. Lives outside `pages/` because
// the tools page and any later page that touches mise data (settings,
// doctor, registry) all need it. The shape is intentionally close to
// the not-installed block on the Home page so the two read as
// the same screen in different contexts.
//
// Empty state follows the EmptyState pattern (eyebrow / title / body
// + optional CTA); the eyebrow uses the ▸ GROUP / SECTION
// convention.

import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { I18N_KEYS } from "../../i18n/keys";

import { Button } from "../Button/Button";

import styles from "./MiseMissingState.module.css";

interface MiseMissingStateProps {
  /** Optional override for the "back" link. Defaults to the root
   *  route so users land on the Home (mise status) page. */
  backHref?: string;
}

export function MiseMissingState({ backHref = "/" }: MiseMissingStateProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.missing} role="status">
      <div className={styles.eyebrow}>{t(I18N_KEYS.tools.missing.title)}</div>
      <p className={styles.body}>{t(I18N_KEYS.tools.missing.body)}</p>
      <div className={styles.actions}>
        <Link to={backHref} className={styles.back}>
          <Button variant="secondary" size="sm">
            ← {t(I18N_KEYS.common.back)}
          </Button>
        </Link>
      </div>
    </div>
  );
}
