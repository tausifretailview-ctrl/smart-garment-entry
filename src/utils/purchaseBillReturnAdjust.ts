/** Purchase return credit applied to a purchase bill (Adjust CN → bill). */

export type PurchaseBillReturnAdjustInfo = {
  purchase_return_adjust: number;
  pr_adjust_date: string | null;
};

export type PurchaseReturnLinkedRow = {
  linked_bill_id: string | null;
  net_amount: number | null;
  credit_available_balance?: number | null;
  credit_status?: string | null;
  return_date?: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Return credit that was booked straight into `purchase_bills.paid_amount`
 * (Adjust CN → bill) but has NO credit-note voucher behind it.
 *
 * Those returns are surfaced separately in the supplier ledger as their own
 * "Purchase Return (Adj. Against Bill)" debit row, so the amount must be
 * removed from the bill's "paid" figure or the same money is subtracted twice.
 * Returns that DO have a CN voucher are already netted off the CN gross, so
 * they must NOT be excluded here.
 */
export function buildUnvoucheredReturnAdjustByBillId(
  returns: Array<{
    linked_bill_id?: string | null;
    credit_status?: string | null;
    net_amount?: number | null;
    credit_note_id?: string | null;
  }>,
  creditNoteVoucherIds: Set<string>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const pr of returns || []) {
    if (!pr?.linked_bill_id) continue;
    if (String(pr.credit_status || "").toLowerCase() !== "adjusted") continue;
    if (pr.credit_note_id && creditNoteVoucherIds.has(pr.credit_note_id)) continue;
    const amt = Math.max(0, Number(pr.net_amount) || 0);
    if (amt <= 0.005) continue;
    map.set(pr.linked_bill_id, round2((map.get(pr.linked_bill_id) || 0) + amt));
  }
  return map;
}

/** Amount of this return already applied to its linked bill. */
export function purchaseReturnAppliedToBillAmount(row: PurchaseReturnLinkedRow): number {
  if (!row.linked_bill_id) return 0;
  const status = String(row.credit_status || "").toLowerCase();
  if (status !== "adjusted" && status !== "partially_adjusted") return 0;

  const net = Math.max(0, Number(row.net_amount || 0));
  if (net <= 0.005) return 0;

  const remainder = row.credit_available_balance;
  if (remainder == null || remainder === undefined) return round2(net);
  return round2(Math.max(0, net - Number(remainder)));
}

/** Sum applied return credit per purchase bill id. */
export function buildPurchaseReturnAdjustByBillId(
  returns: PurchaseReturnLinkedRow[],
): Record<string, PurchaseBillReturnAdjustInfo> {
  const acc = new Map<string, { amount: number; dates: string[] }>();

  for (const pr of returns) {
    const billId = pr.linked_bill_id;
    if (!billId) continue;

    const applied = purchaseReturnAppliedToBillAmount(pr);
    if (applied <= 0.005) continue;

    const entry = acc.get(billId) ?? { amount: 0, dates: [] };
    entry.amount = round2(entry.amount + applied);
    const ymd = String(pr.return_date || "").slice(0, 10);
    if (ymd) entry.dates.push(ymd);
    acc.set(billId, entry);
  }

  const out: Record<string, PurchaseBillReturnAdjustInfo> = {};
  for (const [billId, { amount, dates }] of acc) {
    dates.sort();
    out[billId] = {
      purchase_return_adjust: amount,
      pr_adjust_date: dates[0] ?? null,
    };
  }
  return out;
}
