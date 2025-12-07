import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Variant {
  id: string;
  size: string;
  stock_qty?: number;
  sale_price?: number;
  color?: string;
  barcode?: string;
}

interface Product {
  id: string;
  product_name: string;
  gst_per?: number;
  hsn_code?: string;
  color?: string;
  product_type?: string;
}

interface SizeGridDialogProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  variants: Variant[];
  onConfirm: (items: Array<{ variant: Variant; qty: number }>) => void;
  showStock?: boolean;
  validateStock?: boolean;
  title?: string;
}

export function SizeGridDialog({
  open,
  onClose,
  product,
  variants,
  onConfirm,
  showStock = false,
  validateStock = false,
  title = "Enter Size-wise Qty",
}: SizeGridDialogProps) {
  const { toast } = useToast();
  const [sizeQty, setSizeQty] = useState<{ [size: string]: string }>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset quantities when dialog opens with new product
  useEffect(() => {
    if (open) {
      setSizeQty({});
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [open, product?.id]);

  const handleConfirm = () => {
    const entries = Object.entries(sizeQty);
    const hasQty = entries.some(([_, qty]) => Number(qty) > 0);

    if (!hasQty) {
      toast({
        title: "No Items",
        description: "Please enter quantities for at least one size",
        variant: "destructive",
      });
      return;
    }

    // Validate stock if required
    if (validateStock) {
      for (const [size, qtyStr] of entries) {
        const qty = Number(qtyStr);
        if (qty > 0) {
          const variant = variants.find((v) => v.size === size);
          const stockQty = variant?.stock_qty || 0;
          if (qty > stockQty) {
            toast({
              title: "Insufficient Stock",
              description: `${product?.product_name} (${size}): Only ${stockQty} available, requested ${qty}`,
              variant: "destructive",
            });
            return;
          }
        }
      }
    }

    // Build items array
    const items: Array<{ variant: Variant; qty: number }> = [];
    for (const [size, qtyStr] of entries) {
      const qty = Number(qtyStr);
      if (qty > 0) {
        const variant = variants.find((v) => v.size === size);
        if (variant) {
          items.push({ variant, qty });
        }
      }
    }

    onConfirm(items);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-4xl"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <h3 className="font-semibold text-lg">{product.product_name}</h3>
          {product.color && (
            <Badge variant="outline" className="mt-1">{product.color}</Badge>
          )}
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          {variants.map((v, index) => (
            <div key={v.id} className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium">{v.size}</span>
              <input
                ref={index === 0 ? firstInputRef : undefined}
                type="number"
                min="0"
                className="w-16 text-center border rounded p-2 bg-background"
                value={sizeQty[v.size] || ""}
                onChange={(e) =>
                  setSizeQty({ ...sizeQty, [v.size]: e.target.value })
                }
                placeholder="0"
              />
              {showStock && (
                <span className={`text-xs ${(v.stock_qty || 0) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  Stock: {v.stock_qty || 0}
                </span>
              )}
            </div>
          ))}
        </div>

        {variants.length > 0 && variants[0].sale_price && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="space-y-2">
              <Label>Sale Price (MRP)</Label>
              <Input
                type="number"
                value={variants[0].sale_price || 0}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>GST %</Label>
              <Input
                type="number"
                value={product.gst_per || 0}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel (Esc)
          </Button>
          <Button onClick={handleConfirm}>
            Confirm (Enter)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
