/** Support token alert posted to Ezzy's Technical Support WhatsApp group (support-tokens edge function). */

export const SUPPORT_CATEGORIES = {
  doubt: "Doubt / How to",
  technical: "Technical issue",
  billing: "Billing / Plan",
  other: "Other",
} as const;

export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;

export const isSupportCategory = (v: unknown): v is SupportCategory =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(SUPPORT_CATEGORIES, v);

/** Digits for wa.me: 10-digit numbers get India's 91, a leading trunk 0 is dropped; null when not a phone. */
export function supportPhoneDigits(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export interface SupportTokenAlert {
  tokenNo: number | string;
  shopName: string;
  userName: string;
  userEmail?: string | null;
  phone: string;
  category: SupportCategory;
  message: string;
  pagePath?: string | null;
  createdAt: Date;
}

/** "21 Oct 2026, 9:05 pm" in India time. */
export function formatSupportTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function buildSupportTokenMessage(t: SupportTokenAlert): string {
  const digits = supportPhoneDigits(t.phone);
  const user = t.userEmail && t.userEmail !== t.userName ? `${t.userName} (${t.userEmail})` : t.userName;
  const lines = [
    `🎫 *New Support Token #${t.tokenNo}*`,
    "",
    `🏪 *Shop:* ${t.shopName}`,
    `👤 *User:* ${user}`,
    `📞 *Phone:* ${digits ? `+${digits}` : t.phone}`,
    `📂 *Type:* ${SUPPORT_CATEGORIES[t.category]}`,
    `🕒 *Time:* ${formatSupportTime(t.createdAt)}`,
  ];
  if (t.pagePath) lines.push(`📍 *Screen:* ${t.pagePath}`);
  lines.push("", "📝 *Issue:*", t.message.trim());
  if (digits) lines.push("", `💬 Chat with customer: https://wa.me/${digits}`);
  return lines.join("\n");
}
