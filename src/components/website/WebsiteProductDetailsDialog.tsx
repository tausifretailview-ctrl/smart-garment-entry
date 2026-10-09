import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  WEBSITE_DESCRIPTION_MAX,
  WEBSITE_NAME_MAX,
  cleanWebsiteDescription,
  cleanWebsiteName,
} from "@/lib/websiteProductDetails";

export type WebsiteProductDetailsValues = {
  display_name: string | null;
  description: string | null;
  /** Raw text from the price box; "" means use the ERP price. */
  price: string;
};

/**
 * Edit what the store shows for one product: website name, price and a
 * description for the product page. ERP product data is not touched.
 */
export function WebsiteProductDetailsDialog({
  open,
  onOpenChange,
  erpName,
  erpPriceLabel,
  initial,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  erpName: string;
  erpPriceLabel?: string;
  initial: WebsiteProductDetailsValues;
  saving?: boolean;
  onSave: (values: WebsiteProductDetailsValues) => void;
}) {
  const [name, setName] = useState(initial.display_name ?? "");
  const [price, setPrice] = useState(initial.price);
  const [description, setDescription] = useState(initial.description ?? "");

  useEffect(() => {
    if (!open) return;
    setName(initial.display_name ?? "");
    setPrice(initial.price);
    setDescription(initial.description ?? "");
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const priceInvalid = price.trim() !== "" && !(Number(price) >= 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Edit website details</DialogTitle>
          <DialogDescription>
            {erpName} · changes show only on your store, not in billing or stock.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (priceInvalid) return;
            onSave({
              display_name: cleanWebsiteName(name),
              description: cleanWebsiteDescription(description),
              price: price.trim(),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="wpd-name">Name on website</Label>
            <Input
              id="wpd-name"
              value={name}
              maxLength={WEBSITE_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder={erpName}
            />
            <p className="text-xs text-muted-foreground">Leave blank to use the ERP name.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wpd-price">Website price (₹)</Label>
            <Input
              id="wpd-price"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={erpPriceLabel ? `Same as ERP (${erpPriceLabel})` : "Same as ERP"}
              className="font-mono"
            />
            {priceInvalid ? <p className="text-xs text-destructive">Enter a valid price.</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wpd-desc">Description</Label>
            <Textarea
              id="wpd-desc"
              value={description}
              maxLength={WEBSITE_DESCRIPTION_MAX}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Fabric, work, fit, what is included (e.g. kurta, pant and dupatta), wash care…"
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              Shown on the product page. {description.length}/{WEBSITE_DESCRIPTION_MAX}
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || priceInvalid}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Save details
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
