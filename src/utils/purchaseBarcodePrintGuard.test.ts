import { describe, expect, it } from "vitest";
import {
  gatePurchaseBarcodePrint,
  hasUnsavedPurchaseLinesForBarcodePrint,
  purchaseBarcodePrintBlockedMessage,
  purchaseSaveFailedStockHint,
} from "./purchaseBarcodePrintGuard";

describe("hasUnsavedPurchaseLinesForBarcodePrint", () => {
  it("treats any new-bill lines as unsaved", () => {
    expect(
      hasUnsavedPurchaseLinesForBarcodePrint(false, [], [
        { temp_id: "a", qty: 5, sku_id: "sku-1" },
      ]),
    ).toBe(true);
  });

  it("allows an unchanged edit bill", () => {
    const lines = [{ temp_id: "a", qty: 5, sku_id: "sku-1" }];
    expect(hasUnsavedPurchaseLinesForBarcodePrint(true, lines, lines)).toBe(false);
  });

  it("flags new edit-mode lines and qty/sku changes", () => {
    const original = [{ temp_id: "a", qty: 5, sku_id: "sku-1" }];
    expect(
      hasUnsavedPurchaseLinesForBarcodePrint(true, original, [
        ...original,
        { temp_id: "b", qty: 2, sku_id: "sku-2" },
      ]),
    ).toBe(true);
    expect(
      hasUnsavedPurchaseLinesForBarcodePrint(true, original, [
        { temp_id: "a", qty: 8, sku_id: "sku-1" },
      ]),
    ).toBe(true);
    expect(
      hasUnsavedPurchaseLinesForBarcodePrint(true, original, [
        { temp_id: "a", qty: 5, sku_id: "sku-9" },
      ]),
    ).toBe(true);
  });
});

describe("gatePurchaseBarcodePrint", () => {
  it("blocks a new unsaved draft even with leftover savedBillId (Saaj case)", () => {
    const gate = gatePurchaseBarcodePrint({
      isEditMode: false,
      editingBillId: null,
      savedBillId: "previous-bill",
      currentLineCount: 5,
      savedPurchaseItemCount: 12,
      hasUnsavedLines: true,
    });
    expect(gate).toEqual({ allowed: false, reason: "stale-saved-id" });
    expect(purchaseBarcodePrintBlockedMessage(gate.reason).title).toBe(
      "Cannot print unsaved bill",
    );
  });

  it("blocks a brand-new bill with no saved id", () => {
    expect(
      gatePurchaseBarcodePrint({
        isEditMode: false,
        savedBillId: null,
        currentLineCount: 3,
        savedPurchaseItemCount: 0,
        hasUnsavedLines: true,
      }),
    ).toEqual({ allowed: false, reason: "unsaved-draft" });
  });

  it("allows the after-save print dialog (form reset, saved items remain)", () => {
    expect(
      gatePurchaseBarcodePrint({
        isEditMode: false,
        savedBillId: "bill-1",
        currentLineCount: 0,
        savedPurchaseItemCount: 5,
        hasUnsavedLines: false,
      }),
    ).toEqual({
      allowed: true,
      billId: "bill-1",
      itemSource: "just-saved-items",
    });
  });

  it("allows reprint of an unchanged saved bill in edit mode", () => {
    expect(
      gatePurchaseBarcodePrint({
        isEditMode: true,
        editingBillId: "bill-2",
        savedBillId: "bill-2",
        currentLineCount: 4,
        savedPurchaseItemCount: 4,
        hasUnsavedLines: false,
      }),
    ).toEqual({
      allowed: true,
      billId: "bill-2",
      itemSource: "current-edit-lines",
    });
  });

  it("blocks edit-mode print when new lines were added and not saved", () => {
    expect(
      gatePurchaseBarcodePrint({
        isEditMode: true,
        editingBillId: "bill-2",
        savedBillId: "bill-2",
        currentLineCount: 6,
        savedPurchaseItemCount: 4,
        hasUnsavedLines: true,
      }),
    ).toEqual({ allowed: false, reason: "unsaved-edit-lines" });
  });

  it("does not treat leftover savedBillId as edit-mode print permission", () => {
    const gate = gatePurchaseBarcodePrint({
      isEditMode: false,
      editingBillId: null,
      savedBillId: "bill-1",
      currentLineCount: 2,
      savedPurchaseItemCount: 0,
      hasUnsavedLines: true,
    });
    expect(gate.allowed).toBe(false);
  });
});

describe("purchaseSaveFailedStockHint", () => {
  it("warns when barcodes were already reserved", () => {
    expect(
      purchaseSaveFailedStockHint([{ barcode: "20001629" }, { barcode: "" }]),
    ).toMatch(/stock stays 0/i);
  });

  it("is silent when no barcodes exist yet", () => {
    expect(purchaseSaveFailedStockHint([{ barcode: "  " }, {}])).toBeNull();
  });
});
