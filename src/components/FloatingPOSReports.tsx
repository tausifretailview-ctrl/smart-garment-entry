import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, startOfDay, endOfDay } from "date-fns";
import { 
  Receipt, 
  IndianRupee, 
  CreditCard, 
  Smartphone, 
  TrendingDown, 
  RotateCcw, 
  Package, 
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

// Floating Daily Cashier Report Dialog
function FloatingCashierReport({ open, onOpenChange }: { open: boolean; onOpenChange: () => void }) {
  const { currentOrganization } = useOrganization();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const reportDate = new Date(selectedDate + 'T00:00:00');

  // Fetch sales for selected date
  const { data: salesData, isLoading } = useQuery({
    queryKey: ["floating-cashier-report-sales", currentOrganization?.id, selectedDate],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      
      const startDate = startOfDay(reportDate);
      const endDate = endOfDay(reportDate);
      
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_date, gross_amount, discount_amount, flat_discount_amount, net_amount, refund_amount, payment_method, cash_amount, card_amount, upi_amount, payment_status, sale_return_adjust")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", startDate.toISOString())
        .lte("sale_date", endDate.toISOString())
        .is("deleted_at", null)
        .neq("payment_status", "hold");
      
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id && open,
    refetchInterval: open ? 30000 : false,
  });

  const { data: voucherData } = useQuery({
    queryKey: ["cashier-report-vouchers", currentOrganization?.id, selectedDate],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data } = await supabase
        .from("voucher_entries")
        .select("id, voucher_type, total_amount, payment_method, reference_type, description, category")
        .eq("organization_id", currentOrganization.id)
        .eq("voucher_date", selectedDate)
        .is("deleted_at", null);
      return data || [];
    },
    enabled: !!currentOrganization?.id && open,
  });

  const { data: advancesData } = useQuery({
    queryKey: ["cashier-report-advances", currentOrganization?.id, selectedDate],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data } = await supabase
        .from("customer_advances")
        .select("id, amount, payment_method")
        .eq("organization_id", currentOrganization.id)
        .eq("advance_date", selectedDate);
      return data || [];
    },
    enabled: !!currentOrganization?.id && open,
  });

  const { data: advanceRefundsData } = useQuery({
    queryKey: ["cashier-report-advance-refunds", currentOrganization?.id, selectedDate],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data } = await supabase
        .from("advance_refunds")
        .select("id, refund_amount, payment_method")
        .eq("organization_id", currentOrganization.id)
        .eq("refund_date", selectedDate);
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
    let grossSale = 0, totalDiscount = 0, totalSale = 0;
    let cashSale = 0, cardSale = 0, upiSale = 0, creditSale = 0;
    let totalRefund = 0, totalSRAdjusted = 0;
    let advanceReceived = 0, advanceCash = 0, advanceUpi = 0, advanceCard = 0;
    let receiptCash = 0, receiptUpi = 0, receiptCard = 0, receiptTotal = 0;
    let supplierPaid = 0, expensePaid = 0, employeePaid = 0;
    let advanceRefundTotal = 0, advanceRefundCash = 0;

    (salesData || []).forEach((sale) => {
      grossSale += Number(sale.gross_amount) || 0;
      totalDiscount += (Number(sale.discount_amount) || 0) + (Number(sale.flat_discount_amount) || 0);
      totalSale += Number(sale.net_amount) || 0;
      totalSRAdjusted += Number((sale as any).sale_return_adjust) || 0;
      totalRefund += Number(sale.refund_amount) || 0;

      if (sale.payment_method === "multiple") {
        cashSale += Number(sale.cash_amount) || 0;
        cardSale += Number(sale.card_amount) || 0;
        upiSale += Number(sale.upi_amount) || 0;
      } else {
        const net = Number(sale.net_amount) || 0;
        switch (sale.payment_method) {
          case "cash": cashSale += Number(sale.cash_amount) || net; break;
          case "card": cardSale += Number(sale.card_amount) || net; break;
          case "upi": upiSale += Number(sale.upi_amount) || net; break;
          case "pay_later": creditSale += net; break;
          default: cashSale += net;
        }
      }
    });

    (advancesData || []).forEach((a: any) => {
      const amt = Number(a.amount) || 0;
      const pm = (a.payment_method || 'cash').toLowerCase();
      advanceReceived += amt;
      if (pm === 'upi') advanceUpi += amt;
      else if (pm === 'card') advanceCard += amt;
      else advanceCash += amt;
    });

    (voucherData || []).forEach((v: any) => {
      const amt = Number(v.total_amount) || 0;
      if (amt <= 0) return;
      const m = resolveMode(v.payment_method, v.description);
      if (!m) return; // skip advance_adjustment/credit_note
      if (v.voucher_type === 'receipt') {
        receiptTotal += amt;
        if (m === 'upi') receiptUpi += amt;
        else if (m === 'card') receiptCard += amt;
        else receiptCash += amt;
      } else if (v.voucher_type === 'payment') {
        if (v.reference_type === 'supplier') supplierPaid += amt;
        else if (v.reference_type === 'employee') employeePaid += amt;
      } else if (v.voucher_type === 'expense' || v.category === 'expense') {
        expensePaid += amt;
      }
    });

    (advanceRefundsData || []).forEach((r: any) => {
      const amt = Number(r.refund_amount) || 0;
      advanceRefundTotal += amt;
      const pm = (r.payment_method || 'cash').toLowerCase();
      if (pm === 'cash') advanceRefundCash += amt;
    });

    const totalCashIn = cashSale + advanceCash + receiptCash;
    const totalCashOut = supplierPaid + expensePaid + employeePaid + advanceRefundCash;

    return {
      grossSale: Math.round(grossSale),
      totalDiscount: Math.round(totalDiscount),
      totalSale: Math.round(totalSale),
      cashSale: Math.round(cashSale),
      cardSale: Math.round(cardSale),
      upiSale: Math.round(upiSale),
      creditSale: Math.round(creditSale),
      totalRefund: Math.round(totalRefund),
      totalSRAdjusted: Math.round(totalSRAdjusted),
      totalBills: (salesData || []).length,
      advanceReceived: Math.round(advanceReceived),
      receiptTotal: Math.round(receiptTotal),
      supplierPaid: Math.round(supplierPaid),
      expensePaid: Math.round(expensePaid),
      employeePaid: Math.round(employeePaid),
      advanceRefundTotal: Math.round(advanceRefundTotal),
      totalCashIn: Math.round(totalCashIn),
      totalCashOut: Math.round(totalCashOut),
      netCash: Math.round(totalCashIn - totalCashOut),
    };
  };

  const totals = calculateTotals();

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
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
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
          {isLoading ? (
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
                        <TableCell className="text-right font-medium">{formatCurrency(totals.cashSale)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-blue-600" />
                          Card
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(totals.cardSale)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-purple-600" />
                          UPI
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(totals.upiSale)}</TableCell>
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
                            S/R Adjusted
                          </TableCell>
                          <TableCell className="text-right font-medium text-teal-600">{formatCurrency(totals.totalSRAdjusted)}</TableCell>
                        </TableRow>
                      )}
                      <TableRow className="bg-green-50 dark:bg-green-950">
                        <TableCell className="font-bold">Net Cash Collection</TableCell>
                        {/* cash_amount on the sale row is already negative for refund outflows,
                            so cashSale already reflects the refund — do NOT subtract totalRefund again. */}
                        <TableCell className="text-right font-bold text-lg">{formatCurrency(totals.cashSale)}</TableCell>
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
                            <TableCell>Advance Received</TableCell>
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
              {(totals.supplierPaid > 0 || totals.expensePaid > 0 || totals.employeePaid > 0 || totals.advanceRefundTotal > 0) && (
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
                            <TableCell>Shop Expenses</TableCell>
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

// Floating Stock Report Dialog
export function FloatingStockReport({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch all products for dropdown suggestions (limit for performance)
  const { data: allProducts, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["floating-stock-products", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          barcode,
          size,
          color,
          stock_qty,
          sale_price,
          mrp,
          pur_price,
          product:products!inner(
            id,
            product_name,
            brand,
            category,
            deleted_at
          )
        `)
        .eq("products.organization_id", currentOrganization.id)
        .is("products.deleted_at", null)
        .is("deleted_at", null)
        .eq("active", true)
        .order("stock_qty", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id && open,
  });

  // Client-side filtering for search (memoized to avoid effect loops)
  const stockData = useMemo(() => {
    if (searchQuery.length < 1) return [];

    return (allProducts || []).filter((item: any) => {
      const searchTerms = searchQuery.toLowerCase().split(/[\s-]+/).filter(Boolean);
      const productName = (item.product?.product_name || '').toLowerCase();
      const brand = (item.product?.brand || '').toLowerCase();
      const variantColor = (item.color || '').toLowerCase();
      const category = (item.product?.category || '').toLowerCase();
      const barcode = (item.barcode || '').toLowerCase();
      const size = (item.size || '').toLowerCase();

      const combinedText = `${productName} ${brand} ${variantColor} ${category} ${barcode} ${size}`;
      return searchTerms.every(term => combinedText.includes(term));
    }).slice(0, 100);
  }, [allProducts, searchQuery]);

  // Server-side fallback: if local cache misses (e.g. zero-stock items truncated by the 1000-row limit),
  // hit the DB directly so the user always sees a result — including 0 qty items, like the Stock Report.
  const { data: fallbackData } = useQuery({
    queryKey: ["floating-stock-fallback", currentOrganization?.id, searchQuery],
    queryFn: async () => {
      if (!currentOrganization?.id || searchQuery.trim().length < 1) return [];
      const term = searchQuery.trim();
      const orgId = currentOrganization.id;
      const select = `id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id,
          product:products!inner(id, product_name, brand, category, deleted_at, organization_id)`;

      // 1) Exact barcode match (fast path for scanner / numeric search)
      const exact = await supabase
        .from("product_variants")
        .select(select)
        .eq("products.organization_id", orgId)
        .is("products.deleted_at", null)
        .is("deleted_at", null)
        .eq("active", true)
        .eq("barcode", term)
        .limit(50);
      if (exact.data && exact.data.length > 0) return exact.data;

      // 2) Variant-level partial match (barcode/size/color)
      const variantQ = await supabase
        .from("product_variants")
        .select(select)
        .eq("products.organization_id", orgId)
        .is("products.deleted_at", null)
        .is("deleted_at", null)
        .eq("active", true)
        .or(`barcode.ilike.%${term}%,size.ilike.%${term}%,color.ilike.%${term}%`)
        .limit(100);
      if (variantQ.data && variantQ.data.length > 0) return variantQ.data;

      // 3) Product-level partial match (name/brand/category) → fetch their variants
      const prodQ = await supabase
        .from("products")
        .select("id")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .or(`product_name.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%`)
        .limit(50);
      const prodIds = (prodQ.data || []).map((p: any) => p.id);
      if (prodIds.length === 0) return [];
      const { data: vData } = await supabase
        .from("product_variants")
        .select(select)
        .eq("products.organization_id", orgId)
        .is("products.deleted_at", null)
        .is("deleted_at", null)
        .eq("active", true)
        .in("product_id", prodIds)
        .limit(200);
      return vData || [];
    },
    enabled: !!currentOrganization?.id && open && searchQuery.trim().length >= 1 && stockData.length === 0,
  });

  const displayData = stockData.length > 0 ? stockData : (fallbackData || []);

  // Fetch supplier names for filtered variants
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!displayData.length || !currentOrganization?.id) {
      setSupplierMap({});
      return;
    }

    const variantIds = displayData.map((item: any) => item.id);
    const variantKey = variantIds.join(',');

    (async () => {
      try {
        const { data } = await supabase
          .from("purchase_items")
          .select("sku_id, purchase_bills:purchase_bills!inner(supplier_name)")
          .in("sku_id", variantIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        const map: Record<string, string> = {};
        (data || []).forEach((row: any) => {
          if (row.sku_id && !map[row.sku_id]) {
            map[row.sku_id] = row.purchase_bills?.supplier_name || '';
          }
        });
        setSupplierMap(map);
      } catch {
        /* ignore */
      }
    })();
  }, [currentOrganization?.id, displayData.map((item: any) => item.id).join(',')]);

  // Total stock value
  const totalStockValue = displayData?.reduce((sum, item) => {
    return sum + (Number(item.stock_qty) || 0) * (Number(item.sale_price) || 0);
  }, 0) || 0;

  const totalQty = displayData?.reduce((sum, item) => sum + (Number(item.stock_qty) || 0), 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Quick Stock Check
          </DialogTitle>
        </DialogHeader>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by barcode, product name, brand, size..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {isLoadingProducts ? (
          <div className="text-center py-8">Loading products...</div>
        ) : searchQuery.length < 1 ? (
          <div className="text-center py-8 text-muted-foreground">
            Start typing to search products...
          </div>
        ) : displayData && displayData.length > 0 ? (
          <>
            {/* Summary */}
            <div className="flex gap-4 mb-3">
              <div className="bg-blue-50 dark:bg-blue-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Items Found</span>
                <p className="font-bold text-lg">{displayData.length}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Total Qty</span>
                <p className="font-bold text-lg">{totalQty.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Stock Value</span>
                <p className="font-bold text-lg">₹{Math.round(totalStockValue).toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* Stock Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Product</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Pur. Price</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayData.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.product?.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[item.product?.brand, item.color].filter(Boolean).join(' | ')}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.barcode || '-'}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold ${item.stock_qty <= 0 ? 'text-red-600' : item.stock_qty < 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {item.stock_qty}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{supplierMap[item.id] || '-'}</TableCell>
                      <TableCell className="text-right text-xs">₹{item.pur_price?.toLocaleString('en-IN') || '-'}</TableCell>
                      <TableCell className="text-right">₹{item.mrp?.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right font-medium">₹{item.sale_price?.toLocaleString('en-IN')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No products found matching "{searchQuery}"
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default FloatingPOSReports;
