import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PURCHASE_BILL_CANNOT_REDUCE_QTY_TITLE,
  PURCHASE_BILL_SAVE_FAILED_TITLE,
  formatPurchaseBillSaveFailedCopy,
} from "./purchaseSaveFailedCopy";

const here = dirname(fileURLToPath(import.meta.url));

describe("formatPurchaseBillSaveFailedCopy", () => {
  it("matches the purchase-bill ErrorDialog copy for variant-not-found + reserved barcodes", () => {
    const copy = formatPurchaseBillSaveFailedCopy({
      error: {
        message:
          "Line 2: variant 6135aa1e-3813-4b52-a561-52539524e942 not found for organization",
        code: "P0001",
      },
      lineItems: [{ barcode: "20001629" }, { barcode: "20001630" }],
    });
    expect(copy.title).toBe(PURCHASE_BILL_SAVE_FAILED_TITLE);
    expect(copy.isStockFloor).toBe(false);
    expect(copy.message).toBe(
      "Line 2: variant 6135aa1e-3813-4b52-a561-52539524e942 not found for organization (code: P0001). Your data is safe in draft. Please try again. Product barcodes were already reserved; stock stays 0 until this bill saves. Do not print labels until Save succeeds.",
    );
  });

  it("pulls the Line N slice out of a wrapped Postgres error", () => {
    const copy = formatPurchaseBillSaveFailedCopy({
      error: {
        message:
          'ERROR:  Line 2: variant 6135aa1e-3813-4b52-a561-52539524e942 not found for organization\nCONTEXT:  PL/pgSQL function save_purchase_bill_with_items_atomic',
        code: "P0001",
      },
      lineItems: [{ barcode: "" }],
    });
    expect(copy.message).toBe(
      "Line 2: variant 6135aa1e-3813-4b52-a561-52539524e942 not found for organization (code: P0001). Your data is safe in draft. Please try again.",
    );
  });

  it("uses the stock-floor title and strips the guardrail prefix", () => {
    const copy = formatPurchaseBillSaveFailedCopy({
      error: {
        message: "PURCHASE_STOCK_FLOOR: Cannot reduce qty below 2 (already sold)",
        code: "P0001",
      },
      lineItems: [{ barcode: "1" }],
    });
    expect(copy.title).toBe(PURCHASE_BILL_CANNOT_REDUCE_QTY_TITLE);
    expect(copy.isStockFloor).toBe(true);
    expect(copy.message).toBe("Cannot reduce qty below 2 (already sold)");
  });
});

describe("purchase bill save-failed dialog wiring", () => {
  it("desktop PurchaseEntry uses the shared copy helper", () => {
    const page = readFileSync(resolve(here, "../pages/PurchaseEntry.tsx"), "utf8");
    expect(page).toContain("formatPurchaseBillSaveFailedCopy");
  });

  it("mobile purchase bill opens ErrorDialog with the same copy", () => {
    const page = readFileSync(resolve(here, "../pages/mobile/MobilePurchaseEntry.tsx"), "utf8");
    expect(page).toContain("formatPurchaseBillSaveFailedCopy");
    expect(page).toContain("ErrorDialog");
    expect(page).toContain("saveFailedDialog");
  });
});
