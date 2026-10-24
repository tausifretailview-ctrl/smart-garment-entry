import { useState } from "react";
import { BarChart3, Bell, CheckCheck, Loader2, PackageX, Receipt, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { OWNER_ALERT_BADGE_LIMIT, useCanSeeOwnerAlerts, useOwnerAlertHistory } from "@/hooks/useOwnerAlertHistory";
import {
  groupOwnerAlertsByDay,
  matchesOwnerAlertFilter,
  type OwnerAlertFilter,
  type OwnerAlertItem,
} from "@/lib/ownerAlertHistory";
import { cn } from "@/lib/utils";

/**
 * Notifications: every owner alert the shop's phones were sent (bills, business
 * reports, day-end, low stock, reviews), newest first, so a missed one can be
 * opened later. Tapping a row opens the same screen as tapping the phone alert.
 */

const FILTERS: { id: OwnerAlertFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "bills", label: "Bills" },
  { id: "reports", label: "Reports" },
  { id: "stock", label: "Stock" },
  { id: "reviews", label: "Reviews" },
];

const PAGE = OWNER_ALERT_BADGE_LIMIT;

function KindIcon({ kind }: { kind: string }) {
  const base = "h-10 w-10 rounded-xl flex items-center justify-center shrink-0";
  switch (kind) {
    case "invoice":
      return (
        <div className={cn(base, "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300")}>
          <Receipt className="h-5 w-5" />
        </div>
      );
    case "low_stock":
      return (
        <div className={cn(base, "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300")}>
          <PackageX className="h-5 w-5" />
        </div>
      );
    case "review":
      return (
        <div className={cn(base, "bg-yellow-50 text-yellow-600 dark:bg-yellow-950/50 dark:text-yellow-300")}>
          <Star className="h-5 w-5" />
        </div>
      );
    default:
      return (
        <div className={cn(base, "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300")}>
          <BarChart3 className="h-5 w-5" />
        </div>
      );
  }
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function OwnerNotifications() {
  const { orgNavigate } = useOrgNavigation();
  const canSee = useCanSeeOwnerAlerts();
  const [limit, setLimit] = useState(PAGE);
  const [filter, setFilter] = useState<OwnerAlertFilter>("all");
  const { items, hasMore, isLoading, isFetching, isError, refetch, isUnread, markRead, unreadCount } =
    useOwnerAlertHistory(limit, canSee);

  const shown = items.filter((i) => matchesOwnerAlertFilter(i, filter, isUnread(i)));
  const groups = groupOwnerAlertsByDay(shown);

  const open = (item: OwnerAlertItem) => {
    markRead([item.id]);
    if (item.path) orgNavigate(item.path, { state: { fromNotifications: true } });
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-muted/30 pb-24 lg:pb-6">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">Notifications</h1>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "All shop alerts, newest first"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => void refetch()}
            aria-label="Refresh notifications"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            disabled={unreadCount === 0}
            onClick={() => markRead(items.filter(isUnread).map((i) => i.id))}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        </div>
        <div className="mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-4 pb-2.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors touch-manipulation",
                filter === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              {f.id === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-3">
        {!canSee ? (
          <Empty text="Notifications show shop alerts for owners. Ask the shop admin to turn on owner alerts on your phone." />
        ) : isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <Empty text="Could not load notifications. Check the internet and tap refresh." />
        ) : groups.length === 0 ? (
          <Empty
            text={
              filter === "all"
                ? "No notifications yet. Turn on owner alerts in Settings → Reports → Owner alerts."
                : "Nothing here."
            }
          />
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-1 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </p>
              <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm divide-y divide-border/60">
                {g.items.map((item) => {
                  const unread = isUnread(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => open(item)}
                      className={cn(
                        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors touch-manipulation",
                        "hover:bg-muted/50 active:bg-muted",
                        unread && "bg-primary/5",
                      )}
                    >
                      <KindIcon kind={item.kind} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm",
                              unread ? "font-bold text-foreground" : "font-medium text-foreground/90",
                            )}
                          >
                            {item.title}
                          </p>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {timeOf(item.createdAt)}
                          </span>
                        </div>
                        {item.body ? (
                          <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                            {item.body}
                          </p>
                        ) : null}
                      </div>
                      {unread ? <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {canSee && hasMore && !isLoading ? (
          <div className="py-2 text-center">
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => setLimit((l) => l + PAGE)}>
              {isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Show older
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Bell className="mb-2 h-9 w-9 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
