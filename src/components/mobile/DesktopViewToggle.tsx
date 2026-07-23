import { Monitor, Smartphone } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useDesktopViewActions, useForceDesktopView, useShowDesktopChrome } from "@/hooks/useDesktopViewPreference";
import { useIsNarrowViewport } from "@/hooks/use-mobile";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { resolveMobileLandingPath } from "@/lib/menuPermissions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DesktopViewToggleProps = {
  variant?: "menu-row" | "banner";
  className?: string;
};

/**
 * Fixed escape hatch when desktop view is forced on a phone-width screen.
 * Always on top — not buried in menus or scrollable headers.
 */
export function DesktopViewEscapeHatch() {
  const forced = useForceDesktopView();
  const isNarrow = useIsNarrowViewport();
  const { disableDesktopView } = useDesktopViewActions();
  const { orgNavigate } = useOrgNavigation();
  const { organizationRole } = useOrganization();
  const { hasMenuAccess, permissions } = useUserPermissions();

  if (!forced || !isNarrow) return null;

  const handleSwitch = () => {
    disableDesktopView();
    toast.success("Mobile view restored");
    const landing = resolveMobileLandingPath(hasMenuAccess, permissions, organizationRole);
    orgNavigate(`/${landing}`);
  };

  return (
    <button
      type="button"
      onClick={handleSwitch}
      className={cn(
        "fixed left-1/2 -translate-x-1/2 z-[100]",
        "flex items-center gap-2 px-4 py-2 rounded-full shadow-lg",
        "bg-primary text-primary-foreground text-xs font-semibold",
        "border border-primary-foreground/20 touch-manipulation active:scale-[0.97]",
        "bottom-[calc(env(safe-area-inset-bottom,0px)+var(--erp-status-bar-height,1.75rem)+0.5rem)]",
        "max-w-[calc(100vw-1.5rem)]",
      )}
      aria-label="Switch to mobile view"
    >
      <Smartphone className="h-4 w-4 shrink-0" />
      <span className="truncate">Switch to Mobile View</span>
    </button>
  );
}

/**
 * Switch between mobile shell and full desktop layout (sidebar, GL, wide forms).
 */
export function DesktopViewToggle({ variant = "menu-row", className }: DesktopViewToggleProps) {
  const { orgNavigate } = useOrgNavigation();
  const { forced, enableDesktopView, disableDesktopView } = useDesktopViewActions();
  const showDesktopChrome = useShowDesktopChrome();
  const isNarrow = useIsNarrowViewport();
  const { organizationRole } = useOrganization();
  const { hasMenuAccess, permissions } = useUserPermissions();

  const handleEnable = () => {
    if (isNarrow) {
      const ok = window.confirm(
        "Desktop view is meant for larger screens and tablets. Continue?",
      );
      if (!ok) return;
    }
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
    const landing = resolveMobileLandingPath(hasMenuAccess, permissions, organizationRole);
    orgNavigate(`/${landing}`);
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
