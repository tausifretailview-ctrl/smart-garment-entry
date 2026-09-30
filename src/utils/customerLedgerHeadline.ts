/**
 * Customer Ledger headline: one balance, in plain words, that adds up from the table.
 *
 * The table's running balance is the only figure a user can check line by line, so the
 * headline is its closing balance. The three summary lines are built from each row's
 * change in running balance, so Opening + Bills − Paid/credited + Refunds + Other always
 * equals the headline exactly, whatever rules the row builder uses.
 *
 * `getCustomerAccountState` is still computed, but only as a check: when it disagrees
 * with the table the page flags "Balance needs checking" instead of showing a second number.
 */

export type LedgerHeadlineRow = {
  id: string;
  type: string;
  balance: number;
};

export type LedgerHeadline = {
  kind: "owes" | "credit" | "settled";
  /** Always positive; read with `label`. */
  amount: number;
  /** Signed: > 0 customer owes you, < 0 you owe the customer. */
  signed: number;
  label: string;
};

/** Balances within half a rupee are shown as settled. */
const SETTLED_EPS = 0.5;

export function ledgerHeadline(closingBalance: number): LedgerHeadline {
  const signed = Math.round((Number(closingBalance) || 0) * 100) / 100;
  if (signed > SETTLED_EPS) {
    return { kind: "owes", amount: signed, signed, label: "Customer owes you" };
  }
  if (signed < -SETTLED_EPS) {
    return { kind: "credit", amount: -signed, signed, label: "You owe customer" };
  }
  return { kind: "settled", amount: 0, signed: 0, label: "Settled" };
}

export type LedgerThreeLineSummary = {
  opening: number;
  /** Increase from bills. */
  bills: number;
  /** Decrease from payments, returns, credit notes, advances. */
  paidCredited: number;
  /** Increase from money paid back to the customer. */
  refunds: number;
  /** Any other increase (e.g. a balance adjustment). */
  other: number;
  /** opening + bills − paidCredited + refunds + other. Equals the table's last row. */
  balance: number;
};

const REFUND_TYPES = new Set(["refund", "cn_refund", "adv_refund"]);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ledgerThreeLineSummary(rows: LedgerHeadlineRow[]): LedgerThreeLineSummary {
  let opening = 0;
  let bills = 0;
  let paidCredited = 0;
  let refunds = 0;
  let other = 0;
  let prev = 0;

  for (const row of rows) {
    const bal = Number(row.balance) || 0;
    if (row.id === "opening-balance") {
      opening += bal - prev;
      prev = bal;
      continue;
    }
    const delta = bal - prev;
    prev = bal;
    if (Math.abs(delta) < 0.005) continue;
    if (row.type === "invoice" && delta > 0) bills += delta;
    else if (REFUND_TYPES.has(row.type) && delta > 0) refunds += delta;
    else if (delta < 0) paidCredited += -delta;
    else other += delta;
  }

  return {
    opening: round2(opening),
    bills: round2(bills),
    paidCredited: round2(paidCredited),
    refunds: round2(refunds),
    other: round2(other),
    balance: round2(prev),
  };
}

export type LedgerBalanceCheck = {
  /** True when the account check disagrees with the table by more than ₹1. */
  needsChecking: boolean;
  tableBalance: number;
  checkBalance: number | null;
  difference: number;
};

export function ledgerBalanceCheck(params: {
  tableBalance: number;
  checkBalance: number | null | undefined;
  checkLoading?: boolean;
}): LedgerBalanceCheck {
  const table = round2(Number(params.tableBalance) || 0);
  const raw = params.checkBalance;
  if (params.checkLoading || raw == null || Number.isNaN(Number(raw))) {
    return { needsChecking: false, tableBalance: table, checkBalance: null, difference: 0 };
  }
  const check = round2(Number(raw));
  const difference = round2(check - table);
  return {
    needsChecking: Math.abs(difference) > 1,
    tableBalance: table,
    checkBalance: check,
    difference,
  };
}
