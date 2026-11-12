import { memo } from "react";

function formatINR2(value: number): string {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type PosShortcutBarProps = {
  /** Last POS bill saved today; null shows "No bill saved today". */
  lastBillNumber: string | null;
  lastBillQty: number;
  lastBillAmount: number;
};

/**
 * POS desktop bottom bar: last saved bill + keyboard legend (F1 … Ctrl+P). Moved out of
 * POSSales.tsx unchanged (Plan Phase 4, S4). Props are plain values, so memo skips the redraw
 * while the cashier types or scans.
 */
export const PosShortcutBar = memo(function PosShortcutBar({
  lastBillNumber,
  lastBillQty,
  lastBillAmount,
}: PosShortcutBarProps) {
  const lastBill =
    lastBillNumber != null ? { invoiceNumber: lastBillNumber, qty: lastBillQty, amount: lastBillAmount } : null;
  return (
    <div className="pos-sales-shortcuts hidden md:flex h-[52px] shrink-0 w-full flex-nowrap bg-slate-800 dark:bg-slate-950 text-white items-center gap-2 border-t border-slate-700/50 select-none px-2">
      {/* Last saved bill — pinned left so it is never clipped off-screen on web */}
      <div
        className="flex shrink-0 items-center gap-3 px-3 py-1.5 rounded-md bg-slate-900/90 border border-slate-600/50 min-w-[min(100%,22rem)]"
        title="Last saved POS invoice today"
      >
        <span className="text-xs uppercase tracking-wide text-slate-300 font-bold whitespace-nowrap">
          Last Bill
        </span>
        {lastBill ? (
          <>
            <span className="text-[15px] font-bold text-emerald-400 tabular-nums whitespace-nowrap">
              {lastBill.invoiceNumber}
            </span>
            <span className="text-sm text-slate-200 whitespace-nowrap">
              Qty{" "}
              <span className="text-[15px] font-bold text-white tabular-nums">{lastBill.qty}</span>
            </span>
            <span className="text-base font-extrabold text-amber-300 tabular-nums whitespace-nowrap">
              ₹{formatINR2(lastBill.amount)}
            </span>
          </>
        ) : (
          <span className="text-sm text-slate-500 whitespace-nowrap">No bill saved today</span>
        )}
      </div>

      <div className="w-px h-8 bg-slate-600 shrink-0" aria-hidden />

      <div className="flex flex-1 min-w-0 items-center justify-center gap-1 overflow-x-auto whitespace-nowrap">
      {/* Payment methods - amber/yellow */}
      {[
        { key: 'F1', label: 'Cash' },
        { key: 'F2', label: 'UPI' },
        { key: 'F3', label: 'Card' },
        { key: 'F4', label: 'Credit' },
      ].map(({ key, label }) => (
        <div key={key} className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-amber-600/20 cursor-pointer transition-colors min-w-[60px]">
          <kbd className="text-[10px] font-mono text-amber-400/80 font-bold leading-tight">{key}</kbd>
          <span className="text-[13px] font-extrabold text-amber-400 leading-tight">{label}</span>
        </div>
      ))}
      
      <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />
      
      {/* Actions - blue */}
      {[
        { key: 'F5', label: 'Return' },
        { key: 'F6', label: 'Mix Pay' },
        { key: 'F7', label: 'Hold' },
      ].map(({ key, label }) => (
        <div key={key} className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-blue-600/20 cursor-pointer transition-colors min-w-[60px]">
          <kbd className="text-[10px] font-mono text-blue-400/80 font-bold leading-tight">{key}</kbd>
          <span className="text-[13px] font-extrabold text-blue-400 leading-tight">{label}</span>
        </div>
      ))}
      
      <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />
      
      {/* Reports/actions - blue */}
      {[
        { key: 'F8', label: 'Report' },
        { key: 'F9', label: 'Estimate' },
        { key: 'F10', label: 'New Cust' },
        { key: 'F11', label: 'Stock' },
      ].map(({ key, label }) => (
        <div key={key} className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-blue-600/20 cursor-pointer transition-colors min-w-[60px]">
          <kbd className="text-[10px] font-mono text-blue-400/80 font-bold leading-tight">{key}</kbd>
          <span className="text-[13px] font-extrabold text-blue-400 leading-tight">{label}</span>
        </div>
      ))}
      
      <div className="w-px h-7 bg-slate-600 mx-1 shrink-0" />
      
      {/* Clear - red */}
      <div className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-red-600/20 cursor-pointer transition-colors min-w-[60px]">
        <kbd className="text-[10px] font-mono text-red-400/80 font-bold leading-tight">ESC</kbd>
        <span className="text-[13px] font-extrabold text-red-400 leading-tight">Clear</span>
      </div>
      
      {/* Print - white/neutral */}
      <div className="flex flex-col items-center justify-center px-3 py-1 rounded-md hover:bg-slate-600/40 cursor-pointer transition-colors min-w-[60px]">
        <kbd className="text-[10px] font-mono text-slate-400/80 font-bold leading-tight">CTRL+P</kbd>
        <span className="text-[13px] font-extrabold text-slate-300 leading-tight">Print</span>
      </div>
      </div>
    </div>
  );
});
