/** Fired after a POS sale is saved/updated so cached POS Dashboard refetches. */
export const POS_SALES_REFRESH_EVENT = "pos-sales-data-changed";

/** Request cursor in the POS barcode scan field (e.g. after New Sale). */
export const POS_FOCUS_BARCODE_EVENT = "pos-sales-focus-barcode";

export function notifyPosSalesChanged(detail?: { organizationId?: string }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(POS_SALES_REFRESH_EVENT, { detail: detail ?? {} }),
  );
}

export function requestPosBarcodeFocus() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POS_FOCUS_BARCODE_EVENT));
}
