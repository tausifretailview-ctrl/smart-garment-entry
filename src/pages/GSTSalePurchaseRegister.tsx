import { useState } from "react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths } from "date-fns";
import { FileSpreadsheet, Download, Calendar, Building2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  calculateGSTBreakup,
  isInterState,
  generateGSTRegisterExcel,
  downloadGSTRegisterExcel,
  SalesRegisterRow,
  SaleReturnRegisterRow,
  PurchaseRegisterRow,
  PurchaseReturnRegisterRow,
} from "@/utils/gstRegisterUtils";

type PeriodType = "custom" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-fy" | "last-fy";

const GSTSalePurchaseRegister = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const today = new Date();

  const [fromDate, setFromDate] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [periodType, setPeriodType] = useState<PeriodType>("this-month");
  const [isExporting, setIsExporting] = useState(false);
  const [stats, setStats] = useState<{
    salesCount: number;
    posSalesCount: number;
    saleReturnCount: number;
    purchaseCount: number;
    purchaseReturnCount: number;
  } | null>(null);

  // Get current financial year
  const getCurrentFY = () => {
    const month = today.getMonth();
    const year = today.getFullYear();
    if (month >= 3) { // April onwards
      return { start: new Date(year, 3, 1), end: new Date(year + 1, 2, 31) };
    } else {
      return { start: new Date(year - 1, 3, 1), end: new Date(year, 2, 31) };
    }
  };

  const handlePeriodChange = (value: PeriodType) => {
    setPeriodType(value);
    let start: Date, end: Date;

    switch (value) {
      case "this-month":
        start = startOfMonth(today);
        end = endOfMonth(today);
        break;
      case "last-month":
        const lastMonth = subMonths(today, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        break;
      case "this-quarter":
        start = startOfQuarter(today);
        end = endOfQuarter(today);
        break;
      case "last-quarter":
        const lastQuarter = subMonths(today, 3);
        start = startOfQuarter(lastQuarter);
        end = endOfQuarter(lastQuarter);
        break;
      case "this-fy":
        const currentFY = getCurrentFY();
        start = currentFY.start;
        end = currentFY.end;
        break;
      case "last-fy":
        const lastFY = getCurrentFY();
        start = new Date(lastFY.start.getFullYear() - 1, 3, 1);
        end = new Date(lastFY.start.getFullYear(), 2, 31);
        break;
      default:
        return;
    }

    setFromDate(format(start, "yyyy-MM-dd"));
    setToDate(format(end, "yyyy-MM-dd"));
  };

  const handleExport = async () => {
    if (!currentOrganization?.id) {
      toast({ title: "Error", description: "Organization not found", variant: "destructive" });
      return;
    }

    setIsExporting(true);

    try {
      // Fetch settings for business info
      const { data: settings } = await supabase
        .from("settings")
        .select("business_name, gst_number")
        .eq("organization_id", currentOrganization.id)
        .single();

      const businessName = settings?.business_name || currentOrganization.name || "Business";
      const businessGSTIN = settings?.gst_number || "";

      if (!businessGSTIN) {
        toast({
          title: "Warning",
          description: "Business GSTIN not configured in Settings. Export will continue without GSTIN validation.",
          variant: "destructive",
        });
      }

      const fromDateObj = new Date(fromDate);
      const toDateObj = new Date(toDate);
      toDateObj.setHours(23, 59, 59, 999);

      // ===== Fetch Invoice Sales Data (sale_type = 'invoice') =====
      const { data: salesData } = await supabase
        .from("sales")
        .select(`
          id, sale_number, sale_date, customer_name, net_amount,
          customer_id, customers(gst_number)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("sale_type", "invoice")
        .is("deleted_at", null)
        .gte("sale_date", fromDateObj.toISOString())
        .lte("sale_date", toDateObj.toISOString())
        .order("sale_date", { ascending: true });

      // ===== Fetch POS Sales Data (sale_type = 'pos') =====
      const { data: posSalesData } = await supabase
        .from("sales")
        .select(`
          id, sale_number, sale_date, customer_name, net_amount,
          customer_id, customers(gst_number)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("sale_type", "pos")
        .is("deleted_at", null)
        .gte("sale_date", fromDateObj.toISOString())
        .lte("sale_date", toDateObj.toISOString())
        .order("sale_date", { ascending: true });

      // Fetch sale items for GST breakup (invoice sales)
      const saleIds = salesData?.map(s => s.id) || [];
      const { data: saleItems } = saleIds.length > 0 ? await supabase
        .from("sale_items")
        .select("sale_id, gst_percent, line_total")
        .in("sale_id", saleIds) : { data: [] };

      // Fetch POS sale items for GST breakup
      const posSaleIds = posSalesData?.map(s => s.id) || [];
      const { data: posSaleItems } = posSaleIds.length > 0 ? await supabase
        .from("sale_items")
        .select("sale_id, gst_percent, line_total")
        .in("sale_id", posSaleIds) : { data: [] };

      // Group items by sale_id
      const saleItemsMap = new Map<string, typeof saleItems>();
      saleItems?.forEach(item => {
        const existing = saleItemsMap.get(item.sale_id) || [];
        existing.push(item);
        saleItemsMap.set(item.sale_id, existing);
      });

      // Group POS items by sale_id
      const posSaleItemsMap = new Map<string, typeof posSaleItems>();
      posSaleItems?.forEach(item => {
        const existing = posSaleItemsMap.get(item.sale_id) || [];
        existing.push(item);
        posSaleItemsMap.set(item.sale_id, existing);
      });

      // Process sales register (invoice sales)
      const salesRegister: SalesRegisterRow[] = (salesData || []).map((sale, index) => {
        const items = saleItemsMap.get(sale.id) || [];
        const customerGSTIN = (sale.customers as any)?.gst_number || "";
        const isInterStateTx = isInterState(businessGSTIN, customerGSTIN);
        const breakup = calculateGSTBreakup(items, "inclusive", isInterStateTx);

        return {
          sno: index + 1,
          invoiceNo: sale.sale_number,
          invoiceDate: format(new Date(sale.sale_date), "dd-MM-yyyy"),
          partyName: sale.customer_name,
          gstin: customerGSTIN,
          taxable_0: breakup.taxable_0,
          taxable_5: breakup.taxable_5,
          cgst_2_5: breakup.cgst_2_5,
          sgst_2_5: breakup.sgst_2_5,
          taxable_12: breakup.taxable_12,
          cgst_6: breakup.cgst_6,
          sgst_6: breakup.sgst_6,
          taxable_18: breakup.taxable_18,
          cgst_9: breakup.cgst_9,
          sgst_9: breakup.sgst_9,
          taxable_28: breakup.taxable_28,
          cgst_14: breakup.cgst_14,
          sgst_14: breakup.sgst_14,
          invoiceValue: sale.net_amount,
        };
      });

      // Process POS sales register
      const posSalesRegister: SalesRegisterRow[] = (posSalesData || []).map((sale, index) => {
        const items = posSaleItemsMap.get(sale.id) || [];
        const customerGSTIN = (sale.customers as any)?.gst_number || "";
        const isInterStateTx = isInterState(businessGSTIN, customerGSTIN);
        const breakup = calculateGSTBreakup(items, "inclusive", isInterStateTx);

        return {
          sno: index + 1,
          invoiceNo: sale.sale_number,
          invoiceDate: format(new Date(sale.sale_date), "dd-MM-yyyy"),
          partyName: sale.customer_name,
          gstin: customerGSTIN,
          taxable_0: breakup.taxable_0,
          taxable_5: breakup.taxable_5,
          cgst_2_5: breakup.cgst_2_5,
          sgst_2_5: breakup.sgst_2_5,
          taxable_12: breakup.taxable_12,
          cgst_6: breakup.cgst_6,
          sgst_6: breakup.sgst_6,
          taxable_18: breakup.taxable_18,
          cgst_9: breakup.cgst_9,
          sgst_9: breakup.sgst_9,
          taxable_28: breakup.taxable_28,
          cgst_14: breakup.cgst_14,
          sgst_14: breakup.sgst_14,
          invoiceValue: sale.net_amount,
        };
      });

      // ===== Fetch Sale Returns =====
      const { data: saleReturnsData } = await supabase
        .from("sale_returns")
        .select(`
          id, return_number, return_date, customer_name, net_amount, gst_amount,
          customer_id, customers(gst_number)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("return_date", fromDate)
        .lte("return_date", toDate)
        .order("return_date", { ascending: true });

      const saleReturnIds = saleReturnsData?.map(sr => sr.id) || [];
      const { data: saleReturnItems } = saleReturnIds.length > 0 ? await supabase
        .from("sale_return_items")
        .select("return_id, gst_percent, line_total")
        .in("return_id", saleReturnIds) : { data: [] };

      const saleReturnItemsMap = new Map<string, typeof saleReturnItems>();
      saleReturnItems?.forEach(item => {
        const existing = saleReturnItemsMap.get(item.return_id) || [];
        existing.push(item);
        saleReturnItemsMap.set(item.return_id, existing);
      });

      const saleReturnRegister: SaleReturnRegisterRow[] = (saleReturnsData || []).map((ret, index) => {
        const items = saleReturnItemsMap.get(ret.id) || [];
        const customerGSTIN = (ret.customers as any)?.gst_number || "";
        const isInterStateTx = isInterState(businessGSTIN, customerGSTIN);
        const breakup = calculateGSTBreakup(items.map(i => ({ gst_percent: i.gst_percent, line_total: i.line_total })), "inclusive", isInterStateTx);

        const totalTaxable = breakup.taxable_0 + breakup.taxable_5 + breakup.taxable_12 + breakup.taxable_18 + breakup.taxable_28;
        const totalCGST = breakup.cgst_2_5 + breakup.cgst_6 + breakup.cgst_9 + breakup.cgst_14;
        const totalSGST = breakup.sgst_2_5 + breakup.sgst_6 + breakup.sgst_9 + breakup.sgst_14;
        const totalIGST = breakup.igst_5 + breakup.igst_12 + breakup.igst_18 + breakup.igst_28;

        return {
          sno: index + 1,
          invoiceNo: ret.return_number || "",
          invoiceDate: format(new Date(ret.return_date), "dd-MM-yyyy"),
          partyName: ret.customer_name,
          gstin: customerGSTIN,
          taxableValue: totalTaxable,
          cgst: totalCGST,
          sgst: totalSGST,
          igst: totalIGST,
          invoiceValue: ret.net_amount,
        };
      });

      // ===== Fetch Purchase Bills =====
      const { data: purchaseData } = await supabase
        .from("purchase_bills")
        .select(`
          id, supplier_invoice_no, bill_date, supplier_name, net_amount,
          supplier_id, suppliers(gst_number)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("bill_date", fromDate)
        .lte("bill_date", toDate)
        .order("bill_date", { ascending: true });

      const purchaseIds = purchaseData?.map(p => p.id) || [];
      const { data: purchaseItems } = purchaseIds.length > 0 ? await supabase
        .from("purchase_items")
        .select("bill_id, gst_per, line_total")
        .in("bill_id", purchaseIds) : { data: [] };

      const purchaseItemsMap = new Map<string, typeof purchaseItems>();
      purchaseItems?.forEach(item => {
        const existing = purchaseItemsMap.get(item.bill_id) || [];
        existing.push(item);
        purchaseItemsMap.set(item.bill_id, existing);
      });

      const purchaseRegister: PurchaseRegisterRow[] = (purchaseData || []).map((purchase, index) => {
        const items = purchaseItemsMap.get(purchase.id) || [];
        const supplierGSTIN = (purchase.suppliers as any)?.gst_number || "";
        const isInterStateTx = isInterState(businessGSTIN, supplierGSTIN);
        const breakup = calculateGSTBreakup(
          items.map(i => ({ gst_percent: i.gst_per, line_total: i.line_total })),
          "exclusive",
          isInterStateTx
        );

        return {
          sno: index + 1,
          invoiceNo: purchase.supplier_invoice_no || "",
          invoiceDate: format(new Date(purchase.bill_date), "dd-MM-yyyy"),
          partyName: purchase.supplier_name,
          gstin: supplierGSTIN,
          taxable_0: breakup.taxable_0,
          taxable_5: breakup.taxable_5,
          cgst_2_5: breakup.cgst_2_5,
          sgst_2_5: breakup.sgst_2_5,
          igst_5: breakup.igst_5,
          taxable_12: breakup.taxable_12,
          cgst_6: breakup.cgst_6,
          sgst_6: breakup.sgst_6,
          igst_12: breakup.igst_12,
          taxable_18: breakup.taxable_18,
          cgst_9: breakup.cgst_9,
          sgst_9: breakup.sgst_9,
          igst_18: breakup.igst_18,
          taxable_28: breakup.taxable_28,
          cgst_14: breakup.cgst_14,
          sgst_14: breakup.sgst_14,
          igst_28: breakup.igst_28,
          invoiceValue: purchase.net_amount,
        };
      });

      // ===== Fetch Purchase Returns =====
      const { data: purchaseReturnsData } = await supabase
        .from("purchase_returns")
        .select(`
          id, return_date, supplier_name, net_amount, gst_amount, original_bill_number,
          supplier_id, suppliers(gst_number)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("return_date", fromDate)
        .lte("return_date", toDate)
        .order("return_date", { ascending: true });

      const purchaseReturnIds = purchaseReturnsData?.map(pr => pr.id) || [];
      const { data: purchaseReturnItems } = purchaseReturnIds.length > 0 ? await supabase
        .from("purchase_return_items")
        .select("return_id, gst_per, line_total")
        .in("return_id", purchaseReturnIds) : { data: [] };

      const purchaseReturnItemsMap = new Map<string, typeof purchaseReturnItems>();
      purchaseReturnItems?.forEach(item => {
        const existing = purchaseReturnItemsMap.get(item.return_id) || [];
        existing.push(item);
        purchaseReturnItemsMap.set(item.return_id, existing);
      });

      const purchaseReturnRegister: PurchaseReturnRegisterRow[] = (purchaseReturnsData || []).map((ret, index) => {
        const items = purchaseReturnItemsMap.get(ret.id) || [];
        const supplierGSTIN = (ret.suppliers as any)?.gst_number || "";
        const isInterStateTx = isInterState(businessGSTIN, supplierGSTIN);
        const breakup = calculateGSTBreakup(
          items.map(i => ({ gst_percent: i.gst_per, line_total: i.line_total })),
          "exclusive",
          isInterStateTx
        );

        const totalTaxable = breakup.taxable_0 + breakup.taxable_5 + breakup.taxable_12 + breakup.taxable_18 + breakup.taxable_28;
        const totalCGST = breakup.cgst_2_5 + breakup.cgst_6 + breakup.cgst_9 + breakup.cgst_14;
        const totalSGST = breakup.sgst_2_5 + breakup.sgst_6 + breakup.sgst_9 + breakup.sgst_14;
        const totalIGST = breakup.igst_5 + breakup.igst_12 + breakup.igst_18 + breakup.igst_28;

        return {
          sno: index + 1,
          invoiceNo: ret.original_bill_number || "",
          invoiceDate: format(new Date(ret.return_date), "dd-MM-yyyy"),
          partyName: ret.supplier_name,
          gstin: supplierGSTIN,
          taxableValue: totalTaxable,
          cgst: totalCGST,
          sgst: totalSGST,
          igst: totalIGST,
          invoiceValue: ret.net_amount,
        };
      });

      // Update stats
      setStats({
        salesCount: salesRegister.length,
        posSalesCount: posSalesRegister.length,
        saleReturnCount: saleReturnRegister.length,
        purchaseCount: purchaseRegister.length,
        purchaseReturnCount: purchaseReturnRegister.length,
      });

      // Generate and download Excel
      const workbook = generateGSTRegisterExcel(
        salesRegister,
        saleReturnRegister,
        purchaseRegister,
        purchaseReturnRegister,
        businessName,
        businessGSTIN,
        fromDateObj,
        toDateObj,
        posSalesRegister
      );

      downloadGSTRegisterExcel(workbook, businessGSTIN || "GSTIN", fromDateObj, toDateObj);

      toast({
        title: "Export Successful",
        description: `GST Register exported with ${salesRegister.length} invoice sales, ${posSalesRegister.length} POS sales, ${saleReturnRegister.length} sale returns, ${purchaseRegister.length} purchases, ${purchaseReturnRegister.length} purchase returns.`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "Failed to generate GST register. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
            GST Sale/Purchase Register
          </h1>
          <p className="text-muted-foreground mt-1">
            Export GST compliant Sale & Purchase Register for filing returns
          </p>
        </div>
      </div>

      {/* Main Card */}
      <Card className="brand-accent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Select Period
          </CardTitle>
          <CardDescription>
            Choose the date range for generating GST registers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Period Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Quick Select Period</Label>
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
                  <SelectItem value="last-fy">Last Financial Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fromDate">From Date</Label>
              <Input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPeriodType("custom");
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="toDate">To Date</Label>
              <Input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPeriodType("custom");
                }}
              />
            </div>
          </div>

          <Separator />

          {/* Info Alert */}
          <Alert>
            <Building2 className="h-4 w-4" />
            <AlertTitle>Export Information</AlertTitle>
            <AlertDescription>
              The Excel file will contain 5 sheets: <Badge variant="outline">Sales Register</Badge>{" "}
              <Badge variant="outline">Sale Return Register</Badge>{" "}
              <Badge variant="outline">Purchase Register</Badge>{" "}
              <Badge variant="outline">Purchase Return Register</Badge>{" "}
              <Badge variant="outline">POS Sales Register</Badge>
            </AlertDescription>
          </Alert>

          {/* Export Button */}
          <div className="flex items-center gap-4">
            <Button
              onClick={handleExport}
              disabled={isExporting}
              size="lg"
              className="gap-2"
            >
              <Download className="h-5 w-5" />
              {isExporting ? "Generating..." : "Export to Excel"}
            </Button>

            {stats && (
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>Invoice Sales: <strong className="text-foreground">{stats.salesCount}</strong></span>
                <span>POS Sales: <strong className="text-foreground">{stats.posSalesCount}</strong></span>
                <span>Sale Returns: <strong className="text-foreground">{stats.saleReturnCount}</strong></span>
                <span>Purchases: <strong className="text-foreground">{stats.purchaseCount}</strong></span>
                <span>Purchase Returns: <strong className="text-foreground">{stats.purchaseReturnCount}</strong></span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* GST Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            GST Calculation Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="font-semibold mb-2">Sales Register</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>GST calculated using <strong>Inclusive</strong> method (GST extracted from price)</li>
                <li>CGST/SGST split for intra-state transactions</li>
                <li>Supports all GST slabs: 0%, 5%, 12%, 18%, 28%</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Purchase Register</h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>GST calculated using <strong>Exclusive</strong> method (GST added on top)</li>
                <li>IGST columns included for inter-state purchases</li>
                <li>State code derived from first 2 digits of GSTIN</li>
              </ul>
            </div>
          </div>

          <Separator />

          <div className="text-sm text-muted-foreground">
            <strong>Note:</strong> For accurate inter-state detection, ensure both your business GSTIN 
            (in Settings) and party GSTINs (in Customer/Supplier Master) are correctly configured.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GSTSalePurchaseRegister;
