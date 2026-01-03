import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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

  // Search products when typing - includes barcode search
  const searchProducts = useCallback(async (query: string) => {
    if (!currentOrganization?.id || query.length < 1) {
      setProducts([]);
      return;
    }

    setProductsLoading(true);
    try {
      // First try to find by barcode in product_variants
      const { data: variantData, error: variantError } = await supabase
        .from("product_variants")
        .select(`
          product_id,
          products!inner(id, product_name, brand, color)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .ilike("barcode", `%${query}%`)
        .limit(50);

      if (variantError) throw variantError;

      // Extract unique products from barcode search
      const barcodeProducts = new Map<string, Product>();
      (variantData || []).forEach((v: any) => {
        if (v.products && !barcodeProducts.has(v.products.id)) {
          barcodeProducts.set(v.products.id, {
            id: v.products.id,
            product_name: v.products.product_name,
            brand: v.products.brand,
            color: v.products.color,
          });
        }
      });

      // Also search by product name, brand, style
      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("id, product_name, brand, color, style")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%`)
        .order("product_name")
        .limit(50);

      if (productError) throw productError;

      // Merge results - barcode matches first, then product matches
      const allProducts = new Map<string, Product>();
      barcodeProducts.forEach((p, id) => allProducts.set(id, p));
      (productData || []).forEach((p: any) => {
        if (!allProducts.has(p.id)) {
          allProducts.set(p.id, {
            id: p.id,
            product_name: p.product_name,
            brand: p.brand,
            color: p.color,
          });
        }
      });

      setProducts(Array.from(allProducts.values()).slice(0, 50));
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
            color,
            barcode,
            product_id,
            products!inner(
              id,
              product_name,
              brand
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .in("product_id", productIds);

        if (error) throw error;

        // Process into size-wise format - each color as separate row
        const productMap = new Map<string, SizeWiseRow>();
        const allSizes = new Set<string>();

        (data || []).forEach((variant: any) => {
          const product = variant.products;
          if (!product) return;

          const variantColor = variant.color || "";
          const productKey = `${product.id}-${variantColor}`;
          allSizes.add(variant.size);

          if (!productMap.has(productKey)) {
            productMap.set(productKey, {
              productKey,
              productName: product.product_name,
              brand: product.brand || "",
              color: variantColor,
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
          rows: Array.from(productMap.values()).sort((a, b) => {
            const nameCompare = a.productName.localeCompare(b.productName);
            if (nameCompare !== 0) return nameCompare;
            return a.color.localeCompare(b.color);
          }),
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
      <DialogContent className="max-w-[95vw] sm:max-w-[600px] md:max-w-[800px] max-h-[80vh] flex flex-col p-0 gap-0">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
          <div className="flex items-center gap-1.5">
            <Grid3X3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Size Stock</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        
        {/* Compact Search */}
        <div className="px-3 py-2 border-b bg-background">
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                role="combobox"
                aria-expanded={popoverOpen}
                className="w-full justify-start h-8 text-xs font-normal"
              >
                <Search className="mr-1.5 h-3 w-3 shrink-0 opacity-50" />
                <span className="text-muted-foreground">Search products...</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput 
                  placeholder="Search by barcode, product name, brand, style..." 
                  value={productSearch}
                  onValueChange={handleProductSearchChange}
                  className="h-8 text-xs"
                />
                <CommandList className="max-h-48">
                  {productsLoading ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      Searching...
                    </div>
                  ) : productSearch.length < 1 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      Type to search...
                    </div>
                  ) : products.length === 0 ? (
                    <CommandEmpty className="text-xs py-4">No products found.</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {products.map((product) => {
                        const isSelected = selectedProducts.some(p => p.id === product.id);
                        return (
                          <CommandItem
                            key={product.id}
                            value={product.id}
                            onSelect={() => handleSelectProduct(product)}
                            className="cursor-pointer py-1.5"
                          >
                            <Check
                              className={cn(
                                "mr-1.5 h-3 w-3",
                                isSelected ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="text-xs font-medium">{product.product_name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {[product.brand, product.color].filter(Boolean).join(" • ") || "-"}
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

          {/* Selected Products Tags - Compact */}
          {selectedProducts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium"
                >
                  <span>{product.product_name}</span>
                  <button
                    onClick={() => handleRemoveProduct(product.id)}
                    className="ml-0.5 hover:bg-primary/20 rounded p-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px]"
                onClick={() => setSelectedProducts([])}
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {selectedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Grid3X3 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">Select products to view stock</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="ml-2 text-xs">Loading...</span>
            </div>
          ) : sizeWiseData.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Search className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">No stock data found</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(80vh-150px)]">
              <div className="px-2 py-1">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-primary/5">
                      <th className="text-left py-1.5 px-2 font-semibold text-primary border-b">Product</th>
                      {sizeWiseData.sizes.map((size) => (
                        <th key={size} className="text-center py-1.5 px-1 font-semibold text-primary border-b min-w-[28px]">
                          {size}
                        </th>
                      ))}
                      <th className="text-center py-1.5 px-2 font-bold text-primary bg-primary/10 border-b min-w-[40px]">
                        Stock
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeWiseData.rows.map((row, idx) => {
                      const hasStock = row.totalStock > 0;
                      return (
                        <tr 
                          key={row.productKey} 
                          className={cn(
                            "border-b border-border/50",
                            hasStock ? "bg-green-50 dark:bg-green-950/20" : "bg-background"
                          )}
                        >
                          <td className="py-1 px-2">
                            <div className="font-medium text-foreground">{row.productName}</div>
                            <div className="text-[9px] text-red-500">
                              {row.brand}{row.brand && row.color ? " - " : ""}{row.color}
                            </div>
                          </td>
                          {sizeWiseData.sizes.map((size) => {
                            const qty = row.sizeStocks[size] || 0;
                            return (
                              <td
                                key={size}
                                className={cn(
                                  "text-center py-1 px-0.5",
                                  qty === 0 ? "text-muted-foreground/50" : 
                                  qty < 0 ? "text-red-600 font-semibold bg-red-50 dark:bg-red-950/30" : 
                                  "text-foreground font-medium bg-green-100 dark:bg-green-900/30"
                                )}
                              >
                                {qty === 0 ? "" : qty}
                              </td>
                            );
                          })}
                          <td className={cn(
                            "text-center py-1 px-1 font-bold",
                            hasStock ? "bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200" : "bg-muted/50 text-muted-foreground"
                          )}>
                            {row.totalStock}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals Row */}
                    <tr className="bg-red-500 text-white font-bold">
                      <td className="py-1.5 px-2">Total Stock</td>
                      {sizeWiseData.sizes.map((size) => (
                        <td key={size} className="text-center py-1.5 px-0.5">
                          {sizeTotals[size] || 0}
                        </td>
                      ))}
                      <td className="text-center py-1.5 px-1 bg-red-600">{grandTotal}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-1 text-[10px] text-muted-foreground text-right pr-2">
                  {sizeWiseData.rows.length} item{sizeWiseData.rows.length !== 1 ? "s" : ""}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}