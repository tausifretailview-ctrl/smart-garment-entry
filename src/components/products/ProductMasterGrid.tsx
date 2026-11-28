import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UOM_OPTIONS } from "@/constants/uom";
import { cn } from "@/lib/utils";
import {
  EMPTY_PRODUCT_MASTER_ROW,
  isBlankRow,
  rowProblem,
  saveProductMasterRows,
  type ProductMasterDb,
  type ProductMasterRow,
  type RowResult,
} from "@/lib/data/productMasterRows";
import { fetchProductAttributeLists, type AttributeListsDb } from "@/lib/data/productAttributeLists";
import { invalidateProductDashboardQueries } from "@/utils/invalidateDashboardQueries";

/**
 * Product Master → Create products (Nov 2026): type items row by row like a spreadsheet,
 * picking brands, categories, colours… from the master lists; Save creates them all.
 */
const COLUMNS: Array<{ key: keyof ProductMasterRow; label: string; width: string; list?: string; numeric?: boolean }> = [
  { key: "product_name", label: "Product name *", width: "w-56", list: "product_name" },
  { key: "brand", label: "Brand", width: "w-32", list: "brand" },
  { key: "category", label: "Category", width: "w-32", list: "category" },
  { key: "style", label: "Style", width: "w-28", list: "style" },
  { key: "color", label: "Colour", width: "w-24", list: "color" },
  { key: "size", label: "Size", width: "w-20" },
  { key: "hsn_code", label: "HSN", width: "w-24", list: "hsn" },
  { key: "gst_per", label: "GST %", width: "w-16", numeric: true },
  { key: "uom", label: "Unit", width: "w-20", list: "uom" },
  { key: "pur_price", label: "Pur. price", width: "w-24", numeric: true },
  { key: "sale_price", label: "Sale price", width: "w-24", numeric: true },
  { key: "mrp", label: "MRP", width: "w-20", numeric: true },
  { key: "barcode", label: "Barcode", width: "w-36" },
  { key: "opening_qty", label: "Opening qty", width: "w-20", numeric: true },
];

const START_ROWS = 10;
const blankRows = (n: number) => Array.from({ length: n }, () => ({ ...EMPTY_PRODUCT_MASTER_ROW }));

export function ProductMasterGrid({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const { data: settings } = useSettings();
  const [rows, setRows] = useState<ProductMasterRow[]>(() => blankRows(START_ROWS));
  const [results, setResults] = useState<Record<number, RowResult>>({});
  const [saving, setSaving] = useState(false);

  const { data: lists } = useQuery({
    queryKey: ["product-attribute-lists", organizationId],
    queryFn: () => fetchProductAttributeLists(supabase as unknown as AttributeListsDb, organizationId),
    staleTime: 60_000,
  });
  const datalists = useMemo(
    () => ({
      product_name: lists?.product_name ?? [],
      brand: lists?.brand ?? [],
      category: lists?.category ?? [],
      style: lists?.style ?? [],
      color: lists?.color ?? [],
      hsn: lists?.hsn ?? [],
      uom: UOM_OPTIONS.map((o) => o.value),
    }),
    [lists],
  );

  // Keep a few empty rows at the bottom while the user types.
  useEffect(() => {
    const trailingBlank = [...rows].reverse().findIndex((r) => !isBlankRow(r));
    if (trailingBlank !== -1 && trailingBlank < 2) setRows((prev) => [...prev, ...blankRows(5)]);
  }, [rows]);

  const filled = rows.filter((r) => !isBlankRow(r));
  const setCell = (i: number, key: keyof ProductMasterRow, value: string) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
    setResults((prev) => {
      if (!prev[i]) return prev;
      const next = { ...prev };
      delete next[i];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const purchase = (settings as { purchase_settings?: { default_tax_rate?: number; default_uom?: string } } | null)?.purchase_settings;
      const res = await saveProductMasterRows(supabase as unknown as ProductMasterDb, organizationId, rows, {
        defaultGst: Number(purchase?.default_tax_rate) || 0,
        defaultUom: purchase?.default_uom || "NOS",
        organizationNumber: (currentOrganization as { organization_number?: number } | null)?.organization_number,
      });
      const created = res.filter((r) => r.status === "created").length;
      const skipped = res.filter((r) => r.status === "skipped").length;
      const failed = res.filter((r) => r.status === "error").length;
      // Saved rows leave the sheet; skipped / failed rows stay with their message.
      const keep = new Set(res.filter((r) => r.status !== "created").map((r) => r.index));
      const nextRows: ProductMasterRow[] = [];
      const nextResults: Record<number, RowResult> = {};
      rows.forEach((r, i) => {
        if (isBlankRow(r) || !keep.has(i)) return;
        nextResults[nextRows.length] = res.find((x) => x.index === i)!;
        nextRows.push(r);
      });
      setRows([...nextRows, ...blankRows(START_ROWS)]);
      setResults(nextResults);
      if (created > 0) {
        void invalidateProductDashboardQueries(queryClient, organizationId);
        void queryClient.invalidateQueries({ queryKey: ["product-attribute-values", organizationId] });
        void queryClient.invalidateQueries({ queryKey: ["product-attribute-lists", organizationId] });
      }
      const summary = [`${created} saved`, skipped ? `${skipped} skipped` : "", failed ? `${failed} need fixing` : ""].filter(Boolean).join(", ");
      if (failed) toast.error(summary);
      else toast.success(summary);
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const problems = filled.map(rowProblem).filter(Boolean).length;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground flex-1 min-w-[16rem]">
          One row per item. Rows with the same name, brand, category, style and colour become one product with
          its sizes. A blank barcode gets the next number.
        </p>
        <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, ...blankRows(10)])}>
          <Plus className="h-4 w-4 mr-1" /> 10 rows
        </Button>
        <Button type="button" disabled={saving || filled.length === 0} onClick={() => void save()} data-testid="product-master-save">
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : `Save ${filled.length || ""} item${filled.length === 1 ? "" : "s"}`}
        </Button>
      </div>
      {problems > 0 ? <p className="text-xs text-amber-700">{problems} row(s) need fixing before they save.</p> : null}
      {Object.entries(datalists).map(([id, values]) => (
        <datalist key={id} id={`pm-list-${id}`}>
          {values.slice(0, 2000).map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-max text-sm" data-testid="product-master-grid">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-10 px-2 py-1.5 text-left text-xs font-semibold text-slate-500">#</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={cn("px-1 py-1.5 text-left text-xs font-semibold text-slate-500", c.width)}>
                  {c.label}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const result = results[i];
              const problem = !isBlankRow(r) ? rowProblem(r) : null;
              return (
                <tr key={i} className={cn("border-t", result?.status === "error" || problem ? "bg-red-50/60" : result?.status === "skipped" ? "bg-amber-50/60" : "")}>
                  <td className="px-2 text-xs text-slate-500">{i + 1}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className={cn("px-1 py-0.5", c.width)}>
                      <input
                        aria-label={`${c.label.replace(" *", "")} row ${i + 1}`}
                        value={r[c.key]}
                        list={c.list ? `pm-list-${c.list}` : undefined}
                        inputMode={c.numeric ? "decimal" : undefined}
                        onChange={(e) => setCell(i, c.key, e.target.value)}
                        className={cn(
                          "h-8 w-full rounded border border-slate-200 bg-white px-1.5 text-sm focus:border-primary focus:outline-none",
                          c.numeric && "text-right tabular-nums",
                        )}
                      />
                    </td>
                  ))}
                  <td className="px-1">
                    <button
                      type="button"
                      aria-label={`Clear row ${i + 1}`}
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => setRows((prev) => prev.map((x, j) => (j === i ? { ...EMPTY_PRODUCT_MASTER_ROW } : x)))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {Object.values(results).some((r) => r.message) || problems > 0 ? (
        <ul className="text-xs space-y-0.5" data-testid="product-master-messages">
          {rows.map((r, i) => {
            const msg = results[i]?.message || (!isBlankRow(r) ? rowProblem(r) : null);
            return msg ? (
              <li key={i} className={results[i]?.status === "skipped" ? "text-amber-700" : "text-red-700"}>
                Row {i + 1}: {msg}
              </li>
            ) : null;
          })}
        </ul>
      ) : null}
    </Card>
  );
}
