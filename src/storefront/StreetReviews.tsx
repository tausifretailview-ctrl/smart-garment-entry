import { createContext, useContext, useState } from "react";
import { formatRatingAvg, ratingCountLabel, type PublicProductReviews } from "@/lib/productReviewsPublic";

/** Stars and approved reviews for the store's products, keyed by product id (empty = none). */
export const StreetReviewsContext = createContext<Record<string, PublicProductReviews>>({});

const REVIEWS_SHOWN_FIRST = 3;

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="st-stars" style={{ fontSize: size }} aria-hidden="true">
      <span className="st-stars-base">★★★★★</span>
      <span className="st-stars-fill" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

function reviewDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Small "★ 4.6 (12)" line for a product card or under the product name; nothing when unrated. */
export function StreetRatingLine({
  productId,
  detailed = false,
  onClick,
}: {
  productId: string;
  detailed?: boolean;
  onClick?: () => void;
}) {
  const rated = useContext(StreetReviewsContext)[productId];
  if (!rated) return null;
  const avg = formatRatingAvg(rated.ratingAvg);
  const label = `Rated ${avg} out of 5 from ${ratingCountLabel(rated.ratingCount)}`;
  if (!detailed) {
    return (
      <span className="st-card-rating" aria-label={label}>
        <span className="st-card-rating-star" aria-hidden="true">
          ★
        </span>
        {avg} <span className="st-card-rating-count">({rated.ratingCount})</span>
      </span>
    );
  }
  return (
    <button type="button" className="st-pdp-rating" aria-label={`${label}. See reviews`} onClick={onClick}>
      <StarRow value={rated.ratingAvg} size={16} />
      <span className="st-pdp-rating-avg">{avg}</span>
      <span className="st-pdp-rating-count">{ratingCountLabel(rated.ratingCount)}</span>
    </button>
  );
}

/** Product page: rating summary and the shop-approved reviews with customer photos. */
export function StreetReviewsSection({ productId }: { productId: string }) {
  const rated = useContext(StreetReviewsContext)[productId];
  const [showAll, setShowAll] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  if (!rated) return null;
  const photos = rated.reviews.filter((r) => r.photoUrl);
  const shown = showAll ? rated.reviews : rated.reviews.slice(0, REVIEWS_SHOWN_FIRST);

  return (
    <section className="st-section st-reviews" id="st-reviews" aria-label="Customer reviews">
      <div className="st-section-head">
        <h2 className="st-h2">Customer reviews</h2>
      </div>
      <div className="st-reviews-summary">
        <span className="st-reviews-avg">{formatRatingAvg(rated.ratingAvg)}</span>
        <span className="st-reviews-summary-copy">
          <StarRow value={rated.ratingAvg} size={20} />
          <span className="st-reviews-count">
            {ratingCountLabel(rated.ratingCount)} from customers who bought it at the shop
          </span>
        </span>
      </div>

      {photos.length > 0 ? (
        <div className="st-reviews-photos" aria-label="Customer photos">
          {photos.map((r, i) => (
            <button
              key={`${r.photoUrl}-${i}`}
              type="button"
              className="st-reviews-photo"
              aria-label={`Open photo from ${r.name}`}
              onClick={() => setZoom(r.photoUrl)}
            >
              <img
                src={r.photoUrl!}
                alt=""
                loading="lazy"
                decoding="async"
                // A photo that no longer loads is dropped instead of leaving a broken box.
                onError={(e) => e.currentTarget.parentElement?.setAttribute("hidden", "")}
              />
            </button>
          ))}
        </div>
      ) : null}

      {shown.length > 0 ? (
        <ul className="st-reviews-list">
          {shown.map((r, i) => (
            <li className="st-review" key={`${r.name}-${r.date}-${i}`}>
              <div className="st-review-head">
                <StarRow value={r.rating} />
                <span className="st-review-name">{r.name}</span>
                <span className="st-review-verified">✓ Verified buyer</span>
                {reviewDate(r.date) ? <span className="st-review-date">{reviewDate(r.date)}</span> : null}
              </div>
              {r.comment ? <p className="st-review-text">{r.comment}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {rated.reviews.length > REVIEWS_SHOWN_FIRST && !showAll ? (
        <button type="button" className="st-link" onClick={() => setShowAll(true)}>
          Show all {rated.reviews.length} reviews
        </button>
      ) : null}

      {zoom ? (
        <div className="st-reviews-zoom" role="dialog" aria-label="Customer photo" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Customer photo" />
          <button type="button" className="st-reviews-zoom-close" aria-label="Close photo" onClick={() => setZoom(null)}>
            ×
          </button>
        </div>
      ) : null}
    </section>
  );
}
