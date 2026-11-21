import { createClient } from "@supabase/supabase-js";
import type { PublicStorefrontPayload } from "@/lib/websiteTypes";
import { attachSectionsToPublicPayload } from "@/lib/websiteSectionStore";
import { applyWebsiteProductDetails } from "@/lib/websiteProductDetails";
import { parseStorefrontTheme } from "@/lib/storefrontThemes";
import { parseStorefrontBanners } from "@/lib/storefrontBanners";
import { parseStorefrontVideos } from "@/lib/storefrontVideos";
import { parseStorefrontShowcase } from "@/lib/storefrontShowcase";
import { parsePublicProductReviews } from "@/lib/productReviewsPublic";
import { parseStorefrontSizeHelper } from "@/lib/sizeHelper";
import { storefrontTrialRoomForStore } from "@/lib/trialRoom";
import { applyProductSpins } from "@/lib/productSpin";
import { parseStorefrontSignals } from "@/lib/storefrontSignals";
import { parseStorefrontRequests, type StorefrontRequestKind } from "@/lib/storefrontRequests";
import { parseStorefrontCurrency, parseStorefrontStrips } from "@/lib/storefrontStrips";
import { enrichPublicStorefrontShop, type OrgPublicInfoSlice } from "./storefrontTheme";
import { offerFromRpc, perksFromRpc, type StorefrontOffer, type StorefrontPerks } from "./ellaPerks";

const storefrontClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

export async function loadPublicStorefront(slug: string): Promise<PublicStorefrontPayload> {
  const [storeRes, orgRes, reviewsRes, signalsRes] = await Promise.all([
    storefrontClient.rpc("get_public_storefront" as never, { p_slug: slug } as never),
    storefrontClient.rpc("get_org_public_info" as never, { p_slug: slug } as never),
    // Stars + approved reviews. Any failure (including the function not existing yet) = no reviews.
    Promise.resolve(storefrontClient.rpc("get_public_product_reviews" as never, { p_slug: slug } as never)).catch(
      () => ({ data: null, error: true }),
    ),
    // Best sellers / selling fast / just arrived / bought together. Any failure = none.
    Promise.resolve(storefrontClient.rpc("get_public_storefront_signals" as never, { p_slug: slug } as never)).catch(
      () => ({ data: null, error: true }),
    ),
  ]);
  if (storeRes.error) throw storeRes.error;
  const data = storeRes.data;
  if (!data || typeof data !== "object") return { published: false };

  const payload = data as PublicStorefrontPayload;
  const orgInfo = (orgRes.error ? null : orgRes.data) as OrgPublicInfoSlice | null;

  if (payload.shop) {
    payload.shop = enrichPublicStorefrontShop(payload.shop, orgInfo);
  }

  if (orgInfo?.id && payload.products?.length) {
    const [details, spins] = await Promise.all([
      loadWebsiteProductDetails(orgInfo.id),
      loadWebsiteProductSpins(orgInfo.id),
    ]);
    payload.products = applyProductSpins(applyWebsiteProductDetails(payload.products, details), spins);
  }

  payload.theme = parseStorefrontTheme(orgInfo?.settings);
  payload.banners = parseStorefrontBanners(orgInfo?.settings);
  payload.videos = parseStorefrontVideos(orgInfo?.settings);
  payload.showcase = parseStorefrontShowcase(orgInfo?.settings);
  payload.sizeHelper = parseStorefrontSizeHelper(orgInfo?.settings);
  payload.requests = parseStorefrontRequests(orgInfo);
  payload.trialRoom = storefrontTrialRoomForStore(orgInfo);
  payload.strips = parseStorefrontStrips(orgInfo?.settings);
  payload.currency = parseStorefrontCurrency(orgInfo?.settings);
  payload.signals = parseStorefrontSignals(signalsRes.error ? null : signalsRes.data);
  payload.reviews = parsePublicProductReviews(reviewsRes.error ? null : reviewsRes.data);

  return attachSectionsToPublicPayload(payload, orgInfo?.settings);
}

/**
 * Website name + description per listing. Read straight from website_products
 * (anon can select active rows of published stores) so get_public_storefront
 * does not need to change. Any error, including the columns not existing yet,
 * leaves the store on ERP names with no description.
 */
async function loadWebsiteProductDetails(
  orgId: string,
): Promise<Array<{ id: string; display_name: string | null; description: string | null }>> {
  try {
    const { data, error } = await storefrontClient
      .from("website_products" as never)
      .select("id, display_name, description")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .or("display_name.not.is.null,description.not.is.null");
    if (error || !Array.isArray(data)) return [];
    return data as Array<{ id: string; display_name: string | null; description: string | null }>;
  } catch {
    return [];
  }
}

/**
 * 360° spin frames per listing, read the same way as the website details. A separate request on
 * purpose: if the spin_urls column has not been added yet, only the spin is missing and the
 * store's names and descriptions still load.
 */
async function loadWebsiteProductSpins(orgId: string): Promise<Array<{ id: string; spin_urls: unknown }>> {
  try {
    const { data, error } = await storefrontClient
      .from("website_products" as never)
      .select("id, spin_urls")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .not("spin_urls", "eq", "{}");
    if (error || !Array.isArray(data)) return [];
    return data as Array<{ id: string; spin_urls: unknown }>;
  } catch {
    return [];
  }
}

/** "Reserve & try in store" / "Tell me when it's back" for one size; lands in Website → Enquiries. */
export async function submitStorefrontRequest(payload: {
  slug: string;
  kind: StorefrontRequestKind;
  customerName: string;
  customerPhone: string;
  productId: string;
  variantId: string;
}): Promise<{ ok: boolean; error?: string; holdUntil: string | null }> {
  const { data, error } = await storefrontClient.rpc("submit_public_storefront_request" as never, {
    p_slug: payload.slug,
    p_kind: payload.kind,
    p_customer_name: payload.customerName,
    p_customer_phone: payload.customerPhone,
    p_product_id: payload.productId,
    p_variant_id: payload.variantId,
  } as never);
  if (error) return { ok: false, error: "This is not available right now. Please message the shop.", holdUntil: null };
  const res = (data ?? {}) as { ok?: boolean; error?: string; hold_until?: string | null };
  return {
    ok: res.ok === true,
    error: typeof res.error === "string" ? res.error : undefined,
    holdUntil: typeof res.hold_until === "string" ? res.hold_until : null,
  };
}

export async function submitStorefrontEnquiry(payload: {
  slug: string;
  customerName: string;
  customerPhone: string;
  message?: string | null;
  productId?: string | null;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  const { data, error } = await storefrontClient.rpc("submit_public_storefront_enquiry" as never, {
    p_slug: payload.slug,
    p_customer_name: payload.customerName,
    p_customer_phone: payload.customerPhone,
    p_message: payload.message ?? null,
    p_product_id: payload.productId ?? null,
  } as never);

  if (error) {
    return { ok: false, error: error.message || "Could not submit enquiry" };
  }

  const result = data as { ok?: boolean; error?: string; status?: number } | null;
  if (!result || result.ok === false) {
    return {
      ok: false,
      error: result?.error || "Could not submit enquiry",
      status: result?.status,
    };
  }
  return { ok: true };
}

/** Reward points on this mobile at this shop. Null when the lookup is unavailable (SQL not applied, throttled). */
export async function loadShopperPerks(slug: string, phone: string): Promise<StorefrontPerks | null> {
  try {
    const { data, error } = await storefrontClient.rpc("get_public_storefront_customer_perks" as never, {
      p_slug: slug,
      p_phone: phone,
    } as never);
    if (error) return null;
    return perksFromRpc(data);
  } catch {
    return null;
  }
}

export type OfferCodeCheck =
  | { status: "valid"; offer: StorefrontOffer }
  | { status: "invalid" }
  | { status: "unavailable" };

export async function checkShopOfferCode(slug: string, code: string): Promise<OfferCodeCheck> {
  try {
    const { data, error } = await storefrontClient.rpc("check_public_storefront_offer_code" as never, {
      p_slug: slug,
      p_code: code,
    } as never);
    if (error || !data || typeof data !== "object") return { status: "unavailable" };
    const d = data as { ok?: boolean; error?: string };
    if (d.ok !== true) return d.error === "invalid_code" ? { status: "invalid" } : { status: "unavailable" };
    const offer = offerFromRpc(data);
    return offer ? { status: "valid", offer } : { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * AI Trial Room: the shopper's photo + a product → a preview of them wearing it
 * (storefront-try-on edge function). The photo is sent for this one preview and not stored.
 */
export async function requestTryOn(payload: {
  slug: string;
  productId: string;
  /** The product photo on screen; the server uses it only if it belongs to the product. */
  photoUrl?: string | null;
  /** JPEG data URL, already scaled down by the store. */
  photo: string;
}): Promise<{ ok: boolean; image?: string; error?: string }> {
  const fallback = "The trial room is not available right now. Please try again.";
  try {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/storefront-try-on`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as { image?: unknown; error?: unknown } | null;
    if (res.ok && typeof data?.image === "string" && data.image.startsWith("data:image/")) {
      return { ok: true, image: data.image };
    }
    return { ok: false, error: typeof data?.error === "string" && data.error ? data.error : fallback };
  } catch {
    return { ok: false, error: "No internet connection. Please try again." };
  }
}
