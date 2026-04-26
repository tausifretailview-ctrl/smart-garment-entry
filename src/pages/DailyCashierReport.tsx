import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from "date-fns";
import { CalendarIcon, Printer, IndianRupee, CreditCard, Smartphone, Clock, Receipt, TrendingDown, FileSpreadsheet, FileText, Banknote, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { addDays, subDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PeriodType = "daily" | "monthly" | "quarterly";

const DailyCashierReport = () => {
  const { currentOrganization } = useOrganization();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [period, setPeriod] = useState<PeriodType>("daily");

  // Calculate date range based on period
  const getDateRange = () => {
    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case "monthly":
        startDate = startOfMonth(selectedDate);
        endDate = endOfMonth(selectedDate);
        break;
      case "quarterly":
        startDate = startOfQuarter(selectedDate);
        endDate = endOfQuarter(selectedDate);
        break;
      default: // daily
        startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
  };

  const { startDate, endDate } = getDateRange();

  // Fetch sales for selected period using range pagination
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["cashier-report-sales", currentOrganization?.id, selectedDate, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { fetchAllSalesWithFilters } = await import("@/utils/fetchAllRows");
      const allSales = await fetchAllSalesWithFilters(currentOrganization.id, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      
      return allSales;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch payment receipts (RCP) for selected period using range pagination
  const { data: receiptData, isLoading: receiptsLoading } = useQuery({
    queryKey: ["cashier-report-receipts", currentOrganization?.id, selectedDate, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      const { fetchAllVouchersWithFilters } = await import("@/utils/fetchAllRows");
      const allReceipts = await fetchAllVouchersWithFilters(currentOrganization.id, {
        startDate: startDateStr,
        endDate: endDateStr,
        voucherType: "receipt",
      });
      
      return allReceipts;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch student fee collections for selected period (school ERP)
  const { data: feeCollectionData, isLoading: feesLoading } = useQuery({
    queryKey: ["cashier-report-fee-collections", currentOrganization?.id, selectedDate, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');
      try {
        const { data, error } = await supabase
          .from("student_fees")
          .select("id, paid_amount, paid_date, payment_method, payment_receipt_id, students!inner(student_name)")
          .eq("organization_id", currentOrganization.id)
          .gte("paid_date", startDateStr + "T00:00:00")
          .lte("paid_date", endDateStr + "T23:59:59")
          .in("status", ["paid", "partial"]);
        if (error) { console.error("Fee collection query error:", error); return []; }
        return data || [];
      } catch (e) { console.error("Fee collection query failed:", e); return []; }
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch cash refund sale returns for selected period
  const { data: cashRefundData, isLoading: refundsLoading } = useQuery({
    queryKey: ["cashier-report-cash-refunds", currentOrganization?.id, selectedDate, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      try {
        const { data, error } = await supabase
          .from("sale_returns")
          .select("id, net_amount, return_date, refund_type")
          .eq("organization_id", currentOrganization.id)
          .eq("refund_type", "cash_refund")
          .gte("return_date", startDateStr)
          .lte("return_date", endDateStr)
          .is("deleted_at", null);

        if (error) {
          console.error("Cash refund query error:", error);
          return [];
        }
        return data || [];
      } catch (e) {
        console.error("Cash refund query failed:", e);
        return [];
      }
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch expense vouchers for selected period
  const { data: expenseData, isLoading: expensesLoading } = useQuery({
    queryKey: ["cashier-report-expenses", currentOrganization?.id, selectedDate, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');
      try {
        const { data, error } = await supabase
          .from("voucher_entries")
          .select("id, total_amount, payment_method, category, description")
          .eq("organization_id", currentOrganization.id)
          .eq("voucher_type", "expense")
          .gte("voucher_date", startDateStr)
          .lte("voucher_date", endDateStr)
          .is("deleted_at", null);
        if (error) { console.error("Expense query error:", error); return []; }
        return data || [];
      } catch (e) { console.error("Expense query failed:", e); return []; }
    },
    enabled: !!currentOrganization?.id,
  });

  const isLoading = salesLoading || receiptsLoading || refundsLoading || feesLoading || expensesLoading;

  // Fetch settings for business name
  const { data: settings } = useQuery({
    queryKey: ["settings", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Calculate totals including payment receipts
  const calculateTotals = () => {
    const hasNoData = (!salesData || salesData.length === 0) && (!receiptData || receiptData.length === 0);
    
    if (hasNoData) {
      return {
        grossSale: 0,
        totalDiscount: 0,
        totalSRAdjusted: 0,
        totalSale: 0,
        netReceivable: 0,
        cashSale: 0,
        cardSale: 0,
        upiSale: 0,
        creditSale: 0,
        totalPaid: 0,
        totalBalance: 0,
        totalRefund: 0,
        totalBills: 0,
        cashBills: 0,
        cardBills: 0,
        upiBills: 0,
        creditBills: 0,
        mixBills: 0,
        // Receipt collections
        rcpCashCollection: 0,
        rcpUpiCollection: 0,
        rcpCardCollection: 0,
        rcpOtherCollection: 0,
        rcpTotalCollection: 0,
        rcpCount: 0,
        // Cash refunds from sale returns
        cashRefundTotal: 0,
        cashRefundCount: 0,
      };
    }

    let grossSale = 0;
    let totalDiscount = 0;
    let totalSRAdjusted = 0;
    let totalSale = 0;
    let cashSale = 0;
    let cardSale = 0;
    let upiSale = 0;
    let creditSale = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let totalRefund = 0;
    let cashBills = 0;
    let cardBills = 0;
    let upiBills = 0;
    let creditBills = 0;
    let mixBills = 0;

    // Process sales data
    if (salesData) {
      salesData.forEach((sale) => {
        // NOTE: Refund-only sales (negative net_amount from S/R Adjust > bill) are
        // INCLUDED here. Their cash_amount/upi_amount/card_amount are stored as
        // NEGATIVE on the sale row, so they naturally subtract from cashSale/upiSale/
        // cardSale below — no separate "Less: Refund" subtraction is needed.
        grossSale += Number(sale.gross_amount) || 0;
        totalDiscount += (Number(sale.discount_amount) || 0) + (Number(sale.flat_discount_amount) || 0) + (Number((sale as any).points_redeemed_amount) || 0);
        totalSRAdjusted += Number(sale.sale_return_adjust) || 0;
        totalSale += Number(sale.net_amount) || 0;

        const netAmount = Number(sale.net_amount) || 0;
        const paidAmount = Number(sale.paid_amount) || 0;
        const refundAmt = Number(sale.refund_amount) || 0;
        const balance = netAmount - paidAmount;
        
        totalPaid += paidAmount;
        totalBalance += balance;
        totalRefund += refundAmt;
        
        // For mixed payments, add individual amounts
        if (sale.payment_method === "multiple") {
          cashSale += Number(sale.cash_amount) || 0;
          cardSale += Number(sale.card_amount) || 0;
          upiSale += Number(sale.upi_amount) || 0;
          mixBills++;
        } else {
          // For single payment methods
          switch (sale.payment_method) {
            case "cash":
              cashSale += Number(sale.cash_amount) || netAmount;
              cashBills++;
              break;
            case "card":
              cardSale += Number(sale.card_amount) || netAmount;
              cardBills++;
              break;
            case "upi":
              upiSale += Number(sale.upi_amount) || netAmount;
              upiBills++;
              break;
            case "pay_later":
              creditSale += netAmount;
              creditBills++;
              break;
            default:
              cashSale += netAmount;
              cashBills++;
          }
        }
      });
    }

    // Process receipt data (RCP) - extract payment method from description
    let rcpCashCollection = 0;
    let rcpUpiCollection = 0;
    let rcpCardCollection = 0;
    let rcpOtherCollection = 0;
    
    if (receiptData) {
      receiptData.forEach((receipt) => {
        const amount = Number(receipt.total_amount) || 0;
        const desc = (receipt.description || '').toLowerCase();
        
        // Parse payment method from description or default to cash
        if (desc.includes('upi')) {
          rcpUpiCollection += amount;
        } else if (desc.includes('card')) {
          rcpCardCollection += amount;
        } else if (desc.includes('cheque') || desc.includes('bank') || desc.includes('transfer')) {
          rcpOtherCollection += amount;
        } else {
          // Default to cash for receipts without specific method
          rcpCashCollection += amount;
        }
      });
    }

    const rcpTotalCollection = rcpCashCollection + rcpUpiCollection + rcpCardCollection + rcpOtherCollection;

    // Process student fee collections
    let feeCashCollection = 0;
    let feeUpiCollection = 0;
    let feeCardCollection = 0;
    let feeBankCollection = 0;
    let feeTotalCollection = 0;
    
    if (feeCollectionData) {
      feeCollectionData.forEach((fee: any) => {
        const amount = Number(fee.paid_amount) || 0;
        const method = (fee.payment_method || '').toLowerCase();
        if (method === 'upi') feeUpiCollection += amount;
        else if (method === 'card') feeCardCollection += amount;
        else if (method === 'bank transfer') feeBankCollection += amount;
        else feeCashCollection += amount;
      });
      feeTotalCollection = feeCashCollection + feeUpiCollection + feeCardCollection + feeBankCollection;
    }

    // Calculate cash refund total from sale returns
    let cashRefundTotal = 0;
    if (cashRefundData) {
      cashRefundData.forEach((refund: any) => {
        cashRefundTotal += Number(refund.net_amount) || 0;
      });
    }

    // Calculate expense totals by payment method and category
    let expenseCash = 0;
    let expenseUpi = 0;
    let expenseCard = 0;
    let expenseOther = 0;
    const expenseByCategory: Record<string, { cash: number; upi: number; card: number; other: number; total: number }> = {};

    if (expenseData) {
      expenseData.forEach((exp: any) => {
        const amt = Number(exp.total_amount) || 0;
        const method = (exp.payment_method || "cash").toLowerCase();
        const cat = exp.category || exp.description || "Miscellaneous";

        if (!expenseByCategory[cat]) expenseByCategory[cat] = { cash: 0, upi: 0, card: 0, other: 0, total: 0 };
        expenseByCategory[cat].total += amt;

        if (method === "cash") { expenseCash += amt; expenseByCategory[cat].cash += amt; }
        else if (method === "upi") { expenseUpi += amt; expenseByCategory[cat].upi += amt; }
        else if (method === "card") { expenseCard += amt; expenseByCategory[cat].card += amt; }
        else { expenseOther += amt; expenseByCategory[cat].other += amt; }
      });
    }
    const expenseTotal = expenseCash + expenseUpi + expenseCard + expenseOther;

    // Net Receivable = Net Sale (net_amount already includes S/R deduction from POS save logic)
    const netReceivable = totalSale;

    return {
      grossSale,
      totalDiscount,
      totalSRAdjusted,
      totalSale,
      netReceivable,
      cashSale,
      cardSale,
      upiSale,
      creditSale,
      totalPaid,
      totalBalance,
      totalRefund,
      totalBills: salesData?.length || 0,
      cashBills,
      cardBills,
      upiBills,
      creditBills,
      mixBills,
      // Receipt collections
      rcpCashCollection,
      rcpUpiCollection,
      rcpCardCollection,
      rcpOtherCollection,
      rcpTotalCollection,
      rcpCount: receiptData?.length || 0,
      // Cash refunds
      cashRefundTotal,
      cashRefundCount: cashRefundData?.length || 0,
      // Student fee collections
      feeCashCollection,
      feeUpiCollection,
      feeCardCollection,
      feeBankCollection,
      feeTotalCollection,
      feeCount: feeCollectionData?.length || 0,
      // Expense outflows
      expenseCash,
      expenseUpi,
      expenseCard,
      expenseOther,
      expenseTotal,
      expenseByCategory,
      expenseCount: expenseData?.length || 0,
    };
  };

  const totals = calculateTotals();

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    // Calculate grand totals with RCP
    const grandCashCollection = totals.cashSale + totals.rcpCashCollection;
    const grandCardCollection = totals.cardSale + totals.rcpCardCollection;
    const grandUpiCollection = totals.upiSale + totals.rcpUpiCollection;
    const grandTotalCollection = totals.cashSale + totals.cardSale + totals.upiSale + totals.totalSRAdjusted + totals.rcpTotalCollection;
    
    const data = [
      ["Cashier Report - " + getPeriodLabel()],
      [settings?.business_name || "Business Name"],
      [],
      ["Sales Summary"],
      ["Gross Sale", totals.grossSale],
      ["Less: Discount", totals.totalDiscount],
      ["Net Sale", totals.totalSale],
      ["S/R Adjusted (included in Net Sale)", totals.totalSRAdjusted],
      ["Net Receivable", totals.netReceivable],
      [],
      ["Sales Payment Breakdown"],
      ["Payment Method", "Bills", "Amount"],
      ["Cash", totals.cashBills, totals.cashSale],
      ["Card", totals.cardBills, totals.cardSale],
      ["UPI", totals.upiBills, totals.upiSale],
      ["Mix Payment", totals.mixBills, "-"],
      ["Credit (Pay Later)", totals.creditBills, totals.creditSale],
      ["Total", totals.totalBills, totals.totalSale],
      [],
      ["Receipt Collections (RCP) - Opening Balance / Invoice Payments"],
      ["Type", "Receipts", "Amount"],
      ["RCP Cash", totals.rcpCount > 0 ? "-" : 0, totals.rcpCashCollection],
      ["RCP UPI", "-", totals.rcpUpiCollection],
      ["RCP Card", "-", totals.rcpCardCollection],
      ["RCP Other (Cheque/Bank)", "-", totals.rcpOtherCollection],
      ["Total RCP", totals.rcpCount, totals.rcpTotalCollection],
      [],
      ["TOTAL COLLECTION SUMMARY"],
      ["Cash (Sales + RCP)", grandCashCollection],
      ["Card (Sales + RCP)", grandCardCollection],
      ["UPI (Sales + RCP)", grandUpiCollection],
      ["S/R Adjusted", totals.totalSRAdjusted],
      ["Total Collection", grandTotalCollection],
      ["Less: Refund", totals.totalRefund],
      ["Less: Sale Return Cash Refund", totals.cashRefundTotal],
      ["Net Cash Collection", grandCashCollection - totals.totalRefund - totals.cashRefundTotal],
      [],
      ["Outstanding"],
      ["Credit (Pay Later)", totals.creditSale],
      ["Balance Pending", totals.totalBalance],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cashier Report");
    XLSX.writeFile(wb, `Cashier_Report_${format(selectedDate, "yyyy-MM-dd")}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Calculate grand totals with RCP
    const grandCashCollection = totals.cashSale + totals.rcpCashCollection;
    const grandCardCollection = totals.cardSale + totals.rcpCardCollection;
    const grandUpiCollection = totals.upiSale + totals.rcpUpiCollection;
    
    // Header
    doc.setFontSize(16);
    doc.text(settings?.business_name || "Business Name", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(getReportTitle(), pageWidth / 2, 30, { align: "center" });
    doc.text(`Period: ${getPeriodLabel()}`, pageWidth / 2, 38, { align: "center" });

    let y = 55;
    doc.setFontSize(11);
    
    // Summary
    doc.setFont("helvetica", "bold");
    doc.text("Sales Summary", 20, y);
    doc.setFont("helvetica", "normal");
    y += 10;
    doc.text(`Gross Sale: ${formatCurrency(totals.grossSale)}`, 20, y);
    y += 7;
    doc.text(`Less: Discount: ${formatCurrency(totals.totalDiscount)}`, 20, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text(`Net Sale: ${formatCurrency(totals.totalSale)}`, 20, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.text(`S/R Adjusted (included): ${formatCurrency(totals.totalSRAdjusted)}`, 20, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text(`Net Receivable: ${formatCurrency(totals.netReceivable)}`, 20, y);
    doc.setFont("helvetica", "normal");

    // Sales Collection Breakdown
    y += 15;
    doc.setFont("helvetica", "bold");
    doc.text("Sales Collection", 20, y);
    doc.setFont("helvetica", "normal");
    y += 10;
    
    doc.text("Cash: " + formatCurrency(totals.cashSale), 20, y);
    y += 7;
    doc.text("Card: " + formatCurrency(totals.cardSale), 20, y);
    y += 7;
    doc.text("UPI: " + formatCurrency(totals.upiSale), 20, y);

    // Receipt Collections (RCP)
    if (totals.rcpTotalCollection > 0) {
      y += 15;
      doc.setFont("helvetica", "bold");
      doc.text(`Receipt Collections (RCP) - ${totals.rcpCount} receipts`, 20, y);
      doc.setFont("helvetica", "normal");
      y += 10;
      
      doc.text("RCP Cash: " + formatCurrency(totals.rcpCashCollection), 20, y);
      y += 7;
      doc.text("RCP UPI: " + formatCurrency(totals.rcpUpiCollection), 20, y);
      y += 7;
      doc.text("RCP Card: " + formatCurrency(totals.rcpCardCollection), 20, y);
      y += 7;
      doc.text("RCP Other: " + formatCurrency(totals.rcpOtherCollection), 20, y);
    }

    // Grand Total Collection
    y += 15;
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL COLLECTION", 20, y);
    doc.setFont("helvetica", "normal");
    y += 10;
    doc.text("Cash (Sales + RCP): " + formatCurrency(grandCashCollection), 20, y);
    y += 7;
    doc.text("Card (Sales + RCP): " + formatCurrency(grandCardCollection), 20, y);
    y += 7;
    doc.text("UPI (Sales + RCP): " + formatCurrency(grandUpiCollection), 20, y);
    y += 7;
    doc.text("Less: Refund: " + formatCurrency(totals.totalRefund), 20, y);
    y += 7;
    if (totals.cashRefundTotal > 0) {
      doc.text("Less: S/R Cash Refund (" + totals.cashRefundCount + "): " + formatCurrency(totals.cashRefundTotal), 20, y);
      y += 7;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Net Cash Collection: " + formatCurrency(grandCashCollection - totals.totalRefund - totals.cashRefundTotal), 20, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.text("Credit Outstanding: " + formatCurrency(totals.creditSale), 20, y);
    y += 7;
    doc.text("Balance Pending: " + formatCurrency(totals.totalBalance), 20, y);

    // Footer
    y += 20;
    doc.setFontSize(9);
    doc.text(`Generated on ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth / 2, y, { align: "center" });

    doc.save(`Cashier_Report_${format(selectedDate, "yyyy-MM-dd")}.pdf`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getPeriodLabel = () => {
    switch (period) {
      case "monthly":
        return format(selectedDate, "MMMM yyyy");
      case "quarterly":
        return `Q${Math.ceil((selectedDate.getMonth() + 1) / 3)} ${format(selectedDate, "yyyy")}`;
      default:
        return format(selectedDate, "dd MMM yyyy");
    }
  };

  const getReportTitle = () => {
    switch (period) {
      case "monthly":
        return "MONTHLY CASHIER REPORT";
      case "quarterly":
        return "QUARTERLY CASHIER REPORT";
      default:
        return "DAILY CASHIER REPORT";
    }
  };
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30 pb-24">
        <MobilePageHeader title="Cashier Report" backTo="/" subtitle={getPeriodLabel()} />

        {/* Date navigator */}
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => setSelectedDate(d => subDays(d, 1))}
            className="w-10 h-10 bg-card rounded-xl border border-border flex items-center justify-center active:scale-90 touch-manipulation">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setSelectedDate(new Date())}
            className="flex-1 h-10 bg-primary/10 rounded-xl text-xs font-semibold text-primary active:scale-95 touch-manipulation">
            Today
          </button>
          <button onClick={() => setSelectedDate(d => addDays(d, 1))}
            className="w-10 h-10 bg-card rounded-xl border border-border flex items-center justify-center active:scale-90 touch-manipulation">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 space-y-4 pb-4">
          {/* Hero sales card */}
          <div className="bg-primary rounded-2xl p-4 text-primary-foreground">
            <p className="text-xs font-medium opacity-80">Total Sales</p>
            {isLoading ? <Skeleton className="h-8 w-32 bg-primary-foreground/20 mt-1" />
              : <p className="text-2xl font-bold tabular-nums mt-1">{formatCurrency(totals.totalSale)}</p>}
            <p className="text-xs opacity-70 mt-1">{(salesData?.length || 0)} invoices</p>
          </div>

          {/* Payment breakdown */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {label:"Cash", value: totals.cashSale, color:"text-emerald-600", bg:"bg-emerald-50"},
              {label:"Card", value: totals.cardSale, color:"text-blue-600", bg:"bg-blue-50"},
              {label:"UPI", value: totals.upiSale, color:"text-purple-600", bg:"bg-purple-50"},
            ].map((p) => (
              <div key={p.label} className={cn("rounded-xl p-3", p.bg)}>
                <p className="text-[10px] font-medium text-muted-foreground">{p.label}</p>
                {isLoading ? <Skeleton className="h-5 w-16 mt-1" />
                  : <p className={cn("text-sm font-bold tabular-nums mt-0.5", p.color)}>{formatCurrency(p.value)}</p>}
              </div>
            ))}
          </div>

          {/* Outstanding */}
          <div className="bg-card rounded-2xl border border-border/40 p-4">
            <p className="text-xs font-semibold text-foreground mb-3">Outstanding</p>
            <div className="space-y-2">
              {[
                {label:"Balance Pending", value: totals.totalBalance, color:"text-amber-600"},
                {label:"Credit Sales", value: totals.creditSale, color:"text-rose-600"},
                {label:"Receipt Collection", value: totals.rcpTotalCollection, color:"text-emerald-600"},
              ].map((r) => (
                <div key={r.label} className="flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                  <p className={cn("text-sm font-bold tabular-nums", r.color)}>{formatCurrency(r.value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Today's invoices */}
          <div className="bg-card rounded-2xl border border-border/40 p-4">
            <p className="text-xs font-semibold text-foreground mb-3">Invoices</p>
            <div className="space-y-2">
              {isLoading ? Array.from({length:4}).map((_,i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              )) : (salesData || []).slice(0, 30).map((sale: any) => (
                <div key={sale.id} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">{sale.sale_number}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{sale.customer_name || 'Walk-in'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums">₹{(sale.net_amount||0).toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-muted-foreground">{sale.payment_method}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div id="cashier-report-root" className="min-h-screen bg-background p-4 md:p-6 print:p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-4">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-bold">Cashier Report</h1>
            <p className="text-muted-foreground text-sm">Sales summary by payment method</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Select value={period} onValueChange={(value: PeriodType) => setPeriod(value)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {getPeriodLabel()}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          
          <Button onClick={handleExportExcel} variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button onClick={handleExportPDF} variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button onClick={handlePrint} variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block mb-6 text-center border-b pb-4">
        <h1 className="text-xl font-bold">{settings?.business_name || "Business Name"}</h1>
        <p className="text-sm">{settings?.address}</p>
        <p className="text-sm">Ph: {settings?.mobile_number}</p>
        <h2 className="text-lg font-semibold mt-4">{getReportTitle()}</h2>
        <p className="text-sm">Period: {getPeriodLabel()}</p>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/90 flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Gross Sale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatCurrency(totals.grossSale)}</p>
                <p className="text-xs text-white/70">{totals.totalBills} Bills</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/90 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Total Discount
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatCurrency(totals.totalDiscount)}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/90 flex items-center gap-2">
                  <IndianRupee className="h-4 w-4" />
                  Net Sale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatCurrency(totals.totalSale)}</p>
                <p className="text-xs text-white/70">Gross - Discount</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-teal-500 to-teal-600 border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/90 flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  S/R Adjusted
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatCurrency(totals.totalSRAdjusted)}</p>
                <p className="text-xs text-white/70">Return credit used</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/90 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Balance Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatCurrency(totals.totalBalance)}</p>
                <p className="text-xs text-white/70">Outstanding</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/90 flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  Old Payment Receipts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatCurrency(totals.rcpTotalCollection)}</p>
                <p className="text-xs text-white/70">{totals.rcpCount} Receipt{totals.rcpCount === 1 ? "" : "s"} • Against existing balance</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-600 to-green-700 border-0 shadow-lg ring-2 ring-green-400/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/90 flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Actual Net Receivable
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{formatCurrency(totals.netReceivable - totals.totalBalance + totals.rcpTotalCollection + totals.feeTotalCollection)}</p>
                <p className="text-xs text-white/70">Net - Balance + Receipts + Fees</p>
              </CardContent>
            </Card>
          </div>

          {/* Payment Method Breakdown */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Payment Collection Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Collection Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
                          <IndianRupee className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <span className="font-medium">Cash Collection</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(totals.cashSale)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
                          <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="font-medium">Card Collection</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(totals.cardSale)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900">
                          <Smartphone className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="font-medium">UPI Collection</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(totals.upiSale)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-teal-100 dark:bg-teal-900">
                          <RotateCcw className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                        </div>
                        <span className="font-medium">S/R Adjusted</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-teal-600 dark:text-teal-400">{formatCurrency(totals.totalSRAdjusted)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-red-100 dark:bg-red-900">
                          <Banknote className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </div>
                        <span className="font-medium text-muted-foreground">Refund (already in Cash)</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-muted-foreground">{formatCurrency(totals.totalRefund)}</TableCell>
                  </TableRow>
                  {totals.cashRefundTotal > 0 && (
                    <TableRow>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-full bg-red-100 dark:bg-red-900">
                            <RotateCcw className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </div>
                          <span className="font-medium">Less: Sale Return Cash Refund</span>
                          <span className="text-xs text-muted-foreground">({totals.cashRefundCount} returns)</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">{formatCurrency(totals.cashRefundTotal)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow className="bg-green-50 dark:bg-green-950">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-green-200 dark:bg-green-800">
                          <Receipt className="h-4 w-4 text-green-700 dark:text-green-300" />
                        </div>
                        <span className="font-bold">Net Cash Collection</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{formatCurrency(totals.cashSale - totals.totalRefund - totals.cashRefundTotal)}</TableCell>
                      {/* NOTE: refund is already baked into negative cash_amount; do NOT subtract again */}
                  </TableRow>
                  {/* RCP Collections Section */}
                  {totals.rcpTotalCollection > 0 && (
                    <>
                      <TableRow className="bg-violet-50 dark:bg-violet-950">
                        <TableCell colSpan={2} className="font-semibold text-violet-700 dark:text-violet-300">
                          Receipt Collections (RCP) - {totals.rcpCount} receipts
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8">RCP Cash</TableCell>
                        <TableCell className="text-right">{formatCurrency(totals.rcpCashCollection)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8">RCP UPI</TableCell>
                        <TableCell className="text-right">{formatCurrency(totals.rcpUpiCollection)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8">RCP Card</TableCell>
                        <TableCell className="text-right">{formatCurrency(totals.rcpCardCollection)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8">RCP Other (Cheque/Bank)</TableCell>
                        <TableCell className="text-right">{formatCurrency(totals.rcpOtherCollection)}</TableCell>
                      </TableRow>
                      <TableRow className="bg-violet-100 dark:bg-violet-900">
                        <TableCell className="font-bold">Total RCP Collection</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(totals.rcpTotalCollection)}</TableCell>
                      </TableRow>
                    </>
                  )}
                  {/* Student Fee Collections Section */}
                  {totals.feeTotalCollection > 0 && (
                    <>
                      <TableRow className="bg-amber-50 dark:bg-amber-950">
                        <TableCell colSpan={2} className="font-semibold text-amber-700 dark:text-amber-300">
                          📚 Student Fee Collections - {totals.feeCount} receipts
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8">Fee Cash</TableCell>
                        <TableCell className="text-right">{formatCurrency(totals.feeCashCollection)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8">Fee UPI</TableCell>
                        <TableCell className="text-right">{formatCurrency(totals.feeUpiCollection)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="pl-8">Fee Card</TableCell>
                        <TableCell className="text-right">{formatCurrency(totals.feeCardCollection)}</TableCell>
                      </TableRow>
                      {totals.feeBankCollection > 0 && (
                        <TableRow>
                          <TableCell className="pl-8">Fee Bank Transfer</TableCell>
                          <TableCell className="text-right">{formatCurrency(totals.feeBankCollection)}</TableCell>
                        </TableRow>
                      )}
                      <TableRow className="bg-amber-100 dark:bg-amber-900">
                        <TableCell className="font-bold">Total Fee Collection</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(totals.feeTotalCollection)}</TableCell>
                      </TableRow>
                    </>
                  )}
                  {/* Expense Outflows Section */}
                  {totals.expenseTotal > 0 && (
                    <>
                      <TableRow className="bg-red-50 dark:bg-red-950">
                        <TableCell colSpan={2} className="font-semibold text-destructive">
                          💸 Expense Outflows — {totals.expenseCount} entries
                        </TableCell>
                      </TableRow>
                      {Object.entries(totals.expenseByCategory).sort(([,a],[,b]) => b.total - a.total).map(([cat, vals]) => (
                        <TableRow key={cat}>
                          <TableCell className="pl-8 text-xs">
                            {cat}
                            {vals.cash > 0 && <span className="ml-2 text-muted-foreground">Cash: {formatCurrency(vals.cash)}</span>}
                            {vals.upi > 0 && <span className="ml-2 text-muted-foreground">UPI: {formatCurrency(vals.upi)}</span>}
                            {vals.card > 0 && <span className="ml-2 text-muted-foreground">Card: {formatCurrency(vals.card)}</span>}
                          </TableCell>
                          <TableCell className="text-right font-medium text-destructive">{formatCurrency(vals.total)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-red-100 dark:bg-red-900">
                        <TableCell className="font-bold text-destructive">Total Expenses</TableCell>
                        <TableCell className="text-right font-bold text-destructive">{formatCurrency(totals.expenseTotal)}</TableCell>
                      </TableRow>
                    </>
                  )}
                  <TableRow className="bg-primary/10">
                    <TableCell className="font-bold text-primary">GRAND TOTAL (Sales + RCP + Fees - Expenses)</TableCell>
                    <TableCell className="text-right font-bold text-lg text-primary">
                      {formatCurrency(totals.cashSale + totals.cardSale + totals.upiSale + totals.rcpTotalCollection + totals.feeTotalCollection - totals.totalRefund - totals.cashRefundTotal - totals.expenseTotal)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900">
                          <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </div>
                        <span className="font-medium">Credit (Outstanding)</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(totals.creditSale)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900">
                          <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        </div>
                        <span className="font-medium">Balance Pending</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(totals.totalBalance)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-green-100 dark:bg-green-900/40">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-green-200 dark:bg-green-800">
                          <Receipt className="h-4 w-4 text-green-700 dark:text-green-300" />
                        </div>
                        <span className="font-bold text-green-700 dark:text-green-300">Actual Net Receivable</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg text-green-700 dark:text-green-300">{formatCurrency(totals.netReceivable - totals.totalBalance + totals.rcpTotalCollection + totals.feeTotalCollection)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Detailed Summary Box (for print) */}
          <Card className="print:border print:shadow-none">
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span>Gross Sale</span>
                  <span className="font-semibold">{formatCurrency(totals.grossSale)}</span>
                </div>
                <div className="flex justify-between py-2 border-b text-red-600">
                  <span>Less: Discount</span>
                  <span className="font-semibold">- {formatCurrency(totals.totalDiscount)}</span>
                </div>
                <div className="flex justify-between py-2 border-b text-lg font-bold">
                  <span>Net Sale</span>
                  <span>{formatCurrency(totals.totalSale)}</span>
                </div>
                {totals.totalSRAdjusted > 0 && (
                  <div className="flex justify-between py-2 border-b text-teal-600 text-xs">
                    <span>(Includes S/R Adjusted)</span>
                    <span className="font-semibold">{formatCurrency(totals.totalSRAdjusted)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b text-lg font-bold text-primary">
                  <span>Net Receivable</span>
                  <span>{formatCurrency(totals.netReceivable)}</span>
                </div>
                <div className="flex justify-between py-2 border-b text-orange-600">
                  <span>Less: Balance Pending</span>
                  <span className="font-semibold">- {formatCurrency(totals.totalBalance)}</span>
                </div>
                <div className="flex justify-between py-2 border-b-2 border-double text-lg font-bold bg-green-100 dark:bg-green-900/30 px-2 -mx-2 rounded">
                  <span className="text-green-700 dark:text-green-400">Actual Net Receivable</span>
                  <span className="text-green-700 dark:text-green-400">{formatCurrency(totals.netReceivable - totals.totalBalance + totals.rcpTotalCollection + totals.feeTotalCollection)}</span>
                </div>
                <div className="pt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash Collection</span>
                    <span>{formatCurrency(totals.cashSale)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Card Collection</span>
                    <span>{formatCurrency(totals.cardSale)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UPI Collection</span>
                    <span>{formatCurrency(totals.upiSale)}</span>
                  </div>
                  <div className="flex justify-between text-teal-600">
                    <span className="text-muted-foreground">S/R Adjusted</span>
                    <span>{formatCurrency(totals.totalSRAdjusted)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span className="text-muted-foreground">Less: Refund</span>
                    <span>- {formatCurrency(totals.totalRefund)}</span>
                  </div>
                  {totals.cashRefundTotal > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span className="text-muted-foreground">Less: S/R Cash Refund ({totals.cashRefundCount})</span>
                      <span>- {formatCurrency(totals.cashRefundTotal)}</span>
                    </div>
                  )}
                  {totals.feeTotalCollection > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span className="text-muted-foreground">📚 Fee Collection ({totals.feeCount})</span>
                      <span>{formatCurrency(totals.feeTotalCollection)}</span>
                    </div>
                  )}
                </div>
                {totals.expenseTotal > 0 && (
                  <div className="flex justify-between py-2 border-b text-destructive">
                    <span className="text-muted-foreground">💸 Total Expenses ({totals.expenseCount})</span>
                    <span className="font-semibold">- {formatCurrency(totals.expenseTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-t mt-2 font-bold text-green-600">
                  <span>Total Collected</span>
                  <span>{formatCurrency(totals.cashSale + totals.cardSale + totals.upiSale + totals.totalSRAdjusted + totals.feeTotalCollection - totals.totalRefund - totals.cashRefundTotal - totals.expenseTotal)}</span>
                </div>
                <div className="pt-2 space-y-1 border-t mt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credit (Outstanding)</span>
                    <span>{formatCurrency(totals.creditSale)}</span>
                  </div>
                  <div className="flex justify-between text-orange-600">
                    <span className="text-muted-foreground">Balance Pending</span>
                    <span>{formatCurrency(totals.totalBalance)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Print Footer */}
          <div className="hidden print:block mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
            <p>Generated on {format(new Date(), "dd/MM/yyyy HH:mm")}</p>
            <p className="mt-2">--- End of Report ---</p>
          </div>
        </>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #cashier-report-root, #cashier-report-root * {
            visibility: visible;
          }
          #cashier-report-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
};

export default DailyCashierReport;
