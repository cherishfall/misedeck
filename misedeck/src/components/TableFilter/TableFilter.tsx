// TableFilter — the shared text-filter input for data tables (issue
// #106). Pairs with `useTableFilter`: the page owns the hook, this
// component renders the input. A Clear button appears once the field
// has text, following the version-center filter's clear pattern.
// Callers can hide that built-in Clear (`hideClear`) when a surrounding
// region owns resetting — the Tools page version-management region keeps
// one full-reset Clear next to the filter instead (beta13, issue #188).

import { useTranslation } from "react-i18next";

import { I18N_KEYS } from "../../i18n/keys";

import styles from "./TableFilter.module.css";

export interface TableFilterProps {
  /** Controlled query value. */
  value: string;
  onChange: (value: string) => void;
  /** i18n-resolved placeholder naming what is being filtered. */
  placeholder: string;
  /** Base test id; the clear button appends `-clear`. */
  testId: string;
  /** Hide the built-in per-field Clear button (default false). The
   *  surrounding UI takes over clearing — the four pages using the
   *  filter standalone keep the default. */
  hideClear?: boolean;
}

export function TableFilter({ value, onChange, placeholder, testId, hideClear }: TableFilterProps) {
  const { t } = useTranslation();
  return (
    <span className={styles.filter}>
      <input
        type="text"
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        autoComplete="off"
        data-testid={testId}
      />
      {!hideClear && value.length > 0 && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange("")}
          data-testid={`${testId}-clear`}
        >
          {t(I18N_KEYS.common.clear)}
        </button>
      )}
    </span>
  );
}
