import { useState, useEffect } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, Download, Printer, TrendingUp,
  Users, Package, Search, Calendar, ArrowLeft, Building2, Clock
} from "lucide-react";
import { format, startOfYear, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { getIndiaFinancialYear, getCurrentQuarter } from "@/utils/accountingReportUtils";
import { useNavigate, useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { fetchAllSaleItems, fetchAllPurchaseItems } from "@/utils/fetchAllRows";

interface SupplierProfitData {
  supplierId: string | null;
  supplierName: string;
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  totalCOGS: number;
  grossProfit: number;
  marginPercent: number;
  itemsSold: number;
  zeroCostQty: number;
}

interface ProductProfitData {
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  totalCOGS: number;
  grossProfit: number;
  marginPercent: number;
  quantitySold: number;
  zeroCostQty: number;
}

/** Per sale_item: gross before discounts, bill-level share, net value for margin (excludes round-off share). */
function computeSaleLineRevenue(
  item: {
    quantity: number;
    line_total: number;
    unit_price: number;
    mrp: number;
    discount_percent: number;
    discount_share?: number | null;
    sale_id: string;
  },
  saleMeta: { gross_amount: number; flat_discount_amount: number } | undefined
): { grossLine: number; flatShare: number; netLine: number; lineDiscount: number } {
  const qty = Number(item.quantity) || 0;
  const lineTotal = Number(item.line_total) || 0;
  const unitP = Number(item.unit_price) || 0;
  const mrp = Number(item.mrp) || 0;
  const dPct = Number(item.discount_percent) || 0;

  let lineGross = qty * (mrp > 0 ? mrp : unitP);
  if (mrp <= 0 && dPct > 0 && dPct < 100) {
    const reconstructed = lineTotal / (1 - dPct / 100);
    if (reconstructed > lineGross && Number.isFinite(reconstructed)) {
      lineGross = Math.round(reconstructed * 100) / 100;
    }
  }

  const lineDiscount = Math.max(0, lineGross - lineTotal);

  let flatShare: number;
  if (item.discount_share != null && Number.isFinite(Number(item.discount_share))) {
    flatShare = Number(item.discount_share);
  } else {
    const g = saleMeta?.gross_amount ?? 0;
    const flat = saleMeta?.flat_discount_amount ?? 0;
    flatShare = g > 0 && flat > 0 ? (lineTotal / g) * flat : 0;
  }

  const netLine = lineTotal - flatShare;
  return { grossLine: lineGross, flatShare, netLine, lineDiscount };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
};

// Financial Year Presets
const FYPresets = ({ 
  onSelect, 
  currentSelection 
}: { 
  onSelect: (from: string, to: string, key: string) => void; 
  currentSelection?: string;
}) => {
  const currentFY = getIndiaFinancialYear(0);
  const previousFY = getIndiaFinancialYear(-1);
  const currentQ = getCurrentQuarter();
  const now = new Date();
  
  const todayStart = format(now, "yyyy-MM-dd");
  const todayEnd = format(now, "yyyy-MM-dd");
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
  
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={currentSelection === "today" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(todayStart, todayEnd, "today")}
      >
        Today
      </Button>
      <Button
        variant={currentSelection === "week" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(weekStart, weekEnd, "week")}
      >
        This Week
      </Button>
      <Button
        variant={currentSelection === "month" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(monthStart, monthEnd, "month")}
      >
        This Month
      </Button>
      <Button
        variant={currentSelection === "currentQ" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(currentQ.fromDate, currentQ.toDate, "currentQ")}
      >
        {currentQ.label}
      </Button>
      <Button
        variant={currentSelection === "currentFY" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(currentFY.fromDate, currentFY.toDate, "currentFY")}
      >
        <Calendar className="h-3 w-3 mr-1" />
        {currentFY.label}
      </Button>
      <Button
        variant={currentSelection === "previousFY" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(previousFY.fromDate, previousFY.toDate, "previousFY")}
      >
        {previousFY.label}
      </Button>
    </div>
  );
};

export default function NetProfitAnalysis() {
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const location = useLocation();
  const { orgNavigate } = useOrgNavigation();
  
  // Parse URL query parameters for date range
  const searchParams = new URLSearchParams(location.search);
  const urlFromDate = searchParams.get('from');
  const urlToDate = searchParams.get('to');
  
  const currentFY = getIndiaFinancialYear(0);
  const [fromDate, setFromDate] = useState(urlFromDate || currentFY.fromDate);
  const [toDate, setToDate] = useState(urlToDate || format(new Date(), "yyyy-MM-dd"));
  const [fyPreset, setFyPreset] = useState<string>(urlFromDate ? "" : "");
  
  const [activeTab, setActiveTab] = useState("supplier-wise");
  const [loading, setLoading] = useState(false);
  const [supplierData, setSupplierData] = useState<SupplierProfitData[]>([]);
  const [productData, setProductData] = useState<ProductProfitData[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);

  const fetchSupplierWiseProfit = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      const { data: sales } = await supabase
        .from("sales")
        .select("id, gross_amount, flat_discount_amount")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", fromDate)
        .lte("sale_date", `${toDate}T23:59:59`)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .or("payment_status.is.null,payment_status.neq.cancelled")
        .or("sale_type.is.null,sale_type.neq.sale_return");

      if (!sales || sales.length === 0) {
        setSupplierData([]);
        setLoading(false);
        return;
      }

      const saleIds = sales.map(s => s.id);
      const saleMetaById = new Map(
        sales.map((s) => [
          s.id,
          {
            gross_amount: Number(s.gross_amount) || 0,
            flat_discount_amount: Number(s.flat_discount_amount) || 0,
          },
        ])
      );

      // Use paginated fetch to get ALL sale items (bypasses 1000 row limit)
      const saleItems = await fetchAllSaleItems(saleIds);

      if (!saleItems || saleItems.length === 0) {
        setSupplierData([]);
        setLoading(false);
        return;
      }

      const variantIds = [...new Set(saleItems.map(si => si.variant_id))];

      // Batch fetch variants to handle more than 1000 IDs
      const allVariants: { id: string; pur_price: number | null; product_id: string }[] = [];
      const variantBatchSize = 500;
      for (let i = 0; i < variantIds.length; i += variantBatchSize) {
        const batchIds = variantIds.slice(i, i + variantBatchSize);
        const { data: batchVariants } = await supabase
          .from("product_variants")
          .select("id, pur_price, product_id")
          .in("id", batchIds);
        if (batchVariants) allVariants.push(...batchVariants);
      }

      const variantMap = new Map(allVariants.map(v => [v.id, v]));

      // Use paginated fetch for purchase items
      const purchaseItems = await fetchAllPurchaseItems(variantIds);

      // Build weighted average purchase price map from actual purchase_items
      const purPriceAccum: Record<string, { total: number; qty: number }> = {};
      purchaseItems?.forEach((pi: any) => {
        if (!pi.sku_id) return;
        if (!purPriceAccum[pi.sku_id]) purPriceAccum[pi.sku_id] = { total: 0, qty: 0 };
        purPriceAccum[pi.sku_id].total += (pi.pur_price || 0) * (pi.qty || 1);
        purPriceAccum[pi.sku_id].qty += (pi.qty || 1);
      });
      const variantPurchasePriceMap = new Map<string, number>();
      Object.entries(purPriceAccum).forEach(([skuId, acc]) => {
        variantPurchasePriceMap.set(skuId, acc.qty > 0 ? acc.total / acc.qty : 0);
      });

      const billIds = [...new Set(purchaseItems?.map(pi => pi.bill_id) || [])];

      const { data: purchaseBills } = await supabase
        .from("purchase_bills")
        .select("id, supplier_id, supplier_name")
        .in("id", billIds);

      const variantToSupplier = new Map<string, { id: string | null; name: string }>();
      purchaseItems?.forEach(pi => {
        if (!variantToSupplier.has(pi.sku_id)) {
          const bill = purchaseBills?.find(pb => pb.id === pi.bill_id);
          if (bill) {
            variantToSupplier.set(pi.sku_id, { id: bill.supplier_id, name: bill.supplier_name });
          }
        }
      });

      const supplierProfitMap = new Map<string, SupplierProfitData>();

      saleItems.forEach((item: any) => {
        const variant = variantMap.get(item.variant_id);
        const supplierInfo = variantToSupplier.get(item.variant_id) || { id: null, name: "Unknown Supplier" };
        const supplierKey = supplierInfo.id || supplierInfo.name;

        const qty = item.quantity || 0;
        const lineTotal = Number(item.line_total) || 0;
        if (qty === 0 && lineTotal === 0) return;
        if (lineTotal < 0) return;

        const meta = saleMetaById.get(item.sale_id);
        const { grossLine, flatShare, netLine, lineDiscount } = computeSaleLineRevenue(item, meta);

        const purPrice = variantPurchasePriceMap.get(item.variant_id) || variant?.pur_price || 0;
        const cogs = qty * purPrice;

        if (!supplierProfitMap.has(supplierKey)) {
          supplierProfitMap.set(supplierKey, {
            supplierId: supplierInfo.id,
            supplierName: supplierInfo.name,
            grossSales: 0,
            totalDiscounts: 0,
            netSales: 0,
            totalCOGS: 0,
            grossProfit: 0,
            marginPercent: 0,
            itemsSold: 0,
            zeroCostQty: 0,
          });
        }

        const data = supplierProfitMap.get(supplierKey)!;
        data.grossSales += grossLine;
        data.totalDiscounts += lineDiscount + flatShare;
        data.netSales += netLine;
        data.totalCOGS += cogs;
        data.itemsSold += qty;
        if (purPrice === 0 && qty > 0) data.zeroCostQty += qty;
      });

      const result: SupplierProfitData[] = [];
      supplierProfitMap.forEach(data => {
        data.grossProfit = Math.max(0, data.netSales - data.totalCOGS);
        data.marginPercent = data.netSales > 0 ? (data.grossProfit / data.netSales) * 100 : 0;
        result.push(data);
      });

      result.sort((a, b) => b.grossProfit - a.grossProfit);
      setSupplierData(result);
    } catch (error) {
      console.error("Error fetching supplier-wise profit:", error);
      toast.error("Failed to load supplier-wise data");
    }
    setLoading(false);
  };

  const fetchProductWiseProfit = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      const { data: sales } = await supabase
        .from("sales")
        .select("id, gross_amount, flat_discount_amount")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", fromDate)
        .lte("sale_date", `${toDate}T23:59:59`)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .or("payment_status.is.null,payment_status.neq.cancelled")
        .or("sale_type.is.null,sale_type.neq.sale_return");

      if (!sales || sales.length === 0) {
        setProductData([]);
        setLoading(false);
        return;
      }

      const saleIds = sales.map(s => s.id);
      const saleMetaById = new Map(
        sales.map((s) => [
          s.id,
          {
            gross_amount: Number(s.gross_amount) || 0,
            flat_discount_amount: Number(s.flat_discount_amount) || 0,
          },
        ])
      );

      // Use paginated fetch to get ALL sale items (bypasses 1000 row limit)
      const saleItems = await fetchAllSaleItems(saleIds);

      if (!saleItems || saleItems.length === 0) {
        setProductData([]);
        setLoading(false);
        return;
      }

      const variantIds = [...new Set(saleItems.map(si => si.variant_id))];

      // Batch fetch variants to handle more than 1000 IDs
      const allVariants: { id: string; pur_price: number | null; product_id: string }[] = [];
      const variantBatchSize = 500;
      for (let i = 0; i < variantIds.length; i += variantBatchSize) {
        const batchIds = variantIds.slice(i, i + variantBatchSize);
        const { data: batchVariants } = await supabase
          .from("product_variants")
          .select("id, pur_price, product_id")
          .in("id", batchIds);
        if (batchVariants) allVariants.push(...batchVariants);
      }

      const variantMap = new Map(allVariants.map(v => [v.id, v]));

      // Build weighted average purchase price map from actual purchase_items
      const purchaseItems = await fetchAllPurchaseItems(variantIds);
      const purPriceAccum: Record<string, { total: number; qty: number }> = {};
      purchaseItems?.forEach((pi: any) => {
        if (!pi.sku_id) return;
        if (!purPriceAccum[pi.sku_id]) purPriceAccum[pi.sku_id] = { total: 0, qty: 0 };
        purPriceAccum[pi.sku_id].total += (pi.pur_price || 0) * (pi.qty || 1);
        purPriceAccum[pi.sku_id].qty += (pi.qty || 1);
      });
      const variantPurchasePriceMap = new Map<string, number>();
      Object.entries(purPriceAccum).forEach(([skuId, acc]) => {
        variantPurchasePriceMap.set(skuId, acc.qty > 0 ? acc.total / acc.qty : 0);
      });

      const productIds = [...new Set(saleItems.map(si => si.product_id).filter(Boolean))];

      const { data: products } = await supabase
        .from("products")
        .select("id, product_name, brand, category")
        .in("id", productIds);

      const productMap = new Map(products?.map(p => [p.id, p]) || []);

      const productProfitMap = new Map<string, ProductProfitData>();

      saleItems.forEach((item: any) => {
        const variant = variantMap.get(item.variant_id);
        const productId = item.product_id || variant?.product_id || "";
        const product = productMap.get(productId);

        const qty = item.quantity || 0;
        const lineTotal = Number(item.line_total) || 0;
        if (qty === 0 && lineTotal === 0) return;
        if (lineTotal < 0) return;

        const meta = saleMetaById.get(item.sale_id);
        const { grossLine, flatShare, netLine, lineDiscount } = computeSaleLineRevenue(item, meta);

        const purPrice = variantPurchasePriceMap.get(item.variant_id) || variant?.pur_price || 0;
        const cogs = qty * purPrice;

        if (!productProfitMap.has(productId)) {
          productProfitMap.set(productId, {
            productId,
            productName: item.product_name || product?.product_name || "Unknown Product",
            brand: product?.brand || null,
            category: product?.category || null,
            grossSales: 0,
            totalDiscounts: 0,
            netSales: 0,
            totalCOGS: 0,
            grossProfit: 0,
            marginPercent: 0,
            quantitySold: 0,
            zeroCostQty: 0,
          });
        }

        const data = productProfitMap.get(productId)!;
        data.grossSales += grossLine;
        data.totalDiscounts += lineDiscount + flatShare;
        data.netSales += netLine;
        data.totalCOGS += cogs;
        data.quantitySold += qty;
        if (purPrice === 0 && qty > 0) data.zeroCostQty += qty;
      });

      const result: ProductProfitData[] = [];
      productProfitMap.forEach(data => {
        data.grossProfit = Math.max(0, data.netSales - data.totalCOGS);
        data.marginPercent = data.netSales > 0 ? (data.grossProfit / data.netSales) * 100 : 0;
        result.push(data);
      });

      result.sort((a, b) => b.grossProfit - a.grossProfit);
      setProductData(result);
    } catch (error) {
      console.error("Error fetching product-wise profit:", error);
      toast.error("Failed to load product-wise data");
    }
    setLoading(false);
  };

  const handleGenerate = () => {
    setHasGenerated(true);
    if (activeTab === "supplier-wise") {
      fetchSupplierWiseProfit();
    } else {
      fetchProductWiseProfit();
    }
  };

  // Refetch when tab changes (after initial generation)
  useEffect(() => {
    if (hasGenerated) {
      if (activeTab === "supplier-wise" && supplierData.length === 0) {
        fetchSupplierWiseProfit();
      } else if (activeTab === "product-wise" && productData.length === 0) {
        fetchProductWiseProfit();
      }
    }
  }, [activeTab, hasGenerated]);

  const handleFYPresetSelect = (from: string, to: string, key: string) => {
    setFromDate(from);
    setToDate(to);
    setFyPreset(key);
  };

  const handleExportExcel = () => {
    if (activeTab === "supplier-wise") {
      if (filteredSupplierData.length === 0) {
        toast.error("No data to export");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        filteredSupplierData.map((s) => ({
          "Supplier": s.supplierName,
          "Items Sold": s.itemsSold,
          "Gross Sales": s.grossSales,
          "Discounts": s.totalDiscounts,
          "Net Sales": s.netSales,
          "COGS": s.totalCOGS,
          "Gross Profit": s.grossProfit,
          "Margin %": `${s.marginPercent.toFixed(1)}%`,
          "Qty w/o Cost": s.zeroCostQty,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Supplier Profit");
      XLSX.writeFile(wb, `supplier-profit-analysis-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } else {
      if (filteredProductData.length === 0) {
        toast.error("No data to export");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        filteredProductData.map((p) => ({
          "Product": p.productName,
          "Brand": p.brand || "-",
          "Category": p.category || "-",
          "Qty Sold": p.quantitySold,
          "Gross Sales": p.grossSales,
          "Discounts": p.totalDiscounts,
          "Net Sales": p.netSales,
          "COGS": p.totalCOGS,
          "Gross Profit": p.grossProfit,
          "Margin %": `${p.marginPercent.toFixed(1)}%`,
          "Qty w/o Cost": p.zeroCostQty,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Product Profit");
      XLSX.writeFile(wb, `product-profit-analysis-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    }
    toast.success("Excel exported successfully");
  };

  const filteredSupplierData = supplierData.filter(s =>
    s.supplierName.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredProductData = productData.filter(p =>
    p.productName.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.brand && p.brand.toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.category && p.category.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const supplierTotals = filteredSupplierData.reduce(
    (acc, s) => ({
      grossSales: acc.grossSales + s.grossSales,
      discounts: acc.discounts + s.totalDiscounts,
      netSales: acc.netSales + s.netSales,
      cogs: acc.cogs + s.totalCOGS,
      profit: acc.profit + s.grossProfit,
      items: acc.items + s.itemsSold,
    }),
    { grossSales: 0, discounts: 0, netSales: 0, cogs: 0, profit: 0, items: 0 }
  );

  const productTotals = filteredProductData.reduce(
    (acc, p) => ({
      grossSales: acc.grossSales + p.grossSales,
      discounts: acc.discounts + p.totalDiscounts,
      netSales: acc.netSales + p.netSales,
      cogs: acc.cogs + p.totalCOGS,
      profit: acc.profit + p.grossProfit,
      qty: acc.qty + p.quantitySold,
    }),
    { grossSales: 0, discounts: 0, netSales: 0, cogs: 0, profit: 0, qty: 0 }
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => orgNavigate("/accounting-reports")}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Net Profit Analysis
            </h1>
            <p className="text-xs text-muted-foreground">
              {currentOrganization?.name || "Organization"} • Supplier & Product-wise Profit Breakdown
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-1" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-3 border-b bg-muted/30 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 w-36"
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 w-36"
              />
            </div>
            <div className="self-end">
              <Button onClick={handleGenerate} disabled={loading} size="sm">
                {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Generate
              </Button>
            </div>
          </div>
          
          <FYPresets onSelect={handleFYPresetSelect} currentSelection={fyPreset} />
        </div>
        
        <p className="text-xs text-muted-foreground mt-2">
          Period: {format(new Date(fromDate), "dd MMM yyyy")} - {format(new Date(toDate), "dd MMM yyyy")}
        </p>
      </div>

      {/* Print Header */}
      <div className="hidden print:block p-4 border-b">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">{currentOrganization?.name || "Organization"}</h1>
          <h2 className="text-lg font-semibold mt-1">Net Profit Analysis - {activeTab === "supplier-wise" ? "Supplier-wise" : "Product-wise"}</h2>
          <p className="text-sm text-gray-600">
            Period: {format(new Date(fromDate), "dd MMM yyyy")} - {format(new Date(toDate), "dd MMM yyyy")}
          </p>
          <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
            <Clock className="h-3 w-3" />
            Generated: {format(new Date(), "dd MMM yyyy, hh:mm a")}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-4 print:hidden">
            <TabsTrigger value="supplier-wise" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Supplier-wise
            </TabsTrigger>
            <TabsTrigger value="product-wise" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Product-wise
            </TabsTrigger>
          </TabsList>

          {/* Supplier-wise Tab */}
          <TabsContent value="supplier-wise" className="flex-1 flex flex-col mt-0">
            <div className="flex items-center gap-2 mb-3 print:hidden">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search supplier..."
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                className="max-w-sm h-8"
              />
              <span className="text-xs text-muted-foreground ml-auto">
                {filteredSupplierData.length} suppliers
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !hasGenerated ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p>Click Generate to load supplier-wise profit data</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur">
                    <TableRow>
                      <TableHead className="w-[200px] text-foreground font-semibold">Supplier</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Items Sold</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Gross Sales</TableHead>
                      <TableHead className="text-right text-foreground font-semibold text-orange-600 dark:text-orange-400">Discounts</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Net Sales</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">COGS</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Gross Profit</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSupplierData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No data available for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSupplierData.map((supplier, idx) => (
                        <TableRow key={supplier.supplierId || idx}>
                          <TableCell className="font-medium">{supplier.supplierName}</TableCell>
                          <TableCell className="text-right">{supplier.itemsSold}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(supplier.grossSales)}</TableCell>
                          <TableCell className="text-right font-mono text-orange-600 dark:text-orange-400">
                            −{formatCurrency(supplier.totalDiscounts)}
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(supplier.netSales)}</TableCell>
                          <TableCell
                            className="text-right font-mono text-amber-600 dark:text-amber-400"
                            title={supplier.zeroCostQty > 0 ? `${supplier.zeroCostQty} qty sold with no purchase rate (COGS treated as 0)` : undefined}
                          >
                            {formatCurrency(supplier.totalCOGS)}
                            {supplier.zeroCostQty > 0 && (
                              <span className="ml-1 text-xs text-amber-700 dark:text-amber-300" aria-hidden>⚠</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(supplier.grossProfit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={supplier.marginPercent >= 20 ? "default" : supplier.marginPercent >= 0 ? "secondary" : "destructive"}>
                              <TrendingUp className="h-3 w-3 mr-1" />
                              {supplier.marginPercent.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {filteredSupplierData.length > 0 && (
                    <TableFooter className="sticky bottom-0 bg-muted font-bold">
                      <TableRow>
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-right">{supplierTotals.items}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(supplierTotals.grossSales)}</TableCell>
                        <TableCell className="text-right font-mono text-orange-600 dark:text-orange-400">
                          −{formatCurrency(supplierTotals.discounts)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(supplierTotals.netSales)}</TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                          {formatCurrency(supplierTotals.cogs)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600 dark:text-green-400">
                          {formatCurrency(supplierTotals.profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={supplierTotals.profit >= 0 ? "default" : "destructive"}>
                            {supplierTotals.netSales > 0 ? ((supplierTotals.profit / supplierTotals.netSales) * 100).toFixed(1) : 0}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </ScrollArea>
            )}
          </TabsContent>

          {/* Product-wise Tab */}
          <TabsContent value="product-wise" className="flex-1 flex flex-col mt-0">
            <div className="flex items-center gap-2 mb-3 print:hidden">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search product, brand, or category..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="max-w-sm h-8"
              />
              <span className="text-xs text-muted-foreground ml-auto">
                {filteredProductData.length} products
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !hasGenerated ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p>Click Generate to load product-wise profit data</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur">
                    <TableRow>
                      <TableHead className="w-[200px] text-foreground font-semibold">Product</TableHead>
                      <TableHead className="text-foreground font-semibold">Brand</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Qty Sold</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Gross Sales</TableHead>
                      <TableHead className="text-right text-foreground font-semibold text-orange-600 dark:text-orange-400">Discounts</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Net Sales</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">COGS</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Gross Profit</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProductData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No data available for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProductData.map((product, idx) => (
                        <TableRow key={product.productId || idx}>
                          <TableCell className="font-medium max-w-[200px] truncate" title={product.productName}>
                            {product.productName}
                          </TableCell>
                          <TableCell>
                            {product.brand ? (
                              <Badge variant="outline">{product.brand}</Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-right">{product.quantitySold}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(product.grossSales)}</TableCell>
                          <TableCell className="text-right font-mono text-orange-600 dark:text-orange-400">
                            −{formatCurrency(product.totalDiscounts)}
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(product.netSales)}</TableCell>
                          <TableCell
                            className="text-right font-mono text-amber-600 dark:text-amber-400"
                            title={product.zeroCostQty > 0 ? `${product.zeroCostQty} qty with no purchase rate (COGS treated as 0)` : undefined}
                          >
                            {formatCurrency(product.totalCOGS)}
                            {product.zeroCostQty > 0 && (
                              <span className="ml-1 text-xs text-amber-700 dark:text-amber-300" aria-hidden>⚠</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-green-600 dark:text-green-400">
                            {formatCurrency(product.grossProfit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={product.marginPercent >= 20 ? "default" : product.marginPercent >= 0 ? "secondary" : "destructive"}>
                              <TrendingUp className="h-3 w-3 mr-1" />
                              {product.marginPercent.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {filteredProductData.length > 0 && (
                    <TableFooter className="sticky bottom-0 bg-muted font-bold">
                      <TableRow>
                        <TableCell>TOTAL</TableCell>
                        <TableCell>-</TableCell>
                        <TableCell className="text-right">{productTotals.qty}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(productTotals.grossSales)}</TableCell>
                        <TableCell className="text-right font-mono text-orange-600 dark:text-orange-400">
                          −{formatCurrency(productTotals.discounts)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(productTotals.netSales)}</TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                          {formatCurrency(productTotals.cogs)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600 dark:text-green-400">
                          {formatCurrency(productTotals.profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={productTotals.profit >= 0 ? "default" : "destructive"}>
                            {productTotals.netSales > 0 ? ((productTotals.profit / productTotals.netSales) * 100).toFixed(1) : 0}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
