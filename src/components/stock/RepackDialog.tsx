import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { repackStock, repackUnitCost, type RepackDb } from "@/lib/data/repackStock";

/**
 * Stock Adjustment → Repack (supermarket go-live, Nov 2026): one 50 kg sack of sugar into
 * 50 packets of 1 kg. Stock goes out of the bulk item and into the packet item in one step;
 * the packets' cost is the bulk used plus packing.
 */
type Item = {
  id: string;
  barcode: string | null;
  size: string | null;
  stock_qty: number | null;
  pur_price: number | null;
  products: { product_name: string; uom: string | null } | null;
};

function itemLabel(it: Item): string {
  const size = it.size && it.size !== "None" ? ` (${it.size})` : "";
  return `${it.products?.product_name ?? "Item"}${size}`;
}

function ItemPicker({
  label,
  organizationId,
  value,
  onChange,
  testId,
}: {
  label: string;
  organizationId: string;
  value: Item | null;
  onChange: (it: Item | null) => void;
  testId: string;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Item[]>([]);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const base = () =>
        supabase
          .from("product_variants")
          .select("id, barcode, size, stock_qty, pur_price, products!inner(product_name, uom)")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .limit(8);
      const byBarcode = await base().eq("barcode", q);
      let rows = (byBarcode.data ?? []) as unknown as Item[];
      if (rows.length === 0) {
        const byName = await base().ilike("products.product_name", `%${q.replace(/[%_,]/g, "")}%`);
        rows = (byName.data ?? []) as unknown as Item[];
      }
      if (live) setResults(rows);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [term, organizationId]);

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-center justify-between rounded-md border bg-slate-50 px-2.5 py-1.5 text-sm">
          <span>
            <span className="font-semibold">{itemLabel(value)}</span>
            <span className="text-muted-foreground">
              {" "}
              · stock {Number(value.stock_qty) || 0} {value.products?.uom || ""} · cost ₹{Number(value.pur_price) || 0}
            </span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Change
          </Button>
        </div>
      ) : (
        <>
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Scan barcode or type item name" />
          {results.length > 0 ? (
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {results.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    onChange(it);
                    setTerm("");
                    setResults([]);
                  }}
                >
                  {itemLabel(it)} <span className="text-muted-foreground">· {it.barcode || "—"} · stock {Number(it.stock_qty) || 0}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function RepackDialog({
  open,
  onOpenChange,
  organizationId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onDone?: () => void;
}) {
  const [from, setFrom] = useState<Item | null>(null);
  const [to, setTo] = useState<Item | null>(null);
  const [fromQty, setFromQty] = useState("");
  const [toQty, setToQty] = useState("");
  const [packing, setPacking] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fq = Number(fromQty) || 0;
  const tq = Number(toQty) || 0;
  const unitCost = repackUnitCost(fq, Number(from?.pur_price) || 0, tq, Number(packing) || 0);
  const canSave = !!from && !!to && from.id !== to.id && fq > 0 && tq > 0 && !saving;

  const save = async () => {
    if (!from || !to) return;
    setSaving(true);
    try {
      const res = await repackStock(supabase as unknown as RepackDb, {
        organizationId,
        fromVariantId: from.id,
        fromQty: fq,
        toVariantId: to.id,
        toQty: tq,
        packingCost: Number(packing) || 0,
        notes,
      });
      toast.success(`Repacked (${res.billNumber})`, {
        description: `${itemLabel(to)}: stock ${res.toStockAfter}, cost ₹${res.toPurPrice}. ${itemLabel(from)}: stock ${res.fromStockAfter}.`,
      });
      setFrom(null);
      setTo(null);
      setFromQty("");
      setToQty("");
      setPacking("");
      setNotes("");
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error("Repack not saved", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Repack</DialogTitle>
          <DialogDescription>Break bulk stock into packets, e.g. one 50 kg sack into 50 packets of 1 kg.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ItemPicker label="Take from (bulk item)" organizationId={organizationId} value={from} onChange={setFrom} testId="repack-from" />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="repack-from-qty">Quantity taken {from?.products?.uom ? `(${from.products.uom})` : ""}</Label>
              <Input id="repack-from-qty" inputMode="decimal" value={fromQty} onChange={(e) => setFromQty(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repack-packing">Packing cost ₹ (optional)</Label>
              <Input id="repack-packing" inputMode="decimal" value={packing} onChange={(e) => setPacking(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
          </div>
          <ItemPicker label="Make (packet item)" organizationId={organizationId} value={to} onChange={setTo} testId="repack-to" />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="repack-to-qty">Packets made {to?.products?.uom ? `(${to.products.uom})` : ""}</Label>
              <Input id="repack-to-qty" inputMode="decimal" value={toQty} onChange={(e) => setToQty(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repack-notes">Note</Label>
              <Input id="repack-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          {from && to && fq > 0 && tq > 0 ? (
            <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-900" data-testid="repack-preview">
              Cost of each new packet: ₹{unitCost} (bulk ₹{Number(from.pur_price) || 0} × {fq}
              {Number(packing) > 0 ? ` + packing ₹${Number(packing)}` : ""} ÷ {tq})
            </p>
          ) : null}
          {from && to && from.id === to.id ? <p className="text-sm text-destructive">Pick two different items.</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void save()}>
            {saving ? "Saving…" : "Repack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
