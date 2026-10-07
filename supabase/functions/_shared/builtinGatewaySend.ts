import { formatPhoneNumber } from "./whatsappPhone.ts";
import { planWappConnectSendSteps } from "./wappConnectSend.ts";

/**
 * Client for the self-hosted wa-gateway (Baileys). One QR-linked session per organization.
 * Secrets: WA_GATEWAY_URL, WA_GATEWAY_KEY (edge function env only — never sent to the browser).
 */
export interface BuiltinSendInput {
  message?: string;
  fileUrl?: string;
  filename?: string;
}

export interface BuiltinSendResult {
  success: boolean;
  error?: string;
  messageId?: string;
  responseData?: unknown;
}

export function getGatewayConfig(): { url: string; key: string } | null {
  const url = (Deno.env.get("WA_GATEWAY_URL") ?? "").trim().replace(/\/+$/, "");
  const key = (Deno.env.get("WA_GATEWAY_KEY") ?? "").trim();
  if (!url || !key) return null;
  return { url, key };
}

export async function gatewayRequest(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const cfg = getGatewayConfig();
  if (!cfg) {
    return {
      ok: false,
      status: 503,
      data: { error: "Built-in WhatsApp gateway is not configured (WA_GATEWAY_URL / WA_GATEWAY_KEY)" },
    };
  }
  try {
    const response = await fetch(`${cfg.url}${path}`, {
      method: init.method ?? "GET",
      headers: { "x-api-key": cfg.key, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      data: { error: error instanceof Error ? error.message : "Gateway unreachable" },
    };
  }
}

/** Same step plan as WappConnect: description text first, then the PDF with a short caption. */
export async function sendViaBuiltinGateway(
  organizationId: string,
  phone: string,
  input: BuiltinSendInput,
): Promise<BuiltinSendResult> {
  const normalizedPhone = formatPhoneNumber(phone);
  if (!normalizedPhone || normalizedPhone.length < 10) {
    return { success: false, error: "Invalid phone number format" };
  }

  const fileUrl = String(input.fileUrl ?? "").trim();
  const steps = planWappConnectSendSteps({
    hasFile: Boolean(fileUrl),
    message: String(input.message ?? ""),
  });
  if (steps.length === 0) {
    return { success: false, error: "Send requires a message and/or file URL" };
  }

  let lastMessageId: string | undefined;
  const responses: unknown[] = [];
  for (const step of steps) {
    const isFile = step.role === "file";
    const result = await gatewayRequest(
      `/sessions/${encodeURIComponent(organizationId)}/${isFile ? "send-file" : "send-text"}`,
      {
        method: "POST",
        body: isFile
          ? { phone: normalizedPhone, fileUrl, filename: input.filename || "document.pdf", caption: step.message }
          : { phone: normalizedPhone, message: step.message },
      },
    );
    responses.push(result.data);
    if (!result.ok || result.data.success === false) {
      return {
        success: false,
        error: String(result.data.error ?? `Gateway error (${result.status})`),
        responseData: responses,
      };
    }
    lastMessageId = (result.data.messageId as string | undefined) ?? lastMessageId;
  }
  return { success: true, messageId: lastMessageId, responseData: responses };
}
