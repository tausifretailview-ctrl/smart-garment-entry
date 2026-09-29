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
import {
  findDuplicateProductNameGroups,
  mergeDuplicateProductNames,
  type ProductNameDuplicateGroup,
} from "@/utils/productNameMerge";

interface MergeDuplicateProductNamesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onMergeComplete: () => void;
}

/** Shows a stored name with its hidden spaces visible, e.g. "SHIRT␣". */
const showSpaces = (name: string) =>
  `"${name.replace(/ /g, "␣").replace(/[   　]/g, "⍽").replace(/[​-‍⁠﻿]/g, "¤")}"`;

export function MergeDuplicateProductNamesDialog({
  open,
  onOpenChange,
  organizationId,
  onMergeComplete,
}: MergeDuplicateProductNamesDialogProps) {
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [groups, setGroups] = useState<ProductNameDuplicateGroup[]>([]);

  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    setLoading(true);
    findDuplicateProductNameGroups(organizationId)
      .then((found) => {
        if (!cancelled) setGroups(found);
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
  }, [open, organizationId]);

  const handleMerge = async () => {
    if (groups.length === 0) return;
    setMerging(true);
    try {
      const result = await mergeDuplicateProductNames(organizationId, groups);
      toast.success(`Merged ${result.groupsMerged} name group(s) — ${result.productsUpdated} products renamed`);
      onOpenChange(false);
      onMergeComplete();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge duplicate product names</DialogTitle>
          <DialogDescription>
            Names that differ only by spaces, letter case or hidden characters (e.g. SHIRT twice) get one
            spelling, so stock reports show one combined total. Only the name changes — products, sizes,
            barcodes, stock and bills stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[40vh] space-y-2 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning product names…
            </div>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No duplicate product name spellings found.</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold">{g.canonical}</span>
                  <Badge variant="secondary">{g.productCount} products</Badge>
                </div>
                <p className="break-all text-xs text-muted-foreground">
                  Merge: {g.variants.map(showSpaces).join(" · ")} → {showSpaces(g.canonical)}
                </p>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={merging}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleMerge()} disabled={merging || loading || groups.length === 0}>
            {merging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging…
              </>
            ) : (
              `Merge ${groups.length} group(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
