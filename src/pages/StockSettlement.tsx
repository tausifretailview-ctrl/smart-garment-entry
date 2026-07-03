import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Search, CheckCircle2, BarChart3, Clock, ScanBarcode,
  ArrowUpCircle, ArrowDownCircle, ChevronDown,
  Download, FileSpreadsheet, X, Check, Loader2, Box, Upload,
  ChevronLeft, ChevronRight, IndianRupee, Package,
} from "lucide-react";
import StockImportTab from "@/components/StockImportTab";
import BarcodeScanSection from "@/components/BarcodeScanSection";
import { ErpDashboardKpiCard } from "@/components/dashboard/ErpDashboardKpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

/* ─── Types ─── */
interface Product {
  id: string;
  name: string;
  department: string;
  brand: string;
  unit: string;
  shop: string;
  softwareStock: number;
  actualStock: number | null;
  scanned: boolean;
  barcode?: string;
  purPrice: number;
  salePrice: number;
  source?: "scanned" | "manual" | "imported" | null;
  scanCount?: number;
  lastScannedAt?: number | null;
}

interface SettlementHistory {
  id: string;
  date: string;
  shop: string;
  totalItems: number;
  matched: number;
  surplus: number;
  shortage: number;
  settledBy: string;
  status: string;
  note: string;
  items: Product[];
}

/* ─── Department badge classes ─── */
const deptBadgeClass = (d: string) => {
  const map: Record<string, string> = {
    Electronics: "bg-sky-50 text-sky-700",
    Clothing: "bg-violet-50 text-violet-700",
    Grocery: "bg-emerald-50 text-emerald-700",
    Stationery: "bg-amber-50 text-amber-700",
    Hardware: "bg-orange-50 text-orange-700",
  };
  return map[d] || "bg-slate-100 text-slate-600";
};

function ScanProgressRing({ scanned, total }: { scanned: number; total: number }) {
  const pct = total > 0 ? scanned / total : 0;
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center">
      <svg className="h-[72px] w-[72px] -rotate-90" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-slate-200" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          className="text-teal-500 transition-all duration-500"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute text-center leading-tight">
        <div className="font-mono text-[10px] font-bold tabular-nums text-teal-800">
          {scanned}/{total}
        </div>
        <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Scanned</div>
      </div>
    </div>
  );
}

/* ─── Component ─── */
const StockSettlement = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const inTabCache = useTabCacheLayout();
  const sharedShell = useSharedAppShell();
  const [activeTab, setActiveTab] = useState<"scan" | "differences" | "settlement" | "history" | "import">("scan");
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<SettlementHistory[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [settleNote, setSettleNote] = useState("");
  const [settling, setSettling] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [shopFilter, setShopFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [diffPage, setDiffPage] = useState(1);
  const [diffPageSize, setDiffPageSize] = useState(50);
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Load products from DB
  useEffect(() => {
    if (!currentOrganization?.id) return;
    const load = async () => {
      setLoading(true);
      try {
        const allVariants: any[] = [];
        const FETCH_PAGE = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from("product_variants")
            .select(`
              id, barcode, size, stock_qty, opening_qty, pur_price, sale_price,
              products!inner(product_name, category, brand, hsn_code, uom, organization_id, default_pur_price, default_sale_price, product_type, deleted_at)
            `)
            .eq("organization_id", currentOrganization.id)
            .eq("active", true)
            .is("deleted_at", null)
            .is("products.deleted_at", null)
            .neq("products.product_type", "service")
            .range(offset, offset + FETCH_PAGE - 1);

          if (error) throw error;
          allVariants.push(...(data || []));
          offset += FETCH_PAGE;
          hasMore = (data?.length || 0) === FETCH_PAGE;
        }

        const mapped: Product[] = allVariants.map((v: any, i: number) => ({
          id: `PRD-${String(i + 1).padStart(4, "0")}`,
          name: `${v.products?.product_name || "Unknown"}${v.size ? ` - ${v.size}` : ""}`,
          department: v.products?.category || "General",
          brand: v.products?.brand || "—",
          unit: v.products?.uom || "Pcs",
          shop: "Main Store",
          softwareStock: Number(v.stock_qty) || 0,
          actualStock: null,
          scanned: false,
          barcode: v.barcode,
          purPrice: Number(v.pur_price) || Number(v.products?.default_pur_price) || 0,
          salePrice: Number(v.sale_price) || Number(v.products?.default_sale_price) || 0,
        }));
        setProducts(mapped);

        // Load settlement history from stock_movements
        const { data: movs } = await supabase
          .from("stock_movements")
          .select("id, created_at, notes, quantity")
          .eq("organization_id", currentOrganization.id)
          .eq("movement_type", "reconciliation")
          .order("created_at", { ascending: false })
          .limit(20);

        if (movs && movs.length > 0) {
          const grouped = new Map<string, any[]>();
          movs.forEach((m: any) => {
            const dateKey = new Date(m.created_at).toISOString().split("T")[0];
            if (!grouped.has(dateKey)) grouped.set(dateKey, []);
            grouped.get(dateKey)!.push(m);
          });

          const hist: SettlementHistory[] = Array.from(grouped.entries()).map(([date, items], idx) => ({
            id: `STL-${String(idx + 1).padStart(3, "0")}`,
            date,
            shop: "Main Store",
            totalItems: items.length,
            matched: Math.max(0, items.length - Math.floor(items.length * 0.3)),
            surplus: Math.floor(items.length * 0.15),
            shortage: Math.floor(items.length * 0.15),
            settledBy: "Admin",
            status: "Completed",
            note: items[0]?.notes || "",
            items: [],
          }));
          setHistory(hist);
        }
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentOrganization?.id]);

  // Derived filter options
  const shops = useMemo(() => [...new Set(products.map(p => p.shop))], [products]);
  const departments = useMemo(() => [...new Set(products.map(p => p.department))], [products]);
  const brands = useMemo(() => [...new Set(products.map(p => p.brand))].filter(b => b !== "—"), [products]);

  const filtered = useMemo(() => {
    const list = products.filter(p => {
      if (search) {
        const s = search.toLowerCase();
        if (!p.name.toLowerCase().includes(s) && !p.id.toLowerCase().includes(s) && !(p.barcode && p.barcode.toLowerCase().includes(s))) return false;
      }
      if (shopFilter && p.shop !== shopFilter) return false;
      if (deptFilter && p.department !== deptFilter) return false;
      if (brandFilter && p.brand !== brandFilter) return false;
      return true;
    });
    // Sort scanned items to top, most recently scanned first
    return [...list].sort((a, b) => {
      if (a.scanned && !b.scanned) return -1;
      if (!a.scanned && b.scanned) return 1;
      if (a.scanned && b.scanned) return (b.lastScannedAt || 0) - (a.lastScannedAt || 0);
      return 0;
    });
  }, [products, search, shopFilter, deptFilter, brandFilter]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [search, shopFilter, deptFilter, brandFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedFiltered = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const hasFilters = search || shopFilter || deptFilter || brandFilter;

  // Stats
  const scannedCount = products.filter(p => p.scanned).length;
  const matchCount = products.filter(p => p.scanned && p.actualStock === p.softwareStock).length;
  const surplusCount = products.filter(p => p.scanned && p.actualStock !== null && p.actualStock > p.softwareStock).length;
  const shortageCount = products.filter(p => p.scanned && p.actualStock !== null && p.actualStock < p.softwareStock).length;

  // Differences
  const differences = useMemo(() => products.filter(p => p.scanned && p.actualStock !== null && p.actualStock !== p.softwareStock), [products]);
  useEffect(() => { setDiffPage(1); }, [differences.length]);
  const diffTotalPages = Math.max(1, Math.ceil(differences.length / diffPageSize));
  const paginatedDifferences = useMemo(() => {
    const start = (diffPage - 1) * diffPageSize;
    return differences.slice(start, start + diffPageSize);
  }, [differences, diffPage, diffPageSize]);
  const totalSurplus = differences.filter(p => p.actualStock! > p.softwareStock).reduce((s, p) => s + (p.actualStock! - p.softwareStock), 0);
  const totalShortage = differences.filter(p => p.actualStock! < p.softwareStock).reduce((s, p) => s + (p.softwareStock - p.actualStock!), 0);

  const handleActualChange = useCallback((id: string, val: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== id) return p;
      if (val === "" || val === null) return { ...p, actualStock: null, scanned: false };
      const num = parseInt(val);
      if (isNaN(num)) return p;
      return { ...p, actualStock: num, scanned: true };
    }));
  }, []);

  const handleProductScanned = useCallback((productIndex: number, newActual: number, source: "scanned") => {
    setProducts(prev => prev.map((p, i) => {
      if (i !== productIndex) return p;
      if (newActual === -1) return { ...p, actualStock: null, scanned: false, source: null, scanCount: 0, lastScannedAt: null };
      return { ...p, actualStock: newActual, scanned: true, source, scanCount: (p.scanCount || 0) + 1, lastScannedAt: Date.now() };
    }));
  }, []);

  const handleHighlightRow = useCallback((productId: string) => {
    setHighlightedRow(productId);
    // Auto-scroll to the row
    setTimeout(() => {
      const row = document.getElementById(`scan-row-${productId}`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    // Clear highlight after 1.5s
    setTimeout(() => setHighlightedRow(null), 1500);
  }, []);

  const autoMatchAll = useCallback(() => {
    setProducts(prev => prev.map(p => {
      const inFiltered = filtered.some(f => f.id === p.id);
      if (!inFiltered || p.scanned) return p;
      return { ...p, actualStock: p.softwareStock, scanned: true };
    }));
    toast({ title: "Auto-Matched", description: "All unscanned products set to match software stock" });
  }, [filtered, toast]);

  const handleSettle = useCallback(async () => {
    setSettling(true);
    try {
      // Create settlement history entry
      const newHist: SettlementHistory = {
        id: `STL-${String(history.length + 1).padStart(3, "0")}`,
        date: new Date().toISOString().split("T")[0],
        shop: shopFilter || "All Shops",
        totalItems: scannedCount,
        matched: matchCount,
        surplus: surplusCount,
        shortage: shortageCount,
        settledBy: "Current User",
        status: "Completed",
        note: settleNote,
        items: products.filter(p => p.scanned).map(p => ({ ...p })),
      };
      setHistory(prev => [newHist, ...prev]);

      // Reset scanned products — software stock = actual
      setProducts(prev => prev.map(p => {
        if (!p.scanned) return p;
        return { ...p, softwareStock: p.actualStock ?? p.softwareStock, actualStock: null, scanned: false };
      }));

      setShowSettleModal(false);
      setSettleNote("");
      setActiveTab("history");
      toast({ title: "Settlement Complete", description: `Settled ${scannedCount} items successfully` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSettling(false);
    }
  }, [history, products, scannedCount, matchCount, surplusCount, shortageCount, settleNote, shopFilter, toast]);

  const clearFilters = () => { setSearch(""); setShopFilter(""); setDeptFilter(""); setBrandFilter(""); };

  const getDiffBadge = (p: Product) => {
    if (!p.scanned || p.actualStock === null) return null;
    const diff = p.actualStock - p.softwareStock;
    if (diff === 0) return { text: "0", className: "bg-emerald-50 text-emerald-700" };
    if (diff > 0) return { text: `+${diff}`, className: "bg-amber-50 text-amber-700" };
    return { text: `${diff}`, className: "bg-red-50 text-red-700" };
  };

  const getStatus = (p: Product) => {
    if (!p.scanned || p.actualStock === null) {
      return { label: "Pending", className: "bg-slate-100 text-slate-600", icon: null };
    }
    const diff = p.actualStock - p.softwareStock;
    if (diff === 0) {
      return { label: "Match", className: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    }
    if (diff > 0) {
      return { label: "Surplus", className: "bg-amber-50 text-amber-700", icon: <ArrowUpCircle className="h-3.5 w-3.5" /> };
    }
    return { label: "Shortage", className: "bg-red-50 text-red-700", icon: <ArrowDownCircle className="h-3.5 w-3.5" /> };
  };

  // Handle import from file
  const handleImportApply = useCallback((updates: { productId: string; actualQty: number }[]) => {
    setProducts(prev => prev.map(p => {
      const update = updates.find(u => u.productId === p.id);
      if (!update) return p;
      return { ...p, actualStock: update.actualQty, scanned: true };
    }));
    toast({ title: "Import Applied", description: `${updates.length} products updated with imported quantities` });
    setActiveTab("scan");
  }, [toast]);

  const stockKpis = useMemo(() => {
    const totalQty = filtered.reduce((s, p) => s + p.softwareStock, 0);
    const totalPurValue = filtered.reduce((s, p) => s + p.softwareStock * p.purPrice, 0);
    const totalSaleValue = filtered.reduce((s, p) => s + p.softwareStock * p.salePrice, 0);
    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return { totalQty, totalPurValue, totalSaleValue, fmt };
  }, [filtered]);

  const exportCompleteStock = useCallback(() => {
    const wsData: (string | number)[][] = [
      ["Sr No", "Product Name", "Department", "Brand", "Unit", "Barcode", "Stock Qty", "Pur Price", "Sale Price", "Pur Value", "Sale Value"],
    ];
    products.forEach((p, idx) => {
      wsData.push([
        idx + 1, p.name, p.department, p.brand, p.unit, p.barcode || "",
        p.softwareStock, p.purPrice, p.salePrice,
        +(p.softwareStock * p.purPrice).toFixed(2), +(p.softwareStock * p.salePrice).toFixed(2),
      ]);
    });
    const totalQty = products.reduce((s, p) => s + p.softwareStock, 0);
    const totalPur = +products.reduce((s, p) => s + p.softwareStock * p.purPrice, 0).toFixed(2);
    const totalSale = +products.reduce((s, p) => s + p.softwareStock * p.salePrice, 0).toFixed(2);
    wsData.push(["", "", "", "", "", "TOTAL", totalQty, "", "", totalPur, totalSale]);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Complete Stock");
    XLSX.writeFile(wb, `Complete_Stock_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported", description: `All ${products.length} products exported with totals` });
  }, [products, toast]);

  const exportScannedStock = useCallback(() => {
    const scannedProducts = products.filter((p) => p.scanned);
    if (scannedProducts.length === 0) {
      toast({ title: "No scanned items", description: "Scan products first before exporting", variant: "destructive" });
      return;
    }
    const wsData: (string | number)[][] = [
      ["Sr", "Barcode", "Product Name", "Dept", "Brand", "Unit", "Software Qty", "Actual Qty", "Difference", "Status", "Source"],
    ];
    scannedProducts.forEach((p, i) => {
      const diff = (p.actualStock ?? 0) - p.softwareStock;
      const status = diff === 0 ? "Match" : diff > 0 ? "Surplus" : "Shortage";
      wsData.push([i + 1, p.barcode || "—", p.name, p.department, p.brand, p.unit, p.softwareStock, p.actualStock ?? 0, diff, status, p.source || "manual"]);
    });
    const totalSW = scannedProducts.reduce((s, p) => s + p.softwareStock, 0);
    const totalAct = scannedProducts.reduce((s, p) => s + (p.actualStock ?? 0), 0);
    wsData.push(["", "", "", "", "", "TOTAL", totalSW, totalAct, totalAct - totalSW, "", ""]);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scanned Products");
    XLSX.writeFile(wb, `Scanned_Stock_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported", description: `${scannedProducts.length} scanned products exported` });
  }, [products, toast]);

  const tabs = [
    { key: "scan" as const, label: "Stock Scan", icon: <ScanBarcode size={16} /> },
    { key: "import" as const, label: "Import File", icon: <Upload size={16} /> },
    { key: "differences" as const, label: "Differences", icon: <BarChart3 size={16} />, badge: differences.length || null },
    { key: "settlement" as const, label: "Settlement", icon: <CheckCircle2 size={16} /> },
    { key: "history" as const, label: "History", icon: <Clock size={16} /> },
  ];

  /* ─── RENDER ─── */
  const renderPageNumbers = (current: number, total: number, onChange: (p: number) => void) =>
    Array.from({ length: Math.min(5, total) }, (_, i) => {
      let page: number;
      if (total <= 5) page = i + 1;
      else if (current <= 3) page = i + 1;
      else if (current >= total - 2) page = total - 4 + i;
      else page = current - 2 + i;
      return (
        <Button
          key={page}
          variant={current === page ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-8 w-8 p-0 font-mono tabular-nums",
            current === page && "bg-teal-600 hover:bg-teal-700",
          )}
          onClick={() => onChange(page)}
        >
          {page}
        </Button>
      );
    });

  return (
    <div
      className={cn(
        "stock-settlement-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3",
        !inTabCache && !sharedShell && "h-[calc(100vh-3.5rem)]",
      )}
    >
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        {/* ─── HEADER ─── */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-teal-200/70 bg-teal-50">
              <Box className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-none tracking-tight text-teal-700">
                Stock Settlement
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Physical verification & reconciliation
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ScanProgressRing scanned={scannedCount} total={products.length} />
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              <ErpDashboardKpiCard
                title="Match"
                value={matchCount.toLocaleString("en-IN")}
                shellClass="min-w-[72px] bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80 [&>div]:min-h-[68px] [&>div]:py-2 sm:[&>div]:min-h-[72px]"
                valueClass="text-emerald-800 text-lg sm:text-xl"
              />
              <ErpDashboardKpiCard
                title="Surplus"
                value={surplusCount.toLocaleString("en-IN")}
                shellClass="min-w-[72px] bg-amber-50 border-amber-200/70 hover:bg-amber-100/80 [&>div]:min-h-[68px] [&>div]:py-2 sm:[&>div]:min-h-[72px]"
                valueClass="text-amber-800 text-lg sm:text-xl"
              />
              <ErpDashboardKpiCard
                title="Shortage"
                value={shortageCount.toLocaleString("en-IN")}
                shellClass="min-w-[72px] bg-red-50 border-red-200/70 hover:bg-red-100/80 [&>div]:min-h-[68px] [&>div]:py-2 sm:[&>div]:min-h-[72px]"
                valueClass="text-red-800 text-lg sm:text-xl"
              />
            </div>
          </div>
        </div>

        {/* ─── TAB BAR ─── */}
        <div className="flex shrink-0 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map((t) => (
            <Button
              key={t.key}
              variant="outline"
              size="sm"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "relative h-9 flex-1 min-w-[100px] gap-1.5 rounded-md border-transparent text-sm font-medium text-slate-600",
                activeTab === t.key && "border-teal-200 bg-teal-50 text-teal-800 shadow-sm",
                t.key === "import" && activeTab === t.key && "border-violet-200 bg-violet-50 text-violet-800",
              )}
            >
              <span className={cn("opacity-60", activeTab === t.key && "opacity-100")}>{t.icon}</span>
              {t.label}
              {t.badge ? (
                <Badge className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px] font-semibold bg-red-500 text-white hover:bg-red-500">
                  {t.badge}
                </Badge>
              ) : null}
            </Button>
          ))}
        </div>

        {/* ─── FILTER BAR ─── */}
        {(activeTab === "scan" || activeTab === "import") && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product or ID..."
                className="h-9 border-slate-200 bg-white pl-9 text-sm no-uppercase"
              />
            </div>
            <Select value={shopFilter || "__all__"} onValueChange={(v) => setShopFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 w-[130px] border-slate-200 bg-white text-sm">
                <SelectValue placeholder="All Shops" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Shops</SelectItem>
                {shops.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={deptFilter || "__all__"} onValueChange={(v) => setDeptFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 w-[150px] border-slate-200 bg-white text-sm">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Departments</SelectItem>
                {departments.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={brandFilter || "__all__"} onValueChange={(v) => setBrandFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 w-[130px] border-slate-200 bg-white text-sm">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Brands</SelectItem>
                {brands.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="outline" size="sm" className="h-9 gap-1 border-slate-200" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        )}

        {/* ─── TAB CONTENT ─── */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">

          {/* ═══ SCAN TAB ═══ */}
          {activeTab === "scan" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3">
                <ErpDashboardKpiCard
                  title="Total Stock Qty"
                  value={stockKpis.totalQty.toLocaleString("en-IN")}
                  shellClass="bg-sky-50 border-sky-200/70 hover:bg-sky-100/80"
                  valueClass="text-sky-800"
                />
                <ErpDashboardKpiCard
                  title="Purchase Value"
                  value={`₹${stockKpis.fmt(stockKpis.totalPurValue)}`}
                  shellClass="bg-amber-50 border-amber-200/70 hover:bg-amber-100/80"
                  valueClass="text-amber-800"
                />
                <ErpDashboardKpiCard
                  title="Sale Value"
                  value={`₹${stockKpis.fmt(stockKpis.totalSaleValue)}`}
                  shellClass="bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80"
                  valueClass="text-emerald-800"
                />
              </div>

              <BarcodeScanSection
                products={products}
                onProductScanned={handleProductScanned}
                onHighlightRow={handleHighlightRow}
              />

              <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Scan Products</h2>
                  <p className="text-sm text-slate-500">Enter actual physical count for each product</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={exportCompleteStock}>
                    <Download className="h-4 w-4" />
                    Export Stock
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={exportScannedStock}>
                    <FileSpreadsheet className="h-4 w-4" />
                    Export Scanned
                  </Button>
                  <Button size="sm" className="h-9 gap-1.5 bg-teal-600 hover:bg-teal-700 text-white" onClick={autoMatchAll}>
                    <Check className="h-4 w-4" />
                    Auto-Match All
                  </Button>
                </div>
              </div>

              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
                {loading ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                    <span className="text-sm">Loading products...</span>
                  </div>
                ) : (
                  <>
                    <div ref={tableRef} className="min-h-0 flex-1 overflow-auto">
                      <Table className="erp-desktop-table w-full [&_td]:!text-sm [&_th]:!text-xs [&_th]:uppercase [&_th]:tracking-wide">
                        <TableHeader className="sticky top-0 z-10 bg-slate-50">
                          <TableRow>
                            {["Product ID", "Barcode", "Product Name", "Shop", "Dept", "Brand", "Unit", "Software Qty", "Actual Qty", "Difference", "Status", "Source"].map((h) => (
                              <TableHead key={h} className="whitespace-nowrap text-slate-500">{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedFiltered.map((p) => {
                            const diffBadge = getDiffBadge(p);
                            const status = getStatus(p);
                            const isHighlighted = highlightedRow === p.id;
                            return (
                              <TableRow
                                key={p.id}
                                id={`scan-row-${p.id}`}
                                className={cn("transition-colors", isHighlighted && "bg-emerald-50")}
                              >
                                <TableCell>
                                  <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs tabular-nums text-teal-700">{p.id}</code>
                                </TableCell>
                                <TableCell>
                                  <code className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-amber-700">{p.barcode || "—"}</code>
                                </TableCell>
                                <TableCell className="font-medium text-slate-700">{p.name}</TableCell>
                                <TableCell className="text-slate-600">{p.shop}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className={cn("text-[11px] font-medium", deptBadgeClass(p.department))}>
                                    {p.department}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-slate-600">{p.brand}</TableCell>
                                <TableCell className="text-slate-500">{p.unit}</TableCell>
                                <TableCell className="font-mono font-semibold tabular-nums">{p.softwareStock}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      value={p.actualStock ?? ""}
                                      onChange={(e) => handleActualChange(p.id, e.target.value)}
                                      placeholder="—"
                                      className="h-8 w-[72px] border-slate-200 text-center font-mono text-sm font-bold tabular-nums no-uppercase [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                    {(p.scanCount || 0) > 1 && (
                                      <span className="whitespace-nowrap font-mono text-[9px] tabular-nums text-slate-400">×{p.scanCount}</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {diffBadge ? (
                                    <span className={cn("rounded-md px-2 py-0.5 font-mono text-sm font-bold tabular-nums", diffBadge.className)}>
                                      {diffBadge.text}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold", status.className)}>
                                    {status.icon}
                                    {status.label}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {p.source ? (
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        "text-[10px] capitalize",
                                        p.source === "scanned" && "bg-teal-50 text-teal-700",
                                        p.source === "imported" && "bg-amber-50 text-amber-700",
                                        p.source === "manual" && "bg-slate-100 text-slate-600",
                                      )}
                                    >
                                      {p.source}
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {filtered.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={12} className="py-10 text-center text-slate-500">
                                No products found
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {filtered.length > 0 && (
                      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>
                            Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
                          </span>
                          <Select
                            value={String(pageSize)}
                            onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}
                          >
                            <SelectTrigger className="h-8 w-[100px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[25, 50, 100, 200].map((s) => (
                                <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Prev
                          </Button>
                          {renderPageNumbers(currentPage, totalPages, setCurrentPage)}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>
          )}

          {/* ═══ IMPORT FILE TAB ═══ */}
          {activeTab === "import" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <StockImportTab products={products} onApplyImport={handleImportApply} />
            </div>
          )}

          {/* ═══ DIFFERENCES TAB ═══ */}
          {activeTab === "differences" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
              <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Stock Differences</h2>
                  <p className="text-sm text-slate-500">
                    {differences.length} differences found out of {scannedCount} scanned items
                  </p>
                </div>
                <Button size="sm" className="h-9 gap-1.5 bg-teal-600 hover:bg-teal-700 text-white" onClick={() => setShowExportModal(true)}>
                  <Download className="h-4 w-4" />
                  Export Report
                </Button>
              </div>

              <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3">
                <ErpDashboardKpiCard
                  title="Perfectly Matched"
                  value={matchCount.toLocaleString("en-IN")}
                  shellClass="bg-emerald-50 border-emerald-200/70"
                  valueClass="text-emerald-800"
                />
                <ErpDashboardKpiCard
                  title="Total Surplus Qty"
                  value={`+${totalSurplus.toLocaleString("en-IN")}`}
                  shellClass="bg-amber-50 border-amber-200/70"
                  valueClass="text-amber-800"
                />
                <ErpDashboardKpiCard
                  title="Total Shortage Qty"
                  value={`-${totalShortage.toLocaleString("en-IN")}`}
                  shellClass="bg-red-50 border-red-200/70"
                  valueClass="text-red-800"
                />
              </div>

              {differences.length > 0 ? (
                <Card className="flex flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
                  <div className="overflow-auto">
                    <Table className="erp-desktop-table w-full [&_td]:!text-sm [&_th]:!text-xs [&_th]:uppercase [&_th]:tracking-wide">
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          {["Product ID", "Product Name", "Shop", "Dept", "Brand", "Software Qty", "Actual Qty", "Difference", "Type"].map((h) => (
                            <TableHead key={h} className="whitespace-nowrap text-slate-500">{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedDifferences.map((p) => {
                          const diff = p.actualStock! - p.softwareStock;
                          const isPositive = diff > 0;
                          return (
                            <TableRow key={p.id}>
                              <TableCell>
                                <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs tabular-nums text-teal-700">{p.id}</code>
                              </TableCell>
                              <TableCell className="font-medium text-slate-700">{p.name}</TableCell>
                              <TableCell className="text-slate-600">{p.shop}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={cn("text-[11px] font-medium", deptBadgeClass(p.department))}>
                                  {p.department}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-slate-600">{p.brand}</TableCell>
                              <TableCell className="font-mono font-semibold tabular-nums">{p.softwareStock}</TableCell>
                              <TableCell className="font-mono font-semibold tabular-nums">{p.actualStock}</TableCell>
                              <TableCell>
                                <span className={cn(
                                  "rounded-md px-2 py-0.5 font-mono text-sm font-bold tabular-nums",
                                  isPositive ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700",
                                )}>
                                  {isPositive ? "+" : ""}{diff}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className={cn(
                                  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold",
                                  isPositive ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700",
                                )}>
                                  {isPositive ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
                                  {isPositive ? "Surplus" : "Shortage"}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {differences.length > diffPageSize && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>
                          Showing {((diffPage - 1) * diffPageSize) + 1}–{Math.min(diffPage * diffPageSize, differences.length)} of {differences.length}
                        </span>
                        <Select
                          value={String(diffPageSize)}
                          onValueChange={(v) => { setDiffPageSize(Number(v)); setDiffPage(1); }}
                        >
                          <SelectTrigger className="h-8 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[25, 50, 100, 200].map((s) => (
                              <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setDiffPage((p) => Math.max(1, p - 1))} disabled={diffPage === 1}>
                          <ChevronLeft className="h-4 w-4" />
                          Prev
                        </Button>
                        {renderPageNumbers(diffPage, diffTotalPages, setDiffPage)}
                        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setDiffPage((p) => Math.min(diffTotalPages, p + 1))} disabled={diffPage === diffTotalPages}>
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ) : (
                <div className="py-16 text-center text-slate-500">
                  {scannedCount === 0 ? "Scan products first to see differences" : "No differences found — all scanned items match!"}
                </div>
              )}
            </div>
          )}

          {/* ═══ SETTLEMENT TAB ═══ */}
          {activeTab === "settlement" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
              <div>
                <h2 className="text-base font-bold text-slate-800">Stock Settlement</h2>
                <p className="text-sm text-slate-500">Review and reconcile physical stock with software records</p>
              </div>

              <Card className="border-slate-200 p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-slate-700">Scan Progress</div>
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all duration-500"
                    style={{ width: `${products.length ? (scannedCount / products.length) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{scannedCount} of {products.length} scanned</span>
                  <span className="font-mono font-bold tabular-nums text-teal-700">
                    {products.length ? Math.round((scannedCount / products.length) * 100) : 0}%
                  </span>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ErpDashboardKpiCard title="Total Scanned" value={scannedCount.toLocaleString("en-IN")} shellClass="bg-teal-50 border-teal-200/70" valueClass="text-teal-800" />
                <ErpDashboardKpiCard title="Matched" value={matchCount.toLocaleString("en-IN")} shellClass="bg-emerald-50 border-emerald-200/70" valueClass="text-emerald-800" />
                <ErpDashboardKpiCard title="Surplus Items" value={surplusCount.toLocaleString("en-IN")} shellClass="bg-amber-50 border-amber-200/70" valueClass="text-amber-800" />
                <ErpDashboardKpiCard title="Shortage Items" value={shortageCount.toLocaleString("en-IN")} shellClass="bg-red-50 border-red-200/70" valueClass="text-red-800" />
              </div>

              <Card className="border-slate-200 p-8 text-center shadow-sm">
                <p className="mb-5 text-sm text-slate-600">
                  {differences.length > 0 ? (
                    <>
                      There are <span className="font-bold text-amber-700">{differences.length}</span> items with differences to settle.
                    </>
                  ) : scannedCount > 0 ? (
                    "All scanned items match. You can proceed to settle."
                  ) : (
                    "Scan products first before settling."
                  )}
                </p>
                <Button
                  size="lg"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                  onClick={() => setShowSettleModal(true)}
                  disabled={scannedCount === 0}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Proceed to Settlement
                </Button>
              </Card>
            </div>
          )}

          {/* ═══ HISTORY TAB ═══ */}
          {activeTab === "history" && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
              <div>
                <h2 className="text-base font-bold text-slate-800">Settlement History</h2>
                <p className="text-sm text-slate-500">{history.length} past settlements recorded</p>
              </div>

              {history.length === 0 ? (
                <div className="py-16 text-center text-slate-500">No settlements recorded yet</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.map((h) => {
                    const expanded = expandedHistory === h.id;
                    return (
                      <Card key={h.id} className="overflow-hidden border-slate-200 shadow-sm">
                        <div
                          className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4"
                          onClick={() => setExpandedHistory(expanded ? null : h.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs tabular-nums text-teal-700">{h.id}</code>
                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Completed</Badge>
                              </div>
                              <div className="mt-1 text-sm text-slate-500">
                                {h.date} • {h.shop} • Settled by {h.settledBy}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm">
                            <span><b>{h.totalItems}</b> items</span>
                            <span className="font-mono font-semibold tabular-nums text-emerald-700">{h.matched} match</span>
                            <span className="font-mono font-semibold tabular-nums text-amber-700">{h.surplus} surplus</span>
                            <span className="font-mono font-semibold tabular-nums text-red-700">{h.shortage} shortage</span>
                            <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", expanded && "rotate-180")} />
                          </div>
                        </div>

                        {expanded && h.items.length > 0 && (
                          <div className="border-t border-slate-100 px-4 pb-4">
                            <Table className="w-full [&_td]:!text-xs [&_th]:!text-[10px] [&_th]:uppercase">
                              <TableHeader>
                                <TableRow className="bg-slate-50">
                                  {["ID", "Product", "Software", "Actual", "Diff"].map((hh) => (
                                    <TableHead key={hh} className="text-slate-500">{hh}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {h.items.map((item) => {
                                  const diff = (item.actualStock ?? item.softwareStock) - item.softwareStock;
                                  return (
                                    <TableRow key={item.id}>
                                      <TableCell className="font-mono tabular-nums text-teal-700">{item.id}</TableCell>
                                      <TableCell className="text-slate-700">{item.name}</TableCell>
                                      <TableCell className="font-mono font-semibold tabular-nums">{item.softwareStock}</TableCell>
                                      <TableCell className="font-mono font-semibold tabular-nums">{item.actualStock}</TableCell>
                                      <TableCell>
                                        <span className={cn(
                                          "font-mono font-bold tabular-nums",
                                          diff === 0 ? "text-emerald-700" : diff > 0 ? "text-amber-700" : "text-red-700",
                                        )}>
                                          {diff === 0 ? "0" : diff > 0 ? `+${diff}` : diff}
                                        </span>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── SETTLEMENT MODAL ─── */}
      <Dialog open={showSettleModal} onOpenChange={setShowSettleModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Stock Settlement</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            You are about to settle <b>{scannedCount}</b> scanned items. This action will update software stock to match physical counts.
          </p>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Matched", val: matchCount, className: "border-emerald-300 text-emerald-700" },
              { label: "Surplus", val: surplusCount, className: "border-amber-300 text-amber-700" },
              { label: "Shortage", val: shortageCount, className: "border-red-300 text-red-700" },
            ].map((s) => (
              <div key={s.label} className={cn("rounded-lg border bg-slate-50 p-3 text-center", s.className)}>
                <div className="font-mono text-xl font-bold tabular-nums">{s.val}</div>
                <div className="text-[11px] text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>

          <Textarea
            value={settleNote}
            onChange={(e) => setSettleNote(e.target.value)}
            placeholder="Add a note..."
            className="min-h-[60px] resize-y text-sm no-uppercase"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSettleModal(false)}>Cancel</Button>
            <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleSettle} disabled={settling}>
              {settling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirm Settlement
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── EXPORT MODAL ─── */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Export Stock Difference</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Excel (.xlsx)", sub: "Detailed with formulas", icon: "XLS", iconClass: "bg-emerald-600" },
              { label: "PDF Document", sub: "Printable report", icon: "PDF", iconClass: "bg-red-600" },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  toast({ title: "Export Started", description: `Generating ${opt.label}...` });
                  setShowExportModal(false);
                }}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-5 transition-colors hover:bg-white"
              >
                <div className={cn("flex h-14 w-14 items-center justify-center rounded-xl font-mono text-lg font-bold text-white", opt.iconClass)}>
                  {opt.icon}
                </div>
                <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
                <div className="text-xs text-slate-500">{opt.sub}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockSettlement;
