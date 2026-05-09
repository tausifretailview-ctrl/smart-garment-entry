import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCustomerOutstanding, isAdvanceApplicationVoucher } from "@/utils/customerAuditMath";

export interface AuditRow {
  id: string;
  at: string;
  type: string;
  ref: string;
  particulars: string;
  debit: number;
  credit: number;
  internal: boolean;
}

export function voucherCreditAmount(v: { total_amount?: number | null; discount_amount?: number | null }) {
  return Math.max(0, Number(v.total_amount || 0) + Number(v.discount_amount || 0));
}

/** Same row construction as Customer Audit Report (single source of truth). */
export function buildAuditRows(params: {
  sales: any[];
  saleReturns: any[];
  vouchers: any[];
  advances: any[];
  refunds: any[];
}): AuditRow[] {
  const rows: AuditRow[] = [];

  for (const s of params.sales) {
    const st = String(s.payment_status || "").toLowerCase();
    if (st === "cancelled" || st === "hold") continue;
    const d = String(s.sale_date || "").slice(0, 10);
    const net = Number(s.net_amount || 0);
    const sn = String(s.sale_number || "").trim() || "—";
    rows.push({
      id: `sale-${s.id}`,
      at: d,
      type: "Sale",
      ref: sn,
      particulars: `Invoice ${sn}`,
      debit: net,
      credit: 0,
      internal: false,
    });
    const sra = Number(s.sale_return_adjust || 0);
    if (sra > 0.005) {
      rows.push({
        id: `sra-${s.id}`,
        at: d,
        type: "Sale return adjust",
        ref: sn,
        particulars: `Sale return / credit adjusted to ${sn}`,
        debit: 0,
        credit: sra,
        internal: false,
      });
    }
  }

  for (const sr of params.saleReturns) {
    const cs = String(sr.credit_status || "").toLowerCase();
    if (cs === "adjusted") continue;
    const d = String(sr.return_date || "").slice(0, 10);
    const rn = String(sr.return_number || "").trim() || "—";
    rows.push({
      id: `sr-${sr.id}`,
      at: d,
      type: "Sale Return",
      ref: rn,
      particulars: String(sr.notes || "").trim() || `Sale return / credit note ${rn}`,
      debit: 0,
      credit: Number(sr.net_amount || 0),
      internal: false,
    });
  }

  for (const v of params.vouchers) {
    const d = String(v.voucher_date || "").slice(0, 10);
    const vn = String(v.voucher_number || "").trim() || "—";
    const vt = String(v.voucher_type || "").toLowerCase();
    const refT = String(v.reference_type || "").toLowerCase();

    if (vt === "receipt" && refT === "sale" && isAdvanceApplicationVoucher(v)) {
      rows.push({
        id: `ve-adv-${v.id}`,
        at: d,
        type: "Internal Transfer",
        ref: vn,
        particulars: String(v.description || "Advance applied to invoice").trim(),
        debit: 0,
        credit: 0,
        internal: true,
      });
      continue;
    }

    if (vt === "receipt") {
      const cr = voucherCreditAmount(v);
      if (cr <= 0) continue;
      rows.push({
        id: `ve-rcpt-${v.id}`,
        at: d,
        type: "Receipt",
        ref: vn,
        particulars: String(v.description || "Receipt").trim() || "Receipt",
        debit: 0,
        credit: cr,
        internal: false,
      });
      continue;
    }

    if (vt === "credit_note" && refT === "customer") {
      const cr = voucherCreditAmount(v);
      if (cr <= 0) continue;
      rows.push({
        id: `ve-cn-${v.id}`,
        at: d,
        type: "Credit Note",
        ref: vn,
        particulars: String(v.description || "Credit note").trim(),
        debit: 0,
        credit: cr,
        internal: false,
      });
      continue;
    }

    if (vt === "payment" && refT === "customer") {
      const dr = Number(v.total_amount || 0);
      if (dr <= 0) continue;
      rows.push({
        id: `ve-pay-${v.id}`,
        at: d,
        type: "Payment",
        ref: vn,
        particulars: String(v.description || "Payment / refund to customer").trim(),
        debit: dr,
        credit: 0,
        internal: false,
      });
    }
  }

  for (const a of params.advances) {
    const d = String(a.advance_date || "").slice(0, 10);
    const an = String(a.advance_number || "").trim() || "—";
    const amt = Number(a.amount || 0);
    if (amt <= 0) continue;
    const pm = a.payment_method ? String(a.payment_method) : "";
    rows.push({
      id: `adv-${a.id}`,
      at: d,
      type: "Advance Booking",
      ref: an,
      particulars:
        (a.description ? `${a.description} — ` : "") +
        `Advance booking${pm ? ` (${pm})` : ""}${a.status ? ` [${a.status}]` : ""}`,
      debit: 0,
      credit: amt,
      internal: false,
    });
  }

  for (const r of params.refunds) {
    const d = String(r.refund_date || "").slice(0, 10);
    const dr = Number(r.refund_amount || 0);
    if (dr <= 0) continue;
    rows.push({
      id: `arf-${r.id}`,
      at: d,
      type: "Advance Refund",
      ref: `REF-${String(r.id).slice(0, 8)}`,
      particulars: String(r.reason || "Advance refund").trim() + (r.payment_method ? ` (${r.payment_method})` : ""),
      debit: dr,
      credit: 0,
      internal: false,
    });
  }

  rows.sort((a, b) => {
    if (a.at !== b.at) return a.at.localeCompare(b.at);
    return a.id.localeCompare(b.id);
  });

  return rows;
}

export type CustomerAuditBundle = Awaited<ReturnType<typeof fetchCustomerAuditBundle>>;

/**
 * Loads the same voucher/sales/advance snapshot as Customer Audit Report.
 * All voucher queries use deleted_at IS NULL.
 */
export async function fetchCustomerAuditBundle(client: SupabaseClient, orgId: string, customerId: string) {
  const { data: customerRow, error: custErr } = await client
    .from("customers")
    .select("id, customer_name, phone, opening_balance, organization_id")
    .eq("id", customerId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (custErr) throw custErr;
  if (!customerRow) throw new Error("Customer not found");

  const { data: allSales, error: salesErr } = await client
    .from("sales")
    .select("id, sale_number, sale_date, net_amount, sale_return_adjust, payment_status")
    .eq("customer_id", customerId)
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  if (salesErr) throw salesErr;

  const saleIds = (allSales || []).map((s: { id: string }) => s.id).filter(Boolean);

  const { data: saleReturns, error: srErr } = await client
    .from("sale_returns")
    .select("id, return_number, return_date, net_amount, credit_status, notes")
    .eq("customer_id", customerId)
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  if (srErr) throw srErr;

  const { data: vouchersCustomer, error: veCustErr } = await client
    .from("voucher_entries")
    .select(
      "id, voucher_number, voucher_date, voucher_type, reference_type, reference_id, total_amount, discount_amount, description, payment_method",
    )
    .eq("organization_id", orgId)
    .eq("reference_type", "customer")
    .eq("reference_id", customerId)
    .is("deleted_at", null)
    .in("voucher_type", ["receipt", "payment", "credit_note"]);
  if (veCustErr) throw veCustErr;

  let vouchersRefundBySr: any[] = [];
  const returnNumbers = (saleReturns || [])
    .map((sr: any) => String(sr.return_number || "").trim())
    .filter(Boolean);
  if (returnNumbers.length > 0) {
    const orFilter = returnNumbers
      .map((rn: string) => `description.ilike.%${rn.replace(/[%,()]/g, " ")}%`)
      .join(",");
    if (orFilter) {
      const { data: vr, error: vrErr } = await client
        .from("voucher_entries")
        .select(
          "id, voucher_number, voucher_date, voucher_type, reference_type, reference_id, total_amount, discount_amount, description, payment_method",
        )
        .eq("organization_id", orgId)
        .eq("voucher_type", "payment")
        .eq("reference_type", "customer")
        .is("deleted_at", null)
        .or(orFilter);
      if (vrErr) throw vrErr;
      vouchersRefundBySr = vr || [];
    }
  }

  let vouchersSale: any[] = [];
  if (saleIds.length > 0) {
    const { data: vs, error: veSaleErr } = await client
      .from("voucher_entries")
      .select(
        "id, voucher_number, voucher_date, voucher_type, reference_type, reference_id, total_amount, discount_amount, description, payment_method",
      )
      .eq("organization_id", orgId)
      .eq("voucher_type", "receipt")
      .eq("reference_type", "sale")
      .in("reference_id", saleIds)
      .is("deleted_at", null);
    if (veSaleErr) throw veSaleErr;
    vouchersSale = vs || [];
  }

  const voucherById = new Map<string, any>();
  for (const v of [...(vouchersCustomer || []), ...vouchersSale, ...vouchersRefundBySr]) {
    voucherById.set(v.id, v);
  }
  const vouchersMerged = Array.from(voucherById.values());

  const { data: advances, error: advErr } = await client
    .from("customer_advances")
    .select("id, advance_number, advance_date, amount, used_amount, status, description, payment_method")
    .eq("customer_id", customerId)
    .eq("organization_id", orgId);
  if (advErr) throw advErr;

  const advanceIds = (advances || []).map((a: { id: string }) => a.id).filter(Boolean);
  let refunds: any[] = [];
  if (advanceIds.length > 0) {
    const { data: ar, error: arErr } = await client
      .from("advance_refunds")
      .select("id, refund_date, refund_amount, advance_id, reason, payment_method")
      .eq("organization_id", orgId)
      .in("advance_id", advanceIds);
    if (arErr) throw arErr;
    refunds = ar || [];
  }

  return {
    customer: customerRow,
    allSales: allSales || [],
    vouchersMerged,
    saleReturns: saleReturns || [],
    advances: advances || [],
    refunds,
  };
}

/**
 * Closing balance for [fromYmd, toYmd] using the same running total as Customer Audit Report.
 */
export function computeAuditPeriodOutstanding(
  bundle: CustomerAuditBundle,
  fromYmd: string,
  toYmd: string,
): number {
  const allRows = buildAuditRows({
    sales: bundle.allSales,
    saleReturns: bundle.saleReturns,
    vouchers: bundle.vouchersMerged,
    advances: bundle.advances,
    refunds: bundle.refunds,
  });

  const ob = Number(bundle.customer.opening_balance || 0);
  let carried = ob;
  for (const r of allRows) {
    if (r.at < fromYmd) {
      if (!r.internal) carried += r.debit - r.credit;
    }
  }
  const disp = allRows.filter((r) => r.at >= fromYmd && r.at <= toYmd);
  let running = carried;
  for (const r of disp) {
    if (r.internal) continue;
    running += r.debit - r.credit;
  }
  return running;
}

/** Full-period (lifetime) outstanding — formula check vs running balance. */
export function computeAuditFormulaOutstanding(bundle: CustomerAuditBundle): ReturnType<typeof computeCustomerOutstanding> {
  const validSales = bundle.allSales.filter(
    (s: any) => !["cancelled", "hold"].includes(String(s.payment_status || "").toLowerCase()),
  );
  return computeCustomerOutstanding({
    openingBalance: Number(bundle.customer.opening_balance || 0),
    sales: validSales,
    voucherEntries: bundle.vouchersMerged,
    customerAdvances: bundle.advances,
    advanceRefunds: bundle.refunds,
  });
}
