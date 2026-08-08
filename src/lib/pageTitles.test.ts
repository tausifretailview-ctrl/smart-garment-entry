import { describe, expect, it } from "vitest";
import { formatDocumentTitle, resolvePageTitleLabel } from "./pageTitles";

describe("pageTitles", () => {
  it("resolves known registry paths", () => {
    expect(resolvePageTitleLabel("pos-dashboard")).toBe("POS Dashboard");
    expect(resolvePageTitleLabel("customers")).toBe("Customers");
    expect(resolvePageTitleLabel("purchase-bills")).toBe("Purchase Bills");
  });

  it("formats document.title with optional org name", () => {
    expect(formatDocumentTitle("pos-sales")).toBe("POS Sales — Ezzy ERP");
    expect(formatDocumentTitle("pos-sales", "ELLA NOOR")).toBe(
      "POS Sales — ELLA NOOR — Ezzy ERP",
    );
  });
});
