import type { SupabaseClient } from "@supabase/supabase-js";
import { coerceToMap } from "@/lib/coerceToMap";
import { voucherSettlementCredit } from "@/utils/paymentSettlementBreakdown";

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

type VoucherPaymentRow = {
  reference_id: string | null;
  total_amount: number | null;
  discount_amount?: number | null;
  description: string | null;
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

function computeSnapshotForSupplier(
  supplierId: string,
  openingBalance: number,
  purchaseBillsData: BillRow[],
  voucherPayments: VoucherPaymentRow[],
  creditNotes: CreditNoteRow[],
  allPurchaseReturns: PurchaseReturnRow[],
  refundsBySupplier: number
): SupplierBalanceSnapshot {
  const supplierBills = purchaseBillsData.filter((b) => b.supplier_id === supplierId);

  const supplierCreditNotesGross = (creditNotes || [])
    .filter((cn) => cn && cn.reference_id === supplierId)
    .reduce((sum, cn) => sum + (Number(cn.total_amount) || 0), 0);

  const cnById = new Map(
    (creditNotes || [])
      .filter((cn): cn is CreditNoteRow => Boolean(cn?.id))
      .map((cn) => [cn.id, cn]),
  );
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
  const totalCreditNotesNet = roundMoney(Math.max(0, supplierCreditNotesGross - creditNotesAppliedToBills));

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

  const allCreditNoteVoucherIds = new Set((creditNotes || []).map((cn) => cn.id));
  let unreflectedReturns = 0;
  for (const pr of allPurchaseReturns || []) {
    if (pr.supplier_id !== supplierId) continue;
    const notLinked = !pr.credit_note_id || !allCreditNoteVoucherIds.has(pr.credit_note_id);
    const affectsBalance = ["adjusted", "adjusted_outstanding", "refunded"].includes(String(pr.credit_status || ""));
    if (notLinked && affectsBalance) {
      unreflectedReturns += Number(pr.net_amount) || 0;
    }
  }
  unreflectedReturns = roundMoney(unreflectedReturns);

  const supplierBillIds = supplierBills.map((b) => b.id);
  const perBillVoucherMap = new Map<string, number>();
  for (const v of voucherPayments || []) {
    if (!v?.reference_id || !supplierBillIds.includes(v.reference_id)) continue;
    try {
      perBillVoucherMap.set(
        v.reference_id,
        (perBillVoucherMap.get(v.reference_id) || 0) + voucherSettlementCredit(v),
      );
    } catch (rowErr) {
      console.warn("[supplierBalance] skip voucher payment row", rowErr);
    }
  }

  const totalPurchases = roundMoney(
    supplierBills.reduce((sum: number, b: BillRow) => sum + (Number(b.net_amount) || 0), 0)
  );

  const totalPaidFromBills = roundMoney(
    supplierBills.reduce((sum: number, b: BillRow) => {
      const voucherPaid = perBillVoucherMap.get(b.id) || 0;
      return sum + (voucherPaid > 0 ? voucherPaid : Number(b.paid_amount) || 0);
    }, 0)
  );

  const billRefs = supplierBills
    .map((b: BillRow) => b.software_bill_no || b.supplier_invoice_no)
    .filter(Boolean) as string[];

  const supplierLevelPayments = roundMoney(
    (voucherPayments || [])
      .filter((v: VoucherPaymentRow) => {
        if (v.reference_id !== supplierId) return false;
        const desc = (v.description || "") as string;
        return !billRefs.some((r: string) => desc.includes(r));
      })
      .reduce((sum: number, v: VoucherPaymentRow) => sum + voucherSettlementCredit(v), 0)
  );

  const totalPaid = roundMoney(totalPaidFromBills + supplierLevelPayments);
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
