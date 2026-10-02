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

export function buildPushDisplay(payload: PushPayloadLike): PushDisplay {
  const data = payload.data ?? {};
  const messageId = data.message_id || undefined;
  const title = payload.notification?.title ?? data.title ?? "New update";
  const body = payload.notification?.body ?? data.body ?? "";
  const url =
    "/m/" +
    encodeURIComponent(messageId ?? "") +
    "?title=" +
    encodeURIComponent(title) +
    "&body=" +
    encodeURIComponent(body);
  return { title, body, url, messageId, tag: messageId ?? "shop-update" };
}
