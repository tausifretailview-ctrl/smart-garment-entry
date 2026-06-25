import { useMemo, useState, useCallback, useEffect } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  AlertCircle,
  Receipt,
  FileText as FileTextIcon2,
  Scale,
  HelpCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Coins, Loader2, BookMarked, Trash2, ChevronDown, Lock } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { useNavPerfPage, useNavPerfQueryWatch } from "@/hooks/useNavigationPerf";
import { setCloudUsageRoutePath } from "@/lib/cloudUsageDiagnostics";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { CustomerLedger } from "@/components/CustomerLedger";
import { SupplierLedger } from "@/components/SupplierLedger";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAccountsPaymentDialogs } from "@/hooks/useAccountsPaymentDialogs";
import { AccountsPaymentDialogs } from "@/components/accounts/AccountsPaymentDialogs";
import { AddAdvanceBookingDialog } from "@/components/AddAdvanceBookingDialog";
import { CustomerBalanceAdjustmentDialog } from "@/components/CustomerBalanceAdjustmentDialog";
import { RecentBalanceAdjustments } from "@/components/RecentBalanceAdjustments";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { coerceToMap } from "@/lib/coerceToMap";
import { loadSupplierBalanceMapForOrg } from "@/utils/supplierBalanceUtils";
import { fetchAllSuppliers } from "@/utils/fetchAllRows";
import { useOrgLedgerReferenceData } from "@/hooks/useOrgLedgerReferenceData";
import {
  deleteJournalEntryByReference,
  recordPurchaseJournalEntry,
  recordSaleJournalEntry,
} from "@/utils/accounting/journalService";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useWindowTabs } from "@/contexts/WindowTabsContext";
import { useOrganizationReceivablesSummary } from "@/hooks/useOrganizationReceivablesSummary";
import { AllOrgBackfillStatus } from "@/components/accounts/AllOrgBackfillStatus";
import { PendingGlBackfillStatus } from "@/components/accounts/PendingGlBackfillStatus";
import {
  fetchPendingGlBackfillCounts,
  formatAllOrganizationsBackfillResult,
  formatHistoricalBackfillSummary,
  resetOrganizationGlLedger,
  runHistoricalAccountingBackfill,
  runHistoricalAccountingBackfillAllOrganizations,
  type AllOrganizationsBackfillResult,
  type AllOrgsBackfillProgress,
} from "@/utils/accounting/historicalMigration";

// Extracted tab components
import { AccountsDashboardCards } from "@/components/accounts/AccountsDashboardCards";
import { CustomerPaymentTab } from "@/components/accounts/CustomerPaymentTab";
import { SupplierPaymentTab } from "@/components/accounts/SupplierPaymentTab";
import { EmployeeSalaryTab } from "@/components/accounts/EmployeeSalaryTab";
import { ExpensesTab } from "@/components/accounts/ExpensesTab";
import { VoucherEntryTab } from "@/components/accounts/VoucherEntryTab";
import { ReconciliationTab } from "@/components/accounts/ReconciliationTab";
import { BankReconciliationTab } from "@/components/accounts/BankReconciliationTab";
import { OutstandingDashboardTab } from "@/components/accounts/OutstandingDashboardTab";
import { AccountingPeriodLockCard } from "@/components/accounts/AccountingPeriodLockCard";

/** Keep sub-tab DOM mounted (hidden) so ledger/payment state survives tab switches. */
const STICKY_TAB_CONTENT_CLASS = "mt-0 space-y-2 outline-none data-[state=inactive]:hidden";

const ACCOUNTS_TAB_TRIGGER_CLASS =
  "h-8 px-2.5 text-xs sm:text-sm font-medium shrink-0 rounded-md data-[state=active]:bg-teal-700 data-[state=active]:text-white data-[state=inactive]:text-slate-600";

const PERF_PATH = "accounts";

const fmtOutstandingInr = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Sum positive supplier balances — matches Supplier Ledger "totalOutstanding". */
function sumOrgSupplierPayableFromSnapshots(
  map: Map<string, { balance: number }>,
): number {
  let sum = 0;
  for (const snap of coerceToMap<string, { balance: number }>(map).values()) {
    if (snap.balance > 0) sum += snap.balance;
  }
  return Math.round(sum * 100) / 100;
}

function AccountsOutstandingHeadlineCards({
  totalReceivable,
  grossReceivable,
  customerCreditPool,
  customerCount,
  totalPayable,
  openSupplierBills,
  receivableLoading,
  payableLoading,
  onReceivableClick,
  onPayableClick,
}: {
  totalReceivable: number;
  grossReceivable: number;
  customerCreditPool: number;
  customerCount: number;
  totalPayable: number;
  openSupplierBills: number;
  receivableLoading: boolean;
  payableLoading: boolean;
  onReceivableClick: () => void;
  onPayableClick: () => void;
}) {
  const netPosition = totalReceivable - totalPayable;
  const netAbs = Math.abs(netPosition);
  const netLabel =
    netPosition > 0
      ? `Net Receivable (you are owed ${fmtOutstandingInr(netAbs)})`
      : netPosition < 0
        ? `Net Payable (you owe ${fmtOutstandingInr(netAbs)})`
        : "Net Position (balanced)";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <Card
        className="cursor-pointer border-emerald-200 bg-emerald-50/80 hover:shadow-md transition-shadow"
        onClick={onReceivableClick}
      >
        <CardHeader className="pb-1 pt-3 px-3">
          <div className="flex items-center justify-between gap-2">
            <CardDescription className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
              {totalReceivable >= 0 ? "Net Receivable" : "Net Customer Credit"}
            </CardDescription>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-emerald-700/70 hover:text-emerald-800"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Receivable help"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                Gross AR (Dr) minus customer credit pool (Cr).<br />
                Positive = customers owe you. Negative = you owe customers (overpaid / advance).
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className={cn(
            "text-xl font-bold tabular-nums",
            totalReceivable >= 0 ? "text-emerald-700" : "text-amber-700",
          )}>
            {receivableLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              fmtOutstandingInr(totalReceivable)
            )}
          </div>
          <div className="text-[11px] text-emerald-900/70 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
            <span>Dr {fmtOutstandingInr(grossReceivable)}</span>
            <span>Cr {fmtOutstandingInr(customerCreditPool)}</span>
            <span className="text-emerald-700/70">· {customerCount} active</span>
          </div>
        </CardContent>
      </Card>

      <Card
        className="cursor-pointer border-rose-200 bg-rose-50/80 hover:shadow-md transition-shadow"
        onClick={onPayableClick}
      >
        <CardHeader className="pb-1 pt-3 px-3">
          <CardDescription className="text-xs font-semibold text-rose-800 uppercase tracking-wide">
            Net Payable
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div className="text-xl font-bold text-rose-700 tabular-nums">
            {payableLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              fmtOutstandingInr(totalPayable)
            )}
          </div>
          <p className="text-[11px] text-rose-900/70 mt-1 tabular-nums">
            Open bills {fmtOutstandingInr(openSupplierBills)} · less payments &amp; credit notes
          </p>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "border shadow-sm",
          netPosition > 0
            ? "border-emerald-200 bg-white"
            : netPosition < 0
              ? "border-rose-200 bg-white"
              : "border-slate-200 bg-white",
        )}
      >
        <CardHeader className="pb-1 pt-3 px-3">
          <div className="flex items-center justify-between gap-2">
            <CardDescription className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Net Position
            </CardDescription>
            <Scale className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0">
          <div
            className={cn(
              "text-xl font-bold tabular-nums",
              netPosition > 0
                ? "text-emerald-700"
                : netPosition < 0
                  ? "text-rose-700"
                  : "text-slate-700",
            )}
          >
            {receivableLoading || payableLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              fmtOutstandingInr(netPosition)
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{netLabel}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Accounts() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { getPreviousWindow, switchToPreviousWindow } = useWindowTabs();
  const previousWindow = useMemo(
    () => getPreviousWindow?.("accounts") ?? null,
    [getPreviousWindow],
  );
  const handleAccountsBack = useCallback(() => {
    if (switchToPreviousWindow?.("accounts")) {
      return;
    }
    orgNavigate("/");
  }, [switchToPreviousWindow, orgNavigate]);
  const {
    summary: receivablesSummary,
    isLoading: receivablesSummaryLoading,
    isFetching: receivablesSummaryFetching,
  } = useOrganizationReceivablesSummary(currentOrganization?.id);
  const queryClient = useQueryClient();
  const { isAdmin, isPlatformAdmin } = useUserRoles();
  useNavPerfPage(PERF_PATH);
  useEffect(() => {
    setCloudUsageRoutePath(PERF_PATH);
    return () => setCloudUsageRoutePath("");
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const urlCustomerId = searchParams.get("customer");
  const [selectedTab, setSelectedTab] = useState(urlTab || "customer-ledger");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(
    () => new Set([urlTab || "customer-ledger"]),
  );
  const [migrationExpanded, setMigrationExpanded] = useState(false);
  const [periodLockExpanded, setPeriodLockExpanded] = useState(false);
  const [managementSectionExpanded, setManagementSectionExpanded] = useState(false);

  const handleAccountsTabChange = useCallback(
    (tab: string) => {
      setSelectedTab(tab);
      setVisitedTabs((prev) => new Set([...prev, tab]));
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", tab);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const tab = urlTab || "customer-ledger";
    if (tab !== selectedTab) setSelectedTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set([...prev, tab])));
  }, [urlTab, selectedTab]);

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.accounts,
    currentOrganization?.id,
    useMemo(
      () => ({ selectedTab: urlTab ? undefined : selectedTab }),
      [selectedTab, urlTab],
    ),
    (saved) => {
      if (!urlTab) {
        restoreDashboardFilters(saved, {
          strings: [["selectedTab", setSelectedTab]],
        });
      }
    },
  );

  // Card filter state
  const [paymentCardFilter, setPaymentCardFilter] = useState<string | null>(null);

  // Advance booking & balance adjustment dialog state
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [showBalanceAdjustmentDialog, setShowBalanceAdjustmentDialog] = useState(false);
  const [showFailedJournalsDialog, setShowFailedJournalsDialog] = useState(false);
  const [failedJournalSourceFilter, setFailedJournalSourceFilter] = useState<"all" | "sale" | "purchase">("all");
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillAllOrgsRunning, setBackfillAllOrgsRunning] = useState(false);
  const [backfillAllProgress, setBackfillAllProgress] = useState<AllOrgsBackfillProgress | null>(null);
  const [backfillAllLastResult, setBackfillAllLastResult] = useState<AllOrganizationsBackfillResult | null>(null);
  const [backfillAllError, setBackfillAllError] = useState<string | null>(null);
  const [resetLedgerDialogOpen, setResetLedgerDialogOpen] = useState(false);
  const [resetLedgerRunning, setResetLedgerRunning] = useState(false);
  const ledgerMigrationBusy = backfillRunning || backfillAllOrgsRunning || resetLedgerRunning;

  const { data: settings } = useSettings();
  const paymentDialogs = useAccountsPaymentDialogs(settings);

  // Old voucher fetch removed — now lazy-loaded per tab below

  // Fetch dashboard stats via single RPC (replaces 4+ separate queries)
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const {
    data: dashboardStats,
    isLoading: dashboardStatsLoading,
    isFetching: dashboardStatsFetching,
  } = useQuery({
    queryKey: ["accounts-dashboard-metrics", currentOrganization?.id, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_accounts_dashboard_metrics", {
        p_org_id: currentOrganization!.id,
        p_month_start: monthStart,
        p_month_end: monthEnd,
      });
      if (error) throw error;
      return data as any;
    },
    enabled: !!currentOrganization?.id,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  useNavPerfQueryWatch("accounts-dashboard-metrics", PERF_PATH, {
    isLoading: dashboardStatsLoading,
    isFetching: dashboardStatsFetching,
  });

  const {
    data: pendingGlCounts,
    isLoading: pendingGlCountsLoading,
    refetch: refetchPendingGlCounts,
  } = useQuery({
    queryKey: ["pending-gl-backfill-counts", currentOrganization?.id],
    enabled: !!currentOrganization?.id && (isAdmin || isPlatformAdmin),
    queryFn: () => fetchPendingGlBackfillCounts(currentOrganization!.id, supabase),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: failedJournalCount = 0 } = useQuery({
    queryKey: ["failed-journal-count", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
    queryFn: async () => {
      const [{ count: failedSales, error: salesErr }, { count: failedPurchases, error: purchaseErr }] =
        await Promise.all([
          supabase
            .from("sales")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", currentOrganization!.id)
            .eq("journal_status", "failed")
            .is("deleted_at", null),
          supabase
            .from("purchase_bills")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", currentOrganization!.id)
            .eq("journal_status", "failed")
            .is("deleted_at", null),
        ]);

      if (salesErr) throw salesErr;
      if (purchaseErr) throw purchaseErr;

      return Number(failedSales || 0) + Number(failedPurchases || 0);
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: failedJournalRows = [], isLoading: failedRowsLoading } = useQuery({
    queryKey: ["failed-journal-rows", currentOrganization?.id, showFailedJournalsDialog],
    enabled: !!currentOrganization?.id && showFailedJournalsDialog,
    queryFn: async () => {
      const [{ data: failedSales, error: salesErr }, { data: failedPurchases, error: purchaseErr }] = await Promise.all([
        supabase
          .from("sales")
          .select("id, created_at, sale_date, net_amount, paid_amount, payment_method, journal_error")
          .eq("organization_id", currentOrganization!.id)
          .eq("journal_status", "failed")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("purchase_bills")
          .select("id, created_at, bill_date, software_bill_no, net_amount, paid_amount, journal_error")
          .eq("organization_id", currentOrganization!.id)
          .eq("journal_status", "failed")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (salesErr) throw salesErr;
      if (purchaseErr) throw purchaseErr;

      const salesRows = (failedSales || []).map((s: any) => ({
        source: "sale" as const,
        id: s.id as string,
        created_at: s.created_at as string,
        label: `Sale ${String(s.id).slice(0, 8).toUpperCase()}`,
        net_amount: Number(s.net_amount || 0),
        paid_amount: Number(s.paid_amount || 0),
        payment_method: String(s.payment_method || "pay_later"),
        journal_error: s.journal_error as string | null,
        entry_date: s.sale_date != null ? String(s.sale_date).slice(0, 10) : undefined,
      }));

      const purchaseRows = (failedPurchases || []).map((p: any) => ({
        source: "purchase" as const,
        id: p.id as string,
        created_at: p.created_at as string,
        label: p.software_bill_no ? `Purchase ${p.software_bill_no}` : `Purchase ${String(p.id).slice(0, 8).toUpperCase()}`,
        net_amount: Number(p.net_amount || 0),
        paid_amount: Number(p.paid_amount || 0),
        payment_method: "pay_later",
        journal_error: p.journal_error as string | null,
        entry_date: p.bill_date != null ? String(p.bill_date).slice(0, 10) : undefined,
      }));

      return [...salesRows, ...purchaseRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });

  const retryJournal = useMutation({
    mutationFn: async (row: {
      source: "sale" | "purchase";
      id: string;
      net_amount: number;
      paid_amount: number;
      payment_method: string;
      entry_date?: string;
    }) => {
      if (!currentOrganization?.id) throw new Error("Organization is required");

      if (row.source === "sale") {
        await deleteJournalEntryByReference(currentOrganization.id, "Sale", row.id, supabase);
        await recordSaleJournalEntry(
          row.id,
          currentOrganization.id,
          Number(row.net_amount || 0),
          Number(row.paid_amount || 0),
          String(row.payment_method || "pay_later"),
          supabase,
          row.entry_date
        );
        await supabase
          .from("sales")
          .update({ journal_status: "posted", journal_error: null })
          .eq("id", row.id);
      } else {
        await deleteJournalEntryByReference(currentOrganization.id, "Purchase", row.id, supabase);
        await recordPurchaseJournalEntry(
          row.id,
          currentOrganization.id,
          Number(row.net_amount || 0),
          Number(row.paid_amount || 0),
          String(row.payment_method || "pay_later"),
          supabase,
          row.entry_date
        );
        await supabase
          .from("purchase_bills")
          .update({ journal_status: "posted", journal_error: null })
          .eq("id", row.id);
      }
    },
    onSuccess: () => {
      toast.success("Journal retry posted successfully");
      queryClient.invalidateQueries({ queryKey: ["failed-journal-count", currentOrganization?.id] });
      queryClient.invalidateQueries({ queryKey: ["failed-journal-rows", currentOrganization?.id] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers", currentOrganization?.id] });
    },
    onError: async (error: any, variables) => {
      const errorMessage = error?.message || "Retry failed";
      if (variables.source === "sale") {
        await supabase
          .from("sales")
          .update({ journal_status: "failed", journal_error: errorMessage })
          .eq("id", variables.id);
      } else {
        await supabase
          .from("purchase_bills")
          .update({ journal_status: "failed", journal_error: errorMessage })
          .eq("id", variables.id);
      }
      toast.error(errorMessage);
      queryClient.invalidateQueries({ queryKey: ["failed-journal-count", currentOrganization?.id] });
      queryClient.invalidateQueries({ queryKey: ["failed-journal-rows", currentOrganization?.id] });
    },
  });

  const retryAllFailedJournals = useMutation({
    mutationFn: async (rows: Array<{
      source: "sale" | "purchase";
      id: string;
      net_amount: number;
      paid_amount: number;
      payment_method: string;
      entry_date?: string;
    }>) => {
      if (!rows.length) return { success: 0, failed: 0 };
      let success = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          if (row.source === "sale") {
            await deleteJournalEntryByReference(currentOrganization!.id, "Sale", row.id, supabase);
            await recordSaleJournalEntry(
              row.id,
              currentOrganization!.id,
              Number(row.net_amount || 0),
              Number(row.paid_amount || 0),
              String(row.payment_method || "pay_later"),
              supabase,
              row.entry_date
            );
            await supabase
              .from("sales")
              .update({ journal_status: "posted", journal_error: null })
              .eq("id", row.id);
          } else {
            await deleteJournalEntryByReference(currentOrganization!.id, "Purchase", row.id, supabase);
            await recordPurchaseJournalEntry(
              row.id,
              currentOrganization!.id,
              Number(row.net_amount || 0),
              Number(row.paid_amount || 0),
              String(row.payment_method || "pay_later"),
              supabase,
              row.entry_date
            );
            await supabase
              .from("purchase_bills")
              .update({ journal_status: "posted", journal_error: null })
              .eq("id", row.id);
          }
          success += 1;
        } catch (error: any) {
          const errorMessage = error?.message || "Retry failed";
          if (row.source === "sale") {
            await supabase
              .from("sales")
              .update({ journal_status: "failed", journal_error: errorMessage })
              .eq("id", row.id);
          } else {
            await supabase
              .from("purchase_bills")
              .update({ journal_status: "failed", journal_error: errorMessage })
              .eq("id", row.id);
          }
          failed += 1;
        }
      }
      return { success, failed };
    },
    onSuccess: ({ success, failed }) => {
      if (success > 0 && failed === 0) {
        toast.success(`Retry complete: ${success} posted`);
      } else if (success > 0 && failed > 0) {
        toast.warning(`Retry complete: ${success} posted, ${failed} failed`);
      } else {
        toast.error("Retry complete: no transactions posted");
      }
      queryClient.invalidateQueries({ queryKey: ["failed-journal-count", currentOrganization?.id] });
      queryClient.invalidateQueries({ queryKey: ["failed-journal-rows", currentOrganization?.id] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers", currentOrganization?.id] });
    },
  });

  const filteredFailedJournalRows = useMemo(() => {
    if (failedJournalSourceFilter === "all") return failedJournalRows;
    return failedJournalRows.filter((row) => row.source === failedJournalSourceFilter);
  }, [failedJournalRows, failedJournalSourceFilter]);

  const invalidateLedgerQueries = (organizationId: string) => {
    queryClient.invalidateQueries({ queryKey: ["failed-journal-count", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["failed-journal-rows", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["pending-gl-backfill-counts", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["journal-vouchers", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["voucher-entries", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["accounting-reports"] });
    queryClient.invalidateQueries({ queryKey: ["customer-financial-snapshot"] });
  };

  const handleHistoricalBackfill = async () => {
    if (!currentOrganization?.id || ledgerMigrationBusy) return;
    setBackfillRunning(true);
    try {
      const summary = await runHistoricalAccountingBackfill(currentOrganization.id, supabase);
      toast.success(`Historical ledger backfill finished. ${formatHistoricalBackfillSummary(summary)}`, {
        duration: 8000,
      });
      if (!summary.accountingEngineEnabled) {
        toast.info(
          "Accounting engine is off for this org — operational reports still work; enable the engine in Settings to post GL journals.",
          { duration: 10000 },
        );
      }
      invalidateLedgerQueries(currentOrganization.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Backfill failed";
      toast.error(message);
      console.error(e);
    } finally {
      setBackfillRunning(false);
    }
  };

  const handleHistoricalBackfillAllOrganizations = async () => {
    if (!isPlatformAdmin || ledgerMigrationBusy) return;
    setBackfillAllOrgsRunning(true);
    setBackfillAllProgress(null);
    setBackfillAllLastResult(null);
    setBackfillAllError(null);
    try {
      const result = await runHistoricalAccountingBackfillAllOrganizations(supabase, {
        onProgress: (p) => setBackfillAllProgress(p),
      });
      setBackfillAllLastResult(result);
      const summaryText = formatAllOrganizationsBackfillResult(result);
      toast.success(`All-organization backfill finished. ${summaryText}`, { duration: 15000 });
      if (currentOrganization?.id) {
        invalidateLedgerQueries(currentOrganization.id);
      }
      queryClient.invalidateQueries({ queryKey: ["accounting-reports"] });
      void refetchPendingGlCounts();
      console.info("[historical backfill all orgs]", result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "All-org backfill failed";
      setBackfillAllError(message);
      toast.error(message, { duration: 15000 });
      console.error(e);
    } finally {
      setBackfillAllOrgsRunning(false);
      setBackfillAllProgress(null);
    }
  };

  const handleConfirmResetGlLedger = async () => {
    if (!currentOrganization?.id || ledgerMigrationBusy) return;
    setResetLedgerRunning(true);
    try {
      const res = await resetOrganizationGlLedger(currentOrganization.id, supabase);
      toast.success(
        `GL cleared: ${Number(res.journal_lines_deleted ?? 0)} lines, ${Number(res.journal_entries_deleted ?? 0)} entries removed. Sales and purchases set to pending for re-post.`
      );
      setResetLedgerDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["failed-journal-count", currentOrganization.id] });
      queryClient.invalidateQueries({ queryKey: ["failed-journal-rows", currentOrganization.id] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers", currentOrganization.id] });
      queryClient.invalidateQueries({ queryKey: ["voucher-entries", currentOrganization.id] });
      queryClient.invalidateQueries({ queryKey: ["accounting-reports"] });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Reset failed";
      toast.error(message);
      console.error(e);
    } finally {
      setResetLedgerRunning(false);
    }
  };

  const needsSales =
    visitedTabs.has("customer-payment") ||
    visitedTabs.has("customer-ledger") ||
    visitedTabs.has("outstanding");
  const needsCustomers =
    visitedTabs.has("customer-payment") ||
    visitedTabs.has("reconciliation") ||
    visitedTabs.has("customer-ledger") ||
    visitedTabs.has("outstanding");

  const needsSupplierBalanceMap =
    visitedTabs.has("supplier-ledger") || visitedTabs.has("supplier-payment");

  const { data: supplierBalanceMapData } = useQuery({
    queryKey: ["supplier-balance-map", currentOrganization?.id],
    queryFn: () => loadSupplierBalanceMapForOrg(supabase, currentOrganization!.id),
    enabled: !!currentOrganization?.id && needsSupplierBalanceMap,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const {
    data: totalSupplierPayable = 0,
    isLoading: supplierPayableLoading,
    isFetching: supplierPayableFetching,
  } = useQuery({
    queryKey: ["supplier-payables-org-total", currentOrganization?.id],
    queryFn: async () => {
      const { balanceMap } = await loadSupplierBalanceMapForOrg(supabase, currentOrganization!.id);
      return sumOrgSupplierPayableFromSnapshots(balanceMap);
    },
    enabled: !!currentOrganization?.id && visitedTabs.has("outstanding"),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { customers, salesSummary: sales } = useOrgLedgerReferenceData(currentOrganization?.id, {
    enabled: !!currentOrganization?.id,
    loadCustomers: needsCustomers,
    loadSalesSummary: needsSales,
  });

  // Fetch suppliers only when supplier tab is active
  const needsSuppliers =
    visitedTabs.has("supplier-payment") || visitedTabs.has("supplier-ledger");
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => fetchAllSuppliers(currentOrganization!.id),
    enabled: !!currentOrganization?.id && needsSuppliers,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch vouchers only when tabs that need them are active
  const needsVouchers =
    visitedTabs.has("customer-payment") ||
    visitedTabs.has("supplier-payment") ||
    visitedTabs.has("employee-salary") ||
    visitedTabs.has("expenses") ||
    visitedTabs.has("voucher-entry");
  const { data: vouchers } = useQuery({
    queryKey: ["voucher-entries", currentOrganization?.id],
    queryFn: async () => {
      const allVouchers: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("voucher_entries")
          .select("id, voucher_number, voucher_date, voucher_type, total_amount, description, reference_type, reference_id, payment_method, discount_amount, discount_reason, created_at")
          .eq("organization_id", currentOrganization?.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allVouchers.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else { hasMore = false; }
      }
      return allVouchers;
    },
    enabled: !!currentOrganization?.id && needsVouchers,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Dashboard metrics from unified RPC
  const invoiceStats = dashboardStats?.invoiceStats || {};
  const monthlySales = dashboardStats?.monthlySales || 0;
  const monthlyPurchases = dashboardStats?.monthlyPurchases || 0;
  const monthlyExpenses = dashboardStats?.monthlyExpenses || 0;

  const dashboardMetrics = useMemo(() => ({
    // Receivables tile = Master Reconciliation summary (canonical, set-based RPC).
    // It can legitimately be negative for orgs in net customer credit, so do NOT
    // fall back to the old invoice-arithmetic when it is zero.
    totalReceivables:
      receivablesSummary.customerCount > 0
        ? receivablesSummary.netReceivable
        : (dashboardStats?.totalReceivables ?? 0),
    totalPayables: dashboardStats?.totalPayables || 0,
    monthlyExpenses,
    currentMonthPL: monthlySales - monthlyPurchases - monthlyExpenses,
  }), [receivablesSummary, dashboardStats, monthlyExpenses, monthlySales, monthlyPurchases]);

  // Header payment summary cards — from get_accounts_dashboard_metrics RPC (single server round-trip).
  const paymentStats = useMemo(() => ({
    totalInvoices: invoiceStats.total || 0,
    totalAmount: invoiceStats.totalAmount || 0,
    paidAmount: invoiceStats.paidAmount || 0,
    pendingCount: invoiceStats.pending || 0,
    pendingAmount: invoiceStats.pendingAmount || 0,
    partialCount: invoiceStats.partial || 0,
    partialAmount: invoiceStats.partialAmount || 0,
    completedCount: invoiceStats.paid || 0,
    completedAmount: invoiceStats.paidAmount || 0,
  }), [invoiceStats]);

  const handleCardClick = (filter: string | null) => {
    setPaymentCardFilter(filter);
    handleAccountsTabChange("customer-ledger");
  };

  const scrollToOutstandingCustomers = useCallback(() => {
    document.getElementById("accounts-outstanding-detail")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const outstandingHeadlineCards = currentOrganization?.id ? (
    <AccountsOutstandingHeadlineCards
      totalReceivable={receivablesSummary.netReceivable}
      grossReceivable={receivablesSummary.grossReceivableDr}
      customerCreditPool={receivablesSummary.customerCreditPoolCr}
      customerCount={receivablesSummary.customerCount}
      totalPayable={totalSupplierPayable}
      openSupplierBills={totalSupplierPayable}
      receivableLoading={receivablesSummaryLoading || receivablesSummaryFetching}
      payableLoading={supplierPayableLoading || supplierPayableFetching}
      onReceivableClick={scrollToOutstandingCustomers}
      onPayableClick={() => handleAccountsTabChange("supplier-ledger")}
    />
  ) : null;

  const accountsManagementFooter = (
    <div className="mt-8 pt-4 border-t border-dashed border-slate-300">
      <button
        type="button"
        onClick={() => setManagementSectionExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left rounded-lg px-2 py-2 hover:bg-slate-50/80 transition-colors"
        aria-expanded={managementSectionExpanded}
      >
        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-blue-600 shrink-0" />
          Summary &amp; admin settings
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0",
            managementSectionExpanded && "rotate-180",
          )}
        />
      </button>
      {managementSectionExpanded && (
        <div className="mt-3 space-y-3">
          <AccountsDashboardCards
            dashboardMetrics={dashboardMetrics}
            paymentStats={paymentStats}
            paymentCardFilter={paymentCardFilter}
            onCardClick={handleCardClick}
            failedJournalCount={failedJournalCount}
            onFailedJournalClick={() => setShowFailedJournalsDialog(true)}
          />
          {isAdmin && currentOrganization?.id && (
            <Card className="border border-dashed border-slate-300 bg-white rounded-xl shadow-sm">
              <CardHeader className="pb-2 pt-3 px-4">
                <button
                  type="button"
                  onClick={() => setMigrationExpanded((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                  aria-expanded={migrationExpanded}
                >
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                    <BookMarked className="h-4 w-4 text-blue-600" />
                    Accounting migration
                    {backfillAllLastResult && backfillAllLastResult.organizationsFailed === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">
                        Backfill success
                      </span>
                    )}
                  </CardTitle>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${migrationExpanded ? "rotate-180" : ""}`}
                  />
                </button>
                {migrationExpanded && (
                  <CardDescription className="text-xs space-y-1.5 mt-2">
                    <p>
                      <strong className="text-foreground">Operational tally</strong> (Customer Ledger, Payments, Trial Balance / P&amp;L tabs)
                      uses live invoices and the customer snapshot SQL — apply pending Supabase migrations; no GL backfill required.
                    </p>
                    <p>
                      <strong className="text-foreground">GL tally</strong> (GL Trial / GL P&amp;L): run backfill once per org to post pending
                      sales, purchases, returns, and vouchers (expenses, salaries, receipts, supplier payments). Safe to re-run.
                    </p>
                  </CardDescription>
                )}
                {migrationExpanded && (
                  <PendingGlBackfillStatus
                    counts={pendingGlCounts}
                    loading={pendingGlCountsLoading}
                    onFailedClick={() => setShowFailedJournalsDialog(true)}
                  />
                )}
                {migrationExpanded && isPlatformAdmin && (
                  <AllOrgBackfillStatus
                    running={backfillAllOrgsRunning}
                    progress={backfillAllProgress}
                    result={backfillAllLastResult}
                    error={backfillAllError}
                    currentOrgPendingTotal={pendingGlCounts?.totalPending}
                    onDismiss={() => {
                      setBackfillAllLastResult(null);
                      setBackfillAllError(null);
                    }}
                  />
                )}
              </CardHeader>
              {migrationExpanded && (
                <CardContent className="flex flex-wrap gap-2 px-4 pb-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={ledgerMigrationBusy || pendingGlCountsLoading}
                    onClick={() => void refetchPendingGlCounts()}
                  >
                    Refresh counts
                  </Button>
                  {isPlatformAdmin && (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={ledgerMigrationBusy}
                        onClick={handleHistoricalBackfill}
                      >
                        {backfillRunning ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Running backfill…
                          </>
                        ) : (
                          "Run Historical Ledger Backfill"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        className="bg-blue-700 hover:bg-blue-800"
                        disabled={ledgerMigrationBusy}
                        onClick={() => void handleHistoricalBackfillAllOrganizations()}
                      >
                        {backfillAllOrgsRunning ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Backfilling all orgs…
                          </>
                        ) : (
                          "Backfill all organizations"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive border-destructive/40 hover:bg-destructive/10"
                        disabled={ledgerMigrationBusy}
                        onClick={() => setResetLedgerDialogOpen(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Reset GL ledger
                      </Button>
                    </>
                  )}
                  {!isPlatformAdmin && (
                    <p className="text-xs text-muted-foreground w-full">
                      GL backfill and reset are managed by platform admin only.
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          )}
          {isAdmin && currentOrganization?.id && (
            <Card className="border border-dashed border-slate-300 bg-white rounded-xl shadow-sm">
              <CardHeader className="pb-2 pt-3 px-4">
                <button
                  type="button"
                  onClick={() => setPeriodLockExpanded((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                  aria-expanded={periodLockExpanded}
                >
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                    <Lock className="h-4 w-4 text-blue-600" />
                    Accounting period lock
                  </CardTitle>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${periodLockExpanded ? "rotate-180" : ""}`}
                  />
                </button>
              </CardHeader>
              {periodLockExpanded && (
                <CardContent className="px-4 pb-3">
                  <AccountingPeriodLockCard />
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );

  const isMobile = useIsMobile();

  if (isMobile) {
    const tabs = [
      { id: "customer-ledger", label: "Cust. Ledger", icon: BookOpen },
      { id: "supplier-ledger", label: "Supp. Ledger", icon: BookOpen },
      { id: "outstanding", label: "Outstanding", icon: AlertCircle },
      { id: "customer-payment", label: "Receive ₹", icon: ArrowDownLeft },
      { id: "supplier-payment", label: "Pay ₹", icon: ArrowUpRight },
      { id: "expenses", label: "Expenses", icon: Receipt },
      { id: "employee-salary", label: "Salaries", icon: Receipt },
      { id: "voucher-entry", label: "Vouchers", icon: FileTextIcon2 },
      { id: "reconciliation", label: "Reconcile", icon: Receipt },
    ];

    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden bg-muted/30">
        <MobilePageHeader
          title="Accounts"
          onBackClick={handleAccountsBack}
          subtitle={previousWindow ? `Back to ${previousWindow.label}` : undefined}
        />

        {/* Tab chips — work first */}
        <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar py-2 shrink-0 border-b border-slate-200/80 bg-white">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => handleAccountsTabChange(t.id)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all touch-manipulation",
                selectedTab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Single scroll region for tab content + demoted summary */}
        <div
          data-tab-scroll
          className="flex-1 min-h-0 overflow-y-auto tab-scroll-stable px-4 py-3 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.75rem)]"
        >
          {currentOrganization?.id && (
            <>
              <div className={cn(selectedTab !== "customer-ledger" && "hidden")} aria-hidden={selectedTab !== "customer-ledger"}>
                <CustomerLedger
                  organizationId={currentOrganization.id}
                  paymentFilter={paymentCardFilter}
                  preSelectedCustomerId={urlCustomerId}
                  persistenceWindowId={WINDOW_FILTER_IDS.accountsCustomerLedger}
                />
              </div>
              <div className={cn(selectedTab !== "supplier-ledger" && "hidden")} aria-hidden={selectedTab !== "supplier-ledger"}>
                <SupplierLedger
                  organizationId={currentOrganization.id}
                  visitedTabs={visitedTabs}
                  supplierBalanceMap={supplierBalanceMapData}
                />
              </div>
              <div className={cn(selectedTab !== "outstanding" && "hidden")} aria-hidden={selectedTab !== "outstanding"}>
                {outstandingHeadlineCards}
                <div id="accounts-outstanding-detail">
                  <OutstandingDashboardTab organizationId={currentOrganization.id} visitedTabs={visitedTabs} />
                </div>
              </div>
              <div className={cn(selectedTab !== "customer-payment" && "hidden")} aria-hidden={selectedTab !== "customer-payment"}>
                <CustomerPaymentTab organizationId={currentOrganization.id} vouchers={vouchers} sales={sales} customers={customers} settings={settings} onShowReceipt={paymentDialogs.handleShowReceipt} onShowAdvanceDialog={() => setShowAdvanceDialog(true)} onEditPayment={paymentDialogs.openEditPaymentDialog} visitedTabs={visitedTabs} />
              </div>
              <div className={cn(selectedTab !== "supplier-payment" && "hidden")} aria-hidden={selectedTab !== "supplier-payment"}>
                <SupplierPaymentTab organizationId={currentOrganization.id} vouchers={vouchers} suppliers={suppliers} onEditPayment={paymentDialogs.openEditPaymentDialog} visitedTabs={visitedTabs} supplierBalanceMap={supplierBalanceMapData} />
              </div>
              <div className={cn(selectedTab !== "employee-salary" && "hidden")} aria-hidden={selectedTab !== "employee-salary"}>
                <EmployeeSalaryTab organizationId={currentOrganization.id} vouchers={vouchers} visitedTabs={visitedTabs} />
              </div>
              <div className={cn(selectedTab !== "expenses" && "hidden")} aria-hidden={selectedTab !== "expenses"}>
                <ExpensesTab organizationId={currentOrganization.id} vouchers={vouchers} visitedTabs={visitedTabs} />
              </div>
            </>
          )}
          <div className={cn(selectedTab !== "voucher-entry" && "hidden")} aria-hidden={selectedTab !== "voucher-entry"}>
            <VoucherEntryTab vouchers={vouchers} />
          </div>
          {currentOrganization?.id && (
            <div className={cn(selectedTab !== "reconciliation" && "hidden")} aria-hidden={selectedTab !== "reconciliation"}>
              <Tabs defaultValue="payments" className="w-full space-y-4">
                <TabsList className="grid w-full max-w-lg grid-cols-2 h-9 bg-muted/60 p-1 rounded-lg">
                  <TabsTrigger value="payments" className="rounded-md text-xs font-medium">
                    Payment receipts
                  </TabsTrigger>
                  <TabsTrigger value="bank-gl" className="rounded-md text-xs font-medium">
                    Bank GL
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="payments" forceMount className="mt-0 space-y-0 outline-none data-[state=inactive]:hidden">
                  <ReconciliationTab organizationId={currentOrganization.id} customers={customers} visitedTabs={visitedTabs} />
                </TabsContent>
                <TabsContent value="bank-gl" forceMount className="mt-0 outline-none data-[state=inactive]:hidden">
                  <BankReconciliationTab organizationId={currentOrganization.id} visitedTabs={visitedTabs} />
                </TabsContent>
              </Tabs>
            </div>
          )}
          {accountsManagementFooter}
        </div>

        <MobileBottomNav />

        <AccountsPaymentDialogs dialogs={paymentDialogs} compactEdit />
        {currentOrganization?.id && <AddAdvanceBookingDialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog} organizationId={currentOrganization.id} />}
        {currentOrganization?.id && <CustomerBalanceAdjustmentDialog open={showBalanceAdjustmentDialog} onOpenChange={setShowBalanceAdjustmentDialog} organizationId={currentOrganization.id} />}
      </div>
    );
  }

  return (
    <div className="accounts-management-workspace accounts-management-dashboard flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">

      <AlertDialog open={resetLedgerDialogOpen} onOpenChange={setResetLedgerDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset GL ledger for this organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all journal lines and journal entries for the current organization, then marks sales and
              purchase bills as pending so you can run the historical backfill again. Expense vouchers lose their posted journals
              until you backfill. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetLedgerRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={resetLedgerRunning}
              onClick={(ev) => {
                ev.preventDefault();
                void handleConfirmResetGlLedger();
              }}
            >
              {resetLedgerRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />
                  Resetting…
                </>
              ) : (
                "Reset ledger"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-sm shrink-0"
            onClick={handleAccountsBack}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {previousWindow?.label ?? "Dashboard"}
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
              <BookOpen className="h-5 w-5 shrink-0" />
              Accounts Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              Payments · Ledgers · Vouchers · Reconciliation
            </p>
          </div>
        </div>

        <Tabs value={selectedTab} onValueChange={handleAccountsTabChange} className="flex flex-col flex-1 min-h-0 gap-2">
          <TabsList className="shrink-0 h-auto w-full flex flex-nowrap justify-start overflow-x-auto gap-0.5 bg-slate-100/80 p-1 rounded-lg border border-slate-200">
          <TabsTrigger value="customer-ledger" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Customer Ledger</TabsTrigger>
          <TabsTrigger value="supplier-ledger" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Supplier Ledger</TabsTrigger>
          <TabsTrigger value="outstanding" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Outstanding</TabsTrigger>
          <TabsTrigger value="customer-payment" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Customer Payment</TabsTrigger>
          <TabsTrigger value="supplier-payment" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Supplier Payment</TabsTrigger>
          <TabsTrigger value="employee-salary" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Employee Salary</TabsTrigger>
          <TabsTrigger value="expenses" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Expenses</TabsTrigger>
          <TabsTrigger value="voucher-entry" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Voucher Entry</TabsTrigger>
          <TabsTrigger value="reconciliation" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Reconciliation</TabsTrigger>
          {isAdmin && <TabsTrigger value="balance-adjustment" className={ACCOUNTS_TAB_TRIGGER_CLASS}>Balance Adj.</TabsTrigger>}
          </TabsList>

          <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
            <div
              data-tab-scroll
              className="flex-1 min-h-0 overflow-y-auto tab-scroll-stable px-2 sm:px-3 py-2"
            >
        <TabsContent value="customer-ledger" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && (
            <CustomerLedger
              organizationId={currentOrganization.id}
              paymentFilter={paymentCardFilter}
              preSelectedCustomerId={urlCustomerId}
              persistenceWindowId={WINDOW_FILTER_IDS.accountsCustomerLedger}
            />
          )}
        </TabsContent>

        <TabsContent value="supplier-ledger" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && (
            <SupplierLedger
              organizationId={currentOrganization.id}
              visitedTabs={visitedTabs}
              supplierBalanceMap={supplierBalanceMapData}
            />
          )}
        </TabsContent>

        <TabsContent value="outstanding" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {outstandingHeadlineCards}
          {currentOrganization?.id && (
            <div id="accounts-outstanding-detail">
              <OutstandingDashboardTab organizationId={currentOrganization.id} visitedTabs={visitedTabs} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="customer-payment" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && (
            <CustomerPaymentTab
              organizationId={currentOrganization.id}
              vouchers={vouchers}
              sales={sales}
              customers={customers}
              settings={settings}
              onShowReceipt={paymentDialogs.handleShowReceipt}
              onShowAdvanceDialog={() => setShowAdvanceDialog(true)}
              onEditPayment={paymentDialogs.openEditPaymentDialog}
              visitedTabs={visitedTabs}
            />
          )}
        </TabsContent>

        <TabsContent value="supplier-payment" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && (
            <SupplierPaymentTab organizationId={currentOrganization.id} vouchers={vouchers} suppliers={suppliers} onEditPayment={paymentDialogs.openEditPaymentDialog} visitedTabs={visitedTabs} supplierBalanceMap={supplierBalanceMapData} />
          )}
        </TabsContent>

        <TabsContent value="employee-salary" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && <EmployeeSalaryTab organizationId={currentOrganization.id} vouchers={vouchers} visitedTabs={visitedTabs} />}
        </TabsContent>

        <TabsContent value="expenses" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && <ExpensesTab organizationId={currentOrganization.id} vouchers={vouchers} visitedTabs={visitedTabs} />}
        </TabsContent>

        <TabsContent value="voucher-entry" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          <VoucherEntryTab vouchers={vouchers} />
        </TabsContent>

        <TabsContent value="reconciliation" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && (
            <Tabs defaultValue="payments" className="w-full space-y-4">
              <TabsList className="grid w-full max-w-lg grid-cols-2 h-9 bg-muted/60 p-1 rounded-lg">
                <TabsTrigger value="payments" className="rounded-md text-xs font-medium">
                  Payment receipts
                </TabsTrigger>
                <TabsTrigger value="bank-gl" className="rounded-md text-xs font-medium">
                  Bank GL
                </TabsTrigger>
              </TabsList>
              <TabsContent value="payments" forceMount className="mt-0 space-y-0 outline-none data-[state=inactive]:hidden">
                <ReconciliationTab organizationId={currentOrganization.id} customers={customers} visitedTabs={visitedTabs} />
              </TabsContent>
              <TabsContent value="bank-gl" forceMount className="mt-0 outline-none data-[state=inactive]:hidden">
                <BankReconciliationTab organizationId={currentOrganization.id} visitedTabs={visitedTabs} />
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="balance-adjustment" forceMount className={STICKY_TAB_CONTENT_CLASS}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5" /> Customer Balance Adjustment</CardTitle>
                <CardDescription>Adjust customer outstanding or advance balances with full audit trail</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setShowBalanceAdjustmentDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" /> New Balance Adjustment
                </Button>
              </CardContent>
            </Card>
            <RecentBalanceAdjustments organizationId={currentOrganization?.id || ""} visitedTabs={visitedTabs} />
          </TabsContent>
        )}
        {accountsManagementFooter}
            </div>
          </Card>
        </Tabs>
      </div>

      <AccountsPaymentDialogs dialogs={paymentDialogs} />

      {currentOrganization?.id && (
        <AddAdvanceBookingDialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog} organizationId={currentOrganization.id} />
      )}
      {currentOrganization?.id && (
        <CustomerBalanceAdjustmentDialog open={showBalanceAdjustmentDialog} onOpenChange={setShowBalanceAdjustmentDialog} organizationId={currentOrganization.id} />
      )}

      <Dialog open={showFailedJournalsDialog} onOpenChange={setShowFailedJournalsDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Failed Ledger Postings</DialogTitle>
            <DialogDescription>Retry failed auto-journal transactions</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={failedJournalSourceFilter === "all" ? "default" : "outline"}
                  onClick={() => setFailedJournalSourceFilter("all")}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={failedJournalSourceFilter === "sale" ? "default" : "outline"}
                  onClick={() => setFailedJournalSourceFilter("sale")}
                >
                  Sale
                </Button>
                <Button
                  size="sm"
                  variant={failedJournalSourceFilter === "purchase" ? "default" : "outline"}
                  onClick={() => setFailedJournalSourceFilter("purchase")}
                >
                  Purchase
                </Button>
              </div>
              <Button
                size="sm"
                disabled={retryAllFailedJournals.isPending || filteredFailedJournalRows.length === 0}
                onClick={() =>
                  retryAllFailedJournals.mutate(
                    filteredFailedJournalRows.map((row) => ({
                      source: row.source,
                      id: row.id,
                      net_amount: row.net_amount,
                      paid_amount: row.paid_amount,
                      payment_method: row.payment_method,
                    }))
                  )
                }
              >
                {retryAllFailedJournals.isPending ? "Retrying..." : `Retry All (${filteredFailedJournalRows.length})`}
              </Button>
            </div>
            {failedRowsLoading ? (
              <p className="text-sm text-muted-foreground">Loading failed transactions...</p>
            ) : filteredFailedJournalRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failed transactions found.</p>
            ) : (
              filteredFailedJournalRows.map((row) => (
                <Card key={`${row.source}-${row.id}`} className="border">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold">{row.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.source === "sale" ? "Sale" : "Purchase"} • {format(new Date(row.created_at), "dd MMM yyyy, hh:mm a")}
                        </div>
                        <div className="text-xs">
                          Net: ₹{Math.round(row.net_amount || 0).toLocaleString("en-IN")} | Paid: ₹{Math.round(row.paid_amount || 0).toLocaleString("en-IN")}
                        </div>
                        {row.journal_error && (
                          <div className="text-xs text-red-600 dark:text-red-300">{row.journal_error}</div>
                        )}
                        <Button
                          size="sm"
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => {
                            const day = format(new Date(row.created_at), "yyyy-MM-dd");
                            orgNavigate(`/journal-vouchers?from=${day}&to=${day}`);
                            setShowFailedJournalsDialog(false);
                          }}
                        >
                          Open Journal Vouchers
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        disabled={retryJournal.isPending || retryAllFailedJournals.isPending}
                        onClick={() =>
                          retryJournal.mutate({
                            source: row.source,
                            id: row.id,
                            net_amount: row.net_amount,
                            paid_amount: row.paid_amount,
                            payment_method: row.payment_method,
                          })
                        }
                      >
                        Retry
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
