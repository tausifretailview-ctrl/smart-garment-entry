import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { ProductMergeCombobox } from "@/components/ProductMergeCombobox";
import {
  findSafeMergeSuggestions,
  listOrgProductsForMerge,
  mergeTwoProducts,
  type ProductDuplicateGroup,
  type ProductPickerResult,
  type MergeTwoProductsResult,
} from "@/utils/productMergeUtils";

interface MergeDuplicateProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onMergeComplete: () => void;
  embedded?: boolean;
  initialSource?: ProductPickerResult | null;
  initialTarget?: ProductPickerResult | null;
}

type Stage = "idle" | "previewing" | "previewed" | "merging" | "done";

function MergeProductsBody({
  organizationId,
  onMergeComplete,
  onClose,
  showClose,
  initialSource,
  initialTarget,
}: {
  organizationId: string;
  onMergeComplete: () => void;
  onClose: () => void;
  showClose: boolean;
  initialSource?: ProductPickerResult | null;
  initialTarget?: ProductPickerResult | null;
}) {
  const [products, setProducts] = useState<ProductPickerResult[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [source, setSource] = useState<ProductPickerResult | null>(initialSource ?? null);
  const [target, setTarget] = useState<ProductPickerResult | null>(initialTarget ?? null);
  const [suggestions, setSuggestions] = useState<ProductDuplicateGroup[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<MergeTwoProductsResult | null>(null);
  const [finalResult, setFinalResult] = useState<MergeTwoProductsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    setStage("idle");
    setPreview(null);
    setFinalResult(null);
    setError(null);
    setLoadingList(true);
    void (async () => {
      try {
        const [list, safe] = await Promise.all([
          listOrgProductsForMerge(organizationId),
          findSafeMergeSuggestions(organizationId),
        ]);
        setProducts(list);
        setSuggestions(safe);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingList(false);
      }
    })();
  }, [organizationId]);

  useEffect(() => {
    if (initialSource) setSource(initialSource);
    if (initialTarget) setTarget(initialTarget);
  }, [initialSource, initialTarget]);

  const handlePreview = async () => {
    if (!source || !target) return;
    setStage("previewing");
    setError(null);
    try {
      const result = await mergeTwoProducts(organizationId, source.id, target.id, true);
      setPreview(result);
      setStage("previewed");
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Preview failed — the merge tool may not be deployed yet",
      );
      setStage("idle");
    }
  };

  const handleConfirmMerge = async () => {
    if (!source || !target) return;
    setStage("merging");
    setError(null);
    try {
      const result = await mergeTwoProducts(organizationId, source.id, target.id, false);
      setFinalResult(result);
      setStage("done");
      toast.success(
        `Moved ${result.variantsMoved} variant(s) into "${result.targetProductName}"` +
          (result.sourceRetired ? ` — "${result.sourceProductName}" retired` : ""),
      );
      onMergeComplete();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Merge failed");
      setStage("previewed");
    }
  };

  const canPreview = !!source && !!target && source.id !== target.id;
  const busy = stage === "previewing" || stage === "merging" || loadingList;

  return (
    <>
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {stage !== "done" && (
        <div className="space-y-3">
          <ProductMergeCombobox
            label="Merge FROM (will be retired once empty)"
            products={products}
            selected={source}
            excludeId={target?.id}
            onSelect={(p) => {
              setSource(p);
              setStage("idle");
              setPreview(null);
            }}
            disabled={busy}
            placeholder={loadingList ? "Loading products…" : "Select product to retire…"}
          />
          <div className="flex justify-center">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <ProductMergeCombobox
            label="INTO (kept, canonical product)"
            products={products}
            selected={target}
            excludeId={source?.id}
            onSelect={(p) => {
              setTarget(p);
              setStage("idle");
              setPreview(null);
            }}
            disabled={busy}
            placeholder={loadingList ? "Loading products…" : "Select product to keep…"}
          />
        </div>
      )}

      {stage !== "done" && suggestions.length > 0 && !source && !target && (
        <div className="space-y-2">
          <Separator />
          <p className="text-xs text-muted-foreground">
            Possible matches (exact pairs only — click to fill both fields
            for review; nothing merges automatically):
          </p>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {suggestions.map((g) => (
              <Badge
                key={g.compactName}
                variant="outline"
                className="cursor-pointer hover:bg-accent"
                onClick={() => {
                  setTarget({
                    id: g.productIds[0],
                    productName: g.productNames[0],
                    variantCount: g.variantCounts[0],
                  });
                  setSource({
                    id: g.productIds[1],
                    productName: g.productNames[1],
                    variantCount: g.variantCounts[1],
                  });
                }}
              >
                {g.productNames[0]} ↔ {g.productNames[1]}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {stage === "previewed" && preview && (
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p>
              <strong>{preview.variantsMoved}</strong> variant(s) will move
              from "{preview.sourceProductName}" into "
              {preview.targetProductName}"
            </p>
            <p>
              Source product will be{" "}
              <strong>
                {preview.variantsMoved > 0 &&
                preview.conflictingVariants.length === 0
                  ? "retired"
                  : "kept (not fully empty yet)"}
              </strong>
            </p>
          </div>
          {preview.conflictingVariants.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
              <p className="flex items-center gap-1.5 font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                {preview.conflictingVariants.length} variant(s) need manual
                review
              </p>
              <p className="text-xs text-amber-800">
                Same size + color already exists on the target — these
                won't move automatically.
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {preview.conflictingVariants.map((v) => (
                  <p key={v.variantId} className="text-xs font-mono text-amber-900">
                    barcode {v.barcode || "—"} · {v.size || "—"} / {v.color || "—"} ·
                    stock {v.stockQty}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "done" && finalResult && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm space-y-1">
          <p className="font-medium text-green-800">Merge complete</p>
          <p>
            {finalResult.variantsMoved} variant(s) moved into "
            {finalResult.targetProductName}"
            {finalResult.sourceRetired ? ` — "${finalResult.sourceProductName}" retired` : ""}
          </p>
          {finalResult.conflictingVariants.length > 0 && (
            <p className="text-amber-700">
              {finalResult.conflictingVariants.length} variant(s) still need
              manual review on "{finalResult.sourceProductName}".
            </p>
          )}
        </div>
      )}

      <Separator />

      <div className="flex flex-wrap justify-end gap-2">
        {stage !== "done" && showClose && (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        {(stage === "idle" || stage === "previewing") && (
          <Button onClick={() => void handlePreview()} disabled={!canPreview || stage === "previewing"}>
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
          <Button onClick={() => void handleConfirmMerge()}>Confirm &amp; apply merge</Button>
        )}
        {stage === "merging" && (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Merging…
          </Button>
        )}
        {stage === "done" && <Button onClick={onClose}>Close</Button>}
      </div>
    </>
  );
}

export function MergeDuplicateProductsDialog({
  open,
  onOpenChange,
  organizationId,
  onMergeComplete,
  embedded,
  initialSource,
  initialTarget,
}: MergeDuplicateProductsDialogProps) {
  if (embedded) {
    if (!open) return null;
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pick FROM and INTO from the dropdown. Review exactly what would move
          before anything happens. Variants that would collide (same size + color
          already on the target) are left untouched and reported — never silently
          combined.
        </p>
        <MergeProductsBody
          organizationId={organizationId}
          onMergeComplete={onMergeComplete}
          onClose={() => onOpenChange(false)}
          showClose={false}
          initialSource={initialSource}
          initialTarget={initialTarget}
        />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge duplicate products</DialogTitle>
          <DialogDescription>
            Pick the product you want to retire (source) and the one to keep
            (target). Review exactly what would move before anything actually
            happens. Variants that would collide (same size + color already
            on the target) are left untouched and reported — never silently
            combined.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <MergeProductsBody
            organizationId={organizationId}
            onMergeComplete={onMergeComplete}
            onClose={() => onOpenChange(false)}
            showClose
            initialSource={initialSource}
            initialTarget={initialTarget}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
