import type { CartItem } from "@/lib/posBilling";

/** Frozen POS cart snapshot for async WhatsApp PDF capture after save clears the cart. */
export type PosWhatsAppPdfCaptureSnapshot = {
  customerName: string;
  customerPhone: string;
  customerId?: string | null;
  items: CartItem[];
  subTotal: number;
  discount: number;
  saleReturnAdjust: number;
  grandTotal: number;
  paymentMethod: string;
  paidAmount: number;
  previousBalance: number;
  roundOff: number;
  salesman: string;
  taxType: string;
  notes?: string | null;
  financerDetails?: unknown;
  enableMrp: boolean;
};

export type PosWhatsAppPdfCaptureMeta = {
  saleNumber: string;
  saleId: string;
  saleDate: Date;
  /** When set, used instead of live POS cart state (cart may clear before async capture). */
  snapshot?: PosWhatsAppPdfCaptureSnapshot;
};

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
  capturePdfBase64?: (meta: PosWhatsAppPdfCaptureMeta) => Promise<string | null>;
  /** When true, useSaveSale skips built-in WhatsApp auto-send (caller sends via POS/dashboard path). */
  skipWhatsAppAutoSend?: boolean;
};

export const POS_DEFERRED_INVALIDATION_OPTS: SaveSaleRuntimeOptions = {
  deferDashboardInvalidation: true,
  nonBlockingSaleReturnConsume: true,
};
