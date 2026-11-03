/**
 * Shared raster choices for invoice → PDF capture.
 * WappConnect WhatsApp uploads hit Supabase storage size limits when PNG @ scale 2
 * is used — prefer JPEG + modest scale while keeping clone border/font fixes.
 */

/**
 * jsPDF stores PNG images UNCOMPRESSED unless addImage gets a compression mode:
 * one A4 sheet at scale 2 became a ~11 MB PDF (KISHORE SHOE MALL, INV/26-27/278).
 * "FAST" is lossless Flate, so print quality is identical and the file drops to a few
 * hundred KB. Harmless for JPEG (already compressed).
 */
export const PDF_IMAGE_COMPRESSION = "FAST" as const;

export type InvoicePdfRasterOptions = {
  mobileOptimized?: boolean;
  wappConnectPdf?: boolean;
};

export function resolveInvoicePdfRasterOptions(opts: InvoicePdfRasterOptions = {}): {
  scale: number;
  useJpeg: boolean;
  imageType: "JPEG" | "PNG";
  mimeType: "image/jpeg" | "image/png";
  imageQuality: number;
} {
  const mobileOptimized = opts.mobileOptimized === true;
  const wappConnectPdf = opts.wappConnectPdf === true;

  // Prefer smaller files for WhatsApp/storage; keep print/download crisp when not optimized.
  const scale = wappConnectPdf ? 1.5 : mobileOptimized ? 1.5 : 2;
  const useJpeg = mobileOptimized || wappConnectPdf;
  const imageQuality = wappConnectPdf ? 0.82 : mobileOptimized ? 0.92 : 0.92;

  return {
    scale,
    useJpeg,
    imageType: useJpeg ? "JPEG" : "PNG",
    mimeType: useJpeg ? "image/jpeg" : "image/png",
    imageQuality,
  };
}
