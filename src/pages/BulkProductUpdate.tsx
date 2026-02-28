import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Search, RefreshCw, Check, ArrowRight, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Loader2 } from "lucide-react";

const GST_OPTIONS = [0, 5, 12, 18, 28];

export default function BulkProductUpdate() {
  const { currentOrganization, loading: orgLoading } = useOrganization();
  const {
    loading,
    previewItems,
    fetchFilterOptions,
    generatePreview,
    applyUpdates,
    clearPreview,
  } = useBulkProductUpdate();

  // Show loading state while organization data is loading
  if (orgLoading || !currentOrganization) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Filter state
  const [filters, setFilters] = useState<FilterCriteria>({});
  const [filterOptions, setFilterOptions] = useState<{ productNames: string[]; categories: string[]; brands: string[]; styles: string[] }>({ productNames: [], categories: [], brands: [], styles: [] });

  // Update type
  const [updateType, setUpdateType] = useState<UpdateType>("find_replace");

  // Find & Replace config
  const [frConfig, setFrConfig] = useState<FindReplaceConfig>({
    field: "category",
    find: "",
    replace: "",
    exactMatch: true,
  });

  // Update Field config
  const [ufConfig, setUfConfig] = useState<UpdateFieldConfig>({
    field: "category",
    value: "",
  });

  // Discount config
  const [discConfig, setDiscConfig] = useState<DiscountConfig>({
    discountType: "percentage",
    value: 0,
    applyTo: "sale_price",
  });

  // GST config
  const [gstConfig, setGstConfig] = useState<GSTConfig>({
    currentGst: null,
    newGst: 5,
  });

  // Price config
  const [priceConfig, setPriceConfig] = useState<PriceConfig>({
    priceType: "sale_price",
    updateMethod: "set",
    value: 0,
  });

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    const options = await fetchFilterOptions();
    setFilterOptions(options);
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

    const success = await applyUpdates(updateType, config, previewItems);
    if (success) {
      loadFilterOptions(); // Refresh filter options after update
    }
  };

  const getConfigSummary = () => {
    switch (updateType) {
      case "find_replace":
        return `Replace "${frConfig.find}" with "${frConfig.replace}" in ${frConfig.field}`;
      case "update_field":
        return `Set ${ufConfig.field} to "${ufConfig.value}"`;
      case "apply_discount":
        return `Apply ${discConfig.value}${discConfig.discountType === "percentage" ? "%" : " ₹"} discount on ${discConfig.applyTo}`;
      case "update_gst":
        return `Update GST from ${gstConfig.currentGst ?? "any"}% to ${gstConfig.newGst}%`;
      case "update_prices":
        return `${priceConfig.updateMethod === "set" ? "Set" : priceConfig.updateMethod === "increase" ? "Increase" : "Decrease"} ${priceConfig.priceType} ${priceConfig.updateMethod !== "set" ? "by" : "to"} ${priceConfig.value}${priceConfig.updateMethod !== "set" ? "%" : ""}`;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <BackToDashboard />
          <h1 className="text-2xl font-bold mt-2">Bulk Product Update</h1>
          <p className="text-muted-foreground">Update multiple products or variants at once</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Column: Filters & Configuration */}
        <div className="space-y-6">
          {/* Filter Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filter Products</CardTitle>
              <CardDescription>Select which products to update</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={filters.category || "__all__"} onValueChange={(v) => setFilters({ ...filters, category: v === "__all__" ? undefined : v })}>
                    <SelectTrigger>
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
                <div className="space-y-2">
                  <Label>Brand</Label>
                  <Select value={filters.brand || "__all__"} onValueChange={(v) => setFilters({ ...filters, brand: v === "__all__" ? undefined : v })}>
                    <SelectTrigger>
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
                <div className="space-y-2">
                  <Label>Product Name</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between h-11 font-medium text-[15px]">
                        {filters.productName || "All Products"}
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
                <div className="space-y-2">
                  <Label>Style</Label>
                  <Input 
                    placeholder="Search by style..." 
                    value={filters.style || ""} 
                    onChange={(e) => setFilters({ ...filters, style: e.target.value || undefined })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Barcode</Label>
                  <Input 
                    placeholder="Enter barcode..." 
                    value={filters.barcode || ""} 
                    onChange={(e) => setFilters({ ...filters, barcode: e.target.value || undefined })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>HSN Code</Label>
                  <Input 
                    placeholder="Enter HSN..." 
                    value={filters.hsnCode || ""} 
                    onChange={(e) => setFilters({ ...filters, hsnCode: e.target.value || undefined })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Update Type Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Update Type</CardTitle>
              <CardDescription>Choose what kind of update to perform</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={updateType} onValueChange={(v) => { setUpdateType(v as UpdateType); clearPreview(); }}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="find_replace" id="find_replace" />
                  <Label htmlFor="find_replace">Find & Replace Text</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="update_field" id="update_field" />
                  <Label htmlFor="update_field">Update Field Value</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="apply_discount" id="apply_discount" />
                  <Label htmlFor="apply_discount">Apply Discount</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="update_gst" id="update_gst" />
                  <Label htmlFor="update_gst">Update GST %</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="update_prices" id="update_prices" />
                  <Label htmlFor="update_prices">Update Prices</Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Configuration Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configuration</CardTitle>
              <CardDescription>Configure the update parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {updateType === "find_replace" && (
                <>
                  <div className="space-y-2">
                    <Label>Field</Label>
                    <Select value={frConfig.field} onValueChange={(v) => setFrConfig({ ...frConfig, field: v as FindReplaceConfig["field"] })}>
                      <SelectTrigger>
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
                    <Label>Find</Label>
                    <Input 
                      placeholder="Text to find..." 
                      value={frConfig.find} 
                      onChange={(e) => setFrConfig({ ...frConfig, find: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Replace With</Label>
                    <Input 
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
                    <Label htmlFor="exactMatch">Match exact value only</Label>
                  </div>
                </>
              )}

              {updateType === "update_field" && (
                <>
                  <div className="space-y-2">
                    <Label>Field</Label>
                    <Select value={ufConfig.field} onValueChange={(v) => setUfConfig({ ...ufConfig, field: v as UpdateFieldConfig["field"] })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="category">Category</SelectItem>
                        <SelectItem value="brand">Brand</SelectItem>
                        <SelectItem value="style">Style</SelectItem>
                        <SelectItem value="color">Color</SelectItem>
                        <SelectItem value="hsn_code">HSN Code</SelectItem>
                        <SelectItem value="gst_per">GST %</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>New Value</Label>
                    {ufConfig.field === "gst_per" ? (
                      <Select value={String(ufConfig.value)} onValueChange={(v) => setUfConfig({ ...ufConfig, value: Number(v) })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GST_OPTIONS.map(g => (
                            <SelectItem key={g} value={String(g)}>{g}%</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input 
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
                    <Label>Discount Type</Label>
                    <RadioGroup value={discConfig.discountType} onValueChange={(v) => setDiscConfig({ ...discConfig, discountType: v as "percentage" | "flat" })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="percentage" id="disc_pct" />
                        <Label htmlFor="disc_pct">Percentage (%)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="flat" id="disc_flat" />
                        <Label htmlFor="disc_flat">Flat Amount (₹)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Value</Label>
                    <Input 
                      type="number" 
                      placeholder="Enter discount value..." 
                      value={discConfig.value || ""} 
                      onChange={(e) => setDiscConfig({ ...discConfig, value: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Apply To</Label>
                    <RadioGroup value={discConfig.applyTo} onValueChange={(v) => setDiscConfig({ ...discConfig, applyTo: v as "sale_price" | "mrp" })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sale_price" id="apply_sale" />
                        <Label htmlFor="apply_sale">Sale Price</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="mrp" id="apply_mrp" />
                        <Label htmlFor="apply_mrp">MRP</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </>
              )}

              {updateType === "update_gst" && (
                <>
                  <div className="space-y-2">
                    <Label>Current GST % (Optional Filter)</Label>
                    <Select value={gstConfig.currentGst === null ? "__all__" : String(gstConfig.currentGst)} onValueChange={(v) => setGstConfig({ ...gstConfig, currentGst: v === "__all__" ? null : Number(v) })}>
                      <SelectTrigger>
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
                    <Label>New GST %</Label>
                    <Select value={String(gstConfig.newGst)} onValueChange={(v) => setGstConfig({ ...gstConfig, newGst: Number(v) })}>
                      <SelectTrigger>
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
                    <Label>Price Type</Label>
                    <RadioGroup value={priceConfig.priceType} onValueChange={(v) => setPriceConfig({ ...priceConfig, priceType: v as PriceConfig["priceType"] })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="pur_price" id="price_pur" />
                        <Label htmlFor="price_pur">Purchase Price</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sale_price" id="price_sale" />
                        <Label htmlFor="price_sale">Sale Price</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="mrp" id="price_mrp" />
                        <Label htmlFor="price_mrp">MRP</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Update Method</Label>
                    <RadioGroup value={priceConfig.updateMethod} onValueChange={(v) => setPriceConfig({ ...priceConfig, updateMethod: v as PriceConfig["updateMethod"] })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="set" id="method_set" />
                        <Label htmlFor="method_set">Set Fixed Value</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="increase" id="method_inc" />
                        <Label htmlFor="method_inc">Increase By %</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="decrease" id="method_dec" />
                        <Label htmlFor="method_dec">Decrease By %</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>{priceConfig.updateMethod === "set" ? "Fixed Value (₹)" : "Percentage (%)"}</Label>
                    <Input 
                      type="number" 
                      placeholder="Enter value..." 
                      value={priceConfig.value || ""} 
                      onChange={(e) => setPriceConfig({ ...priceConfig, value: Number(e.target.value) })}
                    />
                  </div>
                </>
              )}

              <Button onClick={handlePreview} disabled={loading} className="w-full">
                <Search className="h-4 w-4 mr-2" />
                Preview Changes
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Preview */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Preview ({previewItems.length} items)</span>
                {previewItems.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearPreview}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                )}
              </CardTitle>
              {previewItems.length > 0 && (
                <CardDescription>
                  {getConfigSummary()}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {previewItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Configure filters and click "Preview Changes" to see affected items</p>
                </div>
              ) : (
                <>
                  <Alert className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Review the changes below before applying. This action cannot be undone.
                    </AlertDescription>
                  </Alert>

                  <div className="rounded-md border max-h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Details</TableHead>
                          <TableHead>Current</TableHead>
                          <TableHead></TableHead>
                          <TableHead>New</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewItems.slice(0, 100).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.productName}
                              {item.style && <span className="text-muted-foreground text-xs block">{item.style}</span>}
                            </TableCell>
                            <TableCell>
                              {item.type === "variant" && (
                                <div className="text-sm">
                                  {item.size && <Badge variant="secondary" className="mr-1">{item.size}</Badge>}
                                  {item.barcode && <span className="text-muted-foreground">{item.barcode}</span>}
                                </div>
                              )}
                              {item.type === "product" && <Badge variant="outline">Product</Badge>}
                            </TableCell>
                            <TableCell>
                              <span className="text-destructive">{item.currentValue ?? "-"}</span>
                            </TableCell>
                            <TableCell>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                            <TableCell>
                              <span className="text-green-600 font-medium">{item.newValue ?? "-"}</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {previewItems.length > 100 && (
                    <p className="text-sm text-muted-foreground mt-2 text-center">
                      Showing first 100 of {previewItems.length} items
                    </p>
                  )}

                  <Button 
                    onClick={handleApply} 
                    disabled={loading} 
                    className="w-full mt-4"
                    variant="default"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Apply Changes to {previewItems.length} Items
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
