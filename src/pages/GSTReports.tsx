import { useState, useMemo } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subMonths } from "date-fns";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Building2,
  FileText,
  BarChart3,
  BookOpen,
  ArrowUpRight,
  Package,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import * as XLSX from "xlsx";
import {
  calculateGSTBreakup,
  isInterState,
} from "@/utils/gstRegisterUtils";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";
import {
  InsightsKpiCard,
  InsightsTableHeader,
  InsightsStaticTh,
  INSIGHTS_BODY_ROW,
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_SUB_TAB_LIST,
  INSIGHTS_SUB_TAB_TRIGGER,
} from "@/components/business-insights/insightsLayout";
import { cn } from "@/lib/utils";

type PeriodType = "custom" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-fy" | "last-fy";
type ReportType = "gstr1" | "gstr2" | "gstr3b" | "hsn-summary" | "register";

interface GSTR1Data {
  b2b: any[];
  b2cs: any[];
  cdnr: any[];
  cdnur: any[];
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
  itcCarryForward?: {
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
  const { orgNavigate } = useOrgNavigation();
  const today = new Date();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    orgNavigate("/reports");
  };

  const [fromDate, setFromDate] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [periodType, setPeriodType] = useState<PeriodType>("this-month");
  const [activeReport, setActiveReport] = useState<ReportType>("gstr1");
  const [isLoading, setIsLoading] = useState(false);
  const [gstr1Data, setGstr1Data] = useState<GSTR1Data | null>(null);
  const [gstr3bData, setGstr3bData] = useState<GSTR3BSummary | null>(null);
  const [hsnData, setHsnData] = useState<HSNSummary[]>([]);
  const [businessInfo, setBusinessInfo] = useState<{ name: string; gstin: string }>({ name: "", gstin: "" });
  const [isDownloadingGstr1Json, setIsDownloadingGstr1Json] = useState(false);

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.gstReports,
    currentOrganization?.id,
    useMemo(() => ({ fromDate, toDate, periodType, activeReport }), [fromDate, toDate, periodType, activeReport]),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["fromDate", setFromDate],
          ["toDate", setToDate],
          ["periodType", (v) => setPeriodType(v as PeriodType)],
          ["activeReport", (v) => setActiveReport(v as ReportType)],
        ],
      });
    },
  );

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
    if (!currentOrganization?.id) return null;
    
    const { data: settings } = await supabase
      .from("settings")
      .select("business_name, gst_number")
      .eq("organization_id", currentOrganization.id)
      .maybeSingle();
    
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
      // FIX G1: Capture businessGSTIN from fetchBusinessInfo
      const settings = await fetchBusinessInfo();
      const businessGSTIN = settings?.gst_number || "";
      
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
        .eq("is_cancelled", false)
        .gt("net_amount", 0)
        .gte("sale_date", fromDateObj.toISOString())
        .lte("sale_date", toDateObj.toISOString())
        .order("sale_date", { ascending: true });

      const saleIds = salesData?.map(s => s.id) || [];
      const saleItems = saleIds.length > 0 ? (await fetchAllSaleItems(saleIds)).filter((i: any) => !i.is_dc_item) : [];

      // Group items by sale
      const saleItemsMap = new Map<string, typeof saleItems>();
      saleItems?.forEach(item => {
        const existing = saleItemsMap.get(item.sale_id) || [];
        existing.push(item);
        saleItemsMap.set(item.sale_id, existing);
      });

      // B2B - Sales to registered dealers
      const b2b: any[] = [];
      // FIX G2: B2CS aggregated by rate (not per-invoice)
      const b2csMap = new Map<string, { rate: number; taxableValue: number; cgst: number; sgst: number; igst: number }>();
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
        // FIX G1: Inter-state detection
        const interState = isInterState(businessGSTIN, customerGSTIN);

        let saleGstAmount = 0;
        items.forEach(item => {
          const rate = item.gst_percent || 0;
          const lineTotal = item.line_total || 0;
          const taxableValue = lineTotal / (1 + rate / 100);
          const gstAmount = lineTotal - taxableValue;

          saleGstAmount += gstAmount;
          totalTaxableValue += taxableValue;

          // FIX G1: Split based on inter-state
          if (interState) {
            totalIGST += gstAmount;
          } else {
            totalCGST += gstAmount / 2;
            totalSGST += gstAmount / 2;
          }

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
          if (interState) {
            existing.igst += gstAmount;
          } else {
            existing.cgst += gstAmount / 2;
            existing.sgst += gstAmount / 2;
          }
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
            cgst: interState ? 0 : saleGstAmount / 2,
            sgst: interState ? 0 : saleGstAmount / 2,
            igst: interState ? saleGstAmount : 0
          });
        } else {
          // FIX G2: Aggregate B2CS by rate
          items.forEach(item => {
            const rate = item.gst_percent || 0;
            const lineTotal = item.line_total || 0;
            const taxable = lineTotal / (1 + rate / 100);
            const gst = lineTotal - taxable;
            const key = `${rate}`;
            const existing = b2csMap.get(key) || { rate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
            existing.taxableValue += taxable;
            if (interState) {
              existing.igst += gst;
            } else {
              existing.cgst += gst / 2;
              existing.sgst += gst / 2;
            }
            b2csMap.set(key, existing);
          });
        }
      });

      // Convert B2CS map to array
      const b2cs = Array.from(b2csMap.values()).map((row, i) => ({
        sno: i + 1,
        supplyType: row.igst > 0 ? "Inter-State" : "Intra-State",
        rate: row.rate,
        taxableValue: Math.round(row.taxableValue * 100) / 100,
        cgst: Math.round(row.cgst * 100) / 100,
        sgst: Math.round(row.sgst * 100) / 100,
        igst: Math.round(row.igst * 100) / 100,
      }));

      // Fetch credit notes / sale returns for CDNR
      const { data: saleReturns } = await supabase
        .from("sale_returns")
        .select(`
          id, return_number, return_date, customer_name, net_amount, gst_amount,
          customer_id, customers(gst_number), original_sale_number
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
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

      // CDNUR - Unregistered (B2C) customer credit/debit notes
      const cdnur = (saleReturns || [])
        .filter(ret => !(ret.customers as any)?.gst_number && (ret.net_amount || 0) > 0)
        .map(ret => ({
          noteType: "C",
          noteNo: ret.return_number,
          noteDate: format(new Date(ret.return_date), "dd-MM-yyyy"),
          partyName: ret.customer_name,
          originalInvoice: ret.original_sale_number || "",
          noteValue: ret.net_amount,
          taxableValue: ret.net_amount - (ret.gst_amount || 0),
          cgst: (ret.gst_amount || 0) / 2,
          sgst: (ret.gst_amount || 0) / 2,
          igst: 0,
        }));

      setGstr1Data({
        b2b,
        b2cs,
        cdnr,
        cdnur,
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
      // FIX G5: Capture businessGSTIN
      const settings = await fetchBusinessInfo();
      const businessGSTIN = settings?.gst_number || "";

      // Use server-side RPC for outward GST aggregation
      const { data: gstSummary, error: rpcError } = await supabase.rpc('get_gst_summary', {
        p_organization_id: currentOrganization.id,
        p_from_date: fromDate,
        p_to_date: toDate,
      });
      if (rpcError) throw rpcError;

      let outwardTaxable = 0;
      let outwardGST = 0;
      (gstSummary || []).forEach((row: any) => {
        outwardTaxable += Number(row.taxable_amount) || 0;
        outwardGST += (Number(row.cgst_amount) || 0) + (Number(row.sgst_amount) || 0);
      });

      // FIX G4: Deduct sale returns from outward supplies
      const { data: saleReturnsData } = await supabase
        .from("sale_returns")
        .select("id, net_amount, gst_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("return_date", fromDate)
        .lte("return_date", toDate)
        .in("refund_type", ["credit_note", "exchange"]);

      const returnTaxable = (saleReturnsData || []).reduce((sum, r) => {
        const gst = r.gst_amount || 0;
        return sum + ((r.net_amount || 0) - gst);
      }, 0);
      const returnGST = (saleReturnsData || []).reduce((sum, r) => sum + (r.gst_amount || 0), 0);

      const netOutwardTaxable = outwardTaxable - returnTaxable;
      const netOutwardGST = outwardGST - returnGST;

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

      // FIX G6+G7: ITC cross-utilization
      // For now, treat all outward as intra-state split (CGST/SGST) since RPC doesn't distinguish
      const liabilityIGST = 0; // RPC doesn't separate inter/intra yet
      const liabilityCGST = netOutwardGST / 2;
      const liabilitySGST = netOutwardGST / 2;

      const itcIGST = 0; // purchases don't have inter-state split from this query
      const itcCGST = inwardGST / 2;
      const itcSGST = inwardGST / 2;

      // Step 1: Apply IGST ITC against IGST liability
      let remainingIGST_ITC = Math.max(0, itcIGST - liabilityIGST);
      const payableIGST = Math.max(0, liabilityIGST - itcIGST);

      // Step 2: Apply remaining IGST ITC against CGST
      const cgstAfterIGST = Math.max(0, liabilityCGST - remainingIGST_ITC);
      remainingIGST_ITC = Math.max(0, remainingIGST_ITC - liabilityCGST);

      // Step 3: Apply CGST ITC
      const payableCGST = Math.max(0, cgstAfterIGST - itcCGST);
      const carryForwardCGST = Math.max(0, itcCGST - cgstAfterIGST);

      // Step 4: Apply remaining IGST ITC against SGST, then SGST ITC
      const sgstAfterIGST = Math.max(0, liabilitySGST - remainingIGST_ITC);
      const payableSGST = Math.max(0, sgstAfterIGST - itcSGST);
      const carryForwardSGST = Math.max(0, itcSGST - sgstAfterIGST);

      setGstr3bData({
        outwardSupplies: {
          taxable: netOutwardTaxable,
          igst: 0,
          cgst: netOutwardGST / 2,
          sgst: netOutwardGST / 2
        },
        inwardSupplies: {
          taxable: inwardTaxable,
          igst: 0,
          cgst: inwardGST / 2,
          sgst: inwardGST / 2
        },
        itcAvailable: {
          igst: itcIGST,
          cgst: itcCGST,
          sgst: itcSGST
        },
        netTaxPayable: {
          igst: payableIGST,
          cgst: payableCGST,
          sgst: payableSGST
        },
        itcCarryForward: {
          igst: 0,
          cgst: carryForwardCGST,
          sgst: carryForwardSGST
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

      const { data: salesData } = await supabase
        .from("sales")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", fromDateObj.toISOString())
        .lte("sale_date", toDateObj.toISOString());

      const saleIds = salesData?.map(s => s.id) || [];
      const saleItems = saleIds.length > 0 ? (await fetchAllSaleItems(saleIds)).filter((i: any) => !i.is_dc_item) : [];

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

  const downloadGstr1Json = async () => {
    if (!currentOrganization?.id) return;
    setIsDownloadingGstr1Json(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-gstr1", {
        body: {
          organization_id: currentOrganization.id,
          from_date: fromDate,
          to_date: toDate,
        },
      });
      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GSTR1_${fromDate}_${toDate}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "GSTR-1 JSON file downloaded" });
    } catch (err: any) {
      console.error("GSTR-1 JSON download error:", err);
      toast({ title: "Error", description: "Failed to download GSTR-1 JSON", variant: "destructive" });
    } finally {
      setIsDownloadingGstr1Json(false);
    }
  };

  const exportToExcel = (data: any[], fileName: string, sheetName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${fileName}_${fromDate}_to_${toDate}.xlsx`);
  };

  /** Flatten nested GSTR-3B summary into rows json_to_sheet can serialize. */
  const flattenGstr3bForExcel = (data: GSTR3BSummary) => {
    const rows: { Section: string; Label: string; Amount: number }[] = [
      { Section: "3.1 Outward Supplies", Label: "Taxable Value", Amount: data.outwardSupplies.taxable },
      { Section: "3.1 Outward Supplies", Label: "IGST", Amount: data.outwardSupplies.igst },
      { Section: "3.1 Outward Supplies", Label: "CGST", Amount: data.outwardSupplies.cgst },
      { Section: "3.1 Outward Supplies", Label: "SGST", Amount: data.outwardSupplies.sgst },
      { Section: "3.1 Outward Supplies", Label: "Total Tax", Amount: data.outwardSupplies.igst + data.outwardSupplies.cgst + data.outwardSupplies.sgst },
      { Section: "4 Inward Supplies / ITC", Label: "Taxable Value", Amount: data.inwardSupplies.taxable },
      { Section: "4 Inward Supplies / ITC", Label: "ITC IGST", Amount: data.itcAvailable.igst },
      { Section: "4 Inward Supplies / ITC", Label: "ITC CGST", Amount: data.itcAvailable.cgst },
      { Section: "4 Inward Supplies / ITC", Label: "ITC SGST", Amount: data.itcAvailable.sgst },
      { Section: "6.1 Net Tax Payable", Label: "IGST", Amount: data.netTaxPayable.igst },
      { Section: "6.1 Net Tax Payable", Label: "CGST", Amount: data.netTaxPayable.cgst },
      { Section: "6.1 Net Tax Payable", Label: "SGST", Amount: data.netTaxPayable.sgst },
      {
        Section: "6.1 Net Tax Payable",
        Label: "Total Tax Liability",
        Amount: data.netTaxPayable.igst + data.netTaxPayable.cgst + data.netTaxPayable.sgst,
      },
    ];
    if (data.itcCarryForward) {
      rows.push(
        { Section: "ITC Carry Forward", Label: "IGST", Amount: data.itcCarryForward.igst },
        { Section: "ITC Carry Forward", Label: "CGST", Amount: data.itcCarryForward.cgst },
        { Section: "ITC Carry Forward", Label: "SGST", Amount: data.itcCarryForward.sgst },
      );
    }
    return rows;
  };

  const exportGstr3bToExcel = () => {
    if (!gstr3bData) return;
    exportToExcel(flattenGstr3bForExcel(gstr3bData), "GSTR3B_Summary", "Summary");
  };

  // UI-3: Combined GSTR-1 Excel export
  const exportGSTR1ToExcel = () => {
    if (!gstr1Data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gstr1Data.b2b), "B2B");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gstr1Data.b2cs), "B2CS");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gstr1Data.cdnr), "CDNR");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gstr1Data.cdnur), "CDNUR");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gstr1Data.hsn), "HSN");
    XLSX.writeFile(wb, `GSTR1_${format(new Date(fromDate), "MMM-yyyy")}.xlsx`);
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

  const reportTabs: { id: ReportType; title: string; icon: typeof ArrowUpRight }[] = [
    { id: "gstr1", title: "GSTR-1", icon: ArrowUpRight },
    { id: "gstr3b", title: "GSTR-3B", icon: BarChart3 },
    { id: "hsn-summary", title: "HSN Summary", icon: Package },
    { id: "register", title: "GST Register", icon: BookOpen },
  ];

  const reportTabTriggerClass =
    "rounded-none border-b-2 border-transparent px-3 py-2 text-xs sm:text-sm font-semibold shrink-0 data-[state=active]:border-teal-600 data-[state=active]:bg-white data-[state=active]:text-teal-700 flex items-center gap-1.5";

  const showEmptyState =
    (activeReport === "gstr1" && !gstr1Data) ||
    (activeReport === "gstr3b" && !gstr3bData) ||
    (activeReport === "hsn-summary" && hsnData.length === 0);

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-3 overflow-auto">
        {/* Toolbar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 shrink-0" />
                GST Reports
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Generate GST returns and reports for compliance
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {businessInfo.gstin && (
              <Badge variant="outline" className="h-8 px-3 text-xs font-semibold border-slate-200 bg-white text-slate-700">
                <Building2 className="h-3 w-3 mr-1" />
                GSTIN: {businessInfo.gstin}
              </Badge>
            )}
            {activeReport !== "register" && (
              <Button
                onClick={handleGenerateReport}
                disabled={isLoading}
                className="h-9 gap-2 shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <FileText className="h-4 w-4" />
                {isLoading ? "Generating…" : "Generate Report"}
              </Button>
            )}
          </div>
        </div>

        {!businessInfo.gstin && gstr1Data && (
          <Alert variant="destructive" className="shrink-0">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>GSTIN Not Configured</AlertTitle>
            <AlertDescription>
              Inter-state detection requires your business GSTIN in Settings → Business Info.
              Without it, all transactions are treated as intra-state (CGST+SGST).
            </AlertDescription>
          </Alert>
        )}

        {/* Period filters */}
        <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-teal-700" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Select Period
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Quick Select
              </Label>
              <Select value={periodType} onValueChange={(v) => handlePeriodChange(v as PeriodType)}>
                <SelectTrigger className="h-9 text-sm border-slate-200 bg-white">
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
            <div className="space-y-1">
              <Label
                htmlFor="gst-reports-from"
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                From Date
              </Label>
              <Input
                id="gst-reports-from"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPeriodType("custom");
                }}
                className="h-9 text-sm border-slate-200 bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="gst-reports-to"
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                To Date
              </Label>
              <Input
                id="gst-reports-to"
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPeriodType("custom");
                }}
                className="h-9 text-sm border-slate-200 bg-white"
              />
            </div>
            <div className="flex items-center gap-2 min-h-9 text-xs text-slate-500">
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-teal-700" />
              <span className="leading-snug">
                GSTR-1 · GSTR-3B · HSN Summary · GST Register
              </span>
            </div>
          </div>
        </div>

        {/* Report type tabs */}
        <div className="shrink-0 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="w-full h-auto p-0 bg-slate-50/80 flex flex-nowrap justify-start overflow-x-auto gap-0">
            {reportTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeReport === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveReport(tab.id)}
                  className={cn(
                    reportTabTriggerClass,
                    "text-slate-700 hover:bg-white hover:text-teal-700 hover:border-teal-400",
                    active && "border-teal-600 bg-white text-teal-700",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{tab.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* GSTR-1 */}
        {activeReport === "gstr1" && gstr1Data && (
          <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-teal-700">GSTR-1 — Outward Supplies</h2>
                <p className="text-sm text-muted-foreground">
                  Details of outward supplies for {format(new Date(fromDate), "MMM yyyy")}
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={downloadGstr1Json}
                  disabled={isDownloadingGstr1Json}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  {isDownloadingGstr1Json ? "Generating…" : "GSTR-1 JSON"}
                </Button>
                <Button variant="outline" size="sm" className="h-8 border-slate-200" onClick={exportGSTR1ToExcel}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  All Excel
                </Button>
                <Button variant="outline" size="sm" className="h-8 border-slate-200" onClick={() => exportToExcel(gstr1Data.b2b, "GSTR1_B2B", "B2B")}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  B2B
                </Button>
                <Button variant="outline" size="sm" className="h-8 border-slate-200" onClick={() => exportToExcel(gstr1Data.b2cs, "GSTR1_B2CS", "B2CS")}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  B2CS
                </Button>
                <Button variant="outline" size="sm" className="h-8 border-slate-200" onClick={() => exportToExcel(gstr1Data.hsn, "GSTR1_HSN", "HSN")}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  HSN
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <InsightsKpiCard label="B2B Invoices" value={gstr1Data.b2b.length} valueFormat="int" tone="neutral" />
              <InsightsKpiCard label="B2CS Rates" value={gstr1Data.b2cs.length} valueFormat="int" tone="positive" />
              <InsightsKpiCard label="Credit Notes" value={gstr1Data.cdnr.length} valueFormat="int" tone="attention" />
              <InsightsKpiCard label="Taxable Value" value={gstr1Data.summary.totalTaxableValue} valueFormat="inr" tone="neutral" />
              <InsightsKpiCard
                label="Total Tax"
                value={gstr1Data.summary.totalCGST + gstr1Data.summary.totalSGST + gstr1Data.summary.totalIGST}
                valueFormat="inr"
                tone="critical"
              />
            </div>

            <Tabs defaultValue="b2b" className="space-y-2">
              <TabsList className={INSIGHTS_SUB_TAB_LIST}>
                <TabsTrigger value="b2b" className={INSIGHTS_SUB_TAB_TRIGGER}>B2B ({gstr1Data.b2b.length})</TabsTrigger>
                <TabsTrigger value="b2cs" className={INSIGHTS_SUB_TAB_TRIGGER}>B2CS ({gstr1Data.b2cs.length})</TabsTrigger>
                <TabsTrigger value="cdnr" className={INSIGHTS_SUB_TAB_TRIGGER}>CDNR ({gstr1Data.cdnr.length})</TabsTrigger>
                <TabsTrigger value="cdnur" className={INSIGHTS_SUB_TAB_TRIGGER}>CDNUR ({gstr1Data.cdnur.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="b2b" className="mt-0">
                <ScrollArea className="h-[300px] rounded-md border border-slate-200">
                  <Table>
                    <InsightsTableHeader>
                      <InsightsStaticTh label="GSTIN" />
                      <InsightsStaticTh label="Party Name" />
                      <InsightsStaticTh label="Invoice No" />
                      <InsightsStaticTh label="Date" />
                      <InsightsStaticTh label="Taxable" className="text-right" />
                      <InsightsStaticTh label="CGST" className="text-right" />
                      <InsightsStaticTh label="SGST" className="text-right" />
                      <InsightsStaticTh label="IGST" className="text-right" />
                      <InsightsStaticTh label="Total" className="text-right" />
                    </InsightsTableHeader>
                    <TableBody>
                      {gstr1Data.b2b.map((row, idx) => (
                        <TableRow key={idx} className={INSIGHTS_BODY_ROW}>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "font-mono text-xs")}>{row.gstin}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}>{row.partyName}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}>{row.invoiceNo}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}>{row.invoiceDate}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.taxableValue)}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.cgst)}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.sgst)}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.igst)}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "font-medium")}>{formatCurrency(row.invoiceValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="b2cs" className="mt-0">
                <ScrollArea className="h-[300px] rounded-md border border-slate-200">
                  <Table>
                    <InsightsTableHeader>
                      <InsightsStaticTh label="S.No" />
                      <InsightsStaticTh label="Supply Type" />
                      <InsightsStaticTh label="Rate %" className="text-right" />
                      <InsightsStaticTh label="Taxable Value" className="text-right" />
                      <InsightsStaticTh label="CGST" className="text-right" />
                      <InsightsStaticTh label="SGST" className="text-right" />
                      <InsightsStaticTh label="IGST" className="text-right" />
                    </InsightsTableHeader>
                    <TableBody>
                      {gstr1Data.b2cs.map((row, idx) => (
                        <TableRow key={idx} className={INSIGHTS_BODY_ROW}>
                          <TableCell className={INSIGHTS_BODY_CELL}>{row.sno}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}>{row.supplyType}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{row.rate}%</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.taxableValue)}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.cgst)}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.sgst)}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.igst)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="cdnr" className="mt-0">
                <ScrollArea className="h-[300px] rounded-md border border-slate-200">
                  <Table>
                    <InsightsTableHeader>
                      <InsightsStaticTh label="GSTIN" />
                      <InsightsStaticTh label="Note No" />
                      <InsightsStaticTh label="Date" />
                      <InsightsStaticTh label="Original Invoice" />
                      <InsightsStaticTh label="Value" className="text-right" />
                    </InsightsTableHeader>
                    <TableBody>
                      {gstr1Data.cdnr.map((row, idx) => (
                        <TableRow key={idx} className={INSIGHTS_BODY_ROW}>
                          <TableCell className={cn(INSIGHTS_BODY_CELL, "font-mono text-xs")}>{row.gstin}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}>{row.noteNo}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}>{row.noteDate}</TableCell>
                          <TableCell className={INSIGHTS_BODY_CELL}>{row.originalInvoice}</TableCell>
                          <TableCell className={cn(INSIGHTS_BODY_CELL_NUM, "font-medium")}>{formatCurrency(row.noteValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="cdnur" className="mt-0">
                <div className="rounded-md border border-slate-200 px-4 py-8 text-center text-sm text-muted-foreground">
                  CDNUR rows ({gstr1Data.cdnur.length}) — export via All Excel / JSON
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* GSTR-3B */}
        {activeReport === "gstr3b" && gstr3bData && (
          <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-teal-700">GSTR-3B — Summary Return</h2>
                <p className="text-sm text-muted-foreground">
                  Monthly summary for {format(new Date(fromDate), "MMM yyyy")}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 border-slate-200" onClick={exportGstr3bToExcel}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Export Excel
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-slate-200">3.1</Badge>
                Outward Supplies (net of returns)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <InsightsKpiCard label="Taxable Value" value={gstr3bData.outwardSupplies.taxable} valueFormat="inr" tone="positive" />
                <InsightsKpiCard label="IGST" value={gstr3bData.outwardSupplies.igst} valueFormat="inr" tone="neutral" />
                <InsightsKpiCard label="CGST" value={gstr3bData.outwardSupplies.cgst} valueFormat="inr" tone="neutral" />
                <InsightsKpiCard label="SGST" value={gstr3bData.outwardSupplies.sgst} valueFormat="inr" tone="neutral" />
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-slate-200">4</Badge>
                Eligible ITC
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <InsightsKpiCard label="Inward Taxable" value={gstr3bData.inwardSupplies.taxable} valueFormat="inr" tone="neutral" />
                <InsightsKpiCard label="ITC IGST" value={gstr3bData.itcAvailable.igst} valueFormat="inr" tone="neutral" />
                <InsightsKpiCard label="ITC CGST" value={gstr3bData.itcAvailable.cgst} valueFormat="inr" tone="neutral" />
                <InsightsKpiCard label="ITC SGST" value={gstr3bData.itcAvailable.sgst} valueFormat="inr" tone="neutral" />
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-slate-200">6</Badge>
                Net Tax Payable
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <InsightsKpiCard label="IGST Payable" value={gstr3bData.netTaxPayable.igst} valueFormat="inr" tone="attention" />
                <InsightsKpiCard label="CGST Payable" value={gstr3bData.netTaxPayable.cgst} valueFormat="inr" tone="attention" />
                <InsightsKpiCard label="SGST Payable" value={gstr3bData.netTaxPayable.sgst} valueFormat="inr" tone="attention" />
                <InsightsKpiCard
                  label="Total Tax Liability"
                  value={gstr3bData.netTaxPayable.igst + gstr3bData.netTaxPayable.cgst + gstr3bData.netTaxPayable.sgst}
                  valueFormat="inr"
                  tone="critical"
                />
              </div>
            </div>

            {gstr3bData.itcCarryForward &&
              (gstr3bData.itcCarryForward.cgst > 0 ||
                gstr3bData.itcCarryForward.sgst > 0 ||
                gstr3bData.itcCarryForward.igst > 0) && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    ITC Carry-Forward (Excess Credit)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <InsightsKpiCard label="IGST" value={gstr3bData.itcCarryForward.igst} valueFormat="inr" tone="positive" />
                    <InsightsKpiCard label="CGST" value={gstr3bData.itcCarryForward.cgst} valueFormat="inr" tone="positive" />
                    <InsightsKpiCard label="SGST" value={gstr3bData.itcCarryForward.sgst} valueFormat="inr" tone="positive" />
                  </div>
                </div>
              )}
          </div>
        )}

        {/* HSN Summary */}
        {activeReport === "hsn-summary" && hsnData.length > 0 && (
          <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-teal-700">HSN-wise Summary</h2>
                <p className="text-sm text-muted-foreground">Summary of outward supplies by HSN code</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200"
                onClick={() => exportToExcel(hsnData, "HSN_Summary", "HSN")}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Export Excel
              </Button>
            </div>
            <ScrollArea className="h-[400px] rounded-md border border-slate-200">
              <Table>
                <InsightsTableHeader>
                  <InsightsStaticTh label="HSN Code" />
                  <InsightsStaticTh label="Description" />
                  <InsightsStaticTh label="UQC" />
                  <InsightsStaticTh label="Qty" className="text-right" />
                  <InsightsStaticTh label="Total Value" className="text-right" />
                  <InsightsStaticTh label="Taxable Value" className="text-right" />
                  <InsightsStaticTh label="Rate %" className="text-right" />
                  <InsightsStaticTh label="CGST" className="text-right" />
                  <InsightsStaticTh label="SGST" className="text-right" />
                </InsightsTableHeader>
                <TableBody>
                  {hsnData.map((row, idx) => (
                    <TableRow key={idx} className={INSIGHTS_BODY_ROW}>
                      <TableCell className={cn(INSIGHTS_BODY_CELL, "font-mono")}>{row.hsnCode}</TableCell>
                      <TableCell className={cn(INSIGHTS_BODY_CELL, "max-w-[200px] truncate")}>{row.description}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL}>{row.uqc}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL_NUM}>{row.totalQty}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.totalValue)}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.taxableValue)}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL_NUM}>{row.rate}%</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.cgst)}</TableCell>
                      <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(row.sgst)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className={cn(INSIGHTS_BODY_ROW, "font-bold bg-slate-100/80")}>
                    <TableCell className={INSIGHTS_BODY_CELL} colSpan={3}>Total</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{hsnData.reduce((a, b) => a + b.totalQty, 0)}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(hsnData.reduce((a, b) => a + b.totalValue, 0))}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(hsnData.reduce((a, b) => a + b.taxableValue, 0))}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL} />
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(hsnData.reduce((a, b) => a + b.cgst, 0))}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{formatCurrency(hsnData.reduce((a, b) => a + b.sgst, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {/* GST Register link */}
        {activeReport === "register" && (
          <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-10 shadow-sm text-center">
            <BookOpen className="h-12 w-12 mx-auto text-teal-700 mb-3" />
            <h3 className="text-base font-bold text-teal-700 mb-1">GST Sale &amp; Purchase Register</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Generate detailed GST register with rate-wise breakup for Sales, POS Sales, Purchase, and Returns
            </p>
            <Button
              className="h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => orgNavigate("/gst-register")}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Open GST Register
            </Button>
          </div>
        )}

        {/* Empty state */}
        {showEmptyState && (
          <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-12 shadow-sm text-center">
            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-700 mb-1">No Data Generated</h3>
            <p className="text-sm text-muted-foreground">
              Select a period and click Generate Report to view {activeReport.toUpperCase()} data
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GSTReports;
