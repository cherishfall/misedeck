// Pure formatting for the root error boundary's summary and details
// (issue #214). Kept out of the class component so the text shaping is
// unit-testable without a DOM harness (docs/agents/conventions.md).

/** One-line summary: `Name: message` for an Error, the text itself for
 *  a thrown string, a JSON rendering for anything else. Empty when the
 *  value carries no describable content — the UI substitutes its own
 *  translated fallback rather than interpolating an empty line. */
export function formatErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    return [error.name.trim(), error.message.trim()].filter(Boolean).join(": ");
  }
  if (typeof error === "string") return error.trim();
  if (error === null || error === undefined) return "";
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    // Circular structures cannot be serialized; String() still answers.
    return String(error);
  }
}

/** Diagnostic detail behind the disclosure: the stack when there is
 *  one, then React's component stack. Never throws on odd payloads. */
export function formatErrorDetails(
  error: unknown,
  componentStack?: string | null,
): string {
  const summary = formatErrorSummary(error);
  const stack =
    error instanceof Error && typeof error.stack === "string" ? error.stack : "";
  return [stack || summary, componentStack?.trim() ?? ""]
    .filter((part) => part.length > 0)
    .join("\n\n");
}
