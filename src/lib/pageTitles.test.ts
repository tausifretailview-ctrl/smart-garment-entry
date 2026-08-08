import { describe, expect, it } from "vitest";
import { TAB_PAGE_REGISTRY, resolveTabCachePath } from "./tabPageRegistry";
import {
  PAGE_TITLE_CONFIG,
  formatDocumentTitle,
  resolvePageTitleLabel,
} from "./pageTitles";

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

  it("covers every TAB_PAGE_REGISTRY path (prevents silent title drift)", () => {
    const missing = Object.keys(TAB_PAGE_REGISTRY).filter((path) => {
      if (path in PAGE_TITLE_CONFIG) return false;
      const canonical = resolveTabCachePath(path);
      return !(canonical in PAGE_TITLE_CONFIG);
    });
    expect(
      missing,
      `Add PAGE_TITLE_CONFIG labels for registry paths: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
