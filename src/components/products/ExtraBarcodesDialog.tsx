import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addExtraBarcode,
  listExtraBarcodes,
  removeExtraBarcode,
  type ExtraBarcodeRow,
  type VariantBarcodesDb,
} from "@/lib/data/variantBarcodes";

/**
 * Product Dashboard → ⋯ → Extra barcodes (supermarket go-live, Nov 2026).
 * More company barcodes for the same item: a new pack's EAN, an old carton, the scale's
 * item code. POS, Sale Bill and Purchase find the item by any of them.
 */
type VariantRow = { id: string; size: string | null; color: string | null; barcode: string | null };

const db = supabase as unknown as VariantBarcodesDb;

export function ExtraBarcodesDialog({
  open,
  onOpenChange,
  organizationId,
  productId,
  productName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  productId: string;
  productName: string;
}) {
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [extras, setExtras] = useState<ExtraBarcodeRow[]>([]);
  const [missingTable, setMissingTable] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, size, color, barcode")
      .eq("organization_id", organizationId)
      .eq("product_id", productId)
      .is("deleted_at", null)
      .order("size");
    if (error) {
      toast.error("Could not load the item", { description: error.message });
      return;
    }
    const rows = (data ?? []) as VariantRow[];
    setVariants(rows);
    try {
      const res = await listExtraBarcodes(db, organizationId, rows.map((r) => r.id));
      setExtras(res.rows);
      setMissingTable(res.missingTable);
    } catch (e) {
      toast.error("Could not load extra barcodes", { description: e instanceof Error ? e.message : undefined });
    }
  }, [organizationId, productId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const add = async (variantId: string) => {
    const code = (drafts[variantId] || "").trim();
    if (!code) return;
    setBusy(true);
    try {
      const row = await addExtraBarcode(db, organizationId, variantId, code);
      setExtras((prev) => [...prev, row]);
      setDrafts((prev) => ({ ...prev, [variantId]: "" }));
    } catch (e) {
      toast.error("Barcode not added", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: ExtraBarcodeRow) => {
    setBusy(true);
    try {
      await removeExtraBarcode(db, organizationId, row.id);
      setExtras((prev) => prev.filter((x) => x.id !== row.id));
    } catch (e) {
      toast.error("Barcode not removed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Extra barcodes — {productName}</DialogTitle>
          <DialogDescription>
            More company barcodes for the same item (new pack, old carton, scale item code). Scanning any of them
            bills this item.
          </DialogDescription>
        </DialogHeader>
        {missingTable ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
            Run SQL 69 (extra barcodes) in the database first.
          </p>
        ) : null}
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {variants.map((v) => {
            const mine = extras.filter((x) => x.variant_id === v.id);
            const label = [v.size && v.size !== "None" ? v.size : "", v.color || ""].filter(Boolean).join(" · ");
            return (
              <div key={v.id} className="rounded-lg border p-2.5" data-testid="extra-barcodes-variant">
                <div className="text-sm font-medium">
                  {v.barcode || "—"} {label ? <span className="text-muted-foreground">({label})</span> : null}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {mine.map((x) => (
                    <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                      {x.barcode}
                      <button
                        type="button"
                        aria-label={`Remove ${x.barcode}`}
                        disabled={busy}
                        onClick={() => void remove(x)}
                        className="text-slate-500 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={drafts[v.id] || ""}
                    placeholder="Scan or type another barcode"
                    aria-label="New extra barcode"
                    disabled={busy || missingTable}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [v.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void add(v.id);
                      }
                    }}
                  />
                  <Button type="button" disabled={busy || missingTable} onClick={() => void add(v.id)}>
                    Add
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
