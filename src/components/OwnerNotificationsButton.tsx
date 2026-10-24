import { BellRing } from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOwnerAlertUnreadCount } from "@/hooks/useOwnerAlertHistory";
import { cn } from "@/lib/utils";

/**
 * Opens the Notifications page (owner alert history) with an unread badge.
 * Hidden for users who don't get owner alerts.
 */
export function OwnerNotificationsButton({
  className,
  iconClassName = "h-4 w-4",
  badgeClassName,
}: {
  className?: string;
  iconClassName?: string;
  badgeClassName?: string;
}) {
  const { orgNavigate } = useOrgNavigation();
  const { canSee, unread } = useOwnerAlertUnreadCount();
  if (!canSee) return null;
  return (
    <button
      type="button"
      onClick={() => orgNavigate("/notifications")}
      className={cn("relative flex items-center justify-center touch-manipulation", className)}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      title="Notifications"
    >
      <BellRing className={iconClassName} />
      {unread > 0 && (
        <span
          className={cn(
            "absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground",
            "text-[10px] font-bold flex items-center justify-center leading-none",
            badgeClassName,
          )}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
