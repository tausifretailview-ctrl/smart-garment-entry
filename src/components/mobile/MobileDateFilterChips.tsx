import { cn } from "@/lib/utils";

interface MobileDateFilterChipsProps {
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
}

const periods = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

export const MobileDateFilterChips = ({
  selectedPeriod,
  onPeriodChange
}: MobileDateFilterChipsProps) => {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onPeriodChange(period.value)}
          className={cn(
            "px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150",
            "touch-manipulation active:scale-95",
            selectedPeriod === period.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
};
