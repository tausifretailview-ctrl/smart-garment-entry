import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EnquiryBody = {
  slug?: unknown;
  organizationId?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  message?: unknown;
  productId?: unknown;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "";
  return (real.trim() || "unknown").slice(0, 64);
}

function digits(raw: unknown): string {
  return String(raw || "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body: EnquiryBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const slug = String(body.slug || "").trim();
  if (!slug || slug.length > 80 || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    return json(400, { error: "A valid store slug is required" });
  }

  const customerName = String(body.customerName || "").trim();
  const customerPhone = digits(body.customerPhone);
  const message = String(body.message || "").trim();
  const productId = body.productId ? String(body.productId).trim() : null;

  if (customerName.length < 2 || customerName.length > 80) {
    return json(400, { error: "Please enter your name" });
  }
  if (customerPhone.length < 10 || customerPhone.length > 15) {
    return json(400, { error: "Please enter a valid mobile number" });
  }
  if (message.length > 1000) {
    return json(400, { error: "Message is too long" });
  }
  if (productId && !UUID_RE.test(productId)) {
    return json(400, { error: "Invalid product" });
  }

  // Tenant is resolved from the public slug, never from a body organizationId.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, slug")
    .ilike("slug", slug)
    .maybeSingle();

  if (orgError || !org?.id) {
    return json(404, { error: "Store not found" });
  }

  const { data: settings } = await supabase
    .from("website_settings")
    .select("organization_id, is_published")
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!settings?.is_published) {
    return json(404, { error: "Store is not published" });
  }

  if (productId) {
    const { data: listed } = await supabase
      .from("website_products")
      .select("id")
      .eq("organization_id", org.id)
      .eq("product_id", productId)
      .eq("is_active", true)
      .maybeSingle();
    if (!listed) {
      return json(400, { error: "This product is not available" });
    }
  }

  const ip = clientIp(req);
  const now = Date.now();
  const { data: rateRow } = await supabase
    .from("website_enquiry_rate_limits")
    .select("window_started_at, hit_count")
    .eq("organization_id", org.id)
    .eq("client_ip", ip)
    .maybeSingle();

  let windowStartedAt = now;
  let hitCount = 1;
  if (rateRow?.window_started_at) {
    const started = new Date(rateRow.window_started_at).getTime();
    if (now - started < RATE_LIMIT_WINDOW_MS) {
      if ((rateRow.hit_count || 0) >= RATE_LIMIT_MAX) {
        return json(429, { error: "Too many enquiries. Please try again later." });
      }
      windowStartedAt = started;
      hitCount = (rateRow.hit_count || 0) + 1;
    }
  }

  const { error: rateError } = await supabase.from("website_enquiry_rate_limits").upsert(
    {
      organization_id: org.id,
      client_ip: ip,
      window_started_at: new Date(windowStartedAt).toISOString(),
      hit_count: hitCount,
    },
    { onConflict: "organization_id,client_ip" },
  );

  if (rateError) {
    console.error("storefront enquiry rate-limit write failed", rateError);
    return json(500, { error: "Could not submit enquiry" });
  }

  const { error: insertError } = await supabase.from("website_enquiries").insert({
    organization_id: org.id,
    product_id: productId,
    customer_name: customerName,
    customer_phone: customerPhone,
    message: message || null,
    status: "new",
  });

  if (insertError) {
    console.error("storefront enquiry insert failed", insertError);
    return json(500, { error: "Could not submit enquiry" });
  }

  return json(200, { ok: true });
});
