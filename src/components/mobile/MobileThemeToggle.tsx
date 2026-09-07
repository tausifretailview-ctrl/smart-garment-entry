import { Palette, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { useMobileUiThemeActions } from "@/hooks/useMobileUiTheme";
import { cn } from "@/lib/utils";

/** More-menu row — switch the Home / POS / Purchase screens between the
 * classic look and the premium Ezzy redesign. Presentation only. */
export function MobileThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useMobileUiThemeActions();
  const isPremium = theme === "premium";

  const handleToggle = () => {
    const next = isPremium ? "classic" : "premium";
    setTheme(next);
    toast.success(next === "premium" ? "Premium theme enabled" : "Classic theme restored");
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted/40 transition-colors touch-manipulation text-left",
        className,
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center",
          isPremium ? "bg-blue-50 dark:bg-blue-950/50" : "bg-slate-100 dark:bg-slate-800",
        )}
      >
        {isPremium ? (
          <Palette className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        ) : (
          <LayoutTemplate className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          {isPremium ? "Switch to classic look" : "Switch to premium look"}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {isPremium
            ? "Restore the current Home, POS and Purchase screens"
            : "Dark-shell redesign for Home, POS and Purchase"}
        </p>
      </div>
    </button>
  );
}
