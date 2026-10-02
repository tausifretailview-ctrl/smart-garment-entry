import { describe, expect, it } from "vitest";
import { matchesReviewFilters, summarizeReviews, type CustomerReviewRow } from "./customerReviewStats";

const row = (over: Partial<CustomerReviewRow>): CustomerReviewRow => ({
  id: "r",
  rating: 5,
  comment: null,
  tags: [],
  salesman: null,
  source: "customer_page",
  created_at: "2026-10-02T05:00:00Z",
  sale_id: "s",
  sale_number: "POS/26-27/343",
  customer_name: "SHAHIN PATEL",
  customer_phone: "9371122145",
  ...over,
});

describe("summarizeReviews", () => {
  it("counts stars, average and happy share", () => {
    const s = summarizeReviews([{ rating: 5 }, { rating: 4 }, { rating: 2 }, { rating: 5 }]);
    expect(s).toEqual({ count: 4, average: 4, byStars: [0, 1, 0, 1, 2], happyPercent: 75 });
  });
  it("is zero for no reviews and ignores bad ratings", () => {
    expect(summarizeReviews([])).toEqual({ count: 0, average: 0, byStars: [0, 0, 0, 0, 0], happyPercent: 0 });
    expect(summarizeReviews([{ rating: 0 }, { rating: 9 }]).count).toBe(0);
  });
});

describe("matchesReviewFilters", () => {
  const all = { rating: "all" as const, salesman: "all", search: "" };
  it("filters by rating band", () => {
    expect(matchesReviewFilters(row({ rating: 2 }), { ...all, rating: "bad" })).toBe(true);
    expect(matchesReviewFilters(row({ rating: 4 }), { ...all, rating: "bad" })).toBe(false);
    expect(matchesReviewFilters(row({ rating: 3 }), { ...all, rating: "ok" })).toBe(true);
    expect(matchesReviewFilters(row({ rating: 4 }), { ...all, rating: "good" })).toBe(true);
  });
  it("searches bill no, customer, phone, comment and tags", () => {
    expect(matchesReviewFilters(row({}), { ...all, search: "343" })).toBe(true);
    expect(matchesReviewFilters(row({ comment: "Fast billing" }), { ...all, search: "fast" })).toBe(true);
    expect(matchesReviewFilters(row({ tags: ["Staff"] }), { ...all, search: "staff" })).toBe(true);
    expect(matchesReviewFilters(row({}), { ...all, search: "nomatch" })).toBe(false);
  });
  it("filters by salesman", () => {
    expect(matchesReviewFilters(row({ salesman: "Ali" }), { ...all, salesman: "Ali" })).toBe(true);
    expect(matchesReviewFilters(row({ salesman: "Raj" }), { ...all, salesman: "Ali" })).toBe(false);
  });
});
