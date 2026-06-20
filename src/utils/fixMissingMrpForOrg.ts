import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Set-based MRP backfill for one org (single UPDATE via fix_missing_mrp_for_org RPC).
 */
export async function fixMissingMrpForOrgViaRpc(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ updatedCount: number; error: Error | null }> {
  if (!organizationId) {
    return { updatedCount: 0, error: new Error("organization_id is required") };
  }

  const { data, error } = await supabase.rpc("fix_missing_mrp_for_org", {
    p_org_id: organizationId,
  });

  if (error) {
    return { updatedCount: 0, error: new Error(error.message) };
  }

  return { updatedCount: Number(data ?? 0), error: null };
}
