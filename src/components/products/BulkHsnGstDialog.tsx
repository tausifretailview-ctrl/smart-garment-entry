import { useEffect, useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  isValidHsn,
  normalizeColorInput,
  normalizeHsnInput,
  PRODUCT_GST_RATES,
  updateProductsHsnGst,
  type ProductHsnGstResult,
} from "@/lib/data/productHsnGstBulk";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null | undefined;
  productIds: string[];
  /** Called after a successful update (how many changed, how many kept their colours). */
  onUpdated: (result: ProductHsnGstResult) => void;
  onError: (message: string) => void;
};

/** Product Dashboard: set HSN, GST % and / or colour on the selected products in one go. */
export function BulkHsnGstDialog({ open, onOpenChange, organizationId, productIds, onUpdated, onError }: Props) {
  const [changeHsn, setChangeHsn] = useState(false);
  const [hsn, setHsn] = useState("");
  const [changeGst, setChangeGst] = useState(false);
  const [gst, setGst] = useState("5");
  const [changeColor, setChangeColor] = useState(false);
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChangeHsn(false);
    setHsn("");
    setChangeGst(false);
    setGst("5");
    setChangeColor(false);
    setColor("");
  }, [open]);

  const hsnError = changeHsn && !isValidHsn(hsn) ? "Enter 2 to 8 digits." : null;
  const colorValue = normalizeColorInput(color);
  const colorError = changeColor && !colorValue ? "Enter a colour." : null;
  const canSave =
    !!organizationId &&
    productIds.length > 0 &&
    (changeHsn || changeGst || changeColor) &&
    !hsnError &&
    !colorError &&
    !saving;

  const save = async () => {
    if (!canSave || !organizationId) return;
    setSaving(true);
    try {
      const result = await updateProductsHsnGst({
        organizationId,
        productIds,
        patch: {
          ...(changeHsn ? { hsn } : {}),
          ...(changeGst ? { gstPercent: Number(gst) } : {}),
          ...(changeColor ? { color: colorValue } : {}),
        },
      });
      onUpdated(result);
      onOpenChange(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update the products.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Edit HSN / GST / Colour
          </DialogTitle>
          <DialogDescription>
            {productIds.length} product{productIds.length === 1 ? "" : "s"} selected. New bills use the new values;
            bills already saved keep theirs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="bulk-hsn-on" checked={changeHsn} onCheckedChange={(c) => setChangeHsn(!!c)} />
              <Label htmlFor="bulk-hsn-on" className="font-medium">Change HSN code</Label>
            </div>
            <Input
              inputMode="numeric"
              placeholder="e.g. 6109"
              value={hsn}
              disabled={!changeHsn}
              onChange={(e) => setHsn(normalizeHsnInput(e.target.value))}
              aria-invalid={!!hsnError}
            />
            {hsnError && <p className="text-xs text-destructive">{hsnError}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="bulk-gst-on" checked={changeGst} onCheckedChange={(c) => setChangeGst(!!c)} />
              <Label htmlFor="bulk-gst-on" className="font-medium">Change GST %</Label>
            </div>
            <Select value={gst} onValueChange={setGst} disabled={!changeGst}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_GST_RATES.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Sets the product, sale and purchase GST % together.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox id="bulk-color-on" checked={changeColor} onCheckedChange={(c) => setChangeColor(!!c)} />
              <Label htmlFor="bulk-color-on" className="font-medium">Change colour</Label>
            </div>
            <Input
              placeholder="e.g. NAVY BLUE"
              value={color}
              disabled={!changeColor}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              aria-invalid={!!colorError}
            />
            {colorError && <p className="text-xs text-destructive">{colorError}</p>}
            <p className="text-xs text-muted-foreground">
              Sets the colour on every size / barcode. Products sold in more than one colour are left as they are
              — change those per size in Product Entry.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update {productIds.length} product{productIds.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
