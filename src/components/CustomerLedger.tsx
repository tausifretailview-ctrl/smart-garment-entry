import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useVisibilityInvalidate } from "@/hooks/useVisibilityRefetch";
import { getMoneyViewVisibilityQueryKeys } from "@/utils/moneyViewFreshnessInvalidation";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient, useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { STALE_DASHBOARD_TAB_RETURN, STALE_FREQUENT, STALE_REFERENCE } from "@/lib/queryStaleTimes";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { useOrgLedgerReferenceFetcher } from "@/hooks/useOrgLedgerReferenceData";
import {
  buildCustomerLedgerListFromPartyBalances,
  enrichLedgerListRowsWithCanonicalBalance,
  customersForLedgerExport,
} from "@/utils/customerLedgerListFromPartyBalances";
import { PARTY_BALANCE_CANONICAL_ENRICH_MAX } from "@/utils/customerPartyBalanceSnapshot";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Download, Phone, Mail, MapPin, IndianRupee, Calendar, FileText, CalendarIcon, CreditCard, Banknote, Wallet, FileDown, Send, MessageCircle, Users, AlertCircle, AlertTriangle, TrendingUp, BookOpen, Undo2, Loader2, Trash2, Scale } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type jsPDFType from "jspdf";
/** Lazily loaded on export — keeps jsPDF/html2canvas off this page's initial chunk. */
let jsPdfPromise: Promise<typeof jsPDFType> | null = null;
const loadJsPdf = (): Promise<typeof jsPDFType> =>
  (jsPdfPromise ??= import("jspdf").then((m) => m.default));

import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { isPosExchangeRefundPaymentVoucher } from "@/utils/saleSettlement";
import {
  fetchCustomerLedgerTransactions,
  type CustomerLedgerTransaction,
} from "@/utils/customerLedgerTransactions";
import { accountsHistoryTableClass, accountsHistoryTableWrapClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import type * as XLSXType from "xlsx";
/** Lazily loaded on export — keeps the xlsx bundle off this page's initial chunk. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { CustomerAccountSummaryStrip } from "@/components/CustomerAccountSummaryStrip";
import {
  fetchCustomerAccountStateView,
  formatCustomerAccountArithmeticLine,
} from "@/utils/customerAccountStateView";
import {
  summarizeSignedBalanceFacets,
} from "@/utils/organizationReceivables";
import { useOrganizationReceivablesSummary } from "@/hooks/useOrganizationReceivablesSummary";
import {
  accountFacetStatus,
  facetsFromInvoiceOutstanding,
  formatNetFacetLabel,
  summarizeAccountFacets,
} from "@/utils/customerAccountFacets";
import {
  clearRepeatedOrgSalesPaid,
  listHasRepeatedSalesPaid,
  stripPartyWindowTotals,
} from "@/utils/ledgerListDisplay";
import { useBusinessInfo } from "@/hooks/useSettings";
import { Skeleton } from "@/components/ui/skeleton";
import {
  computeAuditPeriodOutstanding,
  fetchCustomerAuditBundle,
  residualPaymentAtSaleTender,
  residualTenderBreakdown,
} from "@/utils/customerAuditBundle";
import {
  computeInvoiceOutstandingFromReconciliation,
  computeRefundableCreditBalance,
  saleReturnCreditForReconciliation,
} from "@/utils/customerLedgerReconciliation";
import {
  filterLedgerRowsByCardDrill,
  ledgerCardDrillLabel,
  tabForLedgerCardDrill,
  type LedgerCardDrillKey,
} from "@/utils/customerLedgerCardDrill";
import {
  isCnRefundPaymentVoucher,
  parseSaleReturnRefFromCnRefundDescription,
} from "@/utils/cnRefundVoucher";
import {
  deleteAdvanceRefund,
  fetchAdvanceRefundsForAdvances,
} from "@/utils/advanceRefundService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { computePendingAllSessionsBatch, computeYearWiseFeeBalances, computePriorYearsCarryForward } from "@/lib/schoolFeeYearBalances";
import { resolveImportedOpeningBalance } from "@/lib/schoolFeeOpening";
import {
  LEDGER_PDF,
  ledgerPdfReconLineColor,
  ledgerPdfTypeColor,
  ledgerPdfTypeLabel,
  pdfSetDraw,
  pdfSetFill,
  pdfSetText,
} from "@/utils/customerLedgerPdfStyles";

interface CustomerLedgerProps {
  organizationId: string;
  paymentFilter?: string | null;
  preSelectedCustomerId?: string | null;
  /** When embedMode — show ledger immediately without loading the full customer list. */
  preSelectedCustomerName?: string | null;
  preSelectedCustomerPhone?: string | null;
  /** When set, persists filters + selected customer for tab/window restore. */
  persistenceWindowId?: string;
  /** Embedded in Customer Balances — hide customer picker; back returns to balances list. */
  embedMode?: boolean;
  embeddedBackLabel?: string;
  onEmbeddedBack?: () => void;
  /** Do not write customer id into URL search params (embedded views). */
  skipUrlSync?: boolean;
  /** Center ledger in A4-width document panel (embedded balances view). */
  embeddedA4Layout?: boolean;
}

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number;
  totalSales: number;
  totalPaid: number;
  balance: number;
  unusedAdvanceTotal?: number;
  totalCashPaid?: number;
  totalAdvanceApplied?: number;
  totalCnApplied?: number;
  adjustmentTotal?: number;
  // School-specific fields
  studentId?: string;
  admissionNumber?: string;
  className?: string;
  division?: string;
  /** When fees are shown per student, this is the linked `customers.id` (if any). */
  customerRecordId?: string | null;
}

function buildEmbeddedCustomerStub(
  id: string,
  name: string,
  phone?: string | null,
  extra?: Partial<Customer>,
): Customer {
  return {
    id,
    customer_name: name,
    phone: phone ?? null,
    email: null,
    address: null,
    opening_balance: 0,
    totalSales: 0,
    totalPaid: 0,
    balance: 0,
    ...extra,
  };
}

type Transaction = CustomerLedgerTransaction;

const cleanDescription = (desc: string) => {
  return (desc || "")
    .replace(/\(info only\)/gi, "")
    .replace(/info only/gi, "")
    .trim();
};

function computeAdjustmentPosting(adj: any): { debit: number; credit: number } {
  const amount = Number(adj?.change_amount || 0);
  if (adj?.adjustment_type === "credit") {
    // "credit" in audit means due increased -> debit in student ledger.
    return { debit: amount, credit: 0 };
  }
  if (adj?.adjustment_type === "debit") {
    // "debit" in audit means due reduced -> credit in student ledger.
    return { debit: 0, credit: amount };
  }
  if (adj?.adjustment_type === "set") {
    const oldBal = Number(adj?.old_balance ?? 0);
    const newBal = Number(adj?.new_balance ?? oldBal);
    const delta = Math.round((newBal - oldBal) * 100) / 100;
    if (delta > 0) return { debit: delta, credit: 0 };
    if (delta < 0) return { debit: 0, credit: Math.abs(delta) };
  }
  return { debit: 0, credit: 0 };
}

const getBadgeStyle = (type: string, status?: string) => {
  switch (type) {
    case 'advance':
      return 'bg-blue-100 text-blue-700 border border-blue-200';
    case 'sale_return':
      return status === 'pending'
        ? 'bg-orange-100 text-orange-700 border border-orange-200'
        : 'bg-green-100 text-green-700 border border-green-200';
    case 'invoice':
      return 'bg-purple-100 text-purple-700 border border-purple-200';
    case 'payment':
      return 'bg-green-100 text-green-700 border border-green-200';
    case 'adv_refund':
      return 'bg-red-100 text-red-700 border border-red-200';
    case 'cn_refund':
      return 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-300';
    case 'advance_applied':
      return 'bg-gray-100 text-gray-600 border border-gray-200';
    case 'cn_adjusted':
      // Same muted treatment as the "Adv Adj" memo tag — both are informational
      // offset rows, not real invoices, and should read that way at a glance.
      return 'bg-gray-100 text-gray-600 border border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border border-gray-200';
  }
};

const ledgerTableTotalsRowClass =
  "bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600";

/** Footer row: label spans left columns, amount in next column, optional trailing empty cols. */
function LedgerTableTotalsFooter({
  labelColSpan,
  label = "Total",
  amount,
  amountClassName = "text-foreground",
  trailingColSpan = 0,
}: {
  labelColSpan: number;
  label?: string;
  amount: number;
  amountClassName?: string;
  trailingColSpan?: number;
}) {
  return (
    <TableRow className={ledgerTableTotalsRowClass}>
      <TableCell
        colSpan={labelColSpan}
        className="text-right text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
      >
        {label}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums font-bold", amountClassName)}>
        ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </TableCell>
      {trailingColSpan > 0 ? <TableCell colSpan={trailingColSpan} /> : null}
    </TableRow>
  );
}

export function CustomerLedger({
  organizationId,
  paymentFilter,
  preSelectedCustomerId,
  preSelectedCustomerName,
  preSelectedCustomerPhone,
  persistenceWindowId,
  embedMode = false,
  embeddedBackLabel,
  onEmbeddedBack,
  skipUrlSync = false,
  embeddedA4Layout = false,
}: CustomerLedgerProps) {
  const moneyViewVisibilityKeys = useMemo(
    () => getMoneyViewVisibilityQueryKeys(organizationId),
    [organizationId],
  );
  useVisibilityInvalidate(moneyViewVisibilityKeys);

  const embeddedSingleCustomer = embedMode && Boolean(preSelectedCustomerId);
  const [, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => {
    if (embeddedSingleCustomer && preSelectedCustomerId && preSelectedCustomerName?.trim()) {
      return buildEmbeddedCustomerStub(
        preSelectedCustomerId,
        preSelectedCustomerName.trim(),
        preSelectedCustomerPhone,
      );
    }
    return null;
  });
  const pendingRestoredCustomerIdRef = useRef<string | null>(null);

  const selectCustomer = useCallback(
    (customer: Customer | null) => {
      setSelectedCustomer(customer);
      if (skipUrlSync) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (customer) {
            next.set("customer", customer.id);
            if (!next.get("tab")) next.set("tab", "customer-ledger");
          } else {
            next.delete("customer");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, skipUrlSync],
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>(paymentFilter || "all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("transactions");
  /** KPI card drill — filters the Transactions list (or switches tab when one exists). */
  const [cardDrill, setCardDrill] = useState<LedgerCardDrillKey | null>(null);
  const [customerPage, setCustomerPage] = useState(0);
  const CUSTOMERS_PER_PAGE = 20;

  const customerLedgerFilterSnapshot = useMemo(
    () => ({
      searchQuery,
      selectedCustomerId:
        preSelectedCustomerId ? undefined : (selectedCustomer?.studentId || selectedCustomer?.id),
      paymentStatusFilter,
      startDate,
      endDate,
      selectedAcademicYearId,
      activeTab,
      customerPage,
    }),
    [
      searchQuery,
      selectedCustomer,
      preSelectedCustomerId,
      paymentStatusFilter,
      startDate,
      endDate,
      selectedAcademicYearId,
      activeTab,
      customerPage,
    ],
  );

  useDashboardFilterPersistence(
    persistenceWindowId ?? "",
    organizationId,
    customerLedgerFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", setSearchQuery],
          ["paymentStatusFilter", setPaymentStatusFilter],
          ["selectedAcademicYearId", setSelectedAcademicYearId],
          ["activeTab", setActiveTab],
        ],
        optionalDates: [
          ["startDate", setStartDate],
          ["endDate", setEndDate],
        ],
        numbers: [["customerPage", setCustomerPage]],
      });
      if (!preSelectedCustomerId) {
        const id = typeof saved.selectedCustomerId === "string" ? saved.selectedCustomerId : null;
        if (id) pendingRestoredCustomerIdRef.current = id;
      }
    },
    { enabled: !!persistenceWindowId },
  );
  
  const { fetchCustomers: fetchLedgerCustomers } = useOrgLedgerReferenceFetcher();

  const isMobile = useIsMobile();
  const { sendWhatsApp } = useWhatsAppSend();
  const { isSchool } = useSchoolFeatures();
  const businessInfo = useBusinessInfo();
  const {
    summary: orgReceivablesSummary,
    isLoading: orgReceivablesSummaryLoading,
  } = useOrganizationReceivablesSummary(organizationId, {
    enabled: !!organizationId && !isSchool && !embeddedSingleCustomer,
  });
  const kpiCardsLoading = !isSchool && orgReceivablesSummaryLoading;
  const openCustomerAccount = useOpenCustomerAccount();
  const [showOverpaymentRefundDialog, setShowOverpaymentRefundDialog] = useState(false);
  const [overpaymentRefundAmount, setOverpaymentRefundAmount] = useState('');
  const [overpaymentRefundMode, setOverpaymentRefundMode] = useState('cash');
  const [overpaymentRefundNote, setOverpaymentRefundNote] = useState('');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const queryClient = useQueryClient();
  const {
    balance: authoritativeBalance,
    unusedAdvanceTotal: snapshotAdvanceAvailable,
    cnAvailableTotal: snapshotCnAvailable,
  } = useCustomerBalance(
    isSchool ? null : selectedCustomer?.id || null,
    organizationId || null,
  );

  const snapshotOutstandingDr = authoritativeBalance;

  /** Same closing balance as Customer Audit Report for the selected date window (business org only). */
  const { data: ledgerAuditClosingBalance } = useQuery({
    queryKey: [
      "customer-ledger-audit-closing",
      organizationId,
      selectedCustomer?.id,
      startDate ? format(startDate, "yyyy-MM-dd") : "all",
      endDate ? format(endDate, "yyyy-MM-dd") : "all",
    ],
    queryFn: async () => {
      if (!organizationId || !selectedCustomer?.id) return null;
      const bundle = await fetchCustomerAuditBundle(supabase, organizationId, selectedCustomer.id);
      const fromYmd = startDate ? format(startDate, "yyyy-MM-dd") : "1900-01-01";
      const toYmd = endDate ? format(endDate, "yyyy-MM-dd") : "9999-12-31";
      return computeAuditPeriodOutstanding(bundle, fromYmd, toYmd);
    },
    enabled: Boolean(organizationId && selectedCustomer?.id && !isSchool),
    staleTime: 30_000,
  });

  const { data: academicYearsData } = useQuery({
    queryKey: ["customer-ledger-academic-years", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, year_name, start_date, end_date, is_current")
        .eq("organization_id", organizationId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!isSchool,
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
  });
  const academicYears = academicYearsData ?? [];

  useEffect(() => {
    if (!isSchool || !academicYears.length) return;
    if (selectedAcademicYearId === "all") return;
    const picked = academicYears.find((y: any) => y.id === selectedAcademicYearId);
    if (!picked) return;
    const start = picked.start_date ? new Date(picked.start_date) : undefined;
    const end = picked.end_date ? new Date(picked.end_date) : undefined;
    setStartDate(start);
    setEndDate(end);
  }, [selectedAcademicYearId, academicYears, isSchool]);

  const openHistory = (id: string, name: string) => {
    openCustomerAccount(id, name);
  };


  // Sync external filter with internal state
  useEffect(() => {
    if (paymentFilter !== undefined) {
      setPaymentStatusFilter(paymentFilter || "all");
    }
  }, [paymentFilter]);


  const { data: embeddedCustomerProfile } = useQuery({
    queryKey: ["customer-ledger-profile", organizationId, preSelectedCustomerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, customer_name, phone, email, address, gst_number, opening_balance, points_balance, discount_percent",
        )
        .eq("organization_id", organizationId)
        .eq("id", preSelectedCustomerId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: embeddedSingleCustomer && !!organizationId && !!preSelectedCustomerId && !isSchool,
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!embeddedSingleCustomer || !embeddedCustomerProfile || !preSelectedCustomerId) return;
    setSelectedCustomer((prev) => {
      if (!prev || prev.id !== preSelectedCustomerId) return prev;
      return {
        ...prev,
        customer_name: embeddedCustomerProfile.customer_name ?? prev.customer_name,
        phone: embeddedCustomerProfile.phone ?? prev.phone,
        email: embeddedCustomerProfile.email ?? prev.email,
        address: embeddedCustomerProfile.address ?? prev.address,
        opening_balance: Number(embeddedCustomerProfile.opening_balance ?? 0),
      };
    });
  }, [embeddedCustomerProfile, embeddedSingleCustomer, preSelectedCustomerId]);

  useEffect(() => {
    if (!embeddedSingleCustomer || selectedCustomer || !embeddedCustomerProfile || !preSelectedCustomerId) {
      return;
    }
    setSelectedCustomer(
      buildEmbeddedCustomerStub(preSelectedCustomerId, embeddedCustomerProfile.customer_name || "Customer", embeddedCustomerProfile.phone, {
        email: embeddedCustomerProfile.email,
        address: embeddedCustomerProfile.address,
        opening_balance: Number(embeddedCustomerProfile.opening_balance ?? 0),
      }),
    );
  }, [
    embeddedSingleCustomer,
    embeddedCustomerProfile,
    preSelectedCustomerId,
    selectedCustomer,
  ]);


  // Fetch all customers with their transaction summary using pagination
  const { data: customers, isLoading, isFetching: isCustomersFetching } = useQuery({
    queryKey: [
      "customer-ledger",
      organizationId,
      isSchool,
      selectedAcademicYearId,
      startDate ? format(startDate, "yyyy-MM-dd") : null,
      endDate ? format(endDate, "yyyy-MM-dd") : null,
    ],
    queryFn: async () => {
      if (!isSchool) {
        return buildCustomerLedgerListFromPartyBalances(organizationId);
      }

      // Fetch ALL customers using range pagination (bypasses 1000-row limit)
      const customersData = await fetchLedgerCustomers(organizationId);

      // For school orgs: one ledger row per student (fee data lives on students).
      // `student.customer_id` is often unset — do not require it to match a customer row.
      if (isSchool) {
        const { data: studentsRows } = await supabase
          .from('students')
          .select('id, student_name, parent_phone, parent_email, customer_id, admission_number, closing_fees_balance, class_id, division, academic_year_id, fees_opening_is_net, is_new_admission, school_classes(class_name)')
          .eq('organization_id', organizationId)
          .is('deleted_at', null);

        const studentsList = studentsRows || [];
        const customerById = new Map<string, any>(customersData.map((c: any) => [c.id, c]));

        // Resolve target academic year from selected range (full FY resolution)
        const { data: allYears } = await supabase
          .from('academic_years')
          .select('id, start_date, end_date, is_current')
          .eq('organization_id', organizationId)
          .order('start_date', { ascending: false });
        const selectedYearObj = selectedAcademicYearId !== "all"
          ? (allYears || []).find((y: any) => y.id === selectedAcademicYearId)
          : null;
        const probeDate = selectedYearObj?.start_date
          ? new Date(selectedYearObj.start_date)
          : (startDate || endDate);
        let targetYear =
          (selectedYearObj || (probeDate
            ? (allYears || []).find((y: any) => {
                const start = new Date(y.start_date);
                const end = new Date(y.end_date);
                return probeDate >= start && probeDate <= end;
              })
            : null)) ||
          (allYears || []).find((y: any) => y.is_current) ||
          (allYears || [])[0] ||
          null;

        // Avoid undefined year when academic_years exist but is_current / ordering gaps — fee queries need a concrete session.
        const effectiveTargetYear =
          targetYear ||
          (Array.isArray(allYears) && (allYears || []).length > 0
            ? [...(allYears || [])].sort(
                (a: any, b: any) =>
                  new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
              )[0]
            : null);

        const previousYear = effectiveTargetYear?.start_date
          ? (allYears || [])
              .filter((y: any) => new Date(y.end_date) < new Date(effectiveTargetYear!.start_date))
              .sort((a: any, b: any) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())[0]
          : null;

        // Fetch fee structures for current year to determine expected totals per class
        let classExpectedMap = new Map<string, number>();
        if (effectiveTargetYear?.id) {
          const { data: feeStructures } = await supabase
            .from('fee_structures')
            .select('class_id, amount, frequency')
            .eq('organization_id', organizationId)
            .eq('academic_year_id', effectiveTargetYear.id);

          feeStructures?.forEach((s: any) => {
            const mult = s.frequency === 'monthly' ? 12 : s.frequency === 'quarterly' ? 4 : 1;
            const total = s.amount * mult;
            classExpectedMap.set(s.class_id, (classExpectedMap.get(s.class_id) || 0) + total);
          });
        }

        // Year-scoped receipts (for balance math vs structures / opening)
        let feeTotalsYear: any[] = [];
        if (effectiveTargetYear?.id) {
          const { data } = await supabase
            .from('student_fees')
            .select('student_id, paid_amount, status')
            .eq('organization_id', organizationId)
            .eq('academic_year_id', effectiveTargetYear.id)
            .neq('status', 'deleted');
          feeTotalsYear = data || [];
        }

        const studentPaidInYear = new Map<string, number>();
        feeTotalsYear.forEach((f: any) => {
          if (f.status === 'balance_adjustment') return; // exclude manual adjustments
          const amt = f.paid_amount || 0;
          studentPaidInYear.set(f.student_id, (studentPaidInYear.get(f.student_id) || 0) + amt);
        });

        // When "All Years" is selected, also sum every session's receipts for the Fees Paid card
        let studentPaidAllYears = studentPaidInYear;
        if (selectedAcademicYearId === 'all') {
          const { data: feeTotalsAll } = await supabase
            .from('student_fees')
            .select('student_id, paid_amount, status')
            .eq('organization_id', organizationId)
            .neq('status', 'deleted');
          studentPaidAllYears = new Map<string, number>();
          feeTotalsAll?.forEach((f: any) => {
            if (f.status === 'balance_adjustment') return;
            const amt = f.paid_amount || 0;
            studentPaidAllYears.set(f.student_id, (studentPaidAllYears.get(f.student_id) || 0) + amt);
          });
        }

        // Late receipt correction:
        // if receipts are posted into previous academic year AFTER promotion,
        // reduce carried opening for target year by those late entries only.
        const latePrevYearPaidByStudent = new Map<string, number>();
        if (previousYear?.id && effectiveTargetYear?.id) {
          // Subtract ALL prev-year receipts from carried closing_fees_balance —
          // a payment received in the previous year (whenever) reduces what carries forward.
          const { data: latePrevYearFees } = await supabase
            .from('student_fees')
            .select('student_id, paid_amount, status')
            .eq('organization_id', organizationId)
            .eq('academic_year_id', previousYear.id)
            .in('status', ['paid', 'partial'])
            .gt('paid_amount', 0);
          (latePrevYearFees || []).forEach((f: any) => {
            const amt = Number(f.paid_amount || 0);
            latePrevYearPaidByStudent.set(
              f.student_id,
              (latePrevYearPaidByStudent.get(f.student_id) || 0) + amt
            );
          });
        }

        let pendingAllSessionsByStudent = new Map<string, number>();
        if (selectedAcademicYearId === "all" && studentsList.length > 0) {
          const batchPayload = studentsList.map((s: any) => ({
            id: s.id,
            class_id: s.class_id ?? null,
            academic_year_id: s.academic_year_id ?? null,
            closing_fees_balance: s.closing_fees_balance ?? null,
            is_new_admission: s.is_new_admission ?? null,
            fees_opening_is_net: s.fees_opening_is_net ?? null,
          }));
          pendingAllSessionsByStudent = await computePendingAllSessionsBatch(
            supabase,
            organizationId,
            batchPayload
          );
        }

        const studentLinkedCustomerIds = new Set(
          studentsList.map((s: any) => s.customer_id).filter(Boolean) as string[]
        );

        // Build school ledger rows — one row per student; merge `customers` when linked.
        const customerTotals = studentsList.map((student: any) => {
          const linked = student.customer_id ? customerById.get(student.customer_id) : undefined;
          const base: any = linked
            ? { ...linked }
            : {
                id: student.id,
                customer_name: student.student_name || "",
                phone: student.parent_phone ?? null,
                email: student.parent_email ?? null,
                address: null as string | null,
                gst_number: null as string | null,
                points_balance: null as number | null,
                discount_percent: null as number | null,
                opening_balance: 0,
              };

          const structureTotal = classExpectedMap.get(student.class_id) || 0;
          const hasStructures = structureTotal > 0;
          const importedBalance = Number(student.closing_fees_balance || 0);
          const paidForBalance = studentPaidInYear.get(student.id) || 0;
          const totalPaidDisplay =
            selectedAcademicYearId === "all"
              ? studentPaidAllYears.get(student.id) || 0
              : paidForBalance;

          const latePrevYearPaid = latePrevYearPaidByStudent.get(student.id) || 0;
          const openingBalance = resolveImportedOpeningBalance(
            importedBalance,
            latePrevYearPaid,
            student.fees_opening_is_net === true && student.academic_year_id === effectiveTargetYear?.id
          );

          let totalSales: number;
          let balance: number;

          if (selectedAcademicYearId === "all") {
            const pendingSum = pendingAllSessionsByStudent.get(student.id) ?? 0;
            balance = Math.round(pendingSum);
            totalSales = Math.round(totalPaidDisplay + pendingSum);
          } else {
            const expectedTotal = openingBalance + (hasStructures ? structureTotal : 0);
            balance = Math.round(expectedTotal - paidForBalance);
            totalSales = Math.round(expectedTotal);
          }

          return {
            ...base,
            id: student.id,
            customerRecordId: student.customer_id ?? null,
            customer_name: student.student_name || base.customer_name || "",
            phone: student.parent_phone ?? base.phone,
            email: student.parent_email ?? base.email,
            opening_balance: Math.round(openingBalance),
            totalSales,
            totalPaid: Math.round(totalPaidDisplay),
            balance,
            totalCashPaid: Math.round(totalPaidDisplay),
            totalAdvanceApplied: 0,
            totalCnApplied: 0,
            unusedAdvanceTotal: 0,
            adjustmentTotal: 0,
            studentId: student.id,
            admissionNumber: student.admission_number,
            className: student.school_classes?.class_name || "",
            division: student.division || "",
            hasStructures,
          };
        });

        const orphanCustomers = customersData.filter((c: any) => !studentLinkedCustomerIds.has(c.id));
        for (const customer of orphanCustomers) {
          customerTotals.push({
            ...customer,
            opening_balance: Math.round(customer.opening_balance || 0),
            totalSales: 0,
            totalPaid: 0,
            balance: Math.round(customer.opening_balance || 0),
            totalCashPaid: 0,
            totalAdvanceApplied: 0,
            totalCnApplied: 0,
            unusedAdvanceTotal: 0,
            adjustmentTotal: 0,
          });
        }

        return customerTotals;
      }
    },
    enabled: !!organizationId && !embeddedSingleCustomer,
    staleTime: STALE_DASHBOARD_TAB_RETURN,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const isCustomersInitialLoad = isLoading && customers === undefined;
  const isCustomersBackgroundRefresh = isCustomersFetching && !isCustomersInitialLoad;

  const salesPaidLeaked = listHasRepeatedSalesPaid(customers ?? []);
  const customersForList = useMemo(() => {
    const raw = (customers ?? []).map((c) => stripPartyWindowTotals(c as Record<string, unknown>) as typeof c);
    return salesPaidLeaked ? clearRepeatedOrgSalesPaid(raw) : raw;
  }, [customers, salesPaidLeaked]);
  /** Facet cards (Outstanding / Credit / Net) prefer the loaded customer list. */
  const facetCardsLoading =
    !isSchool && !(customersForList?.length) && orgReceivablesSummaryLoading;

  // Auto-select customer from URL or persisted session when list is loaded
  useEffect(() => {
    const idToSelect = preSelectedCustomerId || pendingRestoredCustomerIdRef.current;
    if (!idToSelect || !customersForList?.length || selectedCustomer) return;
    const found = customersForList.find(
      (c: any) =>
        c.id === idToSelect ||
        c.customerRecordId === idToSelect ||
        (isSchool && c.studentId === idToSelect),
    );
    if (found) {
      setSelectedCustomer(found);
      pendingRestoredCustomerIdRef.current = null;
    }
  }, [preSelectedCustomerId, customersForList, selectedCustomer, isSchool]);

  // Keep detail header cards in sync when academic year (or list data) changes — opening/totalPaid/balance are year-scoped.
  useEffect(() => {
    if (!selectedCustomer?.id || !customersForList?.length) return;
    const fresh = customersForList.find((c: any) =>
      selectedCustomer.studentId
        ? c.studentId === selectedCustomer.studentId
        : c.id === selectedCustomer.id
    );
    if (fresh) setSelectedCustomer(fresh);
  }, [customersForList, selectedCustomer?.id, selectedCustomer?.studentId]);

  // Fetch detailed transactions for selected customer
  const { data: transactions, isPending: transactionsPending, isFetching: isTransactionsFetching } = useQuery({
    queryKey: ["customer-transactions", selectedCustomer?.id, startDate, endDate, isSchool, selectedAcademicYearId],
    queryFn: async () => {
      if (!selectedCustomer) return [];

      // --- School org: student fee-based transactions ---
      if (isSchool && selectedCustomer.studentId) {
        const studentId = selectedCustomer.studentId;

        // Resolve target academic year from selected range (full FY resolution)
        const { data: allYears } = await supabase
          .from('academic_years')
          .select('id, year_name, start_date, end_date, is_current')
          .eq('organization_id', organizationId)
          .order('start_date', { ascending: false });

        // Multi-session ledger: list every fee receipt & adjustment (labels each session)
        if (selectedAcademicYearId === "all") {
          const yearNameById = new Map<string, string>(
            (allYears || []).map((y: any) => [y.id as string, (y.year_name as string) || ""])
          );

          const { data: stuRow } = await supabase
            .from("students")
            .select("id, class_id, academic_year_id, closing_fees_balance, is_new_admission, fees_opening_is_net")
            .eq("id", studentId)
            .single();

          const pendingRows = stuRow
            ? await computeYearWiseFeeBalances(supabase, organizationId, {
                id: stuRow.id,
                class_id: stuRow.class_id,
                academic_year_id: stuRow.academic_year_id,
                closing_fees_balance: stuRow.closing_fees_balance,
                is_new_admission: stuRow.is_new_admission,
                fees_opening_is_net: stuRow.fees_opening_is_net,
              }, { maxYearsDisplay: 12 })
            : [];
          const totalPendingNow = pendingRows.reduce((s, r) => s + r.balance, 0);

          const { data: feesDataAll, error: feesAllErr } = await supabase
            .from("student_fees")
            .select("*, fee_heads(head_name)")
            .eq("student_id", studentId)
            .eq("organization_id", organizationId)
            .neq("status", "deleted")
            .order("paid_date", { ascending: true });
          if (feesAllErr) throw feesAllErr;

          const { data: adjustmentsAll, error: adjAllErr } = await (supabase.from("student_balance_audit" as any) as any)
            .select("*")
            .eq("organization_id", organizationId)
            .eq("student_id", studentId)
            // Skip trace-only entries (receipt_deleted, receipt_modified) —
            // the underlying receipt change is already reflected in student_fees,
            // so including these would phantom-double the ledger balance.
            .not("reason_code", "in", "(receipt_deleted,receipt_modified)")
            .order("created_at", { ascending: true });
          if (adjAllErr) throw adjAllErr;

          const sortedFees = [...(feesDataAll || [])].sort((a: any, b: any) => {
            const dateA = a.paid_date || a.created_at?.substring(0, 10) || "2000-01-01";
            const dateB = b.paid_date || b.created_at?.substring(0, 10) || "2000-01-01";
            return new Date(dateA).getTime() - new Date(dateB).getTime();
          });

          const combinedEntries = [
            ...sortedFees
              .filter((fee: any) => (fee.paid_amount || 0) > 0 && fee.status !== "balance_adjustment")
              .map((fee: any) => ({
                kind: "payment" as const,
                date: fee.paid_date || fee.created_at?.substring(0, 10) || "",
                sortAt: fee.created_at || (fee.paid_date ? `${fee.paid_date}T00:00:00` : ""),
                data: fee,
              })),
            ...((adjustmentsAll || []) as any[]).map((adj: any) => ({
              kind: "adjustment" as const,
              date: adj.created_at?.substring(0, 10) || "",
              sortAt: adj.created_at || "",
              data: adj,
            })),
          ].sort(
            (a, b) =>
              new Date(a.sortAt || a.date || "2000-01-01").getTime() -
              new Date(b.sortAt || b.date || "2000-01-01").getTime()
          );

          let rb = totalPendingNow;
          for (let i = combinedEntries.length - 1; i >= 0; i--) {
            const entry = combinedEntries[i];
            if (entry.kind === "payment") {
              rb += Number(entry.data.paid_amount || 0);
            } else {
              const adj = entry.data;
              const adjAmount = Number(adj.change_amount || 0);
              const isCredit = adj.adjustment_type === "credit";
              const isDebit = adj.adjustment_type === "debit";
              const isSet = adj.adjustment_type === "set";
              if (isCredit) rb -= adjAmount;
              else if (isDebit) rb += adjAmount;
              else if (isSet) rb = Number(adj.old_balance ?? rb);
            }
          }

          const allTransactions: Transaction[] = [];
          let runningBalance = rb;

          combinedEntries.forEach((entry: any) => {
            if (entry.kind === "payment") {
              const fee = entry.data;
              const paidAmount = fee.paid_amount || 0;
              runningBalance -= paidAmount;
              const feeHeadName = fee.fee_heads?.head_name || "Fee";
              const methodText = fee.payment_method
                ? ` - ${fee.payment_method.charAt(0).toUpperCase() + fee.payment_method.slice(1)}`
                : "";
              const sessionLabel = fee.academic_year_id
                ? yearNameById.get(fee.academic_year_id as string) || ""
                : "";
              const sessionSuffix = sessionLabel ? ` (${sessionLabel})` : "";
              allTransactions.push({
                id: `${fee.id}-payment`,
                date: fee.paid_date || fee.created_at?.substring(0, 10) || "",
                timestamp: fee.created_at || null,
                type: "payment",
                reference: fee.payment_receipt_id || "-",
                description: `Fee Payment${methodText} - ${feeHeadName}${sessionSuffix}`,
                debit: 0,
                credit: paidAmount,
                balance: runningBalance,
                paymentBreakdown: fee.payment_method ? { method: fee.payment_method } : undefined,
              });
              return;
            }

            const adj = entry.data;
            const adjAmount = Number(adj.change_amount || 0);
            const isCredit = adj.adjustment_type === "credit";
            const isDebit = adj.adjustment_type === "debit";
            const posting = computeAdjustmentPosting(adj);
            if (isCredit) runningBalance += adjAmount;
            else if (isDebit) runningBalance -= adjAmount;
            else if (adj.adjustment_type === "set") runningBalance = Number(adj.new_balance || runningBalance);

            allTransactions.push({
              id: `adj-${adj.id || adj.created_at}`,
              date: adj.created_at?.substring(0, 10) || "",
              timestamp: adj.created_at || null,
              type: "adjustment",
              reference: adj.voucher_number || "Adjustment",
              description: adj.reason_code_label || "Balance Adjustment",
              debit: posting.debit,
              credit: posting.credit,
              balance: runningBalance,
            });
          });

          return allTransactions;
        }
        const selectedYearObj = selectedAcademicYearId !== "all"
          ? (allYears || []).find((y: any) => y.id === selectedAcademicYearId)
          : null;
        const probeDate = selectedYearObj?.start_date
          ? new Date(selectedYearObj.start_date)
          : (startDate || endDate);
        const targetYear =
          (selectedYearObj || (probeDate
            ? (allYears || []).find((y: any) => {
                const start = new Date(y.start_date);
                const end = new Date(y.end_date);
                return probeDate >= start && probeDate <= end;
              })
            : null)) ||
          (allYears || []).find((y: any) => y.is_current) ||
          (allYears || [])[0];

        // Opening + structures for the selected academic year (DB-derived — matches Fee Collection when user switches year)
        const { data: stuRow } = await supabase
          .from("students")
          .select("closing_fees_balance, class_id, is_new_admission, academic_year_id, fees_opening_is_net")
          .eq("id", studentId)
          .single();

        const yearsChrono = [...(allYears || [])].sort(
          (a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        );
        const previousYear = targetYear?.start_date
          ? [...yearsChrono]
              .filter((y: any) => y.end_date && new Date(y.end_date) < new Date(targetYear.start_date))
              .sort(
                (a: any, b: any) =>
                  new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
              )[0]
          : null;

        let latePrevPaid = 0;
        if (previousYear?.id) {
          const { data: lateFees } = await supabase
            .from("student_fees")
            .select("paid_amount, status")
            .eq("organization_id", organizationId)
            .eq("student_id", studentId)
            .eq("academic_year_id", previousYear.id)
            .in("status", ["paid", "partial"])
            .gt("paid_amount", 0);
          latePrevPaid = (lateFees || []).reduce(
            (s, f: any) => s + Number(f.paid_amount || 0),
            0
          );
        }

        const importedOpening = resolveImportedOpeningBalance(
          Number(stuRow?.closing_fees_balance || 0),
          latePrevPaid,
          stuRow?.fees_opening_is_net === true && stuRow?.academic_year_id === targetYear?.id
        );

        // Opening Balance Rule:
        // For any academic year that has a PREVIOUS year in the system,
        // opening = previous year's CLOSING balance (cumulative carry-forward
        // across all prior sessions). This way, new receipts collected in the
        // current year correctly reduce the carried-forward balance.
        // For the earliest year on file, fall back to the legacy imported
        // opening (closing_fees_balance − latePrevPaid).
        let carryForwardOpening = importedOpening;
        if (previousYear?.id && targetYear?.id && stuRow) {
          try {
            carryForwardOpening = await computePriorYearsCarryForward(
              supabase,
              organizationId,
              {
                id: studentId,
                class_id: stuRow.class_id,
                academic_year_id: stuRow.academic_year_id,
                closing_fees_balance: stuRow.closing_fees_balance,
                is_new_admission: stuRow.is_new_admission,
                fees_opening_is_net: stuRow.fees_opening_is_net,
              },
              targetYear.id
            );
          } catch (e) {
            console.warn("Carry-forward computation failed, falling back:", e);
            carryForwardOpening = importedOpening;
          }
        }

        let feeStructureDebits: Array<{ head_name: string; total: number }> = [];
        if (stuRow?.class_id && targetYear?.id) {
          const { data: structures } = await supabase
            .from("fee_structures")
            .select("amount, frequency, fee_heads(head_name)")
            .eq("organization_id", organizationId)
            .eq("academic_year_id", targetYear.id)
            .eq("class_id", stuRow.class_id);

          feeStructureDebits = (structures || []).map((s: any) => {
            const mult = s.frequency === "monthly" ? 12 : s.frequency === "quarterly" ? 4 : 1;
            return {
              head_name: s.fee_heads?.head_name || "Fee",
              total: s.amount * mult,
            };
          });
        }

        const structureTotalComputed = feeStructureDebits.reduce((s, x) => s + x.total, 0);
        // New admissions: liability is import-only (same as Fee Collection) — do not add class fee structure lines
        const showStructureDebitRows =
          structureTotalComputed > 0 && stuRow?.is_new_admission !== true;
        const hasStructuresComputed = showStructureDebitRows;
        const openingBalance = carryForwardOpening;

        // Fetch student fees (payments)
        let feesQuery = supabase
          .from('student_fees')
          .select('*, fee_heads(head_name)')
          .eq('student_id', studentId)
          .eq('organization_id', organizationId)
          .eq('academic_year_id', targetYear?.id)
          .neq('status', 'deleted');

        const { data: feesData, error: feesError } = await feesQuery.order('paid_date', { ascending: true });
        if (feesError) throw feesError;

        const { data: adjustmentsData, error: adjustmentsError } = await (supabase.from('student_balance_audit' as any) as any)
          .select('*')
          .eq('organization_id', organizationId)
          .eq('student_id', studentId)
          .eq('academic_year_id', targetYear?.id)
          .not('reason_code', 'in', '(receipt_deleted,receipt_modified)')
          .order('created_at', { ascending: true });
        if (adjustmentsError) throw adjustmentsError;

        const allTransactions: Transaction[] = [];
        let runningBalance = 0;

        // Opening balance entry - only when NO fee structures exist
        if (!hasStructuresComputed && openingBalance !== 0) {
          runningBalance = openingBalance;
        allTransactions.push({
            id: 'opening-balance',
            date: '1900-01-01',
            timestamp: null,
            type: 'fee',
            reference: 'Opening',
            description: previousYear?.year_name
              ? `Opening Balance (Closing of ${previousYear.year_name})`
              : 'Opening Fees Balance (Carried Forward)',
            debit: openingBalance > 0 ? openingBalance : 0,
            credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
            balance: runningBalance,
          });
        }

        if (hasStructuresComputed && feeStructureDebits.length > 0) {
          // Show fee structure totals as debit entries (the expected fees)
          if (openingBalance > 0) {
            runningBalance = openingBalance;
            allTransactions.push({
              id: 'opening-balance',
              date: targetYear?.start_date || '1900-01-01',
              timestamp: null,
              type: 'fee',
              reference: 'Opening',
              description: previousYear?.year_name
                ? `Opening Balance (Closing of ${previousYear.year_name})`
                : 'Opening Fees Balance (Carried Forward)',
              debit: openingBalance,
              credit: 0,
              balance: runningBalance,
            });
          }
          feeStructureDebits.forEach((structure, idx) => {
            runningBalance += structure.total;
            allTransactions.push({
              id: `structure-${idx}`,
              date: targetYear?.start_date || '',
              timestamp: null,
              type: 'fee',
              reference: 'Fee Structure',
              description: structure.head_name,
              debit: structure.total,
              credit: 0,
              balance: runningBalance,
            });
          });
        }

        const sortedFees = [...(feesData || [])].sort((a: any, b: any) => {
          const dateA = a.paid_date || a.created_at?.substring(0, 10) || '2000-01-01';
          const dateB = b.paid_date || b.created_at?.substring(0, 10) || '2000-01-01';
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        });

        const combinedEntries = [
          ...sortedFees
            .filter(
              (fee: any) =>
                (fee.paid_amount || 0) > 0 && fee.status !== "balance_adjustment"
            )
            .map((fee: any) => ({
              kind: 'payment' as const,
              date: fee.paid_date || fee.created_at?.substring(0, 10) || '',
              sortAt: fee.created_at || (fee.paid_date ? `${fee.paid_date}T00:00:00` : ''),
              data: fee,
            })),
          ...((adjustmentsData || []) as any[]).map((adj: any) => ({
            kind: 'adjustment' as const,
            date: adj.created_at?.substring(0, 10) || '',
            sortAt: adj.created_at || '',
            data: adj,
          })),
        ].sort(
          (a, b) =>
            new Date(a.sortAt || a.date || '2000-01-01').getTime() -
            new Date(b.sortAt || b.date || '2000-01-01').getTime()
        );

        combinedEntries.forEach((entry: any) => {
          if (entry.kind === 'payment') {
            const fee = entry.data;
            const paidAmount = fee.paid_amount || 0;
            runningBalance -= paidAmount;
            const feeHeadName = fee.fee_heads?.head_name || 'Fee';
            const methodText = fee.payment_method ? ` - ${fee.payment_method.charAt(0).toUpperCase() + fee.payment_method.slice(1)}` : '';
            const sessionName = (allYears || []).find((y: any) => y.id === fee.academic_year_id)?.year_name;
            const sessionSuffix = sessionName ? ` (${sessionName})` : '';
            allTransactions.push({
              id: `${fee.id}-payment`,
              date: fee.paid_date || fee.created_at?.substring(0, 10) || '',
              timestamp: fee.created_at || null,
              type: 'payment',
              reference: fee.payment_receipt_id || '-',
              description: `Fee Payment${methodText} - ${feeHeadName}${sessionSuffix}`,
              debit: 0,
              credit: paidAmount,
              balance: runningBalance,
              paymentBreakdown: fee.payment_method ? { method: fee.payment_method } : undefined,
            });
            return;
          }

          const adj = entry.data;
          const adjAmount = Number(adj.change_amount || 0);
          const isCredit = adj.adjustment_type === 'credit';
          const isDebit = adj.adjustment_type === 'debit';
          const posting = computeAdjustmentPosting(adj);
          if (isCredit) runningBalance += adjAmount;
          else if (isDebit) runningBalance -= adjAmount;
          else if (adj.adjustment_type === 'set') runningBalance = Number(adj.new_balance || runningBalance);

          allTransactions.push({
            id: `adj-${adj.id || adj.created_at}`,
            date: adj.created_at?.substring(0, 10) || '',
            timestamp: adj.created_at || null,
            type: 'adjustment',
            reference: adj.voucher_number || 'Adjustment',
            description: adj.reason_code_label || 'Balance Adjustment',
            debit: posting.debit,
            credit: posting.credit,
            balance: runningBalance,
          });
        });

        return allTransactions;
      }

      // Retail: shared merge of sales / vouchers / advances / returns / CN / adjustments.
      // School/student branch above stays in this file. Do not re-inline.
      return fetchCustomerLedgerTransactions(
        organizationId,
        selectedCustomer.id,
        {
          startDate: startDate ?? null,
          endDate: endDate ?? null,
        },
        selectedCustomer.opening_balance || 0,
      );
    },
    enabled: !!selectedCustomer?.id,
    staleTime: STALE_DASHBOARD_TAB_RETURN,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previousData, previousQuery) => {
      const prevCustomerId = previousQuery?.queryKey[1];
      if (prevCustomerId && prevCustomerId === selectedCustomer?.id) return previousData;
      return undefined;
    },
  });

  // Fetch payment history for selected customer
  const { data: paymentHistory } = useQuery({
    queryKey: ["customer-payment-history", selectedCustomer?.id, startDate, endDate],
    queryFn: async () => {
      if (!selectedCustomer) return [];

      // Get all sales for this customer to get reference IDs
      const { data: customerSales, error: salesError } = await supabase
        .from("sales")
        .select("id, sale_number, net_amount, paid_amount, cash_amount, card_amount, upi_amount, sale_date, payment_method, payment_status, sale_return_adjust")
        .eq("customer_id", selectedCustomer.id)
        .is("deleted_at", null)
        .neq("payment_status", "hold")
        .eq("is_cancelled", false);

      if (salesError) throw salesError;

      const saleIds = customerSales?.map(s => s.id) || [];
      const saleMap = new Map(customerSales?.map(s => [s.id, s]) || []);

      // Fetch voucher payments (recorded via Record Payment)
      let vouchersQuery = supabase
        .from("voucher_entries")
        .select("*")
        .in("voucher_type", ["receipt", "payment"])
        .is("deleted_at", null)
        .in("reference_id", saleIds.length > 0 ? saleIds : ['00000000-0000-0000-0000-000000000000']);

      if (startDate) {
        vouchersQuery = vouchersQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        vouchersQuery = vouchersQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: false });

      if (vouchersError) throw vouchersError;

      // Fetch opening balance payments (reference_type = 'customer')
      let openingBalanceQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "customer")
        .eq("reference_id", selectedCustomer.id)
        .in("voucher_type", ["receipt", "payment"])
        .is("deleted_at", null);

      if (startDate) {
        openingBalanceQuery = openingBalanceQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        openingBalanceQuery = openingBalanceQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: openingBalancePayments, error: openingError } = await openingBalanceQuery.order("voucher_date", { ascending: false });

      if (openingError) throw openingError;

      // Cash/card/UPI receipt totals only (exclude advance/CN memos) for residual at-sale.
      const voucherCashBySaleId: Record<string, number> = {};
      // All voucher settlement (cash + disc + adv + cn) for paid_amount residual.
      const voucherPaymentsBySaleId: Record<string, number> = {};
      vouchersData?.forEach((voucher) => {
        if (!voucher.reference_id) return;
        const settled =
          (Number(voucher.total_amount) || 0) + (Number(voucher.discount_amount) || 0);
        voucherPaymentsBySaleId[voucher.reference_id] =
          (voucherPaymentsBySaleId[voucher.reference_id] || 0) + settled;
        const pm = String(voucher.payment_method || "").toLowerCase();
        if (pm === "advance_adjustment" || pm === "credit_note_adjustment") return;
        const desc = String(voucher.description || "").toLowerCase();
        if (
          desc.includes("adjusted from advance balance") ||
          desc.includes("advance adjusted") ||
          desc.includes("credit note adjusted") ||
          desc.includes("cn adjusted")
        ) {
          return;
        }
        voucherCashBySaleId[voucher.reference_id] =
          (voucherCashBySaleId[voucher.reference_id] || 0) +
          (Number(voucher.total_amount) || 0);
      });

      // Build payment history list
      const payments: any[] = [];

      // Add payments from voucher entries (invoice payments)
      vouchersData?.forEach((voucher) => {
        const relatedSale = saleMap.get(voucher.reference_id || '');
        const cashReceived = Number(voucher.total_amount) || 0;
        const settlementDiscount = Number(voucher.discount_amount) || 0;
        payments.push({
          id: voucher.id,
          date: voucher.voucher_date,
          voucherNumber: voucher.voucher_number,
          invoiceNumber: relatedSale?.sale_number || 'N/A',
          invoiceAmount: relatedSale?.net_amount || 0,
          amount: cashReceived,
          settlementDiscount,
          totalSettlement: cashReceived + settlementDiscount,
          method: voucher.payment_method || 'recorded',
          description: voucher.description || 'Payment recorded',
          cash: 0,
          card: 0,
          upi: 0,
          source: 'voucher',
        });
      });

      // Add opening balance payments
      openingBalancePayments?.forEach((voucher) => {
        const cashReceived = Number(voucher.total_amount) || 0;
        const settlementDiscount = Number(voucher.discount_amount) || 0;
        payments.push({
          id: voucher.id,
          date: voucher.voucher_date,
          voucherNumber: voucher.voucher_number,
          invoiceNumber: 'Opening Balance',
          invoiceAmount: selectedCustomer.opening_balance || 0,
          amount: cashReceived,
          settlementDiscount,
          totalSettlement: cashReceived + settlementDiscount,
          method: voucher.payment_method || 'recorded',
          description: voucher.description || 'Opening balance payment',
          cash: 0,
          card: 0,
          upi: 0,
          source: 'opening_balance',
        });
      });

      // Residual tender not already covered by sale-linked *cash* receipts.
      customerSales?.forEach((sale) => {
        const voucherCash = voucherCashBySaleId[sale.id] || 0;
        const voucherAll = voucherPaymentsBySaleId[sale.id] || 0;
        const residualTender = residualPaymentAtSaleTender(sale, voucherCash);
        const totalPaidOnSale = sale.paid_amount || 0;
        const fromPaid = Math.max(0, totalPaidOnSale - voucherAll);
        const paidAtSale = Math.max(residualTender, fromPaid);
        
        if (paidAtSale > 0) {
          if (startDate && new Date(sale.sale_date) < startDate) return;
          if (endDate && new Date(sale.sale_date) > endDate) return;
          const br = residualTenderBreakdown(sale, residualTender > 0.005 ? residualTender : paidAtSale);
          
          payments.push({
            id: `${sale.id}-sale-payment`,
            date: sale.sale_date,
            voucherNumber: 'At Sale',
            invoiceNumber: sale.sale_number,
            invoiceAmount: sale.net_amount,
            amount: paidAtSale,
            method: sale.payment_method || 'mixed',
            description: 'Payment at time of sale',
            cash: br.cash,
            card: br.card,
            upi: br.upi,
            source: 'sale',
          });
        }
      });

      // Sort by date descending; latest recorded first (created_at fallback by id/source)
      payments.sort((a, b) => {
        const d = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (d !== 0) return d;
        const ac = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bc = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bc - ac;
      });

      return payments;
    },
    enabled:
      !!selectedCustomer?.id &&
      (activeTab === "payments" || activeTab === "unapplied"),
    staleTime: STALE_FREQUENT,
    refetchOnWindowFocus: false,
  });

  // Calculate payment summary
  const paymentSummary = useMemo(() => {
    if (!paymentHistory) {
      return { total: 0, cash: 0, card: 0, upi: 0, discount: 0, settlementTotal: 0, invoiceAmount: 0, count: 0 };
    }
    const discount = paymentHistory.reduce((sum, p) => sum + (p.settlementDiscount || 0), 0);
    const received = paymentHistory.reduce((sum, p) => sum + (p.amount || 0), 0);
    return {
      total: received,
      settlementTotal: received + discount,
      discount,
      invoiceAmount: paymentHistory.reduce((sum, p) => sum + (p.invoiceAmount || 0), 0),
      cash: paymentHistory.reduce((sum, p) => sum + (p.cash || 0), 0),
      card: paymentHistory.reduce((sum, p) => sum + (p.card || 0), 0),
      upi: paymentHistory.reduce((sum, p) => sum + (p.upi || 0), 0),
      count: paymentHistory.length,
    };
  }, [paymentHistory]);

  // Filter customers based on search, payment status, and date range
  const filteredCustomers = useMemo(() => {
    if (!customersForList) return [];
    const searchLower = searchQuery.trim().toLowerCase();

    return customersForList.filter((customer) => {
      // Search filter — name, phone, email, GST, address
      const matchesSearch =
        !searchLower ||
        (customer.customer_name ?? "").toLowerCase().includes(searchLower) ||
        (customer.phone ?? "").toLowerCase().includes(searchLower) ||
        (customer.email ?? "").toLowerCase().includes(searchLower) ||
        (customer.gst_number ?? "").toLowerCase().includes(searchLower) ||
        (customer.address ?? "").toLowerCase().includes(searchLower);

      // Payment status filter — use Outstanding / Advance / Net facets (not invoice-only balance)
      const facets = facetsFromInvoiceOutstanding(
        customer.balance,
        customer.unusedAdvanceTotal || 0,
      );
      const status = accountFacetStatus(facets);
      let matchesPaymentStatus = true;
      if (paymentStatusFilter === "outstanding") {
        matchesPaymentStatus = status === "outstanding";
      } else if (paymentStatusFilter === "settled") {
        matchesPaymentStatus = status === "settled";
      } else if (paymentStatusFilter === "advance") {
        matchesPaymentStatus =
          status === "credit" || (customer.unusedAdvanceTotal || 0) > 0.5;
      }

      return matchesSearch && matchesPaymentStatus;
    });
  }, [customersForList, searchQuery, paymentStatusFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCustomerPage(0);
  }, [searchQuery, paymentStatusFilter]);

  const filteredLedgerRowKey = useMemo(
    () => filteredCustomers.map((c) => c.id).join(","),
    [filteredCustomers],
  );

  /** Same cap as Customer Balances — never enrich the full org list. */
  const enrichFilteredLedgerSubset =
    !isSchool &&
    !embeddedSingleCustomer &&
    filteredCustomers.length > 0 &&
    filteredCustomers.length <= PARTY_BALANCE_CANONICAL_ENRICH_MAX;

  const { data: canonicalFilteredLedgerRows } = useQuery({
    queryKey: ["customer-ledger-canonical-filtered", organizationId, filteredLedgerRowKey],
    enabled: Boolean(organizationId && enrichFilteredLedgerSubset),
    staleTime: 30_000,
    queryFn: () => enrichLedgerListRowsWithCanonicalBalance(organizationId, filteredCustomers),
  });

  const ledgerRowsForPaging = enrichFilteredLedgerSubset
    ? (canonicalFilteredLedgerRows ?? filteredCustomers)
    : filteredCustomers;

  /** C06/C07 — exports use enriched slice when filter ≤ cap; else post-fix aligned C-PARTY. */
  const customersForExport = useMemo(
    () =>
      customersForLedgerExport(
        filteredCustomers,
        canonicalFilteredLedgerRows,
        enrichFilteredLedgerSubset,
      ),
    [filteredCustomers, canonicalFilteredLedgerRows, enrichFilteredLedgerSubset],
  );

  const paginatedCustomers = useMemo(() => {
    const start = customerPage * CUSTOMERS_PER_PAGE;
    return ledgerRowsForPaging.slice(start, start + CUSTOMERS_PER_PAGE);
  }, [ledgerRowsForPaging, customerPage]);

  const paginatedLedgerRowKey = useMemo(
    () => paginatedCustomers.map((c) => c.id).join(","),
    [paginatedCustomers],
  );

  const { data: canonicalPageLedgerRows } = useQuery({
    queryKey: ["customer-ledger-canonical-page", organizationId, paginatedLedgerRowKey],
    enabled: Boolean(
      organizationId &&
        !isSchool &&
        !embeddedSingleCustomer &&
        !enrichFilteredLedgerSubset &&
        paginatedCustomers.length > 0,
    ),
    staleTime: 30_000,
    queryFn: () => enrichLedgerListRowsWithCanonicalBalance(organizationId, paginatedCustomers),
  });

  const tableCustomers = enrichFilteredLedgerSubset
    ? paginatedCustomers
    : (canonicalPageLedgerRows ?? paginatedCustomers);

  const totalPages = Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE);

  // Reconciliation summary — must live above effectiveBalance (retail Outstanding).
  const reconciliation = useMemo(() => {
    const empty = {
      opening: 0,
      grossInvoiced: 0,
      saleReturns: 0,
      netInvoiced: 0,
      payments: 0,
      paymentsCash: 0,
      paymentsDiscount: 0,
      invoiceCnApplied: 0,
      advanceApplied: 0,
      advanceCredit: 0,
      advanceRefunded: 0,
      cnRefunded: 0,
      adjustments: 0,
      finalBalance: 0,
      invoiceOutstanding: 0,
    };
    if (!transactions || transactions.length === 0) return empty;

    let opening = 0;
    let grossInvoiced = 0;
    let saleReturns = 0;
    let payments = 0;
    let paymentsCash = 0;
    let paymentsDiscount = 0;
    let invoiceCnApplied = 0;
    let advanceApplied = 0;
    let advanceCredit = 0;
    let advanceRefunded = 0;
    let cnRefunded = 0;
    let adjustments = 0;

    for (const t of transactions) {
      if (t.id === "opening-balance") {
        opening = (t.debit || 0) - (t.credit || 0);
        continue;
      }
      if (t.informational) continue;
      if (t.type === "invoice") {
        grossInvoiced += t.grossBill ?? t.displayDebit ?? t.debit ?? 0;
        invoiceCnApplied += t.saleReturnAdjustApplied ?? 0;
      } else if (t.type === "return") {
        // Gross displayCredit drives the Credit column / running balance; recon uses
        // remaining credit when part of the return is already in invoiceCnApplied.
        saleReturns += saleReturnCreditForReconciliation(t);
      } else if (t.type === "payment") {
        const discount = t.paymentBreakdown?.settlementDiscount || 0;
        const cash =
          t.paymentBreakdown?.cashReceived != null
            ? t.paymentBreakdown.cashReceived
            : Math.max(0, (t.credit || 0) - discount);
        paymentsCash += cash;
        paymentsDiscount += discount;
        payments += cash + discount;
      } else if (t.type === "advance_application") {
        advanceApplied += t.appliedAmount || 0;
      } else if (t.type === "advance") {
        advanceCredit += t.credit || 0;
      } else if (t.type === "adv_refund") {
        advanceRefunded += t.debit || 0;
      } else if (t.type === "cn_refund" || t.type === "refund") {
        // Overpayment refund + CN cash refund both clear party credit.
        cnRefunded += t.debit || 0;
      } else if (t.type === "adjustment") {
        adjustments += (t.debit || 0) - (t.credit || 0);
      }
    }

    const finalBalance = transactions[transactions.length - 1]?.balance ?? 0;
    const netInvoiced = grossInvoiced - invoiceCnApplied - saleReturns;
    const invoiceOutstanding = computeInvoiceOutstandingFromReconciliation({
      opening,
      grossInvoiced,
      invoiceCnApplied,
      saleReturns,
      paymentsCash,
      paymentsDiscount,
      advanceApplied,
      adjustments,
      cnRefunded,
    });
    return {
      opening,
      grossInvoiced,
      saleReturns,
      netInvoiced,
      payments,
      paymentsCash,
      paymentsDiscount,
      invoiceCnApplied,
      advanceApplied,
      advanceCredit,
      advanceRefunded,
      cnRefunded,
      adjustments,
      finalBalance,
      invoiceOutstanding,
    };
  }, [transactions]);

  const effectiveBalance = useMemo(() => {
    if (!selectedCustomer) return 0;
    if (isSchool) {
      if (transactions && transactions.length > 0) {
        return Number(transactions[transactions.length - 1].balance || 0);
      }
      return authoritativeBalance;
    }
    // Retail: invoice outstanding from recon arithmetic (includes memo-only advance
    // applications). Do NOT use the last running-balance row — that mixes advance
    // bookings/refunds (party-cash) and left Anusha at ₹8,450 Dr while invoices were Paid.
    if (transactions && transactions.length > 0) {
      return reconciliation.invoiceOutstanding;
    }
    if (
      ledgerAuditClosingBalance != null &&
      !Number.isNaN(Number(ledgerAuditClosingBalance))
    ) {
      return Number(ledgerAuditClosingBalance);
    }
    return authoritativeBalance;
  }, [
    selectedCustomer,
    isSchool,
    transactions,
    authoritativeBalance,
    ledgerAuditClosingBalance,
    reconciliation.invoiceOutstanding,
  ]);

  /**
   * Refund banner — align with Net Position Cr (recon Outstanding − unused advance).
   * Pending CN/SR is already inside recon invoice outstanding; never stack
   * snapshot cnAvailable on top (Sneha/Zohra: paid bill + pending SR → 2× phantom).
   * Do not use snapshot outstanding_dr: SQL still nets unused_advances into the SUM
   * (Aafra: 10k − 4.8k party net = 5.2k phantom “Refund owed”).
   */
  const refundableCreditBalance = useMemo(() => {
    if (!selectedCustomer || isSchool) return 0;
    const unused =
      snapshotAdvanceAvailable > 0
        ? snapshotAdvanceAvailable
        : selectedCustomer.unusedAdvanceTotal || 0;
    const returnsAlreadyInOutstanding = (reconciliation.saleReturns || 0) > 0.5;
    return computeRefundableCreditBalance({
      unusedAdvance: unused,
      // When recon subtracted sale returns, CN is already in effectiveBalance.
      cnAvailable: returnsAlreadyInOutstanding ? 0 : snapshotCnAvailable || 0,
      invoiceOutstanding: effectiveBalance,
    });
  }, [
    selectedCustomer,
    isSchool,
    snapshotAdvanceAvailable,
    snapshotCnAvailable,
    effectiveBalance,
    reconciliation.saleReturns,
  ]);

  useEffect(() => {
    if (!selectedCustomer && showOverpaymentRefundDialog) {
      setShowOverpaymentRefundDialog(false);
    }
  }, [selectedCustomer, showOverpaymentRefundDialog]);

  // KPI cards: same Outstanding / Credit / Net facets as the list (unused advance not double-counted).
  const summary = useMemo(() => {
    if (isSchool) {
      if (!filteredCustomers) {
        return {
          totalCustomers: 0,
          totalOutstanding: 0,
          totalReceivable: 0,
          customerCreditPool: 0,
          netReceivable: 0,
        };
      }
      const facets = summarizeSignedBalanceFacets(filteredCustomers);
      return {
        totalCustomers: filteredCustomers.length,
        totalOutstanding: facets.grossReceivableDr,
        totalReceivable: filteredCustomers.reduce((sum, c) => sum + c.totalSales, 0),
        customerCreditPool: facets.customerCreditPoolCr,
        netReceivable: facets.netReceivable,
      };
    }
    const list = customersForList || [];
    if (list.length > 0) {
      const totals = summarizeAccountFacets(
        list.map((c) =>
          facetsFromInvoiceOutstanding(c.balance, c.unusedAdvanceTotal || 0),
        ),
      );
      return {
        totalCustomers: list.length,
        totalOutstanding: totals.totalOutstandingDr,
        totalReceivable: orgReceivablesSummary.totalSales ?? 0,
        customerCreditPool: totals.totalCreditPoolCr,
        netReceivable: totals.netReceivable,
      };
    }
    return {
      totalCustomers: orgReceivablesSummary.customerCount ?? 0,
      totalOutstanding: orgReceivablesSummary.grossReceivableDr ?? 0,
      totalReceivable: orgReceivablesSummary.totalSales ?? 0,
      customerCreditPool: orgReceivablesSummary.customerCreditPoolCr ?? 0,
      netReceivable: orgReceivablesSummary.netReceivable ?? 0,
    };
  }, [isSchool, filteredCustomers, customersForList, orgReceivablesSummary]);

  // Export customer list to Excel
  const handleExportCustomerListExcel = useCallback(async () => {
    if (!customersForExport.length) return;
    const rows = customersForExport.map((c) => {
      const f = facetsFromInvoiceOutstanding(c.balance, c.unusedAdvanceTotal || 0);
      const status = accountFacetStatus(f);
      return {
        "Customer Name": c.customer_name,
        Phone: c.phone || "",
        Email: c.email || "",
        "Opening Balance": Math.round(c.opening_balance || 0),
        "Total Sales": salesPaidLeaked ? "—" : Math.round(c.totalSales),
        "Total Paid": salesPaidLeaked ? "—" : Math.round(c.totalPaid),
        Outstanding: f.outstanding,
        "Unused Advance": f.unusedAdvance,
        Net: f.netPosition,
        Status:
          status === "outstanding" ? "Outstanding" : status === "credit" ? "Credit" : "Settled",
      };
    });
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger");
    XLSX.writeFile(wb, `Customer_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Customer ledger exported to Excel");
  }, [customersForExport, salesPaidLeaked]);

  // Export customer list to PDF
  const handleExportCustomerListPDF = useCallback(async () => {
    if (!customersForExport.length) return;
    const jsPDF = await loadJsPdf();
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text("Customer Ledger Report", 14, 15);
    doc.setFontSize(9);
    doc.text(`Date: ${format(new Date(), "dd/MM/yyyy")}  |  Customers: ${customersForExport.length}  |  Outstanding: ₹${Math.round(summary.totalOutstanding).toLocaleString("en-IN")}`, 14, 22);

    const cols = ["#", "Customer Name", "Phone", "Sales", "Paid", "Outstanding", "Advance", "Net", "Status"];
    const colWidths = [8, 48, 28, 28, 28, 32, 28, 32, 24];
    let y = 30;

    // Header
    doc.setFillColor(41, 98, 255);
    doc.rect(14, y - 5, pageWidth - 28, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    let x = 14;
    cols.forEach((col, i) => {
      doc.text(col, x + 2, y);
      x += colWidths[i];
    });
    y += 6;
    doc.setTextColor(0, 0, 0);

    customersForExport.forEach((c, idx) => {
      if (y > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        y = 15;
        // Re-draw header
        doc.setFillColor(41, 98, 255);
        doc.rect(14, y - 5, pageWidth - 28, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        let hx = 14;
        cols.forEach((col, i) => {
          doc.text(col, hx + 2, y);
          hx += colWidths[i];
        });
        y += 6;
        doc.setTextColor(0, 0, 0);
      }

      if (idx % 2 === 0) {
        doc.setFillColor(245, 247, 250);
        doc.rect(14, y - 4, pageWidth - 28, 6, "F");
      }

      doc.setFontSize(7.5);
      x = 14;
      const f = facetsFromInvoiceOutstanding(c.balance, c.unusedAdvanceTotal || 0);
      const status = accountFacetStatus(f);
      const row = [
        String(idx + 1),
        c.customer_name.substring(0, 28),
        (c.phone || "").substring(0, 12),
        salesPaidLeaked ? "—" : `₹${Math.round(c.totalSales).toLocaleString("en-IN")}`,
        salesPaidLeaked ? "—" : `₹${Math.round(c.totalPaid).toLocaleString("en-IN")}`,
        `₹${Math.round(f.outstanding).toLocaleString("en-IN")}`,
        `₹${Math.round(f.unusedAdvance).toLocaleString("en-IN")}`,
        formatNetFacetLabel(f.netPosition).replace("₹", ""),
        status === "outstanding" ? "Dr" : status === "credit" ? "Cr" : "OK",
      ];
      row.forEach((val, i) => {
        doc.text(val, x + 2, y);
        x += colWidths[i];
      });
      y += 6;
    });

    // Footer totals
    y += 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Sales: ₹${Math.round(summary.totalReceivable).toLocaleString("en-IN")}   |   Total Outstanding: ₹${Math.round(summary.totalOutstanding).toLocaleString("en-IN")}`, 14, y);

    doc.save(`Customer_Ledger_${format(new Date(), "dd-MM-yyyy")}.pdf`);
    toast.success("Customer ledger exported to PDF");
  }, [customersForExport, summary, salesPaidLeaked]);

  const transactionTotals = useMemo(() => {
    if (!transactions) return { totalDebit: 0, totalCredit: 0 };

    // Sum the DISPLAYED amounts (e.g. invoice GROSS for visible columns) but
    // skip informational rows so the S/R offset isn't double-counted in the
    // totals row.
    return transactions.reduce((acc, t) => {
      if (t.informational) return acc;
      const d = (t.displayDebit ?? t.debit) || 0;
      const c = (t.displayCredit ?? t.credit) || 0;
      return {
        totalDebit: acc.totalDebit + d,
        totalCredit: acc.totalCredit + c,
      };
    }, { totalDebit: 0, totalCredit: 0 });
  }, [transactions]);

  // FIX 5 — Single, unambiguous "Returns / CR" stat. We classify each Sale
  // Return row from the rendered ledger as either Pending or Adjusted by
  // reading the status hint already embedded in the description by the
  // queryFn ("Sale Return [Pending]" / "[Fully Adjusted]" / "[Adjusted to
  // Outstanding]" / "[Cash Refunded]" / "Partial — ₹X pending").
  const saleReturnsSummary = useMemo(() => {
    const summary = { pending: 0, adjusted: 0, partialPending: 0 };
    if (!transactions) return summary;
    for (const t of transactions) {
      if (t.type !== 'return') continue;
      const amount = t.credit || 0;
      const desc = t.description || '';
      if (/\[Pending\]/i.test(desc)) {
        summary.pending += amount;
      } else if (/Partial.*pending/i.test(desc)) {
        // Extract the pending portion from "Partial — ₹X pending"
        const m = desc.match(/Partial\s*—\s*₹([\d,]+(?:\.\d+)?)\s*pending/i);
        const pendingPortion = m ? Number(m[1].replace(/,/g, '')) : 0;
        summary.partialPending += pendingPortion;
        summary.adjusted += Math.max(0, amount - pendingPortion);
      } else {
        // Fully Adjusted, Adjusted to Outstanding, Cash Refunded, etc.
        summary.adjusted += amount;
      }
    }
    return summary;
  }, [transactions]);

  const pendingSaleReturns = useMemo(() => {
    return (transactions || [])
      .filter((t) => t.type === 'return' && t.status === 'pending' && (t.credit || 0) > 0)
      .map((t) => ({
        id: t.id,
        reference: t.reference,
        amount: t.credit || 0,
        description: t.description,
      }));
  }, [transactions]);

  /**
   * KPI cards — single source from rendered ledger rows (retail) or the school
   * customer snapshot (school labels / Opening Balance path unchanged).
   * SQL snapshot (`selectedCustomer.*` / get_customer_financial_snapshot) is
   * reserved for the cross-check amber banner only.
   */
  const ledgerDerivedStats = useMemo(() => {
    if (!selectedCustomer) return null;

    if (isSchool) {
      const cn = pendingSaleReturns.reduce((sum, t) => sum + (t.amount || 0), 0);
      return {
        totalSales: Math.round(selectedCustomer.totalSales || 0),
        cashPaid: Math.round(selectedCustomer.totalCashPaid || 0),
        advanceAdjusted: Math.round(selectedCustomer.totalAdvanceApplied || 0),
        advanceReceived: Math.round(
          (selectedCustomer.totalAdvanceApplied || 0) + (selectedCustomer.unusedAdvanceTotal || 0),
        ),
        advanceBalance: Math.round(selectedCustomer.unusedAdvanceTotal || 0),
        returnsPending: saleReturnsSummary.pending + saleReturnsSummary.partialPending,
        returnsAdjusted: saleReturnsSummary.adjusted,
        cnAvailable: Math.round(cn),
        openingBalance: Math.round(selectedCustomer.opening_balance || 0),
        closingBalance:
          transactions && transactions.length > 0
            ? Number(transactions[transactions.length - 1].balance || 0)
            : null,
      };
    }

    // Advance held is an as-of-now position, not a period total: use the unfiltered
    // booking residuals so a narrow date filter cannot show ₹0 for a live advance.
    const advanceBalanceFromRows = Math.round(
      (transactions || [])
        .filter((t) => t.type === "advance")
        .reduce((sum, t) => sum + Math.max(0, Number(t.advanceRemaining || 0)), 0),
    );
    const advanceBalance =
      selectedCustomer.unusedAdvanceTotal != null
        ? Math.round(selectedCustomer.unusedAdvanceTotal)
        : advanceBalanceFromRows;
    const advanceAdjusted = Math.round(reconciliation.advanceApplied || 0);
    const returnsPending = saleReturnsSummary.pending + saleReturnsSummary.partialPending;
    // Pending SR rows on this ledger, net of cash refunds already paid out (overpayment /
    // CN refund) so CN Available does not stay lit after Refund Overpayment.
    const refundsPaidOnLedger = Math.round(
      (transactions || [])
        .filter((t) => t.type === "refund" || t.type === "cn_refund")
        .reduce((sum, t) => sum + Math.max(0, Number(t.debit || 0)), 0),
    );
    const cnFromRows = Math.max(
      0,
      Math.round(pendingSaleReturns.reduce((sum, t) => sum + (t.amount || 0), 0)) -
        refundsPaidOnLedger,
    );

    return {
      totalSales: Math.round(reconciliation.grossInvoiced || 0),
      cashPaid: Math.round(reconciliation.paymentsCash || 0),
      advanceAdjusted,
      // Same composition the card used: applied + unused.
      advanceReceived: Math.round(advanceAdjusted + advanceBalance),
      advanceBalance,
      returnsPending: Math.max(0, returnsPending - refundsPaidOnLedger),
      returnsAdjusted: saleReturnsSummary.adjusted,
      cnAvailable: cnFromRows,
      openingBalance: Math.round(reconciliation.opening || 0),
      closingBalance:
        transactions && transactions.length > 0
          ? Number(transactions[transactions.length - 1].balance || 0)
          : null,
    };
  }, [
    selectedCustomer,
    isSchool,
    transactions,
    reconciliation,
    saleReturnsSummary,
    pendingSaleReturns,
  ]);

  const cnAvailable = ledgerDerivedStats?.cnAvailable ?? 0;

  type LedgerAllocationRow = {
    id: string;
    voucher_date: string;
    voucher_number: string;
    reference_id: string;
    sale_number: string;
    amount: number;
    description: string;
  };

  const { data: advanceCnAdjustmentsData, isPending: advanceCnAllocPending } = useQuery({
    queryKey: [
      "customer-ledger-advance-cn-allocations",
      organizationId,
      selectedCustomer?.id,
      isSchool,
      startDate ? format(startDate, "yyyy-MM-dd") : null,
      endDate ? format(endDate, "yyyy-MM-dd") : null,
    ],
    queryFn: async (): Promise<{ advanceRows: LedgerAllocationRow[]; cnRows: LedgerAllocationRow[] }> => {
      if (!organizationId || !selectedCustomer?.id || isSchool) {
        return { advanceRows: [], cnRows: [] };
      }
      const custId = selectedCustomer.id;
      const { data: salesRows, error: salesErr } = await supabase
        .from("sales")
        .select("id, sale_number")
        .eq("customer_id", custId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .neq("payment_status", "hold");
      if (salesErr) throw salesErr;
      const saleIds = (salesRows || []).map((s: { id: string }) => s.id).filter(Boolean);
      const saleNumById = new Map<string, string>(
        (salesRows || []).map((s: { id: string; sale_number: string | null }) => [s.id, String(s.sale_number || "").trim() || "—"]),
      );
      const sentinel = ["00000000-0000-0000-0000-000000000000"];
      const refIds = [...saleIds, custId];
      let vq = supabase
        .from("voucher_entries")
        .select("id, voucher_date, voucher_number, reference_id, reference_type, total_amount, description, payment_method, created_at")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        // Phase 1.2: include mis-tagged customer rows pointing at this customer's sales,
        // plus customer-scoped opening-balance advance applications (reference_id = customer id).
        .in("reference_type", ["sale", "customer"])
        // Payment method is filtered client-side: legacy imports tagged advance
        // applications as `cash`, and they must still appear in the applied table.
        .is("deleted_at", null)
        .in("reference_id", refIds.length > 0 ? refIds : sentinel);
      if (startDate) vq = vq.gte("voucher_date", format(startDate, "yyyy-MM-dd"));
      if (endDate) vq = vq.lte("voucher_date", format(endDate, "yyyy-MM-dd"));
      const { data: vouchers, error: vErr } = await vq.order("voucher_date", { ascending: true });
      if (vErr) throw vErr;
      const mapRow = (v: any): LedgerAllocationRow => {
        const refId = String(v.reference_id || "");
        const refType = String(v.reference_type || "").toLowerCase();
        const isObAdvance =
          refType === "customer" && refId === custId;
        return {
          id: String(v.id),
          voucher_date: String(v.voucher_date || "").slice(0, 10),
          voucher_number: String(v.voucher_number || "").trim() || "—",
          reference_id: refId,
          sale_number: isObAdvance
            ? "Opening Balance"
            : saleNumById.get(refId) || "—",
          amount: Math.round((Number(v.total_amount) || 0) * 100) / 100,
          description: String(v.description || "").trim(),
        };
      };
      const advanceRows: LedgerAllocationRow[] = [];
      const cnRows: LedgerAllocationRow[] = [];
      for (const v of vouchers || []) {
        const pm = String(v.payment_method || "").toLowerCase();
        const refId = String(v.reference_id || "");
        // Legacy imports tagged advance applications as `cash`; the description still
        // marks them ("Adjusted from advance balance ..."). Display-only inclusion so
        // the applied table matches the amount already inside Advance Adjusted.
        const legacyAdvanceApply =
          pm !== "advance_adjustment" &&
          pm !== "credit_note_adjustment" &&
          /from advance/i.test(String(v.description || ""));
        if (pm === "advance_adjustment" || legacyAdvanceApply) {
          if (refId === custId || saleNumById.has(refId)) {
            advanceRows.push(mapRow(v));
          }
        } else if (pm === "credit_note_adjustment" && saleNumById.has(refId)) {
          cnRows.push(mapRow(v));
        }
      }
      return { advanceRows, cnRows };
    },
    enabled: Boolean(organizationId && selectedCustomer?.id && !isSchool),
    staleTime: 30_000,
  });

  const advanceAllocRows = advanceCnAdjustmentsData?.advanceRows ?? [];
  const cnAllocRows = advanceCnAdjustmentsData?.cnRows ?? [];

  const advanceAllocSummary = useMemo(() => {
    const total = advanceAllocRows.reduce((s, r) => s + r.amount, 0);
    const invoiceCount = new Set(advanceAllocRows.map((r) => r.reference_id).filter(Boolean)).size;
    return { total, invoiceCount };
  }, [advanceAllocRows]);

  const cnAllocSummary = useMemo(() => {
    const total = cnAllocRows.reduce((s, r) => s + r.amount, 0);
    const invoiceCount = new Set(cnAllocRows.map((r) => r.reference_id).filter(Boolean)).size;
    return { total, invoiceCount };
  }, [cnAllocRows]);

  type CnRefundLedgerRow = {
    id: string;
    voucher_date: string;
    voucher_number: string;
    return_number: string;
    amount: number;
    payment_method: string;
    description: string;
  };

  const { data: cnRefundRows = [], isPending: cnRefundPending } = useQuery({
    queryKey: [
      "customer-ledger-cn-refunds",
      organizationId,
      selectedCustomer?.id,
      isSchool,
      startDate ? format(startDate, "yyyy-MM-dd") : null,
      endDate ? format(endDate, "yyyy-MM-dd") : null,
    ],
    queryFn: async (): Promise<CnRefundLedgerRow[]> => {
      if (!organizationId || !selectedCustomer?.id || isSchool) return [];
      let vq = supabase
        .from("voucher_entries")
        .select(
          "id, voucher_date, voucher_number, total_amount, description, payment_method, created_at",
        )
        .eq("organization_id", organizationId)
        .eq("voucher_type", "payment")
        .eq("reference_type", "customer")
        .eq("reference_id", selectedCustomer.id)
        .is("deleted_at", null)
        .order("voucher_date", { ascending: true });
      if (startDate) vq = vq.gte("voucher_date", format(startDate, "yyyy-MM-dd"));
      if (endDate) vq = vq.lte("voucher_date", format(endDate, "yyyy-MM-dd"));
      const { data: vouchers, error } = await vq;
      if (error) throw error;
      const rows: CnRefundLedgerRow[] = [];
      for (const v of vouchers || []) {
        if (!isCnRefundPaymentVoucher(v)) continue;
        const desc = String(v.description || "").trim();
        rows.push({
          id: String(v.id),
          voucher_date: String(v.voucher_date || "").slice(0, 10),
          voucher_number: String(v.voucher_number || "").trim() || "—",
          return_number:
            parseSaleReturnRefFromCnRefundDescription(desc) || "—",
          amount: Math.round((Number(v.total_amount) || 0) * 100) / 100,
          payment_method: String(v.payment_method || "").trim() || "—",
          description: desc || "CN refund",
        });
      }
      return rows;
    },
    enabled: Boolean(organizationId && selectedCustomer?.id && !isSchool),
    staleTime: 30_000,
  });

  const cnRefundSummary = useMemo(() => {
    const total = cnRefundRows.reduce((s, r) => s + r.amount, 0);
    const returnCount = new Set(cnRefundRows.map((r) => r.return_number).filter((n) => n !== "—")).size;
    return { total, returnCount };
  }, [cnRefundRows]);

  type AdvRefundLedgerRow = {
    id: string;
    refund_date: string;
    refund_number: string;
    advance_number: string;
    amount: number;
    payment_method: string;
    reason: string;
  };

  const { data: advRefundRows = [], isPending: advRefundPending } = useQuery({
    queryKey: [
      "customer-ledger-adv-refunds",
      organizationId,
      selectedCustomer?.id,
      isSchool,
      startDate ? format(startDate, "yyyy-MM-dd") : null,
      endDate ? format(endDate, "yyyy-MM-dd") : null,
    ],
    queryFn: async (): Promise<AdvRefundLedgerRow[]> => {
      if (!organizationId || !selectedCustomer?.id || isSchool) return [];
      const { data: advances, error: advErr } = await supabase
        .from("customer_advances")
        .select("id, advance_number")
        .eq("organization_id", organizationId)
        .eq("customer_id", selectedCustomer.id);
      if (advErr) throw advErr;
      const advanceIds = (advances || []).map((a) => a.id);
      if (advanceIds.length === 0) return [];
      const advanceNoById = new Map(
        (advances || []).map((a) => [a.id, String(a.advance_number || "—")]),
      );
      const refunds = await fetchAdvanceRefundsForAdvances(supabase, organizationId, advanceIds, {
        startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
        endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
      });
      return refunds.map((r) => ({
        id: String(r.id),
        refund_date: String(r.refund_date || "").slice(0, 10),
        refund_number: String(r.refund_number || "").trim() || "—",
        advance_number: advanceNoById.get(String(r.advance_id)) || "—",
        amount: Math.round((Number(r.refund_amount) || 0) * 100) / 100,
        payment_method: String(r.payment_method || "").trim() || "—",
        reason: String(r.reason || "").trim(),
      }));
    },
    enabled: Boolean(organizationId && selectedCustomer?.id && !isSchool),
    staleTime: 30_000,
  });

  const advRefundSummary = useMemo(() => {
    const total = advRefundRows.reduce((s, r) => s + r.amount, 0);
    const advanceCount = new Set(advRefundRows.map((r) => r.advance_number).filter((n) => n !== "—")).size;
    return { total, advanceCount };
  }, [advRefundRows]);

  const deleteAdvRefundMutation = useMutation({
    mutationFn: async (refundId: string) => {
      await deleteAdvanceRefund({ organizationId, refundId, client: supabase });
    },
    onSuccess: () => {
      toast.success("Advance refund deleted — balance restored");
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger-adv-refunds"] });
      queryClient.invalidateQueries({ queryKey: ["customer-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["advance-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete refund"),
  });

  useEffect(() => {
    if (
      isSchool &&
      (activeTab === "advance-adjusted" ||
        activeTab === "cn-adjusted" ||
        activeTab === "cn-refund" ||
        activeTab === "adv-refund")
    ) {
      setActiveTab("transactions");
    }
  }, [isSchool, activeTab]);

  useEffect(() => {
    setCardDrill(null);
  }, [selectedCustomer?.id]);

  const handleApplyToInvoice = useCallback((sr: { reference: string }) => {
    toast.info(
      `Apply ${sr.reference}: use Sale Returns → Adjust Credit Note, Accounts → Customer Payment, or Sales Invoice → From Credit Note (CN) once the return is saved.`,
    );
  }, []);

  // Send ledger summary via WhatsApp
  const handleSendLedgerWhatsApp = useCallback(() => {
    if (!selectedCustomer) return;
    if (!selectedCustomer.phone) {
      return;
    }

    const openingBalance = selectedCustomer.opening_balance || 0;
    const dateRange = (startDate || endDate) 
      ? `\n📅 Period: ${startDate ? format(startDate, "dd MMM yyyy") : "Beginning"} - ${endDate ? format(endDate, "dd MMM yyyy") : "Today"}`
      : "";

    // Build pending invoices from transaction data — use running balance approach
    // For each invoice, sum all credits (payments) that reference it to get remaining balance
    const allTxns = transactions || [];
    const invoiceTxns = allTxns.filter(t => t.type === 'invoice' && t.debit > 0 && t.id !== 'opening-balance');
    
    // Sum all credits per invoice ID from payment transactions
    const totalPaidPerInvoice = new Map<string, number>();
    allTxns.forEach(t => {
      if (t.credit > 0 && t.type === 'payment' && t.reference) {
        // Payment transactions share the same reference (sale_number) as the invoice
        // Find the invoice with matching reference to get its ID
        const matchingInvoice = invoiceTxns.find(inv => inv.reference === t.reference);
        if (matchingInvoice) {
          totalPaidPerInvoice.set(matchingInvoice.id, (totalPaidPerInvoice.get(matchingInvoice.id) || 0) + t.credit);
        }
      }
    });
    
    // Also account for sale return adjustments (cn_adjustment type)
    allTxns.forEach(t => {
      if (t.credit > 0 && (t.type as string) === 'cn_adjustment' && t.reference) {
        const matchingInvoice = invoiceTxns.find(inv => inv.reference === t.reference);
        if (matchingInvoice) {
          totalPaidPerInvoice.set(matchingInvoice.id, (totalPaidPerInvoice.get(matchingInvoice.id) || 0) + t.credit);
        }
      }
    });
    
    const pendingInvoices = invoiceTxns
      .map(t => {
        const totalPaid = totalPaidPerInvoice.get(t.id) || 0;
        const remaining = Math.round(t.debit - totalPaid);
        return { ...t, remaining };
      })
      .filter(t => t.remaining > 0);

    const billWisePending = pendingInvoices.reduce((sum, t) => sum + t.remaining, 0);

    let txnSummary = "";
    if (pendingInvoices.length > 0) {
      txnSummary = "\n\n📋 *Pending Invoices:*";
      pendingInvoices.forEach((t) => {
        const dateStr = format(new Date(t.date), "dd/MM/yy");
        txnSummary += `\n${dateStr} | ${t.reference} | ₹${Math.round(t.debit).toLocaleString("en-IN")} | Bal: ₹${t.remaining.toLocaleString("en-IN")}`;
      });
    }

    // For school non-structure students, opening_balance and totalSales are the same — avoid showing both
    const showOpeningInMsg = !isSchool || (selectedCustomer as any).hasStructures !== false;
    const feesLabel = isSchool ? ((selectedCustomer as any).hasStructures === false ? 'Opening Balance' : 'Total Fees') : 'Total Sales';
    const paidLabel = isSchool ? 'Fees Paid' : 'Total Paid';

    const balanceBreakdown = openingBalance > 0
      ? `\n📋 Bill-wise Pending: ₹${Math.round(billWisePending).toLocaleString("en-IN")}\n💰 Opening Balance: ₹${Math.round(openingBalance).toLocaleString("en-IN")}`
      : '';

    const message = `📊 *Account Statement*

👤 *${selectedCustomer.customer_name}*${dateRange}
${showOpeningInMsg ? `\n💰 Opening Balance: ₹${Math.round(openingBalance).toLocaleString("en-IN")}` : ''}
📈 ${feesLabel}: ₹${Math.round(selectedCustomer.totalSales).toLocaleString("en-IN")}
✅ ${paidLabel}: ₹${Math.round(selectedCustomer.totalPaid).toLocaleString("en-IN")}
────────────────${balanceBreakdown}
💵 *Outstanding: ₹${Math.abs(Math.round(effectiveBalance)).toLocaleString("en-IN")}${effectiveBalance < 0 ? " (Advance)" : ""}*${txnSummary}

Please clear your dues at the earliest. Thank you!`;

    sendWhatsApp(selectedCustomer.phone, message);
  }, [selectedCustomer, transactions, startDate, endDate, sendWhatsApp]);

  const handleExportToExcel = async () => {
    if (!selectedCustomer || !transactions) return;

    const exportData = transactions.map((t) => {
      const dateStr = t.id === 'opening-balance' ? 'Opening' : format(new Date(t.date), "dd/MM/yyyy");
      const timeStr = t.timestamp ? format(new Date(t.timestamp), "hh:mm a") : '';
      const row: any = {
        Date: dateStr,
        Time: timeStr,
        Type: t.type === 'invoice' ? 'Invoice' : t.type === 'return' ? 'Sale Return' : t.type === 'advance' ? 'Advance' : t.type === 'adjustment' ? 'Adjustment' : t.type === 'cn_adjusted' ? 'CN Adjust' : 'Payment',
        Reference: t.reference,
        Description: t.description,
        Debit: t.debit > 0 ? t.debit.toFixed(2) : '',
        Credit: t.credit > 0 ? t.credit.toFixed(2) : '',
      };

      // Add payment breakdown columns if available
      if (t.paymentBreakdown) {
        if (t.paymentBreakdown.cash !== undefined && t.paymentBreakdown.cash > 0) {
          row['Cash Amount'] = t.paymentBreakdown.cash.toFixed(2);
        }
        if (t.paymentBreakdown.card !== undefined && t.paymentBreakdown.card > 0) {
          row['Card Amount'] = t.paymentBreakdown.card.toFixed(2);
        }
        if (t.paymentBreakdown.upi !== undefined && t.paymentBreakdown.upi > 0) {
          row['UPI Amount'] = t.paymentBreakdown.upi.toFixed(2);
        }
        if (t.paymentBreakdown.method) {
          row['Payment Method'] = t.paymentBreakdown.method.toUpperCase();
        }
        if (t.paymentBreakdown.cashReceived != null && t.paymentBreakdown.cashReceived > 0) {
          row['Cash Received'] = t.paymentBreakdown.cashReceived.toFixed(2);
        }
        if (t.paymentBreakdown.settlementDiscount != null && t.paymentBreakdown.settlementDiscount > 0) {
          row['Settlement Discount'] = t.paymentBreakdown.settlementDiscount.toFixed(2);
        }
      }

      row.Balance = t.balance.toFixed(2);
      return row;
    });

    // Add totals row
    exportData.push({
      Date: '',
      Type: '',
      Reference: '',
      Description: 'TOTAL',
      Debit: transactionTotals.totalDebit.toFixed(2),
      Credit: transactionTotals.totalCredit.toFixed(2),
      Balance: transactions.length > 0 ? transactions[transactions.length - 1].balance.toFixed(2) : '0.00',
    });

    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger");
    XLSX.writeFile(wb, `${selectedCustomer.customer_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  const handleExportToPDF = async () => {
    if (!selectedCustomer || !transactions) return;

    let accountArithmeticLine = "";
    try {
      const accountView = await fetchCustomerAccountStateView(
        supabase,
        organizationId,
        selectedCustomer.id,
      );
      accountArithmeticLine = formatCustomerAccountArithmeticLine(accountView);
    } catch {
      // PDF still exports without the strip if fetch fails.
    }

    const jsPDF = await loadJsPdf();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const tableWidth = pageWidth - margin * 2;
    const headers = ["Date & Time", "Type", "Reference", "Description", "Debit", "Credit", "Balance"];
    const colWidths = [28, 16, 22, 48, 22, 22, 22];

    const drawLedgerTableHeader = (y: number) => {
      pdfSetFill(doc, LEDGER_PDF.headerBg);
      doc.rect(margin, y, tableWidth, 8, "F");
      pdfSetText(doc, LEDGER_PDF.headerText);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      let x = margin;
      headers.forEach((header, i) => {
        doc.text(header, x + 1, y + 5);
        x += colWidths[i];
      });
      return y + 10;
    };

    let yPos = 16;

    // Company letterhead (Settings → Company): business name, address, mobile.
    const bizName = (businessInfo.businessName || "").trim();
    const bizAddress = (businessInfo.address || "").trim();
    const bizMobile = (businessInfo.mobileNumber || "").trim();
    if (bizName || bizAddress || bizMobile) {
      if (bizName) {
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        pdfSetText(doc, LEDGER_PDF.text);
        doc.text(bizName, pageWidth / 2, yPos, { align: "center" });
        yPos += 6;
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      pdfSetText(doc, LEDGER_PDF.muted);
      if (bizAddress) {
        const addrLines = doc.splitTextToSize(bizAddress, tableWidth - 20);
        doc.text(addrLines, pageWidth / 2, yPos, { align: "center" });
        yPos += addrLines.length * 4;
      }
      if (bizMobile) {
        doc.text(`Mobile: ${bizMobile}`, pageWidth / 2, yPos, { align: "center" });
        yPos += 4;
      }
      // Divider under the letterhead.
      pdfSetDraw(doc, LEDGER_PDF.reconBorder);
      doc.setLineWidth(0.3);
      doc.line(margin, yPos + 1, pageWidth - margin, yPos + 1);
      yPos += 7;
    }

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    pdfSetText(doc, LEDGER_PDF.title);
    doc.text("Customer Ledger", pageWidth / 2, yPos, { align: "center" });
    yPos += 12;

    const infoStartY = yPos;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    pdfSetText(doc, LEDGER_PDF.text);
    doc.text(selectedCustomer.customer_name, margin, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    pdfSetText(doc, LEDGER_PDF.muted);
    if (selectedCustomer.phone) {
      doc.text(`Phone: ${selectedCustomer.phone}`, margin, yPos);
      yPos += 5;
    }
    if (selectedCustomer.address) {
      doc.text(`Address: ${selectedCustomer.address}`, margin, yPos);
      yPos += 5;
    }
    if (startDate || endDate) {
      const dateRange = `Period: ${startDate ? format(startDate, "dd MMM yyyy") : "Beginning"} to ${endDate ? format(endDate, "dd MMM yyyy") : "Today"}`;
      doc.text(dateRange, margin, yPos);
      yPos += 5;
    }

    const pdfCredit =
      refundableCreditBalance > 0
        ? refundableCreditBalance
        : effectiveBalance < 0
          ? Math.abs(effectiveBalance)
          : 0;
    const pdfCreditIsRefundable = refundableCreditBalance > 0;
    const balanceBoxW = 72;
    const balanceBoxH = 18;
    const balanceBoxX = pageWidth - margin - balanceBoxW;
    const balanceBoxY = infoStartY - 4;
    if (pdfCredit > 0) {
      pdfSetFill(doc, LEDGER_PDF.tealBoxBg);
      pdfSetDraw(doc, LEDGER_PDF.tealBoxBorder);
      doc.rect(balanceBoxX, balanceBoxY, balanceBoxW, balanceBoxH, "FD");
      pdfSetText(doc, LEDGER_PDF.muted);
      doc.setFontSize(7);
      // Party Cr ≠ unused advance bookings; only label "Credit balance" when refundable pool > 0.
      doc.text(
        pdfCreditIsRefundable ? "Credit balance (Cr)" : "Party balance (Cr)",
        balanceBoxX + 3,
        balanceBoxY + 5,
      );
      pdfSetText(doc, LEDGER_PDF.tealBoxText);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Rs. ${pdfCredit.toLocaleString("en-IN")}`, balanceBoxX + 3, balanceBoxY + 13);
    } else if (effectiveBalance > 0) {
      pdfSetFill(doc, LEDGER_PDF.redBoxBg);
      pdfSetDraw(doc, LEDGER_PDF.redBoxBorder);
      doc.rect(balanceBoxX, balanceBoxY, balanceBoxW, balanceBoxH, "FD");
      pdfSetText(doc, LEDGER_PDF.muted);
      doc.setFontSize(7);
      doc.text("Outstanding (Dr)", balanceBoxX + 3, balanceBoxY + 5);
      pdfSetText(doc, LEDGER_PDF.balanceDr);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Rs. ${effectiveBalance.toLocaleString("en-IN")}`, balanceBoxX + 3, balanceBoxY + 13);
    } else if (effectiveBalance < 0) {
      pdfSetFill(doc, LEDGER_PDF.emeraldBoxBg);
      pdfSetDraw(doc, LEDGER_PDF.emeraldBoxBorder);
      doc.rect(balanceBoxX, balanceBoxY, balanceBoxW, balanceBoxH, "FD");
      pdfSetText(doc, LEDGER_PDF.muted);
      doc.setFontSize(7);
      doc.text("Outstanding (Cr)", balanceBoxX + 3, balanceBoxY + 5);
      pdfSetText(doc, LEDGER_PDF.balanceCr);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Rs. ${Math.abs(effectiveBalance).toLocaleString("en-IN")}`, balanceBoxX + 3, balanceBoxY + 13);
    } else {
      pdfSetFill(doc, LEDGER_PDF.totalsBg);
      pdfSetDraw(doc, LEDGER_PDF.reconBorder);
      doc.rect(balanceBoxX, balanceBoxY, balanceBoxW, balanceBoxH, "FD");
      pdfSetText(doc, LEDGER_PDF.muted);
      doc.setFontSize(7);
      doc.text("Balance", balanceBoxX + 3, balanceBoxY + 5);
      pdfSetText(doc, LEDGER_PDF.balanceSettled);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Rs. 0", balanceBoxX + 3, balanceBoxY + 13);
    }
    doc.setFont("helvetica", "normal");
    yPos = Math.max(yPos, balanceBoxY + balanceBoxH + 6);

    // Same Pure Outstanding arithmetic as SID / Record Payment / Collect.
    if (accountArithmeticLine) {
      pdfSetText(doc, LEDGER_PDF.muted);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(accountArithmeticLine, tableWidth);
      doc.text(wrapped, margin, yPos);
      yPos += Math.max(5, wrapped.length * 4) + 2;
    }

    yPos = drawLedgerTableHeader(yPos);

    transactions.forEach((t, rowIdx) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
        yPos = drawLedgerTableHeader(yPos);
      }

      const rowH = 6;
      if (t.id === "opening-balance") {
        pdfSetFill(doc, LEDGER_PDF.openingBg);
      } else if (rowIdx % 2 === 1) {
        pdfSetFill(doc, LEDGER_PDF.zebra);
      } else {
        pdfSetFill(doc, [255, 255, 255]);
      }
      doc.rect(margin, yPos - 4, tableWidth, rowH, "F");

      const dateTimeStr =
        t.id === "opening-balance"
          ? "Opening"
          : format(new Date(t.date), "dd/MM/yy") +
            (t.timestamp ? ` ${format(new Date(t.timestamp), "hh:mm a")}` : "");
      const bNum = Math.round(t.balance);
      const bStr =
        bNum === 0 ? "Rs. 0" : `Rs. ${Math.abs(bNum).toLocaleString("en-IN")} ${bNum < 0 ? "Cr" : "Dr"}`;
      const dispDebit = t.displayDebit ?? t.debit ?? 0;
      const dispCredit = t.displayCredit ?? t.credit ?? 0;
      const desc = t.informational ? `(info) ${t.description}` : t.description;
      const descShort = desc.length > 28 ? `${desc.substring(0, 28)}...` : desc;
      const typeLabel = ledgerPdfTypeLabel(t);
      const debitStr = dispDebit > 0 ? `Rs. ${Math.round(dispDebit).toLocaleString("en-IN")}` : "";
      const creditStr = dispCredit > 0 ? `Rs. ${Math.round(dispCredit).toLocaleString("en-IN")}` : "";
      const balanceStr = t.informational ? "" : bStr;

      doc.setFontSize(8);
      if (t.informational) {
        doc.setFont("helvetica", "italic");
      } else {
        doc.setFont("helvetica", "normal");
      }

      let xPos = margin;
      const cellSpecs: Array<{ text: string; color: readonly [number, number, number] }> = [
        {
          text: dateTimeStr,
          color: t.id === "opening-balance" ? LEDGER_PDF.openingText : t.informational ? LEDGER_PDF.muted : LEDGER_PDF.text,
        },
        { text: typeLabel, color: ledgerPdfTypeColor(t) },
        { text: t.reference, color: t.informational ? LEDGER_PDF.muted : LEDGER_PDF.text },
        { text: descShort, color: t.informational ? LEDGER_PDF.muted : LEDGER_PDF.text },
        { text: debitStr, color: dispDebit > 0 ? LEDGER_PDF.debit : LEDGER_PDF.text },
        { text: creditStr, color: dispCredit > 0 ? LEDGER_PDF.credit : LEDGER_PDF.text },
        {
          text: balanceStr,
          color:
            t.informational || balanceStr === ""
              ? LEDGER_PDF.text
              : bNum > 0
                ? LEDGER_PDF.balanceDr
                : bNum < 0
                  ? LEDGER_PDF.balanceCr
                  : LEDGER_PDF.balanceSettled,
        },
      ];

      cellSpecs.forEach((cell, i) => {
        pdfSetText(doc, cell.color);
        doc.text(cell.text, xPos + 1, yPos);
        xPos += colWidths[i];
      });
      if (t.informational) {
        doc.setFont("helvetica", "normal");
      }
      yPos += rowH;
    });

    yPos += 2;
    pdfSetFill(doc, LEDGER_PDF.totalsBg);
    doc.rect(margin, yPos - 4, tableWidth, 8, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");

    const closingBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0;
    const closingStr = (() => {
      const n = Math.abs(Math.round(closingBalance));
      const suffix = closingBalance > 0 ? " Dr" : closingBalance < 0 ? " Cr" : "";
      return `Rs. ${n.toLocaleString("en-IN")}${suffix}`;
    })();

    let xPos = margin;
    const totalsSpecs: Array<{ text: string; color: readonly [number, number, number] }> = [
      { text: "", color: LEDGER_PDF.text },
      { text: "", color: LEDGER_PDF.text },
      { text: "", color: LEDGER_PDF.text },
      { text: "COLUMN TOTALS (Dr / Cr)", color: LEDGER_PDF.muted },
      { text: `Rs. ${Math.round(transactionTotals.totalDebit).toLocaleString("en-IN")}`, color: LEDGER_PDF.muted },
      { text: `Rs. ${Math.round(transactionTotals.totalCredit).toLocaleString("en-IN")}`, color: LEDGER_PDF.muted },
      { text: `${closingStr} diff`, color: LEDGER_PDF.muted },
    ];
    totalsSpecs.forEach((cell, i) => {
      pdfSetText(doc, cell.color);
      doc.text(cell.text, xPos + 1, yPos);
      xPos += colWidths[i];
    });

    yPos += 12;
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    const invoiceOutstanding = reconciliation.invoiceOutstanding;
    const reconLines: Array<[string, number]> = [
      ["Opening Balance", reconciliation.opening],
      ["(+) Total Invoiced", reconciliation.grossInvoiced],
      ...(reconciliation.invoiceCnApplied > 0
        ? [["(-) CN/SR Applied on Invoices", -reconciliation.invoiceCnApplied] as [string, number]]
        : []),
      ["(-) Sale Returns", -reconciliation.saleReturns],
      ["(=) Net Invoiced", reconciliation.netInvoiced],
      ["(-) Cash / UPI / Card Received", -reconciliation.paymentsCash],
      ...(reconciliation.paymentsDiscount > 0
        ? [["(-) Settlement Discount", -reconciliation.paymentsDiscount] as [string, number]]
        : []),
    ];
    if (reconciliation.advanceApplied > 0) {
      reconLines.push(["(-) Advance Adjusted", -reconciliation.advanceApplied]);
    }
    if (reconciliation.cnRefunded > 0) {
      reconLines.push(["(+) CN Refunded to Customer", reconciliation.cnRefunded]);
    }
    if (reconciliation.adjustments !== 0) {
      reconLines.push(["(+/-) Balance Adjustments", reconciliation.adjustments]);
    }
    const finalLabel =
      invoiceOutstanding > 0
        ? "Outstanding (Dr)"
        : invoiceOutstanding < 0
          ? "Outstanding (Cr)"
          : "Outstanding (Nil)";
    const pdfUnusedAdvance = Math.max(
      0,
      Math.round(selectedCustomer?.unusedAdvanceTotal ?? 0),
    );
    const pdfPoolUnclamped = Math.round(
      (reconciliation.advanceCredit || 0) -
        (reconciliation.advanceApplied || 0) -
        (reconciliation.advanceRefunded || 0),
    );
    const pdfPoolFloored = pdfPoolUnclamped < pdfUnusedAdvance - 0.5;
    const pdfNetPosition = Math.round(invoiceOutstanding - pdfUnusedAdvance);
    const noteLines =
      2 + (pdfPoolFloored ? 1 : 0) + (reconciliation.advanceRefunded > 0 ? 1 : 0) + 1;
    const reconBoxH = 8 + reconLines.length * 5 + 8 + noteLines * 5;
    pdfSetFill(doc, LEDGER_PDF.reconBg);
    pdfSetDraw(doc, LEDGER_PDF.reconBorder);
    doc.rect(margin, yPos - 2, tableWidth, reconBoxH, "FD");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    pdfSetText(doc, LEDGER_PDF.title);
    doc.text("Balance Reconciliation", margin + 4, yPos + 4);
    yPos += 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const labelX = margin + 6;
    const valueX = margin + 92;
    reconLines.forEach(([label, val]) => {
      const lineColor = ledgerPdfReconLineColor(label) ?? LEDGER_PDF.text;
      pdfSetText(doc, lineColor);
      doc.text(label, labelX, yPos);
      const sign = val < 0 ? "-" : "";
      doc.text(`${sign}Rs. ${Math.abs(Math.round(val)).toLocaleString("en-IN")}`, valueX, yPos);
      yPos += 5;
    });
    doc.setFont("helvetica", "bold");
    const finalColor =
      invoiceOutstanding > 0
        ? LEDGER_PDF.balanceDr
        : invoiceOutstanding < 0
          ? LEDGER_PDF.balanceCr
          : LEDGER_PDF.balanceSettled;
    pdfSetText(doc, finalColor);
    doc.text(finalLabel, labelX, yPos + 1);
    doc.text(`Rs. ${Math.abs(Math.round(invoiceOutstanding)).toLocaleString("en-IN")}`, valueX, yPos + 1);
    yPos += 6;
    doc.setFont("helvetica", "normal");
    pdfSetText(doc, LEDGER_PDF.text);
    doc.text("(-) Unused Advance", labelX, yPos + 1);
    doc.text(`Rs. ${pdfUnusedAdvance.toLocaleString("en-IN")}`, valueX, yPos + 1);
    yPos += 5;
    doc.setFont("helvetica", "bold");
    pdfSetText(
      doc,
      pdfNetPosition > 0
        ? LEDGER_PDF.balanceDr
        : pdfNetPosition < 0
          ? LEDGER_PDF.balanceCr
          : LEDGER_PDF.balanceSettled,
    );
    doc.text(
      `(=) Net Position (${pdfNetPosition > 0 ? "Dr" : pdfNetPosition < 0 ? "Cr" : "Nil"})`,
      labelX,
      yPos + 1,
    );
    doc.text(`Rs. ${Math.abs(pdfNetPosition).toLocaleString("en-IN")}`, valueX, yPos + 1);
    yPos += 6;
    if (pdfPoolFloored) {
      doc.setFont("helvetica", "normal");
      pdfSetText(doc, LEDGER_PDF.balanceDr);
      doc.text(
        `Note: Unused Advance floored at booking residual. Unclamped pool Rs. ${pdfPoolUnclamped.toLocaleString("en-IN")} (shortfall Rs. ${Math.abs(pdfUnusedAdvance - pdfPoolUnclamped).toLocaleString("en-IN")}) - needs review.`,
        labelX,
        yPos + 1,
      );
      yPos += 5;
    }
    if (reconciliation.advanceRefunded > 0) {
      doc.setFont("helvetica", "normal");
      pdfSetText(doc, LEDGER_PDF.muted);
      doc.text(
        `Note: Advance refunded out to customer Rs. ${Math.round(reconciliation.advanceRefunded).toLocaleString("en-IN")} (not in Outstanding)`,
        labelX,
        yPos + 1,
      );
      yPos += 5;
    }
    doc.setFont("helvetica", "normal");
    pdfSetText(doc, LEDGER_PDF.muted);
    doc.setFontSize(7);
    doc.text(
      "Legend: [Memo] rows (advance / credit-note applications) are tracing entries only and are excluded from the Dr / Cr columns.",
      labelX,
      yPos + 1,
    );
    yPos += 5;
    doc.text(
      "Column totals above include advance receipts and refunds - they are not what the customer owes.",
      labelX,
      yPos + 1,
    );
    doc.setFontSize(9);
    yPos += 5;
    yPos += 4;

    yPos += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    pdfSetText(doc, LEDGER_PDF.muted);
    doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, margin, yPos);

    if (!isSchool && (advanceAllocRows.length > 0 || cnAllocRows.length > 0)) {
      doc.addPage();
      yPos = 18;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      pdfSetText(doc, LEDGER_PDF.title);
      doc.text("Advance & credit note applied to invoices", margin, yPos);
      yPos += 6;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      pdfSetText(doc, LEDGER_PDF.muted);
      const periodPdf =
        startDate || endDate
          ? `${startDate ? format(startDate, "dd MMM yyyy") : "Start"} — ${endDate ? format(endDate, "dd MMM yyyy") : "Today"}`
          : "Full period (no date filter)";
      doc.text(`Voucher date range: ${periodPdf}`, margin, yPos);
      yPos += 8;

      const allocCols = [22, 24, 22, 22, 88] as const;
      const drawAllocBlock = (sectionTitle: string, rows: typeof advanceAllocRows) => {
        if (rows.length === 0) return;
        if (yPos > 255) {
          doc.addPage();
          yPos = 18;
        }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        pdfSetText(doc, LEDGER_PDF.blue);
        doc.text(sectionTitle, margin, yPos);
        yPos += 5;
        doc.setFontSize(7);
        const h = ["Date", "Voucher", "Invoice", "Amount", "Description"];
        pdfSetFill(doc, LEDGER_PDF.headerBg);
        doc.rect(margin, yPos - 3, tableWidth, 6, "F");
        pdfSetText(doc, LEDGER_PDF.headerText);
        let x = margin;
        h.forEach((label, i) => {
          doc.text(label, x + 1, yPos + 1);
          x += allocCols[i];
        });
        yPos += 7;
        doc.setFont("helvetica", "normal");
        rows.forEach((r, idx) => {
          if (yPos > 278) {
            doc.addPage();
            yPos = 18;
          }
          if (idx % 2 === 1) {
            pdfSetFill(doc, LEDGER_PDF.zebra);
            doc.rect(margin, yPos - 3, tableWidth, 5, "F");
          }
          const dStr = r.voucher_date ? format(new Date(`${r.voucher_date}T12:00:00`), "dd/MM/yy") : "—";
          const desc = r.description.length > 55 ? `${r.description.slice(0, 52)}...` : r.description;
          const cells = [
            { text: dStr, color: LEDGER_PDF.text },
            { text: r.voucher_number, color: LEDGER_PDF.text },
            { text: r.sale_number, color: LEDGER_PDF.purple },
            { text: `Rs. ${r.amount.toLocaleString("en-IN")}`, color: LEDGER_PDF.credit },
            { text: desc || "—", color: LEDGER_PDF.muted },
          ];
          x = margin;
          cells.forEach((cell, i) => {
            pdfSetText(doc, cell.color);
            doc.text(String(cell.text), x + 1, yPos);
            x += allocCols[i];
          });
          yPos += 5;
        });
        yPos += 4;
      };

      drawAllocBlock("Advance applied to invoices", advanceAllocRows);
      drawAllocBlock("Credit note applied to invoices", cnAllocRows);

      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      pdfSetText(doc, LEDGER_PDF.blue);
      const advFoot = `Unused advance (bookings): Rs. ${(selectedCustomer.unusedAdvanceTotal ?? 0).toLocaleString("en-IN")}`;
      const cnFoot = `CN available (notes): Rs. ${cnAvailable.toLocaleString("en-IN")}`;
      if (yPos > 272) {
        doc.addPage();
        yPos = 18;
      }
      doc.text(advFoot, margin, yPos);
      yPos += 4;
      pdfSetText(doc, LEDGER_PDF.purple);
      doc.text(cnFoot, margin, yPos);
    }

    doc.save(`${selectedCustomer.customer_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.pdf`);
  };

  const overpaymentRefundDialog = (
    <Dialog open={showOverpaymentRefundDialog} onOpenChange={setShowOverpaymentRefundDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund Overpayment</DialogTitle>
          <DialogDescription>
            Record a cash/UPI refund to {selectedCustomer?.customer_name ?? "customer"} for{' '}
            ₹{refundableCreditBalance.toLocaleString('en-IN')} credit balance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Refund Amount (₹)</Label>
            <Input
              type="number"
              value={overpaymentRefundAmount}
              onChange={(e) => setOverpaymentRefundAmount(e.target.value)}
              placeholder={refundableCreditBalance.toFixed(2)}
              className="no-uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Max refundable: ₹{refundableCreditBalance.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Payment Mode</Label>
            <Select value={overpaymentRefundMode} onValueChange={setOverpaymentRefundMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Note (Optional)</Label>
            <Textarea
              value={overpaymentRefundNote}
              onChange={(e) => setOverpaymentRefundNote(e.target.value)}
              placeholder="Reason for refund..."
              rows={2}
              className="no-uppercase"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowOverpaymentRefundDialog(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isProcessingRefund || !overpaymentRefundAmount || parseFloat(overpaymentRefundAmount) <= 0}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!selectedCustomer || !organizationId) {
                toast.error("No customer selected");
                return;
              }
              const amount = parseFloat(overpaymentRefundAmount);
              if (!amount || amount <= 0) {
                toast.error("Please enter a valid refund amount");
                return;
              }
              const maxRefundable = refundableCreditBalance;
              if (amount > maxRefundable + 0.01) {
                toast.error(`Cannot refund more than ₹${maxRefundable.toLocaleString('en-IN')}`);
                return;
              }
              setIsProcessingRefund(true);
              try {
                const { data: { user } } = await supabase.auth.getUser();
                const voucherNum = `REFUND-${Date.now()}`;
                const refundMode = overpaymentRefundMode || "cash";
                const { error } = await supabase
                  .from('voucher_entries')
                  .insert({
                    organization_id: organizationId,
                    voucher_type: 'payment',
                    voucher_number: voucherNum,
                    voucher_date: new Date().toISOString().split('T')[0],
                    reference_type: 'customer',
                    reference_id: selectedCustomer.id,
                    total_amount: amount,
                    payment_method: refundMode,
                    description:
                      overpaymentRefundNote ||
                      `Overpayment refund to ${selectedCustomer.customer_name} (${refundMode})`,
                    created_by: user?.id || null,
                  });
                if (error) throw error;

                // Consume pending sale-return / CN credit so it cannot be applied again
                // after cash was paid out (same pattern as Sale Return → Refund CN).
                let remainingRefund = amount;
                const { data: pendingReturns } = await supabase
                  .from("sale_returns")
                  .select(
                    "id, net_amount, credit_available_balance, credit_status, return_date, created_at",
                  )
                  .eq("organization_id", organizationId)
                  .eq("customer_id", selectedCustomer.id)
                  .eq("credit_status", "pending")
                  .is("deleted_at", null)
                  .order("return_date", { ascending: true })
                  .order("created_at", { ascending: true });

                for (const sr of pendingReturns || []) {
                  if (remainingRefund <= 0.01) break;
                  const available = Math.max(
                    0,
                    Number(
                      sr.credit_available_balance != null
                        ? sr.credit_available_balance
                        : sr.net_amount || 0,
                    ),
                  );
                  if (available <= 0.01) continue;
                  const take = Math.min(available, remainingRefund);
                  const left = Math.max(0, available - take);
                  const { error: srErr } = await supabase
                    .from("sale_returns")
                    .update({
                      credit_status: left <= 0.01 ? "refunded" : "pending",
                      credit_available_balance: left <= 0.01 ? 0 : left,
                    })
                    .eq("id", sr.id)
                    .eq("organization_id", organizationId);
                  if (srErr) throw srErr;
                  remainingRefund = Math.round((remainingRefund - take) * 100) / 100;
                }

                toast.success(`Refund of ₹${amount.toLocaleString('en-IN')} recorded successfully`);
                setShowOverpaymentRefundDialog(false);
                setOverpaymentRefundAmount('');
                setOverpaymentRefundNote('');
                queryClient.invalidateQueries({ queryKey: ['customer-ledger-audit-closing'] });
                queryClient.invalidateQueries({ queryKey: ['customer-balance'] });
                queryClient.invalidateQueries({ queryKey: ['customer-transactions'] });
                queryClient.invalidateQueries({ queryKey: ['customers-with-balance'] });
                queryClient.invalidateQueries({ queryKey: ['useCustomerBalance'] });
                queryClient.invalidateQueries({ queryKey: ['customer-financial-snapshot'] });
                queryClient.invalidateQueries({ queryKey: ['sale-returns'] });
                queryClient.invalidateQueries({ queryKey: ['cashier-report-customer-refunds'] });
              } catch (err: any) {
                console.error('Refund error:', err);
                toast.error(`Refund failed: ${err.message || 'Unknown error'}`);
              } finally {
                setIsProcessingRefund(false);
              }
            }}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {isProcessingRefund ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : 'Record Refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (selectedCustomer) {
    const allLedgerRows = transactions ?? [];
    const ledgerRows = filterLedgerRowsByCardDrill(allLedgerRows, cardDrill);
    const ledgerLoading = transactionsPending && transactions === undefined;
    const isLedgerBackgroundRefresh = isTransactionsFetching && !ledgerLoading;

    const activateCardDrill = (key: LedgerCardDrillKey) => {
      // School has no Advance-adjusted tab — keep a Transactions filter chip.
      if (isSchool && key === "advance_adjusted") {
        setActiveTab("transactions");
        setCardDrill(key);
        return;
      }
      const tab = tabForLedgerCardDrill(key);
      setActiveTab(tab);
      // Tabs that already own the row set don't need a Transactions filter chip.
      if (key === "payments" || key === "advance_adjusted") {
        setCardDrill(null);
      } else {
        setCardDrill(key);
      }
    };

    const ledgerBody = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!embedMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => {
                setShowOverpaymentRefundDialog(false);
                if (onEmbeddedBack) {
                  onEmbeddedBack();
                } else {
                  selectCustomer(null);
                }
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {embeddedBackLabel ?? "Back to Customers"}
            </Button>
          )}
          
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 justify-end">
            {isSchool && (
              <Select
                value={selectedAcademicYearId}
                onValueChange={(val) => {
                  setSelectedAcademicYearId(val);
                  if (val === "all") {
                    setStartDate(undefined);
                    setEndDate(undefined);
                  }
                }}
              >
                <SelectTrigger className="flex-1 min-w-[120px] h-9 text-sm">
                  <SelectValue placeholder="Academic Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {(academicYears || []).map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.year_name}{y.is_current ? " (Current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 min-w-[130px] h-9 justify-start text-left font-normal text-sm">
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {startDate ? format(startDate, "dd MMM yyyy") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 min-w-[130px] h-9 justify-start text-left font-normal text-sm">
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {endDate ? format(endDate, "dd MMM yyyy") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {(startDate || endDate) && (
              <Button
                variant="ghost"
                className="h-9 shrink-0"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }}
              >
                Clear
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={handleExportToExcel}
            >
              <Download className="mr-2 h-4 w-4" />
              {isMobile ? "Excel" : "Export Excel"}
            </Button>

            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0 min-w-[5.5rem] h-4">
              {isLedgerBackgroundRefresh && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating…
                </>
              )}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportToPDF}
              className={isMobile ? "flex-1" : ""}
            >
              <FileDown className="mr-2 h-4 w-4" />
              {isMobile ? "PDF" : "Export PDF"}
            </Button>

            {selectedCustomer.phone && (
              <Button
                variant="default"
                size="sm"
                onClick={handleSendLedgerWhatsApp}
                className={cn("bg-green-600 hover:bg-green-700", isMobile ? "flex-1" : "")}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                {isMobile ? "WhatsApp" : "Send on WhatsApp"}
              </Button>
            )}
          </div>
        </div>

        <Card className="overflow-hidden border-0 shadow-md">
          <div className="h-1.5 bg-gradient-to-r from-primary via-blue-500 to-accent" />
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">
                  <button
                    className="text-foreground hover:text-primary cursor-pointer bg-transparent border-none p-0 text-2xl font-bold tracking-tight transition-colors"
                    onClick={() => openHistory(selectedCustomer.id, selectedCustomer.customer_name)}
                  >
                    {selectedCustomer.customer_name}
                  </button>
                </CardTitle>
                <div className="flex flex-wrap gap-2 mt-1">
                  {isSchool && selectedCustomer.admissionNumber && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span>Adm: {selectedCustomer.admissionNumber}</span>
                    </div>
                  )}
                  {isSchool && selectedCustomer.className && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <span>Class: {selectedCustomer.className}{selectedCustomer.division ? ` - ${selectedCustomer.division}` : ''}</span>
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>{selectedCustomer.phone}</span>
                    </div>
                  )}
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span>{selectedCustomer.email}</span>
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>{selectedCustomer.address}</span>
                    </div>
                  )}
                </div>
              </div>
              {refundableCreditBalance > 0 ? (
              <div className="text-right px-5 py-4 rounded-xl min-w-[160px] bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
                <div className="text-sm text-muted-foreground mb-1">Credit balance (Cr)</div>
                <div className="text-3xl font-bold tabular-nums text-teal-700 dark:text-teal-300">
                  ₹{refundableCreditBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div className="mt-2">
                  <Badge variant="outline" className="border-teal-400 text-teal-800 dark:text-teal-200">
                    Refund owed
                  </Badge>
                </div>
              </div>
              ) : (
              <div className={cn(
                "text-right px-5 py-4 rounded-xl min-w-[160px]",
                effectiveBalance > 0
                  ? "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800"
                  : effectiveBalance < 0
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800"
                    : "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              )}>
                <div className="text-sm text-muted-foreground mb-1">
                  {effectiveBalance > 0
                    ? "Outstanding (Dr)"
                    : effectiveBalance < 0
                      ? "Outstanding (Cr)"
                      : "Balance"}
                </div>
                <div className={cn(
                  "text-3xl font-bold tabular-nums",
                  effectiveBalance > 0
                    ? "text-red-600 dark:text-red-400"
                    : effectiveBalance < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground"
                )}>
                  ₹{Math.abs(effectiveBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div className="mt-2">
                  {effectiveBalance > 0 ? (
                    <Badge variant="destructive">Customer Owes</Badge>
                  ) : effectiveBalance < 0 ? (
                    <Badge variant="outline" className="border-emerald-400 text-emerald-800 dark:text-emerald-200">
                      Party credit (not From Advance)
                    </Badge>
                  ) : (
                    <Badge variant="outline">Fully Settled</Badge>
                  )}
                </div>
                {effectiveBalance < -0.5 && (selectedCustomer.unusedAdvanceTotal || 0) <= 0.5 && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 text-left max-w-[220px] ml-auto">
                    Unused advance bookings ₹0 — Record Payment → From Advance cannot use this party credit until advance is restored or a new booking is created.
                  </p>
                )}
                {snapshotOutstandingDr != null &&
                  !isSchool &&
                  (() => {
                    // Compare snapshot to invoice Outstanding (same figure as the header),
                    // not the last running-balance row (party-cash / memo advances).
                    const ledgerBalance = effectiveBalance;
                    return Math.abs(ledgerBalance - snapshotOutstandingDr) > 1;
                  })() && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 text-left max-w-[260px] ml-auto">
                      <span className="inline-flex items-start gap-1 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        SQL snapshot ₹
                        {Math.abs(snapshotOutstandingDr).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        {snapshotOutstandingDr >= 0 ? "Dr" : "Cr"} — ledger uses ₹
                        {Math.abs(effectiveBalance).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        {effectiveBalance >= 0 ? "Dr" : "Cr"}
                        . Run migration{" "}
                        <code className="text-[10px]">20260628120000_fix_reconcile_gross_invoiced_cn_receipts</code>{" "}
                        in Supabase SQL editor, then hard-refresh. Also run{" "}
                        <code className="text-[10px]">scripts/report-schema-migrations-drift.sql</code>.
                      </span>
                    </p>
                  )}
              </div>
              )}
            </div>
            {!isSchool && (
              <div className="mt-3">
                <CustomerAccountSummaryStrip
                  organizationId={organizationId}
                  customerId={selectedCustomer.id}
                  customerName={selectedCustomer.customer_name}
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {(() => {
              const stats = ledgerDerivedStats;
              const totalSales = stats?.totalSales ?? 0;
              const cashPaid = stats?.cashPaid ?? 0;
              const advanceAdjusted = stats?.advanceAdjusted ?? 0;
              const advanceReceived = stats?.advanceReceived ?? 0;
              const advanceBalance = stats?.advanceBalance ?? 0;
              const returnsPending = stats?.returnsPending ?? 0;
              const returnsAdjusted = stats?.returnsAdjusted ?? 0;
              const cnAvail = stats?.cnAvailable ?? 0;
              const openingBal = stats?.openingBalance ?? selectedCustomer.opening_balance ?? 0;
              const cardClass = (active: boolean) =>
                cn(
                  "border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden cursor-pointer transition-colors hover:border-primary/40 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "ring-2 ring-primary border-primary/50",
                );
              return (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-0 min-h-[4.5rem]">
              {/* For school non-structure students, opening_balance IS totalSales — show only once as "Opening Balance" */}
              {openingBal !== 0 && !(isSchool && (selectedCustomer as any).hasStructures === false) && (
                <Card
                  className={cardClass(cardDrill === "opening")}
                  role="button"
                  tabIndex={0}
                  onClick={() => activateCardDrill("opening")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      activateCardDrill("opening");
                    }
                  }}
                >
                  <CardContent className="p-3">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Opening Balance</div>
                    <div className={cn(
                      "text-lg font-bold tabular-nums",
                      openingBal > 0 ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"
                    )}>
                      ₹{Math.abs(openingBal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {openingBal > 0 ? "Receivable" : "Advance"}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card
                className={cardClass(cardDrill === "invoices")}
                role="button"
                tabIndex={0}
                onClick={() => activateCardDrill("invoices")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activateCardDrill("invoices");
                  }
                }}
              >
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {isSchool ? ((selectedCustomer as any).hasStructures === false ? "Opening Balance" : "Total Fees") : "Total Sales"}
                  </div>
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                    ₹{totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card
                className={cardClass(activeTab === "payments" && !cardDrill)}
                role="button"
                tabIndex={0}
                onClick={() => activateCardDrill("payments")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activateCardDrill("payments");
                  }
                }}
              >
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {isSchool ? "Fees Received" : "Cash/UPI Paid"}
                  </div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ₹{cashPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card
                className={cardClass(activeTab === "advance-adjusted" && !cardDrill)}
                role="button"
                tabIndex={0}
                onClick={() => activateCardDrill("advance_adjusted")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activateCardDrill("advance_adjusted");
                  }
                }}
              >
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Advance Adjusted</div>
                  <div className="text-lg font-bold text-purple-600 dark:text-purple-300 tabular-nums">
                    ₹{advanceAdjusted.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card
                className={cardClass(cardDrill === "advance_received")}
                role="button"
                tabIndex={0}
                onClick={() => activateCardDrill("advance_received")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activateCardDrill("advance_received");
                  }
                }}
              >
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Advance Received</div>
                  <div className="text-lg font-bold text-indigo-600 dark:text-indigo-300 tabular-nums">
                    ₹{advanceReceived.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Applied + Unused</div>
                </CardContent>
              </Card>
              <Card
                className={cardClass(cardDrill === "advance_balance")}
                role="button"
                tabIndex={0}
                onClick={() => activateCardDrill("advance_balance")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activateCardDrill("advance_balance");
                  }
                }}
              >
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Advance Balance</div>
                  <div className={cn(
                    "text-lg font-bold tabular-nums",
                    advanceBalance > 0
                      ? "text-teal-600 dark:text-teal-400"
                      : "text-muted-foreground"
                  )}>
                    ₹{advanceBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  {advanceBalance > 0 && (
                    <div className="text-[10px] text-teal-600 dark:text-teal-400 mt-0.5">Available to apply</div>
                  )}
                </CardContent>
              </Card>
              <Card
                className={cardClass(cardDrill === "returns")}
                role="button"
                tabIndex={0}
                onClick={() => activateCardDrill("returns")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activateCardDrill("returns");
                  }
                }}
              >
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Returns / CR</div>
                  {returnsPending > 0 ? (
                    <>
                      <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        ₹{returnsPending.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Pending adjustment</div>
                    </>
                  ) : returnsAdjusted > 0 ? (
                    <>
                      <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        ₹{returnsAdjusted.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">Adjusted ✓</div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-bold text-muted-foreground tabular-nums">₹0.00</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">No returns</div>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card
                className={cardClass(cardDrill === "cn_available")}
                role="button"
                tabIndex={0}
                onClick={() => activateCardDrill("cn_available")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activateCardDrill("cn_available");
                  }
                }}
              >
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">CN Available</div>
                  <div className={cn(
                    "text-lg font-bold tabular-nums",
                    cnAvail > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                  )}>
                    ₹{cnAvail.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  {cnAvail > 0 && (
                    <div className="text-[10px] text-orange-500 mt-0.5">Pending adjustment</div>
                  )}
                </CardContent>
              </Card>
            </div>
              );
            })()}

            {/* Refund shortcut - shows when customer has credit balance */}
            {refundableCreditBalance > 0 && (
              <div className="mt-3 mb-1 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    ₹{refundableCreditBalance.toLocaleString("en-IN")} credit balance — refund to customer
                  </p>
                  {Math.abs(authoritativeBalance - effectiveBalance) > 1 &&
                    authoritativeBalance < 0 &&
                    effectiveBalance < 0 && (
                      <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1">
                        Ledger running total ₹{Math.abs(effectiveBalance).toLocaleString("en-IN")} — refund
                        uses canonical balance ₹{refundableCreditBalance.toLocaleString("en-IN")}.
                      </p>
                    )}
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    {(() => {
                      const unused = selectedCustomer.unusedAdvanceTotal || 0;
                      const overpay = Math.max(0, refundableCreditBalance - unused);
                      const parts: string[] = [];
                      if (unused > 0) parts.push(`₹${unused.toLocaleString("en-IN")} unused advance`);
                      if (overpay > 0) parts.push(`₹${overpay.toLocaleString("en-IN")} overpayment / pending CN`);
                      return parts.length
                        ? `Breakdown: ${parts.join(" + ")}`
                        : "Customer has overpaid — process a cash/UPI refund";
                    })()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(selectedCustomer.unusedAdvanceTotal || 0) > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const orgSlug = window.location.pathname.split('/')[1];
                        window.location.href = `/${orgSlug}/advance-booking-dashboard?search=${encodeURIComponent(selectedCustomer.customer_name || '')}`;
                      }}
                    >
                      <Undo2 className="h-4 w-4 mr-1" />
                      Refund Advance
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-400 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/50"
                    disabled={!selectedCustomer?.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const creditAmt =
                        refundableCreditBalance > 0 ? refundableCreditBalance.toFixed(2) : '';
                      setOverpaymentRefundAmount(creditAmt);
                      setOverpaymentRefundNote('');
                      setOverpaymentRefundMode('cash');
                      setShowOverpaymentRefundDialog(true);
                    }}
                  >
                    <IndianRupee className="h-4 w-4 mr-1" />
                    Refund Overpayment
                  </Button>
                </div>
              </div>
            )}

            <div className="my-4" />

            <TooltipProvider delayDuration={300}>
            {cardDrill && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 pr-1 font-normal">
                  Showing: {ledgerCardDrillLabel(cardDrill)}
                  <button
                    type="button"
                    className="ml-1 rounded-sm px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Clear card filter"
                    onClick={() => setCardDrill(null)}
                  >
                    ×
                  </button>
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setCardDrill(null);
                    setActiveTab("transactions");
                  }}
                >
                  Show all
                </Button>
              </div>
            )}
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v);
                // Switching tabs manually clears a Transactions-only drill chip.
                if (v !== "transactions") setCardDrill(null);
              }}
              className="w-full"
            >
              <TabsList className="flex w-full max-w-full flex-nowrap overflow-x-auto gap-1 mb-4 min-h-10 bg-muted/60 rounded-xl p-1">
                <TabsTrigger value="transactions" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <FileText className="h-4 w-4" />
                  Transactions
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <IndianRupee className="h-4 w-4" />
                  Payment History
                </TabsTrigger>
                <TabsTrigger value="unapplied" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <AlertCircle className="h-4 w-4" />
                  Unapplied
                </TabsTrigger>
                {!isSchool && (
                  <>
                    <TabsTrigger value="advance-adjusted" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                      <Wallet className="h-4 w-4" />
                      Advance adjusted
                    </TabsTrigger>
                    <TabsTrigger value="cn-adjusted" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                      <BookOpen className="h-4 w-4" />
                      CN adjusted
                    </TabsTrigger>
                    <TabsTrigger value="cn-refund" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                      <Undo2 className="h-4 w-4" />
                      CN Refund
                    </TabsTrigger>
                    <TabsTrigger value="adv-refund" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                      <Wallet className="h-4 w-4" />
                      Adv Refund
                    </TabsTrigger>
                  </>
                )}
              </TabsList>

              <TabsContent value="transactions">
                <div className={accountsHistoryTableWrapClass}>
                  <Table className={accountsHistoryTableClass}>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className={cn(accountsHistoryThClass, "w-[120px]")}>Date</TableHead>
                        <TableHead className={accountsHistoryThClass}>Type</TableHead>
                        <TableHead className={accountsHistoryThClass}>Reference</TableHead>
                        <TableHead className={accountsHistoryThClass}>Description</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Debit</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Credit</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                            <Loader2 className="h-8 w-8 animate-spin inline align-middle mr-2 text-primary" />
                            Loading ledger…
                          </TableCell>
                        </TableRow>
                      ) : ledgerRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                         ledgerRows.map((transaction) => (
                           <TableRow key={transaction.id} className={cn(
                             transaction.id === 'opening-balance'
                               ? 'bg-orange-50/60 dark:bg-orange-950/20 border-l-4 border-l-orange-400'
                               : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/30',
                             transaction.informational && 'italic text-muted-foreground bg-muted/20'
                           )}>
                            <TableCell>
                              {transaction.id === 'opening-balance'
                                ? <span className="font-bold text-orange-600 dark:text-orange-400 text-sm">B/F Opening</span>
                                : <div>
                                    <div className="text-sm font-medium tabular-nums">
                                      {format(new Date(transaction.date), "dd MMM yyyy")}
                                    </div>
                                    {transaction.timestamp && (
                                      <div className="text-xs text-muted-foreground tabular-nums">
                                        {format(new Date(transaction.timestamp), "hh:mm a")}
                                      </div>
                                    )}
                                  </div>
                              }
                            </TableCell>
                            <TableCell>
                              {transaction.id === 'opening-balance' ? (
                                <Badge variant="outline" className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                                  B/F
                                </Badge>
                              ) : (
                                <div className="flex items-center gap-1">
                                  {transaction.type === 'advance' ? (
                                    <Badge className={getBadgeStyle('advance')}>
                                      <Wallet className="h-3 w-3 mr-1" /> ADVANCE
                                    </Badge>
                                  ) : transaction.type === 'advance_application' ? (
                                    <Badge className={cn("text-xs", getBadgeStyle('advance_applied'))}>
                                      <TrendingUp className="h-3 w-3 mr-1" /> Advance Applied
                                    </Badge>
                                  ) : transaction.type === 'adjustment' ? (
                                    <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30">
                                      ADJ
                                    </Badge>
                                  ) : transaction.type === 'fee' ? (
                                    <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30">
                                      <FileText className="h-3 w-3 mr-1" /> FEE
                                    </Badge>
                                  ) : transaction.type === 'return' ? (
                                    <Badge className={cn("text-xs", getBadgeStyle('sale_return', transaction.status))}>
                                      {transaction.status === 'pending' ? 'Pending CN' : 'CN Used'}
                                    </Badge>
                                  ) : transaction.type === 'cn_refund' ? (
                                    <Badge className={cn("text-xs", getBadgeStyle('cn_refund'))}>
                                      CN.Refund
                                    </Badge>
                                  ) : transaction.type === 'adv_refund' ? (
                                    <Badge className={cn("text-xs", getBadgeStyle('adv_refund'))}>
                                      Adv. Refund
                                    </Badge>
                                  ) : transaction.type === 'refund' ? (
                                    <Badge className={cn("text-xs", getBadgeStyle('adv_refund'))}>
                                      Refund
                                    </Badge>
                                  ) : transaction.type === 'credit_note' ? (
                                    <Badge className="bg-purple-100 text-purple-700 border border-purple-300 text-xs">
                                      Credit Note
                                    </Badge>
                                  ) : transaction.type === 'cn_adjusted' ? (
                                    <Badge className={cn("text-xs", getBadgeStyle('cn_adjusted'))}>
                                      CN Adjust
                                    </Badge>
                                  ) : (
                                    <>
                                      {transaction.type === 'invoice' ? (
                                        <Badge className={cn("text-xs", getBadgeStyle('invoice'))}>
                                          <FileText className="h-3 w-3 mr-1" /> Invoice
                                        </Badge>
                                      ) : (
                                        <Badge className={cn("text-xs", getBadgeStyle('payment'))}>
                                          <IndianRupee className="h-3 w-3 mr-1" /> Payment
                                        </Badge>
                                      )}
                                    </>
                                  )}
                                  {transaction.type === 'invoice' && transaction.paymentStatus === 'completed' && (
                                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs ml-1">
                                      ✓ Paid
                                    </Badge>
                                  )}
                                  {transaction.type === 'invoice' && transaction.paymentStatus === 'partial' && (
                                    <Badge className="bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 text-xs ml-1">
                                      ◐ Partial
                                    </Badge>
                                  )}
                                  {transaction.type === 'invoice' && transaction.paymentStatus === 'pending' && (
                                    <Badge className="bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-900/30 dark:text-rose-400 text-xs ml-1">
                                      ○ Pending
                                    </Badge>
                                  )}
                                  {transaction.type === 'invoice' && transaction.paymentStatus !== 'completed' && effectiveBalance < 0 && (
                                    <Badge className="bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] ml-1">
                                      ⚡ Advance available
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">
                                {transaction.reference}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {transaction.type === 'return' && transaction.status === 'pending' ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-orange-500 font-medium">
                                      ₹{(transaction.amount || transaction.credit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                                      Pending CN
                                    </span>
                                    <span className="text-xs text-gray-400 italic">
                                      Not yet usable as Credit Note
                                    </span>
                                  </div>
                                ) : transaction.type === 'return' && transaction.status === 'adjusted' ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-green-600 font-medium">
                                      ₹{(transaction.amount || transaction.credit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                      CN Used
                                    </span>
                                  </div>
                                ) : transaction.type === 'adv_refund' || transaction.type === 'cn_refund' || transaction.type === 'refund' ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                      ↩ Refund paid to customer
                                    </span>
                                    <span className="text-muted-foreground">{cleanDescription(transaction.description || "")}</span>
                                  </div>
                                ) : (
                                  <div className="text-muted-foreground">{cleanDescription(transaction.description || "")}</div>
                                )}
                                {transaction.paymentBreakdown && (
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {transaction.paymentBreakdown.cash !== undefined && transaction.paymentBreakdown.cash > 0 && (
                                      <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                                        Cash: ₹{transaction.paymentBreakdown.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.card !== undefined && transaction.paymentBreakdown.card > 0 && (
                                      <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                        Card: ₹{transaction.paymentBreakdown.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.upi !== undefined && transaction.paymentBreakdown.upi > 0 && (
                                      <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                                        UPI: ₹{transaction.paymentBreakdown.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.cashReceived != null &&
                                      transaction.paymentBreakdown.cashReceived > 0 && (
                                      <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                                        Received: ₹{transaction.paymentBreakdown.cashReceived.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.settlementDiscount != null &&
                                      transaction.paymentBreakdown.settlementDiscount > 0 && (
                                      <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300">
                                        Discount: ₹{transaction.paymentBreakdown.settlementDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                        {transaction.paymentBreakdown.discountReason
                                          ? ` (${transaction.paymentBreakdown.discountReason})`
                                          : ""}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.method && (
                                      <Badge variant="outline" className="text-xs">
                                        {transaction.paymentBreakdown.method.toUpperCase()}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {(() => {
                                const dispDebit = transaction.displayDebit ?? transaction.debit;
                                if (!dispDebit || dispDebit <= 0) return null;
                                const receivable = transaction.debit || 0;
                                const cnOnBill = transaction.saleReturnAdjustApplied || 0;
                                return (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className={cn(
                                      "text-red-600 dark:text-red-400",
                                      transaction.informational && "italic font-normal"
                                    )}>
                                      ₹{dispDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                    </span>
                                    {transaction.type === "invoice" &&
                                      cnOnBill > 0 &&
                                      receivable < dispDebit && (
                                      <span className="text-[10px] text-amber-700 dark:text-amber-400 tabular-nums">
                                        Receivable ₹{receivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                        {" "}(−₹{cnOnBill.toLocaleString("en-IN")} CN)
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {(() => {
                                const dispCredit = transaction.displayCredit ?? transaction.credit;
                                if (!dispCredit || dispCredit <= 0) return null;
                                return (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className={cn(
                                      "text-emerald-700 dark:text-emerald-300 font-semibold",
                                      transaction.informational && "italic font-normal"
                                    )}>
                                      ₹{dispCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                    </span>
                                    {transaction.type === "payment" &&
                                      (transaction.paymentBreakdown?.settlementDiscount || 0) > 0 && (
                                      <span className="text-[10px] text-muted-foreground tabular-nums">
                                        Rec. ₹{(transaction.paymentBreakdown?.cashReceived ?? 0).toLocaleString("en-IN")}
                                        {" · "}
                                        Disc. ₹{transaction.paymentBreakdown!.settlementDiscount!.toLocaleString("en-IN")}
                                      </span>
                                    )}
                                    {cardDrill === "advance_balance" &&
                                      transaction.type === "advance" &&
                                      (transaction.advanceRemaining || 0) > 0 && (
                                      <span className="text-[10px] text-teal-700 dark:text-teal-400 tabular-nums">
                                        Remaining ₹{(transaction.advanceRemaining || 0).toLocaleString("en-IN")}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              {transaction.type === 'advance_application' && transaction.credit === 0 && (transaction.appliedAmount || 0) > 0 && (
                                <span className="text-xs italic text-muted-foreground">
                                  (₹{(transaction.appliedAmount || 0).toLocaleString("en-IN")} applied)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className={`font-semibold text-sm ${transaction.balance > 0 ? "text-red-600" : transaction.balance < 0 ? "text-green-700" : "text-slate-500"}`}>
                                  ₹{Math.abs(Math.round(transaction.balance)).toLocaleString("en-IN")}
                                </span>
                                {transaction.balance > 0 && <Badge variant="destructive" className="text-[9px] h-4 px-1">Dr</Badge>}
                                {transaction.balance < 0 && <Badge className="text-[9px] h-4 px-1 bg-green-100 text-green-800 border border-green-300">Cr</Badge>}
                                {transaction.balance === 0 && <Badge variant="outline" className="text-[9px] h-4 px-1">Settled</Badge>}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {/* Column totals — bookkeeping check, NOT what the customer owes. */}
                      {!ledgerLoading && ledgerRows.length > 0 && (
                        <>
                          <TableRow className="bg-slate-50 dark:bg-slate-900/40 border-t border-slate-300 dark:border-slate-600">
                            <TableCell colSpan={4} className="text-right text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
                              Column totals (Dr / Cr)
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-muted-foreground tabular-nums">
                              ₹{transactionTotals.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-muted-foreground tabular-nums">
                              ₹{transactionTotals.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-muted-foreground tabular-nums">
                              ₹{Math.abs(
                                Math.round(transactionTotals.totalDebit - transactionTotals.totalCredit),
                              ).toLocaleString("en-IN")}{" "}
                              {transactionTotals.totalDebit - transactionTotals.totalCredit >= 0 ? "Dr" : "Cr"} gap
                              <span className="block text-[10px] normal-case font-normal">(memo rows excluded)</span>
                            </TableCell>
                          </TableRow>
                          <TableRow className="bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-50">
                            <TableCell colSpan={7} className="py-1 text-[11px] leading-snug text-muted-foreground">
                              Column totals include advance receipts and refunds. See Balance Reconciliation below for what the customer owes.
                              {" · "}
                              Rows marked <span className="font-medium">[Memo]</span> (advance / credit-note applications) are shown for
                              tracing only and are excluded from the Dr / Cr columns.
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Balance Reconciliation Box — derived from rendered transactions */}
                {!ledgerLoading && ledgerRows.length > 0 && (
                  <div className="mt-4 rounded-md border bg-muted/30 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                      Balance Reconciliation
                    </div>
                    {(() => {
                      const confirmedReturns = ledgerRows
                        .filter((t) => t.type === 'return' && t.status === 'adjusted')
                        .reduce((sum, t) => sum + ((t.displayCredit ?? t.amount ?? t.credit) || 0), 0);
                      const pendingReturns = ledgerRows
                        .filter((t) => t.type === 'return' && t.status === 'pending')
                        .reduce((sum, t) => sum + ((t.displayCredit ?? t.amount ?? t.credit) || 0), 0);
                      const pendingRemaining = ledgerRows
                        .filter((t) => t.type === 'return' && t.status === 'pending')
                        .reduce((sum, t) => sum + (t.credit || 0), 0);
                      const cashPaid = reconciliation.paymentsCash;
                      const settlementDiscount = reconciliation.paymentsDiscount;
                      const cnOnInvoices = reconciliation.invoiceCnApplied;
                      const advanceAdjusted = reconciliation.advanceApplied;
                      const advanceRefunded = reconciliation.advanceRefunded;
                      const cnRefunded = reconciliation.cnRefunded;
                      // Same arithmetic as printed settlement lines (not last-row running balance).
                      const outstanding = reconciliation.invoiceOutstanding;
                      const unusedAdvance = Math.max(0, Math.round(ledgerDerivedStats?.advanceBalance ?? 0));
                      // Unclamped advance-pool position: received − applied − refunded.
                      const poolUnclamped = Math.round(
                        (reconciliation.advanceCredit || 0) -
                          (reconciliation.advanceApplied || 0) -
                          (reconciliation.advanceRefunded || 0),
                      );
                      const poolIsFloored = poolUnclamped < unusedAdvance - 0.5;
                      const netPosition = Math.round(outstanding - unusedAdvance);
                      return (
                    <div className="space-y-1.5 text-sm tabular-nums max-w-md">
                      <div className="flex justify-between">
                        <span>Opening Balance</span>
                        <span className="font-medium">₹{Math.round(reconciliation.opening).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>(+) Total Invoiced</span>
                        <span className="font-medium">₹{Math.round(reconciliation.grossInvoiced).toLocaleString("en-IN")}</span>
                      </div>
                      {cnOnInvoices > 0 && (
                        <div className="flex justify-between text-amber-700 dark:text-amber-400">
                          <span>(−) CN / S/R Applied on Invoices</span>
                          <span className="font-medium">₹{Math.round(cnOnInvoices).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-green-700 dark:text-green-400">
                        <span>(−) Sale Returns (Confirmed)</span>
                        <span className="font-medium">₹{Math.round(confirmedReturns).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-orange-600 dark:text-orange-400">
                        <span>(−) Sale Returns (Pending CN)</span>
                        <span className="font-medium">₹{Math.round(pendingReturns).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="text-[11px] text-orange-500 -mt-1">
                        {pendingRemaining > 0 && pendingRemaining < pendingReturns - 0.5
                          ? `Gross return — ₹${Math.round(pendingRemaining).toLocaleString("en-IN")} still available to adjust`
                          : "Pending — awaiting adjustment"}
                      </div>
                      <div className="flex justify-between border-t pt-1.5">
                        <span className="font-semibold">(=) Net Invoiced</span>
                        <span className="font-semibold">₹{Math.round(reconciliation.netInvoiced).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                        <span>(−) Cash / UPI / Card Received</span>
                        <span className="font-medium">₹{Math.round(cashPaid).toLocaleString("en-IN")}</span>
                      </div>
                      {settlementDiscount > 0 && (
                        <div className="flex justify-between text-amber-700 dark:text-amber-400">
                          <span>(−) Settlement Discount</span>
                          <span className="font-medium">₹{Math.round(settlementDiscount).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {advanceAdjusted > 0 && (
                        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                          <span>(−) Advance Adjusted</span>
                          <span className="font-medium">₹{Math.round(advanceAdjusted).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {cnRefunded > 0 && (
                        <div className="flex justify-between text-rose-700 dark:text-rose-400">
                          <span>(+) Refunds paid to customer</span>
                          <span className="font-medium">₹{Math.round(cnRefunded).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {reconciliation.adjustments !== 0 && (
                        <div className="flex justify-between">
                          <span>(±) Balance Adjustments</span>
                          <span className="font-medium">₹{Math.round(reconciliation.adjustments).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className={cn(
                        "flex justify-between border-t-2 pt-2 mt-2 text-base font-bold",
                        outstanding > 0 ? "text-red-600 dark:text-red-400" :
                        outstanding < 0 ? "text-emerald-700 dark:text-emerald-300" :
                        "text-foreground"
                      )}>
                        <span>Outstanding ({outstanding > 0 ? 'Dr' : outstanding < 0 ? 'Cr' : 'Nil'})</span>
                        <span>₹{Math.abs(Math.round(outstanding)).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-teal-700 dark:text-teal-400 font-medium">
                        <span>(−) Unused Advance</span>
                        <span>₹{unusedAdvance.toLocaleString("en-IN")}</span>
                      </div>
                      <div className={cn(
                        "flex justify-between border-t pt-1.5 text-base font-bold",
                        netPosition > 0 ? "text-red-600 dark:text-red-400" :
                        netPosition < 0 ? "text-emerald-700 dark:text-emerald-300" :
                        "text-foreground"
                      )}>
                        <span>(=) Net Position ({netPosition > 0 ? 'Dr' : netPosition < 0 ? 'Cr' : 'Nil'})</span>
                        <span>₹{Math.abs(netPosition).toLocaleString("en-IN")}</span>
                      </div>
                      {poolIsFloored && (
                        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
                          Unused Advance is floored at the per-booking residual (₹{unusedAdvance.toLocaleString("en-IN")}).
                          Unclamped advance pool (received − applied − refunded) is
                          {" "}₹{poolUnclamped.toLocaleString("en-IN")} — a shortfall of
                          {" "}₹{Math.abs(unusedAdvance - poolUnclamped).toLocaleString("en-IN")} needs review.
                        </div>
                      )}
                      {advanceRefunded > 0 && (
                        <div className="flex justify-between text-muted-foreground pt-1 text-xs">
                          <span>Advance refunded out to customer (not in Outstanding)</span>
                          <span className="font-medium">₹{Math.round(advanceRefunded).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                    </div>
                      );
                    })()}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments">
                {/* Payment Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                  <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground mb-1">Cash Received</div>
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        ₹{paymentSummary.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-muted-foreground">{paymentSummary.count} payments</div>
                    </CardContent>
                  </Card>
                  {paymentSummary.discount > 0 && (
                    <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                      <CardContent className="p-3">
                        <div className="text-xs text-muted-foreground mb-1">Settlement Discount</div>
                        <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
                          ₹{paymentSummary.discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Banknote className="h-3 w-3" /> Cash
                      </div>
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        ₹{paymentSummary.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <CreditCard className="h-3 w-3" /> Card
                      </div>
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        ₹{paymentSummary.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Wallet className="h-3 w-3" /> UPI
                      </div>
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                        ₹{paymentSummary.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                    <CardContent className="p-3">
                      <div className="text-xs text-muted-foreground mb-1">Recorded Separately</div>
                      <div className="text-lg font-bold">
                        ₹{(paymentSummary.total - paymentSummary.cash - paymentSummary.card - paymentSummary.upi).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className={accountsHistoryTableWrapClass}>
                  <Table className={accountsHistoryTableClass}>
                    <TableHeader className="!static">
                      <TableRow>
                        <TableHead className={accountsHistoryThClass}>Date</TableHead>
                        <TableHead className={accountsHistoryThClass}>Voucher No.</TableHead>
                        <TableHead className={accountsHistoryThClass}>Invoice No.</TableHead>
                        <TableHead className={accountsHistoryThClass}>Invoice Amount</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Cash</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Card</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>UPI</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Received</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Discount</TableHead>
                        <TableHead className={cn(accountsHistoryThClass, "text-right")}>Settlement</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!paymentHistory || paymentHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            No payment history found
                          </TableCell>
                        </TableRow>
                      ) : (
                        paymentHistory.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {format(new Date(payment.date), "dd MMM yyyy")}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {payment.voucherNumber !== '-' ? (
                                <Badge className="bg-primary/10 text-primary border-primary/20 font-mono text-xs">
                                  {payment.voucherNumber}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">At Sale</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{payment.invoiceNumber}</TableCell>
                            <TableCell>
                              ₹{payment.invoiceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.cash > 0 && (
                                <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                                  ₹{payment.cash.toLocaleString("en-IN")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.card > 0 && (
                                <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                  ₹{payment.card.toLocaleString("en-IN")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.upi > 0 && (
                                <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                                  ₹{payment.upi.toLocaleString("en-IN")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-green-700 dark:text-green-400">
                              ₹{payment.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right text-amber-700 dark:text-amber-400">
                              {(payment.settlementDiscount || 0) > 0
                                ? `₹${payment.settlementDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600 dark:text-green-400">
                              ₹{(payment.totalSettlement ?? payment.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {paymentHistory && paymentHistory.length > 0 && (
                        <TableRow className={ledgerTableTotalsRowClass}>
                          <TableCell
                            colSpan={3}
                            className="text-right text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400"
                          >
                            Total
                          </TableCell>
                          <TableCell className="font-bold tabular-nums">
                            ₹{paymentSummary.invoiceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-bold text-green-700 dark:text-green-400 tabular-nums">
                            ₹{paymentSummary.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                            ₹{paymentSummary.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-bold text-purple-700 dark:text-purple-400 tabular-nums">
                            ₹{paymentSummary.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-bold text-green-700 dark:text-green-400 tabular-nums">
                            ₹{paymentSummary.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                            ₹{paymentSummary.discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-bold text-green-600 dark:text-green-400 tabular-nums">
                            ₹{paymentSummary.settlementTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="unapplied">
                {(() => {
                  // Find payments not linked to any specific invoice (reference_type='customer' or unlinked)
                  const unappliedPayments = (paymentHistory || []).filter(p => 
                    p.source === 'opening_balance' || p.invoiceNumber === 'Opening Balance'
                  );
                  
                  // Also find voucher entries with reference_type='customer' (opening balance payments)
                  const unappliedVouchers = ledgerRows.filter(t => 
                    t.type === 'payment' && t.credit > 0 && 
                    (t.description?.includes('Opening balance') || t.description?.includes('Opening Balance'))
                  );

                  // Find invoices with advance available but showing as pending
                  const pendingInvoicesWithAdvance = ledgerRows.filter(t => 
                    t.type === 'invoice' && t.debit > 0 && t.id !== 'opening-balance' && 
                    t.paymentStatus !== 'completed'
                  );

                  const hasAdvanceBalance = effectiveBalance < 0;
                  const advanceAmount = hasAdvanceBalance ? Math.abs(effectiveBalance) : 0;

                  return (
                    <div className="space-y-4">
                      <div className="pending-cn-section">
                        <h3 className="text-sm font-semibold text-orange-600 mb-2">
                          Pending Credit Notes
                        </h3>
                        <p className="text-xs text-muted-foreground mb-2">
                          Not yet in Accounts CN balance — use Sale Returns → Adjust Credit Note (creates the official CN on first apply) or Accounts → Customer Payment.
                        </p>
                        {pendingSaleReturns.map((sr) => (
                          <div key={sr.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-lg mb-2">
                            <div>
                              <p className="text-sm font-medium">
                                {sr.reference} — ₹{sr.amount.toLocaleString('en-IN')}
                              </p>
                              <p className="text-xs text-gray-500">{sr.description}</p>
                            </div>
                            <button
                              onClick={() => handleApplyToInvoice(sr)}
                              className="text-xs bg-orange-500 text-white px-3 py-1 rounded-full hover:bg-orange-600"
                            >
                              Apply to Invoice
                            </button>
                          </div>
                        ))}
                        {pendingSaleReturns.length === 0 && (
                          <p className="text-sm text-gray-400">No pending credit notes</p>
                        )}
                        {pendingSaleReturns.length > 0 && (
                          <p className="text-sm font-bold text-orange-700 dark:text-orange-400 text-right mt-2 pt-2 border-t border-orange-200">
                            Total pending CN: ₹
                            {pendingSaleReturns
                              .reduce((s, sr) => s + (sr.amount || 0), 0)
                              .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>

                      {/* Advance balance warning */}
                      {hasAdvanceBalance && pendingInvoicesWithAdvance.length > 0 && (
                        <div className="p-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-amber-900 dark:text-amber-100">
                                Advance Balance: ₹{Math.round(advanceAmount).toLocaleString('en-IN')} — {pendingInvoicesWithAdvance.length} invoice(s) pending
                              </p>
                              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                This customer has advance balance that can be allocated to pending invoices. Go to Accounts → Customer Payment to apply.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Unapplied opening balance payments */}
                      {unappliedPayments.length > 0 ? (
                        <div className={accountsHistoryTableWrapClass}>
                          <Table className={accountsHistoryTableClass}>
                            <TableHeader className="!static">
                              <TableRow className="bg-muted/40">
                                <TableHead className="text-xs font-bold uppercase">Date</TableHead>
                                <TableHead className="text-xs font-bold uppercase">Reference</TableHead>
                                <TableHead className="text-xs font-bold uppercase">Description</TableHead>
                                <TableHead className="text-right text-xs font-bold uppercase">Amount</TableHead>
                                <TableHead className="text-xs font-bold uppercase">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {unappliedPayments.map(payment => (
                                <TableRow key={payment.id}>
                                  <TableCell className="text-sm">{format(new Date(payment.date), 'dd MMM yyyy')}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="font-mono text-xs">{payment.voucherNumber}</Badge>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{payment.description}</TableCell>
                                  <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                                    ₹{payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className="bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                                      Not Linked to Invoice
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                              <LedgerTableTotalsFooter
                                labelColSpan={3}
                                amount={unappliedPayments.reduce((s, p) => s + (p.amount || 0), 0)}
                                amountClassName="text-emerald-600 dark:text-emerald-400"
                                trailingColSpan={1}
                              />
                            </TableBody>
                          </Table>
                        </div>
                      ) : !hasAdvanceBalance ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-30" />
                          <p className="font-medium">No unapplied payments</p>
                          <p className="text-xs mt-1">All payments are linked to specific invoices ✅</p>
                        </div>
                      ) : null}

                      {/* Pending invoices that could use advance */}
                      {pendingInvoicesWithAdvance.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Pending Invoices — Advance Available
                          </h4>
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/40">
                                  <TableHead className="text-xs font-bold uppercase">Date</TableHead>
                                  <TableHead className="text-xs font-bold uppercase">Invoice</TableHead>
                                  <TableHead className="text-right text-xs font-bold uppercase">Amount</TableHead>
                                  <TableHead className="text-xs font-bold uppercase">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pendingInvoicesWithAdvance.map(inv => (
                                  <TableRow key={inv.id}>
                                    <TableCell className="text-sm">{format(new Date(inv.date), 'dd MMM yyyy')}</TableCell>
                                    <TableCell>
                                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{inv.reference}</span>
                                    </TableCell>
                                    <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
                                      ₹{Math.round(inv.debit).toLocaleString('en-IN')}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1.5">
                                        <Badge variant={inv.paymentStatus === 'partial' ? 'secondary' : 'destructive'} className="text-xs">
                                          {inv.paymentStatus === 'partial' ? 'Partial' : 'Pending'}
                                        </Badge>
                                        {hasAdvanceBalance && (
                                          <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                                            Advance available
                                          </Badge>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <LedgerTableTotalsFooter
                                  labelColSpan={2}
                                  amount={pendingInvoicesWithAdvance.reduce((s, inv) => s + Math.round(inv.debit || 0), 0)}
                                  amountClassName="text-red-600 dark:text-red-400"
                                  trailingColSpan={1}
                                />
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </TabsContent>

              {!isSchool && (
                <>
                  <TabsContent value="advance-adjusted" className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Total applied (period)</div>
                          <div className="text-lg font-bold text-teal-700 dark:text-teal-400">
                            ₹{advanceAllocSummary.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Invoices touched</div>
                          <div className="text-lg font-bold">{advanceAllocSummary.invoiceCount}</div>
                          <div className="text-xs text-muted-foreground">Distinct sale</div>
                        </CardContent>
                      </Card>
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Voucher date range</div>
                          <div className="text-sm font-medium leading-snug">
                            {startDate ? format(startDate, "dd MMM yyyy") : "All"} — {endDate ? format(endDate, "dd MMM yyyy") : "Today"}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <div className={accountsHistoryTableWrapClass}>
                      <Table className={accountsHistoryTableClass}>
                        <TableHeader className="!static">
                          <TableRow className="bg-slate-50 dark:bg-slate-900/60 border-b-2">
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 w-[110px]">Date</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Voucher no.</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoice no.</TableHead>
                            <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-teal-600">Amount</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 min-w-[120px]">Description</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {advanceCnAllocPending ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                                <Loader2 className="h-6 w-6 animate-spin inline align-middle mr-2 text-primary" />
                                Loading…
                              </TableCell>
                            </TableRow>
                          ) : advanceAllocRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                No advance adjustments in this period
                              </TableCell>
                            </TableRow>
                          ) : (
                            advanceAllocRows.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="text-sm tabular-nums whitespace-nowrap">
                                  {row.voucher_date ? format(new Date(`${row.voucher_date}T12:00:00`), "dd MMM yyyy") : "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-mono text-xs bg-primary/5">
                                    {row.voucher_number}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{row.sale_number}</TableCell>
                                <TableCell className="text-right font-medium text-teal-700 dark:text-teal-400">
                                  ₹{row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground max-w-[280px]">
                                  {row.description.length > 64 ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-default line-clamp-2">{row.description.slice(0, 64)}…</span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-sm">
                                        <p className="text-xs whitespace-pre-wrap">{row.description}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    row.description || "—"
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                          {advanceAllocRows.length > 0 && (
                            <LedgerTableTotalsFooter
                              labelColSpan={3}
                              amount={advanceAllocSummary.total}
                              amountClassName="text-teal-700 dark:text-teal-400"
                              trailingColSpan={1}
                            />
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-sm text-muted-foreground border-t pt-3">
                      Unused advance (bookings):{" "}
                      <span className="font-semibold text-foreground">
                        ₹{(selectedCustomer.unusedAdvanceTotal ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  </TabsContent>

                  <TabsContent value="cn-adjusted" className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Total applied (period)</div>
                          <div className="text-lg font-bold text-purple-700 dark:text-purple-400">
                            ₹{cnAllocSummary.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Invoices touched</div>
                          <div className="text-lg font-bold">{cnAllocSummary.invoiceCount}</div>
                          <div className="text-xs text-muted-foreground">Distinct sale</div>
                        </CardContent>
                      </Card>
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Voucher date range</div>
                          <div className="text-sm font-medium leading-snug">
                            {startDate ? format(startDate, "dd MMM yyyy") : "All"} — {endDate ? format(endDate, "dd MMM yyyy") : "Today"}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <div className={accountsHistoryTableWrapClass}>
                      <Table className={accountsHistoryTableClass}>
                        <TableHeader className="!static">
                          <TableRow className="bg-slate-50 dark:bg-slate-900/60 border-b-2">
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 w-[110px]">Date</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Voucher no.</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoice no.</TableHead>
                            <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-purple-600">Amount</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 min-w-[120px]">Description</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {advanceCnAllocPending ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                                <Loader2 className="h-6 w-6 animate-spin inline align-middle mr-2 text-primary" />
                                Loading…
                              </TableCell>
                            </TableRow>
                          ) : cnAllocRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                No credit note adjustments in this period
                              </TableCell>
                            </TableRow>
                          ) : (
                            cnAllocRows.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="text-sm tabular-nums whitespace-nowrap">
                                  {row.voucher_date ? format(new Date(`${row.voucher_date}T12:00:00`), "dd MMM yyyy") : "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-mono text-xs bg-primary/5">
                                    {row.voucher_number}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{row.sale_number}</TableCell>
                                <TableCell className="text-right font-medium text-purple-700 dark:text-purple-400">
                                  ₹{row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground max-w-[280px]">
                                  {row.description.length > 64 ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-default line-clamp-2">{row.description.slice(0, 64)}…</span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-sm">
                                        <p className="text-xs whitespace-pre-wrap">{row.description}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    row.description || "—"
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                          {cnAllocRows.length > 0 && (
                            <LedgerTableTotalsFooter
                              labelColSpan={3}
                              amount={cnAllocSummary.total}
                              amountClassName="text-purple-700 dark:text-purple-400"
                              trailingColSpan={1}
                            />
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-sm text-muted-foreground border-t pt-3">
                      CN available:{" "}
                      <span className="font-semibold text-foreground">
                        ₹{cnAvailable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  </TabsContent>

                  <TabsContent value="cn-refund" className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Total refunded (period)</div>
                          <div className="text-lg font-bold text-rose-700 dark:text-rose-400">
                            ₹{cnRefundSummary.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Sale returns</div>
                          <div className="text-lg font-bold">{cnRefundSummary.returnCount}</div>
                          <div className="text-xs text-muted-foreground">With RF voucher</div>
                        </CardContent>
                      </Card>
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Voucher date range</div>
                          <div className="text-sm font-medium leading-snug">
                            {startDate ? format(startDate, "dd MMM yyyy") : "All"} — {endDate ? format(endDate, "dd MMM yyyy") : "Today"}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <div className={accountsHistoryTableWrapClass}>
                      <Table className={accountsHistoryTableClass}>
                        <TableHeader className="!static">
                          <TableRow className="bg-slate-50 dark:bg-slate-900/60 border-b-2">
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 w-[110px]">Date</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">RF voucher</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Sale return</TableHead>
                            <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-rose-600">Amount</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Mode</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 min-w-[120px]">Description</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cnRefundPending ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                                <Loader2 className="h-6 w-6 animate-spin inline align-middle mr-2 text-primary" />
                                Loading…
                              </TableCell>
                            </TableRow>
                          ) : cnRefundRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                No CN refunds in this period
                              </TableCell>
                            </TableRow>
                          ) : (
                            cnRefundRows.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="text-sm tabular-nums whitespace-nowrap">
                                  {row.voucher_date
                                    ? format(new Date(`${row.voucher_date}T12:00:00`), "dd MMM yyyy")
                                    : "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-mono text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200">
                                    {row.voucher_number}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{row.return_number}</TableCell>
                                <TableCell className="text-right font-medium text-rose-700 dark:text-rose-400">
                                  ₹{row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-sm uppercase">{row.payment_method}</TableCell>
                                <TableCell className="text-sm text-muted-foreground max-w-[280px]">
                                  {row.description.length > 64 ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-default line-clamp-2">{row.description.slice(0, 64)}…</span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-sm">
                                        <p className="text-xs whitespace-pre-wrap">{row.description}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    row.description || "—"
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                          {cnRefundRows.length > 0 && (
                            <LedgerTableTotalsFooter
                              labelColSpan={3}
                              amount={cnRefundSummary.total}
                              amountClassName="text-rose-700 dark:text-rose-400"
                              trailingColSpan={2}
                            />
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-sm text-muted-foreground border-t pt-3">
                      Refunds are stored as <span className="font-mono text-xs">voucher_entries</span> (payment / CN refund) and appear in Transactions with tag{" "}
                      <span className="font-semibold text-rose-700 dark:text-rose-400">CN.Refund</span>.
                    </p>
                  </TabsContent>

                  <TabsContent value="adv-refund" className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Total refunded (period)</div>
                          <div className="text-lg font-bold text-red-700 dark:text-red-400">
                            ₹{advRefundSummary.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Advance bookings</div>
                          <div className="text-lg font-bold">{advRefundSummary.advanceCount}</div>
                          <div className="text-xs text-muted-foreground">With ARF voucher</div>
                        </CardContent>
                      </Card>
                      <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                        <CardContent className="p-3">
                          <div className="text-xs text-muted-foreground mb-1">Refund date range</div>
                          <div className="text-sm font-medium leading-snug">
                            {startDate ? format(startDate, "dd MMM yyyy") : "All"} — {endDate ? format(endDate, "dd MMM yyyy") : "Today"}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <div className={accountsHistoryTableWrapClass}>
                      <Table className={accountsHistoryTableClass}>
                        <TableHeader className="!static">
                          <TableRow className="bg-slate-50 dark:bg-slate-900/60 border-b-2">
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 w-[110px]">Date</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">ARF voucher</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Advance No</TableHead>
                            <TableHead className="text-right text-xs font-bold uppercase tracking-wide text-red-600">Amount</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500">Mode</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 min-w-[100px]">Reason</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wide text-slate-500 w-[90px]">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {advRefundPending ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                                <Loader2 className="h-6 w-6 animate-spin inline align-middle mr-2 text-primary" />
                                Loading…
                              </TableCell>
                            </TableRow>
                          ) : advRefundRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                No advance refunds in this period
                              </TableCell>
                            </TableRow>
                          ) : (
                            advRefundRows.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="text-sm tabular-nums whitespace-nowrap">
                                  {row.refund_date
                                    ? format(new Date(`${row.refund_date}T12:00:00`), "dd MMM yyyy")
                                    : "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-mono text-xs bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-red-200">
                                    {row.refund_number}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{row.advance_number}</TableCell>
                                <TableCell className="text-right font-medium text-red-700 dark:text-red-400">
                                  ₹{row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-sm uppercase">{row.payment_method}</TableCell>
                                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                                  {row.reason || "—"}
                                </TableCell>
                                <TableCell>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-destructive hover:text-destructive"
                                        disabled={deleteAdvRefundMutation.isPending}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete advance refund?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This removes {row.refund_number} (₹{row.amount.toLocaleString("en-IN")}) and restores the advance balance. Use only for refunds recorded by mistake.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          onClick={() => deleteAdvRefundMutation.mutate(row.id)}
                                        >
                                          Delete refund
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                          {advRefundRows.length > 0 && (
                            <LedgerTableTotalsFooter
                              labelColSpan={3}
                              amount={advRefundSummary.total}
                              amountClassName="text-red-700 dark:text-red-400"
                              trailingColSpan={3}
                            />
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-sm text-muted-foreground border-t pt-3">
                      Advance refunds use voucher series <span className="font-mono text-xs">ARF/YY-YY/N</span> and appear in Transactions with tag{" "}
                      <span className="font-semibold text-red-700 dark:text-red-400">Adv. Refund</span>.
                      Record new refunds from <span className="font-semibold">Advance Booking</span>.
                    </p>
                  </TabsContent>
                </>
              )}
            </Tabs>
            </TooltipProvider>
          </CardContent>
        </Card>
      </div>
    );

    return (
      <>
        {embeddedA4Layout ? (
          <div className="customer-ledger-a4-sheet h-full min-h-0 overflow-y-auto overflow-x-hidden">
            {ledgerBody}
          </div>
        ) : (
          ledgerBody
        )}
        {overpaymentRefundDialog}
      </>
    );
  }

  if (embedMode && !selectedCustomer) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-[12rem] text-muted-foreground gap-2 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm">Loading customer details…</span>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 ${isSchool ? "" : "lg:grid-cols-4"} gap-2`}>
        <Card
          className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-blue-500 to-blue-600"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/80">
                  {isSchool ? "Total Students" : "Total Customers"}
                </p>
                <div className="text-2xl font-black text-white tabular-nums mt-0.5">
                  {isSchool ? (
                    kpiCardsLoading ? (
                      <Skeleton className="h-8 w-16 bg-white/30" />
                    ) : (
                      summary.totalCustomers
                    )
                  ) : facetCardsLoading ? (
                    <Skeleton className="h-8 w-16 bg-white/30" />
                  ) : (
                    summary.totalCustomers
                  )}
                </div>
                <p className="text-xs text-white/65 mt-0.5 truncate">
                  {isSchool ? "Active student accounts" : "All parties, including settled"}
                </p>
              </div>
              <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-red-500 to-red-600"
          onClick={() => setPaymentStatusFilter("outstanding")}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/80">
                  {isSchool ? "Total Fees Due" : "Total Outstanding"}
                </p>
                <div className="text-2xl font-black text-white tabular-nums mt-0.5">
                  {facetCardsLoading ? (
                    <Skeleton className="h-8 w-28 bg-white/30" />
                  ) : (
                    <>₹{(summary.totalOutstanding ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</>
                  )}
                </div>
                    <p className="text-xs text-white/65 mt-0.5 truncate">
                      {isSchool
                        ? "Fees pending collection"
                        : "Gross — advance on the same party is not netted"}
                    </p>
              </div>
              <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                <AlertCircle className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600"
          onClick={() => setPaymentStatusFilter(isSchool ? "all" : "advance")}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/80">
                  {isSchool ? "Total Fees Charged" : "Total Credit (Cr)"}
                </p>
                <div className="text-2xl font-black text-white tabular-nums mt-0.5">
                  {isSchool ? (
                    kpiCardsLoading ? (
                      <Skeleton className="h-8 w-28 bg-white/30" />
                    ) : (
                      <>₹{(summary.totalReceivable ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</>
                    )
                  ) : facetCardsLoading ? (
                    <Skeleton className="h-8 w-28 bg-white/30" />
                  ) : (
                    <>₹{(summary.customerCreditPool ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</>
                  )}
                </div>
                <p className="text-xs text-white/65 mt-0.5 truncate">
                  {isSchool
                    ? "Total fees value"
                    : "Unused advances + invoice credits (CN / overpay)"}
                </p>
              </div>
              <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                {isSchool ? (
                  <TrendingUp className="h-4 w-4 text-white" />
                ) : (
                  <Wallet className="h-4 w-4 text-white" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {!isSchool && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-violet-500 to-violet-600"
              onClick={() => setPaymentStatusFilter("all")}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white/80">Net Receivable</p>
                    <div className="text-2xl font-black text-white tabular-nums mt-0.5">
                      {facetCardsLoading ? (
                        <Skeleton className="h-8 w-28 bg-white/30" />
                      ) : (
                        <>₹{(summary.netReceivable ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</>
                      )}
                    </div>
                    <p className="text-xs text-white/65 mt-0.5 truncate">All parties, including settled</p>
                  </div>
                  <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                    <Scale className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
        )}
      </div>

      {/* Customer List */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-600" />
            {isSchool ? "Student Account Ledger" : "Customer Ledger"}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {isSchool ? "Fee and payment history per student" : "Transaction history per customer"}
          </p>
        </div>
        <div className="p-2 sm:p-3">
          <div className="flex flex-wrap items-center gap-2 mb-3 w-full">
            <div className="relative flex-[2] min-w-[140px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, phone, email, GST, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm border-slate-200"
              />
            </div>
            
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger className="flex-1 min-w-[120px] h-9 text-sm">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="outstanding">{isSchool ? "Pending" : "Outstanding"}</SelectItem>
                <SelectItem value="settled">{isSchool ? "Paid" : "Settled"}</SelectItem>
                <SelectItem value="advance">Advance</SelectItem>
              </SelectContent>
            </Select>

            {isSchool && (
              <Select
                value={selectedAcademicYearId}
                onValueChange={(val) => {
                  setSelectedAcademicYearId(val);
                  if (val === "all") {
                    setStartDate(undefined);
                    setEndDate(undefined);
                  }
                }}
              >
                <SelectTrigger className="flex-1 min-w-[120px] h-9 text-sm">
                  <SelectValue placeholder="Academic Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {(academicYears || []).map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.year_name}{y.is_current ? " (Current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 min-w-[130px] h-9 justify-start text-left font-normal text-sm">
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {startDate ? format(startDate, "dd MMM yyyy") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 min-w-[130px] h-9 justify-start text-left font-normal text-sm">
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {endDate ? format(endDate, "dd MMM yyyy") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {(startDate || endDate || paymentStatusFilter !== "all" || selectedAcademicYearId !== "all") && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                  setPaymentStatusFilter("all");
                  setSelectedAcademicYearId("all");
                }}
                className="h-9 shrink-0"
              >
                Clear
              </Button>
            )}

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-[5.5rem] h-4">
                {isCustomersBackgroundRefresh && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Updating…
                  </>
                )}
              </span>
              <Button variant="outline" size="sm" className="h-9" onClick={handleExportCustomerListExcel}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {isMobile ? "Excel" : "Excel"}
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={handleExportCustomerListPDF}>
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                {isMobile ? "PDF" : "PDF"}
              </Button>
            </div>
          </div>

          {/* Mobile Card View */}
          {isMobile ? (
            <div className="space-y-3">
              {isCustomersInitialLoad ? (
                <div className="text-center text-muted-foreground py-8">
                  Loading customers...
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No customers found
                </div>
              ) : (
                tableCustomers.map((customer) => {
                  const f = facetsFromInvoiceOutstanding(
                    customer.balance,
                    customer.unusedAdvanceTotal || 0,
                  );
                  const status = accountFacetStatus(f);
                  return (
                  <Card 
                    key={customer.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => selectCustomer(customer)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-base">
                            <button
                              className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-semibold text-base"
                              onClick={(e) => {
                                e.stopPropagation();
                                openHistory(customer.id, customer.customer_name);
                              }}
                            >
                              {customer.customer_name}
                            </button>
                          </h3>
                          {customer.phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </div>
                          )}
                        </div>
                        {status === "outstanding" && (
                          <Badge variant="destructive" className="ml-2">Outstanding</Badge>
                        )}
                        {status === "credit" && (
                          <Badge variant="default" className="bg-green-600 ml-2">Credit</Badge>
                        )}
                        {status === "settled" && (
                          <Badge variant="outline" className="ml-2">Settled</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Outstanding</div>
                          <div className="font-medium text-sm tabular-nums text-red-600 dark:text-red-400">
                            ₹{Math.abs(f.outstanding).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Advance</div>
                          <div className="font-medium text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                            ₹{f.unusedAdvance.toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Net</div>
                          <div className={cn(
                            "font-bold text-sm tabular-nums",
                            f.netPosition > 0 ? "text-red-600 dark:text-red-400" :
                            f.netPosition < 0 ? "text-green-600 dark:text-green-400" :
                            "text-foreground"
                          )}>
                            {formatNetFacetLabel(f.netPosition)}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectCustomer(customer);
                          }}
                        >
                          View Ledger
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })
              )}
            </div>
          ) : (
            /* Desktop Table View */
            <div className={accountsHistoryTableWrapClass}>
              <Table className={accountsHistoryTableClass}>
                <TableHeader className="!static">
                  <TableRow>
                    <TableHead className={accountsHistoryThClass}>{isSchool ? "Student Name" : "Customer Name"}</TableHead>
                    <TableHead className={accountsHistoryThClass}>Contact</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>{isSchool ? "Total Fees" : "Total Sales"}</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>{isSchool ? "Fees Paid" : "Total Paid"}</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Outstanding</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Advance</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Net</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-center")}>Status</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isCustomersInitialLoad ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        Loading customers...
                      </TableCell>
                    </TableRow>
                  ) : filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No customers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableCustomers.map((customer) => {
                      const f = facetsFromInvoiceOutstanding(
                        customer.balance,
                        customer.unusedAdvanceTotal || 0,
                      );
                      const status = accountFacetStatus(f);
                      return (
                      <TableRow 
                        key={customer.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => selectCustomer(customer)}
                      >
                        <TableCell className="font-medium">
                          <button
                            className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              openHistory(customer.id, customer.customer_name);
                            }}
                          >
                            {customer.customer_name}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                            {customer.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {customer.phone}
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {customer.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {salesPaidLeaked
                            ? "—"
                            : `₹${customer.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-green-600 dark:text-green-400">
                          {salesPaidLeaked
                            ? "—"
                            : `₹${customer.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-red-600 dark:text-red-400">
                          ₹{Math.abs(f.outstanding).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                          ₹{f.unusedAdvance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-bold tabular-nums",
                          f.netPosition > 0 ? "text-red-600 dark:text-red-400" :
                          f.netPosition < 0 ? "text-green-600 dark:text-green-400" :
                          "text-foreground"
                        )}>
                          {formatNetFacetLabel(f.netPosition)}
                        </TableCell>
                        <TableCell className="text-center">
                          {status === "outstanding" && (
                            <Badge variant="destructive">Outstanding</Badge>
                          )}
                          {status === "credit" && (
                            <Badge variant="default" className="bg-green-600">Credit</Badge>
                          )}
                          {status === "settled" && (
                            <Badge variant="outline">Settled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectCustomer(customer);
                            }}
                          >
                            View Ledger
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-sm text-muted-foreground">
                Showing {customerPage * CUSTOMERS_PER_PAGE + 1}–{Math.min((customerPage + 1) * CUSTOMERS_PER_PAGE, filteredCustomers.length)} of {filteredCustomers.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={customerPage === 0}
                  onClick={() => setCustomerPage(p => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {customerPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={customerPage >= totalPages - 1}
                  onClick={() => setCustomerPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {overpaymentRefundDialog}
    </div>
    </>
  );
}
