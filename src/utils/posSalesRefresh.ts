/** Fired after a POS sale is saved/updated so cached POS Dashboard refetches. */
export const POS_SALES_REFRESH_EVENT = "pos-sales-data-changed";

export function notifyPosSalesChanged(detail?: { organizationId?: string }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(POS_SALES_REFRESH_EVENT, { detail: detail ?? {} }),
  );
}
