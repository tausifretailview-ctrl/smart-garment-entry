import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScanBarcode, Search, Loader2, Package, Camera } from "lucide-react";
import { toast } from "sonner";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { lookupBarcodeStock, type BarcodeStockMatch } from "@/utils/lookupBarcodeStock";
import { CameraBarcodeScannerDialog } from "@/components/CameraBarcodeScannerDialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface BarcodeStockScanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function StockResultCard({
  match,
  onViewProduct,
}: {
  match: BarcodeStockMatch;
  onViewProduct: (productId: string) => void;
}) {
  const stock = match.currentStock;
  const stockClass =
    stock <= 0 ? "text-destructive" : stock <= 5 ? "text-amber-600" : "text-emerald-600";

  return (
    <button
      type="button"
      onClick={() => onViewProduct(match.productId)}
      className="w-full text-left rounded-xl border border-border/60 bg-card p-3.5 shadow-sm active:scale-[0.98] transition-all touch-manipulation"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{match.productName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {[match.brand, match.category, match.style].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <Badge variant={stock <= 0 ? "destructive" : stock <= 5 ? "secondary" : "default"} className="shrink-0 tabular-nums">
          {stock} pcs
        </Badge>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground">Size / Color</span>
        <span className="text-right font-medium">
          {match.size}
          {match.color ? ` / ${match.color}` : ""}
        </span>
        <span className="text-muted-foreground">Barcode</span>
        <span className="text-right font-mono text-[11px]">{match.barcode || "—"}</span>
        <span className="text-muted-foreground">Sale / MRP</span>
        <span className="text-right tabular-nums">
          ₹{inr.format(match.salePrice)} / ₹{inr.format(match.mrp)}
        </span>
        <span className="text-muted-foreground">Stock</span>
        <span className={cn("text-right font-bold tabular-nums", stockClass)}>{stock}</span>
      </div>
    </button>
  );
}

export function BarcodeStockScanSheet({ open, onOpenChange }: BarcodeStockScanSheetProps) {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery("");
        setSearchTerm("");
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const { data: matches = [], isFetching, error, refetch } = useQuery({
    queryKey: ["barcode-stock-scan", currentOrganization?.id, searchTerm],
    enabled: open && !!currentOrganization?.id && searchTerm.length > 0,
    queryFn: () => lookupBarcodeStock(currentOrganization!.id, searchTerm),
    staleTime: 0,
  });

  const runSearch = useCallback(() => {
    const t = query.trim();
    if (!t) {
      toast.error("Enter or scan a barcode");
      return;
    }
    setSearchTerm(t);
  }, [query]);

  const onScanned = useCallback((code: string) => {
    setQuery(code);
    setSearchTerm(code.trim());
    setCameraOpen(false);
  }, []);

  const viewProduct = (productId: string) => {
    handleClose(false);
    orgNavigate(`/owner-stock?product=${productId}`);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="bottom" className="h-[min(92vh,720px)] rounded-t-2xl p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ScanBarcode className="h-5 w-5 text-primary" />
              Scan & check stock
            </SheetTitle>
            <SheetDescription className="text-xs">
              Scan barcode or type code to see size-wise stock and prices.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 py-3 space-y-2 shrink-0 border-b">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-10"
                  placeholder="Barcode or scan…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
              </div>
              <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setCameraOpen(true)}>
                <Camera className="h-5 w-5" />
              </Button>
              <Button type="button" className="h-10 shrink-0" onClick={runSearch}>
                Check
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4 py-3 pb-8 space-y-3">
              {!searchTerm && (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mb-3 opacity-40" />
                  <p className="text-sm font-medium">Scan or enter a barcode</p>
                  <p className="text-xs mt-1 max-w-[240px]">Works on most phones — use the camera button or a Bluetooth scanner.</p>
                </div>
              )}

              {searchTerm && isFetching && (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Looking up stock…</span>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  {(error as Error).message}
                  <Button variant="link" className="h-auto p-0 ml-2" onClick={() => refetch()}>
                    Retry
                  </Button>
                </div>
              )}

              {searchTerm && !isFetching && !error && matches.length === 0 && (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No product found for <span className="font-mono font-medium text-foreground">{searchTerm}</span>
                </div>
              )}

              {matches.map((m) => (
                <StockResultCard key={m.variantId} match={m} onViewProduct={viewProduct} />
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <CameraBarcodeScannerDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onBarcodeScanned={onScanned}
        showSuccessToast={false}
      />
    </>
  );
}
