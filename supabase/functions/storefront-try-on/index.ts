/**
 * AI Trial Room: the website's "Try it on" (see ../_shared/trialRoom.ts).
 *
 * Public (no login): the shopper's photo + a product of a published store in, an AI preview of
 * the shopper wearing that product out. The photo and the preview are not stored anywhere.
 *
 * Guards, in order: valid body → store published → shop switched the trial room on → the
 * product is listed in that store (its photo comes from the database, never from the request) →
 * AI key configured → usage row written (fails closed if the SQL has not run) → per-visitor and
 * per-shop limits → AI call.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseStorefrontTrialRoom,
  pickGarmentPhoto,
  readTrialRoomRequest,
  trialRoomProductAllowed,
  trialRoomImageFromReply,
  trialRoomLimitProblem,
  trialRoomPrompt,
} from "../_shared/trialRoom.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
/**
 * Tried in order until one answers; TRIAL_ROOM_MODEL (function secret) goes first when set.
 * The Pro image model keeps the outfit and its styling more faithfully (Nov 2026: the flash model
 * changed only the shirt and drifted on sleeves and fit); flash stays as the fallback. To go
 * back to flash first (cheaper), set TRIAL_ROOM_MODEL=google/gemini-2.5-flash-image.
 */
const DEFAULT_MODELS = [
  "google/gemini-3-pro-image-preview",
  "google/gemini-2.5-flash-image",
  "google/gemini-2.5-flash-image-preview",
];
const AI_TIMEOUT_MS = 100_000;
const MAX_GARMENT_BYTES = 6 * 1024 * 1024;

const NOT_AVAILABLE = "The trial room is not available right now. Please message the shop.";

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

/** Visitor id for the hourly limit: a salted hash, so the stored value is not an IP address. */
async function visitorHash(orgId: string, ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${orgId}:${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * The product photo for the AI. Photos in this project's own storage are sent as data (the AI
 * service may not be able to fetch them); any other https photo is passed as a link, so this
 * function never fetches an address someone typed into a product.
 */
async function garmentImageForAi(url: string, supabaseUrl: string): Promise<string> {
  try {
    if (new URL(url).host !== new URL(supabaseUrl).host) return url;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return url;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_GARMENT_BYTES) return url;
    return `data:${type};base64,${toBase64(bytes)}`;
  } catch {
    return url;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request" });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");

  // Website → Theme asks whether the function is deployed and has its AI key.
  if ((body as { action?: unknown } | null)?.action === "status") {
    return json(200, { deployed: true, aiConfigured: !!apiKey });
  }

  const parsed = readTrialRoomRequest(body);
  if ("error" in parsed) return json(400, { error: parsed.error });
  const { slug, productId, photoUrl, photo } = parsed.request;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // The store as the website sees it: published flag, and the product with its photos.
  const { data: store, error: storeError } = await admin.rpc("get_public_storefront", { p_slug: slug });
  const payload = (store ?? {}) as {
    published?: boolean;
    products?: Array<{ product_id?: string; name?: string; category?: string | null; photo_urls?: unknown }>;
  };
  if (storeError || payload.published !== true) return json(404, { error: "Store not found" });

  const { data: orgRows, error: orgError } = await admin.rpc("resolve_organization_by_public_slug", { p_slug: slug });
  const orgId = (Array.isArray(orgRows) ? orgRows[0]?.id : (orgRows as { id?: string } | null)?.id) as string | undefined;
  if (orgError || !orgId) return json(404, { error: "Store not found" });

  const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const room = parseStorefrontTrialRoom(org?.settings);
  if (!room.enabled) return json(403, { error: NOT_AVAILABLE });

  const product = (payload.products ?? []).find((p) => p.product_id === productId);
  if (!product) return json(400, { error: "This product is not available" });
  if (!trialRoomProductAllowed(product)) return json(400, { error: "Try-on is not offered for this product" });
  const garmentUrl = pickGarmentPhoto(product.photo_urls, photoUrl);
  if (!garmentUrl) return json(400, { error: "This product has no photo to try on" });

  if (!apiKey) {
    console.error("storefront-try-on: LOVABLE_API_KEY is not configured");
    return json(503, { error: NOT_AVAILABLE });
  }

  // Count first, then check: two requests at once cannot both slip under the limit.
  const visitor = await visitorHash(orgId, clientIp(req), serviceKey);
  const { data: row, error: insertError } = await admin
    .from("storefront_tryons")
    .insert({ organization_id: orgId, product_id: productId, visitor_hash: visitor })
    .select("id")
    .single();
  if (insertError || !row?.id) {
    // No usage table = no limits. Refuse until the trial-room SQL has run.
    console.error("storefront-try-on: usage row not written", insertError?.message);
    return json(503, { error: NOT_AVAILABLE });
  }
  const finish = async (ok: boolean, model: string | null, error: string | null) => {
    await admin.from("storefront_tryons").update({ ok, model, error: error?.slice(0, 300) ?? null }).eq("id", row.id);
  };

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [shopCount, visitorCount] = await Promise.all([
    admin.from("storefront_tryons").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", dayAgo),
    admin
      .from("storefront_tryons")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("visitor_hash", visitor)
      .gte("created_at", hourAgo),
  ]);
  if (shopCount.error || visitorCount.error) {
    await admin.from("storefront_tryons").delete().eq("id", row.id);
    return json(503, { error: NOT_AVAILABLE });
  }
  const limitProblem = trialRoomLimitProblem(
    { shopToday: shopCount.count ?? 0, visitorThisHour: visitorCount.count ?? 0 },
    room.dailyLimit,
  );
  if (limitProblem) {
    // A refused request does not use up the limit.
    await admin.from("storefront_tryons").delete().eq("id", row.id);
    return json(429, { error: limitProblem });
  }

  const garment = await garmentImageForAi(garmentUrl, supabaseUrl);
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: trialRoomPrompt(product) },
        { type: "image_url", image_url: { url: photo } },
        { type: "image_url", image_url: { url: garment } },
      ],
    },
  ];
  const override = (Deno.env.get("TRIAL_ROOM_MODEL") || "").trim();
  const models = override ? [override, ...DEFAULT_MODELS.filter((m) => m !== override)] : DEFAULT_MODELS;

  let lastError = "no reply";
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch(AI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, modalities: ["image", "text"] }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    } catch (err) {
      lastError = `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      break;
    }
    if (res.status === 429) {
      await finish(false, model, "ai 429");
      return json(429, { error: "The trial room is busy. Please try again in a minute." });
    }
    if (res.status === 402) {
      await finish(false, model, "ai 402 (credits)");
      console.error("storefront-try-on: AI credits exhausted");
      return json(503, { error: NOT_AVAILABLE });
    }
    if (!res.ok) {
      lastError = `ai ${res.status}: ${(await res.text()).slice(0, 200)}`;
      // An unknown model name: try the next one. Anything else: stop.
      if (res.status === 400 || res.status === 404) continue;
      break;
    }
    const image = trialRoomImageFromReply(await res.json().catch(() => null));
    if (image) {
      await finish(true, model, null);
      return json(200, { image });
    }
    // The model answered without a picture (it declined, or could not see a person).
    await finish(false, model, "no image in reply");
    return json(422, {
      error: "We could not make a preview from this photo. Please try a clear, front-facing photo of yourself.",
    });
  }

  console.error("storefront-try-on:", lastError);
  await finish(false, models[0], lastError);
  return json(502, { error: "The trial room could not make a preview. Please try again." });
});
