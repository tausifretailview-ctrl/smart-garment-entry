import { describe, expect, it } from "vitest";
import {
  transformPaymentsToVouchers,
  transformPurchaseReturnsToDebitNotes,
  transformPurchasesToVouchers,
  transformReceiptsToVouchers,
  transformSaleReturnsToCreditNotes,
  transformSalesToVouchers,
} from "./tallyExportUtils";

const ORG_GSTIN = "27ABCDE1234F1Z5";
// Same-state customer GSTIN → intra-state (CGST + SGST, no IGST).
const INTRA_STATE_GSTIN = "27XYZPQ5678G1Z2";

const exclusiveSale = (lineTotal: number, gstPercent: number, taxType = "exclusive") => ({
  sale_date: "2026-09-10",
  sale_number: "INV/26-27/1",
  customer_name: "Test Customer",
  customer_gstin: INTRA_STATE_GSTIN,
  tax_type: taxType,
  sale_items: [
    {
      product_name: "AEROSYNC PB-12",
      hsn_code: "8507",
      quantity: 1,
      unit_price: lineTotal,
      line_total: lineTotal,
      gst_percent: gstPercent,
    },
  ],
});

describe("tally export Total Amount (gross, not taxable-only)", () => {
  it("exclusive: 195.65 + 4.89 + 4.89 = 205.43 (KS FOOTWEAR sample row)", () => {
    const [row] = transformSalesToVouchers([exclusiveSale(195.65, 5)], ORG_GSTIN);
    expect(row.taxableAmount).toBe(195.65);
    expect(row.cgstAmount).toBe(4.89);
    expect(row.sgstAmount).toBe(4.89);
    expect(row.igstAmount).toBe(0);
    expect(row.totalAmount).toBe(205.43);
  });

  it("Total always equals the sum of its displayed Taxable + tax columns", () => {
    const [row] = transformSalesToVouchers([exclusiveSale(999.99, 18)], ORG_GSTIN);
    expect(row.totalAmount).toBe(
      Number((row.taxableAmount + row.cgstAmount + row.sgstAmount + row.igstAmount).toFixed(2)),
    );
  });

  it("inclusive: reconstructed total matches line_total within 1p", () => {
    const [row] = transformSalesToVouchers([exclusiveSale(1180, 18, "inclusive")], ORG_GSTIN);
    expect(row.taxableAmount).toBe(1000);
    expect(row.cgstAmount).toBe(90);
    expect(row.sgstAmount).toBe(90);
    expect(row.totalAmount).toBe(1180);
  });

  it("inclusive sweep: gross reconstruction never drifts more than 1p from line_total", () => {
    for (const rate of [0, 5, 12, 18, 28]) {
      for (let paise = 101; paise <= 20000000; paise += 7919) {
        const lineTotal = paise / 100;
        const [row] = transformSalesToVouchers(
          [exclusiveSale(lineTotal, rate, "inclusive")],
          ORG_GSTIN,
        );
        expect(Math.abs(row.totalAmount - lineTotal)).toBeLessThanOrEqual(0.010001);
      }
    }
  });

  it("odd-cent GST splits asymmetrically so halves sum exactly to the GST", () => {
    const [row] = transformSalesToVouchers([exclusiveSale(100.1, 18, "inclusive")], ORG_GSTIN);
    expect(Number((row.cgstAmount + row.sgstAmount).toFixed(2))).toBe(
      Number((row.totalAmount - row.taxableAmount).toFixed(2)),
    );
    expect(Math.abs(row.totalAmount - 100.1)).toBeLessThanOrEqual(0.010001);
  });

  it("credit notes use the gross total too", () => {
    const [row] = transformSaleReturnsToCreditNotes(
      [
        {
          return_date: "2026-09-11",
          return_number: "SR/26-27/1",
          customer_name: "Test Customer",
          customer_gstin: INTRA_STATE_GSTIN,
          sale_return_items: [
            {
              product_name: "AEROSYNC PB-12",
              hsn_code: "8507",
              quantity: 1,
              unit_price: 195.65,
              line_total: 195.65,
              gst_percent: 5,
            },
          ],
        },
      ],
      ORG_GSTIN,
    );
    expect(row.totalAmount).toBe(205.43);
  });

  it("purchase vouchers and debit notes use the gross total too", () => {
    const [purchase] = transformPurchasesToVouchers(
      [
        {
          bill_date: "2026-09-10",
          software_bill_no: "PUR/26-27/1",
          supplier_name: "Test Supplier",
          supplier: { gst_number: INTRA_STATE_GSTIN },
          purchase_items: [
            {
              product_name: "AEROSYNC PB-12",
              hsn_code: "8507",
              qty: 2,
              pur_price: 100,
              line_total: 200,
              gst_per: 12,
            },
          ],
        },
      ],
      ORG_GSTIN,
    );
    expect(purchase.taxableAmount).toBe(200);
    expect(purchase.totalAmount).toBe(224);

    const [debit] = transformPurchaseReturnsToDebitNotes(
      [
        {
          return_date: "2026-09-11",
          return_number: "PR/26-27/1",
          supplier_name: "Test Supplier",
          supplier: { gst_number: INTRA_STATE_GSTIN },
          purchase_return_items: [
            {
              product_name: "AEROSYNC PB-12",
              hsn_code: "8507",
              qty: 1,
              pur_price: 200,
              line_total: 200,
              gst_per: 12,
            },
          ],
        },
      ],
      ORG_GSTIN,
    );
    expect(debit.totalAmount).toBe(224);
  });
});

describe("tally export receipt/payment voucher_type matching", () => {
  const mixedVouchers = [
    { voucher_type: "Receipt", voucher_date: "2026-09-01", voucher_number: "R1", total_amount: 100, payment_method: "cash", description: "Cash received", reference_id: "c1" },
    { voucher_type: "RECEIPT", voucher_date: "2026-09-02", voucher_number: "R2", total_amount: 200, payment_method: "upi", description: "UPI received", reference_id: "c1" },
    { voucher_type: "receipt", voucher_date: "2026-09-03", voucher_number: "R3", total_amount: 300, payment_method: "", description: "", reference_id: "c1" },
    { voucher_type: "payment", voucher_date: "2026-09-04", voucher_number: "P1", total_amount: 400, payment_method: "bank", description: "NEFT paid", reference_id: "s1" },
    { voucher_type: "PAYMENT", voucher_date: "2026-09-05", voucher_number: "P2", total_amount: 500, payment_method: "card", description: "Card paid", reference_id: "s1" },
  ];

  it("matches Receipt/RECEIPT/receipt and excludes payments", () => {
    const rows = transformReceiptsToVouchers(mixedVouchers);
    expect(rows.map((r) => r.voucherNo)).toEqual(["R1", "R2", "R3"]);
  });

  it("matches payment/PAYMENT and excludes receipts", () => {
    const rows = transformPaymentsToVouchers(mixedVouchers);
    expect(rows.map((r) => r.voucherNo)).toEqual(["P1", "P2"]);
  });

  it("uses the customer name as Party Ledger, not the payment narration", () => {
    const [row] = transformReceiptsToVouchers([
      {
        voucher_type: "receipt",
        voucher_date: "2026-09-01",
        voucher_number: "RCP/26-27/4387-1",
        total_amount: 847,
        payment_method: "upi",
        reference_type: "sale",
        reference_id: "78b7c398-6d1a-4ed7-bb29-e4b38dc6edac",
        description: "Payment for INV/26-27/17 | Transaction ID: 78b7c398-6d1a-4ed7-bb29-e4b38dc6edac",
        customer_name: "RAHUL SHARMA",
      },
    ]);
    expect(row.partyLedger).toBe("RAHUL SHARMA");
    expect(row.partyLedger).not.toContain("Payment for");
  });

  it("does not put the payment narration in Party Ledger when the customer name is missing", () => {
    const [row] = transformReceiptsToVouchers([
      {
        voucher_type: "receipt",
        voucher_date: "2026-09-01",
        voucher_number: "RCP/26-27/4387-1",
        total_amount: 847,
        payment_method: "upi",
        reference_type: "sale",
        reference_id: "sale-1",
        description: "Payment for INV/26-27/17 | Transaction ID: abc",
      },
    ]);
    expect(row.partyLedger).toBe("Cash");
  });

  it("keeps a non-customer receipt narration as Party Ledger", () => {
    const [row] = transformReceiptsToVouchers([
      {
        voucher_type: "receipt",
        voucher_date: "2026-09-01",
        voucher_number: "FEE/26-27/1",
        total_amount: 500,
        payment_method: "cash",
        reference_type: "student_fee",
        reference_id: "student-1",
        description: "Fee Collection - ASHA (A1) | Tuition",
      },
    ]);
    expect(row.partyLedger).toBe("Fee Collection - ASHA (A1) | Tuition");
  });

  it("round-trips the real payment mode, falling back to Cash only when blank", () => {
    const rows = transformReceiptsToVouchers(mixedVouchers);
    expect(rows[0].paymentMode).toBe("cash");
    expect(rows[1].paymentMode).toBe("upi");
    expect(rows[2].paymentMode).toBe("Cash");
    const payments = transformPaymentsToVouchers(mixedVouchers);
    expect(payments[0].paymentMode).toBe("bank");
    expect(payments[1].paymentMode).toBe("card");
  });
});
