/**
 * Plan how one customer-level receipt (opening balance / on account) is spread over the
 * customer's open bills, oldest bill first.
 *
 * Why: the "Link" button on Customer Payments could only move a receipt onto ONE bill, and
 * refused when the receipt was bigger than that bill. A ₹27,659 receipt left on an already
 * paid opening balance (KS FOOTWEAR, JAI HIND-KAJUPADA) could never reach the bills, so the
 * Sales Invoice Dashboard kept every bill unpaid while the ledger counted the money.
 *
 * Amounts are whole paise (2 decimals). A bill takes at most its own outstanding; whatever
 * is left after the last bill stays on the customer (`leftover`).
 */
export interface SpreadBill {
  id: string;
  sale_number: string;
  sale_date: string | null;
  net_amount: number | null;
  paid_amount: number | null;
}

export interface SpreadPart {
  saleId: string;
  saleNumber: string;
  amount: number;
}

export interface ReceiptSpreadPlan {
  parts: SpreadPart[];
  leftover: number;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function billOutstanding(bill: Pick<SpreadBill, "net_amount" | "paid_amount">): number {
  return round2(Math.max(0, Number(bill.net_amount || 0) - Number(bill.paid_amount || 0)));
}

export function planReceiptSpread(amount: number, bills: SpreadBill[]): ReceiptSpreadPlan {
  let remaining = round2(Math.max(0, amount));
  const ordered = bills
    .map((bill, idx) => ({ bill, idx }))
    .sort((a, b) => {
      const da = a.bill.sale_date ? new Date(a.bill.sale_date).getTime() : 0;
      const db = b.bill.sale_date ? new Date(b.bill.sale_date).getTime() : 0;
      if (da !== db) return da - db;
      const na = String(a.bill.sale_number || "");
      const nb = String(b.bill.sale_number || "");
      if (na !== nb) return na.localeCompare(nb, undefined, { numeric: true });
      return a.idx - b.idx;
    });

  const parts: SpreadPart[] = [];
  for (const { bill } of ordered) {
    if (remaining < 0.01) break;
    const due = billOutstanding(bill);
    if (due < 0.01) continue;
    const take = round2(Math.min(due, remaining));
    parts.push({ saleId: bill.id, saleNumber: bill.sale_number, amount: take });
    remaining = round2(remaining - take);
  }
  return { parts, leftover: remaining };
}
