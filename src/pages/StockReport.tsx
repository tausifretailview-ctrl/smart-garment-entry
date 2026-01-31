import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Search, Filter, ChevronDown, ChevronUp, Grid3X3, IndianRupee, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ProductSearchDropdown } from "@/components/ProductSearchDropdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { format } from "date-fns";

interface StockItem {
  id: string;
  product_name: string;
  brand: string;
  color: string;
  size: string;
  stock_qty: number;
  opening_qty: number;
  purchase_qty: number;
  purchase_return_qty: number;
  sales_qty: number;
  sale_price: number;
  pur_price: number | null;
  barcode: string;
  supplier_name: string;
  supplier_invoice_no: string;
  category: string;
}


interface SizeWiseRow {
  productKey: string;
  productName: string;
  brand: string;
  color: string;
  category: string;
  sizeStocks: Record<string, number>;
  totalStock: number;
}

export default function StockReport() {
  const { currentOrganization } = useOrganization();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [productNameFilter, setProductNameFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab");
    return tabParam === "sizewise" ? "sizewise" : "all";
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [colorFilter, setColorFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [supplierInvoiceFilter, setSupplierInvoiceFilter] = useState<string>("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<string>("all");
  const [oldBarcodeVariantMap, setOldBarcodeVariantMap] = useState<Map<string, string>>(new Map());
  
  // Cached filter options from last search
  const [filterOptions, setFilterOptions] = useState({
    brands: [] as string[],
    colors: [] as string[],
    sizes: [] as string[],
    categories: [] as string[],
    suppliers: [] as string[],
    supplierInvoices: [] as string[]
  });
  
  // Pagination for All Stock tab
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 100;

  // Global keyboard shortcut for Ctrl+G
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setActiveTab("sizewise");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch settings on mount
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchSettings();
    }
  }, [currentOrganization?.id]);

  // Search for variant IDs by barcode in purchase_items and sale_items (for old/changed barcodes)
  const searchOldBarcodes = async (barcode: string) => {
    if (!currentOrganization?.id) return;
    
    try {
      // Search in purchase_items
      const { data: purchaseData } = await supabase
        .from("purchase_items")
        .select("sku_id, barcode")
        .ilike("barcode", `%${barcode}%`)
        .not("sku_id", "is", null)
        .limit(50);

      // Search in sale_items
      const { data: saleData } = await supabase
        .from("sale_items")
        .select("variant_id, barcode")
        .ilike("barcode", `%${barcode}%`)
        .limit(50);

      const newMap = new Map<string, string>();
      
      // Add purchase_items mappings
      (purchaseData || []).forEach((item: any) => {
        if (item.sku_id && item.barcode) {
          newMap.set(item.barcode.toLowerCase(), item.sku_id);
        }
      });
      
      // Add sale_items mappings
      (saleData || []).forEach((item: any) => {
        if (item.variant_id && item.barcode) {
          newMap.set(item.barcode.toLowerCase(), item.variant_id);
        }
      });
      
      setOldBarcodeVariantMap(newMap);
    } catch (error) {
      console.error("Error searching old barcodes:", error);
    }
  };

  const fetchSettings = async () => {
    if (!currentOrganization?.id) return;
    try {
      const { data } = await supabase
        .from("settings" as any)
        .select("product_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();
      
      const settingsData = data as any;
      if (settingsData?.product_settings?.low_stock_threshold) {
        setLowStockThreshold(settingsData.product_settings.low_stock_threshold);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const handleSearch = useCallback(async () => {
    if (!currentOrganization?.id) return;
    
    // Check if any filter is applied
    const hasFilters = searchTerm.trim() || productNameFilter.trim() || 
      brandFilter !== "all" || colorFilter !== "all" || sizeFilter !== "all" || 
      categoryFilter !== "all" || supplierFilter !== "all" || 
      supplierInvoiceFilter !== "all" || stockStatusFilter !== "all";
    
    if (!hasFilters) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      // Search old barcodes if searching
      if (searchTerm && searchTerm.length >= 4) {
        await searchOldBarcodes(searchTerm);
      }

      // Fetch product variants with search/filter
      const allVariants: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        let query = supabase
          .from("product_variants")
          .select(`
            id,
            size,
            color,
            stock_qty,
            opening_qty,
            sale_price,
            pur_price,
            barcode,
            products!inner (
              product_name,
              brand,
              color,
              category,
              product_type,
              deleted_at
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .neq("products.product_type", "service");
        
        // Apply search filter at query level - search by barcode, product_name or brand
        if (searchTerm.trim()) {
          query = query.or(`barcode.ilike.%${searchTerm}%,products.product_name.ilike.%${searchTerm}%,products.brand.ilike.%${searchTerm}%`);
        }
        
        // Apply stock status filter at query level for efficiency
        if (stockStatusFilter === "out") {
          query = query.eq("stock_qty", 0);
        } else if (stockStatusFilter !== "all") {
          // For 'in' and 'low', we'll filter after to handle threshold
        }
        
        const { data, error } = await query
          .order("stock_qty", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allVariants.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      const data = allVariants;

      // Fetch ALL stock movements using pagination
      const allMovements: any[] = [];
      offset = 0;
      hasMore = true;
      
      while (hasMore) {
        const { data: movementsData, error: movementsError } = await supabase
          .from("stock_movements")
          .select("variant_id, movement_type, quantity")
          .range(offset, offset + PAGE_SIZE - 1);

        if (movementsError) throw movementsError;
        
        if (movementsData && movementsData.length > 0) {
          allMovements.push(...movementsData);
          offset += PAGE_SIZE;
          hasMore = movementsData.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      const movementsData = allMovements;

      // Fetch ALL batch stock with supplier info using pagination
      const allBatchData: any[] = [];
      offset = 0;
      hasMore = true;
      
      while (hasMore) {
        const { data: batchData, error: batchError } = await supabase
          .from("batch_stock")
          .select(`
            variant_id,
            purchase_bills (
              supplier_name,
              supplier_invoice_no
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .range(offset, offset + PAGE_SIZE - 1);

        if (batchError) throw batchError;
        
        if (batchData && batchData.length > 0) {
          allBatchData.push(...batchData);
          offset += PAGE_SIZE;
          hasMore = batchData.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      const batchData = allBatchData;

      // Map variant_id to supplier names and invoice numbers
      const variantSuppliers = (batchData || []).reduce((acc: any, batch: any) => {
        if (!acc[batch.variant_id] && batch.purchase_bills?.supplier_name) {
          acc[batch.variant_id] = {
            supplier_name: batch.purchase_bills.supplier_name,
            supplier_invoice_no: batch.purchase_bills.supplier_invoice_no || ''
          };
        }
        return acc;
      }, {});

      // Calculate purchase, purchase returns, and sales quantities per variant
      const variantMovements = (movementsData || []).reduce((acc: any, movement: any) => {
        if (!acc[movement.variant_id]) {
          acc[movement.variant_id] = { purchase: 0, purchaseReturn: 0, sales: 0 };
        }
        
        if (movement.movement_type === 'purchase' || movement.movement_type === 'purchase_increase') {
          acc[movement.variant_id].purchase += movement.quantity;
        } 
        else if (movement.movement_type === 'purchase_delete' || 
                 movement.movement_type === 'soft_delete_purchase' ||
                 movement.movement_type === 'purchase_decrease') {
          acc[movement.variant_id].purchase += movement.quantity;
        }
        else if (movement.movement_type === 'purchase_return') {
          acc[movement.variant_id].purchaseReturn += Math.abs(movement.quantity);
        } 
        else if (movement.movement_type === 'purchase_return_delete') {
          acc[movement.variant_id].purchaseReturn -= Math.abs(movement.quantity);
        }
        else if (movement.movement_type === 'sale') {
          acc[movement.variant_id].sales += Math.abs(movement.quantity);
        } 
        else if (movement.movement_type === 'sale_delete' || movement.movement_type === 'soft_delete_sale') {
          acc[movement.variant_id].sales -= Math.abs(movement.quantity);
        }
        
        return acc;
      }, {});

      const formattedData = data?.map((item: any) => {
        const movements = variantMovements[item.id] || { purchase: 0, purchaseReturn: 0, sales: 0 };
        const supplierInfo = variantSuppliers[item.id] || { supplier_name: '', supplier_invoice_no: '' };
        const netSalesQty = Math.max(0, movements.sales);
        
        return {
          id: item.id,
          product_name: item.products?.product_name || "",
          brand: item.products?.brand || "",
          color: item.color || item.products?.color || "",
          size: item.size,
          stock_qty: item.stock_qty,
          opening_qty: item.opening_qty || 0,
          purchase_qty: Math.max(0, movements.purchase),
          purchase_return_qty: Math.max(0, movements.purchaseReturn),
          sales_qty: netSalesQty,
          sale_price: item.sale_price,
          pur_price: item.pur_price || null,
          barcode: item.barcode || "",
          supplier_name: supplierInfo.supplier_name || "",
          supplier_invoice_no: supplierInfo.supplier_invoice_no || "",
          category: item.products?.category || "",
        };
      }) || [];

      // Update filter options from fetched data
      setFilterOptions({
        brands: [...new Set(formattedData.map(i => i.brand).filter(Boolean))].sort() as string[],
        colors: [...new Set(formattedData.map(i => i.color).filter(Boolean))].sort() as string[],
        sizes: [...new Set(formattedData.map(i => i.size).filter(Boolean))].sort() as string[],
        categories: [...new Set(formattedData.map(i => i.category).filter(Boolean))].sort() as string[],
        suppliers: [...new Set(formattedData.map(i => i.supplier_name).filter(Boolean))].sort() as string[],
        supplierInvoices: [...new Set(formattedData.map(i => i.supplier_invoice_no).filter(Boolean))].sort() as string[]
      });

      setStockItems(formattedData);
    } catch (error) {
      console.error("Error fetching stock data:", error);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id, searchTerm, productNameFilter, brandFilter, colorFilter, sizeFilter, categoryFilter, supplierFilter, supplierInvoiceFilter, stockStatusFilter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Filter data based on search term and filters (client-side filtering of fetched data)
  const filteredStockItems = useMemo(() => {
    // Get variant IDs that match old barcodes
    const variantIdsFromOldBarcodes = new Set<string>();
    if (searchTerm && searchTerm.length >= 4) {
      const search = searchTerm.toLowerCase();
      oldBarcodeVariantMap.forEach((variantId, barcode) => {
        if (barcode.includes(search)) {
          variantIdsFromOldBarcodes.add(variantId);
        }
      });
    }

    return stockItems.filter(item => {
      // Product name filter
      if (productNameFilter) {
        const nameSearch = productNameFilter.toLowerCase();
        if (!item.product_name.toLowerCase().includes(nameSearch)) return false;
      }
      
      // General search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = (
          item.product_name.toLowerCase().includes(search) ||
          item.brand.toLowerCase().includes(search) ||
          item.color.toLowerCase().includes(search) ||
          item.size.toLowerCase().includes(search) ||
          item.barcode.toLowerCase().includes(search) ||
          item.supplier_name.toLowerCase().includes(search) ||
          item.supplier_invoice_no.toLowerCase().includes(search) ||
          variantIdsFromOldBarcodes.has(item.id)
        );
        if (!matchesSearch) return false;
      }
      
      // Brand filter
      if (brandFilter !== "all" && item.brand !== brandFilter) return false;
      
      // Color filter
      if (colorFilter !== "all" && item.color !== colorFilter) return false;
      
      // Size filter
      if (sizeFilter !== "all" && item.size !== sizeFilter) return false;
      
      // Supplier filter
      if (supplierFilter !== "all" && item.supplier_name !== supplierFilter) return false;
      
      // Supplier Invoice filter
      if (supplierInvoiceFilter !== "all" && item.supplier_invoice_no !== supplierInvoiceFilter) return false;
      
      // Category filter
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      
      // Stock status filter
      if (stockStatusFilter === "out" && item.stock_qty !== 0) return false;
      if (stockStatusFilter === "low" && (item.stock_qty === 0 || item.stock_qty > lowStockThreshold)) return false;
      if (stockStatusFilter === "in" && item.stock_qty <= lowStockThreshold) return false;
      
      return true;
    });
  }, [stockItems, searchTerm, productNameFilter, brandFilter, colorFilter, sizeFilter, supplierFilter, supplierInvoiceFilter, categoryFilter, stockStatusFilter, lowStockThreshold, oldBarcodeVariantMap]);


  // Size-wise stock report data
  const sizeWiseData = useMemo(() => {
    const allSizes = [...new Set(filteredStockItems.map(i => i.size))].sort();
    const productMap = new Map<string, SizeWiseRow>();
    
    filteredStockItems.forEach(item => {
      const productKey = `${item.product_name}-${item.brand}-${item.color}`;
      
      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          productKey,
          productName: item.product_name,
          brand: item.brand,
          color: item.color,
          category: item.category,
          sizeStocks: {},
          totalStock: 0
        });
      }
      
      const row = productMap.get(productKey)!;
      row.sizeStocks[item.size] = (row.sizeStocks[item.size] || 0) + item.stock_qty;
      row.totalStock += item.stock_qty;
    });
    
    return {
      sizes: allSizes,
      rows: Array.from(productMap.values()).sort((a, b) => a.productName.localeCompare(b.productName))
    };
  }, [filteredStockItems]);

  // Calculate totals for size-wise report
  const sizeWiseTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    
    sizeWiseData.rows.forEach(row => {
      sizeWiseData.sizes.forEach(size => {
        totals[size] = (totals[size] || 0) + (row.sizeStocks[size] || 0);
      });
      grandTotal += row.totalStock;
    });
    
    return { sizeTotals: totals, grandTotal };
  }, [sizeWiseData]);

  
  const totalStock = filteredStockItems.reduce((sum, item) => sum + item.stock_qty, 0);
  const totalStockValue = filteredStockItems.reduce((sum, item) => sum + (item.pur_price || 0) * item.stock_qty, 0);

  // Pagination calculations for All Stock tab
  const totalPages = Math.ceil(filteredStockItems.length / ITEMS_PER_PAGE);
  const paginatedStockItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStockItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredStockItems, currentPage, ITEMS_PER_PAGE]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, productNameFilter, brandFilter, colorFilter, sizeFilter, supplierFilter, supplierInvoiceFilter, categoryFilter, stockStatusFilter]);

  const clearFilters = () => {
    setSearchTerm("");
    setProductNameFilter("");
    setBrandFilter("all");
    setColorFilter("all");
    setSizeFilter("all");
    setCategoryFilter("all");
    setSupplierFilter("all");
    setSupplierInvoiceFilter("all");
    setStockStatusFilter("all");
    setStockItems([]);
    setHasSearched(false);
  };

  const hasActiveFilters = searchTerm || productNameFilter || brandFilter !== "all" || colorFilter !== "all" || sizeFilter !== "all" || categoryFilter !== "all" || supplierFilter !== "all" || supplierInvoiceFilter !== "all" || stockStatusFilter !== "all";

  // Export Size-wise to Excel
  const exportSizeWiseToExcel = () => {
    const headers = ["Product", "Brand", "Color", "Category", ...sizeWiseData.sizes, "Total Stock"];
    const data = sizeWiseData.rows.map(row => [
      row.productName,
      row.brand,
      row.color,
      row.category,
      ...sizeWiseData.sizes.map(size => row.sizeStocks[size] || 0),
      row.totalStock
    ]);
    
    data.push([
      "TOTAL", "", "", "",
      ...sizeWiseData.sizes.map(size => sizeWiseTotals.sizeTotals[size] || 0),
      sizeWiseTotals.grandTotal
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const colWidths = [
      { wch: 40 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      ...sizeWiseData.sizes.map(() => ({ wch: 8 })),
      { wch: 12 },
    ];
    ws['!cols'] = colWidths;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Size-wise Stock");
    XLSX.writeFile(wb, `SizeWise_Stock_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // Export Size-wise to PDF
  const exportSizeWiseToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    doc.setFontSize(16);
    doc.text("Size-wise Stock Report", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated on: ${format(new Date(), "dd-MM-yyyy")}`, pageWidth / 2, 22, { align: "center" });
    
    let y = 35;
    const startX = 10;
    const sizes = sizeWiseData.sizes;
    const productColWidth = 70;
    const sizeColWidth = Math.min(15, (pageWidth - productColWidth - 30) / (sizes.length + 1));
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(startX, y - 5, pageWidth - 20, 8, "F");
    doc.text("Product (Brand)", startX + 2, y);
    sizes.forEach((size, i) => {
      doc.text(size, productColWidth + startX + (i * sizeColWidth), y);
    });
    doc.text("Total", productColWidth + startX + (sizes.length * sizeColWidth), y);
    
    doc.setFont("helvetica", "normal");
    sizeWiseData.rows.forEach((row, idx) => {
      y += 6;
      if (y > pageHeight - 25) {
        doc.addPage();
        y = 20;
      }
      
      if (idx % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(startX, y - 4, pageWidth - 20, 6, "F");
      }
      
      const productLabel = `${row.productName} ${row.brand ? `(${row.brand})` : ''}`.substring(0, 60);
      doc.text(productLabel, startX + 2, y);
      sizes.forEach((size, i) => {
        const qty = row.sizeStocks[size] || 0;
        doc.text(String(qty), productColWidth + startX + (i * sizeColWidth), y);
      });
      doc.text(String(row.totalStock), productColWidth + startX + (sizes.length * sizeColWidth), y);
    });
    
    y += 8;
    if (y > pageHeight - 15) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFillColor(255, 220, 220);
    doc.rect(startX, y - 4, pageWidth - 20, 7, "F");
    doc.text("TOTAL", startX + 2, y);
    sizes.forEach((size, i) => {
      doc.text(String(sizeWiseTotals.sizeTotals[size] || 0), productColWidth + startX + (i * sizeColWidth), y);
    });
    doc.text(String(sizeWiseTotals.grandTotal), productColWidth + startX + (sizes.length * sizeColWidth), y);
    
    doc.save(`SizeWise_Stock_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <BackToDashboard />
      <div>
        <h1 className="text-3xl font-bold">Stock Report</h1>
        <p className="text-muted-foreground">Apply filters and search to view inventory levels</p>
      </div>

      {/* Search Bar */}
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <ProductSearchDropdown
            value={searchTerm}
            onChange={setSearchTerm}
            onSelect={(product) => {
              setSearchTerm(product.product_name);
              handleSearch();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search by product, barcode, brand..."
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading || !hasActiveFilters}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
            Search
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="h-11">
              Clear All
            </Button>
          )}
        </div>
        
        {/* Always visible multi-field filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Product Name</label>
            <Input
              placeholder="Filter by name..."
              value={productNameFilter}
              onChange={(e) => setProductNameFilter(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-9 !bg-white !text-gray-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Brand</label>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="h-9 !bg-white !text-gray-900">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {filterOptions.brands.map(brand => (
                  <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 !bg-white !text-gray-900">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {filterOptions.categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Color</label>
            <Select value={colorFilter} onValueChange={setColorFilter}>
              <SelectTrigger className="h-9 !bg-white !text-gray-900">
                <SelectValue placeholder="All Colors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Colors</SelectItem>
                {filterOptions.colors.map(color => (
                  <SelectItem key={color} value={color}>{color}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Size</label>
            <Select value={sizeFilter} onValueChange={setSizeFilter}>
              <SelectTrigger className="h-9 !bg-white !text-gray-900">
                <SelectValue placeholder="All Sizes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sizes</SelectItem>
                {filterOptions.sizes.map(size => (
                  <SelectItem key={size} value={size}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Stock Status</label>
            <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
              <SelectTrigger className="h-9 !bg-white !text-gray-900">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Additional filters in collapsible */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-3 w-3" />
              More Filters
              {filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Supplier</label>
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger className="h-9 !bg-white !text-gray-900">
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {filterOptions.suppliers.map(supplier => (
                      <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Supplier Invoice</label>
                <Select value={supplierInvoiceFilter} onValueChange={setSupplierInvoiceFilter}>
                  <SelectTrigger className="h-9 !bg-white !text-gray-900">
                    <SelectValue placeholder="All Invoices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Invoices</SelectItem>
                    {filterOptions.supplierInvoices.map(invoice => (
                      <SelectItem key={invoice} value={invoice}>{invoice}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {!hasSearched ? (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Search to View Stock Report</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Apply filters or enter a search term, then click Search to view stock data.
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading stock data...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-lg"
              onClick={() => setActiveTab("all")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white/90">Total Stock</CardTitle>
                <Package className="h-4 w-4 text-white" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{totalStock.toLocaleString('en-IN')}</div>
                <p className="text-xs text-white/70">{filteredStockItems.length} variants</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white/90">Stock Value</CardTitle>
                <IndianRupee className="h-4 w-4 text-white" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">₹{totalStockValue.toLocaleString('en-IN')}</div>
                <p className="text-xs text-white/70">Inventory valuation</p>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="all">All Stock</TabsTrigger>
              <TabsTrigger value="sizewise" className="gap-1">
                <Grid3X3 className="h-4 w-4" />
                Size-wise
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Current Stock Levels</CardTitle>
                      <CardDescription>
                        Stock breakdown: Opening Qty + Purchase Qty - Pur Return - Sales Qty = Current Stock Qty
                      </CardDescription>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Showing {filteredStockItems.length > 0 ? ((currentPage - 1) * ITEMS_PER_PAGE) + 1 : 0} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredStockItems.length)} of {filteredStockItems.length} items
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                      <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16 text-center">Sr No</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Supplier Invoice</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Brand</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Barcode</TableHead>
                          <TableHead className="text-right bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-white">Opening Qty</TableHead>
                          <TableHead className="text-right bg-green-50 dark:bg-green-950 text-green-800 dark:text-white">Purchase Qty</TableHead>
                          <TableHead className="text-right bg-orange-50 dark:bg-orange-950 text-orange-800 dark:text-white">Pur Return</TableHead>
                          <TableHead className="text-right bg-red-50 dark:bg-red-950 text-red-800 dark:text-white">Sales Qty</TableHead>
                          <TableHead className="text-right bg-primary/10 font-semibold text-primary dark:text-white">Current Stock</TableHead>
                          <TableHead className="text-right">Pur Price</TableHead>
                          <TableHead className="text-right">Stock Value</TableHead>
                          <TableHead className="text-right">Sale Price</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedStockItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={16} className="text-center text-muted-foreground py-8">
                              No products found matching your search
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedStockItems.map((item, index) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-center font-medium text-muted-foreground">
                                {((currentPage - 1) * ITEMS_PER_PAGE) + index + 1}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{item.supplier_name || '—'}</TableCell>
                              <TableCell className="font-mono text-sm">{item.supplier_invoice_no || '—'}</TableCell>
                              <TableCell className="font-medium">{item.product_name}</TableCell>
                              <TableCell>{item.brand}</TableCell>
                              <TableCell>{item.size}</TableCell>
                              <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                              <TableCell className="text-right bg-blue-50 dark:bg-blue-950 font-medium">
                                {item.opening_qty}
                              </TableCell>
                              <TableCell className="text-right bg-green-50 dark:bg-green-950 font-medium text-green-700 dark:text-green-400">
                                +{item.purchase_qty}
                              </TableCell>
                              <TableCell className="text-right bg-orange-50 dark:bg-orange-950 font-medium text-orange-700 dark:text-orange-400">
                                {item.purchase_return_qty > 0 ? `-${item.purchase_return_qty}` : '0'}
                              </TableCell>
                              <TableCell className="text-right bg-red-50 dark:bg-red-950 font-medium text-red-700 dark:text-red-400">
                                {item.sales_qty > 0 ? `-${item.sales_qty}` : '0'}
                              </TableCell>
                              <TableCell className="text-right bg-primary/10 font-bold text-primary">
                                {item.stock_qty}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.pur_price ? (
                                  <span>₹{item.pur_price}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium text-primary">
                                {item.pur_price ? (
                                  <span>₹{(item.pur_price * item.stock_qty).toLocaleString('en-IN')}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <span>₹{item.sale_price}</span>
                              </TableCell>
                              <TableCell>
                                {item.stock_qty === 0 ? (
                                  <Badge variant="destructive">Out of Stock</Badge>
                                ) : item.stock_qty <= lowStockThreshold ? (
                                  <Badge variant="secondary">Low Stock</Badge>
                                ) : (
                                  <Badge variant="outline">In Stock</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                        >
                          First
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Prev
                        </Button>
                        
                        {/* Page number buttons */}
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                className="w-9"
                                onClick={() => setCurrentPage(pageNum)}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          Last
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sizewise" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Grid3X3 className="h-5 w-5" />
                        Size-wise Item Stock Report
                      </CardTitle>
                      <CardDescription>
                        Product stock grouped by sizes - shows quantity per size with total
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={exportSizeWiseToExcel}
                        disabled={sizeWiseData.rows.length === 0}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-1" />
                        Excel
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={exportSizeWiseToPDF}
                        disabled={sizeWiseData.rows.length === 0}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        PDF
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {sizeWiseData.rows.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No products found matching your filters</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold min-w-[250px]">Product</TableHead>
                            {sizeWiseData.sizes.map(size => (
                              <TableHead key={size} className="text-center font-semibold min-w-[60px] bg-primary/10">
                                {size}
                              </TableHead>
                            ))}
                            <TableHead className="text-center font-bold min-w-[80px] bg-primary/20 text-primary">
                              Stock
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sizeWiseData.rows.map((row, index) => (
                            <TableRow key={row.productKey} className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                              <TableCell className="font-medium">
                                <div className="flex flex-col">
                                  <span>{row.productName}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {[row.brand, row.color].filter(Boolean).join(' - ')}
                                  </span>
                                  {row.category && (
                                    <span className="text-xs text-muted-foreground/70">
                                      {row.category}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              {sizeWiseData.sizes.map(size => {
                                const qty = row.sizeStocks[size] || 0;
                                return (
                                  <TableCell 
                                    key={size} 
                                    className={`text-center ${
                                      qty === 0 ? 'text-muted-foreground/50' : 
                                      'font-bold text-foreground bg-green-100 dark:bg-green-900/40'
                                    }`}
                                  >
                                    {qty}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-center font-bold text-primary bg-primary/10">
                                {row.totalStock}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Total Row */}
                          <TableRow className="bg-destructive/10 font-bold border-t-2">
                            <TableCell className="text-destructive font-bold">Total Stock</TableCell>
                            {sizeWiseData.sizes.map(size => (
                              <TableCell key={size} className="text-center text-destructive font-bold">
                                {sizeWiseTotals.sizeTotals[size] || 0}
                              </TableCell>
                            ))}
                            <TableCell className="text-center font-bold text-destructive bg-destructive/20">
                              {sizeWiseTotals.grandTotal}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
