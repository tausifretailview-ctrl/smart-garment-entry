import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ResetPersistedFiltersButtonProps = {
  onReset: () => void;
  /** Hide when filters are already at defaults. */
  visible?: boolean;
  className?: string;
  label?: string;
};

/**
 * Visible escape hatch for pages that persist filters beyond the retention window.
 * Callers must clear React state AND `clearDashboardFilters(...)`.
 */
export function ResetPersistedFiltersButton({
  onReset,
  visible = true,
  className,
  label = "Reset filters",
}: ResetPersistedFiltersButtonProps) {
  if (!visible) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-8 gap-1.5 text-slate-600 hover:text-slate-900", className)}
      onClick={onReset}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
