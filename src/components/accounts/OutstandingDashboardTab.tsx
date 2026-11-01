import { useState, useMemo } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Clock, AlertTriangle, AlertCircle, XCircle, 
  TrendingUp, Users, IndianRupee,
  ArrowUpDown, ArrowDown, ArrowUp, Phone
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import {
  fetchOrgLedgerCustomersReference,
  fetchOrgLedgerSalesSummaryReference,
} from "@/hooks/useOrgLedgerReferenceData";
import {
  fetchCustomerFinancialSnapshotMap,
  fetchCustomersWithFinancialActivity,
} from "@/utils/customerFinancialSnapshot";
import { AccountsExportButtons } from "@/components/accounts/AccountsExportButtons";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileStatStrip } from "@/components/mobile/MobileStatStrip";
import { MobileListCard } from "@/components/mobile/MobileListCard";
import { AccountsHistoryPanel } from "@/components/accounts/AccountsHistoryPanel";
import { accountsHistoryTableClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import { ResetPersistedFiltersButton } from "@/components/ResetPersistedFiltersButton";
import { useIndustrialMode } from "@/hooks/useIndustrialMode";
import { daysPastDue, dueAgeBucket } from "@/utils/industrialMode";

interface OutstandingDashboardTabProps {
  organizationId: string;
  visitedTabs?: ReadonlySet<string>;
}

interface AgingBucket {
  label: string;
  range: string;
  count: number;
  amount: number;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
}

interface CustomerOutstanding {
  id: string;
  name: string;
  phone: string | null;
  totalOutstanding: number;
  invoiceCount: number;
  oldestDays: number;
  aging: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  /** Industrial mode: the same dues aged by days past the bill's due date ("current" = not due yet). */
  dueAging: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  /** Industrial mode: most days any open bill is past its due date (0 when nothing is overdue). */
  maxOverdueDays: number;
}

type AgeBy = "bill" | "due";

const emptyAging = () => ({ current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 });

/** Bucket names per ageing mode; "bill" keeps the labels this tab always had. */
const AGE_LABELS: Record<AgeBy, { short: string[]; card: Array<{ label: string; range: string }>; export: string[] }> = {
  bill: {
    short: ["0-7d", "8-30d", "31-60d", "61-90d", "90d+"],
    card: [
      { label: "Current", range: "0–7 days" },
      { label: "30 Days", range: "8–30 days" },
      { label: "60 Days", range: "31–60 days" },
      { label: "90 Days", range: "61–90 days" },
      { label: "90+ Days", range: "> 90 days" },
    ],
    export: ["Current (0-7d)", "8-30 Days", "31-60 Days", "61-90 Days", "90+ Days"],
  },
  due: {
    short: ["Not due", "1-30d late", "31-60d late", "61-90d late", "90d+ late"],
    card: [
      { label: "Not due yet", range: "due date ahead" },
      { label: "1–30 days", range: "past due date" },
      { label: "31–60 days", range: "past due date" },
      { label: "61–90 days", range: "past due date" },
      { label: "90+ days", range: "past due date" },
    ],
    export: ["Not Due", "1-30 Days Overdue", "31-60 Days Overdue", "61-90 Days Overdue", "90+ Days Overdue"],
  },
};

type SortField = "name" | "totalOutstanding" | "invoiceCount" | "oldestDays";
type SortDir = "asc" | "desc";

export function OutstandingDashboardTab({ organizationId, visitedTabs }: OutstandingDashboardTabProps) {
  const tabActive = visitedTabs?.has("outstanding") ?? true;
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("totalOutstanding");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [minAmount, setMinAmount] = useState<string>("all");
  const industrialMode = useIndustrialMode();
  const [ageByChoice, setAgeByChoice] = useState<AgeBy>("bill");
  const ageBy: AgeBy = industrialMode.enabled ? ageByChoice : "bill";
  const ageLabels = AGE_LABELS[ageBy];

  const { clearPersistedFilters } = useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.accountsOutstanding,
    organizationId,
    useMemo(
      () => ({ search, sortField, sortDir, minAmount }),
      [search, sortField, sortDir, minAmount],
    ),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["search", setSearch],
          ["sortField", (v) => setSortField(v as SortField)],
          ["sortDir", (v) => setSortDir(v as SortDir)],
          ["minAmount", setMinAmount],
        ],
      });
    },
  );

  const outstandingFiltersDirty =
    search !== "" ||
    sortField !== "totalOutstanding" ||
    sortDir !== "desc" ||
    minAmount !== "all";

  const resetOutstandingFilters = () => {
    setSearch("");
    setSortField("totalOutstanding");
    setSortDir("desc");
    setMinAmount("all");
    clearPersistedFilters();
  };

  // Fetch all outstanding invoices (pending + partial)
  const { data: outstandingData, isLoading } = useQuery({
    queryKey: ["outstanding-dashboard", organizationId],
    queryFn: async () => {
      const [customersData, salesData] = await Promise.all([
        fetchOrgLedgerCustomersReference(organizationId, queryClient),
        fetchOrgLedgerSalesSummaryReference(organizationId, queryClient),
      ]);

      // Fetch voucher payments for accurate outstanding calc
      const { data: allVouchers } = await supabase
        .from("voucher_entries")
        .select("reference_id, reference_type, total_amount, payment_method, description")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      // Also fetch sale returns and unused advances per customer — removed for headline;
      // authoritative balance comes from get_customer_financial_snapshot below.

      // Build voucher payment map (sale_id -> total paid via vouchers)
      const invoiceVoucherPayments = new Map<string, number>();
      const openingBalancePayments = new Map<string, number>();
      const saleToCustomerMap = new Map<string, string>();

      salesData.forEach((s: any) => {
        if (s.customer_id) saleToCustomerMap.set(s.id, s.customer_id);
      });

      allVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        // Skip advance/CN adjustment receipts so they don't inflate cash voucherPaid
        const desc = (v.description || "").toLowerCase();
        const isAdv =
          v.payment_method === "advance_adjustment" ||
          desc.includes("adjusted from advance balance") ||
          desc.includes("advance adjusted");
        const isCn =
          v.payment_method === "credit_note_adjustment" ||
          desc.includes("credit note adjusted") ||
          desc.includes("cn adjusted");
        if (isAdv || isCn) return;
        const customerId = saleToCustomerMap.get(v.reference_id);
        if (v.reference_type === "sale" || customerId) {
          invoiceVoucherPayments.set(
            v.reference_id,
            (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0)
          );
        } else if (v.reference_type === "customer") {
          openingBalancePayments.set(
            v.reference_id,
            (openingBalancePayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0)
          );
        }
      });

      const customerMap = new Map<string, any>();
      customersData.forEach((c: any) => customerMap.set(c.id, c));

      const today = new Date();

      // Build per-customer outstanding data
      const customerOutstandings = new Map<string, CustomerOutstanding>();

      // Process invoices
      salesData.forEach((sale: any) => {
        if (!sale.customer_id) return;
        const netAmount = sale.net_amount || 0;
        const salePaid = sale.paid_amount || 0;
        const sra = sale.sale_return_adjust || 0;
        const voucherPaid = invoiceVoucherPayments.get(sale.id) || 0;
        const effectivePaid = Math.max(salePaid, voucherPaid);
        const outstanding = Math.max(0, Math.round(netAmount - effectivePaid - sra));

        if (outstanding < 1) return;

        const daysOld = differenceInDays(today, new Date(sale.sale_date));
        const customer = customerMap.get(sale.customer_id);
        if (!customer) return;

        let entry = customerOutstandings.get(sale.customer_id);
        if (!entry) {
          entry = {
            id: sale.customer_id,
            name: customer.customer_name,
            phone: customer.phone,
            totalOutstanding: 0,
            invoiceCount: 0,
            oldestDays: 0,
            aging: emptyAging(),
            dueAging: emptyAging(),
            maxOverdueDays: 0,
          };
          customerOutstandings.set(sale.customer_id, entry);
        }

        entry.totalOutstanding += outstanding;
        entry.invoiceCount += 1;
        entry.oldestDays = Math.max(entry.oldestDays, daysOld);

        if (daysOld <= 7) entry.aging.current += outstanding;
        else if (daysOld <= 30) entry.aging.d30 += outstanding;
        else if (daysOld <= 60) entry.aging.d60 += outstanding;
        else if (daysOld <= 90) entry.aging.d90 += outstanding;
        else entry.aging.d90plus += outstanding;

        const overdueDays = daysPastDue(sale.due_date, sale.sale_date, today);
        const dueKey = dueAgeBucket(overdueDays);
        entry.dueAging[dueKey === "notDue" ? "current" : dueKey] += outstanding;
        entry.maxOverdueDays = Math.max(entry.maxOverdueDays, overdueDays);
      });

      // Add opening balances as 90+ day outstanding
      customersData.forEach((c: any) => {
        const ob = c.opening_balance || 0;
        const obPaid = openingBalancePayments.get(c.id) || 0;
        const obOutstanding = Math.max(0, Math.round(ob - obPaid));
        if (obOutstanding < 1) return;

        let entry = customerOutstandings.get(c.id);
        if (!entry) {
          entry = {
            id: c.id,
            name: c.customer_name,
            phone: c.phone,
            totalOutstanding: 0,
            invoiceCount: 0,
            oldestDays: 999,
            aging: emptyAging(),
            dueAging: emptyAging(),
            maxOverdueDays: 0,
          };
          customerOutstandings.set(c.id, entry);
        }
        entry.totalOutstanding += obOutstanding;
        entry.aging.d90plus += obOutstanding;
        entry.oldestDays = Math.max(entry.oldestDays, 365);
        entry.dueAging.d90plus += obOutstanding;
        entry.maxOverdueDays = Math.max(entry.maxOverdueDays, 365);
      });

      // Headline balance: authoritative snapshot RPC (matches Payment tab / POS picker).
      const financialIds = await fetchCustomersWithFinancialActivity(organizationId, supabase);
      const snapshotCustomerIds = customersData
        .map((c: { id: string }) => c.id)
        .filter((id: string) => financialIds.has(id));
      const snapMap = await fetchCustomerFinancialSnapshotMap(
        organizationId,
        snapshotCustomerIds,
        supabase,
      );

      const result: CustomerOutstanding[] = [];
      const seen = new Set<string>();

      snapMap.forEach((snap, customerId) => {
        if (snap.outstandingDr < 1) return;
        const customer = customerMap.get(customerId);
        if (!customer) return;
        seen.add(customerId);
        const agingEntry = customerOutstandings.get(customerId);
        result.push({
          id: customerId,
          name: customer.customer_name,
          phone: customer.phone,
          totalOutstanding: snap.outstandingDr,
          invoiceCount: agingEntry?.invoiceCount ?? 0,
          oldestDays: agingEntry?.oldestDays ?? 0,
          aging: agingEntry?.aging ?? {
            current: 0,
            d30: 0,
            d60: 0,
            d90: 0,
            d90plus: 0,
          },
          dueAging: agingEntry?.dueAging ?? emptyAging(),
          maxOverdueDays: agingEntry?.maxOverdueDays ?? 0,
        });
      });

      // Include invoice-aging rows whose snapshot is still loading as zero (edge case).
      customerOutstandings.forEach((entry) => {
        if (seen.has(entry.id)) return;
        if (entry.totalOutstanding < 1) return;
        result.push(entry);
      });

      return result;
    },
    enabled: !!organizationId && tabActive,
    staleTime: 60000,
  });

  const loadedCustomers = outstandingData || [];
  /** Due-date view reuses the bill-date layout: swap in the due-date buckets and overdue days. */
  const customers = useMemo(
    () =>
      ageBy === "due"
        ? loadedCustomers.map((c) => ({ ...c, aging: c.dueAging ?? emptyAging(), oldestDays: Math.max(0, c.maxOverdueDays ?? 0) }))
        : loadedCustomers,
    [loadedCustomers, ageBy],
  );

  // Compute aging buckets
  const agingBuckets: AgingBucket[] = useMemo(() => {
    const totals = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const counts = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    customers.forEach((c) => {
      if (c.aging.current > 0) { totals.current += c.aging.current; counts.current++; }
      if (c.aging.d30 > 0) { totals.d30 += c.aging.d30; counts.d30++; }
      if (c.aging.d60 > 0) { totals.d60 += c.aging.d60; counts.d60++; }
      if (c.aging.d90 > 0) { totals.d90 += c.aging.d90; counts.d90++; }
      if (c.aging.d90plus > 0) { totals.d90plus += c.aging.d90plus; counts.d90plus++; }
    });
    const names = ageLabels.card;
    return [
      { label: names[0].label, range: names[0].range, count: counts.current, amount: totals.current, icon: <Clock className="h-5 w-5" />, colorClass: "text-success", bgClass: "bg-success/10 border-success/20" },
      { label: names[1].label, range: names[1].range, count: counts.d30, amount: totals.d30, icon: <TrendingUp className="h-5 w-5" />, colorClass: "text-info", bgClass: "bg-info/10 border-info/20" },
      { label: names[2].label, range: names[2].range, count: counts.d60, amount: totals.d60, icon: <AlertTriangle className="h-5 w-5" />, colorClass: "text-warning", bgClass: "bg-warning/10 border-warning/20" },
      { label: names[3].label, range: names[3].range, count: counts.d90, amount: totals.d90, icon: <AlertCircle className="h-5 w-5" />, colorClass: "text-destructive/80", bgClass: "bg-destructive/5 border-destructive/20" },
      { label: names[4].label, range: names[4].range, count: counts.d90plus, amount: totals.d90plus, icon: <XCircle className="h-5 w-5" />, colorClass: "text-destructive", bgClass: "bg-destructive/10 border-destructive/30" },
    ];
  }, [customers, ageLabels]);

  /** Overdue card: past 30 days of bill age, or anything past its due date. */
  const overdueBuckets = agingBuckets.slice(ageBy === "due" ? 1 : 2);

  const totalOutstanding = customers.reduce((sum, c) => sum + c.totalOutstanding, 0);
  const totalCustomers = customers.length;
  const totalInvoices = customers.reduce((sum, c) => sum + c.invoiceCount, 0);

  // Filter & sort
  const filteredCustomers = useMemo(() => {
    let list = [...customers];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q));
    }
    if (minAmount !== "all") {
      const min = parseInt(minAmount);
      list = list.filter((c) => c.totalOutstanding >= min);
    }
    list.sort((a, b) => {
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [customers, search, sortField, sortDir, minAmount]);

  const topDefaulters = useMemo(() => {
    return [...customers].sort((a, b) => b.totalOutstanding - a.totalOutstanding).slice(0, 10);
  }, [customers]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const getAgingBadge = (days: number) => {
    if (ageBy === "due") {
      if (days <= 0) return <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs">Not due</Badge>;
      if (days <= 30) return <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-xs">{days}d late</Badge>;
      if (days <= 60) return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs">{days}d late</Badge>;
      if (days <= 90) return <Badge variant="outline" className="bg-destructive/10 text-destructive/80 border-destructive/30 text-xs">{days}d late</Badge>;
      return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/40 text-xs font-semibold">90d+ late</Badge>;
    }
    if (days <= 7) return <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-xs">Current</Badge>;
    if (days <= 30) return <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-xs">30d</Badge>;
    if (days <= 60) return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-xs">60d</Badge>;
    if (days <= 90) return <Badge variant="outline" className="bg-destructive/10 text-destructive/80 border-destructive/30 text-xs">90d</Badge>;
    return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/40 text-xs font-semibold">90d+</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading outstanding data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-red-500 to-red-600">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-white/80 flex items-center gap-1">
              <IndianRupee className="h-3.5 w-3.5" /> Total Outstanding
            </p>
            <div className="text-2xl font-black text-white tabular-nums mt-0.5">
              ₹{Math.round(totalOutstanding).toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-white/65 mt-0.5">{totalInvoices} unpaid invoices</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-amber-500 to-amber-600">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-white/80 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Customers with Dues
            </p>
            <div className="text-2xl font-black text-white tabular-nums mt-0.5">{totalCustomers}</div>
            <p className="text-xs text-white/65 mt-0.5">
              Avg ₹{totalCustomers > 0 ? Math.round(totalOutstanding / totalCustomers).toLocaleString("en-IN") : 0} per customer
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-violet-500 to-violet-600">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-white/80 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> {ageBy === "due" ? "Overdue (past due date)" : <>Overdue (&gt;30 days)</>}
            </p>
            <div className="text-2xl font-black text-white tabular-nums mt-0.5">
              ₹{Math.round(
                overdueBuckets.reduce((s, b) => s + b.amount, 0)
              ).toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-white/65 mt-0.5">
              {overdueBuckets.reduce((s, b) => s + b.count, 0)} customers overdue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Buckets */}
      <Card className="rounded-xl border border-slate-200 shadow-sm">
        <CardHeader className="pb-2 px-3 pt-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-800">Aging Analysis</CardTitle>
              <CardDescription>
                {ageBy === "due"
                  ? "Outstanding amounts grouped by days past the due date (bill date when a bill has no due date)"
                  : "Outstanding amounts grouped by invoice age"}
              </CardDescription>
            </div>
            {industrialMode.enabled && (
              <div
                role="group"
                aria-label="Age by"
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold"
                data-testid="outstanding-age-by"
              >
                <span className="px-2 text-slate-500">Age by</span>
                {(["bill", "due"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={ageBy === mode}
                    onClick={() => setAgeByChoice(mode)}
                    className={cn(
                      "rounded-md px-2.5 py-1 transition-colors",
                      ageBy === mode ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    {mode === "bill" ? "Bill date" : "Due date"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {agingBuckets.map((bucket) => (
              <div
                key={bucket.label}
                className={cn(
                  "rounded-lg border p-4 transition-all",
                  bucket.bgClass
                )}
              >
                <div className={cn("flex items-center gap-2 mb-2", bucket.colorClass)}>
                  {bucket.icon}
                  <span className="text-sm font-medium">{bucket.label}</span>
                </div>
                <div className={cn("text-xl font-bold tabular-nums", bucket.colorClass)}>
                  ₹{Math.round(bucket.amount).toLocaleString("en-IN")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {bucket.count} customers · {bucket.range}
                </div>
                {totalOutstanding > 0 && (
                  <Progress
                    value={(bucket.amount / totalOutstanding) * 100}
                    className="mt-2 h-1.5"
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Defaulters */}
      {topDefaulters.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" /> Top 10 Defaulters
            </CardTitle>
            <CardDescription>Customers with highest outstanding balances</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topDefaulters.map((c, idx) => {
                const pct = totalOutstanding > 0 ? (c.totalOutstanding / totalOutstanding) * 100 : 0;
                return (
                  <div key={c.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-bold text-muted-foreground w-6 text-center">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{c.name}</span>
                        {getAgingBadge(c.oldestDays)}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <Progress value={pct} className="flex-1 h-1.5" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums">
                        ₹{Math.round(c.totalOutstanding).toLocaleString("en-IN")}
                      </div>
                      <div className="text-xs text-muted-foreground">{c.invoiceCount} inv.</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer outstanding list */}
      <AccountsHistoryPanel
        title="Customer-wise Outstanding"
        searchPlaceholder="Search customer…"
        searchValue={search}
        onSearchChange={setSearch}
        disableTableScroll={isMobile}
        actions={
          <AccountsExportButtons
            rows={filteredCustomers}
            fileBase="Outstanding_Report"
            sheetName="Outstanding"
            title="Customer-wise Outstanding"
            columns={[
              { header: "Customer Name", width: 1.6, value: (c) => c.name },
              { header: "Phone", width: 1, value: (c) => c.phone || "" },
              { header: "Total Outstanding", width: 1.1, align: "right", value: (c) => Math.round(c.totalOutstanding) },
              { header: "Invoice Count", width: 0.8, align: "right", value: (c) => c.invoiceCount },
              { header: ageBy === "due" ? "Most Days Overdue" : "Oldest Days", width: 0.8, align: "right", value: (c) => c.oldestDays },
              { header: ageLabels.export[0], width: 0.9, align: "right", value: (c) => Math.round(c.aging.current) },
              { header: ageLabels.export[1], width: 0.8, align: "right", value: (c) => Math.round(c.aging.d30) },
              { header: ageLabels.export[2], width: 0.8, align: "right", value: (c) => Math.round(c.aging.d60) },
              { header: ageLabels.export[3], width: 0.8, align: "right", value: (c) => Math.round(c.aging.d90) },
              { header: ageLabels.export[4], width: 0.8, align: "right", value: (c) => Math.round(c.aging.d90plus) },
            ]}
          />
        }
        footer={
          <span className="text-muted-foreground w-full">
            Showing {filteredCustomers.length} of {customers.length} customers
          </span>
        }
        filters={
          <>
            <Select value={minAmount} onValueChange={setMinAmount}>
              <SelectTrigger className={cn("h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white", isMobile ? "flex-1 min-w-[120px]" : "w-36")}>
                <SelectValue placeholder="Min amount" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All amounts</SelectItem>
                <SelectItem value="1000">≥ ₹1,000</SelectItem>
                <SelectItem value="5000">≥ ₹5,000</SelectItem>
                <SelectItem value="10000">≥ ₹10,000</SelectItem>
                <SelectItem value="50000">≥ ₹50,000</SelectItem>
              </SelectContent>
            </Select>
            <ResetPersistedFiltersButton
              visible={outstandingFiltersDirty}
              onReset={resetOutstandingFilters}
            />
          </>
        }
      >
          {isMobile && (
            <MobileStatStrip
              stats={[
                { label: "Total due", value: `₹${Math.round(totalOutstanding).toLocaleString("en-IN")}`, color: "text-rose-600", bg: "bg-rose-50" },
                { label: "Customers", value: String(totalCustomers), color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Invoices", value: String(totalInvoices), color: "text-violet-600", bg: "bg-violet-50" },
              ]}
            />
          )}
          {isMobile ? (
            <div className="space-y-2.5 mt-3">
              {filteredCustomers.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  {search ? "No customers match your search" : "No outstanding balances found"}
                </div>
              ) : (
                filteredCustomers.map((c) => (
                  <MobileListCard
                    key={c.id}
                    title={c.name}
                    subtitle={c.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0" /> {c.phone}
                      </span>
                    ) : undefined}
                    badge={getAgingBadge(c.oldestDays)}
                    amount={
                      <div className="text-sm font-bold tabular-nums text-destructive">
                        ₹{Math.round(c.totalOutstanding).toLocaleString("en-IN")}
                      </div>
                    }
                    meta={
                      <>
                        <span>{c.invoiceCount} unpaid invoice{c.invoiceCount !== 1 ? "s" : ""}</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                          {c.aging.current > 0 && <span className="text-success">{ageLabels.short[0]}: ₹{Math.round(c.aging.current).toLocaleString("en-IN")}</span>}
                          {c.aging.d30 > 0 && <span className="text-info">{ageLabels.short[1]}: ₹{Math.round(c.aging.d30).toLocaleString("en-IN")}</span>}
                          {c.aging.d60 > 0 && <span className="text-warning">{ageLabels.short[2]}: ₹{Math.round(c.aging.d60).toLocaleString("en-IN")}</span>}
                          {(c.aging.d90 > 0 || c.aging.d90plus > 0) && (
                            <span className="text-destructive">
                              {ageBy === "due" ? "61d+ late" : "61d+"}: ₹{Math.round(c.aging.d90 + c.aging.d90plus).toLocaleString("en-IN")}
                            </span>
                          )}
                        </div>
                      </>
                    }
                  />
                ))
              )}
            </div>
          ) : (
              <Table className={accountsHistoryTableClass}>
                <TableHeader className="!static">
                  <TableRow>
                    <TableHead className={cn(accountsHistoryThClass, "cursor-pointer select-none")} onClick={() => handleSort("name")}>
                      <div className="flex items-center">Customer <SortIcon field="name" /></div>
                    </TableHead>
                    <TableHead className={accountsHistoryThClass}>Phone</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "cursor-pointer select-none text-right")} onClick={() => handleSort("totalOutstanding")}>
                      <div className="flex items-center justify-end">Outstanding <SortIcon field="totalOutstanding" /></div>
                    </TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "cursor-pointer select-none text-right")} onClick={() => handleSort("invoiceCount")}>
                      <div className="flex items-center justify-end">Invoices <SortIcon field="invoiceCount" /></div>
                    </TableHead>
                    {ageLabels.short.map((label) => (
                      <TableHead key={label} className={cn(accountsHistoryThClass, "text-right")}>{label}</TableHead>
                    ))}
                    <TableHead className={cn(accountsHistoryThClass, "cursor-pointer select-none text-right")} onClick={() => handleSort("oldestDays")}>
                      <div className="flex items-center justify-end">{ageBy === "due" ? "Most late" : "Oldest"} <SortIcon field="oldestDays" /></div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        {search ? "No customers match your search" : "No outstanding balances found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCustomers.map((c) => (
                      <TableRow key={c.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium max-w-[200px] truncate">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {c.phone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {c.phone}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          ₹{Math.round(c.totalOutstanding).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.invoiceCount}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">
                          {c.aging.current > 0 ? `₹${Math.round(c.aging.current).toLocaleString("en-IN")}` : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-info">
                          {c.aging.d30 > 0 ? `₹${Math.round(c.aging.d30).toLocaleString("en-IN")}` : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-warning">
                          {c.aging.d60 > 0 ? `₹${Math.round(c.aging.d60).toLocaleString("en-IN")}` : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-destructive/80">
                          {c.aging.d90 > 0 ? `₹${Math.round(c.aging.d90).toLocaleString("en-IN")}` : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-destructive font-semibold">
                          {c.aging.d90plus > 0 ? `₹${Math.round(c.aging.d90plus).toLocaleString("en-IN")}` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {getAgingBadge(c.oldestDays)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
          )}
      </AccountsHistoryPanel>
    </div>
  );
}
