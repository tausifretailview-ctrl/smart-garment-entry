/**
 * Which customers already got a bulk message, so the Customer Master picker can offer only new ones.
 * A number counts as sent when WhatsApp took it (sent, delivered or read), or while it is still
 * queued in a running or paused campaign. Failed and skipped numbers count as not sent yet.
 */
export interface SentHistoryRow {
  phone: string;
  campaign_id: string;
  status: string;
  sent_at: string | null;
}

export interface SentHistoryCampaign {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface LastSend {
  campaignName: string;
  /** When it was sent, or when the campaign was made for a number still waiting. */
  at: string;
  /** Still waiting in a running or paused campaign. */
  queued: boolean;
  /** How many campaigns reached this number. */
  times: number;
}

const DONE = new Set(["sent", "delivered", "read"]);
const LIVE = new Set(["running", "paused"]);

export function lastSendByPhone(rows: SentHistoryRow[], campaigns: SentHistoryCampaign[]): Map<string, LastSend> {
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const out = new Map<string, LastSend>();
  for (const r of rows) {
    const c = byId.get(r.campaign_id);
    if (!c) continue;
    const queued = r.status === "pending" && LIVE.has(c.status);
    if (!DONE.has(r.status) && !queued) continue;
    const at = r.sent_at ?? c.created_at;
    const prev = out.get(r.phone);
    if (!prev) {
      out.set(r.phone, { campaignName: c.name, at, queued, times: 1 });
    } else {
      prev.times += 1;
      if (at > prev.at) Object.assign(prev, { campaignName: c.name, at, queued });
    }
  }
  return out;
}
