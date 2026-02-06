import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  size_group_id?: string | null;
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
  title = "Enter Size-wise Quantity",
}: SalesmanSizeGridDialogProps) {
  const { toast } = useToast();
  
  // Multi-color state: { colorName: { variantId: qtyString } }
  const [multiColorQty, setMultiColorQty] = useState<{ [color: string]: { [variantId: string]: string } }>({});
  // Custom sizes per color: { colorName: CustomSizeEntry[] }
  const [multiColorCustomSizes, setMultiColorCustomSizes] = useState<{ [color: string]: CustomSizeEntry[] }>({});
  // Which color is currently adding a custom size
  const [activeCustomSizeColor, setActiveCustomSizeColor] = useState<string | null>(null);
  
  const [newSize, setNewSize] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newRate, setNewRate] = useState("");
  const [sizeOrder, setSizeOrder] = useState<string[]>([]);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const customSizeInputRef = useRef<HTMLInputElement>(null);

  // Fetch size group order when product changes
  useEffect(() => {
    const fetchSizeOrder = async () => {
      if (product?.size_group_id) {
        const { data } = await supabase
          .from("size_groups")
          .select("sizes")
          .eq("id", product.size_group_id)
          .single();
        
        if (data?.sizes) {
          const sizes = Array.isArray(data.sizes) 
            ? data.sizes.map((s: any) => typeof s === 'string' ? s : s.size || s.name || String(s))
            : [];
          setSizeOrder(sizes);
        }
      } else {
        setSizeOrder([]);
      }
    };
    
    if (open && product) {
      fetchSizeOrder();
    }
  }, [open, product?.id, product?.size_group_id]);

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

  // Get variants grouped by color and sorted by size order
  const variantsByColor = useMemo(() => {
    const grouped: { [color: string]: Variant[] } = {};
    
    // If no colors, use empty string as key
    if (uniqueColors.length === 0) {
      grouped[''] = [...variants];
    } else {
      uniqueColors.forEach(color => {
        grouped[color] = variants.filter(v => v.color === color);
      });
    }
    
    // Sort each color's variants by size order
    Object.keys(grouped).forEach(color => {
      if (sizeOrder.length > 0) {
        grouped[color] = [...grouped[color]].sort((a, b) => {
          const aIndex = sizeOrder.indexOf(a.size);
          const bIndex = sizeOrder.indexOf(b.size);
          if (aIndex === -1 && bIndex === -1) return 0;
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      }
    });
    
    return grouped;
  }, [variants, uniqueColors, sizeOrder]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMultiColorQty({});
      setMultiColorCustomSizes({});
      setActiveCustomSizeColor(null);
      setNewSize("");
      setNewQty("");
      setNewRate("");
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [open, product?.id]);

  // Focus custom size input when shown
  useEffect(() => {
    if (activeCustomSizeColor) {
      setTimeout(() => customSizeInputRef.current?.focus(), 100);
    }
  }, [activeCustomSizeColor]);

  const handleQtyChange = (color: string, variantId: string, value: string) => {
    setMultiColorQty(prev => ({
      ...prev,
      [color]: {
        ...(prev[color] || {}),
        [variantId]: value
      }
    }));
  };

  const handleAddCustomSize = (color: string) => {
    if (!newSize.trim()) {
      toast({ title: "Error", description: "Please enter a size name", variant: "destructive" });
      return;
    }
    if (!newQty || Number(newQty) <= 0) {
      toast({ title: "Error", description: "Please enter a valid quantity", variant: "destructive" });
      return;
    }

    const colorVariants = variantsByColor[color] || [];
    const rate = Number(newRate) || product?.default_sale_price || colorVariants[0]?.sale_price || 0;

    // Check if size already exists in variants
    const existsInVariants = colorVariants.some(v => v.size.toLowerCase() === newSize.trim().toLowerCase());
    const existingCustomSizes = multiColorCustomSizes[color] || [];
    const existsInCustom = existingCustomSizes.some(c => c.size.toLowerCase() === newSize.trim().toLowerCase());

    if (existsInVariants) {
      toast({ title: "Size Exists", description: "This size already exists. Enter quantity in the grid above.", variant: "destructive" });
      return;
    }

    if (existsInCustom) {
      // Update existing custom size quantity
      setMultiColorCustomSizes(prev => ({
        ...prev,
        [color]: (prev[color] || []).map(c =>
          c.size.toLowerCase() === newSize.trim().toLowerCase()
            ? { ...c, qty: c.qty + Number(newQty) }
            : c
        )
      }));
    } else {
      // Add new custom size
      setMultiColorCustomSizes(prev => ({
        ...prev,
        [color]: [...(prev[color] || []), {
          id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          size: newSize.trim(),
          qty: Number(newQty),
          rate,
        }]
      }));
    }

    // Reset inputs
    setNewSize("");
    setNewQty("");
    setNewRate("");
    setActiveCustomSizeColor(null);
  };

  const removeCustomSize = (color: string, id: string) => {
    setMultiColorCustomSizes(prev => ({
      ...prev,
      [color]: (prev[color] || []).filter(c => c.id !== id)
    }));
  };

  // Calculate total qty for a specific color
  const getColorTotalQty = (color: string) => {
    const colorQty = multiColorQty[color] || {};
    const variantTotal = Object.values(colorQty).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    const customTotal = (multiColorCustomSizes[color] || []).reduce((sum, c) => sum + c.qty, 0);
    return variantTotal + customTotal;
  };

  // Calculate grand total qty across all colors
  const grandTotalQty = useMemo(() => {
    let total = 0;
    Object.keys(variantsByColor).forEach(color => {
      total += getColorTotalQty(color);
    });
    return total;
  }, [multiColorQty, multiColorCustomSizes, variantsByColor]);

  const handleConfirm = () => {
    if (grandTotalQty === 0) {
      toast({
        title: "No Items",
        description: "Please enter quantities for at least one size",
        variant: "destructive",
      });
      return;
    }

    const items: Array<{ variant: Variant; qty: number }> = [];

    // Collect items from all colors
    Object.entries(variantsByColor).forEach(([color, colorVariants]) => {
      const colorQty = multiColorQty[color] || {};
      
      // Add existing variant items
      for (const [variantId, qtyStr] of Object.entries(colorQty)) {
        const qty = Number(qtyStr);
        if (qty > 0) {
          const variant = colorVariants.find((v) => v.id === variantId);
          if (variant) {
            // Validate stock if required
            if (validateStock) {
              const stockQty = variant.stock_qty || 0;
              if (qty > stockQty) {
                toast({
                  title: "Insufficient Stock",
                  description: `${product?.product_name} (${color ? color + ' - ' : ''}${variant.size}): Only ${stockQty} available`,
                  variant: "destructive",
                });
                return;
              }
            }
            items.push({ variant, qty });
          }
        }
      }

      // Add custom size items for this color
      const customSizes = multiColorCustomSizes[color] || [];
      for (const custom of customSizes) {
        const customVariant: Variant = {
          id: custom.id,
          size: custom.size,
          stock_qty: 0,
          sale_price: custom.rate,
          color: color || null,
          barcode: null,
          isCustomSize: true,
        };
        items.push({ variant: customVariant, qty: custom.qty });
      }
    });

    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please enter quantities for at least one size",
        variant: "destructive",
      });
      return;
    }

    onConfirm(items);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !activeCustomSizeColor) {
      e.preventDefault();
      handleConfirm();
    }
  };

  if (!product) return null;

  const colorsToShow = Object.keys(variantsByColor);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-auto"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <h3 className="font-semibold text-lg">{product.product_name}</h3>
        </div>

        {/* All Colors Grid */}
        <div className="space-y-4">
          {colorsToShow.map((color, colorIndex) => {
            const colorVariants = variantsByColor[color] || [];
            const colorQty = multiColorQty[color] || {};
            const colorCustomSizes = multiColorCustomSizes[color] || [];
            const colorTotal = getColorTotalQty(color);
            const isAddingCustomSize = activeCustomSizeColor === color;

            return (
              <div key={color || 'no-color'} className="border rounded-lg p-3 bg-muted/30">
                {/* Color Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {color && (
                      <Badge variant="outline" className="font-medium">
                        {color}
                      </Badge>
                    )}
                    {!color && hasMultipleColors === false && (
                      <span className="text-sm text-muted-foreground">Sizes</span>
                    )}
                  </div>
                  <span className="text-sm font-medium">
                    Qty: <span className="text-primary">{colorTotal}</span>
                  </span>
                </div>

                {/* Size Grid for this color */}
                {colorVariants.length > 0 && (
                  <div className="flex gap-3 mb-3 flex-wrap">
                    {colorVariants.map((v, index) => (
                      <div key={v.id} className="flex flex-col items-center gap-1">
                        <span className="text-sm font-medium">{v.size}</span>
                        <input
                          ref={colorIndex === 0 && index === 0 ? firstInputRef : undefined}
                          type="number"
                          min="0"
                          className="w-16 text-center border rounded p-2 bg-background"
                          value={colorQty[v.id] || ""}
                          onChange={(e) => handleQtyChange(color, v.id, e.target.value)}
                          placeholder="0"
                        />
                        {showStock && (
                          <span className={`text-xs ${(v.stock_qty || 0) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {v.stock_qty || 0}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Custom Sizes for this color */}
                {colorCustomSizes.length > 0 && (
                  <div className="mb-3">
                    <div className="flex gap-2 flex-wrap">
                      {colorCustomSizes.map((custom) => (
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
                            onClick={() => removeCustomSize(color, custom.id)}
                          >
                            <X className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Custom Size Section */}
                {!isAddingCustomSize ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-primary hover:bg-primary/10"
                    onClick={() => setActiveCustomSizeColor(color)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Size
                  </Button>
                ) : (
                  <div className="p-2 bg-muted/50 rounded border">
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Size</Label>
                        <Input
                          ref={customSizeInputRef}
                          placeholder="e.g., 8"
                          value={newSize}
                          onChange={(e) => setNewSize(e.target.value)}
                          className="w-20 h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={newQty}
                          onChange={(e) => setNewQty(e.target.value)}
                          className="w-16 h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rate</Label>
                        <Input
                          type="number"
                          placeholder={`₹${colorVariants[0]?.sale_price || 0}`}
                          value={newRate}
                          onChange={(e) => setNewRate(e.target.value)}
                          className="w-20 h-8"
                        />
                      </div>
                      <Button size="sm" className="h-8" onClick={() => handleAddCustomSize(color)}>
                        Add
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => {
                        setActiveCustomSizeColor(null);
                        setNewSize("");
                        setNewQty("");
                        setNewRate("");
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Price Info (from first variant) */}
        {variants.length > 0 && variants[0].sale_price && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="space-y-1">
              <Label className="text-xs">Sale Price</Label>
              <Input
                type="number"
                value={variants[0].sale_price || 0}
                readOnly
                className="bg-muted h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">GST %</Label>
              <Input
                type="number"
                value={product.gst_per || 0}
                readOnly
                className="bg-muted h-8"
              />
            </div>
          </div>
        )}

        {/* Grand Total */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg mt-4">
          <span className="font-medium">Total Quantity (All Colors):</span>
          <span className="text-xl font-bold text-primary">
            {grandTotalQty}
          </span>
        </div>

        <div className="flex justify-end gap-2 mt-4">
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
