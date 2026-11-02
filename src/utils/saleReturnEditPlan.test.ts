import { describe, expect, it } from "vitest";
import {
  canChangeSaleReturnCustomer,
  saleReturnLinesUnchanged,
  saleReturnStockIncreaseByVariant,
} from "./saleReturnEditPlan";

const line = (variantId: string, quantity: number, unitPrice = 3400) => ({
  productId: "p1",
  variantId,
  productName: "DRESS",
  size: "L",
  barcode: "B1",
  quantity,
  unitPrice,
  gstPercent: 5,
  lineTotal: quantity * unitPrice,
  hsnCode: "",
});

describe("saleReturnLinesUnchanged", () => {
  it("is true when only the header changes", () => {
    expect(saleReturnLinesUnchanged([line("v1", 1)], [line("v1", 1)])).toBe(true);
  });
  it("ignores order and blank vs null fields", () => {
    const a = [line("v1", 1), { ...line("v2", 2), hsnCode: null }];
    const b = [{ ...line("v2", 2), hsnCode: "" }, line("v1", 1)];
    expect(saleReturnLinesUnchanged(a, b)).toBe(true);
  });
  it("is false when qty, price or count changes", () => {
    expect(saleReturnLinesUnchanged([line("v1", 1)], [line("v1", 2)])).toBe(false);
    expect(saleReturnLinesUnchanged([line("v1", 1)], [line("v1", 1, 3000)])).toBe(false);
    expect(saleReturnLinesUnchanged([line("v1", 1)], [line("v1", 1), line("v2", 1)])).toBe(false);
  });
});

describe("saleReturnStockIncreaseByVariant", () => {
  it("only counts the extra qty over the saved return", () => {
    const d = saleReturnStockIncreaseByVariant([line("v1", 1)], [line("v1", 3), line("v2", 1)]);
    expect(d.get("v1")).toBe(2);
    expect(d.get("v2")).toBe(1);
  });
  it("is empty when qty stays the same or drops", () => {
    expect(saleReturnStockIncreaseByVariant([line("v1", 2)], [line("v1", 2)]).size).toBe(0);
    expect(saleReturnStockIncreaseByVariant([line("v1", 2)], [line("v1", 1)]).size).toBe(0);
  });
});

describe("canChangeSaleReturnCustomer", () => {
  it("allows an unused walk-in credit-note return", () => {
    expect(canChangeSaleReturnCustomer({ credit_status: "pending", refund_type: "credit_note" })).toBe(true);
    expect(canChangeSaleReturnCustomer({ credit_status: null })).toBe(true);
  });
  it("blocks once the credit was used or refunded", () => {
    expect(canChangeSaleReturnCustomer({ credit_status: "adjusted", linked_sale_id: "s1" })).toBe(false);
    expect(canChangeSaleReturnCustomer({ credit_status: "adjusted", refund_type: "exchange" })).toBe(false);
    expect(canChangeSaleReturnCustomer({ credit_status: "refunded", refund_type: "cash_refund" })).toBe(false);
    expect(canChangeSaleReturnCustomer({ credit_status: "pending", creditNoteUsed: 100 })).toBe(false);
  });
});
