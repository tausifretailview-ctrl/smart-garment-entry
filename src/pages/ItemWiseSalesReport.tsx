import React, { useState, useMemo, useEffect, type ReactNode } from "react";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useProductFieldLabels } from "@/hooks/useSettings";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { CalendarIcon, Search, ArrowLeft, Printer, FileSpreadsheet, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { multiTokenMatch } from "@/utils/multiTokenSearch";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { parsePersistedDate, pickPersistedString, restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { ItemWiseClosingStockPanel } from "@/components/reports/ItemWiseClosingStockPanel";
import type { ItemWiseStockFilters } from "@/utils/itemWiseStockQueries";

type PeriodType = "daily" | "monthly" | "quarterly" | "yearly" | "all" | "custom";

interface SaleItemData {
  barcode: string | null;
  product_name: string;
  size: string;
  brand: string | null;
  category: string | null;
  color: string | null;
  customer_name: string | null;
  total_qty: number;
  stock_qty: number;
  total_amount: number;
}

interface FilterOptions {
  brands: string[];
  categories: string[];
  departments: string[];
  customers: string[];
  colors: string[];
  users: string[];
}

const SALES_TABLE_SCROLL = "item-wise-sales-table-scroll tab-scroll-stable min-w-0";
const SALES_VASY_HEAD_ROW = "border-none bg-slate-800 hover:bg-slate-800";
const SALES_VASY_TH = "h-10 text-xs font-bold uppercase tracking-wide text-white whitespace-nowrap";
const SALES_VASY_FOOTER = "sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-100 [&>tr]:border-0";
const SALES_BODY_ROW = "h-11 hover:bg-teal-50/80";
const SALES_PRODUCT_CELL =
  "py-2.5 px-4 align-middle text-sm font-semibold text-foreground bg-blue-50/40 dark:bg-blue-950/20 whitespace-nowrap";
const SALES_DETAIL_CELL = "py-2.5 px-4 align-middle text-sm text-foreground whitespace-nowrap";
const SALES_QTY_CELL = "py-2.5 px-4 align-middle text-sm font-semibold text-right tabular-nums text-foreground";
const SALES_AMOUNT_CELL = "py-2.5 px-4 align-middle text-sm font-bold text-right tabular-nums text-primary";

function highlightSearchText(text: string, query: string): ReactNode {
  const raw = text || "";
  const q = query.trim();
  if (!q || !raw) return raw || "—";

  const lower = raw.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return raw;

  return (
    <>
      {raw.slice(0, idx)}
      <mark className="bg-amber-300/90 text-foreground font-bold px-0.5 rounded-sm not-italic">
        {raw.slice(idx, idx + q.length)}
      </mark>
      {raw.slice(idx + q.length)}
    </>
  );
}

export default function ItemWiseSalesReport() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const fieldLabels = useProductFieldLabels();
  const [periodType, setPeriodType] = useState<PeriodType>("daily");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(),
    to: new Date(),
  });
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [selectedColor, setSelectedColor] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"itemwise" | "customerwise" | "brandwise" | "saledetails" | "closingstock">("itemwise");
  const [closingStockFilters, setClosingStockFilters] = useState<ItemWiseStockFilters>({
    groupBy: "product_name",
    searchQuery: "",
    brandFilter: "__all__",
    categoryFilter: "__all__",
    departmentFilter: "__all__",
    supplierFilter: "__all__",
    barcodeFilter: "",
    closingStockFilter: "all",
  });
  const [closingStockPage, setClosingStockPage] = useState(1);
  const [saleDetailsGroupBy, setSaleDetailsGroupBy] = useState<"product_name" | "brand" | "category" | "department" | "barcode">("product_name");
  const [saleDetailsSearch, setSaleDetailsSearch] = useState("");
  const [saleDetailsPage, setSaleDetailsPage] = useState(1);
  const SALE_DETAILS_PAGE_SIZE = 200;
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    brands: [],
    categories: [],
    departments: [],
    customers: [],
    colors: [],
    users: [],
  });

  // Tab-return stable: never refetch on focus/mount/reconnect; keep previous rows while any
  // background refetch is in flight so switching browser/ERP tabs never flashes a skeleton.
  const REPORT_CACHE = {
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false as const,
    refetchOnMount: false as const,
    refetchOnReconnect: false as const,
    placeholderData: keepPreviousData,
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [customerPage, setCustomerPage] = useState(1);
  const [brandPage, setBrandPage] = useState(1);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const ITEMS_PER_PAGE = 100;

  const itemWiseSalesFilterSnapshot = useMemo(
    () => ({
      periodType,
      selectedDate,
      customDateFrom: customDateRange.from,
      customDateTo: customDateRange.to,
      searchQuery,
      selectedBrand,
      selectedCategory,
      selectedDepartment,
      selectedCustomer,
      selectedColor,
      selectedUser,
      activeTab,
      saleDetailsGroupBy,
      saleDetailsSearch,
      currentPage,
      customerPage,
      brandPage,
      saleDetailsPage,
      closingStockFilters,
      closingStockPage,
    }),
    [
      periodType,
      selectedDate,
      customDateRange,
      searchQuery,
      selectedBrand,
      selectedCategory,
      selectedDepartment,
      selectedCustomer,
      selectedColor,
      selectedUser,
      activeTab,
      saleDetailsGroupBy,
      saleDetailsSearch,
      currentPage,
      customerPage,
      brandPage,
      saleDetailsPage,
      closingStockFilters,
      closingStockPage,
    ],
  );

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.itemWiseSales,
    currentOrganization?.id,
    itemWiseSalesFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["periodType", (v) => setPeriodType(v as PeriodType)],
          ["searchQuery", (v) => {
            setSearchQuery(v);
            setSearchInput(v);
          }],
          ["selectedBrand", setSelectedBrand],
          ["selectedCategory", setSelectedCategory],
          ["selectedDepartment", setSelectedDepartment],
          ["selectedColor", setSelectedColor],
          ["selectedUser", setSelectedUser],
          ["activeTab", (v) => setActiveTab(v as typeof activeTab)],
          ["saleDetailsGroupBy", (v) => setSaleDetailsGroupBy(v as typeof saleDetailsGroupBy)],
          ["saleDetailsSearch", setSaleDetailsSearch],
        ],
        entityIds: [["selectedCustomer", setSelectedCustomer]],
        requiredDates: [["selectedDate", setSelectedDate]],
        numbers: [
          ["currentPage", setCurrentPage],
          ["customerPage", setCustomerPage],
          ["brandPage", setBrandPage],
          ["saleDetailsPage", setSaleDetailsPage],
          ["closingStockPage", setClosingStockPage],
        ],
      });
      const cs = saved.closingStockFilters;
      if (cs && typeof cs === "object" && !Array.isArray(cs)) {
        const obj = cs as Record<string, unknown>;
        setClosingStockFilters((f) => ({
          ...f,
          groupBy: pickPersistedString(obj.groupBy) as ItemWiseStockFilters["groupBy"] ?? f.groupBy,
          searchQuery: pickPersistedString(obj.searchQuery) ?? f.searchQuery,
          brandFilter: pickPersistedString(obj.brandFilter) ?? f.brandFilter,
          categoryFilter: pickPersistedString(obj.categoryFilter) ?? f.categoryFilter,
          departmentFilter: pickPersistedString(obj.departmentFilter) ?? f.departmentFilter,
          supplierFilter: pickPersistedString(obj.supplierFilter) ?? f.supplierFilter,
          barcodeFilter: pickPersistedString(obj.barcodeFilter) ?? f.barcodeFilter,
          closingStockFilter:
            obj.closingStockFilter === "in_stock" || obj.closingStockFilter === "zero_stock"
              ? obj.closingStockFilter
              : f.closingStockFilter,
        }));
      }
      const from = parsePersistedDate(saved.customDateFrom);
      const to = parsePersistedDate(saved.customDateTo);
      if (from && to) setCustomDateRange({ from, to });
    },
  );

  // Fetch filter options with caching
  const { data: filterOptionsData } = useQuery({
    queryKey: ["item-wise-filter-options", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return { brands: [], categories: [], departments: [], customers: [], colors: [], users: [] };

      const [{ data: products }, { data: sales }, { data: variants }] = await Promise.all([
        supabase.from("products").select("brand, category, style").eq("organization_id", currentOrganization.id).is("deleted_at", null),
        supabase.from("sales").select("customer_name, salesman").eq("organization_id", currentOrganization.id).is("deleted_at", null),
        supabase.from("product_variants").select("color, product_id, products!inner(organization_id)").eq("organization_id", currentOrganization.id).eq("products.organization_id", currentOrganization.id).is("deleted_at", null),
      ]);

      return {
        brands: [...new Set((products || []).map(p => p.brand).filter(Boolean))].sort() as string[],
        categories: [...new Set((products || []).map(p => p.category).filter(Boolean))].sort() as string[],
        departments: [...new Set((products || []).map(p => p.style).filter(Boolean))].sort() as string[],
        customers: [...new Set((sales || []).map(s => s.customer_name).filter(Boolean))].sort() as string[],
        colors: [...new Set((variants || []).map((v: any) => v.color).filter(Boolean))].sort() as string[],
        users: [...new Set((sales || []).map((s: any) => s.salesman).filter(Boolean))].sort() as string[],
      };
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Sync filter options from query
  useEffect(() => {
    if (filterOptionsData) setFilterOptions(filterOptionsData);
  }, [filterOptionsData]);

  // Calculate date range based on period type
  const dateRange = useMemo(() => {
    const today = selectedDate;
    switch (periodType) {
      case "daily":
        return { from: startOfDay(today), to: endOfDay(today) };
      case "monthly":
        return { from: startOfMonth(today), to: endOfMonth(today) };
      case "quarterly":
        return { from: startOfQuarter(today), to: endOfQuarter(today) };
      case "yearly":
        // Financial year (April - March)
        const month = today.getMonth();
        const year = today.getFullYear();
        const fyStart = month >= 3 ? new Date(year, 3, 1) : new Date(year - 1, 3, 1);
        const fyEnd = month >= 3 ? new Date(year + 1, 2, 31) : new Date(year, 2, 31);
        return { from: fyStart, to: fyEnd };
      case "all":
        return { from: new Date(2000, 0, 1), to: endOfDay(new Date()) };
      case "custom":
        return { from: startOfDay(customDateRange.from), to: endOfDay(customDateRange.to) };
      default:
        return { from: startOfDay(today), to: endOfDay(today) };
    }
  }, [periodType, selectedDate, customDateRange]);

  // Fetch sale items with product details
  const { data: saleItems = [], isLoading, isError } = useQuery({
    queryKey: ["item-wise-sales", currentOrganization?.id, dateRange.from, dateRange.to, selectedCustomer, selectedUser],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      // Paginated fetch of sales to bypass 1000-row limit
      const allSales: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let salesQuery = supabase
          .from("sales")
          .select("id, customer_name, salesman")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .gte("sale_date", dateRange.from.toISOString())
          .lte("sale_date", dateRange.to.toISOString())
          .order("sale_date", { ascending: false })
          .order("id")
          .range(offset, offset + pageSize - 1);

        if (selectedCustomer !== "all") {
          salesQuery = salesQuery.eq("customer_name", selectedCustomer);
        }
        if (selectedUser !== "all") {
          salesQuery = salesQuery.eq("salesman", selectedUser);
        }

        const { data: salesData, error: salesError } = await salesQuery;
        if (salesError) throw salesError;

        if (salesData && salesData.length > 0) {
          allSales.push(...salesData);
          offset += pageSize;
          if (salesData.length < pageSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      if (allSales.length === 0) return [];
      

      const saleIds = allSales.map((s) => s.id);
      const salesMap = new Map(allSales.map(s => [s.id, s.customer_name]));

      // Use paginated fetch to bypass 1000 row limit
      const saleItemsData = await fetchAllSaleItems(saleIds);
      if (!saleItemsData || saleItemsData.length === 0) return [];

      // Get unique product IDs and fetch product details - use batched fetch to bypass 1000 limit
      const productIds = [...new Set(saleItemsData.map(item => item.product_id).filter(Boolean))];
      
      let productsMap: Record<string, { brand: string | null; category: string | null; color: string | null; style: string | null }> = {};
      
      if (productIds.length > 0) {
        const { fetchProductsByIds } = await import("@/utils/fetchAllRows");
        const productsData = await fetchProductsByIds(productIds, "id, brand, category, color, style");
        
        if (productsData) {
          productsMap = productsData.reduce((acc: any, p: any) => {
            acc[p.id] = { brand: p.brand, category: p.category, color: p.color, style: p.style };
            return acc;
          }, {} as Record<string, { brand: string | null; category: string | null; color: string | null; style: string | null }>);
        }
      }

      // Fetch variant stock quantities
      const variantIds = [...new Set(saleItemsData.map(item => item.variant_id).filter(Boolean))];
      let variantStockMap: Record<string, number> = {};
      if (variantIds.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < variantIds.length; i += batchSize) {
          const batch = variantIds.slice(i, i + batchSize);
          const { data: variants } = await supabase
            .from("product_variants")
            .select("id, stock_qty")
            .in("id", batch);
          if (variants) {
            variants.forEach((v: any) => { variantStockMap[v.id] = v.stock_qty || 0; });
          }
        }
      }

      // Merge product details, customer name, and stock into sale items
      return saleItemsData.map(item => ({
        ...item,
        customer_name: salesMap.get(item.sale_id) || null,
        products: item.product_id ? productsMap[item.product_id] || null : null,
        stock_qty: item.variant_id ? (variantStockMap[item.variant_id] || 0) : 0,
      }));
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Aggregate data by product
  const aggregatedData: SaleItemData[] = useMemo(() => {
    const productMap = new Map<string, SaleItemData & { _variantStocks: Map<string, number> }>();

    saleItems.forEach((item: any) => {
      const key = `${item.barcode || ""}-${item.product_name}-${item.size}`;
      const existing = productMap.get(key);

      if (existing) {
        existing.total_qty += item.quantity;
        existing.total_amount += Number(item.line_total);
        if (item.variant_id) existing._variantStocks.set(item.variant_id, item.stock_qty || 0);
      } else {
        const variantStocks = new Map<string, number>();
        if (item.variant_id) variantStocks.set(item.variant_id, item.stock_qty || 0);
        productMap.set(key, {
          barcode: item.barcode,
          product_name: item.product_name,
          size: item.size,
          brand: item.products?.brand || null,
          category: item.products?.category || null,
          color: item.products?.color || null,
          customer_name: item.customer_name || null,
          total_qty: item.quantity,
          stock_qty: 0,
          total_amount: Number(item.line_total),
          _variantStocks: variantStocks,
        });
      }
    });

    // Sum unique variant stocks per aggregated row
    return Array.from(productMap.values()).map(({ _variantStocks, ...rest }) => {
      let totalStock = 0;
      _variantStocks.forEach(v => totalStock += v);
      return { ...rest, stock_qty: totalStock };
    }).sort((a, b) => b.total_amount - a.total_amount);
  }, [saleItems]);

  // Filter data based on search and dropdown filters
  const filteredData = useMemo(() => {
    let data = aggregatedData;

    // Apply dropdown filters
    if (selectedBrand !== "all") {
      data = data.filter(item => item.brand === selectedBrand);
    }
    if (selectedCategory !== "all") {
      data = data.filter(item => item.category === selectedCategory);
    }
    if (selectedDepartment !== "all") {
      // Department maps to style/color in this context
      data = data.filter(item => item.color === selectedDepartment);
    }
    if (selectedColor !== "all") {
      data = data.filter(item => item.color === selectedColor);
    }

    // Apply search query — multi-token AND logic
    if (searchQuery.trim()) {
      data = data.filter(item =>
        multiTokenMatch(searchQuery, item.product_name, item.barcode, item.brand, item.category, item.color, item.size)
      );
    }

    return data;
  }, [aggregatedData, searchQuery, selectedBrand, selectedCategory, selectedDepartment, selectedColor]);

  const itemWiseTotals = useMemo(() => ({
    total_qty: filteredData.reduce((s, r) => s + r.total_qty, 0),
    stock_qty: filteredData.reduce((s, r) => s + r.stock_qty, 0),
    total_amount: filteredData.reduce((s, r) => s + r.total_amount, 0),
  }), [filteredData]);

  // Brand-wise data: aggregate saleItems by customer_name + brand
  const brandWiseData = useMemo(() => {
    const groups = new Map<string, { customer_name: string; brand: string; total_qty: number; total_amount: number }>();

    saleItems.forEach((item: any) => {
      const customerName = item.customer_name || "Walk-in";
      const brand = item.products?.brand || "Unbranded";

      // Apply same client-side filters
      if (selectedBrand !== "all" && brand !== selectedBrand) return;
      if (selectedCategory !== "all" && item.products?.category !== selectedCategory) return;
      if (selectedDepartment !== "all" && item.products?.color !== selectedDepartment) return;
      if (selectedColor !== "all" && item.products?.color !== selectedColor) return;
      if (searchQuery.trim()) {
        if (!multiTokenMatch(searchQuery, item.product_name, item.barcode, brand, item.products?.category, item.products?.color)) return;
      }

      const key = `${customerName}|||${brand}`;
      const existing = groups.get(key);
      if (existing) {
        existing.total_qty += item.quantity;
        existing.total_amount += Number(item.line_total);
      } else {
        groups.set(key, { customer_name: customerName, brand, total_qty: item.quantity, total_amount: Number(item.line_total) });
      }
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.customer_name.localeCompare(b.customer_name) || a.brand.localeCompare(b.brand)
    );
  }, [saleItems, selectedBrand, selectedCategory, selectedDepartment, selectedColor, searchQuery]);

  // Customer-wise aggregation with product breakdown
  const customerWiseData = useMemo(() => {
    const groups = new Map<string, { customer_name: string; total_qty: number; total_amount: number; item_count: number; products: Map<string, { product_name: string; qty: number; amount: number }> }>();
    saleItems.forEach((item: any) => {
      const customerName = item.customer_name || "Walk-in Customer";
      if (selectedBrand !== "all" && item.products?.brand !== selectedBrand) return;
      if (selectedCategory !== "all" && item.products?.category !== selectedCategory) return;
      if (selectedDepartment !== "all" && item.products?.color !== selectedDepartment) return;
      if (selectedColor !== "all" && item.products?.color !== selectedColor) return;
      if (searchQuery.trim()) {
        if (!multiTokenMatch(searchQuery, item.product_name, item.barcode, item.products?.brand, item.products?.category, item.products?.color)) return;
      }
      const existing = groups.get(customerName);
      const productName = item.product_name || "Unknown";
      if (existing) {
        existing.total_qty += item.quantity;
        existing.total_amount += Number(item.line_total);
        existing.item_count += 1;
        const ep = existing.products.get(productName);
        if (ep) { ep.qty += item.quantity; ep.amount += Number(item.line_total); }
        else { existing.products.set(productName, { product_name: productName, qty: item.quantity, amount: Number(item.line_total) }); }
      } else {
        const products = new Map<string, { product_name: string; qty: number; amount: number }>();
        products.set(productName, { product_name: productName, qty: item.quantity, amount: Number(item.line_total) });
        groups.set(customerName, { customer_name: customerName, total_qty: item.quantity, total_amount: Number(item.line_total), item_count: 1, products });
      }
    });
    return Array.from(groups.values())
      .map(g => ({ ...g, productList: Array.from(g.products.values()).sort((a, b) => b.qty - a.qty) }))
      .sort((a, b) => b.total_amount - a.total_amount);
  }, [saleItems, selectedBrand, selectedCategory, selectedDepartment, selectedColor, searchQuery]);

  // Summary via RPC (single JSON instead of client-side aggregation)
  const { data: rpcSummary } = useQuery({
    queryKey: ["item-sales-summary-rpc", currentOrganization?.id, dateRange.from, dateRange.to, selectedCustomer],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const params: any = {
        p_organization_id: currentOrganization.id,
        p_start_date: dateRange.from.toISOString(),
        p_end_date: dateRange.to.toISOString(),
      };
      if (selectedCustomer !== "all") params.p_customer_name = selectedCustomer;
      const { data, error } = await supabase.rpc("get_item_sales_summary", params);
      if (error) throw error;
      return data as any;
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Sale Details: aggregate by selected group
  const saleDetailsData = useMemo(() => {
    const groups = new Map<string, { key: string; total_qty: number; purchase_value: number; sale_value: number; product_name?: string; brand?: string; size?: string; color?: string; category?: string }>();

    saleItems.forEach((item: any) => {
      // Apply same client-side filters
      if (selectedBrand !== "all" && item.products?.brand !== selectedBrand) return;
      if (selectedCategory !== "all" && item.products?.category !== selectedCategory) return;
      if (selectedDepartment !== "all" && item.products?.color !== selectedDepartment) return;
      if (selectedColor !== "all" && item.products?.color !== selectedColor) return;

      let groupKey = "";
      switch (saleDetailsGroupBy) {
        case "product_name": groupKey = item.product_name || "Unknown"; break;
        case "brand": groupKey = item.products?.brand || "Unbranded"; break;
        case "category": groupKey = item.products?.category || "Uncategorized"; break;
        case "department": groupKey = item.products?.style || "No Department"; break;
        case "barcode": groupKey = item.barcode || "(No Barcode)"; break;
      }

      const existing = groups.get(groupKey);
      const qty = item.quantity || 0;
      const saleVal = Number(item.line_total) || 0;
      const purchaseVal = Number(item.purchase_price || 0) * qty;

      if (existing) {
        existing.total_qty += qty;
        existing.sale_value += saleVal;
        existing.purchase_value += purchaseVal;
      } else {
        groups.set(groupKey, {
          key: groupKey,
          total_qty: qty,
          purchase_value: purchaseVal,
          sale_value: saleVal,
          product_name: item.product_name || "",
          brand: item.products?.brand || "",
          size: item.size || "",
          color: item.products?.color || "",
          category: item.products?.category || "",
        });
      }
    });

    let result = Array.from(groups.values()).sort((a, b) => b.sale_value - a.sale_value);

    // Apply search
    if (saleDetailsSearch.trim()) {
      const q = saleDetailsSearch.toLowerCase();
      result = result.filter(r =>
        r.key.toLowerCase().includes(q) ||
        (r.product_name || "").toLowerCase().includes(q) ||
        (r.brand || "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [saleItems, saleDetailsGroupBy, selectedBrand, selectedCategory, selectedDepartment, selectedColor, saleDetailsSearch]);

  const saleDetailsTotals = useMemo(() => ({
    total_qty: saleDetailsData.reduce((s, r) => s + r.total_qty, 0),
    purchase_value: saleDetailsData.reduce((s, r) => s + r.purchase_value, 0),
    sale_value: saleDetailsData.reduce((s, r) => s + r.sale_value, 0),
  }), [saleDetailsData]);


  const hasClientFilters = selectedBrand !== "all" || selectedCategory !== "all" || selectedDepartment !== "all" || selectedColor !== "all" || searchQuery.trim() !== "";

  const summary = useMemo(() => {
    if (hasClientFilters) {
      const totalQty = filteredData.reduce((sum, item) => sum + item.total_qty, 0);
      const totalAmount = filteredData.reduce((sum, item) => sum + item.total_amount, 0);
      const uniqueProducts = filteredData.length;
      const avgPrice = totalQty > 0 ? totalAmount / totalQty : 0;
      return { totalQty, totalAmount, uniqueProducts, avgPrice };
    }
    return {
      totalQty: rpcSummary?.total_qty ?? 0,
      totalAmount: rpcSummary?.total_amount ?? 0,
      uniqueProducts: rpcSummary?.unique_products ?? 0,
      avgPrice: rpcSummary?.avg_price ?? 0,
    };
  }, [rpcSummary, filteredData, hasClientFilters]);

  // Export to Excel
  const exportToExcel = () => {
    if (activeTab === "customerwise") {
      const exportRows: any[] = [];
      customerWiseData.forEach((row, i) => {
        exportRows.push({ "Sr No": i + 1, "Customer Name": row.customer_name, "Product Name": "", "Items": row.item_count, "Total Qty": row.total_qty, "Total Value": Math.round(row.total_amount), "Avg Item Value": row.total_qty > 0 ? Math.round(row.total_amount / row.total_qty) : 0 });
        row.productList.forEach((p, pi) => {
          exportRows.push({ "Sr No": "", "Customer Name": "", "Product Name": p.product_name, "Items": "", "Total Qty": p.qty, "Total Value": Math.round(p.amount), "Avg Item Value": "" });
        });
      });
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customer-wise Sales");
      XLSX.writeFile(wb, `customer-wise-sales-${format(dateRange.from, "yyyy-MM-dd")}.xlsx`);
    } else if (activeTab === "saledetails") {
      const groupLabel = { product_name: "Product Name", brand: "Brand", category: "Category", department: "Department", barcode: "Barcode" }[saleDetailsGroupBy];
      const exportData = saleDetailsData.map((item, i) => {
        const base: any = {
          "Sr No": i + 1,
          [groupLabel]: item.key,
        };
        if (saleDetailsGroupBy === "barcode") {
          base["Product Name"] = item.product_name || "";
          base["Brand"] = item.brand || "";
          base["Category"] = item.category || "";
          base["Color"] = item.color || "";
          base["Size"] = item.size || "";
        }
        base["Total Qty"] = item.total_qty;
        base["Purchase Value"] = item.purchase_value.toFixed(2);
        base["Sale Value"] = item.sale_value.toFixed(2);
        return base;
      });
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sale Details");
      XLSX.writeFile(wb, `sale-details-${saleDetailsGroupBy}-${format(dateRange.from, "yyyy-MM-dd")}.xlsx`);
    } else if (activeTab === "brandwise") {
      const exportData = brandWiseData.map((item) => ({
        "Customer Name": item.customer_name,
        Brand: item.brand,
        "Total Qty": item.total_qty,
        "Total Amount": item.total_amount.toFixed(2),
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Brand-wise Sales");
      XLSX.writeFile(wb, `brand-wise-sales-${format(dateRange.from, "yyyy-MM-dd")}.xlsx`);
    } else {
      const exportData = filteredData.map((item) => ({
        Barcode: item.barcode || "-",
        "Product Name": item.product_name,
        Brand: item.brand || "-",
        Category: item.category || "-",
        Color: item.color || "-",
        Size: item.size,
        "Qty Sold": item.total_qty,
        "Stock Qty": item.stock_qty,
        "Total Amount": item.total_amount.toFixed(2),
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Item-wise Sales");
      XLSX.writeFile(wb, `item-wise-sales-${format(dateRange.from, "yyyy-MM-dd")}.xlsx`);
    }
  };

  // Print report
  const handlePrint = () => {
    window.print();
  };

  const handleSearch = () => {
    setSearchQuery(searchInput.trim());
    setCurrentPage(1);
    setCustomerPage(1);
    setBrandPage(1);
    setSaleDetailsPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setCurrentPage(1);
    setCustomerPage(1);
    setBrandPage(1);
    setSaleDetailsPage(1);
  };

  const salesKpiItems = useMemo(
    () => [
      { label: "Total Qty Sold", value: summary.totalQty.toLocaleString("en-IN"), gradient: "bg-gradient-to-br from-blue-500 to-blue-600" },
      { label: "Total Sales", value: `₹${summary.totalAmount.toLocaleString("en-IN")}`, gradient: "bg-gradient-to-br from-emerald-500 to-emerald-600" },
      { label: "Unique Products", value: summary.uniqueProducts.toLocaleString("en-IN"), gradient: "bg-gradient-to-br from-violet-500 to-violet-600" },
      { label: "Avg Sale Price", value: `₹${summary.avgPrice.toFixed(2)}`, gradient: "bg-gradient-to-br from-amber-500 to-amber-600" },
    ],
    [summary],
  );

  return (
    <div className="item-wise-sales-workspace item-wise-sales-report flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3 print:min-h-screen print:h-auto print:overflow-visible print:bg-white print:p-4">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
      <div className="print:hidden shrink-0 flex flex-wrap items-center justify-between gap-2 [&_button]:mb-0">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 px-3 text-sm"
            onClick={() => orgNavigate("/reports")}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Reports
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-none tracking-tight text-blue-700">Item-wise Sales Report</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {format(dateRange.from, "dd MMM yyyy")} – {format(dateRange.to, "dd MMM yyyy")}
              {searchQuery && (
                <span className="ml-2 font-semibold text-amber-700 dark:text-amber-400">
                  · {filteredData.length.toLocaleString("en-IN")} of {aggregatedData.length.toLocaleString("en-IN")} items
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm border-slate-300" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm border-slate-300" onClick={exportToExcel}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0 print:hidden">
        {salesKpiItems.map((item) => (
          <div key={item.label} className={cn("rounded-lg px-3 py-2 min-w-0 shadow-sm", item.gradient)}>
            <p className="text-xs font-medium text-white/80 leading-none truncate">{item.label}</p>
            <p className="mt-1 text-base font-black text-white tabular-nums leading-tight truncate sm:text-lg">{item.value}</p>
          </div>
        ))}
      </div>

      <Card className="rounded-lg border border-slate-200 shadow-sm shrink-0 print:hidden">
        <CardContent className="p-2 space-y-1.5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period</label>
                <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                  <SelectTrigger className="h-10 text-sm border-slate-200 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Today</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly (FY)</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {periodType !== "custom" && periodType !== "all" && (
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-10 w-full justify-start text-left font-normal text-sm px-2 border-slate-200 bg-slate-50">
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{format(selectedDate, "dd MMM yyyy")}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={selectedDate} onSelect={(date) => date && setSelectedDate(date)} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {periodType === "custom" && (
                <>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-10 w-full justify-start text-left font-normal text-sm px-2 border-slate-200 bg-slate-50">
                          <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{format(customDateRange.from, "dd MMM yyyy")}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={customDateRange.from} onSelect={(date) => date && setCustomDateRange((prev) => ({ ...prev, from: date }))} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-10 w-full justify-start text-left font-normal text-sm px-2 border-slate-200 bg-slate-50">
                          <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{format(customDateRange.to, "dd MMM yyyy")}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={customDateRange.to} onSelect={(date) => date && setCustomDateRange((prev) => ({ ...prev, to: date }))} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}

              <div className={cn("space-y-1", periodType === "custom" ? "md:col-span-4" : periodType === "all" ? "md:col-span-8" : "md:col-span-6")}>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Name, brand, barcode, color… (multi-word AND)"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                      className="h-10 pl-10 pr-9 text-sm no-uppercase border-slate-200 bg-slate-50 focus:bg-white"
                    />
                    {searchInput && (
                      <button type="button" onClick={handleClearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  <Button onClick={handleSearch} className="h-10 px-4 text-sm font-semibold bg-blue-600 hover:bg-blue-700 shrink-0 gap-1.5">
                    <Search className="h-4 w-4" />
                    Search
                  </Button>
                </div>
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 invisible md:visible">Filters</label>
                <Button
                  variant={showFilters ? "secondary" : "outline"}
                  onClick={() => setShowFilters(!showFilters)}
                  className="h-10 w-full text-sm border-slate-200"
                >
                  <Filter className="h-4 w-4 mr-1.5" />
                  Filters
                </Button>
              </div>
            </div>

            {showFilters && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 pt-1.5 border-t border-slate-100">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fieldLabels.brand}</label>
                  <SearchableSelect value={selectedBrand} onValueChange={setSelectedBrand} options={filterOptions.brands} placeholder={`All ${fieldLabels.brand}`} allLabel={`All ${fieldLabels.brand}`} allValue="all" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fieldLabels.category}</label>
                  <SearchableSelect value={selectedCategory} onValueChange={setSelectedCategory} options={filterOptions.categories} placeholder={`All ${fieldLabels.category}`} allLabel={`All ${fieldLabels.category}`} allValue="all" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fieldLabels.style}</label>
                  <SearchableSelect value={selectedDepartment} onValueChange={setSelectedDepartment} options={filterOptions.departments} placeholder={`All ${fieldLabels.style}`} allLabel={`All ${fieldLabels.style}`} allValue="all" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fieldLabels.color}</label>
                  <SearchableSelect value={selectedColor} onValueChange={setSelectedColor} options={filterOptions.colors} placeholder={`All ${fieldLabels.color}`} allLabel={`All ${fieldLabels.color}`} allValue="all" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</label>
                  <SearchableSelect value={selectedCustomer} onValueChange={setSelectedCustomer} options={filterOptions.customers} placeholder="All Customers" allLabel="All Customers" allValue="all" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">User</label>
                  <SearchableSelect value={selectedUser} onValueChange={setSelectedUser} options={filterOptions.users} placeholder="All Users" allLabel="All Users" allValue="all" />
                </div>
              </div>
            )}

            {(selectedBrand !== "all" || selectedCategory !== "all" || selectedDepartment !== "all" || selectedColor !== "all" || selectedCustomer !== "all" || selectedUser !== "all") && (
              <p className="text-sm text-primary font-medium">Filters applied</p>
            )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "itemwise" | "customerwise" | "brandwise" | "saledetails" | "closingstock")} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-9 bg-slate-100 p-1 rounded-md shrink-0 w-fit print:hidden">
          <TabsTrigger value="itemwise" className="rounded text-sm font-semibold px-3 data-[state=active]:bg-white data-[state=active]:text-blue-700">Item-wise</TabsTrigger>
          <TabsTrigger value="customerwise" className="rounded text-sm font-semibold px-3 data-[state=active]:bg-white data-[state=active]:text-blue-700">Customer-wise</TabsTrigger>
          <TabsTrigger value="brandwise" className="rounded text-sm font-semibold px-3 data-[state=active]:bg-white data-[state=active]:text-blue-700">Brand-wise</TabsTrigger>
          <TabsTrigger value="saledetails" className="rounded text-sm font-semibold px-3 data-[state=active]:bg-white data-[state=active]:text-blue-700">Sale Details</TabsTrigger>
          <TabsTrigger value="closingstock" className="rounded text-sm font-semibold px-3 data-[state=active]:bg-white data-[state=active]:text-teal-700">Closing Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="itemwise" className="mt-2 flex-1 min-h-0 flex flex-col focus-visible:outline-none data-[state=inactive]:hidden">
          <Card className="rounded-lg border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden print:border-0 print:shadow-none">
            <CardHeader className="py-2 px-3 shrink-0 border-b border-slate-100 bg-white">
              <CardTitle className="text-sm font-semibold text-slate-700">Item-wise Details ({filteredData.length.toLocaleString("en-IN")} items)</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
              <div className={SALES_TABLE_SCROLL}>
                <Table className="w-full min-w-max [&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className={SALES_VASY_HEAD_ROW}>
                      <TableHead className={cn("w-[110px]", SALES_VASY_TH)}>Barcode</TableHead>
                      <TableHead className={cn("min-w-[180px]", SALES_VASY_TH)}>Product Name</TableHead>
                      <TableHead className={cn("w-[100px]", SALES_VASY_TH)}>{fieldLabels.brand}</TableHead>
                      <TableHead className={cn("w-[100px]", SALES_VASY_TH)}>{fieldLabels.category}</TableHead>
                      <TableHead className={cn("w-[90px]", SALES_VASY_TH)}>{fieldLabels.color}</TableHead>
                      <TableHead className={cn("w-[70px] text-center", SALES_VASY_TH)}>Size</TableHead>
                      <TableHead className={cn("w-[90px] text-right", SALES_VASY_TH)}>Qty Sold</TableHead>
                      <TableHead className={cn("w-[90px] text-right", SALES_VASY_TH)}>Stock Qty</TableHead>
                      <TableHead className={cn("w-[120px] text-right", SALES_VASY_TH)}>Total Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-4 text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">No sales data found for the selected period</TableCell>
                      </TableRow>
                    ) : (() => {
                      const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
                      const paginatedData = filteredData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
                      const rowMatches = (item: SaleItemData) =>
                        searchQuery.trim() && multiTokenMatch(searchQuery, item.product_name, item.barcode, item.brand, item.category, item.color, item.size);
                      return paginatedData.map((item, idx) => (
                            <TableRow
                              key={idx}
                              className={cn(
                                SALES_BODY_ROW,
                                rowMatches(item) && "bg-amber-50/80 dark:bg-amber-950/25 ring-1 ring-inset ring-amber-300/50",
                              )}
                            >
                              <TableCell className="font-mono text-sm">{highlightSearchText(item.barcode || "-", searchQuery)}</TableCell>
                              <TableCell className={SALES_PRODUCT_CELL}>{highlightSearchText(item.product_name, searchQuery)}</TableCell>
                              <TableCell className={SALES_DETAIL_CELL}>{highlightSearchText(item.brand || "-", searchQuery)}</TableCell>
                              <TableCell className={SALES_DETAIL_CELL}>{highlightSearchText(item.category || "-", searchQuery)}</TableCell>
                              <TableCell className={SALES_DETAIL_CELL}>{highlightSearchText(item.color || "-", searchQuery)}</TableCell>
                              <TableCell className={cn(SALES_DETAIL_CELL, "text-center")}>{highlightSearchText(item.size, searchQuery)}</TableCell>
                              <TableCell className={SALES_QTY_CELL}>{item.total_qty.toLocaleString("en-IN")}</TableCell>
                              <TableCell className={SALES_QTY_CELL}>{item.stock_qty.toLocaleString("en-IN")}</TableCell>
                              <TableCell className={SALES_AMOUNT_CELL}>₹{item.total_amount.toLocaleString("en-IN")}</TableCell>
                            </TableRow>
                          ));
                    })()}
                  </TableBody>
                  {filteredData.length > 0 && (
                    <TableFooter className={SALES_VASY_FOOTER}>
                      <TableRow className="hover:bg-slate-100">
                        <TableCell colSpan={6} className="py-3 text-sm font-bold text-teal-700">Grand Total</TableCell>
                        <TableCell className={cn(SALES_QTY_CELL, "py-3 text-base font-bold")}>{itemWiseTotals.total_qty.toLocaleString()}</TableCell>
                        <TableCell className={cn(SALES_QTY_CELL, "py-3 text-base font-bold")}>{itemWiseTotals.stock_qty.toLocaleString()}</TableCell>
                        <TableCell className={cn(SALES_AMOUNT_CELL, "py-3 text-base font-bold")}>₹{itemWiseTotals.total_amount.toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
              {filteredData.length > ITEMS_PER_PAGE && (() => {
                const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
                const pageStart = (currentPage - 1) * ITEMS_PER_PAGE + 1;
                const pageEnd = Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length);
                return (
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2 print:hidden">
                    <p className="text-sm tabular-nums text-slate-600">
                      Showing {pageStart.toLocaleString("en-IN")}–{pageEnd.toLocaleString("en-IN")} of {filteredData.length.toLocaleString("en-IN")}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-9 text-sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                      <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
                      <Button variant="outline" size="sm" className="h-9 text-sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customerwise" className="mt-2 flex-1 min-h-0 flex flex-col focus-visible:outline-none data-[state=inactive]:hidden">
          <Card className="rounded-lg border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
            <CardHeader className="py-2 px-3 shrink-0 border-b border-slate-100 bg-white">
              <CardTitle className="text-sm font-semibold text-slate-700">Customer-wise Sale ({customerWiseData.length.toLocaleString("en-IN")} customers)</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
              <div className={SALES_TABLE_SCROLL}>
                <Table className="w-full min-w-max [&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                     <TableRow className={SALES_VASY_HEAD_ROW}>
                      <TableHead className={cn("w-14", SALES_VASY_TH)}>#</TableHead>
                      <TableHead className={SALES_VASY_TH}>Customer Name</TableHead>
                      <TableHead className={cn("w-[90px] text-center", SALES_VASY_TH)}>Items</TableHead>
                      <TableHead className={cn("w-[110px] text-right", SALES_VASY_TH)}>Total Qty</TableHead>
                      <TableHead className={cn("w-[130px] text-right", SALES_VASY_TH)}>Total Value (₹)</TableHead>
                      <TableHead className={cn("w-[130px] text-right", SALES_VASY_TH)}>Avg Item Value (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const totalPages = Math.ceil(customerWiseData.length / ITEMS_PER_PAGE);
                      const pageData = customerWiseData.slice((customerPage - 1) * ITEMS_PER_PAGE, customerPage * ITEMS_PER_PAGE);
                      return (
                        <>
                          {pageData.map((row, index) => {
                            const globalIdx = (customerPage - 1) * ITEMS_PER_PAGE + index;
                            return (
                              <React.Fragment key={row.customer_name}>
                                <TableRow
                                  className={cn(SALES_BODY_ROW, "cursor-pointer", globalIdx % 2 === 0 ? "" : "bg-muted/20")}
                                  onClick={() => setExpandedCustomer(expandedCustomer === row.customer_name ? null : row.customer_name)}
                                >
                                  <TableCell className="font-mono text-sm text-muted-foreground">{globalIdx + 1}</TableCell>
                                  <TableCell className="text-sm font-semibold text-primary">
                                    <span className="mr-1 text-xs">{expandedCustomer === row.customer_name ? "▼" : "▶"}</span>
                                    {row.customer_name}
                                  </TableCell>
                                  <TableCell className="text-center text-sm font-semibold">{row.item_count}</TableCell>
                                  <TableCell className={SALES_QTY_CELL}>{row.total_qty.toLocaleString("en-IN")}</TableCell>
                                  <TableCell className={SALES_AMOUNT_CELL}>₹{Math.round(row.total_amount).toLocaleString("en-IN")}</TableCell>
                                  <TableCell className="text-right text-sm font-semibold tabular-nums text-muted-foreground">₹{row.total_qty > 0 ? Math.round(row.total_amount / row.total_qty).toLocaleString("en-IN") : 0}</TableCell>
                                </TableRow>
                                {expandedCustomer === row.customer_name && (
                                  <TableRow>
                                    <TableCell colSpan={6} className="p-0">
                                      <div className="bg-muted/20 border-y">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className={SALES_VASY_HEAD_ROW}>
                                              <TableHead className={cn("w-14 pl-10", SALES_VASY_TH)}>#</TableHead>
                                              <TableHead className={cn("pl-10", SALES_VASY_TH)}>Product Name</TableHead>
                                              <TableHead className={cn("w-[90px] text-right", SALES_VASY_TH)}>Qty</TableHead>
                                              <TableHead className={cn("w-[120px] text-right", SALES_VASY_TH)}>Amount (₹)</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {row.productList.map((p, pi) => (
                                              <TableRow key={pi} className="hover:bg-muted/30">
                                                <TableCell className="pl-10 font-mono text-xs text-muted-foreground">{pi + 1}</TableCell>
                                                <TableCell className="pl-10 text-sm font-bold text-foreground">{p.product_name}</TableCell>
                                                <TableCell className={SALES_QTY_CELL}>{p.qty}</TableCell>
                                                <TableCell className={SALES_AMOUNT_CELL}>₹{Math.round(p.amount).toLocaleString("en-IN")}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                            );
                          })}
                          {totalPages > 1 && (
                            <TableRow>
                              <TableCell colSpan={6}>
                                <div className="flex items-center justify-between py-2">
                                  <p className="text-sm text-muted-foreground">
                                    Showing {(customerPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(customerPage * ITEMS_PER_PAGE, customerWiseData.length)} of {customerWiseData.length}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setCustomerPage(p => Math.max(1, p - 1))} disabled={customerPage === 1}>Previous</Button>
                                    <span className="text-sm text-muted-foreground">Page {customerPage} of {totalPages}</span>
                                    <Button variant="outline" size="sm" onClick={() => setCustomerPage(p => Math.min(totalPages, p + 1))} disabled={customerPage === totalPages}>Next</Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })()}
                  </TableBody>
                  {customerWiseData.length > 0 && (
                    <TableFooter className={SALES_VASY_FOOTER}>
                      <TableRow className="hover:bg-slate-100">
                        <TableCell colSpan={2} className="py-3 text-sm font-bold text-teal-700">Grand Total</TableCell>
                        <TableCell className="py-3 text-center text-sm font-bold">{customerWiseData.reduce((s, r) => s + r.item_count, 0)}</TableCell>
                        <TableCell className="py-3 text-right text-sm font-bold tabular-nums">{customerWiseData.reduce((s, r) => s + r.total_qty, 0).toLocaleString()}</TableCell>
                        <TableCell className="py-3 text-right text-sm font-bold tabular-nums text-primary">₹{Math.round(customerWiseData.reduce((s, r) => s + r.total_amount, 0)).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="py-3 text-right text-sm font-bold">-</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brandwise" className="mt-2 flex-1 min-h-0 flex flex-col focus-visible:outline-none data-[state=inactive]:hidden">
          <Card className="rounded-lg border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
            <CardHeader className="py-2 px-3 shrink-0 border-b border-slate-100 bg-white">
              <CardTitle className="text-sm font-semibold text-slate-700">Brand-wise Sale by Customer ({brandWiseData.length.toLocaleString("en-IN")} rows)</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
              <div className={SALES_TABLE_SCROLL}>
                <Table className="w-full min-w-max [&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                     <TableRow className={SALES_VASY_HEAD_ROW}>
                      <TableHead className={SALES_VASY_TH}>Customer Name</TableHead>
                      <TableHead className={cn("w-[140px]", SALES_VASY_TH)}>Brand</TableHead>
                      <TableHead className={cn("w-[110px] text-right", SALES_VASY_TH)}>Total Qty</TableHead>
                      <TableHead className={cn("w-[130px] text-right", SALES_VASY_TH)}>Total Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Loading sales data...
                        </TableCell>
                      </TableRow>
                    ) : isError ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-destructive">
                          Failed to load data. Try a smaller date range.
                        </TableCell>
                      </TableRow>
                    ) : brandWiseData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No sales data found for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (() => {
                      const totalPages = Math.ceil(brandWiseData.length / ITEMS_PER_PAGE);
                      const pageData = brandWiseData.slice((brandPage - 1) * ITEMS_PER_PAGE, brandPage * ITEMS_PER_PAGE);
                      let lastCustomer = brandPage > 1 ? "" : "";
                      return (
                        <>
                          {pageData.map((item, idx) => {
                            const showCustomer = item.customer_name !== lastCustomer;
                            lastCustomer = item.customer_name;
                            return (
                              <TableRow key={idx} className={cn(SALES_BODY_ROW, showCustomer && idx > 0 && "border-t-2 border-border")}>
                                <TableCell className="text-sm font-semibold text-primary">
                                  {showCustomer ? item.customer_name : ""}
                                </TableCell>
                                <TableCell className={SALES_DETAIL_CELL}>{item.brand}</TableCell>
                                <TableCell className={SALES_QTY_CELL}>{item.total_qty.toLocaleString("en-IN")}</TableCell>
                                <TableCell className={SALES_AMOUNT_CELL}>₹{item.total_amount.toLocaleString("en-IN")}</TableCell>
                              </TableRow>
                            );
                          })}
                          {totalPages > 1 && (
                            <TableRow>
                              <TableCell colSpan={4}>
                                <div className="flex items-center justify-between py-2">
                                  <p className="text-sm text-muted-foreground">
                                    Showing {(brandPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(brandPage * ITEMS_PER_PAGE, brandWiseData.length)} of {brandWiseData.length}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setBrandPage(p => Math.max(1, p - 1))} disabled={brandPage === 1}>Previous</Button>
                                    <span className="text-sm text-muted-foreground">Page {brandPage} of {totalPages}</span>
                                    <Button variant="outline" size="sm" onClick={() => setBrandPage(p => Math.min(totalPages, p + 1))} disabled={brandPage === totalPages}>Next</Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })()}
                  </TableBody>
                  {brandWiseData.length > 0 && (
                    <TableFooter className={SALES_VASY_FOOTER}>
                      <TableRow className="hover:bg-slate-100">
                        <TableCell colSpan={2} className="py-3 text-sm font-bold text-teal-700">Grand Total</TableCell>
                        <TableCell className="py-3 text-right text-sm font-bold tabular-nums">
                          {brandWiseData.reduce((s, r) => s + r.total_qty, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="py-3 text-right text-sm font-bold tabular-nums text-primary">
                          ₹{brandWiseData.reduce((s, r) => s + r.total_amount, 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sale Details Tab */}
        <TabsContent value="saledetails" className="mt-2 flex-1 min-h-0 flex flex-col focus-visible:outline-none data-[state=inactive]:hidden">
          <Card className="rounded-lg border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
            <CardHeader className="py-2 px-3 shrink-0 border-b border-slate-100 bg-white space-y-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-slate-700">
                  {({ product_name: "Product Name", brand: fieldLabels.brand, category: fieldLabels.category, department: fieldLabels.style, barcode: "Barcode" })[saleDetailsGroupBy]} Wise Sale Details ({saleDetailsData.length.toLocaleString("en-IN")} rows)
                </CardTitle>
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <Select value={saleDetailsGroupBy} onValueChange={(v) => { setSaleDetailsGroupBy(v as any); setSaleDetailsPage(1); }}>
                  <SelectTrigger className="h-10 w-full md:w-48 border-slate-200 bg-slate-50 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product_name">Product Name</SelectItem>
                    <SelectItem value="brand">{fieldLabels.brand}</SelectItem>
                    <SelectItem value="category">{fieldLabels.category}</SelectItem>
                    <SelectItem value="department">{fieldLabels.style}</SelectItem>
                    <SelectItem value="barcode">Barcode</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${({ product_name: "product name", brand: "brand", category: "category", department: "department", barcode: "barcode / product / brand" })[saleDetailsGroupBy]}...`}
                    value={saleDetailsSearch}
                    onChange={(e) => { setSaleDetailsSearch(e.target.value); setSaleDetailsPage(1); }}
                    className="h-10 pl-10 pr-9 no-uppercase border-slate-200 bg-slate-50 focus:bg-white text-sm"
                  />
                  {saleDetailsSearch && (
                    <button type="button" onClick={() => setSaleDetailsSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-blue-50 px-3 py-2 border border-blue-100">
                  <p className="text-xs text-muted-foreground">Total Qty</p>
                  <p className="text-base font-bold tabular-nums">{saleDetailsTotals.total_qty.toLocaleString()}</p>
                </div>
                <div className="rounded-md bg-emerald-50 px-3 py-2 border border-emerald-100">
                  <p className="text-xs text-muted-foreground">Purchase Value</p>
                  <p className="text-base font-bold tabular-nums">₹{saleDetailsTotals.purchase_value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="rounded-md bg-amber-50 px-3 py-2 border border-amber-100">
                  <p className="text-xs text-muted-foreground">Sale Value</p>
                  <p className="text-base font-bold tabular-nums">₹{saleDetailsTotals.sale_value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
              <div className={SALES_TABLE_SCROLL}>
                <Table className="w-full min-w-max [&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                     <TableRow className={SALES_VASY_HEAD_ROW}>
                      <TableHead className={cn("w-14", SALES_VASY_TH)}>Sr No</TableHead>
                      <TableHead className={SALES_VASY_TH}>{({ product_name: "Product Name", brand: "Brand", category: "Category", department: "Department", barcode: "Barcode" })[saleDetailsGroupBy]}</TableHead>
                      {saleDetailsGroupBy === "barcode" && (
                        <>
                          <TableHead className={SALES_VASY_TH}>Product</TableHead>
                          <TableHead className={SALES_VASY_TH}>Brand</TableHead>
                          <TableHead className={cn("w-[70px]", SALES_VASY_TH)}>Size</TableHead>
                          <TableHead className={cn("w-[90px]", SALES_VASY_TH)}>Color</TableHead>
                        </>
                      )}
                      <TableHead className={cn("w-[90px] text-right", SALES_VASY_TH)}>Stock</TableHead>
                      <TableHead className={cn("w-[130px] text-right", SALES_VASY_TH)}>Purchase Value</TableHead>
                      <TableHead className={cn("w-[120px] text-right", SALES_VASY_TH)}>Sales Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={saleDetailsGroupBy === "barcode" ? 9 : 5} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                      </TableRow>
                    ) : saleDetailsData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={saleDetailsGroupBy === "barcode" ? 9 : 5} className="text-center py-8 text-muted-foreground">No data found</TableCell>
                      </TableRow>
                    ) : (() => {
                      const totalPages = Math.ceil(saleDetailsData.length / SALE_DETAILS_PAGE_SIZE);
                      const pageData = saleDetailsData.slice((saleDetailsPage - 1) * SALE_DETAILS_PAGE_SIZE, saleDetailsPage * SALE_DETAILS_PAGE_SIZE);
                      return (
                        <>
                          {pageData.map((row, idx) => (
                            <TableRow key={row.key} className={SALES_BODY_ROW}>
                              <TableCell className="font-mono text-sm text-muted-foreground">{(saleDetailsPage - 1) * SALE_DETAILS_PAGE_SIZE + idx + 1}</TableCell>
                              <TableCell className="text-sm font-semibold text-primary">{row.key}</TableCell>
                              {saleDetailsGroupBy === "barcode" && (
                                <>
                                  <TableCell>{row.product_name || "-"}</TableCell>
                                  <TableCell>{row.brand || "-"}</TableCell>
                                  <TableCell>{row.size || "-"}</TableCell>
                                  <TableCell>{row.color || "-"}</TableCell>
                                </>
                              )}
                              <TableCell className={SALES_QTY_CELL}>{row.total_qty}</TableCell>
                              <TableCell className={SALES_DETAIL_CELL + " text-right tabular-nums"}>{row.purchase_value.toFixed(2)}</TableCell>
                              <TableCell className={SALES_AMOUNT_CELL}>{row.sale_value.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                          {totalPages > 1 && (
                            <TableRow>
                              <TableCell colSpan={saleDetailsGroupBy === "barcode" ? 9 : 5}>
                                <div className="flex items-center justify-between py-2">
                                  <p className="text-sm text-muted-foreground">
                                    Showing {(saleDetailsPage - 1) * SALE_DETAILS_PAGE_SIZE + 1}–{Math.min(saleDetailsPage * SALE_DETAILS_PAGE_SIZE, saleDetailsData.length)} of {saleDetailsData.length}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSaleDetailsPage(p => Math.max(1, p - 1))} disabled={saleDetailsPage === 1}>Previous</Button>
                                    <span className="text-sm text-muted-foreground">Page {saleDetailsPage} of {totalPages}</span>
                                    <Button variant="outline" size="sm" onClick={() => setSaleDetailsPage(p => Math.min(totalPages, p + 1))} disabled={saleDetailsPage === totalPages}>Next</Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })()}
                  </TableBody>
                  {saleDetailsData.length > 0 && (
                    <TableFooter className={SALES_VASY_FOOTER}>
                      <TableRow className="hover:bg-slate-100">
                        <TableCell colSpan={saleDetailsGroupBy === "barcode" ? 6 : 2} className="py-3 text-sm font-bold text-teal-700">Grand Total</TableCell>
                        <TableCell className="py-3 text-right text-sm font-bold tabular-nums">{saleDetailsTotals.total_qty.toLocaleString()}</TableCell>
                        <TableCell className="py-3 text-right text-sm font-bold tabular-nums">{saleDetailsTotals.purchase_value.toFixed(2)}</TableCell>
                        <TableCell className="py-3 text-right text-sm font-bold tabular-nums text-primary">₹{saleDetailsTotals.sale_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closingstock" className="mt-2 flex-1 min-h-0 flex flex-col focus-visible:outline-none data-[state=inactive]:hidden">
          <ItemWiseClosingStockPanel
            embedded
            filters={closingStockFilters}
            onFiltersChange={setClosingStockFilters}
            currentPage={closingStockPage}
            onCurrentPageChange={setClosingStockPage}
          />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
