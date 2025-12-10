import { useState, useEffect, useRef, useMemo } from "react";
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
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Get unique colors from variants
  const uniqueColors = useMemo(() => {
    const colors = new Set<string>();
    variants.forEach((v) => {
      if (v.color) colors.add(v.color);
    });
    return Array.from(colors);
  }, [variants]);

  // Check if product has multiple colors
  const hasMultipleColors = uniqueColors.length > 1;

  // Filter variants by selected color
  const filteredVariants = useMemo(() => {
    if (!hasMultipleColors || !selectedColor) {
      // If single color or no color selection, show all
      return hasMultipleColors ? [] : variants;
    }
    return variants.filter((v) => v.color === selectedColor);
  }, [variants, selectedColor, hasMultipleColors]);

  // Reset quantities and color selection when dialog opens with new product
  useEffect(() => {
    if (open) {
      setSizeQty({});
      setSelectedColor(null);
      // If only one color, auto-select it
      if (uniqueColors.length === 1) {
        setSelectedColor(uniqueColors[0]);
      }
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [open, product?.id, uniqueColors]);

  // Focus first input when color is selected
  useEffect(() => {
    if (selectedColor && filteredVariants.length > 0) {
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [selectedColor, filteredVariants.length]);

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
      for (const [sizeKey, qtyStr] of entries) {
        const qty = Number(qtyStr);
        if (qty > 0) {
          // sizeKey format: "variantId" or just size for single-color products
          const variant = filteredVariants.find((v) => v.id === sizeKey) || 
                         filteredVariants.find((v) => v.size === sizeKey);
          const stockQty = variant?.stock_qty || 0;
          if (qty > stockQty) {
            toast({
              title: "Insufficient Stock",
              description: `${product?.product_name} (${variant?.size}): Only ${stockQty} available, requested ${qty}`,
              variant: "destructive",
            });
            return;
          }
        }
      }
    }

    // Build items array
    const items: Array<{ variant: Variant; qty: number }> = [];
    for (const [sizeKey, qtyStr] of entries) {
      const qty = Number(qtyStr);
      if (qty > 0) {
        // Find variant by ID first, then by size for backward compatibility
        const variant = filteredVariants.find((v) => v.id === sizeKey) || 
                       filteredVariants.find((v) => v.size === sizeKey);
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

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    setSizeQty({}); // Reset quantities when color changes
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
          {selectedColor && (
            <Badge variant="outline" className="mt-1">{selectedColor}</Badge>
          )}
        </div>

        {/* Color Selection - Show only if multiple colors exist */}
        {hasMultipleColors && !selectedColor && (
          <div className="mb-4">
            <Label className="mb-2 block">Select Color</Label>
            <div className="flex flex-wrap gap-2">
              {uniqueColors.map((color) => (
                <Button
                  key={color}
                  variant="outline"
                  className="min-w-[80px]"
                  onClick={() => handleColorSelect(color)}
                >
                  {color}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Size Grid - Show only when color is selected or single color product */}
        {(selectedColor || !hasMultipleColors) && filteredVariants.length > 0 && (
          <>
            {/* Back to color selection button */}
            {hasMultipleColors && selectedColor && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="mb-2"
                onClick={() => {
                  setSelectedColor(null);
                  setSizeQty({});
                }}
              >
                ← Change Color
              </Button>
            )}

            <div className="flex gap-3 mb-4 flex-wrap">
              {filteredVariants.map((v, index) => (
                <div key={v.id} className="flex flex-col items-center gap-1">
                  <span className="text-sm font-medium">{v.size}</span>
                  <input
                    ref={index === 0 ? firstInputRef : undefined}
                    type="number"
                    min="0"
                    className="w-16 text-center border rounded p-2 bg-background"
                    value={sizeQty[v.id] || ""}
                    onChange={(e) =>
                      setSizeQty({ ...sizeQty, [v.id]: e.target.value })
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

            {filteredVariants.length > 0 && filteredVariants[0].sale_price && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="space-y-2">
                  <Label>Sale Price (MRP)</Label>
                  <Input
                    type="number"
                    value={filteredVariants[0].sale_price || 0}
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

            {/* Total Quantity Summary */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
              <span className="font-medium">Total Quantity:</span>
              <span className="text-xl font-bold text-primary">
                {Object.values(sizeQty).reduce((sum, qty) => sum + (Number(qty) || 0), 0)}
              </span>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel (Esc)
          </Button>
          {(selectedColor || !hasMultipleColors) && filteredVariants.length > 0 && (
            <Button onClick={handleConfirm}>
              Confirm (Enter)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
