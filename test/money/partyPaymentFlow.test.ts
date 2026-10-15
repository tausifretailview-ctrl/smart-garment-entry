/**
 * Payment Flow page: links each payment / advance / CN to the bill it settled while the
 * tiles and closing balance stay equal to the ledger rows they are built from.
 */
import { describe, expect, it } from "vitest";
import { createFakeLedgerClient, type LedgerDb } from "../helpers/fakeLedgerSupabase";
import { fetchCustomerLedgerTransactionsWithClient } from "@/utils/customerLedgerTransactions";
import type { SupplierLedgerTransaction } from "@/utils/supplierLedgerTransactions";
import {
  buildCustomerPaymentFlow,
  buildSupplierPaymentFlow,
  type PartyFlowTotals,
  type VoucherRefMeta,
} from "@/utils/partyPaymentFlow";

const ORG = "org-flow-fixture";
const CUST = "c-flow";

function reconciles(t: PartyFlowTotals) {
  return t.opening + t.billed - t.paid - t.cn - t.advance + t.refund + t.adjustment;
}

function customerDb(): LedgerDb {
  const sale = (id: string, no: string, date: string, net: number, cash: number) => ({
    id,
    organization_id: ORG,
    customer_id: CUST,
    sale_number: no,
    sale_type: "invoice",
    sale_date: date,
    created_at: `${date}T10:00:00.000Z`,
    gross_amount: net,
    discount_amount: 0,
    flat_discount_amount: 0,
    net_amount: net,
    paid_amount: cash,
    sale_return_adjust: 0,
    refund_amount: 0,
    payment_status: cash >= net ? "completed" : cash > 0 ? "partial" : "pending",
    is_cancelled: false,
    cash_amount: cash,
    card_amount: 0,
    upi_amount: 0,
    payment_method: "cash",
    deleted_at: null,
  });
  return {
    customers: [{ id: CUST, organization_id: ORG, opening_balance: 1000, deleted_at: null }],
    sales: [
      sale("s1", "INV/1", "2026-05-01", 5000, 2000),
      sale("s2", "INV/2", "2026-06-01", 3000, 0),
    ],
    voucher_entries: [
      {
        id: "v-ob",
        organization_id: ORG,
        voucher_type: "receipt",
        voucher_number: "RCP/1",
        voucher_date: "2026-04-10",
        created_at: "2026-04-10T10:00:00.000Z",
        reference_type: "customer",
        reference_id: CUST,
        total_amount: 1000,
        payment_method: "cash",
        description: "Opening balance payment",
        deleted_at: null,
      },
      {
        id: "v-s1",
        organization_id: ORG,
        voucher_type: "receipt",
        voucher_number: "RCP/2",
        voucher_date: "2026-05-20",
        created_at: "2026-05-20T10:00:00.000Z",
        reference_type: "sale",
        reference_id: "s1",
        total_amount: 1500,
        payment_method: "upi",
        description: "Payment received",
        deleted_at: null,
      },
      {
        id: "v-adv",
        organization_id: ORG,
        voucher_type: "receipt",
        voucher_number: "ADJ/1",
        voucher_date: "2026-06-02",
        created_at: "2026-06-02T10:00:00.000Z",
        reference_type: "sale",
        reference_id: "s2",
        total_amount: 800,
        payment_method: "advance_adjustment",
        description: "Adjusted from advance balance for INV/2",
        deleted_at: null,
      },
    ],
    customer_advances: [
      {
        id: "a1",
        organization_id: ORG,
        customer_id: CUST,
        advance_number: "ADV/1",
        advance_date: "2026-05-25",
        created_at: "2026-05-25T10:00:00.000Z",
        amount: 800,
        used_amount: 800,
        status: "fully_used",
        payment_method: "cash",
      },
    ],
    customer_balance_adjustments: [],
    sale_returns: [],
    credit_notes: [],
  } as unknown as LedgerDb;
}

describe("customer payment flow", () => {
  it("links each receipt to its bill and keeps the ledger closing balance", async () => {
    const db = customerDb();
    const rows = await fetchCustomerLedgerTransactionsWithClient(
      createFakeLedgerClient(db) as never,
      ORG,
      CUST,
      { startDate: null, endDate: null },
    );
    const vouchers = new Map<string, VoucherRefMeta>(
      (db.voucher_entries as any[]).map((v) => [
        v.id,
        { reference_id: v.reference_id, reference_type: v.reference_type, payment_method: v.payment_method },
      ]),
    );
    const model = buildCustomerPaymentFlow(rows, { vouchers, returnLinkedSale: new Map() });

    const closing = rows[rows.length - 1].balance;
    expect(model.totals.closing).toBe(closing);
    expect(reconciles(model.totals)).toBeCloseTo(closing, 2);

    const linkAmount = (sourceId: string, billId: string) =>
      model.links.find((l) => l.sourceId === sourceId && l.billId === billId)?.amount ?? 0;
    expect(linkAmount("s1-payment-at-sale", "s1")).toBe(2000);
    expect(linkAmount("v-s1", "s1")).toBe(1500);
    expect(linkAmount("v-ob", "opening-balance")).toBe(1000);
    expect(linkAmount("a1", "s2")).toBe(800);

    const bill = (id: string) => model.bills.find((b) => b.id === id)!;
    expect(bill("opening-balance").status).toBe("paid");
    expect(bill("s1").status).toBe("partial");
    expect(bill("s1").due).toBe(1500);
    expect(bill("s2").status).toBe("partial");
    expect(bill("s2").due).toBe(2200);
  });
});

describe("supplier payment flow", () => {
  const row = (r: Partial<SupplierLedgerTransaction> & { id: string; balance: number }): SupplierLedgerTransaction => ({
    date: "2026-05-01",
    type: "payment",
    reference: r.id,
    description: "",
    debit: 0,
    credit: 0,
    ...r,
  });

  it("links paid-at-purchase, vouchers and a bill-adjusted CN; refunds raise the balance", () => {
    const rows: SupplierLedgerTransaction[] = [
      row({ id: "opening-balance", type: "bill", date: "1900-01-01", reference: "Opening", credit: 2000, balance: 2000 }),
      row({ id: "b1", type: "bill", reference: "PB/1", description: "Purchase Bill - completed", credit: 10000, balance: 12000 }),
      row({ id: "b1-payment-at-purchase", reference: "PB/1", description: "Payment at purchase", debit: 4000, balance: 8000 }),
      row({ id: "v1", reference: "PAY/1", debit: 5000, balance: 3000 }),
      row({ id: "cn1", type: "credit_note", reference: "SCN-1", debit: 1000, balance: 2000 }),
      row({ id: "v2", reference: "PAY/2", debit: 2000, balance: 0 }),
      row({ id: "r1", reference: "RCV/1", credit: 300, balance: 300 }),
    ];
    const vouchers = new Map<string, VoucherRefMeta>([
      ["v1", { reference_id: "b1", reference_type: "supplier", payment_method: "bank" }],
      ["v2", { reference_id: "sup-1", reference_type: "supplier", payment_method: "cash" }],
    ]);
    const model = buildSupplierPaymentFlow(rows, {
      vouchers,
      returns: [
        { id: "pr1", credit_note_id: "cn1", linked_bill_id: "b1", credit_status: "adjusted", net_amount: 1000 },
      ],
    });

    expect(model.totals.closing).toBe(300);
    expect(reconciles(model.totals)).toBeCloseTo(300, 2);
    expect(model.totals.refund).toBe(300);

    const b1 = model.bills.find((b) => b.id === "b1")!;
    expect(b1.status).toBe("paid");
    expect(b1.parts.map((p) => [p.sourceId, p.amount])).toEqual([
      ["b1-payment-at-purchase", 4000],
      ["v1", 5000],
      ["cn1", 1000],
    ]);
    const opening = model.bills.find((b) => b.id === "opening-balance")!;
    expect(opening.settled).toBe(2000);
    expect(opening.status).toBe("paid");
  });
});

describe("one bill: how it was paid", () => {
  it("lists bill raised then each part with the due after it", async () => {
    const { billPaymentSteps } = await import("@/utils/partyPaymentFlow");
    const bill = {
      id: "b1", isOpening: false, date: "2026-05-01", reference: "INV/1", amount: 5000,
      settled: 3500, due: 1500, status: "partial" as const, step: 1,
      parts: [
        { kind: "payment" as const, amount: 1500, sourceId: "v2", step: 4 },
        { kind: "payment" as const, amount: 2000, sourceId: "v1", step: 2 },
      ],
    };
    const sources = [
      { id: "v1", kind: "payment" as const, date: "2026-05-01", reference: "Paid at sale", label: "Cash", amount: 2000, step: 2 },
      { id: "v2", kind: "advance" as const, date: "2026-05-20", reference: "ADV/1", label: "Advance", amount: 4000, step: 4 },
    ];
    const steps = billPaymentSteps(bill, sources);
    expect(steps.map((s) => [s.reference, s.amount, s.dueAfter])).toEqual([
      ["INV/1", 5000, 5000],
      ["Paid at sale", 2000, 3000],
      ["ADV/1", 1500, 1500],
    ]);
    expect(steps[2].sourceTotal).toBe(4000);
  });
});
