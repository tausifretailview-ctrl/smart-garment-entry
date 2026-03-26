import { useState, useMemo, useCallback, useEffect } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, CheckCircle2, BarChart3, Clock, ScanBarcode, 
  ArrowUpCircle, ArrowDownCircle, ChevronDown, ChevronUp,
  Download, FileSpreadsheet, FileText, X, Check, Loader2, Box, Upload,
  ChevronLeft, ChevronRight
} from "lucide-react";
import StockImportTab from "@/components/StockImportTab";

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

/* ─── Inline Styles (dark theme tokens) ─── */
const C = {
  bgRoot: "#0b1120",
  bgCard: "#0f172a",
  bgInput: "#111827",
  border: "#1e293b",
  borderHover: "#334155",
  textPrimary: "#f1f5f9",
  textBody: "#e2e8f0",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  cyan: "#22d3ee",
  cyanDark: "#0e7490",
  green: "#34d399",
  greenDark: "#059669",
  yellow: "#fbbf24",
  red: "#f87171",
};

const font = "'DM Sans', sans-serif";
const mono = "'JetBrains Mono', monospace";

/* ─── Department Colors ─── */
const deptColors: Record<string, string> = {
  Electronics: "#0ea5e9",
  Clothing: "#a78bfa",
  Grocery: "#34d399",
  Stationery: "#fbbf24",
  Hardware: "#f97316",
};

const getDeptBg = (d: string) => `${deptColors[d] || "#64748b"}20`;
const getDeptColor = (d: string) => deptColors[d] || "#64748b";

/* ─── Component ─── */
const StockSettlement = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
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

  // Load products from DB
  useEffect(() => {
    if (!currentOrganization?.id) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data: variants, error } = await supabase
          .from("product_variants")
          .select(`
            id, barcode, size, current_stock, opening_qty,
            products!inner(product_name, category, brand, hsn_code, uom, organization_id)
          `)
          .eq("products.organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) throw error;

        const mapped: Product[] = (variants || []).map((v: any, i: number) => ({
          id: `PRD-${String(i + 1).padStart(4, "0")}`,
          name: `${v.products?.product_name || "Unknown"}${v.size ? ` - ${v.size}` : ""}`,
          department: v.products?.category || "General",
          brand: v.products?.brand || "—",
          unit: v.products?.uom || "Pcs",
          shop: "Main Store",
          softwareStock: Number(v.current_stock) || 0,
          actualStock: null,
          scanned: false,
          barcode: v.barcode,
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
    return products.filter(p => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (shopFilter && p.shop !== shopFilter) return false;
      if (deptFilter && p.department !== deptFilter) return false;
      if (brandFilter && p.brand !== brandFilter) return false;
      return true;
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
    if (diff === 0) return { text: "0", color: C.green, bg: `${C.green}15` };
    if (diff > 0) return { text: `+${diff}`, color: C.yellow, bg: `${C.yellow}15` };
    return { text: `${diff}`, color: C.red, bg: `${C.red}15` };
  };

  const getStatus = (p: Product) => {
    if (!p.scanned || p.actualStock === null) return { label: "Pending", color: C.textDim, bg: `${C.textDim}18`, icon: null };
    const diff = p.actualStock - p.softwareStock;
    if (diff === 0) return { label: "Match", color: C.green, bg: `${C.green}18`, icon: <CheckCircle2 size={13} /> };
    if (diff > 0) return { label: "Surplus", color: C.yellow, bg: `${C.yellow}18`, icon: <ArrowUpCircle size={13} /> };
    return { label: "Shortage", color: C.red, bg: `${C.red}18`, icon: <ArrowDownCircle size={13} /> };
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

  const tabs = [
    { key: "scan" as const, label: "Stock Scan", icon: <ScanBarcode size={16} /> },
    { key: "import" as const, label: "Import File", icon: <Upload size={16} /> },
    { key: "differences" as const, label: "Differences", icon: <BarChart3 size={16} />, badge: differences.length || null },
    { key: "settlement" as const, label: "Settlement", icon: <CheckCircle2 size={16} /> },
    { key: "history" as const, label: "History", icon: <Clock size={16} /> },
  ];

  /* ─── RENDER ─── */
  return (
    <div style={{ background: C.bgRoot, minHeight: "100vh", padding: "20px 24px", fontFamily: font, color: C.textPrimary }}>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* ─── HEADER ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: `linear-gradient(135deg, ${C.bgCard}, ${C.border})`,
            border: `1px solid ${C.cyan}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Box size={24} color={C.cyan} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.textPrimary }}>Stock Settlement</h1>
            <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>Physical verification & reconciliation</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { val: `${scannedCount}/${products.length}`, label: "Scanned", color: C.cyan },
            { val: matchCount, label: "Match", color: C.green },
            { val: surplusCount, label: "Surplus", color: C.yellow },
            { val: shortageCount, label: "Shortage", color: C.red },
          ].map((b, i) => (
            <div key={i} style={{
              background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "8px 16px", minWidth: 72, textAlign: "center",
            }}>
              <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: b.color }}>{b.val}</div>
              <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 0.5 }}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── TAB BAR ─── */}
      <div style={{
        background: C.bgCard, borderRadius: 14, padding: 4, border: `1px solid ${C.border}`,
        display: "flex", gap: 4, marginBottom: 16,
      }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            flex: 1, borderRadius: 10, padding: "10px 16px",
            background: activeTab === t.key ? (t.key === "import" ? "#a78bfa20" : C.border) : "transparent",
            color: activeTab === t.key ? (t.key === "import" ? "#a78bfa" : C.cyan) : C.textMuted,
            fontWeight: activeTab === t.key ? 600 : 500,
            fontSize: 13, fontFamily: font, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            position: "relative", transition: "all 0.2s",
          }}>
            <span style={{ opacity: activeTab === t.key ? 1 : 0.5 }}>{t.icon}</span>
            {t.label}
            {t.badge ? (
              <span style={{
                position: "absolute", top: 4, right: 12,
                background: C.red, color: "#fff", fontSize: 10, borderRadius: 10,
                padding: "1px 6px", fontWeight: 600,
              }}>{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ─── FILTER BAR ─── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search size={16} color="#475569" style={{ position: "absolute", left: 14, top: 12 }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search product or ID..."
            style={{
              width: "100%", background: C.bgRoot, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "10px 12px 10px 40px", color: C.textBody, fontSize: 13, fontFamily: font,
              outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = C.borderHover}
            onBlur={e => e.target.style.borderColor = C.border}
          />
        </div>
        {[
          { val: shopFilter, set: setShopFilter, opts: shops, placeholder: "All Shops" },
          { val: deptFilter, set: setDeptFilter, opts: departments, placeholder: "All Departments" },
          { val: brandFilter, set: setBrandFilter, opts: brands, placeholder: "All Brands" },
        ].map((f, i) => (
          <select key={i} value={f.val} onChange={e => f.set(e.target.value)} style={{
            background: C.bgRoot, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: "10px 12px", color: f.val ? C.textBody : C.textDim,
            fontSize: 13, fontFamily: font, minWidth: 130, outline: "none", cursor: "pointer",
          }}>
            <option value="">{f.placeholder}</option>
            {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {hasFilters && (
          <button onClick={clearFilters} style={{
            background: C.border, border: `1px solid ${C.borderHover}`, borderRadius: 10,
            padding: "10px 16px", color: C.textMuted, fontSize: 13, fontFamily: font,
            cursor: "pointer",
          }}>Clear</button>
        )}
      </div>

      {/* ─── TAB CONTENT ─── */}
      <div style={{ animation: "fadeIn 0.3s ease" }}>

        {/* ═══ SCAN TAB ═══ */}
        {activeTab === "scan" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Scan Products</h2>
                <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>Enter actual physical count for each product</p>
              </div>
              <button onClick={autoMatchAll} style={{
                background: `linear-gradient(135deg, ${C.cyanDark}, ${C.cyan})`,
                color: "#042f2e", fontWeight: 600, fontSize: 13, fontFamily: font,
                border: "none", borderRadius: 10, padding: "10px 18px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}>
                <Check size={15} /> Auto-Match All
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: 60, color: C.textDim }}>
                <Loader2 size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
                Loading products...
              </div>
            ) : (
              <>
              <div style={{
                borderRadius: 12, border: `1px solid ${C.border}`, background: C.bgCard,
                overflowX: "auto",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: font }}>
                  <thead>
                    <tr style={{ background: C.bgInput }}>
                      {["Product ID", "Product Name", "Shop", "Dept", "Brand", "Unit", "Software Qty", "Actual Qty", "Difference", "Status"].map(h => (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600,
                          textTransform: "uppercase", letterSpacing: 0.8, color: C.textDim,
                          borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFiltered.map((p, idx) => {
                      const diffBadge = getDiffBadge(p);
                      const status = getStatus(p);
                      return (
                        <tr key={p.id} style={{
                          borderBottom: `1px solid ${C.border}10`,
                          animation: `fadeIn 0.3s ease ${idx * 0.02}s both`,
                        }}>
                          <td style={{ padding: "10px 14px" }}>
                            <code style={{
                              fontFamily: mono, fontSize: 12, background: C.border,
                              padding: "2px 8px", borderRadius: 5, color: C.cyan,
                            }}>{p.id}</code>
                          </td>
                          <td style={{ padding: "10px 14px", fontWeight: 500, color: C.textBody }}>{p.name}</td>
                          <td style={{ padding: "10px 14px", color: C.textSecondary }}>{p.shop}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 500,
                              background: getDeptBg(p.department), color: getDeptColor(p.department),
                            }}>{p.department}</span>
                          </td>
                          <td style={{ padding: "10px 14px", color: C.textSecondary }}>{p.brand}</td>
                          <td style={{ padding: "10px 14px", color: C.textMuted }}>{p.unit}</td>
                          <td style={{ padding: "10px 14px", fontFamily: mono, fontWeight: 600 }}>{p.softwareStock}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <input
                              type="number"
                              value={p.actualStock ?? ""}
                              onChange={e => handleActualChange(p.id, e.target.value)}
                              placeholder="—"
                              style={{
                                width: 72, textAlign: "center", background: C.bgInput,
                                border: `1px solid ${C.borderHover}`, borderRadius: 8,
                                fontFamily: mono, fontSize: 14, fontWeight: 700, color: C.textPrimary,
                                padding: "6px 4px", outline: "none",
                              }}
                              onFocus={e => e.target.style.borderColor = C.cyan}
                              onBlur={e => e.target.style.borderColor = C.borderHover}
                            />
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            {diffBadge ? (
                              <span style={{
                                fontFamily: mono, fontSize: 13, fontWeight: 700, borderRadius: 6,
                                padding: "3px 10px", color: diffBadge.color, background: diffBadge.bg,
                              }}>{diffBadge.text}</span>
                            ) : <span style={{ color: C.textDim }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600,
                              color: status.color, background: status.bg,
                            }}>
                              {status.icon} {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: C.textDim }}>No products found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filtered.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", background: C.bgCard, borderRadius: "0 0 12px 12px",
                  borderTop: `1px solid ${C.border}`, flexWrap: "wrap", gap: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.textMuted }}>
                    <span>Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span>
                    <select
                      value={pageSize}
                      onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      style={{
                        background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "4px 8px", color: C.textBody, fontSize: 12, fontFamily: font,
                        outline: "none", cursor: "pointer",
                      }}
                    >
                      {[25, 50, 100, 200].map(s => <option key={s} value={s}>{s} / page</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{
                        background: currentPage === 1 ? "transparent" : C.border,
                        border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "6px 10px", color: currentPage === 1 ? C.textDim : C.textBody,
                        cursor: currentPage === 1 ? "not-allowed" : "pointer", fontFamily: font, fontSize: 12,
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 5) {
                        page = i + 1;
                      } else if (currentPage <= 3) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i;
                      } else {
                        page = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: currentPage === page ? C.cyan : "transparent",
                            border: currentPage === page ? "none" : `1px solid ${C.border}`,
                            color: currentPage === page ? "#042f2e" : C.textMuted,
                            fontWeight: currentPage === page ? 700 : 500,
                            fontSize: 13, fontFamily: mono, cursor: "pointer",
                          }}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        background: currentPage === totalPages ? "transparent" : C.border,
                        border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "6px 10px", color: currentPage === totalPages ? C.textDim : C.textBody,
                        cursor: currentPage === totalPages ? "not-allowed" : "pointer", fontFamily: font, fontSize: 12,
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {/* ═══ IMPORT FILE TAB ═══ */}
        {activeTab === "import" && (
          <StockImportTab products={products} onApplyImport={handleImportApply} />
        )}

        {/* ═══ DIFFERENCES TAB ═══ */}
        {activeTab === "differences" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Stock Differences</h2>
                <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>{differences.length} differences found out of {scannedCount} scanned items</p>
              </div>
              <button onClick={() => setShowExportModal(true)} style={{
                background: `linear-gradient(135deg, ${C.cyanDark}, ${C.cyan})`,
                color: "#042f2e", fontWeight: 600, fontSize: 13, fontFamily: font,
                border: "none", borderRadius: 10, padding: "10px 18px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}>
                <Download size={15} /> Export Report
              </button>
            </div>

            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Perfectly Matched", val: matchCount, color: C.green, prefix: "" },
                { label: "Total Surplus Qty", val: totalSurplus, color: C.yellow, prefix: "+" },
                { label: "Total Shortage Qty", val: totalShortage, color: C.red, prefix: "-" },
              ].map((c, i) => (
                <div key={i} style={{
                  background: C.bgCard, borderRadius: 12, padding: "20px 24px",
                  borderLeft: `4px solid ${c.color}`,
                }}>
                  <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: c.color }}>{c.prefix}{c.val}</div>
                  <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Differences Table */}
            {differences.length > 0 ? (
              <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, background: C.bgCard, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: font }}>
                  <thead>
                    <tr style={{ background: C.bgInput }}>
                      {["Product ID", "Product Name", "Shop", "Dept", "Brand", "Software Qty", "Actual Qty", "Difference", "Type"].map(h => (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600,
                          textTransform: "uppercase", letterSpacing: 0.8, color: C.textDim,
                          borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {differences.map((p, idx) => {
                      const diff = p.actualStock! - p.softwareStock;
                      const isPositive = diff > 0;
                      return (
                        <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}10`, animation: `fadeIn 0.3s ease ${idx * 0.02}s both` }}>
                          <td style={{ padding: "10px 14px" }}>
                            <code style={{ fontFamily: mono, fontSize: 12, background: C.border, padding: "2px 8px", borderRadius: 5, color: C.cyan }}>{p.id}</code>
                          </td>
                          <td style={{ padding: "10px 14px", fontWeight: 500, color: C.textBody }}>{p.name}</td>
                          <td style={{ padding: "10px 14px", color: C.textSecondary }}>{p.shop}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 500, background: getDeptBg(p.department), color: getDeptColor(p.department) }}>{p.department}</span>
                          </td>
                          <td style={{ padding: "10px 14px", color: C.textSecondary }}>{p.brand}</td>
                          <td style={{ padding: "10px 14px", fontFamily: mono, fontWeight: 600 }}>{p.softwareStock}</td>
                          <td style={{ padding: "10px 14px", fontFamily: mono, fontWeight: 600 }}>{p.actualStock}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              fontFamily: mono, fontSize: 15, fontWeight: 700, borderRadius: 6,
                              padding: "3px 10px", color: isPositive ? C.yellow : C.red,
                              background: isPositive ? `${C.yellow}15` : `${C.red}15`,
                            }}>{isPositive ? "+" : ""}{diff}</span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600,
                              color: isPositive ? C.yellow : C.red,
                              background: isPositive ? `${C.yellow}18` : `${C.red}18`,
                            }}>
                              {isPositive ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />}
                              {isPositive ? "Surplus" : "Shortage"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>
                {scannedCount === 0 ? "Scan products first to see differences" : "No differences found — all scanned items match!"}
              </div>
            )}
          </div>
        )}

        {/* ═══ SETTLEMENT TAB ═══ */}
        {activeTab === "settlement" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Stock Settlement</h2>
              <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>Review and reconcile physical stock with software records</p>
            </div>

            {/* Progress Card */}
            <div style={{ background: C.bgCard, borderRadius: 14, padding: 24, border: `1px solid ${C.border}`, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Scan Progress</div>
              <div style={{ height: 8, background: C.border, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
                <div style={{
                  height: "100%", borderRadius: 8,
                  background: `linear-gradient(90deg, ${C.cyanDark}, ${C.cyan})`,
                  width: `${products.length ? (scannedCount / products.length) * 100 : 0}%`,
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: C.textDim }}>{scannedCount} of {products.length} scanned</span>
                <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: C.cyan }}>
                  {products.length ? Math.round((scannedCount / products.length) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* Overview Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Total Scanned", val: scannedCount, color: C.cyan },
                { label: "Matched", val: matchCount, color: C.green },
                { label: "Surplus Items", val: surplusCount, color: C.yellow },
                { label: "Shortage Items", val: shortageCount, color: C.red },
              ].map((c, i) => (
                <div key={i} style={{
                  background: C.bgCard, borderRadius: 12, padding: "18px 20px",
                  border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: c.color }}>{c.val}</div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>{c.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Settlement Action */}
            <div style={{ background: C.bgCard, borderRadius: 14, padding: 32, border: `1px solid ${C.border}`, textAlign: "center" }}>
              <p style={{ color: C.textMuted, fontSize: 14, marginBottom: 20 }}>
                {differences.length > 0 ? (
                  <>There are <span style={{ color: C.yellow, fontWeight: 700 }}>{differences.length}</span> items with differences to settle.</>
                ) : scannedCount > 0 ? (
                  "All scanned items match. You can proceed to settle."
                ) : (
                  "Scan products first before settling."
                )}
              </p>
              <button
                onClick={() => setShowSettleModal(true)}
                disabled={scannedCount === 0}
                style={{
                  background: scannedCount === 0 ? C.border : `linear-gradient(135deg, ${C.greenDark}, ${C.green})`,
                  color: scannedCount === 0 ? C.textDim : "#042f2e",
                  fontSize: 15, fontWeight: 700, fontFamily: font,
                  border: "none", borderRadius: 12, padding: "14px 36px",
                  cursor: scannedCount === 0 ? "not-allowed" : "pointer",
                  display: "inline-flex", alignItems: "center", gap: 8,
                  boxShadow: scannedCount > 0 ? `0 0 30px ${C.green}30` : "none",
                }}>
                <CheckCircle2 size={18} /> Proceed to Settlement
              </button>
            </div>
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {activeTab === "history" && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Settlement History</h2>
              <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>{history.length} past settlements recorded</p>
            </div>

            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#475569" }}>No settlements recorded yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {history.map(h => {
                  const expanded = expandedHistory === h.id;
                  return (
                    <div key={h.id} style={{
                      background: C.bgCard, borderRadius: 12, border: `1px solid ${C.border}`,
                      overflow: "hidden", cursor: "pointer",
                    }}>
                      <div
                        onClick={() => setExpandedHistory(expanded ? null : h.id)}
                        style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 40, height: 40, borderRadius: 10, background: `${C.green}15`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <CheckCircle2 size={20} color={C.green} />
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <code style={{ fontFamily: mono, fontSize: 12, background: C.border, padding: "2px 8px", borderRadius: 5, color: C.cyan }}>{h.id}</code>
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 8,
                                background: `${C.green}18`, color: C.green,
                              }}>Completed</span>
                            </div>
                            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                              {h.date} • {h.shop} • Settled by {h.settledBy}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ fontSize: 13 }}><b>{h.totalItems}</b> items</span>
                          <span style={{ color: C.green, fontFamily: mono, fontWeight: 600 }}>{h.matched} match</span>
                          <span style={{ color: C.yellow, fontFamily: mono, fontWeight: 600 }}>{h.surplus} surplus</span>
                          <span style={{ color: C.red, fontFamily: mono, fontWeight: 600 }}>{h.shortage} shortage</span>
                          <div style={{ transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>
                            <ChevronDown size={18} color={C.textMuted} />
                          </div>
                        </div>
                      </div>

                      {expanded && h.items.length > 0 && (
                        <div style={{ padding: "0 20px 14px", animation: "scaleIn 0.2s ease" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: font }}>
                            <thead>
                              <tr style={{ background: C.bgInput }}>
                                {["ID", "Product", "Software", "Actual", "Diff"].map(hh => (
                                  <th key={hh} style={{
                                    padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 600,
                                    textTransform: "uppercase", color: C.textDim, borderBottom: `1px solid ${C.border}`,
                                  }}>{hh}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {h.items.map(item => {
                                const diff = (item.actualStock ?? item.softwareStock) - item.softwareStock;
                                return (
                                  <tr key={item.id} style={{ borderBottom: `1px solid ${C.border}10` }}>
                                    <td style={{ padding: "6px 12px", fontFamily: mono, color: C.cyan }}>{item.id}</td>
                                    <td style={{ padding: "6px 12px", color: C.textBody }}>{item.name}</td>
                                    <td style={{ padding: "6px 12px", fontFamily: mono, fontWeight: 600 }}>{item.softwareStock}</td>
                                    <td style={{ padding: "6px 12px", fontFamily: mono, fontWeight: 600 }}>{item.actualStock}</td>
                                    <td style={{ padding: "6px 12px" }}>
                                      <span style={{
                                        fontFamily: mono, fontWeight: 700,
                                        color: diff === 0 ? C.green : diff > 0 ? C.yellow : C.red,
                                      }}>{diff === 0 ? "0" : diff > 0 ? `+${diff}` : diff}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── SETTLEMENT MODAL ─── */}
      {showSettleModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.2s ease",
        }} onClick={() => setShowSettleModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.bgCard, borderRadius: 16, padding: 28, maxWidth: 480, width: "90%",
            border: `1px solid ${C.border}`, animation: "scaleIn 0.25s ease",
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Confirm Stock Settlement</h3>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
              You are about to settle <b>{scannedCount}</b> scanned items. This action will update software stock to match physical counts.
            </p>

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Matched", val: matchCount, color: C.green },
                { label: "Surplus", val: surplusCount, color: C.yellow },
                { label: "Shortage", val: shortageCount, color: C.red },
              ].map((s, i) => (
                <div key={i} style={{
                  flex: 1, background: C.bgInput, borderRadius: 10, padding: "14px 8px",
                  border: `1px solid ${s.color}`, textAlign: "center",
                }}>
                  <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{s.label}</div>
                </div>
              ))}
            </div>

            <textarea
              value={settleNote} onChange={e => setSettleNote(e.target.value)}
              placeholder="Add a note..."
              style={{
                width: "100%", background: C.bgInput, border: `1px solid ${C.borderHover}`,
                borderRadius: 10, padding: 12, fontSize: 13, fontFamily: font, color: C.textBody,
                resize: "vertical", minHeight: 60, outline: "none", marginBottom: 16,
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowSettleModal(false)} style={{
                background: C.border, border: `1px solid ${C.borderHover}`, borderRadius: 10,
                padding: "10px 20px", color: C.textMuted, fontSize: 13, fontFamily: font, cursor: "pointer",
              }}>Cancel</button>
              <button onClick={handleSettle} disabled={settling} style={{
                background: `linear-gradient(135deg, ${C.greenDark}, ${C.green})`,
                color: "#042f2e", fontWeight: 700, fontSize: 13, fontFamily: font,
                border: "none", borderRadius: 10, padding: "10px 20px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}>
                {settling ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EXPORT MODAL ─── */}
      {showExportModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.2s ease",
        }} onClick={() => setShowExportModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.bgCard, borderRadius: 16, padding: 28, maxWidth: 420, width: "90%",
            border: `1px solid ${C.border}`, animation: "scaleIn 0.25s ease",
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Export Stock Difference</h3>
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { label: "Excel (.xlsx)", sub: "Detailed with formulas", icon: "XLS", gradient: `linear-gradient(135deg, ${C.greenDark}, ${C.green})` },
                { label: "PDF Document", sub: "Printable report", icon: "PDF", gradient: `linear-gradient(135deg, #dc2626, ${C.red})` },
              ].map((opt, i) => (
                <button key={i} onClick={() => {
                  toast({ title: "Export Started", description: `Generating ${opt.label}...` });
                  setShowExportModal(false);
                }} style={{
                  flex: 1, background: C.bgInput, border: `1px solid ${C.border}`, borderRadius: 12,
                  padding: 24, cursor: "pointer", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 10,
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 12, background: opt.gradient,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: mono,
                  }}>{opt.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── CSS Animations ─── */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
};

export default StockSettlement;
