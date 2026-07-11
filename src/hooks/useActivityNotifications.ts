import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useLowStockAlerts } from "@/hooks/useBusinessInsights";
import { STALE_REFERENCE } from "@/lib/queryStaleTimes";
import {
  isCategoryUnread,
  type ActivityCategory,
  type ActivityReadState,
} from "@/lib/activityCenterReadState";
import {
  ACTIVITY_CENTER_PAYMENTS_KEY,
  ACTIVITY_CENTER_SYSTEM_KEY,
  ACTIVITY_CENTER_WHATSAPP_PREVIEW_KEY,
  DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD,
  fetchActivityPaymentSummary,
  fetchActivitySystemEvents,
  fetchActivityWhatsAppPreview,
} from "@/utils/activityCenterData";

export type ActivityTab = "all" | ActivityCategory;

export interface ActivityNotificationItem {
  id: string;
  type: ActivityCategory;
  title: string;
  subtitle: string;
  ctaLabel: string;
  path: string;
  navigateState?: Record<string, unknown>;
  timestamp: string;
  unread: boolean;
  badgeContribution: number;
}

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function productLabel(row: { product_name: string; brand?: string | null }): string {
  const brand = row.brand?.trim();
  return brand ? `${row.product_name} (${brand})` : row.product_name;
}

export function groupActivityNotifications(
  items: ActivityNotificationItem[],
): { label: string; items: ActivityNotificationItem[] }[] {
  const now = Date.now();
  const buckets: { label: string; items: ActivityNotificationItem[] }[] = [
    { label: "Just now", items: [] },
    { label: "Earlier today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Older", items: [] },
  ];

  for (const item of items) {
    const ms = new Date(item.timestamp).getTime();
    const diffH = (now - ms) / 3_600_000;
    if (diffH < 1) buckets[0].items.push(item);
    else if (diffH < 24) buckets[1].items.push(item);
    else if (diffH < 48) buckets[2].items.push(item);
    else buckets[3].items.push(item);
  }

  return buckets.filter((b) => b.items.length > 0);
}

export function useActivityNotifications(
  readState: ActivityReadState,
  enabled: boolean,
) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { hasMenuAccess, hasSpecialPermission, loading: permLoading } = useUserPermissions();

  const canStock = !permLoading && (hasMenuAccess("stock_report") || hasMenuAccess("product_dashboard"));
  const canPayments =
    !permLoading &&
    (hasMenuAccess("sales_invoice_dashboard") || hasMenuAccess("payments_dashboard"));
  const canWhatsApp =
    !permLoading &&
    (hasMenuAccess("whatsapp_inbox") ||
      hasSpecialPermission("whatsapp_api") ||
      hasSpecialPermission("whatsapp_send"));
  const canSystem =
    !permLoading &&
    (hasMenuAccess("settings_view") ||
      hasSpecialPermission("system_health") ||
      hasMenuAccess("settings"));

  const lowStock = useLowStockAlerts(
    orgId,
    DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD,
    enabled && !!orgId && canStock,
  );

  const payments = useQuery({
    queryKey: [ACTIVITY_CENTER_PAYMENTS_KEY, orgId],
    queryFn: () => fetchActivityPaymentSummary(orgId!),
    enabled: enabled && !!orgId && canPayments,
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
  });

  const whatsappPreview = useQuery({
    queryKey: [ACTIVITY_CENTER_WHATSAPP_PREVIEW_KEY, orgId],
    queryFn: () => fetchActivityWhatsAppPreview(orgId!),
    enabled: enabled && !!orgId && canWhatsApp,
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
  });

  const systemEvents = useQuery({
    queryKey: [ACTIVITY_CENTER_SYSTEM_KEY, orgId],
    queryFn: () => fetchActivitySystemEvents(orgId!),
    enabled: enabled && !!orgId && canSystem,
    staleTime: STALE_REFERENCE,
    refetchOnWindowFocus: false,
  });

  const notifications = useMemo((): ActivityNotificationItem[] => {
    const items: ActivityNotificationItem[] = [];
    const nowIso = new Date().toISOString();

    if (canStock && lowStock.data && lowStock.data.length > 0) {
      const count = lowStock.data.length;
      const names = lowStock.data.slice(0, 2).map(productLabel);
      const more = count - names.length;
      const subtitle =
        more > 0 ? `${names.join(", ")} +${more} more` : names.join(", ");
      const timestamp = lowStock.dataUpdatedAt
        ? new Date(lowStock.dataUpdatedAt).toISOString()
        : nowIso;
      items.push({
        id: "stock-low",
        type: "stock",
        title: `${count} product${count === 1 ? "" : "s"} below reorder level`,
        subtitle,
        ctaLabel: "View low stock →",
        path: "/stock-report",
        navigateState: { stockStatusFilter: "low" },
        timestamp,
        unread: isCategoryUnread("stock", timestamp, readState),
        badgeContribution: count,
      });
    }

    if (canPayments && payments.data && payments.data.pendingAmount > 0.5) {
      const p = payments.data;
      const overdueNote =
        p.overdueCount > 0
          ? `${p.overdueCount} overdue > 30 days`
          : `${p.invoiceCount} pending invoice${p.invoiceCount === 1 ? "" : "s"}`;
      items.push({
        id: "payments-pending",
        type: "payments",
        title: `${formatInr(p.pendingAmount)} pending across ${p.invoiceCount} invoice${p.invoiceCount === 1 ? "" : "s"}`,
        subtitle: overdueNote,
        ctaLabel: "Send reminders →",
        path: "/sales-invoice-dashboard",
        navigateState: { paymentStatusFilter: ["pending", "partial"] },
        timestamp: p.updatedAt,
        unread: isCategoryUnread("payments", p.updatedAt, readState),
        badgeContribution: p.overdueCount > 0 ? p.overdueCount : p.invoiceCount,
      });
    }

    if (canWhatsApp && (whatsappPreview.data?.unreadCount ?? 0) > 0) {
      const count = whatsappPreview.data?.unreadCount ?? 0;
      const preview = whatsappPreview.data;
      const names = preview?.previewNames ?? [];
      const subtitle =
        names.length > 0
          ? `${names.join(", ")}${count > names.length ? ` +${count - names.length}` : ""}`
          : "Customer replies waiting";
      items.push({
        id: "whatsapp-unread",
        type: "whatsapp",
        title: `${count} new WhatsApp message${count === 1 ? "" : "s"}`,
        subtitle,
        ctaLabel: "Open inbox →",
        path: "/whatsapp-inbox",
        navigateState: { openUnread: true },
        timestamp: preview?.updatedAt ?? nowIso,
        unread: isCategoryUnread("whatsapp", preview?.updatedAt ?? nowIso, readState),
        badgeContribution: count,
      });
    }

    if (canSystem && systemEvents.data) {
      for (const ev of systemEvents.data) {
        items.push({
          id: ev.id,
          type: "system",
          title: ev.title,
          subtitle: ev.subtitle,
          ctaLabel: ev.kind === "backup" ? "View backups →" : "View system health →",
          path: ev.kind === "backup" ? "/settings" : "/admin/health",
          navigateState: ev.kind === "backup" ? { scrollTo: "backup" } : undefined,
          timestamp: ev.timestamp,
          unread: isCategoryUnread("system", ev.timestamp, readState),
          badgeContribution: ev.kind === "error" ? 1 : 0,
        });
      }
    }

    return items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [
    canStock,
    canPayments,
    canWhatsApp,
    canSystem,
    lowStock.data,
    lowStock.dataUpdatedAt,
    payments.data,
    whatsappPreview.data,
    systemEvents.data,
    readState,
  ]);

  const badgeCount = useMemo(
    () =>
      notifications.reduce((sum, n) => (n.unread ? sum + n.badgeContribution : sum), 0),
    [notifications],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<ActivityTab, number> = {
      all: notifications.filter((n) => n.unread).length,
      stock: 0,
      payments: 0,
      whatsapp: 0,
      system: 0,
    };
    for (const n of notifications) {
      if (n.unread) counts[n.type] += 1;
    }
    return counts;
  }, [notifications]);

  const sourcesEnabled =
    (canStock ? 1 : 0) +
    (canPayments ? 1 : 0) +
    (canWhatsApp ? 1 : 0) +
    (canSystem ? 1 : 0);

  const sourcesReady =
    (!canStock || lowStock.isFetched) &&
    (!canPayments || payments.isFetched) &&
    (!canWhatsApp || whatsappPreview.isFetched) &&
    (!canSystem || systemEvents.isFetched);

  const isLoading =
    (permLoading && notifications.length === 0) ||
    (sourcesEnabled > 0 &&
      !sourcesReady &&
      notifications.length === 0 &&
      (lowStock.isFetching || payments.isFetching || whatsappPreview.isFetching || systemEvents.isFetching));

  return {
    notifications,
    badgeCount,
    tabCounts,
    isLoading,
    canStock,
    canPayments,
    canWhatsApp,
    canSystem,
  };
}
