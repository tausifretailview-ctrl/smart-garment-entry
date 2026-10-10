import { useState, useCallback, useRef, useEffect, useMemo, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Search, Grid3X3, X, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { sizeMatrixKey, sortSizes } from "@/utils/sizeSort";

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
  // For grouped multi-color products
  productIds: string[];
  allColors: string[];
  allSizeGroups: string[];
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
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [sizeWiseData, setSizeWiseData] = useState<{ sizes: string[]; rows: SizeWiseRow[] }>({ sizes: [], rows: [] });
  const [productDisplayLimit, setProductDisplayLimit] = useState(100);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  // Size groups (reference data) — standalone cached query, shared via React Query with
  // SalesInvoice / DeliveryChallanEntry (identical ['size-groups', orgId] key → warm cache).
  const { data: sizeGroupsData } = useQuery({
    queryKey: ['size-groups', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('size_groups')
        .select('id, group_name, sizes')
        .eq('organization_id', currentOrganization.id)
        .order('group_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const sizeGroupNameById = useMemo(() => {
    const map = new Map<string, string>();
    (sizeGroupsData || []).forEach((sg: { id: string; group_name: string | null }) => {
      if (sg.group_name) map.set(sg.id, sg.group_name);
    });
    return map;
  }, [sizeGroupsData]);

  // Clear data when dialog closes
  useEffect(() => {
    if (!open) {
      setProductSearch("");
      setProducts([]);
      setSelectedProducts([]);
      setSizeWiseData({ sizes: [], rows: [] });
      setHighlightIndex(0);
    } else {
      // Land the cursor in the search box
      const t = setTimeout(() => searchInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Search products when typing - includes barcode search
  const searchProducts = useCallback(async (query: string) => {
    if (!currentOrganization?.id || query.length < 2) {
      setProducts([]);
      setProductsLoading(false);
      return;
    }

    setProductsLoading(true);
    try {
      // Normalize query: remove spaces for fuzzy matching (e.g., "Rolex36" matches "Rolex 36")
      const normalizedQuery = query.replace(/\s+/g, '');
      
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
        .is("products.deleted_at", null)
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
            productIds: [v.products.id],
            allColors: v.products.color ? [v.products.color] : [],
            allSizeGroups: [],
          });
        }
      });

      // When barcode matched, also fetch ALL sibling products with same name+brand
      if (barcodeProducts.size > 0) {
        const uniqueNames = [...new Set([...barcodeProducts.values()].map(p => p.product_name))];
        for (const pName of uniqueNames) {
          const { data: siblingData } = await supabase
            .from("products")
            .select(`
              id, product_name, brand, color, category, style, size_group_id,
              product_variants(mrp, pur_price, sale_price, barcode)
            `)
            .eq("organization_id", currentOrganization.id)
            .eq("product_name", pName)
            .is("deleted_at", null)
            .is("product_variants.deleted_at", null)
            .limit(100);

          (siblingData || []).forEach((p: any) => {
            if (!barcodeProducts.has(p.id)) {
              const firstVariant = p.product_variants?.[0];
              barcodeProducts.set(p.id, {
                id: p.id,
                product_name: p.product_name,
                brand: p.brand,
                color: p.color,
                category: p.category,
                style: p.style,
                size_group_name: (p.size_group_id ? sizeGroupNameById.get(p.size_group_id) : null) || null,
                mrp: firstVariant?.mrp || 0,
                barcode: firstVariant?.barcode || '',
                pur_price: firstVariant?.pur_price || 0,
                sale_price: firstVariant?.sale_price || 0,
                productIds: [p.id],
                allColors: p.color ? [p.color] : [],
                allSizeGroups: [],
              });
            }
          });
        }
      }

      // Also search by product name, brand, style, category, color, hsn
      // Use ALL words from query for server-side OR (broadest net), then AND-filter client-side
      const queryWords = query.trim().split(/\s+/).filter(Boolean);
      const primaryWord = queryWords[0] || query;
      
      let productQuery = supabase
        .from("products")
        .select(`
          id, product_name, brand, color, category, style, hsn_code, size_group_id,
          product_variants(mrp, pur_price, sale_price, barcode)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .is("product_variants.deleted_at", null)
        .or(`product_name.ilike.%${primaryWord}%,brand.ilike.%${primaryWord}%,style.ilike.%${primaryWord}%,category.ilike.%${primaryWord}%,color.ilike.%${primaryWord}%,hsn_code.ilike.%${primaryWord}%`)
        .order("product_name")
        .limit(200);

      const { data: productData, error: productError } = await productQuery;

      if (productError) throw productError;

      // Client-side multi-token AND filter: every token must match somewhere
      const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const normalizedQueryLower = normalizedQuery.toLowerCase();
      const filteredProductData = (productData || []).filter((p: any) => {
        const haystack = [
          p.product_name, p.brand, p.style, p.category, p.color, p.hsn_code,
        ].map(f => (f || '')).join(' ').toLowerCase();
        const haystackNorm = haystack.replace(/\s+/g, '');
        // AND logic: every token must appear, OR match space-stripped
        return tokens.every(t => haystack.includes(t)) || haystackNorm.includes(normalizedQueryLower);
      });

      // Merge results - barcode matches first, then product matches
      const allProducts = new Map<string, Product>();
      barcodeProducts.forEach((p, id) => allProducts.set(id, p));
      filteredProductData.forEach((p: any) => {
        if (!allProducts.has(p.id)) {
          const variant = p.product_variants?.find((v: any) => v.mrp != null) || p.product_variants?.[0];
          allProducts.set(p.id, {
            id: p.id,
            product_name: p.product_name,
            brand: p.brand,
            color: p.color,
            category: p.category,
            style: p.style,
            size_group_name: (p.size_group_id ? sizeGroupNameById.get(p.size_group_id) : null) || null,
            mrp: variant?.mrp || null,
            barcode: variant?.barcode || null,
            pur_price: variant?.pur_price || null,
            sale_price: variant?.sale_price || null,
            productIds: [p.id],
            allColors: p.color ? [p.color] : [],
            allSizeGroups: [],
          });
        }
      });

      // Group products by normalized key (name + brand + category + style) to consolidate colors
      const grouped = new Map<string, Product>();
      Array.from(allProducts.values()).forEach((p) => {
        const key = `${(p.product_name || '').trim().toLowerCase()}||${(p.brand || '').trim().toLowerCase()}||${(p.category || '').trim().toLowerCase()}||${(p.style || '').trim().toLowerCase()}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            ...p,
            productIds: [p.id],
            allColors: p.color ? [p.color] : [],
            allSizeGroups: p.size_group_name ? [p.size_group_name] : [],
          });
        } else {
          const existing = grouped.get(key)!;
          if (!existing.productIds.includes(p.id)) {
            existing.productIds.push(p.id);
          }
          if (p.color && !existing.allColors.includes(p.color)) {
            existing.allColors.push(p.color);
          }
          if (p.size_group_name && !existing.allSizeGroups.includes(p.size_group_name)) {
            existing.allSizeGroups.push(p.size_group_name);
          }
        }
      });

      setProducts(Array.from(grouped.values()).slice(0, 100));
      setProductDisplayLimit(100); // Reset on new search
      setHighlightIndex(0);
    } catch (error) {
      console.error("Error searching products:", error);
    } finally {
      setProductsLoading(false);
    }
  }, [currentOrganization?.id, sizeGroupNameById]);

  const handleProductSearchChange = (value: string) => {
    setProductSearch(value);
    // Show "Searching..." during the debounce instead of stale or empty results
    setProductsLoading(value.trim().length >= 2);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchProducts(value);
    }, 300);
  };

  // Pick one product (all its colour records) and show its size stock
  const handleSelectProduct = (product: Product) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    setSelectedProducts([product]);
    setProductSearch("");
    setProducts([]);
    setHighlightIndex(0);
  };

  const handleChangeProduct = () => {
    setSelectedProducts([]);
    setProductSearch("");
    setProducts([]);
    searchInputRef.current?.focus();
  };

  const visibleProducts = products.slice(0, productDisplayLimit);
  const showResults = productSearch.trim().length > 0;

  // Keep the highlighted row in view while using the arrow keys
  useEffect(() => {
    const el = resultsListRef.current?.querySelector<HTMLElement>(`[data-index="${highlightIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, Math.max(visibleProducts.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const product = visibleProducts[highlightIndex];
      if (product && !productsLoading) {
        e.preventDefault();
        handleSelectProduct(product);
      }
    }
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
        // Collect ALL product IDs from all grouped selections
        const productIds = selectedProducts.flatMap(p => p.productIds);
        
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
          .is("products.deleted_at", null)
          .in("product_id", productIds);

        if (error) throw error;

        // Process into size-wise format - each color as separate row
        const productMap = new Map<string, SizeWiseRow>();
        const allSizes = new Set<string>();

        (data || []).forEach((variant: any) => {
          const product = variant.products;
          if (!product) return;

          const variantColor = (variant.color || "").trim();
          // Merge duplicate product rows that share name + brand + colour so the
          // same article never renders as several rows.
          const productKey = `${(product.product_name || "").trim().toUpperCase()}|${(product.brand || "").trim().toUpperCase()}|${variantColor.toUpperCase()}`;
          const sizeKey = sizeMatrixKey(variant.size);
          if (!sizeKey) return;
          allSizes.add(sizeKey);

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
          const qty = Number(variant.stock_qty) || 0;
          row.sizeStocks[sizeKey] = (row.sizeStocks[sizeKey] || 0) + qty;
          row.totalStock += qty;
        });

        // Sort sizes using standard garment order
        const sortedSizes = sortSizes(Array.from(allSizes));

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
  const exportToPDF = async () => {
    if (sizeWiseData.rows.length === 0 || isExportingPdf) return;

    setIsExportingPdf(true);
    try {
    const { default: jsPDF } = await import("jspdf");
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
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] sm:max-w-[600px] md:max-w-[800px] max-h-[80vh] flex flex-col p-0 gap-0"
        onEscapeKeyDown={(e) => {
          // First Esc clears the search; the next one closes the dialog
          if (productSearch) {
            e.preventDefault();
            setProductSearch("");
            setProducts([]);
          }
        }}
      >
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
              disabled={sizeWiseData.rows.length === 0 || isExportingPdf}
            >
              {isExportingPdf ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
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
        
        {/* Search */}
        <div className="px-3 py-2 border-b bg-background space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              value={productSearch}
              onChange={(e) => handleProductSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search products..."
              aria-label="Search products by name, brand, style or barcode"
              className="h-10 pl-9 pr-9 text-sm"
              autoComplete="off"
            />
            {productSearch && (
              <button
                type="button"
                onClick={() => { setProductSearch(""); setProducts([]); searchInputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Selected product */}
          {selectedProducts.length > 0 && !showResults && (() => {
            const product = selectedProducts[0];
            const details = [product.brand, product.category, product.style].filter(Boolean).join(" · ");
            return (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-primary/5 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{product.product_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[details, product.allSizeGroups.join(", "), product.allColors.join(", ")].filter(Boolean).join("  |  ")}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={handleChangeProduct}>
                  Change product
                </Button>
              </div>
            );
          })()}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {showResults ? (
            <div ref={resultsListRef} className="h-[calc(80vh-150px)] overflow-y-auto" role="listbox">
              {productsLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </div>
              ) : productSearch.trim().length < 2 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Keep typing...</div>
              ) : products.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No products found.</div>
              ) : (
                <>
                  {visibleProducts.map((product, idx) => {
                    const details = [product.brand, product.category, product.style].filter(Boolean).join(" · ");
                    const isHighlighted = idx === highlightIndex;
                    return (
                      <button
                        type="button"
                        key={`${product.product_name}||${product.brand}||${product.category}||${product.style}`}
                        data-index={idx}
                        role="option"
                        aria-selected={isHighlighted}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        onClick={() => handleSelectProduct(product)}
                        className={cn(
                          "w-full text-left px-4 py-2.5 border-b border-border/60 flex items-start justify-between gap-3",
                          isHighlighted ? "bg-primary/10" : "hover:bg-muted/60"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">{product.product_name}</div>
                          {details && <div className="text-xs text-muted-foreground truncate">{details}</div>}
                          {product.allColors.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {product.allColors.map(c => (
                                <span key={c} className="text-[11px] px-1.5 py-0.5 rounded border bg-background text-foreground font-medium">
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {product.allSizeGroups.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1 shrink-0">
                            {product.allSizeGroups.map(sg => (
                              <span key={sg} className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                                {sg}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {products.length > productDisplayLimit && (
                    <button
                      type="button"
                      onClick={() => setProductDisplayLimit(prev => prev + 100)}
                      className="w-full py-2 text-sm text-primary font-medium hover:underline"
                    >
                      Showing {productDisplayLimit} of {products.length}. Load more
                    </button>
                  )}
                </>
              )}
            </div>
          ) : selectedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Grid3X3 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Type a product name, brand, style or barcode, then pick one product</p>
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
                            <div className="text-sm font-bold text-foreground">{row.productName}</div>
                            {(row.brand || row.color) && (
                              <div className="text-xs font-bold text-foreground">
                                {[row.brand, row.color].filter(Boolean).join(" - ")}
                              </div>
                            )}
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