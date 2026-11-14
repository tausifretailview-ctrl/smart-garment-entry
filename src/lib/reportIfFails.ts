import { toast } from "sonner";
import { logError } from "@/lib/errorLogger";

/**
 * For an async task started from a click or shortcut without `await` (Plan Phase 4, R6).
 * A failure used to become an unhandled promise rejection: written to the console only, so
 * the cashier saw nothing and nobody else knew. Now it shows an error toast and is written to
 * app_error_logs (Admin Health; rate limited). Tasks that catch their own errors never reach this.
 */
/** The same failure (label + message) is logged at most once a minute, and 30 per page load. */
const LOG_AGAIN_AFTER_MS = 60_000;
const MAX_LOGS_PER_PAGE_LOAD = 30;
const lastLoggedAt = new Map<string, number>();
let logsWritten = 0;

/** True when this failure should be written to app_error_logs (the toast is always shown). */
export function claimFailureLog(label: string, message: string, now = Date.now()): boolean {
  const key = `${label}\u0000${message.slice(0, 200)}`;
  const last = lastLoggedAt.get(key);
  if (last !== undefined && now - last < LOG_AGAIN_AFTER_MS) return false;
  if (logsWritten >= MAX_LOGS_PER_PAGE_LOAD) return false;
  lastLoggedAt.set(key, now);
  logsWritten += 1;
  return true;
}

/** Test hook. */
export function resetFailureLogClaims(): void {
  lastLoggedAt.clear();
  logsWritten = 0;
}

export function reportIfFails(task: Promise<unknown> | unknown, label: string, opts?: { silent?: boolean }): void {
  if (!task || typeof (task as Promise<unknown>).then !== "function") return;
  (task as Promise<unknown>).then(undefined, (err: unknown) => {
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong";
    if (!opts?.silent) toast.error(`Could not ${label}`, { description: message.slice(0, 200) });
    // A save that keeps failing must not fill the error log.
    if (claimFailureLog(label, message)) void logError({ operation: `unhandled:${label}` }, err);
  });
}
