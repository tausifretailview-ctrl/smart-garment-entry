import { toast } from "sonner";
import { logError } from "@/lib/errorLogger";

/**
 * For an async task started from a click or shortcut without `await` (Plan Phase 4, R6).
 * A failure used to become an unhandled promise rejection: written to the console only, so
 * the cashier saw nothing and nobody else knew. Now it shows an error toast and is written to
 * app_error_logs (Admin Health). Tasks that catch their own errors never reach this.
 */
export function reportIfFails(task: Promise<unknown> | unknown, label: string, opts?: { silent?: boolean }): void {
  if (!task || typeof (task as Promise<unknown>).then !== "function") return;
  (task as Promise<unknown>).then(undefined, (err: unknown) => {
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Something went wrong";
    if (!opts?.silent) toast.error(`Could not ${label}`, { description: message.slice(0, 200) });
    void logError({ operation: `unhandled:${label}` }, err);
  });
}
