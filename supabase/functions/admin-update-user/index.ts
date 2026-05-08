// Platform admin: update an existing auth user's email and/or password.
// Caller must have role 'platform_admin' in user_roles.
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
    const newEmail = body.new_email ? String(body.new_email).trim().toLowerCase() : "";
    const newPassword = body.new_password ? String(body.new_password) : "";

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "target_user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!newEmail && !newPassword) {
      return new Response(JSON.stringify({ error: "Provide new_email or new_password" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (newPassword && (newPassword.length < 6 || newPassword.length > 128)) {
      return new Response(JSON.stringify({ error: "Password must be 6-128 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Caller must be platform_admin
    const { data: platformRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle();

    if (!platformRole) {
      return new Response(JSON.stringify({ error: "Only platform admins can edit users" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (newEmail) {
      updates.email = newEmail;
      updates.email_confirm = true;
    }
    if (newPassword) updates.password = newPassword;

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUserId,
      updates,
    );

    if (updateError) {
      console.error("updateUserById failed:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      await adminClient.from("audit_logs").insert({
        action: "PLATFORM_USER_UPDATED",
        entity_type: "user",
        entity_id: targetUserId,
        user_id: caller.id,
        user_email: caller.email,
        metadata: {
          email_changed: !!newEmail,
          password_changed: !!newPassword,
          new_email: newEmail || null,
        },
      });
    } catch (e) {
      console.warn("audit_logs insert failed (non-fatal):", e);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-update-user error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});