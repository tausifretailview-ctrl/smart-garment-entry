import { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  findDuplicateProductGroups,
  consolidateDuplicateProducts,
  type ProductDuplicateGroup,
  type ConsolidateProductsResult,
} from "@/utils/productMergeUtils";

interface MergeDuplicateProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onMergeComplete: () => void;
}

type Stage = "scanning" | "review" | "previewing" | "previewed" | "merging" | "done";

export function MergeDuplicateProductsDialog({
  open,
  onOpenChange,
  organizationId,
  onMergeComplete,
}: MergeDuplicateProductsDialogProps) {
  const [stage, setStage] = useState<Stage>("scanning");
  const [groups, setGroups] = useState<ProductDuplicateGroup[]>([]);
  const [preview, setPreview] = useState<ConsolidateProductsResult | null>(null);
  const [finalResult, setFinalResult] = useState<ConsolidateProductsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    setStage("scanning");
    setPreview(null);
    setFinalResult(null);
    setError(null);
    void (async () => {
      try {
        const found = await findDuplicateProductGroups(organizationId);
        if (!cancelled) {
          setGroups(found);
          setStage("review");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error(err);
          setError(err instanceof Error ? err.message : "Failed to scan products");
          setGroups([]);
          setStage("review");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  const handlePreview = async () => {
    setStage("previewing");
    setError(null);
    try {
      const result = await consolidateDuplicateProducts(organizationId, true);
      setPreview(result);
      setStage("previewed");
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Preview failed — the merge tool may not be deployed yet",
      );
      setStage("review");
    }
  };

  const handleConfirmMerge = async () => {
    setStage("merging");
    setError(null);
    try {
      const result = await consolidateDuplicateProducts(organizationId, false);
      setFinalResult(result);
      setStage("done");
      toast.success(
        `Merged ${result.groupsMerged} group(s) — ${result.variantsMoved} variant(s) moved, ${result.productsRetired} duplicate product(s) retired`,
      );
      onMergeComplete();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Merge failed");
      setStage("previewed");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const totalConflictVariants =
    preview?.conflicts.reduce((s, c) => s + c.conflictingVariants.length, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge duplicate products</DialogTitle>
          <DialogDescription>
            Finds products whose names are the same once spacing/punctuation
            differences are ignored (e.g. "FLEXI NL" / "FLEXI /NL" / "FLEXI / NL"),
            moves every variant onto one canonical product, and retires the
            others. Variants that would collide (same size + color already
            exists on the canonical product) are left untouched and listed
            for manual review — never silently combined.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {stage === "scanning" && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Scanning products for duplicates…
          </div>
        )}

        {stage === "review" && groups.length === 0 && !error && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No duplicate product names found.
          </div>
        )}

        {(stage === "review" || stage === "previewing") && groups.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Found {groups.length} group(s) of duplicate product names:
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.compactName} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {g.productNames.map((name, i) => (
                      <Badge
                        key={g.productIds[i]}
                        variant={i === 0 ? "default" : "secondary"}
                      >
                        {name} ({g.variantCounts[i]} variant
                        {g.variantCounts[i] === 1 ? "" : "s"})
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Canonical (kept): <strong>{g.canonicalName}</strong>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {stage === "previewed" && preview && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p>
                <strong>{preview.groupsMerged}</strong> group(s) will be merged
              </p>
              <p>
                <strong>{preview.variantsMoved}</strong> variant(s) will move
                to their canonical product
              </p>
              <p>
                <strong>{preview.productsRetired}</strong> duplicate product
                record(s) will be retired (only once fully empty)
              </p>
            </div>
            {totalConflictVariants > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
                <p className="flex items-center gap-1.5 font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  {totalConflictVariants} variant(s) need manual review
                </p>
                <p className="text-xs text-amber-800">
                  These have the same size + color as an existing variant on
                  the canonical product, so they won't be auto-merged — their
                  product record will stay (not retired) until you resolve
                  these by hand.
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {preview.conflicts.flatMap((c) =>
                    c.conflictingVariants.map((v) => (
                      <p key={v.variantId} className="text-xs font-mono text-amber-900">
                        barcode {v.barcode || "—"} · {v.size || "—"} /{" "}
                        {v.color || "—"} · stock {v.stockQty}
                      </p>
                    )),
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {stage === "done" && finalResult && (
          <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm space-y-1">
            <p className="font-medium text-green-800">Merge complete</p>
            <p>
              {finalResult.groupsMerged} group(s) merged ·{" "}
              {finalResult.variantsMoved} variant(s) moved ·{" "}
              {finalResult.productsRetired} product(s) retired
            </p>
            {finalResult.conflicts.length > 0 && (
              <p className="text-amber-700">
                {finalResult.conflicts.reduce(
                  (s, c) => s + c.conflictingVariants.length,
                  0,
                )}{" "}
                variant(s) still need manual review (see above before closing).
              </p>
            )}
          </div>
        )}

        <Separator />

        <DialogFooter>
          {stage !== "done" && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {(stage === "review" || stage === "previewing") && groups.length > 0 && (
            <Button onClick={handlePreview} disabled={stage === "previewing"}>
              {stage === "previewing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Previewing…
                </>
              ) : (
                "Preview merge (dry run)"
              )}
            </Button>
          )}
          {stage === "previewed" && (
            <Button onClick={handleConfirmMerge}>Confirm &amp; apply merge</Button>
          )}
          {stage === "merging" && (
            <Button disabled>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Merging…
            </Button>
          )}
          {stage === "done" && <Button onClick={handleClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
