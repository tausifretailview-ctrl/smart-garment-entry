import { ShieldAlert, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatInr, type CreditLimitCheck } from "@/utils/industrialMode";

type Props = {
  creditLimit: number | null;
  creditDays: number | null;
  check: CreditLimitCheck;
  dueDate?: Date | null;
  className?: string;
};

/**
 * Sale Invoice bottom bar (Industrial mode): party credit limit, room left and due date.
 * Red when this bill takes the party over the limit.
 */
export function CustomerCreditChip({ creditLimit, creditDays, check, dueDate, className }: Props) {
  const hasDays = creditDays != null && creditDays > 0;
  if (!check.hasLimit && !hasDays) return null;

  const over = check.exceeded;
  const Icon = over ? ShieldAlert : ShieldCheck;
  const title = check.hasLimit
    ? `Credit limit ${formatInr(creditLimit || 0)} · balance after this bill ${formatInr(check.balanceAfter)}` +
      (over ? ` · over by ${formatInr(check.overBy)}` : "")
    : "No credit limit set";

  return (
    <div
      className={cn(
        "h-9 px-3 flex items-center gap-2 rounded-sm border shrink-0 bg-white text-[13px] font-bold tabular-nums",
        over ? "border-red-300 text-red-600" : "border-sky-300 text-sky-800",
        className,
      )}
      title={title}
      data-testid="customer-credit-chip"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {check.hasLimit && (
        <span className="whitespace-nowrap">
          {over ? `Over limit by ${formatInr(check.overBy)}` : `Limit left ${formatInr(Math.max(0, check.availableBefore))}`}
        </span>
      )}
      {hasDays && (
        <span className="whitespace-nowrap font-semibold text-slate-500">
          {check.hasLimit && "· "}
          {creditDays} days{dueDate ? ` · due ${format(dueDate, "dd/MM/yyyy")}` : ""}
        </span>
      )}
    </div>
  );
}
