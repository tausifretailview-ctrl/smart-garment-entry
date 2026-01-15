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
  pur_price?: number;
  mrp?: number;
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
  default_pur_price?: number;
  default_sale_price?: number;
}

interface CustomSizeEntry {
  id: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  mrp: number;
}

interface SizeGridDialogProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  variants: Variant[];
  onConfirm: (items: Array<{ variant: Variant; qty: number }>, newColor?: string) => void;
  showStock?: boolean;
  validateStock?: boolean;
  title?: string;
  allowCustomSizes?: boolean;
  allowAddColor?: boolean;
  allowMultiColor?: boolean; // Show all colors at once for batch entry
  defaultPurPrice?: number;
  defaultSalePrice?: number;
  defaultMrp?: number;
  showMrp?: boolean;
  onColorAdded?: (color: string) => void;
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
  allowCustomSizes = false,
  allowAddColor = false,
  allowMultiColor = false,
  defaultPurPrice,
  defaultSalePrice,
  defaultMrp,
  showMrp = false,
  onColorAdded,
}: SizeGridDialogProps) {
  const { toast } = useToast();
  const [sizeQty, setSizeQty] = useState<{ [size: string]: string }>({});
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [customSizes, setCustomSizes] = useState<CustomSizeEntry[]>([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newSize, setNewSize] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newPurPrice, setNewPurPrice] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newMrp, setNewMrp] = useState("");
  const [showAddColor, setShowAddColor] = useState(false);
  const [newColorName, setNewColorName] = useState("");
  const [addedColors, setAddedColors] = useState<string[]>([]);
  // Multi-color mode state: { [color]: { [variantId]: qty } }
  const [multiColorQty, setMultiColorQty] = useState<{ [color: string]: { [variantId: string]: string } }>({});
  const [multiColorCustomSizes, setMultiColorCustomSizes] = useState<{ [color: string]: CustomSizeEntry[] }>({});
  const [activeCustomSizeColor, setActiveCustomSizeColor] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const customSizeInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Get unique colors from variants including newly added colors
  const uniqueColors = useMemo(() => {
    const colors = new Set<string>();
    variants.forEach((v) => {
      if (v.color) colors.add(v.color);
    });
    // Add any colors that were added during this session
    addedColors.forEach(c => colors.add(c));
    return Array.from(colors);
  }, [variants, addedColors]);

  // Check if product has multiple colors (truly needs color selection)
  const hasMultipleColors = uniqueColors.length > 1;

  // Filter variants by selected color
  const filteredVariants = useMemo(() => {
    // If multiple colors exist, we need a selection to filter
    if (hasMultipleColors) {
      if (!selectedColor) return [];
      return variants.filter((v) => v.color === selectedColor);
    }
    // For 0 or 1 color, show all variants
    return variants;
  }, [variants, selectedColor, hasMultipleColors]);

  // Get default prices
  const effectivePurPrice = defaultPurPrice || product?.default_pur_price || filteredVariants[0]?.pur_price || 0;
  const effectiveSalePrice = defaultSalePrice || product?.default_sale_price || filteredVariants[0]?.sale_price || 0;
  const effectiveMrp = defaultMrp || effectiveSalePrice;

  // Reset quantities and color selection when dialog opens with new product
  useEffect(() => {
    if (open) {
      setSizeQty({});
      setSelectedColor(null);
      setCustomSizes([]);
      setShowAddCustom(false);
      setShowAddColor(false);
      setNewSize("");
      setNewQty("");
      setNewPurPrice("");
      setNewSalePrice("");
      setNewMrp("");
      setNewColorName("");
      setAddedColors([]);
      setMultiColorQty({});
      setMultiColorCustomSizes({});
      setActiveCustomSizeColor(null);
      // If only one color, auto-select it (for single-color mode)
      if (!allowMultiColor && uniqueColors.length === 1) {
        setSelectedColor(uniqueColors[0]);
      }
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [open, product?.id, allowMultiColor]);

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

  // Focus color input when shown
  useEffect(() => {
    if (showAddColor) {
      setTimeout(() => colorInputRef.current?.focus(), 100);
    }
  }, [showAddColor]);

  const handleAddColor = () => {
    if (!newColorName.trim()) {
      toast({ title: "Error", description: "Please enter a color name", variant: "destructive" });
      return;
    }

    const colorUpperCase = newColorName.trim().toUpperCase();

    // Check if color already exists
    if (uniqueColors.some(c => c.toUpperCase() === colorUpperCase)) {
      toast({ title: "Color Exists", description: "This color already exists", variant: "destructive" });
      return;
    }

    // Add to added colors list
    setAddedColors(prev => [...prev, colorUpperCase]);
    
    // Notify parent if callback provided
    if (onColorAdded) {
      onColorAdded(colorUpperCase);
    }

    // Auto-select the new color
    setSelectedColor(colorUpperCase);
    
    // Reset input
    setNewColorName("");
    setShowAddColor(false);

    toast({ title: "Color Added", description: `${colorUpperCase} added. You can now enter quantities for this color.` });
  };

  const handleAddCustomSize = () => {
    if (!newSize.trim()) {
      toast({ title: "Error", description: "Please enter a size name", variant: "destructive" });
      return;
    }
    if (!newQty || Number(newQty) <= 0) {
      toast({ title: "Error", description: "Please enter a valid quantity", variant: "destructive" });
      return;
    }

    const purPrice = Number(newPurPrice) || effectivePurPrice;
    const salePrice = Number(newSalePrice) || effectiveSalePrice;
    const mrpValue = Number(newMrp) || effectiveMrp;

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
        pur_price: purPrice,
        sale_price: salePrice,
        mrp: mrpValue,
      }]);
    }

    // Reset inputs
    setNewSize("");
    setNewQty("");
    setNewPurPrice("");
    setNewSalePrice("");
    setNewMrp("");
    setShowAddCustom(false);
  };

  const removeCustomSize = (id: string) => {
    setCustomSizes(prev => prev.filter(c => c.id !== id));
  };

  const handleConfirm = () => {
    // Multi-color mode: collect items from all colors
    if (allowMultiColor && hasMultipleColors) {
      const items: Array<{ variant: Variant; qty: number }> = [];
      
      for (const color of uniqueColors) {
        const colorVariants = variants.filter(v => v.color === color);
        const colorQtyMap = multiColorQty[color] || {};
        
        // Add existing variant items for this color
        for (const [variantId, qtyStr] of Object.entries(colorQtyMap)) {
          const qty = Number(qtyStr);
          if (qty > 0) {
            const variant = colorVariants.find(v => v.id === variantId);
            if (variant) {
              items.push({ variant, qty });
            }
          }
        }
        
        // Add custom size items for this color
        const colorCustomSizes = multiColorCustomSizes[color] || [];
        for (const custom of colorCustomSizes) {
          const customVariant: Variant = {
            id: custom.id,
            size: custom.size,
            stock_qty: 0,
            pur_price: custom.pur_price,
            sale_price: custom.sale_price,
            mrp: custom.mrp,
            color: color,
            barcode: undefined,
            isCustomSize: true,
          };
          items.push({ variant: customVariant, qty: custom.qty });
        }
      }
      
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
      return;
    }
    
    // Single-color mode (original logic)
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
    
    // Add existing variant items
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

    // Add custom size items
    for (const custom of customSizes) {
      const customVariant: Variant = {
        id: custom.id,
        size: custom.size,
        stock_qty: 0,
        pur_price: custom.pur_price,
        sale_price: custom.sale_price,
        mrp: custom.mrp,
        color: selectedColor || uniqueColors[0] || undefined,
        barcode: undefined,
        isCustomSize: true,
      };
      items.push({ variant: customVariant, qty: custom.qty });
    }

    // Pass newColor if it's a newly added color
    const isNewColor = addedColors.includes(selectedColor || "");
    onConfirm(items, isNewColor ? selectedColor || undefined : undefined);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !showAddCustom && !showAddColor) {
      e.preventDefault();
      handleConfirm();
    }
  };

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    setSizeQty({}); // Reset quantities when color changes
    setCustomSizes([]); // Reset custom sizes when color changes
  };

  // Calculate total quantity - different for multi-color mode
  const totalQty = allowMultiColor && hasMultipleColors
    ? Object.values(multiColorQty).reduce((colorSum, colorQtyMap) => 
        colorSum + Object.values(colorQtyMap).reduce((sum, qty) => sum + (Number(qty) || 0), 0), 0) +
      Object.values(multiColorCustomSizes).reduce((colorSum, colorSizes) =>
        colorSum + colorSizes.reduce((sum, c) => sum + c.qty, 0), 0)
    : Object.values(sizeQty).reduce((sum, qty) => sum + (Number(qty) || 0), 0) +
      customSizes.reduce((sum, c) => sum + c.qty, 0);

  // Helper function to add custom size in multi-color mode
  const handleAddMultiColorCustomSize = (color: string) => {
    if (!newSize.trim()) {
      toast({ title: "Error", description: "Please enter a size name", variant: "destructive" });
      return;
    }
    if (!newQty || Number(newQty) <= 0) {
      toast({ title: "Error", description: "Please enter a valid quantity", variant: "destructive" });
      return;
    }

    const purPrice = Number(newPurPrice) || effectivePurPrice;
    const salePrice = Number(newSalePrice) || effectiveSalePrice;
    const mrpValue = Number(newMrp) || effectiveMrp;

    const colorVariants = variants.filter(v => v.color === color);
    const existingCustom = multiColorCustomSizes[color] || [];
    
    const existsInVariants = colorVariants.some(v => v.size.toLowerCase() === newSize.trim().toLowerCase());
    const existsInCustom = existingCustom.some(c => c.size.toLowerCase() === newSize.trim().toLowerCase());

    if (existsInVariants) {
      toast({ title: "Size Exists", description: "This size already exists. Enter quantity in the grid above.", variant: "destructive" });
      return;
    }

    if (existsInCustom) {
      setMultiColorCustomSizes(prev => ({
        ...prev,
        [color]: prev[color].map(c =>
          c.size.toLowerCase() === newSize.trim().toLowerCase()
            ? { ...c, qty: c.qty + Number(newQty) }
            : c
        )
      }));
    } else {
      setMultiColorCustomSizes(prev => ({
        ...prev,
        [color]: [...(prev[color] || []), {
          id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          size: newSize.trim(),
          qty: Number(newQty),
          pur_price: purPrice,
          sale_price: salePrice,
          mrp: mrpValue,
        }]
      }));
    }

    setNewSize("");
    setNewQty("");
    setNewPurPrice("");
    setNewSalePrice("");
    setNewMrp("");
    setActiveCustomSizeColor(null);
  };

  const removeMultiColorCustomSize = (color: string, id: string) => {
    setMultiColorCustomSizes(prev => ({
      ...prev,
      [color]: (prev[color] || []).filter(c => c.id !== id)
    }));
  };

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
          {!allowMultiColor && selectedColor && (
            <Badge variant="outline" className="mt-1">{selectedColor}</Badge>
          )}
        </div>

        {/* MULTI-COLOR MODE: Show all colors with their sizes in a vertical grid */}
        {allowMultiColor && hasMultipleColors && (
          <>
            <div className="space-y-4">
              {uniqueColors.map((color, colorIndex) => {
                const colorVariants = variants.filter(v => v.color === color);
                const colorQtyMap = multiColorQty[color] || {};
                const colorCustomSizes = multiColorCustomSizes[color] || [];
                
                // Calculate color total
                const colorTotal = Object.values(colorQtyMap).reduce((sum, qty) => sum + (Number(qty) || 0), 0) +
                                   colorCustomSizes.reduce((sum, c) => sum + c.qty, 0);
                
                return (
                  <div key={color} className="p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-semibold">{color}</Badge>
                        {addedColors.includes(color) && (
                          <Badge variant="secondary" className="text-xs bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">New</Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        Qty: <span className="font-semibold text-foreground">{colorTotal}</span>
                      </span>
                    </div>
                    
                    {/* Size inputs for this color */}
                    {colorVariants.length > 0 && (
                      <div className="flex gap-3 flex-wrap mb-2">
                        {colorVariants.map((v, index) => (
                          <div key={v.id} className="flex flex-col items-center gap-1">
                            <span className="text-sm font-medium">{v.size}</span>
                            <input
                              ref={colorIndex === 0 && index === 0 ? firstInputRef : undefined}
                              type="number"
                              min="0"
                              className="w-16 text-center border rounded p-2 bg-background"
                              value={colorQtyMap[v.id] || ""}
                              onChange={(e) =>
                                setMultiColorQty(prev => ({
                                  ...prev,
                                  [color]: { ...(prev[color] || {}), [v.id]: e.target.value }
                                }))
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
                    
                    {/* Custom sizes for this color */}
                    {colorCustomSizes.length > 0 && (
                      <div className="flex gap-2 flex-wrap mb-2">
                        {colorCustomSizes.map((custom) => (
                          <div key={custom.id} className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border border-amber-200 dark:border-amber-800">
                            <span className="text-sm">{custom.size}</span>
                            <span className="text-sm font-semibold">×{custom.qty}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => removeMultiColorCustomSize(color, custom.id)}
                            >
                              <X className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Add custom size for this color */}
                    {allowCustomSizes && (
                      <>
                        {activeCustomSizeColor !== color ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-primary"
                            onClick={() => setActiveCustomSizeColor(color)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Size
                          </Button>
                        ) : (
                          <div className="flex flex-wrap gap-2 items-end mt-2 p-2 bg-background rounded border">
                            <Input
                              placeholder="Size"
                              value={newSize}
                              onChange={(e) => setNewSize(e.target.value)}
                              className="w-16 h-8 text-sm"
                            />
                            <Input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={newQty}
                              onChange={(e) => setNewQty(e.target.value)}
                              className="w-16 h-8 text-sm"
                            />
                            <Button size="sm" className="h-8" onClick={() => handleAddMultiColorCustomSize(color)}>
                              Add
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => {
                              setActiveCustomSizeColor(null);
                              setNewSize("");
                              setNewQty("");
                            }}>
                              Cancel
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Total Quantity Summary for multi-color mode */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg my-4">
              <span className="font-medium">Total Quantity (All Colors):</span>
              <span className="text-xl font-bold text-primary">
                {totalQty}
              </span>
            </div>
          </>
        )}

        {/* SINGLE-COLOR MODE: Original color selection and grid */}
        {(!allowMultiColor || !hasMultipleColors) && (
          <>
            {/* Color Selection - Show ONLY if multiple colors truly exist (required selection) */}
            {hasMultipleColors && !selectedColor && (
              <div className="mb-4">
                <Label className="mb-2 block">Select Color</Label>
                <div className="flex flex-wrap gap-2 items-center">
                  {uniqueColors.map((color) => (
                    <Button
                      key={color}
                      variant="outline"
                      className="min-w-[80px]"
                      onClick={() => handleColorSelect(color)}
                    >
                      {color}
                      {addedColors.includes(color) && (
                        <Badge variant="secondary" className="ml-1 text-xs bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">New</Badge>
                      )}
                    </Button>
                  ))}
                  
                  {/* Add New Color Button - also show here for multi-color products */}
                  {allowAddColor && !showAddColor && (
                    <Button
                      variant="outline"
                      className="min-w-[80px] border-dashed border-primary text-primary hover:bg-primary/10"
                      onClick={() => setShowAddColor(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Color
                    </Button>
                  )}
                </div>

                {/* Add New Color Input */}
                {showAddColor && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg border flex flex-wrap gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Color Name *</Label>
                      <Input
                        ref={colorInputRef}
                        placeholder="e.g., BK, RD, BL"
                        value={newColorName}
                        onChange={(e) => setNewColorName(e.target.value.toUpperCase())}
                        className="w-32"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddColor();
                          }
                        }}
                      />
                    </div>
                    <Button size="sm" onClick={handleAddColor}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      setShowAddColor(false);
                      setNewColorName("");
                    }}>
                      Cancel
                    </Button>
                    <p className="text-xs text-muted-foreground w-full">
                      💡 New color variant will be created for this product when you confirm.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* For single/no color products - show badge if exists, and optional Add Color */}
            {!hasMultipleColors && (
              <div className="mb-4 flex flex-wrap gap-2 items-center">
                {uniqueColors.length === 1 && (
                  <Badge variant="outline">{uniqueColors[0]}</Badge>
                )}
                {/* Optional Add Color for single/no color products when color is enabled */}
                {allowAddColor && !showAddColor && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-dashed border-primary text-primary hover:bg-primary/10"
                    onClick={() => setShowAddColor(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Color
                  </Button>
                )}
                {/* Add New Color Input for single/no color products */}
                {allowAddColor && showAddColor && (
                  <div className="w-full mt-2 p-3 bg-muted/50 rounded-lg border flex flex-wrap gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Color Name *</Label>
                      <Input
                        ref={colorInputRef}
                        placeholder="e.g., BK, RD, BL"
                        value={newColorName}
                        onChange={(e) => setNewColorName(e.target.value.toUpperCase())}
                        className="w-32"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddColor();
                          }
                        }}
                      />
                    </div>
                    <Button size="sm" onClick={handleAddColor}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      setShowAddColor(false);
                      setNewColorName("");
                    }}>
                      Cancel
                    </Button>
                    <p className="text-xs text-muted-foreground w-full">
                      💡 New color variant will be created for this product when you confirm.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Size Grid - Show when color is selected OR product has 0/1 colors */}
            {(selectedColor || !hasMultipleColors) && (
              <>
                {/* Back to color selection button - only for multi-color products */}
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

                {/* Show message for new color */}
                {selectedColor && addedColors.includes(selectedColor) && (
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      💡 This is a new color. Add sizes below to create variants for "{selectedColor}".
                    </p>
                  </div>
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
                    <Label className="mb-2 block text-sm font-medium">New Sizes (Will be created)</Label>
                    <div className="flex gap-3 flex-wrap">
                      {customSizes.map((custom) => (
                        <div key={custom.id} className="flex flex-col items-center gap-1 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium">{custom.size}</span>
                            <Badge variant="secondary" className="text-xs bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">New</Badge>
                          </div>
                          <span className="text-lg font-semibold">{custom.qty}</span>
                          <span className="text-xs text-muted-foreground">
                            ₹{custom.pur_price} / ₹{custom.sale_price}
                            {showMrp && ` / MRP ₹${custom.mrp}`}
                          </span>
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

                {/* Add Custom Size Section - Show if allowCustomSizes is true OR if new color with no variants */}
                {(allowCustomSizes || (selectedColor && addedColors.includes(selectedColor))) && (
                  <>
                    {!showAddCustom && !(selectedColor && addedColors.includes(selectedColor) && customSizes.length === 0) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mb-4 border-dashed border-primary text-primary hover:bg-primary/10"
                        onClick={() => setShowAddCustom(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add New Size
                      </Button>
                    ) : (
                      <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
                        <Label className="mb-2 block text-sm font-medium">Add New Size</Label>
                        <div className="flex flex-wrap gap-2 items-end">
                          <div className="space-y-1">
                            <Label className="text-xs">Size Name *</Label>
                            <Input
                              ref={customSizeInputRef}
                              placeholder="e.g., 8, XL, 42"
                              value={newSize}
                              onChange={(e) => setNewSize(e.target.value)}
                              className="w-24"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Quantity *</Label>
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
                            <Label className="text-xs">Pur. Price</Label>
                            <Input
                              type="number"
                              placeholder={`₹${effectivePurPrice}`}
                              value={newPurPrice}
                              onChange={(e) => setNewPurPrice(e.target.value)}
                              className="w-24"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Sale Price</Label>
                            <Input
                              type="number"
                              placeholder={`₹${effectiveSalePrice}`}
                              value={newSalePrice}
                              onChange={(e) => setNewSalePrice(e.target.value)}
                              className="w-24"
                            />
                          </div>
                          {showMrp && (
                            <div className="space-y-1">
                              <Label className="text-xs">MRP</Label>
                              <Input
                                type="number"
                                placeholder={`₹${effectiveMrp}`}
                                value={newMrp}
                                onChange={(e) => setNewMrp(e.target.value)}
                                className="w-24"
                              />
                            </div>
                          )}
                          <Button size="sm" onClick={handleAddCustomSize}>
                            Add
                          </Button>
                          {/* Only show cancel if we have existing variants or custom sizes */}
                          {(filteredVariants.length > 0 || customSizes.length > 0 || !(selectedColor && addedColors.includes(selectedColor))) && (
                            <Button size="sm" variant="ghost" onClick={() => {
                              setShowAddCustom(false);
                              setNewSize("");
                              setNewQty("");
                              setNewPurPrice("");
                              setNewSalePrice("");
                              setNewMrp("");
                            }}>
                              Cancel
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          💡 New size variant will be created for this product when you confirm.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {filteredVariants.length > 0 && filteredVariants[0].sale_price && !allowCustomSizes && (
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
                    {totalQty}
                  </span>
                </div>
              </>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel (Esc)
          </Button>
          {/* Multi-color mode confirm button */}
          {allowMultiColor && hasMultipleColors && totalQty > 0 && (
            <Button onClick={handleConfirm}>
              Confirm (Enter)
            </Button>
          )}
          {/* Single-color mode confirm button */}
          {!allowMultiColor && (selectedColor || !hasMultipleColors) && (filteredVariants.length > 0 || customSizes.length > 0) && (
            <Button onClick={handleConfirm}>
              Confirm (Enter)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
