/**
 * Platform admin: apply Saleem-style POS-only permissions to an org member.
 * Uses service role so it works even when the caller is not an org admin (RLS).
 */
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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    )
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Not a platform admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const body = await req.json().catch(() => ({}))
    const userId = String(body.userId || body.user_id || "").trim()
    const organizationId = String(body.organizationId || body.organization_id || "").trim()
    const email = String(body.email || "").trim().toLowerCase()

    let targetUserId = userId
    let targetOrgId = organizationId

    if (!targetUserId && email) {
      let page = 1
      const perPage = 1000
      while (!targetUserId && page <= 20) {
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
        if (error) throw error
        const match = users.find((u) => u.email?.toLowerCase() === email)
        if (match) targetUserId = match.id
        if (users.length < perPage) break
        page++
      }
    }

    if (!targetOrgId && email) {
      // Prefer DUA BY SALEEM'S when repairing common case; else first membership
      const { data: orgs } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug")
        .or("name.ilike.%DUA BY SALEEM%,slug.ilike.%dua-by-saleem%")
        .limit(1)
      if (orgs?.[0]?.id) targetOrgId = orgs[0].id
    }

    if (!targetUserId || !targetOrgId) {
      return new Response(
        JSON.stringify({ error: "userId (or email) and organizationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Ensure org membership is "user" (not admin)
    await supabaseAdmin
      .from("organization_members")
      .update({ role: "user" })
      .eq("user_id", targetUserId)
      .eq("organization_id", targetOrgId)

    const { error: permErr } = await supabaseAdmin
      .from("user_permissions")
      .upsert(
        {
          user_id: targetUserId,
          organization_id: targetOrgId,
          permissions: POS_USER_PERMISSIONS_PRESET,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,user_id" },
      )
    if (permErr) throw permErr

    return new Response(
      JSON.stringify({
        success: true,
        user_id: targetUserId,
        organization_id: targetOrgId,
        posPermissionsApplied: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Failed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
