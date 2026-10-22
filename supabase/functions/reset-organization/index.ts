import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// All deletes run inside the reset_organization_data SQL function, in one transaction
// scoped to one organization_id (see migration 20270216120000). It either deletes
// everything for the mode or nothing.
const RESET_MODES = ["all", "keep_masters"] as const;

// Storage buckets whose files are kept under "<organization_id>/..." and belong to
// rows the reset deletes (product photos, purchase bill photos).
const ORG_STORAGE_BUCKETS = ["product-images", "supplier-bill-images"];

async function removeOrgFolder(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  organizationId: string,
): Promise<number> {
  const prefix = `${organizationId}/`;
  const files: string[] = [];
  const folders = [organizationId];
  while (folders.length > 0) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await adminClient.storage.from(bucket).list(folder, { limit: 1000, offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const entry of data) {
        const path = `${folder}/${entry.name}`;
        if (!path.startsWith(prefix)) continue;
        if (entry.id) files.push(path);
        else folders.push(path);
      }
      if (data.length < 1000) break;
    }
  }
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await adminClient.storage.from(bucket).remove(files.slice(i, i + 100));
    if (error) throw error;
  }
  return files.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { organizationId, confirmationName, mode, zeroOpeningBalances } = await req.json();
    const resetMode = mode ?? "all";

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!confirmationName || typeof confirmationName !== "string") {
      return new Response(
        JSON.stringify({ error: "Confirmation name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RESET_MODES.includes(resetMode)) {
      return new Response(
        JSON.stringify({ error: "Unknown reset mode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify admin role
    const { data: membership } = await userClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || membership.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only administrators can reset organization data" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: orgRow, error: orgError } = await adminClient
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    if (orgError || !orgRow?.name) {
      return new Response(
        JSON.stringify({ error: "Organization not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (confirmationName.trim().toLowerCase() !== orgRow.name.trim().toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Confirmation name does not match organization name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: result, error: resetError } = await adminClient.rpc("reset_organization_data", {
      p_organization_id: organizationId,
      p_performed_by: user.id,
      p_confirmation_name: confirmationName.trim(),
      p_mode: resetMode,
      p_zero_opening_balances: resetMode === "keep_masters" && zeroOpeningBalances === true,
    });

    if (resetError) {
      console.error("Reset organization failed, nothing deleted:", resetError.message);
      await adminClient.from("organization_reset_audit").insert({
        organization_id: organizationId,
        performed_by: user.id,
        confirmation_name: confirmationName.trim(),
        tables_cleared: null,
        errors: [resetError.message],
      });
      return new Response(
        JSON.stringify({ success: false, error: resetError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Database reset is committed; photo files are best-effort cleanup.
    const errors: string[] = [];
    const deletedCounts: Record<string, number> = { ...(result?.deletedCounts ?? {}) };
    for (const bucket of ORG_STORAGE_BUCKETS) {
      try {
        deletedCounts[`storage:${bucket}`] = await removeOrgFolder(adminClient, bucket, organizationId);
      } catch (err: any) {
        errors.push(`storage ${bucket}: ${err?.message ?? err}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: resetMode,
        deletedCounts,
        errors: errors.length > 0 ? errors : undefined,
        barcodeResetTo: result?.barcodeResetTo,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Reset organization error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
