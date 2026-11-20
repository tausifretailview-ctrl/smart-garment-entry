import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchAllRows } from "@/lib/data/fetchInIdBatches";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { clampMarkdownPercent, normalizeBrandKey } from "@/lib/markdown";
import {
  deleteBrandMarkdown,
  invalidateMarkdownQueries,
  saveBrandMarkdown,
  useBrandMarkdowns,
  type BrandMarkdown,
} from "@/lib/data/markdowns";

/**
 * Brand-wise markdown % (wholesale): taken off the sale price on the Sale Bill before any extra
 * discount. A product's own Markdown % wins over its brand's.
 */
export function BrandMarkdownDialog({
  open,
  onOpenChange,
  initialBrand,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the new row with this brand (e.g. the brand typed in Add Product). */
  initialBrand?: string;
}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useBrandMarkdowns({ enabled: open });
  const [brand, setBrand] = useState("");
  const [percent, setPercent] = useState("");
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open && initialBrand) setBrand((b) => b || initialBrand);
  }, [open, initialBrand]);

  const { data: brandOptions = [] } = useQuery({
    queryKey: ["markdown-brand-options", orgId],
    enabled: open && !!orgId,
    staleTime: STALE_SETTINGS,
    queryFn: async () => {
      const list = await fetchAllRows<{ id: string; brand: string | null }>(
        () =>
          supabase
            .from("products")
            .select("id, brand")
            .eq("organization_id", orgId!)
            .is("deleted_at", null)
            .not("brand", "is", null)
            .order("id") as never,
      );
      const seen = new Map<string, string>();
      for (const p of list) {
        const name = String(p.brand ?? "").trim();
        if (name && !seen.has(normalizeBrandKey(name))) seen.set(normalizeBrandKey(name), name);
      }
      return [...seen.values()].sort((a, b) => a.localeCompare(b));
    },
  });

  const configured = useMemo(() => new Set(rows.map((r) => normalizeBrandKey(r.brand))), [rows]);
  const suggestions = brandOptions.filter((b) => !configured.has(normalizeBrandKey(b)));

  const refresh = () => invalidateMarkdownQueries(queryClient, orgId);

  const add = async () => {
    if (!orgId) return;
    const pct = clampMarkdownPercent(percent);
    if (!brand.trim() || !(pct > 0)) {
      toast.error("Enter a brand and a markdown % above 0");
      return;
    }
    setBusy(true);
    try {
      await saveBrandMarkdown(orgId, brand, pct, rows);
      toast.success(`${brand.trim()}: markdown ${pct}%`);
      setBrand("");
      setPercent("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save markdown");
    } finally {
      setBusy(false);
    }
  };

  const update = async (row: BrandMarkdown) => {
    if (!orgId || edits[row.id] === undefined) return;
    const pct = clampMarkdownPercent(edits[row.id]);
    if (pct === row.markdown_percent) return;
    try {
      await saveBrandMarkdown(orgId, row.brand, pct, rows);
      setEdits((e) => {
        const { [row.id]: _drop, ...rest } = e;
        return rest;
      });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save markdown");
    }
  };

  const remove = async (row: BrandMarkdown) => {
    if (!orgId) return;
    try {
      await deleteBrandMarkdown(orgId, row.id);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove markdown");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="brand-markdown-dialog">
        <DialogHeader>
          <DialogTitle>Brand Markdown %</DialogTitle>
          <DialogDescription>
            Taken off the sale price on the Sale Bill before any extra discount (sale price 1800, markdown 25% →
            1350). A product&apos;s own Markdown % wins over its brand&apos;s.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="brand-markdown-brand">Brand</Label>
            <Input
              id="brand-markdown-brand"
              list="brand-markdown-brand-options"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Brand"
              className="no-uppercase"
            />
            <datalist id="brand-markdown-brand-options">
              {suggestions.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor="brand-markdown-percent">Markdown %</Label>
            <Input
              id="brand-markdown-percent"
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
              placeholder="25"
            />
          </div>
          <Button type="button" onClick={() => void add()} disabled={busy} className="gap-1">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No brand markdowns yet.</p>
          ) : (
            <ul className="divide-y" data-testid="brand-markdown-list">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="flex-1 truncate text-sm font-medium">{row.brand}</span>
                  <Input
                    aria-label={`${row.brand} markdown %`}
                    type="number"
                    min="0"
                    max="99.99"
                    step="0.01"
                    className="h-8 w-20 text-right"
                    value={edits[row.id] ?? String(row.markdown_percent)}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    onBlur={() => void update(row)}
                    onKeyDown={(e) => e.key === "Enter" && void update(row)}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    aria-label={`Remove ${row.brand}`}
                    onClick={() => void remove(row)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
