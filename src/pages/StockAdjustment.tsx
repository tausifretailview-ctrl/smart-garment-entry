import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Package, Calculator, Save, RefreshCw, Search, Filter } from "lucide-react";
import { format } from "date-fns";

interface VariantWithMovements {
  id: string;
  barcode: string | null;
  size: string;
  opening_qty: number;
  stock_qty: number;
  product_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  purchased_qty: number;
  sold_qty: number;
  returned_qty: number;
  adjusted_qty: number;
  newOpeningQty: number;
  calculatedStock: number;
  selected: boolean;
}

const StockAdjustment = () => {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with-opening" | "with-sales" | "opening-15">("with-opening");
  const [variants, setVariants] = useState<VariantWithMovements[]>([]);
  const [bulkOpeningValue, setBulkOpeningValue] = useState<string>("0");

  // Fetch variants with stock movements
  const { data: rawVariants, isLoading, refetch } = useQuery({
    queryKey: ["stock-adjustment-variants", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      // Get all variants with product info
      const { data: variantsData, error: variantsError } = await supabase
        .from("product_variants")
        .select(`
          id,
          barcode,
          size,
          opening_qty,
          stock_qty,
          product_id,
          products (
            product_name,
            brand,
            category
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      if (variantsError) throw variantsError;

      // Get all stock movements grouped by variant
      const { data: movements, error: movementsError } = await supabase
        .from("stock_movements")
        .select("variant_id, movement_type, quantity")
        .eq("organization_id", currentOrganization.id);

      if (movementsError) throw movementsError;

      // Aggregate movements by variant
      const movementsByVariant: Record<string, { purchased: number; sold: number; returned: number; adjusted: number }> = {};
      
      movements?.forEach((m) => {
        if (!movementsByVariant[m.variant_id]) {
          movementsByVariant[m.variant_id] = { purchased: 0, sold: 0, returned: 0, adjusted: 0 };
        }
        
        switch (m.movement_type) {
          case "purchase":
            movementsByVariant[m.variant_id].purchased += m.quantity;
            break;
          case "sale":
            movementsByVariant[m.variant_id].sold += Math.abs(m.quantity);
            break;
          case "sale_return":
            movementsByVariant[m.variant_id].returned += m.quantity;
            break;
          case "purchase_return":
            movementsByVariant[m.variant_id].purchased -= Math.abs(m.quantity);
            break;
          case "stock_adjustment":
          case "opening_adjustment":
            movementsByVariant[m.variant_id].adjusted += m.quantity;
            break;
        }
      });

      // Combine data
      return variantsData?.map((v) => {
        const mvt = movementsByVariant[v.id] || { purchased: 0, sold: 0, returned: 0, adjusted: 0 };
        const product = v.products as any;
        const openingQty = v.opening_qty || 0;
        
        return {
          id: v.id,
          barcode: v.barcode,
          size: v.size,
          opening_qty: openingQty,
          stock_qty: v.stock_qty || 0,
          product_id: v.product_id,
          product_name: product?.product_name || "Unknown",
          brand: product?.brand,
          category: product?.category,
          purchased_qty: mvt.purchased,
          sold_qty: mvt.sold,
          returned_qty: mvt.returned,
          adjusted_qty: mvt.adjusted,
          newOpeningQty: openingQty,
          calculatedStock: openingQty + mvt.purchased - mvt.sold + mvt.returned + mvt.adjusted,
          selected: false,
        };
      }) || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Initialize variants state when data loads
  useMemo(() => {
    if (rawVariants && rawVariants.length > 0) {
      setVariants(rawVariants);
    }
  }, [rawVariants]);

  // Filter and search variants
  const filteredVariants = useMemo(() => {
    return variants.filter((v) => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        v.product_name.toLowerCase().includes(searchLower) ||
        v.barcode?.toLowerCase().includes(searchLower) ||
        v.size.toLowerCase().includes(searchLower) ||
        v.brand?.toLowerCase().includes(searchLower);

      // Category filter
      let matchesFilter = true;
      switch (filter) {
        case "with-opening":
          matchesFilter = v.opening_qty > 0;
          break;
        case "with-sales":
          matchesFilter = v.sold_qty > 0;
          break;
        case "opening-15":
          matchesFilter = v.opening_qty === 15;
          break;
      }

      return matchesSearch && matchesFilter;
    });
  }, [variants, search, filter]);

  // Update opening qty for a variant
  const handleOpeningChange = (variantId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id === variantId) {
          const newCalculatedStock = numValue + v.purchased_qty - v.sold_qty + v.returned_qty + v.adjusted_qty;
          return { ...v, newOpeningQty: numValue, calculatedStock: newCalculatedStock };
        }
        return v;
      })
    );
  };

  // Toggle selection
  const handleToggleSelect = (variantId: string) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === variantId ? { ...v, selected: !v.selected } : v))
    );
  };

  // Select all visible
  const handleSelectAll = () => {
    const visibleIds = new Set(filteredVariants.map((v) => v.id));
    const allSelected = filteredVariants.every((v) => v.selected);
    
    setVariants((prev) =>
      prev.map((v) => (visibleIds.has(v.id) ? { ...v, selected: !allSelected } : v))
    );
  };

  // Bulk set opening qty for selected
  const handleBulkSetOpening = () => {
    const numValue = parseInt(bulkOpeningValue) || 0;
    setVariants((prev) =>
      prev.map((v) => {
        if (v.selected) {
          const newCalculatedStock = numValue + v.purchased_qty - v.sold_qty + v.returned_qty + v.adjusted_qty;
          return { ...v, newOpeningQty: numValue, calculatedStock: newCalculatedStock };
        }
        return v;
      })
    );
    toast({
      title: "Bulk Update Applied",
      description: `Set opening qty to ${numValue} for selected items (preview only)`,
    });
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization");

      // Get items that have changes
      const changedVariants = variants.filter(
        (v) => v.newOpeningQty !== v.opening_qty
      );

      if (changedVariants.length === 0) {
        throw new Error("No changes to save");
      }

      // Update each variant
      for (const v of changedVariants) {
        const openingDiff = v.newOpeningQty - v.opening_qty;
        
        // Update variant opening_qty and stock_qty
        const { error: updateError } = await supabase
          .from("product_variants")
          .update({
            opening_qty: v.newOpeningQty,
            stock_qty: v.calculatedStock,
            updated_at: new Date().toISOString(),
          })
          .eq("id", v.id);

        if (updateError) throw updateError;

        // Create stock movement for audit trail
        if (openingDiff !== 0) {
          const { error: movementError } = await supabase
            .from("stock_movements")
            .insert({
              variant_id: v.id,
              organization_id: currentOrganization.id,
              movement_type: "opening_adjustment",
              quantity: openingDiff,
              notes: `Opening qty adjusted from ${v.opening_qty} to ${v.newOpeningQty}`,
              bill_number: `ADJ-${format(new Date(), "yyyyMMdd-HHmmss")}`,
            });

          if (movementError) throw movementError;
        }
      }

      return changedVariants.length;
    },
    onSuccess: (count) => {
      toast({
        title: "Stock Adjusted Successfully",
        description: `Updated opening quantity for ${count} item(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ["stock-adjustment-variants"] });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save adjustments",
        variant: "destructive",
      });
    },
  });

  // Count changes
  const changesCount = variants.filter((v) => v.newOpeningQty !== v.opening_qty).length;
  const negativeStockCount = variants.filter((v) => v.calculatedStock < 0).length;
  const selectedCount = filteredVariants.filter((v) => v.selected).length;

  // Summary stats
  const stats = useMemo(() => {
    const withOpening = variants.filter((v) => v.opening_qty > 0).length;
    const withSales = variants.filter((v) => v.sold_qty > 0).length;
    const opening15 = variants.filter((v) => v.opening_qty === 15).length;
    return { withOpening, withSales, opening15 };
  }, [variants]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <BackToDashboard />
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <BackToDashboard />

      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6" />
            Stock Adjustment Tool
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Adjust opening quantities while accounting for purchases and sales
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">With Opening Qty</div>
            <div className="text-xl font-bold">{stats.withOpening}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">With Sales</div>
            <div className="text-xl font-bold text-orange-600">{stats.withSales}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Opening = 15</div>
            <div className="text-xl font-bold text-blue-600">{stats.opening15}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Pending Changes</div>
            <div className="text-xl font-bold text-primary">{changesCount}</div>
          </Card>
        </div>

        {/* Warnings */}
        {negativeStockCount > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive">
              {negativeStockCount} item(s) will have negative stock after adjustment. Please review before saving.
            </span>
          </div>
        )}

        {/* Filters and Actions */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, barcode, size..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-full md:w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              <SelectItem value="with-opening">With Opening Qty</SelectItem>
              <SelectItem value="with-sales">With Sales</SelectItem>
              <SelectItem value="opening-15">Opening = 15</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Bulk Actions */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Bulk Actions</CardTitle>
            <CardDescription>
              Select items and set opening quantity in bulk
            </CardDescription>
          </CardHeader>
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-sm text-muted-foreground">
                {selectedCount} item(s) selected
              </span>
              <div className="flex gap-2 items-center">
                <span className="text-sm">Set Opening Qty to:</span>
                <Input
                  type="number"
                  min="0"
                  value={bulkOpeningValue}
                  onChange={(e) => setBulkOpeningValue(e.target.value)}
                  className="w-24"
                />
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={handleBulkSetOpening}
                  disabled={selectedCount === 0}
                >
                  Apply
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredVariants.length > 0 && filteredVariants.every((v) => v.selected)}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden md:table-cell">Barcode</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Current Opening</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Purchased</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Returned</TableHead>
                  <TableHead className="text-right">New Opening</TableHead>
                  <TableHead className="text-right">New Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVariants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      No items found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVariants.map((v) => (
                    <TableRow 
                      key={v.id} 
                      className={v.calculatedStock < 0 ? "bg-destructive/5" : v.newOpeningQty !== v.opening_qty ? "bg-primary/5" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={v.selected}
                          onCheckedChange={() => handleToggleSelect(v.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{v.product_name}</div>
                        <div className="text-xs text-muted-foreground">{v.brand}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs">
                        {v.barcode || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{v.size}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{v.opening_qty}</TableCell>
                      <TableCell className="text-right hidden md:table-cell text-green-600">
                        +{v.purchased_qty}
                      </TableCell>
                      <TableCell className="text-right">
                        {v.sold_qty > 0 ? (
                          <span className="text-orange-600 font-medium">-{v.sold_qty}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell text-blue-600">
                        +{v.returned_qty}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          value={v.newOpeningQty}
                          onChange={(e) => handleOpeningChange(v.id, e.target.value)}
                          className="w-20 text-right h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={v.calculatedStock < 0 ? "text-destructive font-bold" : "font-medium"}>
                          {v.calculatedStock}
                        </span>
                        {v.calculatedStock < 0 && (
                          <AlertTriangle className="inline-block h-4 w-4 ml-1 text-destructive" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        {/* Save Button */}
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Formula: New Stock = New Opening + Purchases - Sales + Returns + Adjustments
          </div>
          <Button
            size="lg"
            onClick={() => saveMutation.mutate()}
            disabled={changesCount === 0 || saveMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : `Save ${changesCount} Change(s)`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StockAdjustment;
