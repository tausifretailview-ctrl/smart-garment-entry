/**
 * Pure helpers for Customer Ledger sale-return running-balance rules.
 * Kept out of the 6k-line component so Hanif-class regressions are unit-testable.
 */

/**
 * Advance (credit) applied to the running Balance column for a visible sale-return row.
 * Always the return's GROSS `net_amount` — matching Credit-column `displayCredit`.
 * Remaining CN availability must NOT be used here (that double-deducts applied CN
 * when the linked invoice still debits gross).
 */
export function saleReturnRunningBalanceCredit(grossNetAmount: number): number {
  return Math.max(0, Number(grossNetAmount) || 0);
}

/**
 * Amount that feeds recon `saleReturns` / CN Available from a non-memo return row
 * (`transaction.credit`): remaining after CN application / SRA absorption.
 */
export function saleReturnRemainingCredit(params: {
  grossNetAmount: number;
  consumedAmount: number;
}): number {
  return Math.max(0, Number(params.grossNetAmount) || 0) - Math.max(0, Number(params.consumedAmount) || 0);
}

/**
 * How much of a sale return is already consumed for recon remaining / CN available.
 *
 * Prefer FIFO-allocated CN voucher amounts so two returns that share one invoice
 * SRA are not each charged the full `sales.sale_return_adjust` (Maseera: SR/160
 * remaining ₹4,150, not ₹3,150).
 *
 * When no CN voucher matched this return (billing-absorb / SHAHIN — pending CN
 * applied on the bill with no `credit_note_adjustment` receipt), fall back to
 * min(net, linked invoice SRA) so the return is not also credited as pending.
 */
export function saleReturnConsumedForRemaining(params: {
  allocatedAmount: number;
  absorbedOnLinkedInvoice: number;
}): number {
  const allocated = Math.max(0, Number(params.allocatedAmount) || 0);
  if (allocated > 0.005) return allocated;
  return Math.max(0, Number(params.absorbedOnLinkedInvoice) || 0);
}

export type SaleReturnCnAllocRow = {
  id: string;
  net_amount?: number | null;
  linked_sale_id?: string | null;
  return_date?: string | null;
  created_at?: string | null;
};

export type SrAppliedInfo = {
  saleId: string;
  saleNumber: string | null;
  applied: number;
};

function srChronological(a: SaleReturnCnAllocRow, b: SaleReturnCnAllocRow): number {
  return (
    new Date(a.return_date || 0).getTime() - new Date(b.return_date || 0).getTime() ||
    new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
}

/**
 * Attribute credit_note_adjustment / invoice SRA amounts onto sale returns.
 *
 * Pass 1: CN on `linked_sale_id` (FIFO by return date).
 * Pass 2: leftover CN on any sale — including **linked** SRs that still have
 * unused net. `applyCreditNoteFifoToSale` overwrites `linked_sale_id` to the
 * last invoice, so pass-1-only left Almas Motiwala remaining at ₹6,750 after
 * ₹4,700 was applied to an earlier invoice (refund button then offered that
 * phantom after the real ₹2,050 CAB was paid out).
 */
export function allocateCnAdjustmentsToSaleReturns(
  saleReturns: SaleReturnCnAllocRow[],
  cnBySaleId: Record<string, number>,
  linkedSaleNumberById: Record<string, string | null | undefined> = {},
): Record<string, SrAppliedInfo> {
  const srAppliedMap: Record<string, SrAppliedInfo> = {};
  const remainingBySale: Record<string, number> = { ...cnBySaleId };

  const linkedSorted = [...saleReturns]
    .filter((sr) => String(sr.linked_sale_id || "").trim())
    .sort(srChronological);

  for (const sr of linkedSorted) {
    const saleId = String(sr.linked_sale_id || "").trim();
    const remaining = remainingBySale[saleId] || 0;
    if (remaining <= 0) continue;
    const applied = Math.min(remaining, Number(sr.net_amount) || 0);
    srAppliedMap[sr.id] = {
      saleId,
      saleNumber: linkedSaleNumberById[saleId] || null,
      applied,
    };
    remainingBySale[saleId] = remaining - applied;
  }

  const leftoverSorted = [...saleReturns].sort(srChronological);
  const saleIdsWithRemainder = Object.keys(remainingBySale).filter(
    (sid) => (remainingBySale[sid] || 0) > 0,
  );
  for (const sr of leftoverSorted) {
    let srRemaining =
      (Number(sr.net_amount) || 0) - (srAppliedMap[sr.id]?.applied || 0);
    if (srRemaining <= 0) continue;
    for (const sid of saleIdsWithRemainder) {
      const avail = remainingBySale[sid] || 0;
      if (avail <= 0) continue;
      const take = Math.min(avail, srRemaining);
      if (take <= 0) continue;
      if (!srAppliedMap[sr.id]) {
        srAppliedMap[sr.id] = {
          saleId: sid,
          saleNumber: linkedSaleNumberById[sid] || null,
          applied: take,
        };
      } else {
        srAppliedMap[sr.id].applied += take;
      }
      remainingBySale[sid] = avail - take;
      srRemaining -= take;
      if (srRemaining <= 0) break;
    }
  }

  return srAppliedMap;
}

/** Hanif bhai walk: column totals gap must equal last running balance. */
export function walkLedgerSignedBalance(
  rows: Array<{ debit?: number; credit?: number; displayDebit?: number; displayCredit?: number; informational?: boolean }>,
): number {
  let bal = 0;
  for (const r of rows) {
    if (r.informational) continue;
    const d = r.displayDebit ?? r.debit ?? 0;
    const c = r.displayCredit ?? r.credit ?? 0;
    bal += d - c;
  }
  return bal;
}
