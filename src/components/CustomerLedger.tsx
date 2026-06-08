import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient, useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { STALE_DASHBOARD_TAB_RETURN, STALE_FREQUENT, STALE_REFERENCE } from "@/lib/queryStaleTimes";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { fetchItemsGrossBySaleId } from "@/utils/fetchAllRows";
import { useOrgLedgerReferenceFetcher } from "@/hooks/useOrgLedgerReferenceData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Download, Phone, Mail, MapPin, IndianRupee, Calendar, FileText, CalendarIcon, CreditCard, Banknote, Wallet, FileDown, Send, MessageCircle, Users, AlertCircle, AlertTriangle, TrendingUp, BookOpen, Undo2, Loader2, Trash2, Scale } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { accountsHistoryTableClass, accountsHistoryTableWrapClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import * as XLSX from "xlsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useIsMobile } from "@/hooks/use-mobile";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerFinancialSnapshot } from "@/hooks/useCustomerFinancialSnapshot";
import {
  fetchOrganizationReceivableRows,
  receivableRowsToBalanceMap,
} from "@/utils/organizationReceivables";
import {
  computeCustomerOutstanding,
  reconcileSaleInvoiceDisplay,
  splitSaleLinkedReceiptRows,
  type SaleReceiptVoucherSplit,
  type VoucherLedgerRow,
  type SaleReturnLedgerRow,
} from "@/utils/customerBalanceUtils";
import { derivePaidAndStatus } from "@/utils/saleSettlement";
import { computeAuditPeriodOutstanding, fetchCustomerAuditBundle } from "@/utils/customerAuditBundle";
import {
  isCnRefundPaymentVoucher,
  parseSaleReturnRefFromCnRefundDescription,
} from "@/utils/cnRefundVoucher";
import { isAdvanceRefundPaymentVoucher } from "@/utils/advanceRefundVoucher";
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

interface CustomerLedgerProps {
  organizationId: string;
  paymentFilter?: string | null;
  preSelectedCustomerId?: string | null;
  /** When set, persists filters + selected customer for tab/window restore. */
  persistenceWindowId?: string;
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

interface Transaction {
  id: string;
  date: string;
  timestamp: string | null;
  type: 'invoice' | 'payment' | 'advance' | 'advance_application' | 'adjustment' | 'fee' | 'return' | 'refund' | 'adv_refund' | 'cn_refund' | 'credit_note';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  paymentStatus?: string;
  paymentBreakdown?: {
    cash?: number;
    card?: number;
    upi?: number;
    method?: string;
    /** Cash/UPI/card actually received on a receipt voucher (excl. settlement discount). */
    cashReceived?: number;
    settlementDiscount?: number;
    discountReason?: string;
  };
  appliedAmount?: number;
  status?: string;
  amount?: number;
  /** Optional display-only amounts used to show GROSS invoice or informational
   *  offset rows without changing the balance math. When undefined, falls back
   *  to debit/credit. */
  displayDebit?: number;
  displayCredit?: number;
  /** Full bill before CN/S/R applied on this invoice (Sales Dashboard amount). */
  grossBill?: number;
  /** CN/S/R absorbed on this invoice via `sales.sale_return_adjust`. */
  saleReturnAdjustApplied?: number;
  /** Informational/secondary row — rendered with muted styling and EXCLUDED
   *  from the totals row to avoid double-counting. */
  informational?: boolean;
}

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
  persistenceWindowId,
}: CustomerLedgerProps) {
  const [, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const pendingRestoredCustomerIdRef = useRef<string | null>(null);

  const selectCustomer = useCallback(
    (customer: Customer | null) => {
      setSelectedCustomer(customer);
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
    [setSearchParams],
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>(paymentFilter || "all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("transactions");
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
  
  const { fetchCustomers: fetchLedgerCustomers, fetchSalesSummary: fetchLedgerSalesSummary } =
    useOrgLedgerReferenceFetcher();

  const isMobile = useIsMobile();
  const { sendWhatsApp } = useWhatsAppSend();
  const { isSchool } = useSchoolFeatures();
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [customerForHistory, setCustomerForHistory] = useState<{ id: string; name: string } | null>(null);
  const [showOverpaymentRefundDialog, setShowOverpaymentRefundDialog] = useState(false);
  const [overpaymentRefundAmount, setOverpaymentRefundAmount] = useState('');
  const [overpaymentRefundMode, setOverpaymentRefundMode] = useState('cash');
  const [overpaymentRefundNote, setOverpaymentRefundNote] = useState('');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const queryClient = useQueryClient();
  const { balance: authoritativeBalance } = useCustomerBalance(
    isSchool ? null : selectedCustomer?.id || null,
    organizationId || null
  );

  const {
    outstandingDr: snapshotOutstandingDr,
    advanceAvailable: snapshotAdvanceAvailable,
    cnAvailableTotal: snapshotCnAvailable,
  } = useCustomerFinancialSnapshot(
    isSchool ? null : selectedCustomer?.id,
    organizationId || null,
  );

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

  const { data: academicYears = [] } = useQuery({
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
    setCustomerForHistory({ id, name });
    setShowCustomerHistory(true);
  };


  // Sync external filter with internal state
  useEffect(() => {
    if (paymentFilter !== undefined) {
      setPaymentStatusFilter(paymentFilter || "all");
    }
  }, [paymentFilter]);


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

      // --- Business org logic ---
      // Fetch ALL sales using range pagination (bypasses 1000-row limit)
      const salesData = await fetchLedgerSalesSummary(organizationId);
      const itemsGrossBySale = await fetchItemsGrossBySaleId(
        organizationId,
        salesData.map((s: { id: string }) => s.id),
      );

      // Fetch ALL voucher payments (both opening balance and invoice payments)
      const { data: allVouchers, error: voucherError } = await supabase
        .from('voucher_entries')
        .select('reference_id, reference_type, total_amount, discount_amount, voucher_type, description, payment_method')
        .eq('organization_id', organizationId)
        .in('voucher_type', ['receipt', 'payment'])
        .is('deleted_at', null);

      if (voucherError) {
        console.error('Error fetching voucher payments:', voucherError);
      }

      // Fetch ALL balance adjustments
      const { data: allAdjustments, error: adjError } = await supabase
        .from('customer_balance_adjustments')
        .select('customer_id, outstanding_difference')
        .eq('organization_id', organizationId);

      if (adjError) console.error('Error fetching adjustments:', adjError);

      // Build adjustment totals per customer
      const customerAdjustments = new Map<string, number>();
      allAdjustments?.forEach((adj: any) => {
        customerAdjustments.set(adj.customer_id, 
          (customerAdjustments.get(adj.customer_id) || 0) + (adj.outstanding_difference || 0));
      });

      // Fetch ALL unused advances
      const { data: allAdvances, error: advError } = await supabase
        .from('customer_advances')
        .select('id, customer_id, amount, used_amount')
        .eq('organization_id', organizationId)
        .in('status', ['active', 'partially_used']);

      if (advError) console.error('Error fetching advances:', advError);

      // Build unused advance totals per customer
      const customerUnusedAdvances = new Map<string, number>();
      allAdvances?.forEach((adv: any) => {
        const unused = Math.max(0, (adv.amount || 0) - (adv.used_amount || 0));
        if (unused > 0) {
          customerUnusedAdvances.set(adv.customer_id, 
            (customerUnusedAdvances.get(adv.customer_id) || 0) + unused);
        }
      });

      // Fetch advance refunds to reduce unused advance credit
      const advanceIdsAll = allAdvances?.map((a: any) => a.id) || [];
      const customerAdvanceRefunds = new Map<string, number>();
      if (advanceIdsAll.length > 0) {
        const { data: advRefunds } = await supabase
          .from('advance_refunds')
          .select('advance_id, refund_amount')
          .in('advance_id', advanceIdsAll);
        
        // Map advance_id -> customer_id
        const advToCustomer = new Map<string, string>();
        allAdvances?.forEach((a: any) => advToCustomer.set(a.id, a.customer_id));
        
        advRefunds?.forEach((r: any) => {
          const custId = advToCustomer.get(r.advance_id);
          if (custId) {
            customerAdvanceRefunds.set(custId, (customerAdvanceRefunds.get(custId) || 0) + (r.refund_amount || 0));
          }
        });
      }

      // Fetch refund payment vouchers per customer
      const { data: refundVouchers } = await supabase
        .from('voucher_entries')
        .select('reference_id, total_amount, description, payment_method')
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'payment')
        .eq('reference_type', 'customer')
        .is('deleted_at', null);

      const customerRefundsPaid = new Map<string, number>();
      refundVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        // Exclude exchange-refund vouchers (POS refund + round-off). Those refunds
        // settle SR overflow already captured in sale return / ledger math; counting
        // them again would create a phantom debit.
        const desc = (v.description || '').toLowerCase();
        const isExchangeRefund =
          desc.includes('refund paid for pos exchange') ||
          desc.includes('round off adjustment for pos exchange') ||
          v.payment_method === 'round_off';
        if (isExchangeRefund) return;
        customerRefundsPaid.set(v.reference_id, (customerRefundsPaid.get(v.reference_id) || 0) + (v.total_amount || 0));
      });

      // Build sale_id -> customer_id map for routing receipt vouchers to customers
      const saleToCustomerMap = new Map<string, string>();
      salesData.forEach((s: any) => {
        if (s.customer_id) {
          saleToCustomerMap.set(s.id, s.customer_id);
        }
      });

      // Sale returns with credit_status + linked_sale_id (matches computeCustomerOutstanding / useCustomerBalance)
      const { data: allSaleReturns, error: srFetchError } = await supabase
        .from("sale_returns")
        .select("customer_id, net_amount, credit_status, linked_sale_id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null);
      if (srFetchError) console.error("Error fetching sale returns:", srFetchError);

      const saleReturnsByCustomer = new Map<string, SaleReturnLedgerRow[]>();
      (allSaleReturns || []).forEach((sr: any) => {
        if (!sr.customer_id) return;
        const row: SaleReturnLedgerRow = {
          net_amount: sr.net_amount,
          credit_status: sr.credit_status,
          linked_sale_id: sr.linked_sale_id,
        };
        const list = saleReturnsByCustomer.get(sr.customer_id) || [];
        list.push(row);
        saleReturnsByCustomer.set(sr.customer_id, list);
      });

      // Receipt vouchers per customer (sale-linked + customer opening / CN rows)
      const vouchersByCustomer = new Map<string, VoucherLedgerRow[]>();
      customersData.forEach((c: any) => vouchersByCustomer.set(c.id, []));

      (allVouchers || []).forEach((v: any) => {
        if (v.voucher_type !== "receipt" || !v.reference_id) return;
        const row: VoucherLedgerRow = {
          reference_id: v.reference_id,
          reference_type: v.reference_type,
          total_amount: v.total_amount,
          discount_amount: v.discount_amount,
          payment_method: v.payment_method,
          description: v.description,
        };
        const saleCustId = saleToCustomerMap.get(v.reference_id);
        if (saleCustId) {
          vouchersByCustomer.get(saleCustId)?.push(row);
        } else if (v.reference_type === "customer") {
          vouchersByCustomer.get(v.reference_id)?.push(row);
        }
      });

      const advancesByCustomer = new Map<
        string,
        Array<{ id: string; amount: number | null; used_amount: number | null }>
      >();
      allAdvances?.forEach((adv: any) => {
        if (!adv.customer_id || !adv.id) return;
        const list = advancesByCustomer.get(adv.customer_id) || [];
        list.push({
          id: adv.id,
          amount: adv.amount,
          used_amount: adv.used_amount,
        });
        advancesByCustomer.set(adv.customer_id, list);
      });

      // List totals + balance: single source of truth (avoids double-counting CN in
      // sale_returns + sale_return_adjust + voucher paid, which showed phantom Advance).
      const customerTotals = customersData.map((customer: any) => {
        const customerSales = salesData.filter(
          (s: any) =>
            s.customer_id === customer.id &&
            s.payment_status !== "cancelled" &&
            s.payment_status !== "hold"
        );
        const openingBalance = customer.opening_balance || 0;
        const adjustmentTotal = customerAdjustments.get(customer.id) || 0;
        const unusedAdvanceTotal = customerUnusedAdvances.get(customer.id) || 0;
        const advanceRefundTotal = customerAdvanceRefunds.get(customer.id) || 0;
        const effectiveUnusedAdvances = Math.max(0, unusedAdvanceTotal - advanceRefundTotal);
        const refundsPaidTotal = customerRefundsPaid.get(customer.id) || 0;

        const co = computeCustomerOutstanding({
          openingBalance,
          customerId: customer.id,
          sales: customerSales.map((s: any) => ({
            id: s.id,
            net_amount: s.net_amount,
            paid_amount: s.paid_amount,
            cash_amount: s.cash_amount,
            card_amount: s.card_amount,
            upi_amount: s.upi_amount,
            sale_return_adjust: s.sale_return_adjust,
            items_gross: itemsGrossBySale.get(s.id) ?? 0,
          })),
          vouchers: vouchersByCustomer.get(customer.id) || [],
          adjustmentTotal,
          advances: advancesByCustomer.get(customer.id) || [],
          advanceRefundTotal,
          saleReturns: saleReturnsByCustomer.get(customer.id) || [],
          refundsPaidTotal,
        });

        return {
          ...customer,
          opening_balance: Math.round(openingBalance),
          totalSales: co.totalSales,
          totalSalesGross: co.totalSalesGross,
          totalPaid: co.totalPaid,
          balance: co.balance,
          unusedAdvanceTotal: Math.round(effectiveUnusedAdvances),
          totalCashPaid: co.totalCashPaid || 0,
          totalAdvanceApplied: co.totalAdvanceApplied || 0,
          totalCnApplied: co.totalCnApplied || 0,
          adjustmentTotal: co.adjustmentTotal || 0,
        };
      });

      return customerTotals;
    },
    enabled: !!organizationId,
    staleTime: STALE_DASHBOARD_TAB_RETURN,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const isCustomersInitialLoad = isLoading && customers === undefined;
  const isCustomersBackgroundRefresh = isCustomersFetching && !isCustomersInitialLoad;

  /** SQL snapshot balances (batch RPC) — loaded after list so search is not blocked. */
  const businessCustomerIds = useMemo(
    () => (isSchool ? [] : (customers || []).map((c: { id: string }) => c.id).filter(Boolean)),
    [customers, isSchool],
  );

  const { data: snapshotBalanceById } = useQuery({
    // Single source of truth: Master Reconciliation RPC (signed per-customer
    // balance), one call for the whole org. Replaces the get_customer_financial_snapshot
    // path which over-credited advances (drove Balance Sheet AR to ₹0).
    queryKey: ["customer-ledger-reconcile-balances", organizationId, businessCustomerIds.length],
    queryFn: async () => {
      const rows = await fetchOrganizationReceivableRows(organizationId!);
      return receivableRowsToBalanceMap(rows);
    },
    enabled: !!organizationId && !isSchool && businessCustomerIds.length > 0,
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
    gcTime: 10 * 60 * 1000,
  });

  const customersWithBalances = useMemo(() => {
    if (!customers) return undefined;
    if (isSchool || !snapshotBalanceById) return customers;
    return customers.map((row: { id: string; balance: number }) => ({
      ...row,
      balance: snapshotBalanceById[row.id] ?? row.balance,
    }));
  }, [customers, snapshotBalanceById, isSchool]);

  const customersForList = customersWithBalances ?? customers;

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


      // First, get ALL sales for this customer (without date filter) to get all possible reference_ids
      const { data: allCustomerSales, error: allSalesError } = await supabase
        .from("sales")
        .select("id")
        .eq("customer_id", selectedCustomer.id)
        .is("deleted_at", null)
        .neq("payment_status", "hold");

      if (allSalesError) throw allSalesError;

      const allSaleIds = allCustomerSales?.map(s => s.id) || [];

      // Build date filter for displayed sales
      let salesQuery = supabase
        .from("sales")
        .select("*, created_at")
        .eq("customer_id", selectedCustomer.id)
        .is("deleted_at", null)
        .neq("payment_status", "hold")
        .eq("is_cancelled", false);

      // Apply date filters - normalize dates to yyyy-MM-dd format for accurate comparison
      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');
        salesQuery = salesQuery.gte("sale_date", startDateStr);
      }
      if (endDate) {
        const endDateStr = format(endDate, 'yyyy-MM-dd');
        salesQuery = salesQuery.lte("sale_date", endDateStr);
      }

      const { data: salesData, error: salesError } = await salesQuery.order("sale_date", { ascending: true });

      if (salesError) throw salesError;

      // Build voucher query - fetch all payments for ANY of this customer's invoices
      let vouchersQuery = supabase
        .from("voucher_entries")
        .select("*")
        .in("voucher_type", ["receipt", "payment"])
        .is("deleted_at", null)
        .in("reference_id", allSaleIds.length > 0 ? allSaleIds : ['00000000-0000-0000-0000-000000000000']);

      // Apply date filters to vouchers
      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');
        vouchersQuery = vouchersQuery.gte("voucher_date", startDateStr);
      }
      if (endDate) {
        const endDateStr = format(endDate, 'yyyy-MM-dd');
        vouchersQuery = vouchersQuery.lte("voucher_date", endDateStr);
      }

      const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: true });

      if (vouchersError) throw vouchersError;

      // Also fetch opening balance payments (reference_type = 'customer')
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

      const { data: openingBalancePayments, error: openingError } = await openingBalanceQuery.order("voucher_date", { ascending: true });

      if (openingError) throw openingError;

      // Merge invoice payments and opening balance payments
      // Exclude payment-type (refund) vouchers for sale returns — they are already
      // represented by the Sale Return entry with "(Cash Refunded)" label
      let allVouchers = [...(vouchersData || []), ...(openingBalancePayments || [])]
        .filter((v: any) => {
          // Keep all receipt vouchers EXCEPT credit note adjustments linked to sale returns
          if (v.voucher_type === 'receipt') {
            const desc = (v.description || '').toLowerCase();
            // Credit note adjustments are already represented by the Sale Return entry (cn_adjustment)
            if (desc.includes('credit note adjusted') || desc.includes('cn adjusted')) {
              return false;
            }
            return true;
          }
          return true;
        });

      // Fetch customer advances
      let advancesQuery = supabase
        .from("customer_advances")
        .select("*")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId);

      if (startDate) {
        advancesQuery = advancesQuery.gte("advance_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        advancesQuery = advancesQuery.lte("advance_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: advancesData, error: advancesError } = await advancesQuery.order("advance_date", { ascending: true });

      if (advancesError) throw advancesError;

      // Fetch balance adjustments
      let adjustmentsQuery = (supabase as any)
        .from("customer_balance_adjustments")
        .select("*")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId);

      if (startDate) {
        adjustmentsQuery = adjustmentsQuery.gte("adjustment_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        adjustmentsQuery = adjustmentsQuery.lte("adjustment_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: adjustmentsData, error: adjustmentsError } = await adjustmentsQuery.order("created_at", { ascending: true });

      if (adjustmentsError) throw adjustmentsError;

      // Fetch ALL sale returns for this customer (all statuses)
      let saleReturnsQuery = supabase
        .from("sale_returns")
        .select("id, return_number, return_date, net_amount, credit_status, linked_sale_id, refund_type, credit_note_id, created_at")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      if (startDate) {
        saleReturnsQuery = saleReturnsQuery.gte("return_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        saleReturnsQuery = saleReturnsQuery.lte("return_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: saleReturnsData, error: saleReturnsError } = await saleReturnsQuery.order("return_date", { ascending: true });
      if (saleReturnsError) throw saleReturnsError;

      // Include sale-return refund payment vouchers even when they still point to an old/orphan customer_id.
      // We map by return_number mentioned in voucher description.
      const returnNumbers = (saleReturnsData || [])
        .map((sr: any) => String(sr.return_number || "").trim())
        .filter(Boolean);
      if (returnNumbers.length > 0) {
        const orFilter = returnNumbers
          .map((rn: string) => `description.ilike.%${rn.replace(/[%,()]/g, " ")}%`)
          .join(",");
        if (orFilter) {
          const { data: saleReturnRefundVouchers } = await supabase
            .from("voucher_entries")
            .select("*")
            .eq("organization_id", organizationId)
            .eq("voucher_type", "payment")
            .eq("reference_type", "customer")
            .is("deleted_at", null)
            .or(orFilter)
            .order("voucher_date", { ascending: true });

          if (saleReturnRefundVouchers?.length) {
            const byId = new Map<string, any>();
            [...allVouchers, ...saleReturnRefundVouchers].forEach((v: any) => {
              if (v?.id) byId.set(v.id, v);
            });
            allVouchers = Array.from(byId.values());
          }
        }
      }

      // Get linked sale numbers for display
      const linkedSaleIds = (saleReturnsData || []).filter((sr: any) => sr.linked_sale_id).map((sr: any) => sr.linked_sale_id);
      let linkedSaleMap: Record<string, string> = {};
      if (linkedSaleIds.length > 0) {
        const { data: linkedSales } = await supabase
          .from("sales")
          .select("id, sale_number")
          .in("id", linkedSaleIds);
        linkedSales?.forEach((s: any) => { linkedSaleMap[s.id] = s.sale_number; });
      }

      // Build applied-CN map: sale_return_id -> { saleId, saleNumber, applied }[]
      // by reading credit_note_adjustment vouchers that target each linked sale.
      // We sum CN-adjustment voucher amounts per linked_sale_id, and attribute
      // them to the SR that links to that sale. If multiple SRs link to the
      // same sale, applied amount is allocated in chronological order up to
      // each SR's net_amount.
      const cnVoucherBySaleId: Record<string, number> = {};
      (vouchersData || []).forEach((v: any) => {
        if (v.voucher_type !== 'receipt') return;
        const desc = (v.description || '').toLowerCase();
        const isCn = v.payment_method === 'credit_note_adjustment'
          || desc.includes('credit note adjusted')
          || desc.includes('cn adjusted');
        if (!isCn || !v.reference_id) return;
        cnVoucherBySaleId[v.reference_id] =
          (cnVoucherBySaleId[v.reference_id] || 0) + (Number(v.total_amount) || 0);
      });

      // Allocate applied amount per SR (chronological by return_date)
      const srAppliedMap: Record<string, { saleId: string; saleNumber: string | null; applied: number }> = {};
      const remainingBySale: Record<string, number> = { ...cnVoucherBySaleId };
      const sortedSRs = [...(saleReturnsData || [])]
        .filter((sr: any) => sr.linked_sale_id)
        .sort((a: any, b: any) =>
          new Date(a.return_date).getTime() - new Date(b.return_date).getTime()
          || new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      sortedSRs.forEach((sr: any) => {
        const saleId = sr.linked_sale_id;
        const remaining = remainingBySale[saleId] || 0;
        if (remaining <= 0) return;
        const applied = Math.min(remaining, Number(sr.net_amount) || 0);
        srAppliedMap[sr.id] = {
          saleId,
          saleNumber: linkedSaleMap[saleId] || null,
          applied,
        };
        remainingBySale[saleId] = remaining - applied;
      });

      // Pass 2: Distribute any leftover voucher balance to UNLINKED SRs of this
      // customer (chronological). This handles cases where multiple SRs were
      // applied via sales.sale_return_adjust at billing time but only one was
      // recorded with linked_sale_id, leaving the rest "phantom pending".
      const unlinkedSRs = [...(saleReturnsData || [])]
        .filter((sr: any) => !sr.linked_sale_id)
        .sort((a: any, b: any) =>
          new Date(a.return_date).getTime() - new Date(b.return_date).getTime()
          || new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      const saleIdsWithRemainder = Object.keys(remainingBySale).filter(
        (sid) => (remainingBySale[sid] || 0) > 0
      );
      for (const sr of unlinkedSRs) {
        let srRemaining = Number(sr.net_amount) || 0;
        if (srRemaining <= 0) continue;
        for (const sid of saleIdsWithRemainder) {
          const avail = remainingBySale[sid] || 0;
          if (avail <= 0) continue;
          const take = Math.min(avail, srRemaining);
          if (take <= 0) continue;
          // Use first sale we attribute against (most common case is one sale)
          if (!srAppliedMap[sr.id]) {
            srAppliedMap[sr.id] = {
              saleId: sid,
              saleNumber: linkedSaleMap[sid] || null,
              applied: take,
            };
          } else {
            srAppliedMap[sr.id].applied += take;
          }
          remainingBySale[sid] = avail - take;
          srRemaining -= take;
          if (srRemaining <= 0) break;
        }
      }

      // Fetch advance refunds for this customer
      const customerAdvanceIds = (advancesData || []).map((a: any) => a.id);
      let filteredAdvanceRefunds: any[] = [];
      if (customerAdvanceIds.length > 0) {
        filteredAdvanceRefunds = await fetchAdvanceRefundsForAdvances(
          supabase,
          organizationId,
          customerAdvanceIds,
          { includeAdvanceNumber: true },
        );
      }

      // Fetch credit notes for this customer
      let creditNotesQuery = supabase
        .from("credit_notes")
        .select("id, credit_note_number, issue_date, credit_amount, used_amount, status, notes, sale_id, created_at")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId)
        .is("deleted_at", null);

      if (startDate) {
        creditNotesQuery = creditNotesQuery.gte("issue_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        creditNotesQuery = creditNotesQuery.lte("issue_date", format(endDate, 'yyyy-MM-dd') + 'T23:59:59');
      }

      const { data: creditNotesData } = await creditNotesQuery.order("issue_date", { ascending: true });


      // Calculate total voucher payments per sale to exclude from "payment at sale"
      const saleReceiptSplitMap = splitSaleLinkedReceiptRows(
        [...(vouchersData || []), ...(openingBalancePayments || [])]
          .filter((v: any) => v.voucher_type === "receipt")
          .map((v: any) => ({
            reference_id: v.reference_id,
            total_amount: v.total_amount,
            discount_amount: v.discount_amount,
            payment_method: v.payment_method,
            description: v.description,
          })),
      );

      // Align sales.paid_amount / payment_status with receipts (incl. settlement discount)
      for (const sale of salesData || []) {
        const split = saleReceiptSplitMap.get(sale.id);
        if (!split) continue;
        const { paidAmount, paymentStatus } = derivePaidAndStatus({
          netAmount: Number(sale.net_amount || 0),
          saleReturnAdjust: Number(sale.sale_return_adjust || 0),
          cashReceived: split.cash,
          advanceApplied: split.adv,
          cnApplied: split.cn,
          discountGiven: split.discount,
        });
        const prevPaid = Number(sale.paid_amount || 0);
        const prevStatus = String(sale.payment_status || "");
        if (
          Math.abs(prevPaid - paidAmount) > 0.009 ||
          prevStatus !== paymentStatus
        ) {
          sale.paid_amount = paidAmount;
          sale.payment_status = paymentStatus;
          void supabase
            .from("sales")
            .update({ paid_amount: paidAmount, payment_status: paymentStatus })
            .eq("id", sale.id)
            .eq("organization_id", organizationId);
        }
      }

      // Combine and sort transactions
      const allTransactions: Transaction[] = [];

      // When a date filter is active, compute the balance brought forward
      // from all transactions BEFORE startDate so the running balance starts correctly.
      let effectiveOpeningBalance = selectedCustomer.opening_balance || 0;

      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');

        // Sales prior to startDate
        const { data: priorSales } = await supabase
          .from('sales')
          .select('id, net_amount, paid_amount, sale_return_adjust, payment_status, is_cancelled')
          .eq('customer_id', selectedCustomer.id)
          .is('deleted_at', null)
          .neq('payment_status', 'hold')
          .eq('is_cancelled', false)
          .lt('sale_date', startDateStr);

        const priorSaleIds = (priorSales || []).map((s: any) => s.id);

        if (priorSaleIds.length > 0) {
          const { data: priorVouchers } = await supabase
            .from('voucher_entries')
            .select('reference_id, total_amount, payment_method, description')
            .in('reference_id', priorSaleIds)
            .eq('voucher_type', 'receipt')
            .is('deleted_at', null);

          const priorCashVouchers: Record<string, number> = {};
          (priorVouchers || []).forEach((v: any) => {
            if (v.reference_id)
              priorCashVouchers[v.reference_id] =
                (priorCashVouchers[v.reference_id] || 0) + (v.total_amount || 0);
          });

          (priorSales || []).forEach((sale: any) => {
            const receivable = Math.max(
              0,
              Number(sale.net_amount || 0) - Number(sale.sale_return_adjust || 0),
            );
            effectiveOpeningBalance += receivable;
            const cashVoucher = priorCashVouchers[sale.id] || 0;
            const paidAtSale = Math.max(0, (sale.paid_amount || 0) - cashVoucher);
            effectiveOpeningBalance -= paidAtSale + cashVoucher;
          });
        }

        // Prior advances reduce balance (credit)
        const { data: priorAdv } = await supabase
          .from('customer_advances')
          .select('amount')
          .eq('customer_id', selectedCustomer.id)
          .eq('organization_id', organizationId)
          .lt('advance_date', startDateStr);
        (priorAdv || []).forEach((a: any) => { effectiveOpeningBalance -= a.amount || 0; });

        // Prior actioned sale returns reduce balance
        const { data: priorReturns } = await supabase
          .from('sale_returns')
          .select('net_amount, credit_status')
          .eq('customer_id', selectedCustomer.id)
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .neq('credit_status', 'pending')
          .neq('credit_status', 'adjusted')
          .lt('return_date', startDateStr);
        (priorReturns || []).forEach((sr: any) => { effectiveOpeningBalance -= sr.net_amount || 0; });
      }

      // Start with opening balance (computed B/F when date-filtered)
      const openingBalance = effectiveOpeningBalance;
      let runningBalance = openingBalance;

      // Add opening balance as first entry if it exists
      if (openingBalance !== 0) {
        allTransactions.push({
          id: 'opening-balance',
          date: '1900-01-01',
          timestamp: null,
          type: 'invoice',
          reference: 'Opening',
          description: startDate ? 'Balance B/F (as of filter start date)' : 'Opening Balance (Carried Forward)',
          debit: openingBalance > 0 ? openingBalance : 0,
          credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
          balance: runningBalance,
        });
      }

      // Merge sales, payments, and advances chronologically
      // Build a set of sale IDs that already carry at-sale tender (cash/card/upi).
      // Any "Phase 4 backfill" voucher pointing at those sales is a historical
      // duplicate of the synthesised "Payment at sale" row and must be skipped,
      // otherwise the ledger double-counts the receipt.
      const salesWithAtSaleTender = new Set<string>(
        (salesData || [])
          .filter((s: any) =>
            (Number(s.cash_amount) || 0) +
              (Number(s.card_amount) || 0) +
              (Number(s.upi_amount) || 0) >
            0
          )
          .map((s: any) => s.id)
      );
      const combined = [
        ...salesData.map((sale) => ({
          date: sale.sale_date,
          timestamp: sale.created_at,
          type: 'invoice' as const,
          data: sale,
        })),
        // Include all vouchers including advance-application entries
        ...allVouchers
          .filter((voucher: any) => {
            const desc = String(voucher.description || '');
            if (!desc.toLowerCase().startsWith('phase 4 backfill')) return true;
            // Drop the backfill duplicate when the linked sale already
            // accounts for the tender via cash/card/upi columns.
            return !(voucher.reference_id && salesWithAtSaleTender.has(voucher.reference_id));
          })
          .map((voucher: any) => ({
            date: voucher.voucher_date,
            timestamp: voucher.created_at,
            type: (
              voucher.payment_method === 'advance_adjustment' ||
              voucher.payment_method === 'credit_note_adjustment' ||
              (voucher.description && (
                voucher.description.toLowerCase().includes('adjusted from advance balance') ||
                voucher.description.toLowerCase().includes('advance adjusted')
              ))
            ) ? 'advance_application' as const : 'payment' as const,
            data: voucher,
          })),
        ...(advancesData || []).map((advance) => ({
          date: advance.advance_date,
          timestamp: advance.created_at,
          type: 'advance' as const,
          data: advance,
        })),
        ...(adjustmentsData || []).map((adj: any) => ({
          date: adj.adjustment_date,
          timestamp: adj.created_at,
          type: 'adjustment' as const,
          data: adj,
        })),
        ...(saleReturnsData || []).map((sr: any) => ({
          date: sr.return_date,
          timestamp: sr.created_at,
          type: 'cn_adjustment' as const,
          data: { ...sr, linkedSaleNumber: linkedSaleMap[sr.linked_sale_id] || null },
        })),
        ...(filteredAdvanceRefunds || []).map((refund: any) => ({
          date: refund.refund_date,
          timestamp: refund.created_at,
          type: 'adv_refund' as const,
          data: refund,
        })),
        ...(creditNotesData || [])
          .filter((cn: any) => {
            // Skip CNs already represented by a Sale Return row (same ledger amount,
            // would otherwise double-count). Match by SR.credit_note_id (authoritative
            // link) OR by the legacy sale_id heuristic.
            const linkedBySr = (saleReturnsData || []).some(
              (sr: any) => sr.credit_note_id === cn.id
            );
            if (linkedBySr) return false;
            const linkedBySaleId = cn.sale_id && (saleReturnsData || []).some(
              (sr: any) => sr.linked_sale_id === cn.sale_id
            );
            return !linkedBySaleId;
          })
          .map((cn: any) => ({
            date: cn.issue_date ? cn.issue_date.substring(0, 10) : '',
            timestamp: cn.created_at,
            type: 'credit_note' as const,
            data: cn,
          })),
      ].sort((a, b) => {
        const sortMs = (item: (typeof combined)[0]) =>
          item.timestamp ? new Date(item.timestamp).getTime() : new Date(item.date).getTime();
        const tsA = sortMs(a);
        const tsB = sortMs(b);
        if (tsA !== tsB) return tsA - tsB;
        // Same moment: invoice before payment (then other types)
        const typeOrder: Record<string, number> = {
          invoice: 0,
          cn_adjustment: 1,
          advance: 1,
          refund: 1,
          adv_refund: 1,
          cn_refund: 1,
          credit_note: 1,
          advance_application: 1.5,
          payment: 2,
          adjustment: 3,
        };
        return (typeOrder[a.type] ?? 1) - (typeOrder[b.type] ?? 1);
      });

      combined.forEach((item) => {
        if (item.type === 'invoice') {
          const sale = item.data as any;
          const isCancelled = sale.payment_status === 'cancelled';
          const saleReturnAdjust = Number(sale.sale_return_adjust || 0);
          const grossBill = Number(sale.net_amount || 0);
          const isExchangeCoveredByReturn =
            saleReturnAdjust > 0 && grossBill > 0 && saleReturnAdjust >= grossBill;
          // Receivable on this invoice (matches Sales Invoice Dashboard & balance RPC).
          const invoiceDebit = Math.max(0, grossBill - saleReturnAdjust);
          if (!isCancelled) {
            runningBalance += invoiceDebit;
          }
          
          // Build payment breakdown for display
          const paymentBreakdown: any = {};
          if (sale.cash_amount && sale.cash_amount > 0) paymentBreakdown.cash = sale.cash_amount;
          if (sale.card_amount && sale.card_amount > 0) paymentBreakdown.card = sale.card_amount;
          if (sale.upi_amount && sale.upi_amount > 0) paymentBreakdown.upi = sale.upi_amount;

          const split = saleReceiptSplitMap.get(sale.id) ?? {
            cash: 0,
            cn: 0,
            adv: 0,
            discount: 0,
          };
          const recDisplay = reconcileSaleInvoiceDisplay({
            net_amount: sale.net_amount,
            sale_return_adjust: sale.sale_return_adjust,
            paid_amount: sale.paid_amount,
            split,
          });
          const invoiceDescription = `${sale.sale_type === 'pos' ? 'POS' : 'Invoice'} - ${recDisplay.payment_status}`;

          allTransactions.push({
            id: sale.id,
            date: sale.sale_date,
            timestamp: item.timestamp || null,
            type: 'invoice',
            reference: sale.sale_number,
            description: invoiceDescription,
            debit: isCancelled ? 0 : invoiceDebit,
            credit: 0,
            grossBill: isCancelled ? 0 : grossBill,
            saleReturnAdjustApplied: isCancelled ? 0 : saleReturnAdjust,
            displayDebit: isCancelled ? 0 : grossBill > invoiceDebit ? grossBill : invoiceDebit,
            balance: runningBalance,
            paymentStatus: isCancelled ? sale.payment_status : recDisplay.payment_status,
            paymentBreakdown: Object.keys(paymentBreakdown).length > 0 ? paymentBreakdown : undefined,
          });

          if (!isCancelled && saleReturnAdjust > 0) {
            allTransactions.push({
              id: `${sale.id}-cn-applied`,
              date: sale.sale_date,
              timestamp: item.timestamp || null,
              type: 'invoice',
              reference: sale.sale_number,
              description: `↳ CN / S/R adjusted on ${sale.sale_number} (pending CN applied to bill)`,
              debit: 0,
              credit: 0,
              displayDebit: 0,
              displayCredit: saleReturnAdjust,
              balance: runningBalance,
              informational: true,
            });
          }

          // Skip payment processing for cancelled invoices
          if (isCancelled) return;

          // "Payment at sale" = the actual tender captured on the bill itself
          // (cash + card + UPI). We deliberately do NOT derive this from
          // `sale.paid_amount - voucherPayments` because legacy data drift
          // can leave `paid_amount` inflated above real receipts, which
          // would synthesise a phantom credit row here and over-state the
          // payments column. Voucher receipts are still rendered as their
          // own separate rows from `allVouchers` below.
          const paidAtSale = isExchangeCoveredByReturn
            ? 0
            : Math.max(
                0,
                Number(sale.cash_amount || 0) +
                  Number(sale.card_amount || 0) +
                  Number(sale.upi_amount || 0),
              );
          
          if (paidAtSale > 0) {
            runningBalance -= paidAtSale;
            
            // Build payment description with breakdown
            const paymentParts: string[] = [];
            if (sale.cash_amount > 0) paymentParts.push(`Cash: ₹${sale.cash_amount.toLocaleString('en-IN')}`);
            if (sale.card_amount > 0) paymentParts.push(`Card: ₹${sale.card_amount.toLocaleString('en-IN')}`);
            if (sale.upi_amount > 0) paymentParts.push(`UPI: ₹${sale.upi_amount.toLocaleString('en-IN')}`);
            
            allTransactions.push({
              id: `${sale.id}-payment-at-sale`,
              date: sale.sale_date,
              timestamp: item.timestamp || null,
              type: 'payment',
              reference: sale.sale_number,
              description: `Payment at sale${paymentParts.length > 0 ? ' - ' + paymentParts.join(', ') : ''}`,
              debit: 0,
              credit: paidAtSale,
              balance: runningBalance,
              paymentBreakdown: {
                cash: sale.cash_amount || 0,
                card: sale.card_amount || 0,
                upi: sale.upi_amount || 0,
              },
            });
          }

          // ── Refund outflow row ────────────────────────────────────────
          // For invoices saved with refund_amount > 0 (negative-net Mix
          // refund where cash was paid OUT of the drawer to the customer),
          // record an offsetting DEBIT so the customer balance doesn't
          // double-count the SR credit. Detected via negative cash/upi/card
          // (set by POSSales handleMixPaymentSave) — falls back to
          // refund_amount for legacy data with mode=cash.
          const refundAmt = Number(sale.refund_amount) || 0;
          if (refundAmt > 0) {
            const negCash = sale.cash_amount < 0 ? Math.abs(sale.cash_amount) : 0;
            const negUpi = sale.upi_amount < 0 ? Math.abs(sale.upi_amount) : 0;
            const negCard = sale.card_amount < 0 ? Math.abs(sale.card_amount) : 0;
            const refundOut = negCash + negUpi + negCard || refundAmt;
            const refundParts: string[] = [];
            if (negCash > 0) refundParts.push(`Cash: ₹${negCash.toLocaleString('en-IN')}`);
            if (negUpi > 0) refundParts.push(`UPI: ₹${negUpi.toLocaleString('en-IN')}`);
            if (negCard > 0) refundParts.push(`Bank: ₹${negCard.toLocaleString('en-IN')}`);
            const refundDesc = `Refund paid for ${sale.sale_number}${refundParts.length > 0 ? ' - ' + refundParts.join(', ') : ''}`;
            runningBalance += refundOut;
            allTransactions.push({
              id: `${sale.id}-refund-out`,
              date: sale.sale_date,
              timestamp: item.timestamp || null,
              type: 'refund',
              reference: sale.sale_number,
              description: refundDesc,
              debit: refundOut,
              credit: 0,
              balance: runningBalance,
            });
          }
        } else if (item.type === 'advance') {
          // Handle advance booking entries
          const advance = item.data as any;
          const availableAmount = (advance.amount || 0) - (advance.used_amount || 0);
          
          // Advances reduce the customer's balance (credit)
          runningBalance -= advance.amount;
          
          const paymentMethodText = advance.payment_method 
            ? advance.payment_method.charAt(0).toUpperCase() + advance.payment_method.slice(1)
            : 'Cash';
          
          let description = `Advance Booking - ${paymentMethodText}`;
          if (advance.description) {
            description += ` - ${advance.description}`;
          }
          if (advance.status === 'fully_used') {
            description += ' — Fully Applied to Invoice(s)';
          } else if (advance.used_amount > 0) {
            description += ` — Partially Applied (₹${advance.used_amount.toLocaleString('en-IN')} used, ₹${availableAmount.toLocaleString('en-IN')} remaining)`;
          } else {
            description += ' — Available for Invoice Settlement';
          }
          
          allTransactions.push({
            id: advance.id,
            date: advance.advance_date,
            timestamp: item.timestamp || null,
            type: 'advance',
            reference: advance.advance_number,
            description: description,
            debit: 0,
            credit: advance.amount,
            balance: runningBalance,
            paymentBreakdown: advance.payment_method ? { method: advance.payment_method } : undefined,
          });
        } else if (item.type === 'advance_application') {
          // Advance or CN applied to invoice: memo-only — does not change running balance
          // or Dr/Cr totals (advance booking + invoices already reflect economics).
          const voucher = item.data as any;
          const amount = Number(voucher.total_amount) || 0;
          const isCnApply = voucher.payment_method === 'credit_note_adjustment';

          // Resolve linked invoice number from reference_id when possible,
          // otherwise fall back to parsing the voucher description.
          let linkedSaleNumber = '';
          if (voucher.reference_id) {
            const linkedSale = (salesData || []).find((s: any) => s.id === voucher.reference_id);
            if (linkedSale) linkedSaleNumber = linkedSale.sale_number;
          }
          if (!linkedSaleNumber) {
            linkedSaleNumber = voucher.description?.replace('Adjusted from advance balance for ', '') || '';
          }

          const memo = ` [Memo only — ₹${amount.toLocaleString("en-IN")} excluded from Dr/Cr totals]`;
          const description = isCnApply
            ? linkedSaleNumber
              ? cleanDescription(`Credit note applied to ${linkedSaleNumber}${memo}`)
              : cleanDescription(`Credit note applied${memo}`)
            : linkedSaleNumber
              ? cleanDescription(`Advance applied to ${linkedSaleNumber}${memo}`)
              : cleanDescription(`Advance applied${memo}`);

          allTransactions.push({
            id: voucher.id,
            date: voucher.voucher_date,
            timestamp: item.timestamp || null,
            type: 'advance_application',
            reference: voucher.voucher_number || 'ADV-APP',
            description,
            debit: 0,
            credit: 0,
            balance: runningBalance,
            appliedAmount: amount,
            status: 'applied',
          });
        } else if (item.type === 'adjustment') {
          const adj = item.data as any;
          const outDiff = adj.outstanding_difference || 0;
          const advDiff = adj.advance_difference || 0;
          // When advance is reduced (advDiff < 0), show as debit (advance credit reversed)
          // When advance is increased (advDiff > 0), skip here (new advance record handles it)
          const advanceConsumed = advDiff < 0 ? Math.abs(advDiff) : 0;
          const netDebit = (outDiff > 0 ? outDiff : 0) + advanceConsumed;
          const netCredit = outDiff < 0 ? Math.abs(outDiff) : 0;
          runningBalance += netDebit - netCredit;
          
          let adjDescription = `Balance Adjustment: ${adj.reason}`;
          if (advanceConsumed > 0) {
            adjDescription += ` (Advance Refund: ₹${advanceConsumed.toLocaleString('en-IN')})`;
          }
          
          allTransactions.push({
            id: adj.id,
            date: adj.adjustment_date,
            timestamp: item.timestamp || null,
            type: 'adjustment',
            reference: 'ADJ',
            description: adjDescription,
            debit: netDebit,
            credit: netCredit,
            balance: runningBalance,
          });
        } else if (item.type === 'cn_adjustment') {
          const sr = item.data as any;
          const amount = Number(sr.net_amount || 0);
          const appliedInfo = srAppliedMap[sr.id];
          const appliedAmount = appliedInfo?.applied || 0;
          const linkedSaleId = String(sr.linked_sale_id || "").trim();
          const linkedSale = linkedSaleId
            ? (salesData || []).find((s: any) => String(s.id) === linkedSaleId)
            : null;
          const absorbedOnInvoice = linkedSale
            ? Math.min(amount, Number(linkedSale.sale_return_adjust || 0))
            : 0;
          const unusedAmount = Math.max(0, amount - appliedAmount);
          const balanceCredit = Math.max(0, amount - absorbedOnInvoice);

          // Skip SRs fully absorbed on a linked invoice via sales.sale_return_adjust
          // (pending CN applied on Sales Dashboard — same as buildAuditRows / balance RPC).
          if (String(sr.credit_status || '').toLowerCase() === 'adjusted' && linkedSaleId) {
            return;
          }
          if (balanceCredit <= 0 && absorbedOnInvoice > 0) {
            allTransactions.push({
              id: `cn-memo-${sr.id}`,
              date: sr.return_date,
              timestamp: item.timestamp || null,
              type: 'return' as const,
              reference: sr.return_number,
              description: `Sale Return applied to ${sr.linkedSaleNumber || linkedSale?.sale_number || 'invoice'} via CN — ₹${absorbedOnInvoice.toLocaleString('en-IN')}`,
              debit: 0,
              credit: 0,
              displayCredit: absorbedOnInvoice,
              balance: runningBalance,
              status: 'adjusted',
              amount: absorbedOnInvoice,
              informational: true,
            });
            return;
          }

          if (amount > 0 && balanceCredit > 0) {
            runningBalance -= balanceCredit;

            let status: string;
            if (absorbedOnInvoice > 0 && balanceCredit <= 0) status = 'Fully Adjusted';
            else if (appliedAmount > 0 && unusedAmount === 0) status = 'Fully Adjusted';
            else if (appliedAmount > 0 && unusedAmount > 0)
              status = `Partial — ₹${unusedAmount.toLocaleString('en-IN')} pending`;
            else if (sr.credit_status === 'refunded') status = 'Cash Refunded';
            else if (sr.credit_status === 'adjusted_outstanding') status = 'Adjusted to Outstanding';
            else if (sr.credit_status === 'adjusted' && sr.linkedSaleNumber)
              status = `Adjusted via CN against ${sr.linkedSaleNumber}`;
            else status = 'Pending';

            const appliedSummary = appliedAmount > 0 && appliedInfo?.saleNumber
              ? ` — ₹${appliedAmount.toLocaleString('en-IN')} applied to ${appliedInfo.saleNumber}`
              : '';
            const absorbedSummary =
              absorbedOnInvoice > 0 && balanceCredit > 0
                ? ` (₹${absorbedOnInvoice.toLocaleString('en-IN')} on invoice, ₹${balanceCredit.toLocaleString('en-IN')} pending)`
                : "";

            const desc = `Sale Return [${status}]${appliedSummary}${absorbedSummary}`;
            const srStatus: "pending" | "adjusted" =
              balanceCredit > 0 &&
              (/\bPending\b/i.test(status) || /Partial.*pending/i.test(status))
                ? "pending"
                : "adjusted";

            allTransactions.push({
              id: `cn-${sr.id}`,
              date: sr.return_date,
              timestamp: item.timestamp || null,
              type: 'return' as const,
              reference: sr.return_number,
              description: desc,
              debit: 0,
              credit: balanceCredit,
              displayCredit: amount,
              balance: runningBalance,
              status: srStatus,
              amount: balanceCredit,
            });
          }
        } else if (item.type === 'adv_refund') {
          const refund = item.data as any;
          const amount = refund.refund_amount || 0;
          runningBalance += amount;

          const methodText = refund.payment_method
            ? refund.payment_method.charAt(0).toUpperCase() + refund.payment_method.slice(1)
            : 'Cash';
          let description = `Advance Refund - ${methodText}`;
          if (refund.reason) description += ` (${refund.reason})`;
          const advanceNo =
            refund.customer_advances?.advance_number ||
            (refund.advance_id ? String(refund.advance_id).slice(0, 8) : "");

          allTransactions.push({
            id: `adv-refund-${refund.id}`,
            date: refund.refund_date,
            timestamp: refund.created_at || null,
            type: 'adv_refund',
            reference: refund.refund_number || 'ARF',
            description: advanceNo ? `${description} · ${advanceNo}` : description,
            debit: amount,
            credit: 0,
            balance: runningBalance,
          });
        } else if (item.type === 'credit_note') {
          const cn = item.data as any;
          const amount = cn.credit_amount || 0;
          runningBalance -= amount;

          const usedText = cn.used_amount > 0
            ? ` (Used: ₹${cn.used_amount.toLocaleString('en-IN')}, Remaining: ₹${(amount - cn.used_amount).toLocaleString('en-IN')})`
            : '';

          allTransactions.push({
            id: `cn-${cn.id}`,
            date: cn.issue_date ? cn.issue_date.substring(0, 10) : '',
            timestamp: cn.created_at || null,
            type: 'credit_note',
            reference: cn.credit_note_number,
            description: `Credit Note${cn.notes ? ` - ${cn.notes}` : ''}${usedText}`,
            debit: 0,
            credit: amount,
            balance: runningBalance,
          });
        } else {
          const voucher = item.data as any;
          const cashReceived = Number(voucher.total_amount) || 0;
          const discountAmount = Number(voucher.discount_amount) || 0;
          const totalCredit = cashReceived + discountAmount;
          if (voucher.voucher_type === 'payment' && voucher.reference_type === 'customer') {
            if (isAdvanceRefundPaymentVoucher(voucher)) {
              return;
            }
            runningBalance += totalCredit;
            const cnRefund = isCnRefundPaymentVoucher(voucher);
            allTransactions.push({
              id: voucher.id,
              date: voucher.voucher_date,
              timestamp: item.timestamp || null,
              type: cnRefund ? 'cn_refund' : 'refund',
              reference: voucher.voucher_number,
              description: cleanDescription(voucher.description || 'Payment / refund paid to customer'),
              debit: totalCredit,
              credit: 0,
              balance: runningBalance,
              paymentBreakdown: voucher.payment_method ? { method: voucher.payment_method } : undefined,
            });
            return;
          }
          runningBalance -= totalCredit;
          
          // Determine if this is an opening balance payment or invoice payment
          const isOpeningBalancePayment = voucher.reference_type === 'customer';
          const relatedSale = !isOpeningBalancePayment ? salesData.find(s => s.id === voucher.reference_id) : null;
          const invoiceRef = relatedSale ? ` - for ${relatedSale.sale_number}` : '';
          
          let description = isOpeningBalancePayment
            ? (voucher.description || 'Opening balance payment')
            : (voucher.description || 'Payment received') + invoiceRef;
          if (discountAmount > 0) {
            description += ` — Received ₹${cashReceived.toLocaleString('en-IN')}, settlement discount ₹${discountAmount.toLocaleString('en-IN')}`;
            if (voucher.discount_reason) {
              description += ` (${voucher.discount_reason})`;
            }
          }

          const receiptMethod =
            voucher.payment_method || voucher.metadata?.paymentMethod || undefined;
          allTransactions.push({
            id: voucher.id,
            date: voucher.voucher_date,
            timestamp: item.timestamp || null,
            type: 'payment',
            reference: voucher.voucher_number,
            description: cleanDescription(description),
            debit: 0,
            credit: totalCredit,
            balance: runningBalance,
            paymentBreakdown:
              discountAmount > 0 || receiptMethod
                ? {
                    method: receiptMethod,
                    cashReceived: cashReceived > 0 ? cashReceived : undefined,
                    settlementDiscount: discountAmount > 0 ? discountAmount : undefined,
                    discountReason: voucher.discount_reason || undefined,
                  }
                : undefined,
          });
        }
      });

      // FIX 1 — Suppress "ghost" adjustment rows that have no debit, no credit
      // and leave the running balance unchanged. They clutter the ledger
      // without conveying any information.
      const cleanedTransactions = allTransactions.filter((t, i, arr) => {
        if (
          t.type === 'adjustment' &&
          (t.debit || 0) === 0 &&
          (t.credit || 0) === 0 &&
          i > 0 &&
          t.balance === arr[i - 1].balance
        ) {
          return false;
        }
        return true;
      });

      return cleanedTransactions;
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

      // Calculate total voucher payments per sale to exclude from "payment at sale"
      const voucherPaymentsBySaleId: Record<string, number> = {};
      vouchersData?.forEach((voucher) => {
        if (voucher.reference_id) {
          const settled =
            (Number(voucher.total_amount) || 0) + (Number(voucher.discount_amount) || 0);
          voucherPaymentsBySaleId[voucher.reference_id] =
            (voucherPaymentsBySaleId[voucher.reference_id] || 0) + settled;
        }
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

      // Add payments made at time of sale (exclude amounts paid via vouchers)
      customerSales?.forEach((sale) => {
        const totalPaidOnSale = sale.paid_amount || 0;
        const voucherPayments = voucherPaymentsBySaleId[sale.id] || 0;
        const saleReturnAdjust = sale.sale_return_adjust || 0;
        const paidAtSale = Math.max(0, totalPaidOnSale - voucherPayments);
        
        if (paidAtSale > 0) {
          // Check date filter
          if (startDate && new Date(sale.sale_date) < startDate) return;
          if (endDate && new Date(sale.sale_date) > endDate) return;
          
          payments.push({
            id: `${sale.id}-sale-payment`,
            date: sale.sale_date,
            voucherNumber: 'At Sale',
            invoiceNumber: sale.sale_number,
            invoiceAmount: sale.net_amount,
            amount: paidAtSale,
            method: sale.payment_method || 'mixed',
            description: 'Payment at time of sale',
            cash: sale.cash_amount || 0,
            card: sale.card_amount || 0,
            upi: sale.upi_amount || 0,
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
    
    return customersForList.filter((customer) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (
        customer.customer_name.toLowerCase().includes(searchLower) ||
        customer.phone?.toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower)
      );

      // Payment status filter
      let matchesPaymentStatus = true;
      if (paymentStatusFilter === "outstanding") {
        matchesPaymentStatus = customer.balance > 0;
      } else if (paymentStatusFilter === "settled") {
        matchesPaymentStatus = customer.balance === 0;
      } else if (paymentStatusFilter === "advance") {
        matchesPaymentStatus = customer.balance < 0;
      }

      return matchesSearch && matchesPaymentStatus;
    });
  }, [customersForList, searchQuery, paymentStatusFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCustomerPage(0);
  }, [searchQuery, paymentStatusFilter]);

  // Paginated customers
  const paginatedCustomers = useMemo(() => {
    const start = customerPage * CUSTOMERS_PER_PAGE;
    return filteredCustomers.slice(start, start + CUSTOMERS_PER_PAGE);
  }, [filteredCustomers, customerPage]);

  const totalPages = Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE);

  const effectiveBalance = useMemo(() => {
    if (!selectedCustomer) return 0;
    if (isSchool) {
      if (transactions && transactions.length > 0) {
        return Number(transactions[transactions.length - 1].balance || 0);
      }
      return authoritativeBalance;
    }
    const ledgerClosing =
      transactions && transactions.length > 0
        ? Number(transactions[transactions.length - 1].balance || 0)
        : ledgerAuditClosingBalance != null && !Number.isNaN(Number(ledgerAuditClosingBalance))
          ? Number(ledgerAuditClosingBalance)
          : null;
    if (authoritativeBalance < 0) {
      if (ledgerClosing != null && Math.abs(ledgerClosing - authoritativeBalance) <= 1) {
        return ledgerClosing;
      }
      return authoritativeBalance;
    }
    if (ledgerClosing != null) return ledgerClosing;
    return authoritativeBalance;
  }, [selectedCustomer, isSchool, transactions, authoritativeBalance, ledgerAuditClosingBalance]);

  /** Refund banner — net economic refund: min(lifetime Cr, unused advance + CN pool). */
  const refundableCreditBalance = useMemo(() => {
    if (!selectedCustomer || isSchool) return 0;
    const unused =
      snapshotAdvanceAvailable > 0
        ? snapshotAdvanceAvailable
        : selectedCustomer.unusedAdvanceTotal || 0;
    const cn = snapshotCnAvailable || 0;
    const pool = unused + cn;
    const snap =
      snapshotOutstandingDr != null && !Number.isNaN(Number(snapshotOutstandingDr))
        ? Number(snapshotOutstandingDr)
        : null;
    const lifetimeSigned = snap ?? authoritativeBalance;
    if (lifetimeSigned < -0.5) {
      return Math.round(Math.min(pool, Math.abs(lifetimeSigned)));
    }
    const outstandingDr = Math.max(0, lifetimeSigned);
    return Math.round(Math.max(0, pool - outstandingDr));
  }, [
    selectedCustomer,
    isSchool,
    snapshotAdvanceAvailable,
    snapshotCnAvailable,
    snapshotOutstandingDr,
    authoritativeBalance,
    effectiveBalance,
  ]);

  useEffect(() => {
    if (!selectedCustomer && showOverpaymentRefundDialog) {
      setShowOverpaymentRefundDialog(false);
    }
  }, [selectedCustomer, showOverpaymentRefundDialog]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!filteredCustomers)
      return {
        totalCustomers: 0,
        totalOutstanding: 0,
        totalReceivable: 0,
        customerCreditPool: 0,
        netReceivable: 0,
      };

    // balance is the signed Master Reconciliation value: > 0 owes us (Dr),
    // < 0 in credit (advance / overpayment). Surface the credit pool and the
    // true net instead of silently clamping negatives to zero.
    const grossOutstanding = filteredCustomers.reduce((sum, c) => sum + Math.max(0, c.balance), 0);
    const customerCreditPool = filteredCustomers.reduce((sum, c) => sum + Math.max(0, -c.balance), 0);
    return {
      totalCustomers: filteredCustomers.length,
      totalOutstanding: grossOutstanding,
      totalReceivable: filteredCustomers.reduce((sum, c) => sum + c.totalSales, 0),
      customerCreditPool,
      netReceivable: grossOutstanding - customerCreditPool,
    };
  }, [filteredCustomers]);

  // Export customer list to Excel
  const handleExportCustomerListExcel = useCallback(() => {
    if (!filteredCustomers.length) return;
    const rows = filteredCustomers.map((c) => ({
      "Customer Name": c.customer_name,
      "Phone": c.phone || "",
      "Email": c.email || "",
      "Opening Balance": Math.round(c.opening_balance || 0),
      "Total Sales": Math.round(c.totalSales),
      "Total Paid": Math.round(c.totalPaid),
      "Balance": Math.round(c.balance),
      "Status": c.balance > 0 ? "Outstanding" : c.balance < 0 ? "Advance" : "Settled",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger");
    XLSX.writeFile(wb, `Customer_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
    toast.success("Customer ledger exported to Excel");
  }, [filteredCustomers]);

  // Export customer list to PDF
  const handleExportCustomerListPDF = useCallback(() => {
    if (!filteredCustomers.length) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(16);
    doc.text("Customer Ledger Report", 14, 15);
    doc.setFontSize(9);
    doc.text(`Date: ${format(new Date(), "dd/MM/yyyy")}  |  Customers: ${filteredCustomers.length}  |  Outstanding: ₹${Math.round(summary.totalOutstanding).toLocaleString("en-IN")}`, 14, 22);

    const cols = ["#", "Customer Name", "Phone", "Total Sales", "Total Paid", "Balance", "Status"];
    const colWidths = [10, 70, 35, 40, 40, 40, 30];
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

    filteredCustomers.forEach((c, idx) => {
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
      const row = [
        String(idx + 1),
        c.customer_name.substring(0, 35),
        (c.phone || "").substring(0, 15),
        `₹${Math.round(c.totalSales).toLocaleString("en-IN")}`,
        `₹${Math.round(c.totalPaid).toLocaleString("en-IN")}`,
        `₹${Math.round(c.balance).toLocaleString("en-IN")}`,
        c.balance > 0 ? "Outstanding" : c.balance < 0 ? "Advance" : "Settled",
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
  }, [filteredCustomers, summary]);

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

  // Reconciliation summary for the footer box. Numbers are derived directly
  // from the transaction list so they always tally with what the user sees.
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
      adjustments: 0,
      finalBalance: 0,
    };
    if (!transactions || transactions.length === 0) return empty;

    let opening = 0;
    let grossInvoiced = 0;
    let saleReturns = 0;
    let netInvoiced = 0;
    let payments = 0;
    let paymentsCash = 0;
    let paymentsDiscount = 0;
    let invoiceCnApplied = 0;
    let advanceApplied = 0;
    let advanceCredit = 0;
    let adjustments = 0;

    for (const t of transactions) {
      if (t.id === 'opening-balance') {
        opening = (t.debit || 0) - (t.credit || 0);
        continue;
      }
      if (t.informational) continue;
      if (t.type === 'invoice') {
        grossInvoiced += t.grossBill ?? t.displayDebit ?? t.debit ?? 0;
        invoiceCnApplied += t.saleReturnAdjustApplied ?? 0;
      } else if (t.type === 'return') {
        saleReturns += t.credit || 0;
      } else if (t.type === 'payment') {
        const discount = t.paymentBreakdown?.settlementDiscount || 0;
        const cash =
          t.paymentBreakdown?.cashReceived != null
            ? t.paymentBreakdown.cashReceived
            : Math.max(0, (t.credit || 0) - discount);
        paymentsCash += cash;
        paymentsDiscount += discount;
        payments += cash + discount;
      } else if (t.type === 'advance_application') {
        advanceApplied += t.appliedAmount || 0;
      } else if (t.type === 'advance') {
        advanceCredit += t.credit || 0;
      } else if (t.type === 'adjustment') {
        adjustments += (t.debit || 0) - (t.credit || 0);
      }
    }

    const finalBalance = transactions[transactions.length - 1]?.balance ?? 0;
    netInvoiced = grossInvoiced - invoiceCnApplied - saleReturns;
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
      adjustments,
      finalBalance,
    };
  }, [transactions]);

  /** KPI / integrity figures aligned with the rendered transaction list when available. */
  const ledgerDerivedStats = useMemo(() => {
    if (!selectedCustomer || isSchool) return null;
    const hasTxn = (transactions?.length ?? 0) > 0;
    const closingFromRows = hasTxn
      ? Number(transactions![transactions!.length - 1].balance || 0)
      : null;
    return {
      cashPaid: hasTxn && reconciliation.paymentsCash > 0 ? reconciliation.paymentsCash : null,
      closingBalance: closingFromRows,
    };
  }, [selectedCustomer, isSchool, transactions, reconciliation]);

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

  const cnAvailable = useMemo(() => {
    if (!isSchool) {
      return Math.round(snapshotCnAvailable || 0);
    }
    return pendingSaleReturns.reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [isSchool, snapshotCnAvailable, pendingSaleReturns]);

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
      let vq = supabase
        .from("voucher_entries")
        .select("id, voucher_date, voucher_number, reference_id, total_amount, description, payment_method, created_at")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        // Phase 1.2: include mis-tagged customer rows pointing at this customer's sales.
        .in("reference_type", ["sale", "customer"])
        .in("payment_method", ["advance_adjustment", "credit_note_adjustment"])
        .is("deleted_at", null)
        .in("reference_id", saleIds.length > 0 ? saleIds : sentinel);
      if (startDate) vq = vq.gte("voucher_date", format(startDate, "yyyy-MM-dd"));
      if (endDate) vq = vq.lte("voucher_date", format(endDate, "yyyy-MM-dd"));
      const { data: vouchers, error: vErr } = await vq.order("voucher_date", { ascending: true });
      if (vErr) throw vErr;
      const mapRow = (v: any): LedgerAllocationRow => ({
        id: String(v.id),
        voucher_date: String(v.voucher_date || "").slice(0, 10),
        voucher_number: String(v.voucher_number || "").trim() || "—",
        reference_id: String(v.reference_id || ""),
        sale_number: saleNumById.get(String(v.reference_id)) || "—",
        amount: Math.round((Number(v.total_amount) || 0) * 100) / 100,
        description: String(v.description || "").trim(),
      });
      const advanceRows: LedgerAllocationRow[] = [];
      const cnRows: LedgerAllocationRow[] = [];
      for (const v of vouchers || []) {
        const pm = String(v.payment_method || "").toLowerCase();
        if (pm === "advance_adjustment") advanceRows.push(mapRow(v));
        else if (pm === "credit_note_adjustment") cnRows.push(mapRow(v));
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

    let txnSummary = "";
    const billWisePending = pendingInvoices.reduce((sum, t) => sum + t.remaining, 0);
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

  const handleExportToExcel = () => {
    if (!selectedCustomer || !transactions) return;

    const exportData = transactions.map((t) => {
      const dateStr = t.id === 'opening-balance' ? 'Opening' : format(new Date(t.date), "dd/MM/yyyy");
      const timeStr = t.timestamp ? format(new Date(t.timestamp), "hh:mm a") : '';
      const row: any = {
        Date: dateStr,
        Time: timeStr,
        Type: t.type === 'invoice' ? 'Invoice' : t.type === 'return' ? 'Sale Return' : t.type === 'advance' ? 'Advance' : t.type === 'adjustment' ? 'Adjustment' : 'Payment',
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

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger");
    XLSX.writeFile(wb, `${selectedCustomer.customer_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  const handleExportToPDF = () => {
    if (!selectedCustomer || !transactions) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let yPos = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Customer Ledger", pageWidth / 2, yPos, { align: "center" });
    yPos += 10;

    // Customer Info
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(selectedCustomer.customer_name, margin, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (selectedCustomer.phone) {
      doc.text(`Phone: ${selectedCustomer.phone}`, margin, yPos);
      yPos += 5;
    }
    if (selectedCustomer.address) {
      doc.text(`Address: ${selectedCustomer.address}`, margin, yPos);
      yPos += 5;
    }

    // Date range if filtered
    if (startDate || endDate) {
      const dateRange = `Period: ${startDate ? format(startDate, "dd MMM yyyy") : "Beginning"} to ${endDate ? format(endDate, "dd MMM yyyy") : "Today"}`;
      doc.text(dateRange, margin, yPos);
      yPos += 5;
    }

    // Outstanding Balance with Dr/Cr
    doc.setFont("helvetica", "bold");
    const pdfCredit =
      refundableCreditBalance > 0
        ? refundableCreditBalance
        : effectiveBalance < 0
          ? Math.abs(effectiveBalance)
          : 0;
    const hdrBalance =
      pdfCredit > 0
        ? `Credit balance: Rs. ${pdfCredit.toLocaleString("en-IN")} Cr`
        : `Outstanding Balance: Rs. ${effectiveBalance.toLocaleString("en-IN")} Dr`;
    doc.text(hdrBalance, pageWidth - margin, yPos, { align: "right" });
    yPos += 10;

    // Table Headers
    const headers = ["Date & Time", "Type", "Reference", "Description", "Debit", "Credit", "Balance"];
    const colWidths = [28, 16, 22, 48, 22, 22, 22];
    
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPos, pageWidth - margin * 2, 8, "F");
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let xPos = margin;
    headers.forEach((header, i) => {
      doc.text(header, xPos + 1, yPos + 5);
      xPos += colWidths[i];
    });
    yPos += 10;

    // Table Rows
    doc.setFont("helvetica", "normal");
    transactions.forEach((t) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      xPos = margin;
      const dateTimeStr = t.id === 'opening-balance' 
        ? 'Opening' 
        : format(new Date(t.date), "dd/MM/yy") + (t.timestamp ? ' ' + format(new Date(t.timestamp), "hh:mm a") : '');
      const bNum = Math.round(t.balance);
      const bStr = bNum === 0 ? "Rs. 0" : `Rs. ${Math.abs(bNum).toLocaleString("en-IN")} ${bNum < 0 ? "Cr" : "Dr"}`;
      const dispDebit = t.displayDebit ?? t.debit ?? 0;
      const dispCredit = t.displayCredit ?? t.credit ?? 0;
      const desc = t.informational ? `(info) ${t.description}` : t.description;
      const rowData = [
        dateTimeStr,
        t.type === 'invoice' ? 'Invoice' : t.type === 'return' ? 'Sale Return' : t.type === 'advance' ? 'Advance' : t.type === 'advance_application' ? 'Adv Adj' : t.type === 'adjustment' ? 'Adjustment' : 'Payment',
        t.reference,
        desc.length > 28 ? desc.substring(0, 28) + "..." : desc,
        dispDebit > 0 ? `Rs. ${Math.round(dispDebit).toLocaleString("en-IN")}` : "",
        dispCredit > 0 ? `Rs. ${Math.round(dispCredit).toLocaleString("en-IN")}` : "",
        // Informational rows: balance unchanged → suppress to avoid the
        // visual confusion of two consecutive identical balance values.
        t.informational ? '' : bStr,
      ];

      if (t.informational) {
        doc.setFont("helvetica", "italic");
      }
      rowData.forEach((cell, i) => {
        doc.text(cell, xPos + 1, yPos);
        xPos += colWidths[i];
      });
      if (t.informational) {
        doc.setFont("helvetica", "normal");
      }
      yPos += 6;
    });

    // Totals Row
    yPos += 2;
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, yPos - 4, pageWidth - margin * 2, 8, "F");
    
    doc.setFont("helvetica", "bold");
    xPos = margin;
    const totalsData = [
      "",
      "",
      "",
      "TOTAL",
      `Rs. ${Math.round(transactionTotals.totalDebit).toLocaleString("en-IN")}`,
      `Rs. ${Math.round(transactionTotals.totalCredit).toLocaleString("en-IN")}`,
      (() => {
        const closing = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0;
        const n = Math.abs(Math.round(closing));
        const suffix = closing > 0 ? " Dr" : closing < 0 ? " Cr" : "";
        return `Rs. ${n.toLocaleString("en-IN")}${suffix}`;
      })(),
    ];

    totalsData.forEach((cell, i) => {
      doc.text(cell, xPos + 1, yPos);
      xPos += colWidths[i];
    });

    // Reconciliation block
    yPos += 12;
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Balance Reconciliation", margin, yPos);
    yPos += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
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
    if (reconciliation.advanceCredit > 0) {
      reconLines.push(["(-) Advance Received", -reconciliation.advanceCredit]);
    }
    if (reconciliation.adjustments !== 0) {
      reconLines.push(["(+/-) Balance Adjustments", reconciliation.adjustments]);
    }
    const labelX = margin + 4;
    const valueX = margin + 90;
    reconLines.forEach(([label, val]) => {
      doc.text(label, labelX, yPos);
      const sign = val < 0 ? "-" : "";
      doc.text(`${sign}Rs. ${Math.abs(Math.round(val)).toLocaleString("en-IN")}`, valueX, yPos, { align: "left" });
      yPos += 5;
    });
    doc.setFont("helvetica", "bold");
    const finalLabel = reconciliation.finalBalance > 0 ? "Outstanding (Dr)" : reconciliation.finalBalance < 0 ? "Advance (Cr)" : "Settled";
    doc.text(finalLabel, labelX, yPos + 1);
    doc.text(`Rs. ${Math.abs(Math.round(reconciliation.finalBalance)).toLocaleString("en-IN")}`, valueX, yPos + 1);
    yPos += 8;

    // Footer
    yPos += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, margin, yPos);

    if (!isSchool && (advanceAllocRows.length > 0 || cnAllocRows.length > 0)) {
      doc.addPage();
      yPos = 18;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Advance & credit note applied to invoices", margin, yPos);
      yPos += 6;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
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
        doc.text(sectionTitle, margin, yPos);
        yPos += 5;
        doc.setFontSize(7);
        const h = ["Date", "Voucher", "Invoice", "Amount", "Description"];
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPos - 3, pageWidth - margin * 2, 6, "F");
        let x = margin;
        h.forEach((label, i) => {
          doc.text(label, x + 1, yPos + 1);
          x += allocCols[i];
        });
        yPos += 7;
        doc.setFont("helvetica", "normal");
        rows.forEach((r) => {
          if (yPos > 278) {
            doc.addPage();
            yPos = 18;
          }
          const dStr = r.voucher_date ? format(new Date(`${r.voucher_date}T12:00:00`), "dd/MM/yy") : "—";
          const desc = r.description.length > 55 ? `${r.description.slice(0, 52)}...` : r.description;
          const cells = [
            dStr,
            r.voucher_number,
            r.sale_number,
            `Rs. ${r.amount.toLocaleString("en-IN")}`,
            desc || "—",
          ];
          x = margin;
          cells.forEach((cell, i) => {
            doc.text(String(cell), x + 1, yPos);
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
      const advFoot = `Unused advance (bookings): Rs. ${(selectedCustomer.unusedAdvanceTotal ?? 0).toLocaleString("en-IN")}`;
      const cnFoot = `CN available (notes): Rs. ${cnAvailable.toLocaleString("en-IN")}`;
      if (yPos > 272) {
        doc.addPage();
        yPos = 18;
      }
      doc.text(advFoot, margin, yPos);
      yPos += 4;
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
                    payment_method: overpaymentRefundMode,
                    description: overpaymentRefundNote || `Overpayment refund to ${selectedCustomer.customer_name}`,
                    created_by: user?.id || null,
                  });
                if (error) throw error;
                toast.success(`Refund of ₹${amount.toLocaleString('en-IN')} recorded successfully`);
                setShowOverpaymentRefundDialog(false);
                setOverpaymentRefundAmount('');
                setOverpaymentRefundNote('');
                queryClient.invalidateQueries({ queryKey: ['customer-ledger-audit-closing'] });
                queryClient.invalidateQueries({ queryKey: ['customer-balance'] });
                queryClient.invalidateQueries({ queryKey: ['customer-transactions'] });
                queryClient.invalidateQueries({ queryKey: ['customers-with-balance'] });
                queryClient.invalidateQueries({ queryKey: ['useCustomerBalance'] });
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
    const ledgerRows = transactions ?? [];
    const ledgerLoading = transactionsPending && transactions === undefined;
    const isLedgerBackgroundRefresh = isTransactionsFetching && !ledgerLoading;

    return (
      <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            onClick={() => {
              setShowOverpaymentRefundDialog(false);
              selectCustomer(null);
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
          
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
                  : "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              )}>
                <div className="text-sm text-muted-foreground mb-1">
                  {effectiveBalance > 0 ? "Outstanding (Dr)" : "Balance"}
                </div>
                <div className={cn(
                  "text-3xl font-bold tabular-nums",
                  effectiveBalance > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
                )}>
                  ₹{Math.abs(effectiveBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div className="mt-2">
                  {effectiveBalance > 0 ? (
                    <Badge variant="destructive">Customer Owes</Badge>
                  ) : (
                    <Badge variant="outline">Fully Settled</Badge>
                  )}
                </div>
                {snapshotOutstandingDr != null &&
                  !isSchool &&
                  (() => {
                    const ledgerBalance =
                      ledgerDerivedStats?.closingBalance ?? authoritativeBalance;
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
                        {Math.abs(
                          ledgerDerivedStats?.closingBalance ?? authoritativeBalance,
                        ).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        {(ledgerDerivedStats?.closingBalance ?? authoritativeBalance) >= 0
                          ? "Dr"
                          : "Cr"}
                        . Run migration{" "}
                        <code className="text-[10px]">20260628120000_fix_reconcile_gross_invoiced_cn_receipts</code>{" "}
                        in Supabase SQL editor, then hard-refresh.
                      </span>
                    </p>
                  )}
              </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-0 min-h-[4.5rem]">
              {/* For school non-structure students, opening_balance IS totalSales — show only once as "Opening Balance" */}
              {selectedCustomer.opening_balance !== 0 && !(isSchool && (selectedCustomer as any).hasStructures === false) && (
                <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                  <CardContent className="p-3">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Opening Balance</div>
                    <div className={cn(
                      "text-lg font-bold tabular-nums",
                      selectedCustomer.opening_balance > 0 ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"
                    )}>
                      ₹{Math.abs(selectedCustomer.opening_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {selectedCustomer.opening_balance > 0 ? "Receivable" : "Advance"}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {isSchool ? ((selectedCustomer as any).hasStructures === false ? "Opening Balance" : "Total Fees") : "Total Sales"}
                  </div>
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                    ₹{selectedCustomer.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {isSchool ? "Fees Received" : "Cash/UPI Paid"}
                  </div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ₹{(
                      ledgerDerivedStats?.cashPaid ?? selectedCustomer.totalCashPaid ?? 0
                    ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Advance Adjusted</div>
                  <div className="text-lg font-bold text-purple-600 dark:text-purple-300 tabular-nums">
                    ₹{(selectedCustomer.totalAdvanceApplied ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Advance Received</div>
                  <div className="text-lg font-bold text-indigo-600 dark:text-indigo-300 tabular-nums">
                    ₹{((selectedCustomer.totalAdvanceApplied ?? 0) + (selectedCustomer.unusedAdvanceTotal ?? 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Applied + Unused</div>
                </CardContent>
              </Card>
              <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Advance Balance</div>
                  <div className={cn(
                    "text-lg font-bold tabular-nums",
                    (isSchool ? (selectedCustomer.unusedAdvanceTotal ?? 0) : snapshotAdvanceAvailable) > 0
                      ? "text-teal-600 dark:text-teal-400"
                      : "text-muted-foreground"
                  )}>
                    ₹{(isSchool ? (selectedCustomer.unusedAdvanceTotal ?? 0) : snapshotAdvanceAvailable).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  {(selectedCustomer.unusedAdvanceTotal ?? 0) > 0 && (
                    <div className="text-[10px] text-teal-600 dark:text-teal-400 mt-0.5">Available to apply</div>
                  )}
                </CardContent>
              </Card>
              <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Returns / CR</div>
                  {saleReturnsSummary.pending + saleReturnsSummary.partialPending > 0 ? (
                    <>
                      <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        ₹{(saleReturnsSummary.pending + saleReturnsSummary.partialPending).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Pending adjustment</div>
                    </>
                  ) : saleReturnsSummary.adjusted > 0 ? (
                    <>
                      <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        ₹{saleReturnsSummary.adjusted.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
              <Card className="border border-slate-200 shadow-sm rounded-lg bg-white overflow-hidden">
                <CardContent className="p-3">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">CN Available</div>
                  <div className={cn(
                    "text-lg font-bold tabular-nums",
                    cnAvailable > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                  )}>
                    ₹{cnAvailable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  {cnAvailable > 0 && (
                    <div className="text-[10px] text-orange-500 mt-0.5">Pending adjustment</div>
                  )}
                </CardContent>
              </Card>
            </div>

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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                      {/* Totals Row */}
                      {!ledgerLoading && ledgerRows.length > 0 && (
                        <TableRow className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                          <TableCell colSpan={4} className="text-right text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                            Totals
                          </TableCell>
                          <TableCell className="text-right text-red-600 dark:text-red-400">
                            ₹{transactionTotals.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right text-emerald-700 dark:text-emerald-300 font-semibold">
                            ₹{transactionTotals.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right",
                            ledgerRows[ledgerRows.length - 1].balance > 0 ? "text-red-600 dark:text-red-400" : 
                            ledgerRows[ledgerRows.length - 1].balance < 0 ? "text-emerald-700 dark:text-emerald-300" : 
                            "text-foreground"
                          )}>
                            ₹{Math.abs(ledgerRows[ledgerRows.length - 1].balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
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
                        .reduce((sum, t) => sum + (t.amount || t.credit || 0), 0);
                      const pendingReturns = ledgerRows
                        .filter((t) => t.type === 'return' && t.status === 'pending')
                        .reduce((sum, t) => sum + (t.amount || t.credit || 0), 0);
                      const cashPaid = reconciliation.paymentsCash;
                      const settlementDiscount = reconciliation.paymentsDiscount;
                      const cnOnInvoices = reconciliation.invoiceCnApplied;
                      const advanceAdjusted = reconciliation.advanceApplied;
                      const advanceRefunded = Math.max(0, ledgerRows
                        .filter((t) => t.type === 'adv_refund')
                        .reduce((sum, t) => sum + (t.debit || 0), 0));
                      const cnRefunded = Math.max(0, ledgerRows
                        .filter((t) => t.type === 'cn_refund')
                        .reduce((sum, t) => sum + (t.debit || 0), 0));
                      const outstanding =
                        ledgerRows.length > 0
                          ? ledgerRows[ledgerRows.length - 1].balance
                          : reconciliation.finalBalance;
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
                      <div className="text-[11px] text-orange-500 -mt-1">Pending — awaiting adjustment</div>
                      <div className="flex justify-between border-t pt-1.5">
                        <span className="font-semibold">(=) Net Invoiced</span>
                        <span className="font-semibold">₹{Math.round(reconciliation.grossInvoiced - cnOnInvoices - confirmedReturns - pendingReturns).toLocaleString("en-IN")}</span>
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
                      {advanceRefunded > 0 && (
                        <div className="flex justify-between">
                          <span>(−) Advance Refunded Out</span>
                          <span className="font-medium">₹{Math.round(advanceRefunded).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {cnRefunded > 0 && (
                        <div className="flex justify-between text-rose-700 dark:text-rose-400">
                          <span>(+) CN Refunded to Customer</span>
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
                        <span>Outstanding ({outstanding > 0 ? 'Dr' : outstanding < 0 ? 'Cr' : 'Settled'})</span>
                        <span>₹{Math.abs(Math.round(outstanding)).toLocaleString("en-IN")}</span>
                      </div>
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
        {customerForHistory && (
          <CustomerHistoryDialog
            open={showCustomerHistory}
            onOpenChange={setShowCustomerHistory}
            customerId={customerForHistory.id}
            customerName={customerForHistory.name}
            organizationId={organizationId}
          />
        )}
      </div>
      {overpaymentRefundDialog}
      </>
    );
  }

  return (
    <>
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 ${isSchool ? "" : "lg:grid-cols-5"} gap-2`}>
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
                  {summary.totalCustomers}
                </div>
                <p className="text-xs text-white/65 mt-0.5 truncate">
                  {isSchool ? "Active student accounts" : "Active customer accounts"}
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
                  ₹{summary.totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-white/65 mt-0.5 truncate">
                  {isSchool ? "Fees pending collection" : "Amount pending collection"}
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
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/80">
                  {isSchool ? "Total Fees Charged" : "Total Receivable"}
                </p>
                <div className="text-2xl font-black text-white tabular-nums mt-0.5">
                  ₹{summary.totalReceivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-white/65 mt-0.5 truncate">
                  {isSchool ? "Total fees value" : "Total sales value"}
                </p>
              </div>
              <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        {!isSchool && (
          <>
            <Card
              className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-violet-500 to-violet-600"
              onClick={() => setPaymentStatusFilter("all")}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white/80">Net AR</p>
                    <div className="text-2xl font-black text-white tabular-nums mt-0.5">
                      ₹{summary.netReceivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-white/65 mt-0.5 truncate">Outstanding − credit pool</p>
                  </div>
                  <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                    <Scale className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-amber-500 to-amber-600"
              onClick={() => setPaymentStatusFilter("advance")}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white/80">Customer Credit Pool</p>
                    <div className="text-2xl font-black text-white tabular-nums mt-0.5">
                      ₹{summary.customerCreditPool.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-white/65 mt-0.5 truncate">Advances / overpayments held</p>
                  </div>
                  <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                    <Wallet className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
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
                placeholder="Search by name, phone, or email..."
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
                paginatedCustomers.map((customer) => (
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
                        {customer.balance > 0 && (
                          <Badge variant="destructive" className="ml-2">Outstanding</Badge>
                        )}
                        {customer.balance < 0 && (
                          <Badge variant="default" className="bg-green-600 ml-2">Advance</Badge>
                        )}
                        {customer.balance === 0 && (
                          <Badge variant="outline" className="ml-2">Settled</Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">{isSchool ? 'Fees' : 'Sales'}</div>
                          <div className="font-medium text-sm">₹{customer.totalSales.toLocaleString("en-IN")}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Paid</div>
                          <div className="font-medium text-sm text-green-600 dark:text-green-400">₹{customer.totalPaid.toLocaleString("en-IN")}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Balance</div>
                          <div className={cn(
                            "font-bold text-sm",
                            customer.balance > 0 ? "text-red-600 dark:text-red-400" : 
                            customer.balance < 0 ? "text-green-600 dark:text-green-400" : 
                            "text-foreground"
                          )}>
                            ₹{Math.abs(customer.balance).toLocaleString("en-IN")}
                          </div>
                        </div>
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
                ))
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
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Balance</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-center")}>Status</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isCustomersInitialLoad ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Loading customers...
                      </TableCell>
                    </TableRow>
                  ) : filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No customers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCustomers.map((customer) => (
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
                        <TableCell className="text-right">
                          ₹{customer.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-green-600 dark:text-green-400">
                          ₹{customer.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-bold",
                          customer.balance > 0 ? "text-red-600 dark:text-red-400" : 
                          customer.balance < 0 ? "text-green-600 dark:text-green-400" : 
                          "text-foreground"
                        )}>
                          ₹{Math.abs(customer.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {customer.balance > 0 && (
                            <Badge variant="destructive">Outstanding</Badge>
                          )}
                          {customer.balance < 0 && (
                            <Badge variant="default" className="bg-green-600">Advance</Badge>
                          )}
                          {customer.balance === 0 && (
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
                    ))
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
      {customerForHistory && (
        <CustomerHistoryDialog
          open={showCustomerHistory}
          onOpenChange={setShowCustomerHistory}
          customerId={customerForHistory.id}
          customerName={customerForHistory.name}
          organizationId={organizationId}
        />
      )}
      {overpaymentRefundDialog}
    </div>
    </>
  );
}
