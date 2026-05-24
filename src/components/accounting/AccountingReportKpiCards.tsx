import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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

function KpiCard({ item }: { item: AccountingKpiItem }) {
  const Icon = item.icon;
  return (
    <Card
      className={cn(
        "border-0 shadow-md rounded-xl min-w-0",
        item.gradient,
        item.highlight && "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-100",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-2 px-2.5">
        <CardDescription className="text-xs font-medium text-white/80 leading-tight">
          {item.label}
        </CardDescription>
        <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
      </CardHeader>
      <CardContent className="px-2.5 pb-2 pt-0">
        <div className="text-lg xl:text-xl font-black text-white tabular-nums leading-tight truncate">
          {item.value}
        </div>
        {item.sub ? (
          <p className="text-xs text-white/65 mt-0.5 truncate">{item.sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AccountingReportKpiCards({ items }: { items: AccountingKpiItem[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        "grid gap-2 print:hidden",
        items.length <= 3 && "grid-cols-1 sm:grid-cols-3",
        items.length === 4 && "grid-cols-2 lg:grid-cols-4",
        items.length >= 5 && "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
      )}
    >
      {items.map((item) => (
        <KpiCard key={item.label} item={item} />
      ))}
    </div>
  );
}
