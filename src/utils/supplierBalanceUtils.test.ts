import { describe, expect, it } from "vitest";
import {
  computeSnapshotForSupplier,
  supplierAccountAdjustmentTotal,
  supplierLedgerReconFromTransactions,
} from "@/utils/supplierBalanceUtils";

const SUPPLIER = "supplier-sangamn";
const OTHER = "supplier-other";

/** Gurukrupa / SANGAMN FASHION ledger PDF 25-08-2026: table close ₹1,54,648 Cr. */
describe("computeSnapshotForSupplier", () => {
  it("SANGAMN: generic supplier-id payments and unlinked CN return do not double-count", () => {
    const snap = computeSnapshotForSupplier(
      SUPPLIER,
      0,
      [
        {
          id: "bill-1656",
          supplier_id: SUPPLIER,
          net_amount: 250000,
          paid_amount: 100000,
          software_bill_no: "1656",
          supplier_invoice_no: "1656",
        },
        {
          id: "bill-1658",
          supplier_id: SUPPLIER,
          net_amount: 245669,
          paid_amount: 110328,
          software_bill_no: "1658",
          supplier_invoice_no: "1658",
        },
      ],
      [
        {
          reference_id: SUPPLIER,
          total_amount: 100000,
          description: "Payment at purchase",
        },
        {
          reference_id: SUPPLIER,
          total_amount: 110328,
          description: "Payment at purchase",
        },
      ],
      [
        { id: "cn-pr-3", reference_id: SUPPLIER, total_amount: 60328 },
        { id: "cn-pr-11", reference_id: SUPPLIER, total_amount: 70365 },
      ],
      [
        {
          supplier_id: SUPPLIER,
          net_amount: 60328,
          credit_note_id: null,
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
        {
          supplier_id: SUPPLIER,
          net_amount: 70365,
          credit_note_id: "cn-pr-11",
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
      ],
      0,
    );

    expect(snap.totalPurchases).toBe(495669);
    expect(snap.totalPaid).toBe(210328);
    expect(snap.totalCreditNotesNet).toBe(130693);
    expect(snap.unreflectedReturns).toBe(0);
    expect(snap.balance).toBe(154648);
  });

  it("still counts a return with no matching credit-note voucher", () => {
    const snap = computeSnapshotForSupplier(
      SUPPLIER,
      0,
      [
        {
          id: "bill-1",
          supplier_id: SUPPLIER,
          net_amount: 10000,
          paid_amount: 0,
          software_bill_no: "B1",
          supplier_invoice_no: "B1",
        },
      ],
      [],
      [],
      [
        {
          supplier_id: SUPPLIER,
          net_amount: 2500,
          credit_note_id: null,
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
      ],
      0,
    );
    expect(snap.unreflectedReturns).toBe(2500);
    expect(snap.balance).toBe(7500);
  });

  it("counts on-account supplier payments that are not on any bill paid_amount", () => {
    const snap = computeSnapshotForSupplier(
      SUPPLIER,
      0,
      [
        {
          id: "bill-1",
          supplier_id: SUPPLIER,
          net_amount: 10000,
          paid_amount: 0,
          software_bill_no: "B1",
          supplier_invoice_no: "B1",
        },
      ],
      [{ reference_id: SUPPLIER, total_amount: 4000, description: "Opening Balance Payment" }],
      [],
      [],
      0,
    );
    expect(snap.totalPaid).toBe(4000);
    expect(snap.balance).toBe(6000);
  });

  it("does not double bill-linked vouchers that already sit in paid_amount", () => {
    const snap = computeSnapshotForSupplier(
      SUPPLIER,
      0,
      [
        {
          id: "bill-1",
          supplier_id: SUPPLIER,
          net_amount: 10000,
          paid_amount: 3000,
          software_bill_no: "B1",
          supplier_invoice_no: "B1",
        },
      ],
      [
        {
          reference_id: "bill-1",
          total_amount: 3000,
          description: "Payment for Bill: B1 | Supplier: X",
        },
      ],
      [],
      [],
      0,
    );
    expect(snap.totalPaid).toBe(3000);
    expect(snap.balance).toBe(7000);
  });

  it("ignores another supplier's bills, vouchers, and returns", () => {
    const snap = computeSnapshotForSupplier(
      SUPPLIER,
      0,
      [
        {
          id: "bill-own",
          supplier_id: SUPPLIER,
          net_amount: 5000,
          paid_amount: 0,
          software_bill_no: "OWN",
          supplier_invoice_no: "OWN",
        },
        {
          id: "bill-other",
          supplier_id: OTHER,
          net_amount: 99999,
          paid_amount: 50000,
          software_bill_no: "OTH",
          supplier_invoice_no: "OTH",
        },
      ],
      [{ reference_id: OTHER, total_amount: 50000, description: "Payment at purchase" }],
      [{ id: "cn-other", reference_id: OTHER, total_amount: 1000 }],
      [
        {
          supplier_id: OTHER,
          net_amount: 1000,
          credit_note_id: null,
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
      ],
      0,
    );
    expect(snap.totalPurchases).toBe(5000);
    expect(snap.totalPaid).toBe(0);
    expect(snap.totalCreditNotesNet).toBe(0);
    expect(snap.unreflectedReturns).toBe(0);
    expect(snap.balance).toBe(5000);
  });

  it("SARASWATI: CN-on-bill is not cash; outstanding returns stay in account adjust", () => {
    const snap = computeSnapshotForSupplier(
      SUPPLIER,
      0,
      [
        {
          id: "bill-cash",
          supplier_id: SUPPLIER,
          net_amount: 706246.85,
          paid_amount: 735837,
          software_bill_no: "2808",
          supplier_invoice_no: "2808",
        },
        {
          id: "bill-4507",
          supplier_id: SUPPLIER,
          net_amount: 170563.15,
          paid_amount: 17363.85,
          software_bill_no: "4507",
          supplier_invoice_no: "4507",
        },
      ],
      [
        { reference_id: "bill-cash", total_amount: 706246.85, description: "Payment for Bill: 2808" },
      ],
      [{ id: "cn-bill-4507", reference_id: SUPPLIER, total_amount: 17363.85 }],
      [
        {
          supplier_id: SUPPLIER,
          net_amount: 19105.8,
          credit_note_id: null,
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
        {
          supplier_id: SUPPLIER,
          net_amount: 10389.75,
          credit_note_id: null,
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
        {
          supplier_id: SUPPLIER,
          net_amount: 57930.6,
          credit_note_id: null,
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
        {
          supplier_id: SUPPLIER,
          net_amount: 17363.85,
          credit_note_id: "cn-bill-4507",
          credit_status: "adjusted",
          linked_bill_id: "bill-4507",
          credit_available_balance: 0,
        },
      ],
      0,
    );

    expect(snap.totalPurchases).toBe(876810);
    expect(snap.totalPaid).toBe(706246.85);
    expect(snap.unreflectedReturns).toBe(87426.15);
    expect(snap.totalCreditNotesNet).toBe(0);
    expect(supplierAccountAdjustmentTotal(snap)).toBe(87426.15);
    expect(snap.balance).toBe(83137);
  });

  it("does not treat a bill-referenced CN id as linking an outstanding return", () => {
    const snap = computeSnapshotForSupplier(
      SUPPLIER,
      0,
      [
        {
          id: "bill-1",
          supplier_id: SUPPLIER,
          net_amount: 50000,
          paid_amount: 0,
          software_bill_no: "B1",
          supplier_invoice_no: "B1",
        },
      ],
      [],
      [{ id: "cn-on-bill", reference_id: "bill-1", total_amount: 15235.15 }],
      [
        {
          supplier_id: SUPPLIER,
          net_amount: 15235.15,
          credit_note_id: "cn-on-bill",
          credit_status: "adjusted_outstanding",
          linked_bill_id: null,
          credit_available_balance: null,
        },
      ],
      0,
    );
    expect(snap.unreflectedReturns).toBe(15235.15);
    expect(snap.totalCreditNotesNet).toBe(0);
    expect(snap.balance).toBe(34764.85);
  });
});

describe("supplierLedgerReconFromTransactions", () => {
  it("SARASWATI table grand total: paid cash, CN adj, close 83137", () => {
    const recon = supplierLedgerReconFromTransactions([
      { type: "bill", reference: "3480", debit: 0, credit: 876810, balance: 876810 },
      { type: "credit_note", reference: "PR/25-26/41", debit: 87426.15, credit: 0, balance: 789383.85 },
      { type: "payment", reference: "PAY/1", debit: 706246.85, credit: 0, balance: 83137 },
    ]);
    expect(recon?.totalPurchases).toBe(876810);
    expect(recon?.accountAdjust).toBe(87426.15);
    expect(recon?.totalPaid).toBe(706246.85);
    expect(recon?.balance).toBe(83137);
  });
});
