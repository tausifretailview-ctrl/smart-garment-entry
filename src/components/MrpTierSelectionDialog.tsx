import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Check, IndianRupee, Package } from "lucide-react";
import { posVariantDisplayMrp } from "@/utils/posScanPriceSelection";

export type MrpTierSelectionChoice = {
  id: string;
  productName: string;
  brand?: string | null;
  style?: string | null;
  size?: string | null;
  color?: string | null;
  mrp: number;
  salePrice: number;
  stockQty: number;
};

/** MRP shown on the card when the org uses MRP; falls back to sale price if MRP is unset. */
export function mrpTierDisplayMrp(choice: Pick<MrpTierSelectionChoice, "mrp" | "salePrice">): number {
  return choice.mrp > 0 ? choice.mrp : choice.salePrice;
}

/**
 * Big number on the picker card. When enableMrp is off this MUST be salePrice —
 * never the MRP-preferring fallback. A stale unused MRP (e.g. 200) must not
 * be labeled "Sale price" while the real 500/600 only appear in subtext.
 */
export function mrpTierPrimaryValue(
  choice: Pick<MrpTierSelectionChoice, "mrp" | "salePrice">,
  enableMrp: boolean,
): number {
  return enableMrp ? mrpTierDisplayMrp(choice) : choice.salePrice;
}

export function sortMrpTierChoices(
  choices: MrpTierSelectionChoice[],
  enableMrp: boolean,
): MrpTierSelectionChoice[] {
  const sortValue = (c: MrpTierSelectionChoice) => (enableMrp ? c.mrp : c.salePrice);
  return [...choices].sort(
    (a, b) => sortValue(b) - sortValue(a) || a.productName.localeCompare(b.productName),
  );
}

interface MrpTierSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barcode: string;
  choices: MrpTierSelectionChoice[];
  onSelect: (choiceId: string) => void;
  /** When org MRP feature is off, label the picker by sale price (549 vs 569). */
  enableMrp?: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function MrpTierSelectionDialog({
  open,
  onOpenChange,
  barcode,
  choices,
  onSelect,
  enableMrp = true,
}: MrpTierSelectionDialogProps) {
  const sortedChoices = sortMrpTierChoices(choices, enableMrp);
  const priceLabel = enableMrp ? "MRP" : "Sale price";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-primary" />
            {enableMrp ? "Select MRP" : "Select sale price"}
          </DialogTitle>
          <DialogDescription>
            Barcode <span className="font-mono font-medium text-foreground">{barcode}</span> exists at more than one
            {enableMrp ? " MRP" : " sale price"}. Pick the price printed on the item you are selling.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {sortedChoices.map((choice) => {
            const displayMrp = mrpTierDisplayMrp(choice);
            // When this org doesn't use the MRP field, the number shown and the
            // "Sale price" label must be the actual sale_price — not the MRP
            // fallback value. A stale, unused MRP (e.g. 200, never updated)
            // must never be what's shown here; it isn't what's printed on the
            // item or what the customer is being charged.
            const primaryValue = mrpTierPrimaryValue(choice, enableMrp);
            const sizeLabel = [choice.size, choice.color].filter(Boolean).join(" · ");
            const metaBadges = [choice.brand?.trim(), choice.style?.trim()].filter(Boolean) as string[];

            return (
              <Card
                key={choice.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => onSelect(choice.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium truncate">{choice.productName}</span>
                      </div>
                      {metaBadges.length > 0 || sizeLabel ? (
                        <div className="flex flex-wrap gap-1.5">
                          {metaBadges.map((label) => (
                            <Badge key={label} variant="secondary" className="text-xs">
                              {label}
                            </Badge>
                          ))}
                          {sizeLabel ? (
                            <Badge variant="outline" className="text-xs">
                              {sizeLabel}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Stock: {choice.stockQty.toLocaleString("en-IN")}
                        {enableMrp && choice.salePrice > 0 && choice.salePrice !== displayMrp ? (
                          <> · Sale {formatCurrency(choice.salePrice)}</>
                        ) : null}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <div className="text-lg font-bold text-primary tabular-nums">
                          {formatCurrency(primaryValue)}
                        </div>
                        <div className="text-xs text-muted-foreground">{priceLabel}</div>
                      </div>
                      <Check className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Map product/variant match rows into dialog choices. */
export function toMrpTierSelectionChoices(
  matches: Array<{
    product: {
      product_name?: string | null;
      brand?: string | null;
      style?: string | null;
      default_sale_price?: number | string | null;
    };
    variant: {
      id: string;
      size?: string | null;
      color?: string | null;
      mrp?: number | string | null;
      sale_price?: number | string | null;
      stock_qty?: number | string | null;
    };
  }>,
): MrpTierSelectionChoice[] {
  return matches.map((m) => ({
    id: m.variant.id,
    productName: m.product.product_name?.trim() || "Product",
    brand: m.product.brand,
    style: m.product.style,
    size: m.variant.size,
    color: m.variant.color,
    mrp: posVariantDisplayMrp(m.variant, m.product),
    salePrice: parseFloat(String(m.variant.sale_price ?? 0)) || 0,
    stockQty: Math.round(Number(m.variant.stock_qty ?? 0)),
  }));
}
