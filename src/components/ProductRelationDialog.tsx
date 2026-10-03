import { AlertTriangle, Ban } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ProductRelation {
  type: string;
  count: number;
  samples: string[];
}

export interface ProductStockOnHandRow {
  name: string;
  stock: number;
}

interface ProductRelationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  relations: ProductRelation[];
  stockOnHand?: ProductStockOnHandRow[];
  onMarkInactive?: () => void;
  isMarkingInactive?: boolean;
}

export function ProductRelationDialog({
  open,
  onOpenChange,
  productName,
  relations,
  stockOnHand = [],
  onMarkInactive,
  isMarkingInactive = false,
}: ProductRelationDialogProps) {
  const totalTransactions = relations.reduce((sum, rel) => sum + rel.count, 0);
  const hasReferences = relations.length > 0;
  const hasStock = stockOnHand.length > 0;

  const title =
    hasReferences && hasStock
      ? "You Cannot Delete This Product"
      : hasStock
        ? "You Cannot Delete — Stock On Hand"
        : "You Cannot Delete This Product";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            <AlertDialogTitle className="text-destructive">
              {title}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {hasReferences && (
                <>
                  <p className="text-sm">
                    <span className="font-semibold text-foreground">"{productName}"</span> has been used in{" "}
                    <Badge variant="secondary" className="mx-1">{totalTransactions}</Badge>
                    transaction(s) and cannot be deleted:
                  </p>

                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Transaction Type</TableHead>
                          <TableHead className="text-xs text-center">Count</TableHead>
                          <TableHead className="text-xs">Sample References</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {relations.map((rel) => (
                          <TableRow key={rel.type}>
                            <TableCell className="font-medium text-sm py-2">{rel.type}</TableCell>
                            <TableCell className="text-center py-2">
                              <Badge variant="outline">{rel.count}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground py-2 max-w-[200px] truncate">
                              {rel.samples.length > 0
                                ? rel.samples.slice(0, 3).join(", ") + (rel.samples.length > 3 ? "..." : "")
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {hasStock && (
                <>
                  <p className="text-sm">
                    {stockOnHand.length === 1 ? (
                      <>
                        <span className="font-semibold text-foreground">"{stockOnHand[0].name}"</span> still has{" "}
                        <Badge variant="secondary" className="mx-1 tabular-nums">{stockOnHand[0].stock}</Badge>
                        unit(s) on hand. Zero stock before deleting, or delete the purchase bill that added this
                        product (new products created on a bill are removed with that bill).
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-foreground">{stockOnHand.length} selected products</span>{" "}
                        still have stock on hand and cannot be deleted from Product Master:
                      </>
                    )}
                  </p>
                  {stockOnHand.length > 1 && (
                    <div className="border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="text-xs">Product</TableHead>
                            <TableHead className="text-xs text-right">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stockOnHand.map((row) => (
                            <TableRow key={row.name}>
                              <TableCell className="text-sm py-2">{row.name}</TableCell>
                              <TableCell className="text-sm py-2 text-right tabular-nums font-mono">
                                {row.stock}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  To hide this product from active use, mark it as <strong>Inactive</strong> instead.
                  This preserves all historical records while preventing new transactions.
                  {hasStock && !hasReferences
                    ? " Use Stock Adjustment or resolve purchase/sales so on-hand qty reaches zero, then use Inventory → Orphaned Products to remove unused masters."
                    : null}
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          {onMarkInactive && (
            <Button
              variant="secondary"
              onClick={onMarkInactive}
              disabled={isMarkingInactive}
              className="sm:mr-auto"
            >
              {isMarkingInactive ? "Marking Inactive..." : "Mark as Inactive"}
            </Button>
          )}
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
