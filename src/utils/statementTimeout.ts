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
 * User-facing copy for a timed-out READ (query). The message never mentions
 * the word "timeout", the SQLSTATE, or the raw Postgres string.
 */
export function statementTimeoutMessage(): TimeoutPresentation {
  return {
    title: "Taking too long to load",
    message:
      "This is more data than we can load at once. Try a shorter date range or add a filter.",
  };
}

/**
 * User-facing copy for a timed-out WRITE (mutation). A 57014 came back from
 * the server, which means Postgres cancelled the statement and rolled the
 * transaction back — nothing was saved. Say so explicitly so a cashier
 * doesn't re-enter a sale and create a duplicate.
 */
export function statementTimeoutMutationMessage(): TimeoutPresentation {
  return {
    title: "Couldn't complete that",
    message:
      "The server took too long and nothing was saved. Refresh the page and try again.",
  };
}