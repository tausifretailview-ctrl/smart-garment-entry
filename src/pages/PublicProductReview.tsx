import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Camera, CheckCircle2, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  REVIEW_COMMENT_MAX,
  loadReviewForm,
  submitProductReview,
  uploadReviewPhoto,
  type ReviewFormItem,
} from "@/lib/productReviews";
import { cn } from "@/lib/utils";

/** Five tappable stars. */
function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={`${label} rating`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(n)}
          className="rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <Star className={cn("h-8 w-8", n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
        </button>
      ))}
    </div>
  );
}

function statusLine(status: ReviewFormItem["status"]): string | null {
  if (status === "approved") return "Your review is on the store. Saving a change sends it for approval again.";
  if (status === "pending") return "Sent. It will show on the store after the shop approves it.";
  if (status === "hidden") return "You have reviewed this product. You can change your review below.";
  return null;
}

function ProductReviewCard({ saleId, item }: { saleId: string; item: ReviewFormItem }) {
  const [rating, setRating] = useState(item.rating ?? 0);
  const [comment, setComment] = useState(item.comment ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(item.photo_url);
  const [status, setStatus] = useState(item.status);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onPhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      setPhotoUrl(await uploadReviewPhoto(saleId, item.product_id, file));
      setJustSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (rating < 1) {
      setError("Please choose 1 to 5 stars.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await submitProductReview({ saleId, productId: item.product_id, rating, comment, photoUrl });
      setStatus("pending");
      setJustSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your review could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const note = justSaved ? "Thank you! It will show on the store after the shop approves it." : statusLine(status);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        {item.photo ? (
          <img src={item.photo} alt="" className="h-16 w-12 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="h-16 w-12 shrink-0 rounded-md bg-slate-100" />
        )}
        <h2 className="min-w-0 flex-1 text-base font-semibold text-slate-900">{item.name}</h2>
      </div>

      <div className="mt-3">
        <StarPicker
          value={rating}
          label={item.name}
          onChange={(n) => {
            setRating(n);
            setJustSaved(false);
          }}
        />
      </div>

      <Textarea
        className="no-uppercase mt-3"
        rows={3}
        maxLength={REVIEW_COMMENT_MAX}
        placeholder="How was the fit, fabric and colour? (optional)"
        value={comment}
        onChange={(e) => {
          setComment(e.target.value);
          setJustSaved(false);
        }}
        aria-label={`${item.name} comment`}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onPhoto(e.target.files)}
        />
        {photoUrl ? <img src={photoUrl} alt="Your photo" className="h-16 w-16 rounded-md object-cover" /> : null}
        <Button type="button" variant="outline" size="sm" disabled={uploading || saving} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
          {uploading ? "Uploading…" : photoUrl ? "Change photo" : "Add a photo"}
        </Button>
        <Button type="button" size="sm" className="ml-auto" disabled={saving || uploading} onClick={() => void save()}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {status ? "Save changes" : "Send review"}
        </Button>
      </div>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {!error && note ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {note}
        </p>
      ) : null}
    </li>
  );
}

/** Public page: a customer rates the products on their bill (link sent by the shop). */
export default function PublicProductReview() {
  const { saleId } = useParams<{ saleId: string }>();
  const formQuery = useQuery({
    queryKey: ["public-review-form", saleId],
    enabled: !!saleId,
    retry: false,
    staleTime: 60_000,
    queryFn: () => loadReviewForm(saleId!),
  });

  useEffect(() => {
    document.title = formQuery.data ? `Rate your products · ${formQuery.data.shopName}` : "Rate your products";
  }, [formQuery.data]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-lg">
        {formQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading your bill…
          </div>
        ) : formQuery.error || !formQuery.data ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <h1 className="text-lg font-semibold text-slate-900">This review link could not be opened</h1>
            <p className="mt-1 text-sm text-slate-600">
              {formQuery.error instanceof Error ? formQuery.error.message : "Bill not found"}
            </p>
          </div>
        ) : (
          <>
            <header className="mb-4">
              <p className="text-sm font-medium text-slate-500">{formQuery.data.shopName}</p>
              <h1 className="text-xl font-bold text-slate-900">Rate your products</h1>
              <p className="mt-1 text-sm text-slate-600">
                {formQuery.data.saleNumber ? `Bill ${formQuery.data.saleNumber}. ` : ""}
                Tap the stars, add a line and a photo if you like. Your first name is shown with the review.
              </p>
            </header>
            {formQuery.data.items.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
                There are no products to review on this bill.
              </p>
            ) : (
              <ul className="space-y-3">
                {formQuery.data.items.map((item) => (
                  <ProductReviewCard key={item.product_id} saleId={saleId!} item={item} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
