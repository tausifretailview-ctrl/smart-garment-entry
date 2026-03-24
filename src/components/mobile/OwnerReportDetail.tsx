import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ArrowLeft, CalendarIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ReportType } from "./OwnerReportsHub";

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
  "daily-sales": "Daily Sales Report",
  "daily-purchase": "Daily Purchase Report",
  "profit-loss": "Profit & Loss",
  "stock-summary": "Stock Summary",
  "customer-outstanding": "Customer Outstanding",
  "supplier-outstanding": "Supplier Outstanding",
  "gst": "GST Report",
  "brand-sales": "Brand-wise Sales",
  "size-sales": "Size-wise Sales",
  "payment-collection": "Payment Collection",
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
  const orgId = currentOrganization?.id;
  const [period, setPeriod] = useState<Period>("today");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [showFromCal, setShowFromCal] = useState(false);
  const [showToCal, setShowToCal] = useState(false);
  const { start, end } = getDateRange(period, customRange);

  const needsDateFilter = !["stock-summary", "customer-outstanding", "supplier-outstanding"].includes(reportType);

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1 touch-manipulation"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-base font-bold text-foreground">{TITLES[reportType]}</h1>
      </div>

      {/* Period Chips */}
      {needsDateFilter && (
        <div className="px-4 pt-3 pb-1">
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
      <div className="px-4 pt-3">
        {reportType === "daily-sales" && <DailySalesReport orgId={orgId} start={start} end={end} />}
        {reportType === "daily-purchase" && <DailyPurchaseReport orgId={orgId} start={start} end={end} />}
        {reportType === "profit-loss" && <ProfitLossReport orgId={orgId} start={start} end={end} />}
        {reportType === "stock-summary" && <StockSummaryReport orgId={orgId} />}
        {reportType === "customer-outstanding" && <CustomerOutstandingReport orgId={orgId} />}
        {reportType === "supplier-outstanding" && <SupplierOutstandingReport orgId={orgId} />}
        {reportType === "gst" && <GSTReport orgId={orgId} start={start} end={end} />}
        {reportType === "brand-sales" && <BrandSalesReport orgId={orgId} start={start} end={end} />}
        {reportType === "size-sales" && <SizeSalesReport orgId={orgId} start={start} end={end} />}
        {reportType === "payment-collection" && <PaymentCollectionReport orgId={orgId} start={start} end={end} />}
      </div>
    </div>
  );
};

/* ─── Reusable Components ─── */
const MetricCard = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <Card className="flex-1 min-w-[100px]">
    <CardContent className="p-3">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className={cn("text-base font-bold mt-0.5", color || "text-foreground")}>{value}</p>
    </CardContent>
  </Card>
);

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

/* 1. Daily Sales */
const DailySalesReport = ({ orgId, start, end }: RProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-daily-sales", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: sales } = await supabase.from("sales")
        .select("id, sale_number, customer_name, net_amount, sale_date, payment_status")
        .eq("organization_id", orgId!).is("deleted_at", null).eq("is_cancelled", false)
        .gte("sale_date", start!).lte("sale_date", end + "T23:59:59")
        .order("sale_date", { ascending: false }).limit(500);
      return sales || [];
    },
  });

  const total = useMemo(() => (data || []).reduce((s, r) => s + (r.net_amount || 0), 0), [data]);

  if (isLoading) return <LoadingRows />;
  if (!data?.length) return <EmptyState />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <MetricCard label="Total Sale" value={fmt(total)} color="text-emerald-600" />
        <MetricCard label="Bills" value={String(data.length)} />
      </div>
      <div className="space-y-2">
        {data.map((s: any) => (
          <div key={s.id} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border/40">
            <div>
              <p className="text-sm font-semibold">{s.sale_number}</p>
              <p className="text-[11px] text-muted-foreground">{s.customer_name || "Walk-in"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-600">{fmt(s.net_amount || 0)}</p>
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                s.payment_status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" :
                s.payment_status === "partial" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" :
                "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
              )}>
                {s.payment_status || "pending"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* 2. Daily Purchase */
const DailyPurchaseReport = ({ orgId, start, end }: RProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-daily-purchase", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: bills } = await supabase.from("purchase_bills")
        .select("id, software_bill_no, supplier_name, net_amount, bill_date, supplier_invoice_no")
        .eq("organization_id", orgId!).is("deleted_at", null)
        .gte("bill_date", start!).lte("bill_date", end + "T23:59:59")
        .order("bill_date", { ascending: false }).limit(500);
      return bills || [];
    },
  });

  const total = useMemo(() => (data || []).reduce((s, r) => s + (r.net_amount || 0), 0), [data]);

  if (isLoading) return <LoadingRows />;
  if (!data?.length) return <EmptyState />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <MetricCard label="Total Purchase" value={fmt(total)} color="text-orange-600" />
        <MetricCard label="Bills" value={String(data.length)} />
      </div>
      <div className="space-y-2">
        {data.map((b: any) => (
          <div key={b.id} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border/40">
            <div>
              <p className="text-sm font-semibold">{b.software_bill_no}</p>
              <p className="text-[11px] text-muted-foreground">{b.supplier_name} {b.supplier_invoice_no ? `• ${b.supplier_invoice_no}` : ""}</p>
            </div>
            <p className="text-sm font-bold text-orange-600">{fmt(b.net_amount || 0)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/* 3. Profit & Loss */
const ProfitLossReport = ({ orgId, start, end }: RProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-pnl", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const [salesRes, purchaseRes] = await Promise.all([
        supabase.from("sales").select("net_amount").eq("organization_id", orgId!).is("deleted_at", null).eq("is_cancelled", false)
          .gte("sale_date", start!).lte("sale_date", end + "T23:59:59"),
        supabase.from("purchase_bills").select("net_amount").eq("organization_id", orgId!).is("deleted_at", null)
          .gte("bill_date", start!).lte("bill_date", end + "T23:59:59"),
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
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-stock-summary", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: variants } = await supabase.from("product_variants")
        .select("id, size, color, current_stock, pur_price, sale_price, product_id, products!inner(product_name, brand)")
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
      const stock = v.current_stock || 0;
      purValue += stock * (v.pur_price || 0);
      saleValue += stock * (v.sale_price || 0);
    });
    // Group by product
    const prodMap = new Map<string, { name: string; brand: string; totalStock: number; purVal: number; saleVal: number }>();
    data.forEach((v: any) => {
      const pid = v.product_id;
      const prod = (v as any).products;
      const existing = prodMap.get(pid) || { name: prod?.product_name || "—", brand: prod?.brand || "", totalStock: 0, purVal: 0, saleVal: 0 };
      const stock = v.current_stock || 0;
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
  if (!data?.length) return <EmptyState message="No products found" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Products" value={String(stats.totalProducts)} />
        <MetricCard label="Variants" value={String(stats.totalVariants)} />
        <MetricCard label="Pur. Value" value={fmt(stats.purValue)} color="text-orange-600" />
        <MetricCard label="Sale Value" value={fmt(stats.saleValue)} color="text-emerald-600" />
      </div>
      <div className="space-y-2">
        {stats.items.slice(0, 100).map((p, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border/40">
            <div>
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="text-[11px] text-muted-foreground">{p.brand}</p>
            </div>
            <div className="text-right">
              <p className={cn("text-sm font-bold", p.totalStock <= 0 ? "text-destructive" : p.totalStock <= 10 ? "text-orange-600" : "text-emerald-600")}>{p.totalStock}</p>
              <p className="text-[10px] text-muted-foreground">{fmt(p.saleVal)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* 5. Customer Outstanding */
const CustomerOutstandingReport = ({ orgId }: { orgId?: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-cust-outstanding", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: customers } = await supabase.from("customers")
        .select("id, customer_name, phone, opening_balance")
        .eq("organization_id", orgId!).is("deleted_at", null);
      if (!customers?.length) return [];

      const { data: sales } = await supabase.from("sales")
        .select("customer_id, net_amount, sale_date")
        .eq("organization_id", orgId!).is("deleted_at", null).eq("is_cancelled", false)
        .in("payment_status", ["pending", "partial"]);

      const outMap = new Map<string, number>();
      (sales || []).forEach((s: any) => {
        if (s.customer_id) outMap.set(s.customer_id, (outMap.get(s.customer_id) || 0) + (s.net_amount || 0));
      });

      return customers
        .map((c) => ({ ...c, outstanding: (c.opening_balance || 0) + (outMap.get(c.id) || 0) }))
        .filter((c) => c.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding);
    },
  });

  const total = useMemo(() => (data || []).reduce((s, r) => s + r.outstanding, 0), [data]);

  if (isLoading) return <LoadingRows />;
  if (!data?.length) return <EmptyState message="No outstanding balances" />;

  return (
    <div className="space-y-3">
      <MetricCard label="Total Outstanding" value={fmt(total)} color="text-destructive" />
      <div className="space-y-2">
        {data.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border/40">
            <div>
              <p className="text-sm font-semibold">{c.customer_name}</p>
              <p className="text-[11px] text-muted-foreground">{c.phone || "—"}</p>
            </div>
            <p className="text-sm font-bold text-destructive">{fmt(c.outstanding)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/* 6. Supplier Outstanding */
const SupplierOutstandingReport = ({ orgId }: { orgId?: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-supp-outstanding", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: suppliers } = await supabase.from("suppliers")
        .select("id, supplier_name, phone, opening_balance")
        .eq("organization_id", orgId!).is("deleted_at", null);
      if (!suppliers?.length) return [];

      const { data: bills } = await supabase.from("purchase_bills")
        .select("supplier_id, net_amount, paid_amount")
        .eq("organization_id", orgId!).is("deleted_at", null);

      const outMap = new Map<string, number>();
      (bills || []).forEach((b: any) => {
        if (b.supplier_id) {
          const due = (b.net_amount || 0) - (b.paid_amount || 0);
          if (due > 0) outMap.set(b.supplier_id, (outMap.get(b.supplier_id) || 0) + due);
        }
      });

      return suppliers
        .map((s) => ({ ...s, outstanding: (s.opening_balance || 0) + (outMap.get(s.id) || 0) }))
        .filter((s) => s.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding);
    },
  });

  const total = useMemo(() => (data || []).reduce((s, r) => s + r.outstanding, 0), [data]);

  if (isLoading) return <LoadingRows />;
  if (!data?.length) return <EmptyState message="No outstanding balances" />;

  return (
    <div className="space-y-3">
      <MetricCard label="Total Outstanding" value={fmt(total)} color="text-destructive" />
      <div className="space-y-2">
        {data.map((s: any) => (
          <div key={s.id} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border/40">
            <div>
              <p className="text-sm font-semibold">{s.supplier_name}</p>
              <p className="text-[11px] text-muted-foreground">{s.phone || "—"}</p>
            </div>
            <p className="text-sm font-bold text-destructive">{fmt(s.outstanding)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/* 7. GST Report */
const GSTReport = ({ orgId, start, end }: RProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-gst", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: items } = await supabase.from("sale_items")
        .select("gst_percent, line_total, quantity, unit_price, sale_id, sales!inner(organization_id, sale_date, deleted_at, is_cancelled)")
        .eq("sales.organization_id", orgId!)
        .is("sales.deleted_at", null).eq("sales.is_cancelled", false)
        .gte("sales.sale_date", start!).lte("sales.sale_date", end + "T23:59:59");
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

  const totalTax = grouped.reduce((s, g) => s + g.tax, 0);

  if (isLoading) return <LoadingRows />;
  if (!grouped.length) return <EmptyState />;

  return (
    <div className="space-y-3">
      <MetricCard label="Total Tax" value={fmt(totalTax)} color="text-amber-600" />
      <div className="space-y-2">
        {grouped.map((g) => (
          <div key={g.rate} className="p-3 bg-card rounded-xl border border-border/40">
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm font-bold">GST {g.rate}%</p>
              <p className="text-sm font-bold text-amber-600">{fmt(g.tax)}</p>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Taxable: {fmt(g.taxable)}</span>
              <span>CGST: {fmt(g.cgst)} | SGST: {fmt(g.sgst)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* 8. Brand Sales */
const BrandSalesReport = ({ orgId, start, end }: RProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-brand-sales", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: items } = await supabase.from("sale_items")
        .select("product_id, quantity, line_total, sale_id, sales!inner(organization_id, sale_date, deleted_at, is_cancelled)")
        .eq("sales.organization_id", orgId!)
        .is("sales.deleted_at", null).eq("sales.is_cancelled", false)
        .gte("sales.sale_date", start!).lte("sales.sale_date", end + "T23:59:59");

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
  if (!data?.length) return <EmptyState />;

  return (
    <div className="space-y-2">
      {data.map((b: any, i: number) => (
        <div key={i} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border/40">
          <div>
            <p className="text-sm font-semibold">{b.brand}</p>
            <p className="text-[11px] text-muted-foreground">{b.qty} items sold</p>
          </div>
          <p className="text-sm font-bold text-teal-600">{fmt(b.total)}</p>
        </div>
      ))}
    </div>
  );
};

/* 9. Size Sales */
const SizeSalesReport = ({ orgId, start, end }: RProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-size-sales", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: items } = await supabase.from("sale_items")
        .select("size, quantity, line_total, sale_id, sales!inner(organization_id, sale_date, deleted_at, is_cancelled)")
        .eq("sales.organization_id", orgId!)
        .is("sales.deleted_at", null).eq("sales.is_cancelled", false)
        .gte("sales.sale_date", start!).lte("sales.sale_date", end + "T23:59:59");

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
  if (!data?.length) return <EmptyState />;

  return (
    <div className="space-y-2">
      {data.map((s: any, i: number) => (
        <div key={i} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border/40">
          <div>
            <p className="text-sm font-semibold">{s.size}</p>
            <p className="text-[11px] text-muted-foreground">{s.qty} sold</p>
          </div>
          <p className="text-sm font-bold text-indigo-600">{fmt(s.total)}</p>
        </div>
      ))}
    </div>
  );
};

/* 10. Payment Collection */
const PaymentCollectionReport = ({ orgId, start, end }: RProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-payment-collection", orgId, start, end],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: sales } = await supabase.from("sales")
        .select("cash_amount, upi_amount, card_amount, net_amount, sale_date")
        .eq("organization_id", orgId!).is("deleted_at", null).eq("is_cancelled", false)
        .gte("sale_date", start!).lte("sale_date", end + "T23:59:59");
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
