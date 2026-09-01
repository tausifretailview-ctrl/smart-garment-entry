import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AvailableStockMatrixRow } from "@/utils/availableStockPrintMatrix";

type SaleOrderStockCheckDialogProps = {
  open: boolean;
  loading?: boolean;
  customerName?: string;
  sizes: string[];
  rows: AvailableStockMatrixRow[];
  grandAvailable: number;
  grandOrdered: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SaleOrderStockCheckDialog({
  open,
  loading,
  customerName,
  sizes,
  rows,
  grandAvailable,
  grandOrdered,
  onCancel,
  onConfirm,
}: SaleOrderStockCheckDialogProps) {
  const shortCount = rows.filter((r) => r.totalAvailable < r.totalOrdered).length;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Check size-wise stock before booking</DialogTitle>
          <DialogDescription>
            {customerName ? `${customerName} — ` : ""}
            Each cell is on-hand / ordered for sizes on this order (same on-hand as Size-wise Stock). This does not reserve stock.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading size-wise stock…</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto border rounded-md">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-muted z-10">
                <tr>
                  <th className="border px-2 py-1.5 text-left font-semibold w-[28%]">Article / Colour</th>
                  {sizes.map((sz) => (
                    <th key={sz} className="border px-1.5 py-1.5 text-center font-semibold tabular-nums">
                      {sz}
                      <div className="text-[10px] font-medium text-muted-foreground">Avl / Ord</div>
                    </th>
                  ))}
                  <th className="border px-2 py-1.5 text-center font-semibold">
                    Total
                    <div className="text-[10px] font-medium text-muted-foreground">Avl / Ord</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowShort = row.totalAvailable < row.totalOrdered;
                  return (
                    <tr key={row.key} className={rowShort ? "bg-red-50" : undefined}>
                      <td className="border px-2 py-1.5">
                        <span className="font-semibold">{row.productName}</span>
                        {row.color ? <span className="text-muted-foreground"> – {row.color}</span> : null}
                      </td>
                      {sizes.map((sz) => {
                        const cell = row.cells.get(sz);
                        const available = cell?.available ?? 0;
                        const ordered = cell?.ordered ?? 0;
                        const hasQty = available > 0 || ordered > 0;
                        const short = ordered > 0 && available < ordered;
                        return (
                          <td
                            key={sz}
                            className={`border px-1 py-1 text-center tabular-nums ${
                              short ? "bg-red-100 text-red-800 font-semibold" : ""
                            }`}
                          >
                            {hasQty ? (
                              <>
                                <span>{available}</span>
                                <span className="text-muted-foreground"> / </span>
                                <span>{ordered}</span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                      <td
                        className={`border px-2 py-1.5 text-center tabular-nums font-semibold ${
                          rowShort ? "text-red-800" : ""
                        }`}
                      >
                        {row.totalAvailable} / {row.totalOrdered}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/70 font-semibold">
                  <td className="border px-2 py-1.5 text-right">Total Avl / Ord</td>
                  {sizes.map((sz) => {
                    const avl = rows.reduce((s, r) => s + (r.cells.get(sz)?.available ?? 0), 0);
                    const ord = rows.reduce((s, r) => s + (r.cells.get(sz)?.ordered ?? 0), 0);
                    return (
                      <td key={sz} className="border px-1 py-1.5 text-center tabular-nums">
                        {avl} / {ord}
                      </td>
                    );
                  })}
                  <td className="border px-2 py-1.5 text-center tabular-nums">
                    {grandAvailable} / {grandOrdered}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {shortCount > 0 && !loading ? (
          <p className="flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {shortCount} article(s) have less on-hand than ordered. You can still book — stock is not reserved.
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Back
          </Button>
          <Button type="button" onClick={onConfirm} disabled={loading || rows.length === 0}>
            Confirm &amp; Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
