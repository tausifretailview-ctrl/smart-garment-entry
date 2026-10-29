import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, BellRing, CheckCheck, ChevronRight, Loader2, PackageX, Receipt, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useCanSeeOwnerAlerts, useOwnerAlertHistory } from "@/hooks/useOwnerAlertHistory";
import {
  istDayBoundsIso,
  istDayOffset,
  matchesOwnerAlertFilter,
  ownerAlertKindLabel,
  type OwnerAlertFilter,
  type OwnerAlertItem,
} from "@/lib/ownerAlertHistory";
import { cn } from "@/lib/utils";

/**
 * Notifications: every owner alert the shop's phones were sent (bills, business
 * reports, day-end, low stock, reviews), numbered newest first, so a missed one can
 * be opened later. Clicking a row opens the same screen as tapping the phone alert.
 */

const FILTERS: { id: OwnerAlertFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "bills", label: "Bills" },
  { id: "reports", label: "Reports" },
  { id: "stock", label: "Low stock" },
  { id: "reviews", label: "Reviews" },
];

const PAGE = 100;

const KIND_STYLE: Record<string, { icon: typeof Receipt; tone: string }> = {
  invoice: { icon: Receipt, tone: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900" },
  low_stock: { icon: PackageX, tone: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" },
  review: { icon: Star, tone: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900" },
  default: { icon: BarChart3, tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900" },
};

function KindBadge({ kind }: { kind: string }) {
  const { icon: Icon, tone } = KIND_STYLE[kind] ?? KIND_STYLE.default;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold whitespace-nowrap", tone)}>
      <Icon className="h-3.5 w-3.5" />
      {ownerAlertKindLabel(kind)}
    </span>
  );
}

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function OwnerNotifications() {
  const { orgNavigate } = useOrgNavigation();
  const canSee = useCanSeeOwnerAlerts();
  const [today, setToday] = useState(() => istDayOffset(0));
  const [fromDay, setFromDay] = useState(() => istDayOffset(-29));
  const [toDay, setToDay] = useState(today);

  // A tab left open over midnight: "To" was today, so it follows the date; a chosen past day stays.
  useEffect(() => {
    const roll = () => {
      const now = istDayOffset(0);
      if (now === today) return;
      setToDay((d) => (d === today ? now : d));
      setToday(now);
    };
    const timer = window.setInterval(roll, 60_000);
    document.addEventListener("visibilitychange", roll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", roll);
    };
  }, [today]);
  const [limit, setLimit] = useState(PAGE);
  const [filter, setFilter] = useState<OwnerAlertFilter>("all");

  const range = useMemo(
    () => ({
      from: fromDay ? istDayBoundsIso(fromDay, "start") : undefined,
      to: toDay ? istDayBoundsIso(toDay, "end") : undefined,
    }),
    [fromDay, toDay],
  );
  const { items, hasMore, isLoading, isFetching, isError, refetch, isUnread, markRead } = useOwnerAlertHistory(
    limit,
    canSee,
    range,
  );

  const counts = {} as Record<OwnerAlertFilter, number>;
  for (const f of FILTERS) counts[f.id] = items.filter((i) => matchesOwnerAlertFilter(i, f.id, isUnread(i))).length;
  const shown = items.filter((i) => matchesOwnerAlertFilter(i, filter, isUnread(i)));

  const open = (item: OwnerAlertItem) => {
    markRead([item.id]);
    if (item.path) orgNavigate(item.path, { state: { fromNotifications: true } });
  };

  const setRange = (from: string, to: string) => {
    setFromDay(from);
    setToDay(to);
    setLimit(PAGE);
  };

  const emptyText =
    filter === "all"
      ? "No shop alerts were sent in these dates. Owner alerts are turned on in Settings → Reports → Owner alerts."
      : filter === "unread"
        ? counts.all > 0
          ? `No unread notifications from the last 7 days. Tap All to see all ${counts.all} notifications in these dates.`
          : "No unread notifications."
        : `No ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} notifications in these dates.`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 pt-2 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] dark:bg-background sm:px-3 lg:pb-2">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        {/* Phone toolbar: title + small actions, dates on one row, scrollable tabs */}
        <div className="shrink-0 space-y-2 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <h1 className="flex min-w-0 items-center gap-1.5 text-lg font-bold leading-none tracking-tight text-teal-700 dark:text-teal-400">
              <BellRing className="h-4 w-4 shrink-0" />
              Notifications
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={counts.unread === 0}
                onClick={() => markRead(items.filter(isUnread).map((i) => i.id))}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-teal-700 touch-manipulation active:bg-teal-50 disabled:text-slate-400 dark:text-teal-400 dark:active:bg-muted dark:disabled:text-muted-foreground"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
              <button
                type="button"
                onClick={() => void refetch()}
                aria-label="Refresh notifications"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 touch-manipulation active:bg-slate-100 dark:text-muted-foreground dark:active:bg-muted"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "notif-from-m", label: "From", value: fromDay, max: toDay || today, set: (v: string) => setRange(v, toDay) },
                { id: "notif-to-m", label: "To", value: toDay, max: today, set: (v: string) => setRange(fromDay, v) },
              ] as const
            ).map((d) => (
              <label
                key={d.id}
                htmlFor={d.id}
                className="flex h-9 min-w-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white pl-2 dark:border-border dark:bg-card"
              >
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{d.label}</span>
                <input
                  id={d.id}
                  type="date"
                  value={d.value}
                  max={d.max}
                  onChange={(e) => d.set(e.target.value)}
                  className="h-full min-w-0 flex-1 bg-transparent pr-1 text-[13px] tabular-nums text-foreground outline-none"
                />
              </label>
            ))}
          </div>

          <div
            role="tablist"
            className="-mx-2 flex gap-1 overflow-x-auto border-b border-slate-200 px-2 [scrollbar-width:none] dark:border-border [&::-webkit-scrollbar]:hidden"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "-mb-px inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-2.5 text-[13px] font-semibold touch-manipulation",
                  filter === f.id
                    ? "border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-400"
                    : "border-transparent text-slate-500 dark:text-muted-foreground",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] font-bold leading-4 tabular-nums",
                    filter === f.id
                      ? "bg-teal-600 text-white dark:bg-teal-500"
                      : f.id === "unread" && counts.unread > 0
                        ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                        : "bg-slate-100 text-slate-500 dark:bg-muted",
                  )}
                >
                  {canSee && !isLoading ? counts[f.id] : "–"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="hidden shrink-0 flex-wrap items-end justify-between gap-2 md:flex">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-teal-700 dark:text-teal-400">
              <BellRing className="h-5 w-5 shrink-0" />
              Notifications
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              Shop alerts sent to the owner's phone · bills, business reports, day-end, low stock, reviews · newest first
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            <div className="space-y-1">
              <Label htmlFor="notif-from" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                From
              </Label>
              <Input
                id="notif-from"
                type="date"
                value={fromDay}
                max={toDay || today}
                onChange={(e) => setRange(e.target.value, toDay)}
                className="h-9 w-[9.5rem] border-slate-200 bg-white text-sm dark:bg-card"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="notif-to" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                To
              </Label>
              <Input
                id="notif-to"
                type="date"
                value={toDay}
                max={today}
                onChange={(e) => setRange(fromDay, e.target.value)}
                className="h-9 w-[9.5rem] border-slate-200 bg-white text-sm dark:bg-card"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              onClick={() => void refetch()}
              aria-label="Refresh notifications"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3 text-sm"
              disabled={counts.unread === 0}
              onClick={() => markRead(items.filter(isUnread).map((i) => i.id))}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          </div>
        </div>

        {/* Filter tabs with counts */}
        <div className="hidden shrink-0 flex-wrap gap-1 md:flex">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "h-9 rounded-md border px-4 text-sm font-semibold shadow-sm transition-colors touch-manipulation",
                filter === f.id
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:text-slate-900 dark:border-border dark:bg-card dark:text-muted-foreground",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-px text-xs font-bold tabular-nums",
                  filter === f.id
                    ? "bg-white/20 text-white"
                    : f.id === "unread" && counts.unread > 0
                      ? "bg-red-50 text-red-600"
                      : "bg-slate-100 text-slate-500 dark:bg-muted",
                )}
              >
                {canSee && !isLoading ? counts[f.id] : "–"}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
          {!canSee ? (
            <Empty text="Notifications show shop alerts for owners. Ask the shop admin to turn on owner alerts on your phone." />
          ) : isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : isError ? (
            <Empty text="Could not load notifications. Check the internet and click refresh." />
          ) : shown.length === 0 ? (
            <Empty text={emptyText} />
          ) : (
            <>
              {/* Desktop / tablet: table */}
              <table className="hidden w-full border-collapse text-sm md:table">
                <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-muted dark:text-muted-foreground">
                  <tr>
                    <th className="w-14 px-3 py-2.5 text-right">#</th>
                    <th className="w-32 px-3 py-2.5">Date</th>
                    <th className="w-24 px-3 py-2.5">Time</th>
                    <th className="w-40 px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Notification</th>
                    <th className="w-24 px-3 py-2.5">Status</th>
                    <th className="w-24 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-border">
                  {shown.map((item, idx) => {
                    const unread = isUnread(item);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => open(item)}
                        className={cn(
                          "cursor-pointer align-top transition-colors hover:bg-teal-50/60 dark:hover:bg-muted/60",
                          unread && "bg-blue-50/50 dark:bg-blue-950/20",
                        )}
                      >
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-500">{idx + 1}</td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums">{dateOf(item.createdAt)}</td>
                        <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600 dark:text-muted-foreground">
                          {timeOf(item.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          <KindBadge kind={item.kind} />
                        </td>
                        <td className="px-3 py-3">
                          <p className={cn("text-[15px] text-foreground", unread ? "font-bold" : "font-medium")}>{item.title}</p>
                          {item.body ? (
                            <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{item.body}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          {unread ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                              <span className="h-2 w-2 rounded-full bg-blue-600" />
                              Unread
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">Read</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {item.path ? (
                            <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-teal-700 dark:text-teal-400">
                              Open
                              <ChevronRight className="h-4 w-4" />
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Phone: numbered cards */}
              <div className="divide-y divide-slate-100 md:hidden dark:divide-border">
                {shown.map((item, idx) => {
                  const unread = isUnread(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => open(item)}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-3 py-3 text-left touch-manipulation active:bg-muted",
                        unread && "bg-blue-50/50 dark:bg-blue-950/20",
                      )}
                    >
                      <span className="mt-0.5 w-6 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <KindBadge kind={item.kind} />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {dateOf(item.createdAt)} · {timeOf(item.createdAt)}
                          </span>
                        </div>
                        <p className={cn("mt-1 text-[15px] leading-snug text-foreground", unread ? "font-bold" : "font-medium")}>
                          {item.title}
                        </p>
                        {item.body ? (
                          <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{item.body}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
                        {unread ? <span className="h-2.5 w-2.5 rounded-full bg-blue-600" aria-label="Unread" /> : null}
                        {item.path ? <ChevronRight className="h-5 w-5 text-slate-400" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {canSee && !isLoading && items.length > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5 text-sm text-muted-foreground dark:border-border">
              <span>
                Showing {shown.length} of {items.length} loaded
              </span>
              {hasMore ? (
                <Button variant="outline" size="sm" disabled={isFetching} onClick={() => setLimit((l) => l + PAGE)}>
                  {isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Show older
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <Bell className="mb-3 h-10 w-10 text-muted-foreground/40" />
      <p className="max-w-md text-[15px] text-muted-foreground">{text}</p>
    </div>
  );
}
