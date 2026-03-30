import { useState, useEffect, useCallback, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LoadingButton } from "@/components/ui/loading-button";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { UOM_OPTIONS } from "@/constants/uom";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, RotateCcw,
  Pencil, Save, Check, AlertTriangle, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LineItem {
  temp_id: string;
  product_id: string;
  sku_id: string;
  product_name: string;
  size: string;
  qty: number;
  pur_price: number;
  sale_price: number;
  mrp?: number;
  gst_per: number;
  hsn_code: string;
  barcode: string;
  discount_percent: number;
  line_total: number;
  brand?: string;
  category?: string;
  color?: string;
  style?: string;
}

interface ProductEditPanelProps {
  open: boolean;
  onClose: () => void;
  lineItems: LineItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onProductUpdated: (tempId: string, updates: Partial<LineItem>) => void;
  focusField?: string;
}

interface ProductData {
  product_name: string;
  brand: string;
  category: string;
  style: string;
  color: string;
  hsn_code: string;
  gst_per: number;
  uom: string;
  default_pur_price: number;
  default_sale_price: number;
  default_mrp: number;
  purchase_gst_percent: number | null;
  sale_gst_percent: number | null;
  status: string;
}

const MARGIN_CHIPS = [10, 15, 20, 25, 30, 50];
const GST_RATES = [0, 5, 12, 18, 28];

const ProductEditPanel = ({
  open, onClose, lineItems, currentIndex, onIndexChange, onProductUpdated, focusField
}: ProductEditPanelProps) => {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [original, setOriginal] = useState<ProductData | null>(null);
  const [form, setForm] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(false);
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());
  const [showCriticalConfirm, setShowCriticalConfirm] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [pendingNavIndex, setPendingNavIndex] = useState<number | null>(null);
  const focusRef = useRef<HTMLInputElement>(null);
  const [currentVariant, setCurrentVariant] = useState<{
    id: string; size: string; barcode: string;
    pur_price: number; sale_price: number; mrp: number | null; active: boolean;
  } | null>(null);
  const [variantSize, setVariantSize] = useState("");
  const [sizeModified, setSizeModified] = useState(false);

  // Section open states
  const [sections, setSections] = useState({
    basic: true, classification: true, pricing: true,
    tax: false, stock: false, additional: false
  });

  const item = lineItems[currentIndex];

  // Load product data when item changes
  useEffect(() => {
    if (!item || !open) return;
    loadProductData(item.product_id);
  }, [item?.product_id, open]);

  // Focus field on open
  useEffect(() => {
    if (focusField && focusRef.current) {
      setTimeout(() => focusRef.current?.focus(), 300);
    }
  }, [focusField, currentIndex]);

  const loadProductData = async (productId: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (data) {
        const pd: ProductData = {
          product_name: data.product_name || "",
          brand: data.brand || "",
          category: data.category || "",
          style: data.style || "",
          color: data.color || "",
          hsn_code: data.hsn_code || "",
          gst_per: data.gst_per || 0,
          uom: data.uom || "NOS",
          default_pur_price: item?.pur_price || data.default_pur_price || 0,
          default_sale_price: item?.sale_price || data.default_sale_price || 0,
          default_mrp: item?.mrp || 0,
          purchase_gst_percent: data.purchase_gst_percent,
          sale_gst_percent: data.sale_gst_percent,
          status: data.status || "active",
        };
        setOriginal({ ...pd });
        setForm({ ...pd });
        setModifiedFields(new Set());
        setHasUnsavedChanges(false);
        setSaved(false);
        setCurrentVariant(null);
        setVariantSize("");
        setSizeModified(false);
      }

      // Fetch current variant for size editing
      if (item?.sku_id) {
        const { data: variantData } = await supabase
          .from("product_variants")
          .select("id, size, barcode, pur_price, sale_price, mrp, active")
          .eq("id", item.sku_id)
          .maybeSingle();
        if (variantData) {
          setCurrentVariant(variantData as any);
          setVariantSize(variantData.size || "");
          setSizeModified(false);
        }
      }
    } catch (err) {
      console.error("Failed to load product", err);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof ProductData, value: any) => {
    if (!form || !original) return;
    setForm(prev => prev ? { ...prev, [field]: value } : null);
    const changed = new Set(modifiedFields);
    if (value !== (original as any)[field]) {
      changed.add(field);
    } else {
      changed.delete(field);
    }
    setModifiedFields(changed);
    setHasUnsavedChanges(changed.size > 0);
  };

  const margin = form ? ((form.default_sale_price - form.default_pur_price) / (form.default_pur_price || 1)) * 100 : 0;
  const marginAmount = form ? form.default_sale_price - form.default_pur_price : 0;

  const marginColor = margin >= 10 ? "text-green-600" : margin >= 0 ? "text-amber-600" : "text-red-600";
  const marginBg = margin >= 10 ? "bg-green-50" : margin >= 0 ? "bg-amber-50" : "bg-red-50";

  const handleMarginChip = (pct: number) => {
    if (!form) return;
    const newSale = Math.round(form.default_pur_price * (1 + pct / 100));
    updateField("default_sale_price", newSale);
  };

  const criticalFields = ["hsn_code", "gst_per", "uom"];
  const hasCriticalChanges = criticalFields.some(f => modifiedFields.has(f));

  const handleSave = async () => {
    if (!form || !item) return;
    if (hasCriticalChanges && !showCriticalConfirm) {
      setShowCriticalConfirm(true);
      return;
    }

    setSaving(true);
    try {
      // Update product master
      const { error } = await supabase
        .from("products")
        .update({
          product_name: form.product_name?.toUpperCase(),
          brand: form.brand || null,
          category: form.category || null,
          style: form.style || null,
          color: form.color || null,
          hsn_code: form.hsn_code || null,
          gst_per: form.gst_per,
          uom: form.uom,
          default_pur_price: form.default_pur_price,
          default_sale_price: form.default_sale_price,
          purchase_gst_percent: form.purchase_gst_percent,
          sale_gst_percent: form.sale_gst_percent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.product_id);

      if (error) throw error;

      // Update variant MRP if changed
      if (modifiedFields.has("default_mrp") || modifiedFields.has("default_pur_price") || modifiedFields.has("default_sale_price")) {
        await supabase
          .from("product_variants")
          .update({
            pur_price: form.default_pur_price,
            sale_price: form.default_sale_price,
            mrp: form.default_mrp || null,
          })
          .eq("id", item.sku_id);
      }

      // Update line item in bill
      const lineUpdates: Partial<LineItem> = {};
      if (modifiedFields.has("product_name")) lineUpdates.product_name = form.product_name;
      if (modifiedFields.has("brand")) lineUpdates.brand = form.brand;
      if (modifiedFields.has("category")) lineUpdates.category = form.category;
      if (modifiedFields.has("style")) lineUpdates.style = form.style;
      if (modifiedFields.has("color")) lineUpdates.color = form.color;
      if (modifiedFields.has("hsn_code")) lineUpdates.hsn_code = form.hsn_code;
      if (modifiedFields.has("gst_per")) lineUpdates.gst_per = form.gst_per;
      if (modifiedFields.has("default_pur_price")) lineUpdates.pur_price = form.default_pur_price;
      if (modifiedFields.has("default_sale_price")) lineUpdates.sale_price = form.default_sale_price;
      if (modifiedFields.has("default_mrp")) lineUpdates.mrp = form.default_mrp;

      if (Object.keys(lineUpdates).length > 0) {
        onProductUpdated(item.temp_id, lineUpdates);
      }

      // Sync product_name to all purchase_items for this product
      if (modifiedFields.has("product_name")) {
        await supabase
          .from("purchase_items")
          .update({ product_name: form.product_name })
          .eq("product_id", item.product_id);
      }

      setOriginal({ ...form });
      setModifiedFields(new Set());
      setHasUnsavedChanges(false);
      setShowCriticalConfirm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);

      toast({
        title: "Product Updated",
        description: `${form.product_name} updated in Product Master`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update product",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (original) {
      setForm({ ...original });
      setModifiedFields(new Set());
      setHasUnsavedChanges(false);
      setShowCriticalConfirm(false);
    }
  };

  const navigateTo = (idx: number) => {
    if (hasUnsavedChanges) {
      setPendingNavIndex(idx);
      setShowUnsavedPrompt(true);
      return;
    }
    onIndexChange(idx);
  };

  const confirmNav = (save: boolean) => {
    if (save) {
      handleSave().then(() => {
        if (pendingNavIndex !== null) onIndexChange(pendingNavIndex);
        setShowUnsavedPrompt(false);
        setPendingNavIndex(null);
      });
    } else {
      handleReset();
      if (pendingNavIndex !== null) onIndexChange(pendingNavIndex);
      setShowUnsavedPrompt(false);
      setPendingNavIndex(null);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); e.preventDefault(); }
      if (e.ctrlKey && e.key === "s") { handleSave(); e.preventDefault(); }
      if (e.ctrlKey && e.key === "ArrowLeft" && currentIndex > 0) { navigateTo(currentIndex - 1); e.preventDefault(); }
      if (e.ctrlKey && e.key === "ArrowRight" && currentIndex < lineItems.length - 1) { navigateTo(currentIndex + 1); e.preventDefault(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, currentIndex, hasUnsavedChanges]);

  const renderField = (
    label: string, field: keyof ProductData, type: string = "text",
    opts?: { ref?: any; fullWidth?: boolean; readOnly?: boolean }
  ) => {
    if (!form) return null;
    const isModified = modifiedFields.has(field);
    const origVal = original ? (original as any)[field] : "";

    return (
      <div className={cn("space-y-1", opts?.fullWidth ? "col-span-2" : "")}>
        <Label className="text-xs">{label}</Label>
        <Input
          ref={opts?.ref}
          type={type}
          value={(form as any)[field] ?? ""}
          readOnly={opts?.readOnly}
          onChange={(e) => {
            const val = type === "number" ? parseFloat(e.target.value) || 0 : e.target.value;
            updateField(field, val);
          }}
          className={cn(
            "h-9 text-sm no-uppercase",
            isModified && "border-l-4 border-l-amber-500",
            opts?.readOnly && "bg-muted cursor-not-allowed"
          )}
        />
        {isModified && (
          <p className="text-[11px] text-muted-foreground italic">
            was: {String(origVal || "—")}
          </p>
        )}
      </div>
    );
  };

  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (!item || !form) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col max-h-[100dvh] h-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b px-4 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Edit Product
            </SheetTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">{item.sku_id?.slice(0, 8)}</Badge>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">{item.product_name}</span>
              {item.size && (
                <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-mono font-bold dark:bg-violet-900/30 dark:text-violet-300">
                  {item.size}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={currentIndex === 0}
              onClick={() => navigateTo(currentIndex - 1)} className="h-7 text-xs gap-1">
              <ChevronLeft className="h-3 w-3" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground font-medium">
              {currentIndex + 1} of {lineItems.length}
            </span>
            <Button variant="outline" size="sm" disabled={currentIndex === lineItems.length - 1}
              onClick={() => navigateTo(currentIndex + 1)} className="h-7 text-xs gap-1">
              Next <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          {modifiedFields.size > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1">
              <AlertTriangle className="h-3 w-3" />
              {modifiedFields.size} field{modifiedFields.size > 1 ? "s" : ""} modified
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">Loading...</div>
          ) : (
            <>
              {/* SECTION A: Basic Info */}
              <SectionBlock title="Basic Info" color="border-l-primary" open={sections.basic} onToggle={() => toggleSection("basic")}>
                <div className="grid grid-cols-2 gap-3">
                  {renderField("Product Name", "product_name", "text", { ref: focusField === "product_name" ? focusRef : undefined })}
                  {renderField("HSN Code", "hsn_code")}
                </div>
              </SectionBlock>

              {/* SECTION B: Classification */}
              <SectionBlock title="Classification" color="border-l-blue-500" open={sections.classification} onToggle={() => toggleSection("classification")}>
                <div className="grid grid-cols-2 gap-3">
                  {renderField("Brand", "brand", "text", { ref: focusField === "brand" ? focusRef : undefined })}
                  {renderField("Category", "category")}
                  {renderField("Style / Model", "style")}
                  {renderField("Color", "color")}
                  <div className="space-y-1">
                    <Label className="text-xs">Unit (UOM)</Label>
                    <Select value={form.uom} onValueChange={(v) => updateField("uom", v)}>
                      <SelectTrigger className={cn("h-9 text-sm", modifiedFields.has("uom") && "border-l-4 border-l-amber-500")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-[9999]">
                        {UOM_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {modifiedFields.has("uom") && (
                      <p className="text-[11px] text-muted-foreground italic">was: {original?.uom || "—"}</p>
                    )}
                  </div>
                </div>
              </SectionBlock>

              {/* SECTION C: Pricing */}
              <SectionBlock title="Pricing" color="border-l-green-500" open={sections.pricing} onToggle={() => toggleSection("pricing")}>
                <div className="grid grid-cols-2 gap-3">
                  {renderField("Purchase Price", "default_pur_price", "number", { ref: focusField === "pur_price" ? focusRef : undefined })}
                  {renderField("Sale Price", "default_sale_price", "number", { ref: focusField === "sale_price" ? focusRef : undefined })}
                  {renderField("MRP", "default_mrp", "number", { ref: focusField === "mrp" ? focusRef : undefined })}
                  
                  {/* Margin Display */}
                  <div className="space-y-1">
                    <Label className="text-xs">Margin</Label>
                    <div className={cn("h-9 rounded-md border px-3 flex items-center gap-2 text-sm font-bold", marginBg, marginColor)}>
                      <span>{margin.toFixed(1)}%</span>
                      <span className="text-xs font-normal">( ₹{marginAmount.toFixed(0)} )</span>
                    </div>
                  </div>
                </div>

                {/* Quick margin chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {MARGIN_CHIPS.map(pct => {
                    const isActive = Math.abs(margin - pct) < 0.5;
                    return (
                      <button key={pct} onClick={() => handleMarginChip(pct)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}>
                        +{pct}%
                      </button>
                    );
                  })}
                </div>

                {/* MRP Validation */}
                {form.default_mrp > 0 && form.default_sale_price > form.default_mrp && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3" /> Sale Price exceeds MRP
                  </p>
                )}
              </SectionBlock>

              {/* SECTION D: Tax / GST */}
              <SectionBlock title="Tax / GST" color="border-l-amber-500" open={sections.tax} onToggle={() => toggleSection("tax")}>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">GST Rate (Combined)</Label>
                    <Select value={String(form.gst_per)} onValueChange={(v) => {
                      const rate = Number(v);
                      updateField("gst_per", rate);
                      if (!form.purchase_gst_percent) updateField("purchase_gst_percent", rate);
                      if (!form.sale_gst_percent) updateField("sale_gst_percent", rate);
                    }}>
                      <SelectTrigger className={cn("h-9 text-sm", modifiedFields.has("gst_per") && "border-l-4 border-l-amber-500")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-[9999]">
                        {GST_RATES.map(r => (
                          <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {modifiedFields.has("gst_per") && (
                      <p className="text-[11px] text-muted-foreground italic">was: {original?.gst_per}%</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-amber-700 dark:text-amber-400">Purchase GST %</Label>
                    <Select
                      value={String(form.purchase_gst_percent ?? form.gst_per)}
                      onValueChange={(v) => updateField("purchase_gst_percent", Number(v))}
                    >
                      <SelectTrigger className={cn("h-9 text-sm", modifiedFields.has("purchase_gst_percent") && "border-l-4 border-l-amber-500")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-[9999]">
                        {GST_RATES.map(r => (
                          <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {modifiedFields.has("purchase_gst_percent") && (
                      <p className="text-[11px] text-muted-foreground italic">was: {original?.purchase_gst_percent ?? original?.gst_per}%</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-green-700 dark:text-green-400">Sale GST %</Label>
                    <Select
                      value={String(form.sale_gst_percent ?? form.gst_per)}
                      onValueChange={(v) => updateField("sale_gst_percent", Number(v))}
                    >
                      <SelectTrigger className={cn("h-9 text-sm", modifiedFields.has("sale_gst_percent") && "border-l-4 border-l-amber-500")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-[9999]">
                        {GST_RATES.map(r => (
                          <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {modifiedFields.has("sale_gst_percent") && (
                      <p className="text-[11px] text-muted-foreground italic">was: {original?.sale_gst_percent ?? original?.gst_per}%</p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  GST changes apply to future transactions only. Purchase GST affects purchase bills; Sale GST affects sales invoices.
                </p>
              </SectionBlock>

              {/* SECTION E: Stock & Inventory — Size and barcode edit */}
              <SectionBlock title="Stock & Inventory" color="border-l-violet-500" open={sections.stock} onToggle={() => toggleSection("stock")}>
                {currentVariant ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">
                          Size
                          {sizeModified && <span className="ml-1 text-[10px] text-amber-600 font-semibold">(modified)</span>}
                        </Label>
                        <Input
                          value={variantSize}
                          onChange={(e) => {
                            setVariantSize(e.target.value.toUpperCase());
                            setSizeModified(e.target.value.toUpperCase() !== (currentVariant?.size || ""));
                          }}
                          className={cn("h-9 text-sm font-mono", sizeModified && "border-l-4 border-l-amber-500")}
                          placeholder="e.g. S, M, L, XL, 36"
                        />
                        {sizeModified && (
                          <p className="text-[11px] text-amber-600 italic">was: {currentVariant.size}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Barcode</Label>
                        <div className="h-9 flex items-center px-3 bg-muted/50 rounded-md border text-sm font-mono text-muted-foreground">
                          {currentVariant.barcode || "—"}
                        </div>
                      </div>
                    </div>
                    {sizeModified && (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={async () => {
                            if (!currentVariant?.id || !variantSize.trim()) return;
                            try {
                              const { error } = await supabase
                                .from("product_variants")
                                .update({ size: variantSize.trim() })
                                .eq("id", currentVariant.id);
                              if (error) throw error;
                              setCurrentVariant(prev => prev ? { ...prev, size: variantSize.trim() } : prev);
                              setSizeModified(false);
                              onProductUpdated(item.temp_id, { size: variantSize.trim() });
                              toast({ title: "Size Updated", description: `Size changed to ${variantSize.trim()}` });
                            } catch (err: any) {
                              toast({ title: "Error", description: err.message, variant: "destructive" });
                            }
                          }}
                        >
                          <Save className="h-3 w-3" /> Save Size Change
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => { setVariantSize(currentVariant?.size || ""); setSizeModified(false); }}>
                          Cancel
                        </Button>
                        <p className="text-[11px] text-amber-600">⚠️ Updates product master. Existing records unchanged.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/50">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Pur Price</p>
                        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">₹{currentVariant.pur_price || 0}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Sale Price</p>
                        <p className="text-sm font-semibold text-green-700 dark:text-green-400">₹{currentVariant.sale_price || 0}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">MRP</p>
                        <p className="text-sm font-semibold">₹{currentVariant.mrp || "—"}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Loading variant details...</p>
                )}
              </SectionBlock>
            </>
          )}

          {/* Critical changes confirmation */}
          {showCriticalConfirm && (
            <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                ⚠️ Critical Changes Detected
              </p>
              <ul className="text-xs space-y-1 text-amber-700 dark:text-amber-400">
                {criticalFields.filter(f => modifiedFields.has(f)).map(f => (
                  <li key={f}>
                    <strong>{f.toUpperCase()}</strong>: {String((original as any)[f] || "—")} → {String((form as any)[f])}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-600">These changes affect existing stock and transaction records</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowCriticalConfirm(false)} className="h-7 text-xs">Cancel</Button>
                <Button size="sm" onClick={handleSave} className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white">Confirm & Save</Button>
              </div>
            </div>
          )}

          {/* Unsaved changes prompt */}
          {showUnsavedPrompt && (
            <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium">You have unsaved changes</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setShowUnsavedPrompt(false); setPendingNavIndex(null); }} className="h-7 text-xs">Cancel</Button>
                <Button size="sm" variant="secondary" onClick={() => confirmNav(false)} className="h-7 text-xs">Discard & Move</Button>
                <Button size="sm" onClick={() => confirmNav(true)} className="h-7 text-xs">Save & Move</Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t px-4 py-2 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={modifiedFields.size === 0} className="text-xs gap-1">
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
            <LoadingButton
              size="sm"
              loading={saving}
              loadingText="Saving..."
              disabled={modifiedFields.size === 0}
              onClick={handleSave}
              className={cn("text-xs gap-1", saved && "bg-green-600 hover:bg-green-700")}
            >
              {saved ? <><Check className="h-3 w-3" /> Saved!</> : <><Save className="h-3 w-3" /> Save & Update Master</>}
            </LoadingButton>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Collapsible section wrapper
const SectionBlock = ({
  title, color, open, onToggle, children
}: {
  title: string; color: string; open: boolean;
  onToggle: () => void; children: React.ReactNode;
}) => (
  <div className={cn("border rounded-lg overflow-hidden", color, "border-l-4")}>
    <button onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 bg-card hover:bg-accent/50 transition-colors">
      <span className="text-sm font-semibold">{title}</span>
      {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
    </button>
    {open && <div className="px-3 pb-3 pt-1">{children}</div>}
  </div>
);

export default ProductEditPanel;
