import { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Search, Filter, ChevronDown, ChevronUp, Grid3X3, IndianRupee, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, Printer } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileStatStrip } from "@/components/mobile/MobileStatStrip";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useProductFieldLabels } from "@/hooks/useSettings";
import { ProductSearchDropdown } from "@/components/ProductSearchDropdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { sortSizes } from "@/utils/sizeSort";
import { multiTokenMatch } from "@/utils/multiTokenSearch";

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
  sale_return_qty: number;
  sale_price: number;
  pur_price: number | null;
  barcode: string;
  supplier_name: string;
  supplier_invoice_no: string;
  category: string;
  department: string;
  uom: string;
}


interface SizeWiseRow {
  productKey: string;
  productName: string;
  brand: string;
  color: string;
  category: string;
  department: string;
  sizeStocks: Record<string, number>;
  totalStock: number;
}

export default function StockReport() {
  const { currentOrganization } = useOrganization();
  const fieldLabels = useProductFieldLabels();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [excelExporting, setExcelExporting] = useState(false);
  
  // Global totals for default cards (loaded on mount)
  const [globalTotals, setGlobalTotals] = useState({
    totalStock: 0,
    stockValue: 0,
    saleValue: 0,
    variantCount: 0,
    isLoading: true
  });
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [productNameFilter, setProductNameFilter] = useState("");
  const [sizeWiseSearch, setSizeWiseSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab");
    return tabParam === "sizewise" ? "sizewise" : "all";
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [supplierInvoiceFilter, setSupplierInvoiceFilter] = useState<string>("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<string>("all");
  const [colorFilter, setColorFilter] = useState<string>("all");
  const [oldBarcodeVariantMap, setOldBarcodeVariantMap] = useState<Map<string, string>>(new Map());
  const [pinnedProducts, setPinnedProducts] = useState<Array<{ id: string; product_name: string; brand: string; category: string; style: string }>>([]); 
  
  // Cached filter options from last search
  const [filterOptions, setFilterOptions] = useState({
    brands: [] as string[],
    departments: [] as string[],
    sizes: [] as string[],
    categories: [] as string[],
    colors: [] as string[],
    suppliers: [] as string[],
    supplierInvoices: [] as string[],
    productNames: [] as string[],
    rawProducts: [] as Array<{ id: string; product_name: string; brand: string; category: string; style: string }>,
    variantsByProductId: {} as Record<string, { sizes: string[]; colors: string[] }>,
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

  const REPORT_CACHE = { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false as const };

  // Fetch global totals via RPC (single JSON instead of downloading all variants)
  const { data: cachedGlobalTotals } = useQuery({
    queryKey: ["stock-report-global-totals-rpc", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data, error } = await supabase.rpc("get_stock_report_totals", {
        p_organization_id: currentOrganization.id,
      });
      if (error) throw error;
      const result = data as any;
      return {
        totalStock: result?.total_stock ?? 0,
        stockValue: result?.stock_value ?? 0,
        saleValue: result?.sale_value ?? 0,
        variantCount: result?.variant_count ?? 0,
      };
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Paginated fetch helper to bypass 1000-row PostgREST default
  // Uses a factory pattern — each page gets a fresh query builder so .range() works correctly
  const fetchAllPages = async (queryFactory: () => any) => {
    const PAGE_SIZE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      const { data: page } = await queryFactory().range(from, from + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      all = [...all, ...page];
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return all;
  };

  // Fetch filter options with useQuery for caching
  const { data: cachedFilterOptions } = useQuery({
    queryKey: ["stock-report-filter-options", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      // Paginate products, variants, and batch_stock in parallel
      const [allProducts, allVariants, batchData] = await Promise.all([
        fetchAllPages(
          () => supabase.from("products").select("id, product_name, brand, category, style").eq("organization_id", currentOrganization.id).is("deleted_at", null).neq("product_type", "service").order("product_name")
        ),
        fetchAllPages(
          () => supabase.from("product_variants").select("product_id, size, color").eq("organization_id", currentOrganization.id).eq("active", true).is("deleted_at", null)
        ),
        fetchAllPages(
          // Query purchase_bills directly (small table) instead of batch_stock (huge),
          // since we only need the unique supplier names and invoice numbers for filters.
          () => supabase.from("purchase_bills").select("supplier_name, supplier_invoice_no").eq("organization_id", currentOrganization.id).is("deleted_at", null)
        ),
      ]);

      // Build variants-by-product map for cascading filters
      const variantsByProductId: Record<string, { sizes: string[]; colors: string[] }> = {};
      allVariants.forEach((v: any) => {
        if (!v.product_id) return;
        if (!variantsByProductId[v.product_id]) {
          variantsByProductId[v.product_id] = { sizes: [], colors: [] };
        }
        const entry = variantsByProductId[v.product_id];
        if (v.size && !entry.sizes.includes(v.size)) entry.sizes.push(v.size);
        if (v.color && !entry.colors.includes(v.color)) entry.colors.push(v.color);
      });

      return {
        brands: [...new Set(allProducts.map((p: any) => p.brand).filter(Boolean))].sort() as string[],
        categories: [...new Set(allProducts.map((p: any) => p.category).filter(Boolean))].sort() as string[],
        departments: [...new Set(allProducts.map((p: any) => p.style).filter(Boolean))].sort() as string[],
        sizes: [...new Set(allVariants.map((v: any) => v.size).filter(Boolean))].sort() as string[],
        colors: [...new Set(allVariants.map((v: any) => v.color).filter(Boolean))].sort() as string[],
        suppliers: [...new Set(batchData.map((b: any) => b.supplier_name).filter(Boolean))].sort() as string[],
        supplierInvoices: [...new Set(batchData.map((b: any) => b.supplier_invoice_no).filter(Boolean))].sort() as string[],
        productNames: [...new Set(allProducts.map((p: any) => p.product_name).filter(Boolean))].sort() as string[],
        rawProducts: allProducts as Array<{ id: string; product_name: string; brand: string; category: string; style: string }>,
        variantsByProductId,
      };
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Sync cached data to state
  useEffect(() => {
    if (cachedGlobalTotals) {
      setGlobalTotals({ ...cachedGlobalTotals, isLoading: false });
    }
  }, [cachedGlobalTotals]);

  useEffect(() => {
    if (cachedFilterOptions) {
      setFilterOptions(cachedFilterOptions);
    }
  }, [cachedFilterOptions]);

  // Fetch settings on mount
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchSettings();
    }
  }, [currentOrganization?.id]);

  // Derived cascading filter options based on selected product name
  const derivedFilterOptions = useMemo(() => {
    if (!productNameFilter) {
      return {
        brands: filterOptions.brands,
        categories: filterOptions.categories,
        departments: filterOptions.departments,
        sizes: filterOptions.sizes,
        colors: filterOptions.colors,
      };
    }
    const matchingProducts = filterOptions.rawProducts.filter(
      p => p.product_name === productNameFilter
    );
    if (matchingProducts.length === 0) {
      return {
        brands: filterOptions.brands,
        categories: filterOptions.categories,
        departments: filterOptions.departments,
        sizes: filterOptions.sizes,
        colors: filterOptions.colors,
      };
    }
    const matchingBrands = [...new Set(matchingProducts.map(p => p.brand).filter(Boolean))].sort();
    const matchingCategories = [...new Set(matchingProducts.map(p => p.category).filter(Boolean))].sort();
    const matchingDepartments = [...new Set(matchingProducts.map(p => p.style).filter(Boolean))].sort();
    const matchingSizes = new Set<string>();
    const matchingColors = new Set<string>();
    matchingProducts.forEach(p => {
      const variants = filterOptions.variantsByProductId[p.id];
      if (variants) {
        variants.sizes.forEach(s => matchingSizes.add(s));
        variants.colors.forEach(c => matchingColors.add(c));
      }
    });
    return {
      brands: matchingBrands,
      categories: matchingCategories,
      departments: matchingDepartments,
      sizes: [...matchingSizes].sort(),
      colors: [...matchingColors].sort(),
    };
  }, [productNameFilter, filterOptions]);

  // Pre-load filter dropdown options from products and variants (non-cached fallback)
  const fetchFilterOptions = async () => {
    if (!currentOrganization?.id) return;
    
    try {
      const [allProducts, allVariants, batchData] = await Promise.all([
        fetchAllPages(
          () => supabase.from("products").select("id, product_name, brand, category, style").eq("organization_id", currentOrganization.id).is("deleted_at", null).neq("product_type", "service").order("product_name")
        ),
        fetchAllPages(
          () => supabase.from("product_variants").select("product_id, size, color").eq("organization_id", currentOrganization.id).eq("active", true).is("deleted_at", null)
        ),
        fetchAllPages(
          () => supabase.from("purchase_bills").select("supplier_name, supplier_invoice_no").eq("organization_id", currentOrganization.id).is("deleted_at", null)
        ),
      ]);

      const variantsByProductId: Record<string, { sizes: string[]; colors: string[] }> = {};
      allVariants.forEach((v: any) => {
        if (!v.product_id) return;
        if (!variantsByProductId[v.product_id]) {
          variantsByProductId[v.product_id] = { sizes: [], colors: [] };
        }
        const entry = variantsByProductId[v.product_id];
        if (v.size && !entry.sizes.includes(v.size)) entry.sizes.push(v.size);
        if (v.color && !entry.colors.includes(v.color)) entry.colors.push(v.color);
      });

      const brands = [...new Set(allProducts.map((p: any) => p.brand).filter(Boolean))].sort() as string[];
      const categories = [...new Set(allProducts.map((p: any) => p.category).filter(Boolean))].sort() as string[];
      const departments = [...new Set(allProducts.map((p: any) => p.style).filter(Boolean))].sort() as string[];
      const sizes = [...new Set(allVariants.map((v: any) => v.size).filter(Boolean))].sort() as string[];
      const colors = [...new Set(allVariants.map((v: any) => v.color).filter(Boolean))].sort() as string[];
      const suppliers = [...new Set(batchData.map((b: any) => b.supplier_name).filter(Boolean))].sort() as string[];
      const supplierInvoices = [...new Set(batchData.map((b: any) => b.supplier_invoice_no).filter(Boolean))].sort() as string[];
      
      setFilterOptions({
        brands,
        categories,
        departments,
        sizes,
        colors,
        suppliers,
        supplierInvoices,
        productNames: [...new Set(allProducts.map((p: any) => p.product_name).filter(Boolean))].sort() as string[],
        rawProducts: allProducts as Array<{ id: string; product_name: string; brand: string; category: string; style: string }>,
        variantsByProductId,
      });
    } catch (error) {
      console.error("Error fetching filter options:", error);
    }
  };

  // Fetch global stock totals for default cards
  const fetchGlobalTotals = async () => {
    if (!currentOrganization?.id) return;
    
    try {
      setGlobalTotals(prev => ({ ...prev, isLoading: true }));
      
      // Fetch all variant data to compute totals
      const allVariants: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("product_variants")
          .select(`
            id,
            stock_qty,
            sale_price,
            pur_price,
            products!inner (
              product_type,
              deleted_at
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .neq("products.product_type", "service")
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
      
      // Calculate totals
      const totals = allVariants.reduce((acc, item) => {
        const qty = item.stock_qty || 0;
        const purPrice = item.pur_price || 0;
        const salePrice = item.sale_price || 0;
        
        return {
          totalStock: acc.totalStock + qty,
          stockValue: acc.stockValue + (purPrice * qty),
          saleValue: acc.saleValue + (salePrice * qty),
          variantCount: acc.variantCount + 1
        };
      }, { totalStock: 0, stockValue: 0, saleValue: 0, variantCount: 0 });
      
      setGlobalTotals({
        ...totals,
        isLoading: false
      });
    } catch (error) {
      console.error("Error fetching global totals:", error);
      setGlobalTotals(prev => ({ ...prev, isLoading: false }));
    }
  };

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
      brandFilter !== "all" || departmentFilter !== "all" || sizeFilter !== "all" || 
      categoryFilter !== "all" || colorFilter !== "all" || supplierFilter !== "all" || 
      supplierInvoiceFilter !== "all" || stockStatusFilter !== "all";
    
    if (!hasFilters) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      // Search old barcodes in parallel (don't await before main search)
      const oldBarcodePromise = (searchTerm && searchTerm.length >= 4)
        ? searchOldBarcodes(searchTerm)
        : Promise.resolve();

      // Detect if search looks like a barcode (has digits and 5+ chars)
      const trimmedSearch = searchTerm.trim();
      const looksLikeBarcode = trimmedSearch && /\d/.test(trimmedSearch) && trimmedSearch.length >= 5;

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
              style,
              product_type,
              deleted_at,
              uom
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .neq("products.product_type", "service");
        
        // Apply search filter — unified fields: name, brand, style, category, color, hsn + barcode
        if (trimmedSearch) {
          if (looksLikeBarcode) {
            // Barcode search: exact match OR prefix match (fast B-tree index)
            query = query.or(`barcode.eq.${trimmedSearch},barcode.ilike.${trimmedSearch}%`);
          } else {
            // Text search: filter on referenced table for all product fields
            query = query.or(
              `product_name.ilike.%${trimmedSearch}%,brand.ilike.%${trimmedSearch}%,style.ilike.%${trimmedSearch}%,category.ilike.%${trimmedSearch}%,color.ilike.%${trimmedSearch}%,hsn_code.ilike.%${trimmedSearch}%`,
              { referencedTable: "products" }
            );
          }
        }
        
        // Apply stock status filter at query level for efficiency
        if (stockStatusFilter === "out") {
          query = query.eq("stock_qty", 0);
        } else if (stockStatusFilter === "in") {
          query = query.gt("stock_qty", 0);
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

      // Wait for old barcode search to complete
      await oldBarcodePromise;
      
      const data = allVariants;

      // Fetch purchase/sales/return quantities directly from transaction tables
      // This is more accurate than stock_movements which may have incomplete historical data
      const variantIds = allVariants.map((v: any) => v.id);
      const BATCH_SIZE = 200;

      // Paginated fetch helpers for each table
      const fetchPurchaseItems = async (batchIds: string[]) => {
        const rows: any[] = [];
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("purchase_items")
            .select("sku_id, qty")
            .in("sku_id", batchIds)
            .is("deleted_at", null)
            .order("id")
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          if (data && data.length > 0) { rows.push(...data); offset += pageSize; hasMore = data.length === pageSize; } else { hasMore = false; }
        }
        return rows;
      };

      const fetchSaleItems = async (batchIds: string[]) => {
        const rows: any[] = [];
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("sale_items")
            .select("variant_id, quantity")
            .in("variant_id", batchIds)
            .is("deleted_at", null)
            .order("id")
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          if (data && data.length > 0) { rows.push(...data); offset += pageSize; hasMore = data.length === pageSize; } else { hasMore = false; }
        }
        return rows;
      };

      const fetchPurchaseReturnItems = async (batchIds: string[]) => {
        const rows: any[] = [];
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from("purchase_return_items")
            .select("sku_id, qty")
            .in("sku_id", batchIds)
            .is("deleted_at", null)
            .order("id")
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          if (data && data.length > 0) { rows.push(...data); offset += pageSize; hasMore = data.length === pageSize; } else { hasMore = false; }
        }
        return rows;
      };

      const fetchSaleReturnItems = async (batchIds: string[]) => {
        const rows: any[] = [];
        let offset = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('sale_return_items')
            .select('variant_id, quantity')
            .in('variant_id', batchIds)
            .is('deleted_at', null)
            .order('id')
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          if (data && data.length > 0) { rows.push(...data); offset += pageSize; hasMore = data.length === pageSize; }
          else { hasMore = false; }
        }
        return rows;
      };

      // Aggregate quantities from all transaction tables
      const variantMovements: Record<string, { purchase: number; purchaseReturn: number; sales: number; saleReturn: number }> = {};

      // Fetch batch stock for supplier info (batched)
      const allBatchData: any[] = [];

      for (let i = 0; i < variantIds.length; i += BATCH_SIZE) {
        const batchIds = variantIds.slice(i, i + BATCH_SIZE);

        // Run all 5 queries in parallel for each batch
        const [purchaseRows, saleRows, purReturnRows, saleReturnRows, batchStockData] = await Promise.all([
          fetchPurchaseItems(batchIds),
          fetchSaleItems(batchIds),
          fetchPurchaseReturnItems(batchIds),
          fetchSaleReturnItems(batchIds),
          supabase
            .from("batch_stock")
            .select(`variant_id, purchase_bills ( supplier_name, supplier_invoice_no )`)
            .eq("organization_id", currentOrganization.id)
            .in("variant_id", batchIds)
            .then(({ data, error }) => { if (error) throw error; return data || []; }),
        ]);

        if (batchStockData) allBatchData.push(...batchStockData);

        for (const row of purchaseRows) {
          if (!variantMovements[row.sku_id]) variantMovements[row.sku_id] = { purchase: 0, purchaseReturn: 0, sales: 0, saleReturn: 0 };
          variantMovements[row.sku_id].purchase += (row.qty || 0);
        }
        for (const row of saleRows) {
          if (!variantMovements[row.variant_id]) variantMovements[row.variant_id] = { purchase: 0, purchaseReturn: 0, sales: 0, saleReturn: 0 };
          variantMovements[row.variant_id].sales += (row.quantity || 0);
        }
        for (const row of purReturnRows) {
          if (!variantMovements[row.sku_id]) variantMovements[row.sku_id] = { purchase: 0, purchaseReturn: 0, sales: 0, saleReturn: 0 };
          variantMovements[row.sku_id].purchaseReturn += (row.qty || 0);
        }
        for (const row of saleReturnRows) {
          if (!variantMovements[row.variant_id]) variantMovements[row.variant_id] = { purchase: 0, purchaseReturn: 0, sales: 0, saleReturn: 0 };
          variantMovements[row.variant_id].saleReturn += (row.quantity || 0);
        }
      }

      // Map variant_id to supplier names and invoice numbers
      const variantSuppliers = allBatchData.reduce((acc: any, batch: any) => {
        if (!acc[batch.variant_id] && batch.purchase_bills?.supplier_name) {
          acc[batch.variant_id] = {
            supplier_name: batch.purchase_bills.supplier_name,
            supplier_invoice_no: batch.purchase_bills.supplier_invoice_no || ''
          };
        }
        return acc;
      }, {});

      const formattedData = data?.map((item: any) => {
        const movements = variantMovements[item.id] || { purchase: 0, purchaseReturn: 0, sales: 0, saleReturn: 0 };
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
          sale_return_qty: Math.max(0, movements.saleReturn || 0),
          sale_price: item.sale_price,
          pur_price: item.pur_price || null,
          barcode: item.barcode || "",
          supplier_name: supplierInfo.supplier_name || "",
          supplier_invoice_no: supplierInfo.supplier_invoice_no || "",
          category: item.products?.category || "",
          department: item.products?.style || "",
          uom: item.products?.uom || "NOS",
        };
      }) || [];

      // Update filter options from fetched data
      setFilterOptions(prev => ({
        ...prev,
        brands: [...new Set(formattedData.map(i => i.brand).filter(Boolean))].sort() as string[],
        departments: [...new Set(formattedData.map(i => i.department).filter(Boolean))].sort() as string[],
        sizes: [...new Set(formattedData.map(i => i.size).filter(Boolean))].sort() as string[],
        categories: [...new Set(formattedData.map(i => i.category).filter(Boolean))].sort() as string[],
        colors: [...new Set(formattedData.map(i => i.color).filter(Boolean))].sort() as string[],
        suppliers: [...new Set(formattedData.map(i => i.supplier_name).filter(Boolean))].sort() as string[],
        supplierInvoices: [...new Set(formattedData.map(i => i.supplier_invoice_no).filter(Boolean))].sort() as string[]
      }));

      setStockItems(formattedData);
    } catch (error) {
      console.error("Error fetching stock data:", error);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id, searchTerm, productNameFilter, brandFilter, departmentFilter, sizeFilter, colorFilter, categoryFilter, supplierFilter, supplierInvoiceFilter, stockStatusFilter]);

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
      // Pinned product filter
      if (pinnedProducts.length > 0) {
        const pinnedNames = new Set(pinnedProducts.map(p => p.product_name.toLowerCase()));
        if (!pinnedNames.has((item.product_name || '').toLowerCase())) return false;
      }
      
      // Product name filter
      if (productNameFilter) {
        const nameSearch = productNameFilter.toLowerCase();
        if (!item.product_name.toLowerCase().includes(nameSearch)) return false;
      }
      
      // General search filter — multi-token AND
      if (searchTerm) {
        const matchesOldBarcode = variantIdsFromOldBarcodes.has(item.id);
        if (!matchesOldBarcode && !multiTokenMatch(searchTerm, item.product_name, item.brand, item.color, item.size, item.barcode, item.supplier_name, item.supplier_invoice_no, (item as any).category, (item as any).hsn_code)) return false;
      }
      
      // Brand filter
      if (brandFilter !== "all" && item.brand !== brandFilter) return false;
      
      // Department filter
      if (departmentFilter !== "all" && item.department !== departmentFilter) return false;
      
      // Size filter
      if (sizeFilter !== "all" && item.size !== sizeFilter) return false;
      
      // Supplier filter
      if (supplierFilter !== "all" && item.supplier_name !== supplierFilter) return false;
      
      // Supplier Invoice filter
      if (supplierInvoiceFilter !== "all" && item.supplier_invoice_no !== supplierInvoiceFilter) return false;
      
      // Category filter
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      
      // Color filter
      if (colorFilter !== "all" && item.color !== colorFilter) return false;
      
      // Stock status filter
      if (stockStatusFilter === "out" && item.stock_qty !== 0) return false;
      if (stockStatusFilter === "low" && (item.stock_qty === 0 || item.stock_qty > lowStockThreshold)) return false;
      if (stockStatusFilter === "in" && item.stock_qty <= lowStockThreshold) return false;
      
      return true;
    });
  }, [stockItems, searchTerm, productNameFilter, brandFilter, departmentFilter, sizeFilter, colorFilter, supplierFilter, supplierInvoiceFilter, categoryFilter, stockStatusFilter, lowStockThreshold, oldBarcodeVariantMap, pinnedProducts]);


  // Size-wise stock report data
  const sizeWiseData = useMemo(() => {
    // Independent search: split by '-' or whitespace, AND-match across product fields + size
    const tokens = (sizeWiseSearch || "")
      .toLowerCase()
      .split(/[-\s]+/)
      .map(t => t.trim())
      .filter(Boolean);
    const matchesSearch = (item: typeof filteredStockItems[number]) => {
      if (tokens.length === 0) return true;
      const hay = [
        item.product_name,
        item.brand,
        item.color,
        item.size,
        item.category,
        item.department,
      ].map(v => (v != null ? String(v) : "")).join(" ").toLowerCase();
      return tokens.every(t => hay.includes(t));
    };
    const searched = filteredStockItems.filter(matchesSearch);
    const allSizes = sortSizes([...new Set(searched.map(i => i.size))]);
    const productMap = new Map<string, SizeWiseRow>();
    
    searched.forEach(item => {
      const productKey = `${item.product_name}-${item.brand}-${item.color}-${item.department}`;
      
      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          productKey,
          productName: item.product_name,
          brand: item.brand,
          color: item.color,
          category: item.category,
          department: item.department,
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
  }, [filteredStockItems, sizeWiseSearch]);

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
  const totalSaleValue = filteredStockItems.reduce((sum, item) => sum + (item.sale_price || 0) * item.stock_qty, 0);

  // Pagination calculations for All Stock tab
  const totalPages = Math.ceil(filteredStockItems.length / ITEMS_PER_PAGE);
  const paginatedStockItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStockItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredStockItems, currentPage, ITEMS_PER_PAGE]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, productNameFilter, brandFilter, departmentFilter, sizeFilter, colorFilter, supplierFilter, supplierInvoiceFilter, categoryFilter, stockStatusFilter]);

  const clearFilters = () => {
    setSearchTerm("");
    setProductNameFilter("");
    setBrandFilter("all");
    setDepartmentFilter("all");
    setSizeFilter("all");
    setColorFilter("all");
    setCategoryFilter("all");
    setSupplierFilter("all");
    setSupplierInvoiceFilter("all");
    setStockStatusFilter("all");
    setStockItems([]);
    setHasSearched(false);
  };

  const hasActiveFilters = searchTerm || productNameFilter || brandFilter !== "all" || departmentFilter !== "all" || sizeFilter !== "all" || colorFilter !== "all" || categoryFilter !== "all" || supplierFilter !== "all" || supplierInvoiceFilter !== "all" || stockStatusFilter !== "all";

  // Export Size-wise to Excel
  const exportSizeWiseToExcel = () => {
    const headers = ["Product", "Brand", "Color", "Category", "Style", ...sizeWiseData.sizes, "Total Stock"];
    const data = sizeWiseData.rows.map(row => [
      row.productName,
      row.brand,
      row.color,
      row.category,
      row.department,
      ...sizeWiseData.sizes.map(size => row.sizeStocks[size] || 0),
      row.totalStock
    ]);
    
    data.push([
      "TOTAL", "", "", "", "",
      ...sizeWiseData.sizes.map(size => sizeWiseTotals.sizeTotals[size] || 0),
      sizeWiseTotals.grandTotal
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const colWidths = [
      { wch: 40 },
      { wch: 15 },
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
      
      const productLabel = `${row.productName} ${row.brand ? `(${row.brand})` : ''} ${row.department ? `[${row.department}]` : ''}`.substring(0, 70);
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

  // Export All Stock to Excel
  const exportAllStockToExcel = () => {
    const headers = ["Sr No", "Supplier", "Supplier Invoice", "Product", "Brand", "Size", "Color", "Style", "Barcode", "Opening Qty", "Purchase Qty", "Pur Return", "Sales Qty", "Sale Return", "Current Stock", "Pur Price", "Stock Value", "Sale Price", "Status"];
    const data = filteredStockItems.map((item, index) => [
      index + 1,
      item.supplier_name || "",
      item.supplier_invoice_no || "",
      item.product_name,
      item.brand,
      item.size,
      item.color || "",
      item.department || "",
      item.barcode,
      item.opening_qty,
      item.purchase_qty,
      item.purchase_return_qty,
      item.sales_qty,
      item.sale_return_qty,
      item.stock_qty,
      item.pur_price || 0,
      Math.round((item.pur_price || 0) * item.stock_qty),
      item.sale_price,
      item.stock_qty === 0 ? "Out of Stock" : item.stock_qty <= lowStockThreshold ? "Low Stock" : "In Stock",
    ]);
    // Totals row
    data.push([
      "", "", "", "TOTAL", "", "", "", "", "",
      filteredStockItems.reduce((s, i) => s + i.opening_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.purchase_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.purchase_return_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.sales_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.sale_return_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.stock_qty, 0),
      "",
      Math.round(filteredStockItems.reduce((s, i) => s + (i.pur_price || 0) * i.stock_qty, 0)),
      Math.round(filteredStockItems.reduce((s, i) => s + i.sale_price * i.stock_qty, 0)),
      "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws['!cols'] = [
      { wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 15 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 16 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Report");
    XLSX.writeFile(wb, `Stock_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // Export ALL stock to Excel (without search - fetches everything)
  const exportFullStockToExcel = async () => {
    if (!currentOrganization?.id) return;
    setExcelExporting(true);
    try {
      const allVariants: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("product_variants")
          .select(`
            id, size, color, stock_qty, opening_qty, sale_price, pur_price, barcode,
            products!inner (product_name, brand, category, style, product_type, deleted_at)
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .neq("products.product_type", "service")
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

      const items = allVariants.map((v: any) => ({
        product_name: v.products?.product_name || "",
        brand: v.products?.brand || "",
        size: v.size || "",
        color: v.color || "",
        department: v.products?.style || "",
        category: v.products?.category || "",
        barcode: v.barcode || "",
        stock_qty: v.stock_qty || 0,
        opening_qty: v.opening_qty || 0,
        pur_price: v.pur_price || 0,
        sale_price: v.sale_price || 0,
      }));

      const headers = ["Sr No", "Product", "Brand", "Size", "Color", "Style", "Category", "Barcode", "Opening Qty", "Current Stock", "Pur Price", "Stock Value", "Sale Price", "Sale Value", "Status"];
      const data = items.map((item, index) => [
        index + 1,
        item.product_name,
        item.brand,
        item.size,
        item.color,
        item.department,
        item.category,
        item.barcode,
        item.opening_qty,
        item.stock_qty,
        item.pur_price,
        Math.round(item.pur_price * item.stock_qty),
        item.sale_price,
        Math.round(item.sale_price * item.stock_qty),
        item.stock_qty === 0 ? "Out of Stock" : item.stock_qty <= lowStockThreshold ? "Low Stock" : "In Stock",
      ]);

      // Grand Total row
      const totalOpeningQty = items.reduce((s, i) => s + i.opening_qty, 0);
      const totalCurrentStock = items.reduce((s, i) => s + i.stock_qty, 0);
      const totalStockVal = Math.round(items.reduce((s, i) => s + i.pur_price * i.stock_qty, 0));
      const totalSaleVal = Math.round(items.reduce((s, i) => s + i.sale_price * i.stock_qty, 0));

      data.push([
        "", "GRAND TOTAL", "", "", "", "", "", "",
        totalOpeningQty,
        totalCurrentStock,
        "",
        totalStockVal,
        "",
        totalSaleVal,
        `${items.length} variants`,
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      ws['!cols'] = [
        { wch: 6 }, { wch: 30 }, { wch: 15 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
        { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "All Stock");
      XLSX.writeFile(wb, `Full_Stock_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (error) {
      console.error("Error exporting full stock:", error);
    } finally {
      setExcelExporting(false);
    }
  };

  // Print All Stock as A4
  const printAllStock = () => {
    const orgName = currentOrganization?.name || "Stock Report";
    const dateStr = format(new Date(), "dd-MM-yyyy");
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = filteredStockItems.map((item, i) => `
      <tr style="${i % 2 === 0 ? '' : 'background:#f9f9f9;'}">
        <td style="text-align:center">${i + 1}</td>
        <td>${item.product_name}</td>
        <td>${item.brand}</td>
        <td>${item.size}</td>
        <td>${item.color || ''}</td>
        <td>${item.barcode}</td>
        <td style="text-align:right">${item.opening_qty}</td>
        <td style="text-align:right">${item.purchase_qty}</td>
        <td style="text-align:right">${item.purchase_return_qty}</td>
        <td style="text-align:right">${item.sales_qty}</td>
        <td style="text-align:right">${item.sale_return_qty}</td>
        <td style="text-align:right;font-weight:bold">${item.stock_qty}</td>
        <td style="text-align:right">${item.pur_price ? '₹' + item.pur_price : '-'}</td>
        <td style="text-align:right">${item.sale_price ? '₹' + item.sale_price : '-'}</td>
      </tr>`).join("");

    const totalRow = `
      <tr style="font-weight:bold;background:#eee;border-top:2px solid #333">
        <td colspan="6" style="text-align:center">TOTAL</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.opening_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.purchase_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.purchase_return_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.sales_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.sale_return_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.stock_qty, 0)}</td>
        <td style="text-align:right">₹${Math.round(filteredStockItems.reduce((s, i) => s + (i.pur_price || 0) * i.stock_qty, 0)).toLocaleString('en-IN')}</td>
        <td style="text-align:right">₹${Math.round(filteredStockItems.reduce((s, i) => s + i.sale_price * i.stock_qty, 0)).toLocaleString('en-IN')}</td>
      </tr>`;

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Stock Report</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; font-size: 9px; margin: 0; padding: 8px; }
        h2 { text-align: center; margin: 4px 0; font-size: 14px; }
        .sub { text-align: center; font-size: 10px; color: #666; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 3px 5px; }
        th { background: #f0f0f0; font-size: 8px; text-transform: uppercase; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
      <h2>${orgName} — Stock Report</h2>
      <div class="sub">Generated: ${dateStr} | Items: ${filteredStockItems.length} | Total Stock: ${totalStock.toLocaleString('en-IN')}</div>
      <table>
        <thead><tr>
          <th>Sr</th><th>Product</th><th>Brand</th><th>Size</th><th>Color</th><th>Barcode</th>
          <th>Open</th><th>Pur</th><th>P.Ret</th><th>Sales</th><th>S.Ret</th><th>Stock</th><th>Pur ₹</th><th>Sale ₹</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30 pb-24">
        <MobilePageHeader title="Stock Report" backTo="/" subtitle={`${globalTotals.variantCount} variants`} />

        <div className="px-4 pt-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, brand, barcode, color... (multi-word AND)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9 h-10 bg-card border-border/60 rounded-xl text-sm" />
            </div>
            <Button onClick={handleSearch} disabled={loading} size="sm" className="h-10 px-4 rounded-xl">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <MobileStatStrip stats={[
          { label: "Stock Value", value: `₹${(hasSearched ? totalStockValue : globalTotals.stockValue) >= 100000 ? ((hasSearched ? totalStockValue : globalTotals.stockValue)/100000).toFixed(1)+"L" : Math.round(hasSearched ? totalStockValue : globalTotals.stockValue).toLocaleString("en-IN")}`, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Qty", value: globalTotals.isLoading ? "…" : (hasSearched ? totalStock : globalTotals.totalStock).toLocaleString("en-IN"), color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Variants", value: globalTotals.isLoading ? "…" : (hasSearched ? `${filteredStockItems.length}` : `${globalTotals.variantCount}`), color: "text-purple-600", bg: "bg-purple-50" },
        ]} />

        <div className="flex-1 px-4 py-2 space-y-2">
          {!hasSearched ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">{searchTerm.length > 0 ? 'Tap Search to view results' : 'Search to view stock items'}</p>
              <p className="text-xs mt-1">Enter barcode, product name or brand</p>
              <Button onClick={handleSearch} className="mt-4" size="sm">
                <Search className="h-4 w-4 mr-2" /> {searchTerm.length > 0 ? 'Search' : 'Search All Stock'}
              </Button>
            </div>
          ) : loading ? (
            Array.from({length: 6}).map((_,i) => (
              <div key={i} className="h-16 bg-card rounded-2xl animate-pulse" />
            ))
          ) : filteredStockItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No stock items found</p>
            </div>
          ) : filteredStockItems.slice(0, 100).map((item) => (
            <div key={item.id} className="bg-card rounded-2xl p-3 border border-border/40 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{item.product_name}</p>
                  {item.brand && <p className="text-[11px] text-muted-foreground">{item.brand}</p>}
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {item.barcode && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{item.barcode}</span>}
                    {item.size && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{item.size}</span>}
                    {item.color && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{item.color}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className={cn("text-lg font-bold tabular-nums", item.stock_qty <= 0 ? "text-destructive" : item.stock_qty <= lowStockThreshold ? "text-amber-600" : "text-foreground")}>
                    {item.stock_qty}{item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' ? ` ${item.uom}` : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' ? item.uom : 'qty'}</p>
                  {item.pur_price && item.stock_qty > 0 && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      ₹{Math.round(item.pur_price * item.stock_qty).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-6 pb-24 lg:pb-6 space-y-6">
      <BackToDashboard />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stock Report</h1>
            <p className="text-sm text-muted-foreground">
              Search · filter · export — all stock, size-wise, and valuations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!hasSearched || filteredStockItems.length === 0}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (hasSearched && filteredStockItems.length > 0) {
              activeTab === "sizewise" ? exportSizeWiseToExcel() : exportAllStockToExcel();
            } else {
              exportFullStockToExcel();
            }
          }} disabled={excelExporting}>
            {excelExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
            {excelExporting ? "Exporting..." : "Excel"}
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <ProductSearchDropdown
            value={searchTerm}
            onChange={setSearchTerm}
            onSelect={(product) => {
              // Add as pinned product instead of just setting search term
              setPinnedProducts(prev => {
                if (prev.some(p => p.product_name === product.product_name)) return prev;
                return [...prev, { id: product.id, product_name: product.product_name, brand: product.brand, category: product.category || '', style: product.style || '' }];
              });
              setSearchTerm('');
              if (!hasSearched) handleSearch();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search name, brand, category, style or barcode..."
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading || (!hasActiveFilters && pinnedProducts.length === 0)} className="shadow-sm font-semibold px-6">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
            Search
          </Button>
          {(hasActiveFilters || pinnedProducts.length > 0) && (
            <Button variant="ghost" onClick={() => { clearFilters(); setPinnedProducts([]); }} className="h-11">
              Clear All
            </Button>
          )}
        </div>

        {/* Pinned product chips */}
        {pinnedProducts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pinnedProducts.map(p => (
              <div key={p.id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full border border-primary/20">
                <span className="font-medium">{p.product_name}</span>
                {p.brand && <span className="opacity-70">· {p.brand}</span>}
                {p.category && <span className="opacity-70">· {p.category}</span>}
                <button
                  onClick={() => setPinnedProducts(prev => prev.filter(x => x.id !== p.id))}
                  className="ml-1 opacity-60 hover:opacity-100 text-sm font-bold"
                >×</button>
              </div>
            ))}
            {pinnedProducts.length > 1 && (
              <button
                onClick={() => setPinnedProducts([])}
                className="text-xs text-muted-foreground hover:text-destructive px-2 py-1"
              >
                Clear pins
              </button>
            )}
          </div>
        )}

        {/* Always visible multi-field filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="space-y-2 relative">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product Name</label>
            <SearchableSelect
              value={productNameFilter || "all"}
              onValueChange={(val) => {
                const name = val === "all" ? "" : val;
                setProductNameFilter(name);
                // Reset dependent filters
                setBrandFilter("all");
                setCategoryFilter("all");
                setDepartmentFilter("all");
                setSizeFilter("all");
                setColorFilter("all");
                // Auto-select if only one value matches
                if (name) {
                  const matches = filterOptions.rawProducts.filter(p => p.product_name === name);
                  const brands = [...new Set(matches.map(p => p.brand).filter(Boolean))];
                  const cats = [...new Set(matches.map(p => p.category).filter(Boolean))];
                  const styles = [...new Set(matches.map(p => p.style).filter(Boolean))];
                  if (brands.length === 1) setBrandFilter(brands[0]);
                  if (cats.length === 1) setCategoryFilter(cats[0]);
                  if (styles.length === 1) setDepartmentFilter(styles[0]);
                }
              }}
              options={filterOptions.productNames}
              allLabel="All Products"
              placeholder="All Products"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand</label>
            <SearchableSelect value={brandFilter} onValueChange={setBrandFilter} options={derivedFilterOptions.brands} allLabel="All Brands" placeholder="All Brands" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fieldLabels.category}</label>
            <SearchableSelect value={categoryFilter} onValueChange={setCategoryFilter} options={derivedFilterOptions.categories} allLabel="All Categories" placeholder="All Categories" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fieldLabels.style}</label>
            <SearchableSelect value={departmentFilter} onValueChange={setDepartmentFilter} options={derivedFilterOptions.departments} allLabel={`All ${fieldLabels.style}`} placeholder={`All ${fieldLabels.style}`} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Size</label>
            <SearchableSelect value={sizeFilter} onValueChange={setSizeFilter} options={derivedFilterOptions.sizes} allLabel="All Sizes" placeholder="All Sizes" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fieldLabels.color}</label>
            <SearchableSelect value={colorFilter} onValueChange={setColorFilter} options={derivedFilterOptions.colors} allLabel="All Colors" placeholder="All Colors" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stock Status</label>
            <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
              <SelectTrigger className="h-10 !bg-white !text-gray-900">
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
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier</label>
                <SearchableSelect value={supplierFilter} onValueChange={setSupplierFilter} options={filterOptions.suppliers} allLabel="All Suppliers" placeholder="All Suppliers" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier Invoice</label>
                <SearchableSelect value={supplierInvoiceFilter} onValueChange={setSupplierInvoiceFilter} options={filterOptions.supplierInvoices} allLabel="All Invoices" placeholder="All Invoices" />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Summary Cards - Always visible */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-indigo-500 shadow-sm"
          onClick={() => hasSearched && setActiveTab("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {hasSearched ? "Filtered Stock" : "Total Stock"}
            </CardTitle>
            <div className="h-8 w-8 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Package className="h-4 w-4 text-indigo-600" />
            </div>
          </CardHeader>
          <CardContent>
            {globalTotals.isLoading && !hasSearched ? (
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            ) : (
              <>
                <div className="text-2xl font-bold text-indigo-600 tabular-nums">
                  {(hasSearched ? totalStock : globalTotals.totalStock).toLocaleString('en-IN')}
                </div>
                <p className="text-xs text-muted-foreground">
                  {hasSearched ? `${filteredStockItems.length} variants` : `${globalTotals.variantCount} variants`}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow border-l-4 border-l-amber-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock Value (Cost)</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <IndianRupee className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            {globalTotals.isLoading && !hasSearched ? (
              <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
            ) : (
              <>
                <div className="text-2xl font-bold text-amber-600 tabular-nums">
                  ₹{Math.round(hasSearched ? totalStockValue : globalTotals.stockValue).toLocaleString('en-IN')}
                </div>
                <p className="text-xs text-muted-foreground">Purchase price valuation</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sale Value</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <IndianRupee className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            {globalTotals.isLoading && !hasSearched ? (
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            ) : (
              <>
                <div className="text-2xl font-bold text-emerald-600 tabular-nums">
                  ₹{Math.round(hasSearched ? totalSaleValue : globalTotals.saleValue).toLocaleString('en-IN')}
                </div>
                <p className="text-xs text-muted-foreground">Sale price valuation</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {!hasSearched ? (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Search to View Detailed Stock Report</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Apply filters or enter a search term, then click Search to view detailed stock data.
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="h-10 bg-muted/60 p-1 rounded-xl">
              <TabsTrigger value="all" className="rounded-lg text-xs font-medium">All Stock</TabsTrigger>
              <TabsTrigger value="sizewise" className="rounded-lg text-xs font-medium gap-1">
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
                        Stock breakdown: Opening Qty + Purchase Qty - Pur Return - Sales Qty + Sale Return = Current Stock Qty
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-muted-foreground">
                        Showing {filteredStockItems.length > 0 ? ((currentPage - 1) * ITEMS_PER_PAGE) + 1 : 0} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredStockItems.length)} of {filteredStockItems.length} items
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={exportAllStockToExcel} disabled={filteredStockItems.length === 0}>
                          <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
                        </Button>
                        <Button variant="outline" size="sm" onClick={printAllStock} disabled={filteredStockItems.length === 0}>
                          <Printer className="h-4 w-4 mr-1" /> Print
                        </Button>
                      </div>
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
                          <TableHead>{fieldLabels.brand}</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>{fieldLabels.color}</TableHead>
                          <TableHead>{fieldLabels.style}</TableHead>
                          <TableHead>Barcode</TableHead>
                          <TableHead className="text-right bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-white">Opening Qty</TableHead>
                          <TableHead className="text-right bg-green-50 dark:bg-green-950 text-green-800 dark:text-white">Purchase Qty</TableHead>
                          <TableHead className="text-right bg-orange-50 dark:bg-orange-950 text-orange-800 dark:text-white">Pur Return</TableHead>
                          <TableHead className="text-right bg-red-50 dark:bg-red-950 text-red-800 dark:text-white">Sales Qty</TableHead>
                          <TableHead className="text-right bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-white">Sale Return</TableHead>
                          <TableHead className="text-right bg-primary/10 font-semibold text-primary dark:text-primary">Current Stock</TableHead>
                          <TableHead className="text-right">Pur Price</TableHead>
                          <TableHead className="text-right">Stock Value</TableHead>
                          <TableHead className="text-right">Sale Price</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedStockItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={19} className="text-center text-muted-foreground py-8">
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
                              <TableCell>{item.color || '—'}</TableCell>
                              <TableCell>{item.department || '—'}</TableCell>
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
                              <TableCell className="text-right bg-emerald-50 dark:bg-emerald-950 font-medium text-emerald-700 dark:text-emerald-400">
                                {item.sale_return_qty > 0 ? `+${item.sale_return_qty}` : '0'}
                              </TableCell>
                              <TableCell className="text-right bg-primary/10 font-bold text-primary">
                                {item.stock_qty}{item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' ? ` ${item.uom}` : ''}
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
                        {/* Totals Row */}
                        {filteredStockItems.length > 0 && (
                          <TableRow className="bg-muted/50 font-bold border-t-2">
                            <TableCell className="text-center" colSpan={9}>TOTAL</TableCell>
                            <TableCell className="text-right bg-blue-50 dark:bg-blue-950">
                              {filteredStockItems.reduce((s, i) => s + i.opening_qty, 0).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="text-right bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
                              +{filteredStockItems.reduce((s, i) => s + i.purchase_qty, 0).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="text-right bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400">
                              -{filteredStockItems.reduce((s, i) => s + i.purchase_return_qty, 0).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="text-right bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400">
                              -{filteredStockItems.reduce((s, i) => s + i.sales_qty, 0).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="text-right bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                              +{filteredStockItems.reduce((s, i) => s + i.sale_return_qty, 0).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="text-right bg-primary/10 text-primary">
                              {filteredStockItems.reduce((s, i) => s + i.stock_qty, 0).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="text-right">—</TableCell>
                            <TableCell className="text-right text-primary">
                              ₹{Math.round(filteredStockItems.reduce((s, i) => s + (i.pur_price || 0) * i.stock_qty, 0)).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="text-right">
                              ₹{Math.round(filteredStockItems.reduce((s, i) => s + i.sale_price * i.stock_qty, 0)).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell>—</TableCell>
                          </TableRow>
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
                <CardContent className="p-0 md:p-6">
                  <div className="px-4 md:px-0 pb-3 md:pb-4">
                    <div className="relative max-w-2xl">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search live: type product-category-brand-style-color-size (use - or space)"
                        value={sizeWiseSearch}
                        onChange={(e) => setSizeWiseSearch(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                    {sizeWiseSearch && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Showing {sizeWiseData.rows.length} matching products
                      </div>
                    )}
                  </div>
                  {sizeWiseData.rows.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No products found matching your filters</p>
                  ) : (
                    <>
                      {/* Mobile hint for horizontal scroll */}
                      <div className="md:hidden px-4 pb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <ChevronLeft className="h-3 w-3" />
                        <span>Swipe to see all sizes</span>
                        <ChevronRight className="h-3 w-3" />
                      </div>
                      <div className="overflow-x-auto scroll-smooth snap-x snap-mandatory md:snap-none scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                        <Table className="min-w-max">
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="font-semibold min-w-[180px] md:min-w-[250px] sticky left-0 bg-muted/95 z-10 backdrop-blur-sm">Product</TableHead>
                              {sizeWiseData.sizes.map((size, idx) => (
                                <TableHead 
                                  key={size} 
                                  className={`text-center font-semibold min-w-[50px] md:min-w-[60px] bg-primary/10 snap-start ${idx === 0 ? 'scroll-ml-[180px] md:scroll-ml-0' : ''}`}
                                >
                                  {size}
                                </TableHead>
                              ))}
                              <TableHead className="text-center font-bold min-w-[60px] md:min-w-[80px] bg-primary/20 text-primary sticky right-0 backdrop-blur-sm">
                                Stock
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sizeWiseData.rows.map((row, index) => (
                              <TableRow key={row.productKey} className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                                <TableCell className="font-medium sticky left-0 bg-inherit z-10 backdrop-blur-sm">
                                  <div className="flex flex-col">
                                    <span className="text-sm md:text-base truncate max-w-[160px] md:max-w-none font-bold">{row.productName}</span>
                                    {(row.brand || row.color) && (
                                      <span className="text-xs text-muted-foreground truncate max-w-[220px] md:max-w-none">
                                        <span className="font-semibold">Brand:</span> {row.brand || '-'}
                                        {row.color && <> · <span className="font-semibold">Color:</span> {row.color}</>}
                                      </span>
                                    )}
                                    {(row.category || row.department) && (
                                      <span className="text-xs text-muted-foreground/80 truncate max-w-[220px] md:max-w-none">
                                        {row.category && <><span className="font-semibold">Category:</span> {row.category}</>}
                                        {row.category && row.department && ' · '}
                                        {row.department && <><span className="font-semibold">Style:</span> {row.department}</>}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                {sizeWiseData.sizes.map(size => {
                                  const qty = row.sizeStocks[size] || 0;
                                  return (
                                    <TableCell 
                                      key={size} 
                                      className={`text-center text-sm md:text-base ${
                                        qty === 0 ? 'text-muted-foreground/50' : 
                                        'font-bold text-foreground bg-green-100 dark:bg-green-900/40'
                                      }`}
                                    >
                                      {qty}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-center font-bold text-primary bg-primary/10 sticky right-0 backdrop-blur-sm">
                                  {row.totalStock}
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* Total Row */}
                            <TableRow className="bg-destructive/10 font-bold border-t-2">
                              <TableCell className="text-destructive font-bold sticky left-0 bg-destructive/10 z-10 backdrop-blur-sm">Total Stock</TableCell>
                              {sizeWiseData.sizes.map(size => (
                                <TableCell key={size} className="text-center text-destructive font-bold text-sm md:text-base">
                                  {sizeWiseTotals.sizeTotals[size] || 0}
                                </TableCell>
                              ))}
                              <TableCell className="text-center font-bold text-destructive bg-destructive/20 sticky right-0 backdrop-blur-sm">
                                {sizeWiseTotals.grandTotal}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </>
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
