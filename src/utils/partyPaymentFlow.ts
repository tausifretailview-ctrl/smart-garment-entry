/**
 * Payment Flow page model: which payment, CN, advance or refund settled which bill.
 *
 * Amounts, running balance and closing balance come straight from the ledger rows
 * (`fetchCustomerLedgerTransactions` / `fetchSupplierLedgerTransactions`), so the
 * page always matches the Customer / Supplier Ledger. This module only adds the
 * links (row → bill) on top of those rows; it never re-derives a balance.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomerLedgerTransactions,
  type CustomerLedgerTransaction,
} from "@/utils/customerLedgerTransactions";
import {
  fetchSupplierLedgerTransactions,
  type SupplierLedgerTransaction,
} from "@/utils/supplierLedgerTransactions";

export type PartyKind = "customer" | "supplier";

export type FlowKind =
  | "payment"
  | "cn"
  | "advance"
  | "refund"
  | "opening"
  | "adjustment"
  | "account";

export type FlowBillStatus = "paid" | "partial" | "unpaid";

export interface FlowSource {
  id: string;
  kind: FlowKind;
  date: string;
  reference: string;
  label: string;
  note?: string;
  /** Positive = lowers what the party owes (customer) / what we owe (supplier). */
  amount: number;
  /** True for rows that raise the balance again (refunds, debit adjustments). */
  raisesBalance?: boolean;
  /** Ledger row index — drives the Play story order. */
  step: number;
}

export interface FlowPart {
  kind: FlowKind;
  amount: number;
  sourceId: string | null;
  /** Story step at which this part appears. */
  step: number;
}

export interface FlowBill {
  id: string;
  isOpening: boolean;
  date: string;
  reference: string;
  amount: number;
  settled: number;
  due: number;
  status: FlowBillStatus;
  parts: FlowPart[];
  step: number;
}

export interface FlowLink {
  id: string;
  sourceId: string;
  billId: string;
  amount: number;
  kind: FlowKind;
  step: number;
}

export interface FlowStep {
  id: string;
  step: number;
  date: string;
  reference: string;
  label: string;
  kind: FlowKind | "bill";
  /** Change in balance (+ owes more). Memo rows have 0. */
  delta: number;
  balance: number;
  memo: boolean;
}

export interface PartyFlowTotals {
  opening: number;
  billed: number;
  paid: number;
  cn: number;
  advance: number;
  refund: number;
  adjustment: number;
  closing: number;
}

export interface PartyFlowModel {
  party: PartyKind;
  sources: FlowSource[];
  bills: FlowBill[];
  links: FlowLink[];
  steps: FlowStep[];
  totals: PartyFlowTotals;
  /** Payments / CNs not tied to a bill (on account). */
  unlinkedCredit: number;
}

export interface VoucherRefMeta {
  reference_id: string | null;
  reference_type: string | null;
  payment_method: string | null;
}

export interface CustomerFlowMeta {
  vouchers: Map<string, VoucherRefMeta>;
  /** sale_returns.id → linked_sale_id */
  returnLinkedSale: Map<string, string | null>;
}

export interface SupplierReturnMeta {
  id: string;
  credit_note_id: string | null;
  linked_bill_id: string | null;
  credit_status: string | null;
  net_amount: number;
}

export interface SupplierFlowMeta {
  vouchers: Map<string, VoucherRefMeta>;
  returns: SupplierReturnMeta[];
}

const EPS = 0.5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const r2 = (n: number) => Math.round(n * 100) / 100;

function billStatus(amount: number, settled: number): FlowBillStatus {
  if (amount - settled <= EPS) return "paid";
  if (settled > EPS) return "partial";
  return "unpaid";
}

const METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  neft: "NEFT",
  rtgs: "RTGS",
  imps: "IMPS",
  bank: "Bank",
  bank_transfer: "Bank transfer",
};

function methodLabel(m?: string | null): string {
  if (!m) return "";
  const key = String(m).toLowerCase();
  if (METHOD_LABELS[key]) return METHOD_LABELS[key];
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Shared assembly once links are known. */
class FlowBuilder {
  sources: FlowSource[] = [];
  bills: FlowBill[] = [];
  links: FlowLink[] = [];
  steps: FlowStep[] = [];
  billById = new Map<string, FlowBill>();
  sourceById = new Map<string, FlowSource>();
  /** Remaining capacity of a source that can still be linked. */
  capacity = new Map<string, number>();

  addSource(s: FlowSource) {
    if (this.sourceById.has(s.id)) return this.sourceById.get(s.id)!;
    this.sources.push(s);
    this.sourceById.set(s.id, s);
    this.capacity.set(s.id, s.raisesBalance ? 0 : s.amount);
    return s;
  }

  addBill(b: Omit<FlowBill, "settled" | "due" | "status" | "parts">) {
    const bill: FlowBill = { ...b, settled: 0, due: b.amount, status: "unpaid", parts: [] };
    this.bills.push(bill);
    this.billById.set(bill.id, bill);
    return bill;
  }

  link(sourceId: string, billId: string, amount: number, kind: FlowKind, step: number) {
    const bill = this.billById.get(billId);
    if (!bill || amount <= 0.004) return 0;
    const source = this.sourceById.get(sourceId);
    const cap = this.capacity.get(sourceId);
    const billLeft = bill.amount - bill.parts.reduce((t, p) => t + p.amount, 0);
    let amt = Math.min(amount, billLeft);
    if (cap !== undefined) amt = Math.min(amt, cap);
    if (amt <= 0.004) return 0;
    if (cap !== undefined) this.capacity.set(sourceId, r2(cap - amt));
    const linkStep = Math.max(step, bill.step, source?.step ?? 0);
    const existing = this.links.find((l) => l.sourceId === sourceId && l.billId === billId);
    if (existing) existing.amount = r2(existing.amount + amt);
    else
      this.links.push({
        id: `${sourceId}→${billId}`,
        sourceId,
        billId,
        amount: r2(amt),
        kind,
        step: linkStep,
      });
    const part = bill.parts.find((p) => p.sourceId === sourceId);
    if (part) part.amount = r2(part.amount + amt);
    else bill.parts.push({ kind, amount: r2(amt), sourceId, step: linkStep });
    return amt;
  }

  /** FIFO: oldest source of `kind` with capacity first, preferring `preferIds`. */
  linkFifo(kind: FlowKind, billId: string, amount: number, step: number, preferIds: string[] = []) {
    let left = amount;
    const ordered = [
      ...preferIds.map((id) => this.sourceById.get(id)).filter(Boolean),
      ...this.sources.filter((s) => s.kind === kind && !preferIds.includes(s.id)),
    ] as FlowSource[];
    for (const s of ordered) {
      if (left <= 0.004) break;
      if (s.kind !== kind) continue;
      left = r2(left - this.link(s.id, billId, left, kind, step));
    }
    return left;
  }

  finish(statusHint: Map<string, boolean>) {
    for (const bill of this.bills) {
      let settled = bill.parts.reduce((s, p) => s + p.amount, 0);
      // The ledger says the bill is settled but some of it came from the account
      // balance (on-account payments, old allocations): show it as such.
      if (statusHint.get(bill.id) && bill.amount - settled > EPS) {
        const rest = r2(bill.amount - settled);
        bill.parts.push({ kind: "account", amount: rest, sourceId: null, step: bill.step });
        settled += rest;
      }
      bill.settled = r2(Math.min(settled, bill.amount));
      bill.due = r2(Math.max(0, bill.amount - settled));
      bill.status = billStatus(bill.amount, settled);
    }
  }

  unlinkedCredit() {
    let total = 0;
    for (const s of this.sources) {
      if (s.raisesBalance || s.kind === "opening") continue;
      total += this.capacity.get(s.id) || 0;
    }
    return r2(total);
  }
}

/**
 * Tile totals from the ledger's own running balance: each row's balance change is
 * booked to its kind, so opening + billed − paid − cn − advance + refund + adjustment
 * always equals the ledger closing balance.
 */
export function totalsFromSteps(steps: FlowStep[], closing: number): PartyFlowTotals {
  const t: PartyFlowTotals = {
    opening: 0, billed: 0, paid: 0, cn: 0, advance: 0, refund: 0, adjustment: 0, closing,
  };
  for (const st of steps) {
    if (st.memo && st.kind !== "opening") continue;
    const d = st.delta;
    switch (st.kind) {
      case "opening": t.opening += d; break;
      case "bill": t.billed += d; break;
      case "payment": t.paid -= d; break;
      case "cn": t.cn -= d; break;
      case "advance": t.advance -= d; break;
      case "refund": t.refund += d; break;
      default: t.adjustment += d; break;
    }
  }
  (Object.keys(t) as (keyof PartyFlowTotals)[]).forEach((k) => { t[k] = r2(t[k]); });
  return t;
}

function stepReference(id: string, kind: FlowStep["kind"], reference: string) {
  if (kind === "opening") return "Opening";
  if (id.endsWith("-payment-at-sale")) return "Paid at sale";
  if (id.endsWith("-payment-at-purchase")) return "Paid at purchase";
  return reference;
}

function isSettledStatus(s?: string | null) {
  const v = String(s || "").toLowerCase();
  return v === "completed" || v === "paid" || v === "settled";
}

/* ───────────────────────────── Customer ───────────────────────────── */

export function buildCustomerPaymentFlow(
  rows: CustomerLedgerTransaction[],
  meta: CustomerFlowMeta,
): PartyFlowModel {
  const b = new FlowBuilder();
  const statusHint = new Map<string, boolean>();
  const saleIds = new Set(rows.filter((r) => r.type === "invoice" && r.id !== "opening-balance").map((r) => r.id));
  /** sale id → return source ids linked to it */
  const returnSourcesBySale = new Map<string, string[]>();
  /** Links that need every source in place first (FIFO). */
  const deferred: Array<() => void> = [];
  let prevBalance = 0;

  rows.forEach((row, step) => {
    const debit = Number(row.debit) || 0;
    const credit = Number(row.credit) || 0;
    const delta = r2(Number(row.balance) - prevBalance);
    const memo = !!row.informational || row.type === "advance_application" || (debit === 0 && credit === 0);
    let kind: FlowStep["kind"] = "payment";
    let label = row.description;

    if (row.type === "invoice" && row.id === "opening-balance") {
      kind = "opening";
      label = row.description;
      if (debit > 0) {
        b.addBill({ id: row.id, isOpening: true, date: row.date, reference: "Opening balance", amount: debit, step });
      } else if (credit > 0) {
        b.addSource({ id: row.id, kind: "opening", date: row.date, reference: "Opening balance", label: "Opening credit", amount: credit, step });
      }
    } else if (row.type === "invoice") {
      kind = "bill";
      const cancelled = String(row.paymentStatus || "").toLowerCase() === "cancelled";
      if (!cancelled) {
        const amount = Number(row.grossBill ?? row.displayDebit ?? debit) || debit;
        b.addBill({ id: row.id, isOpening: false, date: row.date, reference: row.reference, amount, step });
        statusHint.set(row.id, isSettledStatus(row.paymentStatus));
      }
      label = row.reference;
    } else if (row.type === "cn_adjusted") {
      kind = "cn";
      const saleId = row.id.replace(/-cn-applied$/, "");
      const amount = Number(row.displayCredit) || 0;
      deferred.push(() => {
        // Only a return linked to this bill; otherwise show the bill's own CN amount
        // rather than guessing which return it came from.
        const linked = returnSourcesBySale.get(saleId) || [];
        let left = amount;
        for (const id of linked) left = r2(left - b.link(id, saleId, left, "cn", step));
        if (left > 0.004) {
          const sid = `cn-on-bill-${saleId}`;
          b.addSource({ id: sid, kind: "cn", date: row.date, reference: row.reference, label: "CN / S/R adjusted on bill", amount: left, step });
          b.link(sid, saleId, left, "cn", step);
        }
      });
    } else if (row.type === "payment") {
      kind = "payment";
      const atSale = row.id.endsWith("-payment-at-sale");
      const pb = row.paymentBreakdown;
      const methods = atSale
        ? [pb?.cash ? "Cash" : "", pb?.upi ? "UPI" : "", pb?.card ? "Card" : ""].filter(Boolean).join(" + ")
        : methodLabel(pb?.method);
      b.addSource({
        id: row.id,
        kind: "payment",
        date: row.date,
        reference: atSale ? "Paid at sale" : row.reference,
        label: methods || "Payment",
        note: pb?.settlementDiscount ? `incl. ₹${pb.settlementDiscount.toLocaleString("en-IN")} discount` : undefined,
        amount: credit,
        step,
      });
      const saleId = atSale ? row.id.replace(/-payment-at-sale$/, "") : meta.vouchers.get(row.id)?.reference_id;
      if (saleId && saleIds.has(saleId)) b.link(row.id, saleId, credit, "payment", step);
      else if (b.billById.has("opening-balance")) {
        deferred.push(() => b.link(row.id, "opening-balance", credit, "payment", step));
      }
      label = row.reference;
    } else if (row.type === "advance") {
      kind = "advance";
      const remaining = row.advanceRemaining;
      b.addSource({
        id: row.id,
        kind: "advance",
        date: row.date,
        reference: row.reference,
        label: `Advance${row.paymentBreakdown?.method ? ` · ${methodLabel(row.paymentBreakdown.method)}` : ""}`,
        note: remaining !== undefined && remaining > 0 ? `₹${remaining.toLocaleString("en-IN")} unused` : undefined,
        amount: credit,
        step,
      });
      label = row.reference;
    } else if (row.type === "advance_application") {
      const m = meta.vouchers.get(row.id);
      const isCn = m?.payment_method === "credit_note_adjustment";
      kind = isCn ? "cn" : "advance";
      const amount = Number(row.appliedAmount) || 0;
      const saleId = m?.reference_id || "";
      deferred.push(() => {
        if (!saleIds.has(saleId)) return;
        if (isCn) b.linkFifo("cn", saleId, amount, step, returnSourcesBySale.get(saleId) || []);
        else b.linkFifo("advance", saleId, amount, step);
      });
    } else if (row.type === "return" || row.type === "credit_note") {
      kind = "cn";
      const amount = Number(row.displayCredit ?? credit) || credit;
      const srId = row.type === "return" ? row.id.replace(/^cn-(memo-)?/, "") : null;
      b.addSource({
        id: row.id,
        kind: "cn",
        date: row.date,
        reference: row.reference,
        label: row.type === "return" ? "Sale return" : "Credit note",
        note: row.informational ? "used on bill" : row.status === "pending" ? "available" : undefined,
        amount,
        step,
      });
      const linked = srId ? meta.returnLinkedSale.get(srId) : null;
      if (linked) {
        const list = returnSourcesBySale.get(linked) || [];
        list.push(row.id);
        returnSourcesBySale.set(linked, list);
      }
    } else if (row.type === "refund" || row.type === "adv_refund" || row.type === "cn_refund") {
      kind = "refund";
      b.addSource({
        id: row.id,
        kind: "refund",
        date: row.date,
        reference: row.reference,
        label: row.type === "adv_refund" ? "Advance refund" : row.type === "cn_refund" ? "CN refund" : "Refund paid",
        amount: debit,
        raisesBalance: true,
        step,
      });
    } else if (row.type === "adjustment") {
      kind = "adjustment";
      if (debit > 0 || credit > 0) {
        b.addSource({
          id: row.id,
          kind: "adjustment",
          date: row.date,
          reference: "Adjustment",
          label: row.description.replace(/^Balance Adjustment:\s*/, ""),
          amount: debit > 0 ? debit : credit,
          raisesBalance: debit > 0,
          step,
        });
      }
    }

    b.steps.push({
      id: row.id,
      step,
      date: row.date,
      reference: stepReference(row.id, kind, row.reference),
      label,
      kind,
      delta: memo ? 0 : delta,
      balance: Number(row.balance) || 0,
      memo,
    });
    if (!memo || kind === "opening") prevBalance = Number(row.balance) || 0;
  });

  deferred.forEach((fn) => fn());
  b.finish(statusHint);
  const totals = totalsFromSteps(b.steps, rows.length ? Number(rows[rows.length - 1].balance) || 0 : 0);
  return {
    party: "customer",
    sources: b.sources,
    bills: b.bills,
    links: b.links,
    steps: b.steps,
    totals,
    unlinkedCredit: b.unlinkedCredit(),
  };
}

/* ───────────────────────────── Supplier ───────────────────────────── */

export function buildSupplierPaymentFlow(
  rows: SupplierLedgerTransaction[],
  meta: SupplierFlowMeta,
): PartyFlowModel {
  const b = new FlowBuilder();
  const statusHint = new Map<string, boolean>();
  const billIds = new Set(rows.filter((r) => r.type === "bill" && r.id !== "opening-balance").map((r) => r.id));
  const returnsByCn = new Map<string, SupplierReturnMeta[]>();
  const returnById = new Map<string, SupplierReturnMeta>();
  for (const pr of meta.returns) {
    returnById.set(pr.id, pr);
    if (pr.credit_note_id) {
      const list = returnsByCn.get(pr.credit_note_id) || [];
      list.push(pr);
      returnsByCn.set(pr.credit_note_id, list);
    }
  }
  const deferred: Array<() => void> = [];
  let prevBalance = 0;

  rows.forEach((row, step) => {
    const debit = Number(row.debit) || 0;
    const credit = Number(row.credit) || 0;
    const delta = r2(Number(row.balance) - prevBalance);
    const memo = debit === 0 && credit === 0;
    let kind: FlowStep["kind"] = "payment";
    let label = row.description;

    if (row.id === "opening-balance") {
      kind = "opening";
      if (credit > 0) {
        b.addBill({ id: row.id, isOpening: true, date: row.date, reference: "Opening balance", amount: credit, step });
      } else if (credit < 0) {
        b.addSource({ id: row.id, kind: "opening", date: row.date, reference: "Opening balance", label: "Opening advance", amount: -credit, step });
      }
    } else if (row.type === "bill") {
      kind = "bill";
      b.addBill({ id: row.id, isOpening: false, date: row.date, reference: row.reference, amount: credit, step });
      const st = row.description.replace(/^Purchase Bill - /, "");
      statusHint.set(row.id, isSettledStatus(st));
      label = row.reference;
    } else if (row.type === "payment" && credit > 0) {
      kind = "refund";
      b.addSource({
        id: row.id, kind: "refund", date: row.date, reference: row.reference,
        label: "Refund received", amount: credit, raisesBalance: true, step,
      });
    } else if (row.type === "payment") {
      kind = "payment";
      const atPurchase = row.id.endsWith("-payment-at-purchase");
      const m = meta.vouchers.get(row.id);
      b.addSource({
        id: row.id,
        kind: "payment",
        date: row.date,
        reference: atPurchase ? "Paid at purchase" : row.reference,
        label: atPurchase ? "Payment" : methodLabel(m?.payment_method) || "Payment",
        amount: debit,
        step,
      });
      const billId = atPurchase ? row.id.replace(/-payment-at-purchase$/, "") : m?.reference_id;
      if (billId && billIds.has(billId)) b.link(row.id, billId, debit, "payment", step);
      else if (b.billById.has("opening-balance")) {
        deferred.push(() => b.link(row.id, "opening-balance", debit, "payment", step));
      }
      label = row.reference;
    } else if (row.type === "credit_note") {
      kind = "cn";
      if (debit > 0) {
        b.addSource({
          id: row.id, kind: "cn", date: row.date, reference: row.reference,
          label: row.id.startsWith("pr-") ? "Purchase return" : "Credit note",
          amount: debit, step,
        });
        const prs = row.id.startsWith("pr-")
          ? [returnById.get(row.id.slice(3))].filter(Boolean) as SupplierReturnMeta[]
          : returnsByCn.get(row.id) || [];
        const againstBill = prs.filter(
          (pr) => pr.credit_status === "adjusted" && pr.linked_bill_id && billIds.has(pr.linked_bill_id),
        );
        let left = debit;
        for (const pr of againstBill) {
          const amt = Math.min(left, pr.net_amount > 0 ? pr.net_amount : left);
          left = r2(left - b.link(row.id, pr.linked_bill_id!, amt, "cn", step));
        }
      }
    } else if (row.type === "purchase_return") {
      // Pending return: shown in the ledger with no balance effect.
      kind = "cn";
    }

    b.steps.push({
      id: row.id,
      step,
      date: row.date,
      reference: stepReference(row.id, kind, row.reference),
      label,
      kind,
      delta: memo ? 0 : delta,
      balance: Number(row.balance) || 0,
      memo,
    });
    if (!memo || kind === "opening") prevBalance = Number(row.balance) || 0;
  });

  deferred.forEach((fn) => fn());
  b.finish(statusHint);
  const totals = totalsFromSteps(b.steps, rows.length ? Number(rows[rows.length - 1].balance) || 0 : 0);
  return {
    party: "supplier",
    sources: b.sources,
    bills: b.bills,
    links: b.links,
    steps: b.steps,
    totals,
    unlinkedCredit: b.unlinkedCredit(),
  };
}

/* ───────────────────────────── Loaders ───────────────────────────── */

async function fetchVoucherMeta(ids: string[]): Promise<Map<string, VoucherRefMeta>> {
  const out = new Map<string, VoucherRefMeta>();
  const uuids = Array.from(new Set(ids.filter((id) => UUID_RE.test(id))));
  for (let i = 0; i < uuids.length; i += 200) {
    const chunk = uuids.slice(i, i + 200);
    const { data, error } = await supabase
      .from("voucher_entries")
      .select("id, reference_id, reference_type, payment_method")
      .in("id", chunk);
    if (error) throw error;
    for (const v of data || []) {
      out.set(v.id, {
        reference_id: v.reference_id ?? null,
        reference_type: v.reference_type ?? null,
        payment_method: v.payment_method ?? null,
      });
    }
  }
  return out;
}

export interface PartyFlowRange {
  startDate: Date | null;
  endDate: Date | null;
}

export async function loadCustomerPaymentFlow(
  organizationId: string,
  customerId: string,
  range: PartyFlowRange,
): Promise<PartyFlowModel> {
  const [rows, returnsRes] = await Promise.all([
    fetchCustomerLedgerTransactions(organizationId, customerId, range),
    supabase
      .from("sale_returns")
      .select("id, linked_sale_id")
      .eq("customer_id", customerId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
  ]);
  if (returnsRes.error) throw returnsRes.error;
  const voucherIds = rows
    .filter((r) => r.type === "payment" || r.type === "advance_application")
    .map((r) => r.id);
  const vouchers = await fetchVoucherMeta(voucherIds);
  const returnLinkedSale = new Map<string, string | null>(
    (returnsRes.data || []).map((r: any) => [r.id, r.linked_sale_id ?? null]),
  );
  return buildCustomerPaymentFlow(rows, { vouchers, returnLinkedSale });
}

export async function loadSupplierPaymentFlow(
  organizationId: string,
  supplier: { id: string; opening_balance?: number | null },
  range: PartyFlowRange,
): Promise<PartyFlowModel> {
  const [rows, returnsRes] = await Promise.all([
    fetchSupplierLedgerTransactions(
      organizationId,
      supplier,
      range.startDate ?? undefined,
      range.endDate ?? undefined,
    ),
    supabase
      .from("purchase_returns" as any)
      .select("id, credit_note_id, linked_bill_id, credit_status, net_amount")
      .eq("supplier_id", supplier.id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
  ]);
  // Older schemas may lack linked_bill_id: links fall back to "on account".
  const returns: SupplierReturnMeta[] = returnsRes.error
    ? []
    : ((returnsRes.data as any[]) || []).map((r) => ({
        id: r.id,
        credit_note_id: r.credit_note_id ?? null,
        linked_bill_id: r.linked_bill_id ?? null,
        credit_status: r.credit_status ?? null,
        net_amount: Number(r.net_amount) || 0,
      }));
  const voucherIds = rows.filter((r) => r.type === "payment").map((r) => r.id);
  const vouchers = await fetchVoucherMeta(voucherIds);
  return buildSupplierPaymentFlow(rows, { vouchers, returns });
}

/* ───────────────────────── One bill: how it was paid ───────────────────────── */

export interface BillPaymentStep {
  /** null for the "bill raised" row. */
  kind: FlowKind | "bill";
  sourceId: string | null;
  reference: string;
  label: string;
  date: string;
  amount: number;
  /** Still due on the bill after this step. */
  dueAfter: number;
  /** For a source split over several bills: its full amount. */
  sourceTotal?: number;
}

/** Bill raised, then each part that settled it in ledger order, with the due after each. */
export function billPaymentSteps(bill: FlowBill, sources: FlowSource[]): BillPaymentStep[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const steps: BillPaymentStep[] = [
    {
      kind: "bill",
      sourceId: null,
      reference: bill.reference,
      label: bill.isOpening ? "Opening balance" : "Bill raised",
      date: bill.date,
      amount: bill.amount,
      dueAfter: bill.amount,
    },
  ];
  let due = bill.amount;
  const parts = [...bill.parts].sort((a, b) => a.step - b.step);
  for (const p of parts) {
    const s = p.sourceId ? byId.get(p.sourceId) : undefined;
    due = r2(Math.max(0, due - p.amount));
    steps.push({
      kind: p.kind,
      sourceId: p.sourceId,
      reference: s ? s.reference : "Account balance",
      label: s ? s.label : "Cleared from account balance",
      date: s ? s.date : bill.date,
      amount: p.amount,
      dueAfter: due,
      sourceTotal: s && s.amount - p.amount > 0.5 ? s.amount : undefined,
    });
  }
  return steps;
}
