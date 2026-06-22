const WAPPCONNECT_PDF_SERVE_FUNCTION = "serve-wappconnect-pdf";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isProviderFailureStatus(status: unknown): boolean {
  if (status === null || status === undefined || status === "") return false;

  const normalized = String(status).trim().toLowerCase();
  if (normalized === "error" || normalized === "fail" || normalized === "failed" || normalized === "failure") {
    return true;
  }

  const numeric = Number(status);
  return Number.isFinite(numeric) && numeric >= 400;
}

/** WappConnect often returns HTTP 200 with status:"400" in JSON. */
export function extractWappConnectErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const obj = payload as Record<string, unknown>;
  if (obj.error !== undefined && obj.error !== null && obj.error !== "") {
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.error === "object") {
      const nested = obj.error as Record<string, unknown>;
      const nestedMsg = String(nested.message ?? nested.title ?? nested.description ?? "").trim();
      if (nestedMsg) return nestedMsg;
    }
  }

  const message = String(obj.message ?? obj.msg ?? "").trim();
  const providerStatus = obj.status ?? obj.statusCode;

  if (String(obj.success ?? "").toLowerCase() === "false") {
    return message || "WappConnect returned success=false";
  }

  if (isProviderFailureStatus(providerStatus)) {
    return message || `WappConnect returned status ${providerStatus}`;
  }

  return undefined;
}

export function classifyWappConnectResponse(
  httpStatus: number,
  payload: unknown,
): { success: boolean; error?: string } {
  const providerError = extractWappConnectErrorMessage(payload);
  const httpOk = httpStatus >= 200 && httpStatus < 300;
  const success = httpOk && !providerError;

  return {
    success,
    error: success ? undefined : (providerError || `WappConnect request failed (HTTP ${httpStatus})`),
  };
}

/** Only WappConnect staging paths under {orgId}/wappconnect/*.pdf */
export function isAllowedWappConnectPdfPath(storagePath: string): boolean {
  const path = String(storagePath ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..") || path.includes("\\")) return false;

  const segments = path.split("/");
  if (segments.length !== 3) return false;

  const [orgId, folder, fileName] = segments;
  if (!UUID_RE.test(orgId)) return false;
  if (folder !== "wappconnect") return false;
  if (!fileName || !fileName.toLowerCase().endsWith(".pdf")) return false;
  if (!/^[a-zA-Z0-9._-]+\.pdf$/i.test(fileName)) return false;

  return true;
}

/** Stable edge-function URL for a stored WappConnect PDF (no signed-URL expiry). */
export function buildWappConnectPdfServeUrl(supabaseUrl: string, storagePath: string): string {
  const base = String(supabaseUrl ?? "").trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("SUPABASE_URL is not configured");
  }

  const params = new URLSearchParams();
  params.set("path", storagePath);
  return `${base}/functions/v1/${WAPPCONNECT_PDF_SERVE_FUNCTION}?${params.toString()}`;
}

const INVOICE_PDF_BUCKET_MARKER = "/invoice-pdfs/";

/** Parse invoice-pdfs storage path from serve URL, public URL, or signed URL. */
export function extractInvoicePdfStoragePath(fileUrl: string): string | null {
  const trimmed = String(fileUrl ?? "").trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.includes(`/${WAPPCONNECT_PDF_SERVE_FUNCTION}`)) {
      const path = parsed.searchParams.get("path")?.trim();
      return path || null;
    }

    const markerIndex = parsed.pathname.indexOf(INVOICE_PDF_BUCKET_MARKER);
    if (markerIndex >= 0) {
      const rawPath = parsed.pathname.slice(markerIndex + INVOICE_PDF_BUCKET_MARKER.length);
      return decodeURIComponent(rawPath).replace(/^\/+/, "") || null;
    }
  } catch {
    return null;
  }

  return null;
}

/** Rewrite signed/public storage URLs to serve-wappconnect-pdf when path is allowed. */
export function normalizeWappConnectFileUrl(supabaseUrl: string, fileUrl: string): string {
  const trimmed = String(fileUrl ?? "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(`/functions/v1/${WAPPCONNECT_PDF_SERVE_FUNCTION}`)) {
    return trimmed;
  }

  const storagePath = extractInvoicePdfStoragePath(trimmed);
  if (storagePath && isAllowedWappConnectPdfPath(storagePath)) {
    return buildWappConnectPdfServeUrl(supabaseUrl, storagePath);
  }

  return trimmed;
}
