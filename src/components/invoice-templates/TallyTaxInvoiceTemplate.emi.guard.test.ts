import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const template = readFileSync(
  resolve(process.cwd(), "src/components/invoice-templates/TallyTaxInvoiceTemplate.tsx"),
  "utf8",
);
const posSales = readFileSync(resolve(process.cwd(), "src/pages/POSSales.tsx"), "utf8");
const posDashboard = readFileSync(resolve(process.cwd(), "src/pages/POSDashboard.tsx"), "utf8");
const saveSale = readFileSync(resolve(process.cwd(), "src/hooks/useSaveSale.tsx"), "utf8");
const printCss = readFileSync(
  resolve(process.cwd(), "src/utils/thermalReceiptPrintDocument.ts"),
  "utf8",
);

describe("Tally GST A4 Finance / EMI print", () => {
  it("grows past one sheet instead of clipping the EMI block", () => {
    expect(template).toContain('minHeight: "297mm"');
    expect(template).toContain('height: "auto"');
    expect(template).not.toContain('height: "297mm"');
    expect(template).toContain('className="tally-finance-emi-block"');
    expect(template).toContain('overflow: "visible"');
    expect(template).toContain("Finance / EMI Details");
  });

  it("stays visible in the print iframe and is not height-capped on POS or the dashboard", () => {
    expect(printCss).toContain("body .tally-finance-emi-block");
    expect(printCss).toContain("overflow: visible !important");
    expect(posSales).toContain('posInvoiceTemplate === \'tally-tax-invoice\'');
    expect(posDashboard).toContain('posInvoiceTemplate === "tally-tax-invoice"');
    expect(posDashboard).toContain("previewHydrating ? (");
    expect(posDashboard).not.toContain("previewHydrating && !(saleItems[previewSale.id]?.length)");
  });

  it("freezes EMI details onto the WhatsApp PDF snapshot before the form is cleared", () => {
    expect(saveSale).toContain("financerDetails: saleData.financerDetails ?? undefined");
    expect(posSales).toContain("financerDetails: financerDetails || null");
    expect(posSales).toContain("financerDetails={savedInvoiceData?.financerDetails || financerDetails}");
  });
});
