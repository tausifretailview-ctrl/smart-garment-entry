import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Search, RefreshCw, Check, ArrowRight, ArrowLeft, ChevronsUpDown, History, Clock, Merge, Layers } from "lucide-react";
import { ProductBrandUpdateDialog } from "@/components/ProductBrandUpdateDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  useBulkProductUpdate,
  UpdateType,
  FilterCriteria,
  FindReplaceConfig,
  UpdateFieldConfig,
  DiscountConfig,
  GSTConfig,
  PriceConfig,
  PreviewItem
} from "@/hooks/useBulkProductUpdate";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";
import { FormPageSkeleton } from "@/components/skeletons/FormPageSkeleton";
import { Loader2 } from "lucide-react";

const GST_OPTIONS = [0, 5, 12, 18, 28];

const UPDATE_TYPES: { value: UpdateType; label: string }[] = [
  { value: "find_replace", label: "Find & Replace" },
  { value: "update_field", label: "Set Field" },
  { value: "apply_discount", label: "Discount" },
  { value: "update_gst", label: "GST %" },
  { value: "update_prices", label: "Prices" },
];

const fieldClass = "h-10 border-slate-200 bg-slate-50 text-sm focus:bg-white";
const darkHead = "h-10 text-xs font-bold uppercase tracking-wide text-white";

export default function BulkProductUpdate() {
  const { currentOrganization, loading: orgLoading } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const {
    loading,
    previewItems,
    fetchFilterOptions,
    generatePreview,
    applyUpdates,
    fetchHistory,
    clearPreview,
  } = useBulkProductUpdate();

  const [updateHistory, setUpdateHistory] = useState<any[]>([]);
  const [productBrandOpen, setProductBrandOpen] = useState(false);
  // Filter state
  const [filters, setFilters] = useState<FilterCriteria>({});
  const [filterOptions, setFilterOptions] = useState<{ productNames: string[]; categories: string[]; brands: string[]; styles: string[] }>({ productNames: [], categories: [], brands: [], styles: [] });
  const [updateType, setUpdateType] = useState<UpdateType>("find_replace");
  const [frConfig, setFrConfig] = useState<FindReplaceConfig>({ field: "category", find: "", replace: "", exactMatch: true });
  const [ufConfig, setUfConfig] = useState<UpdateFieldConfig>({ field: "category", value: "" });
  const [discConfig, setDiscConfig] = useState<DiscountConfig>({ discountType: "percentage", value: 0, applyTo: "sale_price" });
  const [gstConfig, setGstConfig] = useState<GSTConfig>({ currentGst: null, newGst: 5 });
  const [priceConfig, setPriceConfig] = useState<PriceConfig>({ priceType: "sale_price", updateMethod: "set", value: 0 });

  useEffect(() => {
    loadFilterOptions();
    loadHistory();
  }, []);

  // Show loading state while organization data is loading
  if (orgLoading || !currentOrganization) {
    return <FormPageSkeleton groups={2} fieldsPerGroup={4} />;
  }

  const loadFilterOptions = async () => {
    const options = await fetchFilterOptions();
    setFilterOptions(options);
  };

  const loadHistory = async () => {
    const data = await fetchHistory();
    setUpdateHistory(data);
  };

  const handlePreview = async () => {
    let config: FindReplaceConfig | UpdateFieldConfig | DiscountConfig | GSTConfig | PriceConfig;

    switch (updateType) {
      case "find_replace":
        config = frConfig;
        break;
      case "update_field":
        config = ufConfig;
        break;
      case "apply_discount":
        config = discConfig;
        break;
      case "update_gst":
        config = gstConfig;
        break;
      case "update_prices":
        config = priceConfig;
        break;
    }

    await generatePreview(filters, updateType, config);
  };

  const handleApply = async () => {
    let config: FindReplaceConfig | UpdateFieldConfig | DiscountConfig | GSTConfig | PriceConfig;

    switch (updateType) {
      case "find_replace":
        config = frConfig;
        break;
      case "update_field":
        config = ufConfig;
        break;
      case "apply_discount":
        config = discConfig;
        break;
      case "update_gst":
        config = gstConfig;
        break;
      case "update_prices":
        config = priceConfig;
        break;
    }

    const success = await applyUpdates(updateType, config, previewItems, filters);
    if (success) {
      loadFilterOptions();
      loadHistory();
    }
  };

  const getConfigSummary = () => {
    switch (updateType) {
      case "find_replace":
        return `Replace "${frConfig.find}" with "${frConfig.replace}" in ${frConfig.field}`;
      case "update_field":
        if (ufConfig.field === "requires_imei") {
          return `Set requires IMEI to ${ufConfig.value === true || ufConfig.value === "true" ? "Yes" : "No"}`;
        }
        return `Set ${ufConfig.field} to "${ufConfig.value}"`;
      case "apply_discount":
        return `Apply ${discConfig.value}${discConfig.discountType === "percentage" ? "%" : " ₹"} discount on ${discConfig.applyTo}`;
      case "update_gst":
        return `Update GST from ${gstConfig.currentGst ?? "any"}% to ${gstConfig.newGst}%`;
      case "update_prices":
        return `${priceConfig.updateMethod === "set" ? "Set" : priceConfig.updateMethod === "increase" ? "Increase" : "Decrease"} ${priceConfig.priceType} ${priceConfig.updateMethod !== "set" ? "by" : "to"} ${priceConfig.value}${priceConfig.updateMethod !== "set" ? "%" : ""}`;
        return `${priceConfig.updateMethod === "set" ? "Set" : priceConfig.updateMethod === "increase" ? "Increase" : "Decrease"} ${priceConfig.priceType} ${priceConfig.updateMethod !== "set" ? "by" : "to"} ${priceConfig.value}${priceConfig.updateMethod !== "set" ? "%" : ""}`;
    }
  };

  return (
    <div className="bulk-product-update-workspace flex h-full min-h-0 w-full flex-col overflow-y-auto bg-slate-50 px-2 py-2 sm:px-3">
      <div className="flex w-full min-w-0 flex-col gap-2">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 px-3 text-sm"
              onClick={() => orgNavigate("/products")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Products
            </Button>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-teal-700">
                <Layers className="h-5 w-5 shrink-0" />
                Bulk Product Update
              </h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Update many products or sizes at once
                {filterOptions.productNames.length > 0
                  ? ` · ${filterOptions.productNames.length.toLocaleString("en-IN")} product names`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm"
              onClick={() => {
                void loadFilterOptions();
                void loadHistory();
              }}
              disabled={loading}
            >
              <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
              onClick={() => setProductBrandOpen(true)}
            >
              <Merge className="mr-1.5 h-4 w-4" />
              Product & Brand Update
            </Button>
          </div>
        </div>

        <ProductBrandUpdateDialog
          open={productBrandOpen}
          onOpenChange={setProductBrandOpen}
          organizationId={currentOrganization.id}
          brands={filterOptions.brands}
          onComplete={() => {
            loadFilterOptions();
          }}
        />

        <div className="grid gap-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Left column: filters & configuration */}
          <div className="flex min-w-0 flex-col gap-2">
            <Card className="overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
              <div className="border-b border-slate-100 bg-white px-3 py-2">
                <p className="text-sm font-bold text-slate-800">1. Pick products</p>
                <p className="text-xs text-muted-foreground">Leave a box empty to include all</p>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 bg-white px-3 py-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-600">Category</Label>
                  <Select value={filters.category || "__all__"} onValueChange={(v) => setFilters({ ...filters, category: v === "__all__" ? undefined : v })}>
                    <SelectTrigger className={fieldClass}>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Categories</SelectItem>
                      {filterOptions.categories.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-600">Brand</Label>
                  <Select value={filters.brand || "__all__"} onValueChange={(v) => setFilters({ ...filters, brand: v === "__all__" ? undefined : v })}>
                    <SelectTrigger className={fieldClass}>
                      <SelectValue placeholder="All Brands" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Brands</SelectItem>
                      {filterOptions.brands.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-600">Product Name</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className={cn(fieldClass, "w-full justify-between font-normal")}>
                        <span className="truncate">{filters.productName || "All Products"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search product..." />
                        <CommandList className="max-h-60">
                          <CommandEmpty>No product found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem value="__all__" onSelect={() => setFilters({ ...filters, productName: undefined })}>
                              <Check className={`mr-2 h-4 w-4 ${!filters.productName ? "opacity-100" : "opacity-0"}`} />
                              All Products
                            </CommandItem>
                            {filterOptions.productNames.map(name => (
                              <CommandItem key={name} value={name} onSelect={() => setFilters({ ...filters, productName: name })}>
                                <Check className={`mr-2 h-4 w-4 ${filters.productName === name ? "opacity-100" : "opacity-0"}`} />
                                {name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-600">Style</Label>
                  <Input
                    placeholder="Search by style..."
                    className={fieldClass}
                    value={filters.style || ""}
                    onChange={(e) => setFilters({ ...filters, style: e.target.value || undefined })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-600">Barcode</Label>
                  <Input
                    placeholder="Enter barcode..."
                    className={fieldClass}
                    value={filters.barcode || ""}
                    onChange={(e) => setFilters({ ...filters, barcode: e.target.value || undefined })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-600">HSN Code</Label>
                  <Input
                    placeholder="Enter HSN..."
                    className={fieldClass}
                    value={filters.hsnCode || ""}
                    onChange={(e) => setFilters({ ...filters, hsnCode: e.target.value || undefined })}
                  />
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2">
                <p className="text-sm font-bold text-slate-800">2. What to change</p>
                <div className="flex flex-wrap items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  {UPDATE_TYPES.map(({ value, label }) => (
                    <Button
                      key={value}
                      type="button"
                      variant={updateType === value ? "default" : "ghost"}
                      size="sm"
                      className={cn(
                        "h-8 px-2.5 text-sm font-semibold",
                        updateType === value ? "bg-slate-700 text-white hover:bg-slate-700" : "text-slate-600",
                      )}
                      onClick={() => {
                        if (updateType === value) return;
                        setUpdateType(value);
                        clearPreview();
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-3 bg-white px-3 py-3">
              {updateType === "find_replace" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Field</Label>
                    <Select value={frConfig.field} onValueChange={(v) => setFrConfig({ ...frConfig, field: v as FindReplaceConfig["field"] })}>
                      <SelectTrigger className={fieldClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product_name">Product Name</SelectItem>
                        <SelectItem value="category">Category</SelectItem>
                        <SelectItem value="brand">Brand</SelectItem>
                        <SelectItem value="style">Style</SelectItem>
                        <SelectItem value="color">Color</SelectItem>
                        <SelectItem value="hsn_code">HSN Code</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Find</Label>
                    <Input
                      className={fieldClass}
                      placeholder="Text to find..."
                      value={frConfig.find}
                      onChange={(e) => setFrConfig({ ...frConfig, find: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Replace With</Label>
                    <Input
                      className={fieldClass}
                      placeholder="New text..."
                      value={frConfig.replace}
                      onChange={(e) => setFrConfig({ ...frConfig, replace: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="exactMatch"
                      checked={frConfig.exactMatch}
                      onCheckedChange={(c) => setFrConfig({ ...frConfig, exactMatch: !!c })}
                    />
                    <Label htmlFor="exactMatch" className="text-sm font-normal">Match exact value only</Label>
                  </div>
                </>
              )}

              {updateType === "update_field" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Field</Label>
                    <Select value={ufConfig.field} onValueChange={(v) => setUfConfig({ ...ufConfig, field: v as UpdateFieldConfig["field"] })}>
                      <SelectTrigger className={fieldClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="category">Category</SelectItem>
                        <SelectItem value="brand">Brand</SelectItem>
                        <SelectItem value="style">Style</SelectItem>
                        <SelectItem value="color">Color</SelectItem>
                        <SelectItem value="hsn_code">HSN Code</SelectItem>
                        <SelectItem value="gst_per">GST %</SelectItem>
                        <SelectItem value="requires_imei">Requires IMEI (Mobile ERP)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">New Value</Label>
                    {ufConfig.field === "gst_per" ? (
                      <Select value={String(ufConfig.value)} onValueChange={(v) => setUfConfig({ ...ufConfig, value: Number(v) })}>
                        <SelectTrigger className={fieldClass}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GST_OPTIONS.map(g => (
                            <SelectItem key={g} value={String(g)}>{g}%</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : ufConfig.field === "requires_imei" ? (
                      <Select
                        value={ufConfig.value === true || ufConfig.value === "true" ? "true" : "false"}
                        onValueChange={(v) => setUfConfig({ ...ufConfig, value: v === "true" })}
                      >
                        <SelectTrigger className={fieldClass}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Yes — unique IMEI per unit (handsets)</SelectItem>
                          <SelectItem value="false">No — shared barcode + qty (accessories)</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className={fieldClass}
                        placeholder="Enter new value..."
                        value={ufConfig.value as string}
                        onChange={(e) => setUfConfig({ ...ufConfig, value: e.target.value })}
                      />
                    )}
                  </div>
                </>
              )}

              {updateType === "apply_discount" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Discount Type</Label>
                    <RadioGroup value={discConfig.discountType} onValueChange={(v) => setDiscConfig({ ...discConfig, discountType: v as "percentage" | "flat" })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="percentage" id="disc_pct" />
                        <Label htmlFor="disc_pct" className="text-sm font-normal">Percentage (%)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="flat" id="disc_flat" />
                        <Label htmlFor="disc_flat" className="text-sm font-normal">Flat Amount (₹)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Value</Label>
                    <Input
                      className={fieldClass}
                      type="number"
                      placeholder="Enter discount value..."
                      value={discConfig.value || ""}
                      onChange={(e) => setDiscConfig({ ...discConfig, value: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Apply To</Label>
                    <RadioGroup value={discConfig.applyTo} onValueChange={(v) => setDiscConfig({ ...discConfig, applyTo: v as "sale_price" | "mrp" })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sale_price" id="apply_sale" />
                        <Label htmlFor="apply_sale" className="text-sm font-normal">Sale Price</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="mrp" id="apply_mrp" />
                        <Label htmlFor="apply_mrp" className="text-sm font-normal">MRP</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </>
              )}

              {updateType === "update_gst" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Current GST % (Optional Filter)</Label>
                    <Select value={gstConfig.currentGst === null ? "__all__" : String(gstConfig.currentGst)} onValueChange={(v) => setGstConfig({ ...gstConfig, currentGst: v === "__all__" ? null : Number(v) })}>
                      <SelectTrigger className={fieldClass}>
                        <SelectValue placeholder="All GST %" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All GST %</SelectItem>
                        {GST_OPTIONS.map(g => (
                          <SelectItem key={g} value={String(g)}>{g}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">New GST %</Label>
                    <Select value={String(gstConfig.newGst)} onValueChange={(v) => setGstConfig({ ...gstConfig, newGst: Number(v) })}>
                      <SelectTrigger className={fieldClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GST_OPTIONS.map(g => (
                          <SelectItem key={g} value={String(g)}>{g}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {updateType === "update_prices" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Price Type</Label>
                    <RadioGroup value={priceConfig.priceType} onValueChange={(v) => setPriceConfig({ ...priceConfig, priceType: v as PriceConfig["priceType"] })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="pur_price" id="price_pur" />
                        <Label htmlFor="price_pur" className="text-sm font-normal">Purchase Price</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sale_price" id="price_sale" />
                        <Label htmlFor="price_sale" className="text-sm font-normal">Sale Price</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="mrp" id="price_mrp" />
                        <Label htmlFor="price_mrp" className="text-sm font-normal">MRP</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">Update Method</Label>
                    <RadioGroup value={priceConfig.updateMethod} onValueChange={(v) => setPriceConfig({ ...priceConfig, updateMethod: v as PriceConfig["updateMethod"] })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="set" id="method_set" />
                        <Label htmlFor="method_set" className="text-sm font-normal">Set Fixed Value</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="increase" id="method_inc" />
                        <Label htmlFor="method_inc" className="text-sm font-normal">Increase By %</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="decrease" id="method_dec" />
                        <Label htmlFor="method_dec" className="text-sm font-normal">Decrease By %</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-600">{priceConfig.updateMethod === "set" ? "Fixed Value (₹)" : "Percentage (%)"}</Label>
                    <Input
                      className={fieldClass}
                      type="number"
                      placeholder="Enter value..."
                      value={priceConfig.value || ""}
                      onChange={(e) => setPriceConfig({ ...priceConfig, value: Number(e.target.value) })}
                    />
                  </div>
                </>
              )}

                <Button
                  onClick={handlePreview}
                  disabled={loading}
                  className="h-10 w-full bg-teal-600 text-sm font-semibold text-white hover:bg-teal-700"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Preview Changes
                </Button>
              </div>
            </Card>
          </div>

          {/* Right column: preview + history */}
          <div className="flex min-w-0 flex-col gap-2">
            <Card className="overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">
                    3. Preview{" "}
                    <span className="font-semibold text-teal-700">
                      ({previewItems.length.toLocaleString("en-IN")} item{previewItems.length === 1 ? "" : "s"})
                    </span>
                  </p>
                  {previewItems.length > 0 && (
                    <p className="truncate text-xs text-muted-foreground">{getConfigSummary()}</p>
                  )}
                </div>
                {previewItems.length > 0 && (
                  <Button variant="outline" size="sm" className="h-8 text-sm" onClick={clearPreview}>
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                    Clear
                  </Button>
                )}
              </div>
              {previewItems.length === 0 ? (
                <div className="bg-white px-3 py-12 text-center text-muted-foreground">
                  <Search className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p className="text-sm">Pick products, choose what to change, then click "Preview Changes"</p>
                </div>
              ) : (
                <div className="bg-white">
                  <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Check the changes below before applying. This cannot be undone.
                  </div>
                  <div className="max-h-[480px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="border-none bg-slate-800 hover:bg-slate-800">
                          <TableHead className={cn(darkHead, "w-[52px]")}>Sr.</TableHead>
                          <TableHead className={darkHead}>Product</TableHead>
                          <TableHead className={darkHead}>Size / Barcode</TableHead>
                          <TableHead className={cn(darkHead, "text-right")}>Current</TableHead>
                          <TableHead className={cn(darkHead, "w-[32px]")} />
                          <TableHead className={darkHead}>New</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewItems.slice(0, 200).map((item, idx) => (
                          <TableRow key={item.id} className="text-sm">
                            <TableCell className="py-2 tabular-nums text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="py-2 font-semibold text-slate-800">
                              {item.productName}
                              {item.style && <span className="block text-xs font-normal text-muted-foreground">{item.style}</span>}
                            </TableCell>
                            <TableCell className="py-2">
                              {item.type === "variant" && (
                                <div className="flex flex-wrap items-center gap-1">
                                  {item.size && <Badge variant="secondary">{item.size}</Badge>}
                                  {item.barcode && <span className="font-mono text-xs text-muted-foreground">{item.barcode}</span>}
                                </div>
                              )}
                              {item.type === "product" && <Badge variant="outline">Product</Badge>}
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              <span className="font-medium text-red-600">{item.currentValue ?? "-"}</span>
                            </TableCell>
                            <TableCell className="py-2">
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                            <TableCell className="py-2">
                              <span className="font-bold text-emerald-700">{item.newValue ?? "-"}</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="border-t border-slate-100 px-3 py-2">
                    {previewItems.length > 200 && (
                      <p className="mb-2 text-center text-xs text-muted-foreground">
                        Showing first 200 of {previewItems.length.toLocaleString("en-IN")} items
                      </p>
                    )}
                    <Button
                      onClick={handleApply}
                      disabled={loading || previewItems.length === 0}
                      className="h-10 w-full bg-teal-600 text-sm font-semibold text-white hover:bg-teal-700"
                    >
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Apply Changes to {previewItems.length.toLocaleString("en-IN")} Items
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {/* Update History */}
            {updateHistory.length > 0 && (
              <Card className="overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-3 py-2">
                  <History className="h-4 w-4 text-teal-700" />
                  <p className="text-sm font-bold text-slate-800">Recent bulk updates</p>
                </div>
                <div className="max-h-[360px] overflow-auto bg-white">
                  <Table>
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow className="border-none bg-slate-800 hover:bg-slate-800">
                        <TableHead className={darkHead}>Date</TableHead>
                        <TableHead className={darkHead}>Type</TableHead>
                        <TableHead className={cn(darkHead, "text-right")}>Items</TableHead>
                        <TableHead className={darkHead}>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {updateHistory.map((h: any) => (
                        <TableRow key={h.id} className="text-sm">
                          <TableCell className="whitespace-nowrap py-2">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              {new Date(h.created_at).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="secondary">
                              {h.update_type === "find_replace" ? "Find & Replace" :
                               h.update_type === "update_field" ? "Update Field" :
                               h.update_type === "apply_discount" ? "Discount" :
                               h.update_type === "update_gst" ? "GST Update" :
                               h.update_type === "update_prices" ? "Price Update" : h.update_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums font-semibold">
                            {Number(h.items_count ?? 0).toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate py-2 text-muted-foreground">
                            {h.config && (() => {
                              const c = h.config;
                              if (h.update_type === "find_replace") return `"${c.find}" → "${c.replace}" in ${c.field}`;
                              if (h.update_type === "update_field") return `Set ${c.field} = "${c.value}"`;
                              if (h.update_type === "apply_discount") return `${c.value}${c.discountType === "percentage" ? "%" : "₹"} off on ${c.applyTo}`;
                              if (h.update_type === "update_gst") return `GST ${c.currentGst ?? "any"}% → ${c.newGst}%`;
                              if (h.update_type === "update_prices") return `${c.priceType}: ${c.updateMethod} ${c.value}${c.updateMethod !== "set" ? "%" : ""}`;
                              return JSON.stringify(c);
                            })()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
