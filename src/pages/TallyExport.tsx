import { useState } from "react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subMonths } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { 
  Download, 
  FileSpreadsheet, 
  Users, 
  Package, 
  ShoppingCart, 
  TrendingDown, 
  Wallet,
  Info,
  Loader2,
  ExternalLink
} from "lucide-react";
import {
  transformCustomersToLedgers,
  transformSuppliersToLedgers,
  transformProductsToStockItems,
  transformSalesToVouchers,
  transformPurchasesToVouchers,
  transformSaleReturnsToCreditNotes,
  transformPurchaseReturnsToDebitNotes,
  transformReceiptsToVouchers,
  transformPaymentsToVouchers,
  generateTallyExcel,
  downloadTallyExcel
} from "@/utils/tallyExportUtils";

type PeriodType = "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-fy" | "custom";
type ExportType = "masters" | "transactions" | "complete";

const TallyExport = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [isExporting, setIsExporting] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>("this-month");
  const [exportType, setExportType] = useState<ExportType>("complete");
  const [fromDate, setFromDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  
  // Export options
  const [includeCustomers, setIncludeCustomers] = useState(true);
  const [includeSuppliers, setIncludeSuppliers] = useState(true);
  const [includeProducts, setIncludeProducts] = useState(true);
  const [includeSales, setIncludeSales] = useState(true);
  const [includePurchases, setIncludePurchases] = useState(true);
  const [includeSaleReturns, setIncludeSaleReturns] = useState(true);
  const [includePurchaseReturns, setIncludePurchaseReturns] = useState(true);
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [includePayments, setIncludePayments] = useState(true);

  // Preview counts
  const [counts, setCounts] = useState({
    customers: 0,
    suppliers: 0,
    products: 0,
    sales: 0,
    purchases: 0,
    saleReturns: 0,
    purchaseReturns: 0,
    receipts: 0,
    payments: 0
  });

  // Get current financial year
  const getCurrentFY = () => {
    const now = new Date();
    const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return {
      start: new Date(year, 3, 1), // April 1
      end: new Date(year + 1, 2, 31) // March 31
    };
  };

  const handlePeriodChange = (value: PeriodType) => {
    setPeriodType(value);
    const now = new Date();
    
    switch (value) {
      case "this-month":
        setFromDate(format(startOfMonth(now), "yyyy-MM-dd"));
        setToDate(format(endOfMonth(now), "yyyy-MM-dd"));
        break;
      case "last-month":
        const lastMonth = subMonths(now, 1);
        setFromDate(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
        setToDate(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
        break;
      case "this-quarter":
        setFromDate(format(startOfQuarter(now), "yyyy-MM-dd"));
        setToDate(format(endOfQuarter(now), "yyyy-MM-dd"));
        break;
      case "last-quarter":
        const lastQuarter = subMonths(now, 3);
        setFromDate(format(startOfQuarter(lastQuarter), "yyyy-MM-dd"));
        setToDate(format(endOfQuarter(lastQuarter), "yyyy-MM-dd"));
        break;
      case "this-fy":
        const fy = getCurrentFY();
        setFromDate(format(fy.start, "yyyy-MM-dd"));
        setToDate(format(fy.end, "yyyy-MM-dd"));
        break;
    }
  };

  const handleExportTypeChange = (value: ExportType) => {
    setExportType(value);
    if (value === "masters") {
      setIncludeSales(false);
      setIncludePurchases(false);
      setIncludeSaleReturns(false);
      setIncludePurchaseReturns(false);
      setIncludeReceipts(false);
      setIncludePayments(false);
    } else if (value === "transactions") {
      setIncludeCustomers(false);
      setIncludeSuppliers(false);
      setIncludeProducts(false);
      setIncludeSales(true);
      setIncludePurchases(true);
      setIncludeSaleReturns(true);
      setIncludePurchaseReturns(true);
      setIncludeReceipts(true);
      setIncludePayments(true);
    } else {
      setIncludeCustomers(true);
      setIncludeSuppliers(true);
      setIncludeProducts(true);
      setIncludeSales(true);
      setIncludePurchases(true);
      setIncludeSaleReturns(true);
      setIncludePurchaseReturns(true);
      setIncludeReceipts(true);
      setIncludePayments(true);
    }
  };

  const handleExport = async () => {
    if (!currentOrganization) {
      toast({
        title: "Error",
        description: "No organization selected",
        variant: "destructive"
      });
      return;
    }

    setIsExporting(true);
    try {
      // Fetch settings for GST number
      const { data: settings } = await supabase
        .from("settings")
        .select("gst_number, business_name")
        .eq("organization_id", currentOrganization.id)
        .single();
      
      const orgGstin = settings?.gst_number || '';
      const businessName = settings?.business_name || currentOrganization.name;

      let ledgerMasters: any[] = [];
      let stockItems: any[] = [];
      let salesVouchers: any[] = [];
      let purchaseVouchers: any[] = [];
      let creditNotes: any[] = [];
      let debitNotes: any[] = [];
      let receiptVouchers: any[] = [];
      let paymentVouchers: any[] = [];

      // Fetch Masters
      if (includeCustomers) {
        const { data: customers } = await supabase
          .from("customers")
          .select("*")
          .eq("organization_id", currentOrganization.id);
        if (customers) {
          ledgerMasters = [...ledgerMasters, ...transformCustomersToLedgers(customers)];
          setCounts(prev => ({ ...prev, customers: customers.length }));
        }
      }

      if (includeSuppliers) {
        const { data: suppliers } = await supabase
          .from("suppliers")
          .select("*")
          .eq("organization_id", currentOrganization.id);
        if (suppliers) {
          ledgerMasters = [...ledgerMasters, ...transformSuppliersToLedgers(suppliers)];
          setCounts(prev => ({ ...prev, suppliers: suppliers.length }));
        }
      }

      if (includeProducts) {
        const { data: products } = await supabase
          .from("products")
          .select("*")
          .eq("organization_id", currentOrganization.id);
        if (products) {
          stockItems = transformProductsToStockItems(products);
          setCounts(prev => ({ ...prev, products: products.length }));
        }
      }

      // Fetch Transactions
      if (includeSales) {
        const { data: sales } = await supabase
          .from("sales")
          .select(`
            *,
            sale_items (*),
            customers (gst_number)
          `)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .gte("sale_date", fromDate)
          .lte("sale_date", toDate + "T23:59:59");
        
        if (sales) {
          const salesWithGstin = sales.map(s => ({
            ...s,
            customer_gstin: s.customers?.gst_number || ''
          }));
          salesVouchers = transformSalesToVouchers(salesWithGstin, orgGstin);
          setCounts(prev => ({ ...prev, sales: sales.length }));
        }
      }

      if (includePurchases) {
        const { data: purchases } = await supabase
          .from("purchase_bills")
          .select(`
            *,
            purchase_items (*),
            supplier:suppliers (gst_number)
          `)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .gte("bill_date", fromDate)
          .lte("bill_date", toDate);
        
        if (purchases) {
          purchaseVouchers = transformPurchasesToVouchers(purchases, orgGstin);
          setCounts(prev => ({ ...prev, purchases: purchases.length }));
        }
      }

      if (includeSaleReturns) {
        const { data: saleReturns } = await supabase
          .from("sale_returns")
          .select(`
            *,
            sale_return_items (*)
          `)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .gte("return_date", fromDate)
          .lte("return_date", toDate);
        
        if (saleReturns) {
          // Fetch customer GSTIN separately if customer_id exists
          const returnsWithGstin = await Promise.all(saleReturns.map(async (sr) => {
            let customerGstin = '';
            if (sr.customer_id) {
              const { data: customer } = await supabase
                .from("customers")
                .select("gst_number")
                .eq("id", sr.customer_id)
                .single();
              customerGstin = customer?.gst_number || '';
            }
            return { ...sr, customer_gstin: customerGstin };
          }));
          creditNotes = transformSaleReturnsToCreditNotes(returnsWithGstin, orgGstin);
          setCounts(prev => ({ ...prev, saleReturns: saleReturns.length }));
        }
      }

      if (includePurchaseReturns) {
        const { data: purchaseReturns } = await supabase
          .from("purchase_returns")
          .select(`
            *,
            purchase_return_items (*),
            supplier:suppliers (gst_number)
          `)
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .gte("return_date", fromDate)
          .lte("return_date", toDate);
        
        if (purchaseReturns) {
          debitNotes = transformPurchaseReturnsToDebitNotes(purchaseReturns, orgGstin);
          setCounts(prev => ({ ...prev, purchaseReturns: purchaseReturns.length }));
        }
      }

      if (includeReceipts || includePayments) {
        const { data: vouchers } = await supabase
          .from("voucher_entries")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .gte("voucher_date", fromDate)
          .lte("voucher_date", toDate);
        
        if (vouchers) {
          if (includeReceipts) {
            receiptVouchers = transformReceiptsToVouchers(vouchers);
            setCounts(prev => ({ ...prev, receipts: receiptVouchers.length }));
          }
          if (includePayments) {
            paymentVouchers = transformPaymentsToVouchers(vouchers);
            setCounts(prev => ({ ...prev, payments: paymentVouchers.length }));
          }
        }
      }

      // Generate Excel
      const workbook = generateTallyExcel({
        ledgerMasters: ledgerMasters.length > 0 ? ledgerMasters : undefined,
        stockItems: stockItems.length > 0 ? stockItems : undefined,
        salesVouchers: salesVouchers.length > 0 ? salesVouchers : undefined,
        purchaseVouchers: purchaseVouchers.length > 0 ? purchaseVouchers : undefined,
        creditNotes: creditNotes.length > 0 ? creditNotes : undefined,
        debitNotes: debitNotes.length > 0 ? debitNotes : undefined,
        receiptVouchers: receiptVouchers.length > 0 ? receiptVouchers : undefined,
        paymentVouchers: paymentVouchers.length > 0 ? paymentVouchers : undefined
      });

      // Download
      const filename = `Tally_Export_${businessName}_${format(new Date(fromDate), "ddMMMyyyy")}_to_${format(new Date(toDate), "ddMMMyyyy")}.xlsx`;
      downloadTallyExcel(workbook, filename);

      toast({
        title: "Export Successful",
        description: "Tally export file has been downloaded"
      });

    } catch (error: any) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export data",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tally Export</h1>
        <p className="text-muted-foreground mt-1">
          Export your data in TallyPrime-compatible format for accounting integration
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Export Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Export Settings
            </CardTitle>
            <CardDescription>
              Configure what data to export and for which period
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Period Selection */}
            <div className="space-y-2">
              <Label>Select Period</Label>
              <Select value={periodType} onValueChange={(v) => handlePeriodChange(v as PeriodType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="this-quarter">This Quarter</SelectItem>
                  <SelectItem value="last-quarter">Last Quarter</SelectItem>
                  <SelectItem value="this-fy">This Financial Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setPeriodType("custom");
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setPeriodType("custom");
                  }}
                />
              </div>
            </div>

            {/* Export Type */}
            <div className="space-y-2">
              <Label>Export Type</Label>
              <Select value={exportType} onValueChange={(v) => handleExportTypeChange(v as ExportType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select export type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="complete">Complete Export (Masters + Transactions)</SelectItem>
                  <SelectItem value="masters">Masters Only (Ledgers + Stock Items)</SelectItem>
                  <SelectItem value="transactions">Transactions Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleExport} 
              disabled={isExporting} 
              className="w-full"
              size="lg"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export to Excel
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Data Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle>Data Selection</CardTitle>
            <CardDescription>
              Choose which data types to include in the export
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground">Master Data</h4>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="customers" 
                    checked={includeCustomers} 
                    onCheckedChange={(c) => setIncludeCustomers(!!c)}
                    disabled={exportType === "transactions"}
                  />
                  <Label htmlFor="customers" className="flex items-center gap-2 cursor-pointer">
                    <Users className="h-4 w-4" />
                    Customers (Sundry Debtors)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="suppliers" 
                    checked={includeSuppliers} 
                    onCheckedChange={(c) => setIncludeSuppliers(!!c)}
                    disabled={exportType === "transactions"}
                  />
                  <Label htmlFor="suppliers" className="flex items-center gap-2 cursor-pointer">
                    <Users className="h-4 w-4" />
                    Suppliers (Sundry Creditors)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="products" 
                    checked={includeProducts} 
                    onCheckedChange={(c) => setIncludeProducts(!!c)}
                    disabled={exportType === "transactions"}
                  />
                  <Label htmlFor="products" className="flex items-center gap-2 cursor-pointer">
                    <Package className="h-4 w-4" />
                    Products (Stock Items)
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground">Transactions</h4>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="sales" 
                    checked={includeSales} 
                    onCheckedChange={(c) => setIncludeSales(!!c)}
                    disabled={exportType === "masters"}
                  />
                  <Label htmlFor="sales" className="flex items-center gap-2 cursor-pointer">
                    <ShoppingCart className="h-4 w-4" />
                    Sales Vouchers
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="purchases" 
                    checked={includePurchases} 
                    onCheckedChange={(c) => setIncludePurchases(!!c)}
                    disabled={exportType === "masters"}
                  />
                  <Label htmlFor="purchases" className="flex items-center gap-2 cursor-pointer">
                    <ShoppingCart className="h-4 w-4" />
                    Purchase Vouchers
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="saleReturns" 
                    checked={includeSaleReturns} 
                    onCheckedChange={(c) => setIncludeSaleReturns(!!c)}
                    disabled={exportType === "masters"}
                  />
                  <Label htmlFor="saleReturns" className="flex items-center gap-2 cursor-pointer">
                    <TrendingDown className="h-4 w-4" />
                    Credit Notes (Sale Returns)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="purchaseReturns" 
                    checked={includePurchaseReturns} 
                    onCheckedChange={(c) => setIncludePurchaseReturns(!!c)}
                    disabled={exportType === "masters"}
                  />
                  <Label htmlFor="purchaseReturns" className="flex items-center gap-2 cursor-pointer">
                    <TrendingDown className="h-4 w-4" />
                    Debit Notes (Purchase Returns)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="receipts" 
                    checked={includeReceipts} 
                    onCheckedChange={(c) => setIncludeReceipts(!!c)}
                    disabled={exportType === "masters"}
                  />
                  <Label htmlFor="receipts" className="flex items-center gap-2 cursor-pointer">
                    <Wallet className="h-4 w-4" />
                    Receipt Vouchers
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="payments" 
                    checked={includePayments} 
                    onCheckedChange={(c) => setIncludePayments(!!c)}
                    disabled={exportType === "masters"}
                  />
                  <Label htmlFor="payments" className="flex items-center gap-2 cursor-pointer">
                    <Wallet className="h-4 w-4" />
                    Payment Vouchers
                  </Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export Preview */}
      {(counts.customers > 0 || counts.suppliers > 0 || counts.products > 0 || 
        counts.sales > 0 || counts.purchases > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Last Export Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {counts.customers > 0 && (
                <Badge variant="secondary">{counts.customers} Customers</Badge>
              )}
              {counts.suppliers > 0 && (
                <Badge variant="secondary">{counts.suppliers} Suppliers</Badge>
              )}
              {counts.products > 0 && (
                <Badge variant="secondary">{counts.products} Products</Badge>
              )}
              {counts.sales > 0 && (
                <Badge variant="secondary">{counts.sales} Sales</Badge>
              )}
              {counts.purchases > 0 && (
                <Badge variant="secondary">{counts.purchases} Purchases</Badge>
              )}
              {counts.saleReturns > 0 && (
                <Badge variant="secondary">{counts.saleReturns} Sale Returns</Badge>
              )}
              {counts.purchaseReturns > 0 && (
                <Badge variant="secondary">{counts.purchaseReturns} Purchase Returns</Badge>
              )}
              {counts.receipts > 0 && (
                <Badge variant="secondary">{counts.receipts} Receipts</Badge>
              )}
              {counts.payments > 0 && (
                <Badge variant="secondary">{counts.payments} Payments</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            How to Import in TallyPrime
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTitle>Pre-requisites</AlertTitle>
            <AlertDescription>
              Before importing, ensure you have created the following Ledger Groups in Tally:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Sales Accounts (under Revenue)</li>
                <li>Purchase Accounts (under Expenses)</li>
                <li>CGST, SGST, IGST ledgers (under Duties & Taxes)</li>
                <li>Bank/Cash ledgers as needed</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h4 className="font-semibold">Step-by-Step Import Process:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Open TallyPrime and go to your company</li>
              <li>Go to <strong>Gateway of Tally → Import</strong></li>
              <li>Select <strong>Data → Import from Excel</strong></li>
              <li>Browse and select the exported Excel file</li>
              <li>Map the columns to Tally fields (auto-detected in most cases)</li>
              <li>Import each sheet separately: Ledger Masters first, then Stock Items, then Vouchers</li>
              <li>Verify the imported data in respective registers</li>
            </ol>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-4 w-4" />
            <a 
              href="https://help.tallysolutions.com/article/te9rel66/Import_Export/Importing_Data_from_TallyPrime.htm" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              View Official TallyPrime Import Documentation
            </a>
          </div>

          <Alert variant="default" className="bg-amber-50 border-amber-200">
            <AlertTitle className="text-amber-800">Important Notes</AlertTitle>
            <AlertDescription className="text-amber-700">
              <ul className="list-disc list-inside space-y-1">
                <li>For first-time setup, export "Masters Only" first and import into Tally</li>
                <li>Then export "Transactions Only" for periodic data sync</li>
                <li>GST calculations are based on your organization's GSTIN configuration</li>
                <li>Inter-state transactions will have IGST; intra-state will have CGST+SGST</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default TallyExport;
