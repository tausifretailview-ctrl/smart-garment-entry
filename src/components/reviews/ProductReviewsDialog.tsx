import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, EyeOff, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchInIdBatches } from "@/lib/data/fetchInIdBatches";
import {
  fetchShopProductReviews,
  setProductReviewStatus,
  type ReviewStatus,
  type ShopProductReview,
} from "@/lib/productReviews";
import { cn } from "@/lib/utils";

type Row = ShopProductReview & { product_name: string; sale_number: string | null };

async function loadRows(orgId: string, status: ReviewStatus): Promise<Row[]> {
  const reviews = await fetchShopProductReviews(orgId, status);
  if (reviews.length === 0) return [];
  const [products, sales] = await Promise.all([
    fetchInIdBatches<{ id: string; product_name: string | null }>(
      reviews.map((r) => r.product_id),
      (batch) => supabase.from("products").select("id, product_name").eq("organization_id", orgId).in("id", batch).order("id"),
    ),
    fetchInIdBatches<{ id: string; sale_number: string | null }>(
      reviews.map((r) => r.sale_id),
      (batch) => supabase.from("sales").select("id, sale_number").eq("organization_id", orgId).in("id", batch).order("id"),
    ),
  ]);
  const productName = new Map(products.map((p) => [p.id, p.product_name || "Product"]));
  const saleNumber = new Map(sales.map((s) => [s.id, s.sale_number]));
  return reviews.map((r) => ({
    ...r,
    product_name: productName.get(r.product_id) ?? "Product",
    sale_number: saleNumber.get(r.sale_id) ?? null,
  }));
}

const TABS: Array<{ id: ReviewStatus; label: string; empty: string }> = [
  { id: "pending", label: "Waiting for approval", empty: "No reviews are waiting." },
  { id: "approved", label: "On the store", empty: "No approved reviews yet." },
  { id: "hidden", label: "Hidden", empty: "No hidden reviews." },
];

/**
 * Website product reviews: customers' star ratings, comments and photos for products on their
 * bill. A review shows on the public store only after it is approved here.
 */
export function ProductReviewsDialog({
  open,
  onOpenChange,
  orgId,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId?: string;
  userId?: string | null;
}) {
  const [tab, setTab] = useState<ReviewStatus>("pending");
  const queryClient = useQueryClient();
  const rowsQuery = useQuery({
    queryKey: ["product-reviews", orgId, tab],
    enabled: open && !!orgId,
    staleTime: 30_000,
    queryFn: () => loadRows(orgId!, tab),
  });

  const moderate = useMutation({
    mutationFn: (input: { id: string; status: "approved" | "hidden" }) =>
      setProductReviewStatus(orgId!, input.id, input.status, userId),
    onSuccess: (_d, input) => {
      toast.success(input.status === "approved" ? "Review approved. It now shows on the store." : "Review hidden.");
      void queryClient.invalidateQueries({ queryKey: ["product-reviews", orgId] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not update the review"),
  });

  const rows = rowsQuery.data ?? [];
  const current = TABS.find((t) => t.id === tab)!;
  const loadFailed = rowsQuery.error != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Product reviews (website)</DialogTitle>
          <DialogDescription>
            Customers rate products from the review link on their bill. A review shows on your store only after you
            approve it. To ask for one, use “Send review link (WhatsApp)” on a bill in the POS or Sales dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Button key={t.id} size="sm" variant={tab === t.id ? "default" : "outline"} onClick={() => setTab(t.id)}>
              {t.label}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rowsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : loadFailed ? (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              Product reviews are not set up on this database yet. Run the product reviews migration
              (20270501120000_product_reviews.sql), then open this again.
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              {current.empty}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-lg border bg-card p-3">
                  {r.photo_url ? (
                    <a href={r.photo_url} target="_blank" rel="noreferrer" title="Open photo">
                      <img src={r.photo_url} alt="Customer photo" className="h-20 w-20 rounded-md object-cover" />
                    </a>
                  ) : (
                    <span className="flex h-20 w-20 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                      No photo
                    </span>
                  )}
                  <div className="min-w-[12rem] flex-1">
                    <div className="font-semibold">{r.product_name}</div>
                    <div className="mt-0.5 inline-flex" aria-label={`${r.rating} of 5 stars`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className={cn("h-4 w-4", i <= r.rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
                      ))}
                    </div>
                    {r.comment ? <p className="mt-1 text-sm">{r.comment}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.reviewer_name || "Customer"}
                      {r.sale_number ? ` · Bill ${r.sale_number}` : ""} · {format(new Date(r.created_at), "dd-MM-yyyy")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {r.status !== "approved" ? (
                      <Button
                        size="sm"
                        disabled={moderate.isPending}
                        onClick={() => moderate.mutate({ id: r.id, status: "approved" })}
                      >
                        <Check className="mr-1 h-4 w-4" /> Approve
                      </Button>
                    ) : null}
                    {r.status !== "hidden" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={moderate.isPending}
                        onClick={() => moderate.mutate({ id: r.id, status: "hidden" })}
                      >
                        <EyeOff className="mr-1 h-4 w-4" /> Hide
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
