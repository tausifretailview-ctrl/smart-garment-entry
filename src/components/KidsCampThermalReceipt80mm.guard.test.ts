import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tsx = readFileSync(join(here, "KidsCampThermalReceipt80mm.tsx"), "utf8");
const css = readFileSync(join(here, "../styles/kids-camp-thermal-receipt.css"), "utf8");

describe("Kids Camp thermal receipt layout", () => {
  it("uses Courier New boxed tables like the attached GST invoice", () => {
    expect(css).toContain('"Courier New", Courier, monospace');
    expect(css).toContain("border-collapse: collapse");
    expect(css).toMatch(/table\.kc-box th[\s\S]*border: 1px solid #000/);
  });

  it("prints the two-row item header QT/PARTICULAR/RATE/AMOUNT then BARCODE/HSNCODE/DISC AMT", () => {
    expect(tsx).toContain(">QT<");
    expect(tsx).toContain(">PARTICULAR<");
    expect(tsx).toContain(">RATE<");
    expect(tsx).toContain(">AMOUNT<");
    expect(tsx).toContain(">BARCODE<");
    expect(tsx).toContain(">HSNCODE<");
    expect(tsx).toContain(">DISC AMT<");
  });

  it("keeps the sample payment and tax labels including original spelling", () => {
    expect(tsx).toContain("RECIEVED AMOUNT");
    expect(tsx).toContain("BALANCE AMOUNT");
    expect(tsx).toContain("RECIVED DETAIL");
    expect(tsx).toContain("CASH RECIEVED");
    expect(tsx).toContain("ICICI CARD");
    expect(tsx).toContain("MSWIPE");
    expect(tsx).toContain("PAYTM");
    expect(tsx).toContain("TAX DETAIL");
    expect(tsx).toContain("GST TAX");
    expect(tsx).toContain("CGST TAX");
    expect(tsx).toContain("SGST TAX");
    expect(tsx).toContain("ROUND OFF.E");
    expect(tsx).toContain("NET PAYABLE");
    expect(tsx).toContain("NO. of ITEM:");
    expect(tsx).toContain("TOTAL Unit :");
    expect(tsx).toContain("Amount Exclusive of SGST");
    expect(tsx).toContain("THANK YOU VISIT AGAIN");
    expect(tsx).toContain("Instagram Id :");
    expect(tsx).toContain("Cust. Name :");
    expect(tsx).toContain("S. Name :");
    expect(tsx).toContain("INV. NO. :");
  });

  it("does not add UPI QR or Ezzy branding (not on the sample slip)", () => {
    expect(tsx).not.toContain("SCAN TO PAY");
    expect(tsx).not.toContain("Powered by Ezzy");
    expect(tsx).not.toContain("buildUpiPayLink");
  });
});
