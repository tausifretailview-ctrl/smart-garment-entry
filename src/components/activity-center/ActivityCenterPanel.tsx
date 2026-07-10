import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  DollarSign,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActivityCenter } from "@/contexts/ActivityCenterContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWindowTabs } from "@/contexts/WindowTabsContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import {
  normalizeActivityPath,
  queueActivityNavigation,
} from "@/lib/activityCenterNavigation";
import {
  groupActivityNotifications,
  useActivityNotifications,
  type ActivityNotificationItem,
  type ActivityTab,
} from "@/hooks/useActivityNotifications";
import type { ActivityCategory } from "@/lib/activityCenterReadState";

const TABS: { id: ActivityTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stock", label: "Stock" },
  { id: "payments", label: "Payments" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "system", label: "System" },
];

function TypeIcon({ type }: { type: ActivityCategory }) {
  const base = "h-8 w-8 rounded-lg flex items-center justify-center shrink-0";
  switch (type) {
    case "stock":
      return (
        <div className={cn(base, "bg-amber-50 text-amber-600")}>
          <AlertTriangle className="h-4 w-4" />
        </div>
      );
    case "payments":
      return (
        <div className={cn(base, "bg-red-50 text-red-600")}>
          <DollarSign className="h-4 w-4" />
        </div>
      );
    case "whatsapp":
      return (
        <div className={cn(base, "bg-green-50 text-green-600")}>
          <MessageCircle className="h-4 w-4" />
        </div>
      );
    default:
      return (
        <div className={cn(base, "bg-muted border border-border text-muted-foreground")}>
          <CheckCircle2 className="h-4 w-4" />
        </div>
      );
  }
}

function ActivityRow({
  item,
  onNavigate,
}: {
  item: ActivityNotificationItem;
  onNavigate: (item: ActivityNotificationItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(item)}
      className={cn(
        "w-full flex gap-3 p-3 rounded-lg text-left relative transition-colors",
        item.unread ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/60",
      )}
    >
      <TypeIcon type={item.type} />
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-[13px] font-semibold leading-snug">{item.title}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-3">{item.subtitle}</p>
        <p className="text-[11px] text-primary font-bold mt-1.5">{item.ctaLabel}</p>
        {!item.unread && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
          </p>
        )}
      </div>
      {item.unread && (
        <span
          className="absolute top-3.5 right-2.5 h-1.5 w-1.5 rounded-full bg-primary"
          aria-hidden
        />
      )}
    </button>
  );
}

export function ActivityCenterPanel() {
  const { readState, markAllRead, markCategoryRead, setOpen } = useActivityCenter();
  const { currentOrganization } = useOrganization();
  const { openWindow } = useWindowTabs();
  const { orgNavigate } = useOrgNavigation();
  const [activeTab, setActiveTab] = useState<ActivityTab>("all");

  const { notifications, tabCounts, isLoading } = useActivityNotifications(readState, true);

  const filtered =
    activeTab === "all" ? notifications : notifications.filter((n) => n.type === activeTab);

  const groups = groupActivityNotifications(filtered);

  const handleNavigate = (item: ActivityNotificationItem) => {
    markCategoryRead(item.type);
    setOpen(false);

    const navState = {
      ...(item.navigateState ?? {}),
      activityNavTs: Date.now(),
    };

    if (currentOrganization?.id) {
      queueActivityNavigation(currentOrganization.id, item.path, navState);
    }

    const tabPath = normalizeActivityPath(item.path);
    if (tabPath) {
      openWindow(tabPath);
    }

    orgNavigate(item.path, { state: navState });
  };

  const handleViewAll = () => {
    const firstUnread = notifications.find((n) => n.unread);
    if (firstUnread) {
      handleNavigate(firstUnread);
      return;
    }
    setOpen(false);
    orgNavigate("/reports");
  };

  return (
    <div
      className="flex flex-col max-h-[min(82vh,640px)] min-h-[320px]"
      role="dialog"
      aria-label="Activity center"
    >
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-border shrink-0">
        <span className="font-bold text-base">Activity</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={markAllRead}
          className="text-[11px] font-semibold text-primary hover:underline"
        >
          Mark all read
        </button>
      </div>

      <div
        className="flex gap-0.5 px-3 pt-2 border-b border-border shrink-0 overflow-x-auto"
        role="tablist"
        aria-label="Activity filters"
      >
        {TABS.map((tab) => {
          const count = tabCounts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "text-[12px] font-semibold px-2.5 py-1.5 border-b-2 whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground",
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1 text-[10px] bg-red-50 text-red-600 rounded-full px-1.5 py-px font-bold">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 p-2">
        {isLoading && filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading activity…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">You&apos;re all caught up</p>
            <p className="text-xs text-muted-foreground/80 mt-1">No activity in this category</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-2.5 pt-2 pb-1">
                {group.label}
              </p>
              {group.items.map((item) => (
                <ActivityRow key={item.id} item={item} onNavigate={handleNavigate} />
              ))}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border py-2.5 text-center shrink-0">
        <button
          type="button"
          onClick={handleViewAll}
          className="text-[12px] font-semibold text-primary hover:underline"
        >
          {notifications.some((n) => n.unread)
            ? "Open top priority →"
            : "View all activity →"}
        </button>
      </div>
    </div>
  );
}
