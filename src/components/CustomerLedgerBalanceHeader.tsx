import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ledgerBalanceCheck,
  ledgerHeadline,
  ledgerThreeLineSummary,
  type LedgerHeadlineRow,
} from "@/utils/customerLedgerHeadline";

type Props = {
  /** The same rows the ledger table renders. */
  rows: LedgerHeadlineRow[];
  /** Account check (getCustomerAccountState net position). Lifetime figure. */
  checkBalance?: number | null;
  checkLoading?: boolean;
  /** Set when a date filter is on: the headline is the balance on that date. */
  asOfDate?: Date | null;
  onCheckAccount?: () => void;
  className?: string;
};

const inr = (n: number) =>
  `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One balance, in plain words, that the user can add up from the table below it.
 * See src/utils/customerLedgerHeadline.ts.
 */
export function CustomerLedgerBalanceHeader({
  rows,
  checkBalance,
  checkLoading,
  asOfDate,
  onCheckAccount,
  className,
}: Props) {
  const summary = ledgerThreeLineSummary(rows);
  const headline = ledgerHeadline(summary.balance);
  // The check covers the whole account, so it only applies to the unfiltered ledger.
  const check = asOfDate
    ? null
    : ledgerBalanceCheck({ tableBalance: summary.balance, checkBalance, checkLoading });

  const tone =
    headline.kind === "owes"
      ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300"
      : headline.kind === "credit"
        ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
        : "bg-slate-50 border-slate-200 text-foreground dark:bg-slate-900 dark:border-slate-700";

  const lines: Array<{ label: string; value: number; sign: "+" | "−" | "" }> = [
    ...(Math.abs(summary.opening) > 0.005
      ? [{ label: "Opening balance", value: summary.opening, sign: "" as const }]
      : []),
    { label: "Bills", value: summary.bills, sign: "+" },
    { label: "Paid / credited (cash, UPI, card, returns, credit notes, advances)", value: summary.paidCredited, sign: "−" },
    { label: "Refunds paid back", value: summary.refunds, sign: "+" },
    ...(Math.abs(summary.other) > 0.005
      ? [{ label: "Other adjustments", value: summary.other, sign: "+" as const }]
      : []),
  ];

  return (
    <div
      className={cn("rounded-xl border px-5 py-4 w-full sm:w-auto sm:min-w-[280px]", tone, className)}
      data-testid="customer-ledger-balance-header"
    >
      <div className="text-sm text-muted-foreground">
        {asOfDate
          ? `Balance on ${asOfDate.toLocaleDateString("en-IN")}`
          : "Balance"}
      </div>
      <div className="text-3xl font-bold tabular-nums" data-testid="ledger-headline-amount">
        {headline.kind === "settled" ? "₹0.00" : inr(headline.amount)}
      </div>
      <div className="mt-1 text-sm font-medium" data-testid="ledger-headline-label">
        {headline.label}
      </div>

      <dl className="mt-3 space-y-0.5 text-xs text-foreground/80">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{l.label}</dt>
            <dd className="tabular-nums">
              {l.sign} {inr(l.value)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-current/20 pt-1 font-semibold">
          <dt>= Balance</dt>
          <dd className="tabular-nums">
            {inr(summary.balance)} {summary.balance > 0.5 ? "Dr" : summary.balance < -0.5 ? "Cr" : ""}
          </dd>
        </div>
      </dl>

      {check?.needsChecking && (
        <button
          type="button"
          onClick={onCheckAccount}
          className="mt-3 w-full text-left"
          data-testid="ledger-needs-checking"
        >
          <Badge
            variant="outline"
            className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 gap-1"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Balance needs checking
          </Badge>
          <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
            The system check gives {inr(check.checkBalance ?? 0)}{" "}
            {(check.checkBalance ?? 0) > 0.5 ? "Dr" : (check.checkBalance ?? 0) < -0.5 ? "Cr" : ""}. Some entries
            may be duplicated or linked to a deleted bill. Tap to check this account.
          </p>
        </button>
      )}
    </div>
  );
}
