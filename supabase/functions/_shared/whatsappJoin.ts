/**
 * Counter "Scan to join" QR (Ezzy ERP WhatsApp): the QR opens WhatsApp to the shop's linked
 * number with "JOIN" typed in. When the customer sends it, whatsapp-webhook saves them as a
 * customer, adds welcome points once and replies with a welcome. Customers who message first
 * are the safest people to send offers to later.
 */

export const JOIN_TEXT = "JOIN";
export const JOIN_TEMPLATE_TYPE = "join_welcome";
export const JOIN_POINTS_DESCRIPTION = "Welcome bonus (WhatsApp join)";

/** "JOIN", "join", "Join KS Fashion" → true; "joined?" / "I want to join" → false. */
export function isJoinMessage(text: string | null | undefined): boolean {
  return /^\s*join\b/i.test(String(text ?? "")) && !/^\s*joined\b/i.test(String(text ?? ""));
}

/** Link the counter QR opens: the linked number's chat with JOIN typed in. */
export function joinQrLink(linkedNumber: string | null | undefined): string {
  let d = String(linkedNumber ?? "").replace(/\D/g, "");
  if (d.length === 10) d = `91${d}`;
  if (d.length < 11) return "";
  return `https://wa.me/${d}?text=${encodeURIComponent(JOIN_TEXT)}`;
}

export function readJoinWelcomePoints(saleSettings: unknown): number {
  const n = Math.round(Number((saleSettings as Record<string, unknown> | null)?.join_welcome_points ?? 0));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 0;
}

export function joinWelcomeMessage(opts: { shopName: string; customerName?: string | null; points: number; alreadyJoined: boolean }): string {
  const name = String(opts.customerName ?? "").trim();
  const shop = opts.shopName || "our shop";
  if (opts.alreadyJoined) {
    return `Hi${name ? ` ${name}` : ""}! You are already on the ${shop} WhatsApp list. We will keep sending you our new arrivals and offers. 🙏`;
  }
  const lines = [`Welcome to ${shop}${name ? `, ${name}` : ""}! 🎉`, "", "You will now get our new arrivals and special offers on WhatsApp."];
  if (opts.points > 0) lines.push("", `🎁 ${opts.points} welcome points have been added to your account. Use them on your next bill.`);
  lines.push("", "Please save this number so you never miss an offer. Reply STOP anytime to stop offers.");
  return lines.join("\n");
}
