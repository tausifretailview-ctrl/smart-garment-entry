import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearMobilePurchaseDraft,
  draftHasWork,
  parseMobilePurchaseDraft,
  readMobilePurchaseDraft,
  writeMobilePurchaseDraft,
} from "./mobilePurchaseDraft";

const here = dirname(fileURLToPath(import.meta.url));

describe("mobile purchase draft storage", () => {
  it("round-trips supplier and lines in a Storage stand-in", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    };
    writeMobilePurchaseDraft(storage, "org", "user", {
      supplierId: "s1",
      supplierName: "ACME",
      supplierInvoiceNo: "",
      billDate: "2026-09-01",
      isDcPurchase: false,
      discountAmount: 0,
      otherCharges: 0,
      items: [
        {
          temp_id: "t1",
          product_id: "p",
          sku_id: "sku",
          product_name: "Shirt",
          size: "M",
          qty: 3,
          pur_price: 10,
          sale_price: 20,
          mrp: 25,
          gst_per: 5,
          hsn_code: "",
          barcode: "1",
          brand: "",
          category: "",
          color: "",
          style: "",
          uom: "NOS",
        },
      ],
      savedAt: 1,
    });
    const loaded = readMobilePurchaseDraft(storage, "org", "user");
    expect(loaded?.supplierName).toBe("ACME");
    expect(loaded?.items[0].qty).toBe(3);
    expect(draftHasWork(loaded!)).toBe(true);
    clearMobilePurchaseDraft(storage, "org", "user");
    expect(readMobilePurchaseDraft(storage, "org", "user")).toBeNull();
  });

  it("rejects corrupt JSON", () => {
    expect(parseMobilePurchaseDraft("{not-json")).toBeNull();
    expect(parseMobilePurchaseDraft("{}")).toBeNull();
  });
});

describe("mobile purchase report write-path wiring", () => {
  it("saves via the atomic RPC and invalidates purchase/stock report queries", () => {
    const page = readFileSync(resolve(here, "../pages/mobile/MobilePurchaseEntry.tsx"), "utf8");
    expect(page).toContain("save_purchase_bill_with_items_atomic");
    expect(page).toContain("rpt-daily-purchase");
    expect(page).toContain("rpt-stock-summary");
    expect(page).toContain("owner-purchase-dash");
    expect(page).not.toContain("batch_stock");
    expect(page).not.toMatch(/stock_qty\s*:/);
  });

  it("Daily Purchase Report still reads purchase_bills for the same org/date", () => {
    const reports = readFileSync(resolve(here, "../components/mobile/OwnerReportDetail.tsx"), "utf8");
    expect(reports).toContain("rpt-daily-purchase");
    expect(reports).toContain('.from("purchase_bills")');
    expect(reports).toContain("software_bill_no");
  });
});
