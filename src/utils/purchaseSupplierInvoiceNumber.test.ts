import { describe, expect, it } from "vitest";
import {
  incrementSupplierInvoiceNumber,
  maxSupplierInvoiceInSeries,
  nextSupplierInvoiceNumberFromLastBill,
  nextSupplierInvoiceNumberFromSeries,
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

describe("nextSupplierInvoiceNumberFromSeries", () => {
  it("uses the highest serial in the org series, not only the last bill", () => {
    expect(
      nextSupplierInvoiceNumberFromSeries(["1", "5", "3"], "3"),
    ).toBe("6");
  });

  it("keeps prefix padding from the series", () => {
    expect(
      nextSupplierInvoiceNumberFromSeries(["INV-0009", "INV-0011"], "INV-0011"),
    ).toBe("INV-0012");
  });

  it("starts at 1 when no invoices exist", () => {
    expect(nextSupplierInvoiceNumberFromSeries([], null)).toBe("1");
  });
});

describe("maxSupplierInvoiceInSeries", () => {
  it("returns the highest matching prefix", () => {
    expect(maxSupplierInvoiceInSeries(["6/11/24", "6/11/29", "6/11/26"], "6/11/26")).toBe(
      "6/11/29",
    );
  });
});
