/**
 * Website product reviews — the pure half (no database client), so the public store bundle can
 * read reviews without pulling in the signed-in app's Supabase client. See productReviews.ts.
 */
export const REVIEW_COMMENT_MAX = 600;

/** One product's stars and approved reviews, as the public store receives them. */
export type PublicProductReviews = {
  ratingAvg: number;
  ratingCount: number;
  reviews: Array<{ rating: number; comment: string | null; photoUrl: string | null; name: string; date: string | null }>;
};

export function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function httpsUrl(value: unknown): string | null {
  const url = text(value, 600);
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
}

export function stars(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/** get_public_product_reviews → map by product id. Anything malformed is dropped. */
export function parsePublicProductReviews(raw: unknown): Record<string, PublicProductReviews> {
  const out: Record<string, PublicProductReviews> = {};
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const productId = text(r.product_id, 80);
    const ratingAvg = stars(r.rating_avg);
    const ratingCount = Math.floor(Number(r.rating_count));
    if (!productId || ratingAvg === null || !(ratingCount > 0)) continue;
    const reviews: PublicProductReviews["reviews"] = [];
    for (const item of Array.isArray(r.reviews) ? r.reviews : []) {
      if (!item || typeof item !== "object") continue;
      const v = item as Record<string, unknown>;
      const rating = stars(v.rating);
      if (rating === null) continue;
      reviews.push({
        rating,
        comment: text(v.comment, REVIEW_COMMENT_MAX) || null,
        photoUrl: httpsUrl(v.photo_url),
        name: text(v.name, 60) || "Customer",
        date: text(v.date, 40) || null,
      });
    }
    out[productId] = { ratingAvg, ratingCount, reviews };
  }
  return out;
}

/** Average for display with one decimal: 4.6, 5.0. */
export function formatRatingAvg(avg: number): string {
  return (Math.round(avg * 10) / 10).toFixed(1);
}

/** "12 ratings" / "1 rating". */
export function ratingCountLabel(count: number): string {
  return `${count} rating${count === 1 ? "" : "s"}`;
}
