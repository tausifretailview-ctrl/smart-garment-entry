import { formatPhoneNumber } from "./whatsappPhone.ts";

const WAPPCONNECT_API_ORIGIN = "https://api.wappconnect.com";

export interface WappConnectSendInput {
  message?: string;
  fileUrl?: string;
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

function extractErrorMessage(payload: unknown): string | undefined {
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
  if (message && String(obj.success ?? "").toLowerCase() === "false") {
    return message;
  }

  if (String(obj.status ?? "").toLowerCase() === "error") {
    return message || "WappConnect returned error status";
  }

  return undefined;
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
  const message = String(input.message ?? "").trim();

  let endpoint: string;
  if (fileUrl && message) {
    endpoint = "/api/sendFileWithCaption";
  } else if (fileUrl) {
    endpoint = "/api/sendFiles";
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

  const url = new URL(endpoint, WAPPCONNECT_API_ORIGIN);
  url.searchParams.set("token", token);
  url.searchParams.set("phone", normalizedPhone);

  if (fileUrl) {
    url.searchParams.set("link", fileUrl);
  }

  // WappConnect endpoints use different param names across versions.
  // sendFileWithCaption requires a text body — set all known aliases.
  if (endpoint === "/api/sendFileWithCaption") {
    url.searchParams.set("message", message);
    url.searchParams.set("caption", message);
    url.searchParams.set("text", message);
    url.searchParams.set("body", message);
  } else if (message) {
    url.searchParams.set("message", message);
    url.searchParams.set("text", message);
  }

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

  const rawBody = await response.text();
  const responseData = parseWappConnectResponseBody(rawBody);
  const responseObject = typeof responseData === "object" && responseData !== null
    ? responseData as Record<string, unknown>
    : { raw: responseData };

  const providerError = extractErrorMessage(responseObject);
  const messageId = pickMessageId(responseObject);
  const success = response.ok && !providerError;

  return {
    success,
    error: success ? undefined : (providerError || `WappConnect request failed (${response.status})`),
    messageId,
    responseData: redactWappConnectInstanceId(responseObject, token),
    endpoint,
    requestUrlRedacted,
  };
}

/** Upload base64 PDF and return an https URL WappConnect can fetch. */
export async function resolveWappConnectFileUrl(
  supabase: {
    storage: {
      from: (bucket: string) => {
        upload: (
          path: string,
          body: Uint8Array,
          opts: { contentType: string; upsert: boolean },
        ) => Promise<{ error: { message: string } | null }>;
        createSignedUrl: (
          path: string,
          expiresIn: number,
        ) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
        getPublicUrl: (path: string) => { data: { publicUrl: string } };
      };
    };
  },
  organizationId: string,
  pdfBlob: string,
  filename: string,
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

  const { data: signed, error: signError } = await supabase.storage
    .from("invoice-pdfs")
    .createSignedUrl(filePath, 600);

  if (!signError && signed?.signedUrl?.startsWith("https://")) {
    return signed.signedUrl;
  }

  const { data: publicUrlData } = supabase.storage.from("invoice-pdfs").getPublicUrl(filePath);
  const publicUrl = publicUrlData?.publicUrl;
  if (!publicUrl?.startsWith("https://")) {
    throw new Error("Failed to resolve HTTPS URL for WappConnect file send");
  }

  return publicUrl;
}
