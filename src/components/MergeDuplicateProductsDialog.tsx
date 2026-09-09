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
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import {
  findSafeMergeSuggestions,
  searchProductsForMerge,
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
}

type Stage = "idle" | "previewing" | "previewed" | "merging" | "done";

function ProductPicker({
  label,
  organizationId,
  selected,
  onSelect,
}: {
  label: string;
  organizationId: string;
  selected: ProductPickerResult | null;
  onSelect: (p: ProductPickerResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductPickerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const r = await searchProductsForMerge(organizationId, query);
          if (!cancelled) setResults(r);
        } catch (err) {
          console.error(err);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, organizationId]);

  if (selected) {
    return (
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.productName}{" "}
            <span className="text-muted-foreground font-normal">
              ({selected.variantCount} variant{selected.variantCount === 1 ? "" : "s"})
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search product name…"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No products found</div>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(r);
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                {r.productName}{" "}
                <span className="text-muted-foreground">
                  ({r.variantCount} variant{r.variantCount === 1 ? "" : "s"})
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function MergeDuplicateProductsDialog({
  open,
  onOpenChange,
  organizationId,
  onMergeComplete,
}: MergeDuplicateProductsDialogProps) {
  const [source, setSource] = useState<ProductPickerResult | null>(null);
  const [target, setTarget] = useState<ProductPickerResult | null>(null);
  const [suggestions, setSuggestions] = useState<ProductDuplicateGroup[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<MergeTwoProductsResult | null>(null);
  const [finalResult, setFinalResult] = useState<MergeTwoProductsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !organizationId) return;
    setSource(null);
    setTarget(null);
    setStage("idle");
    setPreview(null);
    setFinalResult(null);
    setError(null);
    void findSafeMergeSuggestions(organizationId)
      .then(setSuggestions)
      .catch((err) => console.error(err));
  }, [open, organizationId]);

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

  const handleClose = () => onOpenChange(false);

  const canPreview = !!source && !!target && source.id !== target.id;

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

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {stage !== "done" && (
          <div className="space-y-3">
            <ProductPicker
              label="Merge FROM (will be retired once empty)"
              organizationId={organizationId}
              selected={source}
              onSelect={(p) => {
                setSource(p);
                setStage("idle");
                setPreview(null);
              }}
            />
            <div className="flex justify-center">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <ProductPicker
              label="INTO (kept, canonical product)"
              organizationId={organizationId}
              selected={target}
              onSelect={(p) => {
                setTarget(p);
                setStage("idle");
                setPreview(null);
              }}
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

        <DialogFooter>
          {stage !== "done" && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {(stage === "idle" || stage === "previewing") && (
            <Button onClick={handlePreview} disabled={!canPreview || stage === "previewing"}>
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
