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
import { CalendarIcon, Printer, IndianRupee, CreditCard, Smartphone, Clock, Receipt, TrendingDown, FileSpreadsheet, FileText } from "lucide-react";
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
  const { data: salesData, isLoading } = useQuery({
    queryKey: ["cashier-report", currentOrganization?.id, selectedDate, period],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", startDate.toISOString())
        .lte("sale_date", endDate.toISOString())
        .order("sale_date", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

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

  // Calculate totals
  const calculateTotals = () => {
    if (!salesData || salesData.length === 0) {
      return {
        grossSale: 0,
        totalDiscount: 0,
        totalSale: 0,
        cashSale: 0,
        cardSale: 0,
        upiSale: 0,
        creditSale: 0,
        totalPaid: 0,
        totalBalance: 0,
        totalBills: 0,
        cashBills: 0,
        cardBills: 0,
        upiBills: 0,
        creditBills: 0,
        mixBills: 0,
      };
    }

    let grossSale = 0;
    let totalDiscount = 0;
    let totalSale = 0;
    let cashSale = 0;
    let cardSale = 0;
    let upiSale = 0;
    let creditSale = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let cashBills = 0;
    let cardBills = 0;
    let upiBills = 0;
    let creditBills = 0;
    let mixBills = 0;

    salesData.forEach((sale) => {
      grossSale += Number(sale.gross_amount) || 0;
      totalDiscount += (Number(sale.discount_amount) || 0) + (Number(sale.flat_discount_amount) || 0);
      totalSale += Number(sale.net_amount) || 0;

      const netAmount = Number(sale.net_amount) || 0;
      const paidAmount = Number(sale.paid_amount) || 0;
      const balance = netAmount - paidAmount;
      
      totalPaid += paidAmount;
      totalBalance += balance;
      
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

    return {
      grossSale,
      totalDiscount,
      totalSale,
      cashSale,
      cardSale,
      upiSale,
      creditSale,
      totalPaid,
      totalBalance,
      totalBills: salesData.length,
      cashBills,
      cardBills,
      upiBills,
      creditBills,
      mixBills,
    };
  };

  const totals = calculateTotals();

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const data = [
      ["Cashier Report - " + getPeriodLabel()],
      [settings?.business_name || "Business Name"],
      [],
      ["Summary"],
      ["Gross Sale", totals.grossSale],
      ["Total Discount", totals.totalDiscount],
      ["Net Sale", totals.totalSale],
      ["Total Paid", totals.totalPaid],
      ["Total Balance", totals.totalBalance],
      [],
      ["Payment Method Breakdown"],
      ["Payment Method", "Bills", "Amount"],
      ["Cash", totals.cashBills, totals.cashSale],
      ["Card", totals.cardBills, totals.cardSale],
      ["UPI", totals.upiBills, totals.upiSale],
      ["Mix Payment", totals.mixBills, totals.cashSale + totals.cardSale + totals.upiSale - (totals.cashBills * (totals.cashSale / (totals.cashBills || 1))) - (totals.cardBills * (totals.cardSale / (totals.cardBills || 1))) - (totals.upiBills * (totals.upiSale / (totals.upiBills || 1)))],
      ["Credit (Pay Later)", totals.creditBills, totals.creditSale],
      ["Total", totals.totalBills, totals.totalSale],
      [],
      ["Collection Summary"],
      ["Total Cash Collection", totals.cashSale],
      ["Total Card Collection", totals.cardSale],
      ["Total UPI Collection", totals.upiSale],
      ["Total Collection", totals.totalPaid],
      ["Credit (Outstanding)", totals.creditSale],
      ["Total Balance Pending", totals.totalBalance],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cashier Report");
    XLSX.writeFile(wb, `Cashier_Report_${format(selectedDate, "yyyy-MM-dd")}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
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
    doc.text("Summary", 20, y);
    doc.setFont("helvetica", "normal");
    y += 10;
    doc.text(`Gross Sale: ${formatCurrency(totals.grossSale)}`, 20, y);
    y += 7;
    doc.text(`Total Discount: ${formatCurrency(totals.totalDiscount)}`, 20, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text(`Net Sale: ${formatCurrency(totals.totalSale)}`, 20, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.text(`Total Paid: ${formatCurrency(totals.totalPaid)}`, 20, y);
    y += 7;
    doc.text(`Balance Pending: ${formatCurrency(totals.totalBalance)}`, 20, y);
    doc.setFont("helvetica", "normal");

    // Payment Breakdown
    y += 15;
    doc.setFont("helvetica", "bold");
    doc.text("Payment Collection Breakdown", 20, y);
    doc.setFont("helvetica", "normal");
    y += 10;
    
    doc.text("Cash Collection: " + formatCurrency(totals.cashSale), 20, y);
    y += 7;
    doc.text("Card Collection: " + formatCurrency(totals.cardSale), 20, y);
    y += 7;
    doc.text("UPI Collection: " + formatCurrency(totals.upiSale), 20, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Total Collection: " + formatCurrency(totals.totalPaid), 20, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.text("Credit Outstanding: " + formatCurrency(totals.creditSale), 20, y);

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
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="print:hidden">
        <BackToDashboard />
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cashier Report</h1>
          <p className="text-muted-foreground">Sales summary by payment method</p>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Gross Sale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{formatCurrency(totals.grossSale)}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">{totals.totalBills} Bills</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Total Discount
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-900 dark:text-red-100">{formatCurrency(totals.totalDiscount)}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200 dark:border-green-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                  <IndianRupee className="h-4 w-4" />
                  Net Sale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{formatCurrency(totals.totalSale)}</p>
                <p className="text-xs text-green-600 dark:text-green-400">Gross - Discount</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200 dark:border-orange-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Balance Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{formatCurrency(totals.totalBalance)}</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">Outstanding</p>
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
                  <TableRow className="bg-green-50 dark:bg-green-950">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-green-200 dark:bg-green-800">
                          <Receipt className="h-4 w-4 text-green-700 dark:text-green-300" />
                        </div>
                        <span className="font-bold">Total Collection</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">{formatCurrency(totals.totalPaid)}</TableCell>
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
                <div className="flex justify-between py-2 border-b-2 border-double text-lg font-bold">
                  <span>Net Sale</span>
                  <span>{formatCurrency(totals.totalSale)}</span>
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credit (Outstanding)</span>
                    <span>{formatCurrency(totals.creditSale)}</span>
                  </div>
                  <div className="flex justify-between text-orange-600">
                    <span className="text-muted-foreground">Balance Pending</span>
                    <span>{formatCurrency(totals.totalBalance)}</span>
                  </div>
                </div>
                <div className="flex justify-between py-2 border-t mt-2 font-bold text-green-600">
                  <span>Total Collection</span>
                  <span>{formatCurrency(totals.totalPaid)}</span>
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
