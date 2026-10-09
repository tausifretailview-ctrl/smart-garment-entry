/**
 * What a customer push shows, from an FCM payload. Shared by the service worker
 * (app closed / in background) and the page (app open), so both look the same.
 * Works for data-only messages and older ones with a `notification` block.
 *
 * Rich parts (Android Chrome / installed app): shop logo as the icon, the offer photo as a
 * large picture, and up to two buttons. iPhone shows title, text and icon only.
 */
export interface PushPayloadLike {
  data?: Record<string, string> | undefined;
  notification?: { title?: string; body?: string; image?: string } | undefined;
}

export type PushKind = "invoice" | "offer" | "message";

export interface PushAction {
  action: "open" | "wa" | "offers" | "bills";
  title: string;
}

export interface PushDisplay {
  title: string;
  body: string;
  url: string;
  messageId: string | undefined;
  tag: string;
  kind: PushKind;
  /** Shop logo (https) or the app icon. */
  icon: string;
  /** Large picture under the text (https), offers only. */
  image: string | undefined;
  /** wa.me link to the shop, when the shop has a mobile number. */
  whatsappUrl: string | undefined;
  actions: PushAction[];
}

export const APP_ICON = "/icon-192.png";
export const APP_BADGE = "/badge-96.png";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function httpsUrl(raw: string | undefined): string | undefined {
  const v = (raw ?? "").trim();
  if (!/^https:\/\//i.test(v) || v.length > 1000) return undefined;
  try {
    return new URL(v).href;
  } catch {
    return undefined;
  }
}

export function buildPushDisplay(payload: PushPayloadLike, origin?: string): PushDisplay {
  const data = payload.data ?? {};
  const messageId = data.message_id || undefined;
  const title = payload.notification?.title ?? data.title ?? "New update";
  const rawBody = payload.notification?.body ?? data.body ?? "";
  const saleId = UUID.test(data.sale_id ?? "") ? data.sale_id : "";
  const campaignId = UUID.test(data.campaign_id ?? "") ? data.campaign_id : "";
  const kind: PushKind = saleId ? "invoice" : campaignId ? "offer" : "message";
  const code = (data.code ?? "").trim().slice(0, 40);
  const body = code && !rawBody.includes(code) ? `${rawBody}\n🏷️ Code: ${code}` : rawBody;
  const wa = (data.wa ?? "").replace(/\D/g, "");
  const whatsappUrl = wa.length >= 10 && wa.length <= 15 ? `https://wa.me/${wa}` : undefined;

  // Tap opens the bill page when the push carries its link (same shop site, /t/<token>).
  const billLink = sameSiteBillLink(data.url, origin);
  // No bill link: the message page still opens the full bill from sale_id for a logged-in
  // customer (or asks for the mobile number), and shows the offer from campaign_id.
  const extra = (saleId ? "&sale=" + saleId : "") + (campaignId ? "&campaign=" + campaignId : "");
  const url =
    billLink ??
    "/m/" +
      encodeURIComponent(messageId ?? "") +
      "?title=" +
      encodeURIComponent(title) +
      "&body=" +
      encodeURIComponent(rawBody) +
      extra;

  const actions: PushAction[] =
    kind === "invoice"
      ? [
          { action: "open", title: "🧾 View bill" },
          whatsappUrl ? { action: "wa", title: "💬 WhatsApp shop" } : { action: "bills", title: "All my bills" },
        ]
      : kind === "offer"
        ? [
            { action: "open", title: "🛍️ View offer" },
            whatsappUrl ? { action: "wa", title: "💬 WhatsApp shop" } : { action: "offers", title: "All offers" },
          ]
        : [];

  return {
    title,
    body,
    url,
    messageId,
    tag: messageId ?? "shop-update",
    kind,
    icon: httpsUrl(data.icon) ?? APP_ICON,
    image: kind === "offer" ? httpsUrl(data.image ?? payload.notification?.image) : undefined,
    whatsappUrl,
    actions,
  };
}

/** Where a tap on the notification (or one of its buttons) goes. */
export function clickTarget(d: Pick<PushDisplay, "url" | "whatsappUrl">, action: string | undefined): string {
  if (action === "wa" && d.whatsappUrl) return d.whatsappUrl;
  if (action === "offers") return "/offers";
  if (action === "bills") return "/bills";
  return d.url;
}

/**
 * Options for registration.showNotification. Typed loosely on purpose: `image`, `actions`,
 * `vibrate`, `renotify` and `timestamp` work in Chrome but are missing from TypeScript's DOM types.
 */
export function notificationOptions(d: PushDisplay): NotificationOptions & Record<string, unknown> {
  return {
    body: d.body,
    icon: d.icon,
    badge: APP_BADGE,
    ...(d.image ? { image: d.image } : {}),
    actions: d.actions,
    data: { url: d.url, messageId: d.messageId, whatsappUrl: d.whatsappUrl },
    tag: d.tag,
    renotify: true,
    vibrate: d.kind === "offer" ? [120, 60, 120, 60, 240] : [200, 100, 200],
    timestamp: Date.now(),
  };
}
