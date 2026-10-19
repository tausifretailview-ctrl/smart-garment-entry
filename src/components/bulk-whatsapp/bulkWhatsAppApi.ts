import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";
import type { SentHistoryRow } from "@/utils/bulkWhatsAppHistory";

export type LinkStatus = "connected" | "connecting" | "qr" | "disconnected" | "logged_out";

export interface BulkCampaign {
  id: string;
  user_id: string;
  name: string;
  sender_number: string | null;
  status: "running" | "paused" | "stopped" | "completed" | "failed";
  status_note: string | null;
  total_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface BulkRecipient {
  id: string;
  position: number;
  phone: string;
  name: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed" | "skipped";
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

/** Tables are not in the generated types yet. */
export const db = supabase as unknown as SupabaseClient;

export async function callBulkWhatsApp<T = Record<string, unknown>>(
  organizationId: string,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("bulk-whatsapp", {
    body: { action, organizationId, ...extra },
  });
  if (error) throw new Error(await getEdgeFunctionErrorMessage(error, data, "Bulk WhatsApp request failed"));
  return (data ?? {}) as T;
}

/** Customers of this shop who replied STOP to a bulk message. */
export async function fetchOptOutCount(organizationId: string): Promise<number> {
  const { count, error } = await db
    .from("bulk_whatsapp_optouts")
    .select("phone", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  // Before the unsubscribe SQL is run the table does not exist: show nothing rather than an error.
  if (error) return 0;
  return count ?? 0;
}

export const CAMPAIGN_LIST_LIMIT = 100;

/** Counts only (no message text), so the live refresh stays small. */
export async function fetchCampaigns(organizationId: string): Promise<BulkCampaign[]> {
  const { data, error } = await db
    .from("bulk_whatsapp_campaigns")
    .select(
      "id, user_id, name, sender_number, status, status_note, total_count, sent_count, delivered_count, read_count, failed_count, created_at, completed_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(CAMPAIGN_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []) as BulkCampaign[];
}

const isLive = (c: BulkCampaign) => c.status === "running" || c.status === "paused";

/**
 * One shared list for the summary cards and the report table (same key, one request). Refreshes
 * every 6 s only while something is sending, else once a minute for late delivered / read ticks;
 * React Query skips both while the tab is in the background.
 */
export function useBulkCampaigns(organizationId: string) {
  return useQuery({
    queryKey: ["bulk-whatsapp-campaigns", organizationId],
    queryFn: () => fetchCampaigns(organizationId),
    refetchInterval: (query) =>
      (query.state.data as BulkCampaign[] | undefined)?.some(isLive) ? 6000 : 60000,
  });
}

export interface BulkCampaignMessage {
  message: string;
  media_url: string | null;
  media_type: string | null;
  media_name: string | null;
}

export async function fetchCampaignMessage(campaignId: string): Promise<BulkCampaignMessage | null> {
  const { data, error } = await db
    .from("bulk_whatsapp_campaigns")
    .select("message, media_url, media_type, media_name")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw error;
  return data as BulkCampaignMessage | null;
}

/** Scheduled campaigns carry "Starts at <ISO>" as their note until the WhatsApp server starts them. */
const SCHEDULE_NOTE_PREFIX = "Starts at ";

export function scheduledStart(c: Pick<BulkCampaign, "status" | "status_note">): Date | null {
  if (c.status !== "running" && c.status !== "paused") return null;
  if (!c.status_note?.startsWith(SCHEDULE_NOTE_PREFIX)) return null;
  const at = new Date(c.status_note.slice(SCHEDULE_NOTE_PREFIX.length));
  return Number.isNaN(at.getTime()) ? null : at;
}

export async function fetchRecipients(campaignId: string): Promise<BulkRecipient[]> {
  const out: BulkRecipient[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("bulk_whatsapp_recipients")
      .select("id, position, phone, name, status, error, sent_at, delivered_at, read_at")
      .eq("campaign_id", campaignId)
      .order("position", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as BulkRecipient[]));
    if (!data || data.length < 1000) return out;
  }
}

/**
 * Every number of these campaigns that got (or is still getting) the message, for the Customer
 * Master picker's "Not sent yet" filter. Failed and skipped numbers are left out.
 */
export async function fetchSentHistory(campaignIds: string[]): Promise<SentHistoryRow[]> {
  const out: SentHistoryRow[] = [];
  for (let i = 0; i < campaignIds.length; i += 50) {
    const ids = campaignIds.slice(i, i + 50);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("bulk_whatsapp_recipients")
        .select("phone, campaign_id, status, sent_at")
        .in("campaign_id", ids)
        .in("status", ["pending", "sent", "delivered", "read"])
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      out.push(...((data ?? []) as SentHistoryRow[]));
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}
