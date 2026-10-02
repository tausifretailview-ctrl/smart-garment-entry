// Customer app (customer-app edge function) — pure helpers, no Deno APIs, so Vitest covers them.

/** Last 10 digits of a phone number ("" when fewer than 10 digits). */
export function phoneLast10(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** "******8772" — never echo a full number back to an unauthenticated caller. */
export function maskPhone(phone: string | null | undefined): string {
  const p = phoneLast10(phone);
  return p ? `******${p.slice(-4)}` : "";
}

/** Shop subdomain label, lower-case; "" when invalid. */
export function cleanSubdomain(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{1,63}$/.test(s) ? s : "";
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Taxable value + GST of one bill line (line amount is GST-inclusive unless taxType is exclusive). */
export function lineTax(
  amount: number,
  gstPercent: number,
  taxType: string | null | undefined,
): { taxable: number; tax: number } {
  const amt = Number(amount) || 0;
  const gst = Math.max(0, Number(gstPercent) || 0);
  if (String(taxType ?? "").toLowerCase() === "exclusive") {
    return { taxable: round2(amt), tax: round2((amt * gst) / 100) };
  }
  const taxable = round2((amt * 100) / (100 + gst));
  return { taxable, tax: round2(amt - taxable) };
}

export type CustomerTxn = {
  date: string;
  kind: "bill" | "payment" | "return";
  ref: string;
  amount: number;
  /** Bills only: amount still unpaid on this bill. */
  due?: number;
  saleId?: string;
  note?: string;
};

type SaleLite = {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount: number | null;
  paid_amount: number | null;
};
type ReceiptLite = {
  voucher_number: string;
  voucher_date: string;
  total_amount: number | null;
  payment_method: string | null;
};
type ReturnLite = {
  return_number: string | null;
  return_date: string;
  net_amount: number | null;
  original_sale_number: string | null;
};

/**
 * Activity list for the customer (newest first): bills, payments received after the bill,
 * and sale returns. The closing balance shown to the customer comes from the canonical
 * financial snapshot, not from summing this list.
 */
export function buildCustomerTransactions(
  sales: SaleLite[],
  receipts: ReceiptLite[],
  returns: ReturnLite[],
): CustomerTxn[] {
  const rows: CustomerTxn[] = [];
  for (const s of sales) {
    const amount = round2(Number(s.net_amount) || 0);
    rows.push({
      date: s.sale_date,
      kind: "bill",
      ref: s.sale_number,
      amount,
      due: Math.max(0, round2(amount - (Number(s.paid_amount) || 0))),
      saleId: s.id,
    });
  }
  for (const r of receipts) {
    rows.push({
      date: r.voucher_date,
      kind: "payment",
      ref: r.voucher_number,
      amount: round2(Number(r.total_amount) || 0),
      note: r.payment_method ?? undefined,
    });
  }
  for (const r of returns) {
    rows.push({
      date: r.return_date,
      kind: "return",
      ref: r.return_number || "Return",
      amount: round2(Number(r.net_amount) || 0),
      note: r.original_sale_number ? `Against ${r.original_sale_number}` : undefined,
    });
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Simple sliding-window limiter (per edge instance; DB checks back it up). */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}
