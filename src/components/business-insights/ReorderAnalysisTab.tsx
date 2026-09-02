import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AlertTriangle, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import {
  useReorderAnalysis,
  type ReorderAnalysisRow,
} from "@/hooks/useBusinessInsights";
import {
  DEFAULT_REORDER_PERIOD_DAYS,
  REORDER_COVER_DAYS,
  REORDER_PERIOD_OPTIONS,
  daysRemainingTone,
  groupApprovedRowsBySupplier,
  toPurchaseOrderItems,
  type ReorderRowForPo,
} from "@/utils/reorderAnalysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_NEUTRAL_TH,
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsTableHeader,
  InsightsTableSkeleton,
} from "@/components/business-insights/insightsLayout";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDateLabel(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso.length >= 10 ? iso.slice(0, 10) : iso), "dd MMM yyyy");
  } catch {
    return iso;
  }
}

function variantLabel(row: ReorderAnalysisRow): string {
  return [row.size, row.color].map((p) => (p || "").trim()).filter(Boolean).join(" / ") || "—";
}

function productLabel(row: ReorderAnalysisRow): string {
  const brand = row.brand?.trim();
  return brand ? `${row.product_name} (${brand})` : row.product_name;
}

const DAYS_BADGE: Record<ReturnType<typeof daysRemainingTone>, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

type SupplierRecord = {
  id: string;
  supplier_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
};

async function loadPoEnrichment(
  orgId: string,
  supplierId: string,
  variantIds: string[],
): Promise<{
  supplier: SupplierRecord | null;
  priceByVariant: Map<string, { purPrice: number; gstPercent: number; hsnCode: string }>;
}> {
  const [{ data: supplier }, { data: variants }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, supplier_name, phone, email, address, gst_number")
      .eq("organization_id", orgId)
      .eq("id", supplierId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("product_variants")
      .select("id, pur_price, products(hsn_code, gst_per)")
      .eq("organization_id", orgId)
      .in("id", variantIds),
  ]);

  const priceByVariant = new Map<string, { purPrice: number; gstPercent: number; hsnCode: string }>();
  for (const v of variants ?? []) {
    const nested = v.products as
      | { hsn_code?: string | null; gst_per?: number | null }
      | { hsn_code?: string | null; gst_per?: number | null }[]
      | null;
    const product = Array.isArray(nested) ? nested[0] : nested;
    priceByVariant.set(v.id, {
      purPrice: num(v.pur_price),
      gstPercent: num(product?.gst_per),
      hsnCode: product?.hsn_code || "",
    });
  }

  return { supplier: supplier as SupplierRecord | null, priceByVariant };
}

export function ReorderAnalysisTab() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const orgId = currentOrganization?.id;

  const [periodDays, setPeriodDays] = useState(DEFAULT_REORDER_PERIOD_DAYS);
  const [category, setCategory] = useState<string | null>(null);
  const [approvedQty, setApprovedQty] = useState<Record<string, number>>({});
  const [openingPo, setOpeningPo] = useState(false);

  const { data: rows = [], isLoading, error } = useReorderAnalysis(orgId, periodDays, category, true);

  const { data: filterOptions } = useQueryCategories(orgId);

  const suggestedDefault = useCallback((row: ReorderAnalysisRow) => {
    const suggested = Math.max(0, Math.round(num(row.suggested_reorder_qty)));
    const override = approvedQty[row.variant_id];
    return override === undefined ? suggested : override;
  }, [approvedQty]);

  const stats = useMemo(() => {
    let needReorder = 0;
    let critical = 0;
    const suppliers = new Set<string>();
    for (const row of rows) {
      if (num(row.suggested_reorder_qty) > 0) needReorder += 1;
      const days = row.days_of_stock_left === null ? null : num(row.days_of_stock_left);
      if (days !== null && days < 2) critical += 1;
      if (row.primary_supplier_id) suppliers.add(row.primary_supplier_id);
    }
    return { total: rows.length, needReorder, critical, suppliers: suppliers.size };
  }, [rows]);

  const openPurchaseOrder = useCallback(
    async (source: ReorderAnalysisRow[]) => {
      const withQty = source.filter((r) => suggestedDefault(r) > 0);
      if (withQty.length === 0) {
        toast.error("Set an approved qty greater than 0 first");
        return;
      }
      const supplierId = withQty[0]?.primary_supplier_id;
      if (!supplierId || !orgId) {
        toast.error("No last-purchase supplier on these rows — pick a supplier on the PO");
        return;
      }
      if (withQty.some((r) => r.primary_supplier_id !== supplierId)) {
        toast.error("Create PO is one vendor at a time");
        return;
      }
      setOpeningPo(true);
      try {
        const { supplier, priceByVariant } = await loadPoEnrichment(
          orgId,
          supplierId,
          withQty.map((r) => r.variant_id),
        );
        const poRows: ReorderRowForPo[] = withQty.map((r) => {
          const price = priceByVariant.get(r.variant_id);
          return {
            variantId: r.variant_id,
            productId: r.product_id,
            productName: r.product_name,
            size: r.size,
            barcode: r.barcode,
            color: r.color,
            approvedQty: suggestedDefault(r),
            purPrice: price?.purPrice ?? 0,
            gstPercent: price?.gstPercent ?? 0,
            hsnCode: price?.hsnCode ?? "",
            primarySupplierId: r.primary_supplier_id,
            primarySupplier: r.primary_supplier,
          };
        });
        orgNavigate("/purchase-order-entry", {
          state: {
            orderData: {
              supplier_id: supplierId,
              supplier_name: supplier?.supplier_name || withQty[0].primary_supplier,
              supplier_phone: supplier?.phone,
              supplier_email: supplier?.email,
              supplier_address: supplier?.address,
              supplier_gst: supplier?.gst_number,
              purchase_order_items: toPurchaseOrderItems(poRows),
            },
          },
        });
        setApprovedQty((prev) => {
          const next = { ...prev };
          for (const r of withQty) next[r.variant_id] = 0;
          return next;
        });
      } catch (err) {
        toast.error((err as Error).message || "Could not open purchase order");
      } finally {
        setOpeningPo(false);
      }
    },
    [orgId, orgNavigate, suggestedDefault],
  );

  const handleBulkGenerate = useCallback(async () => {
    const poReady: ReorderRowForPo[] = rows.map((r) => ({
      variantId: r.variant_id,
      productId: r.product_id,
      productName: r.product_name,
      size: r.size,
      barcode: r.barcode,
      color: r.color,
      approvedQty: suggestedDefault(r),
      purPrice: 0,
      gstPercent: 0,
      hsnCode: "",
      primarySupplierId: r.primary_supplier_id,
      primarySupplier: r.primary_supplier,
    }));
    const groups = groupApprovedRowsBySupplier(poReady);
    if (groups.size === 0) {
      toast.error("No approved qty with a last-purchase supplier");
      return;
    }
    const [, groupRows] = [...groups.entries()][0];
    const remaining = groups.size - 1;
    const source = rows.filter((r) => groupRows.some((g) => g.variantId === r.variant_id));
    await openPurchaseOrder(source);
    if (remaining > 0) {
      toast.message(
        `Opening PO for ${groupRows[0]?.primarySupplier || "vendor"}. ${remaining} other vendor group${remaining === 1 ? "" : "s"} still have approved qty — save this PO, then Bulk Generate again.`,
      );
    }
  }, [openPurchaseOrder, rows, suggestedDefault]);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
        <p className="font-medium text-destructive">Failed to load reorder analysis</p>
        <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
      </div>
    );
  }

  if (isLoading) {
    return <InsightsTableSkeleton columns={8} title="Loading reorder analysis…" />;
  }

  const categories = filterOptions ?? [];

  return (
    <div className={INSIGHTS_TAB_SHELL}>
      <InsightsKpiStrip>
        <InsightsKpiCard
          label="Variants with sales"
          value={stats.total}
          valueFormat="int"
          sub={`${periodDays}-day lookback`}
        />
        <InsightsKpiCard
          label="Need reorder"
          value={stats.needReorder}
          valueFormat="int"
          sub={`Cover ${REORDER_COVER_DAYS} days (no vendor lead time in v1)`}
          tone={stats.needReorder > 0 ? "attention" : "neutral"}
        />
        <InsightsKpiCard
          label="Under 2 days left"
          value={stats.critical}
          valueFormat="int"
          sub={`${stats.suppliers} last-purchase vendors`}
          tone={stats.critical > 0 ? "critical" : "neutral"}
        />
      </InsightsKpiStrip>

      <InsightsPanel
        className="flex-1 min-h-0"
        title="Reorder Analysis"
        subtitle="Items with sales in the lookback. Suggested qty targets 30 days of stock plus a 5-day buffer."
        stickyFirstColumn
        toolbar={
          <div className="flex flex-wrap items-end gap-3 w-full">
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lookback</Label>
              <div className="flex gap-1">
                {REORDER_PERIOD_OPTIONS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={periodDays === d ? "default" : "outline"}
                    onClick={() => setPeriodDays(d)}
                    className="h-8 text-xs px-2.5"
                  >
                    {d}d
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1 min-w-[10rem]">
              <Label htmlFor="reorder-category" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Category
              </Label>
              <Select
                value={category ?? "all"}
                onValueChange={(v) => setCategory(v === "all" ? null : v)}
              >
                <SelectTrigger id="reorder-category" className="h-8 w-[12rem]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 ml-auto"
              disabled={openingPo || rows.length === 0}
              onClick={() => void handleBulkGenerate()}
            >
              <PackagePlus className="h-4 w-4 mr-1" />
              Bulk Generate Vendor POs
            </Button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="py-16 text-center text-base text-muted-foreground">
            No items with sales in this period
          </p>
        ) : (
          <Table className="w-full min-w-max">
            <InsightsTableHeader>
              <TableHead className={INSIGHTS_NEUTRAL_TH}>Item</TableHead>
              <TableHead className={INSIGHTS_NEUTRAL_TH}>Variant</TableHead>
              <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Stock</TableHead>
              <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Avg daily</TableHead>
              <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Days left</TableHead>
              <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Suggested</TableHead>
              <TableHead className={cn(INSIGHTS_NEUTRAL_TH, "text-right")}>Approved qty</TableHead>
              <TableHead className={INSIGHTS_NEUTRAL_TH}>Create PO</TableHead>
            </InsightsTableHeader>
            <TableBody>
              {rows.map((row) => {
                const days = row.days_of_stock_left === null ? null : num(row.days_of_stock_left);
                const tone = daysRemainingTone(days);
                const approved = suggestedDefault(row);
                return (
                  <TableRow key={row.variant_id} className={INSIGHTS_BODY_ROW}>
                    <TableCell className={cn(INSIGHTS_BODY_CELL, "font-medium")}>
                      <div>{productLabel(row)}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.primary_supplier || "No last-purchase vendor"}
                      </div>
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>{variantLabel(row)}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>{num(row.current_stock)}</TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                      {num(row.avg_daily_sales).toFixed(2)}
                    </TableCell>
                    <TableCell className={cn(INSIGHTS_BODY_CELL_NUM)}>
                      <Badge variant="outline" className={cn("font-semibold tabular-nums", DAYS_BADGE[tone])}>
                        {days === null ? "—" : days}
                      </Badge>
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                      {Math.round(num(row.suggested_reorder_qty))}
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL_NUM}>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={approved}
                        onChange={(e) => {
                          const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setApprovedQty((prev) => ({ ...prev, [row.variant_id]: v }));
                        }}
                        className="h-8 w-20 ml-auto text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell className={INSIGHTS_BODY_CELL}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={openingPo || approved <= 0 || !row.primary_supplier_id}
                        onClick={() => void openPurchaseOrder([row])}
                      >
                        Create PO
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </InsightsPanel>
    </div>
  );
}

function useQueryCategories(orgId: string | undefined) {
  return useQuery({
    queryKey: ["product-filter-options", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_filter_options", {
        p_org_id: orgId!,
      });
      if (error) throw error;
      const payload = (data ?? {}) as { categories?: string[] };
      return (payload.categories ?? []).filter((c) => Boolean(c && c.trim()));
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!orgId,
  });
}