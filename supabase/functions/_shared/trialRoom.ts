/**
 * AI Trial Room (website "Try it on"): rules shared by the store, Website → Theme and the
 * storefront-try-on edge function. Pure: no Deno or browser APIs, so vitest covers it.
 *
 * The shopper uploads a photo of themselves on a product page; an AI image model returns a
 * preview of them wearing that product. The photo and the preview are never stored: only a
 * usage row (shop, product, hashed visitor, ok / error) is kept, for the daily limit.
 *
 * Each try-on costs the shop's platform an AI image call, so it is OFF until the shop switches
 * it on (organizations.settings.storefront_trial_room) and capped per shop per day and per
 * visitor per hour.
 */
export const STOREFRONT_TRIAL_ROOM_KEY = "storefront_trial_room";
/** Listed in get_org_public_info.store_features once the trial-room SQL has run. */
export const TRIAL_ROOM_FEATURE = "trial_room";

export const TRIAL_ROOM_DEFAULT_DAILY_LIMIT = 50;
export const TRIAL_ROOM_MAX_DAILY_LIMIT = 1000;
/** Try-ons one visitor (hashed IP) may run per shop per hour. */
export const TRIAL_ROOM_VISITOR_HOURLY_LIMIT = 6;
/** Shopper photo as a data URL: about 3 MB of base64. The store sends ~200 KB. */
export const TRIAL_ROOM_MAX_PHOTO_CHARS = 4_200_000;
/** Longest side of the photo the store sends. */
export const TRIAL_ROOM_PHOTO_MAX_EDGE = 1024;

export type StorefrontTrialRoom = {
  /** Off unless the shop switches it on. */
  enabled: boolean;
  /** Try-ons the whole shop may run in 24 hours. */
  dailyLimit: number;
};

export function clampTrialRoomDailyLimit(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return TRIAL_ROOM_DEFAULT_DAILY_LIMIT;
  return Math.min(TRIAL_ROOM_MAX_DAILY_LIMIT, n);
}

/** Saved setting → config. Anything missing or malformed = off, default limit. */
export function parseStorefrontTrialRoom(orgSettings: unknown): StorefrontTrialRoom {
  const out: StorefrontTrialRoom = { enabled: false, dailyLimit: TRIAL_ROOM_DEFAULT_DAILY_LIMIT };
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return out;
  const raw = (orgSettings as Record<string, unknown>)[STOREFRONT_TRIAL_ROOM_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const row = raw as Record<string, unknown>;
  out.enabled = row.enabled === true;
  if (row.daily_limit != null) out.dailyLimit = clampTrialRoomDailyLimit(row.daily_limit);
  return out;
}

export function serializeStorefrontTrialRoom(room: StorefrontTrialRoom): Record<string, unknown> {
  return { enabled: room.enabled === true, daily_limit: clampTrialRoomDailyLimit(room.dailyLimit) };
}

/**
 * What the public store may offer: the database must list the feature (so a store whose SQL has
 * not run shows no dead button) and the shop must have switched it on.
 */
export function storefrontTrialRoomForStore(
  orgInfo: { store_features?: unknown; settings?: unknown } | null | undefined,
): StorefrontTrialRoom {
  const room = parseStorefrontTrialRoom(orgInfo?.settings);
  const features = Array.isArray(orgInfo?.store_features) ? (orgInfo!.store_features as unknown[]) : [];
  if (!features.includes(TRIAL_ROOM_FEATURE)) room.enabled = false;
  return room;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export type TrialRoomRequest = {
  slug: string;
  productId: string;
  /** The product photo the shopper was looking at; used only if it is one of the product's photos. */
  photoUrl: string | null;
  photo: string;
};

/** Validates the store's request body. Returns the request, or the message to show. */
export function readTrialRoomRequest(body: unknown): { request: TrialRoomRequest } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const slug = String(b.slug ?? "").trim();
  if (!SLUG_RE.test(slug)) return { error: "A valid store is required" };
  const productId = String(b.productId ?? "").trim();
  if (!UUID_RE.test(productId)) return { error: "A valid product is required" };
  const photo = typeof b.photo === "string" ? b.photo : "";
  if (!photo) return { error: "Please add your photo" };
  if (photo.length > TRIAL_ROOM_MAX_PHOTO_CHARS) return { error: "That photo is too large. Please try a smaller one." };
  if (!PHOTO_RE.test(photo)) return { error: "Please use a JPG, PNG or WebP photo" };
  const photoUrl = typeof b.photoUrl === "string" && b.photoUrl.length <= 2000 ? b.photoUrl.trim() || null : null;
  return { request: { slug, productId, photoUrl, photo } };
}

/**
 * The product photo to dress the shopper in. It always comes from the product's own photos in
 * the database: the one the shopper was looking at when it is among them, else the first.
 */
export function pickGarmentPhoto(photoUrls: unknown, wanted: string | null): string | null {
  if (!Array.isArray(photoUrls)) return null;
  const urls = photoUrls
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => /^https:\/\//i.test(u));
  if (urls.length === 0) return null;
  return wanted && urls.includes(wanted) ? wanted : urls[0];
}

const NOT_FOR_TRY_ON = /\b(inner\s?wear|under\s?wear|under\s?garments?|lingerie|bra|bras|bralette|pant(y|ies)|briefs?|boxers?|trunks?|thongs?|bikinis?|swim\s?(wear|suits?)|shape\s?wear|camisoles?|slips?|night\s?(wear|ies|y|dress|gown)|baby\s?dolls?)\b/i;

/**
 * Innerwear, swimwear and nightwear are never offered for try-on: a preview of a person in them
 * is not something the store should generate from an uploaded photo. Checked on the store (no
 * button) and again in the function.
 */
export function trialRoomProductAllowed(product: { name?: string | null; category?: string | null }): boolean {
  return !NOT_FOR_TRY_ON.test(`${product.name ?? ""} ${product.category ?? ""}`);
}

export type TrialRoomUsage = { shopToday: number; visitorThisHour: number };

/** Why this try-on may not run, or null when it may. Counts include the row for this try-on. */
export function trialRoomLimitProblem(usage: TrialRoomUsage, dailyLimit: number): string | null {
  if (usage.visitorThisHour > TRIAL_ROOM_VISITOR_HOURLY_LIMIT) {
    return "You have tried on a lot of styles. Please try again in an hour.";
  }
  if (usage.shopToday > dailyLimit) {
    return "The trial room is busy today. Please try again tomorrow or message the shop.";
  }
  return null;
}

export function trialRoomPrompt(product: { name?: string | null; category?: string | null }): string {
  const what = [product.name, product.category].map((s) => String(s ?? "").trim()).filter(Boolean).join(", ");
  return [
    "Virtual try-on for a clothing shop.",
    "Image 1 is a photo of a shopper. Image 2 is the shop's product photo" + (what ? ` (${what.slice(0, 120)})` : "") + ".",
    "Create one photorealistic image of the same person from image 1 wearing the product from image 2.",
    "Keep the person's face, hair, skin tone, body shape, pose, hands and the background exactly as in image 1.",
    "Copy the product's colour, print, fabric, neckline, sleeves and length faithfully, with natural drape and lighting.",
    "Replace only the clothing the product would cover. If the product photo shows a model or a mannequin, use only the garment.",
    "The person must stay fully and modestly clothed. No text, labels, logos or watermarks. Return only the image.",
  ].join(" ");
}

/** The generated image (data URL) from a chat-completions style reply, in the shapes gateways use. */
export function trialRoomImageFromReply(reply: unknown): string | null {
  const message = (reply as { choices?: Array<{ message?: Record<string, unknown> }> } | null)?.choices?.[0]?.message;
  if (!message) return null;
  const isImage = (v: unknown): v is string => typeof v === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(v);
  const images = message.images;
  if (Array.isArray(images)) {
    for (const img of images) {
      const url = (img as { image_url?: { url?: unknown } } | null)?.image_url?.url;
      if (isImage(url)) return url;
    }
  }
  const content = message.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const url = (part as { image_url?: { url?: unknown } } | null)?.image_url?.url;
      if (isImage(url)) return url;
    }
  }
  return null;
}
