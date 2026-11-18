import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSaleGoodsAskQtyDialogEnabled, saleGoodsQtyDialogOverride } from "./posGoodsAskQtyDialog";

describe("Sales Invoice: ask quantity after selecting a product", () => {
  it("is off unless switched on in Settings → Sale", () => {
    expect(isSaleGoodsAskQtyDialogEnabled(undefined)).toBe(false);
    expect(isSaleGoodsAskQtyDialogEnabled({})).toBe(false);
    expect(isSaleGoodsAskQtyDialogEnabled({ sale_goods_ask_qty_dialog: true })).toBe(true);
  });

  it("applies a price only when the user changed it, keeping MRP at least that high", () => {
    expect(saleGoodsQtyDialogOverride(999, 999, 1299)).toBeUndefined();
    expect(saleGoodsQtyDialogOverride(0, 999, 1299)).toBeUndefined();
    expect(saleGoodsQtyDialogOverride(899, 999, 1299)).toEqual({ sale_price: 899, mrp: 1299 });
    expect(saleGoodsQtyDialogOverride(1499, 999, 1299)).toEqual({ sale_price: 1499, mrp: 1499 });
  });

  it("is wired into the Sales Invoice add flow and Settings", () => {
    const page = readFileSync(join(process.cwd(), "src/pages/SalesInvoice.tsx"), "utf8");
    expect(page).toContain("isSaleGoodsAskQtyDialogEnabled((settingsData as any)?.sale_settings)");
    expect(page).toContain("setQuickServiceProductForAdd({ product, variant, goods: true });");
    // both layouts use the shared handler; the price choice keeps the entered quantity
    expect(page.match(/onAdd=\{handleQuickQtyDialogAdd\}/g)?.length).toBe(2);
    expect(page).toContain("addProductToInvoice(product, variant, prices, addOptions)");
    // stock is checked for the whole quantity entered
    expect(page).toContain("const requestedQty = alreadyStaged + addingQty;");
    const settings = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    expect(settings).toContain('id="sale_goods_ask_qty_dialog"');
  });
});
