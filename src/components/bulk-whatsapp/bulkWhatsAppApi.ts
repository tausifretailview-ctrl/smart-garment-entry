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

/** Is this number unsubscribed from this shop's bulk messages (replied STOP or blocked from the Inbox)? */
export async function fetchPhoneOptOut(organizationId: string, phone: string): Promise<{ source: string; created_at: string } | null> {
  const { data, error } = await db
    .from("bulk_whatsapp_optouts")
    .select("source, created_at")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .maybeSingle();
  if (error) return null;
  return (data as { source: string; created_at: string } | null) ?? null;
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
const isWaitingToStart = (c: BulkCampaign) => (scheduledStart(c)?.getTime() ?? 0) > Date.now();

/**
 * One shared list for the summary cards and the report table (same key, one request). Refreshes
 * every 6 s only while something is sending, else once a minute for late delivered / read ticks;
 * React Query skips both while the tab is in the background.
 */
export function useBulkCampaigns(organizationId: string) {
  return useQuery({
    queryKey: ["bulk-whatsapp-campaigns", organizationId],
    queryFn: () => fetchCampaigns(organizationId),
    // Campaigns still waiting for their scheduled time do not need the fast refresh.
    refetchInterval: (query) =>
      (query.state.data as BulkCampaign[] | undefined)?.some((c) => isLive(c) && !isWaitingToStart(c)) ? 6000 : 60000,
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

export interface InboxChat {
  id: string;
  user_id: string;
  phone: string;
  name: string | null;
  tags: string[];
  unread_count: number;
  last_message_at: string;
  last_message_preview: string | null;
  last_direction: "in" | "out" | null;
}

export interface InboxMessage {
  id: string;
  direction: "in" | "out";
  body: string;
  media_type: string | null;
  status: "received" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  created_at: string;
}

/** Bulk messages one number got: the campaign sends shown in its Inbox chat. */
export interface PhoneCampaignSend {
  id: string;
  campaign_id: string;
  name: string | null;
  status: BulkRecipient["status"];
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

/** Postgres "relation does not exist": the Inbox SQL has not been run yet. */
const isMissingTable = (e: { code?: string; message?: string }) =>
  e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "");

export const INBOX_CHAT_LIMIT = 500;

/** Latest chats first; null when the Inbox is not set up yet. */
export async function fetchInboxChats(organizationId: string): Promise<InboxChat[] | null> {
  const { data, error } = await db
    .from("bulk_whatsapp_chats")
    .select("id, user_id, phone, name, tags, unread_count, last_message_at, last_message_preview, last_direction")
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false })
    .limit(INBOX_CHAT_LIMIT);
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return (data ?? []) as InboxChat[];
}

/** Every 8 s while the Inbox is open (new replies), once a minute elsewhere (the unread badge). */
export function useInboxChats(organizationId: string, open: boolean) {
  return useQuery({
    queryKey: ["bulk-whatsapp-inbox", organizationId],
    queryFn: () => fetchInboxChats(organizationId),
    refetchInterval: open ? 8000 : 60000,
  });
}

export async function fetchInboxMessages(chatId: string): Promise<InboxMessage[]> {
  const { data, error } = await db
    .from("bulk_whatsapp_messages")
    .select("id, direction, body, media_type, status, error, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as InboxMessage[];
}

export async function fetchPhoneCampaignSends(phone: string, campaignIds: string[]): Promise<PhoneCampaignSend[]> {
  if (!campaignIds.length) return [];
  const { data, error } = await db
    .from("bulk_whatsapp_recipients")
    .select("id, campaign_id, name, status, error, sent_at, delivered_at, read_at")
    .eq("phone", phone)
    .in("campaign_id", campaignIds)
    .limit(200);
  if (error) throw error;
  return (data ?? []) as PhoneCampaignSend[];
}

export interface BulkTemplate {
  id: string;
  user_id: string;
  name: string;
  message: string;
  media_url: string | null;
  media_type: string | null;
  media_name: string | null;
  video_quality: "small" | "medium" | "original" | null;
  created_at: string;
}

/** The shop's saved templates, newest first; null when the templates SQL has not been run yet. */
export async function fetchTemplates(organizationId: string): Promise<BulkTemplate[] | null> {
  const { data, error } = await db
    .from("bulk_whatsapp_templates")
    .select("id, user_id, name, message, media_url, media_type, media_name, video_quality, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return (data ?? []) as BulkTemplate[];
}

export function useTemplates(organizationId: string) {
  return useQuery({
    queryKey: ["bulk-whatsapp-templates", organizationId],
    queryFn: () => fetchTemplates(organizationId),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });
}

export async function saveTemplate(
  organizationId: string,
  t: Pick<BulkTemplate, "name" | "message" | "media_url" | "media_type" | "media_name" | "video_quality">,
): Promise<void> {
  const { error } = await db.from("bulk_whatsapp_templates").insert({ organization_id: organizationId, ...t });
  if (error) {
    throw new Error(
      isMissingTable(error) ? "Templates need the new SQL from the update. Ask your admin to run it." : error.message,
    );
  }
}

/** False when nothing was deleted (someone else's template, and not an admin). */
export async function deleteTemplate(id: string): Promise<boolean> {
  const { data, error } = await db.from("bulk_whatsapp_templates").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
