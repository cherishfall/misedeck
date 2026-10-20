// DirectoryUnavailableBanner — the single, app-level notice for a
// directory context that no longer exists (issue #214).
//
// The provider probes every incoming directory, falls back to Global on
// a miss, and parks the failed path here. One banner replaces the
// per-page stderr blocks: the user sees "this directory is unavailable"
// with the path that failed and the reselect action. Choosing
// directory is primary (ui-ux-rules.md: one global action, one visual
// role).

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";
import { useDirectory } from "../../state/directoryContext";
import { pickDirectory } from "../../directory/pickDirectory";

import { Banner } from "../Banner/Banner";
import { Button } from "../Button/Button";

import styles from "./DirectoryUnavailableBanner.module.css";

export function DirectoryUnavailableBanner() {
  const { t } = useTranslation();
  const { unavailablePath, dismissUnavailable, setDirectory } = useDirectory();

  if (unavailablePath === null) return null;

  return (
    <div className={styles.wrap}>
      <Banner
        tone="warning"
        label={t(I18N_KEYS.directory.unavailableLabel)}
        action={
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void pickDirectory(t, setDirectory)}
              data-testid="directory-unavailable-pick"
            >
              {t(I18N_KEYS.directory.pickerLabel)}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissUnavailable}
              data-testid="directory-unavailable-dismiss"
            >
              {t(I18N_KEYS.directory.unavailableDismiss)}
            </Button>
          </>
        }
      >
        {t(I18N_KEYS.directory.unavailableBody, { path: unavailablePath })}
      </Banner>
    </div>
  );
}
