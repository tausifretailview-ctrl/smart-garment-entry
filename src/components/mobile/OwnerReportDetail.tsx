import { useMemo, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/mobile/PullToRefreshIndicator";
import { invalidateOwnerReportQueries } from "@/lib/mobileHubRefresh";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { localDayBounds } from "@/lib/localDayBounds";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MetricCard } from "@/components/mobile/MobileReportMetricCard";
import type { ReportType } from "./OwnerReportsHub";
import {
  SizeWiseStockReport,
  CustomerBalanceReport,
  SupplierBalanceReport,
} from "./MobileOwnerBalanceReports";
import {
  MobileCashierReport,
  MobileItemWiseSalesReport,
  MobileCustomerWiseSalesReport,
  MobileSalesmanWiseSalesReport,
  MobileItemWiseStockReport,
  MobileNetProfitReport,
  MobileStockReport,
} from "./MobileInsightsReports";
import { ReportExportButton } from "@/components/mobile/ReportExportButton";
import { MobileReportTable, type ReportTableColumn } from "@/components/mobile/MobileReportTable";
import { buildCsvFromReportTable } from "@/utils/reportCsvExport";

/* ─── Helpers ─── */
const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

type Period = "today" | "week" | "month" | "custom";

function getDateRange(period: Period, custom: { from: Date; to: Date } | null) {
  const now = new Date();
  switch (period) {
    case "week":
      return { start: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd") };
    case "month":
      return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    case "custom":
      if (custom) return { start: format(custom.from, "yyyy-MM-dd"), end: format(custom.to, "yyyy-MM-dd") };
      return { start: format(now, "yyyy-MM-dd"), end: format(now, "yyyy-MM-dd") };
    default:
      return { start: format(now, "yyyy-MM-dd"), end: format(now, "yyyy-MM-dd") };
  }
}

const TITLES: Record<ReportType, string> = {
  "size-wise-stock": "Size-wise Stock",
  "customer-balance": "Customer Balance",
  "supplier-balance": "Supplier Balance",
  "daily-sales": "Daily Sales Report",
  "daily-purchase": "Daily Purchase Report",
  "profit-loss": "Profit & Loss",
  "stock-summary": "Stock Summary",
  "customer-outstanding": "Customer Balance",
  "supplier-outstanding": "Supplier Balance",
  "gst": "GST Report",
  "brand-sales": "Brand-wise Sales",
  "size-sales": "Size-wise Sales",
  "payment-collection": "Payment Collection",
  "daily-cashier": "Cashier Report",
  "item-wise-sales": "Item-wise Sale",
  "customer-wise-sales": "Customer-wise Sale",
  "salesman-wise-sales": "Salesman-wise Sale",
  "item-wise-stock": "Item-wise Stock",
  "net-profit": "Net Profit",
  "stock-report": "Stock Report",
};

const PERIOD_CHIPS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
];

interface Props {
  reportType: ReportType;
  onBack: () => void;
}

export const OwnerReportDetail = ({ reportType, onBack }: Props) => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;
  const { scrollRef, isRefreshing, pullHandlers } = usePullToRefresh(
    useCallback(() => invalidateOwnerReportQueries(queryClient), [queryClient])
  );
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [showFromCal, setShowFromCal] = useState(false);
  const [showToCal, setShowToCal] = useState(false);
  const { start, end } = getDateRange(period, customRange);

  const needsDateFilter = ![
    "stock-summary",
    "size-wise-stock",
    "customer-balance",
    "supplier-balance",
    "customer-outstanding",
    "supplier-outstanding",
    "item-wise-stock",
  ].includes(reportType);

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-muted/30 pb-24"
      {...pullHandlers}
    >
      <PullToRefreshIndicator visible={isRefreshing} />
      <MobilePageHeader title={TITLES[reportType]} onBackClick={onBack} />

      {/* Period Chips */}
      {needsDateFilter && (
        <div className="px-2 pt-3 pb-1">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {PERIOD_CHIPS.map((c) => (
              <button
                key={c.value}
                onClick={() => setPeriod(c.value)}
                className={cn(
                  "flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all touch-manipulation",
                  period === c.value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            From <span className="font-semibold text-foreground tabular-nums">{format(new Date(`${start}T00:00:00`), "dd-MM-yyyy")}</span>
            {" "}to{" "}
            <span className="font-semibold text-foreground tabular-nums">{format(new Date(`${end}T00:00:00`), "dd-MM-yyyy")}</span>
          </p>
          {period === "custom" && (
            <div className="flex gap-2 mt-2">
              <Popover open={showFromCal} onOpenChange={setShowFromCal}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs flex-1">
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {customRange?.from ? format(customRange.from, "dd MMM") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customRange?.from} onSelect={(d) => { if (d) { setCustomRange((prev) => ({ from: d, to: prev?.to || d })); setShowFromCal(false); }}} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover open={showToCal} onOpenChange={setShowToCal}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs flex-1">
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {customRange?.to ? format(customRange.to, "dd MMM") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={customRange?.to} onSelect={(d) => { if (d) { setCustomRange((prev) => ({ from: prev?.from || d, to: d })); setShowToCal(false); }}} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      )}

      {/* Report Body */}
      <div className="px-2 pt-3">
        {reportType === "size-wise-stock" && <SizeWiseStockReport orgId={orgId} />}
        {(reportType === "customer-balance" || reportType === "customer-outstanding") && (
          <CustomerBalanceReport orgId={orgId} />
        )}
        {(reportType === "supplier-balance" || reportType === "supplier-outstanding") && (
          <SupplierBalanceReport orgId={orgId} />
        )}
        {reportType === "daily-sales" && <DailySalesReport orgId={orgId} start={start} end={end} />}
        {reportType === "daily-purchase" && <DailyPurchaseReport orgId={orgId} start={start} end={end} />}
        {reportType === "profit-loss" && <ProfitLossReport orgId={orgId} start={start} end={end} />}
        {reportType === "stock-summary" && <StockSummaryReport orgId={orgId} />}
        {reportType === "gst" && <GSTReport orgId={orgId} start={start} end={end} />}
        {reportType === "brand-sales" && <BrandSalesReport orgId={orgId} start={start} end={end} />}
        {reportType === "size-sales" && <SizeSalesReport orgId={orgId} start={start} end={end} />}
        {reportType === "payment-collection" && <PaymentCollectionReport orgId={orgId} start={start} end={end} />}
        {reportType === "daily-cashier" && <MobileCashierReport orgId={orgId} start={start} end={end} />}
        {reportType === "item-wise-sales" && <MobileItemWiseSalesReport orgId={orgId} start={start} end={end} />}
        {reportType === "customer-wise-sales" && <MobileCustomerWiseSalesReport orgId={orgId} start={start} end={end} />}
        {reportType === "salesman-wise-sales" && <MobileSalesmanWiseSalesReport orgId={orgId} start={start} end={end} />}
        {reportType === "item-wise-stock" && <MobileItemWiseStockReport orgId={orgId} />}
        {reportType === "net-profit" && <MobileNetProfitReport orgId={orgId} start={start} end={end} />}
        {reportType === "stock-report" && <MobileStockReport orgId={orgId} />}
      </div>
    </div>
  );
};

/* ─── Reusable Components ─── */
const LoadingRows = () => (
  <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
);

const EmptyState = ({ message = "No data for selected period" }: { message?: string }) => (
  <div className="text-center py-12">
    <p className="text-muted-foreground text-sm">{message}</p>
  </div>
);

/* ─────────────────────────── Individual Reports ─────────────────────────── */

interface RProps { orgId?: string; start?: string; end?: string; }

function saleDateBounds(start: string, end: string) {
  return localDayBounds(start, end);
}

/* 1. Daily Sales */
const DailySalesReport = ({ orgId, start, end }: RProps) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-daily-sales", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { startIso, endIso } = saleDateBounds(start!, end!);
      const { data: sales } = await supabase.from("sales")
        .select("id, sale_number, customer_name, net_amount, sale_date, payment_status")
        .eq("organization_id", orgId!).is("deleted_at", null).eq("is_cancelled", false)
        .gte("sale_date", startIso).lte("sale_date", endIso)
        .order("sale_date", { ascending: false }).limit(500);
      return sales || [];
    },
  });

  const total = useMemo(() => (data || []).reduce((s, r) => s + (r.net_amount || 0), 0), [data]);

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load daily sales.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">Try again</button>
      </div>
    );
  }
  if (!data?.length) return <EmptyState />;

  const salesColumns: ReportTableColumn<(typeof data)[number]>[] = [
    {
      key: "bill",
      header: "Bill No",
      sticky: true,
      minWidth: "min-w-[100px]",
      csvText: (s) => s.sale_number,
      render: (s) => <span className="font-semibold">{s.sale_number}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      csvText: (s) => s.customer_name || "Walk-in",
      render: (s) => s.customer_name || "Walk-in",
    },
    {
      key: "status",
      header: "Status",
      csvText: (s) => s.payment_status || "pending",
      render: (s) => (
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            s.payment_status === "paid"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : s.payment_status === "partial"
                ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
          )}
        >
          {s.payment_status || "pending"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      csvText: (s) => fmt(s.net_amount || 0),
      render: (s) => fmt(s.net_amount || 0),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`daily-sales-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(salesColumns, data)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Bills" value={String(data.length)} />
        <MetricCard label="Total" value={fmt(total)} color="text-emerald-600" />
      </div>
      <p className="text-sm font-semibold text-sky-700">Daily Sales</p>
      <MobileReportTable ref={tableRef} variant="statement" columns={salesColumns} rows={data} rowKey={(s) => s.id} />
    </div>
  );
};

/* 2. Daily Purchase */
const DailyPurchaseReport = ({ orgId, start, end }: RProps) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-daily-purchase", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: bills } = await supabase.from("purchase_bills")
        .select("id, software_bill_no, supplier_name, net_amount, bill_date, supplier_invoice_no")
        .eq("organization_id", orgId!).is("deleted_at", null)
        .gte("bill_date", start!).lte("bill_date", end!)
        .order("bill_date", { ascending: false }).limit(500);
      return bills || [];
    },
  });

  const total = useMemo(() => (data || []).reduce((s, r) => s + (r.net_amount || 0), 0), [data]);

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load daily purchase.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">Try again</button>
      </div>
    );
  }
  if (!data?.length) return <EmptyState />;

  const purchaseColumns: ReportTableColumn<(typeof data)[number]>[] = [
    {
      key: "bill",
      header: "Bill No",
      sticky: true,
      minWidth: "min-w-[100px]",
      csvText: (b) => b.software_bill_no || "",
      render: (b) => <span className="font-semibold">{b.software_bill_no}</span>,
    },
    {
      key: "supplier",
      header: "Supplier",
      csvText: (b) =>
        b.supplier_invoice_no ? `${b.supplier_name} • ${b.supplier_invoice_no}` : b.supplier_name || "",
      render: (b) => (
        <div className="min-w-[120px] max-w-[180px]">
          <p className="truncate">{b.supplier_name}</p>
          {b.supplier_invoice_no ? (
            <p className="text-[11px] text-muted-foreground truncate">{b.supplier_invoice_no}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      csvText: (b) => fmt(b.net_amount || 0),
      render: (b) => fmt(b.net_amount || 0),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`daily-purchase-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(purchaseColumns, data)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Bills" value={String(data.length)} />
        <MetricCard label="Total" value={fmt(total)} color="text-orange-600" />
      </div>
      <p className="text-sm font-semibold text-sky-700">Daily Purchase</p>
      <MobileReportTable ref={tableRef} variant="statement" columns={purchaseColumns} rows={data} rowKey={(b) => b.id} />
    </div>
  );
};

/* 3. Profit & Loss */
const ProfitLossReport = ({ orgId, start, end }: RProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-pnl", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { startIso, endIso } = saleDateBounds(start!, end!);
      const [salesRes, purchaseRes] = await Promise.all([
        supabase.from("sales").select("net_amount").eq("organization_id", orgId!).is("deleted_at", null).eq("is_cancelled", false)
          .gte("sale_date", startIso).lte("sale_date", endIso),
        supabase.from("purchase_bills").select("net_amount").eq("organization_id", orgId!).is("deleted_at", null)
          .gte("bill_date", start!).lte("bill_date", end!),
      ]);
      const totalSale = (salesRes.data || []).reduce((s, r) => s + (r.net_amount || 0), 0);
      const totalPurchase = (purchaseRes.data || []).reduce((s, r) => s + (r.net_amount || 0), 0);
      return { totalSale, totalPurchase, profit: totalSale - totalPurchase };
    },
  });

  if (isLoading) return <LoadingRows />;
  if (!data) return <EmptyState />;

  const margin = data.totalSale > 0 ? ((data.profit / data.totalSale) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <MetricCard label="Total Sale" value={fmt(data.totalSale)} color="text-emerald-600" />
        <MetricCard label="Total Purchase" value={fmt(data.totalPurchase)} color="text-orange-600" />
      </div>
      <div className="flex gap-2">
        <MetricCard label="Gross Profit" value={fmt(data.profit)} color={data.profit >= 0 ? "text-blue-600" : "text-destructive"} />
        <MetricCard label="Margin %" value={`${margin}%`} color={data.profit >= 0 ? "text-blue-600" : "text-destructive"} />
      </div>
    </div>
  );
};

/* 4. Stock Summary */
const StockSummaryReport = ({ orgId }: { orgId?: string }) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-stock-summary", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: variants } = await supabase.from("product_variants")
        .select("id, size, color, stock_qty, pur_price, sale_price, product_id, products!inner(product_name, brand)")
        .eq("organization_id", orgId!);
      return variants || [];
    },
  });

  const stats = useMemo(() => {
    if (!data?.length) return { totalProducts: 0, totalVariants: 0, purValue: 0, saleValue: 0, items: [] as any[] };
    const prodSet = new Set<string>();
    let purValue = 0, saleValue = 0;
    const items: any[] = [];
    data.forEach((v: any) => {
      prodSet.add(v.product_id);
      const stock = v.stock_qty || 0;
      purValue += stock * (v.pur_price || 0);
      saleValue += stock * (v.sale_price || 0);
    });
    // Group by product
    const prodMap = new Map<string, { name: string; brand: string; totalStock: number; purVal: number; saleVal: number }>();
    data.forEach((v: any) => {
      const pid = v.product_id;
      const prod = (v as any).products;
      const existing = prodMap.get(pid) || { name: prod?.product_name || "—", brand: prod?.brand || "", totalStock: 0, purVal: 0, saleVal: 0 };
      const stock = v.stock_qty || 0;
      existing.totalStock += stock;
      existing.purVal += stock * (v.pur_price || 0);
      existing.saleVal += stock * (v.sale_price || 0);
      prodMap.set(pid, existing);
    });
    return {
      totalProducts: prodSet.size,
      totalVariants: data.length,
      purValue, saleValue,
      items: [...prodMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [data]);

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load stock summary.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">Try again</button>
      </div>
    );
  }
  if (!data?.length) return <EmptyState message="No products found" />;

  const stockRows = stats.items.slice(0, 100);
  const stockColumns: ReportTableColumn<(typeof stockRows)[number]>[] = [
    {
      key: "product",
      header: "Product",
      sticky: true,
      minWidth: "min-w-[120px]",
      csvText: (p) => (p.brand ? `${p.name} — ${p.brand}` : p.name),
      render: (p) => (
        <div className="min-w-[120px] max-w-[160px]">
          <p className="font-semibold truncate">{p.name}</p>
          {p.brand ? <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p> : null}
        </div>
      ),
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      csvText: (p) => String(p.totalStock),
      render: (p) => (
        <span
          className={cn(
            "font-bold",
            p.totalStock <= 0 ? "text-destructive" : p.totalStock <= 10 ? "text-orange-600" : "text-emerald-600",
          )}
        >
          {p.totalStock}
        </span>
      ),
    },
    {
      key: "saleValue",
      header: "Sale Value",
      align: "right",
      csvText: (p) => fmt(p.saleVal),
      render: (p) => fmt(p.saleVal),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`stock-summary-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(stockColumns, stockRows)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Products" value={String(stats.totalProducts)} />
        <MetricCard label="Variants" value={String(stats.totalVariants)} />
        <MetricCard label="Stock Value" value={fmt(stats.purValue)} color="text-orange-600" />
        <MetricCard label="Sale Value" value={fmt(stats.saleValue)} color="text-emerald-600" />
      </div>
      <p className="text-sm font-semibold text-sky-700">Stock Summary</p>
      <MobileReportTable
        ref={tableRef}
        variant="statement"
        columns={stockColumns}
        rows={stockRows}
        rowKey={(p) => `${p.name}|${p.brand}|${p.totalStock}|${p.saleVal}|${p.purVal}`}
      />
    </div>
  );
};

/* 5. Customer Outstanding — legacy; use CustomerBalanceReport */
/* 6. Supplier Outstanding — legacy; use SupplierBalanceReport */

/* 7. GST Report */
const GSTReport = ({ orgId, start, end }: RProps) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-gst", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { startIso, endIso } = saleDateBounds(start!, end!);
      const { data: items } = await supabase.from("sale_items")
        .select("gst_percent, line_total, quantity, unit_price, sale_id, sales!inner(organization_id, sale_date, deleted_at, is_cancelled)")
        .eq("sales.organization_id", orgId!)
        .is("sales.deleted_at", null).eq("sales.is_cancelled", false)
        .gte("sales.sale_date", startIso).lte("sales.sale_date", endIso);
      return items || [];
    },
  });

  const grouped = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<number, { taxable: number; tax: number }>();
    data.forEach((i: any) => {
      const rate = i.gst_percent || 0;
      const taxable = (i.quantity || 0) * (i.unit_price || 0);
      const tax = taxable * (rate / 100);
      const existing = map.get(rate) || { taxable: 0, tax: 0 };
      existing.taxable += taxable;
      existing.tax += tax;
      map.set(rate, existing);
    });
    return [...map.entries()]
      .map(([rate, val]) => ({ rate, ...val, cgst: val.tax / 2, sgst: val.tax / 2 }))
      .sort((a, b) => a.rate - b.rate);
  }, [data]);

  const gstSummary = grouped.reduce(
    (s, g) => ({ taxable: s.taxable + g.taxable, cgst: s.cgst + g.cgst, sgst: s.sgst + g.sgst, tax: s.tax + g.tax }),
    { taxable: 0, cgst: 0, sgst: 0, tax: 0 },
  );

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load GST report.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">Try again</button>
      </div>
    );
  }
  if (!grouped.length) return <EmptyState />;

  const gstColumns: ReportTableColumn<(typeof grouped)[number]>[] = [
    {
      key: "rate",
      header: "GST %",
      sticky: true,
      minWidth: "min-w-[64px]",
      csvText: (g) => `${g.rate}%`,
      render: (g) => <span className="font-semibold">{g.rate}%</span>,
    },
    { key: "taxable", header: "Taxable", align: "right", csvText: (g) => fmt(g.taxable), render: (g) => fmt(g.taxable) },
    { key: "cgst", header: "CGST", align: "right", csvText: (g) => fmt(g.cgst), render: (g) => fmt(g.cgst) },
    { key: "sgst", header: "SGST", align: "right", csvText: (g) => fmt(g.sgst), render: (g) => fmt(g.sgst) },
    {
      key: "tax",
      header: "Tax",
      align: "right",
      csvText: (g) => fmt(g.tax),
      render: (g) => <span className="font-bold">{fmt(g.tax)}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`gst-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(gstColumns, grouped)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Taxable" value={fmt(gstSummary.taxable)} />
        <MetricCard label="CGST" value={fmt(gstSummary.cgst)} />
        <MetricCard label="SGST" value={fmt(gstSummary.sgst)} />
        <MetricCard label="Total Tax" value={fmt(gstSummary.tax)} color="text-amber-600" />
      </div>
      <p className="text-sm font-semibold text-sky-700">GST Report</p>
      <MobileReportTable ref={tableRef} variant="statement" columns={gstColumns} rows={grouped} rowKey={(g) => String(g.rate)} />
    </div>
  );
};

/* 8. Brand Sales */
const BrandSalesReport = ({ orgId, start, end }: RProps) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-brand-sales", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { startIso, endIso } = saleDateBounds(start!, end!);
      const { data: items } = await supabase.from("sale_items")
        .select("product_id, quantity, line_total, sale_id, sales!inner(organization_id, sale_date, deleted_at, is_cancelled)")
        .eq("sales.organization_id", orgId!)
        .is("sales.deleted_at", null).eq("sales.is_cancelled", false)
        .gte("sales.sale_date", startIso).lte("sales.sale_date", endIso);

      const prodIds = [...new Set((items || []).map((i: any) => i.product_id))];
      if (!prodIds.length) return [];

      const { data: products } = await supabase.from("products")
        .select("id, brand").in("id", prodIds);

      const brandMap = new Map<string, string>();
      (products || []).forEach((p: any) => brandMap.set(p.id, p.brand || "Unknown"));

      const map = new Map<string, { qty: number; total: number }>();
      (items || []).forEach((i: any) => {
        const brand = brandMap.get(i.product_id) || "Unknown";
        const existing = map.get(brand) || { qty: 0, total: 0 };
        existing.qty += i.quantity || 0;
        existing.total += i.line_total || 0;
        map.set(brand, existing);
      });

      return [...map.entries()].map(([brand, val]) => ({ brand, ...val })).sort((a, b) => b.total - a.total);
    },
  });

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load brand-wise sales.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">Try again</button>
      </div>
    );
  }
  if (!data?.length) return <EmptyState />;

  const brandColumns: ReportTableColumn<(typeof data)[number]>[] = [
    {
      key: "brand",
      header: "Brand",
      sticky: true,
      minWidth: "min-w-[100px]",
      csvText: (b) => b.brand,
      render: (b) => <span className="font-semibold">{b.brand}</span>,
    },
    { key: "qty", header: "Qty", align: "right", csvText: (b) => String(b.qty), render: (b) => b.qty },
    { key: "amount", header: "Amount", align: "right", csvText: (b) => fmt(b.total), render: (b) => fmt(b.total) },
  ];

  const brandTotals = {
    qty: data.reduce((s, b) => s + b.qty, 0),
    amount: data.reduce((s, b) => s + b.total, 0),
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`brand-sales-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(brandColumns, data)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Brands" value={String(data.length)} />
        <MetricCard label="Total Qty" value={String(brandTotals.qty)} />
        <MetricCard label="Total Amount" value={fmt(brandTotals.amount)} color="text-teal-600" />
      </div>
      <p className="text-sm font-semibold text-sky-700">Brand-wise Sales</p>
      <MobileReportTable ref={tableRef} variant="statement" columns={brandColumns} rows={data} rowKey={(b) => b.brand} />
    </div>
  );
};

/* 9. Size Sales */
const SizeSalesReport = ({ orgId, start, end }: RProps) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rpt-size-sales", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { startIso, endIso } = saleDateBounds(start!, end!);
      const { data: items } = await supabase.from("sale_items")
        .select("size, quantity, line_total, sale_id, sales!inner(organization_id, sale_date, deleted_at, is_cancelled)")
        .eq("sales.organization_id", orgId!)
        .is("sales.deleted_at", null).eq("sales.is_cancelled", false)
        .gte("sales.sale_date", startIso).lte("sales.sale_date", endIso);

      const map = new Map<string, { qty: number; total: number }>();
      (items || []).forEach((i: any) => {
        const size = i.size || "N/A";
        const existing = map.get(size) || { qty: 0, total: 0 };
        existing.qty += i.quantity || 0;
        existing.total += i.line_total || 0;
        map.set(size, existing);
      });

      return [...map.entries()].map(([size, val]) => ({ size, ...val })).sort((a, b) => b.qty - a.qty);
    },
  });

  if (isLoading) return <LoadingRows />;
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-muted-foreground text-sm">Could not load size-wise sales.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-primary">Try again</button>
      </div>
    );
  }
  if (!data?.length) return <EmptyState />;

  const sizeColumns: ReportTableColumn<(typeof data)[number]>[] = [
    {
      key: "size",
      header: "Size",
      sticky: true,
      minWidth: "min-w-[64px]",
      csvText: (s) => s.size,
      render: (s) => <span className="font-semibold">{s.size}</span>,
    },
    { key: "qty", header: "Qty", align: "right", csvText: (s) => String(s.qty), render: (s) => s.qty },
    { key: "amount", header: "Amount", align: "right", csvText: (s) => fmt(s.total), render: (s) => fmt(s.total) },
  ];

  const sizeTotals = {
    qty: data.reduce((s, r) => s + r.qty, 0),
    amount: data.reduce((s, r) => s + r.total, 0),
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-sky-700">Summary</p>
        <ReportExportButton
          fileBaseName={`size-sales-${format(new Date(), "ddMMyyyy")}`}
          buildCsv={() => buildCsvFromReportTable(sizeColumns, data)}
          tableRef={tableRef}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <MetricCard label="Sizes" value={String(data.length)} />
        <MetricCard label="Total Qty" value={String(sizeTotals.qty)} />
        <MetricCard label="Total Amount" value={fmt(sizeTotals.amount)} color="text-indigo-600" />
      </div>
      <p className="text-sm font-semibold text-sky-700">Size-wise Sales</p>
      <MobileReportTable ref={tableRef} variant="statement" columns={sizeColumns} rows={data} rowKey={(s) => s.size} />
    </div>
  );
};

/* 10. Payment Collection */
const PaymentCollectionReport = ({ orgId, start, end }: RProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-payment-collection", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { startIso, endIso } = saleDateBounds(start!, end!);
      const { data: sales } = await supabase.from("sales")
        .select("cash_amount, upi_amount, card_amount, net_amount, sale_date")
        .eq("organization_id", orgId!).is("deleted_at", null).eq("is_cancelled", false)
        .gte("sale_date", startIso).lte("sale_date", endIso);
      return sales || [];
    },
  });

  const stats = useMemo(() => {
    if (!data?.length) return { total: 0, cash: 0, upi: 0, card: 0, credit: 0 };
    const cash = data.reduce((s, r: any) => s + (r.cash_amount || 0), 0);
    const upi = data.reduce((s, r: any) => s + (r.upi_amount || 0), 0);
    const card = data.reduce((s, r: any) => s + (r.card_amount || 0), 0);
    const total = data.reduce((s, r: any) => s + (r.net_amount || 0), 0);
    return { total, cash, upi, card, credit: Math.max(0, total - cash - upi - card) };
  }, [data]);

  if (isLoading) return <LoadingRows />;
  if (!data?.length) return <EmptyState />;

  const modes = [
    { label: "Cash", value: stats.cash, color: "text-emerald-600" },
    { label: "UPI", value: stats.upi, color: "text-blue-600" },
    { label: "Card", value: stats.card, color: "text-violet-600" },
    { label: "Credit", value: stats.credit, color: "text-destructive" },
  ];

  return (
    <div className="space-y-3">
      <MetricCard label="Total Collection" value={fmt(stats.total)} color="text-cyan-600" />
      <div className="grid grid-cols-2 gap-2">
        {modes.map((m) => (
          <MetricCard key={m.label} label={m.label} value={fmt(m.value)} color={m.color} />
        ))}
      </div>
    </div>
  );
};
