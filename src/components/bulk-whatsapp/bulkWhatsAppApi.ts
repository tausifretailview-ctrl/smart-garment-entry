import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorMessage } from "@/utils/edgeFunctionError";

export type LinkStatus = "connected" | "connecting" | "qr" | "disconnected" | "logged_out";

export interface BulkCampaign {
  id: string;
  user_id: string;
  name: string;
  message: string;
  media_url: string | null;
  media_type: string | null;
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

export async function fetchCampaigns(organizationId: string): Promise<BulkCampaign[]> {
  const { data, error } = await db
    .from("bulk_whatsapp_campaigns")
    .select(
      "id, user_id, name, message, media_url, media_type, sender_number, status, status_note, total_count, sent_count, delivered_count, read_count, failed_count, created_at, completed_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as BulkCampaign[];
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
