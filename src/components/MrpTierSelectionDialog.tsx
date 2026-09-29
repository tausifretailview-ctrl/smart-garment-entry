import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Check, IndianRupee, Package, Plus } from "lucide-react";
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
  /**
   * Purchase only: the item arrived at a price that is not in the list. Called with
   * the card to copy (product / size / colour) and the new prices.
   */
  onAddNewPrice?: (baseChoiceId: string, salePrice: number, mrp: number | null) => void;
}

/** A new price that equals a listed one is that card, not a new price tier. */
export function findChoiceAtPrice(
  choices: MrpTierSelectionChoice[],
  baseChoiceId: string,
  salePrice: number,
  mrp: number | null,
): MrpTierSelectionChoice | null {
  const base = choices.find((c) => c.id === baseChoiceId);
  if (!base) return null;
  const sameItem = (c: MrpTierSelectionChoice) =>
    c.productName === base.productName &&
    (c.brand ?? "") === (base.brand ?? "") &&
    (c.style ?? "") === (base.style ?? "") &&
    (c.size ?? "") === (base.size ?? "") &&
    (c.color ?? "") === (base.color ?? "");
  return (
    choices.find(
      (c) =>
        sameItem(c) &&
        Math.abs(c.salePrice - salePrice) < 0.01 &&
        (mrp == null || mrp <= 0 || Math.abs(c.mrp - mrp) < 0.01),
    ) ?? null
  );
}

const choiceLabel = (c: MrpTierSelectionChoice) =>
  [c.productName, c.brand, c.style, [c.size, c.color].filter(Boolean).join(" · ")]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");

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
  onAddNewPrice,
}: MrpTierSelectionDialogProps) {
  const sortedChoices = sortMrpTierChoices(choices, enableMrp);
  const priceLabel = enableMrp ? "MRP" : "Sale price";
  const [baseId, setBaseId] = useState("");
  const [newSale, setNewSale] = useState("");
  const [newMrp, setNewMrp] = useState("");

  useEffect(() => {
    if (!open) return;
    setBaseId(sortedChoices[0]?.id ?? "");
    setNewSale("");
    setNewMrp("");
    // Reset only when the dialog opens for a barcode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, barcode]);

  const salePriceValue = Number(newSale);
  const mrpValue = newMrp.trim() ? Number(newMrp) : null;
  const canAddNewPrice =
    !!baseId && salePriceValue > 0 && (mrpValue == null || mrpValue >= salePriceValue);

  const submitNewPrice = () => {
    if (!onAddNewPrice || !canAddNewPrice) return;
    const existing = findChoiceAtPrice(choices, baseId, salePriceValue, mrpValue);
    if (existing) {
      onSelect(existing.id);
      return;
    }
    onAddNewPrice(baseId, salePriceValue, mrpValue);
  };

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

        {onAddNewPrice ? (
          <div className="mt-3 space-y-2 rounded-lg border border-dashed p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4 text-primary" />
              New price (same barcode)
            </div>
            {sortedChoices.length > 1 ? (
              <select
                aria-label="Item for the new price"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
              >
                {sortedChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {choiceLabel(c)} — now {formatCurrency(c.salePrice)}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="mrp-tier-new-sale" className="text-xs">
                  Sale price
                </Label>
                <Input
                  id="mrp-tier-new-sale"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={newSale}
                  onChange={(e) => setNewSale(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNewPrice();
                  }}
                />
              </div>
              {enableMrp ? (
                <div className="flex-1 space-y-1">
                  <Label htmlFor="mrp-tier-new-mrp" className="text-xs">
                    MRP
                  </Label>
                  <Input
                    id="mrp-tier-new-mrp"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={newMrp}
                    onChange={(e) => setNewMrp(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitNewPrice();
                    }}
                  />
                </div>
              ) : null}
              <Button type="button" disabled={!canAddNewPrice} onClick={submitNewPrice}>
                Add
              </Button>
            </div>
            {mrpValue != null && salePriceValue > 0 && mrpValue < salePriceValue ? (
              <p className="text-xs text-destructive">MRP cannot be below the sale price.</p>
            ) : null}
          </div>
        ) : null}
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
