import { useState, useMemo, useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { CalendarIcon, Search, Package, IndianRupee, TrendingUp, Printer, FileSpreadsheet, FileText, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { multiTokenMatch } from "@/utils/multiTokenSearch";

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
  avg_price: number;
  total_amount: number;
}

interface FilterOptions {
  brands: string[];
  categories: string[];
  departments: string[];
  customers: string[];
  colors: string[];
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(210, 70%, 50%)",
  "hsl(150, 60%, 45%)",
  "hsl(45, 90%, 55%)",
  "hsl(280, 65%, 55%)",
  "hsl(0, 70%, 55%)",
  "hsl(180, 60%, 45%)",
];

export default function ItemWiseSalesReport() {
  const { currentOrganization } = useOrganization();
  const [periodType, setPeriodType] = useState<PeriodType>("daily");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(),
    to: new Date(),
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [selectedColor, setSelectedColor] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"itemwise" | "customerwise" | "brandwise" | "saledetails">("itemwise");
  const [saleDetailsGroupBy, setSaleDetailsGroupBy] = useState<"product_name" | "brand" | "category" | "department">("product_name");
  const [saleDetailsSearch, setSaleDetailsSearch] = useState("");
  const [saleDetailsPage, setSaleDetailsPage] = useState(1);
  const SALE_DETAILS_PAGE_SIZE = 200;
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    brands: [],
    categories: [],
    departments: [],
    customers: [],
    colors: [],
  });

  const REPORT_CACHE = { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false as const };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const ITEMS_PER_PAGE = 100;

  // Fetch filter options with caching
  const { data: filterOptionsData } = useQuery({
    queryKey: ["item-wise-filter-options", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return { brands: [], categories: [], departments: [], customers: [], colors: [] };

      const [{ data: products }, { data: sales }, { data: variants }] = await Promise.all([
        supabase.from("products").select("brand, category, style").eq("organization_id", currentOrganization.id).is("deleted_at", null),
        supabase.from("sales").select("customer_name").eq("organization_id", currentOrganization.id).is("deleted_at", null),
        supabase.from("product_variants").select("color, product_id, products!inner(organization_id)").eq("products.organization_id", currentOrganization.id).is("deleted_at", null),
      ]);

      return {
        brands: [...new Set((products || []).map(p => p.brand).filter(Boolean))].sort() as string[],
        categories: [...new Set((products || []).map(p => p.category).filter(Boolean))].sort() as string[],
        departments: [...new Set((products || []).map(p => p.style).filter(Boolean))].sort() as string[],
        customers: [...new Set((sales || []).map(s => s.customer_name).filter(Boolean))].sort() as string[],
        colors: [...new Set((variants || []).map((v: any) => v.color).filter(Boolean))].sort() as string[],
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
    queryKey: ["item-wise-sales", currentOrganization?.id, dateRange.from, dateRange.to, selectedCustomer],
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
          .select("id, customer_name")
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

      // Merge product details and customer name into sale items
      return saleItemsData.map(item => ({
        ...item,
        customer_name: salesMap.get(item.sale_id) || null,
        products: item.product_id ? productsMap[item.product_id] || null : null
      }));
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Aggregate data by product
  const aggregatedData: SaleItemData[] = useMemo(() => {
    const productMap = new Map<string, SaleItemData>();

    saleItems.forEach((item: any) => {
      const key = `${item.barcode || ""}-${item.product_name}-${item.size}`;
      const existing = productMap.get(key);

      if (existing) {
        existing.total_qty += item.quantity;
        existing.total_amount += Number(item.line_total);
        existing.avg_price = existing.total_amount / existing.total_qty;
      } else {
        productMap.set(key, {
          barcode: item.barcode,
          product_name: item.product_name,
          size: item.size,
          brand: item.products?.brand || null,
          category: item.products?.category || null,
          color: item.products?.color || null,
          customer_name: item.customer_name || null,
          total_qty: item.quantity,
          avg_price: Number(item.unit_price),
          total_amount: Number(item.line_total),
        });
      }
    });

    return Array.from(productMap.values()).sort((a, b) => b.total_amount - a.total_amount);
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
    const groups = new Map<string, { key: string; total_qty: number; purchase_value: number; sale_value: number }>();

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
        groups.set(groupKey, { key: groupKey, total_qty: qty, purchase_value: purchaseVal, sale_value: saleVal });
      }
    });

    let result = Array.from(groups.values()).sort((a, b) => b.sale_value - a.sale_value);

    // Apply search
    if (saleDetailsSearch.trim()) {
      const q = saleDetailsSearch.toLowerCase();
      result = result.filter(r => r.key.toLowerCase().includes(q));
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

  // Chart data - Top 10 products
  const topProductsData = useMemo(() => {
    return filteredData.slice(0, 10).map((item) => ({
      name: item.product_name.length > 15 ? item.product_name.substring(0, 15) + "..." : item.product_name,
      qty: item.total_qty,
      amount: item.total_amount,
    }));
  }, [filteredData]);

  // Category distribution
  const categoryData = useMemo(() => {
    const categoryMap = new Map<string, number>();
    filteredData.forEach((item) => {
      const category = item.category || "Uncategorized";
      categoryMap.set(category, (categoryMap.get(category) || 0) + item.total_amount);
    });
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredData]);

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
      const groupLabel = { product_name: "Product Name", brand: "Brand", category: "Category", department: "Department" }[saleDetailsGroupBy];
      const exportData = saleDetailsData.map((item, i) => ({
        "Sr No": i + 1,
        [groupLabel]: item.key,
        "Total Qty": item.total_qty,
        "Purchase Value": item.purchase_value.toFixed(2),
        "Sale Value": item.sale_value.toFixed(2),
      }));
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
        "Avg Price": item.avg_price.toFixed(2),
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

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      <BackToDashboard />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Item-wise Sales Report</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              {/* Period Type */}
              <div className="w-full md:w-40">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Period</label>
                <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                  <SelectTrigger>
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

              {/* Date Picker */}
              {periodType !== "custom" && periodType !== "all" && (
                <div className="w-full md:w-48">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(selectedDate, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Custom Date Range */}
              {periodType === "custom" && (
                <>
                  <div className="w-full md:w-48">
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">From</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(customDateRange.from, "PPP")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={customDateRange.from}
                          onSelect={(date) => date && setCustomDateRange((prev) => ({ ...prev, from: date }))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="w-full md:w-48">
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">To</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(customDateRange.to, "PPP")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={customDateRange.to}
                          onSelect={(date) => date && setCustomDateRange((prev) => ({ ...prev, to: date }))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}

              {/* Search */}
              <div className="flex-1">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name, brand, barcode, color... (multi-word AND)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8 no-uppercase"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <span className="text-xs text-muted-foreground mt-1 block">
                    Showing {filteredData.length.toLocaleString('en-IN')} of {aggregatedData.length.toLocaleString('en-IN')} items
                  </span>
                )}
              </div>

              {/* Filter Toggle Button */}
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="h-10"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            </div>

            {/* Dropdown Filters Row */}
            {showFilters && (
              <div className="flex flex-wrap gap-4 pt-2 border-t">
                {/* Brand Filter */}
                <div className="w-full md:w-44">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Brand</label>
                  <SearchableSelect
                    value={selectedBrand}
                    onValueChange={setSelectedBrand}
                    options={filterOptions.brands}
                    placeholder="All Brands"
                    allLabel="All Brands"
                    allValue="all"
                  />
                </div>

                {/* Category Filter */}
                <div className="w-full md:w-44">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Category</label>
                  <SearchableSelect
                    value={selectedCategory}
                    onValueChange={setSelectedCategory}
                    options={filterOptions.categories}
                    placeholder="All Categories"
                    allLabel="All Categories"
                    allValue="all"
                  />
                </div>

                {/* Department Filter */}
                <div className="w-full md:w-44">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Department</label>
                  <SearchableSelect
                    value={selectedDepartment}
                    onValueChange={setSelectedDepartment}
                    options={filterOptions.departments}
                    placeholder="All Departments"
                    allLabel="All Departments"
                    allValue="all"
                  />
                </div>

                {/* Color Filter */}
                <div className="w-full md:w-44">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Color</label>
                  <SearchableSelect
                    value={selectedColor}
                    onValueChange={setSelectedColor}
                    options={filterOptions.colors}
                    placeholder="All Colors"
                    allLabel="All Colors"
                    allValue="all"
                  />
                </div>

                {/* Customer Filter */}
                <div className="w-full md:w-48">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Customer</label>
                  <SearchableSelect
                    value={selectedCustomer}
                    onValueChange={setSelectedCustomer}
                    options={filterOptions.customers}
                    placeholder="All Customers"
                    allLabel="All Customers"
                    allValue="all"
                  />
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Showing data from {format(dateRange.from, "dd MMM yyyy")} to {format(dateRange.to, "dd MMM yyyy")}
              {(selectedBrand !== "all" || selectedCategory !== "all" || selectedDepartment !== "all" || selectedColor !== "all" || selectedCustomer !== "all") && (
                <span className="ml-2 text-primary">• Filters applied</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Qty Sold</p>
                <p className="text-2xl font-bold">{summary.totalQty.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <IndianRupee className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Sales</p>
                <p className="text-2xl font-bold">₹{summary.totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Products</p>
                <p className="text-2xl font-bold">{summary.uniqueProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Sale Price</p>
                <p className="text-2xl font-bold">₹{summary.avgPrice.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Item-wise and Brand-wise */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "itemwise" | "customerwise" | "brandwise" | "saledetails")}>
        <TabsList className="mb-4">
          <TabsTrigger value="itemwise">📦 Item-wise Details</TabsTrigger>
          <TabsTrigger value="customerwise">👤 Customer-wise Sale</TabsTrigger>
          <TabsTrigger value="brandwise">🏷️ Brand-wise Sale</TabsTrigger>
          <TabsTrigger value="saledetails">📊 Sale Details</TabsTrigger>
        </TabsList>

        <TabsContent value="itemwise" className="space-y-6">
          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top 10 Products by Quantity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProductsData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="name" type="category" width={120} className="text-xs" />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                        formatter={(value: number) => [value.toLocaleString(), "Qty"]}
                      />
                      <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sales by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {categoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                        formatter={(value: number) => [`₹${value.toLocaleString()}`, "Amount"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Item-wise Data Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Item-wise Details ({filteredData.length} items)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[100px]">Barcode</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Avg Price</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No sales data found for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (() => {
                      const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
                      const paginatedData = filteredData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
                      return (
                        <>
                          {paginatedData.map((item, idx) => (
                            <TableRow key={idx} className="hover:bg-muted/30">
                              <TableCell className="font-mono text-sm">{item.barcode || "-"}</TableCell>
                              <TableCell className="font-medium">{item.product_name}</TableCell>
                              <TableCell>{item.brand || "-"}</TableCell>
                              <TableCell>{item.category || "-"}</TableCell>
                              <TableCell>{item.color || "-"}</TableCell>
                              <TableCell>{item.size}</TableCell>
                              <TableCell className="text-right font-medium">{item.total_qty}</TableCell>
                              <TableCell className="text-right">₹{item.avg_price.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-semibold text-primary">
                                ₹{item.total_amount.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                          {totalPages > 1 && (
                            <TableRow>
                              <TableCell colSpan={9}>
                                <div className="flex items-center justify-between py-2">
                                  <p className="text-sm text-muted-foreground">
                                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of {filteredData.length}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                                    <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
                                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })()}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customerwise">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Customer-wise Sale ({customerWiseData.length} customers)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Customer Name</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Total Value (₹)</TableHead>
                      <TableHead className="text-right">Avg Item Value (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerWiseData.map((row, index) => (
                      <>
                        <TableRow
                          key={row.customer_name}
                          className={cn("cursor-pointer hover:bg-muted/40", index % 2 === 0 ? "" : "bg-muted/30")}
                          onClick={() => setExpandedCustomer(expandedCustomer === row.customer_name ? null : row.customer_name)}
                        >
                          <TableCell className="font-mono text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">
                            <span className="mr-1 text-xs">{expandedCustomer === row.customer_name ? "▼" : "▶"}</span>
                            {row.customer_name}
                          </TableCell>
                          <TableCell className="text-center">{row.item_count}</TableCell>
                          <TableCell className="text-right font-mono">{row.total_qty}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">₹{Math.round(row.total_amount).toLocaleString("en-IN")}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">₹{row.total_qty > 0 ? Math.round(row.total_amount / row.total_qty).toLocaleString("en-IN") : 0}</TableCell>
                        </TableRow>
                        {expandedCustomer === row.customer_name && (
                          <TableRow key={`${row.customer_name}-products`}>
                            <TableCell colSpan={6} className="p-0">
                              <div className="bg-muted/20 border-y">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/40">
                                      <TableHead className="w-12 pl-10">#</TableHead>
                                      <TableHead className="pl-10">Product Name</TableHead>
                                      <TableHead className="text-right">Qty</TableHead>
                                      <TableHead className="text-right">Amount (₹)</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {row.productList.map((p, pi) => (
                                      <TableRow key={pi} className="hover:bg-muted/30">
                                        <TableCell className="pl-10 font-mono text-xs text-muted-foreground">{pi + 1}</TableCell>
                                        <TableCell className="pl-10 text-sm">{p.product_name}</TableCell>
                                        <TableCell className="text-right font-mono text-sm">{p.qty}</TableCell>
                                        <TableCell className="text-right font-mono text-sm">₹{Math.round(p.amount).toLocaleString("en-IN")}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end gap-6 mt-3 px-2 text-sm font-semibold">
                <span>Total Qty: {customerWiseData.reduce((s, r) => s + r.total_qty, 0)}</span>
                <span>Total Value: ₹{Math.round(customerWiseData.reduce((s, r) => s + r.total_amount, 0)).toLocaleString("en-IN")}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brandwise">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Brand-wise Sale by Customer ({brandWiseData.length} rows)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
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
                      let lastCustomer = "";
                      return brandWiseData.map((item, idx) => {
                        const showCustomer = item.customer_name !== lastCustomer;
                        lastCustomer = item.customer_name;
                        return (
                          <TableRow key={idx} className={cn("hover:bg-muted/30", showCustomer && idx > 0 && "border-t-2 border-border")}>
                            <TableCell className="font-medium">
                              {showCustomer ? item.customer_name : ""}
                            </TableCell>
                            <TableCell>{item.brand}</TableCell>
                            <TableCell className="text-right font-medium">{item.total_qty}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              ₹{item.total_amount.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                  {brandWiseData.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} className="font-bold">Grand Total</TableCell>
                        <TableCell className="text-right font-bold">
                          {brandWiseData.reduce((s, r) => s + r.total_qty, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">
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
      </Tabs>
    </div>
  );
}
