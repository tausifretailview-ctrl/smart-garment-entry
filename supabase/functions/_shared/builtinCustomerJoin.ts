import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gatewayRequest } from "./builtinGatewaySend.ts";

/** Walk-in / placeholder names are not saved as the contact's name (the number is used instead). */
const PLACEHOLDER_NAME = /^(walk[\s-]*in|cash|counter|customer|guest|valued customer)\b/i;

/**
 * Ezzy ERP WhatsApp, after a bill reached the customer: save the number as a contact on the shop's
 * linked WhatsApp (Settings > WhatsApp, off by default). Each number is tried once
 * (whatsapp_group_joins). Customers are no longer added to the shop's group directly: adding people who
 * never asked got shop numbers banned, so the bill message carries the group's join link instead
 * (groupInviteLine). Never throws: the bill was already sent.
 */
export async function joinBillCustomer(
  supabase: SupabaseClient,
  organizationId: string,
  settings: Record<string, unknown> | null,
  phone: string,
  customerName: string,
): Promise<void> {
  try {
    const saveContact = settings?.builtin_save_contacts === true;
    if (!saveContact) return;

    const name = customerName.trim();
    // Claim the number first: the unique key stops a second bill a moment later from saving it twice.
    const { data: claimed, error: claimError } = await supabase
      .from("whatsapp_group_joins")
      .insert({
        organization_id: organizationId,
        phone,
        group_id: "",
        customer_name: name || null,
        group_status: "skipped",
      })
      .select("id")
      .maybeSingle();
    // 23505 = already tried for this number: nothing to do.
    if (claimError || !claimed) {
      if (claimError?.code === "23505") return;
      // Table missing (SQL not run yet) or another error: skip quietly, the bill was sent.
      if (claimError) console.warn("[group-join] claim failed:", claimError.message);
      return;
    }

    const result = await gatewayRequest(`/sessions/${encodeURIComponent(organizationId)}/join-customer`, {
      method: "POST",
      body: {
        phone,
        name: name && !PLACEHOLDER_NAME.test(name) ? name : undefined,
        saveContact,
      },
    });
    const data = result.data as { contact?: string; group?: string; detail?: string; error?: string };
    const ok = result.ok && (data as { success?: boolean }).success !== false;
    const groupStatus = String(data.group ?? "skipped");

    // Daily cap / just linked / server not reachable: forget the claim so the next bill tries again.
    if (!ok || data.contact === "limit") {
      if (!ok) console.warn("[group-join] gateway:", data.error ?? result.status);
      await supabase.from("whatsapp_group_joins").delete().eq("id", claimed.id);
      return;
    }
    await supabase
      .from("whatsapp_group_joins")
      .update({
        contact_status: data.contact ?? null,
        group_status: groupStatus,
        detail: data.detail?.slice(0, 500) ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimed.id);
  } catch (e) {
    console.warn("[group-join] failed:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * "Join our WhatsApp group" line with the group's join link for a bill message, when the shop picked a
 * group in Settings > WhatsApp and kept the link switch on (builtin_group_invite_fallback). Empty when
 * there is no group or the link could not be had within 4 s (the bill goes out without it).
 */
export async function groupInviteLine(
  organizationId: string,
  settings: Record<string, unknown> | null,
): Promise<string> {
  const groupId = String(settings?.builtin_group_id ?? "").trim();
  if (!groupId || settings?.builtin_group_invite_fallback === false) return "";
  try {
    const result = await Promise.race([
      gatewayRequest(
        `/sessions/${encodeURIComponent(organizationId)}/group-invite?groupId=${encodeURIComponent(groupId)}`,
      ),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    const link = result?.ok ? String(result.data.link ?? "") : "";
    if (!/^https:\/\/chat\.whatsapp\.com\/\S+$/.test(link)) {
      if (result && !result.ok) console.warn("[group-invite]", result.data.error ?? result.status);
      return "";
    }
    const name = String(result?.data.name ?? settings?.builtin_group_name ?? "").trim();
    return `Join our WhatsApp group${name ? ` "${name}"` : ""} for offers and new arrivals:\n${link}`;
  } catch (e) {
    console.warn("[group-invite] failed:", e instanceof Error ? e.message : String(e));
    return "";
  }
}

/** Runs after the response is sent (Supabase EdgeRuntime), so the bill send is never slowed down. */
export function runInBackground(task: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task;
}
