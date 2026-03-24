import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  IndianRupee, FileText, ShoppingCart, TrendingUp, Truck, Tag, CalendarIcon, ChevronRight, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

const fmtShort = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` :
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` :
  v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` :
  `₹${Math.round(v).toLocaleString("en-IN")}`;

interface Props {
  period: "today" | "week" | "month" | "custom";
  setPeriod: (p: "today" | "week" | "month" | "custom") => void;
  customRange: { from: Date; to: Date } | null;
  setCustomRange: (r: { from: Date; to: Date } | null) => void;
  onViewAllBills: () => void;
  onViewBill: (id: string) => void;
}

function getDateRange(period: string, custom: { from: Date; to: Date } | null) {
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

export const OwnerPurchaseDashboard = ({ period, setPeriod, customRange, setCustomRange, onViewAllBills, onViewBill }: Props) => {
  const { currentOrganization } = useOrganization();
  const { start, end } = getDateRange(period, customRange);
  const [showFromCal, setShowFromCal] = useState(false);
  const [showToCal, setShowToCal] = useState(false);

  /* ── Purchase bills data ── */
  const { data: purchaseData, isLoading } = useQuery({
    queryKey: ["owner-purchase-dash", currentOrganization?.id, start, end],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("purchase_bills")
        .select("id, software_bill_no, supplier_invoice_no, supplier_name, supplier_id, net_amount, total_qty, bill_date, created_at")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("bill_date", start)
        .lte("bill_date", end + "T23:59:59")
        .order("bill_date", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!currentOrganization,
    staleTime: 30000,
  });

  /* ── Purchase items for brand analysis ── */
  const { data: itemsData } = useQuery({
    queryKey: ["owner-purchase-items", currentOrganization?.id, start, end],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("purchase_items")
        .select("product_name, product_id, qty, pur_price, purchase_bills!inner(organization_id, bill_date, deleted_at)")
        .eq("purchase_bills.organization_id", currentOrganization.id)
        .is("purchase_bills.deleted_at", null)
        .gte("purchase_bills.bill_date", start)
        .lte("purchase_bills.bill_date", end + "T23:59:59");
      return data || [];
    },
    enabled: !!currentOrganization,
    staleTime: 30000,
  });

  /* ── Brand data ── */
  const { data: brandData } = useQuery({
    queryKey: ["owner-purchase-brands", currentOrganization?.id, start, end],
    queryFn: async () => {
      if (!currentOrganization || !itemsData?.length) return [];
      const productIds = [...new Set(itemsData.map((i: any) => i.product_id))].filter(Boolean);
      if (!productIds.length) return [];
      const { data } = await supabase
        .from("products")
        .select("id, brand")
        .in("id", productIds.slice(0, 500));
      return data || [];
    },
    enabled: !!currentOrganization && (itemsData?.length || 0) > 0,
    staleTime: 60000,
  });

  /* ── Supplier outstanding ── */
  const { data: supplierOutstanding } = useQuery({
    queryKey: ["owner-supplier-outstanding", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("suppliers")
        .select("id, supplier_name, opening_balance")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      return data || [];
    },
    enabled: !!currentOrganization,
    staleTime: 60000,
  });

  /* ── Computed stats ── */
  const stats = useMemo(() => {
    if (!purchaseData?.length) return { total: 0, count: 0, avg: 0, qty: 0 };
    const total = purchaseData.reduce((s, r) => s + (r.net_amount || 0), 0);
    const count = purchaseData.length;
    const qty = purchaseData.reduce((s, r) => s + (r.total_qty || 0), 0);
    return { total, count, avg: count ? total / count : 0, qty };
  }, [purchaseData]);

  /* Top suppliers */
  const topSuppliers = useMemo(() => {
    if (!purchaseData?.length) return [];
    const map = new Map<string, { name: string; bills: number; total: number }>();
    purchaseData.forEach((p) => {
      const key = p.supplier_name || "Unknown";
      const ex = map.get(key) || { name: key, bills: 0, total: 0 };
      ex.bills++;
      ex.total += p.net_amount || 0;
      map.set(key, ex);
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [purchaseData]);

  /* Brand purchases */
  const brandPurchases = useMemo(() => {
    if (!itemsData?.length || !brandData?.length) return [];
    const prodBrand = new Map(brandData.map((p) => [p.id, p.brand || "Unknown"]));
    const map = new Map<string, number>();
    itemsData.forEach((i: any) => {
      const brand = prodBrand.get(i.product_id) || "Unknown";
      map.set(brand, (map.get(brand) || 0) + ((i.qty || 0) * (i.pur_price || 0)));
    });
    return [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }, [itemsData, brandData]);

  /* Supplier outstanding list */
  const outstandingList = useMemo(() => {
    if (!supplierOutstanding?.length) return [];
    return supplierOutstanding
      .filter((s) => (s.opening_balance || 0) > 0)
      .map((s) => ({ name: s.supplier_name, amount: s.opening_balance || 0 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [supplierOutstanding]);

  const summaryCards = [
    { label: "Total Purchase", value: stats.total, icon: IndianRupee, tint: "bg-warning/10", color: "text-warning" },
    { label: "Bills", value: stats.count, icon: FileText, tint: "bg-primary/10", color: "text-primary", raw: true },
    { label: "Avg Bill", value: stats.avg, icon: TrendingUp, tint: "bg-info/10", color: "text-info" },
    { label: "Items Bought", value: stats.qty, icon: ShoppingCart, tint: "bg-success/10", color: "text-success", raw: true },
  ];

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* ── Period Toggle ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex gap-2">
          {(["today", "week", "month", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "flex-1 text-xs font-semibold py-2 rounded-lg transition-all touch-manipulation",
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex gap-2 mt-2">
            <Popover open={showFromCal} onOpenChange={setShowFromCal}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 text-xs justify-start">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {customRange?.from ? format(customRange.from, "dd MMM") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={customRange?.from}
                  onSelect={(d) => {
                    if (d) setCustomRange({ from: d, to: customRange?.to || d });
                    setShowFromCal(false);
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Popover open={showToCal} onOpenChange={setShowToCal}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 text-xs justify-start">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {customRange?.to ? format(customRange.to, "dd MMM") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={customRange?.to}
                  onSelect={(d) => {
                    if (d) setCustomRange({ from: customRange?.from || d, to: d });
                    setShowToCal(false);
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* ── Summary Cards ── */}
      <div className="px-4 mt-4">
        <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 snap-x">
          {summaryCards.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                className="min-w-[140px] snap-start bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm shrink-0"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", c.tint)}>
                    <Icon className={cn("h-3.5 w-3.5", c.color)} />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{c.label}</span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-6 w-20" />
                ) : (
                  <p className="text-lg font-bold text-foreground tabular-nums">
                    {c.raw ? Math.round(c.value).toLocaleString("en-IN") : fmtShort(c.value)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── View All Bills ── */}
      <div className="px-4 mt-4">
        <button
          onClick={onViewAllBills}
          className="w-full flex items-center justify-between bg-card rounded-2xl px-4 py-3 border border-border/40 shadow-sm active:scale-[0.98] transition-all touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-warning" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">View All Bills</p>
              <p className="text-[10px] text-muted-foreground">{stats.count} bills in period</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* ── Top Suppliers ── */}
      <div className="px-4 mt-5">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              Top Suppliers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {topSuppliers.length > 0 ? (
              <div className="space-y-0">
                {topSuppliers.map((s, idx) => (
                  <div
                    key={s.name}
                    className={cn("flex items-center gap-2.5 py-2", idx < topSuppliers.length - 1 && "border-b border-border/40")}
                  >
                    <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.bills} bills</p>
                    </div>
                    <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">{fmtShort(s.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No data for this period</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Brand Purchases ── */}
      <div className="px-4 mt-5">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4 text-accent" />
              Brand-wise Purchases
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {brandPurchases.length > 0 ? (
              <div className="space-y-0">
                {brandPurchases.slice(0, 10).map((b, idx) => (
                  <div
                    key={b.name}
                    className={cn("flex items-center justify-between py-2", idx < Math.min(brandPurchases.length, 10) - 1 && "border-b border-border/40")}
                  >
                    <span className="text-xs font-medium text-foreground">{b.name}</span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">{fmtShort(b.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No data for this period</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Supplier Outstanding ── */}
      <div className="px-4 mt-5 mb-6">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Supplier Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {outstandingList.length > 0 ? (
              <div className="space-y-0">
                {outstandingList.map((s, idx) => (
                  <div
                    key={s.name}
                    className={cn("flex items-center justify-between py-2", idx < outstandingList.length - 1 && "border-b border-border/40")}
                  >
                    <span className="text-xs font-medium text-foreground truncate flex-1 mr-2">{s.name}</span>
                    <span className="text-xs font-bold text-destructive tabular-nums shrink-0">{fmtShort(s.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No pending payments</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
