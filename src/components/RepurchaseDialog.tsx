import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalculatorInput } from "@/components/ui/calculator-input";
import { QtyInput } from "@/components/ui/qty-input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export interface RepurchaseVariantRow {
  id: string;
  size: string;
  color: string;
  barcode: string;
  oldPurPrice: number;
  oldSalePrice: number;
  oldMrp: number;
  newPurPrice: number;
  newSalePrice: number;
  newMrp: number;
  qty: number;
}

export interface RepurchaseProductInfo {
  id: string;
  product_name: string;
  brand?: string | null;
  category?: string | null;
  style?: string | null;
  color?: string | null;
  hsn_code?: string | null;
  gst_per?: number;
  purchase_gst_percent?: number;
  purchase_discount_type?: string | null;
  purchase_discount_value?: number | null;
  size_group_name?: string;
  uom?: string | null;
}

interface RepurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  product: RepurchaseProductInfo | null;
  initialRows: RepurchaseVariantRow[];
  onConfirm: (rows: RepurchaseVariantRow[]) => void | Promise<void>;
  confirming?: boolean;
}

export function RepurchaseDialog({
  open,
  onClose,
  product,
  initialRows,
  onConfirm,
  confirming = false,
}: RepurchaseDialogProps) {
  const [rows, setRows] = useState<RepurchaseVariantRow[]>([]);

  useEffect(() => {
    if (open) {
      setRows(initialRows.map((r) => ({ ...r })));
    }
  }, [open, initialRows]);

  const updateRow = (
    id: string,
    field: "newPurPrice" | "newSalePrice" | "newMrp" | "qty",
    value: number,
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const totalQty = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Re-purchase — Existing Product</DialogTitle>
        </DialogHeader>

        {product && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2 shrink-0">
            <p className="font-semibold text-base">{product.product_name}</p>
            <div className="flex flex-wrap gap-1.5">
              {product.brand && (
                <Badge variant="outline" className="text-xs">
                  {product.brand}
                </Badge>
              )}
              {product.category && (
                <Badge variant="outline" className="text-xs">
                  {product.category}
                </Badge>
              )}
              {product.style && product.style !== "-" && (
                <Badge variant="outline" className="text-xs">
                  {product.style}
                </Badge>
              )}
              {product.color && product.color !== "-" && (
                <Badge variant="secondary" className="text-xs">
                  {product.color}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {product.hsn_code && <span>HSN: {product.hsn_code}</span>}
              <span>GST: {product.purchase_gst_percent ?? product.gst_per ?? 0}%</span>
              {product.size_group_name && <span>Size group: {product.size_group_name}</span>}
              {product.uom && <span>UOM: {product.uom}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Enter qty and new prices only where they changed. Product master details are read-only.
            </p>
          </div>
        )}

        <div className="overflow-auto flex-1 min-h-0 border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Size</TableHead>
                <TableHead className="w-20">Color</TableHead>
                <TableHead className="text-right w-24">Old Pur</TableHead>
                <TableHead className="text-right w-24">Old Sale</TableHead>
                <TableHead className="text-right w-24">Old MRP</TableHead>
                <TableHead className="text-right w-28">New Pur</TableHead>
                <TableHead className="text-right w-28">New Sale</TableHead>
                <TableHead className="text-right w-28">New MRP</TableHead>
                <TableHead className="text-right w-24">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">{row.size || "—"}</TableCell>
                  <TableCell className="text-sm">{row.color || "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground text-sm">
                    ₹{row.oldPurPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground text-sm">
                    ₹{row.oldSalePrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground text-sm">
                    ₹{row.oldMrp.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <CalculatorInput
                      value={row.newPurPrice}
                      onChange={(val) => updateRow(row.id, "newPurPrice", val)}
                      className="h-8 text-right text-sm font-mono tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <CalculatorInput
                      value={row.newSalePrice}
                      onChange={(val) => updateRow(row.id, "newSalePrice", val)}
                      className="h-8 text-right text-sm font-mono tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <CalculatorInput
                      value={row.newMrp}
                      onChange={(val) => updateRow(row.id, "newMrp", val)}
                      className="h-8 text-right text-sm font-mono tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <QtyInput
                      value={row.qty}
                      onChange={(val) => updateRow(row.id, "qty", val)}
                      className="h-8 text-right text-sm font-mono tabular-nums"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(rows)}
            disabled={confirming || totalQty <= 0}
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add to Bill ({totalQty} pcs)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
