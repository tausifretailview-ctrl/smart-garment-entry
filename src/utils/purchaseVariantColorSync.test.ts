import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizePurchaseColor, variantColorFillPlan } from "./purchaseVariantColorSync";

const here = dirname(fileURLToPath(import.meta.url));

describe("variantColorFillPlan", () => {
  it("fills a blank variant colour from its bill line (Mahadev A6 5G PINK)", () => {
    const plan = variantColorFillPlan(
      [
        { sku_id: "imei-1", color: "PINK" },
        { sku_id: "imei-2", color: "BLUE" },
        { sku_id: "imei-3", color: "BLUE" },
      ],
      new Map([
        ["imei-1", null],
        ["imei-2", ""],
        ["imei-3", "-"],
      ]),
    );
    expect(plan.get("PINK")).toEqual(["imei-1"]);
    expect(plan.get("BLUE")).toEqual(["imei-2", "imei-3"]);
  });

  it("never overwrites a colour the variant already has", () => {
    const plan = variantColorFillPlan(
      [{ sku_id: "v1", color: "PINK" }],
      new Map([["v1", "WHITE"]]),
    );
    expect(plan.size).toBe(0);
  });

  it("skips lines with no colour, no sku, or a variant that was not found", () => {
    const plan = variantColorFillPlan(
      [
        { sku_id: "v1", color: "" },
        { sku_id: "v2", color: "-" },
        { sku_id: "", color: "RED" },
        { sku_id: "missing", color: "RED" },
      ],
      new Map([
        ["v1", null],
        ["v2", null],
      ]),
    );
    expect(plan.size).toBe(0);
  });

  it("treats '-' as no colour", () => {
    expect(normalizePurchaseColor(" - ")).toBe("");
    expect(normalizePurchaseColor(" Pink ")).toBe("Pink");
  });
});

describe("purchase colour reaches Product Dashboard", () => {
  it("purchase save fills blank variant colours on create and edit", () => {
    const src = readFileSync(resolve(here, "../pages/PurchaseEntry.tsx"), "utf8");
    expect(src.match(/fillBlankVariantColorsFromPurchaseLines\(/g)?.length).toBe(2);
  });

  it("dashboard colour chips refresh after product / purchase saves", () => {
    const src = readFileSync(resolve(here, "./invalidateDashboardQueries.ts"), "utf8");
    expect(src).toContain('orgKey("product-dashboard-color-labels")');
    expect(src).toMatch(
      /invalidatePurchaseDashboardQueries[\s\S]*invalidateProductDashboardQueries\(queryClient, organizationId\)/,
    );
    const panel = readFileSync(resolve(here, "../components/ProductEditPanel.tsx"), "utf8");
    expect(panel).toContain("invalidateProductDashboardQueries(queryClient");
  });
});
