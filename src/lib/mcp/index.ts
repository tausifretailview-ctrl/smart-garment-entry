import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import listMyOrganizationsTool from "./tools/list-my-organizations";

// Build the Supabase OAuth issuer from the project ref that Vite inlines at
// build time. Never derive it from SUPABASE_URL — on Lovable Cloud that host is
// a `.lovable.cloud` proxy, and mcp-js rejects any token whose configured
// issuer doesn't match the direct `supabase.co` issuer the discovery document
// publishes. The sentinel fallback keeps the module import-safe during the
// manifest-extract eval, where no token is ever verified.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ezzy-erp-mcp",
  title: "Ezzy ERP",
  version: "0.1.0",
  instructions:
    "Ezzy ERP tools. Use `echo` to verify connectivity, and `list_my_organizations` to see the organizations you belong to.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, listMyOrganizationsTool],
});