import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Package, Search, Layers, IndianRupee, AlertTriangle, XCircle, CheckCircle, ArrowUpDown, ScanBarcode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMobileScan } from "@/contexts/MobileScanContext";
import { cn } from "@/lib/utils";
import { MOBILE_BOTTOM_NAV_HEIGHT } from "@/lib/mobileShell";
import { STALE_LIVE, STALE_PAGINATED, STALE_FREQUENT } from "@/lib/queryStaleTimes";
import {
  fetchItemWiseStockPage,
  fetchItemWiseStockTotals,
  type ItemWiseStockFilters,
} from "@/utils/itemWiseStockQueries";
import {
  fetchStockReportStatusVariantCounts,
  fetchWebStockReportTotals,
} from "@/utils/mobileStockReportQuery";
import {
  ownerStockSearchToRpc,
  productClosingFilterForStatus,
  productRowMatchesStatus,
  STOCK_REPORT_LOW_THRESHOLD,
  stockQtyStatus,
  type StockReportStatusFilter,
} from "@/utils/stockReportWebParity";

const fmtShort = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` :
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` :
  v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` :
  `₹${Math.round(v).toLocaleString("en-IN")}`;

/** Clears OwnerBottomNav + safe-area when the desktop status bar is hidden on mobile. */
const LIST_BOTTOM_CLEARANCE = `calc(${MOBILE_BOTTOM_NAV_HEIGHT} + env(safe-area-inset-bottom, 0px) + 0.5rem)`;

interface Props {
  onViewProduct: (productId: string) => void;
}

const PAGE_SIZE = 30;

const BASE_ITEM_FILTERS: Omit<ItemWiseStockFilters, "searchQuery" | "barcodeFilter" | "closingStockFilter"> = {
  groupBy: "product_name",
  brandFilter: "__all__",
  categoryFilter: "__all__",
  departmentFilter: "__all__",
  supplierFilter: "__all__",
};

export const OwnerStockOverview = ({ onViewProduct }: Props) => {
  const { currentOrganization } = useOrganization();
  const { openScan } = useMobileScan();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockReportStatusFilter>("all");
  const [sortBy, setSortBy] = useState<"name" | "stock_low" | "stock_high" | "brand">("name");
  const [showSort, setShowSort] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  const orgId = currentOrganization?.id;
  const searchRpc = ownerStockSearchToRpc(debouncedSearch);
  const listFilters: ItemWiseStockFilters = {
    ...BASE_ITEM_FILTERS,
    searchQuery: searchRpc.searchQuery,
    barcodeFilter: searchRpc.barcodeFilter,
    closingStockFilter: productClosingFilterForStatus(stockFilter),
  };
  const listStale = debouncedSearch.trim() ? STALE_LIVE : STALE_PAGINATED;

  const { data: webTotals, isLoading: totalsLoading } = useQuery({
    queryKey: ["stock-report-global-totals", orgId],
    queryFn: () => fetchWebStockReportTotals(orgId!),
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
  });

  const { data: productTotals } = useQuery({
    queryKey: ["owner-stock-product-totals", orgId],
    queryFn: () =>
      fetchItemWiseStockTotals(orgId!, {
        ...BASE_ITEM_FILTERS,
        searchQuery: "",
        barcodeFilter: "",
        closingStockFilter: "all",
      }),
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
  });

  const { data: statusCounts } = useQuery({
    queryKey: ["owner-stock-status-counts", orgId],
    queryFn: () => fetchStockReportStatusVariantCounts(orgId!),
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
  });

  const {
    data: productPages,
    isLoading: listLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["owner-stock-product-pages", orgId, debouncedSearch, stockFilter],
    queryFn: ({ pageParam }) => fetchItemWiseStockPage(orgId!, listFilters, pageParam, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
      if (lastPage.rows.length === 0) return undefined;
      return loaded < lastPage.totalCount ? pages.length + 1 : undefined;
    },
    enabled: !!orgId,
    staleTime: listStale,
  });

  const loadedRows = useMemo(
    () => (productPages?.pages ?? []).flatMap((p) => p.rows),
    [productPages],
  );

  const filteredList = useMemo(() => {
    let list = loadedRows.filter((row) =>
      productRowMatchesStatus(row.total_qty, stockFilter, STOCK_REPORT_LOW_THRESHOLD),
    );
    switch (sortBy) {
      case "stock_low":
        list = [...list].sort((a, b) => a.total_qty - b.total_qty);
        break;
      case "stock_high":
        list = [...list].sort((a, b) => b.total_qty - a.total_qty);
        break;
      case "brand":
        list = [...list].sort((a, b) => (a.brand || "").localeCompare(b.brand || ""));
        break;
      default:
        list = [...list].sort((a, b) => (a.key || "").localeCompare(b.key || ""));
        break;
    }
    return list;
  }, [loadedRows, stockFilter, sortBy]);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    if (filteredList.length >= visibleCount) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, filteredList.length, visibleCount, fetchNextPage]);

  const visibleProducts = filteredList.slice(0, visibleCount);
  const serverProductCount = productPages?.pages[0]?.totalCount;
  const listCountLabel =
    stockFilter === "in" || stockFilter === "low"
      ? filteredList.length + (hasNextPage ? "+" : "")
      : (serverProductCount ?? filteredList.length);

  const summary = {
    totalProducts: productTotals?.group_count ?? 0,
    totalQty: webTotals?.totalStock ?? 0,
    totalVariants: webTotals?.variantCount ?? 0,
    purchaseValue: webTotals?.stockValue ?? 0,
    saleValue: webTotals?.saleValue ?? 0,
    inStock: statusCounts?.inStock ?? 0,
    lowStock: statusCounts?.low ?? 0,
    outOfStock: statusCounts?.out ?? 0,
  };

  const isLoading = totalsLoading || listLoading;

  const stockColor = (qty: number) => {
    const s = stockQtyStatus(qty);
    return s === "out" ? "text-destructive" : s === "low" ? "text-warning" : "text-success";
  };
  const stockBg = (qty: number) => {
    const s = stockQtyStatus(qty);
    return s === "out" ? "bg-destructive" : s === "low" ? "bg-warning" : "bg-success";
  };

  return (
    <div className="bg-muted/30 -mx-3 sm:-mx-4 pb-6">
      <div className="sticky top-0 z-20 shrink-0 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="px-4 py-3">
          <h1 className="text-base font-semibold text-foreground mb-3">Stock Overview</h1>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search product, brand, barcode..."
                className="pl-9 h-9 text-sm rounded-xl bg-muted/50"
              />
            </div>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl"
              onClick={openScan}
              aria-label="Scan barcode"
            >
              <ScanBarcode className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 pt-4">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: "Total Qty", value: summary.totalQty.toLocaleString("en-IN"), icon: Package, tint: "bg-primary/10", color: "text-primary" },
            { label: "Variants", value: summary.totalVariants.toLocaleString("en-IN"), icon: Layers, tint: "bg-info/10", color: "text-info" },
            { label: "Purchase Value", value: fmtShort(summary.purchaseValue), icon: IndianRupee, tint: "bg-warning/10", color: "text-warning" },
            { label: "Sale Value", value: fmtShort(summary.saleValue), icon: IndianRupee, tint: "bg-success/10", color: "text-success" },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm min-h-[5.5rem] flex flex-col">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", c.tint)}>
                    <Icon className={cn("h-5 w-5", c.color)} />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{c.label}</span>
                </div>
                {totalsLoading ? <Skeleton className="h-6 w-16 mt-auto" /> : (
                  <p className="text-lg font-bold text-foreground tabular-nums mt-auto leading-tight break-all">{c.value}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { key: "all" as const, label: "All", count: summary.totalVariants, icon: Package, color: "text-foreground" },
            { key: "in" as const, label: "In Stock", count: summary.inStock, icon: CheckCircle, color: "text-success" },
            { key: "low" as const, label: "Low", count: summary.lowStock, icon: AlertTriangle, color: "text-warning" },
            { key: "out" as const, label: "Out", count: summary.outOfStock, icon: XCircle, color: "text-destructive" },
          ].map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => { setStockFilter(chip.key); setVisibleCount(PAGE_SIZE); }}
                className={cn(
                  "flex flex-col items-center justify-center min-h-[3.25rem] py-2 px-1 rounded-xl text-[10px] font-semibold transition-all touch-manipulation",
                  stockFilter === chip.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border/40"
                )}
              >
                <Icon className={cn("h-4 w-4 mb-0.5 shrink-0", stockFilter === chip.key ? "text-primary-foreground" : chip.color)} />
                <span className="tabular-nums leading-none">{chip.count.toLocaleString("en-IN")}</span>
                <span className="text-[9px] opacity-80 leading-tight text-center whitespace-nowrap">{chip.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {listCountLabel} products
            {summary.totalProducts > 0 && stockFilter === "all" && !debouncedSearch.trim()
              ? ` · ${summary.totalProducts.toLocaleString("en-IN")} total`
              : ""}
          </p>
          <button type="button" onClick={() => setShowSort(!showSort)} className="flex items-center gap-1 text-xs text-primary font-medium touch-manipulation">
            <ArrowUpDown className="h-4 w-4" /> Sort
          </button>
        </div>
        {showSort && (
          <div className="mt-2 flex gap-2 flex-wrap">
            {([
              { key: "name", label: "Name" },
              { key: "stock_low", label: "Stock ↑" },
              { key: "stock_high", label: "Stock ↓" },
              { key: "brand", label: "Brand" },
            ] as const).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => { setSortBy(s.key); setShowSort(false); }}
                className={cn(
                  "text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all touch-manipulation",
                  sortBy === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 mt-3" style={{ paddingBottom: LIST_BOTTOM_CLEARANCE }}>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm">
                <div className="flex justify-between">
                  <div><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-24" /></div>
                  <div className="text-right"><Skeleton className="h-5 w-10" /><Skeleton className="h-3 w-16 mt-1" /></div>
                </div>
              </div>
            ))}
          </div>
        ) : visibleProducts.length > 0 ? (
          <div className="space-y-2">
            {visibleProducts.map((p, idx) => {
              const qty = p.total_qty;
              const unitSale = qty > 0 ? p.sale_value / qty : 0;
              const productId = p.product_id;
              return (
                <button
                  key={productId || `${p.key}-${idx}`}
                  type="button"
                  onClick={() => { if (productId) onViewProduct(productId); }}
                  disabled={!productId}
                  className="w-full bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm active:scale-[0.98] transition-all touch-manipulation text-left disabled:opacity-60"
                >
                  <div className="flex justify-between items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground truncate">{p.key}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {[p.brand, p.category].filter(Boolean).join(" • ") || "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className={cn("w-2 h-2 rounded-full", stockBg(qty))} />
                        <span className={cn("text-base font-bold tabular-nums", stockColor(qty))}>
                          {qty}
                        </span>
                      </div>
                      {unitSale > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">₹{Math.round(unitSale).toLocaleString("en-IN")}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {(visibleCount < filteredList.length || hasNextPage) && (
              <button
                type="button"
                onClick={() => {
                  setVisibleCount((c) => c + PAGE_SIZE);
                  if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
                }}
                className="w-full text-center text-xs font-semibold text-primary py-3 active:opacity-70 touch-manipulation"
              >
                {isFetchingNextPage ? "Loading…" : `Load More${hasNextPage ? "" : ` (${filteredList.length - visibleCount} remaining)`}`}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">No products found</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search or filter</p>
          </div>
        )}
      </div>
    </div>
  );
};
