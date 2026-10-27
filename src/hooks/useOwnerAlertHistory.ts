import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ownerAlertsDb } from "@/lib/ownerPush";
import {
  isShownOwnerAlert,
  loadLocalReadIds,
  ownerAlertItem,
  saleIdsToDescribe,
  saveLocalReadIds,
  type OwnerAlertItem,
  type OwnerAlertSaleInfo,
  type OwnerPushLogRow,
} from "@/lib/ownerAlertHistory";

/** Alerts older than this never count as unread (first open would otherwise show weeks of bills). */
const UNREAD_WINDOW_MS = 7 * 24 * 60 * 60_000;
export const OWNER_ALERT_BADGE_LIMIT = 50;

/* Read marks on this device, shared by the bell badges and the page. */
const localRead = new Map<string, Set<string>>();
const listeners = new Set<() => void>();
let version = 0;

function localReadSet(orgId: string, userId: string): Set<string> {
  const key = `${orgId}:${userId}`;
  let set = localRead.get(key);
  if (!set) {
    set = loadLocalReadIds(orgId, userId);
    localRead.set(key, set);
  }
  return set;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Admins, and anyone whose phone is set to get owner alerts, can see the history. */
export function useCanSeeOwnerAlerts(): boolean {
  const { currentOrganization, organizationRole } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id;
  const isAdmin = organizationRole === "admin";
  const { data: hasDevice } = useQuery({
    queryKey: ["owner-alert-device", orgId, user?.id],
    enabled: !!orgId && !!user?.id && !isAdmin,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await ownerAlertsDb
        .from("owner_push_devices")
        .select("id")
        .eq("organization_id", orgId)
        .eq("user_id", user!.id)
        .eq("status", "active")
        .limit(1);
      return !error && (data ?? []).length > 0;
    },
  });
  return !!orgId && (isAdmin || hasDevice === true);
}

interface HistoryData {
  items: OwnerAlertItem[];
  /** Plain array: the query cache is persisted as JSON, where a Set comes back as {}. */
  dbReadIds: string[];
  hasMore: boolean;
}

/** Optional sent-time window (UTC ISO bounds, inclusive). */
export interface OwnerAlertRange {
  from?: string;
  to?: string;
}

async function fetchHistory(orgId: string, userId: string, limit: number, range?: OwnerAlertRange): Promise<HistoryData> {
  let q = ownerAlertsDb.from("owner_push_log").select("*").eq("organization_id", orgId);
  if (range?.from) q = q.gte("created_at", range.from);
  if (range?.to) q = q.lte("created_at", range.to);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  const rows = ((data ?? []) as OwnerPushLogRow[]).filter(isShownOwnerAlert);

  const saleIds = saleIdsToDescribe(rows);
  const sales = new Map<string, OwnerAlertSaleInfo>();
  if (saleIds.length) {
    const { data: s } = await ownerAlertsDb
      .from("sales")
      .select("id, sale_number, net_amount, customer_name")
      .eq("organization_id", orgId)
      .in("id", saleIds);
    for (const r of (s ?? []) as Array<OwnerAlertSaleInfo & { id: string }>) sales.set(r.id, r);
  }

  // owner_alert_reads exists only after the history SQL; until then marks stay on this device.
  const dbReadIds: string[] = [];
  if (rows.length) {
    const { data: reads, error: readErr } = await ownerAlertsDb
      .from("owner_alert_reads")
      .select("log_id")
      .eq("user_id", userId)
      .in("log_id", rows.map((r) => r.id));
    if (!readErr) for (const r of (reads ?? []) as Array<{ log_id: string }>) dbReadIds.push(r.log_id);
  }

  return {
    items: rows.map((r) => ownerAlertItem(r, r.kind === "invoice" ? sales.get(r.ref) : undefined)),
    dbReadIds,
    hasMore: (data ?? []).length >= limit,
  };
}

export function useOwnerAlertHistory(limit = OWNER_ALERT_BADGE_LIMIT, enabled = true, range?: OwnerAlertRange) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id;
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["owner-alert-history", orgId, userId, limit, range?.from ?? "", range?.to ?? ""],
    enabled: enabled && !!orgId && !!userId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    // The app default re-renders on data/error only; the page's Refresh spinner and "Show older" need isFetching.
    notifyOnChangeProps: ["data", "error", "isFetching"],
    // Keep the list on screen while "Show older" loads (same shop and login only).
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === orgId && prevQuery?.queryKey[2] === userId ? prev : undefined,
    queryFn: () => fetchHistory(orgId!, userId!, limit, range),
  });

  useSyncExternalStore(subscribe, () => version);
  const local = orgId && userId ? localReadSet(orgId, userId) : new Set<string>();
  const dbRead = new Set(Array.isArray(query.data?.dbReadIds) ? query.data.dbReadIds : []);

  const isUnread = (item: OwnerAlertItem) =>
    !local.has(item.id) && !dbRead.has(item.id) && Date.now() - Date.parse(item.createdAt) < UNREAD_WINDOW_MS;

  const markRead = useCallback(
    (ids: string[]) => {
      if (!orgId || !userId) return;
      const set = localReadSet(orgId, userId);
      const fresh = ids.filter((id) => !set.has(id));
      if (!fresh.length) return;
      for (const id of fresh) set.add(id);
      saveLocalReadIds(orgId, userId, set);
      version++;
      listeners.forEach((l) => l());
      void ownerAlertsDb
        .from("owner_alert_reads")
        .upsert(
          fresh.map((log_id) => ({ log_id, user_id: userId, organization_id: orgId })),
          { onConflict: "log_id,user_id", ignoreDuplicates: true },
        )
        .then(() => undefined);
    },
    [orgId, userId],
  );

  const items = Array.isArray(query.data?.items) ? query.data.items : [];
  const unreadCount = items.filter(isUnread).length;

  return { ...query, items, hasMore: query.data?.hasMore ?? false, isUnread, markRead, unreadCount };
}

/** Unread count for bell badges (0 when the user can't see owner alerts). */
export function useOwnerAlertUnreadCount(): { canSee: boolean; unread: number } {
  const canSee = useCanSeeOwnerAlerts();
  const { unreadCount } = useOwnerAlertHistory(OWNER_ALERT_BADGE_LIMIT, canSee);
  return { canSee, unread: canSee ? unreadCount : 0 };
}
