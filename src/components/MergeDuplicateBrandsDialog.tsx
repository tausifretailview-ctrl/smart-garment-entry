import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  findDuplicateBrandGroups,
  type BrandDuplicateGroup,
} from "@/utils/productBrandUtils";

interface MergeDuplicateBrandsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onMergeComplete: () => void;
}

export function MergeDuplicateBrandsDialog({
  open,
  onOpenChange,
  organizationId,
  onMergeComplete,
}: MergeDuplicateBrandsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [groups, setGroups] = useState<BrandDuplicateGroup[]>([]);

  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const found = await findDuplicateBrandGroups(organizationId);
        if (!cancelled) setGroups(found);
      } catch (err: unknown) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Failed to scan brands");
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  const handleMerge = async () => {
    if (!organizationId || groups.length === 0) return;
    setMerging(true);
    try {
      const { data, error } = await supabase.rpc("consolidate_duplicate_brands" as never, {
        p_org_id: organizationId,
      } as never);
      if (error) throw error;
      const result = (data || {}) as {
        groups_merged?: number;
        products_updated?: number;
        discounts_updated?: number;
      };
      toast.success(
        `Merged ${result.groups_merged ?? groups.length} brand group(s) — ${result.products_updated ?? 0} products updated`,
      );
      onOpenChange(false);
      onMergeComplete();
    } catch (err: unknown) {
      // Fallback if RPC not deployed yet
      try {
        const { consolidateDuplicateBrands } = await import("@/utils/productBrandUtils");
        const result = await consolidateDuplicateBrands(organizationId, groups);
        toast.success(
          `Merged ${result.groupsMerged} brand group(s) — ${result.productsUpdated} products updated`,
        );
        onOpenChange(false);
        onMergeComplete();
      } catch (fallbackErr: unknown) {
        console.error(fallbackErr);
        toast.error(
          fallbackErr instanceof Error
            ? fallbackErr.message
            : err instanceof Error
              ? err.message
              : "Merge failed",
        );
      }
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge duplicate brands</DialogTitle>
          <DialogDescription>
            Brands that differ only by spaces or letter case (e.g. BIN HANIF twice) are merged into one
            name. Stock reports then show a single combined total.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[40vh] space-y-2 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning brands…
            </div>
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No duplicate brand spellings found.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold">{g.canonical}</span>
                  <Badge variant="secondary">{g.productCount} products</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Merge: {g.variants.join(" · ")} → {g.canonical}
                </p>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={merging}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleMerge}
            disabled={merging || loading || groups.length === 0}
          >
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
