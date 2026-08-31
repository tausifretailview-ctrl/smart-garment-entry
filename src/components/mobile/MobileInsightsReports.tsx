import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { localDayBounds } from "@/lib/localDayBounds";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import { STALE_LIVE, STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { MobileReportSearchBar } from "@/components/mobile/MobileReportSearchBar";
import { MobileReportTable, type ReportTableColumn } from "@/components/mobile/MobileReportTable";
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
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-item-wise-sales", orgId, start, end],
    enabled: !!orgId && !!start && !!end,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const { startIso, endIso } = localDayBounds(start!, end!);
        const { data: items, error } = await supabase
          .from("sale_items")
          .select(
            "product_name, size, barcode, quantity, line_total, unit_price, product_id, sales!inner(organization_id, sale_date, deleted_at, is_cancelled), products(brand)",
          )
          .eq("sales.organization_id", orgId!)
          .is("sales.deleted_at", null)
          .eq("sales.is_cancelled", false)
          .gte("sales.sale_date", startIso)
          .lte("sales.sale_date", endIso)
          .limit(2500);
        if (error) throw error;
        return items || [];
      }),
  });

  const rows = useMemo(() => {
    const map = new Map<string, { key: string; name: string; brand: string; size: string; qty: number; amount: number }>();
    (data || []).forEach((i: any) => {
      const name = i.product_name || "—";
      const size = i.size || "—";
      const brand = i.products?.brand || "";
      const key = `${name}|${size}|${brand}`;
      const ex = map.get(key) || { key, name, brand, size, qty: 0, amount: 0 };
      ex.qty += Number(i.quantity) || 0;
      ex.amount += Number(i.line_total) || 0;
      map.set(key, ex);
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 200);
  }, [data]);

  const totals = useMemo(
    () => rows.reduce((a, r) => ({ qty: a.qty + r.qty, amount: a.amount + r.amount }), { qty: 0, amount: 0 }),
    [rows],
  );

  const columns: ReportTableColumn<(typeof rows)[number]>[] = [
    {
      key: "product",
      header: "Product",
      sticky: true,
      minWidth: "min-w-[120px]",
      render: (r) => (
        <div className="min-w-[120px] max-w-[160px]">
          <p className="font-semibold truncate">{r.name}</p>
          {r.brand ? <p className="text-[11px] text-muted-foreground truncate">{r.brand}</p> : null}
        </div>
      ),
    },
    { key: "size", header: "Size / Pack", align: "right", render: (r) => r.size },
    { key: "qty", header: "Qty", align: "right", render: (r) => r.qty },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      render: (r) => fmt(r.qty ? r.amount / r.qty : 0),
    },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-bold">{fmt(r.amount)}</span> },
  ];

  if (isLoading) return <LoadingRows />;
  if (!rows.length) return <EmptyState />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <MetricCard label="Qty" value={String(totals.qty)} />
        <MetricCard label="Amount" value={fmt(totals.amount)} color="text-emerald-600" />
        <MetricCard label="Lines" value={String(rows.length)} />
      </div>
      <MobileReportTable variant="insights" columns={columns} rows={rows} rowKey={(r) => r.key} />
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

  const { data: rows, isLoading } = useQuery({
    queryKey: ["rpt-stock-report-rows", orgId, search],
    enabled: !!orgId,
    staleTime: search.trim() ? STALE_LIVE : STALE_FREQUENT,
    retry: 1,
    queryFn: () =>
      withMobileQueryTimeout(async () => {
        const { data, error } = await supabase.rpc("get_stock_report", {
          p_org_id: orgId!,
          p_search: search.trim() || null,
          p_limit: 150,
          p_offset: 0,
          p_low_stock_threshold: 10,
        });
        if (error) throw error;
        return (data || []).map((r) => ({
          id: r.variant_id,
          name: r.product_name || "—",
          brand: r.brand || "",
          size: r.size || "—",
          color: r.color || "",
          qty: Number(r.current_stock) || 0,
          rate: Number(r.sale_price) || 0,
          pur: Number(r.pur_price) || 0,
        }));
      }),
  });

  const columns: ReportTableColumn<NonNullable<typeof rows>[number]>[] = [
    {
      key: "product",
      header: "Product",
      sticky: true,
      minWidth: "min-w-[120px]",
      render: (r) => (
        <div className="min-w-[120px] max-w-[160px]">
          <p className="font-semibold truncate">{r.name}</p>
          {r.brand ? <p className="text-[11px] text-muted-foreground truncate">{r.brand}</p> : null}
        </div>
      ),
    },
    { key: "size", header: "Size / Pack", align: "right", render: (r) => r.size },
    { key: "color", header: "Color", render: (r) => r.color || "—" },
    {
      key: "qty",
      header: "Stock",
      align: "right",
      render: (r) => (
        <span className={cn("font-bold", r.qty <= 0 ? "text-destructive" : r.qty <= 10 ? "text-orange-600" : "text-emerald-600")}>
          {r.qty}
        </span>
      ),
    },
    { key: "rate", header: "Rate", align: "right", render: (r) => fmt(r.rate) },
    { key: "pur", header: "Pur.", align: "right", render: (r) => fmt(r.pur) },
  ];

  if (isLoading) return <LoadingRows />;
  if (!rows?.length) return <EmptyState message="No stock rows found" />;

  return (
    <div className="space-y-3">
      <MobileReportSearchBar value={search} onChange={setSearch} placeholder="Search product or barcode…" />
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Variants" value={String(totals?.variants ?? rows.length)} />
        <MetricCard label="Stock Qty" value={String(Math.round(totals?.qty ?? 0))} />
        <MetricCard label="Pur. Value" value={fmt(totals?.pur ?? 0)} color="text-orange-600" />
        <MetricCard label="Sale Value" value={fmt(totals?.sale ?? 0)} color="text-emerald-600" />
      </div>
      <MobileReportTable variant="insights" columns={columns} rows={rows} rowKey={(r) => r.id} />
    </div>
  );
}
