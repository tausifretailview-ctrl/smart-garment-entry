import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { isAllowedWappConnectPdfPath } from "../_shared/wappConnectResponse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET_ID = "invoice-pdfs";

function jsonResponse(body: Record<string, string>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function filenameFromPath(storagePath: string): string {
  return storagePath.split("/").pop() ?? "invoice.pdf";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const storagePath = (url.searchParams.get("path") ?? "").trim();

  if (!isAllowedWappConnectPdfPath(storagePath)) {
    return jsonResponse({ error: "Invalid or disallowed path" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_ID).download(storagePath);

  if (error || !data) {
    console.error("serve-wappconnect-pdf:", error?.message ?? "missing file");
    return jsonResponse({ error: "PDF not found" }, 404);
  }

  const fileName = filenameFromPath(storagePath);
  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${fileName}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Length": String(data.size),
  };

  if (req.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  return new Response(data, { status: 200, headers });
});
