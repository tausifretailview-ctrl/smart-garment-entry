/**
 * Purchase barcode printing must not run against an unsaved draft.
 *
 * Variants/barcodes are created when lines are added (stock_qty = 0).
 * Stock only increases after purchase_items persist. A leftover savedBillId
 * from the previous bill must not unlock Print for the next draft.
 */

export type PurchaseBarcodePrintReason =
  | "unsaved-draft"
  | "stale-saved-id"
  | "unsaved-edit-lines"
  | "no-items";

export type PurchaseBarcodePrintGate =
  | {
      allowed: true;
      billId: string;
      itemSource: "current-edit-lines" | "just-saved-items";
    }
  | { allowed: false; reason: PurchaseBarcodePrintReason };

export type PurchaseBarcodePrintLine = {
  temp_id: string;
  qty: number;
  sku_id?: string | null;
};

export function hasUnsavedPurchaseLinesForBarcodePrint(
  isEditMode: boolean,
  originalLineItems: PurchaseBarcodePrintLine[],
  currentLineItems: PurchaseBarcodePrintLine[],
): boolean {
  if (!isEditMode) return currentLineItems.length > 0;
  if (originalLineItems.length !== currentLineItems.length) return true;
  const orig = new Map(originalLineItems.map((item) => [item.temp_id, item]));
  return currentLineItems.some((item) => {
    const previous = orig.get(item.temp_id);
    if (!previous) return true;
    return (
      Number(previous.qty) !== Number(item.qty) ||
      String(previous.sku_id || "") !== String(item.sku_id || "")
    );
  });
}

export function gatePurchaseBarcodePrint(input: {
  isEditMode: boolean;
  editingBillId?: string | null;
  savedBillId?: string | null;
  currentLineCount: number;
  savedPurchaseItemCount: number;
  hasUnsavedLines: boolean;
}): PurchaseBarcodePrintGate {
  const editingId = String(input.editingBillId || "").trim();
  const savedId = String(input.savedBillId || "").trim();

  if (input.isEditMode && editingId) {
    if (input.currentLineCount <= 0) {
      return { allowed: false, reason: "no-items" };
    }
    if (input.hasUnsavedLines) {
      return { allowed: false, reason: "unsaved-edit-lines" };
    }
    return { allowed: true, billId: editingId, itemSource: "current-edit-lines" };
  }

  // After-save dialog: form was reset, but the just-saved lines remain for print.
  if (savedId && input.savedPurchaseItemCount > 0 && input.currentLineCount === 0) {
    return { allowed: true, billId: savedId, itemSource: "just-saved-items" };
  }

  // Previous bill's savedBillId while the user is already entering the next bill.
  if (savedId && input.currentLineCount > 0 && !input.isEditMode) {
    return { allowed: false, reason: "stale-saved-id" };
  }

  if (input.currentLineCount <= 0 && input.savedPurchaseItemCount <= 0) {
    return { allowed: false, reason: "no-items" };
  }

  return { allowed: false, reason: "unsaved-draft" };
}

export function purchaseBarcodePrintBlockedMessage(reason: PurchaseBarcodePrintReason): {
  title: string;
  description: string;
} {
  if (reason === "no-items") {
    return {
      title: "No Items",
      description: "Add items to print barcodes",
    };
  }
  if (reason === "unsaved-edit-lines") {
    return {
      title: "Cannot print unsaved lines",
      description:
        "Save the purchase bill first. New or changed lines have 0 stock until Save succeeds — printing now would label products that are not in stock.",
    };
  }
  return {
    title: "Cannot print unsaved bill",
    description:
      "Save the purchase bill first. Barcodes are reserved when you add lines, but stock stays 0 until the bill is saved.",
  };
}

/** Extra save-failure copy when variants/barcodes already exist on the draft. */
export function purchaseSaveFailedStockHint(
  lineItems: Array<{ barcode?: string | null }>,
): string | null {
  const reserved = lineItems.some((item) => String(item.barcode || "").trim().length > 0);
  if (!reserved) return null;
  return "Product barcodes were already reserved; stock stays 0 until this bill saves. Do not print labels until Save succeeds.";
}
