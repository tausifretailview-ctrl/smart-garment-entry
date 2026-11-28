import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VariantPicker } from "@/components/stock/VariantPicker";
import { variantPickerLabel, type PickedVariant } from "@/lib/variantPickerLabel";
import { istCalendarYmd } from "@/lib/localDayBounds";
import {
  WASTAGE_REASONS,
  fetchWastageRows,
  recordStockWastage,
  reverseStockWastage,
  wastageReasonLabel,
  wastageTotalsByReason,
  type WastageDb,
  type WastageReason,
} from "@/lib/data/stockWastage";
import { invalidateStockReportQueries } from "@/utils/invalidateDashboardQueries";

/**
 * Inventory → Wastage / Damage (supermarket phase 2, Nov 2026): take broken, spoiled,
 * expired or missing stock out with a reason; the report shows quantity and cost by reason.
 */
const db = supabase as unknown as WastageDb;
type Line = { item: PickedVariant; quantity: string; reason: WastageReason; notes: string };

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const StockWastage = () => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const today = istCalendarYmd();
  const [lines, setLines] = useState<Line[]>([]);
  const [picked, setPicked] = useState<PickedVariant | null>(null);
  const [defaultReason, setDefaultReason] = useState<WastageReason>("breakage");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);

  const reportKey = ["stock-wastage", orgId, from, to] as const;
  const { data: rows, isLoading } = useQuery({
    queryKey: reportKey,
    enabled: !!orgId,
    queryFn: () => fetchWastageRows(db, orgId!, from, to),
  });
  const missingSql = rows === null;
  const totals = useMemo(() => wastageTotalsByReason(rows ?? []), [rows]);
  const grandCost = totals.reduce((s, t) => s + t.cost, 0);
  const docs = useMemo(() => {
    const map = new Map<string, NonNullable<typeof rows>>();
    for (const r of rows ?? []) {
      if (!map.has(r.doc_number)) map.set(r.doc_number, []);
      map.get(r.doc_number)!.push(r);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const addPicked = (it: PickedVariant | null) => {
    setPicked(null);
    if (!it) return;
    if (lines.some((l) => l.item.id === it.id)) {
      toast.message("Already on the list", { description: variantPickerLabel(it) });
      return;
    }
    setLines((prev) => [...prev, { item: it, quantity: "1", reason: defaultReason, notes: "" }]);
  };

  const save = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await recordStockWastage(
        db,
        orgId,
        lines.map((l) => ({ variantId: l.item.id, quantity: Number(l.quantity) || 0, reason: l.reason, notes: l.notes })),
        notes,
      );
      toast.success(`Wastage saved (${res.docNumber})`, { description: `${res.totalQty} units · cost ${inr(res.totalCost)}` });
      setLines([]);
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["stock-wastage", orgId] });
      invalidateStockReportQueries(queryClient, orgId);
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const reverse = async (doc: string) => {
    if (!orgId || !window.confirm(`Reverse ${doc}? The stock goes back.`)) return;
    try {
      await reverseStockWastage(db, orgId, doc);
      toast.success(`${doc} reversed`);
      void queryClient.invalidateQueries({ queryKey: ["stock-wastage", orgId] });
      invalidateStockReportQueries(queryClient, orgId);
    } catch (e) {
      toast.error("Not reversed", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const canSave = lines.length > 0 && lines.every((l) => Number(l.quantity) > 0) && !saving && !missingSql;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 overflow-y-auto">
      <div className="flex items-center gap-2">
        <BackToDashboard />
        <Trash2 className="h-5 w-5 text-rose-600" />
        <h1 className="text-xl font-bold">Wastage / Damage</h1>
      </div>
      {missingSql ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
          Run SQL 72 (wastage) in the database first.
        </p>
      ) : null}

      {orgId ? (
        <Card className="p-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
            <VariantPicker label="Item" organizationId={orgId} value={picked} onChange={addPicked} testId="wastage-picker" />
            <div className="space-y-1.5">
              <Label>Reason for new lines</Label>
              <Select value={defaultReason} onValueChange={(v: WastageReason) => setDefaultReason(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WASTAGE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {lines.length > 0 ? (
            <div className="rounded-md border divide-y" data-testid="wastage-lines">
              {lines.map((l, i) => (
                <div key={l.item.id} className="grid items-center gap-2 p-2 md:grid-cols-[1fr_6rem_10rem_1fr_2rem]">
                  <div className="text-sm">
                    <div className="font-semibold">{variantPickerLabel(l.item)}</div>
                    <div className="text-xs text-muted-foreground">
                      stock {Number(l.item.stock_qty) || 0} · cost ₹{Number(l.item.pur_price) || 0}
                    </div>
                  </div>
                  <Input
                    aria-label={`Quantity ${variantPickerLabel(l.item)}`}
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      setLines((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: v } : x)));
                    }}
                  />
                  <Select
                    value={l.reason}
                    onValueChange={(v: WastageReason) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, reason: v } : x)))}
                  >
                    <SelectTrigger aria-label={`Reason ${variantPickerLabel(l.item)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WASTAGE_REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Note (optional)"
                    value={l.notes}
                    onChange={(e) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Scan or search the items that were broken, spoiled, expired or lost.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input className="max-w-md" placeholder="Note for this entry (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <span className="ml-auto text-sm text-muted-foreground">
              Cost{" "}
              {inr(lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.item.pur_price) || 0), 0))}
            </span>
            <Button type="button" disabled={!canSave} onClick={() => void save()} data-testid="wastage-save">
              {saving ? "Saving…" : "Save wastage"}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <h2 className="mr-auto text-base font-bold">Wastage report</h2>
          <div className="space-y-1">
            <Label htmlFor="wst-from" className="text-xs">From</Label>
            <Input id="wst-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wst-to" className="text-xs">To</Label>
            <Input id="wst-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="wastage-totals">
          <div className="rounded-md border bg-rose-50 p-2">
            <div className="text-xs text-rose-700">Total cost</div>
            <div className="text-lg font-bold text-rose-800">{inr(grandCost)}</div>
          </div>
          {totals.map((t) => (
            <div key={t.reason} className="rounded-md border p-2">
              <div className="text-xs text-muted-foreground">{wastageReasonLabel(t.reason)}</div>
              <div className="font-semibold">{inr(t.cost)}</div>
              <div className="text-xs text-muted-foreground">{t.quantity} units · {t.lines} line(s)</div>
            </div>
          ))}
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        <div className="space-y-2">
          {docs.map(([doc, docRows]) => {
            const reversed = docRows.every((r) => r.reversed_at);
            return (
              <div key={doc} className={reversed ? "rounded-md border p-2 opacity-60" : "rounded-md border p-2"}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-semibold">{doc}</span>
                  <span className="text-muted-foreground">{docRows[0].wasted_on}</span>
                  {reversed ? <span className="text-xs font-semibold text-slate-500">REVERSED</span> : null}
                  {!reversed ? (
                    <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => void reverse(doc)}>
                      <Undo2 className="h-3.5 w-3.5 mr-1" /> Reverse
                    </Button>
                  ) : null}
                </div>
                <div className="mt-1 divide-y text-sm">
                  {docRows.map((r) => (
                    <div key={r.id} className="flex gap-2 py-1">
                      <span className="flex-1">
                        {r.product_variants?.products?.product_name ?? "Item"}
                        {r.product_variants?.size && r.product_variants.size !== "None" ? ` (${r.product_variants.size})` : ""}
                        {r.notes ? <span className="text-muted-foreground"> · {r.notes}</span> : null}
                      </span>
                      <span className="w-32 text-muted-foreground">{wastageReasonLabel(r.reason)}</span>
                      <span className="w-16 text-right">{Number(r.quantity)}</span>
                      <span className="w-24 text-right">{inr(Number(r.cost_value))}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {!isLoading && docs.length === 0 && !missingSql ? <p className="text-sm text-muted-foreground">No wastage in these dates.</p> : null}
        </div>
      </Card>
    </div>
  );
};

export default StockWastage;
