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
import { CalendarIcon, Printer, IndianRupee, CreditCard, Smartphone, Clock, Receipt, TrendingDown, FileSpreadsheet, FileText, Banknote, RotateCcw } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
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

  // Fetch sales for selected period
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["cashier-report-sales", currentOrganization?.id, selectedDate, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", startDate.toISOString())
        .lte("sale_date", endDate.toISOString())
        .is("deleted_at", null)
        .order("sale_date", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch payment receipts (RCP) for selected period - includes opening balance collections
  const { data: receiptData, isLoading: receiptsLoading } = useQuery({
    queryKey: ["cashier-report-receipts", currentOrganization?.id, selectedDate, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from("voucher_entries")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("voucher_type", "receipt")
        .gte("voucher_date", startDateStr)
        .lte("voucher_date", endDateStr)
        .is("deleted_at", null)
        .order("voucher_date", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  const isLoading = salesLoading || receiptsLoading;

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
        grossSale += Number(sale.gross_amount) || 0;
        totalDiscount += (Number(sale.discount_amount) || 0) + (Number(sale.flat_discount_amount) || 0);
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

    // Net Receivable = Net Sale - S/R Adjusted (actual amount to collect from customers)
    const netReceivable = totalSale - totalSRAdjusted;

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
      ["Less: S/R Adjusted", totals.totalSRAdjusted],
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
      ["Net Cash Collection", grandCashCollection - totals.totalRefund],
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
    doc.text(`Less: S/R Adjusted: ${formatCurrency(totals.totalSRAdjusted)}`, 20, y);
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
    doc.setFont("helvetica", "bold");
    doc.text("Net Cash Collection: " + formatCurrency(grandCashCollection - totals.totalRefund), 20, y);
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

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 print:p-2">
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
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
                        <span className="font-medium">Less: Refund</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600">{formatCurrency(totals.totalRefund)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-green-50 dark:bg-green-950">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-green-200 dark:bg-green-800">
                          <Receipt className="h-4 w-4 text-green-700 dark:text-green-300" />
                        </div>
                        <span className="font-bold">Net Cash Collection</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{formatCurrency(totals.cashSale - totals.totalRefund)}</TableCell>
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
                      <TableRow className="bg-primary/10">
                        <TableCell className="font-bold text-primary">GRAND TOTAL (Sales + RCP)</TableCell>
                        <TableCell className="text-right font-bold text-lg text-primary">
                          {formatCurrency(totals.cashSale + totals.cardSale + totals.upiSale + totals.rcpTotalCollection - totals.totalRefund)}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
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
                    <TableCell className="text-right font-bold text-lg text-green-700 dark:text-green-300">{formatCurrency(totals.netReceivable - totals.totalBalance)}</TableCell>
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
                <div className="flex justify-between py-2 border-b text-teal-600">
                  <span>Less: S/R Adjusted</span>
                  <span className="font-semibold">- {formatCurrency(totals.totalSRAdjusted)}</span>
                </div>
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
                  <span className="text-green-700 dark:text-green-400">{formatCurrency(totals.netReceivable - totals.totalBalance)}</span>
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
                </div>
                <div className="flex justify-between py-2 border-t mt-2 font-bold text-green-600">
                  <span>Total Collected</span>
                  <span>{formatCurrency(totals.cashSale + totals.cardSale + totals.upiSale + totals.totalSRAdjusted - totals.totalRefund)}</span>
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
          .container, .container * {
            visibility: visible;
          }
          .container {
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
