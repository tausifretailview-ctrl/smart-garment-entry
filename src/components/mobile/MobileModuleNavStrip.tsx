import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";
import { MOBILE_SUMMARY_STRIP_ITEMS } from "@/lib/mobileReportNav";

/** Horizontal shortcut strip — reporting hubs only (no entry screens). */
export function MobileModuleNavStrip({ className }: { className?: string }) {
  const { orgNavigate } = useOrgNavigation();

  return (
    <div className={cn("px-4 pb-2 lg:hidden", className)}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
        {MOBILE_SUMMARY_STRIP_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => orgNavigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center shrink-0 w-[4.25rem] gap-1",
                "rounded-xl border border-border/60 bg-card px-1 py-2",
                "active:scale-95 touch-manipulation shadow-sm",
              )}
            >
              <Icon className={cn("h-5 w-5", item.color ?? "text-foreground")} />
              <span className="text-[9px] font-medium text-muted-foreground text-center leading-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
