/** Options for POS save+print: defer heavy dashboard refetch until after print. */
export type SaveSaleRuntimeOptions = {
  /** Queue dashboard invalidation (flush after print or fallback timeout). */
  deferDashboardInvalidation?: boolean;
  /** Do not block save completion on sale_return FIFO consume (POS only). */
  nonBlockingSaleReturnConsume?: boolean;
  /**
   * Override for invoice PDF generation used by WhatsApp auto-send.
   * When provided, the hook calls this instead of the built-in jsPDF generator,
   * letting the caller render the actual selected invoice template (with logo,
   * header, etc.) via html2canvas. Must return a base64 PDF (without data URI prefix).
   * Receives the just-saved sale meta so the rendered invoice can show the real
   * sale number / date instead of a draft placeholder.
   */
  capturePdfBase64?: (meta: {
    saleNumber: string;
    saleId: string;
    saleDate: Date;
  }) => Promise<string | null>;
};

export const POS_DEFERRED_INVALIDATION_OPTS: SaveSaleRuntimeOptions = {
  deferDashboardInvalidation: true,
  nonBlockingSaleReturnConsume: true,
};
