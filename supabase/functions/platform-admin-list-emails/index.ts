import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_USER_IDS = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin");
    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Not a platform admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ emails: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (userIds.length > MAX_USER_IDS) {
      return new Response(JSON.stringify({ error: `At most ${MAX_USER_IDS} user IDs per request` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uniqueIds = [...new Set(userIds)];
    const emails: Record<string, string | null> = {};

    await Promise.all(
      uniqueIds.map(async (userId) => {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (error) {
          emails[userId] = null;
          return;
        }
        emails[userId] = data.user?.email ?? null;
      }),
    );

    return new Response(JSON.stringify({ emails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
