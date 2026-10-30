import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { ResetPersistedFiltersButton } from "@/components/ResetPersistedFiltersButton";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useDcVisibility } from "@/hooks/useDcVisibility";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday } from "date-fns";
import {
  CalendarIcon, RefreshCw, Save, Printer, FileSpreadsheet,
  TrendingUp, TrendingDown, Wallet, ArrowDownLeft, ArrowUpRight, IndianRupee,
  CheckCircle2, AlertTriangle, XCircle, Clock, Landmark,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { QuietRefreshBar } from "@/components/QuietRefreshBar";
import { localDayBounds } from "@/lib/localDayBounds";
import {
  buildCashierReceiptModeMap,
  getCashierSalePaymentModeAmounts,
  toCashierOverlapSaleRow,
} from "@/utils/cashierSaleModeAmounts";
import { createSameDaySaleReceiptOverlapTracker } from "@/utils/posCashierCashIn";
import { toast } from "sonner";
import type * as XLSXType from "xlsx";
/** Lazily loaded on export — keeps the xlsx bundle off this page's initial chunk. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));

import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import DailyTallyReport from "@/components/DailyTallyReport";
import { classifyDailyTallyPaymentOutflow } from "@/utils/accounting/thirdPartyVoucherCash";
import { fetchAllSalesWithFilters } from "@/utils/fetchAllRows";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

// ─── helpers ───────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(n);

const parsePaymentMode = (desc: string) => {
  const d = (desc || "").toLowerCase();
  if (d.includes("upi")) return "upi";
  if (d.includes("card")) return "card";
  if (d.includes("cheque") || d.includes("bank") || d.includes("transfer") || d.includes("neft") || d.includes("rtgs")) return "bank";
  return "cash";
};

interface PaymentBreakdown {
  cash: number; upi: number; card: number; bank: number; credit: number; total: number;
}
const emptyBreakdown = (): PaymentBreakdown => ({ cash: 0, upi: 0, card: 0, bank: 0, credit: 0, total: 0 });

const DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10] as const;
const DEFAULT_DENOM_COUNTS: Record<number, number> = { 2000: 0, 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0 };


// ─── Component ─────────────────────────────────────────────────────────
const DailyTally = () => {
  const { currentOrganization } = useOrganization();
  const { hideDc, onlyDc } = useDcVisibility();
  const { user } = useAuth();
  const { isAdmin, isManager } = useUserRoles();
  const { orgNavigate } = useOrgNavigation();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [openingCash, setOpeningCash] = useState(0);
  const [physicalCash, setPhysicalCash] = useState(0);
  const [actualBankBalance, setActualBankBalance] = useState(0);
  const [leaveInDrawer, setLeaveInDrawer] = useState(0);
  const [depositToBank, setDepositToBank] = useState(0);
  const [notes, setNotes] = useState("");
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>({ ...DEFAULT_DENOM_COUNTS });
  const [coinsBulk, setCoinsBulk] = useState(0);
  const [tallyTab, setTallyTab] = useState<string>("manual");

  const { clearPersistedFilters } = useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.dailyTally,
    currentOrganization?.id,
    useMemo(() => ({ selectedDate, tallyTab }), [selectedDate, tallyTab]),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [["tallyTab", setTallyTab]],
        requiredDates: [["selectedDate", setSelectedDate]],
      });
    },
  );

  const tallyFiltersDirty = !isToday(selectedDate) || tallyTab !== "manual";

  const resetTallyFilters = () => {
    setSelectedDate(new Date());
    setTallyTab("manual");
    clearPersistedFilters();
  };

  const orgId = currentOrganization?.id;
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const canEditAnyDate = isAdmin || isManager;
  const { startIso, endIso } = localDayBounds(dateStr, dateStr);

  const REPORT_CACHE = { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false as const };

  // Sales (POS + Invoice) — static import
  const { data: salesData, isLoading: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: ["daily-tally-sales", orgId, dateStr, hideDc, onlyDc],
    queryFn: async () => {
      return fetchAllSalesWithFilters(orgId!, { startDate: startIso, endDate: endIso, hideDc, onlyDc });
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  // Voucher entries (all types for the date)
  const { data: vouchersData, isLoading: vouchersLoading, refetch: refetchVouchers } = useQuery({
    queryKey: ["daily-tally-vouchers", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("id, voucher_number, voucher_date, voucher_type, total_amount, discount_amount, description, reference_type, reference_id, category, payment_method")
        .eq("organization_id", orgId!)
        .is("deleted_at", null)
        .gte("voucher_date", dateStr)
        .lte("voucher_date", dateStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  // Customer advances
  const { data: advancesData, isLoading: advancesLoading, refetch: refetchAdvances } = useQuery({
    queryKey: ["daily-tally-advances", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_advances")
        .select("id, amount, payment_method, advance_date")
        .eq("organization_id", orgId!)
        .eq("advance_date", dateStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  // Sale returns (cash refunds)
  const { data: refundsData, isLoading: refundsLoading, refetch: refetchRefunds } = useQuery({
    queryKey: ["daily-tally-refunds", orgId, dateStr],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("sale_returns")
          .select("id, net_amount, return_date, refund_type")
          .eq("organization_id", orgId!)
          .eq("return_date", dateStr)
          .is("deleted_at", null);
        if (error) return [];
        return data || [];
      } catch { return []; }
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  // Snapshot
  const { data: snapshot, isLoading: snapshotLoading, refetch: refetchSnapshot } = useQuery({
    queryKey: ["daily-tally-snapshot", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .select("id, tally_date, opening_cash, expected_cash, physical_cash, difference_amount, leave_in_drawer, deposit_to_bank, handover_to_owner, notes, created_by, denomination_data, created_at")
        .eq("organization_id", orgId!)
        .eq("tally_date", dateStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  // Yesterday's snapshot (for opening cash = yesterday's closing)
  const yesterdayStr = useMemo(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    return format(d, "yyyy-MM-dd");
  }, [selectedDate]);

  const { data: yesterdaySnapshot } = useQuery({
    queryKey: ["daily-tally-snapshot", orgId, yesterdayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .select("physical_cash, leave_in_drawer")
        .eq("organization_id", orgId!)
        .eq("tally_date", yesterdayStr)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  const { data: settings } = useSettings();

  const isLoading = salesLoading || vouchersLoading || advancesLoading || refundsLoading || snapshotLoading;

  // ─── Denomination total ────────────────────────────────────────────
  const denomTotal = useMemo(() => {
    let total = 0;
    for (const denom of DENOMINATIONS) {
      total += denom * (denomCounts[denom] || 0);
    }
    total += coinsBulk;
    return total;
  }, [denomCounts, coinsBulk]);

  // Auto-update physical cash when denomination changes
  useEffect(() => {
    if (tallyTab === "denomination") {
      setPhysicalCash(denomTotal);
    }
  }, [denomTotal, tallyTab]);

  // ─── Load snapshot values when date changes ────────────────────────
  useEffect(() => {
    if (snapshot) {
      setOpeningCash(Number(snapshot.opening_cash) || 0);
      setPhysicalCash(Number(snapshot.physical_cash) || 0);
      setLeaveInDrawer(Number(snapshot.leave_in_drawer) || 0);
      setDepositToBank(Number(snapshot.deposit_to_bank) || 0);
      setNotes(snapshot.notes || "");
      // FIX 4: Restore denomination data from snapshot
      if (snapshot.denomination_data) {
        try {
          const saved = typeof snapshot.denomination_data === 'string' 
            ? JSON.parse(snapshot.denomination_data) 
            : snapshot.denomination_data;
          if (saved.counts) setDenomCounts(saved.counts);
          if (saved.coins !== undefined) setCoinsBulk(saved.coins);
          if (tallyTab === "denomination" && saved.total) setPhysicalCash(saved.total || 0);
        } catch (e) { /* ignore parse error */ }
      }
    } else {
      // Use yesterday's leave_in_drawer as today's opening cash
      const yesterdayClosing = Number(yesterdaySnapshot?.leave_in_drawer) || 0;
      setOpeningCash(yesterdayClosing);
      setPhysicalCash(0);
      setLeaveInDrawer(0);
      setDepositToBank(0);
      setNotes("");
      // Reset denomination counts
      setDenomCounts({ ...DEFAULT_DENOM_COUNTS });
      setCoinsBulk(0);
    }
  }, [snapshot, yesterdaySnapshot]);

  // ─── Aggregation ───────────────────────────────────────────────────
  const aggregated = useMemo(() => {
    const posSales = emptyBreakdown();
    const invoiceSales = emptyBreakdown();
    const receipts = emptyBreakdown();
    const advances = emptyBreakdown();
    const supplierPayments = emptyBreakdown();
    const expenses = emptyBreakdown();
    const employeeSalary = emptyBreakdown();
    const thirdPartyPayments = emptyBreakdown();
    const saleReturnRefunds = emptyBreakdown();

    const isHoldLikeSale = (s: any) => {
      if (s?.payment_status === "hold") return true;
      return s?.payment_status === "pending" && String(s?.sale_number || "").startsWith("Hold/");
    };

    const getEffectiveNet = (s: any) => Number(s?.net_amount) || 0;

    const receiptModeBySale = buildCashierReceiptModeMap(
      (salesData || [])
        .filter((s: any) => s?.id && !isHoldLikeSale(s))
        .map((s: any) => ({
          id: s.id as string,
          sale_number: s.sale_number,
          customer_id: s.customer_id,
          net_amount: s.net_amount,
          sale_return_adjust: s.sale_return_adjust,
        })),
      (vouchersData || [])
        .filter((v: any) => String(v.voucher_type || "").toLowerCase() === "receipt")
        .map((v: any) => ({
          reference_id: v.reference_id,
          reference_type: v.reference_type,
          total_amount: v.total_amount,
          discount_amount: v.discount_amount,
          payment_method: v.payment_method,
          description: v.description,
        })),
    );

    const displayModesBySaleId = new Map<
      string,
      ReturnType<typeof getCashierSalePaymentModeAmounts>
    >();

    // Process sales (exclude hold/cancelled-like rows to match POS dashboard)
    (salesData || []).forEach((s: any) => {
      if (isHoldLikeSale(s)) return;
      const net = getEffectiveNet(s);
      const target = s.sale_type === "pos" ? posSales : invoiceSales;
      const receiptModes = s.id ? receiptModeBySale.get(s.id) : undefined;
      const displayModes = getCashierSalePaymentModeAmounts(s, receiptModes);
      if (s.id) {
        displayModesBySaleId.set(s.id, displayModes);
      }

      if (s.payment_method === "pay_later") {
        target.credit += net;
      } else {
        target.cash += displayModes.cash;
        target.card += displayModes.card;
        target.upi += displayModes.upi;
      }
      target.total += net;
    });

    const receiptOverlap = createSameDaySaleReceiptOverlapTracker(
      (salesData || [])
        .filter(
          (s: any) =>
            s?.id &&
            !isHoldLikeSale(s) &&
            !s?.is_cancelled &&
            s?.payment_status !== "cancelled",
        )
        .map((s: any) => {
          const displayModes =
            displayModesBySaleId.get(s.id) ??
            getCashierSalePaymentModeAmounts(
              s,
              receiptModeBySale.get(s.id),
            );
          return toCashierOverlapSaleRow(s, displayModes);
        }),
      vouchersData || [],
    );

    // Process vouchers — FIX 8: strict voucher_type check only for expenses
    (vouchersData || []).forEach((v: any) => {
      const rawAmt = Number(v.total_amount) || 0;
      const mode = parsePaymentMode(v.description);
      const addToMode = (b: PaymentBreakdown, amt: number) => {
        b[mode as keyof PaymentBreakdown] = (b[mode as keyof PaymentBreakdown] as number) + amt;
        b.total += amt;
      };

      if (v.voucher_type === "receipt") {
        const amt = receiptOverlap.countableAmount(v);
        if (amt > 0) addToMode(receipts, amt);
      } else if (v.voucher_type === "payment" && v.reference_type === "supplier") {
        addToMode(supplierPayments, rawAmt);
      } else if (v.voucher_type === "payment" && v.reference_type === "employee") {
        addToMode(employeeSalary, rawAmt);
      } else if (classifyDailyTallyPaymentOutflow(v) === "third_party") {
        addToMode(thirdPartyPayments, rawAmt);
      } else if (v.voucher_type === "expense") {
        addToMode(expenses, rawAmt);
      }
    });

    // Process advances
    (advancesData || []).forEach((a: any) => {
      const amt = Number(a.amount) || 0;
      const mode = (a.payment_method || "cash").toLowerCase();
      if (mode === "upi") advances.upi += amt;
      else if (mode === "card") advances.card += amt;
      else if (mode === "bank" || mode === "cheque") advances.bank += amt;
      else advances.cash += amt;
      advances.total += amt;
    });

    // Process sale return cash refunds
    (refundsData || []).forEach((r: any) => {
      if ((r as any).refund_type === "cash_refund") {
        const amt = Number(r.net_amount) || 0;
        saleReturnRefunds.cash += amt;
        saleReturnRefunds.total += amt;
      }
    });

    return { posSales, invoiceSales, receipts, advances, supplierPayments, expenses, employeeSalary, thirdPartyPayments, saleReturnRefunds };
  }, [salesData, vouchersData, advancesData, refundsData]);

  // ─── Totals ────────────────────────────────────────────────────────
  const totalIn = useMemo(() => {
    const b = emptyBreakdown();
    [aggregated.posSales, aggregated.invoiceSales, aggregated.receipts, aggregated.advances].forEach(s => {
      b.cash += s.cash; b.upi += s.upi; b.card += s.card; b.bank += s.bank; b.credit += s.credit; b.total += s.total;
    });
    return b;
  }, [aggregated]);

  const totalOut = useMemo(() => {
    const b = emptyBreakdown();
    [aggregated.supplierPayments, aggregated.expenses, aggregated.employeeSalary, aggregated.thirdPartyPayments, aggregated.saleReturnRefunds].forEach(s => {
      b.cash += s.cash; b.upi += s.upi; b.card += s.card; b.bank += s.bank; b.credit += s.credit; b.total += s.total;
    });
    return b;
  }, [aggregated]);

  const totalSales = aggregated.posSales.total + aggregated.invoiceSales.total;
  // FIX 2 & 3: Use actual collected amounts (excluding credit)
  const actualCollected = totalIn.cash + totalIn.upi + totalIn.card + totalIn.bank;
  const actualPaidOut = totalOut.cash + totalOut.upi + totalOut.card + totalOut.bank;
  const totalPaymentsOut = totalOut.total;
  const netMovement = actualCollected - actualPaidOut;
  const expectedBank = totalIn.upi + totalIn.card + totalIn.bank - totalOut.bank;
  const bankDifference = actualBankBalance - expectedBank;

  const expectedCash = openingCash + totalIn.cash - totalOut.cash;
  const difference = physicalCash - expectedCash;
  const handoverToOwner = physicalCash - leaveInDrawer - depositToBank;

  const statusBadge = useMemo(() => {
    if (physicalCash === 0 && !snapshot) return { label: "Not Settled", variant: "secondary" as const, color: "" };
    const abs = Math.abs(difference);
    if (abs === 0) return { label: "Balanced", variant: "default" as const, color: "bg-emerald-50 text-emerald-700 border-emerald-600 border-[1.5px] ring-2 ring-emerald-200" };
    if (abs <= 100) return { label: "Minor Difference", variant: "default" as const, color: "bg-amber-50 text-amber-700 border-amber-500 border-[1.5px] ring-2 ring-amber-200" };
    return { label: "Cash Mismatch", variant: "destructive" as const, color: "bg-red-50 text-red-700 border-red-600 border-[1.5px] ring-2 ring-red-200" };
  }, [physicalCash, difference, snapshot]);

  // ─── Refresh ───────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    refetchSales();
    refetchVouchers();
    refetchAdvances();
    refetchRefunds();
    refetchSnapshot();
    toast.success("Data refreshed");
  }, [refetchSales, refetchVouchers, refetchAdvances, refetchRefunds, refetchSnapshot]);

  // ─── Print ─────────────────────────────────────────────────────────
  const handlePrint = useReactToPrint({ contentRef: printRef });

  // ─── Export Excel ──────────────────────────────────────────────────
  const handleExportExcel = useCallback(async () => {
    const rows = [
      [`Daily Tally — ${format(selectedDate, "dd MMM yyyy")}`],
      [settings?.business_name || ""],
      [],
      ["MONEY IN", "Cash", "UPI", "Card", "Bank", "Credit", "Total"],
      ["POS Sales", aggregated.posSales.cash, aggregated.posSales.upi, aggregated.posSales.card, aggregated.posSales.bank, aggregated.posSales.credit, aggregated.posSales.total],
      ["Sales Invoice", aggregated.invoiceSales.cash, aggregated.invoiceSales.upi, aggregated.invoiceSales.card, aggregated.invoiceSales.bank, aggregated.invoiceSales.credit, aggregated.invoiceSales.total],
      ["Old Balance Received", aggregated.receipts.cash, aggregated.receipts.upi, aggregated.receipts.card, aggregated.receipts.bank, aggregated.receipts.credit, aggregated.receipts.total],
      ["Advance Received", aggregated.advances.cash, aggregated.advances.upi, aggregated.advances.card, aggregated.advances.bank, aggregated.advances.credit, aggregated.advances.total],
      ["Total Inward", totalIn.cash, totalIn.upi, totalIn.card, totalIn.bank, totalIn.credit, totalIn.total],
      [],
      ["MONEY OUT", "Cash", "UPI", "Card", "Bank", "Credit", "Total"],
      ["Supplier Payment", aggregated.supplierPayments.cash, aggregated.supplierPayments.upi, aggregated.supplierPayments.card, aggregated.supplierPayments.bank, aggregated.supplierPayments.credit, aggregated.supplierPayments.total],
      ["Shop Expense", aggregated.expenses.cash, aggregated.expenses.upi, aggregated.expenses.card, aggregated.expenses.bank, aggregated.expenses.credit, aggregated.expenses.total],
      ["Employee Salary", aggregated.employeeSalary.cash, aggregated.employeeSalary.upi, aggregated.employeeSalary.card, aggregated.employeeSalary.bank, aggregated.employeeSalary.credit, aggregated.employeeSalary.total],
      ["Third-party Payment", aggregated.thirdPartyPayments.cash, aggregated.thirdPartyPayments.upi, aggregated.thirdPartyPayments.card, aggregated.thirdPartyPayments.bank, aggregated.thirdPartyPayments.credit, aggregated.thirdPartyPayments.total],
      ["Sale Return Refund", aggregated.saleReturnRefunds.cash, aggregated.saleReturnRefunds.upi, aggregated.saleReturnRefunds.card, aggregated.saleReturnRefunds.bank, aggregated.saleReturnRefunds.credit, aggregated.saleReturnRefunds.total],
      ["Total Outward", totalOut.cash, totalOut.upi, totalOut.card, totalOut.bank, totalOut.credit, totalOut.total],
      [],
      ["CASH RECONCILIATION"],
      ["Opening Cash", openingCash],
      ["Expected Cash", expectedCash],
      ["Physical Cash", physicalCash],
      ["Difference", difference],
      ["Expected Bank/UPI Settlement", expectedBank],
      ["Actual Bank/UPI Settlement", actualBankBalance],
      ["Bank Difference", bankDifference],
      [],
      ["SETTLEMENT"],
      ["Leave in Drawer", leaveInDrawer],
      ["Deposit to Bank", depositToBank],
      ["Handover to Owner", handoverToOwner],
    ];
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Tally");
    XLSX.writeFile(wb, `Daily_Tally_${dateStr}.xlsx`);
  }, [selectedDate, aggregated, totalIn, totalOut, openingCash, expectedCash, physicalCash, difference, expectedBank, actualBankBalance, bankDifference, leaveInDrawer, depositToBank, handoverToOwner, settings, dateStr]);

  // ─── Table row helper — UI-5: highlight non-zero rows ──────────────
  const MoneyRow = ({ label, data, highlight, type }: { label: string; data: PaymentBreakdown; highlight?: boolean; type?: "in" | "out" }) => (
    <TableRow className={cn(
      highlight && type === "in" ? "bg-emerald-50 dark:bg-emerald-950/30 font-bold" :
      highlight && type === "out" ? "bg-rose-50 dark:bg-rose-950/30 font-bold" :
      highlight ? "bg-muted/50 font-bold" :
      !highlight && data.total > 0 && type === "in" ? "border-l-4 border-l-emerald-400 bg-emerald-50/30" :
      !highlight && data.total > 0 && type === "out" ? "border-l-4 border-l-rose-400 bg-rose-50/30" :
      "even:bg-slate-50/50 dark:even:bg-slate-900/30"
    )}>
      <TableCell className={cn("font-medium text-sm", !highlight && "text-slate-600 dark:text-slate-400")}>{label}</TableCell>
      <TableCell className="text-right tabular-nums text-sm">{fmt(data.cash)}</TableCell>
      <TableCell className="text-right tabular-nums text-sm">{fmt(data.upi)}</TableCell>
      <TableCell className="text-right tabular-nums text-sm">{fmt(data.card)}</TableCell>
      <TableCell className="text-right tabular-nums text-sm">{fmt(data.bank)}</TableCell>
      <TableCell className="text-right tabular-nums text-sm">{fmt(data.credit)}</TableCell>
      <TableCell className={cn("text-right tabular-nums font-semibold text-sm", highlight && "text-base")}>{fmt(data.total)}</TableCell>
    </TableRow>
  );

  // ─── Interactive summary cards ───────────────────────────────────────
  const heroCards = [
    { title: "Total Collection", subtitle: "Money In", value: totalIn.total, icon: ArrowDownLeft, borderColor: "border-l-blue-600", iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-600" },
    { title: "Total Payouts", subtitle: "Money Out", value: totalOut.total, icon: ArrowUpRight, borderColor: "border-l-rose-600", iconBg: "bg-rose-100 dark:bg-rose-900/40", iconColor: "text-rose-600" },
    { title: "Net Cash in Hand", subtitle: "Expected Cash", value: expectedCash, icon: Wallet, borderColor: "border-l-emerald-600", iconBg: "bg-emerald-100 dark:bg-emerald-900/40", iconColor: "text-emerald-600" },
    { title: "Net Bank/UPI Settlement", subtitle: "Expected Bank", value: expectedBank, icon: Landmark, borderColor: "border-l-amber-500", iconBg: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-600" },
  ];

  const moneyInChartData = useMemo(() => ([
    { name: "POS Sales", value: aggregated.posSales.total, color: "#3b82f6" },
    { name: "Sales Invoice", value: aggregated.invoiceSales.total, color: "#10b981" },
    { name: "Old Balance Received", value: aggregated.receipts.total, color: "#a855f7" },
    { name: "Advance Received", value: aggregated.advances.total, color: "#f59e0b" },
  ]), [aggregated]);
  const hasMoneyInChartData = moneyInChartData.some((d) => d.value > 0);

  const paymentModeChartData = useMemo(() => ([
    { name: "Cash", value: totalIn.cash, color: "#22c55e" },
    { name: "UPI", value: totalIn.upi, color: "#3b82f6" },
    { name: "Card", value: totalIn.card, color: "#a855f7" },
    { name: "Bank", value: totalIn.bank, color: "#f59e0b" },
  ]), [totalIn]);

  const handleChartSliceClick = (entry: any) => {
    toast.info(`${entry?.name || "Amount"}: ${fmt(Number(entry?.value || 0))}`);
  };

  const notesForReport = useMemo(() => {
    const bankLines = [
      `Expected Bank/UPI Settlement: ${fmt(expectedBank)}`,
      `Actual Bank/UPI Settlement: ${fmt(actualBankBalance)}`,
      `Bank Difference: ${bankDifference >= 0 ? "+" : ""}${fmt(bankDifference)}`,
    ].join(" | ");
    return notes?.trim() ? `${notes.trim()} | ${bankLines}` : bankLines;
  }, [notes, expectedBank, actualBankBalance, bankDifference]);

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="relative space-y-6 pb-10">
      <QuietRefreshBar
        queryKeys={[
          ["daily-tally-sales", orgId],
          ["daily-tally-vouchers", orgId],
          ["daily-tally-advances", orgId],
          ["daily-tally-refunds", orgId],
          ["daily-tally-snapshot", orgId],
        ]}
      />
      {/* ═══ Page Header ═══ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Daily Tally & Settlement</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{format(selectedDate, "EEEE, dd MMMM yyyy")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 border-[1.5px] border-slate-200 dark:border-slate-700">
                <CalendarIcon className="h-4 w-4" />
                {format(selectedDate, "dd MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                disabled={!canEditAnyDate ? (d) => !isToday(d) : undefined}
              />
            </PopoverContent>
          </Popover>
          {/* UI-2: Today quick button */}
          {!isToday(selectedDate) && (
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}
              className="text-xs border-[1.5px] border-indigo-300 text-indigo-700 hover:bg-indigo-50">
              Today
            </Button>
          )}
          <ResetPersistedFiltersButton
            visible={tallyFiltersDirty}
            onReset={resetTallyFilters}
          />
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading} className="border-[1.5px] border-slate-200 dark:border-slate-700">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button className="gap-2 bg-indigo-700 hover:bg-indigo-800 text-white" onClick={() => handlePrint()}>
            <Printer className="h-4 w-4" /> Print Tally
          </Button>
          <Button variant="outline" className="gap-2 border-[1.5px] border-slate-200 dark:border-slate-700" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          {statusBadge.label !== "Not Settled" && (
            <Badge className={statusBadge.color}>{statusBadge.label}</Badge>
          )}
          {snapshot && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Saved {format(new Date(snapshot.created_at), "hh:mm a")}
            </span>
          )}
        </div>
      </div>

      {/* UI-4: Skeleton loading state */}
      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <Card key={i} className="border-[1.5px] border-slate-200 dark:border-slate-700 border-l-4 border-l-slate-300">
                <CardHeader className="pb-2 pt-4 px-4">
                  <Skeleton className="h-3 w-20" />
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1,2].map(i => (
              <Card key={i} className="border-[1.5px] border-slate-200 dark:border-slate-700">
                <CardHeader className="pb-3"><Skeleton className="h-5 w-24" /></CardHeader>
                <CardContent><Skeleton className="h-40 w-full" /></CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
      <>
      {/* ═══ Hero Summary Cards ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {heroCards.map((c) => (
          <Card
            key={c.title}
            onClick={() => toast.info(`${c.title}: ${fmt(c.value)}`)}
            className={cn("cursor-pointer border-[1.5px] border-slate-200 dark:border-slate-700 border-l-4 hover:shadow-lg transition-shadow", c.borderColor)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
              <div className="space-y-0.5">
                <span className="block text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">{c.title}</span>
                <span className="block text-[10px] text-slate-400 dark:text-slate-500">{c.subtitle}</span>
              </div>
              <div className={cn("h-9 w-9 rounded-full flex items-center justify-center", c.iconBg)}>
                <c.icon className={cn("h-4 w-4", c.iconColor)} />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{fmt(c.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ═══ Visual Summary (screen only) ═══ */}
      <div className="print:hidden grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-[1.5px] border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Money In by Source</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {!hasMoneyInChartData ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No money in today
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={moneyInChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    onClick={handleChartSliceClick}
                  >
                    {moneyInChartData.map((entry) => (
                      <Cell key={`in-${entry.name}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number, name: string) => [fmt(Number(value || 0)), name]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-[1.5px] border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Collection by Payment Mode</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentModeChartData} margin={{ top: 8, right: 12, left: 0, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <RechartsTooltip formatter={(value: number, name: string) => [fmt(Number(value || 0)), name]} />
                <Legend verticalAlign="bottom" height={24} />
                <Bar dataKey="value" name="Collection">
                  {paymentModeChartData.map((entry) => (
                    <Cell key={`mode-${entry.name}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Twin-Pillar: Money In / Money Out ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Money In */}
        <Card className="border-[1.5px] border-slate-200 dark:border-slate-700 border-t-4 border-t-emerald-600 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-600 font-bold">
              <ArrowDownLeft className="h-5 w-5" /> Money In
              {/* UI-3: transaction count badge */}
              <Badge variant="secondary" className="ml-2 text-xs font-normal">
                {((salesData || []).filter((s: any) => !(s?.payment_status === "hold" || (s?.payment_status === "pending" && String(s?.sale_number || "").startsWith("Hold/")))).length || 0) + (vouchersData?.filter((v: any) => v.voucher_type === "receipt").length || 0)} txns
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Source</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Cash</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">UPI</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Card</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Bank</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Credit</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <MoneyRow label="POS Sales" data={aggregated.posSales} type="in" />
                  <MoneyRow label="Sales Invoice" data={aggregated.invoiceSales} type="in" />
                  <MoneyRow label="Old Balance Received" data={aggregated.receipts} type="in" />
                  <MoneyRow label="Advance Received" data={aggregated.advances} type="in" />
                </TableBody>
                <TableFooter>
                  <MoneyRow label="Total Inward" data={totalIn} highlight type="in" />
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Money Out */}
        <Card className="border-[1.5px] border-slate-200 dark:border-slate-700 border-t-4 border-t-rose-600 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-rose-600 font-bold">
              <ArrowUpRight className="h-5 w-5" /> Money Out
              {/* UI-3: transaction count badge */}
              <Badge variant="secondary" className="ml-2 text-xs font-normal">
                {(vouchersData?.filter((v: any) => v.voucher_type !== "receipt").length || 0) + (refundsData?.length || 0)} txns
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Source</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Cash</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">UPI</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Card</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Bank</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Credit</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-slate-600 dark:text-slate-300">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <MoneyRow label="Supplier Payment" data={aggregated.supplierPayments} type="out" />
                  <MoneyRow label="Shop Expense" data={aggregated.expenses} type="out" />
                  <MoneyRow label="Employee Salary" data={aggregated.employeeSalary} type="out" />
                  <MoneyRow label="Third-party Payment" data={aggregated.thirdPartyPayments} type="out" />
                  <MoneyRow label="Sale Return Refund" data={aggregated.saleReturnRefunds} type="out" />
                </TableBody>
                <TableFooter>
                  <MoneyRow label="Total Outward" data={totalOut} highlight type="out" />
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Day close lives on its own page (Account Tally) ═══ */}
      <Card className="border-[1.5px] border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/20">
        <CardContent className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-bold text-teal-800 dark:text-teal-300">
              <Wallet className="h-5 w-5" /> Day close (cash count, handover, closing balance)
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {snapshot
                ? `Closed: counted ${fmt(physicalCash)}, ${difference === 0 ? "balanced" : difference > 0 ? `excess ${fmt(difference)}` : `short ${fmt(Math.abs(difference))}`}, owner ${fmt(Number(snapshot.handover_to_owner) || 0)}, bank ${fmt(depositToBank)}, closing ${fmt(leaveInDrawer)}.`
                : `Not closed yet. Cash should be in drawer: ${fmt(expectedCash)}.`}
            </p>
          </div>
          <Button
            onClick={() => orgNavigate("/account-tally")}
            className="shrink-0 gap-2 bg-teal-700 hover:bg-teal-800 text-white"
          >
            <Wallet className="h-4 w-4" /> {snapshot ? "Open Account Tally" : "Close the day"}
          </Button>
        </CardContent>
      </Card>
      </>
      )}

      {/* Print-only component (hidden) */}
      <div className="hidden">
        <DailyTallyReport
          ref={printRef}
          date={selectedDate}
          businessName={settings?.business_name || currentOrganization?.name || ""}
          aggregated={aggregated}
          totalIn={totalIn}
          totalOut={totalOut}
          openingCash={openingCash}
          expectedCash={expectedCash}
          physicalCash={physicalCash}
          difference={difference}
          leaveInDrawer={leaveInDrawer}
          depositToBank={depositToBank}
          handoverToOwner={handoverToOwner}
          notes={notesForReport}
        />
      </div>
    </div>
  );
};

export default DailyTally;
