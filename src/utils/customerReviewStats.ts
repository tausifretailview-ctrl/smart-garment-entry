/** Customer reviews (bill page feedback): summary numbers and filters. Pure, for tests. */

export interface CustomerReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  tags: string[] | null;
  salesman: string | null;
  source: string | null;
  created_at: string;
  sale_id: string;
  sale_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}

export interface CustomerReviewSummary {
  count: number;
  average: number;
  /** index 0 = 1 star … index 4 = 5 stars */
  byStars: [number, number, number, number, number];
  /** share of 4–5 star reviews, 0–100 */
  happyPercent: number;
}

export function summarizeReviews(rows: Pick<CustomerReviewRow, "rating">[]): CustomerReviewSummary {
  const byStars: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let total = 0;
  let count = 0;
  for (const r of rows) {
    const stars = Math.round(Number(r.rating));
    if (!(stars >= 1 && stars <= 5)) continue;
    byStars[stars - 1] += 1;
    total += stars;
    count += 1;
  }
  return {
    count,
    average: count ? Math.round((total / count) * 10) / 10 : 0,
    byStars,
    happyPercent: count ? Math.round(((byStars[3] + byStars[4]) / count) * 100) : 0,
  };
}

export type RatingFilter = "all" | "bad" | "ok" | "good";

export function matchesReviewFilters(
  r: CustomerReviewRow,
  f: { rating: RatingFilter; salesman: string; search: string },
): boolean {
  const stars = Math.round(Number(r.rating));
  if (f.rating === "bad" && stars > 2) return false;
  if (f.rating === "ok" && stars !== 3) return false;
  if (f.rating === "good" && stars < 4) return false;
  if (f.salesman && f.salesman !== "all" && (r.salesman ?? "") !== f.salesman) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = [r.sale_number, r.customer_name, r.customer_phone, r.comment, ...(r.tags ?? [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
