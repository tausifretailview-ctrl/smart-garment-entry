import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, addDays } from "date-fns";
import {
  Search, Package, IndianRupee, TrendingUp, FileSpreadsheet, AlertTriangle,
  ChevronDown, ChevronUp, Phone, MessageSquare, ShoppingCart, RefreshCw, Loader2,
  ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { sortSizes } from "@/utils/sizeSort";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

type QuickPeriod = "today" | "yesterday" | "last7" | "last30" | "thisMonth";

interface SaleItemAnalysis {
  variantId: string;
  productId: string;
  itemDescription: string;
  category: string;
  brand: string;
  color: string;
  size: string;
  barcode: string;
  hsnCode: string;
  supplierName: string;
  supplierPhone: string;
  mrp: number;
  saleRate: number;
  purchaseRate: number;
  margin: number;
  marginPercent: number;
  qtySoldToday: number;
  saleAmount: number;
  currentStock: number;
  totalSoldLast7Days: number;
  totalSoldLast30Days: number;
  avgDailySale: number;
  daysOfStockLeft: number | null;
  lastPurchaseDate: string | null;
  lastPurchaseQty: number;
  lastPurchaseRate: number;
  lastPurchaseBillNo: string;
  reorderQty: number;
  stockStatus: "out_of_stock" | "critical" | "low" | "healthy" | "overstock";
}

const STOCK_STATUS_CONFIG = {
  out_of_stock: { label: "Out of Stock", icon: "🔴", bgClass: "bg-red-100 dark:bg-red-900/30", textClass: "text-red-700 dark:text-red-400" },
  critical: { label: "Critical", icon: "🟠", bgClass: "bg-orange-100 dark:bg-orange-900/30", textClass: "text-orange-700 dark:text-orange-400" },
  low: { label: "Low Stock", icon: "🟡", bgClass: "bg-yellow-100 dark:bg-yellow-900/30", textClass: "text-yellow-700 dark:text-yellow-400" },
  healthy: { label: "In Stock", icon: "🟢", bgClass: "bg-emerald-100 dark:bg-emerald-900/30", textClass: "text-emerald-700 dark:text-emerald-400" },
  overstock: { label: "Overstock", icon: "🔵", bgClass: "bg-blue-100 dark:bg-blue-900/30", textClass: "text-blue-700 dark:text-blue-400" },
};

const CHART_COLORS = [
  "hsl(var(--primary))", "hsl(210, 70%, 50%)", "hsl(150, 60%, 45%)",
  "hsl(45, 90%, 55%)", "hsl(280, 65%, 55%)", "hsl(0, 70%, 55%)",
  "hsl(180, 60%, 45%)", "hsl(330, 65%, 55%)", "hsl(120, 50%, 40%)", "hsl(60, 80%, 50%)",
];

const STATUS_PIE_COLORS = ["#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#2563EB"];

const REPORT_CACHE = { staleTime: 60_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false as const };

const formatINR = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

// Convert to IST-aware dates, then return UTC ISO strings for Supabase queries
const getISTDateRange = (period: QuickPeriod): { fromISO: string; toISO: string; fromDate: Date; toDate: Date } => {
  // Get current time in IST
  const now = new Date();
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  let startDate: Date;
  let endDate: Date;

  switch (period) {
    case "today":
      startDate = new Date(istNow); startDate.setHours(0, 0, 0, 0);
      endDate = new Date(istNow); endDate.setHours(23, 59, 59, 999);
      break;
    case "yesterday":
      startDate = new Date(istNow); startDate.setDate(startDate.getDate() - 1); startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate); endDate.setHours(23, 59, 59, 999);
      break;
    case "last7":
      startDate = new Date(istNow); startDate.setDate(startDate.getDate() - 6); startDate.setHours(0, 0, 0, 0);
      endDate = new Date(istNow); endDate.setHours(23, 59, 59, 999);
      break;
    case "last30":
      startDate = new Date(istNow); startDate.setDate(startDate.getDate() - 29); startDate.setHours(0, 0, 0, 0);
      endDate = new Date(istNow); endDate.setHours(23, 59, 59, 999);
      break;
    case "thisMonth":
      startDate = new Date(istNow.getFullYear(), istNow.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(istNow.getFullYear(), istNow.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
  }

  // Convert IST dates to UTC by subtracting 5:30 (330 minutes)
  const toUTC = (istDate: Date) => {
    const utc = new Date(istDate);
    utc.setMinutes(utc.getMinutes() - 330);
    return utc.toISOString();
  };

  return { fromISO: toUTC(startDate), toISO: toUTC(endDate), fromDate: startDate, toDate: endDate };
};

const getStockStatus = (currentStock: number, daysLeft: number | null): SaleItemAnalysis["stockStatus"] => {
  if (currentStock <= 0) return "out_of_stock";
  if (daysLeft !== null && daysLeft <= 3) return "critical";
  if (daysLeft !== null && daysLeft <= 7) return "low";
  if (daysLeft !== null && daysLeft > 90) return "overstock";
  return "healthy";
};

const calculateReorderQty = (avgDailySale: number, currentStock: number): number => {
  if (avgDailySale <= 0) return 0;
  const targetStock = avgDailySale * (30 + 7); // 30 day cycle + 7 day safety
  return Math.max(0, Math.ceil(targetStock - currentStock));
};

export default function DailySaleAnalysis() {
  const { currentOrganization } = useOrganization();
  const isMobile = useIsMobile();
  const orgId = currentOrganization?.id;

  const [period, setPeriod] = useState<QuickPeriod>("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("itemwise");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const dateRange = useMemo(() => getISTDateRange(period), [period]);
  const isToday = period === "today";

  // ---- MAIN DATA QUERY ----
  const { data: analysisData, isLoading, error: queryError, refetch } = useQuery({
    queryKey: ["daily-sale-analysis", orgId, dateRange.fromISO, dateRange.toISO],
    queryFn: async () => {
      if (!orgId) return [];

      const fromStr = dateRange.fromISO;
      const toStr = dateRange.toISO;
      // For velocity calculations, also compute 30-day and 7-day ranges in IST
      const vel30 = getISTDateRange("last30");
      const vel7 = getISTDateRange("last7");
      const thirtyDaysAgo = vel30.fromISO;
      const sevenDaysAgo = vel7.fromISO;

      // 1. Fetch sale items in date range
      const allSaleItems: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("sale_items")
          .select(`
            variant_id, product_name, size, color, barcode, hsn_code, quantity, unit_price, line_total, mrp, discount_percent,
            sales!inner(id, sale_date, customer_name, sale_number, organization_id, deleted_at, salesman)
          `)
          .eq("sales.organization_id", orgId)
          .is("sales.deleted_at", null)
          .gte("sales.sale_date", fromStr)
          .lte("sales.sale_date", toStr)
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allSaleItems.push(...data);
          offset += pageSize;
          if (data.length < pageSize) hasMore = false;
        } else hasMore = false;
      }

      // Aggregate by variant_id
      const variantMap = new Map<string, {
        variantId: string; productName: string; size: string; color: string;
        barcode: string; hsnCode: string; totalQty: number; totalAmount: number;
        avgRate: number; maxMrp: number; rates: number[];
        recentSales: { date: string; invoice: string; customer: string; qty: number; rate: number; amount: number }[];
      }>();

      for (const item of allSaleItems) {
        const vid = item.variant_id;
        const existing = variantMap.get(vid);
        const saleInfo = {
          date: item.sales?.sale_date || "",
          invoice: item.sales?.sale_number || "",
          customer: item.sales?.customer_name || "Walk-in",
          qty: item.quantity || 0,
          rate: item.unit_price || 0,
          amount: item.line_total || 0,
        };
        if (existing) {
          existing.totalQty += item.quantity || 0;
          existing.totalAmount += item.line_total || 0;
          existing.rates.push(item.unit_price || 0);
          existing.maxMrp = Math.max(existing.maxMrp, item.mrp || 0);
          if (existing.recentSales.length < 10) existing.recentSales.push(saleInfo);
        } else {
          variantMap.set(vid, {
            variantId: vid,
            productName: item.product_name || "",
            size: item.size || "",
            color: item.color || "",
            barcode: item.barcode || "",
            hsnCode: item.hsn_code || "",
            totalQty: item.quantity || 0,
            totalAmount: item.line_total || 0,
            avgRate: item.unit_price || 0,
            maxMrp: item.mrp || 0,
            rates: [item.unit_price || 0],
            recentSales: [saleInfo],
          });
        }
      }

      const variantIds = [...variantMap.keys()];
      if (variantIds.length === 0) return [];

      // 2. Fetch variant details (stock, product info) in batches
      const variantDetails = new Map<string, any>();
      for (let i = 0; i < variantIds.length; i += 50) {
        const batch = variantIds.slice(i, i + 50);
        const { data } = await supabase
          .from("product_variants")
          .select("id, current_stock, sale_price, pur_price, product_id, products(product_name, brand, category, style)")
          .in("id", batch);
        if (data) data.forEach(v => variantDetails.set(v.id, v));
      }

      // 3. Fetch 30-day & 7-day sale velocity for these variants
      const velocityMap = new Map<string, { last7: number; last30: number }>();
      for (let i = 0; i < variantIds.length; i += 50) {
        const batch = variantIds.slice(i, i + 50);
        const { data: vel30 } = await supabase
          .from("sale_items")
          .select("variant_id, quantity, sales!inner(sale_date, organization_id, deleted_at)")
          .in("variant_id", batch)
          .eq("sales.organization_id", orgId)
          .is("sales.deleted_at", null)
          .gte("sales.sale_date", thirtyDaysAgo);
        if (vel30) {
          for (const row of vel30) {
            const vid = row.variant_id;
            const saleDate = (row.sales as any)?.sale_date || "";
            const qty = row.quantity || 0;
            const entry = velocityMap.get(vid) || { last7: 0, last30: 0 };
            entry.last30 += qty;
            if (saleDate >= sevenDaysAgo) entry.last7 += qty;
            velocityMap.set(vid, entry);
          }
        }
      }

      // 4. Fetch last purchase for these variants
      const purchaseMap = new Map<string, { date: string; qty: number; rate: number; billNo: string; supplierName: string; supplierPhone: string }>();
      for (let i = 0; i < variantIds.length; i += 50) {
        const batch = variantIds.slice(i, i + 50);
        const { data: purItems } = await supabase
          .from("purchase_items")
          .select("sku_id, qty, pur_price, purchase_bills!inner(bill_date, software_bill_no, supplier_name, supplier_id, organization_id, deleted_at)")
          .in("sku_id", batch)
          .eq("purchase_bills.organization_id", orgId)
          .is("purchase_bills.deleted_at", null)
          .order("created_at", { ascending: false });
        if (purItems) {
          for (const pi of purItems as any[]) {
            if (!purchaseMap.has(pi.sku_id)) {
              const pb = pi.purchase_bills;
              purchaseMap.set(pi.sku_id, {
                date: pb?.bill_date || "",
                qty: pi.qty || 0,
                rate: pi.pur_price || 0,
                billNo: pb?.software_bill_no || "",
                supplierName: pb?.supplier_name || "",
                supplierPhone: "",
              });
            }
          }
        }
      }

      // 5. Build analysis rows
      const results: SaleItemAnalysis[] = [];
      for (const [vid, agg] of variantMap) {
        const vd = variantDetails.get(vid);
        const vel = velocityMap.get(vid) || { last7: 0, last30: 0 };
        const pur = purchaseMap.get(vid);
        const product = vd?.products;

        const currentStock = vd?.current_stock ?? 0;
        const avgDailySale = vel.last30 / 30;
        const daysLeft = avgDailySale > 0 ? Math.round(currentStock / avgDailySale) : (currentStock > 0 ? null : 0);
        const saleRate = agg.totalAmount / agg.totalQty;
        const purchaseRate = pur?.rate || vd?.pur_price || 0;
        const margin = saleRate - purchaseRate;

        results.push({
          variantId: vid,
          productId: vd?.product_id || "",
          itemDescription: agg.productName || product?.product_name || "",
          category: product?.category || "",
          brand: product?.brand || "",
          color: agg.color,
          size: agg.size,
          barcode: agg.barcode,
          hsnCode: agg.hsnCode,
          supplierName: pur?.supplierName || "",
          supplierPhone: pur?.supplierPhone || "",
          mrp: agg.maxMrp,
          saleRate: Math.round(saleRate),
          purchaseRate,
          margin: Math.round(margin),
          marginPercent: saleRate > 0 ? Math.round((margin / saleRate) * 100) : 0,
          qtySoldToday: agg.totalQty,
          saleAmount: Math.round(agg.totalAmount),
          currentStock,
          totalSoldLast7Days: vel.last7,
          totalSoldLast30Days: vel.last30,
          avgDailySale: Math.round(avgDailySale * 10) / 10,
          daysOfStockLeft: daysLeft,
          lastPurchaseDate: pur?.date || null,
          lastPurchaseQty: pur?.qty || 0,
          lastPurchaseRate: pur?.rate || 0,
          lastPurchaseBillNo: pur?.billNo || "",
          reorderQty: calculateReorderQty(avgDailySale, currentStock),
          stockStatus: getStockStatus(currentStock, daysLeft),
        });
      }

      setLastUpdated(new Date());
      return results.sort((a, b) => b.qtySoldToday - a.qtySoldToday);
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
    refetchInterval: isToday ? 5 * 60_000 : false,
  });

  const items = analysisData || [];

  // ---- FILTER OPTIONS ----
  const filterOptions = useMemo(() => {
    const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
    const brands = [...new Set(items.map(i => i.brand).filter(Boolean))].sort();
    const suppliers = [...new Set(items.map(i => i.supplierName).filter(Boolean))].sort();
    return { categories, brands, suppliers };
  }, [items]);

  // ---- FILTERED DATA ----
  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.itemDescription.toLowerCase().includes(q) ||
        i.barcode.toLowerCase().includes(q) ||
        i.supplierName.toLowerCase().includes(q) ||
        i.brand.toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== "all") result = result.filter(i => i.category === categoryFilter);
    if (brandFilter !== "all") result = result.filter(i => i.brand === brandFilter);
    if (supplierFilter !== "all") result = result.filter(i => i.supplierName === supplierFilter);
    if (stockStatusFilter !== "all") result = result.filter(i => i.stockStatus === stockStatusFilter);
    return result;
  }, [items, searchQuery, categoryFilter, brandFilter, supplierFilter, stockStatusFilter]);

  // ---- SUMMARY ----
  const summary = useMemo(() => {
    const totalItems = filteredItems.length;
    const totalQty = filteredItems.reduce((s, i) => s + i.qtySoldToday, 0);
    const totalRevenue = filteredItems.reduce((s, i) => s + i.saleAmount, 0);
    const outOfStock = filteredItems.filter(i => i.stockStatus === "out_of_stock").length;
    const reorderNeeded = filteredItems.filter(i => i.reorderQty > 0).length;
    const reorderValue = filteredItems.reduce((s, i) => s + i.reorderQty * i.lastPurchaseRate, 0);
    return { totalItems, totalQty, totalRevenue, outOfStock, reorderNeeded, reorderValue };
  }, [filteredItems]);

  // ---- SUPPLIER GROUPED ----
  const supplierGroups = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; items: SaleItemAnalysis[]; revenue: number; reorderCount: number }>();
    for (const item of filteredItems) {
      const key = item.supplierName || "Unknown";
      const grp = map.get(key) || { name: key, phone: item.supplierPhone, items: [], revenue: 0, reorderCount: 0 };
      grp.items.push(item);
      grp.revenue += item.saleAmount;
      if (item.reorderQty > 0) grp.reorderCount++;
      map.set(key, grp);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems]);

  // ---- CHART DATA ----
  const topSellersData = useMemo(() =>
    filteredItems.slice(0, 10).map(i => ({
      name: `${i.itemDescription.substring(0, 20)} ${i.size}`,
      qty: i.qtySoldToday,
    })),
    [filteredItems]
  );

  const stockDistribution = useMemo(() => {
    const counts = { out_of_stock: 0, critical: 0, low: 0, healthy: 0, overstock: 0 };
    filteredItems.forEach(i => counts[i.stockStatus]++);
    return [
      { name: "Out of Stock", value: counts.out_of_stock },
      { name: "Critical", value: counts.critical },
      { name: "Low Stock", value: counts.low },
      { name: "Healthy", value: counts.healthy },
      { name: "Overstock", value: counts.overstock },
    ].filter(d => d.value > 0);
  }, [filteredItems]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach(i => map.set(i.category || "Other", (map.get(i.category || "Other") || 0) + i.saleAmount));
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredItems]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ---- WHATSAPP SHARE ----
  const handleWhatsAppShare = () => {
    const dateStr = format(dateRange.fromDate, "dd/MM/yyyy");
    const topItems = filteredItems.slice(0, 5).map((i, idx) =>
      `${idx + 1}. ${i.itemDescription} ${i.size} (${i.qtySoldToday} pcs) — ${formatINR(i.saleAmount)}`
    ).join("\n");
    const text = `📊 Daily Sale Report — ${dateStr}\n\nItems Sold: ${summary.totalItems} | Qty: ${summary.totalQty} | Revenue: ${formatINR(summary.totalRevenue)}\n\n🔴 Out of Stock: ${summary.outOfStock} items\n🟡 Reorder Needed: ${summary.reorderNeeded} items\n\nTop Sellers:\n${topItems}\n\nReorder Value: ${formatINR(summary.reorderValue)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  // ---- EXCEL EXPORT ----
  const handleExcelExport = () => {
    const rows = filteredItems.map((i, idx) => ({
      "S.No": idx + 1,
      "Item": i.itemDescription,
      "Size": i.size,
      "Color": i.color,
      "Barcode": i.barcode,
      "Brand": i.brand,
      "Category": i.category,
      "Supplier": i.supplierName,
      "MRP": i.mrp,
      "Sale Rate": i.saleRate,
      "Qty Sold": i.qtySoldToday,
      "Sale Amount": i.saleAmount,
      "Current Stock": i.currentStock,
      "Avg Daily Sale (30d)": i.avgDailySale,
      "Days of Stock Left": i.daysOfStockLeft ?? "∞",
      "Purchase Rate": i.purchaseRate,
      "Margin": i.margin,
      "Margin %": i.marginPercent,
      "Last Purchase Date": i.lastPurchaseDate ? format(new Date(i.lastPurchaseDate), "dd/MM/yyyy") : "",
      "Last Purchase Qty": i.lastPurchaseQty,
      "Reorder Qty": i.reorderQty,
      "Stock Status": STOCK_STATUS_CONFIG[i.stockStatus].label,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Analysis");

    // Supplier summary sheet
    const suppRows = supplierGroups.map(g => ({
      "Supplier": g.name,
      "Items Sold": g.items.reduce((s, i) => s + i.qtySoldToday, 0),
      "Revenue": g.revenue,
      "Items to Reorder": g.reorderCount,
      "Reorder Value": g.items.reduce((s, i) => s + i.reorderQty * i.lastPurchaseRate, 0),
    }));
    const ws2 = XLSX.utils.json_to_sheet(suppRows);
    XLSX.utils.book_append_sheet(wb, ws2, "Supplier Summary");

    XLSX.writeFile(wb, `Daily-Sale-Analysis-${format(dateRange.from, "dd-MM-yyyy")}.xlsx`);
  };

  // ---- PDF EXPORT ----
  const handlePdfExport = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Daily Sale Items — Stock & Reorder Analysis", 14, 15);
    doc.setFontSize(10);
    doc.text(`Date: ${format(dateRange.from, "dd/MM/yyyy")} to ${format(dateRange.to, "dd/MM/yyyy")}`, 14, 22);
    doc.text(`Items: ${summary.totalItems} | Qty: ${summary.totalQty} | Revenue: ${formatINR(summary.totalRevenue)}`, 14, 28);

    let y = 36;
    doc.setFontSize(8);
    const headers = ["#", "Item", "Size", "Barcode", "Supplier", "MRP", "Rate", "Qty", "Amount", "Stock", "Avg/Day", "Days Left", "Reorder", "Status"];
    const colW = [8, 40, 12, 22, 30, 16, 16, 10, 18, 12, 14, 14, 14, 18];
    let x = 14;
    headers.forEach((h, i) => { doc.text(h, x, y); x += colW[i]; });
    y += 5;

    filteredItems.slice(0, 60).forEach((item, idx) => {
      if (y > 190) { doc.addPage(); y = 15; }
      x = 14;
      const row = [
        String(idx + 1), item.itemDescription.substring(0, 22), item.size, item.barcode.substring(0, 12),
        item.supplierName.substring(0, 16), String(item.mrp), String(item.saleRate), String(item.qtySoldToday),
        String(item.saleAmount), String(item.currentStock), String(item.avgDailySale),
        item.daysOfStockLeft !== null ? String(item.daysOfStockLeft) : "∞", String(item.reorderQty),
        STOCK_STATUS_CONFIG[item.stockStatus].label,
      ];
      row.forEach((cell, i) => { doc.text(cell, x, y); x += colW[i]; });
      y += 4.5;
    });

    doc.save(`Daily-Sale-Analysis-${format(dateRange.from, "dd-MM-yyyy")}.pdf`);
  };

  const StockBadge = ({ status }: { status: SaleItemAnalysis["stockStatus"] }) => {
    const cfg = STOCK_STATUS_CONFIG[status];
    return (
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap", cfg.bgClass, cfg.textClass)}>
        {cfg.icon} {cfg.label}
      </span>
    );
  };

  const quickPeriods: { value: QuickPeriod; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "last7", label: "Last 7 Days" },
    { value: "last30", label: "Last 30 Days" },
    { value: "thisMonth", label: "This Month" },
  ];

  const summaryCards = [
    { title: "Items Sold", value: summary.totalItems, icon: Package, accent: "border-l-blue-500", iconBg: "bg-blue-50 dark:bg-blue-900/30" },
    { title: "Total Qty", value: summary.totalQty, icon: ShoppingCart, accent: "border-l-indigo-500", iconBg: "bg-indigo-50 dark:bg-indigo-900/30" },
    { title: "Revenue", value: formatINR(summary.totalRevenue), icon: IndianRupee, accent: "border-l-emerald-500", iconBg: "bg-emerald-50 dark:bg-emerald-900/30" },
    { title: "Out of Stock", value: summary.outOfStock, icon: AlertTriangle, accent: "border-l-red-500", iconBg: "bg-red-50 dark:bg-red-900/30" },
    { title: "Reorder Needed", value: summary.reorderNeeded, icon: TrendingUp, accent: "border-l-amber-500", iconBg: "bg-amber-50 dark:bg-amber-900/30" },
    { title: "Reorder Value", value: formatINR(summary.reorderValue), icon: IndianRupee, accent: "border-l-violet-500", iconBg: "bg-violet-50 dark:bg-violet-900/30" },
  ];

  // Supplier WhatsApp reorder message
  const handleSupplierWhatsApp = (group: typeof supplierGroups[0]) => {
    const reorderItems = group.items.filter(i => i.reorderQty > 0);
    if (reorderItems.length === 0) return;
    const lines = reorderItems.map((i, idx) =>
      `${idx + 1}. ${i.itemDescription} (${i.size}) - ${i.reorderQty} pcs @ ₹${i.lastPurchaseRate}`
    ).join("\n");
    const totalQty = reorderItems.reduce((s, i) => s + i.reorderQty, 0);
    const totalValue = reorderItems.reduce((s, i) => s + i.reorderQty * i.lastPurchaseRate, 0);
    const msg = `Hi ${group.name},\n\nPlease send the following items:\n\n${lines}\n\nTotal: ${totalQty} pcs | Est. Value: ${formatINR(totalValue)}\n\nShop: ${currentOrganization?.name || ""}\nDate: ${format(new Date(), "dd/MM/yyyy")}\n\nThank you!`;
    const phone = group.phone?.replace(/\D/g, "");
    window.open(`https://wa.me/${phone ? `91${phone}` : ""}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobilePageHeader title="Sale Analysis" subtitle="Stock & Reorder" />
        <div className="px-4 space-y-3 pt-3">
          {/* Period chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {quickPeriods.map(p => (
              <button key={p.value} onClick={() => setPeriod(p.value)}
                className={cn("flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all touch-manipulation",
                  period === p.value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                )}>
                {p.label}
              </button>
            ))}
          </div>
          <Input placeholder="Search item, barcode..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-9 text-sm" />

          {/* Mobile summary */}
          <div className="grid grid-cols-3 gap-2">
            {summaryCards.slice(0, 6).map(c => (
              <div key={c.title} className={cn("bg-card rounded-lg p-2.5 border-l-4", c.accent)}>
                <div className="text-[10px] text-muted-foreground">{c.title}</div>
                <div className="text-sm font-bold tabular-nums">{c.value}</div>
              </div>
            ))}
          </div>

          {/* Mobile table */}
          {isLoading ? <TableSkeleton /> : (
            <div className="space-y-2">
              {filteredItems.map((item, idx) => (
                <div key={item.variantId} className="bg-card rounded-lg border p-3 space-y-1" onClick={() => toggleExpand(item.variantId)}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.itemDescription}</div>
                      <div className="text-xs text-muted-foreground">{item.size} | {item.barcode}</div>
                    </div>
                    <StockBadge status={item.stockStatus} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Sold: <b>{item.qtySoldToday}</b></span>
                    <span>Stock: <b>{item.currentStock}</b></span>
                    <span>{formatINR(item.saleAmount)}</span>
                  </div>
                  {expandedRows.has(item.variantId) && (
                    <div className="pt-2 border-t mt-2 space-y-1 text-xs">
                      <div className="grid grid-cols-2 gap-1">
                        <span>Avg/day: {item.avgDailySale}</span>
                        <span>Days left: {item.daysOfStockLeft ?? "∞"}</span>
                        <span>Supplier: {item.supplierName || "-"}</span>
                        <span>Reorder: {item.reorderQty}</span>
                        <span>Margin: {formatINR(item.margin)} ({item.marginPercent}%)</span>
                        <span>Last Pur: {item.lastPurchaseDate ? format(new Date(item.lastPurchaseDate), "dd/MM/yy") : "-"}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {filteredItems.length === 0 && <div className="text-center py-12 text-muted-foreground">No items sold in selected period</div>}
            </div>
          )}
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackToDashboard />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <ClipboardList className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Daily Sale Items — Stock & Reorder Analysis</h1>
              <p className="text-sm text-muted-foreground">Analyze sold items, stock levels, and reorder suggestions</p>
            </div>
          </div>
        </div>
        {isToday && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Updated: {format(lastUpdated, "hh:mm a")}</span>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 px-2">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Quick Period + Filters */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {quickPeriods.map(p => (
            <Button key={p.value} variant={period === p.value ? "default" : "outline"} size="sm"
              onClick={() => setPeriod(p.value)} className="h-8 text-xs">
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search item name, barcode, supplier..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {filterOptions.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {filterOptions.brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Supplier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {filterOptions.suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Stock Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {Object.entries(STOCK_STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExcelExport} className="h-8 text-xs gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handlePdfExport} className="h-8 text-xs gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleWhatsAppShare} className="h-8 text-xs gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" /> Share WhatsApp
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <MetricCardSkeleton key={i} />)}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {summaryCards.map(card => (
            <Card key={card.title} className={cn("border-l-4", card.accent)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{card.title}</p>
                    <p className="text-[22px] font-black tabular-nums leading-tight mt-0.5">{card.value}</p>
                  </div>
                  <div className={cn("p-2 rounded-xl", card.iconBg)}>
                    <card.icon className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-10 bg-muted/60 rounded-xl">
          <TabsTrigger value="itemwise" className="rounded-lg text-sm">Item-wise</TabsTrigger>
          <TabsTrigger value="supplierwise" className="rounded-lg text-sm">Supplier-wise</TabsTrigger>
        </TabsList>

        {/* ITEM-WISE TAB */}
        <TabsContent value="itemwise" className="mt-3">
          {isLoading ? <TableSkeleton /> : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-xs">#</TableHead>
                      <TableHead className="min-w-[200px] text-xs sticky left-0 bg-muted/70 z-10">Item Description</TableHead>
                      <TableHead className="w-16 text-xs">Size</TableHead>
                      <TableHead className="w-28 text-xs">Barcode</TableHead>
                      <TableHead className="w-32 text-xs">Supplier</TableHead>
                      <TableHead className="w-16 text-xs text-right">MRP</TableHead>
                      <TableHead className="w-16 text-xs text-right">Rate</TableHead>
                      <TableHead className="w-14 text-xs text-right">Qty</TableHead>
                      <TableHead className="w-20 text-xs text-right">Amount</TableHead>
                      <TableHead className="w-16 text-xs text-right">Stock</TableHead>
                      <TableHead className="w-16 text-xs text-right">Avg/Day</TableHead>
                      <TableHead className="w-20 text-xs text-right">Days Left</TableHead>
                      <TableHead className="w-24 text-xs">Last Pur</TableHead>
                      <TableHead className="w-16 text-xs text-right">Reorder</TableHead>
                      <TableHead className="w-28 text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={15} className="text-center py-16 text-muted-foreground">
                          No items sold in selected period
                        </TableCell>
                      </TableRow>
                    ) : filteredItems.map((item, idx) => (
                      <>
                        <TableRow key={item.variantId} className="cursor-pointer hover:bg-primary/5" onClick={() => toggleExpand(item.variantId)}>
                          <TableCell className="text-xs tabular-nums">{idx + 1}</TableCell>
                          <TableCell className="text-xs font-medium sticky left-0 bg-card z-10">
                            <div className="flex items-center gap-1.5">
                              {expandedRows.has(item.variantId) ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                              <div>
                                <div className="truncate max-w-[180px]">{item.itemDescription}</div>
                                {item.color && <div className="text-[10px] text-muted-foreground">{item.color}</div>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{item.size}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{item.barcode}</TableCell>
                          <TableCell className="text-xs truncate max-w-[120px]">{item.supplierName || "-"}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{formatINR(item.mrp)}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{formatINR(item.saleRate)}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-semibold">{item.qtySoldToday}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-semibold">{formatINR(item.saleAmount)}</TableCell>
                          <TableCell className={cn("text-xs text-right tabular-nums font-semibold",
                            item.currentStock <= 0 ? "text-red-600" : item.currentStock <= 5 ? "text-orange-600" : ""
                          )}>{item.currentStock}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{item.avgDailySale}</TableCell>
                          <TableCell className={cn("text-xs text-right tabular-nums font-semibold",
                            item.daysOfStockLeft !== null && item.daysOfStockLeft <= 3 ? "text-red-600" :
                            item.daysOfStockLeft !== null && item.daysOfStockLeft <= 7 ? "text-orange-600" : ""
                          )}>{item.daysOfStockLeft !== null ? item.daysOfStockLeft : "∞"}</TableCell>
                          <TableCell className="text-xs">{item.lastPurchaseDate ? format(new Date(item.lastPurchaseDate), "dd/MM/yy") : "-"}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-semibold">{item.reorderQty || "-"}</TableCell>
                          <TableCell><StockBadge status={item.stockStatus} /></TableCell>
                        </TableRow>
                        {expandedRows.has(item.variantId) && (
                          <TableRow>
                            <TableCell colSpan={15} className="bg-muted/20 p-4">
                              <div className="grid grid-cols-4 gap-4 text-xs">
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm flex items-center gap-1.5">📦 Supplier</h4>
                                  <div className="space-y-1">
                                    <div>Name: <b>{item.supplierName || "-"}</b></div>
                                    <div>Last Bill: <b>{item.lastPurchaseBillNo || "-"}</b></div>
                                    <div>Last Date: <b>{item.lastPurchaseDate ? format(new Date(item.lastPurchaseDate), "dd/MM/yyyy") : "-"}</b></div>
                                    <div>Last Qty: <b>{item.lastPurchaseQty}</b></div>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm flex items-center gap-1.5">📊 Sales Velocity</h4>
                                  <div className="space-y-1">
                                    <div>Last 7 days: <b>{item.totalSoldLast7Days} units</b></div>
                                    <div>Last 30 days: <b>{item.totalSoldLast30Days} units</b></div>
                                    <div>Avg/day (30d): <b>{item.avgDailySale} units</b></div>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm flex items-center gap-1.5">💰 Margin Analysis</h4>
                                  <div className="space-y-1">
                                    <div>Purchase Rate: <b>{formatINR(item.purchaseRate)}</b></div>
                                    <div>Sale Rate: <b>{formatINR(item.saleRate)}</b></div>
                                    <div>Margin: <b>{formatINR(item.margin)} ({item.marginPercent}%)</b></div>
                                    <div>MRP: <b>{formatINR(item.mrp)}</b></div>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm flex items-center gap-1.5">📈 Stock Projection</h4>
                                  <div className="space-y-1">
                                    <div>Current Stock: <b>{item.currentStock} units</b></div>
                                    <div>Days Left: <b>{item.daysOfStockLeft !== null ? `~${item.daysOfStockLeft} days` : "∞"}</b></div>
                                    {item.daysOfStockLeft !== null && item.daysOfStockLeft > 0 && (
                                      <div>Stock-out Date: <b>~{format(addDays(new Date(), item.daysOfStockLeft), "dd MMM")}</b></div>
                                    )}
                                    <div>Reorder Qty: <b>{item.reorderQty}</b></div>
                                    <div>Reorder Value: <b>{formatINR(item.reorderQty * item.lastPurchaseRate)}</b></div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filteredItems.length > 0 && (
                <div className="bg-muted/30 border-t px-4 py-2 text-xs text-muted-foreground">
                  Showing {filteredItems.length} items | Total Qty: {summary.totalQty} | Revenue: {formatINR(summary.totalRevenue)}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* SUPPLIER-WISE TAB */}
        <TabsContent value="supplierwise" className="mt-3 space-y-3">
          {isLoading ? <TableSkeleton /> : supplierGroups.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">No data for selected period</div>
          ) : supplierGroups.map(group => (
            <Card key={group.name} className="overflow-hidden">
              <div className="p-4 border-b bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      📦 {group.name}
                      {group.phone && <span className="text-muted-foreground font-normal">| {group.phone}</span>}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Items Sold: {group.items.reduce((s, i) => s + i.qtySoldToday, 0)} | Revenue: {formatINR(group.revenue)} | Reorder: {group.reorderCount} items
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleSupplierWhatsApp(group)}>
                      <MessageSquare className="h-3 w-3" /> WhatsApp Reorders
                    </Button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-xs w-14">Size</TableHead>
                      <TableHead className="text-xs text-right w-12">Sold</TableHead>
                      <TableHead className="text-xs text-right w-16">Stock</TableHead>
                      <TableHead className="text-xs w-24">Status</TableHead>
                      <TableHead className="text-xs text-right w-16">Reorder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map(item => (
                      <TableRow key={item.variantId}>
                        <TableCell className="text-xs font-medium">{item.itemDescription}</TableCell>
                        <TableCell className="text-xs">{item.size}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-semibold">{item.qtySoldToday}</TableCell>
                        <TableCell className={cn("text-xs text-right tabular-nums font-semibold",
                          item.currentStock <= 0 ? "text-red-600" : ""
                        )}>{item.currentStock}</TableCell>
                        <TableCell><StockBadge status={item.stockStatus} /></TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-semibold">{item.reorderQty || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Charts */}
      {!isLoading && filteredItems.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top Sellers */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Top 10 Selling Items</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topSellersData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number) => [`${v} qty`, "Sold"]} />
                  <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Stock Distribution */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Stock Status Distribution</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={stockDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                    dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {stockDistribution.map((_, i) => (
                      <Cell key={i} fill={STATUS_PIE_COLORS[i % STATUS_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Category Sales */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Category-wise Sales</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={categoryData} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => [formatINR(v), "Revenue"]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
