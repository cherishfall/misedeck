// Jump-to-page guard (issue #280): the Jump button and the input's Enter
// path share this one decision, so the disabled attribute and the key
// handler can never disagree about whether the draft is actionable.
//
// A target must be a whole number inside [1, totalPages]. Empty drafts,
// fractions, NaN/Infinity and out-of-range values all return null — the
// caller renders the button disabled and turns Enter into a no-op.

export function parseJumpTarget(value: string, totalPages: number): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < 1 || n > totalPages) return null;
  return n;
}
