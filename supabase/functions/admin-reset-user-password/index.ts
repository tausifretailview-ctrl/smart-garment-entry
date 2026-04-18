// Admin reset of an org member's password.
// Caller must be admin of the same organization as the target user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate caller via anon client + bearer token
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerError,
    } = await anonClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.target_user_id || "").trim();
    const newPassword = String(body.new_password || "");
    const organizationId = String(body.organization_id || "").trim();

    if (!targetUserId || !organizationId) {
      return new Response(
        JSON.stringify({ error: "target_user_id and organization_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      return new Response(
        JSON.stringify({ error: "Password must be 6-128 characters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify caller is admin of the org (or platform_admin)
    const { data: callerMembership } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("user_id", caller.id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    const { data: platformRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle();

    const isOrgAdmin = callerMembership?.role === "admin";
    const isPlatformAdmin = !!platformRole;

    if (!isOrgAdmin && !isPlatformAdmin) {
      return new Response(
        JSON.stringify({ error: "Only org admins can reset passwords" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify target belongs to the same org
    const { data: targetMembership } = await adminClient
      .from("organization_members")
      .select("user_id")
      .eq("user_id", targetUserId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!targetMembership) {
      return new Response(
        JSON.stringify({ error: "Target user is not a member of this organization" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update password via admin API
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword },
    );

    if (updateError) {
      console.error("updateUserById failed:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Audit log (best effort)
    try {
      await adminClient.from("audit_logs").insert({
        action: "USER_PASSWORD_RESET",
        entity_type: "user",
        entity_id: targetUserId,
        organization_id: organizationId,
        user_id: caller.id,
        user_email: caller.email,
        metadata: { reset_by: caller.email },
      });
    } catch (e) {
      console.warn("audit_logs insert failed (non-fatal):", e);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-reset-user-password error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
