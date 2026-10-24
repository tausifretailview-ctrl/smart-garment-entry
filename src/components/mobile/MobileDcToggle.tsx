import { Eye, EyeOff } from "lucide-react";
import { useDcVisibility } from "@/hooks/useDcVisibility";
import { cn } from "@/lib/utils";

/** More-menu row — phone version of Ctrl+Shift+H. Shown for "Hide DC" shops, or while flipped. */
export function MobileDcToggle({ className }: { className?: string }) {
  const { mode, hideDc, flipped, canFlip, toggle } = useDcVisibility();
  if (!canFlip || (mode === "show" && !flipped)) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted/40 transition-colors touch-manipulation text-left",
        className,
      )}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-50 dark:bg-orange-950/50">
        {hideDc ? (
          <Eye className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        ) : (
          <EyeOff className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          {hideDc ? "Show DC transactions" : "Hide DC transactions"}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {flipped ? "Goes back to the shop setting after 15 minutes idle" : "DC purchases, stock and sales"}
        </p>
      </div>
    </button>
  );
}
