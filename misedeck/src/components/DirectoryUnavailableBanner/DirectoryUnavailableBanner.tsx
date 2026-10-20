// DirectoryUnavailableBanner — the single, app-level notice for a
// directory context that no longer exists (issue #214).
//
// The provider probes every incoming directory, falls back to Global on
// a miss, and parks the failed path here. One banner replaces the
// per-page stderr blocks: the user sees "this directory is unavailable"
// with the path that failed and the reselect action. Choosing
// directory is primary (ui-ux-rules.md: one global action, one visual
// role).

import { useState } from "react";
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
  // A dialog that failed to open says so inside this banner (issue
  // #228) — the banner is already the notice channel for "the directory
  // did not work", and it carries `role="status"`, so the copy is
  // announced without a second live region. A cancel stays silent.
  const [pickError, setPickError] = useState<string | null>(null);

  if (unavailablePath === null) return null;

  const onPick = () => {
    void pickDirectory(
      t,
      (picked) => {
        setPickError(null);
        setDirectory(picked);
      },
      { onError: setPickError },
    );
  };

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
              onClick={onPick}
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
        {pickError && (
          <p
            className={styles.pickError}
            data-testid="directory-unavailable-pick-error"
          >
            {pickError}
          </p>
        )}
      </Banner>
    </div>
  );
}
