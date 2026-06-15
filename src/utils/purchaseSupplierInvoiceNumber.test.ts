import { describe, expect, it } from "vitest";
import {
  incrementSupplierInvoiceNumber,
  isPureNumericSupplierInvoice,
  maxPureNumericSupplierInvoice,
  maxSupplierInvoiceInSeries,
  nextGlobalNumericSupplierInvoice,
  nextSupplierInvoiceNumberFromLastBill,
  nextSupplierInvoiceNumberFromSeries,
  resolveNextSupplierInvoiceNumber,
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

describe("nextGlobalNumericSupplierInvoice", () => {
  it("ignores prefixed invoices and uses max pure numeric + 1", () => {
    expect(
      nextGlobalNumericSupplierInvoice(["480", "481", "RV1000524"]),
    ).toBe("482");
  });

  it("starts at 1 when no pure-numeric invoices exist", () => {
    expect(nextGlobalNumericSupplierInvoice(["RV1000524", "6/11/26"])).toBe("1");
    expect(nextGlobalNumericSupplierInvoice([])).toBe("1");
  });

  it("isPureNumericSupplierInvoice", () => {
    expect(isPureNumericSupplierInvoice("481")).toBe(true);
    expect(isPureNumericSupplierInvoice("RV1000524")).toBe(false);
    expect(isPureNumericSupplierInvoice("6/11/26")).toBe(false);
  });

  it("maxPureNumericSupplierInvoice", () => {
    expect(maxPureNumericSupplierInvoice(["480", "481", "RV1000524"])).toBe(481n);
    expect(maxPureNumericSupplierInvoice(["RV1000524"])).toBe(null);
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

describe("resolveNextSupplierInvoiceNumber", () => {
  it("prefers numeric server peek when >= client fallback", () => {
    expect(
      resolveNextSupplierInvoiceNumber("483", ["480", "481", "RV1000524"]),
    ).toBe("483");
  });

  it("ignores non-numeric server peek and uses client numeric global", () => {
    expect(
      resolveNextSupplierInvoiceNumber("RV1000525", ["480", "481"], "481"),
    ).toBe("482");
  });

  it("falls back to client numeric when peek is empty", () => {
    expect(
      resolveNextSupplierInvoiceNumber(null, ["46111", "46112"], "46112"),
    ).toBe("46113");
  });

  it("uses client when peek is lower than client max+1", () => {
    expect(
      resolveNextSupplierInvoiceNumber("480", ["481", "482"]),
    ).toBe("483");
  });
});
