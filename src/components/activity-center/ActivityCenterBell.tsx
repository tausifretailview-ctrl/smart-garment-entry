import { lazy, Suspense } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useActivityCenter } from "@/contexts/ActivityCenterContext";

const ActivityCenterPanel = lazy(() =>
  import("@/components/activity-center/ActivityCenterPanel").then((m) => ({
    default: m.ActivityCenterPanel,
  })),
);

const prefetchActivityCenterPanel = () => {
  void import("@/components/activity-center/ActivityCenterPanel");
};

/** Bell trigger in the header; panel chunk loads on first open. */
export function ActivityCenterBell() {
  const {
    open,
    setOpen,
    panelMounted,
    requestPanelMount,
    badgeCount,
    triggerRef,
  } = useActivityCenter();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          prefetchActivityCenterPanel();
          requestPanelMount();
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          onMouseEnter={prefetchActivityCenterPanel}
          onFocus={prefetchActivityCenterPanel}
          className={cn(
            "erp-no-drag relative h-8 w-8 text-[var(--erp-chrome-ink-dim)] hover:text-white hover:bg-white/10",
            open && "bg-white/12 text-white",
          )}
          aria-label={
            badgeCount > 0 ? `Activity, ${badgeCount} unread` : "Activity"
          }
          title="Activity"
        >
          <Bell className="h-4 w-4" />
          {badgeCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center border-2 border-[var(--erp-chrome)] leading-none">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(480px,calc(100vw-1.5rem))] p-0 shadow-xl z-[95]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {panelMounted ? (
          <Suspense
            fallback={
              <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            }
          >
            <ActivityCenterPanel />
          </Suspense>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
