import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { localDayBounds } from "@/lib/localDayBounds";
import {
  getSaleReportLineDiscountAmount,
  getSaleReportGrossAmount,
  getSaleReportNetAmount,
  getSaleReportRoundOff,
} from "@/utils/cashierReportUtils";
import {
  buildCashierReceiptModeMap,
  getCashierSalePaymentModeAmounts,
  toCashierOverlapSaleRow,
} from "@/utils/cashierSaleModeAmounts";
import {
  cashierExpensePaymentMode,
  cashierNetByModeAfterExpenses,
  cashierSaleAndAdvanceCollection,
  createSameDaySaleReceiptOverlapTracker,
  sumCustomerAdvanceTenders,
} from "@/utils/posCashierCashIn";
import { sumCashierSaleReturnRefunds } from "@/utils/cashierSaleReturnRefunds";
import { 
  Receipt, 
  IndianRupee, 
  CreditCard, 
  Smartphone, 
  TrendingDown, 
  RotateCcw, 
  Search,
  X,
  Printer,
  FileText,
  BarChart3
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupBarcodeSales, type BarcodeSaleRecord } from "@/utils/lookupBarcodeSales";
import { FloatingStockReport } from "@/components/FloatingStockReport";

interface FloatingPOSReportsProps {
  showCashierReport: boolean;
  onCloseCashierReport: () => void;
  showStockReport: boolean;
  onCloseStockReport: () => void;
}

export function FloatingPOSReports({
  showCashierReport,
  onCloseCashierReport,
  showStockReport,
  onCloseStockReport,
}: FloatingPOSReportsProps) {
  return (
    <>
      <FloatingCashierReport open={showCashierReport} onOpenChange={onCloseCashierReport} />
      <FloatingStockReport open={showStockReport} onOpenChange={onCloseStockReport} />
    </>
  );
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLocalYmd(ymd: string): Date | null {
  if (!YMD_RE.test(ymd)) return null;
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Floating Daily Cashier Report Dialog
function FloatingCashierReport({ open, onOpenChange }: { open: boolean; onOpenChange: () => void }) {
  const { currentOrganization } = useOrganization();
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  // Native <input type="date"> can emit "" while the user flips months — never crash format().
  const reportDate = parseLocalYmd(selectedDate) ?? new Date();
  const selectedDateSafe = format(reportDate, "yyyy-MM-dd");

  // Fetch sales for selected date
  const { data: salesData, isLoading } = useQuery({
    queryKey: ["floating-cashier-report-sales", currentOrganization?.id, selectedDateSafe],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { startIso, endIso } = localDayBounds(selectedDateSafe, selectedDateSafe);

      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, customer_id, gross_amount, discount_amount, flat_discount_amount, points_redeemed_amount, round_off, net_amount, paid_amount, refund_amount, payment_method, cash_amount, card_amount, upi_amount, payment_status, sale_return_adjust, is_cancelled")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", startIso)
        .lte("sale_date", endIso)
        .is("deleted_at", null);
      
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id && open,
    staleTime: 30_000,
    refetchInterval: open ? 60_000 : false,
  });

  const { data: voucherData } = useQuery({
    queryKey: ["cashier-report-vouchers", currentOrganization?.id, selectedDateSafe],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data } = await supabase
        .from("voucher_entries")
        .select("id, voucher_type, total_amount, discount_amount, payment_method, reference_type, reference_id, description, category")
        .eq("organization_id", currentOrganization.id)
        .eq("voucher_date", selectedDateSafe)
        .is("deleted_at", null);
      return data || [];
    },
    enabled: !!currentOrganization?.id && open,
  });

  const { data: advancesData } = useQuery({
    queryKey: ["cashier-report-advances", currentOrganization?.id, selectedDateSafe],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data } = await supabase
        .from("customer_advances")
        .select("id, amount, payment_method")
        .eq("organization_id", currentOrganization.id)
        .eq("advance_date", selectedDateSafe);
      return data || [];
    },
    enabled: !!currentOrganization?.id && open,
  });

  const { data: advanceRefundsData } = useQuery({
    queryKey: ["cashier-report-advance-refunds", currentOrganization?.id, selectedDateSafe],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data } = await supabase
        .from("advance_refunds")
        .select("id, refund_amount, payment_method")
        .eq("organization_id", currentOrganization.id)
        .eq("refund_date", selectedDateSafe);
      return data || [];
    },
    enabled: !!currentOrganization?.id && open,
  });

  const { data: saleReturnsData, isLoading: saleReturnsLoading } = useQuery({
    queryKey: ["cashier-report-sale-returns", currentOrganization?.id, selectedDateSafe],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("sale_returns")
        .select("id, net_amount, refund_type, payment_method")
        .eq("organization_id", currentOrganization.id)
        .eq("return_date", selectedDateSafe)
        .is("deleted_at", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id && open,
  });

  const resolveMode = (paymentMethod: string | null, description: string): string | null => {
    const pm = (paymentMethod || '').toLowerCase().trim();
    if (pm === 'upi') return 'upi';
    if (pm === 'card') return 'card';
    if (pm === 'bank' || pm === 'cheque' || pm === 'neft' || pm === 'bank_transfer') return 'bank';
    if (pm === 'advance_adjustment' || pm === 'credit_note') return null;
    if (pm === 'cash') return 'cash';
    const d = (description || '').toLowerCase();
    if (d.includes('upi')) return 'upi';
    if (d.includes('card')) return 'card';
    if (d.includes('bank') || d.includes('neft') || d.includes('cheque')) return 'bank';
    return 'cash';
  };

  const calculateTotals = () => {
    let grossSale = 0, totalDiscount = 0, totalSale = 0, totalRoundOff = 0;
    let cashSale = 0, cardSale = 0, upiSale = 0, creditSale = 0;
    let totalRefund = 0, totalSRAdjusted = 0;
    const srRefunds = sumCashierSaleReturnRefunds(saleReturnsData);
    const advanceTenders = sumCustomerAdvanceTenders(advancesData || []);
    let advanceReceived = advanceTenders.advanceReceived;
    let advanceCash = advanceTenders.advanceCash;
    let advanceUpi = advanceTenders.advanceUpi;
    let advanceCard = advanceTenders.advanceCard;
    let receiptCash = 0, receiptUpi = 0, receiptCard = 0, receiptTotal = 0;
    let supplierPaid = 0, expensePaid = 0, employeePaid = 0;
    let expenseCash = 0, expenseUpi = 0, expenseCard = 0;
    let advanceRefundTotal = 0, advanceRefundCash = 0;

    const isHoldLikeSale = (sale: any) => {
      if (sale?.payment_status === "hold") return true;
      return sale?.payment_status === "pending" && String(sale?.sale_number || "").startsWith("Hold/");
    };

    const eligibleSales = (salesData || []).filter((sale: any) => {
      if (sale?.is_cancelled) return false;
      if (sale?.payment_status === "cancelled") return false;
      if (isHoldLikeSale(sale)) return false;
      return true;
    });

    const receiptModeBySale = buildCashierReceiptModeMap(
      eligibleSales
        .filter((s: any) => s?.id)
        .map((s: any) => ({
          id: s.id as string,
          sale_number: s.sale_number,
          customer_id: s.customer_id,
          net_amount: s.net_amount,
          sale_return_adjust: s.sale_return_adjust,
        })),
      (voucherData || [])
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

    eligibleSales.forEach((sale: any) => {
      grossSale += getSaleReportGrossAmount(sale);
      totalDiscount += getSaleReportLineDiscountAmount(sale);
      totalRoundOff += getSaleReportRoundOff(sale);
      const net = getSaleReportNetAmount(sale);
      totalSale += net;
      totalSRAdjusted += Number((sale as any).sale_return_adjust) || 0;
      totalRefund += Number(sale.refund_amount) || 0;

      const receiptModes = sale.id ? receiptModeBySale.get(sale.id) : undefined;
      const displayModes = getCashierSalePaymentModeAmounts(sale, receiptModes);
      if (sale.id) {
        displayModesBySaleId.set(sale.id, displayModes);
      }

      if (sale.payment_method === "pay_later") {
        creditSale += net;
      } else {
        cashSale += displayModes.cash;
        cardSale += displayModes.card;
        upiSale += displayModes.upi;
      }
    });

    // Strip same-day sale RCP already covered by tenders (historical POS Dashboard dual-write).
    const receiptOverlap = createSameDaySaleReceiptOverlapTracker(
      eligibleSales
        .filter((s: any) => !!s?.id)
        .map((s: any) => {
          const displayModes =
            displayModesBySaleId.get(s.id) ??
            getCashierSalePaymentModeAmounts(
              s,
              receiptModeBySale.get(s.id),
            );
          return toCashierOverlapSaleRow(s, displayModes);
        }),
      voucherData || [],
    );

    (voucherData || []).forEach((v: any) => {
      const rawAmt = Number(v.total_amount) || 0;
      if (rawAmt <= 0) return;
      const m = resolveMode(v.payment_method, v.description);
      if (!m) return; // skip advance_adjustment/credit_note
      if (v.voucher_type === 'receipt') {
        const amt = receiptOverlap.countableAmount(v);
        if (amt <= 0) return;
        receiptTotal += amt;
        if (m === 'upi') receiptUpi += amt;
        else if (m === 'card') receiptCard += amt;
        else receiptCash += amt;
      } else if (v.voucher_type === 'payment') {
        if (v.reference_type === 'supplier') supplierPaid += rawAmt;
        else if (v.reference_type === 'employee') employeePaid += rawAmt;
      } else if (v.voucher_type === 'expense' || v.category === 'expense') {
        expensePaid += rawAmt;
        const expMode = cashierExpensePaymentMode(v.payment_method);
        if (expMode === "upi") expenseUpi += rawAmt;
        else if (expMode === "card") expenseCard += rawAmt;
        else if (expMode === "cash") expenseCash += rawAmt;
      }
    });

    (advanceRefundsData || []).forEach((r: any) => {
      const amt = Number(r.refund_amount) || 0;
      advanceRefundTotal += amt;
      const pm = (r.payment_method || 'cash').toLowerCase();
      if (pm === 'cash') advanceRefundCash += amt;
    });

    totalRefund += srRefunds.refundTotal;

    const totalCashIn = cashSale + advanceCash + receiptCash;
    const totalCashOut =
      supplierPaid + expenseCash + employeePaid + advanceRefundCash + srRefunds.cashOut;

    return {
      grossSale: Math.round(grossSale),
      totalDiscount: Math.round(totalDiscount),
      totalSale: Math.round(totalSale),
      totalRoundOff: Math.round(totalRoundOff),
      cashSale: Math.round(cashSale),
      cardSale: Math.round(cardSale),
      upiSale: Math.round(upiSale),
      creditSale: Math.round(creditSale),
      totalRefund: Math.round(totalRefund),
      saleReturnRefundTotal: Math.round(srRefunds.refundTotal),
      saleReturnCashOut: Math.round(srRefunds.cashOut),
      totalSRAdjusted: Math.round(totalSRAdjusted),
      totalBills: eligibleSales.length,
      advanceReceived: Math.round(advanceReceived),
      advanceCash: Math.round(advanceCash),
      advanceUpi: Math.round(advanceUpi),
      advanceCard: Math.round(advanceCard),
      receiptTotal: Math.round(receiptTotal),
      supplierPaid: Math.round(supplierPaid),
      expensePaid: Math.round(expensePaid),
      expenseCash: Math.round(expenseCash),
      expenseUpi: Math.round(expenseUpi),
      expenseCard: Math.round(expenseCard),
      employeePaid: Math.round(employeePaid),
      advanceRefundTotal: Math.round(advanceRefundTotal),
      totalCashIn: Math.round(totalCashIn),
      totalCashOut: Math.round(totalCashOut),
      netCash: Math.round(totalCashIn - totalCashOut),
    };
  };

  const totals = calculateTotals();
  const paymentCollection = cashierSaleAndAdvanceCollection({
    cashSale: totals.cashSale,
    cardSale: totals.cardSale,
    upiSale: totals.upiSale,
    advanceCash: totals.advanceCash,
    advanceCard: totals.advanceCard,
    advanceUpi: totals.advanceUpi,
  });
  const collectionNetOfExpenses = cashierNetByModeAfterExpenses({
    cash: paymentCollection.cashCollection,
    card: paymentCollection.cardCollection,
    upi: paymentCollection.upiCollection,
    expenseCash: totals.expenseCash,
    expenseCard: totals.expenseCard,
    expenseUpi: totals.expenseUpi,
  });

  const formatCurrency = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`;

  const handlePrint = () => {
    const printContent = document.getElementById('floating-cashier-report');
    if (printContent) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Daily Cashier Report - ${format(reportDate, 'dd/MM/yyyy')}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background: #f5f5f5; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .summary-card { display: inline-block; padding: 10px 20px; margin: 5px; border: 1px solid #ddd; border-radius: 8px; }
              </style>
            </head>
            <body>
              <h2 style="text-align: center;">Daily Cashier Report</h2>
              <p style="text-align: center;">${format(reportDate, 'dd MMM yyyy')}</p>
              ${printContent.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Daily Cashier Report - {format(reportDate, 'dd MMM yyyy')}
            </DialogTitle>
            <div className="flex items-center gap-2 mr-8">
              <Input
                type="date"
                value={selectedDateSafe}
                onChange={(e) => {
                  const next = e.target.value;
                  // Ignore empty/partial values fired while flipping months in the native picker.
                  if (parseLocalYmd(next)) setSelectedDate(next);
                }}
                className="h-8 w-36 text-sm"
              />
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div id="floating-cashier-report">
          {isLoading || saleReturnsLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-white/90 text-xs mb-1">
                      <Receipt className="h-3 w-3" />
                      Gross Sale
                    </div>
                    <p className="text-lg font-bold text-white">{formatCurrency(totals.grossSale)}</p>
                    <p className="text-[10px] text-white/70">{totals.totalBills} Bills</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-red-500 to-red-600 border-0">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-white/90 text-xs mb-1">
                      <TrendingDown className="h-3 w-3" />
                      Discount
                    </div>
                    <p className="text-lg font-bold text-white">{formatCurrency(totals.totalDiscount)}</p>
                    <p className="text-[10px] text-white/70">Line + bill + points</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-slate-500 to-slate-600 border-0">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-white/90 text-xs mb-1">
                      <IndianRupee className="h-3 w-3" />
                      Round Off
                    </div>
                    <p className="text-lg font-bold text-white">{formatCurrency(totals.totalRoundOff)}</p>
                    <p className="text-[10px] text-white/70">Not included in Discount</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-white/90 text-xs mb-1">
                      <IndianRupee className="h-3 w-3" />
                      Net Sale
                    </div>
                    <p className="text-lg font-bold text-white">{formatCurrency(totals.totalSale)}</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-white/90 text-xs mb-1">
                      <RotateCcw className="h-3 w-3" />
                      Refund
                    </div>
                    <p className="text-lg font-bold text-white">{formatCurrency(totals.totalRefund)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Payment Breakdown */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Payment Collection</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="flex items-center gap-2">
                          <IndianRupee className="h-4 w-4 text-green-600" />
                          Cash
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(collectionNetOfExpenses.cash)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-blue-600" />
                          Card
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(collectionNetOfExpenses.card)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-purple-600" />
                          UPI
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(collectionNetOfExpenses.upi)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-yellow-600" />
                          Credit (Pay Later)
                        </TableCell>
                        <TableCell className="text-right font-medium text-yellow-600">{formatCurrency(totals.creditSale)}</TableCell>
                      </TableRow>
                      {totals.totalSRAdjusted > 0 && (
                        <TableRow>
                          <TableCell className="flex items-center gap-2">
                            <RotateCcw className="h-4 w-4 text-teal-600" />
                            Old credit used on bills
                          </TableCell>
                          <TableCell className="text-right font-medium text-teal-600">{formatCurrency(totals.totalSRAdjusted)}</TableCell>
                        </TableRow>
                      )}
                      <TableRow className="bg-green-50 dark:bg-green-950">
                        <TableCell className="font-bold">Net Cash Collection</TableCell>
                        {/* Exchange refunds already sit in cash_amount (often negative).
                            Standalone S/R cash refunds do not — subtract those only. */}
                        <TableCell className="text-right font-bold text-lg">
                          {formatCurrency(collectionNetOfExpenses.cash - totals.saleReturnCashOut)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Other Money In */}
              {(totals.advanceReceived > 0 || totals.receiptTotal > 0) && (
                <Card className="mt-3">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm text-green-700 dark:text-green-400">💰 Other Money In</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <Table>
                      <TableBody>
                        {totals.advanceReceived > 0 && (
                          <TableRow>
                            <TableCell>
                              <div>Advance Received</div>
                              <div className="text-xs text-muted-foreground font-normal">
                                Included in Cash / UPI / Card by payment mode
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-medium">{formatCurrency(totals.advanceReceived)}</TableCell>
                          </TableRow>
                        )}
                        {totals.receiptTotal > 0 && (
                          <TableRow>
                            <TableCell>Old Balance Received</TableCell>
                            <TableCell className="text-right text-green-600 font-medium">{formatCurrency(totals.receiptTotal)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Money Out */}
              {(totals.supplierPaid > 0 || totals.expensePaid > 0 || totals.employeePaid > 0 || totals.advanceRefundTotal > 0 || totals.saleReturnRefundTotal > 0) && (
                <Card className="mt-3">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm text-red-700 dark:text-red-400">📤 Money Out</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <Table>
                      <TableBody>
                        {totals.supplierPaid > 0 && (
                          <TableRow>
                            <TableCell>Supplier Payments</TableCell>
                            <TableCell className="text-right text-red-600 font-medium">{formatCurrency(totals.supplierPaid)}</TableCell>
                          </TableRow>
                        )}
                        {totals.expensePaid > 0 && (
                          <TableRow>
                            <TableCell>
                              <div>Shop Expenses</div>
                              <div className="text-xs text-muted-foreground font-normal">
                                {[
                                  totals.expenseCash > 0 ? `Cash ${formatCurrency(totals.expenseCash)}` : null,
                                  totals.expenseUpi > 0 ? `UPI ${formatCurrency(totals.expenseUpi)}` : null,
                                  totals.expenseCard > 0 ? `Card ${formatCurrency(totals.expenseCard)}` : null,
                                ].filter(Boolean).join(" · ") || "By payment mode"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-red-600 font-medium">{formatCurrency(totals.expensePaid)}</TableCell>
                          </TableRow>
                        )}
                        {totals.employeePaid > 0 && (
                          <TableRow>
                            <TableCell>Employee Salary</TableCell>
                            <TableCell className="text-right text-red-600 font-medium">{formatCurrency(totals.employeePaid)}</TableCell>
                          </TableRow>
                        )}
                        {totals.advanceRefundTotal > 0 && (
                          <TableRow>
                            <TableCell>Advance Refunds</TableCell>
                            <TableCell className="text-right text-red-600 font-medium">{formatCurrency(totals.advanceRefundTotal)}</TableCell>
                          </TableRow>
                        )}
                        {totals.saleReturnRefundTotal > 0 && (
                          <TableRow>
                            <TableCell>Sale Return Refunds</TableCell>
                            <TableCell className="text-right text-red-600 font-medium">{formatCurrency(totals.saleReturnRefundTotal)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Net Cash Summary */}
              <Card className="mt-3 bg-muted/30">
                <CardContent className="py-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Cash In</p>
                      <p className="font-bold text-green-600">{formatCurrency(totals.totalCashIn)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cash Out</p>
                      <p className="font-bold text-red-600">{formatCurrency(totals.totalCashOut)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Net Cash</p>
                      <p className={`font-bold ${totals.netCash >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{formatCurrency(totals.netCash)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Floating Barcode Sale Lookup Dialog
export function FloatingSaleReport({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setDebouncedQuery("");
      return;
    }
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery, open]);

  const flushSearch = () => setDebouncedQuery(searchQuery.trim());

  const { data: saleRows = [], isPending, error, refetch } = useQuery({
    queryKey: ["floating-barcode-sale-report", currentOrganization?.id, debouncedQuery],
    queryFn: () => lookupBarcodeSales(currentOrganization!.id, debouncedQuery),
    enabled: !!currentOrganization?.id && open && debouncedQuery.length >= 3,
    staleTime: STALE_LIVE,
    refetchOnWindowFocus: false,
  });

  const isDebouncing = debouncedQuery !== searchQuery.trim();
  const showLoading = isDebouncing || (isPending && saleRows.length === 0);

  const totalQty = saleRows.reduce((sum, row) => sum + row.quantity, 0);
  const totalAmount = saleRows.reduce((sum, row) => sum + row.lineTotal, 0);
  const uniqueBills = new Set(saleRows.map((row) => row.saleId)).size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Quick Sale Check
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search by barcode, product name, brand, size, color... (multi-word AND)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                flushSearch();
              }
            }}
            className="pl-9"
            autoFocus
            autoComplete="off"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => {
                setSearchQuery("");
                setDebouncedQuery("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {searchQuery.trim().length < 1 ? (
          <div className="text-center py-8 text-muted-foreground">
            Start typing to search sale history...
          </div>
        ) : showLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading sales...</div>
        ) : error ? (
          <div className="text-center py-8 text-destructive">
            {(error as Error).message}
            <Button variant="link" className="ml-2" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : saleRows.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-4 mb-3">
              <div className="bg-blue-50 dark:bg-blue-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Sale Lines</span>
                <p className="font-bold text-lg">{saleRows.length}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Bills</span>
                <p className="font-bold text-lg">{uniqueBills}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Total Qty</span>
                <p className="font-bold text-lg">{totalQty.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Line Total</span>
                <p className="font-bold text-lg">₹{Math.round(totalAmount).toLocaleString("en-IN")}</p>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Bill No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saleRows.map((row: BarcodeSaleRecord) => (
                    <TableRow key={row.saleItemId} className={row.isCancelled ? "opacity-60" : undefined}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(row.saleDate), "dd-MMM-yyyy")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.saleNumber}
                        {row.isCancelled && (
                          <span className="ml-1 text-[10px] text-destructive">(Cancelled)</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate" title={row.customerName}>
                        {row.customerName}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{row.productName}</p>
                          {row.color && (
                            <p className="text-xs text-muted-foreground">{row.color}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.barcode || "—"}</TableCell>
                      <TableCell>{row.size}</TableCell>
                      <TableCell className="text-right font-medium">{row.quantity}</TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{row.unitPrice.toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No sales found matching &quot;{debouncedQuery}&quot;
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default FloatingPOSReports;
