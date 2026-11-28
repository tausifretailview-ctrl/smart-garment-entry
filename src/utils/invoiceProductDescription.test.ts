import { describe, expect, it } from "vitest";
import { formatInvoiceProductDescription, readInvoiceDescriptionFields } from "./invoiceProductDescription";

const krishna = {
  particulars: "ACE 3 HEERA-MOBILE-BASIK-ITEL-BLACK",
  productName: "ACE 3 HEERA",
  category: "MOBILE",
  style: "BASIK",
  brand: "ITEL",
  color: "BLACK",
};

describe("formatInvoiceProductDescription", () => {
  it("keeps the saved description when the invoice sequence is off", () => {
    expect(formatInvoiceProductDescription(krishna, { enabled: false, sequence: "brand_first" })).toBe(
      "ACE 3 HEERA-MOBILE-BASIK-ITEL-BLACK",
    );
  });

  it("prints brand first, then the product name", () => {
    expect(formatInvoiceProductDescription(krishna, { enabled: true, sequence: "brand_first" })).toBe(
      "ITEL-ACE 3 HEERA-MOBILE-BASIK-BLACK",
    );
  });

  it("prints the product name first when that sequence is selected", () => {
    expect(formatInvoiceProductDescription(krishna, { enabled: true, sequence: "product_first" })).toBe(
      "ACE 3 HEERA-MOBILE-BASIK-ITEL-BLACK",
    );
  });

  it("keeps the saved line when the product parts are missing", () => {
    expect(
      formatInvoiceProductDescription(
        { particulars: "ACE 3 HEERA-MOBILE-BASIK-ITEL-BLACK" },
        { enabled: true, sequence: "brand_first" },
      ),
    ).toBe("ACE 3 HEERA-MOBILE-BASIK-ITEL-BLACK");
  });

  it("leaves off the parts the shop switched off (JINDAL: only the article no.)", () => {
    const jindal = {
      particulars: "RC 5001-LEATHER-RED CHEIF-CHAPPAL",
      productName: "RC 5001",
      style: "LEATHER",
      brand: "RED CHEIF",
      category: "CHAPPAL",
    };
    const fields = readInvoiceDescriptionFields({ category: false, style: false, brand: false });
    expect(formatInvoiceProductDescription(jindal, { enabled: true, sequence: "product_first", fields })).toBe("RC 5001");
    expect(
      formatInvoiceProductDescription(jindal, { enabled: true, sequence: "product_first", fields: { style: false } }),
    ).toBe("RC 5001-CHAPPAL-RED CHEIF");
    expect(formatInvoiceProductDescription(krishna, { enabled: true, sequence: "brand_first", fields: { color: false, brand: false } })).toBe(
      "ACE 3 HEERA-MOBILE-BASIK",
    );
  });

  it("every part prints unless switched off; brand stays when there is no product name", () => {
    expect(readInvoiceDescriptionFields(undefined)).toEqual({ category: true, style: true, brand: true, color: true });
    expect(readInvoiceDescriptionFields({ brand: false })).toMatchObject({ brand: false, category: true });
    expect(
      formatInvoiceProductDescription({ particulars: "X", brand: "ITEL" }, { enabled: true, sequence: "brand_first", fields: { brand: false } }),
    ).toBe("ITEL");
  });
});
