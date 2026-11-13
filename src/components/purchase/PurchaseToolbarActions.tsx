import { AlertTriangle, Camera, FileSpreadsheet, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/*
 * Purchase Entry desktop: the toolbar's Import Excel / Photo / Add New Product buttons with the
 * Total Qty badge, and the notices over the lines table (large bill, barcode conflicts, locked).
 * Moved out of PurchaseEntry.tsx unchanged (Plan Phase 4, S4); the actions stay in PurchaseEntry.
 */

export function PurchaseToolbarButtons({
  importing,
  isBillLocked,
  photoImportOn,
  onImportExcel,
  onImportPhoto,
  onAddProduct,
  onPrefetchAddProduct,
}: {
  /** An Excel import is running. */
  importing: boolean;
  isBillLocked: boolean;
  photoImportOn: boolean;
  onImportExcel: () => void;
  onImportPhoto: () => void;
  onAddProduct: () => void;
  /** Warm up the Add Product dialog on hover / focus. */
  onPrefetchAddProduct: () => void;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0 flex-wrap">
      <Button onClick={onImportExcel} variant="outline" size="sm" className="h-10 gap-2 border-slate-300" disabled={importing}>
        <FileSpreadsheet className="h-4 w-4" />
        <span className="hidden xl:inline">Import&nbsp;</span>Excel
      </Button>
      {photoImportOn && (
        <Button
          onClick={onImportPhoto}
          variant="outline"
          size="sm"
          className="h-10 gap-2 border-teal-300 text-teal-700"
          disabled={importing || isBillLocked}
          title="Read a supplier bill photo into this purchase"
        >
          <Camera className="h-4 w-4" />
          Photo
        </Button>
      )}
      <Button
        onClick={onAddProduct}
        onMouseEnter={onPrefetchAddProduct}
        onFocus={onPrefetchAddProduct}
        variant="outline"
        size="sm"
        className="h-10 gap-2 border-slate-300"
        disabled={isBillLocked}
      >
        <Plus className="h-4 w-4" />
        Add<span className="hidden xl:inline">&nbsp;New</span>&nbsp;Product
      </Button>
    </div>
  );
}

export function PurchaseTotalQtyBadge({ totalQty }: { totalQty: number }) {
  return (
    <div className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg ml-auto shrink-0">
      <span className="text-[12px] font-semibold text-white/80">Total Qty</span>
      <span className="text-[18px] font-black text-white tabular-nums font-mono leading-none">{totalQty}</span>
    </div>
  );
}

/** "📦 Large bill: n items · Showing m rows" (only past 100 lines). */
export function PurchaseLargeBillNotice({ lineCount, shownCount }: { lineCount: number; shownCount: number }) {
  if (lineCount <= 100) return null;
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b text-xs text-muted-foreground shrink-0">
      <span className="font-medium">📦 Large bill: {lineCount} items</span>
      <span>Showing {Math.min(shownCount, lineCount)} rows — scroll to load more</span>
    </div>
  );
}

export function PurchaseBarcodeConflictStrip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-900 shrink-0">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
      <span>
        <strong>{count}</strong> barcode conflict
        {count === 1 ? "" : "s"} — check SIZE/BARCODE columns below before saving.
      </span>
    </div>
  );
}

/** Covers the lines table while the bill is locked. */
export function PurchaseLockedOverlay() {
  return (
    <div className="absolute inset-0 bg-background/60 z-10 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
      <div className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900 border border-amber-300 rounded-lg px-4 py-2">
        <Lock className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Locked — click Unlock to edit</span>
      </div>
    </div>
  );
}
