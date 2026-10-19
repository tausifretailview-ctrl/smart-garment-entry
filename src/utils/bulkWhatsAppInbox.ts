/**
 * Bulk WhatsApp Inbox helpers: chat filters, tag colours, and one timeline per chat that mixes the
 * campaign messages the customer got with their replies and the shop's answers.
 */

/** Offered on every chat; shops can add their own. */
export const INBOX_PRESET_TAGS = ["Interested", "Follow up", "Ordered", "Not interested"] as const;

const TAG_TONES: Record<string, string> = {
  interested: "bg-emerald-100 text-emerald-800",
  "follow up": "bg-amber-100 text-amber-800",
  ordered: "bg-sky-100 text-sky-800",
  "not interested": "bg-slate-200 text-slate-700",
};

export function inboxTagTone(tag: string): string {
  return TAG_TONES[tag.trim().toLowerCase()] ?? "bg-violet-100 text-violet-800";
}

export interface FilterableChat {
  phone: string;
  name: string | null;
  tags: string[];
  unread_count: number;
  last_message_preview: string | null;
}

/** "all", "unread", or a tag name. */
export function filterInboxChats<T extends FilterableChat>(chats: T[], filter: string, search: string): T[] {
  const s = search.trim().toLowerCase();
  const digits = s.replace(/\D/g, "");
  return chats.filter(
    (c) =>
      (filter === "all" ||
        (filter === "unread" ? c.unread_count > 0 : c.tags.some((t) => t.toLowerCase() === filter.toLowerCase()))) &&
      (!s ||
        (c.name ?? "").toLowerCase().includes(s) ||
        (digits.length >= 3 && c.phone.includes(digits)) ||
        (c.last_message_preview ?? "").toLowerCase().includes(s)),
  );
}

/** Tags in use on any chat plus the presets, presets first. */
export function inboxTagList(chats: { tags: string[] }[]): string[] {
  const seen = new Map<string, string>();
  for (const t of INBOX_PRESET_TAGS) seen.set(t.toLowerCase(), t);
  for (const c of chats) for (const t of c.tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()];
}

export type TickStatus = "sent" | "delivered" | "read" | "failed" | "pending";

export type TimelineItem =
  | {
      kind: "campaign";
      key: string;
      at: string;
      campaignName: string;
      text: string;
      mediaUrl: string | null;
      mediaType: string | null;
      status: TickStatus;
      error: string | null;
    }
  | {
      kind: "message";
      key: string;
      at: string;
      direction: "in" | "out";
      text: string;
      mediaType: string | null;
      status: TickStatus | "received";
      error: string | null;
    };

export interface TimelineCampaign {
  name: string;
  message: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
}

/** {name} → the customer's name, or "Customer" (same rule as the WhatsApp server). */
const fillName = (message: string, name: string | null) => message.replace(/\{\s*name\s*\}/gi, name?.trim() || "Customer");

export function buildChatTimeline(
  messages: { id: string; direction: "in" | "out"; body: string; media_type: string | null; status: string; error: string | null; created_at: string }[],
  sends: { id: string; campaign_id: string; name: string | null; status: string; error: string | null; sent_at: string | null }[],
  campaigns: Map<string, TimelineCampaign>,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of sends) {
    if (r.status === "skipped") continue;
    const c = campaigns.get(r.campaign_id);
    if (!c) continue;
    items.push({
      kind: "campaign",
      key: `c-${r.id}`,
      at: r.sent_at ?? c.created_at,
      campaignName: c.name,
      text: fillName(c.message ?? "", r.name),
      mediaUrl: c.media_url,
      mediaType: c.media_type,
      status: (["sent", "delivered", "read", "failed"].includes(r.status) ? r.status : "pending") as TickStatus,
      error: r.error,
    });
  }
  for (const m of messages) {
    items.push({
      kind: "message",
      key: `m-${m.id}`,
      at: m.created_at,
      direction: m.direction,
      text: m.body,
      mediaType: m.media_type,
      status: m.status as TickStatus | "received",
      error: m.error,
    });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}
