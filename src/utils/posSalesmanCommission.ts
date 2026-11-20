/**
 * Salesman commission rows for a saved bill (POS, phone / offline POS, Sale Bill).
 * New and edited bills alike: the bill's pending rows are rebuilt from the bill
 * (syncSaleCommissions), so an edit, a held bill finished later or a per-line salesman
 * all end up on the Salesman Commission page. Paid rows are never touched.
 * Non-blocking: errors are logged, never thrown, so the sale itself is never affected.
 */
import { logError } from "@/lib/errorLogger";
import { syncSaleCommissions } from "@/utils/syncSaleCommissions";

export async function recordSaleCommission(input: {
  organizationId: string;
  saleId: string;
  /** Already-loaded active staff / commission rules (desktop POS caches both); read when absent. */
  employees?: unknown[];
  rules?: unknown[];
}): Promise<void> {
  try {
    await syncSaleCommissions(input.organizationId, [input.saleId], {
      employees: input.employees,
      rules: input.rules,
    });
  } catch (err) {
    // Non-blocking for the bill, but visible in Admin Health (commission reports would miss it).
    void logError(
      { operation: "sale:salesman-commission", organizationId: input.organizationId, additionalContext: { sale_id: input.saleId } },
      err,
    );
  }
}

/** POS / phone POS callers (bill fields are read from the saved bill itself). */
export async function recordPosSalesmanCommission(input: {
  organizationId: string;
  saleId: string;
  saleNumber?: string;
  saleDate?: string;
  customerName?: string;
  salesmanName?: string;
  totalNetAmount?: number;
  employees?: unknown[];
  rules?: unknown[];
}): Promise<void> {
  await recordSaleCommission(input);
}
