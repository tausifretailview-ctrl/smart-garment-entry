import { describe, expect, it } from "vitest";
import { formatInvoiceProductDescription } from "./invoiceProductDescription";

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
});
