import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";

interface Variant {
  id: string;
  size: string;
  stock_qty?: number;
  sale_price?: number;
  color?: string;
  barcode?: string;
  isCustomSize?: boolean;
}

interface Product {
  id: string;
  product_name: string;
  gst_per?: number;
  hsn_code?: string;
  color?: string;
  product_type?: string;
  default_sale_price?: number;
}

interface CustomSizeEntry {
  id: string;
  size: string;
  qty: number;
  rate: number;
}

interface SalesmanSizeGridDialogProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  variants: Variant[];
  onConfirm: (items: Array<{ variant: Variant; qty: number }>) => void;
  showStock?: boolean;
  validateStock?: boolean;
  title?: string;
}

export function SalesmanSizeGridDialog({
  open,
  onClose,
  product,
  variants,
  onConfirm,
  showStock = false,
  validateStock = false,
  title = "Enter Size-wise Qty",
}: SalesmanSizeGridDialogProps) {
  const { toast } = useToast();
  const [sizeQty, setSizeQty] = useState<{ [size: string]: string }>({});
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [customSizes, setCustomSizes] = useState<CustomSizeEntry[]>([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newSize, setNewSize] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newRate, setNewRate] = useState("");
  const firstInputRef = useRef<HTMLInputElement>(null);
  const customSizeInputRef = useRef<HTMLInputElement>(null);

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
      return hasMultipleColors ? [] : variants;
    }
    return variants.filter((v) => v.color === selectedColor);
  }, [variants, selectedColor, hasMultipleColors]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSizeQty({});
      setSelectedColor(null);
      setCustomSizes([]);
      setShowAddCustom(false);
      setNewSize("");
      setNewQty("");
      setNewRate("");
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

  // Focus custom size input when shown
  useEffect(() => {
    if (showAddCustom) {
      setTimeout(() => customSizeInputRef.current?.focus(), 100);
    }
  }, [showAddCustom]);

  const handleAddCustomSize = () => {
    if (!newSize.trim()) {
      toast({ title: "Error", description: "Please enter a size name", variant: "destructive" });
      return;
    }
    if (!newQty || Number(newQty) <= 0) {
      toast({ title: "Error", description: "Please enter a valid quantity", variant: "destructive" });
      return;
    }

    const rate = Number(newRate) || product?.default_sale_price || filteredVariants[0]?.sale_price || 0;

    // Check if size already exists in variants or custom sizes
    const existsInVariants = filteredVariants.some(v => v.size.toLowerCase() === newSize.trim().toLowerCase());
    const existsInCustom = customSizes.some(c => c.size.toLowerCase() === newSize.trim().toLowerCase());

    if (existsInVariants) {
      toast({ title: "Size Exists", description: "This size already exists. Enter quantity in the grid above.", variant: "destructive" });
      return;
    }

    if (existsInCustom) {
      // Update existing custom size quantity
      setCustomSizes(prev => prev.map(c =>
        c.size.toLowerCase() === newSize.trim().toLowerCase()
          ? { ...c, qty: c.qty + Number(newQty) }
          : c
      ));
    } else {
      // Add new custom size
      setCustomSizes(prev => [...prev, {
        id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        size: newSize.trim(),
        qty: Number(newQty),
        rate,
      }]);
    }

    // Reset inputs
    setNewSize("");
    setNewQty("");
    setNewRate("");
    setShowAddCustom(false);
  };

  const removeCustomSize = (id: string) => {
    setCustomSizes(prev => prev.filter(c => c.id !== id));
  };

  const handleConfirm = () => {
    const entries = Object.entries(sizeQty);
    const hasExistingQty = entries.some(([_, qty]) => Number(qty) > 0);
    const hasCustomQty = customSizes.length > 0;

    if (!hasExistingQty && !hasCustomQty) {
      toast({
        title: "No Items",
        description: "Please enter quantities for at least one size",
        variant: "destructive",
      });
      return;
    }

    // Validate stock for existing variants if required
    if (validateStock) {
      for (const [sizeKey, qtyStr] of entries) {
        const qty = Number(qtyStr);
        if (qty > 0) {
          const variant = filteredVariants.find((v) => v.id === sizeKey) ||
                         filteredVariants.find((v) => v.size === sizeKey);
          const stockQty = variant?.stock_qty || 0;
          if (qty > stockQty) {
            toast({
              title: "Insufficient Stock",
              description: `${product?.product_name} (${variant?.size}): Only ${stockQty} available`,
              variant: "destructive",
            });
            return;
          }
        }
      }
    }

    // Build items array
    const items: Array<{ variant: Variant; qty: number }> = [];
    
    // Add existing variant items
    for (const [sizeKey, qtyStr] of entries) {
      const qty = Number(qtyStr);
      if (qty > 0) {
        const variant = filteredVariants.find((v) => v.id === sizeKey) ||
                       filteredVariants.find((v) => v.size === sizeKey);
        if (variant) {
          items.push({ variant, qty });
        }
      }
    }

    // Add custom size items
    for (const custom of customSizes) {
      const customVariant: Variant = {
        id: custom.id,
        size: custom.size,
        stock_qty: 0,
        sale_price: custom.rate,
        color: selectedColor || uniqueColors[0] || null,
        barcode: null,
        isCustomSize: true,
      };
      items.push({ variant: customVariant, qty: custom.qty });
    }

    onConfirm(items);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !showAddCustom) {
      e.preventDefault();
      handleConfirm();
    }
  };

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    setSizeQty({});
    setCustomSizes([]);
  };

  // Calculate total quantity
  const totalQty = Object.values(sizeQty).reduce((sum, qty) => sum + (Number(qty) || 0), 0) +
                   customSizes.reduce((sum, c) => sum + c.qty, 0);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-auto"
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

        {/* Color Selection */}
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

        {/* Size Grid */}
        {(selectedColor || !hasMultipleColors) && (
          <>
            {hasMultipleColors && selectedColor && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="mb-2"
                onClick={() => {
                  setSelectedColor(null);
                  setSizeQty({});
                  setCustomSizes([]);
                }}
              >
                ← Change Color
              </Button>
            )}

            {/* Existing Variants Grid */}
            {filteredVariants.length > 0 && (
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
            )}

            {/* Custom Sizes List */}
            {customSizes.length > 0 && (
              <div className="mb-4">
                <Label className="mb-2 block text-sm font-medium">Custom Sizes (New)</Label>
                <div className="flex gap-3 flex-wrap">
                  {customSizes.map((custom) => (
                    <div key={custom.id} className="flex flex-col items-center gap-1 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium">{custom.size}</span>
                        <Badge variant="secondary" className="text-xs bg-amber-200 text-amber-800">New</Badge>
                      </div>
                      <span className="text-lg font-semibold">{custom.qty}</span>
                      <span className="text-xs text-muted-foreground">₹{custom.rate}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeCustomSize(custom.id)}
                      >
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Custom Size Section */}
            {!showAddCustom ? (
              <Button
                variant="outline"
                size="sm"
                className="mb-4 border-dashed border-primary text-primary hover:bg-primary/10"
                onClick={() => setShowAddCustom(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add New Size (Not in Stock)
              </Button>
            ) : (
              <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
                <Label className="mb-2 block text-sm font-medium">Add Custom Size</Label>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Size Name</Label>
                    <Input
                      ref={customSizeInputRef}
                      placeholder="e.g., 8, XL, 42"
                      value={newSize}
                      onChange={(e) => setNewSize(e.target.value)}
                      className="w-24"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      className="w-20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Rate (Optional)</Label>
                    <Input
                      type="number"
                      placeholder={`₹${filteredVariants[0]?.sale_price || 0}`}
                      value={newRate}
                      onChange={(e) => setNewRate(e.target.value)}
                      className="w-24"
                    />
                  </div>
                  <Button size="sm" onClick={handleAddCustomSize}>
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setShowAddCustom(false);
                    setNewSize("");
                    setNewQty("");
                    setNewRate("");
                  }}>
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  💡 Use this for sizes not currently in stock. The size will be marked for procurement.
                </p>
              </div>
            )}

            {/* Price Info */}
            {filteredVariants.length > 0 && filteredVariants[0].sale_price && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="space-y-2">
                  <Label>Sale Price</Label>
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
                {totalQty}
              </span>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel (Esc)
          </Button>
          {(selectedColor || !hasMultipleColors) && (
            <Button onClick={handleConfirm}>
              Confirm (Enter)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
