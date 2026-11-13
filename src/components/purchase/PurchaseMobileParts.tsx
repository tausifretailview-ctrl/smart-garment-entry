import { Loader2, Save } from "lucide-react";
import { CalculatorInput } from "@/components/ui/calculator-input";

/*
 * Purchase Entry, phone layout: the items card, the totals card and the fixed Save bar. Moved out
 * of PurchaseEntry.tsx unchanged (Plan Phase 4, S4); PurchaseEntry passes ready figures per line
 * and keeps every action.
 */

export type PurchaseMobileLine = {
  tempId: string;
  /** Product name, or the barcode when there is no name yet. */
  title: string;
  /** Size (Mobile-ERP formatted) and colour. */
  subtitle: string;
  qty: number;
  /** UOM label for non-piece units (MTR, KG…); null for pieces. */
  uomLabel: string | null;
  purPrice: number;
  /** Rounded line amount (price × qty / metres). */
  amount: number;
};

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function PurchaseMobileItemsCard({
  lines,
  totalQty,
  onQtyStep,
  onPriceChange,
  onRemove,
}: {
  lines: PurchaseMobileLine[];
  totalQty: number;
  /** −1 / +1 on a line (the minimum for its unit is checked by PurchaseEntry). */
  onQtyStep: (tempId: string, direction: -1 | 1) => void;
  onPriceChange: (tempId: string, price: number) => void;
  onRemove: (tempId: string) => void;
}) {
  if (lines.length === 0) return null;
  return (
    <div className="bg-background rounded-2xl border border-border/40 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/30">
        <p className="text-xs font-semibold text-foreground">Items ({lines.length})</p>
        <p className="text-xs text-muted-foreground">{totalQty} pcs</p>
      </div>
      <div className="divide-y divide-border/20">
        {lines.map((line) => (
          <div key={line.tempId} className="flex items-center justify-between px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{line.title}</p>
              <p className="text-[11px] text-muted-foreground">{line.subtitle}</p>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => onQtyStep(line.tempId, -1)}
                  aria-label="Less"
                  className="w-8 h-8 bg-muted rounded-lg text-base font-bold flex items-center justify-center active:scale-90 touch-manipulation"
                >
                  −
                </button>
                <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums">{line.qty}</span>
                {line.uomLabel && <span className="text-[10px] text-muted-foreground">{line.uomLabel}</span>}
                <button
                  onClick={() => onQtyStep(line.tempId, 1)}
                  aria-label="More"
                  className="w-8 h-8 bg-muted rounded-lg text-base font-bold flex items-center justify-center active:scale-90 touch-manipulation"
                >
                  +
                </button>
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <CalculatorInput
                value={line.purPrice}
                onChange={(val) => onPriceChange(line.tempId, val)}
                className="w-20 h-8 text-right text-sm rounded-lg border"
                placeholder="Price"
              />
              <p className="text-xs font-semibold text-foreground mt-1 tabular-nums">= {rupees(line.amount)}</p>
              <button onClick={() => onRemove(line.tempId)} className="text-[10px] text-destructive font-medium mt-1">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PurchaseMobileTotalsCard({ totalQty, netAmount }: { totalQty: number; netAmount: number }) {
  return (
    <div className="bg-background rounded-2xl p-3.5 border border-border/40 shadow-sm space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Total Qty</span>
        <span className="font-medium tabular-nums">{totalQty} pcs</span>
      </div>
      <div className="flex justify-between text-base font-bold pt-1 border-t border-border/30">
        <span>Grand Total</span>
        <span className="tabular-nums">{rupees(netAmount || 0)}</span>
      </div>
    </div>
  );
}

export function PurchaseMobileSaveBar({
  onSave,
  loading,
  excelImport,
  lineCount,
  filledCount,
  netAmount,
}: {
  onSave: () => void;
  loading: boolean;
  excelImport: { current: number; total: number } | null;
  /** All lines (an empty bill cannot be saved). */
  lineCount: number;
  /** Lines with a product (the amount shows on the button when there are any). */
  filledCount: number;
  netAmount: number;
}) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 z-30"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
    >
      <button
        type="button"
        onClick={onSave}
        disabled={loading || excelImport !== null || lineCount === 0}
        aria-busy={loading}
        className="w-full bg-primary text-primary-foreground rounded-xl h-12 font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 touch-manipulation shadow-sm disabled:opacity-50 disabled:pointer-events-none"
      >
        {excelImport ? <Loader2 className="h-4 w-4 animate-spin" /> : loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {excelImport
          ? `Importing ${excelImport.current.toLocaleString("en-IN")} / ${excelImport.total.toLocaleString("en-IN")}...`
          : loading
            ? "Saving…"
            : `Save Bill${filledCount > 0 ? ` · ${rupees(netAmount || 0)}` : ""}`}
      </button>
    </div>
  );
}
