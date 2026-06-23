export type WhatsAppErrorHint = {
  title: string;
  reason: string;
  action: string;
};

/** True when API response shape is from Meta / BSP (wamid, messaging_product, etc.). */
export function isMetaWhatsAppProviderResponse(providerResponse?: unknown): boolean {
  if (!providerResponse || typeof providerResponse !== "object") return false;
  const obj = providerResponse as Record<string, unknown>;
  if (Array.isArray(obj.messages) && obj.messages.length > 0) return true;
  if (obj.messaging_product === "whatsapp") return true;
  const err = obj.error as Record<string, unknown> | undefined;
  if (err && typeof err.code === "number") return true;
  if (String(err?.title ?? "").toLowerCase().includes("re-engagement")) return true;
  return false;
}

function isMetaOnlyProvider(provider?: string | null): boolean {
  return provider === "existing" || provider === null || provider === undefined;
}

/**
 * Friendly, actionable WhatsApp send error hints — separated by provider.
 * WappConnect (unofficial) does not use Meta's 24-hour customer service window.
 */
export function getWhatsAppErrorHint(
  errorMessage?: string | null,
  providerResponse?: unknown,
  provider?: string | null,
): WhatsAppErrorHint | null {
  const raw = `${errorMessage || ""} ${JSON.stringify(providerResponse || {})}`.toLowerCase();
  const pr = providerResponse as Record<string, unknown> | undefined;
  const errObj =
    pr?.error && typeof pr.error === "object" ? (pr.error as Record<string, unknown>) : undefined;
  const nestedMsgErr =
    pr?.message && typeof pr.message === "object"
      ? ((pr.message as Record<string, unknown>).error as Record<string, unknown> | undefined)
      : undefined;
  const errCode =
    errObj?.code ??
    (Array.isArray(pr?.errors) ? (pr!.errors as Record<string, unknown>[])[0]?.code : undefined) ??
    nestedMsgErr?.code;

  const isMetaReEngagement =
    errCode === 131047 ||
    raw.includes("re-engagement") ||
    (raw.includes("24 hours") && isMetaWhatsAppProviderResponse(providerResponse)) ||
    (raw.includes("24-hour") && isMetaWhatsAppProviderResponse(providerResponse));

  // WappConnect path — never show Meta 24h / template hints
  if (provider === "wappconnect") {
    if (
      raw.includes("unsupported media type") ||
      raw.includes("mime") ||
      raw.includes("content-type") ||
      raw.includes("signed storage") ||
      raw.includes("download file failed") ||
      raw.includes("link not valid") ||
      raw.includes("file not exist") ||
      raw.includes("invalid message")
    ) {
      return {
        title: "PDF link not readable by WappConnect",
        reason:
          "WappConnect may show \"sent\" in ERP while WhatsApp later fails the document (invalid message). This usually means the PDF link was a signed storage URL or serve-wappconnect-pdf is not deployed.",
        action:
          "In WhatsApp Logs, confirm Request URL uses .../functions/v1/serve-wappconnect-pdf?path=... Deploy send-whatsapp and serve-wappconnect-pdf in Supabase, hard refresh (↻), then retry.",
      };
    }
    if (raw.includes("text body is required")) {
      return {
        title: "PDF caption missing",
        reason: "WappConnect rejected the send because the PDF had no caption text.",
        action:
          "Check Settings → WhatsApp → Message Templates → Sales Invoice / POS Billing Message is saved. Hard refresh (↻) and retry.",
      };
    }
    if (raw.includes("instance id") || raw.includes("not configured")) {
      return {
        title: "WappConnect not configured",
        reason: "Instance id is missing or invalid for this organization.",
        action: "Settings → WhatsApp API → enter Instance id → Save → Send test.",
      };
    }
    return null;
  }

  // Meta 24h rule sent on Legacy/wrong path while user expects WappConnect
  if (isMetaReEngagement && provider !== "existing") {
    return {
      title: "Sent via Meta API (not WappConnect)",
      reason:
        "This failed with Meta's 24-hour reply rule. WappConnect does not have that restriction, but this send used the Meta/BSP path (Provider shows Legacy).",
      action:
        "Settings → WhatsApp API → Send provider = WappConnect → Save. Deploy the latest send-whatsapp edge function, hard refresh (↻), then retry.",
    };
  }

  if (raw.includes("text body is required") && provider !== "wappconnect") {
    return {
      title: "PDF caption missing (wrong send path)",
      reason:
        "WappConnect needs caption text with PDF, but this send did not use the WappConnect server path (Provider: Legacy).",
      action:
        "Set Send provider to WappConnect, save, deploy send-whatsapp edge function, hard refresh (↻), and retry.",
    };
  }

  if (errCode === 131026 || raw.includes("message undeliverable") || raw.includes("undeliverable")) {
    if (!isMetaOnlyProvider(provider) && !isMetaWhatsAppProviderResponse(providerResponse)) return null;
    return {
      title: "Recipient unreachable on WhatsApp",
      reason:
        "The number may not be on WhatsApp, the account is inactive, or the customer blocked your business number.",
      action: "Confirm the phone number and try again.",
    };
  }

  if (isMetaReEngagement && isMetaOnlyProvider(provider)) {
    return {
      title: "24-hour reply window (Meta API only)",
      reason:
        "Meta's official API only allows free-form messages within 24 hours of the customer's last reply. This rule does not apply to WappConnect.",
      action:
        "For Meta/BSP: use an approved template message, or switch Send provider to WappConnect in Settings → WhatsApp API.",
    };
  }

  if (errCode === 131051 || raw.includes("unsupported message type")) {
    if (!isMetaOnlyProvider(provider)) return null;
    return {
      title: "Unsupported message type",
      reason: "The message format is not supported by Meta WhatsApp API.",
      action: "Try a different approved template or message format.",
    };
  }

  if (errCode === 131056 || raw.includes("pair rate")) {
    return {
      title: "Too many messages to this number",
      reason: "Too many messages were sent to this recipient in a short period.",
      action: "Wait a few minutes before retrying.",
    };
  }

  if (errCode === 131031 || raw.includes("account has been locked")) {
    if (!isMetaOnlyProvider(provider)) return null;
    return {
      title: "WhatsApp business account locked",
      reason: "Your WhatsApp Business account was temporarily locked by Meta.",
      action: "Visit Meta Business Manager to resolve the issue.",
    };
  }

  if (
    (typeof errCode === "number" && errCode >= 132000 && errCode <= 132099) ||
    (raw.includes("template") && (raw.includes("does not exist") || raw.includes("not found")))
  ) {
    if (!isMetaOnlyProvider(provider)) return null;
    return {
      title: "Meta template issue",
      reason: "The Meta-approved template was rejected, paused, or has incorrect parameters.",
      action: "Check template status in Meta Business Manager.",
    };
  }

  if (raw.includes("text body is required")) {
    return {
      title: "PDF caption missing",
      reason: "WappConnect requires caption text when sending an invoice PDF.",
      action: "Save Sales Invoice / POS Billing Message template and retry.",
    };
  }

  if (raw.includes("unauthorized") || raw.includes("401") || errCode === 401) {
    return {
      title: "API not authorized",
      reason: "The provider rejected the request (invalid or expired access token).",
      action: "Update credentials in Settings → WhatsApp API and retry.",
    };
  }

  if (errCode === 190 || raw.includes("access token") || raw.includes("expired") || raw.includes("invalid token")) {
    if (!isMetaOnlyProvider(provider)) return null;
    return {
      title: "WhatsApp API token expired or invalid",
      reason: "The Meta/BSP access token is expired or no longer valid.",
      action: "Update the access token from your provider dashboard.",
    };
  }

  if (raw.includes("not a valid whatsapp") || raw.includes("invalid phone") || raw.includes("wa_id")) {
    return {
      title: "Invalid phone number",
      reason: "The phone number format is not valid for WhatsApp.",
      action: "Use country code + 10 digits (e.g. 91xxxxxxxxxx).",
    };
  }

  return null;
}
