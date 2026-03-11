import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: string;
  color: string;
  bg: string;
  onClick?: () => void;
}

export const MobileStatStrip = ({ stats }: { stats: Stat[] }) => (
  <div className={cn("grid gap-2 px-4", stats.length <= 3 ? "grid-cols-3" : "grid-cols-4")}>
    {stats.map((s) => (
      <button
        key={s.label}
        onClick={s.onClick}
        className={cn("rounded-xl p-2.5 text-left transition-all active:scale-95 touch-manipulation", s.bg)}
      >
        <p className="text-[10px] font-medium text-muted-foreground truncate">{s.label}</p>
        <p className={cn("text-sm font-bold tabular-nums mt-0.5 truncate", s.color)}>{s.value}</p>
      </button>
    ))}
  </div>
);
