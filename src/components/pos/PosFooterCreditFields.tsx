import { memo } from "react";
import { Input } from "@/components/ui/input";
import { capPosAdvanceApplyAmount } from "@/utils/posApplyAdvance";
import { posLegacyCreditFromTyped, posPointsFromTyped, posPointsTitle } from "./posFooterCredits";

/*
 * POS footer boxes after Round: old CRM points, the legacy "Cr" credit box and the customer
 * advance. Moved out of POSSales.tsx unchanged (Plan Phase 4, S4). Plain values plus stable
 * handlers, so memo skips redraws while the cashier types elsewhere.
 */

export type PosPointsFieldProps = {
  /** Old points balance (this bill's earn stays pending until save). */
  balance: number;
  /** Settings: least balance that can be redeemed (defaults to 1). */
  minPoints: number;
  /** Most points this bill allows. */
  maxRedeemable: number;
  pointsToRedeem: number;
  /** ₹ value of pointsToRedeem. */
  redemptionValue: number;
  /** Stable setter. */
  setPointsToRedeem: (points: number) => void;
};

/** Redeem old CRM points only — current-bill earn stays pending until save. */
export const PosPointsField = memo(function PosPointsField({
  balance,
  minPoints,
  maxRedeemable,
  pointsToRedeem,
  redemptionValue,
  setPointsToRedeem,
}: PosPointsFieldProps) {
  return (
    <div className="text-center">
      <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Pts ({balance})</div>
      <Input
        type="number"
        className="w-24 h-10 bg-amber-100 text-amber-800 text-center text-lg font-semibold border-0 rounded-md"
        value={pointsToRedeem || ""}
        placeholder="0"
        min={0}
        max={maxRedeemable}
        onChange={(e) => setPointsToRedeem(posPointsFromTyped(e.target.value, maxRedeemable))}
        disabled={maxRedeemable <= 0}
        title={posPointsTitle(balance, minPoints, maxRedeemable)}
      />
      {pointsToRedeem > 0 ? (
        <div className="text-[10px] text-amber-200 font-semibold mt-0.5 text-center">
          −₹{redemptionValue.toFixed(0)}
        </div>
      ) : balance > 0 && balance < minPoints ? (
        <div className="text-[10px] text-white/70 font-semibold mt-0.5 text-center">Min {minPoints} pts</div>
      ) : null}
    </div>
  );
});

export type PosLegacyCreditFieldProps = {
  creditApplied: number;
  availableCreditBalance: number;
  amountBeforeCredit: number;
  hasCustomer: boolean;
  isApplyingCredit: boolean;
  /** Stable: clear the legacy credit. */
  onClear: () => void;
  /** Stable: apply this much credit (checks customer and bill room). */
  onApplyCredit: (amount: number) => void;
};

/**
 * Old separate "Cr" box: it drew from the same credit pool as the S/R Adj box and caused double
 * entry, so POSSales shows it only while a legacy amount is set, so it can be cleared.
 */
export const PosLegacyCreditField = memo(function PosLegacyCreditField({
  creditApplied,
  availableCreditBalance,
  amountBeforeCredit,
  hasCustomer,
  isApplyingCredit,
  onClear,
  onApplyCredit,
}: PosLegacyCreditFieldProps) {
  return (
    <div className="text-center">
      <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Cr ₹{availableCreditBalance.toFixed(0)}</div>
      <Input
        type="number"
        className="w-24 h-10 bg-purple-100 text-purple-700 text-center text-lg font-semibold border-0 rounded-md"
        value={creditApplied || ""}
        placeholder="0"
        onChange={(e) => {
          const typed = posLegacyCreditFromTyped(e.target.value, availableCreditBalance, amountBeforeCredit);
          if (typed.clear) onClear();
          else onApplyCredit(typed.amount);
        }}
        max={Math.min(availableCreditBalance, amountBeforeCredit)}
        step="0.01"
        disabled={!hasCustomer || isApplyingCredit}
      />
      {creditApplied > 0 && (
        <div className="text-[10px] text-green-400 font-semibold mt-0.5 text-center">✓ Applied</div>
      )}
    </div>
  );
});

export type PosAdvanceFieldProps = {
  availableAdvanceBalance: number;
  advanceApplied: number;
  /** Bill net; the advance cannot exceed it. */
  finalAmount: number;
  hasCustomer: boolean;
  exchangeRefundDue: number;
  openingBalanceRemaining: number;
  /** Stable: apply (or with 0 clear) the advance; checks and caps it. */
  onApplyAdvance: (amount: number) => void;
};

/** Customer's unused advance on this bill. */
export const PosAdvanceField = memo(function PosAdvanceField({
  availableAdvanceBalance,
  advanceApplied,
  finalAmount,
  hasCustomer,
  exchangeRefundDue,
  openingBalanceRemaining,
  onApplyAdvance,
}: PosAdvanceFieldProps) {
  return (
    <div className="text-center">
      <div className="text-sm text-white/90 uppercase font-bold mb-1 tracking-wide">Adv ₹{availableAdvanceBalance.toFixed(0)}</div>
      <Input
        type="number"
        className="w-24 h-10 bg-orange-100 text-orange-800 text-center text-lg font-semibold border-0 rounded-md"
        value={advanceApplied || ""}
        placeholder="0"
        onChange={(e) => onApplyAdvance(parseFloat(e.target.value) || 0)}
        max={capPosAdvanceApplyAmount({
          requested: availableAdvanceBalance,
          availableAdvanceBalance,
          billRoom: Math.max(0, finalAmount),
        })}
        step="0.01"
        disabled={
          !hasCustomer ||
          availableAdvanceBalance <= 0 ||
          exchangeRefundDue > 0.005 ||
          openingBalanceRemaining > 0.01
        }
      />
      {advanceApplied > 0 && (
        <div className="text-[10px] text-green-400 font-semibold mt-0.5 text-center">✓ Applied</div>
      )}
    </div>
  );
});
