/**
 * Shared auth-user directory. Every caller treats the payload as "all platform
 * users", so a truncated GoTrue page (default 50) hides later accounts from:
 * POS Dashboard salesman filter, Employee Master user-linking, User Rights,
 * Sales Invoice Dashboard filters, Item-Wise Sales Report filters, Platform
 * Admin, Organization Management, User Management.
 *
 * Merge to main / Vercel does not ship this. Redeploy the Deno function:
 *   supabase functions deploy get-users
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { accumulateAuthUserPages } from "../_shared/listAllAuthUsers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the requesting user from JWT claims. Calling /auth/v1/user can fail
    // for otherwise valid tokens when the session row has rotated/expired.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: "Missing bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: "Empty bearer token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (token === supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: "Login session required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the JWT against the auth server. Passing the token explicitly avoids
    // the "Auth session missing!" error that getClaims/getUser produce on a client
    // without a persisted session (legacy HS256 projects).
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) {
      console.error("JWT verification failed:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: userError?.message || "Invalid login session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = { id: userId };
    console.log("User verified:", user.id);

    // Check if user has admin, platform_admin, or manager role
    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "platform_admin", "manager"]);

    // Also check organization_members for admin role
    const { data: orgAdminCheck } = await supabaseAdmin
      .from("organization_members")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .eq("role", "admin");

    if ((!roleCheck || roleCheck.length === 0) && (!orgAdminCheck || orgAdminCheck.length === 0)) {
      return new Response(
        JSON.stringify({ error: "Forbidden - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only a true platform_admin (user_roles) sees every user on the platform —
    // used by Platform Admin / Organization Management. Everyone else who
    // passed the check above (an org-level admin/manager) gets the directory
    // scoped to users who share at least one organization with them: those
    // callers (POS Dashboard salesman filter, Employee Master, User Rights,
    // Sales/Item-Wise report filters, User Management) only ever needed their
    // own org's users and were filtering this same "all platform users"
    // payload down client-side — returning everyone here was an unnecessary
    // cross-tenant disclosure, not a required behavior.
    const isPlatformAdmin = (roleCheck || []).some((r) => r.role === "platform_admin");
    let scopedOrgIds: string[] | null = null;
    if (!isPlatformAdmin) {
      const { data: myMemberships } = await supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id);
      scopedOrgIds = (myMemberships || []).map((m) => m.organization_id).filter(Boolean);
    }

    // Get all users from auth. listUsers() defaults to a 50-user page size —
    // with more than 50 platform users, later-created accounts were silently
    // missing from every screen that depends on this function (POS Dashboard
    // salesman filter, Employee Master user-linking, sales report filters,
    // etc.), even though those users had genuine organization_members rows.
    // Loop through every page rather than relying on one oversized perPage call.
    const users = await accumulateAuthUserPages(async (page, perPage) => {
      const { data, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (usersError) throw usersError;
      return data?.users ?? [];
    });

    // Get all user roles
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("*");

    if (rolesError) {
      throw rolesError;
    }

    // Non-platform-admin callers only get users who share an organization
    // with them (see scopedOrgIds above).
    let visibleUsers = users;
    if (scopedOrgIds) {
      if (scopedOrgIds.length === 0) {
        visibleUsers = [];
      } else {
        const { data: coMembers, error: coMembersError } = await supabaseAdmin
          .from("organization_members")
          .select("user_id")
          .in("organization_id", scopedOrgIds);
        if (coMembersError) {
          throw coMembersError;
        }
        const visibleIds = new Set((coMembers || []).map((m) => m.user_id));
        visibleUsers = users.filter((u) => visibleIds.has(u.id));
      }
    }

    // Combine user data with roles
    const usersWithRoles = visibleUsers.map((user) => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      roles: userRoles?.filter((r) => r.user_id === user.id).map((r) => r.role) || [],
    }));

    return new Response(
      JSON.stringify({ users: usersWithRoles }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
