import { Monitor, Smartphone } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useDesktopViewActions, useShowDesktopChrome } from "@/hooks/useDesktopViewPreference";
import { MOBILE_DEFAULT_LANDING_PATH } from "@/lib/mobileShell";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DesktopViewToggleProps = {
  variant?: "menu-row" | "banner";
  className?: string;
};

/**
 * Switch between mobile shell and full desktop layout (sidebar, GL, wide forms).
 */
export function DesktopViewToggle({ variant = "menu-row", className }: DesktopViewToggleProps) {
  const { orgNavigate } = useOrgNavigation();
  const { forced, enableDesktopView, disableDesktopView } = useDesktopViewActions();
  const showDesktopChrome = useShowDesktopChrome();

  const handleEnable = () => {
    enableDesktopView();
    toast.success("Desktop view enabled", {
      description: "Sidebar and full menus are now available. Rotate to landscape for more space.",
      duration: 5000,
    });
    orgNavigate("/");
  };

  const handleDisable = () => {
    disableDesktopView();
    toast.success("Mobile view restored");
    orgNavigate(MOBILE_DEFAULT_LANDING_PATH);
  };

  if (variant === "banner" && showDesktopChrome && forced) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 rounded-xl",
          "bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50",
          className,
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Monitor className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-900 dark:text-amber-100 leading-snug">
            Desktop view — use landscape for wide screens
          </p>
        </div>
        <button
          type="button"
          onClick={handleDisable}
          className="shrink-0 text-xs font-medium text-amber-800 dark:text-amber-200 underline touch-manipulation"
        >
          Mobile app
        </button>
      </div>
    );
  }

  if (variant === "menu-row") {
    return (
      <button
        type="button"
        onClick={forced ? handleDisable : handleEnable}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted/40 transition-colors touch-manipulation text-left",
          className,
        )}
      >
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center",
            forced ? "bg-slate-100 dark:bg-slate-800" : "bg-blue-50 dark:bg-blue-950/50",
          )}
        >
          {forced ? (
            <Smartphone className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          ) : (
            <Monitor className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {forced ? "Switch to mobile app" : "Open full desktop view"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {forced
              ? "Bottom tabs and mobile home"
              : "Sidebar, accounting, reports, wide tables"}
          </p>
        </div>
      </button>
    );
  }

  return null;
}
