/**
 * Website product reviews (store feature 11).
 *
 * A customer opens /review/<bill id> (the same unguessable id the online invoice link uses),
 * rates each product on the bill and can add a photo. Reviews wait for the shop's approval
 * (Customer Reviews → Product reviews) before the public store shows them.
 * Database side: supabase/migrations/20270501120000_product_reviews.sql.
 */
import { supabase } from "@/integrations/supabase/client";
import { compressImageFile } from "@/lib/compressImage";

import { REVIEW_COMMENT_MAX, httpsUrl, stars, text } from "@/lib/productReviewsPublic";

export { REVIEW_COMMENT_MAX, parsePublicProductReviews, type PublicProductReviews } from "@/lib/productReviewsPublic";

export const REVIEW_PHOTOS_BUCKET = "review-photos";

export type ReviewStatus = "pending" | "approved" | "hidden";

export type ReviewFormItem = {
  product_id: string;
  name: string;
  photo: string | null;
  rating: number | null;
  comment: string | null;
  photo_url: string | null;
  status: ReviewStatus | null;
};

export type ReviewForm = {
  shopName: string;
  saleNumber: string;
  items: ReviewFormItem[];
};

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpcClient = supabase as unknown as RpcClient;

/** The customer's review link for a bill. */
export function buildReviewLink(saleId: string, baseUrl?: string): string {
  const id = String(saleId || "").trim();
  if (!id) return "";
  const base = (baseUrl || "https://app.inventoryshop.in").replace(/\/$/, "");
  return `${base}/review/${id}`;
}

/** WhatsApp chat link with the review message ready (no template, no credits). */
export function buildReviewWhatsAppUrl(input: {
  saleId: string;
  shopName: string;
  customerName?: string | null;
  customerPhone?: string | null;
  baseUrl?: string;
}): string {
  const link = buildReviewLink(input.saleId, input.baseUrl);
  const first = String(input.customerName || "").trim().split(/\s+/)[0];
  const hello = first && !/^walk/i.test(first) ? `Hi ${first}, ` : "Hi, ";
  const message =
    `${hello}thank you for shopping at ${input.shopName}! ` +
    `Please rate your products and share a photo — it takes a minute:\n${link}`;
  const digits = String(input.customerPhone || "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits.length >= 11 && digits.length <= 15 ? digits : "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Message for the review form; throws with a plain reason when it cannot load. */
export async function loadReviewForm(saleId: string): Promise<ReviewForm> {
  const { data, error } = await rpcClient.rpc("get_public_review_form", { p_sale_id: saleId });
  if (error) throw new Error("Reviews are not available right now. Please try again later.");
  const res = (data ?? {}) as Record<string, unknown>;
  if (res.ok !== true) throw new Error(text(res.error, 200) || "Bill not found");
  const items: ReviewFormItem[] = [];
  for (const row of Array.isArray(res.items) ? res.items : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const product_id = text(r.product_id, 80);
    if (!product_id) continue;
    const status = text(r.status, 20);
    items.push({
      product_id,
      name: text(r.name, 200) || "Product",
      photo: httpsUrl(r.photo),
      rating: stars(r.rating),
      comment: text(r.comment, REVIEW_COMMENT_MAX) || null,
      photo_url: httpsUrl(r.photo_url),
      status: status === "pending" || status === "approved" || status === "hidden" ? status : null,
    });
  }
  return { shopName: text(res.shop_name, 120) || "the shop", saleNumber: text(res.sale_number, 60), items };
}

/** Upload one review photo into the bill's folder; returns its public URL. */
export async function uploadReviewPhoto(saleId: string, productId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.");
  const blob = await compressImageFile(file, 1400, 0.82);
  const path = `${saleId}/${productId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(REVIEW_PHOTOS_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error("The photo could not be uploaded. Please try again.");
  return supabase.storage.from(REVIEW_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function submitProductReview(input: {
  saleId: string;
  productId: string;
  rating: number;
  comment?: string | null;
  photoUrl?: string | null;
}): Promise<void> {
  const { data, error } = await rpcClient.rpc("submit_public_product_review", {
    p_sale_id: input.saleId,
    p_product_id: input.productId,
    p_rating: input.rating,
    p_comment: input.comment?.trim() || null,
    p_photo_url: input.photoUrl || null,
  });
  if (error) throw new Error("Your review could not be saved. Please try again.");
  const res = (data ?? {}) as Record<string, unknown>;
  if (res.ok !== true) throw new Error(text(res.error, 200) || "Your review could not be saved.");
}

/* ---------- shop side (Customer Reviews → Product reviews) ---------- */

export type ShopProductReview = {
  id: string;
  sale_id: string;
  product_id: string;
  rating: number;
  comment: string | null;
  photo_url: string | null;
  reviewer_name: string | null;
  status: ReviewStatus;
  created_at: string;
};

type ReviewsTable = {
  from: (table: string) => {
    select: (cols: string) => any;
    update: (values: Record<string, unknown>) => any;
  };
};
const reviewsDb = supabase as unknown as ReviewsTable;

/** Latest reviews of one status for the shop (newest first, capped). */
export async function fetchShopProductReviews(orgId: string, status: ReviewStatus, limit = 200): Promise<ShopProductReview[]> {
  const { data, error } = await reviewsDb
    .from("product_reviews")
    .select("id, sale_id, product_id, rating, comment, photo_url, reviewer_name, status, created_at")
    .eq("organization_id", orgId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ShopProductReview[];
}

/** Approve or hide a review. Throws when the user may not (admin / manager only). */
export async function setProductReviewStatus(orgId: string, reviewId: string, status: "approved" | "hidden", userId?: string | null): Promise<void> {
  const { data, error } = await reviewsDb
    .from("product_reviews")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: userId ?? null, updated_at: new Date().toISOString() })
    .eq("id", reviewId)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Only an admin or manager can approve or hide reviews.");
}

/** Shop: open WhatsApp with the review message for this bill (the cashier presses send). */
export function openReviewLinkOnWhatsApp(input: {
  saleId: string;
  shopName: string;
  customerName?: string | null;
  customerPhone?: string | null;
}): void {
  // Same web address as the online invoice link, so it also works from the desktop app.
  const url = buildReviewWhatsAppUrl(input);
  window.open(url, "_blank", "noopener,noreferrer");
}
