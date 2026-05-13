import type { CustomerAuditBundle } from "@/utils/customerAuditBundle";
import { buildAuditRows, type AuditRow } from "@/utils/customerAuditBundle";

const EPS = 0.02;

export type ActivityCategory =
  | "opening"
  | "invoice"
  | "invoice_return_credit"
  | "return"
  | "payment"
  | "credit_note"
  | "refund_to_customer"
  | "advance"
  | "advance_refund"
  | "adjustment"
  | "memo";

/** Sale returns absorbed into an invoice (POS) — omit duplicate credit (matches buildAuditRows). */
function skipSaleReturnInBaseAudit(sr: { credit_status?: string | null; linked_sale_id?: string | null }): boolean {
  const cs = String(sr.credit_status || "").toLowerCase();
  if (cs !== "adjusted") return false;
  return Boolean(String(sr.linked_sale_id || "").trim());
}

/**
 * `credit_status = adjusted` with no `linked_sale_id`: CN exists but not tied to a sale — must still
 * credit AR (CustomerLedgerPage parity). `buildAuditRows` drops all `adjusted`; we append these.
 */
function appendAdjustedUnlinkedSaleReturns(bundle: CustomerAuditBundle, rows: AuditRow[]): AuditRow[] {
  const extra: AuditRow[] = [];
  for (const sr of bundle.saleReturns || []) {
    if (skipSaleReturnInBaseAudit(sr)) continue;
    const cs = String(sr.credit_status || "").toLowerCase();
    if (cs !== "adjusted") continue;
    if (String(sr.linked_sale_id || "").trim()) continue;
    const d = String(sr.return_date || "").slice(0, 10);
    const rn = String(sr.return_number || "").trim() || "—";
    const net = Number(sr.net_amount || 0);
    if (net <= 0) continue;
    extra.push({
      id: `sr-adj-unlinked-${(sr as { id: string }).id}`,
      at: d,
      type: "Sale Return",
      ref: rn,
      particulars:
        (String((sr as { notes?: string | null }).notes || "").trim() ||
          `Sale return / credit note ${rn}`) + " — CN not linked to an invoice",
      debit: 0,
      credit: net,
      internal: false,
    });
  }
  if (extra.length === 0) return rows;
  return [...rows, ...extra].sort((a, b) => {
    if (a.at !== b.at) return a.at.localeCompare(b.at);
    return a.id.localeCompare(b.id);
  });
}

function buildMergedAuditRowsForActivity(bundle: CustomerAuditBundle): AuditRow[] {
  const base = buildAuditRows(
    {
      sales: bundle.allSales,
      saleReturns: (bundle.saleReturns || []).filter((sr) => !skipSaleReturnInBaseAudit(sr)),
      vouchers: bundle.vouchersMerged,
      advances: bundle.advances,
      refunds: bundle.refunds,
      balanceAdjustments: bundle.balanceAdjustments,
    },
    { ledgerAlignedApplicationReceipts: true },
  );
  return appendAdjustedUnlinkedSaleReturns(bundle, base);
}

function auditTypeToCategory(r: AuditRow): ActivityCategory {
  const t = String(r.type || "").toLowerCase();
  if (t === "sale") return "invoice";
  if (t === "sale return adjust") return "invoice_return_credit";
  if (t === "sale return") return "return";
  if (t === "receipt") return "payment";
  if (t === "credit note") return "credit_note";
  if (t === "payment") return "refund_to_customer";
  if (t === "advance booking") return "advance";
  if (t === "advance refund") return "advance_refund";
  if (t === "balance adjustment") return "adjustment";
  if (t === "internal transfer") return "memo";
  return "adjustment";
}

export function activityCategoryLabel(c: ActivityCategory): string {
  switch (c) {
    case "opening":
      return "Opening";
    case "invoice":
      return "Invoice";
    case "invoice_return_credit":
      return "Invoice credit (return)";
    case "return":
      return "Sale return / CN";
    case "payment":
      return "Payment";
    case "credit_note":
      return "Credit note";
    case "refund_to_customer":
      return "Paid to customer";
    case "advance":
      return "Advance received";
    case "advance_refund":
      return "Advance refunded";
    case "adjustment":
      return "Adjustment";
    case "memo":
      return "Memo";
    default:
      return "Other";
  }
}

export interface ActivityRow {
  id: string;
  at: string;
  category: ActivityCategory;
  categoryLabel: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  internal: boolean;
  /** Positive = customer owes more after this line (same sign as Dr − Cr in audit). */
  effectOnReceivable: number;
  /** Running balance owed after this line (internal lines do not move the running total). */
  runningBalanceOwed: number;
}

/** Full lifetime activity rows (same ordering as audit), with running balance. */
export function buildCustomerActivityRows(bundle: CustomerAuditBundle): ActivityRow[] {
  const merged = buildMergedAuditRowsForActivity(bundle);
  const ob = Number(bundle.customer.opening_balance || 0);
  let running = ob;
  const out: ActivityRow[] = [];
  for (const r of merged) {
    const dr = Number(r.debit || 0);
    const cr = Number(r.credit || 0);
    const effect = dr - cr;
    const cat = auditTypeToCategory(r);
    if (!r.internal) {
      running += effect;
    }
    out.push({
      id: r.id,
      at: r.at,
      category: cat,
      categoryLabel: activityCategoryLabel(cat),
      reference: r.ref,
      description: r.particulars,
      debit: dr,
      credit: cr,
      internal: r.internal,
      effectOnReceivable: r.internal ? 0 : effect,
      runningBalanceOwed: running,
    });
  }
  return out;
}

export interface ActivitySnapshotCheck {
  closingFromActivity: number;
  snapshotBalance: number;
  mismatch: boolean;
  delta: number;
}

/** Lifetime closing from activity rows vs `fetchCustomerBalanceSnapshot().balance` (useCustomerBalance). */
export function verifyActivityMatchesSnapshot(
  bundle: CustomerAuditBundle,
  snapshotBalance: number,
): ActivitySnapshotCheck {
  const rows = buildCustomerActivityRows(bundle);
  const closingFromActivity = rows.length ? rows[rows.length - 1]!.runningBalanceOwed : Number(bundle.customer.opening_balance || 0);
  const delta = Math.round((closingFromActivity - snapshotBalance) * 100) / 100;
  return {
    closingFromActivity,
    snapshotBalance,
    mismatch: Math.abs(delta) > EPS,
    delta,
  };
}

export interface ActivityPeriodSlice {
  openingCarried: number;
  rows: ActivityRow[];
  closingInPeriod: number;
}

/**
 * Rows with `at` in [fromYmd, toYmd], with running balance restarted from opening carried
 * (transactions before `fromYmd` folded into openingCarried).
 */
export function sliceActivityByDateRange(
  allRows: ActivityRow[],
  fromYmd: string,
  toYmd: string,
  openingBalance: number,
): ActivityPeriodSlice {
  let carried = openingBalance;
  for (const r of allRows) {
    if (r.at < fromYmd) {
      if (!r.internal) carried += r.effectOnReceivable;
    }
  }
  const inRange = allRows.filter((r) => r.at >= fromYmd && r.at <= toYmd);
  let running = carried;
  const rows: ActivityRow[] = [];
  for (const r of inRange) {
    if (!r.internal) {
      running += r.effectOnReceivable;
    }
    rows.push({
      ...r,
      runningBalanceOwed: running,
    });
  }
  const closingInPeriod = rows.length ? rows[rows.length - 1]!.runningBalanceOwed : carried;
  return { openingCarried: carried, rows, closingInPeriod };
}
