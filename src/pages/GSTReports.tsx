import { useState } from "react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subMonths } from "date-fns";
import { 
  FileSpreadsheet, 
  Download, 
  Calendar, 
  Building2, 
  FileText,
  BarChart3,
  ChevronRight,
  BookOpen,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as XLSX from "xlsx";
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
type ReportType = "gstr1" | "gstr2" | "gstr3b" | "hsn-summary" | "register";

interface GSTR1Data {
  b2b: any[];
  b2cs: any[];
  cdnr: any[];
  hsn: any[];
  summary: {
    totalInvoices: number;
    totalTaxableValue: number;
    totalIGST: number;
    totalCGST: number;
    totalSGST: number;
    totalCess: number;
  };
}

interface GSTR3BSummary {
  outwardSupplies: {
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
  };
  inwardSupplies: {
    taxable: number;
    igst: number;
    cgst: number;
    sgst: number;
  };
  itcAvailable: {
    igst: number;
    cgst: number;
    sgst: number;
  };
  netTaxPayable: {
    igst: number;
    cgst: number;
    sgst: number;
  };
}

interface HSNSummary {
  hsnCode: string;
  description: string;
  uqc: string;
  totalQty: number;
  totalValue: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  rate: number;
}

const GSTReports = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const today = new Date();

  const [fromDate, setFromDate] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [periodType, setPeriodType] = useState<PeriodType>("this-month");
  const [activeReport, setActiveReport] = useState<ReportType>("gstr1");
  const [isLoading, setIsLoading] = useState(false);
  const [gstr1Data, setGstr1Data] = useState<GSTR1Data | null>(null);
  const [gstr3bData, setGstr3bData] = useState<GSTR3BSummary | null>(null);
  const [hsnData, setHsnData] = useState<HSNSummary[]>([]);
  const [businessInfo, setBusinessInfo] = useState<{ name: string; gstin: string }>({ name: "", gstin: "" });

  // Get current financial year
  const getCurrentFY = () => {
    const month = today.getMonth();
    const year = today.getFullYear();
    if (month >= 3) {
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

  const fetchBusinessInfo = async () => {
    if (!currentOrganization?.id) return;
    
    const { data: settings } = await supabase
      .from("settings")
      .select("business_name, gst_number")
      .eq("organization_id", currentOrganization.id)
      .single();
    
    setBusinessInfo({
      name: settings?.business_name || currentOrganization.name || "Business",
      gstin: settings?.gst_number || ""
    });
    
    return settings;
  };

  const generateGSTR1 = async () => {
    if (!currentOrganization?.id) {
      toast({ title: "Error", description: "Organization not found", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      await fetchBusinessInfo();
      
      const fromDateObj = new Date(fromDate);
      const toDateObj = new Date(toDate);
      toDateObj.setHours(23, 59, 59, 999);

      // Fetch all sales for the period
      const { data: salesData } = await supabase
        .from("sales")
        .select(`
          id, sale_number, sale_date, customer_name, net_amount, gross_amount, discount_amount,
          customer_id, customers(gst_number, address)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", fromDateObj.toISOString())
        .lte("sale_date", toDateObj.toISOString())
        .order("sale_date", { ascending: true });

      const saleIds = salesData?.map(s => s.id) || [];
      const { data: saleItems } = saleIds.length > 0 ? await supabase
        .from("sale_items")
        .select("sale_id, gst_percent, line_total, hsn_code, quantity, product_name")
        .in("sale_id", saleIds) : { data: [] };

      // Group items by sale
      const saleItemsMap = new Map<string, typeof saleItems>();
      saleItems?.forEach(item => {
        const existing = saleItemsMap.get(item.sale_id) || [];
        existing.push(item);
        saleItemsMap.set(item.sale_id, existing);
      });

      // B2B - Sales to registered dealers
      const b2b: any[] = [];
      // B2CS - Sales to unregistered dealers
      const b2cs: any[] = [];
      // HSN Summary
      const hsnMap = new Map<string, HSNSummary>();

      let totalTaxableValue = 0;
      let totalIGST = 0;
      let totalCGST = 0;
      let totalSGST = 0;

      salesData?.forEach(sale => {
        const customerGSTIN = (sale.customers as any)?.gst_number || "";
        const items = saleItemsMap.get(sale.id) || [];
        const isB2B = customerGSTIN && customerGSTIN.length === 15;

        // Calculate GST from items
        let saleGstAmount = 0;
        items.forEach(item => {
          const rate = item.gst_percent || 0;
          const lineTotal = item.line_total || 0;
          const taxableValue = lineTotal / (1 + rate / 100);
          const gstAmount = lineTotal - taxableValue;
          const cgst = gstAmount / 2;
          const sgst = gstAmount / 2;

          saleGstAmount += gstAmount;
          totalTaxableValue += taxableValue;
          totalCGST += cgst;
          totalSGST += sgst;

          // HSN aggregation
          const hsnCode = item.hsn_code || "00000000";
          const existing = hsnMap.get(hsnCode) || {
            hsnCode,
            description: item.product_name || "",
            uqc: "NOS",
            totalQty: 0,
            totalValue: 0,
            taxableValue: 0,
            igst: 0,
            cgst: 0,
            sgst: 0,
            rate
          };
          existing.totalQty += item.quantity || 1;
          existing.totalValue += lineTotal;
          existing.taxableValue += taxableValue;
          existing.cgst += cgst;
          existing.sgst += sgst;
          hsnMap.set(hsnCode, existing);
        });

        const taxableValue = sale.net_amount - saleGstAmount;

        if (isB2B) {
          b2b.push({
            gstin: customerGSTIN,
            partyName: sale.customer_name,
            invoiceNo: sale.sale_number,
            invoiceDate: format(new Date(sale.sale_date), "dd-MM-yyyy"),
            invoiceValue: sale.net_amount,
            taxableValue: taxableValue,
            gstRate: items[0]?.gst_percent || 0,
            cgst: saleGstAmount / 2,
            sgst: saleGstAmount / 2,
            igst: 0
          });
        } else {
          b2cs.push({
            partyName: sale.customer_name,
            invoiceNo: sale.sale_number,
            invoiceDate: format(new Date(sale.sale_date), "dd-MM-yyyy"),
            invoiceValue: sale.net_amount,
            taxableValue: taxableValue,
            gstRate: items[0]?.gst_percent || 0,
            cgst: saleGstAmount / 2,
            sgst: saleGstAmount / 2
          });
        }
      });

      // Fetch credit notes / sale returns for CDNR
      const { data: saleReturns } = await supabase
        .from("sale_returns")
        .select(`
          id, return_number, return_date, customer_name, net_amount, gst_amount,
          customer_id, customers(gst_number), original_sale_number
        `)
        .eq("organization_id", currentOrganization.id)
        .gte("return_date", fromDate)
        .lte("return_date", toDate);

      const cdnr = (saleReturns || [])
        .filter(ret => (ret.customers as any)?.gst_number)
        .map(ret => ({
          gstin: (ret.customers as any)?.gst_number || "",
          partyName: ret.customer_name,
          noteType: "C",
          noteNo: ret.return_number,
          noteDate: format(new Date(ret.return_date), "dd-MM-yyyy"),
          originalInvoice: ret.original_sale_number || "",
          noteValue: ret.net_amount,
          taxableValue: ret.net_amount - (ret.gst_amount || 0),
          cgst: (ret.gst_amount || 0) / 2,
          sgst: (ret.gst_amount || 0) / 2,
          igst: 0
        }));

      setGstr1Data({
        b2b,
        b2cs,
        cdnr,
        hsn: Array.from(hsnMap.values()),
        summary: {
          totalInvoices: salesData?.length || 0,
          totalTaxableValue,
          totalIGST,
          totalCGST,
          totalSGST,
          totalCess: 0
        }
      });

      toast({ title: "Success", description: "GSTR-1 data generated successfully" });
    } catch (error) {
      console.error("Error generating GSTR-1:", error);
      toast({ title: "Error", description: "Failed to generate GSTR-1", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const generateGSTR3B = async () => {
    if (!currentOrganization?.id) return;

    setIsLoading(true);
    try {
      await fetchBusinessInfo();
      
      const fromDateObj = new Date(fromDate);
      const toDateObj = new Date(toDate);
      toDateObj.setHours(23, 59, 59, 999);

      // Fetch sales
      const { data: salesData } = await supabase
        .from("sales")
        .select("id, net_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", fromDateObj.toISOString())
        .lte("sale_date", toDateObj.toISOString());

      // Fetch sale items to calculate GST
      const saleIds = salesData?.map(s => s.id) || [];
      const { data: saleItems } = saleIds.length > 0 ? await supabase
        .from("sale_items")
        .select("sale_id, gst_percent, line_total")
        .in("sale_id", saleIds) : { data: [] };

      // Calculate GST from sale items
      let outwardTaxable = 0;
      let outwardGST = 0;
      saleItems?.forEach(item => {
        const rate = item.gst_percent || 0;
        const lineTotal = item.line_total || 0;
        const taxableValue = lineTotal / (1 + rate / 100);
        const gstAmount = lineTotal - taxableValue;
        outwardTaxable += taxableValue;
        outwardGST += gstAmount;
      });

      // Fetch purchases
      const { data: purchaseData } = await supabase
        .from("purchase_bills")
        .select("net_amount, gst_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("bill_date", fromDate)
        .lte("bill_date", toDate);

      const inwardTaxable = purchaseData?.reduce((acc, p) => acc + ((p.net_amount || 0) - (p.gst_amount || 0)), 0) || 0;
      const inwardGST = purchaseData?.reduce((acc, p) => acc + (p.gst_amount || 0), 0) || 0;

      const netCGST = (outwardGST / 2) - (inwardGST / 2);
      const netSGST = (outwardGST / 2) - (inwardGST / 2);

      setGstr3bData({
        outwardSupplies: {
          taxable: outwardTaxable,
          igst: 0,
          cgst: outwardGST / 2,
          sgst: outwardGST / 2
        },
        inwardSupplies: {
          taxable: inwardTaxable,
          igst: 0,
          cgst: inwardGST / 2,
          sgst: inwardGST / 2
        },
        itcAvailable: {
          igst: 0,
          cgst: inwardGST / 2,
          sgst: inwardGST / 2
        },
        netTaxPayable: {
          igst: 0,
          cgst: Math.max(0, netCGST),
          sgst: Math.max(0, netSGST)
        }
      });

      toast({ title: "Success", description: "GSTR-3B summary generated" });
    } catch (error) {
      console.error("Error generating GSTR-3B:", error);
      toast({ title: "Error", description: "Failed to generate GSTR-3B", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const generateHSNSummary = async () => {
    if (!currentOrganization?.id) return;

    setIsLoading(true);
    try {
      await fetchBusinessInfo();
      
      const fromDateObj = new Date(fromDate);
      const toDateObj = new Date(toDate);
      toDateObj.setHours(23, 59, 59, 999);

      // Fetch all sale items with HSN
      const { data: salesData } = await supabase
        .from("sales")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", fromDateObj.toISOString())
        .lte("sale_date", toDateObj.toISOString());

      const saleIds = salesData?.map(s => s.id) || [];
      const { data: saleItems } = saleIds.length > 0 ? await supabase
        .from("sale_items")
        .select("hsn_code, product_name, quantity, line_total, gst_percent")
        .in("sale_id", saleIds) : { data: [] };

      const hsnMap = new Map<string, HSNSummary>();

      saleItems?.forEach(item => {
        const hsnCode = item.hsn_code || "00000000";
        const rate = item.gst_percent || 0;
        const lineTotal = item.line_total || 0;
        const taxableValue = lineTotal / (1 + rate / 100);
        const gstAmount = lineTotal - taxableValue;

        const existing = hsnMap.get(hsnCode) || {
          hsnCode,
          description: item.product_name || "",
          uqc: "NOS",
          totalQty: 0,
          totalValue: 0,
          taxableValue: 0,
          igst: 0,
          cgst: 0,
          sgst: 0,
          rate
        };

        existing.totalQty += item.quantity || 1;
        existing.totalValue += lineTotal;
        existing.taxableValue += taxableValue;
        existing.cgst += gstAmount / 2;
        existing.sgst += gstAmount / 2;
        hsnMap.set(hsnCode, existing);
      });

      setHsnData(Array.from(hsnMap.values()).sort((a, b) => b.totalValue - a.totalValue));
      toast({ title: "Success", description: "HSN Summary generated" });
    } catch (error) {
      console.error("Error generating HSN Summary:", error);
      toast({ title: "Error", description: "Failed to generate HSN Summary", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = (data: any[], fileName: string, sheetName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${fileName}_${fromDate}_to_${toDate}.xlsx`);
  };

  const handleGenerateReport = () => {
    switch (activeReport) {
      case "gstr1":
        generateGSTR1();
        break;
      case "gstr3b":
        generateGSTR3B();
        break;
      case "hsn-summary":
        generateHSNSummary();
        break;
      default:
        break;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2
    }).format(amount);
  };

  const reportCards = [
    {
      id: "gstr1",
      title: "GSTR-1",
      description: "Outward Supplies Return",
      icon: ArrowUpRight,
      color: "text-green-600"
    },
    {
      id: "gstr3b",
      title: "GSTR-3B",
      description: "Summary Return",
      icon: BarChart3,
      color: "text-blue-600"
    },
    {
      id: "hsn-summary",
      title: "HSN Summary",
      description: "HSN-wise Sales Summary",
      icon: Package,
      color: "text-purple-600"
    },
    {
      id: "register",
      title: "GST Register",
      description: "Sale & Purchase Register",
      icon: BookOpen,
      color: "text-orange-600"
    }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            GST Reports
          </h1>
          <p className="text-muted-foreground">Generate GST returns and reports for compliance</p>
        </div>
        {businessInfo.gstin && (
          <Badge variant="outline" className="text-sm">
            <Building2 className="h-3 w-3 mr-1" />
            GSTIN: {businessInfo.gstin}
          </Badge>
        )}
      </div>

      {/* Period Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Select Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Quick Period</Label>
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
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
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
            <div>
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
            <div className="flex items-end">
              <Button onClick={handleGenerateReport} disabled={isLoading} className="w-full">
                {isLoading ? "Generating..." : "Generate Report"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Type Selection */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {reportCards.map((report) => (
          <Card
            key={report.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              activeReport === report.id ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setActiveReport(report.id as ReportType)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <report.icon className={`h-8 w-8 ${report.color} mb-2`} />
                  <h3 className="font-semibold">{report.title}</h3>
                  <p className="text-xs text-muted-foreground">{report.description}</p>
                </div>
                {activeReport === report.id && (
                  <ChevronRight className="h-4 w-4 text-primary" />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Report Content */}
      <div className="space-y-4">
        {/* GSTR-1 */}
        {activeReport === "gstr1" && gstr1Data && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>GSTR-1 - Outward Supplies</CardTitle>
                  <CardDescription>Details of outward supplies for {format(new Date(fromDate), "MMM yyyy")}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportToExcel(gstr1Data.b2b, "GSTR1_B2B", "B2B")}>
                    <Download className="h-4 w-4 mr-1" />
                    B2B
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportToExcel(gstr1Data.b2cs, "GSTR1_B2CS", "B2CS")}>
                    <Download className="h-4 w-4 mr-1" />
                    B2CS
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportToExcel(gstr1Data.hsn, "GSTR1_HSN", "HSN")}>
                    <Download className="h-4 w-4 mr-1" />
                    HSN
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Total Invoices</p>
                  <p className="text-xl font-bold">{gstr1Data.summary.totalInvoices}</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Taxable Value</p>
                  <p className="text-xl font-bold">{formatCurrency(gstr1Data.summary.totalTaxableValue)}</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">CGST</p>
                  <p className="text-xl font-bold">{formatCurrency(gstr1Data.summary.totalCGST)}</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">SGST</p>
                  <p className="text-xl font-bold">{formatCurrency(gstr1Data.summary.totalSGST)}</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Total Tax</p>
                  <p className="text-xl font-bold">{formatCurrency(gstr1Data.summary.totalCGST + gstr1Data.summary.totalSGST)}</p>
                </div>
              </div>

              <Tabs defaultValue="b2b">
                <TabsList>
                  <TabsTrigger value="b2b">B2B ({gstr1Data.b2b.length})</TabsTrigger>
                  <TabsTrigger value="b2cs">B2CS ({gstr1Data.b2cs.length})</TabsTrigger>
                  <TabsTrigger value="cdnr">CDNR ({gstr1Data.cdnr.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="b2b">
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>GSTIN</TableHead>
                          <TableHead>Party Name</TableHead>
                          <TableHead>Invoice No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Taxable</TableHead>
                          <TableHead className="text-right">CGST</TableHead>
                          <TableHead className="text-right">SGST</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstr1Data.b2b.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{row.gstin}</TableCell>
                            <TableCell>{row.partyName}</TableCell>
                            <TableCell>{row.invoiceNo}</TableCell>
                            <TableCell>{row.invoiceDate}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.taxableValue)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.cgst)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.sgst)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(row.invoiceValue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="b2cs">
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Party Name</TableHead>
                          <TableHead>Invoice No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Taxable</TableHead>
                          <TableHead className="text-right">CGST</TableHead>
                          <TableHead className="text-right">SGST</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstr1Data.b2cs.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{row.partyName}</TableCell>
                            <TableCell>{row.invoiceNo}</TableCell>
                            <TableCell>{row.invoiceDate}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.taxableValue)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.cgst)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.sgst)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(row.invoiceValue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="cdnr">
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>GSTIN</TableHead>
                          <TableHead>Note No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Original Invoice</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstr1Data.cdnr.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{row.gstin}</TableCell>
                            <TableCell>{row.noteNo}</TableCell>
                            <TableCell>{row.noteDate}</TableCell>
                            <TableCell>{row.originalInvoice}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(row.noteValue)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* GSTR-3B */}
        {activeReport === "gstr3b" && gstr3bData && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>GSTR-3B - Summary Return</CardTitle>
                  <CardDescription>Monthly summary for {format(new Date(fromDate), "MMM yyyy")}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => exportToExcel([gstr3bData], "GSTR3B_Summary", "Summary")}>
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 3.1 - Outward Supplies */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="outline">3.1</Badge>
                  Outward Supplies (other than zero rated, nil rated and exempted)
                </h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">Taxable Value</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">{formatCurrency(gstr3bData.outwardSupplies.taxable)}</p>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">IGST</p>
                    <p className="text-xl font-bold">{formatCurrency(gstr3bData.outwardSupplies.igst)}</p>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">CGST</p>
                    <p className="text-xl font-bold">{formatCurrency(gstr3bData.outwardSupplies.cgst)}</p>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">SGST</p>
                    <p className="text-xl font-bold">{formatCurrency(gstr3bData.outwardSupplies.sgst)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 4 - ITC Available */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="outline">4</Badge>
                  Eligible ITC
                </h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">Inward Taxable</p>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{formatCurrency(gstr3bData.inwardSupplies.taxable)}</p>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">IGST</p>
                    <p className="text-xl font-bold">{formatCurrency(gstr3bData.itcAvailable.igst)}</p>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">CGST</p>
                    <p className="text-xl font-bold">{formatCurrency(gstr3bData.itcAvailable.cgst)}</p>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">SGST</p>
                    <p className="text-xl font-bold">{formatCurrency(gstr3bData.itcAvailable.sgst)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 6 - Net Tax Payable */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="outline">6</Badge>
                  Net Tax Payable
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">IGST Payable</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{formatCurrency(gstr3bData.netTaxPayable.igst)}</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">CGST Payable</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{formatCurrency(gstr3bData.netTaxPayable.cgst)}</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">SGST Payable</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{formatCurrency(gstr3bData.netTaxPayable.sgst)}</p>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-primary/10 rounded-lg">
                  <p className="text-sm text-muted-foreground">Total Tax Liability</p>
                  <p className="text-3xl font-bold text-primary">
                    {formatCurrency(gstr3bData.netTaxPayable.igst + gstr3bData.netTaxPayable.cgst + gstr3bData.netTaxPayable.sgst)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* HSN Summary */}
        {activeReport === "hsn-summary" && hsnData.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>HSN-wise Summary</CardTitle>
                  <CardDescription>Summary of outward supplies by HSN code</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => exportToExcel(hsnData, "HSN_Summary", "HSN")}>
                  <Download className="h-4 w-4 mr-1" />
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HSN Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>UQC</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                      <TableHead className="text-right">Taxable Value</TableHead>
                      <TableHead className="text-right">Rate %</TableHead>
                      <TableHead className="text-right">CGST</TableHead>
                      <TableHead className="text-right">SGST</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hsnData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono">{row.hsnCode}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{row.description}</TableCell>
                        <TableCell>{row.uqc}</TableCell>
                        <TableCell className="text-right">{row.totalQty}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.totalValue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.taxableValue)}</TableCell>
                        <TableCell className="text-right">{row.rate}%</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.cgst)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.sgst)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell className="text-right">{hsnData.reduce((a, b) => a + b.totalQty, 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(hsnData.reduce((a, b) => a + b.totalValue, 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(hsnData.reduce((a, b) => a + b.taxableValue, 0))}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right">{formatCurrency(hsnData.reduce((a, b) => a + b.cgst, 0))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(hsnData.reduce((a, b) => a + b.sgst, 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* GST Register - Link to existing */}
        {activeReport === "register" && (
          <Card>
            <CardContent className="p-8 text-center">
              <BookOpen className="h-16 w-16 mx-auto text-orange-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">GST Sale & Purchase Register</h3>
              <p className="text-muted-foreground mb-4">
                Generate detailed GST register with rate-wise breakup for Sales, POS Sales, Purchase, and Returns
              </p>
              <Button onClick={() => window.location.href = window.location.pathname.replace('/gst-reports', '/gst-register')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Open GST Register
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {((activeReport === "gstr1" && !gstr1Data) ||
          (activeReport === "gstr3b" && !gstr3bData) ||
          (activeReport === "hsn-summary" && hsnData.length === 0)) && (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Data Generated</h3>
              <p className="text-muted-foreground mb-4">
                Select a period and click "Generate Report" to view {activeReport.toUpperCase()} data
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default GSTReports;
