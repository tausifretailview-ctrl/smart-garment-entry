import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ErpDashboardKpiCardProps = {
  title: string;
  subtitle?: string;
  value: string;
  shellClass: string;
  valueClass: string;
  active?: boolean;
  onClick?: () => void;
};

export function ErpDashboardKpiCard({
  title,
  subtitle,
  value,
  shellClass,
  valueClass,
  active,
  onClick,
}: ErpDashboardKpiCardProps) {
  return (
    <Card
      className={cn(
        "rounded-xl border shadow-sm transition-shadow hover:shadow-md",
        shellClass,
        onClick && "cursor-pointer",
        active && "ring-2 ring-teal-600/35 ring-offset-1",
      )}
      onClick={onClick}
    >
      <CardContent className="flex min-h-[84px] flex-col items-center justify-center px-2 py-3 text-center sm:min-h-[92px] sm:px-3">
        <p className="text-sm font-semibold leading-snug text-slate-600">{title}</p>
        <p className={cn("mt-1.5 text-xl font-bold tabular-nums leading-none sm:text-2xl", valueClass)}>{value}</p>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}
