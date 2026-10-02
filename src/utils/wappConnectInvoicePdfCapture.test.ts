/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { applyWappConnectInvoicePdfCloneFixes } from "@/utils/wappConnectInvoicePdfCapture";

function buildRetailErpCloneDoc() {
  const doc = document.implementation.createHTMLDocument("invoice");
  doc.body.innerHTML = `
    <div class="retail-erp-all-pages">
      <div class="retail-erp-invoice-template" style="overflow: hidden; height: 210mm;">
        <div class="retail-erp-items-grow" style="overflow: hidden; flex: 1;">
          <table>
            <thead><tr><th>SN</th><th>DESCRIPTION</th><th>AMOUNT</th></tr></thead>
            <tbody>
              <tr>
                <td style="height: 20px; max-height: 20px; overflow: hidden; padding: 1px;">1</td>
                <td style="height: 20px;">RUBBER BANDS</td>
                <td style="height: 20px;">45.00</td>
              </tr>
              <tr>
                <td style="height: 20px;">2</td>
                <td style="height: 20px;">\u00a0</td>
                <td style="height: 20px;">\u00a0</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="retail-erp-footer" style="overflow: hidden;">
          <div style="border-bottom: 1px solid #000; padding: 1px;">Note:</div>
          <div style="border-bottom: 1px solid #000;">Sub Total</div>
        </div>
      </div>
    </div>
  `;
  return doc;
}

describe("applyWappConnectInvoicePdfCloneFixes", () => {
  it("keeps Retail ERP items/footer clipped so WhatsApp PDF blank rows cannot cover totals", () => {
    const doc = buildRetailErpCloneDoc();
    const root = doc.body.firstElementChild as HTMLElement;
    applyWappConnectInvoicePdfCloneFixes(doc, root);

    const grow = root.querySelector(".retail-erp-items-grow") as HTMLElement;
    const footer = root.querySelector(".retail-erp-footer") as HTMLElement;
    const page = root.querySelector(".retail-erp-invoice-template") as HTMLElement;
    expect(grow.style.overflow).toBe("hidden");
    expect(footer.style.overflow).toBe("hidden");
    expect(page.style.overflow).toBe("hidden");

    const blank = root.querySelector('tbody tr[data-wapp-blank-row="1"]');
    expect(blank).toBeTruthy();

    const styleTag = doc.head.querySelector("style[data-wappconnect-pdf-fix]");
    expect(styleTag?.textContent || "").toContain("retail-erp-items-grow");
    expect(styleTag?.textContent || "").toContain("overflow: hidden");
    expect(styleTag?.textContent || "").toContain("retail-erp-desc-wapp-only");
    expect(styleTag?.textContent || "").toContain("retail-erp-desc-full");
    expect(styleTag?.textContent || "").toContain('th[data-col="size"]');
    // Aggressive 6px cell padding must not be used for Retail ERP WhatsApp PDFs.
    expect(styleTag?.textContent || "").not.toMatch(/padding-top:\s*6px/);
  });

  it("marks only filler SN rows as blank", () => {
    const doc = buildRetailErpCloneDoc();
    const root = doc.body.firstElementChild as HTMLElement;
    applyWappConnectInvoicePdfCloneFixes(doc, root);
    const rows = Array.from(root.querySelectorAll("tbody tr"));
    expect(rows[0].getAttribute("data-wapp-blank-row")).toBeNull();
    expect(rows[1].getAttribute("data-wapp-blank-row")).toBe("1");
  });

  it("keeps Trendzo thermal columns visible instead of ellipsizing them in the WhatsApp PDF", () => {
    const doc = document.implementation.createHTMLDocument("invoice");
    doc.body.innerHTML = `
      <div class="trendzo-pos-thermal-receipt-80mm thermal-receipt-container">
        <span class="tz-items-num">2000.00</span>
      </div>
    `;
    const root = doc.body.firstElementChild as HTMLElement;
    applyWappConnectInvoicePdfCloneFixes(doc, root);
    const css = doc.head.querySelector("style[data-wappconnect-thermal-pdf-fix]")?.textContent || "";
    expect(css).toContain(".trendzo-pos-thermal-receipt-80mm span");
    expect(css).toContain("overflow: visible");
    expect(css).toContain(".tz-items-qty-col");
    expect(css).toContain("text-align: right");
  });

  it("lets the Tally GST A4 page grow so Finance / EMI is inside the WhatsApp PDF", () => {
    const doc = document.implementation.createHTMLDocument("invoice");
    doc.body.innerHTML = `
      <div class="invoice-print-source">
        <div class="tally-tax-invoice-print" style="height: 297mm; overflow: hidden;">
          <div class="tally-tax-invoice-sheet" style="overflow: hidden; height: 297mm;">
            <div class="tally-finance-emi-block" style="overflow: hidden;">Finance / EMI Details</div>
          </div>
        </div>
      </div>
    `;
    const root = doc.body.firstElementChild as HTMLElement;
    applyWappConnectInvoicePdfCloneFixes(doc, root);
    const page = root.querySelector(".tally-tax-invoice-print") as HTMLElement;
    const sheet = root.querySelector(".tally-tax-invoice-sheet") as HTMLElement;
    const emi = root.querySelector(".tally-finance-emi-block") as HTMLElement;
    expect(page.style.height).toBe("auto");
    expect(page.style.overflow).toBe("visible");
    expect(page.style.maxHeight).toBe("none");
    expect(sheet.style.overflow).toBe("visible");
    expect(emi.style.overflow).toBe("visible");
    expect(emi.style.visibility).toBe("visible");
    expect(emi.textContent).toContain("Finance / EMI Details");
  });
});
