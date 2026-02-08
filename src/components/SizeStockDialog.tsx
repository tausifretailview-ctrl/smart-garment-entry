import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Search, Grid3X3, X, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import { format } from "date-fns";

interface SizeStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Product {
  id: string;
  product_name: string;
  brand: string | null;
  color: string | null;
  category: string | null;
  style: string | null;
  size_group_name: string | null;
  mrp: number | null;
  barcode: string | null;
  pur_price: number | null;
  sale_price: number | null;
}

// Helper to format product description like Purchase/Sale entry
const formatProductDescription = (product: {
  product_name: string;
  brand?: string | null;
  category?: string | null;
  style?: string | null;
  color?: string | null;
}) => {
  const parts = [product.product_name];
  if (product.brand) parts.push(product.brand);
  if (product.category) parts.push(product.category);
  if (product.style) parts.push(product.style);
  if (product.color) parts.push(product.color);
  return parts.join(' | ');
};

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
  const [productDisplayLimit, setProductDisplayLimit] = useState(100);
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
          mrp,
          pur_price,
          sale_price,
          barcode,
          products!inner(id, product_name, brand, color, category, style)
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
            category: v.products.category,
            style: v.products.style,
            size_group_name: null,
            mrp: v.mrp,
            barcode: v.barcode,
            pur_price: v.pur_price,
            sale_price: v.sale_price,
          });
        }
      });

      // Also search by product name, brand, style
      const { data: productData, error: productError } = await supabase
        .from("products")
        .select(`
          id, product_name, brand, color, category, style,
          size_groups(group_name),
          product_variants(mrp, pur_price, sale_price, barcode)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .is("product_variants.deleted_at", null)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%`)
        .order("product_name")
        .limit(50);

      if (productError) throw productError;

      // Merge results - barcode matches first, then product matches
      const allProducts = new Map<string, Product>();
      barcodeProducts.forEach((p, id) => allProducts.set(id, p));
      (productData || []).forEach((p: any) => {
        if (!allProducts.has(p.id)) {
          // Get first variant with data
          const variant = p.product_variants?.find((v: any) => v.mrp != null) || p.product_variants?.[0];
          allProducts.set(p.id, {
            id: p.id,
            product_name: p.product_name,
            brand: p.brand,
            color: p.color,
            category: p.category,
            style: p.style,
            size_group_name: p.size_groups?.group_name || null,
            mrp: variant?.mrp || null,
            barcode: variant?.barcode || null,
            pur_price: variant?.pur_price || null,
            sale_price: variant?.sale_price || null,
          });
        }
      });

      setProducts(Array.from(allProducts.values()).slice(0, 100));
      setProductDisplayLimit(100); // Reset on new search
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

  // PDF Export function
  const exportToPDF = () => {
    if (sizeWiseData.rows.length === 0) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    let yPos = margin;

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Size-wise Stock Report", margin, yPos);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - margin - 45, yPos);
    yPos += 10;

    // Table setup
    const productColWidth = 70;
    const stockColWidth = 18;
    const availableWidth = pageWidth - margin * 2 - productColWidth - stockColWidth;
    const sizeColWidth = sizeWiseData.sizes.length > 0 
      ? Math.min(15, availableWidth / sizeWiseData.sizes.length) 
      : 15;
    const rowHeight = 7;

    // Draw header row
    doc.setFillColor(59, 130, 246);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setDrawColor(200, 200, 200);
    
    let xPos = margin;
    
    // Product header
    doc.rect(xPos, yPos, productColWidth, rowHeight, "FD");
    doc.text("Product", xPos + 2, yPos + 5);
    xPos += productColWidth;

    // Size headers
    sizeWiseData.sizes.forEach((size) => {
      doc.setFillColor(59, 130, 246);
      doc.rect(xPos, yPos, sizeColWidth, rowHeight, "FD");
      doc.text(String(size), xPos + sizeColWidth / 2, yPos + 5, { align: "center" });
      xPos += sizeColWidth;
    });

    // Stock header
    doc.setFillColor(37, 99, 235);
    doc.rect(xPos, yPos, stockColWidth, rowHeight, "FD");
    doc.text("Stock", xPos + stockColWidth / 2, yPos + 5, { align: "center" });
    yPos += rowHeight;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    sizeWiseData.rows.forEach((row, idx) => {
      if (yPos > pageHeight - 20) {
        doc.addPage();
        yPos = margin;
      }

      const isEven = idx % 2 === 0;
      doc.setTextColor(0, 0, 0);

      xPos = margin;
      
      // Product cell
      doc.setFillColor(isEven ? 249 : 255, isEven ? 249 : 255, isEven ? 249 : 255);
      doc.rect(xPos, yPos, productColWidth, rowHeight, "FD");
      const productLabel = `${row.productName}${row.brand || row.color ? ` (${[row.brand, row.color].filter(Boolean).join(" - ")})` : ""}`;
      doc.text(productLabel.substring(0, 40), xPos + 2, yPos + 5);
      xPos += productColWidth;

      // Size cells
      sizeWiseData.sizes.forEach((size) => {
        const qty = row.sizeStocks[size] || 0;
        doc.setFillColor(isEven ? 249 : 255, isEven ? 249 : 255, isEven ? 249 : 255);
        doc.rect(xPos, yPos, sizeColWidth, rowHeight, "FD");
        if (qty !== 0) {
          doc.text(String(qty), xPos + sizeColWidth / 2, yPos + 5, { align: "center" });
        }
        xPos += sizeColWidth;
      });

      // Stock cell
      if (row.totalStock > 0) {
        doc.setFillColor(220, 252, 231);
      } else {
        doc.setFillColor(240, 240, 240);
      }
      doc.rect(xPos, yPos, stockColWidth, rowHeight, "FD");
      doc.setFont("helvetica", "bold");
      doc.text(String(row.totalStock), xPos + stockColWidth / 2, yPos + 5, { align: "center" });
      doc.setFont("helvetica", "normal");
      yPos += rowHeight;
    });

    // Totals row
    if (yPos > pageHeight - 15) {
      doc.addPage();
      yPos = margin;
    }

    doc.setFillColor(239, 68, 68);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");

    xPos = margin;
    doc.rect(xPos, yPos, productColWidth, rowHeight, "FD");
    doc.text("Total Stock", xPos + 2, yPos + 5);
    xPos += productColWidth;

    sizeWiseData.sizes.forEach((size) => {
      doc.setFillColor(239, 68, 68);
      doc.rect(xPos, yPos, sizeColWidth, rowHeight, "FD");
      doc.text(String(sizeTotals[size] || 0), xPos + sizeColWidth / 2, yPos + 5, { align: "center" });
      xPos += sizeColWidth;
    });

    doc.setFillColor(220, 38, 38);
    doc.rect(xPos, yPos, stockColWidth, rowHeight, "FD");
    doc.text(String(grandTotal), xPos + stockColWidth / 2, yPos + 5, { align: "center" });

    doc.save(`SizeStock_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[600px] md:max-w-[800px] max-h-[80vh] flex flex-col p-0 gap-0">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
          <div className="flex items-center gap-1.5">
            <Grid3X3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Size Stock</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={exportToPDF}
              disabled={sizeWiseData.rows.length === 0}
            >
              <FileText className="h-3 w-3" />
              PDF
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
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
                    <>
                      {products.length > productDisplayLimit && (
                        <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
                          <span>Showing {productDisplayLimit} of {products.length} results</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProductDisplayLimit(prev => prev + 100);
                            }}
                            className="text-primary font-medium hover:underline text-sm"
                          >
                            Load More
                          </button>
                        </div>
                      )}
                      <CommandGroup>
                        {products.slice(0, productDisplayLimit).map((product) => {
                        const isSelected = selectedProducts.some(p => p.id === product.id);
                        return (
                          <CommandItem
                            key={product.id}
                            value={product.id}
                            onSelect={() => handleSelectProduct(product)}
                            className="cursor-pointer py-2"
                          >
                            <Check
                              className={cn(
                                "mr-1.5 h-3 w-3",
                                isSelected ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col flex-1 gap-0.5">
                              {/* Line 1: Formatted description with size range badge */}
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">
                                  {formatProductDescription(product)}
                                </span>
                                {product.size_group_name && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold shrink-0">
                                    {product.size_group_name}
                                  </span>
                                )}
                              </div>
                              
                              {/* Line 2: Barcode and prices */}
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                                {product.barcode && (
                                  <span>Barcode: {product.barcode}</span>
                                )}
                                {product.pur_price != null && (
                                  <span className="text-primary font-medium">
                                    Pur: ₹{product.pur_price.toFixed(2)}
                                  </span>
                                )}
                                {product.sale_price != null && (
                                  <span className="text-green-600 dark:text-green-400 font-medium">
                                    Sale: ₹{product.sale_price.toFixed(2)}
                                  </span>
                                )}
                                {product.mrp != null && (
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                                    MRP: ₹{product.mrp.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </CommandItem>
                        );
                      })}
                      </CommandGroup>
                    </>
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