import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Search, Printer, FileSpreadsheet, Package, IndianRupee, TrendingUp, X, Info, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

type GroupByField = "product_name" | "supplier" | "brand" | "category" | "department";

interface AggregatedRow {
  key: string;
  total_qty: number;
  purchase_value: number;
  sale_value: number;
}

const GROUP_BY_LABELS: Record<GroupByField, string> = {
  product_name: "Product Name",
  supplier: "Supplier",
  brand: "Brand",
  category: "Category",
  department: "Department",
};

const PAGE_SIZE = 200;

async function fetchAllPages(
  buildQuery: () => any,
  batchSize = 1000
): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await buildQuery().range(from, from + batchSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    hasMore = data.length === batchSize;
    from += batchSize;
  }
  return all;
}

export default function ItemWiseStockReport() {
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupByField>("product_name");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Auto-load data when any groupBy is selected (always true) OR any filter/search is active
  const hasActiveFilter = true;

  const hasActiveSearchOrFilter = useMemo(() => {
    return Boolean(
      searchQuery.trim().length > 0 ||
      (brandFilter && brandFilter !== "__all__") ||
      (categoryFilter && categoryFilter !== "__all__") ||
      (departmentFilter && departmentFilter !== "__all__") ||
      (supplierFilter && supplierFilter !== "__all__")
    );
  }, [searchQuery, brandFilter, categoryFilter, departmentFilter, supplierFilter]);

  // Fetch filter options (paginated)
  const { data: filterOptions } = useQuery({
    queryKey: ["item-stock-filters", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return { brands: [], categories: [], departments: [], suppliers: [] };

      const allProducts = await fetchAllPages(() =>
        supabase
          .from("products")
          .select("brand, category, style")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .neq("product_type", "service")
          .order("product_name")
      );

      // Fetch supplier names from batch_stock → purchase_bills
      const allBatchStock = await fetchAllPages(() =>
        supabase
          .from("batch_stock")
          .select("variant_id, purchase_bills!inner(supplier_name)")
          .eq("organization_id", currentOrganization.id)
      );

      const brands = [...new Set(allProducts.map((p: any) => p.brand).filter(Boolean))].sort() as string[];
      const categories = [...new Set(allProducts.map((p: any) => p.category).filter(Boolean))].sort() as string[];
      const departments = [...new Set(allProducts.map((p: any) => p.style).filter(Boolean))].sort() as string[];
      const suppliers = [...new Set(allBatchStock.map((b: any) => b.purchase_bills?.supplier_name).filter(Boolean))].sort() as string[];

      return { brands, categories, departments, suppliers };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Fetch stock data - always enabled now
  const { data: stockData = [], isLoading } = useQuery({
    queryKey: ["item-wise-stock", currentOrganization?.id, brandFilter, categoryFilter, departmentFilter, groupBy === "product_name" ? searchQuery : ""],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const allVariants = await fetchAllPages(() => {
        let query = supabase
          .from("product_variants")
          .select(`
            id,
            stock_qty,
            pur_price,
            sale_price,
            products!inner (
              id,
              product_name,
              product_type,
              brand,
              category,
              style,
              deleted_at
            )
          `)
          .eq("products.organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .neq("products.product_type", "service");

        if (brandFilter && brandFilter !== "__all__") {
          query = query.eq("products.brand", brandFilter);
        }
        if (categoryFilter && categoryFilter !== "__all__") {
          query = query.eq("products.category", categoryFilter);
        }
        if (departmentFilter && departmentFilter !== "__all__") {
          query = query.eq("products.style", departmentFilter);
        }
        // Only apply DB-level search for product_name grouping
        if (groupBy === "product_name" && searchQuery.trim()) {
          query = query.ilike("products.product_name", `%${searchQuery.trim()}%`);
        }
        return query;
      });

      return allVariants;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch supplier map for variants - always load since groupBy can change anytime
  const { data: supplierMap = {} } = useQuery({
    queryKey: ["item-stock-supplier-map", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return {};
      const allBatch = await fetchAllPages(() =>
        supabase
          .from("batch_stock")
          .select("variant_id, purchase_bills!inner(supplier_name)")
          .eq("organization_id", currentOrganization.id)
      );
      const map: Record<string, string> = {};
      allBatch.forEach((b: any) => {
        if (b.variant_id && b.purchase_bills?.supplier_name) {
          map[b.variant_id] = b.purchase_bills.supplier_name;
        }
      });
      return map;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Aggregate data by selected group field
  const aggregatedData: AggregatedRow[] = useMemo(() => {
    let filtered = stockData as any[];

    // Apply supplier filter
    if (supplierFilter && supplierFilter !== "__all__") {
      filtered = filtered.filter((item: any) => {
        const sup = supplierMap[item.id] || "";
        return sup === supplierFilter;
      });
    }

    const groupMap = new Map<string, AggregatedRow>();

    filtered.forEach((item: any) => {
      let key = "";
      switch (groupBy) {
        case "product_name":
          key = item.products?.product_name || "Unknown";
          break;
        case "supplier":
          key = supplierMap[item.id] || "Unknown Supplier";
          break;
        case "brand":
          key = item.products?.brand || "No Brand";
          break;
        case "category":
          key = item.products?.category || "No Category";
          break;
        case "department":
          key = item.products?.style || "No Department";
          break;
      }

      const qty = item.stock_qty || 0;
      const purPrice = item.pur_price || 0;
      const salePrice = item.sale_price || 0;

      const existing = groupMap.get(key);
      if (existing) {
        existing.total_qty += qty;
        existing.purchase_value += purPrice * qty;
        existing.sale_value += salePrice * qty;
      } else {
        groupMap.set(key, {
          key,
          total_qty: qty,
          purchase_value: purPrice * qty,
          sale_value: salePrice * qty,
        });
      }
    });

    // Client-side search for non-product_name groupings
    let results = Array.from(groupMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    if (groupBy !== "product_name" && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      results = results.filter(r => r.key.toLowerCase().includes(q));
    }
    return results;
  }, [stockData, groupBy, supplierMap, supplierFilter, searchQuery]);

  // Paginate
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return aggregatedData.slice(start, start + PAGE_SIZE);
  }, [aggregatedData, currentPage]);

  const totalPages = Math.ceil(aggregatedData.length / PAGE_SIZE);

  const clearFilters = useCallback(() => {
    setBrandFilter("");
    setCategoryFilter("");
    setDepartmentFilter("");
    setSupplierFilter("");
    setSearchQuery("");
    setCurrentPage(1);
  }, []);

  const hasActiveFilters = (brandFilter && brandFilter !== "__all__") || (categoryFilter && categoryFilter !== "__all__") || (departmentFilter && departmentFilter !== "__all__") || (supplierFilter && supplierFilter !== "__all__") || searchQuery;

  // Grand totals
  const grandTotals = useMemo(() => {
    return aggregatedData.reduce(
      (acc, item) => ({
        total_qty: acc.total_qty + item.total_qty,
        purchase_value: acc.purchase_value + item.purchase_value,
        sale_value: acc.sale_value + item.sale_value,
      }),
      { total_qty: 0, purchase_value: 0, sale_value: 0 }
    );
  }, [aggregatedData]);

  // Export to Excel
  const exportToExcel = () => {
    const label = GROUP_BY_LABELS[groupBy];
    const exportData = aggregatedData.map((item, idx) => ({
      "Sr.No": idx + 1,
      [label]: item.key,
      "Stock": item.total_qty,
      "Purchase Value": item.purchase_value.toFixed(2),
      "Sales Value": item.sale_value.toFixed(2),
    }));

    exportData.push({
      "Sr.No": "" as any,
      [label]: "Grand Totals:",
      "Stock": grandTotals.total_qty,
      "Purchase Value": grandTotals.purchase_value.toFixed(2),
      "Sales Value": grandTotals.sale_value.toFixed(2),
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${label} Wise Stock`);
    XLSX.writeFile(wb, `${label.toLowerCase().replace(/\s/g, "-")}-wise-stock-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // Export to PDF
  const exportToPDF = () => {
    const label = GROUP_BY_LABELS[groupBy];
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    let y = 15;

    const addHeader = () => {
      doc.setFontSize(14);
      doc.text(`${label} Wise Stock Report`, margin, y);
      y += 6;
      doc.setFontSize(9);
      doc.text(`${currentOrganization?.name || ""} | ${format(new Date(), "dd-MM-yyyy hh:mm a")}`, margin, y);
      y += 8;

      // Table header
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Sr.", margin, y);
      doc.text(label, margin + 12, y);
      doc.text("Stock", pageWidth - 80, y, { align: "right" });
      doc.text("Pur Value", pageWidth - 45, y, { align: "right" });
      doc.text("Sale Value", pageWidth - margin, y, { align: "right" });
      y += 1;
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;
      doc.setFont("helvetica", "normal");
    };

    addHeader();

    aggregatedData.forEach((item, idx) => {
      if (y > 275) {
        doc.addPage();
        y = 15;
        addHeader();
      }
      doc.setFontSize(7);
      doc.text(String(idx + 1), margin, y);
      const nameText = item.key.length > 40 ? item.key.substring(0, 40) + "…" : item.key;
      doc.text(nameText, margin + 12, y);
      doc.text(String(item.total_qty), pageWidth - 80, y, { align: "right" });
      doc.text(item.purchase_value.toFixed(2), pageWidth - 45, y, { align: "right" });
      doc.text(item.sale_value.toFixed(2), pageWidth - margin, y, { align: "right" });
      y += 5;
    });

    // Grand totals
    if (y > 270) { doc.addPage(); y = 15; }
    y += 2;
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Grand Totals:", margin + 12, y);
    doc.text(String(grandTotals.total_qty), pageWidth - 80, y, { align: "right" });
    doc.text(grandTotals.purchase_value.toFixed(2), pageWidth - 45, y, { align: "right" });
    doc.text(grandTotals.sale_value.toFixed(2), pageWidth - margin, y, { align: "right" });

    doc.save(`${label.toLowerCase().replace(/\s/g, "-")}-wise-stock-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const handlePrint = () => window.print();

  // Page numbers for pagination
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (currentPage > 3) pages.push("...");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  }, [totalPages, currentPage]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6 print:p-2 print:space-y-2">
      <div className="print:hidden">
        <BackToDashboard />
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground print:text-lg">
            {GROUP_BY_LABELS[groupBy]} Wise Stock Report ({currentOrganization?.name || ""})
          </h1>
          <p className="text-sm text-muted-foreground print:text-xs">
            {format(new Date(), "dd-MM-yyyy    hh:mm:ss a")}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel} disabled={!hasActiveFilter}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportToPDF} disabled={!hasActiveFilter}>
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {hasActiveFilter && (
        <div className="grid grid-cols-3 gap-4 print:hidden">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-500/10 rounded-lg">
                  <Package className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Stock</p>
                  <p className="text-2xl font-bold">{grandTotals.total_qty.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <IndianRupee className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Purchase Value</p>
                  <p className="text-2xl font-bold">₹{Math.round(grandTotals.purchase_value).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sale Value</p>
                  <p className="text-2xl font-bold">₹{Math.round(grandTotals.sale_value).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Group By + Search & Filters */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as GroupByField); setCurrentPage(1); }}>
          <SelectTrigger className="w-[170px] border-primary/50 font-medium">
            <SelectValue placeholder="Group By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="product_name">Product Name</SelectItem>
            <SelectItem value="supplier">Supplier</SelectItem>
            <SelectItem value="brand">Brand</SelectItem>
            <SelectItem value="category">Category</SelectItem>
            <SelectItem value="department">Department</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1 min-w-[200px] max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${GROUP_BY_LABELS[groupBy]}...`}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9"
            />
          </div>
        </div>

        <Select value={brandFilter} onValueChange={(v) => { setBrandFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Brands</SelectItem>
            {(filterOptions?.brands || []).map((brand) => (
              <SelectItem key={brand} value={brand}>{brand}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {(filterOptions?.categories || []).map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Departments</SelectItem>
            {(filterOptions?.departments || []).map((dept) => (
              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={supplierFilter} onValueChange={(v) => { setSupplierFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Suppliers</SelectItem>
            {(filterOptions?.suppliers || []).map((sup) => (
              <SelectItem key={sup} value={sup}>{sup}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Data Table */}
      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-0">
          <div className="border rounded-lg overflow-hidden print:border-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 print:bg-transparent">
                  <TableHead className="w-[80px] print:text-xs print:py-1">Sr.No</TableHead>
                  <TableHead className="print:text-xs print:py-1">{GROUP_BY_LABELS[groupBy]}</TableHead>
                  <TableHead className="text-right print:text-xs print:py-1">Stock</TableHead>
                  <TableHead className="text-right print:text-xs print:py-1">Purchase Value</TableHead>
                  <TableHead className="text-right print:text-xs print:py-1">Sales Value</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : paginatedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No stock data found
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {paginatedData.map((item, idx) => (
                        <TableRow key={item.key} className="hover:bg-muted/30 print:hover:bg-transparent">
                          <TableCell className="print:text-xs print:py-1">{(currentPage - 1) * PAGE_SIZE + idx + 1}</TableCell>
                          <TableCell className="font-medium print:text-xs print:py-1">{item.key}</TableCell>
                          <TableCell className="text-right print:text-xs print:py-1">{item.total_qty}</TableCell>
                          <TableCell className="text-right print:text-xs print:py-1">{item.purchase_value.toFixed(2)}</TableCell>
                          <TableCell className="text-right print:text-xs print:py-1">{item.sale_value.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/70 font-bold print:bg-transparent border-t-2">
                        <TableCell className="print:text-xs print:py-1"></TableCell>
                        <TableCell className="text-primary print:text-xs print:py-1">Grand Totals:</TableCell>
                        <TableCell className="text-right print:text-xs print:py-1">{grandTotals.total_qty}</TableCell>
                        <TableCell className="text-right print:text-xs print:py-1">{grandTotals.purchase_value.toFixed(2)}</TableCell>
                        <TableCell className="text-right print:text-xs print:py-1">{grandTotals.sale_value.toFixed(2)}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Enhanced Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t print:hidden">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} ({aggregatedData.length} records)
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {pageNumbers.map((pg, i) =>
                    pg === "..." ? (
                      <span key={`dots-${i}`} className="px-1 text-muted-foreground">…</span>
                    ) : (
                      <Button
                        key={pg}
                        variant={currentPage === pg ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setCurrentPage(pg as number)}
                      >
                        {pg}
                      </Button>
                    )
                  )}
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
        </Card>
    </div>
    </div>
  );
}
