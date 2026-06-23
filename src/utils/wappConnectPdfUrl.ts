import { supabase } from "@/integrations/supabase/client";

const WAPPCONNECT_PDF_SERVE_FUNCTION = "serve-wappconnect-pdf";

/** Stable edge-function URL for a WappConnect staging PDF (no signed-URL expiry). */
export function buildWappConnectPdfServeUrl(
  supabaseUrl: string,
  storagePath: string,
  apikey?: string | null,
): string {
  const base = String(supabaseUrl ?? "").trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("Supabase URL is not configured");
  }

  const params = new URLSearchParams();
  params.set("path", storagePath);
  const key = String(apikey ?? "").trim();
  if (key) {
    params.set("apikey", key);
  }
  return `${base}/functions/v1/${WAPPCONNECT_PDF_SERVE_FUNCTION}?${params.toString()}`;
}

/** True when a logged WappConnect request still used a signed storage URL (old server path). */
export function isWappConnectSignedStorageUrl(url: string | null | undefined): boolean {
  return /\/storage\/v1\/object\/sign\/invoice-pdfs\//i.test(String(url ?? ""));
}

/**
 * Upload invoice PDF for WappConnect and return serve-wappconnect-pdf URL.
 * Client-side upload avoids old send-whatsapp edge builds that return signed URLs.
 */
export async function uploadWappConnectInvoicePdfFromBase64(
  pdfBase64: string,
  organizationId: string,
  filename: string,
): Promise<string> {
  const binary = Uint8Array.from(atob(pdfBase64), (char) => char.charCodeAt(0));
  const timestamp = Date.now();
  const safeName = String(filename || "document.pdf").replace(/[^a-zA-Z0-9-_.]/g, "_");
  const filePath = `${organizationId}/wappconnect/${timestamp}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("invoice-pdfs")
    .upload(filePath, binary, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload invoice PDF for WappConnect: ${uploadError.message}`);
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Supabase URL is not configured");
  }

  // Do NOT append apikey — serve-wappconnect-pdf has verify_jwt=false, and a
  // trailing JWT confuses WappConnect's URL-based media-type sniffing.
  return buildWappConnectPdfServeUrl(supabaseUrl, filePath);
}
