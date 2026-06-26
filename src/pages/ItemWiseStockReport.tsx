import { useState, useMemo, useCallback, useEffect } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useProductFieldLabels } from "@/hooks/useSettings";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { format } from "date-fns";
import {
  Search,
  Printer,
  FileSpreadsheet,
  Package,
  ArrowLeft,
  RefreshCw,
  Loader2,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { cn } from "@/lib/utils";
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

const STABLE_TAB_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false as const,
  refetchOnMount: false as const,
  refetchOnReconnect: false as const,
};

const ALL_VALUE = "__all__";

function normalizeFilterValue(value: string | undefined): string {
  return value && value !== ALL_VALUE ? value : ALL_VALUE;
}

export default function ItemWiseStockReport() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
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
  const [brandFilter, setBrandFilter] = useState(ALL_VALUE);
  const [categoryFilter, setCategoryFilter] = useState(ALL_VALUE);
  const [departmentFilter, setDepartmentFilter] = useState(ALL_VALUE);
  const [supplierFilter, setSupplierFilter] = useState(ALL_VALUE);
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
          ["brandFilter", (v) => setBrandFilter(normalizeFilterValue(v))],
          ["categoryFilter", (v) => setCategoryFilter(normalizeFilterValue(v))],
          ["departmentFilter", (v) => setDepartmentFilter(normalizeFilterValue(v))],
          ["supplierFilter", (v) => setSupplierFilter(normalizeFilterValue(v))],
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
    error: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ["item-wise-stock", currentOrganization?.id, listFilters, currentPage],
    queryFn: () =>
      fetchItemWiseStockPage(currentOrganization!.id, listFilters, currentPage, ITEM_WISE_STOCK_PAGE_SIZE),
    enabled: !!currentOrganization?.id,
    ...STABLE_TAB_OPTIONS,
  });

  const {
    data: grandTotalsData,
    isLoading: totalsLoading,
    isFetching: totalsFetching,
    refetch: refetchTotals,
  } = useQuery({
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

  const isInitialLoading = listLoading || totalsLoading;
  const isRefreshing = (listFetching || totalsFetching) && !isInitialLoading;
  const showTableLoading = isInitialLoading || listFetching;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const clearFilters = useCallback(() => {
    setBrandFilter(ALL_VALUE);
    setCategoryFilter(ALL_VALUE);
    setDepartmentFilter(ALL_VALUE);
    setSupplierFilter(ALL_VALUE);
    setSearchQuery("");
    setCurrentPage(1);
  }, []);

  const hasActiveFilters =
    brandFilter !== ALL_VALUE ||
    categoryFilter !== ALL_VALUE ||
    departmentFilter !== ALL_VALUE ||
    supplierFilter !== ALL_VALUE ||
    !!searchQuery.trim();

  const loadAllRowsForExport = useCallback(async () => {
    if (!currentOrganization?.id) return [];
    return fetchAllItemWiseStockRows(currentOrganization.id, listFilters);
  }, [currentOrganization?.id, listFilters]);

  const handleRefresh = () => {
    void refetchList();
    void refetchTotals();
  };

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

  const groupLabel = GROUP_BY_LABELS[groupBy];
  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * ITEM_WISE_STOCK_PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * ITEM_WISE_STOCK_PAGE_SIZE, totalCount);

  if (!currentOrganization?.id) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Select an organization to view stock report.
      </div>
    );
  }

  return (
    <div className="item-wise-stock-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3 print:bg-white print:p-2">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 print:hidden">
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
              <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-teal-700">
                <Package className="h-5 w-5 shrink-0" />
                {groupLabel} Wise Stock
              </h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {isRefreshing ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Refreshing…
                  </span>
                ) : (
                  <>
                    {currentOrganization.name} · {format(new Date(), "dd-MM-yyyy hh:mm a")}
                    {grandTotals.group_count > 0
                      ? ` · ${grandTotals.group_count.toLocaleString("en-IN")} groups`
                      : ""}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm"
              onClick={handleRefresh}
              disabled={listFetching || totalsFetching}
            >
              <RefreshCw className={cn("mr-1.5 h-4 w-4", (listFetching || totalsFetching) && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid shrink-0 grid-cols-3 gap-2 print:hidden">
          <div className="min-w-0 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-3 py-2 shadow-sm">
            <p className="text-xs font-medium leading-none text-white/80">Total Stock</p>
            <p className="mt-1 truncate text-base font-black tabular-nums leading-tight text-white sm:text-lg">
              {grandTotals.total_qty.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="min-w-0 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 px-3 py-2 shadow-sm">
            <p className="text-xs font-medium leading-none text-white/80">Purchase Value</p>
            <p className="mt-1 truncate text-base font-black tabular-nums leading-tight text-white sm:text-lg">
              ₹{Math.round(grandTotals.purchase_value).toLocaleString("en-IN")}
            </p>
          </div>
          <div className="min-w-0 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2 shadow-sm">
            <p className="text-xs font-medium leading-none text-white/80">Sale Value</p>
            <p className="mt-1 truncate text-base font-black tabular-nums leading-tight text-white sm:text-lg">
              ₹{Math.round(grandTotals.sale_value).toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        {/* Main panel */}
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm print:border-0 print:shadow-none">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 print:hidden">
            <Select
              value={groupBy}
              onValueChange={(v) => {
                setGroupBy(v as ItemWiseStockGroupBy);
                setSearchQuery("");
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-[160px] border-slate-200 bg-slate-50 text-sm font-medium">
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

            <div className="relative min-w-[200px] max-w-lg flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={`Search ${groupLabel}…`}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 border-slate-200 bg-slate-50 pl-10 text-base focus:bg-white"
              />
            </div>

            <Select
              value={brandFilter}
              onValueChange={(v) => {
                setBrandFilter(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-[140px] border-slate-200 bg-slate-50 text-sm">
                <SelectValue placeholder={`All ${fieldLabels.brand}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All {fieldLabels.brand}</SelectItem>
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
              <SelectTrigger className="h-10 w-[140px] border-slate-200 bg-slate-50 text-sm">
                <SelectValue placeholder={`All ${fieldLabels.category}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All {fieldLabels.category}</SelectItem>
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
              <SelectTrigger className="h-10 w-[140px] border-slate-200 bg-slate-50 text-sm">
                <SelectValue placeholder={`All ${fieldLabels.style}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All {fieldLabels.style}</SelectItem>
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
              <SelectTrigger className="h-10 w-[140px] border-slate-200 bg-slate-50 text-sm">
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All Suppliers</SelectItem>
                {(filterOptions?.suppliers || []).map((sup) => (
                  <SelectItem key={sup} value={sup}>
                    {sup}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 gap-1 text-sm">
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}

            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportToExcel()}
                disabled={isExporting || grandTotals.group_count === 0}
                className="h-9 gap-1.5 border-slate-200 text-sm"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportToPDF()}
                disabled={isExporting || grandTotals.group_count === 0}
                className="h-9 gap-1.5 border-slate-200 text-sm"
              >
                <FileText className="h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>

          {listError ? (
            <div className="m-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Failed to load stock data: {(listError as Error).message}
            </div>
          ) : showTableLoading ? (
            <div className="p-2">
              <ReportSkeleton />
            </div>
          ) : (
            <>
              <div className="tab-scroll-stable min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
                <Table className="[&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="border-none bg-slate-800 hover:bg-slate-800">
                      <TableHead className="h-10 w-[72px] text-xs font-bold uppercase tracking-wide text-white">
                        Sr.No
                      </TableHead>
                      <TableHead className="h-10 text-xs font-bold uppercase tracking-wide text-white">
                        {groupLabel}
                      </TableHead>
                      <TableHead className="h-10 w-[120px] text-right text-xs font-bold uppercase tracking-wide text-white">
                        Stock
                      </TableHead>
                      <TableHead className="h-10 w-[150px] text-right text-xs font-bold uppercase tracking-wide text-white">
                        Purchase Value
                      </TableHead>
                      <TableHead className="h-10 w-[150px] text-right text-xs font-bold uppercase tracking-wide text-white">
                        Sales Value
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-base text-muted-foreground">
                          {hasActiveFilters ? "No stock data matches your filters." : "No stock data found."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedData.map((item, idx) => (
                        <TableRow key={`${item.key}-${idx}`} className="h-11 hover:bg-teal-50/80">
                          <TableCell className="py-2.5 text-sm font-medium tabular-nums text-muted-foreground">
                            {(currentPage - 1) * ITEM_WISE_STOCK_PAGE_SIZE + idx + 1}
                          </TableCell>
                          <TableCell className="py-2.5 text-base font-medium">{item.key}</TableCell>
                          <TableCell className="py-2.5 text-right text-base font-semibold tabular-nums">
                            {item.total_qty.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-base tabular-nums">
                            {item.purchase_value.toFixed(2)}
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-base tabular-nums">
                            {item.sale_value.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {grandTotals.group_count > 0 && (
                    <TableFooter className="sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-100 [&>tr]:border-0">
                      <TableRow className="hover:bg-slate-100">
                        <TableCell />
                        <TableCell className="py-3 text-base font-bold text-teal-700">Grand Totals</TableCell>
                        <TableCell className="py-3 text-right text-base font-bold tabular-nums">
                          {grandTotals.total_qty.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="py-3 text-right text-base font-bold tabular-nums">
                          {grandTotals.purchase_value.toFixed(2)}
                        </TableCell>
                        <TableCell className="py-3 text-right text-base font-bold tabular-nums">
                          {grandTotals.sale_value.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2 print:hidden">
                  <p className="text-sm tabular-nums text-slate-600">
                    Showing {pageStart.toLocaleString("en-IN")}–{pageEnd.toLocaleString("en-IN")} of{" "}
                    {totalCount.toLocaleString("en-IN")}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 border-slate-200 px-3 text-sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </Button>
                    <span className="px-1 text-sm font-medium tabular-nums text-slate-700">
                      Page {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 border-slate-200 px-3 text-sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
