import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Package, Search, Layers, IndianRupee, AlertTriangle, XCircle, CheckCircle, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmtShort = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` :
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` :
  v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` :
  `₹${Math.round(v).toLocaleString("en-IN")}`;

interface Props {
  onViewProduct: (productId: string) => void;
}

const PAGE_SIZE = 30;

export const OwnerStockOverview = ({ onViewProduct }: Props) => {
  const { currentOrganization } = useOrganization();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">("all");
  const [sortBy, setSortBy] = useState<"name" | "stock_low" | "stock_high" | "brand">("name");
  const [showSort, setShowSort] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  const { data: products, isLoading } = useQuery({
    queryKey: ["owner-stock-products", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("products")
        .select("id, product_name, brand, product_type, style, hsn_code, gst_per")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .neq("product_type", "service")
        .order("product_name")
        .limit(1000);
      return data || [];
    },
    enabled: !!currentOrganization,
    staleTime: 60000,
  });

  const { data: variants } = useQuery({
    queryKey: ["owner-stock-variants", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("product_variants")
        .select("id, product_id, size, color, barcode, current_stock, pur_price, sale_price")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .eq("active", true)
        .limit(5000);
      return data || [];
    },
    enabled: !!currentOrganization,
    staleTime: 60000,
  });

  const productData = useMemo(() => {
    if (!products?.length || !variants?.length) return [];
    const variantMap = new Map<string, { totalStock: number; variantCount: number; purchaseValue: number; saleValue: number; salePrice: number }>();
    variants.forEach((v) => {
      const ex = variantMap.get(v.product_id) || { totalStock: 0, variantCount: 0, purchaseValue: 0, saleValue: 0, salePrice: 0 };
      const stock = Number(v.current_stock) || 0;
      ex.totalStock += stock;
      ex.variantCount++;
      ex.purchaseValue += stock * (Number(v.pur_price) || 0);
      ex.saleValue += stock * (Number(v.sale_price) || 0);
      if (Number(v.sale_price) > ex.salePrice) ex.salePrice = Number(v.sale_price);
      variantMap.set(v.product_id, ex);
    });
    return products.map((p) => {
      const agg = variantMap.get(p.id) || { totalStock: 0, variantCount: 0, purchaseValue: 0, saleValue: 0, salePrice: 0 };
      return { ...p, ...agg };
    });
  }, [products, variants]);

  const summary = useMemo(() => {
    const totalProducts = productData.length;
    const totalVariants = variants?.length || 0;
    let purchaseValue = 0, saleValue = 0, inStock = 0, lowStock = 0, outOfStock = 0;
    productData.forEach((p) => {
      purchaseValue += p.purchaseValue;
      saleValue += p.saleValue;
      if (p.totalStock <= 0) outOfStock++;
      else if (p.totalStock <= 5) lowStock++;
      else inStock++;
    });
    return { totalProducts, totalVariants, purchaseValue, saleValue, inStock, lowStock, outOfStock };
  }, [productData, variants]);

  const filteredList = useMemo(() => {
    let list = productData;
    if (stockFilter === "in") list = list.filter((p) => p.totalStock > 5);
    else if (stockFilter === "low") list = list.filter((p) => p.totalStock > 0 && p.totalStock <= 5);
    else if (stockFilter === "out") list = list.filter((p) => p.totalStock <= 0);

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.product_name?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q) ||
          p.product_type?.toLowerCase().includes(q) ||
          p.style?.toLowerCase().includes(q)
      );
    }

    switch (sortBy) {
      case "stock_low": list = [...list].sort((a, b) => a.totalStock - b.totalStock); break;
      case "stock_high": list = [...list].sort((a, b) => b.totalStock - a.totalStock); break;
      case "brand": list = [...list].sort((a, b) => (a.brand || "").localeCompare(b.brand || "")); break;
      default: list = [...list].sort((a, b) => (a.product_name || "").localeCompare(b.product_name || "")); break;
    }
    return list;
  }, [productData, stockFilter, debouncedSearch, sortBy]);

  const visibleProducts = filteredList.slice(0, visibleCount);

  const stockColor = (qty: number) =>
    qty <= 0 ? "text-destructive" : qty <= 5 ? "text-warning" : "text-success";
  const stockBg = (qty: number) =>
    qty <= 0 ? "bg-destructive" : qty <= 5 ? "bg-warning" : "bg-success";

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="px-4 py-3">
          <h1 className="text-base font-semibold text-foreground mb-3">Stock Overview</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search product, brand, barcode..."
              className="pl-9 h-9 text-sm rounded-xl bg-muted/50"
            />
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-2.5">
        {[
          { label: "Products", value: summary.totalProducts.toLocaleString("en-IN"), icon: Package, tint: "bg-primary/10", color: "text-primary" },
          { label: "Variants", value: summary.totalVariants.toLocaleString("en-IN"), icon: Layers, tint: "bg-info/10", color: "text-info" },
          { label: "Purchase Value", value: fmtShort(summary.purchaseValue), icon: IndianRupee, tint: "bg-warning/10", color: "text-warning" },
          { label: "Sale Value", value: fmtShort(summary.saleValue), icon: IndianRupee, tint: "bg-success/10", color: "text-success" },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", c.tint)}>
                  <Icon className={cn("h-3.5 w-3.5", c.color)} />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{c.label}</span>
              </div>
              {isLoading ? <Skeleton className="h-6 w-16" /> : (
                <p className="text-lg font-bold text-foreground tabular-nums">{c.value}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 mt-4 flex gap-2">
        {[
          { key: "all" as const, label: "All", count: summary.totalProducts, icon: Package, color: "text-foreground" },
          { key: "in" as const, label: "In Stock", count: summary.inStock, icon: CheckCircle, color: "text-success" },
          { key: "low" as const, label: "Low", count: summary.lowStock, icon: AlertTriangle, color: "text-warning" },
          { key: "out" as const, label: "Out", count: summary.outOfStock, icon: XCircle, color: "text-destructive" },
        ].map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.key}
              onClick={() => { setStockFilter(chip.key); setVisibleCount(PAGE_SIZE); }}
              className={cn(
                "flex-1 flex flex-col items-center py-2 rounded-xl text-[10px] font-semibold transition-all touch-manipulation",
                stockFilter === chip.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border/40"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 mb-0.5", stockFilter === chip.key ? "text-primary-foreground" : chip.color)} />
              <span>{chip.count}</span>
              <span className="text-[9px] opacity-80">{chip.label}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{filteredList.length} products</p>
        <button onClick={() => setShowSort(!showSort)} className="flex items-center gap-1 text-xs text-primary font-medium touch-manipulation">
          <ArrowUpDown className="h-3 w-3" /> Sort
        </button>
      </div>
      {showSort && (
        <div className="px-4 mt-2 flex gap-2 flex-wrap">
          {([
            { key: "name", label: "Name" },
            { key: "stock_low", label: "Stock ↑" },
            { key: "stock_high", label: "Stock ↓" },
            { key: "brand", label: "Brand" },
          ] as const).map((s) => (
            <button
              key={s.key}
              onClick={() => { setSortBy(s.key); setShowSort(false); }}
              className={cn(
                "text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all touch-manipulation",
                sortBy === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="px-4 mt-3 space-y-2">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm">
              <div className="flex justify-between">
                <div><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-24" /></div>
                <div className="text-right"><Skeleton className="h-5 w-10" /><Skeleton className="h-3 w-16 mt-1" /></div>
              </div>
            </div>
          ))
        ) : visibleProducts.length > 0 ? (
          <>
            {visibleProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => onViewProduct(p.id)}
                className="w-full bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm active:scale-[0.98] transition-all touch-manipulation text-left"
              >
                <div className="flex justify-between items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">{p.product_name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {[p.brand, p.product_type].filter(Boolean).join(" • ") || "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={cn("w-2 h-2 rounded-full", stockBg(p.totalStock))} />
                      <span className={cn("text-base font-bold tabular-nums", stockColor(p.totalStock))}>
                        {p.totalStock}
                      </span>
                    </div>
                    {p.salePrice > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">₹{p.salePrice.toLocaleString("en-IN")}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {visibleCount < filteredList.length && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full text-center text-xs font-semibold text-primary py-3 active:opacity-70 touch-manipulation"
              >
                Load More ({filteredList.length - visibleCount} remaining)
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">No products found</p>
            <p className="text-xs text-muted-foreground mt-1">Try a different search or filter</p>
          </div>
        )}
      </div>
    </div>
  );
};
