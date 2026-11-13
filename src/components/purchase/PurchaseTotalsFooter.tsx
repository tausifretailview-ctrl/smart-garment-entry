import { memo } from "react";
import { Check, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { purchaseBillDiscountFromPercent, purchaseBillDiscountPercent } from "@/utils/purchaseBillDiscount";

const inr2 = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type PurchaseTotalsFooterProps = {
  /** Hidden while the Edit Product panel is open. */
  hidden: boolean;
  grossAmount: number;
  itemDiscount: number;
  taxableAmount: number;
  gstAmount: number;
  netAmount: number;
  discountAmount: number;
  otherCharges: number;
  /** Stable setters. */
  setDiscountAmount: (amount: number) => void;
  setOtherCharges: (amount: number) => void;
  /** Print Barcodes is offered while editing a saved bill's current lines. */
  showPrintBarcodes: boolean;
  lineCount: number;
  selectedForPrintCount: number;
  onPrintBarcodes: () => void;
  onSave: () => void;
  loading: boolean;
  excelImport: { current: number; total: number } | null;
  isBillLocked: boolean;
};

/**
 * Purchase Entry footer: totals bar (Gross, Bill Disc % / ₹, Charges, Net Payable), the
 * Gross − Disc = Taxable + GST (+ Charges) = Net line, and Print Barcodes / Save. (The old
 * Cancel button had no action and was removed at the owner's request, Nov 2026.)
 * Moved out of PurchaseEntry.tsx unchanged (Plan Phase 4, S4).
 */
export const PurchaseTotalsFooter = memo(function PurchaseTotalsFooter({
  hidden,
  grossAmount,
  itemDiscount,
  taxableAmount,
  gstAmount,
  netAmount,
  discountAmount,
  otherCharges,
  setDiscountAmount,
  setOtherCharges,
  showPrintBarcodes,
  lineCount,
  selectedForPrintCount,
  onPrintBarcodes,
  onSave,
  loading,
  excelImport,
  isBillLocked,
}: PurchaseTotalsFooterProps) {
  return (
    <footer className={cn("entry-page-footer shrink-0 relative z-40 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]", hidden && "hidden")}>
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white overflow-x-auto border-t-2 border-green-600">
        <div className="flex items-center px-4 py-3 gap-0 min-w-max">
          <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Gross Amt</span>
          <span className="bg-white/10 rounded-sm px-3 h-9 flex items-center text-[15px] font-bold font-mono tabular-nums min-w-[80px] justify-end">
            {Math.round(grossAmount).toLocaleString("en-IN")}
          </span>

          <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />

          <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Bill Disc %</span>
          <Input
            type="number"
            step="0.01"
            value={purchaseBillDiscountPercent(discountAmount, grossAmount)}
            onChange={(e) => {
              const pct = parseFloat(e.target.value) || 0;
              setDiscountAmount(purchaseBillDiscountFromPercent(pct, grossAmount));
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            placeholder="0"
            className="w-[72px] h-9 text-[15px] text-right bg-white text-slate-800 font-bold font-mono border-0 rounded-sm"
          />

          <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />

          <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Bill Disc ₹</span>
          <Input
            type="number"
            step="0.01"
            value={discountAmount || ""}
            onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            placeholder="0"
            className="w-[80px] h-9 text-[15px] text-right bg-white text-slate-800 font-bold font-mono border-0 rounded-sm"
          />

          <div className="w-px h-8 bg-slate-600 mx-3 shrink-0" />

          <span className="text-[15px] font-extrabold uppercase tracking-wider text-slate-200 mr-2 whitespace-nowrap">Charges</span>
          <Input
            type="number"
            step="0.01"
            value={otherCharges || ""}
            onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            placeholder="0"
            className="w-[80px] h-9 text-[15px] text-right bg-white text-slate-800 font-bold font-mono border-0 rounded-sm"
          />

          <div className="ml-auto pl-4 border-l-2 border-green-600/60 flex flex-col items-end shrink-0">
            <span className="text-[13px] font-extrabold uppercase tracking-wider text-yellow-400">Net Payable</span>
            <span className="text-[36px] font-black font-mono tabular-nums leading-none text-green-400">₹{netAmount.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-950 flex flex-wrap items-center px-4 py-2 gap-3">
        <div className="flex items-center gap-2 text-[15px] text-slate-300 font-mono flex-1 min-w-0 overflow-x-auto whitespace-nowrap">
          <span>Gross <span className="text-white font-bold">₹{Math.round(grossAmount).toLocaleString("en-IN")}</span></span>
          <span className="text-slate-600">—</span>
          <span>Disc <span className="text-red-300 font-extrabold">₹{(itemDiscount + discountAmount).toFixed(0)}</span></span>
          <span className="text-slate-600">=</span>
          <span>Taxable <span className="text-white font-bold">₹{inr2(taxableAmount)}</span></span>
          <span className="text-slate-600">+</span>
          <span>GST <span className="text-white font-extrabold">₹{inr2(gstAmount)}</span></span>
          {otherCharges !== 0 && (
            <>
              <span className="text-slate-600">{otherCharges > 0 ? "+" : "−"}</span>
              <span>Charges <span className="text-white font-extrabold">₹{inr2(Math.abs(otherCharges))}</span></span>
            </>
          )}
          <span className="text-slate-600">=</span>
          <span>Net <span className="text-emerald-300 font-black">₹{netAmount.toLocaleString("en-IN")}</span></span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showPrintBarcodes && (
            <Button
              onClick={onPrintBarcodes}
              disabled={lineCount === 0}
              size="sm"
              className="h-9 px-4 text-[13px] bg-purple-600 hover:bg-purple-500 text-white font-bold gap-1.5 border border-purple-400 shadow-sm"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Barcodes
              {selectedForPrintCount > 0 && ` (${selectedForPrintCount})`}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={loading || excelImport !== null || lineCount === 0 || isBillLocked}
            aria-busy={loading}
            className="h-9 px-5 text-[14px] bg-green-600 text-white hover:bg-green-500 font-extrabold gap-1.5 shadow-[0_0_15px_rgba(34,197,94,0.4)] disabled:pointer-events-none"
          >
            {excelImport ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Importing {excelImport.current.toLocaleString("en-IN")}/{excelImport.total.toLocaleString("en-IN")}...</>
            ) : loading ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
            ) : (
              <><Check className="h-3 w-3" /> <span className="kbd-hint">✓ Save Bill <kbd>Ctrl+S</kbd></span></>
            )}
          </Button>
        </div>
      </div>
    </footer>
  );
});
