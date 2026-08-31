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
import { buildCsvFromReportTable } from "@/utils/reportCsvExport";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";
import {
  fetchMobileStockReportPages,
  fetchMobileStockSuppliers,
} from "@/utils/mobileStockReportQuery";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getSaleReportDiscountAmount,
  getSaleReportGrossAmount,
  getSaleReportNetAmount,
} from "@/utils/cashierReportUtils";
import {
  fetchItemWiseStockPage,
  fetchItemWiseStockTotals,
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

const MetricCard = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex-1 min-w-[88px] rounded-xl border border-border/40 bg-card p-2.5">
    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
    <p className={cn("text-sm font-bold mt-0.5 tabular-nums", color || "text-foreground")}>{value}</p>
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

export function MobileItemWiseSalesReport({ orgId, start, end }: DateProps) {
  const [search, setSearch] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-item-wise-sales", orgId, start, end],
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
        if (!sales?.length) return [];
        return fetchAllSaleItems(sales.map((s) => s.id));
      }, 25_000),
  });

  const rows = useMemo(() => {
    const map = new Map<string, { key: string; name: string; size: string; qty: number; amount: number }>();
    (data || []).forEach((i: { product_name?: string; size?: string; quantity?: number; line_total?: number }) => {
      const name = i.product_name || "—";
      const size = i.size || "—";
      const key = `${name}|${size}`;
      const ex = map.get(key) || { key, name, size, qty: 0, amount: 0 };
      ex.qty += Number(i.quantity) || 0;
      ex.amount += Number(i.line_total) || 0;
      map.set(key, ex);
    });
    const q = search.trim().toLowerCase();
    return [...map.values()]
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.size.toLowerCase().includes(q))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 250);
  }, [data, search]);

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

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load item-wise sales.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">
          Try again
        </button>
      </div>
    );
  }
  if (!rows.length) return <EmptyState message="No sales in this date range. Try Week, Month, or Custom." />;

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search product or size…" />
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`item-wise-sale-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(columns, rows)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2">
        <MetricCard label="Qty" value={String(totals.qty)} />
        <MetricCard label="Amount" value={fmt(totals.amount)} color="text-emerald-600" />
        <MetricCard label="Items" value={String(rows.length)} />
      </div>
      <p className="text-sm font-semibold text-sky-700">Item-wise Sale</p>
      <MobileReportTable ref={tableRef} variant="statement" columns={columns} rows={rows} rowKey={(r) => r.key} />
    </div>
  );
}

export function MobileItemWiseStockReport({ orgId }: { orgId?: string }) {
  const [search, setSearch] = useState("");
  const filters = useMemo<ItemWiseStockFilters>(
    () => ({ ...ITEM_STOCK_FILTERS, searchQuery: search }),
    [search],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["rpt-item-wise-stock", orgId, search],
    enabled: !!orgId,
    staleTime: search.trim() ? STALE_LIVE : STALE_FREQUENT,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const [page, totals] = await Promise.all([
          fetchItemWiseStockPage(orgId!, filters, 1, 150),
          fetchItemWiseStockTotals(orgId!, filters),
        ]);
        return { rows: page.rows, totals };
      }),
  });

  const columns: ReportTableColumn<NonNullable<typeof data>["rows"][number]>[] = [
    {
      key: "product",
      header: "Product",
      sticky: true,
      minWidth: "min-w-[120px]",
      render: (r) => <span className="font-semibold truncate block max-w-[160px]">{r.key}</span>,
    },
    { key: "qty", header: "Stock", align: "right", render: (r) => <span className="font-bold">{r.total_qty}</span> },
    { key: "pur", header: "Pur. Value", align: "right", render: (r) => fmt(r.purchase_value) },
    { key: "sale", header: "Sale Value", align: "right", render: (r) => fmt(r.sale_value) },
  ];

  if (isLoading) return <LoadingRows />;
  if (!data?.rows.length) return <EmptyState message="No stock rows found" />;

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search product…" />
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Groups" value={String(data.totals.group_count)} />
        <MetricCard label="Qty" value={String(Math.round(data.totals.total_qty))} />
        <MetricCard label="Pur. Value" value={fmt(data.totals.purchase_value)} color="text-orange-600" />
        <MetricCard label="Sale Value" value={fmt(data.totals.sale_value)} color="text-emerald-600" />
      </div>
      <MobileReportTable variant="insights" columns={columns} rows={data.rows} rowKey={(r) => r.key} />
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
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: totals } = useQuery({
    queryKey: ["rpt-stock-report-totals", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
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
      }),
  });

  const { data: suppliers } = useQuery({
    queryKey: ["rpt-stock-report-suppliers", orgId],
    enabled: !!orgId,
    staleTime: STALE_FREQUENT,
    retry: 1,
    queryFn: () => withMobileQueryTimeout(() => fetchMobileStockSuppliers(orgId!), 20_000),
  });

  const { data: rows, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-stock-report-rows", orgId, search, supplier],
    enabled: !!orgId,
    staleTime: search.trim() || supplier.trim() ? STALE_LIVE : STALE_FREQUENT,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const data = await fetchMobileStockReportPages(orgId!, {
          search,
          supplier: supplier.trim() || undefined,
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

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load stock report.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">
          Try again
        </button>
      </div>
    );
  }
  if (!rows?.length) return <EmptyState message="No stock rows found" />;

  const supplierOptions = (suppliers || []).filter((s) =>
    !supplier.trim() || s.toLowerCase().includes(supplier.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search product, barcode…" />
      <MobileReportSearchBar value={supplier} onChange={setSupplier} placeholder="Search supplier…" />
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
        <ReportExportButton
          fileBaseName={`stock-report-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(columns, rows)}
          tableRef={tableRef}
        />
      </div>
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
    </div>
  );
}
