import { useState, useEffect, useRef, useMemo } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ProductThumb } from "@/components/ProductThumb";
import { ProductPhotoViewer } from "@/components/ProductPhotoViewer";
import { isUsableImageUrl } from "@/lib/productImages";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD_SALES_SAFE_BOTTOM, FIELD_SALES_SAFE_TOP } from "@/hooks/useFieldSalesShell";
import { compareSizes } from "@/utils/sizeSort";
import { sizeColorKey } from "@/utils/mergeSizeColorVariantsForGrid";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQueryClient } from "@tanstack/react-query";
import { getSizeGroupsByIds } from "@/lib/data/sizeGroups";

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
  image_url?: string | null;
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
  /**
   * Quantities already on the order for this product (sizeColorKey(size, colour) → qty). The sheet opens with
   * them filled in and "Update order" replaces them, instead of adding on top.
   */
  initialQty?: Record<string, number>;
  /** Colour photos (Product Master → Photos), keyed by lower-case colour: shown on each colour card. */
  colorImages?: Record<string, string>;
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
  initialQty,
  colorImages,
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
  const [photoOpen, setPhotoOpen] = useState(false);
  /** A colour photo opened full screen (null: the product photo, when photoOpen). */
  const [colorPhoto, setColorPhoto] = useState<{ url: string; label: string } | null>(null);
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const prefilledRef = useRef<Set<string>>(new Set());
  const bodyRef = useRef<HTMLDivElement>(null);
  const customSizeInputRef = useRef<HTMLInputElement>(null);

  // Fetch size group order when product changes
  useEffect(() => {
    const fetchSizeOrder = async () => {
      if (product?.size_group_id) {
        const data = currentOrganization?.id
          ? (await getSizeGroupsByIds(queryClient, currentOrganization.id, [product.size_group_id])).get(product.size_group_id)
          : undefined;
        
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
  /** Opened from a product already on the order: confirm replaces its quantities. */
  const isEditing = !!initialQty && Object.keys(initialQty).length > 0;

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
    
    // Sort each color's variants by size order from DB, falling back to standard garment order
    Object.keys(grouped).forEach(color => {
      if (sizeOrder.length > 0) {
        grouped[color] = [...grouped[color]].sort((a, b) => {
          const aIndex = sizeOrder.indexOf(a.size);
          const bIndex = sizeOrder.indexOf(b.size);
          if (aIndex === -1 && bIndex === -1) return compareSizes(a.size, b.size);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      } else {
        grouped[color] = [...grouped[color]].sort((a, b) => compareSizes(a.size, b.size));
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
      prefilledRef.current = new Set();
    }
  }, [open, product?.id]);

  // Editing a product already on the order: fill in its quantities. The size boxes arrive in two
  // steps (search result first, then the full grid), so each box is filled once, when it appears.
  useEffect(() => {
    if (!open || !initialQty) return;
    const fill: Array<{ color: string; id: string; qty: number }> = [];
    for (const v of variants) {
      // By size + colour, not id: the same box can come back under another stock row's id.
      const key = sizeColorKey(v.size, v.color || "");
      const qty = Number(initialQty[key]) || 0;
      if (qty > 0 && !prefilledRef.current.has(key)) {
        prefilledRef.current.add(key);
        fill.push({ color: v.color || "", id: v.id, qty });
      }
    }
    if (fill.length === 0) return;
    setMultiColorQty((prev) => {
      const next = { ...prev };
      for (const f of fill) next[f.color] = { ...(next[f.color] || {}), [f.id]: String(f.qty) };
      return next;
    });
  }, [open, initialQty, variants]);

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

  /** + / − on a size box. */
  const bumpQty = (color: string, variantId: string, delta: number) => {
    setMultiColorQty((prev) => {
      const current = Number(prev[color]?.[variantId]) || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [color]: { ...(prev[color] || {}), [variantId]: next > 0 ? String(next) : "" } };
    });
  };

  /** "+1 each": one more piece of every size of this colour (a set). */
  const addSet = (color: string) => {
    setMultiColorQty((prev) => {
      const row = { ...(prev[color] || {}) };
      for (const v of variantsByColor[color] || []) row[v.id] = String((Number(row[v.id]) || 0) + 1);
      return { ...prev, [color]: row };
    });
  };

  const clearColor = (color: string) => {
    setMultiColorQty((prev) => ({ ...prev, [color]: {} }));
    setMultiColorCustomSizes((prev) => ({ ...prev, [color]: [] }));
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

  const grandTotalAmount = useMemo(() => {
    let total = 0;
    Object.entries(variantsByColor).forEach(([color, colorVariants]) => {
      const colorQty = multiColorQty[color] || {};
      for (const v of colorVariants) total += (Number(colorQty[v.id]) || 0) * (Number(v.sale_price) || 0);
      for (const c of multiColorCustomSizes[color] || []) total += c.qty * (Number(c.rate) || 0);
    });
    return total;
  }, [multiColorQty, multiColorCustomSizes, variantsByColor]);

  const handleConfirm = () => {
    if (grandTotalQty === 0 && !isEditing) {
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

    if (items.length === 0 && !isEditing) {
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

  /** Enter / "Next" on the phone keyboard moves to the next size box instead of closing the sheet. */
  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(bodyRef.current?.querySelectorAll<HTMLInputElement>("input[data-size-qty]") ?? []);
    const next = inputs[inputs.indexOf(e.currentTarget) + 1];
    if (next) next.focus();
    else e.currentTarget.blur();
  };

  if (!product) return null;

  const colorsToShow = Object.keys(variantsByColor);
  const price = Number(variants[0]?.sale_price) || Number(product.default_sale_price) || 0;
  const money = (n: number) => `₹${Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-slate-50 text-slate-900 outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(90dvh,780px)] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:shadow-2xl"
          data-testid="size-qty-sheet"
        >
          {/* Header: back, photo, product, price */}
          <div className="shrink-0 border-b border-slate-200 bg-white" style={{ paddingTop: FIELD_SALES_SAFE_TOP }}>
            <div className="flex min-h-14 items-center gap-2.5 px-2 py-2">
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              {isUsableImageUrl(product.image_url) && (
                <button
                  type="button"
                  onClick={() => setPhotoOpen(true)}
                  title="View photo"
                  aria-label={`View photo of ${product.product_name}`}
                  className="shrink-0 rounded-md active:opacity-70"
                  data-testid="size-sheet-photo"
                >
                  <ProductThumb url={product.image_url} alt={product.product_name} size={44} />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="truncate text-[15px] font-semibold leading-tight">
                  {product.product_name}
                </DialogPrimitive.Title>
                <p className="truncate text-xs leading-tight text-slate-500">
                  {price > 0 ? `${money(price)} per piece` : title}
                  {product.gst_per ? ` · GST ${product.gst_per}%` : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Sizes, one card per colour */}
          <div ref={bodyRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-2.5">
            {colorsToShow.map((color) => {
              const colorVariants = variantsByColor[color] || [];
              const colorQty = multiColorQty[color] || {};
              const colorCustomSizes = multiColorCustomSizes[color] || [];
              const colorTotal = getColorTotalQty(color);
              const isAddingCustomSize = activeCustomSizeColor === color;

              return (
                <section
                  key={color || "no-color"}
                  className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm"
                  data-testid="size-colour-card"
                >
                  <div className="mb-2 flex items-center gap-2">
                    {colorImages?.[color.trim().toLowerCase()] ? (
                      <button
                        type="button"
                        onClick={() => setColorPhoto({ url: colorImages[color.trim().toLowerCase()], label: `${product.product_name} ${color}`.trim() })}
                        className="shrink-0 rounded-lg active:opacity-70"
                        aria-label={`View photo of ${color || product.product_name}`}
                        data-testid="size-colour-photo"
                      >
                        <ProductThumb url={colorImages[color.trim().toLowerCase()]} alt={`${product.product_name} ${color}`} size={56} />
                      </button>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-wide text-slate-800">
                      {color || (hasMultipleColors ? "No colour" : "Sizes")}
                    </span>
                    {colorVariants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => addSet(color)}
                        className="h-8 shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700 active:bg-orange-100"
                      >
                        +1 each size
                      </button>
                    )}
                    {colorTotal > 0 && (
                      <button
                        type="button"
                        onClick={() => clearColor(color)}
                        className="h-8 shrink-0 rounded-full px-2.5 text-xs font-semibold text-slate-500 active:bg-slate-100"
                      >
                        Clear
                      </button>
                    )}
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
                        colorTotal > 0 ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500",
                      )}
                      data-testid="size-colour-total"
                    >
                      {colorTotal} pcs
                    </span>
                  </div>

                  {colorVariants.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {colorVariants.map((v) => {
                        const qty = Number(colorQty[v.id]) || 0;
                        const stock = v.stock_qty || 0;
                        return (
                          <div
                            key={v.id}
                            className={cn(
                              "min-w-0 rounded-xl border p-1.5",
                              qty > 0 ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-white",
                            )}
                            data-testid="size-box"
                          >
                            <div className="flex items-baseline justify-between gap-1 px-0.5">
                              <span className="truncate text-[15px] font-bold leading-tight">{v.size}</span>
                              {showStock && (
                                <span
                                  className={cn(
                                    "shrink-0 text-[11px] font-semibold leading-tight tabular-nums",
                                    stock <= 0 ? "text-red-500" : qty > stock ? "text-amber-600" : "text-emerald-600",
                                  )}
                                  title="In stock"
                                >
                                  {stock <= 0 ? "No stock" : `${stock} left`}
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5 flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => bumpQty(color, v.id, -1)}
                                disabled={qty <= 0}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 active:bg-slate-100 disabled:opacity-30"
                                aria-label={`Less ${color ? `${color} ` : ""}size ${v.size}`}
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <input
                                data-size-qty
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                enterKeyHint="next"
                                className="h-8 w-full min-w-0 rounded-md bg-transparent text-center text-base font-bold tabular-nums outline-none placeholder:font-normal placeholder:text-slate-300 focus:bg-white focus:ring-2 focus:ring-orange-400"
                                value={colorQty[v.id] || ""}
                                onChange={(e) => handleQtyChange(color, v.id, e.target.value.replace(/\D/g, "").slice(0, 5))}
                                onKeyDown={handleQtyKeyDown}
                                onFocus={(e) => e.currentTarget.select()}
                                placeholder="0"
                                aria-label={`Quantity ${color ? `${color} ` : ""}size ${v.size}`}
                              />
                              <button
                                type="button"
                                onClick={() => bumpQty(color, v.id, 1)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white active:bg-orange-600"
                                aria-label={`More ${color ? `${color} ` : ""}size ${v.size}`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Sizes not in the list, added for this order */}
                  {colorCustomSizes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {colorCustomSizes.map((custom) => (
                        <span
                          key={custom.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 py-1 pl-3 pr-1 text-xs font-semibold text-amber-900"
                        >
                          {custom.size} × {custom.qty} · {money(custom.rate)}
                          <button
                            type="button"
                            onClick={() => removeCustomSize(color, custom.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-amber-700 active:bg-amber-200"
                            aria-label={`Remove size ${custom.size}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {!isAddingCustomSize ? (
                    <button
                      type="button"
                      onClick={() => setActiveCustomSizeColor(color)}
                      className="mt-2 inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-orange-600 active:bg-orange-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add another size
                    </button>
                  ) : (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        <label className="min-w-0 text-[11px] font-semibold text-slate-500">
                          Size
                          <input
                            ref={customSizeInputRef}
                            placeholder="e.g. 10"
                            value={newSize}
                            onChange={(e) => setNewSize(e.target.value)}
                            className="mt-0.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-400"
                          />
                        </label>
                        <label className="min-w-0 text-[11px] font-semibold text-slate-500">
                          Qty
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={newQty}
                            onChange={(e) => setNewQty(e.target.value.replace(/\D/g, "").slice(0, 5))}
                            className="mt-0.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-400"
                          />
                        </label>
                        <label className="min-w-0 text-[11px] font-semibold text-slate-500">
                          Rate
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder={`${colorVariants[0]?.sale_price || product.default_sale_price || 0}`}
                            value={newRate}
                            onChange={(e) => setNewRate(e.target.value.replace(/[^0-9.]/g, ""))}
                            className="mt-0.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-orange-400"
                          />
                        </label>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="h-10 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white active:bg-slate-700"
                          onClick={() => handleAddCustomSize(color)}
                        >
                          Add size
                        </button>
                        <button
                          type="button"
                          className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 active:bg-slate-200"
                          onClick={() => {
                            setActiveCustomSizeColor(null);
                            setNewSize("");
                            setNewQty("");
                            setNewRate("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* Total + confirm, always on screen */}
          <div
            className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2.5 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]"
            style={{ paddingBottom: `calc(${FIELD_SALES_SAFE_BOTTOM} + 10px)` }}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 shrink-0">
                <p className="text-lg font-bold leading-tight tabular-nums" data-testid="size-total-qty">
                  {grandTotalQty} pcs
                </p>
                <p className="text-xs leading-tight text-slate-500 tabular-nums">{money(grandTotalAmount)}</p>
              </div>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={grandTotalQty === 0 && !isEditing}
                className="h-12 min-w-0 flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-[15px] font-bold text-white shadow-md shadow-orange-500/30 active:scale-[0.99] disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
                data-testid="size-confirm"
              >
                {isEditing ? (grandTotalQty === 0 ? "Remove from order" : "Update order") : "Add to order"}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      <ProductPhotoViewer
        url={colorPhoto ? colorPhoto.url : photoOpen ? product.image_url : null}
        name={colorPhoto ? colorPhoto.label : product.product_name}
        onClose={() => {
          setPhotoOpen(false);
          setColorPhoto(null);
        }}
      />
    </DialogPrimitive.Root>
  );
}
