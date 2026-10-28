/**
 * Mix (split) mode for a later customer receipt — Record Payment on the POS
 * dashboard and Payments → Customer Payment Received.
 *
 * A mix receipt is saved as one receipt voucher PER MODE (cash voucher, UPI
 * voucher, …). Each voucher keeps a real payment_method, so the cash drawer,
 * Daily Cashier report, mode filters and the Cash/Bank journal legs stay exact
 * — the same way three separate payments would be recorded.
 */

export const MIX_RECEIPT_METHOD = "mix";

export const MIX_RECEIPT_MODES = [
  { method: "cash", label: "Cash" },
  { method: "upi", label: "UPI" },
  { method: "card", label: "Card" },
  { method: "bank_transfer", label: "Bank" },
] as const;

export type MixReceiptMethod = (typeof MIX_RECEIPT_MODES)[number]["method"];
export type MixReceiptAmounts = Record<MixReceiptMethod, string>;
export type MixReceiptLeg = { method: MixReceiptMethod; amount: number };

export const EMPTY_MIX_RECEIPT_AMOUNTS: MixReceiptAmounts = {
  cash: "",
  upi: "",
  card: "",
  bank_transfer: "",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function toAmount(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
}

/** Non-zero legs in display order. */
export function mixReceiptLegs(amounts: MixReceiptAmounts): MixReceiptLeg[] {
  const legs: MixReceiptLeg[] = [];
  for (const { method } of MIX_RECEIPT_MODES) {
    const amount = toAmount(amounts[method]);
    if (amount > 0) legs.push({ method, amount });
  }
  return legs;
}

export function mixReceiptTotal(amounts: MixReceiptAmounts): number {
  return round2(mixReceiptLegs(amounts).reduce((s, l) => s + l.amount, 0));
}

/**
 * Method to hand the receiving-bank picker / validator: any UPI, card or bank
 * leg in the mix means a receiving bank can be chosen (applied to those legs).
 */
export function mixBankProbeMethod(amounts: MixReceiptAmounts): string {
  return mixReceiptLegs(amounts).some((l) => l.method !== "cash") ? "upi" : "cash";
}

/** Mix must split the received amount exactly (₹0.5 rounding tolerance). */
export function validateMixReceipt(
  amounts: MixReceiptAmounts,
  expectedTotal: number,
): { ok: true; legs: MixReceiptLeg[] } | { ok: false; message: string } {
  const legs = mixReceiptLegs(amounts);
  if (legs.length === 0) {
    return { ok: false, message: "Enter the Cash / UPI / Card / Bank amounts for the mix payment" };
  }
  const total = round2(legs.reduce((s, l) => s + l.amount, 0));
  const expected = round2(Number(expectedTotal) || 0);
  if (Math.abs(total - expected) > 0.5) {
    return {
      ok: false,
      message: `Mix total ₹${total.toLocaleString("en-IN")} must equal the amount received ₹${expected.toLocaleString("en-IN")}`,
    };
  }
  return { ok: true, legs };
}

/**
 * Editing one mix box puts the remainder of `target` into the first box the user
 * has not typed in yet (UPI, Card, Bank, then Cash), so "Cash 3000" on a ₹5552
 * receipt fills UPI 2552 by itself.
 */
export function applyMixAmountEdit(
  amounts: MixReceiptAmounts,
  touched: ReadonlySet<MixReceiptMethod>,
  method: MixReceiptMethod,
  raw: string,
  target: number,
): MixReceiptAmounts {
  const next: MixReceiptAmounts = { ...amounts, [method]: raw };
  const goal = round2(Number(target) || 0);
  if (goal <= 0) return next;
  const fillOrder: MixReceiptMethod[] = ["upi", "card", "bank_transfer", "cash"];
  const fill = fillOrder.find((m) => m !== method && !touched.has(m));
  if (!fill) return next;
  const others = MIX_RECEIPT_MODES.reduce(
    (s, { method: m }) => (m === fill ? s : s + toAmount(next[m])),
    0,
  );
  const remainder = round2(goal - others);
  next[fill] = remainder > 0 ? String(remainder) : "";
  return next;
}

/**
 * Spread mix legs over the settlement lines (opening balance, invoice 1,
 * invoice 2, …) in order: each line takes from the first mode until it runs out,
 * then the next. Returns, per line, the vouchers to write.
 * A line with no cash (fully waived by discount) still gets one zero-amount
 * voucher in the first mode so its discount has somewhere to sit.
 */
export function allocateMixLegsToLines(
  legs: MixReceiptLeg[],
  lineCashAmounts: number[],
): MixReceiptLeg[][] {
  const pool = legs.map((l) => ({ ...l }));
  const fallback = legs[0]?.method ?? "cash";
  return lineCashAmounts.map((rawNeed) => {
    let need = round2(Math.max(0, Number(rawNeed) || 0));
    const out: MixReceiptLeg[] = [];
    for (const leg of pool) {
      if (need <= 0.004) break;
      if (leg.amount <= 0.004) continue;
      const take = round2(Math.min(leg.amount, need));
      leg.amount = round2(leg.amount - take);
      need = round2(need - take);
      out.push({ method: leg.method, amount: take });
    }
    if (out.length === 0) out.push({ method: fallback, amount: 0 });
    return out;
  });
}

const MIX_LABELS: Record<string, string> = Object.fromEntries(
  MIX_RECEIPT_MODES.map((m) => [m.method, m.label]),
);

/** Receipt / WhatsApp text, e.g. `Mix (Cash ₹3,000 + UPI ₹2,552)`. */
export function formatMixReceiptLabel(legs: MixReceiptLeg[]): string {
  const parts = legs.map(
    (l) => `${MIX_LABELS[l.method] ?? l.method} ₹${Math.round(l.amount).toLocaleString("en-IN")}`,
  );
  return `Mix (${parts.join(" + ")})`;
}

/** Suffix for the 2nd, 3rd … voucher of one mix line: B, C, D. */
export function mixVoucherSuffix(index: number): string {
  return index <= 0 ? "" : String.fromCharCode(65 + index);
}
