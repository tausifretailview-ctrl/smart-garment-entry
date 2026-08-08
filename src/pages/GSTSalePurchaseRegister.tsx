import { useState, useMemo } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subMonths } from "date-fns";
import { ArrowLeft, FileSpreadsheet, Download, Calendar, Building2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Badge } from "@/components/ui/badge";
import {
  calculateGSTBreakup,
  calculateInvoiceValue,
  isInterState,
  generateGSTRegisterExcel,
  downloadGSTRegisterExcel,
  normalizeGstTaxType,
  SalesRegisterRow,
  SaleReturnRegisterRow,
  PurchaseRegisterRow,
  PurchaseReturnRegisterRow,
} from "@/utils/gstRegisterUtils";
import {
  fetchAllSaleItems,
  fetchSaleReturnItemsByIds,
  fetchPurchaseItemsByBillIds,
  fetchPurchaseReturnItemsByIds,
} from "@/utils/fetchAllRows";
import { InsightsKpiCard } from "@/components/business-insights/insightsLayout";
import { ResetPersistedFiltersButton } from "@/components/ResetPersistedFiltersButton";

type PeriodType = "custom" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-fy" | "last-fy";

const GSTSalePurchaseRegister = () => {
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
  const [isExporting, setIsExporting] = useState(false);
  const [stats, setStats] = useState<{
    salesCount: number;
    posSalesCount: number;
    saleReturnCount: number;
    purchaseCount: number;
    purchaseReturnCount: number;
  } | null>(null);

  const { clearPersistedFilters } = useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.gstRegister,
    currentOrganization?.id,
    useMemo(() => ({ fromDate, toDate, periodType }), [fromDate, toDate, periodType]),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["fromDate", setFromDate],
          ["toDate", setToDate],
          ["periodType", (v) => setPeriodType(v as PeriodType)],
        ],
      });
    },
  );

  const defaultFromDate = format(startOfMonth(today), "yyyy-MM-dd");
  const defaultToDate = format(endOfMonth(today), "yyyy-MM-dd");
  const gstRegisterFiltersDirty =
    periodType !== "this-month" || fromDate !== defaultFromDate || toDate !== defaultToDate;

  const resetGstRegisterFilters = () => {
    const now = new Date();
    setFromDate(format(startOfMonth(now), "yyyy-MM-dd"));
    setToDate(format(endOfMonth(now), "yyyy-MM-dd"));
    setPeriodType("this-month");
    clearPersistedFilters();
  };

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
        .maybeSingle();

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

      /**
       * Scale item line_totals to account for bill-level flat discount.
       *
       * When a flat discount is applied at bill level, line_total on rows may
       * still represent pre-flat-discount values. We scale each item
       * proportionally so GST breakup matches net bill amount.
       */
      const applyFlatDiscountToItems = (
        items: any[],
        saleNetAmount: number,
        _saleGrossAmount: number,
        _saleDiscountAmount: number,
        saleFlatDiscountAmount: number
      ): any[] => {
        if (!items || items.length === 0) return items;

        const itemsGrossTotal = items.reduce((sum, i) => sum + (Number(i.line_total) || 0), 0);
        if (itemsGrossTotal <= 0) return items;

        const flatDisc = Number(saleFlatDiscountAmount) || 0;
        if (flatDisc <= 0.001) return items;

        const scaleFactor = (Number(saleNetAmount) || 0) / itemsGrossTotal;
        if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return items;

        return items.map((item) => ({
          ...item,
          line_total: Math.round((Number(item.line_total || 0) * scaleFactor) * 100) / 100,
        }));
      };

      // ===== Fetch Invoice Sales Data (sale_type = 'invoice') =====
      const { data: salesData } = await supabase
        .from("sales")
        .select(`
          id, sale_number, sale_date, customer_name, net_amount, tax_type,
          gross_amount, discount_amount, flat_discount_amount,
          customer_id, customers(gst_number)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("sale_type", "invoice")
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .gte("sale_date", fromDateObj.toISOString())
        .lte("sale_date", toDateObj.toISOString())
        .order("sale_date", { ascending: true });

      // ===== Fetch POS Sales Data (sale_type = 'pos') =====
      const { data: posSalesData } = await supabase
        .from("sales")
        .select(`
          id, sale_number, sale_date, customer_name, net_amount, tax_type,
          gross_amount, discount_amount, flat_discount_amount,
          customer_id, customers(gst_number)
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("sale_type", "pos")
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .gte("sale_date", fromDateObj.toISOString())
        .lte("sale_date", toDateObj.toISOString())
        .order("sale_date", { ascending: true });

      // Fetch sale items for GST breakup (invoice sales)
      const saleIds = salesData?.map(s => s.id) || [];
      const saleItems = saleIds.length > 0 ? await fetchAllSaleItems(saleIds) : [];

      // Fetch POS sale items for GST breakup
      const posSaleIds = posSalesData?.map(s => s.id) || [];
      const posSaleItems = posSaleIds.length > 0 ? await fetchAllSaleItems(posSaleIds) : [];

      // Group items by sale_id
      const saleItemsMap = new Map<string, typeof saleItems>();
      saleItems?.forEach(item => {
        const existing = saleItemsMap.get(item.sale_id) || [];
        existing.push(item);
        saleItemsMap.set(item.sale_id, existing);
      });

      const posSaleItemsMap = new Map<string, typeof posSaleItems>();
      posSaleItems?.forEach(item => {
        const existing = posSaleItemsMap.get(item.sale_id) || [];
        existing.push(item);
        posSaleItemsMap.set(item.sale_id, existing);
      });

      // FIX G9: Process sales register with IGST columns
      const salesRegister: SalesRegisterRow[] = (salesData || []).map((sale, index) => {
        const rawItems = (saleItemsMap.get(sale.id) || []).filter((i: any) => !i.is_dc_item);
        const items = applyFlatDiscountToItems(
          rawItems,
          Number(sale.net_amount) || 0,
          Number((sale as any).gross_amount) || 0,
          Number((sale as any).discount_amount) || 0,
          Number((sale as any).flat_discount_amount) || 0
        );
        const customerGSTIN = (sale.customers as any)?.gst_number || "";
        const isInterStateTx = isInterState(businessGSTIN, customerGSTIN);
        const taxType = normalizeGstTaxType((sale as any).tax_type);
        const breakup = calculateGSTBreakup(items, taxType, isInterStateTx);
        calculateInvoiceValue(breakup);

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
          invoiceValue: Number(sale.net_amount) || 0,
        };
      });

      // Process POS sales register with IGST columns
      const posSalesRegister: SalesRegisterRow[] = (posSalesData || []).map((sale, index) => {
        const rawItems = (posSaleItemsMap.get(sale.id) || []).filter((i: any) => !i.is_dc_item);
        const items = applyFlatDiscountToItems(
          rawItems,
          Number(sale.net_amount) || 0,
          Number((sale as any).gross_amount) || 0,
          Number((sale as any).discount_amount) || 0,
          Number((sale as any).flat_discount_amount) || 0
        );
        const customerGSTIN = (sale.customers as any)?.gst_number || "";
        const isInterStateTx = isInterState(businessGSTIN, customerGSTIN);
        const taxType = normalizeGstTaxType((sale as any).tax_type);
        const breakup = calculateGSTBreakup(items, taxType, isInterStateTx);
        calculateInvoiceValue(breakup);

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
          invoiceValue: Number(sale.net_amount) || 0,
        };
      });

      // ===== Fetch Sale Returns =====
      const { data: saleReturnsData } = await supabase
        .from("sale_returns")
        .select(`
          id, return_number, return_date, customer_name, net_amount, gst_amount, linked_sale_id,
          customer_id, customers(gst_number)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("return_date", fromDate)
        .lte("return_date", toDate)
        .order("return_date", { ascending: true });

      const linkedSaleIds = [
        ...new Set(
          (saleReturnsData || [])
            .map((r) => (r as { linked_sale_id?: string | null }).linked_sale_id)
            .filter((id): id is string => !!id),
        ),
      ];
      const linkedSaleTaxType = new Map<string, ReturnType<typeof normalizeGstTaxType>>();
      if (linkedSaleIds.length > 0) {
        const { data: linkedSales } = await supabase
          .from("sales")
          .select("id, tax_type")
          .eq("organization_id", currentOrganization.id)
          .in("id", linkedSaleIds);
        (linkedSales || []).forEach((s) => {
          linkedSaleTaxType.set(String(s.id), normalizeGstTaxType((s as { tax_type?: string | null }).tax_type));
        });
      }

      const saleReturnIds = saleReturnsData?.map(sr => sr.id) || [];
      // FIX G8: Use static import
      const saleReturnItems = saleReturnIds.length > 0 
        ? await fetchSaleReturnItemsByIds(saleReturnIds, "return_id, gst_percent, line_total") 
        : [];

      const saleReturnItemsMap = new Map<string, typeof saleReturnItems>();
      saleReturnItems?.forEach((item: any) => {
        const existing = saleReturnItemsMap.get(item.return_id) || [];
        existing.push(item);
        saleReturnItemsMap.set(item.return_id, existing);
      });

      const saleReturnRegister: SaleReturnRegisterRow[] = (saleReturnsData || []).map((ret, index) => {
        const items = saleReturnItemsMap.get(ret.id) || [];
        const customerGSTIN = (ret.customers as any)?.gst_number || "";
        const isInterStateTx = isInterState(businessGSTIN, customerGSTIN);
        const linkedId = (ret as { linked_sale_id?: string | null }).linked_sale_id;
        const retTaxType = (linkedId && linkedSaleTaxType.get(String(linkedId))) || "inclusive";
        const breakup = calculateGSTBreakup(
          items.map(i => ({ gst_percent: i.gst_percent, line_total: i.line_total })),
          retTaxType,
          isInterStateTx,
        );

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

      // ===== Fetch Purchase Bills (exclude DC purchases) =====
      const { data: purchaseData } = await supabase
        .from("purchase_bills")
        .select(`
          id, supplier_invoice_no, bill_date, supplier_name, net_amount, gross_amount, discount_amount, is_dc_purchase,
          supplier_id, suppliers(gst_number)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("bill_date", fromDate)
        .lte("bill_date", toDate)
        .order("bill_date", { ascending: true });

      const purchaseIds = purchaseData?.map(p => p.id) || [];
      // FIX G8: Use static import
      const purchaseItems = purchaseIds.length > 0 
        ? await fetchPurchaseItemsByBillIds(purchaseIds, "bill_id, gst_per, line_total") 
        : [];

      const purchaseItemsMap = new Map<string, typeof purchaseItems>();
      purchaseItems?.forEach((item: any) => {
        const existing = purchaseItemsMap.get(item.bill_id) || [];
        existing.push(item);
        purchaseItemsMap.set(item.bill_id, existing);
      });

      const purchaseRegister: PurchaseRegisterRow[] = (purchaseData || []).map((purchase, index) => {
        const rawItems = purchaseItemsMap.get(purchase.id) || [];
        const items = applyFlatDiscountToItems(
          rawItems.map((i: any) => ({
            ...i,
            line_total: Number(i.line_total) || 0,
            gst_percent: (purchase as any).is_dc_purchase ? 0 : (Number(i.gst_per) || 0),
          })),
          Number(purchase.net_amount) || 0,
          Number((purchase as any).gross_amount) || 0,
          Number((purchase as any).discount_amount) || 0,
          Number((purchase as any).discount_amount) || 0
        );
        const supplierGSTIN = (purchase.suppliers as any)?.gst_number || "";
        const isInterStateTx = isInterState(businessGSTIN, supplierGSTIN);
        const breakup = calculateGSTBreakup(
          items,
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
          invoiceValue: Number(purchase.net_amount) || 0,
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
      // FIX G8: Use static import
      const purchaseReturnItems = purchaseReturnIds.length > 0 
        ? await fetchPurchaseReturnItemsByIds(purchaseReturnIds, "return_id, gst_per, line_total") 
        : [];

      const purchaseReturnItemsMap = new Map<string, typeof purchaseReturnItems>();
      purchaseReturnItems?.forEach((item: any) => {
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
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-3 overflow-auto">
        {/* Toolbar — Insights-style: Back only, no global header chrome */}
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
                GST Sale/Purchase Register
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Export GST-compliant Sale &amp; Purchase Register for filing returns
              </p>
            </div>
          </div>
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="h-9 gap-2 shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Generating…" : "Export to Excel"}
          </Button>
        </div>

        {/* Period filters — full-width row */}
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
                htmlFor="fromDate"
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                From Date
              </Label>
              <Input
                id="fromDate"
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
                htmlFor="toDate"
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                To Date
              </Label>
              <Input
                id="toDate"
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
              <ResetPersistedFiltersButton
                visible={gstRegisterFiltersDirty}
                onReset={resetGstRegisterFilters}
              />
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="leading-snug">
                Excel sheets: Sales · POS · Sale Return · Purchase · Purchase Return
              </span>
            </div>
          </div>
        </div>

        {/* KPI cards — Insights count-up animation */}
        <div className="shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <InsightsKpiCard
            label="Invoice Sales"
            value={stats?.salesCount ?? 0}
            valueFormat="int"
            tone="neutral"
          />
          <InsightsKpiCard
            label="POS Sales"
            value={stats?.posSalesCount ?? 0}
            valueFormat="int"
            tone="positive"
          />
          <InsightsKpiCard
            label="Sale Returns"
            value={stats?.saleReturnCount ?? 0}
            valueFormat="int"
            tone="attention"
          />
          <InsightsKpiCard
            label="Purchases"
            value={stats?.purchaseCount ?? 0}
            valueFormat="int"
            tone="neutral"
          />
          <InsightsKpiCard
            label="Purchase Returns"
            value={stats?.purchaseReturnCount ?? 0}
            valueFormat="int"
            tone="attention"
          />
        </div>

        {!stats && (
          <p className="text-sm text-slate-500 shrink-0">
            Click <strong>Export to Excel</strong> to generate the register and refresh counts for this period.
          </p>
        )}

        {/* Sheets preview row */}
        <div className="shrink-0 flex flex-wrap gap-2">
          {[
            "Sales Register",
            "POS Sales Register",
            "Sale Return Register",
            "Purchase Register",
            "Purchase Return Register",
          ].map((name) => (
            <Badge
              key={name}
              variant="outline"
              className="h-8 px-3 text-xs font-semibold border-slate-200 bg-white text-slate-700"
            >
              {name}
            </Badge>
          ))}
        </div>

        {/* Notes panel */}
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              GST Calculation Notes
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold text-slate-800 mb-1.5">Sales / POS Register</h4>
              <ul className="list-disc list-inside space-y-1 text-slate-500">
                <li>
                  Breakup follows each bill&apos;s <strong>tax type</strong> (Inclusive / Exclusive /
                  Without GST)
                </li>
                <li>CGST/SGST for intra-state, IGST for inter-state</li>
                <li>Slabs: 0%, 5%, 12%, 18%, 28%</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-800 mb-1.5">Purchase Register</h4>
              <ul className="list-disc list-inside space-y-1 text-slate-500">
                <li>
                  GST calculated using <strong>Exclusive</strong> method (GST on taxable)
                </li>
                <li>IGST columns for inter-state purchases</li>
                <li>State code from first 2 digits of GSTIN</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3 border-t border-slate-100 pt-3">
            <strong className="text-slate-700">Note:</strong> For accurate inter-state detection,
            set business GSTIN in Settings and party GSTINs in Customer/Supplier Master.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GSTSalePurchaseRegister;
