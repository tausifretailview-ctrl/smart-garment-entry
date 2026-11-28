import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { repackStock, repackUnitCost, type RepackDb } from "@/lib/data/repackStock";
import { VariantPicker as ItemPicker } from "@/components/stock/VariantPicker";
import { variantPickerLabel as itemLabel, type PickedVariant as Item } from "@/lib/variantPickerLabel";

/**
 * Stock Adjustment → Repack (supermarket go-live, Nov 2026): one 50 kg sack of sugar into
 * 50 packets of 1 kg. Stock goes out of the bulk item and into the packet item in one step;
 * the packets' cost is the bulk used plus packing.
 */
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
