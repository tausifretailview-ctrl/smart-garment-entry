/**
 * Customer Ledger KPI card → transaction-list drill filter.
 * Prefer switching to an existing tab when it already owns that row set.
 */

export type LedgerCardDrillKey =
  | "opening"
  | "invoices"
  | "payments"
  | "advance_adjusted"
  | "advance_received"
  | "advance_balance"
  | "returns"
  | "cn_available";

export type LedgerCardDrillRow = {
  id: string;
  type: string;
  status?: string;
  description?: string;
  /** Booking remaining (amount − used_amount) on advance rows. */
  advanceRemaining?: number;
};

const DRILL_LABELS: Record<LedgerCardDrillKey, string> = {
  opening: "Opening Balance",
  invoices: "Total Sales",
  payments: "Cash / UPI Paid",
  advance_adjusted: "Advance Adjusted",
  advance_received: "Advance Received",
  advance_balance: "Advance Balance",
  returns: "Returns / CR",
  cn_available: "CN Available",
};

export function ledgerCardDrillLabel(key: LedgerCardDrillKey): string {
  return DRILL_LABELS[key];
}

/** Tab to activate for this card (reuse existing strip where possible). */
export function tabForLedgerCardDrill(key: LedgerCardDrillKey): string {
  switch (key) {
    case "payments":
      return "payments";
    case "advance_adjusted":
      return "advance-adjusted";
    case "cn_available":
      // Pending CN pool — closest dedicated surface; also filter returns on transactions
      // when staying on transactions via filterLedgerRowsByCardDrill.
      return "transactions";
    default:
      return "transactions";
  }
}

export function filterLedgerRowsByCardDrill<T extends LedgerCardDrillRow>(
  rows: T[],
  drill: LedgerCardDrillKey | null,
): T[] {
  if (!drill) return rows;
  switch (drill) {
    case "opening":
      return rows.filter((t) => t.id === "opening-balance");
    case "invoices":
      return rows.filter((t) => t.type === "invoice");
    case "payments":
      return rows.filter((t) => t.type === "payment");
    case "advance_adjusted":
      return rows.filter((t) => t.type === "advance_application");
    case "advance_received":
      return rows.filter((t) => t.type === "advance");
    case "advance_balance":
      return rows.filter(
        (t) => t.type === "advance" && Math.max(0, Number(t.advanceRemaining || 0)) > 0.5,
      );
    case "returns":
      return rows.filter((t) => t.type === "return");
    case "cn_available":
      return rows.filter(
        (t) =>
          t.type === "return" &&
          (t.status === "pending" ||
            /\[Pending\]|Partial.*pending/i.test(String(t.description || ""))),
      );
    default:
      return rows;
  }
}
