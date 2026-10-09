import { useEffect, useRef, useState } from "react";
import { SuccessTick } from "./AppChrome";
import { accountErrorMessage, rateBill, type BillReview } from "../lib/account";

export const RATING_TAGS = ["Quality", "Prices", "Staff", "Variety", "Billing speed"];
const EDIT_DAYS = 7;

/** "⭐ Rate shopping" on a bill notification opens the bill with #rate: bring the stars into view. */
export function useScrollToRate(ready: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ready || window.location.hash !== "#rate") return;
    const id = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    return () => window.clearTimeout(id);
  }, [ready]);
  return ref;
}

export function StarsText({ rating }: { rating: number }) {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className="c-star-text" aria-label={`${n} of 5 stars`}>
      {"★".repeat(n)}
      <span className="off">{"★".repeat(5 - n)}</span>
    </span>
  );
}

function canEdit(review: BillReview): boolean {
  if (review.source.toLowerCase().startsWith("whatsapp")) return false;
  const t = Date.parse(review.created_at);
  return Number.isFinite(t) && Date.now() - t < EDIT_DAYS * 86_400_000;
}

/** "How was your shopping?" on a logged-in customer's bill: stars, tags and a comment. */
export default function RateCard({
  saleId,
  review,
  onSaved,
}: {
  saleId: string;
  review: BillReview | null;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(!review);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [tags, setTags] = useState<string[]>(review?.tags ?? []);
  const [comment, setComment] = useState(review?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useScrollToRate(true);

  const submit = async () => {
    if (!rating) {
      setMsg("Please tap a star first.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await rateBill(saleId, rating, tags, comment.trim());
      setSaved(true);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setMsg(accountErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const shown = saved ? rating : (review?.rating ?? rating);
    return (
      <div className="c-card c-center no-print" id="rate" ref={ref}>
        <SuccessTick size={40} />
        <b>{saved ? "Thanks for your review!" : "You rated this bill"}</b>
        <div className="c-rate-done">
          <StarsText rating={shown} />
        </div>
        {!saved && review?.comment ? <p className="c-muted">“{review.comment}”</p> : null}
        {!saved && review && canEdit(review) ? (
          <button type="button" className="c-btn c-btn-ghost" onClick={() => setEditing(true)}>
            Change rating
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="c-card no-print" id="rate" ref={ref}>
      <b>How was your shopping?</b>
      <p className="c-muted">Your honest review helps the shop serve you better.</p>
      <div className="c-stars">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" aria-label={`${s} star`} className={s <= rating ? "on" : ""} onClick={() => setRating(s)}>
            ★
          </button>
        ))}
      </div>
      <div className="c-tags">
        {RATING_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            className={tags.includes(t) ? "on" : ""}
            onClick={() => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        className="c-input"
        rows={2}
        maxLength={500}
        placeholder="Anything we should know? (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button type="button" className="c-btn" disabled={saving} onClick={() => void submit()}>
        {saving ? "Sending…" : "Submit review"}
      </button>
      {msg ? <p className="c-hint">{msg}</p> : null}
    </div>
  );
}
