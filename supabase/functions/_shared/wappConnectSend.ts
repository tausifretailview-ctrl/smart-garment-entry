import { formatPhoneNumber } from "./whatsappPhone.ts";
import {
  buildWappConnectPdfServeUrl,
  classifyWappConnectResponse,
  extractWappConnectErrorMessage,
} from "./wappConnectResponse.ts";

export {
  buildWappConnectPdfServeUrl,
  classifyWappConnectResponse,
  extractWappConnectErrorMessage,
} from "./wappConnectResponse.ts";

const WAPPCONNECT_API_ORIGIN = "https://api.wappconnect.com";

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

function pickMessageId(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.id,
    payload.messageId,
    payload.message_id,
    payload.msgId,
    payload.msg_id,
    payload.queue_id,
    (payload.message as Record<string, unknown> | undefined)?.id,
    (payload.data as Record<string, unknown> | undefined)?.id,
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

  // WappConnect file endpoints require a text body — never send file-only via sendFiles.
  if (fileUrl && !message) {
    message = "Please find your document attached.";
  }

  let endpoint: string;
  if (fileUrl) {
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

  const applyParams = (url: URL) => {
    url.searchParams.set("token", token);
    url.searchParams.set("phone", normalizedPhone);
    if (fileUrl) {
      url.searchParams.set("link", fileUrl);
      // Some WappConnect builds sniff media type from URL extension. Signed-URL
      // tokens hide the .pdf extension, so pass filename explicitly.
      url.searchParams.set("filename", filename);
    }
    if (endpoint === "/api/sendFileWithCaption") {
      url.searchParams.set("message", message);
      url.searchParams.set("caption", message);
      url.searchParams.set("text", message);
      url.searchParams.set("body", message);
      url.searchParams.set("msg", message);
    } else if (message) {
      url.searchParams.set("message", message);
      url.searchParams.set("text", message);
      url.searchParams.set("msg", message);
    }
  };

  const url = new URL(endpoint, WAPPCONNECT_API_ORIGIN);
  applyParams(url);

  const requestUrlRedacted = redactWappConnectInstanceId(url.toString(), token) as string;

  let response: Response;
  try {
    response = await fetch(url.toString(), { method: "GET" });
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

  // Some WappConnect builds expect POST JSON for file+caption, or fail to detect
  // the media type from a signed URL. Retry as POST with explicit filename/mime.
  if (
    fileUrl &&
    providerError &&
    /(text body is required|unsupported media type|mime|content[- ]type)/i.test(providerError)
  ) {
    try {
      const postResponse = await fetch(`${WAPPCONNECT_API_ORIGIN}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          phone: normalizedPhone,
          link: fileUrl,
          url: fileUrl,
          filename,
          mime: "application/pdf",
          mimetype: "application/pdf",
          type: "document",
          message,
          caption: message,
          text: message,
          body: message,
          msg: message,
        }),
      });
      rawBody = await postResponse.text();
      responseData = parseWappConnectResponseBody(rawBody);
      responseObject = typeof responseData === "object" && responseData !== null
        ? responseData as Record<string, unknown>
        : { raw: responseData };
      providerError = extractWappConnectErrorMessage(responseObject);
      response = postResponse;
    } catch {
      // keep original GET error
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
