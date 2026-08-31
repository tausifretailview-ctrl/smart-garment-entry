import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex-1 min-w-[88px] rounded-xl border border-border/40 bg-card p-2.5">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className={cn("text-sm font-bold mt-0.5 tabular-nums", color || "text-foreground")}>{value}</p>
    </div>
  );
}
