/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { buildReviewLink, buildReviewWhatsAppUrl } from "./productReviews";
import { formatRatingAvg, parsePublicProductReviews, ratingCountLabel } from "./productReviewsPublic";
import { isReservedAppPathSegment } from "./reservedAppPaths";
import { StreetRatingLine, StreetReviewsContext, StreetReviewsSection } from "@/storefront/StreetReviews";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("website product reviews", () => {
  it("reads the store's ratings and drops anything malformed", () => {
    const map = parsePublicProductReviews([
      {
        product_id: "p1",
        rating_avg: 4.5,
        rating_count: 2,
        reviews: [
          { rating: 5, comment: "  Lovely fabric ", photo_url: "https://x.supabase.co/storage/v1/object/public/review-photos/s/a.jpg", name: "Asha", date: "2026-11-01T10:00:00Z" },
          { rating: 9, comment: "bad stars" },
          { rating: 4, comment: "", photo_url: "javascript:alert(1)", name: "" },
          null,
        ],
      },
      { product_id: "p2", rating_avg: 0, rating_count: 3 },
      { product_id: "p3", rating_avg: 4, rating_count: 0 },
      { rating_avg: 4, rating_count: 1 },
      "junk",
    ]);
    expect(Object.keys(map)).toEqual(["p1"]);
    expect(map.p1.ratingAvg).toBe(4.5);
    expect(map.p1.ratingCount).toBe(2);
    expect(map.p1.reviews).toEqual([
      {
        rating: 5,
        comment: "Lovely fabric",
        photoUrl: "https://x.supabase.co/storage/v1/object/public/review-photos/s/a.jpg",
        name: "Asha",
        date: "2026-11-01T10:00:00Z",
      },
      { rating: 4, comment: null, photoUrl: null, name: "Customer", date: null },
    ]);
    expect(parsePublicProductReviews(null)).toEqual({});
    expect(parsePublicProductReviews({ error: "x" })).toEqual({});
  });

  it("formats the average and the count", () => {
    expect(formatRatingAvg(5)).toBe("5.0");
    expect(formatRatingAvg(4.64)).toBe("4.6");
    expect(ratingCountLabel(1)).toBe("1 rating");
    expect(ratingCountLabel(12)).toBe("12 ratings");
  });

  it("builds the customer's review link and the WhatsApp message", () => {
    expect(buildReviewLink("abc", "https://shop.example/")).toBe("https://shop.example/review/abc");
    expect(buildReviewLink("")).toBe("");
    expect(buildReviewLink("abc")).toBe("https://app.inventoryshop.in/review/abc");
    const url = buildReviewWhatsAppUrl({
      saleId: "abc",
      shopName: "Style Hub",
      customerName: "Asha Patel",
      customerPhone: "98765 43210",
      baseUrl: "https://shop.example",
    });
    expect(url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    const message = decodeURIComponent(url.split("text=")[1]);
    expect(message).toContain("Hi Asha, thank you for shopping at Style Hub!");
    expect(message).toContain("https://shop.example/review/abc");
    // Walk-in bill without a number: opens WhatsApp with the message and no name.
    const walkIn = buildReviewWhatsAppUrl({ saleId: "abc", shopName: "Style Hub", customerName: "Walk-in Customer", baseUrl: "https://shop.example" });
    expect(walkIn.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(walkIn.split("text=")[1]).startsWith("Hi, thank you")).toBe(true);
  });

  it("shows stars on the card and the reviews with photos on the product page", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const reviews = {
      p1: {
        ratingAvg: 4.5,
        ratingCount: 6,
        reviews: [
          { rating: 5, comment: "Lovely fabric", photoUrl: "https://cdn.example/r1.jpg", name: "Asha", date: "2026-11-01T10:00:00Z" },
          { rating: 4, comment: "Good fit", photoUrl: null, name: "Ravi", date: null },
          { rating: 5, comment: "Nice colour", photoUrl: null, name: "Meena", date: null },
          { rating: 3, comment: "Okay", photoUrl: null, name: "Zoya", date: null },
        ],
      },
    };
    act(() => {
      root.render(
        <StreetReviewsContext.Provider value={reviews}>
          <StreetRatingLine productId="p1" />
          <StreetRatingLine productId="unrated" />
          <StreetReviewsSection productId="p1" />
          <StreetReviewsSection productId="unrated" />
        </StreetReviewsContext.Provider>,
      );
    });
    const cardLines = host.querySelectorAll(".st-card-rating");
    expect(cardLines).toHaveLength(1);
    expect(cardLines[0].textContent?.replace(/\s+/g, " ")).toContain("4.5 (6)");
    expect(host.querySelectorAll(".st-reviews")).toHaveLength(1);
    expect(host.querySelector(".st-reviews-count")?.textContent).toContain("6 ratings");
    expect(host.querySelectorAll(".st-reviews-photo")).toHaveLength(1);
    expect(host.querySelectorAll(".st-review")).toHaveLength(3);
    expect(host.querySelector(".st-review")?.textContent).toContain("Verified buyer");
    const more = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Show all 4 reviews")!;
    act(() => more.click());
    expect(host.querySelectorAll(".st-review")).toHaveLength(4);
    act(() => (host.querySelector(".st-reviews-photo") as HTMLButtonElement).click());
    expect(host.querySelector(".st-reviews-zoom img")?.getAttribute("src")).toBe("https://cdn.example/r1.jpg");
    act(() => (host.querySelector(".st-reviews-zoom-close") as HTMLButtonElement).click());
    expect(host.querySelector(".st-reviews-zoom")).toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it("is wired: route, store data, bill buttons, approval screen and the database functions", () => {
    expect(isReservedAppPathSegment("review")).toBe(true);
    expect(read("src/app/AppRoutes.tsx")).toContain('<Route path="/review/:saleId" element={<PublicProductReview />} />');
    const client = read("src/storefront/storefrontClient.ts");
    expect(client).toContain('"get_public_product_reviews"');
    expect(client).toContain("payload.reviews = parsePublicProductReviews(");
    // The public store must not pull in the signed-in app's database client.
    expect(client).not.toContain('"@/lib/productReviews"');
    expect(read("src/lib/productReviewsPublic.ts")).not.toContain("@/integrations/supabase/client");
    const street = read("src/storefront/StreetStorefront.tsx");
    expect(street).toContain("<StreetReviewsContext.Provider value={reviewMap}>");
    expect(street).toContain("<StreetReviewsSection productId={product.productId} />");
    expect(read("src/pages/PublicInvoiceView.tsx")).toContain("href={`/review/${saleId}`}");
    for (const page of ["src/pages/POSDashboard.tsx", "src/pages/SalesInvoiceDashboard.tsx"]) {
      expect(read(page)).toContain("openReviewLinkOnWhatsApp(");
    }
    expect(read("src/pages/CustomerReviews.tsx")).toContain("<ProductReviewsDialog");

    const sql = read("supabase/migrations/20270501120000_product_reviews.sql");
    // Customers (not signed in) reach reviews only through the three functions, never the table.
    expect(sql).toContain("REVOKE ALL ON TABLE public.product_reviews FROM PUBLIC, anon;");
    expect(sql).not.toMatch(/GRANT[^;]*ON TABLE public\.product_reviews TO[^;]*anon/);
    for (const fn of [
      "get_public_review_form(uuid)",
      "submit_public_product_review(uuid, uuid, int, text, text)",
      "get_public_product_reviews(text)",
    ]) {
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO anon, authenticated, service_role;`);
    }
    // New reviews wait for the shop's approval.
    expect(sql).toContain("status text NOT NULL DEFAULT 'pending'");
  });
});
