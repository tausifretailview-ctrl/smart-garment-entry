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
 * Return credit booked straight into `purchase_bills.paid_amount` (Adjust CN → bill),
 * per bill. The supplier ledger strips it from "Payment at purchase" because the
 * return already shows as its own CN / purchase-return debit row (full amount).
 * Applies to returns with or without a CN voucher.
 */
export function buildAppliedReturnAdjustByBillIdMap(
  returns: PurchaseReturnLinkedRow[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const [billId, info] of Object.entries(buildPurchaseReturnAdjustByBillId(returns || []))) {
    map.set(billId, info.purchase_return_adjust);
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
