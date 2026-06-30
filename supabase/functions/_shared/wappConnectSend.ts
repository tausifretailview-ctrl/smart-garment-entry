import { formatPhoneNumber } from "./whatsappPhone.ts";
import {
  buildWappConnectPdfServeUrl,
  classifyWappConnectResponse,
  extractInvoicePdfStoragePath,
  extractWappConnectErrorMessage,
  isAllowedWappConnectPdfPath,
  isWappConnectSignedStorageUrl,
  normalizeWappConnectFileUrl,
} from "./wappConnectResponse.ts";

export {
  buildWappConnectPdfServeUrl,
  classifyWappConnectResponse,
  extractWappConnectErrorMessage,
  isWappConnectSignedStorageUrl,
} from "./wappConnectResponse.ts";

const WAPPCONNECT_API_ORIGIN = "https://api.wappconnect.com";

/**
 * WappConnect's URL parser fails on very long URLs (>2048 chars) with a misleading
 * "Invalid phone number" 400. Strip the apikey JWT from serve-wappconnect-pdf links
 * (the function has verify_jwt=false, so it isn't needed) to keep the URL short.
 */
function stripApikeyFromServeUrl(fileUrl: string): string {
  try {
    const parsed = new URL(fileUrl);
    if (parsed.pathname.includes("/functions/v1/serve-wappconnect-pdf")) {
      parsed.searchParams.delete("apikey");
      return parsed.toString();
    }
  } catch {
    // fall through
  }
  return fileUrl;
}

export interface WappConnectSendInput {
  message?: string;
  fileUrl?: string;
  filename?: string;
}

export interface WappConnectSendResult {
  success: boolean;
  error?: string;
  messageId?: string;
  responseData?: unknown;
  endpoint: string;
  requestUrlRedacted: string;
}

/** Remove instance id from strings/objects before persisting to logs. */
export function redactWappConnectInstanceId(
  value: unknown,
  instanceId: string,
): unknown {
  if (!instanceId) return value;

  const redactString = (text: string): string => {
    if (!text.includes(instanceId)) return text;
    const visible = instanceId.length > 4 ? instanceId.slice(-4) : "";
    const masked = "*".repeat(Math.max(instanceId.length - visible.length, 0)) + visible;
    return text.split(instanceId).join(masked);
  };

  if (typeof value === "string") {
    return redactString(value);
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactWappConnectInstanceId(item, instanceId));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactWappConnectInstanceId(val, instanceId);
    }
    return out;
  }

  return value;
}

function redactApiKeyInUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const apikey = parsed.searchParams.get("apikey");
    if (apikey) {
      const visible = apikey.length > 4 ? apikey.slice(-4) : "";
      const masked = "*".repeat(Math.max(apikey.length - visible.length, 0)) + visible;
      parsed.searchParams.set("apikey", masked);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

async function verifyWappConnectPdfUrl(fileUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(fileUrl, { method: "HEAD" });
    if (!response.ok) {
      return `Invoice PDF link is not reachable (HTTP ${response.status}). Deploy the serve-wappconnect-pdf edge function in Supabase, then retry.`;
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("application/pdf") &&
      !contentType.includes("application/octet-stream")
    ) {
      return `Invoice PDF link returned "${contentType}" instead of a PDF. WappConnect cannot attach this file — use serve-wappconnect-pdf, not a signed storage URL.`;
    }
  } catch (fetchError) {
    const errMsg = fetchError instanceof Error ? fetchError.message : "network error";
    return `Could not verify invoice PDF link before send: ${errMsg}`;
  }
  return undefined;
}

async function downloadPdfForWappConnect(fileUrl: string): Promise<Blob> {
  const response = await fetch(fileUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`PDF download failed before send (HTTP ${response.status})`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (
    contentType &&
    !contentType.includes("application/pdf") &&
    !contentType.includes("application/octet-stream")
  ) {
    await response.body?.cancel();
    throw new Error(`PDF download returned "${contentType}" before send`);
  }

  return await response.blob();
}

// serve-wappconnect-pdf has verify_jwt=false — appending ?apikey=<JWT>
// confuses WappConnect's URL-based media-type sniffing ("unsupported media type"),
// so we deliberately build the serve URL WITHOUT an apikey query parameter.

function pickMessageId(payload: Record<string, unknown>): string | undefined {
  const nestedData = payload.data as Record<string, unknown> | undefined;
  const nestedIds = nestedData?.messageIDs ?? nestedData?.messageIds ?? nestedData?.message_ids;
  if (Array.isArray(nestedIds) && nestedIds.length > 0) {
    const first = String(nestedIds[0] ?? "").trim();
    if (first) return first;
  }

  const queueId = String(
    nestedData?.queue_id ?? nestedData?.queueId ?? payload.queue_id ?? payload.queueId ?? "",
  ).trim();
  if (queueId) return queueId;

  const candidates = [
    payload.id,
    payload.messageId,
    payload.message_id,
    payload.msgId,
    payload.msg_id,
    (payload.message as Record<string, unknown> | undefined)?.id,
    (payload.message as Record<string, unknown> | undefined)?.queue_id,
    nestedData?.id,
  ];

  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (text) return text;
  }

  return undefined;
}

function parseWappConnectResponseBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: trimmed };
  }
}

/**
 * Send via WappConnect instance API (GET + query params, URL-encoded).
 * token = org instance id (never log the full value).
 */
export async function sendViaWappConnect(
  instanceId: string,
  phone: string,
  input: WappConnectSendInput,
): Promise<WappConnectSendResult> {
  const token = String(instanceId ?? "").trim();
  if (!token) {
    return {
      success: false,
      error: "WappConnect instance id is not configured",
      endpoint: "",
      requestUrlRedacted: "",
    };
  }

  const normalizedPhone = formatPhoneNumber(phone);
  if (!normalizedPhone || normalizedPhone.length < 10) {
    return {
      success: false,
      error: "Invalid phone number format",
      endpoint: "",
      requestUrlRedacted: "",
    };
  }

  const fileUrl = String(input.fileUrl ?? "").trim();
  let message = String(input.message ?? "").trim();
  const filename = String(input.filename ?? "").trim() || "document.pdf";

  const cleanFileUrl = fileUrl ? stripApikeyFromServeUrl(fileUrl) : "";

  if (cleanFileUrl && isWappConnectSignedStorageUrl(cleanFileUrl)) {
    return {
      success: false,
      error:
        "Signed storage PDF links cannot be delivered by WappConnect. Deploy serve-wappconnect-pdf and send-whatsapp, hard refresh (↻), then retry.",
      endpoint: "",
      requestUrlRedacted: "",
    };
  }

  if (cleanFileUrl) {
    const pdfVerifyError = await verifyWappConnectPdfUrl(cleanFileUrl);
    if (pdfVerifyError) {
      return {
        success: false,
        error: pdfVerifyError,
        endpoint: "",
        requestUrlRedacted: redactApiKeyInUrl(cleanFileUrl),
      };
    }
  }

  // WappConnect file endpoints require a text body — never send file-only via sendFiles.
  if (cleanFileUrl && !message) {
    message = "Please find your document attached.";
  }
  let downloadedPdf: Blob | null = null;
  if (cleanFileUrl) {
    try {
      downloadedPdf = await downloadPdfForWappConnect(cleanFileUrl);
    } catch (downloadError) {
      return {
        success: false,
        error: downloadError instanceof Error ? downloadError.message : "PDF download failed before send",
        endpoint: "",
        requestUrlRedacted: redactApiKeyInUrl(cleanFileUrl),
      };
    }
  }

  let endpoint: string;
  if (cleanFileUrl) {
    endpoint = "/api/sendFileWithCaption";
  } else if (message) {
    endpoint = "/api/sendText";
  } else {
    return {
      success: false,
      error: "WappConnect send requires a message and/or file URL",
      endpoint: "",
      requestUrlRedacted: "",
    };
  }

  const applyParams = (url: URL, mode: "link" | "multipart" | "text" = "text") => {
    url.searchParams.set("token", token);
    url.searchParams.set("phone", normalizedPhone);
    if (mode === "link" && cleanFileUrl) {
      // WappConnect docs require `message` (not `caption`) for URL-based file sends.
      url.searchParams.set("link", cleanFileUrl);
      url.searchParams.set("message", message);
    } else if ((mode === "multipart" || mode === "text") && message) {
      url.searchParams.set("message", message);
    }
  };

  const url = new URL(endpoint, WAPPCONNECT_API_ORIGIN);
  applyParams(url, cleanFileUrl ? "multipart" : "text");

  let requestUrlRedacted = redactWappConnectInstanceId(
    redactApiKeyInUrl(url.toString()),
    token,
  ) as string;

  let response: Response;
  try {
    if (cleanFileUrl && downloadedPdf) {
      // Upload the already-generated PDF as multipart form-data. This avoids WappConnect
      // having to fetch our backend URL itself, which was causing "PDF link not readable"
      // / missing-attachment cases even when the ERP log was marked sent.
      const form = new FormData();
      form.append("file", downloadedPdf, filename);
      form.append("message", message);
      response = await fetch(url.toString(), { method: "POST", body: form });
    } else {
      response = await fetch(url.toString(), { method: "GET" });
    }
  } catch (fetchError) {
    const errMsg = fetchError instanceof Error ? fetchError.message : "Network error";
    return {
      success: false,
      error: errMsg,
      endpoint,
      requestUrlRedacted,
      responseData: { fetchError: errMsg },
    };
  }

  let rawBody = await response.text();
  let responseData = parseWappConnectResponseBody(rawBody);
  let responseObject = typeof responseData === "object" && responseData !== null
    ? responseData as Record<string, unknown>
    : { raw: responseData };

  let providerError = extractWappConnectErrorMessage(responseObject);

  // If multipart upload is not accepted by a WappConnect build, fall back to the
  // documented URL-link method using `message` (not `caption`).
  if (
    cleanFileUrl &&
    providerError &&
    /(save file|uploaded|unsupported media type|mime|content[- ]type|webclient|file)/i.test(providerError)
  ) {
    try {
      const linkUrl = new URL(endpoint, WAPPCONNECT_API_ORIGIN);
      applyParams(linkUrl, "link");
      requestUrlRedacted = redactWappConnectInstanceId(
        redactApiKeyInUrl(linkUrl.toString()),
        token,
      ) as string;
      const linkResponse = await fetch(linkUrl.toString(), { method: "GET" });
      rawBody = await linkResponse.text();
      responseData = parseWappConnectResponseBody(rawBody);
      responseObject = typeof responseData === "object" && responseData !== null
        ? responseData as Record<string, unknown>
        : { raw: responseData };
      providerError = extractWappConnectErrorMessage(responseObject);
      response = linkResponse;
    } catch {
      // keep original multipart error
    }
  }

  const messageId = pickMessageId(responseObject);
  const outcome = classifyWappConnectResponse(response.status, responseObject);

  return {
    success: outcome.success,
    error: outcome.error,
    messageId,
    responseData: redactWappConnectInstanceId(responseObject, token),
    endpoint,
    requestUrlRedacted,
  };
}

/** Upload base64 PDF and return a stable https URL WappConnect can fetch. */
export async function resolveWappConnectFileUrl(
  supabase: {
    storage: {
      from: (bucket: string) => {
        upload: (
          path: string,
          body: Uint8Array,
          opts: { contentType: string; upsert: boolean },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
  },
  organizationId: string,
  pdfBlob: string,
  filename: string,
  supabaseUrl: string,
): Promise<string> {
  const binary = Uint8Array.from(atob(pdfBlob), (char) => char.charCodeAt(0));
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
    throw new Error(`Failed to upload PDF for WappConnect: ${uploadError.message}`);
  }

  return buildWappConnectPdfServeUrl(supabaseUrl, filePath);
}

type WappConnectStorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Uint8Array,
        opts: { contentType: string; upsert: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
};

/** Copy an existing invoice-pdfs object into org/wappconnect/ and return serve URL. */
export async function rehostStoragePdfForWappConnect(
  supabase: WappConnectStorageClient,
  organizationId: string,
  sourcePath: string,
  filename: string,
  supabaseUrl: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from("invoice-pdfs").download(sourcePath);
  if (error || !data) {
    throw new Error(`Failed to download PDF for WappConnect: ${error?.message ?? "not found"}`);
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  const timestamp = Date.now();
  const safeName = String(filename || "document.pdf").replace(/[^a-zA-Z0-9-_.]/g, "_");
  const filePath = `${organizationId}/wappconnect/${timestamp}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("invoice-pdfs")
    .upload(filePath, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to rehost PDF for WappConnect: ${uploadError.message}`);
  }

  return buildWappConnectPdfServeUrl(supabaseUrl, filePath);
}

/**
 * Ensure WappConnect receives a serve-wappconnect-pdf URL (not a signed storage URL).
 * Signed URLs hide the .pdf extension and cause "unsupported media type" 400 errors.
 */
export async function ensureWappConnectPdfUrl(
  supabase: WappConnectStorageClient,
  organizationId: string,
  fileUrl: string,
  filename: string,
  supabaseUrl: string,
): Promise<string> {
  const trimmed = String(fileUrl ?? "").trim();
  if (!trimmed) return trimmed;

  const normalized = normalizeWappConnectFileUrl(supabaseUrl, trimmed);
  if (normalized.includes("/functions/v1/serve-wappconnect-pdf")) {
    return normalized;
  }

  const storagePath = extractInvoicePdfStoragePath(trimmed);
  if (!storagePath || !storagePath.startsWith(`${organizationId}/`)) {
    return trimmed;
  }

  if (isAllowedWappConnectPdfPath(storagePath)) {
    return buildWappConnectPdfServeUrl(supabaseUrl, storagePath);
  }

  return rehostStoragePdfForWappConnect(
    supabase,
    organizationId,
    storagePath,
    filename,
    supabaseUrl,
  );
}
