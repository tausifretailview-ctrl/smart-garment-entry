import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  displaySaleStockQty,
  excludeServiceVariants,
  isNonStockTrackedProduct,
  physicalStockQtyForTotals,
  physicalStockValueForTotals,
  SERVICE_VIRTUAL_STOCK_QTY,
  sumPhysicalStockTotals,
} from "./productStockDisplay";

const here = dirname(fileURLToPath(import.meta.url));

describe("displaySaleStockQty", () => {
  it("shows 1 for service even when DB has virtual 999999", () => {
    expect(displaySaleStockQty("service", SERVICE_VIRTUAL_STOCK_QTY)).toBe(1);
  });

  it("shows 1 for service when virtual stock has drifted (e.g. after a sale)", () => {
    expect(displaySaleStockQty("service", 999998)).toBe(1);
    expect(displaySaleStockQty("service", 1)).toBe(1);
    expect(displaySaleStockQty("service", 0)).toBe(1);
  });

  it("shows 1 for combo products", () => {
    expect(displaySaleStockQty("combo", 999999)).toBe(1);
  });

  it("passes through real stock for goods", () => {
    expect(displaySaleStockQty("goods", 12)).toBe(12);
    expect(displaySaleStockQty("goods", 0)).toBe(0);
    expect(displaySaleStockQty(null, 5)).toBe(5);
  });
});

describe("isNonStockTrackedProduct", () => {
  it("identifies service and combo", () => {
    expect(isNonStockTrackedProduct("service")).toBe(true);
    expect(isNonStockTrackedProduct("combo")).toBe(true);
    expect(isNonStockTrackedProduct("goods")).toBe(false);
  });
});

describe("physicalStockQtyForTotals", () => {
  it("zeros service and combo virtual stock", () => {
    expect(physicalStockQtyForTotals("service", SERVICE_VIRTUAL_STOCK_QTY)).toBe(0);
    expect(physicalStockQtyForTotals("combo", SERVICE_VIRTUAL_STOCK_QTY)).toBe(0);
    expect(physicalStockQtyForTotals("goods", 4)).toBe(4);
  });

  it("zeros service/combo value so 999999 * sale price cannot mint crores", () => {
    expect(physicalStockValueForTotals("service", SERVICE_VIRTUAL_STOCK_QTY, 125)).toBe(0);
    expect(physicalStockValueForTotals("combo", SERVICE_VIRTUAL_STOCK_QTY, 125)).toBe(0);
    expect(physicalStockValueForTotals("goods", 4, 120)).toBe(480);
  });
});

describe("excludeServiceVariants", () => {
  it("drops service rows so FLEXI LS 100 MIX never enters Quick Stock results", () => {
    const rows = [
      { id: "mix", product: { product_type: "service" }, stock_qty: SERVICE_VIRTUAL_STOCK_QTY },
      { id: "goods-a", product: { product_type: "goods" }, stock_qty: 4 },
      { id: "goods-b", product: { product_type: "goods" }, stock_qty: 211 },
    ];
    expect(excludeServiceVariants(rows).map((r) => r.id)).toEqual(["goods-a", "goods-b"]);
  });
});

describe("sumPhysicalStockTotals", () => {
  it("drops FLEXI LS 100 MIX virtual 999999 from Quick Stock header totals", () => {
    // Screenshot: searching FLEXI LS/100 showed Total Qty 10,00,214 and
    // Stock Value ₹12,50,25,545 because MIX (barcode 106) is a service row
    // stamped 999999. Physical remainder is 215 pcs.
    const rows = [
      { product: { product_type: "service" }, stock_qty: SERVICE_VIRTUAL_STOCK_QTY, sale_price: 125 },
      { product: { product_type: "goods" }, stock_qty: 4, sale_price: 120 },
      { product: { product_type: "goods" }, stock_qty: 4, sale_price: 120 },
      { product: { product_type: "goods" }, stock_qty: 4, sale_price: 120 },
      { product: { product_type: "goods" }, stock_qty: 4, sale_price: 120 },
      { product: { product_type: "goods" }, stock_qty: 3, sale_price: 120 },
      { product: { product_type: "goods" }, stock_qty: 196, sale_price: 120 },
    ];
    const naiveQty = rows.reduce((s, r) => s + r.stock_qty, 0);
    expect(naiveQty).toBe(1_000_214);

    const totals = sumPhysicalStockTotals(rows);
    expect(totals.qty).toBe(215);
    expect(totals.value).toBe(215 * 120);
    expect(displaySaleStockQty(rows[0].product.product_type, rows[0].stock_qty)).toBe(1);
  });
});

describe("Quick Stock Check source", () => {
  it("selects product_type and sums with physical-stock helpers", () => {
    const src = readFileSync(resolve(here, "../components/FloatingPOSReports.tsx"), "utf8");
    expect(src).toContain("sumPhysicalStockTotals");
    expect(src).toContain("displaySaleStockQty");
    expect(src).toContain("excludeServiceVariants");
    expect(src).toMatch(/product_type/);
    expect(src).toContain('.neq("products.product_type", "service")');
    expect(src).not.toMatch(/reduce\(\(sum, item\) => sum \+ \(Number\(item\.stock_qty\)/);
  });
});

describe("Product Dashboard stats source", () => {
  it("does not re-subtract service stock after the RPC already zeros it", () => {
    const src = readFileSync(resolve(here, "../pages/ProductDashboard.tsx"), "utf8");
    expect(src).toContain("get_product_dashboard_stats");
    expect(src).not.toContain('eq("products.product_type", "service")');
    expect(src).not.toMatch(/Until RPC excludes service virtual stock/);
  });
});
