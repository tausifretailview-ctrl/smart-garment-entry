import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  findNameMergeGroups,
  mergeProductsIntoKeep,
  type NameMergeGroup,
} from "@/utils/productNameStockMerge";

interface MergeDuplicateProductNamesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onMergeComplete: () => void;
}

type GroupChoice = { keepId: string; sourceIds: Set<string> };

const identity = (brand: string | null, style: string | null) =>
  [brand?.trim(), style?.trim()].filter(Boolean).join(" · ") || "no brand / style";

/**
 * Look-alike product names (ELN-DUP / ELN-Dup / ELN.DUP): the user picks the product
 * to keep and ticks the ones to merge into it. Merge moves sizes, stock and bill
 * history (merge_products), so stock is no longer split.
 */
export function MergeDuplicateProductNamesDialog({
  open,
  onOpenChange,
  organizationId,
  onMergeComplete,
}: MergeDuplicateProductNamesDialogProps) {
  const [loading, setLoading] = useState(false);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [groups, setGroups] = useState<NameMergeGroup[]>([]);
  const [choices, setChoices] = useState<Record<string, GroupChoice>>({});

  const load = () => {
    let cancelled = false;
    setLoading(true);
    findNameMergeGroups(organizationId)
      .then((found) => {
        if (cancelled) return;
        setGroups(found);
        setChoices(
          Object.fromEntries(
            found.map((g) => [g.key, { keepId: g.keepId, sourceIds: new Set(g.suggestedSourceIds) }]),
          ),
        );
      })
      .catch((err: unknown) => {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Failed to scan product names");
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    if (!open || !organizationId) return;
    return load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId]);

  const setKeep = (key: string, keepId: string) =>
    setChoices((prev) => {
      const cur = prev[key];
      const sourceIds = new Set(cur?.sourceIds ?? []);
      sourceIds.delete(keepId);
      return { ...prev, [key]: { keepId, sourceIds } };
    });

  const toggleSource = (key: string, id: string, on: boolean) =>
    setChoices((prev) => {
      const cur = prev[key];
      const sourceIds = new Set(cur?.sourceIds ?? []);
      if (on) sourceIds.add(id);
      else sourceIds.delete(id);
      return { ...prev, [key]: { keepId: cur?.keepId ?? "", sourceIds } };
    });

  const handleMergeGroup = async (group: NameMergeGroup) => {
    const choice = choices[group.key];
    if (!choice || choice.sourceIds.size === 0) return;
    const keep = group.products.find((p) => p.id === choice.keepId);
    setMergingKey(group.key);
    try {
      const { merged } = await mergeProductsIntoKeep({
        organizationId,
        keepId: choice.keepId,
        sourceIds: [...choice.sourceIds],
        canonical: keep?.productName ?? group.canonical,
      });
      toast.success(`Merged ${merged} product(s) into "${keep?.productName ?? group.canonical}" — stock combined`);
      onMergeComplete();
      load();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Merge failed");
      load();
    } finally {
      setMergingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge look-alike product names</DialogTitle>
          <DialogDescription>
            Products whose names differ only by capitals, spaces or - _ . / (e.g. ELN-DUP and ELN-Dup).
            Pick the product to keep and tick the ones to merge into it: their sizes, stock and bill
            history move to the kept product, and the merged ones go to the Recycle Bin. Products with a
            different brand or style are not ticked — tick them only if they are really the same item.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning product names…
            </div>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No look-alike product names found.</p>
          ) : (
            groups.map((g) => {
              const choice = choices[g.key];
              const busy = mergingKey === g.key;
              return (
                <div key={g.key} className="rounded-lg border p-3 text-sm" data-testid="name-merge-group">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold">{g.canonical}</span>
                    <Badge variant="secondary">{g.products.length} products</Badge>
                  </div>
                  <div className="space-y-1">
                    {g.products.map((p) => {
                      const isKeep = choice?.keepId === p.id;
                      return (
                        <div key={p.id} className="flex flex-wrap items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="radio"
                              name={`keep-${g.key}`}
                              checked={isKeep}
                              onChange={() => setKeep(g.key, p.id)}
                              disabled={busy}
                            />
                            Keep
                          </label>
                          <Checkbox
                            checked={!isKeep && !!choice?.sourceIds.has(p.id)}
                            onCheckedChange={(v) => toggleSource(g.key, p.id, v === true)}
                            disabled={isKeep || busy}
                            aria-label={`Merge ${p.productName}`}
                          />
                          <span className="font-medium">"{p.productName}"</span>
                          <span className="text-xs text-muted-foreground">{identity(p.brand, p.style)}</span>
                          <span className="ml-auto text-xs tabular-nums">
                            Stock {p.stock} · {p.variantCount} size(s)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleMergeGroup(g)}
                      disabled={busy || !!mergingKey || !choice || choice.sourceIds.size === 0}
                    >
                      {busy ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Merging…
                        </>
                      ) : (
                        `Merge ${choice?.sourceIds.size ?? 0} into kept product`
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={!!mergingKey}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
