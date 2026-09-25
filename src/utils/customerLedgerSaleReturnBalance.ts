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
export function saleReturnRunningBalanceCredit(
  grossNetAmount: number,
  /**
   * Part of this return already taken off an invoice's debit through that invoice's
   * `sale_return_adjust` (Rule B payable = net − SRA). Crediting it again here
   * double-counts it (Imran: SR ₹7,506, ₹3,780 on the linked exchange bill,
   * ₹3,726 refunded → ledger showed ₹3,780 Cr instead of ₹0). Default 0 keeps
   * the gross rule for returns applied only by CN voucher (Hanif bhai).
   */
  absorbedInInvoiceDebit = 0,
): number {
  const gross = Math.max(0, Number(grossNetAmount) || 0);
  const absorbed = Math.min(gross, Math.max(0, Number(absorbedInInvoiceDebit) || 0));
  return gross - absorbed;
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
 * When this return’s allocated slice is 0:
 * - CN receipts exist on the linked invoice but FIFO gave them to a sibling SR
 *   (SADAF / AMRIN / Shaista later-row leftover) → consume 0, remaining = net.
 * - No CN receipt on that invoice (billing-absorb / SHAHIN) → fall back to
 *   min(net, linked invoice SRA) so the return is not also credited as pending.
 */
export function saleReturnConsumedForRemaining(params: {
  allocatedAmount: number;
  absorbedOnLinkedInvoice: number;
  linkedSaleCnVoucherTotal?: number;
}): number {
  const allocated = Math.max(0, Number(params.allocatedAmount) || 0);
  if (allocated > 0.005) return allocated;
  const voucherTotal = Number(params.linkedSaleCnVoucherTotal);
  if (Number.isFinite(voucherTotal) && voucherTotal > 0.005) {
    return 0;
  }
  return Math.max(0, Number(params.absorbedOnLinkedInvoice) || 0);
}

export type SaleReturnCnAllocRow = {
  id: string;
  net_amount?: number | null;
  linked_sale_id?: string | null;
  return_date?: string | null;
  created_at?: string | null;
};

export type SrAppliedSlice = {
  saleId: string;
  saleNumber: string | null;
  applied: number;
};

export type SrAppliedInfo = {
  saleId: string;
  saleNumber: string | null;
  applied: number;
  /** Every invoice this return’s credit was allocated to (POS and Sale). */
  slices: SrAppliedSlice[];
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

  const addApplication = (srId: string, saleId: string, take: number) => {
    if (take <= 0) return;
    const saleNumber = linkedSaleNumberById[saleId] || null;
    const current = srAppliedMap[srId];
    if (!current) {
      srAppliedMap[srId] = {
        saleId,
        saleNumber,
        applied: take,
        slices: [{ saleId, saleNumber, applied: take }],
      };
      return;
    }
    current.applied += take;
    const prior = current.slices.find((slice) => slice.saleId === saleId);
    if (prior) prior.applied += take;
    else current.slices.push({ saleId, saleNumber, applied: take });
  };

  const linkedSorted = [...saleReturns]
    .filter((sr) => String(sr.linked_sale_id || "").trim())
    .sort(srChronological);

  for (const sr of linkedSorted) {
    const saleId = String(sr.linked_sale_id || "").trim();
    const remaining = remainingBySale[saleId] || 0;
    if (remaining <= 0) continue;
    const applied = Math.min(remaining, Number(sr.net_amount) || 0);
    addApplication(sr.id, saleId, applied);
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
      addApplication(sr.id, sid, take);
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
