import { logError } from "@/lib/errorLogger";

/**
 * One clean-up step after a failed save (delete the receipt just created, put the invoice
 * back, ...). Plan Phase 4, R6.
 *
 * These steps used to be `await supabase.from(...).delete()` with the result ignored: when a
 * clean-up step itself failed, the half-saved record (for example a receipt with no ledger
 * entry, still counted as paid) stayed behind and nobody could see it. A clean-up step must
 * not throw either — that would skip the remaining clean-up and hide the original error — so
 * a failure is written to app_error_logs (Admin Health, operation "rollback:<label>") with the
 * record id, and the next step still runs.
 */
export async function rollbackStep(
  label: string,
  step: () => PromiseLike<unknown>,
  context?: { organizationId?: string; recordId?: string | null },
): Promise<boolean> {
  try {
    const res = await step();
    const err = res && typeof res === "object" && "error" in res ? (res as { error: unknown }).error : null;
    if (err) throw err;
    return true;
  } catch (error) {
    void logError(
      {
        operation: `rollback:${label}`,
        organizationId: context?.organizationId,
        additionalContext: context?.recordId ? { record_id: context.recordId } : undefined,
      },
      error,
    );
    return false;
  }
}
