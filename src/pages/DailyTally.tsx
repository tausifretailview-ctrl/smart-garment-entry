import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
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
  CheckCircle2, AlertTriangle, XCircle, Clock,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useReactToPrint } from "react-to-print";
import DailyTallyReport from "@/components/DailyTallyReport";
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
  const { user } = useAuth();
  const { isAdmin, isManager } = useUserRoles();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [openingCash, setOpeningCash] = useState(0);
  const [physicalCash, setPhysicalCash] = useState(0);
  const [leaveInDrawer, setLeaveInDrawer] = useState(0);
  const [depositToBank, setDepositToBank] = useState(0);
  const [notes, setNotes] = useState("");
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>({ ...DEFAULT_DENOM_COUNTS });
  const [coinsBulk, setCoinsBulk] = useState(0);
  const [tallyTab, setTallyTab] = useState<string>("manual");

  const orgId = currentOrganization?.id;
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const canEditAnyDate = isAdmin || isManager;

  // ─── Data queries ──────────────────────────────────────────────────
  const startISO = `${dateStr}T00:00:00`;
  const endISO = `${dateStr}T23:59:59`;

  const REPORT_CACHE = { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false as const };

  // Sales (POS + Invoice) — FIX 1: static import
  const { data: salesData, isLoading: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: ["daily-tally-sales", orgId, dateStr],
    queryFn: async () => {
      return fetchAllSalesWithFilters(orgId!, { startDate: startISO, endDate: endISO });
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
        .select("id, voucher_number, voucher_date, voucher_type, total_amount, description, reference_type, category")
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

  // Settings (business name)
  const { data: settings } = useQuery({
    queryKey: ["settings", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("business_name").eq("organization_id", orgId!).maybeSingle();
      return data;
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

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
    const saleReturnRefunds = emptyBreakdown();

    const isHoldLikeSale = (s: any) => {
      if (s?.payment_status === "hold") return true;
      return s?.payment_status === "pending" && String(s?.sale_number || "").startsWith("Hold/");
    };

    const getEffectiveNet = (s: any) => Number(s?.net_amount) || 0;

    // Process sales (exclude hold/cancelled-like rows to match POS dashboard)
    (salesData || []).forEach((s: any) => {
      if (isHoldLikeSale(s)) return;
      const net = getEffectiveNet(s);
      const target = s.sale_type === "pos" ? posSales : invoiceSales;
      if (s.payment_method === "multiple") {
        target.cash += Number(s.cash_amount) || 0;
        target.card += Number(s.card_amount) || 0;
        target.upi += Number(s.upi_amount) || 0;
      } else {
        switch (s.payment_method) {
          case "cash": target.cash += Number(s.cash_amount) || net; break;
          case "card": target.card += Number(s.card_amount) || net; break;
          case "upi": target.upi += Number(s.upi_amount) || net; break;
          case "pay_later": target.credit += net; break;
          default: target.cash += net;
        }
      }
      target.total += net;
    });

    // Process vouchers — FIX 8: strict voucher_type check only for expenses
    (vouchersData || []).forEach((v: any) => {
      const amt = Number(v.total_amount) || 0;
      const mode = parsePaymentMode(v.description);
      const addToMode = (b: PaymentBreakdown) => {
        b[mode as keyof PaymentBreakdown] = (b[mode as keyof PaymentBreakdown] as number) + amt;
        b.total += amt;
      };

      if (v.voucher_type === "receipt") {
        addToMode(receipts);
      } else if (v.voucher_type === "payment" && v.reference_type === "supplier") {
        addToMode(supplierPayments);
      } else if (v.voucher_type === "payment" && v.reference_type === "employee") {
        addToMode(employeeSalary);
      } else if (v.voucher_type === "expense") {
        addToMode(expenses);
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

    return { posSales, invoiceSales, receipts, advances, supplierPayments, expenses, employeeSalary, saleReturnRefunds };
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
    [aggregated.supplierPayments, aggregated.expenses, aggregated.employeeSalary, aggregated.saleReturnRefunds].forEach(s => {
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

  // ─── Save snapshot ─────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      // FIX 4: Include denomination_data in snapshot
      const payload = {
        organization_id: orgId!,
        tally_date: dateStr,
        opening_cash: openingCash,
        expected_cash: expectedCash,
        physical_cash: physicalCash,
        difference_amount: difference,
        leave_in_drawer: leaveInDrawer,
        deposit_to_bank: depositToBank,
        handover_to_owner: handoverToOwner,
        notes: notes || null,
        created_by: user?.id || null,
        denomination_data: JSON.stringify({ counts: denomCounts, coins: coinsBulk, total: denomTotal }),
      };

      // Upsert
      const { error } = await supabase
        .from("daily_tally_snapshot")
        .upsert(payload, { onConflict: "organization_id,tally_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily tally snapshot saved");
      refetchSnapshot();
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

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
  const handleExportExcel = useCallback(() => {
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
      ["Sale Return Refund", aggregated.saleReturnRefunds.cash, aggregated.saleReturnRefunds.upi, aggregated.saleReturnRefunds.card, aggregated.saleReturnRefunds.bank, aggregated.saleReturnRefunds.credit, aggregated.saleReturnRefunds.total],
      ["Total Outward", totalOut.cash, totalOut.upi, totalOut.card, totalOut.bank, totalOut.credit, totalOut.total],
      [],
      ["CASH RECONCILIATION"],
      ["Opening Cash", openingCash],
      ["Expected Cash", expectedCash],
      ["Physical Cash", physicalCash],
      ["Difference", difference],
      [],
      ["SETTLEMENT"],
      ["Leave in Drawer", leaveInDrawer],
      ["Deposit to Bank", depositToBank],
      ["Handover to Owner", handoverToOwner],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Tally");
    XLSX.writeFile(wb, `Daily_Tally_${dateStr}.xlsx`);
  }, [selectedDate, aggregated, totalIn, totalOut, openingCash, expectedCash, physicalCash, difference, leaveInDrawer, depositToBank, handoverToOwner, settings, dateStr]);

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

  // ─── Hero card data — FIX 2: Total Collection = actual collected, add Credit Extended card ─
  const heroCards = [
    { title: "Total Sales", value: totalSales, icon: IndianRupee, borderColor: "border-l-emerald-600", iconBg: "bg-emerald-100 dark:bg-emerald-900/40", iconColor: "text-emerald-600" },
    { title: "Total Collection", value: actualCollected, icon: ArrowDownLeft, borderColor: "border-l-blue-600", iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-600" },
    { title: "Total Payments", value: totalPaymentsOut, icon: ArrowUpRight, borderColor: "border-l-rose-600", iconBg: "bg-rose-100 dark:bg-rose-900/40", iconColor: "text-rose-600" },
    { title: "Net Movement", value: netMovement, icon: TrendingUp, borderColor: netMovement >= 0 ? "border-l-emerald-600" : "border-l-rose-600", iconBg: netMovement >= 0 ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-rose-100 dark:bg-rose-900/40", iconColor: netMovement >= 0 ? "text-emerald-600" : "text-rose-600" },
    { title: "Credit Extended", value: totalIn.credit, icon: Clock, borderColor: "border-l-amber-500", iconBg: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-600" },
  ];

  const moneyInChartData = useMemo(() => ([
    { name: "POS Sales", value: aggregated.posSales.total, color: "#3b82f6" },
    { name: "Sales Invoice", value: aggregated.invoiceSales.total, color: "#10b981" },
    { name: "Old Balance Received", value: aggregated.receipts.total, color: "#a855f7" },
    { name: "Advance Received", value: aggregated.advances.total, color: "#f59e0b" },
  ]), [aggregated]);
  const hasMoneyInChartData = moneyInChartData.some((d) => d.value > 0);

  const moneyOutChartData = useMemo(() => {
    const data = [
      { name: "Supplier Payments", value: aggregated.supplierPayments.total, color: "#ef4444" },
      { name: "Shop Expenses", value: aggregated.expenses.total, color: "#ec4899" },
      { name: "Employee Salary", value: aggregated.employeeSalary.total, color: "#eab308" },
      { name: "Sale Return Refunds", value: aggregated.saleReturnRefunds.total, color: "#6b7280" },
      // Present in some tally variants; keep screen-only chart resilient without touching data flow.
      { name: "Advance Refunds", value: Number((aggregated as any)?.advanceRefunds?.total || 0), color: "#06b6d4" },
    ];
    return data.filter((d) => d.name !== "Advance Refunds" || d.value > 0);
  }, [aggregated]);
  const hasMoneyOutChartData = moneyOutChartData.some((d) => d.value > 0);

  const paymentModeChartData = useMemo(() => ([
    { name: "Money In", cash: totalIn.cash, upi: totalIn.upi, card: totalIn.card, bank: totalIn.bank },
    { name: "Money Out", cash: totalOut.cash, upi: totalOut.upi, card: totalOut.card, bank: totalOut.bank },
  ]), [totalIn, totalOut]);

  const handleChartSliceClick = (entry: any) => {
    toast.info(`${entry?.name || "Amount"}: ${fmt(Number(entry?.value || 0))}`);
  };

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
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
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading} className="border-[1.5px] border-slate-200 dark:border-slate-700">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button variant="outline" className="gap-2 border-[1.5px] border-slate-200 dark:border-slate-700" onClick={() => handlePrint()}>
            <Printer className="h-4 w-4" /> Print
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[1,2,3,4,5].map(i => (
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {heroCards.map((c) => (
          <Card key={c.title} className={cn("border-[1.5px] border-slate-200 dark:border-slate-700 border-l-4 hover:shadow-lg transition-shadow", c.borderColor)}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">{c.title}</span>
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
      <div className="print:hidden grid grid-cols-1 lg:grid-cols-3 gap-4">
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
            <CardTitle className="text-base">Money Out by Source</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {!hasMoneyOutChartData ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No money out today
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={moneyOutChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    onClick={handleChartSliceClick}
                  >
                    {moneyOutChartData.map((entry) => (
                      <Cell key={`out-${entry.name}`} fill={entry.color} />
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
            <CardTitle className="text-base">Payment Modes</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentModeChartData} margin={{ top: 8, right: 12, left: 0, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <RechartsTooltip formatter={(value: number, name: string) => [fmt(Number(value || 0)), name]} />
                <Legend verticalAlign="bottom" height={24} />
                <Bar dataKey="cash" stackId="a" fill="#22c55e" name="Cash" />
                <Bar dataKey="upi" stackId="a" fill="#3b82f6" name="UPI" />
                <Bar dataKey="card" stackId="a" fill="#a855f7" name="Card" />
                <Bar dataKey="bank" stackId="a" fill="#f59e0b" name="Bank" />
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

      {/* ═══ Cash Reconciliation ═══ */}
      <Card className="border-[1.5px] border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold">
            <Wallet className="h-5 w-5 text-indigo-600" /> Cash Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left — Expected */}
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">
                  Opening Cash
                  {!snapshot && yesterdaySnapshot ? (
                    <span className="ml-2 text-xs normal-case tracking-normal font-normal text-indigo-600">(Yesterday's closing balance)</span>
                  ) : null}
                </label>
                <Input
                  type="number"
                  value={openingCash || ""}
                  onChange={(e) => setOpeningCash(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="text-lg font-bold tabular-nums"
                />
              </div>
              {/* FIX 7: Improved Expected Cash formula label */}
              <div className="rounded-lg border-[1.5px] border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">Expected Cash</p>
                <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{fmt(expectedCash)}</p>
                <div className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Opening Cash</span><span className="tabular-nums">{fmt(openingCash)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>+ Cash In (POS+Invoice+RCP+Adv)</span><span className="tabular-nums">{fmt(totalIn.cash)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600">
                    <span>− Cash Out (Expenses+Supplier+Salary)</span><span className="tabular-nums">{fmt(totalOut.cash)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-600 pt-1">
                    <span>= Expected Cash</span><span className="tabular-nums">{fmt(expectedCash)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — Physical Tally (Tabbed) */}
            <div className="space-y-4">
              <Tabs value={tallyTab} onValueChange={setTallyTab}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Physical Cash Counted</label>
                  <TabsList className="h-8">
                    <TabsTrigger value="manual" className="text-xs px-3 py-1">Manual</TabsTrigger>
                    <TabsTrigger value="denomination" className="text-xs px-3 py-1">Denomination</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="manual" className="mt-0">
                  <Input
                    type="number"
                    value={physicalCash || ""}
                    onChange={(e) => setPhysicalCash(Number(e.target.value) || 0)}
                    placeholder="0.00"
                    className="text-lg font-bold tabular-nums"
                  />
                </TabsContent>

                <TabsContent value="denomination" className="mt-0">
                  <div className="rounded-lg border-[1.5px] border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 p-4 space-y-3">
                    {/* Callout */}
                    <div className="border-l-4 border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 rounded-r-md px-3 py-2">
                      <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                        🧮 Physical Tally (Blind Count) — Count what's in your drawer. Don't rely on system figures.
                      </p>
                    </div>
                    {/* Denomination rows — FIX 5: includes ₹20 and ₹10 */}
                    <div className="space-y-2">
                      {DENOMINATIONS.map((denom) => (
                        <div key={denom} className="flex items-center gap-3 py-1.5">
                          <span className="bg-slate-100 dark:bg-slate-700 rounded-md px-3 py-1.5 font-bold text-sm tabular-nums min-w-[80px] text-center text-slate-800 dark:text-slate-200">
                            ₹ {denom.toLocaleString("en-IN")}
                          </span>
                          <span className="text-slate-400 font-medium">×</span>
                          <Input
                            type="number"
                            min={0}
                            value={denomCounts[denom] || ""}
                            onChange={(e) => setDenomCounts(prev => ({ ...prev, [denom]: Number(e.target.value) || 0 }))}
                            className="h-11 w-24 text-center text-lg font-bold tabular-nums"
                            placeholder="0"
                          />
                          <span className="text-slate-400 font-medium">=</span>
                          <span className="text-right tabular-nums font-semibold text-sm text-slate-700 dark:text-slate-300 min-w-[100px]">
                            {fmt(denom * (denomCounts[denom] || 0))}
                          </span>
                        </div>
                      ))}
                      {/* Coins / small notes bulk entry */}
                      <div className="flex items-center gap-3 py-1.5 border-t border-slate-200 dark:border-slate-600 pt-3">
                        <span className="bg-slate-100 dark:bg-slate-700 rounded-md px-3 py-1.5 font-bold text-sm min-w-[80px] text-center text-slate-800 dark:text-slate-200">
                          Coins
                        </span>
                        <span className="text-slate-400 font-medium invisible">×</span>
                        <Input
                          type="number"
                          min={0}
                          value={coinsBulk || ""}
                          onChange={(e) => setCoinsBulk(Number(e.target.value) || 0)}
                          className="h-11 w-24 text-center text-lg font-bold tabular-nums"
                          placeholder="₹"
                        />
                        <span className="text-slate-400 font-medium invisible">=</span>
                        <span className="text-right tabular-nums font-semibold text-sm text-slate-700 dark:text-slate-300 min-w-[100px]">
                          {fmt(coinsBulk)}
                        </span>
                      </div>
                    </div>
                    {/* Denomination Total */}
                    <div className="border-t-2 border-indigo-200 dark:border-indigo-800 pt-3 flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Total Physical Cash</span>
                      <span className="text-2xl font-bold tabular-nums text-indigo-700 dark:text-indigo-400">{fmt(denomTotal)}</span>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* ═══ Variance Shield ═══ */}
              <div className={cn(
                "rounded-lg border-2 p-5 text-center",
                Math.abs(difference) === 0 ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" :
                Math.abs(difference) <= 100 ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" :
                "border-red-600 bg-red-50 dark:bg-red-950/30 animate-pulse"
              )}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  {Math.abs(difference) === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : Math.abs(difference) <= 100 ? (
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <p className={cn(
                    "text-xs uppercase tracking-wider font-bold",
                    Math.abs(difference) === 0 ? "text-emerald-700 dark:text-emerald-400" :
                    Math.abs(difference) <= 100 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"
                  )}>
                    {Math.abs(difference) === 0 ? "Cash Balanced" : Math.abs(difference) <= 100 ? "Minor Variance" : "Cash Mismatch"}
                  </p>
                </div>
                <p className={cn(
                  "text-4xl font-bold tabular-nums",
                  Math.abs(difference) === 0 ? "text-emerald-700 dark:text-emerald-400" :
                  Math.abs(difference) <= 100 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"
                )}>
                  {difference >= 0 ? "+" : ""}{fmt(difference)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 tabular-nums">
                  Physical ({fmt(physicalCash)}) − Expected ({fmt(expectedCash)})
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Settlement ═══ */}
      <Card className="border-[1.5px] border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold">
            <TrendingDown className="h-5 w-5 text-indigo-600" /> Settlement (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">Leave in Drawer</label>
              <Input type="number" value={leaveInDrawer || ""} onChange={(e) => setLeaveInDrawer(Number(e.target.value) || 0)} placeholder="0.00" className="font-semibold tabular-nums" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">Deposit to Bank</label>
              <Input type="number" value={depositToBank || ""} onChange={(e) => setDepositToBank(Number(e.target.value) || 0)} placeholder="0.00" className="font-semibold tabular-nums" />
            </div>
            {/* FIX 6: Conditional styling for negative handover */}
            <div>
              <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">Handover to Owner</label>
              <div className={cn(
                "rounded-lg border-[1.5px] p-3",
                handoverToOwner < 0
                  ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
                  : "border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30"
              )}>
                <p className={cn(
                  "text-xl font-bold tabular-nums",
                  handoverToOwner < 0 ? "text-red-700 dark:text-red-400" : "text-indigo-700 dark:text-indigo-400"
                )}>{fmt(handoverToOwner)}</p>
                <p className={cn(
                  "text-xs font-medium",
                  handoverToOwner < 0 ? "text-red-500 dark:text-red-400" : "text-indigo-500 dark:text-indigo-400"
                )}>
                  {handoverToOwner < 0 ? "⚠️ Over-allocated — reduce Drawer or Bank" : "Auto-calculated"}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional settlement notes…" rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* UI-1: Day-End Cash Summary strip */}
      <Card className="border-[1.5px] border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
        <CardContent className="py-4">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-3">Day-End Cash Summary</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Opening Cash", value: openingCash, color: "text-slate-700 dark:text-slate-300" },
              { label: "Cash In", value: totalIn.cash, color: "text-emerald-700 dark:text-emerald-400" },
              { label: "Cash Out", value: totalOut.cash, color: "text-red-700 dark:text-red-400" },
              { label: "Expected Closing", value: expectedCash, color: "text-indigo-700 dark:text-indigo-400" },
              { label: "Physical Counted", value: physicalCash, color: difference === 0 ? "text-emerald-700 dark:text-emerald-400" : Math.abs(difference) <= 100 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400" },
            ].map(item => (
              <div key={item.label} className="text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{item.label}</p>
                <p className={cn("text-lg font-bold tabular-nums", item.color)}>{fmt(item.value)}</p>
              </div>
            ))}
          </div>
          {difference !== 0 && (
            <div className={cn(
              "mt-3 text-center text-sm font-semibold rounded-md py-1.5",
              difference > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"
            )}>
              {difference > 0 ? `Cash surplus: +${fmt(difference)}` : `Cash shortage: ${fmt(difference)}`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Save Snapshot — "The Final Touch" ═══ */}
      <div className="flex justify-center pt-2">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="h-12 px-8 text-base font-semibold rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-150 gap-2"
        >
          <Save className="h-5 w-5" /> Save Snapshot
        </Button>
      </div>
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
          notes={notes}
        />
      </div>
    </div>
  );
};

export default DailyTally;
