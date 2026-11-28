import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { variantPickerLabel, type PickedVariant } from "@/lib/variantPickerLabel";

/** Pick one item (size) by barcode or name — Repack, Wastage. */
export function VariantPicker({
  label,
  organizationId,
  value,
  onChange,
  testId,
}: {
  label: string;
  organizationId: string;
  value: PickedVariant | null;
  onChange: (it: PickedVariant | null) => void;
  testId: string;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickedVariant[]>([]);

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
      let rows = (byBarcode.data ?? []) as unknown as PickedVariant[];
      if (rows.length === 0) {
        const byName = await base().ilike("products.product_name", `%${q.replace(/[%_,]/g, "")}%`);
        rows = (byName.data ?? []) as unknown as PickedVariant[];
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
            <span className="font-semibold">{variantPickerLabel(value)}</span>
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
                  {variantPickerLabel(it)} <span className="text-muted-foreground">· {it.barcode || "—"} · stock {Number(it.stock_qty) || 0}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

