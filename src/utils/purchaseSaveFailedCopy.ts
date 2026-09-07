import { extractErrorInfo } from "@/lib/errorLogger";
import { parsePurchaseAtomicSaveError } from "@/utils/mobilePurchaseSave";
import { purchaseSaveFailedStockHint } from "@/utils/purchaseBarcodePrintGuard";

export const PURCHASE_BILL_SAVE_FAILED_TITLE = "Bill Save Failed — Draft Preserved";
export const PURCHASE_BILL_CANNOT_REDUCE_QTY_TITLE = "Cannot reduce quantity";
export const PURCHASE_BILL_SAVE_FAILED_DRAFT_HINT =
  "Your data is safe in draft. Please try again.";

export function formatPurchaseBillSaveFailedCopy(input: {
  error: unknown;
  lineItems?: Array<{ barcode?: string | null }>;
}): { title: string; message: string; isStockFloor: boolean } {
  const info = extractErrorInfo(input.error);
  const rawMsg = String(
    (input.error && typeof input.error === "object" && "message" in (input.error as object)
      ? (input.error as { message?: unknown }).message
      : null) ||
      info.message ||
      "",
  );
  const floorMsg = rawMsg.includes("PURCHASE_STOCK_FLOOR:")
    ? rawMsg
        .replace(/^.*PURCHASE_STOCK_FLOOR:\s*/i, "")
        .replace(/^Error in purchase_item_\w+ trigger:\s*/i, "")
    : null;
  if (floorMsg) {
    return {
      title: PURCHASE_BILL_CANNOT_REDUCE_QTY_TITLE,
      message: floorMsg,
      isStockFloor: true,
    };
  }

  const lineText = parsePurchaseAtomicSaveError(info.message);
  const withCode = info.code ? `${lineText} (code: ${info.code})` : lineText;
  const stockHint = purchaseSaveFailedStockHint(input.lineItems || []);
  const message = `${withCode}. ${PURCHASE_BILL_SAVE_FAILED_DRAFT_HINT}${stockHint ? ` ${stockHint}` : ""}`;
  return {
    title: PURCHASE_BILL_SAVE_FAILED_TITLE,
    message,
    isStockFloor: false,
  };
}
