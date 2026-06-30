import { useMemo, useState } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ItemWiseClosingStockPanel } from "@/components/reports/ItemWiseClosingStockPanel";
import type { ItemWiseStockFilters, ItemWiseStockGroupBy } from "@/utils/itemWiseStockQueries";

const ALL_VALUE = "__all__";

function normalizeFilterValue(value: string | undefined): string {
  return value && value !== ALL_VALUE ? value : ALL_VALUE;
}

export default function ItemWiseStockReport() {
  const { orgNavigate } = useOrgNavigation();
  const [filters, setFilters] = useState<ItemWiseStockFilters>({
    groupBy: "product_name",
    searchQuery: "",
    brandFilter: ALL_VALUE,
    categoryFilter: ALL_VALUE,
    departmentFilter: ALL_VALUE,
    supplierFilter: ALL_VALUE,
    barcodeFilter: "",
    closingStockFilter: "all",
  });
  const [currentPage, setCurrentPage] = useState(1);

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.itemWiseStock,
    undefined,
    useMemo(
      () => ({
        ...filters,
        currentPage,
      }),
      [filters, currentPage],
    ),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", (v) => setFilters((f) => ({ ...f, searchQuery: v }))],
          ["groupBy", (v) => setFilters((f) => ({ ...f, groupBy: v as ItemWiseStockGroupBy }))],
          ["brandFilter", (v) => setFilters((f) => ({ ...f, brandFilter: normalizeFilterValue(v) }))],
          ["categoryFilter", (v) => setFilters((f) => ({ ...f, categoryFilter: normalizeFilterValue(v) }))],
          ["departmentFilter", (v) => setFilters((f) => ({ ...f, departmentFilter: normalizeFilterValue(v) }))],
          ["supplierFilter", (v) => setFilters((f) => ({ ...f, supplierFilter: normalizeFilterValue(v) }))],
          ["barcodeFilter", (v) => setFilters((f) => ({ ...f, barcodeFilter: v }))],
          ["closingStockFilter", (v) =>
            setFilters((f) => ({
              ...f,
              closingStockFilter: (v === "in_stock" || v === "zero_stock" ? v : "all") as ItemWiseStockFilters["closingStockFilter"],
            }))],
        ],
        numbers: [["currentPage", setCurrentPage]],
      });
    },
  );

  return (
    <div className="item-wise-stock-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3 print:bg-white print:p-2">
      <div className="mb-2 shrink-0 print:hidden">
        <Button variant="outline" size="sm" className="h-9 shrink-0 px-3 text-sm" onClick={() => orgNavigate("/reports")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Reports
        </Button>
      </div>
      <ItemWiseClosingStockPanel
        filters={filters}
        onFiltersChange={setFilters}
        currentPage={currentPage}
        onCurrentPageChange={setCurrentPage}
      />
    </div>
  );
}
