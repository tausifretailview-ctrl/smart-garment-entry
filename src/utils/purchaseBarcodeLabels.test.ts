import { describe, expect, it } from "vitest";
import { buildPurchaseBarcodeLabels, purchaseLabelCount } from "./purchaseBarcodeLabels";
import { resolveLabelPurchaseBillDate } from "./purchaseCodeEncoder";

const lines = [
  {
    sku_id: "v1", product_name: "Shirt", brand: "Arrow", category: "Shirts", color: "Blue", style: "Slim",
    size: "M", sale_price: 999, mrp: 1299, pur_price: 600, barcode: "100001", qty: 3,
  },
  {
    sku_id: "v2", product_name: null, brand: undefined, category: null, color: null, style: undefined,
    size: "L", sale_price: 499, pur_price: 250, barcode: "100002", qty: 2,
  },
];

describe("buildPurchaseBarcodeLabels", () => {
  it("matches the list Purchase Entry built by hand", () => {
    const opts = { billNumber: "PUR/26-27/12", screenBillDate: "2026-11-13", savedInvoiceDate: "2026-11-10", supplierCode: "SUP7" };
    // The old inline mapping (PurchaseEntry before Plan Phase 4), item by item.
    const old = lines.map((item) => ({
      sku_id: item.sku_id,
      product_name: item.product_name || "",
      brand: item.brand || "",
      category: item.category || "",
      color: item.color || "",
      style: item.style || "",
      size: item.size,
      sale_price: item.sale_price,
      mrp: item.mrp,
      pur_price: item.pur_price,
      barcode: item.barcode,
      qty: item.qty,
      bill_number: opts.billNumber || "",
      bill_date:
        resolveLabelPurchaseBillDate({ savedInvoiceDate: opts.savedInvoiceDate, itemBillDate: opts.screenBillDate }) ??
        opts.screenBillDate,
      supplier_code: opts.supplierCode,
    }));
    expect(buildPurchaseBarcodeLabels(lines, opts)).toEqual(old);
  });

  it("the saved bill's date wins; without it the screen date is used", () => {
    const base = { billNumber: "", screenBillDate: "2026-11-13", supplierCode: "" };
    expect(buildPurchaseBarcodeLabels(lines, { ...base, savedInvoiceDate: "2026-11-10" })[0].bill_date).toBe("2026-11-10");
    expect(buildPurchaseBarcodeLabels(lines, { ...base, savedInvoiceDate: null })[0].bill_date).toBe("2026-11-13");
  });

  it("blank names / bill number become empty strings; mrp stays as given", () => {
    const [, second] = buildPurchaseBarcodeLabels(lines, {
      billNumber: undefined, screenBillDate: "2026-11-13", savedInvoiceDate: null, supplierCode: "",
    });
    expect(second.product_name).toBe("");
    expect(second.brand).toBe("");
    expect(second.bill_number).toBe("");
    expect(second.mrp).toBeUndefined();
  });

  it("label count is the sum of quantities", () => {
    expect(purchaseLabelCount(lines)).toBe(5);
    expect(purchaseLabelCount([])).toBe(0);
  });
});
