import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Package, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

interface Props {
  productId: string;
  onBack: () => void;
}

export const OwnerStockProductDetail = ({ productId, onBack }: Props) => {
  const { currentOrganization } = useOrganization();

  const { data: product, isLoading } = useQuery({
    queryKey: ["owner-stock-product", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, product_name, brand, category, style, hsn_code, gst_percent")
        .eq("id", productId)
        .single();
      return data;
    },
    enabled: !!productId,
  });

  const { data: variants, isLoading: variantsLoading } = useQuery({
    queryKey: ["owner-stock-product-variants", productId],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("product_variants")
        .select("id, size, color, barcode, current_stock, purchase_price, sale_price")
        .eq("product_id", productId)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .order("size");
      return data || [];
    },
    enabled: !!productId && !!currentOrganization,
  });

  const { data: movements } = useQuery({
    queryKey: ["owner-stock-movements", productId],
    queryFn: async () => {
      if (!currentOrganization || !variants?.length) return [];
      const variantIds = variants.map((v) => v.id);
      const { data } = await supabase
        .from("stock_movements")
        .select("id, variant_id, movement_type, quantity, reference_number, created_at")
        .in("variant_id", variantIds.slice(0, 100))
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!currentOrganization && (variants?.length || 0) > 0,
  });

  const totalStock = variants?.reduce((s, v) => s + (Number(v.current_stock) || 0), 0) || 0;

  const stockColor = (qty: number) =>
    qty <= 0 ? "text-destructive" : qty <= 5 ? "text-warning" : "text-success";
  const stockBadge = (qty: number) =>
    qty <= 0 ? "bg-destructive/10 text-destructive" : qty <= 5 ? "bg-warning/10 text-warning" : "bg-success/10 text-success";

  const movementLabel = (type: string) => {
    switch (type) {
      case "purchase": return { label: "Purchase In", icon: ArrowUpRight, color: "text-success" };
      case "sale": return { label: "Sale Out", icon: ArrowDownRight, color: "text-destructive" };
      case "sale_return": return { label: "Sale Return", icon: ArrowUpRight, color: "text-success" };
      case "purchase_return": return { label: "Pur Return", icon: ArrowDownRight, color: "text-destructive" };
      case "adjustment": return { label: "Adjustment", icon: ArrowUpRight, color: "text-info" };
      default: return { label: type, icon: ArrowUpRight, color: "text-muted-foreground" };
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 pb-24">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="px-4 mt-4 space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-muted/30 pb-24 flex flex-col items-center justify-center">
        <p className="text-sm text-muted-foreground">Product not found</p>
        <button onClick={onBack} className="mt-3 text-sm font-semibold text-primary">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 touch-manipulation">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground truncate flex-1">{product.product_name}</h1>
        </div>
      </div>

      {/* Product Info Card */}
      <div className="px-4 mt-4">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <h2 className="text-base font-bold text-foreground">{product.product_name}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {[product.brand, product.category, product.style].filter(Boolean).join(" • ") || "—"}
            </p>
            {(product.hsn_code || product.gst_percent) && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {product.hsn_code ? `HSN: ${product.hsn_code}` : ""}{product.hsn_code && product.gst_percent ? " • " : ""}{product.gst_percent ? `GST: ${product.gst_percent}%` : ""}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Total Stock:</span>
              <span className={cn("text-lg font-bold tabular-nums", stockColor(totalStock))}>{totalStock}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Size-wise Variants */}
      <div className="px-4 mt-4">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold">
              Variants ({variants?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {variantsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : variants && variants.length > 0 ? (
              <div className="space-y-2">
                {variants.map((v, idx) => (
                  <div
                    key={v.id}
                    className={cn("rounded-xl p-3", idx % 2 === 0 ? "bg-muted/20" : "bg-muted/40")}
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">Size: {v.size || "—"}</span>
                          {v.color && <span className="text-[10px] text-muted-foreground">• {v.color}</span>}
                        </div>
                        {v.barcode && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">Barcode: {v.barcode}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Pur: {fmt(Number(v.purchase_price) || 0)} • Sale: {fmt(Number(v.sale_price) || 0)}
                        </p>
                      </div>
                      <div className="shrink-0 ml-2">
                        <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", stockBadge(Number(v.current_stock) || 0))}>
                          {Number(v.current_stock) || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No variants found</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stock Movement History */}
      <div className="px-4 mt-4 mb-6">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold">
              Recent Stock Movements
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {movements && movements.length > 0 ? (
              <div className="space-y-0">
                {movements.map((m, idx) => {
                  const info = movementLabel(m.movement_type);
                  const Icon = info.icon;
                  const isPositive = ["purchase", "sale_return", "adjustment"].includes(m.movement_type);
                  return (
                    <div
                      key={m.id}
                      className={cn("flex items-center gap-2.5 py-2.5", idx < movements.length - 1 && "border-b border-border/40")}
                    >
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", isPositive ? "bg-success/10" : "bg-destructive/10")}>
                        <Icon className={cn("h-3.5 w-3.5", info.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{info.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {m.reference_number || "—"} • {m.created_at ? format(new Date(m.created_at), "dd MMM, hh:mm a") : ""}
                        </p>
                      </div>
                      <span className={cn("text-xs font-bold tabular-nums", isPositive ? "text-success" : "text-destructive")}>
                        {isPositive ? "+" : "−"}{Math.abs(m.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No recent movements</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
