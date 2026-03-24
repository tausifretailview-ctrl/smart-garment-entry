import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, FileText, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

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

interface Props {
  period: "today" | "week" | "month" | "custom";
  customRange: { from: Date; to: Date } | null;
  onBack: () => void;
  onViewBill: (id: string) => void;
}

const PAGE_SIZE = 20;

export const OwnerSalesBillList = ({ period, customRange, onBack, onViewBill }: Props) => {
  const { currentOrganization } = useOrganization();
  const { start, end } = getDateRange(period, customRange);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: bills, isLoading } = useQuery({
    queryKey: ["owner-bills-list", currentOrganization?.id, start, end],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("sales")
        .select("id, sale_number, net_amount, customer_name, sale_date, created_at, payment_status, payment_method, is_cancelled")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", start)
        .lte("sale_date", end + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!currentOrganization,
    staleTime: 30000,
  });

  const filtered = useMemo(() => {
    let list = bills || [];
    if (statusFilter !== "all") {
      list = list.filter((b) => b.payment_status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          (b.sale_number || "").toLowerCase().includes(q) ||
          (b.customer_name || "").toLowerCase().includes(q) ||
          String(b.net_amount || 0).includes(q)
      );
    }
    return list;
  }, [bills, search, statusFilter]);

  const visibleBills = filtered.slice(0, visibleCount);

  const statusBadge = (status: string, cancelled: boolean) => {
    if (cancelled)
      return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Cancelled</span>;
    switch (status) {
      case "paid":
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/15 text-success">Paid</span>;
      case "pending":
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Pending</span>;
      case "partial":
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning">Partial</span>;
      default:
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 touch-manipulation">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground flex-1">Sales Bills</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn("w-8 h-8 rounded-full flex items-center justify-center active:scale-90 touch-manipulation", showFilters && "bg-primary/10")}
          >
            <Filter className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bill no, customer, amount..."
              className="pl-9 h-9 text-sm rounded-xl bg-muted/50"
            />
          </div>
        </div>
        {showFilters && (
          <div className="px-4 pb-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs rounded-xl">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Bill list */}
      <div className="px-4 mt-3 space-y-2">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm">
              <div className="flex justify-between">
                <div>
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="text-right">
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
            </div>
          ))
        ) : visibleBills.length > 0 ? (
          <>
            {visibleBills.map((bill) => (
              <button
                key={bill.id}
                onClick={() => onViewBill(bill.id)}
                className="w-full bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm active:scale-[0.98] transition-all touch-manipulation text-left"
              >
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground">{bill.sale_number}</p>
                      {statusBadge(bill.payment_status || "pending", bill.is_cancelled || false)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {bill.customer_name || "Walk-in Customer"}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-[10px] text-muted-foreground">
                      {bill.created_at ? format(new Date(bill.created_at), "dd MMM, hh:mm a") : ""}
                    </p>
                    <p className="text-sm font-bold text-success tabular-nums mt-0.5">
                      {fmt(bill.net_amount || 0)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
            {visibleCount < filtered.length && (
              <button
                onClick={() => setVisibleCount((p) => p + PAGE_SIZE)}
                className="w-full text-center text-xs font-semibold text-primary py-3 active:opacity-70 touch-manipulation"
              >
                Load More ({filtered.length - visibleCount} remaining)
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">No sales found</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different period or search term</p>
          </div>
        )}
      </div>
    </div>
  );
};
