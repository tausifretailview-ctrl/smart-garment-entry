import { describe, expect, it } from "vitest";
import {
  incrementSupplierInvoiceNumber,
  nextSupplierInvoiceNumberFromLastBill,
} from "./purchaseSupplierInvoiceNumber";

describe("incrementSupplierInvoiceNumber", () => {
  it("starts at 1 when empty", () => {
    expect(incrementSupplierInvoiceNumber("")).toBe("1");
    expect(nextSupplierInvoiceNumberFromLastBill(null)).toBe("1");
  });

  it("increments pure integers", () => {
    expect(incrementSupplierInvoiceNumber("46111")).toBe("46112");
    expect(incrementSupplierInvoiceNumber("9")).toBe("10");
  });

  it("increments trailing segment with slashes", () => {
    expect(incrementSupplierInvoiceNumber("6/11/26")).toBe("6/11/27");
  });

  it("increments prefixed bill numbers", () => {
    expect(incrementSupplierInvoiceNumber("PUR/26-27/88")).toBe("PUR/26-27/89");
    expect(incrementSupplierInvoiceNumber("INV-0012")).toBe("INV-0013");
  });
});
