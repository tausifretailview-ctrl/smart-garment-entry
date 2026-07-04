import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

// This file is bundled into a Deno edge function at build time; `process.env`
// is provided by Deno's Node compatibility shim at runtime.
declare const process: { env: Record<string, string | undefined> };

export default defineTool({
  name: "list_my_organizations",
  title: "List my organizations",
  description: "List organizations the signed-in user is a member of, with role.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await supabase
      .from("organization_members")
      .select("role, organizations(id, name, slug, organization_type)")
      .eq("user_id", ctx.getUserId());
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const rows = (data ?? []).map((m: any) => ({
      id: m.organizations?.id,
      name: m.organizations?.name,
      slug: m.organizations?.slug,
      type: m.organizations?.organization_type,
      role: m.role,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { organizations: rows },
    };
  },
});