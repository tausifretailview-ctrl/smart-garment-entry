import { describe, expect, it } from "vitest";
import { buildPosInvoicePrintBase } from "./invoicePrintBase";
import { posPrintSaleReturnAdjust, posPrintTotals } from "./printFigures";
import { resolvePosCustomerName } from "./buildSaleData";

const totals = { mrp: 2398, subtotal: 2278, billAmount: 2278, quantity: 2 };
const items = [{ id: "l1" }, { id: "l2" }];
const crmPoints = { crmPointsEarned: 22, crmPointsBalance: 140 };

function input(over: Partial<Parameters<typeof buildPosInvoicePrintBase>[0]> = {}) {
  return {
    saleNumber: "POS/26-27/41",
    saleId: "sale-1",
    printFirm: { name: "Main" },
    items,
    totals,
    flatDiscountAmount: 120,
    saleReturnAdjust: 300,
    creditApplied: 50,
    customerName: "Hanif",
    customerPhone: "9800000001",
    customerId: "c1",
    customer: { address: "MG Road", gst_number: "27ABCDE1234F1Z5", transport_details: "VRL" },
    roundOff: 0.4,
    notes: "Alteration",
    previousBalance: 5000,
    unusedAdvance: 1200,
    pointsRedemptionValue: 50,
    crmPoints,
    cashAmount: 1000,
    upiAmount: null,
    cardAmount: 278,
    salesman: "Ravi",
    taxType: "inclusive",
    financerDetails: { financer_name: "Bajaj" },
    ...over,
  };
}

describe("buildPosInvoicePrintBase", () => {
  it("gives the same fields the F1–F5 and Mix paths built by hand", () => {
    const i = input();
    // The old inline object, field by field (POSSales before Plan Phase 4).
    const old = {
      invoiceNumber: i.saleNumber,
      saleId: i.saleId,
      printFirm: i.printFirm ?? null,
      items: i.items,
      totals: posPrintTotals(i.totals),
      flatDiscountAmount: i.flatDiscountAmount,
      saleReturnAdjust: posPrintSaleReturnAdjust(i.saleReturnAdjust, i.creditApplied),
      billNetAmount: i.totals.billAmount,
      customerName: resolvePosCustomerName(i.customerName),
      customerPhone: i.customerPhone,
      customerId: i.customerId,
      customerAddress: i.customer?.address || "",
      customerGstNumber: i.customer?.gst_number || "",
      customerTransportDetails: i.customer?.transport_details || "",
      roundOff: i.roundOff,
      creditApplied: i.creditApplied,
      notes: i.notes || null,
      previousBalance: i.previousBalance,
      unusedAdvance: i.unusedAdvance,
      pointsRedemptionValue: i.pointsRedemptionValue,
      ...i.crmPoints,
      cashAmount: i.cashAmount || 0,
      upiAmount: i.upiAmount || 0,
      cardAmount: i.cardAmount || 0,
      salesman: i.salesman || null,
      taxType: i.taxType,
      financerDetails: i.financerDetails || null,
    };
    expect(buildPosInvoicePrintBase(i)).toEqual(old);
  });

  it("walk-in without a customer row, notes, salesman or financer", () => {
    const out = buildPosInvoicePrintBase(
      input({ customer: undefined, customerId: "", customerName: "", notes: "", salesman: "", financerDetails: null, printFirm: undefined }),
    );
    expect(out.customerAddress).toBe("");
    expect(out.customerGstNumber).toBe("");
    expect(out.customerTransportDetails).toBe("");
    expect(out.notes).toBeNull();
    expect(out.salesman).toBeNull();
    expect(out.financerDetails).toBeNull();
    expect(out.printFirm).toBeNull();
    expect(out.customerName).toBe(resolvePosCustomerName(""));
  });

  it("tenders as saved, missing ones as 0; bill net is the bill amount", () => {
    const out = buildPosInvoicePrintBase(input());
    expect(out.cashAmount).toBe(1000);
    expect(out.upiAmount).toBe(0);
    expect(out.cardAmount).toBe(278);
    expect(out.billNetAmount).toBe(2278);
    expect(out.crmPointsEarned).toBe(22);
  });
});
