import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface QuickServiceProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceCode: string;
  productName?: string;
  /** Pre-fill MRP from product/variant master (sale price or MRP set at product entry). */
  defaultMrp?: number;
  /** Show Discount (₹) field — used for regular goods qty dialog; service codes may hide it. */
  showDiscountField?: boolean;
  /** Quantity pre-filled when the popup opens (Settings > Reports > Service product default qty). */
  defaultQuantity?: number;
  onAdd: (data: {
    code: string;
    quantity: number;
    mrp: number;
    discountAmount?: number;
    description?: string;
  }) => void;
}

export const QuickServiceProductDialog = ({
  open,
  onOpenChange,
  serviceCode,
  productName,
  defaultMrp,
  showDiscountField = false,
  defaultQuantity = 1,
  onAdd,
}: QuickServiceProductDialogProps) => {
  const defaultQtyText = String(Number.isFinite(defaultQuantity) && defaultQuantity >= 1 ? Math.floor(defaultQuantity) : 1);
  const [quantity, setQuantity] = useState(defaultQtyText);
  const [mrp, setMrp] = useState<string>("");
  const [discountAmount, setDiscountAmount] = useState<string>("");
  const [description, setDescription] = useState("");
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const mrpInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMrp(defaultMrp && defaultMrp > 0 ? String(defaultMrp) : "");
      setDiscountAmount("");
      setDescription("");
      setQuantity(defaultQtyText);
      setTimeout(() => {
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select();
      }, 100);
    }
  }, [open, defaultMrp, defaultQtyText]);

  const parsedQuantity = parseInt(quantity, 10);

  const handleSubmit = () => {
    const mrpValue = parseFloat(mrp);
    if (!mrpValue || mrpValue <= 0) return;
    const qty = parsedQuantity;
    if (!Number.isFinite(qty) || qty <= 0) return;
    const disc = showDiscountField ? parseFloat(discountAmount) || 0 : 0;
    onAdd({
      code: serviceCode,
      quantity: qty,
      mrp: mrpValue,
      discountAmount: disc > 0 ? disc : undefined,
      description: description.trim() || undefined,
    });
  };

  const handleQuantityKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      mrpInputRef.current?.focus();
    }
  };

  const handleMrpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      if (showDiscountField) {
        discountInputRef.current?.focus();
      } else {
        descriptionRef.current?.focus();
      }
    }
  };

  const handleDiscountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      descriptionRef.current?.focus();
    }
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs p-5 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-base">
            {productName ? productName : `Quick Service Item #${serviceCode}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Quantity</Label>
            <Input
              ref={quantityInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={quantity}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, "");
                setQuantity(next);
              }}
              onBlur={() => {
                if (!quantity.trim() || parsedQuantity <= 0) {
                  setQuantity(defaultQtyText);
                }
              }}
              onKeyDown={handleQuantityKeyDown}
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 mt-1 tabular-nums"
            />
          </div>
          <div>
            <Label className="text-xs">MRP / Price</Label>
            <Input
              ref={mrpInputRef}
              type="number"
              min={0}
              step="0.01"
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              onKeyDown={handleMrpKeyDown}
              placeholder="Enter price"
              className="h-9 mt-1"
            />
          </div>
          {showDiscountField && (
            <div>
              <Label className="text-xs">Discount (₹)</Label>
              <Input
                ref={discountInputRef}
                type="number"
                min={0}
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                onKeyDown={handleDiscountKeyDown}
                placeholder="Line discount in rupees"
                className="h-9 mt-1"
              />
            </div>
          )}
          <div>
            <Label className="text-xs">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              ref={descriptionRef}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleDescriptionKeyDown}
              placeholder="Design no, brand, barcode..."
              className="h-9 mt-1"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!mrp || parseFloat(mrp) <= 0 || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0}
            className="w-full h-9"
          >
            Add to Cart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
