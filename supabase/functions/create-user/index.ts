import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0"

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

    const { email, password, orgId, role } = await req.json()

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

    // Assign to org
    const { error: assignErr } = await supabaseAdmin.rpc("platform_assign_user_to_org", {
      p_user_email: email,
      p_org_id: orgId,
      p_role: role,
    })
    if (assignErr) throw assignErr

    return new Response(
      JSON.stringify({ user: newUser.user }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
