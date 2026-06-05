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
  onAdd: (data: {
    code: string;
    quantity: number;
    mrp: number;
    description?: string;
  }) => void;
}

export const QuickServiceProductDialog = ({
  open,
  onOpenChange,
  serviceCode,
  productName,
  defaultMrp,
  onAdd,
}: QuickServiceProductDialogProps) => {
  const [quantity, setQuantity] = useState(1);
  const [mrp, setMrp] = useState<string>("");
  const [description, setDescription] = useState("");
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const mrpInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMrp(defaultMrp && defaultMrp > 0 ? String(defaultMrp) : "");
      setDescription("");
      setQuantity(1);
      setTimeout(() => {
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select();
      }, 100);
    }
  }, [open, defaultMrp]);

  const handleSubmit = () => {
    const mrpValue = parseFloat(mrp);
    if (!mrpValue || mrpValue <= 0) return;
    if (quantity <= 0) return;
    onAdd({
      code: serviceCode,
      quantity,
      mrp: mrpValue,
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
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              onKeyDown={handleQuantityKeyDown}
            onFocus={(e) => e.currentTarget.select()}
              className="h-9 mt-1"
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
            disabled={!mrp || parseFloat(mrp) <= 0}
            className="w-full h-9"
          >
            Add to Cart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
