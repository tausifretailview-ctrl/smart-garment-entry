import { memo } from "react";
import { PosWallClock } from "@/components/pos/PosWallClock";

function formatINR2(value: number): string {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type PosFooterInfoProps = {
  quantity: number;
  /** Pre-discount gross (bill Sub Total). */
  subTotal: number;
  /** Total discount shown as −₹… (0 shows ₹0). */
  discount: number;
  /** Time of a loaded saved bill; null shows the live wall clock. */
  loadedInvoiceTime: string | null;
  paymentModeLabel: string;
  /** Settings: barcode price mode MRP with MRP enabled. */
  mrpPriceMode: boolean;
};

/**
 * POS footer info row: Qty, Charges, Sub Total, Discount, Time / Invoice time, Payment Mode and
 * the "MRP Price Mode Active" badge. Moved out of POSSales.tsx unchanged (Plan Phase 4, S4);
 * rendered inside the same footer row, so it returns a fragment. Plain-value props: memo skips
 * the redraw while the cashier types in fields that do not change these figures.
 */
export const PosFooterInfo = memo(function PosFooterInfo({
  quantity,
  subTotal,
  discount,
  loadedInvoiceTime,
  paymentModeLabel,
  mrpPriceMode,
}: PosFooterInfoProps) {
  return (
    <>
    {/* Qty */}
    <div className="text-center px-3">
      <div className="text-xl font-bold leading-tight">{quantity}</div>
      <div className="text-[11px] text-white/70 uppercase tracking-wider font-semibold">Qty</div>
    </div>

    <div className="w-px h-8 bg-white/20 shrink-0" />

    {/* Charges */}
    <div className="text-center px-3">
      <div className="text-lg font-bold leading-tight">₹0</div>
      <div className="text-[11px] text-white/70 uppercase font-semibold">Charges</div>
    </div>

    <div className="w-px h-8 bg-white/20 shrink-0" />

    {/* Sub Total — pre-discount gross (same as bill Sub Total) */}
    <div className="text-center px-3">
      <div className="text-lg font-bold leading-tight tabular-nums">₹{formatINR2(subTotal)}</div>
      <div className="text-[11px] text-white/70 uppercase font-semibold">Sub Total</div>
    </div>

    <div className="w-px h-8 bg-white/20 shrink-0" />

    {/* Discount */}
    <div className="text-center px-3 min-w-[5.5rem]">
      <div className="text-xl font-extrabold leading-tight text-white tabular-nums">
        {discount > 0.005 ? `−₹${formatINR2(discount)}` : "₹0"}
      </div>
      <div className="text-xs text-white/90 uppercase font-bold tracking-wide">Discount</div>
    </div>

    <div className="w-px h-8 bg-white/20 shrink-0" />

    {/* Invoice / wall clock — ticks on its own (PosWallClock), not the whole screen */}
    <div className="text-center px-2 shrink-0 min-w-[7.5rem]">
      <div className="text-[11px] text-white/70 uppercase tracking-wider font-semibold">
        {loadedInvoiceTime ? "Invoice time" : "Time"}
      </div>
      <div className="text-sm font-extrabold text-white tabular-nums leading-tight mt-0.5 whitespace-nowrap">
        {loadedInvoiceTime ? loadedInvoiceTime : <PosWallClock />}
      </div>
    </div>
    
    {/* Invoice payment mode indicator (helps identify Edit/Last/Previous invoice mode) */}
    <div className="flex-1 hidden xl:flex items-center justify-center">
      <div className="text-center px-3">
        <div className="text-[11px] text-white/70 uppercase tracking-wider font-semibold">Payment Mode</div>
        <div className="text-base font-extrabold text-white mt-0.5">
          {paymentModeLabel}
        </div>
      </div>
    </div>
    {mrpPriceMode && (
      <div className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded border border-blue-200 font-semibold shrink-0">
        MRP Price Mode Active
      </div>
    )}
    </>
  );
});
