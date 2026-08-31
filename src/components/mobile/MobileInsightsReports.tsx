import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { localDayBounds } from "@/lib/localDayBounds";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import { STALE_LIVE, STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { MobileReportSearchBar } from "@/components/mobile/MobileReportSearchBar";
import { MobileReportTable, type ReportTableColumn } from "@/components/mobile/MobileReportTable";
import { ReportExportButton } from "@/components/mobile/ReportExportButton";
import {
  countActiveReportFilters,
  DEFAULT_STOCK_FILTERS,
  MobileReportFilterButton,
  MobileReportFilterSheet,
  type FilterValue,
} from "@/components/mobile/MobileReportFilterSheet";
import { buildCsvFromReportTable } from "@/utils/reportCsvExport";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";
import { fetchMobileStockFilterOptions } from "@/utils/mobileStockFilterOptions";
import {
  fetchMobileStockFilteredTotals,
  fetchMobileStockReportPages,
  fetchMobileStockSuppliers,
} from "@/utils/mobileStockReportQuery";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/mobile/MobileReportMetricCard";
import {
  getSaleReportDiscountAmount,
  getSaleReportGrossAmount,
  getSaleReportNetAmount,
} from "@/utils/cashierReportUtils";
import {
  fetchItemWiseStockPage,
  fetchItemWiseStockTotals,
  type ItemWiseStockClosingFilter,
  type ItemWiseStockFilters,
} from "@/utils/itemWiseStockQueries";
import { aggregateForTab, loadProfitDataset } from "@/utils/netProfitAnalysis";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

const LoadingRows = () => (
  <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
);

const EmptyState = ({ message = "No data for selected period" }: { message?: string }) => (
  <div className="text-center py-12">
    <p className="text-muted-foreground text-sm">{message}</p>
  </div>
);

type DateProps = { orgId?: string; start?: string; end?: string };

const ITEM_STOCK_FILTERS: ItemWiseStockFilters = {
  groupBy: "product_name",
  searchQuery: "",
  brandFilter: "__all__",
  categoryFilter: "__all__",
  departmentFilter: "__all__",
  supplierFilter: "__all__",
  barcodeFilter: "",
  closingStockFilter: "all",
};

function inStockRpcArg(status: FilterValue["stockStatus"]): boolean | undefined {
  if (status === "in_stock") return true;
  if (status === "zero_stock") return false;
  return undefined;
}

async function fetchSaleItemProductMeta(orgId: string, productIds: string[]) {
  const unique = [...new Set(productIds.filter(Boolean))];
  const metaById = new Map<string, { brand?: string | null; category?: string | null }>();
  if (unique.length === 0) return metaById;
  const batchSize = 500;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batchIds = unique.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("products")
      .select("id, brand, category")
      .eq("organization_id", orgId)
      .in("id", batchIds);
    if (error) throw error;
    for (const p of data || []) metaById.set(p.id, p);
  }
  return metaById;
}

export function MobileCashierReport({ orgId, start, end }: DateProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-daily-cashier", orgId, start, end],
    enabled: !!orgId && !!start && !!end,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const { startIso, endIso } = localDayBounds(start!, end!);
        const { data: sales, error } = await supabase
          .from("sales")
          .select(
            "id, sale_number, customer_name, gross_amount, discount_amount, flat_discount_amount, points_redeemed_amount, round_off, net_amount, cash_amount, card_amount, upi_amount, sale_return_adjust, is_cancelled",
          )
          .eq("organization_id", orgId!)
          .is("deleted_at", null)
          .eq("is_cancelled", false)
          .gte("sale_date", startIso)
          .lte("sale_date", endIso)
          .order("sale_date", { ascending: false })
          .limit(400);
        if (error) throw error;
        return sales || [];
      }),
  });

  const rows = useMemo(
    () =>
      (data || []).map((s) => ({
        id: s.id,
        bill: s.sale_number,
        customer: s.customer_name || "Walk-in",
        cash: Number(s.cash_amount) || 0,
        upi: Number(s.upi_amount) || 0,
        card: Number(s.card_amount) || 0,
        disc: getSaleReportDiscountAmount(s),
        net: getSaleReportNetAmount(s),
        gross: getSaleReportGrossAmount(s),
      })),
    [data],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          cash: a.cash + r.cash,
          upi: a.upi + r.upi,
          card: a.card + r.card,
          net: a.net + r.net,
          gross: a.gross + r.gross,
        }),
        { cash: 0, upi: 0, card: 0, net: 0, gross: 0 },
      ),
    [rows],
  );

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    { key: "bill", header: "Bill No", sticky: true, minWidth: "min-w-[96px]", render: (r) => <span className="font-semibold">{r.bill}</span> },
    { key: "customer", header: "Customer", minWidth: "min-w-[100px]", render: (r) => <span className="truncate block max-w-[140px]">{r.customer}</span> },
    { key: "cash", header: "Cash", align: "right", render: (r) => fmt(r.cash) },
    { key: "upi", header: "UPI", align: "right", render: (r) => fmt(r.upi) },
    { key: "card", header: "Card", align: "right", render: (r) => fmt(r.card) },
    { key: "disc", header: "Disc", align: "right", render: (r) => fmt(r.disc) },
    { key: "net", header: "Net", align: "right", render: (r) => <span className="font-bold">{fmt(r.net)}</span> },
  ];

  if (isLoading) return <LoadingRows />;
  if (!rows.length) return <EmptyState />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Gross" value={fmt(totals.gross)} />
        <MetricCard label="Net" value={fmt(totals.net)} color="text-emerald-600" />
        <MetricCard label="Cash" value={fmt(totals.cash)} color="text-emerald-600" />
        <MetricCard label="UPI" value={fmt(totals.upi)} color="text-blue-600" />
        <MetricCard label="Card" value={fmt(totals.card)} color="text-violet-600" />
      </div>
      <MobileReportTable variant="insights" columns={columns} rows={rows} rowKey={(r) => r.id} />
    </div>
  );
}

type ItemWiseSaleRow = {
  key: string;
  name: string;
  size: string;
  brand: string;
  category: string;
  qty: number;
  amount: number;
};

function useItemWiseSalesAggregation(orgId?: string, start?: string, end?: string) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-item-wise-sales-raw", orgId, start, end],
    enabled: !!orgId && !!start && !!end,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const { startIso, endIso } = localDayBounds(start!, end!);
        const { data: sales, error } = await supabase
          .from("sales")
          .select("id")
          .eq("organization_id", orgId!)
          .is("deleted_at", null)
          .eq("is_cancelled", false)
          .gte("sale_date", startIso)
          .lte("sale_date", endIso)
          .order("sale_date", { ascending: false })
          .limit(800);
        if (error) throw error;
        if (!sales?.length) {
          return {
            saleItems: [] as Awaited<ReturnType<typeof fetchAllSaleItems>>,
            metaById: new Map<string, { brand?: string | null; category?: string | null }>(),
          };
        }
        const saleItems = await fetchAllSaleItems(sales.map((s) => s.id));
        const productIds = [...new Set((saleItems || []).map((i: { product_id?: string }) => i.product_id).filter(Boolean))] as string[];
        const metaById = await fetchSaleItemProductMeta(orgId!, productIds);
        return { saleItems, metaById };
      }, 25_000),
  });

  const rows = useMemo(() => {
    const map = new Map<string, ItemWiseSaleRow>();
    const items = data?.saleItems || [];
    const metaById = data?.metaById ?? new Map();
    items.forEach((i: { product_id?: string; product_name?: string; size?: string; quantity?: number; line_total?: number }) => {
      const name = i.product_name || "—";
      const size = i.size || "—";
      const key = `${name}|${size}`;
      const meta = i.product_id ? metaById.get(i.product_id) : undefined;
      const ex = map.get(key) || {
        key,
        name,
        size,
        brand: (meta?.brand || "").trim(),
        category: (meta?.category || "").trim(),
        qty: 0,
        amount: 0,
      };
      ex.qty += Number(i.quantity) || 0;
      ex.amount += Number(i.line_total) || 0;
      map.set(key, ex);
    });
    return [...map.values()];
  }, [data]);

  return { rows, isLoading, isError, refetch, hasSaleLines: (data?.saleItems.length ?? 0) > 0 };
}

export function MobileItemWiseSalesReport({ orgId, start, end }: DateProps) {
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterValue>(DEFAULT_STOCK_FILTERS);
  const tableRef = useRef<HTMLDivElement>(null);
  const activeCount = countActiveReportFilters(filters, { includeStockStatus: false });
  const { rows: allRows, isLoading, isError, refetch, hasSaleLines } = useItemWiseSalesAggregation(orgId, start, end);

  const { data: optionLists } = useQuery({
    queryKey: ["stock-filter-options", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    retry: 1,
    queryFn: () => withMobileQueryTimeout(() => fetchMobileStockFilterOptions(orgId!), 20_000),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const brandFilter = filters.brand !== "__all__" && filters.brand !== "all" ? filters.brand : "";
    const categoryFilter = filters.category !== "__all__" && filters.category !== "all" ? filters.category : "";
    return allRows
      .filter((r) => {
        if (q && !r.name.toLowerCase().includes(q) && !r.size.toLowerCase().includes(q)) return false;
        if (brandFilter && r.brand !== brandFilter) return false;
        if (categoryFilter && r.category !== categoryFilter) return false;
        return true;
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 250);
  }, [allRows, search, filters]);

  const totals = useMemo(
    () => rows.reduce((a, r) => ({ qty: a.qty + r.qty, amount: a.amount + r.amount }), { qty: 0, amount: 0 }),
    [rows],
  );

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    {
      key: "product",
      header: "Product Name",
      sticky: true,
      minWidth: "min-w-[120px]",
      csvText: (r) => r.name,
      render: (r) => <span className="font-semibold truncate block max-w-[160px]">{r.name}</span>,
    },
    { key: "size", header: "Pack", align: "right", csvText: (r) => r.size, render: (r) => r.size },
    { key: "qty", header: "Qty", align: "right", csvText: (r) => String(r.qty), render: (r) => r.qty },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      csvText: (r) => fmt(r.qty ? r.amount / r.qty : 0),
      render: (r) => fmt(r.qty ? r.amount / r.qty : 0),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      csvText: (r) => fmt(r.amount),
      render: (r) => <span className="font-bold">{fmt(r.amount)}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search product or size…" />
      <MobileReportFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onApply={setFilters}
        brands={optionLists?.brands ?? []}
        categories={optionLists?.categories ?? []}
        showStockStatus={false}
      />
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <div className="flex items-center gap-1">
          <MobileReportFilterButton activeCount={activeCount} onClick={() => setFilterOpen(true)} />
          {rows.length ? (
            <ReportExportButton
              fileBaseName={`item-wise-sale-${format(new Date(), "ddMMyyyy")}`}
              buildCsv={() => buildCsvFromReportTable(columns, rows)}
              tableRef={tableRef}
            />
          ) : null}
        </div>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground text-sm">Could not load item-wise sales.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">
            Try again
          </button>
        </div>
      ) : !rows.length ? (
        <EmptyState
          message={
            hasSaleLines || search.trim() || activeCount
              ? "No sales match these filters"
              : "No sales in this date range. Try Week, Month, or Custom."
          }
        />
      ) : (
        <>
          <div className="flex gap-2">
            <MetricCard label="Qty" value={String(totals.qty)} />
            <MetricCard label="Amount" value={fmt(totals.amount)} color="text-emerald-600" />
            <MetricCard label="Items" value={String(rows.length)} />
          </div>
          <p className="text-sm font-semibold text-sky-700">Item-wise Sale</p>
          <MobileReportTable ref={tableRef} variant="statement" columns={columns} rows={rows} rowKey={(r) => r.key} />
        </>
      )}
    </div>
  );
}

export function MobileTopSellingProductsReport({ orgId, start, end }: DateProps) {
  const { rows: allRows, isLoading, isError, refetch } = useItemWiseSalesAggregation(orgId, start, end);
  const [sortBy, setSortBy] = useState<"amount" | "qty">("amount");
  const tableRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const sorted = [...allRows].sort((a, b) => (sortBy === "amount" ? b.amount - a.amount : b.qty - a.qty));
    return sorted.slice(0, 50).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [allRows, sortBy]);

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    {
      key: "rank",
      header: "#",
      sticky: true,
      minWidth: "min-w-[36px]",
      csvText: (r) => String(r.rank),
      render: (r) => (
        <span
          className={cn(
            "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
            r.rank === 1
              ? "bg-amber-400 text-amber-950"
              : r.rank === 2
                ? "bg-slate-300 text-slate-800"
                : r.rank === 3
                  ? "bg-orange-300 text-orange-950"
                  : "text-muted-foreground",
          )}
        >
          {r.rank}
        </span>
      ),
    },
    {
      key: "product",
      header: "Product Name",
      minWidth: "min-w-[120px]",
      csvText: (r) => r.name,
      render: (r) => <span className="font-semibold truncate block max-w-[150px]">{r.name}</span>,
    },
    { key: "size", header: "Pack", align: "right", csvText: (r) => r.size, render: (r) => r.size },
    { key: "qty", header: "Qty", align: "right", csvText: (r) => String(r.qty), render: (r) => r.qty },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      csvText: (r) => fmt(r.amount),
      render: (r) => <span className="font-bold">{fmt(r.amount)}</span>,
    },
  ];

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load top selling products.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">
          Try again
        </button>
      </div>
    );
  }
  if (!allRows.length) return <EmptyState message="No sales in this date range. Try Week, Month, or Custom." />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Top 50</p>
        <ReportExportButton
          fileBaseName={`top-selling-products-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(columns, rows)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-1 rounded-lg border border-border/40 p-0.5 w-fit">
        {(["amount", "qty"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSortBy(k)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-semibold touch-manipulation",
              sortBy === k ? "bg-primary/10 text-primary" : "text-muted-foreground",
            )}
          >
            By {k === "amount" ? "Revenue" : "Quantity"}
          </button>
        ))}
      </div>
      <MobileReportTable ref={tableRef} variant="statement" columns={columns} rows={rows} rowKey={(r) => r.key} />
    </div>
  );
}

function isExcludedHoldSale(s: { payment_status?: string | null; sale_number?: string | null }) {
  return s.payment_status === "hold" || (s.payment_status === "pending" && String(s.sale_number || "").startsWith("Hold/"));
}

function SalesGroupReport({
  orgId,
  start,
  end,
  groupBy,
}: DateProps & { groupBy: "customer" | "salesman" }) {
  const [search, setSearch] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);
  const isCustomer = groupBy === "customer";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [isCustomer ? "rpt-customer-wise-sales" : "rpt-salesman-wise-sales", orgId, start, end],
    enabled: !!orgId && !!start && !!end,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const { startIso, endIso } = localDayBounds(start!, end!);
        const { data: sales, error } = await supabase
          .from("sales")
          .select("customer_id, customer_name, salesman, net_amount, gross_amount, discount_amount, flat_discount_amount, points_redeemed_amount, round_off, sale_return_adjust, sale_number, payment_status")
          .eq("organization_id", orgId!)
          .is("deleted_at", null)
          .eq("is_cancelled", false)
          .neq("payment_status", "cancelled")
          .gte("sale_date", startIso)
          .lte("sale_date", endIso)
          .limit(2000);
        if (error) throw error;
        return (sales || []).filter((s) => !isExcludedHoldSale(s));
      }, 25_000),
  });

  const rows = useMemo(() => {
    const map = new Map<string, { key: string; name: string; bills: number; amount: number }>();
    (data || []).forEach((s) => {
      const key = isCustomer
        ? s.customer_id || s.customer_name || "walk-in"
        : (s.salesman || "").trim() || "Unassigned";
      const name = isCustomer ? s.customer_name || "Walk-in" : (s.salesman || "").trim() || "Unassigned";
      const ex = map.get(key) || { key, name, bills: 0, amount: 0 };
      ex.bills += 1;
      ex.amount += getSaleReportNetAmount(s);
      map.set(key, ex);
    });
    const q = search.trim().toLowerCase();
    return [...map.values()]
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount);
  }, [data, search, isCustomer]);

  const totals = useMemo(
    () => rows.reduce((a, r) => ({ bills: a.bills + r.bills, amount: a.amount + r.amount }), { bills: 0, amount: 0 }),
    [rows],
  );

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    {
      key: "name",
      header: isCustomer ? "Customer" : "Salesman",
      sticky: true,
      minWidth: "min-w-[140px]",
      csvText: (r) => r.name,
      render: (r) => <span className="font-semibold truncate block max-w-[160px]">{r.name}</span>,
    },
    { key: "bills", header: "Bills", align: "right", csvText: (r) => String(r.bills), render: (r) => r.bills },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      csvText: (r) => fmt(r.amount),
      render: (r) => <span className="font-bold">{fmt(r.amount)}</span>,
    },
  ];

  const title = isCustomer ? "Customer-wise Sale" : "Salesman-wise Sale";
  const fileBase = isCustomer ? "customer-wise-sale" : "salesman-wise-sale";
  const countLabel = isCustomer ? "Customers" : "Salesmen";

  return (
    <div className="space-y-3">
      <MobileReportSearchBar
        value={search}
        onChange={setSearch}
        placeholder={isCustomer ? "Search customer…" : "Search salesman…"}
      />
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        {rows.length ? (
          <ReportExportButton
            fileBaseName={`${fileBase}-${format(new Date(), "ddMMyyyy")}`}
            buildCsv={() => buildCsvFromReportTable(columns, rows)}
            tableRef={tableRef}
          />
        ) : null}
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground text-sm">Could not load {isCustomer ? "customer-wise" : "salesman-wise"} sales.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">
            Try again
          </button>
        </div>
      ) : !rows.length ? (
        <EmptyState
          message={
            search.trim()
              ? "No rows match this search"
              : "No sales in this date range. Try Week, Month, or Custom."
          }
        />
      ) : (
        <>
          <div className="flex gap-2">
            <MetricCard label={countLabel} value={String(rows.length)} />
            <MetricCard label="Bills" value={String(totals.bills)} />
            <MetricCard label="Amount" value={fmt(totals.amount)} color="text-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-sky-700">{title}</p>
          <MobileReportTable ref={tableRef} variant="statement" columns={columns} rows={rows} rowKey={(r) => r.key} />
        </>
      )}
    </div>
  );
}

export function MobileCustomerWiseSalesReport(props: DateProps) {
  return <SalesGroupReport {...props} groupBy="customer" />;
}

export function MobileSalesmanWiseSalesReport(props: DateProps) {
  return <SalesGroupReport {...props} groupBy="salesman" />;
}

export function MobileItemWiseStockReport({ orgId }: { orgId?: string }) {
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterValue>(DEFAULT_STOCK_FILTERS);
  const tableRef = useRef<HTMLDivElement>(null);
  const rpcFilters = useMemo<ItemWiseStockFilters>(
    () => ({
      ...ITEM_STOCK_FILTERS,
      searchQuery: search,
      brandFilter: filters.brand,
      categoryFilter: filters.category,
      closingStockFilter:
        filters.stockStatus === "in_stock" || filters.stockStatus === "zero_stock"
          ? (filters.stockStatus as ItemWiseStockClosingFilter)
          : "all",
    }),
    [search, filters],
  );
  const activeCount = countActiveReportFilters(filters);

  const { data: options } = useQuery({
    queryKey: ["stock-filter-options", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    retry: 1,
    queryFn: () => withMobileQueryTimeout(() => fetchMobileStockFilterOptions(orgId!), 20_000),
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-item-wise-stock", orgId, search, filters],
    enabled: !!orgId,
    staleTime: search.trim() || activeCount ? STALE_LIVE : STALE_FREQUENT,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const [page, totals] = await Promise.all([
          fetchItemWiseStockPage(orgId!, rpcFilters, 1, 150),
          fetchItemWiseStockTotals(orgId!, rpcFilters),
        ]);
        return { rows: page.rows, totals };
      }, 25_000),
  });

  const columns: ReportTableColumn<NonNullable<typeof data>["rows"][number]>[] = [
    {
      key: "product",
      header: "Product",
      sticky: true,
      minWidth: "min-w-[120px]",
      csvText: (r) => r.key,
      render: (r) => <span className="font-semibold truncate block max-w-[160px]">{r.key}</span>,
    },
    { key: "qty", header: "Stock", align: "right", csvText: (r) => String(r.total_qty), render: (r) => <span className="font-bold">{r.total_qty}</span> },
    { key: "pur", header: "Pur. Value", align: "right", csvText: (r) => fmt(r.purchase_value), render: (r) => fmt(r.purchase_value) },
    { key: "sale", header: "Sale Value", align: "right", csvText: (r) => fmt(r.sale_value), render: (r) => fmt(r.sale_value) },
  ];

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search product…" />
      <MobileReportFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onApply={setFilters}
        brands={options?.brands ?? []}
        categories={options?.categories ?? []}
      />
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <div className="flex items-center gap-1">
          <MobileReportFilterButton activeCount={activeCount} onClick={() => setFilterOpen(true)} />
          {data?.rows.length ? (
            <ReportExportButton
              fileBaseName={`item-wise-stock-${format(new Date(), "ddMMyyyy")}`}
              buildCsv={() => buildCsvFromReportTable(columns, data.rows)}
              tableRef={tableRef}
            />
          ) : null}
        </div>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground text-sm">Could not load item-wise stock.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">
            Try again
          </button>
        </div>
      ) : !data?.rows.length ? (
        <EmptyState message="No stock rows found" />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <MetricCard label="Groups" value={String(data.totals.group_count)} />
            <MetricCard label="Qty" value={String(Math.round(data.totals.total_qty))} />
            <MetricCard label="Pur. Value" value={fmt(data.totals.purchase_value)} color="text-orange-600" />
            <MetricCard label="Sale Value" value={fmt(data.totals.sale_value)} color="text-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-sky-700">Item-wise Stock</p>
          <MobileReportTable ref={tableRef} variant="statement" columns={columns} rows={data.rows} rowKey={(r) => r.key} />
        </>
      )}
    </div>
  );
}

export function MobileNetProfitReport({ orgId, start, end }: DateProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-net-profit", orgId, start, end],
    enabled: !!orgId && !!start && !!end,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(() => loadProfitDataset(orgId!, start!, end!)),
  });

  const rows = useMemo(() => {
    if (!data) return [];
    return aggregateForTab(data.lines, "product-wise").slice(0, 200);
  }, [data]);

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    {
      key: "product",
      header: "Product",
      sticky: true,
      minWidth: "min-w-[120px]",
      render: (r) => (
        <div className="min-w-[120px] max-w-[160px]">
          <p className="font-semibold truncate">{r.label}</p>
          {r.secondary ? <p className="text-[11px] text-muted-foreground truncate">{r.secondary}</p> : null}
        </div>
      ),
    },
    { key: "qty", header: "Qty", align: "right", render: (r) => r.itemsSold },
    { key: "net", header: "Net Sales", align: "right", render: (r) => fmt(r.netSales) },
    { key: "cogs", header: "COGS", align: "right", render: (r) => fmt(r.totalCOGS) },
    {
      key: "gp",
      header: "Profit",
      align: "right",
      render: (r) => (
        <span className={cn("font-bold", r.grossProfit >= 0 ? "text-emerald-600" : "text-destructive")}>
          {fmt(r.grossProfit)}
        </span>
      ),
    },
    {
      key: "margin",
      header: "Margin %",
      align: "right",
      render: (r) => `${r.marginPercent.toFixed(1)}%`,
    },
  ];

  if (isLoading) return <LoadingRows />;
  if (!data || !rows.length) return <EmptyState />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Net Sales" value={fmt(data.totals.netSales)} color="text-emerald-600" />
        <MetricCard label="COGS" value={fmt(data.totals.totalCOGS)} color="text-orange-600" />
        <MetricCard
          label="Profit"
          value={fmt(data.totals.grossProfit)}
          color={data.totals.grossProfit >= 0 ? "text-blue-600" : "text-destructive"}
        />
        <MetricCard label="Margin %" value={`${data.totals.marginPercent.toFixed(1)}%`} />
      </div>
      <MobileReportTable variant="insights" columns={columns} rows={rows} rowKey={(r) => r.key} />
    </div>
  );
}

export function MobileStockReport({ orgId }: { orgId?: string }) {
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterValue>(DEFAULT_STOCK_FILTERS);
  const tableRef = useRef<HTMLDivElement>(null);
  const activeCount = countActiveReportFilters(filters);
  const inStock = inStockRpcArg(filters.stockStatus);
  const hasRpcFilters = activeCount > 0 || !!search.trim() || !!supplier.trim();

  const { data: totals } = useQuery({
    queryKey: ["rpt-stock-report-totals", orgId, search, supplier, filters, hasRpcFilters],
    enabled: !!orgId,
    staleTime: hasRpcFilters ? STALE_LIVE : STALE_FREQUENT,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        if (hasRpcFilters) {
          return fetchMobileStockFilteredTotals(orgId!, {
            search,
            supplier: supplier.trim() || undefined,
            brand: filters.brand,
            category: filters.category,
            inStock,
          });
        }
        const { data, error } = await supabase.rpc("get_stock_report_totals", {
          p_organization_id: orgId!,
        });
        if (error) throw error;
        const row = data as { total_stock?: number; stock_value?: number; sale_value?: number; variant_count?: number } | null;
        return {
          qty: Number(row?.total_stock ?? 0),
          pur: Number(row?.stock_value ?? 0),
          sale: Number(row?.sale_value ?? 0),
          variants: Number(row?.variant_count ?? 0),
        };
      }, 20_000),
  });

  const { data: optionLists } = useQuery({
    queryKey: ["stock-filter-options", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    retry: 1,
    queryFn: () => withMobileQueryTimeout(() => fetchMobileStockFilterOptions(orgId!), 20_000),
  });

  const { data: suppliers } = useQuery({
    queryKey: ["rpt-stock-report-suppliers", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    retry: 1,
    queryFn: () => withMobileQueryTimeout(() => fetchMobileStockSuppliers(orgId!), 20_000),
  });

  const { data: rows, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-stock-report-rows", orgId, search, supplier, filters],
    enabled: !!orgId,
    staleTime: search.trim() || supplier.trim() || activeCount ? STALE_LIVE : STALE_FREQUENT,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const data = await fetchMobileStockReportPages(orgId!, {
          search,
          supplier: supplier.trim() || undefined,
          brand: filters.brand,
          category: filters.category,
          inStock,
          maxRows: 400,
          pageSize: 200,
        });
        return data.map((r) => ({
          id: r.variant_id,
          name: r.product_name || "—",
          brand: r.brand || "",
          size: r.size || "—",
          color: r.color || "",
          opening: Number(r.opening_qty) || 0,
          purchase: Number(r.purchase_qty) || 0,
          sales: Number(r.sales_qty) || 0,
          qty: Number(r.current_stock) || 0,
          rate: Number(r.sale_price) || 0,
          pur: Number(r.pur_price) || 0,
        }));
      }, 25_000),
  });

  const columns: ReportTableColumn<NonNullable<typeof rows>[number]>[] = [
    {
      key: "product",
      header: "Product Name",
      sticky: true,
      minWidth: "min-w-[120px]",
      csvText: (r) => (r.brand ? `${r.name} — ${r.brand}` : r.name),
      render: (r) => (
        <div className="min-w-[120px] max-w-[160px]">
          <p className="font-semibold truncate">{r.name}</p>
          {r.brand ? <p className="text-[11px] text-muted-foreground truncate">{r.brand}</p> : null}
        </div>
      ),
    },
    { key: "size", header: "Pack", align: "right", csvText: (r) => r.size, render: (r) => r.size },
    { key: "opening", header: "Opening", align: "right", csvText: (r) => String(r.opening), render: (r) => r.opening },
    { key: "purchase", header: "Receipts", align: "right", csvText: (r) => String(r.purchase), render: (r) => r.purchase },
    { key: "sales", header: "Sales", align: "right", csvText: (r) => String(r.sales), render: (r) => r.sales },
    {
      key: "qty",
      header: "Stock",
      align: "right",
      csvText: (r) => String(r.qty),
      render: (r) => (
        <span className={cn("font-bold", r.qty <= 0 ? "text-destructive" : r.qty <= 10 ? "text-orange-600" : "text-emerald-600")}>
          {r.qty}
        </span>
      ),
    },
    { key: "rate", header: "Rate", align: "right", csvText: (r) => fmt(r.rate), render: (r) => fmt(r.rate) },
  ];

  const pageTotals = useMemo(() => {
    const list = rows || [];
    return {
      opening: list.reduce((s, r) => s + r.opening, 0),
      purchase: list.reduce((s, r) => s + r.purchase, 0),
      sales: list.reduce((s, r) => s + r.sales, 0),
      stock: list.reduce((s, r) => s + r.qty, 0),
      stockValue: list.reduce((s, r) => s + r.qty * r.rate, 0),
    };
  }, [rows]);

  const supplierOptions = (suppliers || []).filter((s) =>
    !supplier.trim() || s.toLowerCase().includes(supplier.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search product, barcode…" />
      <MobileReportSearchBar value={supplier} onChange={setSupplier} placeholder="Search supplier…" />
      <MobileReportFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onApply={setFilters}
        brands={optionLists?.brands ?? []}
        categories={optionLists?.categories ?? []}
      />
      {supplier.trim() && supplierOptions.length > 0 && supplierOptions.length <= 8 ? (
        <div className="flex flex-wrap gap-1.5 -mt-1">
          {supplierOptions.slice(0, 8).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setSupplier(name)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium border touch-manipulation",
                supplier === name ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <div className="flex items-center gap-1">
          <MobileReportFilterButton activeCount={activeCount} onClick={() => setFilterOpen(true)} />
          {rows?.length ? (
            <ReportExportButton
              fileBaseName={`stock-report-${format(new Date(), "ddMMyyyy")}`}
              buildCsv={() => buildCsvFromReportTable(columns, rows)}
              tableRef={tableRef}
            />
          ) : null}
        </div>
      </div>
      {isLoading ? (
        <LoadingRows />
      ) : isError ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground text-sm">Could not load stock report.</p>
          <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">
            Try again
          </button>
        </div>
      ) : !rows?.length ? (
        <EmptyState message="No stock rows found" />
      ) : (
        <>
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-xs border border-sky-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-sky-100 text-sky-900">
                  <th className="px-2 py-2 text-right font-semibold">Opening</th>
                  <th className="px-2 py-2 text-right font-semibold">Receipts</th>
                  <th className="px-2 py-2 text-right font-semibold">Sales</th>
                  <th className="px-2 py-2 text-right font-semibold">Stock Qty</th>
                  <th className="px-2 py-2 text-right font-semibold">Sale Value</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-card">
                  <td className="px-2 py-2 text-right tabular-nums">{pageTotals.opening}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pageTotals.purchase}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{pageTotals.sales}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold">{Math.round(totals?.qty ?? pageTotals.stock)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-bold">{fmt(totals?.sale ?? pageTotals.stockValue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm font-semibold text-sky-700">Detailed Stock And Sales Statement</p>
          <MobileReportTable ref={tableRef} variant="statement" columns={columns} rows={rows} rowKey={(r) => r.id} />
        </>
      )}
    </div>
  );
}
