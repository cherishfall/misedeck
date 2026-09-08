// KeyForm — the shared form keyboard pattern (issue #109).
//
// Every form site in the app (tools install/link/switch, the version
// query inputs, env row editor + add form, the task edit form, settings
// row editor + add form) wraps its inputs and action buttons in one of
// these instead of a bare <div>/<span>:
//
//   * Enter submits via a real <form onSubmit>. A visually hidden submit
//     button guarantees implicit submission fires even in multi-input
//     forms (without one, browsers only submit single-input forms).
//   * Escape reverts the draft to its baseline via `onRevert` — what
//     "baseline" means is the site's call: reset to the row's values,
//     run the Cancel action, or clear the fields.
//
// `submitDisabled` mirrors the primary button's disabled state so Enter
// cannot fire a submit the button would refuse.

import type { FormEvent, KeyboardEvent, ReactNode } from "react";

interface KeyFormProps {
  onSubmit: () => void;
  onRevert?: () => void;
  /** Mirror the submit button's disabled state. */
  submitDisabled?: boolean;
  className?: string;
  testId?: string;
  children?: ReactNode;
}

export function KeyForm({
  onSubmit,
  onRevert,
  submitDisabled = false,
  className,
  testId,
  children,
}: KeyFormProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!submitDisabled) onSubmit();
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Escape" && onRevert) {
      e.preventDefault();
      e.stopPropagation();
      onRevert();
    }
  };
  return (
    <form
      className={className}
      data-testid={testId}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
    >
      {children}
      <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
    </form>
  );
}

interface SuggestionsProps {
  /** The datalist id an input references via its `list` attribute. */
  id: string;
  options: string[];
}

/**
 * A native <datalist> fed from live page data (installed versions, known
 * tool names, existing env keys, task names — issue #109). Renders
 * nothing when there are no options so empty states ship no dead node.
 */
export function Suggestions({ id, options }: SuggestionsProps) {
  if (options.length === 0) return null;
  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
  );
}
