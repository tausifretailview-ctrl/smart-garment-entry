import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Keep in sync with APP_VERSION in src/config/downloads.ts */
const CURRENT_APK_VERSION = "1.1.0";
const DEFAULT_FILE = `EzzyERP-${CURRENT_APK_VERSION}.apk`;
const BUCKET_ID = "app-downloads";

const ALLOWED_FILES = new Set([
  DEFAULT_FILE,
  // add new installer filenames here each release
]);

function jsonResponse(body: Record<string, string>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSafeFileName(name: string): boolean {
  if (!name || name.length > 128) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return /^[\w.\-()]+$/.test(name);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const requested = (url.searchParams.get("file")?.trim() || DEFAULT_FILE).replace(/^\/+/, "");
  const fileName = requested.split("/").pop() ?? "";

  if (!isSafeFileName(fileName) || !ALLOWED_FILES.has(fileName)) {
    return jsonResponse({ error: "File not allowed" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_ID)
    .createSignedUrl(fileName, 120);

  if (error || !data?.signedUrl) {
    return jsonResponse({ error: "Installer not found" }, 404);
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: data.signedUrl,
    },
  });
});
