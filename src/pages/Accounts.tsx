import { useMemo, useState, useCallback, useEffect } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { ArrowDownLeft, ArrowUpRight, BookOpen, AlertCircle, Receipt, FileText as FileTextIcon2 } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
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
import { fetchAllCustomers, fetchAllSalesSummary, fetchAllSuppliers } from "@/utils/fetchAllRows";
import {
  deleteJournalEntryByReference,
  recordPurchaseJournalEntry,
  recordSaleJournalEntry,
} from "@/utils/accounting/journalService";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
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
const STICKY_TAB_CONTENT_CLASS = "mt-0 space-y-4 outline-none data-[state=inactive]:hidden";

const PERF_PATH = "accounts";

export default function Accounts() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { summary: receivablesSummary } = useOrganizationReceivablesSummary(currentOrganization?.id);
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
  const [migrationExpanded, setMigrationExpanded] = useState(false);
  const [periodLockExpanded, setPeriodLockExpanded] = useState(false);

  const handleAccountsTabChange = useCallback(
    (tab: string) => {
      setSelectedTab(tab);
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

  // Fetch sales only when customer-payment or reconciliation tab is active
  const needsSales = selectedTab === "customer-payment" || selectedTab === "customer-ledger" || selectedTab === "outstanding";
  const { data: sales } = useQuery({
    queryKey: ["sales-summary-accounts", currentOrganization?.id],
    queryFn: async () => fetchAllSalesSummary(currentOrganization!.id),
    enabled: !!currentOrganization?.id && needsSales,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch customers only when tabs that need them are active
  const needsCustomers = selectedTab === "customer-payment" || selectedTab === "reconciliation" || selectedTab === "customer-ledger" || selectedTab === "outstanding";
  const { data: customers } = useQuery({
    queryKey: ["customers", currentOrganization?.id],
    queryFn: async () => fetchAllCustomers(currentOrganization!.id),
    enabled: !!currentOrganization?.id && needsCustomers,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch suppliers only when supplier tab is active
  const needsSuppliers = selectedTab === "supplier-payment" || selectedTab === "supplier-ledger";
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => fetchAllSuppliers(currentOrganization!.id),
    enabled: !!currentOrganization?.id && needsSuppliers,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch vouchers only when tabs that need them are active
  const needsVouchers = selectedTab === "customer-payment" || selectedTab === "supplier-payment" || selectedTab === "employee-salary" || selectedTab === "expenses" || selectedTab === "voucher-entry";
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
    // Receivables tile = Master Reconciliation RPC (canonical). RPC dashboard
    // metrics are the lightweight fallback only — no lifetime client-side scan.
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

    const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

    return (
      <div className="flex flex-col min-h-screen bg-muted/30 pb-24">
        <MobilePageHeader title="Accounts" backTo="/payments-dashboard" />

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-200">
            <p className="text-[10px] font-medium text-muted-foreground">Receivable</p>
            <p className="text-sm font-bold text-emerald-700 tabular-nums">{fmt(dashboardMetrics.totalReceivables)}</p>
          </div>
          <div className="rounded-xl p-3 bg-rose-50 border border-rose-200">
            <p className="text-[10px] font-medium text-muted-foreground">Payable</p>
            <p className="text-sm font-bold text-rose-700 tabular-nums">{fmt(dashboardMetrics.totalPayables)}</p>
          </div>
          <div className="rounded-xl p-3 bg-amber-50 border border-amber-200">
            <p className="text-[10px] font-medium text-muted-foreground">Monthly Expenses</p>
            <p className="text-sm font-bold text-amber-700 tabular-nums">{fmt(dashboardMetrics.monthlyExpenses)}</p>
          </div>
          <div className="rounded-xl p-3 bg-blue-50 border border-blue-200">
            <p className="text-[10px] font-medium text-muted-foreground">Net P/L</p>
            <p className={cn("text-sm font-bold tabular-nums", dashboardMetrics.currentMonthPL >= 0 ? "text-emerald-700" : "text-rose-700")}>
              {fmt(dashboardMetrics.currentMonthPL)}
            </p>
          </div>
        </div>

        {/* Tab chips */}
        <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar pb-2">
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

        {/* Tab content — all panes stay mounted (hidden) like Sales Dashboard window tabs */}
        <div data-tab-scroll className="flex-1 overflow-y-auto tab-scroll-stable px-4 py-3">
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
                <SupplierLedger organizationId={currentOrganization.id} />
              </div>
              <div className={cn(selectedTab !== "outstanding" && "hidden")} aria-hidden={selectedTab !== "outstanding"}>
                <OutstandingDashboardTab organizationId={currentOrganization.id} />
              </div>
              <div className={cn(selectedTab !== "customer-payment" && "hidden")} aria-hidden={selectedTab !== "customer-payment"}>
                <CustomerPaymentTab organizationId={currentOrganization.id} vouchers={vouchers} sales={sales} customers={customers} settings={settings} onShowReceipt={paymentDialogs.handleShowReceipt} onShowAdvanceDialog={() => setShowAdvanceDialog(true)} onEditPayment={paymentDialogs.openEditPaymentDialog} />
              </div>
              <div className={cn(selectedTab !== "supplier-payment" && "hidden")} aria-hidden={selectedTab !== "supplier-payment"}>
                <SupplierPaymentTab organizationId={currentOrganization.id} vouchers={vouchers} suppliers={suppliers} onEditPayment={paymentDialogs.openEditPaymentDialog} />
              </div>
              <div className={cn(selectedTab !== "employee-salary" && "hidden")} aria-hidden={selectedTab !== "employee-salary"}>
                <EmployeeSalaryTab organizationId={currentOrganization.id} vouchers={vouchers} />
              </div>
              <div className={cn(selectedTab !== "expenses" && "hidden")} aria-hidden={selectedTab !== "expenses"}>
                <ExpensesTab organizationId={currentOrganization.id} vouchers={vouchers} />
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
                  <ReconciliationTab organizationId={currentOrganization.id} customers={customers} />
                </TabsContent>
                <TabsContent value="bank-gl" forceMount className="mt-0 outline-none data-[state=inactive]:hidden">
                  <BankReconciliationTab organizationId={currentOrganization.id} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        <MobileBottomNav />

        <AccountsPaymentDialogs dialogs={paymentDialogs} compactEdit />
        {currentOrganization?.id && <AddAdvanceBookingDialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog} organizationId={currentOrganization.id} />}
        {currentOrganization?.id && <CustomerBalanceAdjustmentDialog open={showBalanceAdjustmentDialog} onOpenChange={setShowBalanceAdjustmentDialog} organizationId={currentOrganization.id} />}
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-slate-50 px-2 sm:px-3 md:px-4 lg:px-5 py-4 pb-24 lg:pb-4 overflow-hidden">
      <BackToDashboard label="Back to Payments" to="/payments-dashboard" />

      <div className="flex items-center justify-between shrink-0 mb-1">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight leading-tight">
            Accounts Management
          </h1>
          <p className="text-slate-400 text-base mt-0.5">Payments · Expenses · Vouchers · Financial Reports</p>
        </div>
      </div>

      <div className="shrink-0 my-2 min-h-[5.5rem]">
        <AccountsDashboardCards
          dashboardMetrics={dashboardMetrics}
          paymentStats={paymentStats}
          paymentCardFilter={paymentCardFilter}
          onCardClick={handleCardClick}
          failedJournalCount={failedJournalCount}
          onFailedJournalClick={() => setShowFailedJournalsDialog(true)}
        />
      </div>

      {isAdmin && currentOrganization?.id && (
        <Card className="border border-dashed border-slate-300 bg-white rounded-xl shadow-sm shrink-0">
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
        <Card className="border border-dashed border-slate-300 bg-white rounded-xl shadow-sm shrink-0 mb-2">
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

      <Tabs value={selectedTab} onValueChange={handleAccountsTabChange} className="flex flex-col flex-1 min-h-0 gap-0">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm shrink-0 overflow-hidden">
          <TabsList className="w-full h-auto p-0 bg-slate-50/80 border-b border-slate-100 rounded-none flex flex-nowrap justify-start overflow-x-auto gap-0">
          <TabsTrigger value="customer-ledger" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Customer Ledger</TabsTrigger>
          <TabsTrigger value="supplier-ledger" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Supplier Ledger</TabsTrigger>
          <TabsTrigger value="outstanding" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Outstanding</TabsTrigger>
          <TabsTrigger value="customer-payment" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Customer Payment</TabsTrigger>
          <TabsTrigger value="supplier-payment" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Supplier Payment</TabsTrigger>
          <TabsTrigger value="employee-salary" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Employee Salary</TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Expenses</TabsTrigger>
          <TabsTrigger value="voucher-entry" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Voucher Entry</TabsTrigger>
          <TabsTrigger value="reconciliation" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Reconciliation</TabsTrigger>
          {isAdmin && <TabsTrigger value="balance-adjustment" className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs sm:text-sm font-medium shrink-0 data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-none">Balance Adj.</TabsTrigger>}
          </TabsList>
        </div>

        <div
          data-tab-scroll
          className="flex-1 min-h-0 overflow-y-auto tab-scroll-stable rounded-xl border border-slate-200 border-t-0 bg-white shadow-sm -mt-px pt-3 px-2 sm:px-3 pb-3"
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
          {currentOrganization?.id && <SupplierLedger organizationId={currentOrganization.id} />}
        </TabsContent>

        <TabsContent value="outstanding" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && <OutstandingDashboardTab organizationId={currentOrganization.id} />}
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
            />
          )}
        </TabsContent>

        <TabsContent value="supplier-payment" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && (
            <SupplierPaymentTab organizationId={currentOrganization.id} vouchers={vouchers} suppliers={suppliers} onEditPayment={paymentDialogs.openEditPaymentDialog} />
          )}
        </TabsContent>

        <TabsContent value="employee-salary" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && <EmployeeSalaryTab organizationId={currentOrganization.id} vouchers={vouchers} />}
        </TabsContent>

        <TabsContent value="expenses" forceMount className={STICKY_TAB_CONTENT_CLASS}>
          {currentOrganization?.id && <ExpensesTab organizationId={currentOrganization.id} vouchers={vouchers} />}
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
                <ReconciliationTab organizationId={currentOrganization.id} customers={customers} />
              </TabsContent>
              <TabsContent value="bank-gl" forceMount className="mt-0 outline-none data-[state=inactive]:hidden">
                <BankReconciliationTab organizationId={currentOrganization.id} />
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
            <RecentBalanceAdjustments organizationId={currentOrganization?.id || ""} />
          </TabsContent>
        )}
        </div>
      </Tabs>

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
