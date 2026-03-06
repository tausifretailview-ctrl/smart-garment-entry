import { useState } from "react";
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
        .select("*")
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
        totalRefund: 0,
        totalBills: 0,
      };
    }

    let grossSale = 0, totalDiscount = 0, totalSale = 0;
    let cashSale = 0, cardSale = 0, upiSale = 0, creditSale = 0;
    let totalRefund = 0;

    salesData.forEach((sale) => {
      grossSale += Number(sale.gross_amount) || 0;
      totalDiscount += (Number(sale.discount_amount) || 0) + (Number(sale.flat_discount_amount) || 0);
      totalSale += Number(sale.net_amount) || 0;
      totalRefund += Number(sale.refund_amount) || 0;

      if (sale.payment_method === "multiple") {
        cashSale += Number(sale.cash_amount) || 0;
        cardSale += Number(sale.card_amount) || 0;
        upiSale += Number(sale.upi_amount) || 0;
      } else {
        const netAmount = Number(sale.net_amount) || 0;
        switch (sale.payment_method) {
          case "cash": cashSale += Number(sale.cash_amount) || netAmount; break;
          case "card": cardSale += Number(sale.card_amount) || netAmount; break;
          case "upi": upiSale += Number(sale.upi_amount) || netAmount; break;
          case "pay_later": creditSale += netAmount; break;
          default: cashSale += netAmount;
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
      totalRefund,
      totalBills: salesData.length,
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
                      <TableRow className="bg-green-50 dark:bg-green-950">
                        <TableCell className="font-bold">Net Cash Collection</TableCell>
                        <TableCell className="text-right font-bold text-lg">{formatCurrency(totals.cashSale - totals.totalRefund)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
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

  // Client-side filtering for search (handles multi-term and cross-table filtering)
  const stockData = searchQuery.length >= 1
    ? (allProducts || []).filter((item: any) => {
        const searchTerms = searchQuery.toLowerCase().split(/[\s-]+/).filter(Boolean);
        const productName = (item.product?.product_name || '').toLowerCase();
        const brand = (item.product?.brand || '').toLowerCase();
        const variantColor = (item.color || '').toLowerCase(); // Use variant color
        const category = (item.product?.category || '').toLowerCase();
        const barcode = (item.barcode || '').toLowerCase();
        const size = (item.size || '').toLowerCase();
        
        const combinedText = `${productName} ${brand} ${variantColor} ${category} ${barcode} ${size}`;
        
        // All search terms must match
        return searchTerms.every(term => combinedText.includes(term));
      }).slice(0, 100)
    : [];

  // Total stock value
  const totalStockValue = stockData?.reduce((sum, item) => {
    return sum + (Number(item.stock_qty) || 0) * (Number(item.sale_price) || 0);
  }, 0) || 0;

  const totalQty = stockData?.reduce((sum, item) => sum + (Number(item.stock_qty) || 0), 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
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
        ) : stockData && stockData.length > 0 ? (
          <>
            {/* Summary */}
            <div className="flex gap-4 mb-3">
              <div className="bg-blue-50 dark:bg-blue-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Items Found</span>
                <p className="font-bold text-lg">{stockData.length}</p>
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
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockData.map((item: any) => (
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
