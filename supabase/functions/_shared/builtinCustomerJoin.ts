import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gatewayRequest } from "./builtinGatewaySend.ts";

/** Walk-in / placeholder names are not saved as the contact's name (the number is used instead). */
const PLACEHOLDER_NAME = /^(walk[\s-]*in|cash|counter|customer|guest|valued customer)\b/i;

/**
 * Ezzy ERP WhatsApp, after a bill reached the customer: save the number as a contact on the shop's
 * linked WhatsApp and/or add it to the shop's chosen group (Settings > WhatsApp, off by default).
 * Each number is tried once per group (whatsapp_group_joins), so repeat bills never re-add a customer
 * who left. Never throws: the bill was already sent.
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
    const groupId = String(settings?.builtin_group_id ?? "").trim();
    if (!saveContact && !groupId) return;

    const name = customerName.trim();
    // Claim the number first: the unique key stops a second bill a moment later from adding it twice.
    let { data: claimed, error: claimError } = await supabase
      .from("whatsapp_group_joins")
      .insert({
        organization_id: organizationId,
        phone,
        group_id: groupId,
        customer_name: name || null,
        group_status: groupId ? "pending" : "skipped",
      })
      .select("id")
      .maybeSingle();
    // 23505 = already tried for this group. A claim stuck on pending (the function was stopped while the
    // add waited its turn) is taken over after 10 minutes.
    if (claimError?.code === "23505") {
      const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      ({ data: claimed, error: claimError } = await supabase
        .from("whatsapp_group_joins")
        .update({ created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("phone", phone)
        .eq("group_id", groupId)
        .eq("group_status", "pending")
        .lt("created_at", stale)
        .select("id")
        .maybeSingle());
    }
    if (claimError || !claimed) {
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
        groupId: groupId || undefined,
        inviteFallback: settings?.builtin_group_invite_fallback !== false,
      },
    });
    const data = result.data as { contact?: string; group?: string; detail?: string; error?: string };
    const ok = result.ok && (data as { success?: boolean }).success !== false;
    const groupStatus = String(data.group ?? "skipped");

    // Busy queue / daily cap / server not reachable: forget the claim so the next bill tries again.
    if (!ok || groupStatus === "limit") {
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

/** Runs after the response is sent (Supabase EdgeRuntime), so the bill send is never slowed down. */
export function runInBackground(task: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task;
}
