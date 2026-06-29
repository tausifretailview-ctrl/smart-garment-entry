import { useState, useCallback } from "react";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/mobile/PullToRefreshIndicator";
import { invalidateMobileSalesHubQueries } from "@/lib/mobileHubRefresh";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { MobileModuleNavStrip } from "@/components/mobile/MobileModuleNavStrip";
import { MobileSalePrintPreviewDialog } from "@/components/mobile/MobileSalePrintPreviewDialog";
import { MobileDateFilterChips } from "@/components/mobile/MobileDateFilterChips";
import { MOBILE_HOME_SALE_TYPES, mobileSalesDateBounds } from "@/lib/mobileShell";
import { formatTimestampIST } from "@/lib/localDayBounds";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, TrendingUp, FileText, RotateCcw, Eye, MessageCircle, Download } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

export default function MobileSalesHub() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const queryClient = useQueryClient();
  const { scrollRef, isRefreshing, pullHandlers } = usePullToRefresh(
    useCallback(() => invalidateMobileSalesHubQueries(queryClient), [queryClient])
  );
  const [period, setPeriod] = useState("today");
  const [search, setSearch] = useState("");

  const openCustomerAccount = useOpenCustomerAccount();
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const getDateRange = () => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    if (period === "today") return { start: today, end: today };
    if (period === "yesterday") {
      const y = format(subDays(now, 1), "yyyy-MM-dd");
      return { start: y, end: y };
    }
    if (period === "week") return { start: format(subDays(now, 7), "yyyy-MM-dd"), end: today };
    if (period === "month") return { start: format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"), end: today };
    return { start: today, end: today };
  };

  const { start, end } = getDateRange();
  const { startIso, endIso } = mobileSalesDateBounds(start, end);

  /** Combined ERP + POS totals (same logic as OwnerDashboard — full day range, not list slice). */
  const { data: salesSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["mobile-sales-summary", currentOrganization?.id, start, end],
    queryFn: async () => {
      return withMobileQueryTimeout(async () => {
        const { data, error } = await supabase
          .from("sales")
          .select("net_amount, sale_type")
          .eq("organization_id", currentOrganization!.id)
          .is("deleted_at", null)
          .eq("is_cancelled", false)
          .in("sale_type", [...MOBILE_HOME_SALE_TYPES])
          .gte("sale_date", startIso)
          .lte("sale_date", endIso);
        if (error) throw error;
        const rows = data || [];
        let invoiceTotal = 0;
        let posTotal = 0;
        let invoiceCount = 0;
        let posCount = 0;
        for (const row of rows) {
          const amt = row.net_amount || 0;
          if (row.sale_type === "pos") {
            posTotal += amt;
            posCount += 1;
          } else {
            invoiceTotal += amt;
            invoiceCount += 1;
          }
        }
        return {
          total: invoiceTotal + posTotal,
          count: rows.length,
          invoiceTotal,
          posTotal,
          invoiceCount,
          posCount,
        };
      });
    },
    enabled: !!currentOrganization?.id,
    staleTime: STALE_LIVE,
    retry: 1,
  });

  const { data: salesData, isLoading: listLoading } = useQuery({
    queryKey: ["mobile-sales-list", currentOrganization?.id, start, end, search],
    queryFn: async () => {
      return withMobileQueryTimeout(async () => {
        let q = supabase
          .from("sales")
          .select("id, sale_number, sale_date, created_at, customer_name, customer_id, net_amount, paid_amount, payment_status, sale_type, gross_amount, discount_amount, flat_discount_amount, sale_return_adjust, payment_method, salesman, notes, customer_address, customer_phone, customers(gst_number)")
          .eq("organization_id", currentOrganization!.id)
          .is("deleted_at", null)
          .eq("is_cancelled", false)
          .in("sale_type", [...MOBILE_HOME_SALE_TYPES])
          .gte("sale_date", startIso)
          .lte("sale_date", endIso)
          .order("created_at", { ascending: false })
          .limit(50);
        if (search.trim()) {
          q = q.or(`sale_number.ilike.%${search}%,customer_name.ilike.%${search}%`);
        }
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      });
    },
    enabled: !!currentOrganization?.id,
    staleTime: STALE_LIVE,
    retry: 1,
  });

  const isLoading = summaryLoading || listLoading;
  const totalSales = salesSummary?.total ?? 0;
  const totalCount = salesSummary?.count ?? 0;
  const posTotal = salesSummary?.posTotal ?? 0;
  const invoiceTotal = salesSummary?.invoiceTotal ?? 0;

  const statusColor = (status: string) => {
    if (status === "paid") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (status === "partial") return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-rose-100 text-rose-700 border-rose-200";
  };

  const handleCustomerClick = (sale: any) => {
    if (sale.customer_name && sale.customer_name !== 'Walk-in') {
      openCustomerAccount(sale.customer_id, sale.customer_name);
    }
  };

  const handleOpenPreview = (saleId: string) => {
    setPreviewSaleId(saleId);
    setPreviewOpen(true);
  };

  return (
    <div
      ref={scrollRef}
      className="min-h-screen bg-slate-50 dark:bg-background pb-24"
      {...pullHandlers}
    >
      <PullToRefreshIndicator visible={isRefreshing} />
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Sales</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 bg-muted/50 border-0 rounded-xl text-sm"
          />
        </div>
        <div className="-mx-4 px-4">
          <MobileDateFilterChips selectedPeriod={period} onPeriodChange={setPeriod} />
        </div>
      </div>

      {/* Stats strip — ERP + POS combined (matches owner home dashboard) */}
      <div className="px-4 py-3 bg-white dark:bg-card border-b border-border/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Total Sales</span>
            </div>
            {summaryLoading ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <span className="text-sm font-bold tabular-nums text-foreground">
                ₹{totalSales >= 100000 ? `${(totalSales / 100000).toFixed(1)}L` : totalSales.toLocaleString("en-IN")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">Bills</span>
            </div>
            {summaryLoading ? (
              <Skeleton className="h-5 w-8" />
            ) : (
              <span className="text-sm font-bold tabular-nums text-foreground">{totalCount}</span>
            )}
          </div>
        </div>
        {!summaryLoading && totalCount > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>
              POS{" "}
              <span className="font-semibold text-foreground tabular-nums">
                ₹{posTotal >= 100000 ? `${(posTotal / 100000).toFixed(1)}L` : posTotal.toLocaleString("en-IN")}
              </span>
              {salesSummary?.posCount ? ` (${salesSummary.posCount})` : ""}
            </span>
            <span>
              Invoice{" "}
              <span className="font-semibold text-foreground tabular-nums">
                ₹{invoiceTotal >= 100000 ? `${(invoiceTotal / 100000).toFixed(1)}L` : invoiceTotal.toLocaleString("en-IN")}
              </span>
              {salesSummary?.invoiceCount ? ` (${salesSummary.invoiceCount})` : ""}
            </span>
          </div>
        )}
      </div>

      <MobileModuleNavStrip className="pt-2" />

      {/* Invoice List */}
      <div className="px-4 py-3 space-y-2.5">
        {listLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-card rounded-2xl p-4 border border-border/40 shadow-sm space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))
        ) : salesData?.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No invoices found</p>
          </div>
        ) : (
          salesData?.map((sale) => (
            <div
              key={sale.id}
              className="w-full bg-white dark:bg-card rounded-2xl border border-border/40 shadow-sm text-left overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground font-mono">{sale.sale_number}</span>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 border", statusColor(sale.payment_status || 'unpaid'))}>
                        {sale.payment_status}
                      </Badge>
                      {sale.sale_type === 'pos' && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">POS</Badge>
                      )}
                    </div>
                    {/* Clickable customer name */}
                    <button
                      onClick={() => handleCustomerClick(sale)}
                      className={cn(
                        "text-xs mt-1 truncate max-w-full text-left",
                        sale.customer_name && sale.customer_name !== 'Walk-in'
                          ? "text-primary underline underline-offset-2 active:text-primary/70"
                          : "text-muted-foreground cursor-default"
                      )}
                    >
                      {sale.customer_name || 'Walk-in'}
                    </button>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {formatTimestampIST(sale.created_at || sale.sale_date)}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1 ml-2">
                    <p className="text-sm font-bold tabular-nums text-foreground">₹{(sale.net_amount || 0).toLocaleString("en-IN")}</p>
                    {sale.payment_status === 'partial' && (
                      <span className="text-[10px] text-rose-500">
                        Pending: ₹{Math.max(0, (sale.net_amount || 0) - (sale.paid_amount || 0)).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Action buttons row */}
              <div className="flex items-center border-t border-border/40 divide-x divide-border/40">
                <button
                  onClick={() => handleOpenPreview(sale.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary active:bg-primary/5 transition-colors touch-manipulation"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const invoiceUrl = `https://app.inventoryshop.in/invoice/view/${sale.id}`;
                    const message = `Invoice ${sale.sale_number}%0AAmount: ₹${(sale.net_amount || 0).toLocaleString("en-IN")}%0ACustomer: ${sale.customer_name || 'Walk-in'}%0A%0AView: ${invoiceUrl}`;
                    window.open(`https://wa.me/?text=${message}`, '_blank');
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-emerald-600 active:bg-emerald-50 transition-colors touch-manipulation"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenPreview(sale.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-violet-600 active:bg-violet-50 transition-colors touch-manipulation"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>PDF</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sale Return quick link */}
      <div className="px-4 pb-4">
        <button
          onClick={() => orgNavigate("/sale-return-entry")}
          className="w-full bg-white dark:bg-card rounded-2xl px-4 py-3.5 border border-border/40 flex items-center justify-between active:bg-muted/30 transition-colors touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-rose-500" />
            </div>
            <span className="text-sm font-medium text-foreground">Sale Return Entry</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <MobileSalePrintPreviewDialog
        saleId={previewSaleId}
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewSaleId(null);
        }}
      />
    </div>
  );
}
