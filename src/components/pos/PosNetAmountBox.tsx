import { memo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { posNetAmountBoxValue, posNetAmountFromTyped, posNetAmountLabel } from "./posNetAmount";

function formatINR2(value: number): string {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type PosNetAmountBoxProps = {
  /** Bill net (after round off). Negative = refund to the customer. */
  finalAmount: number;
  /** Exchange: sale return above what this bill can absorb, paid back to the customer. */
  exchangeRefundDue: number;
  /** Advance / gift voucher applied on this bill (applied now + already on the saved bill). */
  totalBillAdvance: number;
  /** What is left to collect after the advance. */
  posTenderDue: number;
  /** Advance on a positive bill with no exchange refund: the box shows posTenderDue. */
  showToCollect: boolean;
  enableMrp: boolean;
  /** Pre-discount MRP total of the cart. */
  mrp: number;
  effectiveDiscountPercent: number;
  /** Sets the bill net (round off follows). Must be stable (useCallback) for memo to help. */
  onFinalAmountChange: (enteredAmount: number) => void;
};

/**
 * POS footer "Right Summary": MRP (strikethrough), the Net Amount / To Collect / Refund Due box,
 * the "% off" badge and the "Bill − Adv" note. Moved out of POSSales.tsx unchanged (Plan Phase 4,
 * S4). Plain-value props plus one stable handler: memo skips the redraw while the cashier types in
 * fields that do not change these figures.
 */
export const PosNetAmountBox = memo(function PosNetAmountBox({
  finalAmount,
  exchangeRefundDue,
  totalBillAdvance,
  posTenderDue,
  showToCollect,
  enableMrp,
  mrp,
  effectiveDiscountPercent,
  onFinalAmountChange,
}: PosNetAmountBoxProps) {
  const isRefund = finalAmount < -0.005 || exchangeRefundDue > 0.005;
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onFinalAmountChange(posNetAmountFromTyped(e.target.value, showToCollect, totalBillAdvance)),
    [onFinalAmountChange, showToCollect, totalBillAdvance],
  );

  return (
    <div className="text-center shrink-0 min-w-[160px] flex flex-col items-center self-start min-h-[4.5rem]">
      {enableMrp && mrp > 0 && mrp !== finalAmount && (
        <div className="text-xs text-white/90 line-through font-bold leading-tight">
          MRP ₹{formatINR2(mrp)}
        </div>
      )}
      <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">
        {posNetAmountLabel(finalAmount, exchangeRefundDue, showToCollect)}
      </div>
      <Input
        type="number"
        className={`w-40 h-10 text-center text-lg font-semibold border-0 rounded-md bg-white tabular-nums ${finalAmount < 0 || exchangeRefundDue > 0.005 ? 'text-orange-600' : 'text-emerald-700'}`}
        value={posNetAmountBoxValue(finalAmount, exchangeRefundDue, showToCollect, posTenderDue)}
        onChange={handleChange}
        step="1"
        readOnly={isRefund}
      />
      {enableMrp && effectiveDiscountPercent > 0 && (
        <div className="text-xs font-extrabold text-lime-200 mt-0.5">
          ↓ {effectiveDiscountPercent.toFixed(1)}% off
        </div>
      )}
      {showToCollect && (
        <div className="text-[10px] text-orange-200 font-semibold mt-0.5 text-center">
          Bill ₹{Math.round(finalAmount).toLocaleString('en-IN')} − Adv ₹{Math.round(totalBillAdvance).toLocaleString('en-IN')}
        </div>
      )}
    </div>
  );
});
