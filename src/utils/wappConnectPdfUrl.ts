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
  const fileName = storagePath.split("/").pop() || "invoice.pdf";
  // Keep a .pdf suffix in the URL path too — some WappConnect builds sniff
  // media type from pathname and ignore query params/Content-Type.
  return `${base}/functions/v1/${WAPPCONNECT_PDF_SERVE_FUNCTION}/${encodeURIComponent(fileName)}?${params.toString()}`;
}

async function waitForReachablePdf(url: string): Promise<void> {
  let lastStatus = "not checked";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      lastStatus = `HTTP ${response.status}`;
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (response.ok && (!contentType || contentType.includes("application/pdf") || contentType.includes("application/octet-stream"))) {
        return;
      }
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : "network error";
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 300));
  }
  throw new Error(`Invoice PDF was uploaded but is not reachable yet (${lastStatus})`);
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
  const serveUrl = buildWappConnectPdfServeUrl(supabaseUrl, filePath);
  await waitForReachablePdf(serveUrl);
  return serveUrl;
}
