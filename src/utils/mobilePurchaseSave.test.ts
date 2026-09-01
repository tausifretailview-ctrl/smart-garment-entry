import { describe, expect, it } from "vitest";
import { computePurchaseBillTotals } from "@/utils/excelImportUtils";
import {
  buildMobilePurchaseRpcPayload,
  parsePurchaseAtomicSaveError,
  prefillPurchasePrice,
  validateMobilePurchaseBeforeSave,
  type MobilePurchaseLine,
} from "./mobilePurchaseSave";

const line = (over: Partial<MobilePurchaseLine> = {}): MobilePurchaseLine => ({
  temp_id: "t1",
  product_id: "prod-1",
  sku_id: "sku-1",
  product_name: "Shirt",
  size: "M",
  qty: 2,
  pur_price: 100,
  sale_price: 199,
  mrp: 249,
  gst_per: 5,
  hsn_code: "6109",
  barcode: "123",
  brand: "B",
  category: "C",
  color: "Red",
  style: "S",
  uom: "NOS",
  ...over,
});

describe("prefillPurchasePrice", () => {
  it("prefers master pur_price, then last purchase, then default", () => {
    expect(prefillPurchasePrice({ pur_price: 80, last_purchase_pur_price: 70, default_pur_price: 60 })).toBe(80);
    expect(prefillPurchasePrice({ pur_price: 0, last_purchase_pur_price: 70, default_pur_price: 60 })).toBe(70);
    expect(prefillPurchasePrice({ pur_price: 0, last_purchase_pur_price: 0, default_pur_price: 60 })).toBe(60);
  });
});

describe("buildMobilePurchaseRpcPayload", () => {
  it("sets supplier_inv_auto_generated when invoice number is blank", () => {
    const { p_bill, p_items } = buildMobilePurchaseRpcPayload(
      {
        supplierId: "sup-1",
        supplierName: "ACME",
        supplierInvoiceNo: "  ",
        billDate: "2026-09-01",
        isDcPurchase: false,
        discountAmount: 0,
        otherCharges: 0,
      },
      [line()],
      "2026-09-01T10:00:00.000Z",
    );
    expect(p_bill.supplier_inv_auto_generated).toBe(true);
    expect(p_bill.supplier_invoice_no).toBeNull();
    expect(p_items[0].line_total).toBe(200);
    expect(p_items[0].qty).toBe(2);
    expect(p_items[0].sku_id).toBe("sku-1");
    expect(p_items[0].product_id).toBe("prod-1");
    expect(p_bill.gross_amount).toBe(200);
    expect(p_bill.gst_amount).toBe(10);
    expect(p_bill.net_amount).toBe(210);
  });

  it("marks a typed invoice as not auto-generated", () => {
    const { p_bill } = buildMobilePurchaseRpcPayload(
      {
        supplierId: null,
        supplierName: "Walk-in mill",
        supplierInvoiceNo: "INV-9",
        billDate: "2026-09-01",
        isDcPurchase: false,
        discountAmount: 0,
        otherCharges: 0,
      },
      [line({ qty: 1, pur_price: 50, gst_per: 0 })],
    );
    expect(p_bill.supplier_id).toBeNull();
    expect(p_bill.supplier_name).toBe("Walk-in mill");
    expect(p_bill.supplier_inv_auto_generated).toBe(false);
    expect(p_bill.supplier_invoice_no).toBe("INV-9");
  });

  it("zeros GST on DC purchases using the desktop totals helper", () => {
    const fields = {
      supplierId: null,
      supplierName: "DC mill",
      supplierInvoiceNo: "",
      billDate: "2026-09-01",
      isDcPurchase: true,
      discountAmount: 0,
      otherCharges: 0,
    };
    const { p_bill, p_items } = buildMobilePurchaseRpcPayload(fields, [line()]);
    expect(p_items[0].gst_per).toBe(0);
    expect(p_items[0].is_dc_item).toBe(true);
    expect(p_bill.is_dc_purchase).toBe(true);
    expect(p_bill.gst_amount).toBe(0);
    const desktop = computePurchaseBillTotals(
      [{ line_total: 200, gst_per: 0, qty: 2, pur_price: 100, discount_percent: 0 }],
      0,
      0,
      true,
    );
    expect(p_bill.net_amount).toBe(desktop.netAmount);
    expect(p_bill.round_off).toBe(desktop.roundOff);
  });
});

describe("parsePurchaseAtomicSaveError", () => {
  it("keeps the RPC line number text", () => {
    expect(parsePurchaseAtomicSaveError("Line 3: qty must be greater than 0")).toBe(
      "Line 3: qty must be greater than 0",
    );
    expect(parsePurchaseAtomicSaveError("ERROR: Line 1: sku_id is required")).toBe("Line 1: sku_id is required");
  });
});

describe("validateMobilePurchaseBeforeSave", () => {
  it("requires a supplier and a qty>0 line", () => {
    expect(
      validateMobilePurchaseBeforeSave(
        {
          supplierId: null,
          supplierName: "",
          supplierInvoiceNo: "",
          billDate: "2026-09-01",
          isDcPurchase: false,
          discountAmount: 0,
          otherCharges: 0,
        },
        [line()],
      ),
    ).toMatch(/supplier/i);
    expect(
      validateMobilePurchaseBeforeSave(
        {
          supplierId: null,
          supplierName: "ACME",
          supplierInvoiceNo: "",
          billDate: "2026-09-01",
          isDcPurchase: false,
          discountAmount: 0,
          otherCharges: 0,
        },
        [line({ qty: 0 })],
      ),
    ).toMatch(/quantity/i);
  });
});
