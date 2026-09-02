import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildUpiPayLink } from "@/lib/upiPayLink";

const here = dirname(fileURLToPath(import.meta.url));
const tsx = readFileSync(join(here, "TrendzoPosThermalReceipt80mm.tsx"), "utf8");
const css = readFileSync(join(here, "../styles/trendzo-pos-thermal-receipt.css"), "utf8");

describe("Trendzo POS thermal receipt layout", () => {
  it("centers business name and address on the page", () => {
    expect(tsx).toContain('className="tz-header"');
    expect(tsx).not.toContain("tz-logo-row");
    expect(css).toContain("flex-direction: column");
    expect(css).toContain("text-align: center");
    expect(css).toMatch(/\.tz-company-name[\s\S]*text-align:\s*center/);
    expect(css).toMatch(/\.tz-company-meta[\s\S]*text-align:\s*center/);
  });

  it("does not print GST bifurcation rows", () => {
    expect(tsx).not.toContain('label="Taxable Amount"');
    expect(tsx).not.toContain('label="CGST"');
    expect(tsx).not.toContain('label="SGST"');
    expect(tsx).not.toContain('label="IGST"');
  });

  it("renders UPI QR from bill_barcode_settings.upi_id", () => {
    expect(tsx).toContain("buildUpiPayLink");
    expect(tsx).toContain("billSettings.upi_id");
    expect(tsx).toContain("SCAN TO PAY");
    expect(tsx).toContain("tz-upi-qr");
  });

  it("stacks payment then QR then a height-capped barcode (no mid-receipt gap)", () => {
    expect(tsx).not.toContain("tz-payment-grid");
    expect(tsx).toContain("tz-payment");
    expect(tsx).toContain("height={28}");
    expect(css).not.toContain(".tz-payment-grid");
    expect(css).toContain("height: 28px");
    expect(css).toContain("max-height: 28px");
  });

  it("uses larger body type than the original 11/9px receipt", () => {
    expect(css).toMatch(/\.thermal-receipt \{[\s\S]*font-size: 13px;/);
    expect(css).toMatch(/\.tz-terms-list \{[\s\S]*font-size: 11px;/);
    expect(css).toMatch(/\.tz-company-name \{[\s\S]*font-size: 17px;/);
  });
});

describe("UPI pay link for Trendzo QR", () => {
  it("builds a UPI intent from UPI ID, payee, and amount", () => {
    const link = buildUpiPayLink({
      upiId: "store@okaxis",
      payeeName: "ADTECH AGENCY",
      amount: 520,
      note: "POS/26-27/285",
    });
    expect(link).toContain("upi://pay?pa=store%40okaxis");
    expect(link).toContain("am=520.00");
    expect(link).toContain("cu=INR");
  });

  it("returns empty when UPI ID is missing", () => {
    expect(buildUpiPayLink({ upiId: "  ", payeeName: "Store", amount: 10 })).toBe("");
  });
});
