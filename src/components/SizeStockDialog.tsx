import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Search, Grid3X3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SizeStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SizeWiseRow {
  productKey: string;
  productName: string;
  brand: string;
  color: string;
  sizeStocks: Record<string, number>;
  totalStock: number;
}

export function SizeStockDialog({ open, onOpenChange }: SizeStockDialogProps) {
  const { currentOrganization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sizeWiseData, setSizeWiseData] = useState<{ sizes: string[]; rows: SizeWiseRow[] }>({ sizes: [], rows: [] });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Focus search input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      // Clear data when dialog closes
      setSearchTerm("");
      setSizeWiseData({ sizes: [], rows: [] });
    }
  }, [open]);

  const searchStock = useCallback(async (query: string) => {
    if (!currentOrganization?.id || query.length < 2) {
      setSizeWiseData({ sizes: [], rows: [] });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          size,
          stock_qty,
          barcode,
          products!inner(
            id,
            product_name,
            brand,
            color
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .or(`barcode.ilike.%${query}%,products.product_name.ilike.%${query}%,products.brand.ilike.%${query}%`)
        .limit(500);

      if (error) throw error;

      // Process into size-wise format
      const productMap = new Map<string, SizeWiseRow>();
      const allSizes = new Set<string>();

      (data || []).forEach((variant: any) => {
        const product = variant.products;
        if (!product) return;

        const productKey = `${product.product_name}-${product.brand || ""}-${product.color || ""}`;
        allSizes.add(variant.size);

        if (!productMap.has(productKey)) {
          productMap.set(productKey, {
            productKey,
            productName: product.product_name,
            brand: product.brand || "",
            color: product.color || "",
            sizeStocks: {},
            totalStock: 0,
          });
        }

        const row = productMap.get(productKey)!;
        row.sizeStocks[variant.size] = (row.sizeStocks[variant.size] || 0) + variant.stock_qty;
        row.totalStock += variant.stock_qty;
      });

      // Sort sizes naturally
      const sortedSizes = Array.from(allSizes).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });

      setSizeWiseData({
        sizes: sortedSizes,
        rows: Array.from(productMap.values()).sort((a, b) => a.productName.localeCompare(b.productName)),
      });
    } catch (error) {
      console.error("Error searching stock:", error);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchStock(value);
    }, 300);
  };

  // Calculate totals
  const sizeTotals: Record<string, number> = {};
  let grandTotal = 0;
  sizeWiseData.rows.forEach((row) => {
    sizeWiseData.sizes.forEach((size) => {
      sizeTotals[size] = (sizeTotals[size] || 0) + (row.sizeStocks[size] || 0);
    });
    grandTotal += row.totalStock;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-5 w-5 text-primary" />
              <DialogTitle className="text-lg">Quick Size Stock Lookup</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search by product name, brand, or barcode... (min 2 characters)"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-4 pb-4">
          {searchTerm.length < 2 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Grid3X3 className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg">Enter at least 2 characters to search</p>
              <p className="text-sm">Search by product name, brand, or barcode</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-3">Searching...</span>
            </div>
          ) : sizeWiseData.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Search className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg">No products found</p>
              <p className="text-sm">Try a different search term</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(85vh-160px)]">
              <div className="rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted z-10">
                    <TableRow>
                      <TableHead className="sticky left-0 bg-muted z-20 min-w-[200px]">Product</TableHead>
                      <TableHead className="min-w-[80px]">Brand</TableHead>
                      <TableHead className="min-w-[80px]">Color</TableHead>
                      {sizeWiseData.sizes.map((size) => (
                        <TableHead key={size} className="text-center min-w-[50px] font-semibold">
                          {size}
                        </TableHead>
                      ))}
                      <TableHead className="text-center min-w-[60px] bg-primary/10 font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sizeWiseData.rows.map((row, idx) => (
                      <TableRow key={row.productKey} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <TableCell className="sticky left-0 bg-inherit font-medium">{row.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{row.brand}</TableCell>
                        <TableCell className="text-muted-foreground">{row.color}</TableCell>
                        {sizeWiseData.sizes.map((size) => {
                          const qty = row.sizeStocks[size] || 0;
                          return (
                            <TableCell
                              key={size}
                              className={`text-center ${qty === 0 ? "text-muted-foreground" : qty < 0 ? "text-destructive font-semibold" : ""}`}
                            >
                              {qty || "-"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-bold bg-primary/5">{row.totalStock}</TableCell>
                      </TableRow>
                    ))}
                    {/* Totals Row */}
                    <TableRow className="bg-primary/10 font-bold border-t-2 border-primary/20">
                      <TableCell className="sticky left-0 bg-primary/10">TOTAL</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      {sizeWiseData.sizes.map((size) => (
                        <TableCell key={size} className="text-center">
                          {sizeTotals[size] || 0}
                        </TableCell>
                      ))}
                      <TableCell className="text-center bg-primary/20 text-primary">{grandTotal}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-sm text-muted-foreground text-right">
                {sizeWiseData.rows.length} product{sizeWiseData.rows.length !== 1 ? "s" : ""} found
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
