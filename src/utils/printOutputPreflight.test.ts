import { describe, expect, it } from "vitest";
import {
  estimatePrintPageCount,
  printHtmlLooksLikeLeakedCss,
  printPageCountLooksAnomalous,
  printTextLooksLikeLeakedCss,
  inspectPrintTarget,
  A4_PORTRAIT_PAGE_HEIGHT_PX,
} from "./printOutputPreflight";

const KS_LEAK = `@media print { @page { size: A4 portrait; margin: 5mm; } .credit-note-print { width: 200mm !important; min-height: 287mm !important; } }`;

describe("printTextLooksLikeLeakedCss", () => {
  it("catches the KS FOOTWEAR credit-note leak text", () => {
    expect(printTextLooksLikeLeakedCss(`KS FOOTWEAR\n${KS_LEAK}\nCREDIT NOTE`)).toBe(true);
  });

  it("does not flag a normal credit-note body", () => {
    expect(
      printTextLooksLikeLeakedCss(
        "KS FOOTWEAR\nCREDIT NOTE (SALE RETURN)\nCustomer: A\nNet credit: ₹500",
      ),
    ).toBe(false);
  });
});

describe("printHtmlLooksLikeLeakedCss", () => {
  it("ignores CSS inside a real style tag", () => {
    expect(
      printHtmlLooksLikeLeakedCss(
        `<div><style>@media print { @page { size: A4; } }</style><h1>CREDIT NOTE</h1></div>`,
      ),
    ).toBe(false);
  });

  it("flags CSS that landed in a text node", () => {
    expect(
      printHtmlLooksLikeLeakedCss(
        `<div><p>${KS_LEAK}</p><h1>CREDIT NOTE</h1></div>`,
      ),
    ).toBe(true);
  });
});

describe("printPageCountLooksAnomalous", () => {
  it("flags a 1-page document estimated at 4 sheets", () => {
    expect(printPageCountLooksAnomalous(4, 1)).toBe(true);
    expect(printPageCountLooksAnomalous(1, 1)).toBe(false);
    expect(printPageCountLooksAnomalous(2, 1)).toBe(false);
  });

  it("does not flag a multi-page invoice within 3× the cap", () => {
    expect(printPageCountLooksAnomalous(6, 3)).toBe(false);
    expect(printPageCountLooksAnomalous(10, 3)).toBe(true);
  });
});

describe("inspectPrintTarget", () => {
  it("estimates pages from element height", () => {
    const el = {
      scrollHeight: A4_PORTRAIT_PAGE_HEIGHT_PX * 4,
      offsetHeight: A4_PORTRAIT_PAGE_HEIGHT_PX * 4,
      innerText: "CREDIT NOTE",
      textContent: "CREDIT NOTE",
    } as HTMLElement;
    const result = inspectPrintTarget(el, { expectedMaxPages: 1 });
    expect(estimatePrintPageCount(el)).toBe(4);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("page-count");
  });
});
