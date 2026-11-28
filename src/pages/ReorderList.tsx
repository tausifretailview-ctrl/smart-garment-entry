import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { istCalendarYmd } from "@/lib/localDayBounds";
import {
  fetchReorderSuggestions,
  groupBySupplier,
  packNote,
  type ReorderDb,
  type SupplierGroup,
} from "@/lib/data/reorderSuggestions";

/**
 * Inventory → Reorder (supermarket phase 2, Nov 2026): items at or under their reorder level,
 * how much to buy (up to max stock, whole cases), grouped by last supplier, one purchase order
 * per supplier.
 */
const db = supabase as unknown as ReorderDb;
const PERIODS = [30, 60, 90] as const;

const ReorderList = () => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { orgNavigate } = useOrgNavigation();
  const [period, setPeriod] = useState<number>(60);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["reorder-suggestions", orgId, period],
    enabled: !!orgId,
    queryFn: () => fetchReorderSuggestions(db, orgId!, period),
  });
  const missingSql = rows === null;
  const groups = useMemo(() => groupBySupplier(rows ?? []), [rows]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const r of rows ?? []) next[r.variant_id] = String(r.suggested_qty);
    setQty(next);
  }, [rows]);

  const openPo = async (group: SupplierGroup) => {
    const lines = group.rows
      .map((r) => ({ r, q: Number(qty[r.variant_id]) || 0 }))
      .filter((x) => x.q > 0);
    if (lines.length === 0) {
      toast.error("Set a quantity above 0 first");
      return;
    }
    setOpening(group.key);
    try {
      let supplier: Record<string, string | null> | null = null;
      if (group.supplierId && orgId) {
        const { data } = await supabase
          .from("suppliers")
          .select("id, supplier_name, phone, email, address, gst_number")
          .eq("organization_id", orgId)
          .eq("id", group.supplierId)
          .maybeSingle();
        supplier = data as Record<string, string | null> | null;
      }
      orgNavigate("/purchase-order-entry", {
        state: {
          orderData: {
            order_date: istCalendarYmd(),
            supplier_id: group.supplierId ?? "",
            supplier_name: supplier?.supplier_name ?? (group.supplierId ? group.supplierName : ""),
            supplier_phone: supplier?.phone ?? null,
            supplier_email: supplier?.email ?? null,
            supplier_address: supplier?.address ?? null,
            supplier_gst: supplier?.gst_number ?? null,
            purchase_order_items: lines.map(({ r, q }) => ({
              product_id: r.product_id,
              variant_id: r.variant_id,
              product_name: r.product_name,
              size: r.size,
              barcode: r.barcode,
              order_qty: q,
              unit_price: r.pur_price,
              gst_percent: r.gst_percent,
              line_total: Math.round(q * r.pur_price * 100) / 100,
              hsn_code: r.hsn_code ?? "",
              color: r.color ?? "",
            })),
          },
        },
      });
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2">
        <BackToDashboard />
        <ShoppingCart className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold mr-auto">Reorder</h1>
        <span className="text-sm text-muted-foreground">Sales of the last</span>
        <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p} value={String(p)}>
                {p} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">
        Items at or under their reorder level (Product Entry → Units &amp; reorder). The quantity fills them up to
        Max stock (or twice the reorder level), in whole cases; an item with sizes is split by what each size sold.
      </p>
      {missingSql ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
          Run SQL 73 (reorder min / max) in the database first.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && !missingSql && groups.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Nothing to reorder. Set a reorder level on items you want to watch.
        </Card>
      ) : null}
      {groups.map((g) => {
        const total = g.rows.reduce((s, r) => s + (Number(qty[r.variant_id]) || 0) * r.pur_price, 0);
        return (
          <Card key={g.key} className="p-3 space-y-2" data-testid="reorder-group">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold mr-auto">{g.supplierName}</h2>
              <span className="text-sm text-muted-foreground">
                {g.rows.length} item(s) · ₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              <Button type="button" size="sm" disabled={opening === g.key} onClick={() => void openPo(g)}>
                <PackagePlus className="h-4 w-4 mr-1" /> Create PO
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-2">Item</th>
                    <th className="py-1 pr-2 text-right">Stock</th>
                    <th className="py-1 pr-2 text-right">Level / Max</th>
                    <th className="py-1 pr-2 text-right">Sold</th>
                    <th className="py-1 pr-2 text-right">Order qty</th>
                    <th className="py-1 pr-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const q = Number(qty[r.variant_id]) || 0;
                    return (
                      <tr key={r.variant_id} className="border-t">
                        <td className="py-1 pr-2">
                          <div className="font-medium">
                            {r.product_name}
                            {r.size && r.size !== "None" ? ` (${r.size})` : ""}
                            {r.color ? ` · ${r.color}` : ""}
                          </div>
                          <div className="text-xs text-muted-foreground">{r.barcode || "—"}</div>
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          {r.variant_stock}
                          {r.product_stock !== r.variant_stock ? <span className="text-xs text-muted-foreground"> / {r.product_stock}</span> : null}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          {r.reorder_level} / {r.max_stock ?? r.reorder_level * 2}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{r.sold_in_period}</td>
                        <td className="py-1 pr-2 text-right">
                          <Input
                            aria-label={`Order qty ${r.product_name}${r.size && r.size !== "None" ? ` ${r.size}` : ""}`}
                            inputMode="decimal"
                            value={qty[r.variant_id] ?? ""}
                            onChange={(e) => setQty((prev) => ({ ...prev, [r.variant_id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                            className="h-8 w-24 ml-auto text-right"
                          />
                          {packNote(q, r.pack_unit, r.pack_factor) ? (
                            <div className="text-xs text-muted-foreground">{packNote(q, r.pack_unit, r.pack_factor)}</div>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">₹{r.pur_price}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default ReorderList;
