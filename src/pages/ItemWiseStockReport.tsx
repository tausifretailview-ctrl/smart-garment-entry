import { useState, useMemo, useCallback } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useProductFieldLabels } from "@/hooks/useSettings";
import { BackToDashboard } from "@/components/BackToDashboard";
import { ReportKpiCards, type ReportKpiItem } from "@/components/reports/ReportKpiCards";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Search, Printer, FileSpreadsheet, Package, IndianRupee, TrendingUp, X, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import {
  fetchAllItemWiseStockRows,
  fetchItemWiseStockFilterOptions,
  fetchItemWiseStockPage,
  fetchItemWiseStockTotals,
  ITEM_WISE_STOCK_PAGE_SIZE,
  type ItemWiseStockFilters,
  type ItemWiseStockGroupBy,
  type ItemWiseStockRow,
} from "@/utils/itemWiseStockQueries";

// Tab-return stable: keep cached data, never auto-refetch on focus/mount/reconnect.
const STABLE_TAB_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false as const,
  refetchOnMount: false as const,
  refetchOnReconnect: false as const,
};

export default function ItemWiseStockReport() {
  const { currentOrganization } = useOrganization();
  const fieldLabels = useProductFieldLabels();
  const GROUP_BY_LABELS: Record<ItemWiseStockGroupBy, string> = {
    product_name: "Product Name",
    supplier: "Supplier",
    brand: fieldLabels.brand,
    category: fieldLabels.category,
    department: fieldLabels.style,
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<ItemWiseStockGroupBy>("product_name");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.itemWiseStock,
    currentOrganization?.id,
    useMemo(
      () => ({
        searchQuery,
        groupBy,
        brandFilter,
        categoryFilter,
        departmentFilter,
        supplierFilter,
        currentPage,
      }),
      [searchQuery, groupBy, brandFilter, categoryFilter, departmentFilter, supplierFilter, currentPage],
    ),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", setSearchQuery],
          ["groupBy", (v) => setGroupBy(v as ItemWiseStockGroupBy)],
          ["brandFilter", setBrandFilter],
          ["categoryFilter", setCategoryFilter],
          ["departmentFilter", setDepartmentFilter],
          ["supplierFilter", setSupplierFilter],
        ],
        numbers: [["currentPage", setCurrentPage]],
      });
    },
  );

  const listFilters = useMemo<ItemWiseStockFilters>(
    () => ({
      groupBy,
      searchQuery,
      brandFilter,
      categoryFilter,
      departmentFilter,
      supplierFilter,
    }),
    [groupBy, searchQuery, brandFilter, categoryFilter, departmentFilter, supplierFilter],
  );

  const { data: filterOptions } = useQuery({
    queryKey: ["item-stock-filters", currentOrganization?.id],
    queryFn: () => fetchItemWiseStockFilterOptions(currentOrganization!.id),
    enabled: !!currentOrganization?.id,
    ...STABLE_TAB_OPTIONS,
  });

  const {
    data: listPageData,
    isLoading: listLoading,
    isFetching: listFetching,
  } = useQuery({
    queryKey: ["item-wise-stock", currentOrganization?.id, listFilters, currentPage],
    queryFn: () =>
      fetchItemWiseStockPage(currentOrganization!.id, listFilters, currentPage, ITEM_WISE_STOCK_PAGE_SIZE),
    enabled: !!currentOrganization?.id,
    placeholderData: (previous) => previous,
    ...STABLE_TAB_OPTIONS,
  });

  const { data: grandTotalsData, isLoading: totalsLoading } = useQuery({
    queryKey: ["item-wise-stock-totals", currentOrganization?.id, listFilters],
    queryFn: () => fetchItemWiseStockTotals(currentOrganization!.id, listFilters),
    enabled: !!currentOrganization?.id,
    ...STABLE_TAB_OPTIONS,
  });

  const paginatedData: ItemWiseStockRow[] = listPageData?.rows ?? [];
  const totalCount = listPageData?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEM_WISE_STOCK_PAGE_SIZE));

  const grandTotals = grandTotalsData ?? {
    total_qty: 0,
    purchase_value: 0,
    sale_value: 0,
    group_count: 0,
  };

  const isLoading = listLoading || totalsLoading;

  const clearFilters = useCallback(() => {
    setBrandFilter("");
    setCategoryFilter("");
    setDepartmentFilter("");
    setSupplierFilter("");
    setSearchQuery("");
    setCurrentPage(1);
  }, []);

  const hasActiveFilters =
    (brandFilter && brandFilter !== "__all__") ||
    (categoryFilter && categoryFilter !== "__all__") ||
    (departmentFilter && departmentFilter !== "__all__") ||
    (supplierFilter && supplierFilter !== "__all__") ||
    searchQuery;

  const loadAllRowsForExport = useCallback(async () => {
    if (!currentOrganization?.id) return [];
    return fetchAllItemWiseStockRows(currentOrganization.id, listFilters);
  }, [currentOrganization?.id, listFilters]);

  const exportToExcel = async () => {
    if (!currentOrganization?.id) return;
    setIsExporting(true);
    try {
      const label = GROUP_BY_LABELS[groupBy];
      const rows = await loadAllRowsForExport();
      const exportData = rows.map((item, idx) => ({
        "Sr.No": idx + 1,
        [label]: item.key,
        Stock: item.total_qty,
        "Purchase Value": item.purchase_value.toFixed(2),
        "Sales Value": item.sale_value.toFixed(2),
      }));

      exportData.push({
        "Sr.No": "" as any,
        [label]: "Grand Totals:",
        Stock: grandTotals.total_qty,
        "Purchase Value": grandTotals.purchase_value.toFixed(2),
        "Sales Value": grandTotals.sale_value.toFixed(2),
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${label} Wise Stock`);
      XLSX.writeFile(wb, `${label.toLowerCase().replace(/\s/g, "-")}-wise-stock-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    if (!currentOrganization?.id) return;
    setIsExporting(true);
    try {
      const label = GROUP_BY_LABELS[groupBy];
      const rows = await loadAllRowsForExport();
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

      rows.forEach((item, idx) => {
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

      if (y > 270) {
        doc.addPage();
        y = 15;
      }
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
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => window.print();

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

  const stockKpiItems = useMemo((): ReportKpiItem[] => {
    if (grandTotals.group_count === 0 && !isLoading) return [];
    return [
      {
        label: "Total Stock",
        value: grandTotals.total_qty.toLocaleString("en-IN"),
        sub: `${grandTotals.group_count} groups`,
        gradient: "bg-gradient-to-br from-blue-500 to-blue-600",
        icon: Package,
      },
      {
        label: "Purchase Value",
        value: `₹${Math.round(grandTotals.purchase_value).toLocaleString("en-IN")}`,
        sub: "At purchase price",
        gradient: "bg-gradient-to-br from-amber-500 to-amber-600",
        icon: IndianRupee,
      },
      {
        label: "Sale Value",
        value: `₹${Math.round(grandTotals.sale_value).toLocaleString("en-IN")}`,
        sub: "At sale price",
        gradient: "bg-gradient-to-br from-emerald-500 to-emerald-600",
        icon: TrendingUp,
      },
    ];
  }, [grandTotals, isLoading]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-5 print:p-2 print:space-y-2 print:bg-white">
      <div className="print:hidden">
        <BackToDashboard />
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight leading-tight print:text-lg print:text-foreground">
            {GROUP_BY_LABELS[groupBy]} Wise Stock Report
          </h1>
          <p className="text-slate-400 text-base mt-0.5 print:text-xs print:text-muted-foreground">
            {currentOrganization?.name || ""} · {format(new Date(), "dd-MM-yyyy hh:mm:ss a")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" className="h-10 border-slate-300 text-slate-600 gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button
            variant="outline"
            className="h-10 border-slate-300 text-slate-600 gap-2"
            onClick={() => void exportToExcel()}
            disabled={isExporting || grandTotals.group_count === 0}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button
            variant="outline"
            className="h-10 border-slate-300 text-slate-600 gap-2"
            onClick={() => void exportToPDF()}
            disabled={isExporting || grandTotals.group_count === 0}
          >
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <ReportKpiCards items={stockKpiItems} />

      <div className="flex flex-wrap gap-3 print:hidden">
        <Select
          value={groupBy}
          onValueChange={(v) => {
            setGroupBy(v as ItemWiseStockGroupBy);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[170px] border-primary/50 font-medium">
            <SelectValue placeholder="Group By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="product_name">Product Name</SelectItem>
            <SelectItem value="supplier">Supplier</SelectItem>
            <SelectItem value="brand">{fieldLabels.brand}</SelectItem>
            <SelectItem value="category">{fieldLabels.category}</SelectItem>
            <SelectItem value="department">{fieldLabels.style}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1 min-w-[200px] max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${GROUP_BY_LABELS[groupBy]}...`}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9"
            />
          </div>
        </div>

        <Select
          value={brandFilter}
          onValueChange={(v) => {
            setBrandFilter(v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={`All ${fieldLabels.brand}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All {fieldLabels.brand}</SelectItem>
            {(filterOptions?.brands || []).map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={`All ${fieldLabels.category}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All {fieldLabels.category}</SelectItem>
            {(filterOptions?.categories || []).map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={departmentFilter}
          onValueChange={(v) => {
            setDepartmentFilter(v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={`All ${fieldLabels.style}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All {fieldLabels.style}</SelectItem>
            {(filterOptions?.departments || []).map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={supplierFilter}
          onValueChange={(v) => {
            setSupplierFilter(v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Suppliers</SelectItem>
            {(filterOptions?.suppliers || []).map((sup) => (
              <SelectItem key={sup} value={sup}>
                {sup}
              </SelectItem>
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
                  paginatedData.map((item, idx) => (
                    <TableRow key={`${item.key}-${idx}`} className="hover:bg-muted/30 print:hover:bg-transparent">
                      <TableCell className="print:text-xs print:py-1">
                        {(currentPage - 1) * ITEM_WISE_STOCK_PAGE_SIZE + idx + 1}
                      </TableCell>
                      <TableCell className="font-medium print:text-xs print:py-1">{item.key}</TableCell>
                      <TableCell className="text-right print:text-xs print:py-1 tabular-nums">{item.total_qty}</TableCell>
                      <TableCell className="text-right print:text-xs print:py-1 tabular-nums">
                        {item.purchase_value.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right print:text-xs print:py-1 tabular-nums">
                        {item.sale_value.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {grandTotals.group_count > 0 && !isLoading && (
                <TableFooter className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 [&>tr]:border-0 [&>tr]:hover:bg-transparent">
                  <TableRow>
                    <TableCell className="print:text-xs print:py-1" />
                    <TableCell className="font-bold text-primary print:text-xs py-2.5 align-middle">Grand Totals:</TableCell>
                    <TableCell className="text-right font-bold tabular-nums print:text-xs py-2.5 align-middle">
                      {grandTotals.total_qty}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums print:text-xs py-2.5 align-middle">
                      {grandTotals.purchase_value.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums print:text-xs py-2.5 align-middle">
                      {grandTotals.sale_value.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 print:hidden">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({totalCount} records)
                {listFetching && !listLoading ? " · refreshing…" : ""}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {pageNumbers.map((pg, i) =>
                  pg === "..." ? (
                    <span key={`dots-${i}`} className="px-1 text-muted-foreground">
                      …
                    </span>
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
                  ),
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
