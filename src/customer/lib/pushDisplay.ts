/**
 * What a customer push shows, from an FCM payload. Shared by the service worker
 * (app closed / in background) and the page (app open), so both look the same.
 * Works for data-only messages and older ones with a `notification` block.
 */
export interface PushPayloadLike {
  data?: Record<string, string> | undefined;
  notification?: { title?: string; body?: string } | undefined;
}

export interface PushDisplay {
  title: string;
  body: string;
  url: string;
  messageId: string | undefined;
  tag: string;
}

/** A bill page link (/t/<token>) on this same site, else null. */
function sameSiteBillLink(url: string | undefined, origin: string | undefined): string | null {
  if (!url || !origin) return null;
  try {
    const u = new URL(url, origin);
    return u.origin === new URL(origin).origin && /^\/t\/[A-Za-z0-9_-]+$/.test(u.pathname) ? u.href : null;
  } catch {
    return null;
  }
}

export function buildPushDisplay(payload: PushPayloadLike, origin?: string): PushDisplay {
  const data = payload.data ?? {};
  const messageId = data.message_id || undefined;
  const title = payload.notification?.title ?? data.title ?? "New update";
  const body = payload.notification?.body ?? data.body ?? "";
  // Tap opens the bill page when the push carries its link (same shop site, /t/<token>).
  const billLink = sameSiteBillLink(data.url, origin);
  const url =
    billLink ??
    "/m/" +
    encodeURIComponent(messageId ?? "") +
    "?title=" +
    encodeURIComponent(title) +
    "&body=" +
    encodeURIComponent(body);
  return { title, body, url, messageId, tag: messageId ?? "shop-update" };
}
