import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronUp, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchSaleLineCost } from "@/lib/saleLineLandingCost";
import { cn } from "@/lib/utils";

const rupees = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatBillDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Small ▲ on a Sale Bill line's Rate box: purchase rate and landing cost (without and with GST)
 * from the product's latest purchase bill. Read only when opened, so billing is not slowed.
 * Rendered only for users allowed to see cost (owner, or the User Rights permission).
 */
export function SaleLineCostPopover({
  organizationId,
  variantId,
  productName,
  className,
}: {
  organizationId: string;
  variantId: string;
  productName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sale-line-cost", organizationId, variantId],
    queryFn: () => fetchSaleLineCost(organizationId, variantId),
    enabled: open && !!organizationId && !!variantId,
    staleTime: 5 * 60_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Purchase rate and landing cost of ${productName}`}
          title="Purchase rate & landing cost"
          data-testid="sale-line-cost-button"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-500 shadow-sm hover:border-primary hover:text-primary",
            open && "border-primary bg-primary text-white hover:text-white",
            className,
          )}
        >
          <ChevronUp className="h-3 w-3" strokeWidth={3} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-[19rem] p-3"
        data-testid="sale-line-cost-popover"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-2 truncate text-xs font-semibold text-slate-500" title={productName}>
          {productName}
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading cost…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Could not load the purchase cost. Try again.</p>
        ) : !data || data.source === "none" ? (
          <p className="text-sm text-muted-foreground">No purchase rate found for this item.</p>
        ) : (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="whitespace-nowrap text-slate-600">Purchase rate</dt>
              <dd className="font-semibold tabular-nums" data-testid="sale-line-cost-rate">{rupees(data.purchaseRate)}</dd>
            </div>
            {data.source === "purchase" ? (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="whitespace-nowrap text-slate-600">Landing cost (without GST)</dt>
                  <dd className="font-semibold tabular-nums" data-testid="sale-line-landing-ex">{rupees(data.landingWithoutGst)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="whitespace-nowrap text-slate-600">Landing cost (with GST)</dt>
                  <dd className="font-bold tabular-nums text-primary" data-testid="sale-line-landing-inc">{rupees(data.landingWithGst)}</dd>
                </div>
                <p className="border-t pt-1.5 text-[11px] leading-snug text-muted-foreground">
                  From {data.billNo || "purchase bill"}
                  {data.supplierName ? ` · ${data.supplierName}` : ""}
                  {data.billDate ? ` · ${formatBillDate(data.billDate)}` : ""}. Includes its share of the bill's
                  discount and other charges.
                </p>
              </>
            ) : (
              <p className="border-t pt-1.5 text-[11px] leading-snug text-muted-foreground">
                Not bought on a purchase bill yet (opening stock): landing cost not known.
              </p>
            )}
          </dl>
        )}
      </PopoverContent>
    </Popover>
  );
}
