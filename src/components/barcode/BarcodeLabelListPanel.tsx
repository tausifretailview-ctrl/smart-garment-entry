import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { barcodeLineCounts, labelListDescription } from "@/lib/barcode/labelListRows";
import type { LabelItem } from "@/types/labelTypes";

/**
 * Barcode Printing: the list of products to print (description, size, MRP, sale, barcode with
 * DUP badge, supplier code, label qty, remove) with the Products / Labels count and Clear All.
 * Moved out of BarcodePrinting.tsx (Plan Phase 4, S4).
 */
export function BarcodeLabelListPanel({
  items,
  totalLabelQty,
  showMrpColumn,
  className,
  onClearAll,
  onQtyChange,
  onRemove,
}: {
  items: LabelItem[];
  totalLabelQty: number;
  showMrpColumn: boolean;
  /** Height rules for the panel (depends on the open tab). */
  className?: string;
  onClearAll: () => void;
  onQtyChange: (skuId: string, qty: number) => void;
  onRemove: (skuId: string) => void;
}) {
  const lineCounts = useMemo(() => barcodeLineCounts(items), [items]);
  return (
    <div className={cn("barcode-products-panel border rounded-md overflow-hidden flex flex-col", className)}>
      <div className="bg-slate-900 text-white px-3 py-2 border-b flex items-center justify-between gap-2">
        <p className="text-sm font-semibold tabular-nums">
          Products: <span className="font-bold">{items.length}</span>
          <span className="mx-1.5 opacity-40">|</span>
          Labels: <span className="font-bold text-emerald-300">{totalLabelQty}</span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 border-white/25 bg-white/10 text-xs font-semibold text-white hover:bg-destructive hover:text-white hover:border-destructive"
          onClick={onClearAll}
          title="Remove all products from the print list"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear All
        </Button>
      </div>
      <div className="overflow-auto flex-1 min-h-0">
        <Table className="barcode-products-table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Product Description</TableHead>
              <TableHead className="w-[70px]">Size</TableHead>
              {showMrpColumn && <TableHead className="w-[80px]">MRP</TableHead>}
              <TableHead className="w-[80px]">Sale</TableHead>
              <TableHead className="w-[110px]">Barcode</TableHead>
              <TableHead className="w-[90px]">Sup Code</TableHead>
              <TableHead className="w-[80px]">Qty</TableHead>
              <TableHead className="w-[48px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const fullDesc = labelListDescription(item);
              const dup = !!item.barcode && (lineCounts.get(item.barcode) ?? 0) > 1;
              return (
                <TableRow key={item.sku_id}>
                  <TableCell className="barcode-products-desc font-semibold max-w-[320px] truncate" title={fullDesc}>
                    {fullDesc}
                  </TableCell>
                  <TableCell className="font-medium">{item.size}</TableCell>
                  {showMrpColumn && <TableCell className="font-mono tabular-nums">₹{item.mrp || 0}</TableCell>}
                  <TableCell className="font-mono tabular-nums">₹{item.sale_price}</TableCell>
                  <TableCell className="font-mono">
                    <span>{item.barcode || "(auto-gen)"}</span>
                    {dup && (
                      <Badge className="ml-1 text-[10px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400">
                        DUP
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{item.supplier_code || "-"}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      value={item.qty}
                      onChange={(e) => onQtyChange(item.sku_id, parseInt(e.target.value) || 0)}
                      className="w-16 h-9 text-base font-mono tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(item.sku_id)}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Remove from the print list"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
