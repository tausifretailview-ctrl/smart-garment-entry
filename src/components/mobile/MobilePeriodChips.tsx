import { cn } from "@/lib/utils";

interface Period {
  value: string;
  label: string;
}

const DEFAULT_PERIODS: Period[] = [
  { value: "daily", label: "Today" },
  { value: "monthly", label: "Month" },
  { value: "yearly", label: "Year" },
  { value: "all", label: "All" },
];

export const MobilePeriodChips = ({
  value,
  onChange,
  periods = DEFAULT_PERIODS,
}: {
  value: string;
  onChange: (v: string) => void;
  periods?: Period[];
}) => (
  <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar">
    {periods.map((p) => (
      <button
        key={p.value}
        onClick={() => onChange(p.value)}
        className={cn(
          "flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all touch-manipulation",
          value === p.value
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-muted text-muted-foreground"
        )}
      >
        {p.label}
      </button>
    ))}
  </div>
);
