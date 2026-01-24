import { Package } from "lucide-react";

interface InlineTotalQtyProps {
  totalQty: number;
  itemCount?: number;
}

export function InlineTotalQty({ totalQty, itemCount }: InlineTotalQtyProps) {
  if (totalQty === 0) return null;

  return (
    <div className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-1.5 text-sm flex items-center gap-2">
      <Package className="h-4 w-4 text-primary" />
      <span className="text-muted-foreground">Total Qty:</span>
      <span className="font-bold text-primary text-lg">{totalQty}</span>
      {itemCount !== undefined && itemCount > 0 && (
        <span className="text-xs text-muted-foreground">({itemCount} items)</span>
      )}
    </div>
  );
}
