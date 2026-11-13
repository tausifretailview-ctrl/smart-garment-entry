import { isChunkLoadError } from "@/lib/chunkLoadRetry";
import { logError } from "@/lib/errorLogger";

/**
 * Unhandled promise rejections were only written to the browser console, so a failed save or
 * print nobody awaited was invisible to the shop and to support (Plan Phase 4, R6). This writes
 * them to app_error_logs (operation "unhandled_rejection", Admin Health): page-file load errors
 * are skipped (the app's own deploy recovery handles those), the same message is reported once,
 * and at most 5 per page load so a failing loop cannot flood the log.
 */
const MAX_REPORTS = 5;
const seen = new Set<string>();

export function rejectionMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name || "Error";
  if (typeof reason === "string") return reason;
  if (reason && typeof reason === "object" && "message" in reason) return String((reason as { message: unknown }).message);
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

/** True when this rejection should be written (first time, not a chunk error, under the cap). */
export function claimRejectionReport(reason: unknown): boolean {
  if (isChunkLoadError(reason)) return false;
  // Aborted fetches (navigating away, React Query cancel) are not failures.
  if (reason instanceof DOMException && reason.name === "AbortError") return false;
  const key = rejectionMessage(reason).slice(0, 300);
  if (seen.has(key) || seen.size >= MAX_REPORTS) return false;
  seen.add(key);
  return true;
}

export function reportUnhandledRejection(reason: unknown): void {
  if (!claimRejectionReport(reason)) return;
  void logError(
    {
      operation: "unhandled_rejection",
      additionalContext: { path: typeof window !== "undefined" ? window.location.pathname : null },
    },
    reason instanceof Error ? reason : new Error(rejectionMessage(reason)),
  );
}

/** Test hook. */
export function resetUnhandledRejectionReports(): void {
  seen.clear();
}
