/**
 * Detect and present Postgres statement-timeout errors (SQLSTATE 57014).
 *
 * Supabase / PostgREST surface this inconsistently: sometimes as a
 * PostgrestError with `code === "57014"`, sometimes only as the message
 * `canceling statement due to statement timeout` on `message`, `details`,
 * or `hint`. Detection must handle all three, plus null / undefined /
 * strings / Error instances, without ever throwing.
 */

const TIMEOUT_MSG_RE = /canceling statement due to statement timeout/i;

function stringFieldContainsTimeout(value: unknown): boolean {
  return typeof value === "string" && TIMEOUT_MSG_RE.test(value);
}

/** True when a Supabase/PostgREST error is a Postgres statement timeout. */
export function isStatementTimeout(error: unknown): boolean {
  if (error == null) return false;

  if (typeof error === "string") {
    return TIMEOUT_MSG_RE.test(error);
  }

  if (typeof error !== "object") return false;

  const e = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  if (e.code === "57014") return true;

  return (
    stringFieldContainsTimeout(e.message) ||
    stringFieldContainsTimeout(e.details) ||
    stringFieldContainsTimeout(e.hint)
  );
}

export type TimeoutPresentation = { title: string; message: string };

/**
 * User-facing copy for a timed-out query. `context` optionally names what
 * was loading (e.g. "Purchase Bills"). The message never mentions the
 * word "timeout", the SQLSTATE, or the raw Postgres string.
 */
export function statementTimeoutMessage(context?: string): TimeoutPresentation {
  const trimmed = context?.trim();
  const lead = trimmed && trimmed.length > 0 ? `${trimmed} is` : "This is";
  return {
    title: "Taking too long to load",
    message: `${lead} more data than we can load at once. Try a shorter date range or add a filter.`,
  };
}