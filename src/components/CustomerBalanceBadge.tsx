import { CreditCard, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  customerBalanceBreakdown,
  formatAccountInr,
  formatNetPositionLabel,
} from "@/utils/customerAccountStateView";

type Props = {
  /** Same facets as CustomerAccountSummaryStrip (getCustomerAccountState via useCustomerBalance). */
  grossOutstanding: number;
  unusedAdvance: number;
  pendingCn: number;
  netPosition: number;
  isLoading?: boolean;
  customerName?: string | null;
  className?: string;
};

/**
 * Compact form of the one customer balance: Net balance, with pending CN and advance shown
 * beside it and the full "Bills due − Pending CN − Advance = Net" line on hover.
 * Used where the full strip does not fit (POS / Sale Invoice entry bars).
 */
export function CustomerBalanceBadge({
  grossOutstanding,
  unusedAdvance,
  pendingCn,
  netPosition,
  isLoading = false,
  customerName,
  className,
}: Props) {
  const b = customerBalanceBreakdown({
    outstanding: grossOutstanding,
    unusedAdvance,
    unclaimedSaleReturn: pendingCn,
    netPosition,
  });
  const title =
    `${customerName ? `${customerName} — ` : ""}Bills due ${formatAccountInr(b.billsDue)}` +
    (b.pendingCn > 0 ? ` − Pending CN / return ${formatAccountInr(b.pendingCn)}` : "") +
    ` − Advance held ${formatAccountInr(b.unusedAdvance)} = Net balance ${formatNetPositionLabel(b.net)}`;

  return (
    <div
      className={cn(
        "h-9 px-3 flex items-center gap-1.5 rounded-sm border shrink-0 bg-white font-extrabold tabular-nums",
        isLoading && "border-slate-400 text-slate-400",
        !isLoading && b.net > 0 && "border-red-300 text-red-600",
        !isLoading && b.net < 0 && "border-emerald-300 text-emerald-600",
        !isLoading && b.net === 0 && "border-slate-300 text-slate-500",
        className,
      )}
      title={isLoading ? "Customer balance" : title}
      data-testid="customer-balance-badge"
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
      ) : (
        <>
          <CreditCard className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[13px] whitespace-nowrap">
            {formatAccountInr(b.net)}
            {b.net > 0 ? " due" : b.net < 0 ? " credit" : " settled"}
          </span>
          {b.pendingCn > 0 && (
            <span className="text-[11px] font-semibold px-1 rounded bg-purple-500/10 text-purple-700 whitespace-nowrap">
              CN {formatAccountInr(b.pendingCn)}
            </span>
          )}
          {b.unusedAdvance > 0 && (
            <span className="text-[11px] font-semibold px-1 rounded bg-orange-500/10 text-orange-700 whitespace-nowrap">
              Adv {formatAccountInr(b.unusedAdvance)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
