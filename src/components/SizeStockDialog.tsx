import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Search, Grid3X3, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface SizeStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Product {
  id: string;
  product_name: string;
  brand: string | null;
  color: string | null;
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
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sizeWiseData, setSizeWiseData] = useState<{ sizes: string[]; rows: SizeWiseRow[] }>({ sizes: [], rows: [] });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear data when dialog closes
  useEffect(() => {
    if (!open) {
      setProductSearch("");
      setProducts([]);
      setSelectedProducts([]);
      setSizeWiseData({ sizes: [], rows: [] });
    }
  }, [open]);

  // Search products when typing
  const searchProducts = useCallback(async (query: string) => {
    if (!currentOrganization?.id || query.length < 1) {
      setProducts([]);
      return;
    }

    setProductsLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, product_name, brand, color")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%`)
        .order("product_name")
        .limit(50);

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error("Error searching products:", error);
    } finally {
      setProductsLoading(false);
    }
  }, [currentOrganization?.id]);

  const handleProductSearchChange = (value: string) => {
    setProductSearch(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchProducts(value);
    }, 200);
  };

  // Add product to selection
  const handleSelectProduct = (product: Product) => {
    if (!selectedProducts.find(p => p.id === product.id)) {
      setSelectedProducts(prev => [...prev, product]);
    }
    setPopoverOpen(false);
    setProductSearch("");
  };

  // Remove product from selection
  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== productId));
  };

  // Load stock data when products are selected
  useEffect(() => {
    const loadStockData = async () => {
      if (selectedProducts.length === 0 || !currentOrganization?.id) {
        setSizeWiseData({ sizes: [], rows: [] });
        return;
      }

      setLoading(true);
      try {
        const productIds = selectedProducts.map(p => p.id);
        
        const { data, error } = await supabase
          .from("product_variants")
          .select(`
            id,
            size,
            stock_qty,
            barcode,
            product_id,
            products!inner(
              id,
              product_name,
              brand,
              color
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .in("product_id", productIds);

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
        console.error("Error loading stock:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStockData();
  }, [selectedProducts, currentOrganization?.id]);

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
          
          {/* Product Search Dropdown */}
          <div className="mt-2">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={popoverOpen}
                  className="w-full justify-start text-left font-normal"
                >
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <span className="text-muted-foreground">Search and select products...</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput 
                    placeholder="Type product name or brand..." 
                    value={productSearch}
                    onValueChange={handleProductSearchChange}
                  />
                  <CommandList>
                    {productsLoading ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        Searching...
                      </div>
                    ) : productSearch.length < 1 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        Type to search products...
                      </div>
                    ) : products.length === 0 ? (
                      <CommandEmpty>No products found.</CommandEmpty>
                    ) : (
                      <CommandGroup heading="Products">
                        {products.map((product) => {
                          const isSelected = selectedProducts.some(p => p.id === product.id);
                          return (
                            <CommandItem
                              key={product.id}
                              value={product.id}
                              onSelect={() => handleSelectProduct(product)}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  isSelected ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{product.product_name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {[product.brand, product.color].filter(Boolean).join(" • ") || "No details"}
                                </span>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Selected Products Tags */}
          {selectedProducts.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm"
                >
                  <span>{product.product_name}</span>
                  <button
                    onClick={() => handleRemoveProduct(product.id)}
                    className="ml-1 hover:bg-primary/20 rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedProducts([])}
              >
                Clear All
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-4 pb-4">
          {selectedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Grid3X3 className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg">Select products to view stock</p>
              <p className="text-sm">Use the search dropdown above to find and select products</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-3">Loading stock...</span>
            </div>
          ) : sizeWiseData.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Search className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg">No stock data found</p>
              <p className="text-sm">The selected products have no variants</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(85vh-200px)]">
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
