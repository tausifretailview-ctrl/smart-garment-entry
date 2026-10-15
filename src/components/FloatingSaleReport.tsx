import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Receipt, Search, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupBarcodeSales, type BarcodeSaleRecord } from "@/utils/lookupBarcodeSales";

// Quick sale lookup (header button). Kept in its own small file and imported
// statically by Header: as a lazy chunk the dialog could sit on
// "Loading sale lookup…" whenever that download stalled.

// Floating Barcode Sale Lookup Dialog
export function FloatingSaleReport({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setDebouncedQuery("");
      return;
    }
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery, open]);

  const flushSearch = () => setDebouncedQuery(searchQuery.trim());

  const { data: saleRows = [], isPending, error, refetch } = useQuery({
    queryKey: ["floating-barcode-sale-report", currentOrganization?.id, debouncedQuery],
    queryFn: () => lookupBarcodeSales(currentOrganization!.id, debouncedQuery),
    enabled: !!currentOrganization?.id && open && debouncedQuery.length >= 3,
    staleTime: STALE_LIVE,
    refetchOnWindowFocus: false,
  });

  const isDebouncing = debouncedQuery !== searchQuery.trim();
  const showLoading = isDebouncing || (isPending && saleRows.length === 0);

  const totalQty = saleRows.reduce((sum, row) => sum + row.quantity, 0);
  const totalAmount = saleRows.reduce((sum, row) => sum + row.lineTotal, 0);
  const totalItemDiscount = saleRows.reduce((sum, row) => sum + row.discountAmount, 0);
  const uniqueBills = new Set(saleRows.map((row) => row.saleId)).size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Quick Sale Check
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search by barcode, product name, brand, size, color... (multi-word AND)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                flushSearch();
              }
            }}
            className="pl-9"
            autoFocus
            autoComplete="off"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => {
                setSearchQuery("");
                setDebouncedQuery("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {searchQuery.trim().length < 1 ? (
          <div className="text-center py-8 text-muted-foreground">
            Start typing to search sale history...
          </div>
        ) : showLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading sales...</div>
        ) : error ? (
          <div className="text-center py-8 text-destructive">
            {(error as Error).message}
            <Button variant="link" className="ml-2" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : saleRows.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-4 mb-3">
              <div className="bg-blue-50 dark:bg-blue-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Sale Lines</span>
                <p className="font-bold text-lg">{saleRows.length}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Bills</span>
                <p className="font-bold text-lg">{uniqueBills}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Total Qty</span>
                <p className="font-bold text-lg">{totalQty.toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Line Total</span>
                <p className="font-bold text-lg">₹{Math.round(totalAmount).toLocaleString("en-IN")}</p>
              </div>
              <div className="bg-rose-50 dark:bg-rose-950 px-4 py-2 rounded-lg">
                <span className="text-xs text-muted-foreground">Item Discount</span>
                <p className="font-bold text-lg">₹{Math.round(totalItemDiscount).toLocaleString("en-IN")}</p>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Bill No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                    <TableHead className="text-right">Item Disc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saleRows.map((row: BarcodeSaleRecord) => (
                    <TableRow key={row.saleItemId} className={row.isCancelled ? "opacity-60" : undefined}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(row.saleDate), "dd-MMM-yyyy")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.saleNumber}
                        {row.isCancelled && (
                          <span className="ml-1 text-[10px] text-destructive">(Cancelled)</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate" title={row.customerName}>
                        {row.customerName}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{row.productName}</p>
                          {row.color && (
                            <p className="text-xs text-muted-foreground">{row.color}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.barcode || "—"}</TableCell>
                      <TableCell>{row.size}</TableCell>
                      <TableCell className="text-right font-medium">{row.quantity}</TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{row.unitPrice.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {row.discountPercent > 0.005 || row.discountAmount > 0.005 ? (
                          <span>
                            {row.discountPercent > 0.005 && (
                              <span className="font-medium">
                                {Number.isInteger(row.discountPercent)
                                  ? row.discountPercent
                                  : row.discountPercent.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                %
                              </span>
                            )}
                            {row.discountAmount > 0.005 && (
                              <span className={row.discountPercent > 0.005 ? "block text-muted-foreground" : "font-medium"}>
                                ₹{row.discountAmount.toLocaleString("en-IN")}
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No sales found matching &quot;{debouncedQuery}&quot;
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
