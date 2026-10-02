import { describe, expect, it } from "vitest";
import {
  buildCustomerTransactions,
  cleanSubdomain,
  createRateLimiter,
  lineTax,
  maskPhone,
  phoneLast10,
} from "../supabase/functions/_shared/customerApp";

describe("customer-app helpers", () => {
  it("normalises and masks mobile numbers", () => {
    expect(phoneLast10("+91 88600 68772")).toBe("8860068772");
    expect(phoneLast10("12345")).toBe("");
    expect(maskPhone("918860068772")).toBe("******8772");
    expect(maskPhone(null)).toBe("");
  });

  it("accepts only plain subdomain labels", () => {
    expect(cleanSubdomain(" Gurukrupa ")).toBe("gurukrupa");
    expect(cleanSubdomain("a.b")).toBe("");
    expect(cleanSubdomain("x'--")).toBe("");
  });

  it("splits GST for inclusive and exclusive lines", () => {
    expect(lineTax(1050, 5, "inclusive")).toEqual({ taxable: 1000, tax: 50 });
    expect(lineTax(1000, 5, "exclusive")).toEqual({ taxable: 1000, tax: 50 });
    expect(lineTax(1800, 0, null)).toEqual({ taxable: 1800, tax: 0 });
  });

  it("lists bills, payments and returns newest first with each bill's due", () => {
    const rows = buildCustomerTransactions(
      [{ id: "s1", sale_number: "POS/26-27/2000", sale_date: "2026-10-02", net_amount: 1800, paid_amount: 1000 }],
      [{ voucher_number: "RCT/1", voucher_date: "2026-10-05", total_amount: 800, payment_method: "cash" }],
      [{ return_number: "SR/1", return_date: "2026-09-01", net_amount: 500, original_sale_number: "POS/1" }],
    );
    expect(rows.map((r) => r.kind)).toEqual(["payment", "bill", "return"]);
    expect(rows[1]).toMatchObject({ ref: "POS/26-27/2000", amount: 1800, due: 800, saleId: "s1" });
    expect(rows[2].note).toBe("Against POS/1");
  });

  it("rate limits within a window", () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow("k", 0)).toBe(true);
    expect(allow("k", 10)).toBe(true);
    expect(allow("k", 20)).toBe(false);
    expect(allow("k", 1500)).toBe(true);
  });
});
