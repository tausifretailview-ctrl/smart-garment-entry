import { useState, useEffect, useMemo } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { 
  Loader2, Download, Printer, TrendingUp,
  Users, Package, Search, Calendar, ArrowLeft, Building2, Clock
} from "lucide-react";
import { format, startOfYear, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { getIndiaFinancialYear, getCurrentQuarter } from "@/utils/accountingReportUtils";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { fetchAllSaleItems, fetchAllPurchaseItems, fetchSaleReturnItemsByIds } from "@/utils/fetchAllRows";
import { cn } from "@/lib/utils";

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

/** Per sale_item: gross, discounts, and net (includes round-off; matches net_after_discount on save). */
function computeSaleLineRevenue(
  item: {
    quantity: number;
    line_total: number;
    unit_price: number;
    mrp: number;
    discount_percent: number;
    discount_share?: number | null;
    round_off_share?: number | null;
    net_after_discount?: number | null;
    sale_id: string;
  },
  saleMeta: { gross_amount: number; flat_discount_amount: number } | undefined
): { grossLine: number; flatShare: number; roundOffShare: number; netLine: number; lineDiscount: number } {
  const qty = Number(item.quantity) || 0;
  const lineTotal = Number(item.line_total) || 0;
  const unitP = Number(item.unit_price) || 0;
  const mrp = Number(item.mrp) || 0;
  const dPct = Number(item.discount_percent) || 0;

  let lineGross = qty * (mrp > 0 ? mrp : unitP);
  if (mrp <= 0 && dPct > 0 && dPct < 100) {
    const reconstructed = lineTotal / (1 - dPct / 100);
    if (Math.abs(reconstructed) > Math.abs(lineGross) && Number.isFinite(reconstructed)) {
      lineGross = Math.round(reconstructed * 100) / 100;
    }
  }

  // Keep signed discount so return/refund lines reduce correctly.
  const lineDiscount = lineGross - lineTotal;

  let flatShare: number;
  if (item.discount_share != null && Number.isFinite(Number(item.discount_share))) {
    flatShare = Number(item.discount_share);
  } else {
    const g = saleMeta?.gross_amount ?? 0;
    const flat = saleMeta?.flat_discount_amount ?? 0;
    flatShare = g > 0 && flat !== 0 ? (lineTotal / g) * flat : 0;
  }

  const roundOffShare = item.round_off_share != null && Number.isFinite(Number(item.round_off_share))
    ? Number(item.round_off_share)
    : 0;

  // Prefer stored net (line − flat + round-off). Never strip round-off from net sales.
  let netLine: number;
  if (item.net_after_discount != null && Number.isFinite(Number(item.net_after_discount))) {
    netLine = Number(item.net_after_discount);
  } else {
    netLine = lineTotal - flatShare + roundOffShare;
  }

  return { grossLine: lineGross, flatShare, roundOffShare, netLine, lineDiscount };
}

type VariantCostMaps = {
  variantMap: Map<string, { id: string; pur_price: number | null; product_id: string }>;
  variantPurchasePriceMap: Map<string, number>;
  variantToSupplier: Map<string, { id: string | null; name: string }>;
  productTypeById: Map<string, string>;
};

async function buildVariantCostMaps(
  organizationId: string,
  variantIds: string[],
  productIds: string[],
): Promise<VariantCostMaps> {
  const allVariants: { id: string; pur_price: number | null; product_id: string }[] = [];
  const variantBatchSize = 500;
  for (let i = 0; i < variantIds.length; i += variantBatchSize) {
    const batchIds = variantIds.slice(i, i + variantBatchSize);
    const { data: batchVariants } = await supabase
      .from("product_variants")
      .select("id, pur_price, product_id")
      .eq("organization_id", organizationId)
      .in("id", batchIds);
    if (batchVariants) allVariants.push(...batchVariants);
  }
  const variantMap = new Map(allVariants.map((v) => [v.id, v]));

  const purchaseItems = await fetchAllPurchaseItems(variantIds);
  const purPriceAccum: Record<string, { total: number; qty: number }> = {};
  purchaseItems?.forEach((pi: any) => {
    if (!pi.sku_id) return;
    if (!purPriceAccum[pi.sku_id]) purPriceAccum[pi.sku_id] = { total: 0, qty: 0 };
    const qty = Number(pi.qty) || 1;
    purPriceAccum[pi.sku_id].total += (Number(pi.pur_price) || 0) * qty;
    purPriceAccum[pi.sku_id].qty += qty;
  });
  const variantPurchasePriceMap = new Map<string, number>();
  Object.entries(purPriceAccum).forEach(([skuId, acc]) => {
    variantPurchasePriceMap.set(skuId, acc.qty > 0 ? acc.total / acc.qty : 0);
  });

  const billIds = [...new Set(purchaseItems?.map((pi) => pi.bill_id).filter(Boolean) || [])];
  let purchaseBills: { id: string; supplier_id: string | null; supplier_name: string }[] | null = null;
  if (billIds.length > 0) {
    const { data } = await supabase
      .from("purchase_bills")
      .select("id, supplier_id, supplier_name")
      .eq("organization_id", organizationId)
      .in("id", billIds);
    purchaseBills = data;
  }

  const variantToSupplier = new Map<string, { id: string | null; name: string }>();
  purchaseItems?.forEach((pi) => {
    if (!variantToSupplier.has(pi.sku_id)) {
      const bill = purchaseBills?.find((pb) => pb.id === pi.bill_id);
      if (bill) {
        variantToSupplier.set(pi.sku_id, { id: bill.supplier_id, name: bill.supplier_name });
      }
    }
  });

  const productTypeById = new Map<string, string>();
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))];
  for (let i = 0; i < uniqueProductIds.length; i += 500) {
    const batchIds = uniqueProductIds.slice(i, i + 500);
    const { data: products } = await supabase
      .from("products")
      .select("id, product_type")
      .eq("organization_id", organizationId)
      .in("id", batchIds);
    products?.forEach((p) => productTypeById.set(p.id, p.product_type || "goods"));
  }

  return { variantMap, variantPurchasePriceMap, variantToSupplier, productTypeById };
}

async function fetchPeriodSaleReturnItems(organizationId: string, fromDate: string, toDate: string) {
  const { data: returns, error } = await supabase
    .from("sale_returns")
    .select("id")
    .eq("organization_id", organizationId)
    .gte("return_date", fromDate)
    .lte("return_date", `${toDate}T23:59:59`)
    .is("deleted_at", null);

  if (error) throw error;
  if (!returns?.length) return [] as any[];

  return fetchSaleReturnItemsByIds(
    returns.map((r) => r.id),
    "return_id, variant_id, product_id, product_name, quantity, line_total, unit_price",
  );
}

function lineCogs(
  qty: number,
  variantId: string | null | undefined,
  productId: string | null | undefined,
  maps: Pick<VariantCostMaps, "variantMap" | "variantPurchasePriceMap" | "productTypeById">,
): { cogs: number; purPrice: number; isService: boolean } {
  const productType = productId ? maps.productTypeById.get(productId) : undefined;
  const isService = productType === "service";
  if (isService || !variantId) {
    return { cogs: 0, purPrice: 0, isService };
  }
  const variant = maps.variantMap.get(variantId);
  const purPrice = maps.variantPurchasePriceMap.get(variantId) || variant?.pur_price || 0;
  return { cogs: qty * purPrice, purPrice, isService };
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
    <div className="flex flex-wrap gap-1.5">
      <Button
        variant={currentSelection === "today" ? "default" : "outline"}
        size="sm"
        className="h-9 text-sm"
        onClick={() => onSelect(todayStart, todayEnd, "today")}
      >
        Today
      </Button>
      <Button
        variant={currentSelection === "week" ? "default" : "outline"}
        size="sm"
        className="h-9 text-sm"
        onClick={() => onSelect(weekStart, weekEnd, "week")}
      >
        This Week
      </Button>
      <Button
        variant={currentSelection === "month" ? "default" : "outline"}
        size="sm"
        className="h-9 text-sm"
        onClick={() => onSelect(monthStart, monthEnd, "month")}
      >
        This Month
      </Button>
      <Button
        variant={currentSelection === "currentQ" ? "default" : "outline"}
        size="sm"
        className="h-9 text-sm"
        onClick={() => onSelect(currentQ.fromDate, currentQ.toDate, "currentQ")}
      >
        {currentQ.label}
      </Button>
      <Button
        variant={currentSelection === "currentFY" ? "default" : "outline"}
        size="sm"
        className="h-9 text-sm"
        onClick={() => onSelect(currentFY.fromDate, currentFY.toDate, "currentFY")}
      >
        <Calendar className="mr-1 h-3.5 w-3.5" />
        {currentFY.label}
      </Button>
      <Button
        variant={currentSelection === "previousFY" ? "default" : "outline"}
        size="sm"
        className="h-9 text-sm"
        onClick={() => onSelect(previousFY.fromDate, previousFY.toDate, "previousFY")}
      >
        {previousFY.label}
      </Button>
    </div>
  );
};

export default function NetProfitAnalysis() {
  const { currentOrganization } = useOrganization();
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
      const orgId = currentOrganization.id;
      const { data: sales } = await supabase
        .from("sales")
        .select("id, gross_amount, flat_discount_amount")
        .eq("organization_id", orgId)
        .gte("sale_date", fromDate)
        .lte("sale_date", `${toDate}T23:59:59`)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .or("payment_status.is.null,payment_status.neq.cancelled")
        .or("sale_type.is.null,sale_type.neq.sale_return");

      const saleItems = sales?.length ? await fetchAllSaleItems(sales.map((s) => s.id)) : [];
      const returnItems = await fetchPeriodSaleReturnItems(orgId, fromDate, toDate);

      if ((!saleItems || saleItems.length === 0) && returnItems.length === 0) {
        setSupplierData([]);
        setLoading(false);
        return;
      }

      const saleMetaById = new Map(
        (sales || []).map((s) => [
          s.id,
          {
            gross_amount: Number(s.gross_amount) || 0,
            flat_discount_amount: Number(s.flat_discount_amount) || 0,
          },
        ])
      );

      const variantIds = [
        ...new Set([
          ...saleItems.map((si) => si.variant_id).filter(Boolean),
          ...returnItems.map((ri: any) => ri.variant_id).filter(Boolean),
        ]),
      ] as string[];
      const productIds = [
        ...new Set([
          ...saleItems.map((si) => si.product_id).filter(Boolean),
          ...returnItems.map((ri: any) => ri.product_id).filter(Boolean),
        ]),
      ] as string[];

      const maps = await buildVariantCostMaps(orgId, variantIds, productIds);
      const supplierProfitMap = new Map<string, SupplierProfitData>();

      const ensureSupplier = (supplierInfo: { id: string | null; name: string }) => {
        const supplierKey = supplierInfo.id || supplierInfo.name;
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
        return supplierProfitMap.get(supplierKey)!;
      };

      saleItems.forEach((item: any) => {
        const variant = maps.variantMap.get(item.variant_id);
        const productId = item.product_id || variant?.product_id || "";
        const isService = maps.productTypeById.get(productId) === "service";
        const supplierInfo =
          maps.variantToSupplier.get(item.variant_id) ||
          (isService
            ? { id: null, name: "Services" }
            : { id: null, name: "Unknown Supplier" });

        const qty = Number(item.quantity) || 0;
        const lineTotal = Number(item.line_total) || 0;
        if (qty === 0 && lineTotal === 0) return;

        const meta = saleMetaById.get(item.sale_id);
        const { grossLine, flatShare, netLine, lineDiscount } = computeSaleLineRevenue(item, meta);
        const { cogs, purPrice } = lineCogs(qty, item.variant_id, productId, maps);

        const data = ensureSupplier(supplierInfo);
        data.grossSales += grossLine;
        // Discounts = item + bill flat only; round-off stays inside net sales.
        data.totalDiscounts += lineDiscount + flatShare;
        data.netSales += netLine;
        data.totalCOGS += cogs;
        data.itemsSold += qty;
        if (!isService && purPrice === 0 && qty > 0) data.zeroCostQty += qty;
      });

      // Refunds / returns in period: reduce net sales + reverse COGS.
      returnItems.forEach((item: any) => {
        const variant = maps.variantMap.get(item.variant_id);
        const productId = item.product_id || variant?.product_id || "";
        const isService = maps.productTypeById.get(productId) === "service";
        const supplierInfo =
          maps.variantToSupplier.get(item.variant_id) ||
          (isService
            ? { id: null, name: "Services" }
            : { id: null, name: "Unknown Supplier" });

        const qty = Number(item.quantity) || 0;
        const lineTotal = Number(item.line_total) || 0;
        if (qty === 0 && lineTotal === 0) return;

        const { cogs, purPrice } = lineCogs(qty, item.variant_id, productId, maps);
        const data = ensureSupplier(supplierInfo);
        data.grossSales -= lineTotal;
        data.netSales -= lineTotal;
        data.totalCOGS -= cogs;
        data.itemsSold -= qty;
        if (!isService && purPrice === 0 && qty > 0) data.zeroCostQty -= qty;
      });

      const result: SupplierProfitData[] = [];
      supplierProfitMap.forEach((data) => {
        data.grossProfit = data.netSales - data.totalCOGS;
        data.marginPercent = data.netSales !== 0 ? (data.grossProfit / data.netSales) * 100 : 0;
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
        const { grossLine, flatShare, roundOffShare, netLine, lineDiscount } = computeSaleLineRevenue(item, meta);

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
        data.totalDiscounts += lineDiscount + flatShare + roundOffShare;
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

  const activeTotals = activeTab === "supplier-wise" ? supplierTotals : productTotals;
  const activeMarginPct =
    activeTotals.netSales > 0 ? (activeTotals.profit / activeTotals.netSales) * 100 : 0;

  const kpiItems = useMemo(
    () => [
      {
        label: "Gross Sales",
        value: formatCurrency(activeTotals.grossSales),
        gradient: "bg-gradient-to-br from-blue-500 to-blue-600",
      },
      {
        label: "Net Sales",
        value: formatCurrency(activeTotals.netSales),
        gradient: "bg-gradient-to-br from-violet-500 to-violet-600",
      },
      {
        label: "Gross Profit",
        value: formatCurrency(activeTotals.profit),
        gradient: "bg-gradient-to-br from-emerald-500 to-emerald-600",
      },
      {
        label: "Margin",
        value: `${activeMarginPct.toFixed(1)}%`,
        gradient: "bg-gradient-to-br from-amber-500 to-amber-600",
      },
    ],
    [activeTotals, activeMarginPct],
  );

  const tableHeadClass = "h-10 px-4 text-xs font-bold uppercase tracking-wide text-white";
  const tableRowClass = "h-11 hover:bg-teal-50/80 dark:hover:bg-teal-950/20";

  return (
    <div className="net-profit-workspace net-profit-report flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3 print:min-h-screen print:h-auto print:overflow-visible print:bg-white print:p-4">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="print:hidden shrink-0 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 px-3 text-sm"
              onClick={() => orgNavigate("/reports")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Reports
            </Button>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-blue-700">
                <TrendingUp className="h-5 w-5 shrink-0" />
                Net Profit Analysis
              </h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {currentOrganization?.name || "Organization"} · Supplier &amp; Product-wise Profit Breakdown
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-9 gap-1.5 border-slate-300 text-sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 border-slate-300 text-sm" onClick={handleExportExcel}>
              <Download className="h-4 w-4" />
              Excel
            </Button>
          </div>
        </div>

        {hasGenerated && !loading && (
          <div className="grid shrink-0 grid-cols-2 gap-2 print:hidden lg:grid-cols-4">
            {kpiItems.map((item) => (
              <div key={item.label} className={cn("min-w-0 rounded-lg px-3 py-2 shadow-sm", item.gradient)}>
                <p className="truncate text-xs font-medium leading-none text-white/80">{item.label}</p>
                <p className="mt-1 truncate text-base font-black tabular-nums leading-tight text-white sm:text-lg">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        )}

        <Card className="shrink-0 rounded-lg border border-slate-200 shadow-sm print:hidden">
          <CardContent className="space-y-2 p-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-10 w-36 border-slate-200 bg-slate-50 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-10 w-36 border-slate-200 bg-slate-50 text-sm"
                />
              </div>
              <Button onClick={handleGenerate} disabled={loading} size="sm" className="h-10 px-4 text-sm">
                {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Generate
              </Button>
              <FYPresets onSelect={handleFYPresetSelect} currentSelection={fyPreset} />
            </div>
            <p className="text-sm text-muted-foreground">
              Period: {format(new Date(fromDate), "dd MMM yyyy")} – {format(new Date(toDate), "dd MMM yyyy")}
            </p>
          </CardContent>
        </Card>

        {/* Print Header */}
        <div className="hidden border-b p-4 print:block">
          <div className="text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <Building2 className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">{currentOrganization?.name || "Organization"}</h1>
            <h2 className="mt-1 text-lg font-semibold">
              Net Profit Analysis - {activeTab === "supplier-wise" ? "Supplier-wise" : "Product-wise"}
            </h2>
            <p className="text-sm text-gray-600">
              Period: {format(new Date(fromDate), "dd MMM yyyy")} - {format(new Date(toDate), "dd MMM yyyy")}
            </p>
            <p className="mt-1 flex items-center justify-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              Generated: {format(new Date(), "dd MMM yyyy, hh:mm a")}
            </p>
          </div>
        </div>

        {/* Main panel */}
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 print:hidden">
              <TabsList className="grid h-9 w-full max-w-xs grid-cols-2 bg-slate-100 p-0.5">
                <TabsTrigger value="supplier-wise" className="flex h-8 items-center gap-1.5 text-sm data-[state=active]:bg-white">
                  <Users className="h-4 w-4" />
                  Supplier-wise
                </TabsTrigger>
                <TabsTrigger value="product-wise" className="flex h-8 items-center gap-1.5 text-sm data-[state=active]:bg-white">
                  <Package className="h-4 w-4" />
                  Product-wise
                </TabsTrigger>
              </TabsList>
            </div>

          {/* Supplier-wise Tab */}
          <TabsContent value="supplier-wise" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 print:hidden">
              <div className="relative min-w-[200px] max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="SEARCH SUPPLIER..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  className="h-10 border-slate-200 bg-slate-50 pl-10 text-sm uppercase placeholder:normal-case"
                />
              </div>
              <span className="ml-auto shrink-0 text-sm tabular-nums text-muted-foreground">
                {filteredSupplierData.length.toLocaleString("en-IN")} suppliers
              </span>
            </div>
            <p className="shrink-0 px-3 py-1.5 text-xs text-muted-foreground print:hidden">
              Discounts include item discount, bill-level flat discount, and round-off adjustment.
            </p>

            {loading ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !hasGenerated ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Click Generate to load supplier-wise profit data
              </div>
            ) : (
              <div className="net-profit-table-scroll min-h-0 flex-1 overflow-y-auto overflow-x-auto tab-scroll-stable bg-white">
                <Table className="[&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="border-none bg-slate-800 hover:bg-slate-800">
                      <TableHead className={cn(tableHeadClass, "w-[200px]")}>Supplier</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Items Sold</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Gross Sales</TableHead>
                      <TableHead
                        className={cn(tableHeadClass, "text-right text-orange-300")}
                        title="Includes item discount, bill-level flat discount, and round-off adjustment"
                      >
                        Discounts
                      </TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Net Sales</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>COGS</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Gross Profit</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSupplierData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-20 text-center text-sm text-muted-foreground">
                          No data available for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSupplierData.map((supplier, idx) => (
                        <TableRow key={supplier.supplierId || idx} className={tableRowClass}>
                          <TableCell className="text-sm font-medium">{supplier.supplierName}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{supplier.itemsSold}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">{formatCurrency(supplier.grossSales)}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-orange-600 dark:text-orange-400">
                            −{formatCurrency(supplier.totalDiscounts)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">{formatCurrency(supplier.netSales)}</TableCell>
                          <TableCell
                            className="text-right font-mono text-sm tabular-nums text-amber-600 dark:text-amber-400"
                            title={supplier.zeroCostQty > 0 ? `${supplier.zeroCostQty} qty sold with no purchase rate (COGS treated as 0)` : undefined}
                          >
                            {formatCurrency(supplier.totalCOGS)}
                            {supplier.zeroCostQty > 0 && (
                              <span className="ml-1 text-xs text-amber-700 dark:text-amber-300" aria-hidden>⚠</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-green-600 dark:text-green-400">
                            {formatCurrency(supplier.grossProfit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={supplier.marginPercent >= 20 ? "default" : supplier.marginPercent >= 0 ? "secondary" : "destructive"}>
                              <TrendingUp className="mr-1 h-3 w-3" />
                              {supplier.marginPercent.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {filteredSupplierData.length > 0 && (
                    <TableFooter className="sticky bottom-0 z-10 border-t-2 bg-slate-100 font-bold">
                      <TableRow className="h-11">
                        <TableCell className="text-sm">TOTAL</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{supplierTotals.items}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{formatCurrency(supplierTotals.grossSales)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-orange-600 dark:text-orange-400">
                          −{formatCurrency(supplierTotals.discounts)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{formatCurrency(supplierTotals.netSales)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-amber-600 dark:text-amber-400">
                          {formatCurrency(supplierTotals.cogs)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-green-600 dark:text-green-400">
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
              </div>
            )}
          </TabsContent>

          {/* Product-wise Tab */}
          <TabsContent value="product-wise" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 print:hidden">
              <div className="relative min-w-[200px] max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="SEARCH PRODUCT, BRAND, CATEGORY..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="h-10 border-slate-200 bg-slate-50 pl-10 text-sm uppercase placeholder:normal-case"
                />
              </div>
              <span className="ml-auto shrink-0 text-sm tabular-nums text-muted-foreground">
                {filteredProductData.length.toLocaleString("en-IN")} products
              </span>
            </div>
            <p className="shrink-0 px-3 py-1.5 text-xs text-muted-foreground print:hidden">
              Discounts include item discount, bill-level flat discount, and round-off adjustment.
            </p>

            {loading ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !hasGenerated ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Click Generate to load product-wise profit data
              </div>
            ) : (
              <div className="net-profit-table-scroll min-h-0 flex-1 overflow-y-auto overflow-x-auto tab-scroll-stable bg-white">
                <Table className="[&_td]:px-4 [&_th]:px-4">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="border-none bg-slate-800 hover:bg-slate-800">
                      <TableHead className={cn(tableHeadClass, "w-[200px]")}>Product</TableHead>
                      <TableHead className={tableHeadClass}>Brand</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Qty Sold</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Gross Sales</TableHead>
                      <TableHead
                        className={cn(tableHeadClass, "text-right text-orange-300")}
                        title="Includes item discount, bill-level flat discount, and round-off adjustment"
                      >
                        Discounts
                      </TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Net Sales</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>COGS</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Gross Profit</TableHead>
                      <TableHead className={cn(tableHeadClass, "text-right")}>Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProductData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-20 text-center text-sm text-muted-foreground">
                          No data available for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProductData.map((product, idx) => (
                        <TableRow key={product.productId || idx} className={tableRowClass}>
                          <TableCell className="max-w-[200px] truncate text-sm font-medium" title={product.productName}>
                            {product.productName}
                          </TableCell>
                          <TableCell className="text-sm">
                            {product.brand ? (
                              <Badge variant="outline">{product.brand}</Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{product.quantitySold}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">{formatCurrency(product.grossSales)}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-orange-600 dark:text-orange-400">
                            −{formatCurrency(product.totalDiscounts)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">{formatCurrency(product.netSales)}</TableCell>
                          <TableCell
                            className="text-right font-mono text-sm tabular-nums text-amber-600 dark:text-amber-400"
                            title={product.zeroCostQty > 0 ? `${product.zeroCostQty} qty with no purchase rate (COGS treated as 0)` : undefined}
                          >
                            {formatCurrency(product.totalCOGS)}
                            {product.zeroCostQty > 0 && (
                              <span className="ml-1 text-xs text-amber-700 dark:text-amber-300" aria-hidden>⚠</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-green-600 dark:text-green-400">
                            {formatCurrency(product.grossProfit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={product.marginPercent >= 20 ? "default" : product.marginPercent >= 0 ? "secondary" : "destructive"}>
                              <TrendingUp className="mr-1 h-3 w-3" />
                              {product.marginPercent.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {filteredProductData.length > 0 && (
                    <TableFooter className="sticky bottom-0 z-10 border-t-2 bg-slate-100 font-bold">
                      <TableRow className="h-11">
                        <TableCell className="text-sm">TOTAL</TableCell>
                        <TableCell className="text-sm">-</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{productTotals.qty}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{formatCurrency(productTotals.grossSales)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-orange-600 dark:text-orange-400">
                          −{formatCurrency(productTotals.discounts)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">{formatCurrency(productTotals.netSales)}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-amber-600 dark:text-amber-400">
                          {formatCurrency(productTotals.cogs)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-green-600 dark:text-green-400">
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
              </div>
            )}
          </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
