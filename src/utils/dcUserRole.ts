import type { SupabaseClient } from "@supabase/supabase-js";
import { DC_ONLY_RIGHT } from "@/lib/dcVisibility";
import { DC_USER_PERMISSIONS_PRESET, isDcUserPermissions } from "@/constants/dcUserPermissionsPreset";
import { isMissingDcOnlySql } from "@/utils/dcBill";

type Client = SupabaseClient;

/** False until the DC User SQL (25 Oct 2026) is run; the DC User role stays off until then. */
export async function fetchDcOnlyModeReady(client: Client): Promise<boolean> {
  const { error } = await (client.rpc as unknown as (fn: string) => Promise<{ error: unknown }>)(
    "dc_only_mode_ready",
  );
  if (!error) return true;
  if (isMissingDcOnlySql(error)) return false;
  throw error;
}

/** Replaces the member's User Rights with the DC User set. */
export async function applyDcUserPreset(client: Client, organizationId: string, userId: string) {
  const { error } = await client.from("user_permissions").upsert(
    {
      organization_id: organizationId,
      user_id: userId,
      permissions: DC_USER_PERMISSIONS_PRESET,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id" },
  );
  if (error) throw error;
}

/** Turns "DC User (only DC)" off and keeps the member's other rights. */
export async function clearDcUserFlag(client: Client, organizationId: string, userId: string) {
  const { data, error } = await client
    .from("user_permissions")
    .select("permissions")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const permissions = (data?.permissions ?? null) as Record<string, unknown> | null;
  if (!isDcUserPermissions(permissions)) return;
  const special = { ...((permissions?.special as Record<string, boolean>) ?? {}), [DC_ONLY_RIGHT]: false };
  const { error: saveError } = await client
    .from("user_permissions")
    .update({ permissions: { ...permissions, special }, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (saveError) throw saveError;
}

/** User ids of this org's DC Users (an array: query results are saved to the browser cache, a Set is not). */
export async function fetchDcUserIds(client: Client, organizationId: string): Promise<string[]> {
  const { data, error } = await client
    .from("user_permissions")
    .select("user_id, permissions")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return ((data ?? []) as { user_id: string; permissions: unknown }[])
    .filter((row) => isDcUserPermissions(row.permissions))
    .map((row) => row.user_id);
}
