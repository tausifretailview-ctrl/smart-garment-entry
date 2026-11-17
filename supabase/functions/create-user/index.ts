import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0"
import { POS_USER_PERMISSIONS_PRESET } from "../_shared/posUserPermissionsPreset.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Verify caller is platform_admin
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) throw new Error("Unauthorized")

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    )
    if (!caller) throw new Error("Unauthorized")

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
    if (!roles?.length) throw new Error("Not a platform admin")

    const body = await req.json()
    const { password, orgId, role, applyPosPreset } = body
    // Auth stores e-mails in lower case; the org-assign lookup must use the same form
    // ("Lagnee@gmail.com" typed by the admin used to find no user and leave the login shop-less).
    const email = String(body.email ?? "").trim().toLowerCase()

    if (!email || !password || !orgId || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Create user server-side (does NOT affect caller's session)
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr) throw createErr

    const userId = newUser.user?.id
    if (!userId) throw new Error("User created but id missing from auth response")

    // Assign to org (POS UI role is stored as "user")
    // p_caller_id is required here: this call goes through the SERVICE_ROLE
    // client above, so there's no request JWT and auth.uid() inside the RPC
    // would be NULL. Pass the already-JWT-verified caller explicitly so the
    // RPC's own platform_admin check runs against the real caller instead
    // of unconditionally failing.
    const effectiveRole = role === "pos" ? "user" : role
    const { error: assignErr } = await supabaseAdmin.rpc("platform_assign_user_to_org", {
      p_user_email: email,
      p_org_id: orgId,
      p_role: effectiveRole,
      p_caller_id: caller.id,
    })
    if (assignErr) {
      // Never leave a login that belongs to no shop: it signs in to "Workspace could not be
      // prepared" and blocks creating it again ("already registered").
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
      throw new Error(`Could not add the user to the organization: ${assignErr.message}`)
    }

    let posPermissionsApplied = false
    if (applyPosPreset === true || role === "pos") {
      const { error: permErr } = await supabaseAdmin
        .from("user_permissions")
        .upsert(
          {
            user_id: userId,
            organization_id: orgId,
            permissions: POS_USER_PERMISSIONS_PRESET,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,user_id" },
        )
      if (permErr) throw new Error(`POS permissions failed: ${permErr.message}`)
      posPermissionsApplied = true
    }

    return new Response(
      JSON.stringify({
        user: newUser.user,
        posPermissionsApplied,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
