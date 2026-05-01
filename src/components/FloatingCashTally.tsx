import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, isToday } from "date-fns";
import {
  CalendarIcon, Save, Printer, RefreshCw, Send,
  ArrowDownLeft, ArrowUpRight, Wallet, X,
  CheckCircle2, AlertTriangle, XCircle, IndianRupee,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import DailyTallyReport from "@/components/DailyTallyReport";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";

// ─── helpers ───────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(n);

// Use actual payment_method if available, fallback to parsing description
const resolvePaymentMode = (paymentMethod: string | null, description: string): keyof Omit<PaymentBreakdown, 'total' | 'credit'> => {
  const pm = (paymentMethod || '').toLowerCase().trim();
  if (pm === 'upi') return 'upi';
  if (pm === 'card') return 'card';
  if (pm === 'bank' || pm === 'cheque' || pm === 'neft' || pm === 'rtgs' || pm === 'bank_transfer') return 'bank';
  if (pm === 'cash') return 'cash';
  // Fallback: parse description
  const d = (description || '').toLowerCase();
  if (d.includes('upi')) return 'upi';
  if (d.includes('card')) return 'card';
  if (d.includes('cheque') || d.includes('bank') || d.includes('neft') || d.includes('rtgs')) return 'bank';
  return 'cash';
};

interface PaymentBreakdown {
  cash: number; upi: number; card: number; bank: number; credit: number; total: number;
}
const emptyBreakdown = (): PaymentBreakdown => ({ cash: 0, upi: 0, card: 0, bank: 0, credit: 0, total: 0 });

const DENOMINATIONS = [2000, 500, 200, 100, 50] as const;
const DEFAULT_DENOM_COUNTS: Record<number, number> = { 2000: 0, 500: 0, 200: 0, 100: 0, 50: 0 };

interface FloatingCashTallyProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FloatingCashTally = ({ open, onOpenChange }: FloatingCashTallyProps) => {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { sendWhatsApp } = useWhatsAppSend();
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [openingCash, setOpeningCash] = useState(0);
  const [physicalCash, setPhysicalCash] = useState(0);
  const [leaveInDrawer, setLeaveInDrawer] = useState(0);
  const [depositToBank, setDepositToBank] = useState(0);
  const [notes, setNotes] = useState("");
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>({ ...DEFAULT_DENOM_COUNTS });
  const [coinsBulk, setCoinsBulk] = useState(0);
  const [tallyTab, setTallyTab] = useState<string>("denomination");
  const [showSaved, setShowSaved] = useState(false);

  const orgId = currentOrganization?.id;
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // ─── Data queries ──────────────────────────────────────────────────
  const startISO = `${dateStr}T00:00:00`;
  const endISO = `${dateStr}T23:59:59`;

  const { data: salesData, refetch: refetchSales } = useQuery({
    queryKey: ["daily-tally-sales", orgId, dateStr],
    queryFn: async () => {
      const { fetchAllSalesWithFilters } = await import("@/utils/fetchAllRows");
      return fetchAllSalesWithFilters(orgId!, { startDate: startISO, endDate: endISO });
    },
    enabled: !!orgId && open,
  });

  const { data: vouchersData, refetch: refetchVouchers } = useQuery({
    queryKey: ["daily-tally-vouchers", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("id, voucher_number, voucher_date, voucher_type, total_amount, description, reference_type, category, payment_method")
        .eq("organization_id", orgId!)
        .is("deleted_at", null)
        .gte("voucher_date", dateStr)
        .lte("voucher_date", dateStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId && open,
  });

  const { data: advancesData, refetch: refetchAdvances } = useQuery({
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
    enabled: !!orgId && open,
  });

  const { data: refundsData, refetch: refetchRefunds } = useQuery({
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
    enabled: !!orgId && open,
  });

  const { data: advanceRefundsData, refetch: refetchAdvanceRefunds } = useQuery({
    queryKey: ["daily-tally-advance-refunds", orgId, dateStr],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("advance_refunds")
          .select("id, refund_amount, payment_method, refund_date")
          .eq("organization_id", orgId!)
          .eq("refund_date", dateStr);
        if (error) return [];
        return data || [];
      } catch { return []; }
    },
    enabled: !!orgId && open,
  });

  const { data: snapshot, refetch: refetchSnapshot } = useQuery({
    queryKey: ["daily-tally-snapshot", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .select("opening_cash, physical_cash, expected_cash, difference_amount, denomination_data, deposit_to_bank, handover_to_owner, leave_in_drawer, notes, tally_date")
        .eq("organization_id", orgId!)
        .eq("tally_date", dateStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && open,
  });

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
    enabled: !!orgId && open,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("sale_settings, business_name").eq("organization_id", orgId!).maybeSingle();
      return data;
    },
    enabled: !!orgId && open,
  });

  // ─── Denomination total ────────────────────────────────────────────
  const denomTotal = useMemo(() => {
    let total = 0;
    for (const denom of DENOMINATIONS) {
      total += denom * (denomCounts[denom] || 0);
    }
    total += coinsBulk;
    return total;
  }, [denomCounts, coinsBulk]);

  useEffect(() => {
    if (tallyTab === "denomination") {
      setPhysicalCash(denomTotal);
    }
  }, [denomTotal, tallyTab]);

  // ─── Load snapshot values ──────────────────────────────────────────
  useEffect(() => {
    if (snapshot) {
      setOpeningCash(Number(snapshot.opening_cash) || 0);
      setPhysicalCash(Number(snapshot.physical_cash) || 0);
      setLeaveInDrawer(Number(snapshot.leave_in_drawer) || 0);
      setDepositToBank(Number(snapshot.deposit_to_bank) || 0);
      setNotes(snapshot.notes || "");
      // Restore denomination data if saved
      const denomData = (snapshot as any)?.denomination_data;
      if (denomData && denomData.denomCounts) {
        setDenomCounts(denomData.denomCounts);
        setCoinsBulk(denomData.coinsBulk || 0);
      } else {
        setDenomCounts({ ...DEFAULT_DENOM_COUNTS });
        setCoinsBulk(0);
      }
    } else {
      const yesterdayClosing = Number(yesterdaySnapshot?.leave_in_drawer) || 0;
      setOpeningCash(yesterdayClosing);
      setPhysicalCash(0);
      setLeaveInDrawer(0);
      setDepositToBank(0);
      setNotes("");
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
    const advanceRefunds = emptyBreakdown();

    const isHoldLikeSale = (s: any) => {
      if (s?.payment_status === "hold") return true;
      return s?.payment_status === "pending" && String(s?.sale_number || "").startsWith("Hold/");
    };

    /** Use saved bill total — manual rate edits don't populate discount_* columns. */
    const getEffectiveNet = (s: any) => Number(s?.net_amount) || 0;

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

    (vouchersData || []).forEach((v: any) => {
      const amt = Number(v.total_amount) || 0;
      if (amt <= 0) return;
      // Skip non-cash adjustments
      const pm = (v.payment_method || '').toLowerCase();
      if (pm === 'advance_adjustment' || pm === 'credit_note' || pm === 'advance') return;

      const mode = resolvePaymentMode(v.payment_method, v.description);
      const addToBreakdown = (b: PaymentBreakdown) => {
        (b as any)[mode] += amt;
        b.total += amt;
      };

      if (v.voucher_type === 'receipt') {
        addToBreakdown(receipts);
      } else if (v.voucher_type === 'payment') {
        if (v.reference_type === 'supplier') addToBreakdown(supplierPayments);
        else if (v.reference_type === 'employee') addToBreakdown(employeeSalary);
        else if (v.reference_type === 'customer') addToBreakdown(saleReturnRefunds);
      } else if (v.voucher_type === 'expense' || v.category === 'expense') {
        addToBreakdown(expenses);
      }
    });

    (advancesData || []).forEach((a: any) => {
      const amt = Number(a.amount) || 0;
      const mode = (a.payment_method || "cash").toLowerCase();
      if (mode === "upi") advances.upi += amt;
      else if (mode === "card") advances.card += amt;
      else if (mode === "bank" || mode === "cheque") advances.bank += amt;
      else advances.cash += amt;
      advances.total += amt;
    });

    (refundsData || []).forEach((r: any) => {
      const refundType = (r.refund_type || '').toLowerCase();
      if (refundType === 'cash_refund' || refundType === 'upi_refund' || refundType === 'bank_refund' || refundType === 'card_refund') {
        const amt = Number(r.net_amount) || 0;
        if (refundType === 'upi_refund') saleReturnRefunds.upi += amt;
        else if (refundType === 'bank_refund') saleReturnRefunds.bank += amt;
        else if (refundType === 'card_refund') saleReturnRefunds.card += amt;
        else saleReturnRefunds.cash += amt;
        saleReturnRefunds.total += amt;
      }
    });

    (advanceRefundsData || []).forEach((r: any) => {
      const amt = Number(r.refund_amount) || 0;
      if (amt <= 0) return;
      const mode = resolvePaymentMode(r.payment_method, '');
      (advanceRefunds as any)[mode] += amt;
      advanceRefunds.total += amt;
    });

    return { posSales, invoiceSales, receipts, advances, supplierPayments, expenses, employeeSalary, saleReturnRefunds, advanceRefunds };
  }, [salesData, vouchersData, advancesData, refundsData, advanceRefundsData]);

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
    [aggregated.supplierPayments, aggregated.expenses, aggregated.employeeSalary, aggregated.saleReturnRefunds, aggregated.advanceRefunds].forEach(s => {
      b.cash += s.cash; b.upi += s.upi; b.card += s.card; b.bank += s.bank; b.credit += s.credit; b.total += s.total;
    });
    return b;
  }, [aggregated]);

  const totalSales = aggregated.posSales.total + aggregated.invoiceSales.total;
  const expectedCash = openingCash + totalIn.cash - totalOut.cash;
  const difference = physicalCash - expectedCash;
  const handoverToOwner = physicalCash - leaveInDrawer - depositToBank;

  // ─── Save snapshot ─────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
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
        denomination_data: { denomCounts, coinsBulk } as any,
      };
      const { error } = await supabase
        .from("daily_tally_snapshot")
        .upsert(payload as any, { onConflict: "organization_id,tally_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily tally snapshot saved");
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
      refetchSnapshot();
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  const handleRefresh = useCallback(() => {
    refetchSales(); refetchVouchers(); refetchAdvances(); refetchRefunds(); refetchAdvanceRefunds(); refetchSnapshot();
    toast.success("Data refreshed");
  }, [refetchSales, refetchVouchers, refetchAdvances, refetchRefunds, refetchAdvanceRefunds, refetchSnapshot]);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  // ─── WhatsApp to Owner ─────────────────────────────────────────────
  const handleWhatsAppOwner = useCallback(() => {
    const ownerPhone = (settings as any)?.owner_phone || (settings as any)?.mobile_number || "";
    if (!ownerPhone) {
      toast.error("Owner phone number not set in Settings");
      return;
    }
    const businessName = settings?.business_name || currentOrganization?.name || "Store";
    const dateLabel = format(selectedDate, "dd MMM yyyy");
    const message = `📊 *${businessName} — Daily Tally*\n📅 ${dateLabel}\n\n` +
      `💰 *Total Sales:* ${fmt(totalSales)}\n` +
      `📥 *Total Collection:* ${fmt(totalIn.total)}\n` +
      `📤 *Total Payments:* ${fmt(totalOut.total)}\n` +
      `📊 *Net Movement:* ${fmt(totalIn.total - totalOut.total)}\n\n` +
      `🏦 *Cash Reconciliation:*\n` +
      `  Opening: ${fmt(openingCash)}\n` +
      `  Expected: ${fmt(expectedCash)}\n` +
      `  Physical: ${fmt(physicalCash)}\n` +
      `  Difference: ${difference >= 0 ? "+" : ""}${fmt(difference)}\n\n` +
      `📋 *Settlement:*\n` +
      `  Drawer: ${fmt(leaveInDrawer)}\n` +
      `  Bank Deposit: ${fmt(depositToBank)}\n` +
      `  *Handover: ${fmt(handoverToOwner)}*\n` +
      (notes ? `\n📝 Notes: ${notes}` : "");

    sendWhatsApp(ownerPhone, message);
  }, [settings, currentOrganization, selectedDate, totalSales, totalIn, totalOut, openingCash, expectedCash, physicalCash, difference, leaveInDrawer, depositToBank, handoverToOwner, notes, sendWhatsApp]);

  // Compact row helper
  const CompactRow = ({ label, amount, color }: { label: string; amount: number; color?: string }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <span className={cn("text-base font-bold tabular-nums", color || "text-slate-900 dark:text-slate-100")}>{fmt(amount)}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-slate-100">
              <Wallet className="h-5 w-5 text-indigo-600" /> Cash Tally
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-slate-200 dark:border-slate-700">
                    <CalendarIcon className="h-3 w-3" />
                    {isToday(selectedDate) ? "Today" : format(selectedDate, "dd MMM")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh}>
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-100 dark:hover:bg-red-900/30" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="p-4 space-y-4">
            {/* ═══ Quick Summary ═══ */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 border-l-4 border-l-emerald-600 p-3">
                <p className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400">Total Sales</p>
                <p className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{fmt(totalSales)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 border-l-4 border-l-blue-600 p-3">
                <p className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400">Net Movement</p>
                <p className={cn("text-xl font-extrabold tabular-nums", (totalIn.total - totalOut.total) >= 0 ? "text-emerald-700" : "text-rose-700")}>
                  {fmt(totalIn.total - totalOut.total)}
                </p>
              </div>
            </div>

            {/* ═══ Money In / Out Summary ═══ */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <ArrowDownLeft className="h-3.5 w-3.5" /> Money In — {fmt(totalIn.total)}
                </p>
              </div>
              <div className="px-3 py-1.5">
                <CompactRow label="POS Sales" amount={aggregated.posSales.total} color="text-emerald-600" />
                <CompactRow label="Sales Invoice" amount={aggregated.invoiceSales.total} color="text-emerald-600" />
                <CompactRow label="Old Balance Received" amount={aggregated.receipts.total} color="text-emerald-600" />
                <CompactRow label="Advance Received" amount={aggregated.advances.total} color="text-emerald-600" />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="bg-rose-50 dark:bg-rose-950/30 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <p className="text-sm font-extrabold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <ArrowUpRight className="h-3.5 w-3.5" /> Money Out — {fmt(totalOut.total)}
                </p>
              </div>
              <div className="px-3 py-1.5">
                <CompactRow label="Supplier Payment" amount={aggregated.supplierPayments.total} color="text-rose-600" />
                <CompactRow label="Shop Expense" amount={aggregated.expenses.total} color="text-rose-600" />
                <CompactRow label="Employee Salary" amount={aggregated.employeeSalary.total} color="text-rose-600" />
                <CompactRow label="Sale Return Refund" amount={aggregated.saleReturnRefunds.total} color="text-rose-600" />
              </div>
            </div>

            {/* ═══ Cash Reconciliation ═══ */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <p className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <IndianRupee className="h-4 w-4 text-indigo-600" /> Cash Reconciliation
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400 block mb-1">Opening Cash</label>
                  <Input type="number" value={openingCash || ""} onChange={(e) => setOpeningCash(Number(e.target.value) || 0)} placeholder="0.00" className="h-10 text-base font-bold tabular-nums" />
                </div>
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/50 p-2">
                  <p className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400">Expected Cash</p>
                  <p className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{fmt(expectedCash)}</p>
                </div>
              </div>

              {/* Physical Cash Tally */}
              <Tabs value={tallyTab} onValueChange={setTallyTab}>
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400">Physical Cash</label>
                  <TabsList className="h-7">
                    <TabsTrigger value="manual" className="text-[10px] px-2 py-0.5 h-5">Manual</TabsTrigger>
                    <TabsTrigger value="denomination" className="text-[10px] px-2 py-0.5 h-5">Denomination</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="manual" className="mt-2">
                  <Input type="number" value={physicalCash || ""} onChange={(e) => setPhysicalCash(Number(e.target.value) || 0)} placeholder="0.00" className="h-9 text-sm font-bold tabular-nums" />
                </TabsContent>
                <TabsContent value="denomination" className="mt-2">
                  <div className="rounded-md bg-slate-50 dark:bg-slate-800/30 p-3 space-y-2">
                    {DENOMINATIONS.map((denom) => (
                      <div key={denom} className="flex items-center gap-2">
                        <span className="bg-slate-200 dark:bg-slate-700 rounded px-2 py-1 text-sm font-extrabold tabular-nums min-w-[60px] text-center text-slate-800 dark:text-slate-200">₹{denom}</span>
                        <span className="text-slate-500 text-sm font-medium">×</span>
                        <Input type="number" min={0} value={denomCounts[denom] || ""} onChange={(e) => setDenomCounts(prev => ({ ...prev, [denom]: Number(e.target.value) || 0 }))} className="h-9 w-16 text-center text-base font-bold tabular-nums" placeholder="0" />
                        <span className="text-slate-500 text-sm font-medium">=</span>
                        <span className="text-right tabular-nums font-bold text-base text-slate-800 dark:text-slate-200 min-w-[100px]">{fmt(denom * (denomCounts[denom] || 0))}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-600 pt-2">
                      <span className="bg-slate-200 dark:bg-slate-700 rounded px-2 py-1 text-xs font-bold min-w-[56px] text-center">Coins</span>
                      <span className="text-slate-400 text-xs invisible">×</span>
                      <Input type="number" min={0} value={coinsBulk || ""} onChange={(e) => setCoinsBulk(Number(e.target.value) || 0)} className="h-8 w-16 text-center text-sm font-bold tabular-nums" placeholder="₹" />
                      <span className="text-slate-400 text-xs invisible">=</span>
                      <span className="text-right tabular-nums font-semibold text-sm text-slate-700 dark:text-slate-300 min-w-[100px]">{fmt(coinsBulk)}</span>
                    </div>
                    <div className="border-t-2 border-indigo-200 dark:border-indigo-800 pt-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Total</span>
                      <span className="text-xl font-bold tabular-nums text-indigo-700 dark:text-indigo-400">{fmt(denomTotal)}</span>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Variance Shield */}
              <div className={cn(
                "rounded-md border-2 p-3 text-center",
                Math.abs(difference) === 0 ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" :
                Math.abs(difference) <= 100 ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" :
                "border-red-600 bg-red-50 dark:bg-red-950/30"
              )}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {Math.abs(difference) === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> :
                   Math.abs(difference) <= 100 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> :
                   <XCircle className="h-4 w-4 text-red-600" />}
                  <p className={cn("text-[10px] uppercase tracking-wider font-bold",
                    Math.abs(difference) === 0 ? "text-emerald-700" : Math.abs(difference) <= 100 ? "text-amber-700" : "text-red-700"
                  )}>
                    {Math.abs(difference) === 0 ? "Cash Balanced" : Math.abs(difference) <= 100 ? "Minor Variance" : "Cash Mismatch"}
                  </p>
                </div>
                <p className={cn("text-2xl font-bold tabular-nums",
                  Math.abs(difference) === 0 ? "text-emerald-700" : Math.abs(difference) <= 100 ? "text-amber-700" : "text-red-700"
                )}>
                  {difference >= 0 ? "+" : ""}{fmt(difference)}
                </p>
              </div>
            </div>

            {/* ═══ Settlement ═══ */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <p className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">Settlement</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400 block mb-1">Drawer</label>
                  <Input type="number" value={leaveInDrawer || ""} onChange={(e) => setLeaveInDrawer(Number(e.target.value) || 0)} placeholder="0" className="h-9 text-sm font-bold tabular-nums" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400 block mb-1">Bank Deposit</label>
                  <Input type="number" value={depositToBank || ""} onChange={(e) => setDepositToBank(Number(e.target.value) || 0)} placeholder="0" className="h-9 text-sm font-bold tabular-nums" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400 block mb-1">Handover</label>
                  <div className="rounded-md bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-1.5">
                    <p className="text-base font-extrabold tabular-nums text-indigo-700 dark:text-indigo-400">{fmt(handoverToOwner)}</p>
                  </div>
                </div>
              </div>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes…" rows={1} className="text-xs" />
            </div>
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handlePrint()}>
              <Printer className="h-3 w-3" /> Print
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50" onClick={handleWhatsAppOwner}>
              <Send className="h-3 w-3" /> WhatsApp
            </Button>
          </div>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className={cn("h-8 text-xs gap-1 font-semibold", showSaved ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-indigo-700 hover:bg-indigo-800 text-white")}>
            {showSaved ? <><CheckCircle2 className="h-3 w-3" /> Saved</> : <><Save className="h-3 w-3" /> Save</>}
          </Button>
        </div>

        {/* Hidden print */}
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
      </DialogContent>
    </Dialog>
  );
};
