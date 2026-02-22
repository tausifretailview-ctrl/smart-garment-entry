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
import { format, isToday } from "date-fns";
import {
  CalendarIcon, RefreshCw, Save, Printer, FileSpreadsheet,
  TrendingUp, TrendingDown, Wallet, ArrowDownLeft, ArrowUpRight, IndianRupee,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useReactToPrint } from "react-to-print";
import DailyTallyReport from "@/components/DailyTallyReport";

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
  cash: number; upi: number; card: number; bank: number; total: number;
}
const emptyBreakdown = (): PaymentBreakdown => ({ cash: 0, upi: 0, card: 0, bank: 0, total: 0 });

const DENOMINATIONS = [2000, 500, 200, 100, 50] as const;
const DEFAULT_DENOM_COUNTS: Record<number, number> = { 2000: 0, 500: 0, 200: 0, 100: 0, 50: 0 };


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

  // Sales (POS + Invoice)
  const { data: salesData, isLoading: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: ["daily-tally-sales", orgId, dateStr],
    queryFn: async () => {
      const { fetchAllSalesWithFilters } = await import("@/utils/fetchAllRows");
      return fetchAllSalesWithFilters(orgId!, { startDate: startISO, endDate: endISO });
    },
    enabled: !!orgId,
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
  });

  // Snapshot
  const { data: snapshot, isLoading: snapshotLoading, refetch: refetchSnapshot } = useQuery({
    queryKey: ["daily-tally-snapshot", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .select("*")
        .eq("organization_id", orgId!)
        .eq("tally_date", dateStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
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
  });

  // Settings (business name)
  const { data: settings } = useQuery({
    queryKey: ["settings", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("*").eq("organization_id", orgId!).maybeSingle();
      return data;
    },
    enabled: !!orgId,
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
    } else {
      // Use yesterday's leave_in_drawer as today's opening cash
      const yesterdayClosing = Number(yesterdaySnapshot?.leave_in_drawer) || 0;
      setOpeningCash(yesterdayClosing);
      setPhysicalCash(0);
      setLeaveInDrawer(0);
      setDepositToBank(0);
      setNotes("");
    }
    // Reset denomination counts
    setDenomCounts({ ...DEFAULT_DENOM_COUNTS });
    setCoinsBulk(0);
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

    // Process sales
    (salesData || []).forEach((s: any) => {
      const net = Number(s.net_amount) || 0;
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
          case "pay_later": break; // credit — not a mode column
          default: target.cash += net;
        }
      }
      target.total += net;
    });

    // Process vouchers
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
      } else if (v.voucher_type === "expense" || v.reference_type === "expense") {
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
      b.cash += s.cash; b.upi += s.upi; b.card += s.card; b.bank += s.bank; b.total += s.total;
    });
    return b;
  }, [aggregated]);

  const totalOut = useMemo(() => {
    const b = emptyBreakdown();
    [aggregated.supplierPayments, aggregated.expenses, aggregated.employeeSalary, aggregated.saleReturnRefunds].forEach(s => {
      b.cash += s.cash; b.upi += s.upi; b.card += s.card; b.bank += s.bank; b.total += s.total;
    });
    return b;
  }, [aggregated]);

  const totalSales = aggregated.posSales.total + aggregated.invoiceSales.total;
  const totalCollection = totalIn.total;
  const totalPaymentsOut = totalOut.total;
  const netMovement = totalCollection - totalPaymentsOut;

  const expectedCash = openingCash + totalIn.cash - totalOut.cash;
  const difference = physicalCash - expectedCash;
  const handoverToOwner = physicalCash - leaveInDrawer - depositToBank;

  const statusBadge = useMemo(() => {
    if (physicalCash === 0 && !snapshot) return { label: "Not Settled", variant: "secondary" as const, color: "" };
    const abs = Math.abs(difference);
    if (abs === 0) return { label: "Balanced", variant: "default" as const, color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
    if (abs <= 100) return { label: "Minor Difference", variant: "default" as const, color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" };
    return { label: "Cash Mismatch", variant: "destructive" as const, color: "bg-red-500/20 text-red-400 border-red-500/30" };
  }, [physicalCash, difference, snapshot]);

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
      ["MONEY IN", "Cash", "UPI", "Card", "Bank", "Total"],
      ["POS Sales", aggregated.posSales.cash, aggregated.posSales.upi, aggregated.posSales.card, aggregated.posSales.bank, aggregated.posSales.total],
      ["Sales Invoice", aggregated.invoiceSales.cash, aggregated.invoiceSales.upi, aggregated.invoiceSales.card, aggregated.invoiceSales.bank, aggregated.invoiceSales.total],
      ["Old Balance Received", aggregated.receipts.cash, aggregated.receipts.upi, aggregated.receipts.card, aggregated.receipts.bank, aggregated.receipts.total],
      ["Advance Received", aggregated.advances.cash, aggregated.advances.upi, aggregated.advances.card, aggregated.advances.bank, aggregated.advances.total],
      ["Total Inward", totalIn.cash, totalIn.upi, totalIn.card, totalIn.bank, totalIn.total],
      [],
      ["MONEY OUT", "Cash", "UPI", "Card", "Bank", "Total"],
      ["Supplier Payment", aggregated.supplierPayments.cash, aggregated.supplierPayments.upi, aggregated.supplierPayments.card, aggregated.supplierPayments.bank, aggregated.supplierPayments.total],
      ["Shop Expense", aggregated.expenses.cash, aggregated.expenses.upi, aggregated.expenses.card, aggregated.expenses.bank, aggregated.expenses.total],
      ["Employee Salary", aggregated.employeeSalary.cash, aggregated.employeeSalary.upi, aggregated.employeeSalary.card, aggregated.employeeSalary.bank, aggregated.employeeSalary.total],
      ["Sale Return Refund", aggregated.saleReturnRefunds.cash, aggregated.saleReturnRefunds.upi, aggregated.saleReturnRefunds.card, aggregated.saleReturnRefunds.bank, aggregated.saleReturnRefunds.total],
      ["Total Outward", totalOut.cash, totalOut.upi, totalOut.card, totalOut.bank, totalOut.total],
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

  // ─── Table row helper ──────────────────────────────────────────────
  const MoneyRow = ({ label, data, highlight }: { label: string; data: PaymentBreakdown; highlight?: boolean }) => (
    <TableRow className={highlight ? "bg-muted/50 font-bold" : ""}>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(data.cash)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(data.upi)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(data.card)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(data.bank)}</TableCell>
      <TableCell className="text-right tabular-nums font-semibold">{fmt(data.total)}</TableCell>
    </TableRow>
  );

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daily Tally & Settlement</h1>
            <p className="text-sm text-muted-foreground">{format(selectedDate, "EEEE, dd MMMM yyyy")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
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
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => handlePrint()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button className="gap-2" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4" /> Save Snapshot
          </Button>
          {statusBadge.label !== "Not Settled" && (
            <Badge className={statusBadge.color}>{statusBadge.label}</Badge>
          )}
          {snapshot && (
            <span className="text-xs text-muted-foreground">
              Saved {format(new Date(snapshot.created_at), "hh:mm a")}
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Sales", value: totalSales, icon: IndianRupee, color: "text-emerald-400" },
          { title: "Total Collection", value: totalCollection, icon: ArrowDownLeft, color: "text-blue-400" },
          { title: "Total Payments", value: totalPaymentsOut, icon: ArrowUpRight, color: "text-red-400" },
          { title: "Net Movement", value: netMovement, icon: TrendingUp, color: netMovement >= 0 ? "text-emerald-400" : "text-red-400" },
        ].map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={cn("h-5 w-5", c.color)} />
            </CardHeader>
            <CardContent>
              <p className={cn("text-2xl font-bold tabular-nums", c.color)}>{fmt(c.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Money In */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-emerald-400">
            <ArrowDownLeft className="h-5 w-5" /> Money In
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">UPI</TableHead>
                  <TableHead className="text-right">Card</TableHead>
                  <TableHead className="text-right">Bank</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <MoneyRow label="POS Sales" data={aggregated.posSales} />
                <MoneyRow label="Sales Invoice" data={aggregated.invoiceSales} />
                <MoneyRow label="Old Balance Received" data={aggregated.receipts} />
                <MoneyRow label="Advance Received" data={aggregated.advances} />
              </TableBody>
              <TableFooter>
                <MoneyRow label="Total Inward" data={totalIn} highlight />
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Money Out */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-red-400">
            <ArrowUpRight className="h-5 w-5" /> Money Out
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">UPI</TableHead>
                  <TableHead className="text-right">Card</TableHead>
                  <TableHead className="text-right">Bank</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <MoneyRow label="Supplier Payment" data={aggregated.supplierPayments} />
                <MoneyRow label="Shop Expense" data={aggregated.expenses} />
                <MoneyRow label="Employee Salary" data={aggregated.employeeSalary} />
                <MoneyRow label="Sale Return Refund" data={aggregated.saleReturnRefunds} />
              </TableBody>
              <TableFooter>
                <MoneyRow label="Total Outward" data={totalOut} highlight />
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Cash Reconciliation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Cash Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left — Expected */}
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Opening Cash
                  {!snapshot && yesterdaySnapshot ? (
                    <span className="ml-2 text-xs text-primary">(Yesterday's closing balance)</span>
                  ) : null}
                </label>
                <Input
                  type="number"
                  value={openingCash || ""}
                  onChange={(e) => setOpeningCash(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="text-lg font-semibold"
                />
              </div>
              <div className="rounded-lg border border-border p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground mb-1">Expected Cash</p>
                <p className="text-3xl font-bold tabular-nums text-foreground">{fmt(expectedCash)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Opening ({fmt(openingCash)}) + Cash In ({fmt(totalIn.cash)}) − Cash Out ({fmt(totalOut.cash)})
                </p>
              </div>
            </div>

            {/* Right — Physical Tally (Tabbed) */}
            <div className="space-y-4">
              <Tabs value={tallyTab} onValueChange={setTallyTab}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-muted-foreground">Physical Cash Counted</label>
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
                    className="text-lg font-semibold"
                  />
                </TabsContent>

                <TabsContent value="denomination" className="mt-0">
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground italic">
                      🧮 Physical Tally (Blind Count) — Count what's in your drawer. Don't rely on system figures.
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="py-2 text-xs">Note</TableHead>
                          <TableHead className="py-2 text-xs text-center">×</TableHead>
                          <TableHead className="py-2 text-xs text-center">Count</TableHead>
                          <TableHead className="py-2 text-xs text-center">=</TableHead>
                          <TableHead className="py-2 text-xs text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {DENOMINATIONS.map((denom) => (
                          <TableRow key={denom}>
                            <TableCell className="py-1.5 font-medium text-sm">₹ {denom.toLocaleString("en-IN")}</TableCell>
                            <TableCell className="py-1.5 text-center text-muted-foreground">×</TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                type="number"
                                min={0}
                                value={denomCounts[denom] || ""}
                                onChange={(e) => setDenomCounts(prev => ({ ...prev, [denom]: Number(e.target.value) || 0 }))}
                                className="h-8 w-20 text-center mx-auto text-sm"
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-center text-muted-foreground">=</TableCell>
                            <TableCell className="py-1.5 text-right tabular-nums font-medium text-sm">
                              {fmt(denom * (denomCounts[denom] || 0))}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Coins / small notes bulk entry */}
                        <TableRow>
                          <TableCell className="py-1.5 font-medium text-sm" colSpan={2}>₹ 20 / 10 / Coins</TableCell>
                          <TableCell className="py-1.5" colSpan={2}>
                            <Input
                              type="number"
                              min={0}
                              value={coinsBulk || ""}
                              onChange={(e) => setCoinsBulk(Number(e.target.value) || 0)}
                              className="h-8 w-28 text-sm"
                              placeholder="Bulk ₹ amount"
                            />
                          </TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums font-medium text-sm">
                            {fmt(coinsBulk)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                      <TableFooter>
                        <TableRow className="bg-primary/5">
                          <TableCell colSpan={4} className="py-2 font-bold text-sm">Total Physical Cash</TableCell>
                          <TableCell className="py-2 text-right tabular-nums font-bold text-lg text-primary">
                            {fmt(denomTotal)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>

              <div className={cn(
                "rounded-lg border p-4",
                Math.abs(difference) === 0 ? "border-emerald-500/30 bg-emerald-500/10" :
                Math.abs(difference) <= 100 ? "border-yellow-500/30 bg-yellow-500/10" :
                "border-red-500/30 bg-red-500/10"
              )}>
                <p className="text-sm text-muted-foreground mb-1">Difference</p>
                <p className={cn(
                  "text-3xl font-bold tabular-nums",
                  Math.abs(difference) === 0 ? "text-emerald-400" :
                  Math.abs(difference) <= 100 ? "text-yellow-400" : "text-red-400"
                )}>
                  {difference >= 0 ? "+" : ""}{fmt(difference)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Physical ({fmt(physicalCash)}) − Expected ({fmt(expectedCash)})
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settlement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" /> Settlement (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Leave in Drawer</label>
              <Input type="number" value={leaveInDrawer || ""} onChange={(e) => setLeaveInDrawer(Number(e.target.value) || 0)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Deposit to Bank</label>
              <Input type="number" value={depositToBank || ""} onChange={(e) => setDepositToBank(Number(e.target.value) || 0)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Handover to Owner</label>
              <div className="rounded-lg border border-border p-3 bg-muted/30">
                <p className="text-xl font-bold tabular-nums">{fmt(handoverToOwner)}</p>
                <p className="text-xs text-muted-foreground">Auto-calculated</p>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label className="text-sm text-muted-foreground mb-1 block">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional settlement notes…" rows={2} />
          </div>
        </CardContent>
      </Card>

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
