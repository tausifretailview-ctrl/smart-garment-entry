/**
 * Reconcile a per-invoice pending list against the customer's true outstanding.
 *
 * Why this exists:
 *   Receipts are sometimes posted to already-closed invoices (wrong reference
 *   on the receipt record). The customer's NET balance is still correct via
 *   the ledger, but the per-invoice `paid_amount` of the open invoices never
 *   sees that money, so a bill-wise list over-states what is actually due.
 *
 *   Customer-facing reminders must never show a bill-wise breakdown whose sum
 *   disagrees with the Total Outstanding line. This helper absorbs the excess
 *   into the open invoices (FIFO — oldest open first) so the two numbers
 *   always reconcile.
 *
 * Inputs:
 *   - invoices: open invoices as computed today (each with a `balance` > 0)
 *   - trueBillWisePending: outstanding − openingBalance (the authoritative
 *     amount that ALL open invoices together should still owe)
 *
 * Behavior:
 *   - If Σ balance ≈ trueBillWisePending: returned list is unchanged.
 *   - If Σ balance > trueBillWisePending: the excess is absorbed from the
 *     oldest invoice first; invoices that fully absorb are dropped.
 *   - If Σ balance < trueBillWisePending: returned list is unchanged
 *     (the shortfall represents opening-balance / pre-system dues that the
 *     caller surfaces separately).
 */
export interface BillWiseInvoice {
  id: string;
  sale_date: string | Date;
  balance: number;
  [key: string]: unknown;
}

export interface ReconcileResult<T extends BillWiseInvoice> {
  invoices: T[];
  excessAbsorbed: number;
  hadExcess: boolean;
}

export function reconcileBillWisePending<T extends BillWiseInvoice>(
  invoices: T[],
  trueBillWisePending: number,
): ReconcileResult<T> {
  const billWiseSum = invoices.reduce((s, inv) => s + (inv.balance || 0), 0);
  const excess = Math.round(billWiseSum - Math.max(0, trueBillWisePending));

  if (excess < 1) {
    return { invoices, excessAbsorbed: 0, hadExcess: false };
  }

  // Oldest first (FIFO). Stable sort by sale_date ascending; preserve original
  // order for ties.
  const indexed = invoices.map((inv, idx) => ({ inv, idx }));
  indexed.sort((a, b) => {
    const da = new Date(a.inv.sale_date as string).getTime();
    const db = new Date(b.inv.sale_date as string).getTime();
    if (da !== db) return da - db;
    return a.idx - b.idx;
  });

  let remaining = excess;
  const absorbedById = new Map<string, number>();
  for (const { inv } of indexed) {
    if (remaining <= 0) break;
    const take = Math.min(inv.balance, remaining);
    absorbedById.set(inv.id, take);
    remaining -= take;
  }

  const reduced = invoices
    .map((inv) => {
      const absorbed = absorbedById.get(inv.id) || 0;
      if (!absorbed) return inv;
      return { ...inv, balance: Math.max(0, inv.balance - absorbed) };
    })
    .filter((inv) => inv.balance >= 1) as T[];

  return { invoices: reduced, excessAbsorbed: excess - Math.max(0, remaining), hadExcess: true };
}
