import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type AccountingKpiItem = {
  label: string;
  value: string;
  sub?: string;
  gradient: string;
  icon: LucideIcon;
  highlight?: boolean;
};

/** Compact KPI strip — same density as Customer Balances totals. */
export function AccountingReportKpiCards({ items }: { items: AccountingKpiItem[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        "grid gap-2 print:hidden w-full",
        items.length <= 3 && "grid-cols-1 sm:grid-cols-3",
        items.length === 4 && "grid-cols-2 lg:grid-cols-4",
        items.length >= 5 && "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={cn(
              "rounded-lg px-3 py-2 min-w-0 shadow-sm",
              item.gradient,
              item.highlight && "ring-2 ring-white/70",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-white/80 leading-none truncate">{item.label}</p>
              <Icon className="h-3.5 w-3.5 text-white/80 shrink-0" />
            </div>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              {item.value}
            </p>
            {item.sub ? (
              <p className="text-[11px] text-white/65 mt-0.5 truncate">{item.sub}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
