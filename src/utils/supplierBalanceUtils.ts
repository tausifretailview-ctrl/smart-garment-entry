import type { SupabaseClient } from "@supabase/supabase-js";
import { coerceToMap } from "@/lib/coerceToMap";
import { voucherSettlementCredit } from "@/utils/paymentSettlementBreakdown";
import { buildPurchaseReturnAdjustByBillId } from "@/utils/purchaseBillReturnAdjust";
import { supplierCreditNoteLedgerDebit } from "@/utils/purchaseSupplierLedgerCn";

/**
 * Single source of truth for supplier (payables) balance used by Supplier Ledger,
 * Accounts supplier payment tab, and floating supplier payment.
 *
 * ## CN adjusted against bill (double-count fix)
 * When "Adjust Credit Note" applies a return to a bill, `purchase_bills.paid_amount`
 * increases AND a supplier-level `credit_note` voucher remains. Counting both would
 * over-reduce payables. We subtract CN voucher amounts linked to `purchase_returns` rows
 * with `credit_status = 'adjusted'` and `linked_bill_id` set (those amounts are already
 * reflected in bill paid totals). If `credit_available_balance` is set on the return,
 * only the portion already applied to the bill (`voucher_amount - remainder`) is netted.
 *
 * ## Refunds from supplier
 * `voucher_type = 'receipt'` with `reference_type = 'supplier'` reduces net payable
 * (cash/bank refund) and must be included in the list balance to match ledger running total.
 *
 * ## Reconciliation vs ledger table
 * `paid_amount` on bills already includes cash-at-purchase and payments that
 * FloatingPayments records with `reference_id = supplier` (no bill id). Adding those
 * supplier-level vouchers on top of `paid_amount` doubles Paid. Bill-linked vouchers
 * use `reference_id = purchase_bills.id`.
 *
 * Purchase returns with a CN voucher but a missing `credit_note_id` must not also
 * appear in `unreflectedReturns` (same amount would hit the formula twice).
 *
 * `paid_amount` also includes Adjust-CN-to-bill. That is not cash — strip it so
 * Paid (Cash / Bank) matches the ledger payment column. Amount-match unused CNs
 * only for outstanding/refunded returns, and only when the CN still hits the
 * ledger (debit > 0); a fully bill-applied CN must not swallow an AO return.
 */

export type SupplierBalanceSnapshot = {
  supplierId: string;
  openingBalance: number;
  totalPurchases: number;
  totalPaid: number;
  totalCreditNotesGross: number;
  /** CN voucher amounts already netted into bill paid via Adjust CN → bill. */
  creditNotesAppliedToBills: number;
  /** CN voucher amounts whose return was adjusted to the supplier outstanding balance. */
  creditNotesAppliedToOutstanding: number;
  /** CN voucher amounts whose return was settled by a cash/bank refund. */
  creditNotesRefunded: number;
  totalCreditNotesNet: number;
  /**
   * CN credit still genuinely available (not applied to a bill, not adjusted to
   * outstanding, not refunded). Use this for "unapplied" displays and credit pools;
   * `totalCreditNotesNet` is kept only for the balance formula.
   */
  unappliedCreditNotes: number;
  unreflectedReturns: number;
  refundsReceived: number;
  /** Positive = amount owed to supplier (payable). */
  balance: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Ledger “CN Adj” = voucher CN debit + unvouchered returns. Same figure on every card. */
export function supplierAccountAdjustmentTotal(
  snap: Pick<SupplierBalanceSnapshot, "totalCreditNotesNet" | "unreflectedReturns">,
): number {
  return roundMoney((Number(snap.totalCreditNotesNet) || 0) + (Number(snap.unreflectedReturns) || 0));
}

export type SupplierLedgerReconLine = {
  type: string;
  reference?: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export type SupplierLedgerReconTotals = {
  openingBalance: number;
  totalPurchases: number;
  totalPaid: number;
  accountAdjust: number;
  balance: number;
};

/**
 * Totals from the supplier ledger transaction table (same rows as Grand Total).
 * Reconciliation and header cards must use this when the table is loaded so they
 * cannot diverge from the running balance.
 */
export function supplierLedgerReconFromTransactions(
  txns: SupplierLedgerReconLine[] | null | undefined,
): SupplierLedgerReconTotals | null {
  if (!txns?.length) return null;
  let openingBalance = 0;
  let totalPurchases = 0;
  let totalPaid = 0;
  let accountAdjust = 0;
  for (const t of txns) {
    if (t.type === "bill" && t.reference === "Opening") {
      openingBalance += Number(t.credit) || 0;
      continue;
    }
    if (t.type === "bill") totalPurchases += Number(t.credit) || 0;
    else if (t.type === "payment") totalPaid += Number(t.debit) || 0;
    else if (t.type === "credit_note") accountAdjust += Number(t.debit) || 0;
  }
  return {
    openingBalance: roundMoney(openingBalance),
    totalPurchases: roundMoney(totalPurchases),
    totalPaid: roundMoney(totalPaid),
    accountAdjust: roundMoney(accountAdjust),
    balance: roundMoney(Number(txns[txns.length - 1]?.balance) || 0),
  };
}

type VoucherPaymentRow = {
  reference_id: string | null;
  total_amount: number | null;
  discount_amount?: number | null;
  description?: string | null;
};
type CreditNoteRow = { id: string; reference_id: string | null; total_amount: number | null };
type PurchaseReturnRow = {
  supplier_id: string;
  net_amount: number | null;
  credit_note_id: string | null;
  credit_status: string | null;
  linked_bill_id: string | null;
  /** Remaining CN not yet applied to a bill; NULL = legacy “full apply” to linked bill. */
  credit_available_balance: number | null;
};
type BillRow = {
  id: string;
  supplier_id: string | null;
  net_amount: number | null;
  paid_amount: number | null;
  software_bill_no: string | null;
  supplier_invoice_no: string | null;
};

/** PostgREST / Postgres “missing column” — retry with a simpler SELECT. */
function isRecoverableSchemaError(err: unknown): boolean {
  const m = String((err as { message?: string })?.message || "").toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("could not find") ||
    (err as { code?: string })?.code === "42703"
  );
}

function normalizePurchaseReturnRow(r: Record<string, unknown>): PurchaseReturnRow {
  return {
    supplier_id: String(r.supplier_id ?? ""),
    net_amount: r.net_amount != null ? Number(r.net_amount) : null,
    credit_note_id: (r.credit_note_id as string | null) ?? null,
    credit_status: (r.credit_status as string | null) ?? null,
    linked_bill_id: (r.linked_bill_id as string | null) ?? null,
    credit_available_balance:
      r.credit_available_balance != null ? Number(r.credit_available_balance) : null,
  };
}

async function fetchPurchaseReturnsForBalance(client: SupabaseClient, organizationId: string): Promise<PurchaseReturnRow[]> {
  const tiers = [
    "supplier_id, net_amount, credit_note_id, credit_status, linked_bill_id, credit_available_balance",
    "supplier_id, net_amount, credit_note_id, credit_status, linked_bill_id",
    "supplier_id, net_amount, credit_note_id, credit_status",
  ];
  let lastErr: unknown;
  for (const sel of tiers) {
    const { data, error } = await (client as any)
      .from("purchase_returns")
      .select(sel)
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    if (!error) {
      return ((data as any[]) || [])
        .filter((row): row is Record<string, unknown> => row != null && typeof row === "object")
        .map((row) => normalizePurchaseReturnRow(row))
        .filter((row) => Boolean(row.supplier_id));
    }
    lastErr = error;
    if (!isRecoverableSchemaError(error)) {
      console.error("[supplierBalance] purchase_returns fetch failed", error);
      return [];
    }
  }
  console.error("[supplierBalance] purchase_returns fetch exhausted retries", lastErr);
  return [];
}

const RETURN_AFFECTS_BALANCE = new Set(["adjusted", "adjusted_outstanding", "refunded"]);

/**
 * A purchase return is already in `totalCreditNotesNet` when its `credit_note_id`
 * is a `voucher_entries` credit-note row (same id space as `creditNotes`).
 *
 * Older returns can still have a real CN voucher (`reference_type = supplier`)
 * while `purchase_returns.credit_note_id` was never saved (auto-create CN
 * catch-and-continue in PurchaseReturnEntry). Matching an unused supplier CN
 * of the same amount treats that return as linked so it is not subtracted twice.
 *
 * This is not a `credit_notes` vs `voucher_entries` id mismatch: the FK is
 * `purchase_returns_credit_note_id_fkey` → `voucher_entries.id`.
 */
function consumeUnreflectedPurchaseReturnAmount(
  pr: PurchaseReturnRow,
  allCreditNoteVoucherIds: Set<string>,
  unusedSupplierCnByAmount: Map<number, number>,
): number {
  const amt = Number(pr.net_amount) || 0;
  if (pr.credit_note_id && allCreditNoteVoucherIds.has(pr.credit_note_id)) {
    return 0;
  }
  const status = String(pr.credit_status || "");
  // Do not pair bill-adjusted returns with leftover CN amounts — those CNs are
  // already in paid_amount / creditNotesAppliedToBills.
  if (status !== "adjusted_outstanding" && status !== "refunded") {
    return amt;
  }
  const key = roundMoney(amt);
  const leftover = unusedSupplierCnByAmount.get(key) || 0;
  if (leftover >= 1) {
    unusedSupplierCnByAmount.set(key, leftover - 1);
    return 0;
  }
  return amt;
}

/**
 * Cash already on the bill (`paid_amount`) plus structurally bill-linked payment
 * vouchers (`reference_id = bill.id`). Supplier-id vouchers are only added for
 * the slice not already explained by bill residual (at-purchase / FloatingPayments
 * also write `paid_amount` and a supplier-referenced voucher with no bill id).
 *
 * Do not use description substring matching — generic text like "Payment at purchase"
 * is a ledger display label and often the voucher text as well.
 */
function computeSupplierTotalPaid(
  supplierId: string,
  supplierBills: BillRow[],
  voucherPayments: VoucherPaymentRow[],
  returnAdjustByBillId: Map<string, number>,
): number {
  const supplierBillIds = new Set(supplierBills.map((b) => b.id));
  const perBillVoucherMap = new Map<string, number>();
  let supplierLevelPayments = 0;

  for (const v of voucherPayments || []) {
    if (!v?.reference_id) continue;
    try {
      const credit = voucherSettlementCredit(v);
      if (supplierBillIds.has(v.reference_id)) {
        perBillVoucherMap.set(v.reference_id, (perBillVoucherMap.get(v.reference_id) || 0) + credit);
      } else if (v.reference_id === supplierId) {
        supplierLevelPayments += credit;
      }
    } catch (rowErr) {
      console.warn("[supplierBalance] skip voucher payment row", rowErr);
    }
  }

  supplierLevelPayments = roundMoney(supplierLevelPayments);

  let billSettled = 0;
  let billLinkedTotal = 0;
  for (const b of supplierBills) {
    const voucherPaid = perBillVoucherMap.get(b.id) || 0;
    billLinkedTotal += voucherPaid;
    const returnAdjust = returnAdjustByBillId.get(b.id) || 0;
    // Bill-linked vouchers are cash/bank. `paid_amount` may also include CN-on-bill;
    // never take max(voucher, paid_amount) — that is what inflated SARASWATI Paid.
    if (voucherPaid > 0) billSettled += voucherPaid;
    else billSettled += Math.max(0, (Number(b.paid_amount) || 0) - returnAdjust);
  }
  billSettled = roundMoney(billSettled);
  billLinkedTotal = roundMoney(billLinkedTotal);

  const residualOnBills = roundMoney(Math.max(0, billSettled - billLinkedTotal));
  const extraOnAccount = roundMoney(Math.max(0, supplierLevelPayments - residualOnBills));
  return roundMoney(billSettled + extraOnAccount);
}

async function fetchPurchaseBillsForBalance(client: SupabaseClient, organizationId: string): Promise<BillRow[]> {
  const base = () =>
    client
      .from("purchase_bills")
      .select("id, supplier_id, net_amount, paid_amount, software_bill_no, supplier_invoice_no")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

  let res = await base().or("is_cancelled.is.null,is_cancelled.eq.false");
  if (!res.error) return (res.data || []) as BillRow[];

  if (isRecoverableSchemaError(res.error)) {
    const fallback = await base();
    if (fallback.error) {
      console.error("[supplierBalance] purchase_bills fetch failed", fallback.error);
      return [];
    }
    return (fallback.data || []) as BillRow[];
  }
  console.error("[supplierBalance] purchase_bills fetch failed", res.error);
  return [];
}

export function computeSnapshotForSupplier(
  supplierId: string,
  openingBalance: number,
  purchaseBillsData: BillRow[],
  voucherPayments: VoucherPaymentRow[],
  creditNotes: CreditNoteRow[],
  allPurchaseReturns: PurchaseReturnRow[],
  refundsBySupplier: number
): SupplierBalanceSnapshot {
  const supplierBills = purchaseBillsData.filter((b) => b.supplier_id === supplierId);

  const supplierCreditNotes = (creditNotes || []).filter(
    (cn) => cn && cn.reference_id === supplierId && Boolean(cn.id),
  );
  const supplierCreditNotesGross = supplierCreditNotes.reduce(
    (sum, cn) => sum + (Number(cn.total_amount) || 0),
    0,
  );

  const cnById = new Map(supplierCreditNotes.map((cn) => [cn.id, cn]));
  let creditNotesAppliedToBills = 0;
  for (const pr of allPurchaseReturns || []) {
    if (pr.supplier_id !== supplierId) continue;
    if (pr.credit_status !== "adjusted" || !pr.linked_bill_id || !pr.credit_note_id) continue;
    const v = cnById.get(pr.credit_note_id);
    if (!v) continue;
    const vn = Number(v.total_amount || 0);
    const rem = pr.credit_available_balance;
    if (rem == null || rem === undefined) creditNotesAppliedToBills += vn;
    else creditNotesAppliedToBills += Math.max(0, vn - Number(rem));
  }
  creditNotesAppliedToBills = roundMoney(creditNotesAppliedToBills);
  let totalCreditNotesNet = 0;
  for (const cn of supplierCreditNotes) {
    const linked = (allPurchaseReturns || []).filter(
      (pr) => pr.supplier_id === supplierId && pr.credit_note_id === cn.id,
    );
    totalCreditNotesNet += supplierCreditNoteLedgerDebit(Number(cn.total_amount) || 0, linked);
  }
  totalCreditNotesNet = roundMoney(Math.max(0, totalCreditNotesNet));

  // CN vouchers whose return has already been consumed (adjusted to outstanding or
  // refunded). These remain in `totalCreditNotesNet` (so the balance still reflects the
  // reduction) but must NOT be re-counted as available "unapplied" credit — otherwise the
  // payment screen credit pool and the ledger "Unapplied CN / Returns" card double-count it.
  let creditNotesAppliedToOutstanding = 0;
  let creditNotesRefunded = 0;
  for (const pr of allPurchaseReturns || []) {
    if (pr.supplier_id !== supplierId || !pr.credit_note_id) continue;
    const v = cnById.get(pr.credit_note_id);
    if (!v) continue;
    const vn = Number(v.total_amount || 0);
    if (pr.credit_status === "adjusted_outstanding") creditNotesAppliedToOutstanding += vn;
    else if (pr.credit_status === "refunded") creditNotesRefunded += vn;
  }
  creditNotesAppliedToOutstanding = roundMoney(creditNotesAppliedToOutstanding);
  creditNotesRefunded = roundMoney(creditNotesRefunded);
  const unappliedCreditNotes = roundMoney(
    Math.max(0, totalCreditNotesNet - creditNotesAppliedToOutstanding - creditNotesRefunded)
  );

  const allCreditNoteVoucherIds = new Set(supplierCreditNotes.map((cn) => cn.id));
  const claimedCnIds = new Set<string>();
  for (const pr of allPurchaseReturns || []) {
    if (pr.supplier_id !== supplierId || !pr.credit_note_id) continue;
    if (allCreditNoteVoucherIds.has(pr.credit_note_id)) claimedCnIds.add(pr.credit_note_id);
  }
  const unusedSupplierCnByAmount = new Map<number, number>();
  for (const cn of creditNotes || []) {
    if (!cn?.id || cn.reference_id !== supplierId || claimedCnIds.has(cn.id)) continue;
    const linked = (allPurchaseReturns || []).filter(
      (pr) => pr.supplier_id === supplierId && pr.credit_note_id === cn.id,
    );
    const debit = supplierCreditNoteLedgerDebit(Number(cn.total_amount) || 0, linked);
    if (debit <= 0.005) continue;
    const key = roundMoney(Number(cn.total_amount) || 0);
    unusedSupplierCnByAmount.set(key, (unusedSupplierCnByAmount.get(key) || 0) + 1);
  }

  let unreflectedReturns = 0;
  for (const pr of allPurchaseReturns || []) {
    if (pr.supplier_id !== supplierId) continue;
    if (!RETURN_AFFECTS_BALANCE.has(String(pr.credit_status || ""))) continue;
    unreflectedReturns += consumeUnreflectedPurchaseReturnAmount(
      pr,
      allCreditNoteVoucherIds,
      unusedSupplierCnByAmount,
    );
  }
  unreflectedReturns = roundMoney(unreflectedReturns);

  // CN / return credit written into bill.paid_amount (Adjust CN → bill).
  // Ledger shows that as a CN row (often ₹0 debit) plus cash payments separately.
  const returnAdjustInfo = buildPurchaseReturnAdjustByBillId(
    (allPurchaseReturns || []).filter((pr) => pr.supplier_id === supplierId),
  );
  const returnAdjustByBillId = new Map<string, number>();
  for (const [billId, info] of Object.entries(returnAdjustInfo)) {
    returnAdjustByBillId.set(billId, info.purchase_return_adjust);
  }

  const totalPurchases = roundMoney(
    supplierBills.reduce((sum: number, b: BillRow) => sum + (Number(b.net_amount) || 0), 0)
  );

  const totalPaid = computeSupplierTotalPaid(
    supplierId,
    supplierBills,
    voucherPayments || [],
    returnAdjustByBillId,
  );
  const refundsReceived = roundMoney(refundsBySupplier || 0);

  const balance = roundMoney(
    openingBalance + totalPurchases - totalPaid - totalCreditNotesNet - unreflectedReturns - refundsReceived
  );

  return {
    supplierId,
    openingBalance: roundMoney(openingBalance),
    totalPurchases,
    totalPaid,
    totalCreditNotesGross: roundMoney(supplierCreditNotesGross),
    creditNotesAppliedToBills,
    creditNotesAppliedToOutstanding,
    creditNotesRefunded,
    totalCreditNotesNet,
    unappliedCreditNotes,
    unreflectedReturns,
    refundsReceived,
    balance,
  };
}

const EMPTY_SUPPLIER_BALANCE_MAP = (): Map<string, SupplierBalanceSnapshot> =>
  new Map<string, SupplierBalanceSnapshot>();

/** Fetch balance snapshots for all non-deleted suppliers in an organization (one round-trip batch). */
export async function fetchSupplierBalanceSnapshotsForOrg(
  client: SupabaseClient,
  organizationId: string
): Promise<Map<string, SupplierBalanceSnapshot>> {
  const map = EMPTY_SUPPLIER_BALANCE_MAP();
  try {
    const { data: suppliersData, error: suppliersError } = await client
      .from("suppliers")
      .select("id, opening_balance")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    if (suppliersError) {
      console.error("[supplierBalance] suppliers fetch failed", suppliersError);
      return map;
    }

    let bills: BillRow[] = [];
    try {
      bills = await fetchPurchaseBillsForBalance(client, organizationId);
    } catch (billsErr) {
      console.error("[supplierBalance] bills aggregation failed", billsErr);
    }

    const { data: voucherPayments, error: voucherError } = await client
      .from("voucher_entries")
      .select("reference_id, total_amount, discount_amount, description")
      .eq("organization_id", organizationId)
      .in("reference_type", ["supplier", "SupplierPayment", "supplier_payment", "purchase"])
      .eq("voucher_type", "payment")
      .is("deleted_at", null);

    if (voucherError) {
      console.error("[supplierBalance] supplier payment vouchers fetch failed", voucherError);
    }

    const { data: creditNotes, error: creditNoteError } = await client
      .from("voucher_entries")
      .select("id, reference_id, total_amount")
      .eq("organization_id", organizationId)
      .in("reference_type", ["supplier", "SupplierPayment", "supplier_payment", "purchase"])
      .eq("voucher_type", "credit_note")
      .is("deleted_at", null);

    if (creditNoteError) {
      console.error("[supplierBalance] supplier credit notes fetch failed", creditNoteError);
    }

    let prsFromDb: PurchaseReturnRow[] = [];
    try {
      prsFromDb = await fetchPurchaseReturnsForBalance(client, organizationId);
    } catch (prsErr) {
      console.error("[supplierBalance] purchase_returns aggregation failed", prsErr);
    }

    const { data: supplierReceipts, error: rcError } = await client
      .from("voucher_entries")
      .select("reference_id, total_amount")
      .eq("organization_id", organizationId)
      .in("reference_type", ["supplier", "SupplierPayment", "supplier_payment", "purchase"])
      .eq("voucher_type", "receipt")
      .is("deleted_at", null);

    if (rcError) {
      console.error("[supplierBalance] supplier receipts fetch failed", rcError);
    }

    const refundsBySupplier = new Map<string, number>();
    for (const r of supplierReceipts || []) {
      if (!r?.reference_id) continue;
      try {
        refundsBySupplier.set(
          r.reference_id,
          (refundsBySupplier.get(r.reference_id) || 0) + (Number(r.total_amount) || 0),
        );
      } catch (rowErr) {
        console.warn("[supplierBalance] skip supplier receipt row", rowErr);
      }
    }

    const payments = ((voucherPayments || []) as VoucherPaymentRow[]).filter(Boolean);
    const cns = ((creditNotes || []) as CreditNoteRow[]).filter((cn) => Boolean(cn?.id));
    const prs = prsFromDb;

    for (const supplier of suppliersData || []) {
      const id = String((supplier as { id?: string }).id ?? "").trim();
      if (!id) continue;
      const ob = Number((supplier as { opening_balance?: number }).opening_balance || 0);
      try {
        const snap = computeSnapshotForSupplier(
          id,
          ob,
          bills,
          payments,
          cns,
          prs,
          refundsBySupplier.get(id) || 0,
        );
        map.set(id, snap);
      } catch (supplierErr) {
        console.warn("[supplierBalance] skip supplier snapshot", id, supplierErr);
      }
    }
  } catch (err) {
    console.error("[supplierBalance] fetchSupplierBalanceSnapshotsForOrg failed", err);
  }

  return map instanceof Map ? map : EMPTY_SUPPLIER_BALANCE_MAP();
}

/** Safe org-wide supplier balance map — always a Map; never throws to callers. */
export async function loadSupplierBalanceMapForOrg(
  client: SupabaseClient,
  organizationId: string,
): Promise<{ balanceMap: Map<string, SupplierBalanceSnapshot>; degraded: boolean }> {
  try {
    const raw = await fetchSupplierBalanceSnapshotsForOrg(client, organizationId);
    return { balanceMap: coerceToMap<string, SupplierBalanceSnapshot>(raw), degraded: false };
  } catch (err) {
    console.error("[supplierBalance] loadSupplierBalanceMapForOrg failed", err);
    return { balanceMap: EMPTY_SUPPLIER_BALANCE_MAP(), degraded: true };
  }
}

export type SupplierBalanceMapForOrg = Awaited<ReturnType<typeof loadSupplierBalanceMapForOrg>>;

const SUPPLIER_SETTLED = 0.5;

/** Org-level supplier totals from S-JS snapshots (matches Supplier Balances cards). */
export type SupplierOrgBalanceWindow = {
  /** Σ max(0, balance) — gross payable (Cr). */
  totalPayableCr: number;
  /** Σ max(0, −balance) — advance / overpaid (Dr). */
  totalAdvanceDr: number;
  /** Σ balance — signed net payable. */
  netPayable: number;
  /** Suppliers with |balance| > settled threshold. */
  activeSupplierCount: number;
  /** Suppliers with payable balance > settled threshold. */
  payableSupplierCount: number;
};

export function summarizeSupplierOrgWindowFromSnapshots(
  map: Map<string, Pick<SupplierBalanceSnapshot, "balance">>,
): SupplierOrgBalanceWindow {
  let totalPayableCr = 0;
  let totalAdvanceDr = 0;
  let netPayable = 0;
  let activeSupplierCount = 0;
  let payableSupplierCount = 0;

  for (const snap of coerceToMap<string, Pick<SupplierBalanceSnapshot, "balance">>(map).values()) {
    const b = roundMoney(Number(snap.balance) || 0);
    netPayable += b;
    if (b > SUPPLIER_SETTLED) {
      totalPayableCr += b;
      activeSupplierCount++;
      payableSupplierCount++;
    } else if (b < -SUPPLIER_SETTLED) {
      totalAdvanceDr += Math.abs(b);
      activeSupplierCount++;
    }
  }

  return {
    totalPayableCr: roundMoney(totalPayableCr),
    totalAdvanceDr: roundMoney(totalAdvanceDr),
    netPayable: roundMoney(netPayable),
    activeSupplierCount,
    payableSupplierCount,
  };
}

/** Sum positive supplier balances — matches Accounts Outstanding payable headline (S11). */
export function sumOrgSupplierPayableFromSnapshots(
  map: Map<string, Pick<SupplierBalanceSnapshot, "balance">>,
): number {
  return summarizeSupplierOrgWindowFromSnapshots(map).totalPayableCr;
}

/** One supplier (e.g. payment form header). */
export async function fetchSupplierBalanceSnapshot(
  client: SupabaseClient,
  organizationId: string,
  supplierId: string
): Promise<SupplierBalanceSnapshot> {
  const map = await fetchSupplierBalanceSnapshotsForOrg(client, organizationId);
  const snap = map.get(supplierId);
  if (snap) return snap;
  return {
    supplierId,
    openingBalance: 0,
    totalPurchases: 0,
    totalPaid: 0,
    totalCreditNotesGross: 0,
    creditNotesAppliedToBills: 0,
    creditNotesAppliedToOutstanding: 0,
    creditNotesRefunded: 0,
    totalCreditNotesNet: 0,
    unappliedCreditNotes: 0,
    unreflectedReturns: 0,
    refundsReceived: 0,
    balance: 0,
  };
}
