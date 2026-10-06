import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCustomerBalanceCore } from "@/utils/customerBalanceCore";
import {
  computeCustomerOutstanding,
  isAdvanceApplicationVoucher,
  isReceiptMemoApplicationLedgerAligned,
} from "@/utils/customerAuditMath";

export interface AuditRow {
  id: string;
  at: string;
  type: string;
  ref: string;
  particulars: string;
  /** Balance-affecting debit (receivable after invoice CN/S/R). */
  debit: number;
  credit: number;
  /** Optional gross bill for display (before invoice CN/S/R). */
  displayDebit?: number;
  internal: boolean;
  /** Footnote when `internal` (e.g. CN adjust memo vs voucher reclassification). */
  internalHint?: string;
}

/** Earliest CN/S-R application date for a sale (voucher date or linked return date). */
export function resolveCnAdjustDateForSale(
  saleId: string,
  vouchers: Array<{
    reference_id?: string | null;
    voucher_date?: string | null;
    voucher_type?: string | null;
    payment_method?: string | null;
    description?: string | null;
  }>,
  saleReturns: Array<{ linked_sale_id?: string | null; return_date?: string | null }>,
): string | null {
  const dates: string[] = [];
  for (const v of vouchers) {
    if (String(v.reference_id || "") !== saleId) continue;
    if (String(v.voucher_type || "").toLowerCase() !== "receipt") continue;
    const pm = String(v.payment_method || "").toLowerCase();
    const desc = String(v.description || "").toLowerCase();
    const isCn =
      pm === "credit_note_adjustment" ||
      desc.includes("credit note adjusted") ||
      desc.includes("cn adjusted") ||
      desc.includes("sale return");
    if (!isCn) continue;
    const d = String(v.voucher_date || "").slice(0, 10);
    if (d) dates.push(d);
  }
  for (const sr of saleReturns) {
    if (String(sr.linked_sale_id || "") !== saleId) continue;
    const d = String(sr.return_date || "").slice(0, 10);
    if (d) dates.push(d);
  }
  if (dates.length === 0) return null;
  dates.sort();
  return dates[0] ?? null;
}

/** Receipt credit to customer / AR: cash (`total_amount`) + settlement discount (`discount_amount`). */
export function voucherCreditAmount(v: { total_amount?: number | null; discount_amount?: number | null }) {
  return Math.max(0, Number(v.total_amount || 0) + Number(v.discount_amount || 0));
}

/** Tender captured on the sale row itself (cash / card / UPI columns) — matches classic Customer Ledger. */
export function salePaidAtSaleTender(sale: {
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
}): number {
  const cash = Number(sale.cash_amount || 0);
  const card = Number(sale.card_amount || 0);
  const upi = Number(sale.upi_amount || 0);
  return Math.max(0, cash) + Math.max(0, card) + Math.max(0, upi);
}

/**
 * Residual "Payment at sale" when sale also has sale-linked cash receipts.
 * POS often stores tender on cash/card/upi AND a matching RCP voucher
 * (Phase 4 backfill or payment recorded on POS Dashboard for the same bill).
 * Ledger must credit the overlapping amount only once.
 */
export function residualPaymentAtSaleTender(
  sale: {
    cash_amount?: number | null;
    card_amount?: number | null;
    upi_amount?: number | null;
  },
  saleLinkedCashReceiptTotal: number,
): number {
  return Math.max(
    0,
    salePaidAtSaleTender(sale) - Math.max(0, Number(saleLinkedCashReceiptTotal) || 0),
  );
}

/** Allocate residual tender to Cash → Card → UPI for display breakdown. */
export function residualTenderBreakdown(
  sale: {
    cash_amount?: number | null;
    card_amount?: number | null;
    upi_amount?: number | null;
  },
  residual: number,
): { cash: number; card: number; upi: number } {
  let rem = Math.max(0, residual);
  const cash = Math.min(Math.max(0, Number(sale.cash_amount || 0)), rem);
  rem -= cash;
  const card = Math.min(Math.max(0, Number(sale.card_amount || 0)), rem);
  rem -= card;
  const upi = Math.min(Math.max(0, Number(sale.upi_amount || 0)), rem);
  return { cash, card, upi };
}

export function payAtSaleParticulars(sale: {
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
  sale_number?: string | null;
}): string {
  const parts: string[] = [];
  const cash = Number(sale.cash_amount || 0);
  const card = Number(sale.card_amount || 0);
  const upi = Number(sale.upi_amount || 0);
  if (cash > 0) parts.push(`Cash: ₹${cash.toLocaleString("en-IN")}`);
  if (card > 0) parts.push(`Card: ₹${card.toLocaleString("en-IN")}`);
  if (upi > 0) parts.push(`UPI: ₹${upi.toLocaleString("en-IN")}`);
  const sn = String(sale.sale_number || "").trim();
  const base = sn ? `Payment at sale — ${sn}` : "Payment at sale";
  return parts.length > 0 ? `${base} (${parts.join(", ")})` : base;
}

export type BuildAuditRowsOptions = {
  /** When true, sale/customer advance & CN application receipts are memo-only (matches CustomerLedgerPage). */
  ledgerAlignedApplicationReceipts?: boolean;
};

/** Same row construction as Customer Audit Report (single source of truth). */
export function buildAuditRows(
  params: {
    sales: any[];
    saleReturns: any[];
    vouchers: any[];
    advances: any[];
    refunds: any[];
    /** Same debit/credit rules as Customer Ledger adjustment rows. */
    balanceAdjustments?: any[];
  },
  options?: BuildAuditRowsOptions,
): AuditRow[] {
  const useLedgerAlignedApps = options?.ledgerAlignedApplicationReceipts === true;
  const rows: AuditRow[] = [];

  const salesWithAtSaleTender = new Set<string>(
    params.sales
      .filter((s) => salePaidAtSaleTender(s) > 0.005)
      .map((s) => String((s as { id: string }).id)),
  );

  // Sale-linked cash/card receipts (exclude advance/CN memo apps) — same bucket as
  // residualPaymentAtSaleTender so we never credit payment-at-sale + matching RCP twice.
  //
  // Only accumulates vouchers dated the SAME calendar day as their linked sale.
  // A later payment is genuinely separate and must not be subtracted from at-sale tender.
  const saleDatesById = new Map<string, string | null | undefined>(
    params.sales.map((s: any) => [String(s.id), s.sale_date]),
  );
  const saleLinkedCashReceiptBySaleId = new Map<string, number>();
  for (const v of params.vouchers) {
    if (String(v.voucher_type || "").toLowerCase() !== "receipt") continue;
    const refT = String(v.reference_type || "").toLowerCase();
    if (refT !== "sale" && refT !== "customer") continue;
    const refId = String(v.reference_id || "");
    if (!refId) continue;
    const memo = useLedgerAlignedApps
      ? isReceiptMemoApplicationLedgerAligned(v)
      : isAdvanceApplicationVoucher(v);
    if (memo) continue;
    const pm = String(v.payment_method || "").toLowerCase();
    if (pm === "credit_note_adjustment") continue;
    const saleDate = saleDatesById.get(refId);
    const voucherDate = v.voucher_date;
    const sameDay =
      !saleDate || !voucherDate ||
      String(voucherDate).slice(0, 10) === String(saleDate).slice(0, 10);
    if (!sameDay) continue;
    saleLinkedCashReceiptBySaleId.set(
      refId,
      (saleLinkedCashReceiptBySaleId.get(refId) || 0) + voucherCreditAmount(v),
    );
  }

  for (const s of params.sales) {
    const st = String(s.payment_status || "").toLowerCase();
    if (st === "cancelled" || st === "hold") continue;
    if ((s as any).is_cancelled === true) continue;
    const d = String(s.sale_date || "").slice(0, 10);
    const net = Number(s.net_amount || 0);
    const sn = String(s.sale_number || "").trim() || "—";
    const sra = Number(s.sale_return_adjust || 0);
    const receivable = Math.max(0, net - sra);
    rows.push({
      id: `sale-${s.id}`,
      at: d,
      type: "Sale",
      ref: sn,
      particulars: `Invoice ${sn}`,
      debit: receivable,
      displayDebit: sra > 0.005 ? net : receivable,
      credit: 0,
      internal: false,
    });
    if (sra > 0.005) {
      const cnAt =
        resolveCnAdjustDateForSale(String((s as { id: string }).id), params.vouchers, params.saleReturns) || d;
      const linkedSr = params.saleReturns.find(
        (sr) => String(sr.linked_sale_id || "") === String((s as { id: string }).id),
      );
      const rn = linkedSr ? String(linkedSr.return_number || "").trim() : "";
      rows.push({
        id: `sra-memo-${(s as { id: string }).id}`,
        at: cnAt,
        type: "Sale return adjust",
        ref: rn || sn,
        particulars: rn
          ? `Credit note from return ${rn} adjusted to invoice ${sn} — ₹${sra.toLocaleString("en-IN")}`
          : `Sale return / credit adjusted to ${sn} — ₹${sra.toLocaleString("en-IN")}`,
        debit: 0,
        credit: sra,
        internal: true,
        internalHint: "(CN/S-R adjustment — shown for date sequence; balance already in invoice net)",
      });
    }

    const saleId = String((s as { id: string }).id);
    const paidAtSale = residualPaymentAtSaleTender(
      s,
      saleLinkedCashReceiptBySaleId.get(saleId) || 0,
    );
    if (paidAtSale > 0.005) {
      const br = residualTenderBreakdown(s, paidAtSale);
      rows.push({
        id: `pas-${saleId}`,
        at: d,
        type: "Receipt",
        ref: sn,
        particulars: payAtSaleParticulars({ ...s, ...br, sale_number: sn }),
        debit: 0,
        credit: paidAtSale,
        internal: false,
      });
    }
  }

  for (const sr of params.saleReturns) {
    const cs = String(sr.credit_status || "").toLowerCase();
    const linked = String((sr as { linked_sale_id?: string | null }).linked_sale_id || "").trim();
    const srNet = Number(sr.net_amount || 0);
    const linkedSale = linked
      ? params.sales.find((s) => String((s as { id: string }).id) === linked)
      : undefined;
    const absorbedOnInvoice = linkedSale
      ? Math.min(srNet, Number(linkedSale.sale_return_adjust || 0))
      : 0;
    // Absorbed into an invoice via `sales.sale_return_adjust` — omit duplicate SR credit.
    // `adjusted` with no `linked_sale_id`: CN generated but not tied to a sale — must still show credit.
    if (cs === "adjusted" && linked) continue;
    if (linked && absorbedOnInvoice >= srNet - 0.005) continue;
    const d = String(sr.return_date || "").slice(0, 10);
    const rn = String(sr.return_number || "").trim() || "—";
    const baseParticulars =
      String((sr as { notes?: string | null }).notes || "").trim() || `Sale return / credit note ${rn}`;
    const particulars =
      cs === "adjusted" && !linked ? `${baseParticulars} — CN not linked to an invoice` : baseParticulars;
    rows.push({
      id: `sr-${(sr as { id: string }).id}`,
      at: d,
      type: "Sale Return",
      ref: rn,
      particulars,
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

    const receiptMemoApplication = useLedgerAlignedApps
      ? isReceiptMemoApplicationLedgerAligned(v)
      : isAdvanceApplicationVoucher(v);
    if (vt === "receipt" && receiptMemoApplication) {
      const defPart =
        String(v.payment_method || "").toLowerCase() === "credit_note_adjustment"
          ? "Credit note applied to invoice"
          : refT === "customer"
            ? "Advance applied to Opening Balance"
            : "Advance applied to invoice";
      rows.push({
        id: `ve-adv-${v.id}`,
        at: d,
        type: "Internal Transfer",
        ref: vn,
        particulars: String(v.description || defPart).trim(),
        debit: 0,
        credit: 0,
        internal: true,
      });
      continue;
    }

    if (vt === "receipt") {
      const refId = String(v.reference_id || "");
      const desc = String(v.description || "").toLowerCase();
      if (
        refT === "sale" &&
        refId &&
        salesWithAtSaleTender.has(refId) &&
        desc.startsWith("phase 4 backfill")
      ) {
        continue;
      }
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

  for (const adj of params.balanceAdjustments || []) {
    const d = String(adj.adjustment_date || "").slice(0, 10);
    const outDiff = Number(adj.outstanding_difference || 0);
    const advDiff = Number(adj.advance_difference || 0);
    const advanceConsumed = advDiff < 0 ? Math.abs(advDiff) : 0;
    const netDebit = (outDiff > 0 ? outDiff : 0) + advanceConsumed;
    const netCredit = outDiff < 0 ? Math.abs(outDiff) : 0;
    if (netDebit <= 0.005 && netCredit <= 0.005) continue;
    rows.push({
      id: `cba-${adj.id}`,
      at: d,
      type: "Balance Adjustment",
      ref: "ADJ",
      particulars: String(adj.reason || "Balance adjustment").trim(),
      debit: netDebit,
      credit: netCredit,
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
  const VOUCHER_COLS =
    "id, voucher_number, voucher_date, voucher_type, reference_type, reference_id, total_amount, discount_amount, description, payment_method";

  // Stage 1: reads that depend on nothing else. They used to run one after another, and on a
  // slow connection (~450 ms per round trip) the POS "Invoice Saved" window waited on all of them.
  const [custRes, salesRes, srRes, vcRes, advRes, baRes] = await Promise.all([
    client
      .from("customers")
      .select("id, customer_name, phone, opening_balance, organization_id")
      .eq("id", customerId)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .maybeSingle(),
    client
      .from("sales")
      .select(
        // refund_amount must be here. A direct Cash click on an exchange (bill ₹3,300,
        // return ₹3,500, ₹200 paid back) stores the payout on the sale and also writes
        // "Refund paid for POS exchange …". The balance skips that voucher only when
        // refund_amount is loaded; without the column the customer is left owing ₹200.
        // gross_amount, discount_amount, flat_discount_amount, points_redeemed_amount and round_off
        // let computeCustomerBalanceCore tell a bill the CN was applied to AFTER billing (net is the
        // full bill) from one with the return baked into net. Without them the check falls back to
        // MRP-based items_gross, which misfires on discounted/wholesale bills and leaves the applied
        // CN out of the balance (KS Footwear / Soni Shoes: Net Position 5,014 vs ledger 2,624).
        "id, sale_number, sale_date, net_amount, paid_amount, cash_amount, card_amount, upi_amount, refund_amount, sale_return_adjust, gross_amount, discount_amount, flat_discount_amount, points_redeemed_amount, round_off, payment_status, is_cancelled, cancelled_at, cancelled_reason",
      )
      .eq("customer_id", customerId)
      .eq("organization_id", orgId)
      .is("deleted_at", null),
    client
      .from("sale_returns")
      .select(
        "id, return_number, return_date, net_amount, credit_status, linked_sale_id, credit_available_balance, refund_type, notes",
      )
      .eq("customer_id", customerId)
      .eq("organization_id", orgId)
      .is("deleted_at", null),
    client
      .from("voucher_entries")
      .select(VOUCHER_COLS)
      .eq("organization_id", orgId)
      .eq("reference_type", "customer")
      .eq("reference_id", customerId)
      .is("deleted_at", null)
      .in("voucher_type", ["receipt", "payment", "credit_note"]),
    client
      .from("customer_advances")
      .select("id, advance_number, advance_date, amount, used_amount, manual_used_amount, status, description, payment_method")
      .eq("customer_id", customerId)
      .eq("organization_id", orgId),
    client
      .from("customer_balance_adjustments")
      .select("id, outstanding_difference, advance_difference, adjustment_date, reason, materialized_at")
      .eq("customer_id", customerId)
      .eq("organization_id", orgId)
      .is("materialized_at", null),
  ]);

  const { data: customerRow, error: custErr } = custRes;
  if (custErr) throw custErr;
  if (!customerRow) throw new Error("Customer not found");
  const { data: allSales, error: salesErr } = salesRes;
  if (salesErr) throw salesErr;
  const { data: saleReturns, error: srErr } = srRes;
  if (srErr) throw srErr;
  const { data: vouchersCustomer, error: veCustErr } = vcRes;
  if (veCustErr) throw veCustErr;
  let { data: advances, error: advErr } = advRes;
  if (advErr && String(advErr.message || "").includes("manual_used_amount")) {
    // migration 20270104130000 not applied on this database yet
    const legacy = await client
      .from("customer_advances")
      .select("id, advance_number, advance_date, amount, used_amount, status, description, payment_method")
      .eq("customer_id", customerId)
      .eq("organization_id", orgId);
    advances = legacy.data as typeof advances;
    advErr = legacy.error;
  }
  if (advErr) throw advErr;
  const { data: balanceAdjustments, error: baErr } = baRes;
  if (baErr) throw baErr;

  const saleIds = (allSales || []).map((s: { id: string }) => s.id).filter(Boolean);
  const returnNumbers = (saleReturns || [])
    .map((sr: any) => String(sr.return_number || "").trim())
    .filter(Boolean);
  const advanceIds = (advances || []).map((a: { id: string }) => a.id).filter(Boolean);

  // Stage 2: reads that need ids from stage 1, also in parallel.
  const orFilter = returnNumbers
    .map((rn: string) => `description.ilike.%${rn.replace(/[%,()]/g, " ")}%`)
    .join(",");
  const [itemsRes, refundBySrRes, saleVouchersRes, mistaggedRes, refundsRes] = await Promise.all([
    // Merchandise gross (Σ mrp × qty) per sale — discriminates the two net_amount conventions
    // (pre-return full-bill vs post-return) so an applied sale return credits the customer once.
    saleIds.length > 0
      ? client.from("sale_items").select("sale_id, quantity, mrp").in("sale_id", saleIds).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    orFilter
      ? client
          .from("voucher_entries")
          .select(VOUCHER_COLS)
          .eq("organization_id", orgId)
          .eq("voucher_type", "payment")
          .eq("reference_type", "customer")
          .is("deleted_at", null)
          .or(orFilter)
      : Promise.resolve({ data: [], error: null }),
    saleIds.length > 0
      ? client
          .from("voucher_entries")
          .select(VOUCHER_COLS)
          .eq("organization_id", orgId)
          .eq("voucher_type", "receipt")
          .eq("reference_type", "sale")
          .in("reference_id", saleIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    // Phase 1.1: catch legacy mis-tagged receipts where reference_type='customer'
    // but reference_id is actually one of this customer's sale ids. Classification
    // downstream is by id-match, so simply pulling these rows into the bundle is
    // enough — voucherById de-dupes by id.
    saleIds.length > 0
      ? client
          .from("voucher_entries")
          .select(VOUCHER_COLS)
          .eq("organization_id", orgId)
          .eq("voucher_type", "receipt")
          .eq("reference_type", "customer")
          .in("reference_id", saleIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    advanceIds.length > 0
      ? client
          .from("advance_refunds")
          .select("id, refund_date, refund_amount, advance_id, reason, payment_method")
          .eq("organization_id", orgId)
          .in("advance_id", advanceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  const itemsGrossBySale = new Map<string, number>();
  for (const it of itemsRes.data || []) {
    const sid = String((it as { sale_id?: string }).sale_id || "");
    if (!sid) continue;
    itemsGrossBySale.set(
      sid,
      (itemsGrossBySale.get(sid) || 0) +
        (Number((it as { quantity?: number }).quantity) || 0) *
          (Number((it as { mrp?: number }).mrp) || 0),
    );
  }
  if (refundBySrRes.error) throw refundBySrRes.error;
  const vouchersRefundBySr: any[] = refundBySrRes.data || [];
  if (saleVouchersRes.error) throw saleVouchersRes.error;
  const vouchersSale: any[] = saleVouchersRes.data || [];
  if (mistaggedRes.error) throw mistaggedRes.error;
  const vouchersMistaggedSale: any[] = mistaggedRes.data || [];
  if (refundsRes.error) throw refundsRes.error;
  const refunds: any[] = refundsRes.data || [];

  const voucherById = new Map<string, any>();
  for (const v of [
    ...(vouchersCustomer || []),
    ...vouchersSale,
    ...vouchersMistaggedSale,
    ...vouchersRefundBySr,
  ]) {
    voucherById.set(v.id, v);
  }
  const vouchersMerged = Array.from(voucherById.values());

  return {
    customer: customerRow,
    allSales: (allSales || []).map((s: { id: string }) => ({
      ...s,
      items_gross: itemsGrossBySale.get(String(s.id)) ?? 0,
    })),
    vouchersMerged,
    saleReturns: saleReturns || [],
    advances: advances || [],
    refunds,
    balanceAdjustments: balanceAdjustments || [],
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
    balanceAdjustments: bundle.balanceAdjustments,
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
  const adjustmentTotal = (bundle.balanceAdjustments || []).reduce(
    (sum: number, a: any) => sum + Number(a.outstanding_difference || 0),
    0,
  );
  const core = computeCustomerBalanceCore({
    openingBalance: Number(bundle.customer.opening_balance || 0),
    sales: bundle.allSales,
    voucherEntries: bundle.vouchersMerged,
    customerAdvances: bundle.advances,
    advanceRefunds: bundle.refunds,
    adjustmentTotal,
    saleReturns: bundle.saleReturns,
    options: { ledgerAlignedApplicationReceipts: true },
  });
  const totalAdvanceReceived = bundle.advances.reduce(
    (sum: number, a: { amount?: number | null }) => sum + Number(a.amount || 0),
    0,
  );
  return {
    openingBalance: core.openingBalance,
    totalInvoiced: core.totalInvoicedGross,
    totalSaleReturnAdjust: core.totalSaleReturnAdjustOnInvoices,
    totalRealPayments: core.totalRealPayments,
    receiptCredits: core.receiptCredits,
    creditNoteCredits: core.creditNoteCredits,
    customerPaymentDebits: core.customerPaymentDebits,
    totalAdvanceReceived,
    totalAdvanceUsed: core.totalAdvanceUsed,
    unusedAdvance: core.unusedAdvance,
    advanceRefundedTotal: core.advanceRefundedTotal,
    adjustmentTotal: core.adjustmentTotal,
    outstanding: core.balance,
  };
}
