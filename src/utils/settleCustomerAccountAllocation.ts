/** Same sentinel as Payments / Bulk Advance Adjust. */
export const SETTLE_OPENING_BALANCE_ID = "__opening_balance__";

/** Same floor as CustomerPaymentTab / BulkAdvanceAdjustDialog. */
export const SETTLE_MIN_PENDING_RUPEE = 1;

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export type SettleInvoiceInput = {
  id: string;
  outstanding: number;
};

export type SettleInvoiceAllocation = {
  id: string;
  advance: number;
  cn: number;
  cash: number;
  discount: number;
};

export type SettleAllocation = {
  advanceToOb: number;
  cashToOb: number;
  discountToOb: number;
  invoices: SettleInvoiceAllocation[];
};

function take(pool: number, need: number): number {
  return round2(Math.min(Math.max(0, pool), Math.max(0, need)));
}

/**
 * Settle Customer Account pool split.
 * Order matches Payments / Bulk Adjust: opening balance first (when selected),
 * then invoices by the given array order (caller sorts sale_date ASC).
 *
 * Credit notes never target opening balance (`applyCreditNoteFifoToSale` is sale-id only).
 * Cash is applied before discount on each remaining target.
 */
export function allocateSettleSources(input: {
  openingBalanceRemaining: number;
  invoices: SettleInvoiceInput[];
  advancePool: number;
  cnPool: number;
  cash: number;
  discount: number;
}): SettleAllocation {
  let adv = Math.max(0, round2(input.advancePool));
  let cn = Math.max(0, round2(input.cnPool));
  let cash = Math.max(0, round2(input.cash));
  let disc = Math.max(0, round2(input.discount));
  let ob = Math.max(0, round2(input.openingBalanceRemaining));

  const advanceToOb = take(adv, ob);
  adv = round2(adv - advanceToOb);
  ob = round2(ob - advanceToOb);

  const rows = input.invoices.map((inv) => ({
    id: inv.id,
    remaining: Math.max(0, round2(inv.outstanding)),
    advance: 0,
    cn: 0,
    cash: 0,
    discount: 0,
  }));

  for (const row of rows) {
    const amt = take(adv, row.remaining);
    row.advance = amt;
    adv = round2(adv - amt);
    row.remaining = round2(row.remaining - amt);
  }

  for (const row of rows) {
    const amt = take(cn, row.remaining);
    row.cn = amt;
    cn = round2(cn - amt);
    row.remaining = round2(row.remaining - amt);
  }

  const cashToOb = take(cash, ob);
  cash = round2(cash - cashToOb);
  ob = round2(ob - cashToOb);
  const discountToOb = take(disc, ob);
  disc = round2(disc - discountToOb);

  for (const row of rows) {
    const c = take(cash, row.remaining);
    row.cash = c;
    cash = round2(cash - c);
    row.remaining = round2(row.remaining - c);
    const d = take(disc, row.remaining);
    row.discount = d;
    disc = round2(disc - d);
    row.remaining = round2(row.remaining - d);
  }

  return {
    advanceToOb,
    cashToOb,
    discountToOb,
    invoices: rows.map(({ id, advance, cn: cnAmt, cash: cashAmt, discount }) => ({
      id,
      advance,
      cn: cnAmt,
      cash: cashAmt,
      discount,
    })),
  };
}

export function settleAllocationTotals(plan: SettleAllocation): {
  advance: number;
  cn: number;
  cash: number;
  discount: number;
  total: number;
} {
  const advance =
    plan.advanceToOb + plan.invoices.reduce((s, r) => s + r.advance, 0);
  const cn = plan.invoices.reduce((s, r) => s + r.cn, 0);
  const cash = plan.cashToOb + plan.invoices.reduce((s, r) => s + r.cash, 0);
  const discount =
    plan.discountToOb + plan.invoices.reduce((s, r) => s + r.discount, 0);
  return {
    advance: round2(advance),
    cn: round2(cn),
    cash: round2(cash),
    discount: round2(discount),
    total: round2(advance + cn + cash + discount),
  };
}
