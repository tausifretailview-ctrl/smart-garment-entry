import { useState } from "react";
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
import { Loader2, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductInfo {
  product_id: string;
  product_name: string;
  category: string;
  brand: string;
  style: string;
  color: string;
  total_stock: number;
  variants: Array<{
    variant_id: string;
    size: string;
    color: string;
    barcode: string;
    stock_qty: number;
  }>;
}

interface MergeProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductInfo[];
  onMergeComplete: () => void;
}

export const MergeProductsDialog = ({
  open,
  onOpenChange,
  products,
  onMergeComplete,
}: MergeProductsDialogProps) => {
  const [targetId, setTargetId] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);

  // Auto-select product with more stock as target
  const getDefaultTarget = () => {
    if (products.length !== 2) return "";
    return products[0].total_stock >= products[1].total_stock
      ? products[0].product_id
      : products[1].product_id;
  };

  const effectiveTargetId = targetId || getDefaultTarget();
  const target = products.find((p) => p.product_id === effectiveTargetId);
  const source = products.find((p) => p.product_id !== effectiveTargetId);

  const handleMerge = async () => {
    if (!target || !source) return;
    setIsMerging(true);
    try {
      const { data, error } = await supabase.rpc("merge_products", {
        p_target_product_id: target.product_id,
        p_source_product_id: source.product_id,
      });

      if (error) throw error;

      toast.success(
        `Merged "${source.product_name}" into "${target.product_name}" — ${(data as any)?.variants_moved || 0} variants moved`
      );
      onOpenChange(false);
      onMergeComplete();
    } catch (error: any) {
      toast.error(error.message || "Merge failed");
    } finally {
      setIsMerging(false);
    }
  };

  if (products.length !== 2) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge Products</DialogTitle>
          <DialogDescription>
            Select which product to keep. The other will be merged into it and
            soft-deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start py-4">
          {products.map((product, idx) => {
            const isTarget = product.product_id === effectiveTargetId;
            return (
              <>
                {idx === 1 && (
                  <div className="flex items-center justify-center self-center">
                    <ArrowRight className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <button
                  key={product.product_id}
                  type="button"
                  onClick={() => setTargetId(product.product_id)}
                  className={cn(
                    "rounded-lg border-2 p-4 text-left transition-all",
                    isTarget
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-foreground">
                      {product.product_name}
                    </span>
                    {isTarget && (
                      <Badge className="gap-1">
                        <Check className="h-3 w-3" /> Keep
                      </Badge>
                    )}
                    {!isTarget && (
                      <Badge variant="secondary">Will merge</Badge>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {product.brand && <p>Brand: {product.brand}</p>}
                    {product.category && <p>Category: {product.category}</p>}
                    {product.color && <p>Colors: {product.color}</p>}
                    <p className="font-medium text-foreground">
                      {product.variants.length} variants · {product.total_stock}{" "}
                      total stock
                    </p>
                  </div>
                </button>
              </>
            );
          })}
        </div>

        {target && source && (
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <p>
              <strong>{source.variants.length}</strong> variants from "
              {source.product_name}" will be moved to "{target.product_name}".
            </p>
            <p>
              All sales, purchases, and transaction history will be reassigned.
            </p>
            <p className="text-destructive font-medium">
              "{source.product_name}" will be soft-deleted after merge.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMerging}
          >
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={isMerging || !target || !source}>
            {isMerging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              "Confirm Merge"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
