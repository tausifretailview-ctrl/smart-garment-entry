import { supabase } from "@/integrations/supabase/client";
import {
  fetchActualUnreadMessageCount,
} from "@/utils/whatsappInboxUnread";
import {
  fetchInvoiceDashboardStats,
  type InvoiceDashboardFilters,
} from "@/utils/invoiceDashboardData";

export const ACTIVITY_CENTER_PAYMENTS_KEY = "activity-center-payments";
export const ACTIVITY_CENTER_SYSTEM_KEY = "activity-center-system";
export const ACTIVITY_CENTER_WHATSAPP_PREVIEW_KEY = "activity-center-whatsapp-preview";

export const DEFAULT_ACTIVITY_LOW_STOCK_THRESHOLD = 5;

export interface ActivityPaymentSummary {
  invoiceCount: number;
  pendingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  updatedAt: string;
}

export interface ActivitySystemEvent {
  id: string;
  kind: "backup" | "error";
  title: string;
  subtitle: string;
  timestamp: string;
}

export interface ActivityWhatsAppPreview {
  unreadCount: number;
  previewNames: string[];
  updatedAt: string;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function activityPaymentFilters(organizationId: string): InvoiceDashboardFilters {
  return {
    organizationId,
    debouncedSearch: "",
    deliveryFilter: "all",
    paymentStatusFilter: ["pending", "partial"],
    shopFilter: "all",
    userFilter: "all",
    saleDateFilter: { start: null, end: null },
    voucherDateFrom: null,
    voucherDateTo: null,
    customerId: null,
  };
}

/** Cap overdue scan — subtitle only; avoids full-table read on large orgs. */
async function fetchActivityOverdueSlice(
  organizationId: string,
): Promise<Pick<ActivityPaymentSummary, "overdueCount" | "overdueAmount" | "updatedAt">> {
  const { data, error } = await supabase
    .from("sales")
    .select("due_date, sale_date, net_amount, paid_amount, sale_return_adjust, credit_applied")
    .eq("organization_id", organizationId)
    .eq("sale_type", "invoice")
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .in("payment_status", ["pending", "partial"])
    .order("sale_date", { ascending: false })
    .limit(120);

  if (error) {
    return { overdueCount: 0, overdueAmount: 0, updatedAt: new Date().toISOString() };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let overdueCount = 0;
  let overdueAmount = 0;
  let latestAt = "";

  for (const row of data ?? []) {
    const outstanding = roundMoney(
      Math.max(
        0,
        Number(row.net_amount || 0) -
          Number(row.paid_amount || 0) -
          Number(row.sale_return_adjust || 0) -
          Number(row.credit_applied || 0),
      ),
    );
    if (outstanding <= 0.5) continue;

    const dueRaw = row.due_date || row.sale_date;
    if (!dueRaw) continue;
    const due = new Date(dueRaw.length >= 10 ? dueRaw.slice(0, 10) : dueRaw);
    due.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    if (daysOverdue > 30) {
      overdueCount += 1;
      overdueAmount += outstanding;
    }
    if (!latestAt || dueRaw > latestAt) latestAt = dueRaw;
  }

  return {
    overdueCount,
    overdueAmount: roundMoney(overdueAmount),
    updatedAt: latestAt || new Date().toISOString(),
  };
}

async function fetchActivityPaymentSummaryLegacy(
  organizationId: string,
): Promise<ActivityPaymentSummary> {
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, net_amount, paid_amount, sale_return_adjust, credit_applied, payment_status, due_date, sale_date",
    )
    .eq("organization_id", organizationId)
    .eq("sale_type", "invoice")
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .in("payment_status", ["pending", "partial"])
    .order("sale_date", { ascending: false })
    .limit(400);

  if (error) throw error;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let pendingAmount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let invoiceCount = 0;
  let latestAt = "";

  for (const row of data ?? []) {
    const outstanding = roundMoney(
      Math.max(
        0,
        Number(row.net_amount || 0) -
          Number(row.paid_amount || 0) -
          Number(row.sale_return_adjust || 0) -
          Number(row.credit_applied || 0),
      ),
    );
    if (outstanding <= 0.5) continue;

    invoiceCount += 1;
    pendingAmount += outstanding;

    const dueRaw = row.due_date || row.sale_date;
    if (dueRaw) {
      const due = new Date(dueRaw.length >= 10 ? dueRaw.slice(0, 10) : dueRaw);
      due.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
      if (daysOverdue > 30) {
        overdueCount += 1;
        overdueAmount += outstanding;
      }
      if (!latestAt || dueRaw > latestAt) latestAt = dueRaw;
    }
  }

  return {
    invoiceCount,
    pendingAmount: roundMoney(pendingAmount),
    overdueCount,
    overdueAmount: roundMoney(overdueAmount),
    updatedAt: latestAt || new Date().toISOString(),
  };
}

/** Pending / partial invoice totals — RPC first, capped legacy fallback. */
export async function fetchActivityPaymentSummary(
  organizationId: string,
): Promise<ActivityPaymentSummary> {
  try {
    const [stats, overdue] = await Promise.all([
      fetchInvoiceDashboardStats(supabase, activityPaymentFilters(organizationId)),
      fetchActivityOverdueSlice(organizationId),
    ]);
    return {
      invoiceCount: stats.totalInvoices,
      pendingAmount: roundMoney(stats.pendingAmount),
      overdueCount: overdue.overdueCount,
      overdueAmount: overdue.overdueAmount,
      updatedAt: overdue.updatedAt,
    };
  } catch (error) {
    console.warn("fetchActivityPaymentSummary RPC path failed, using legacy scan:", error);
    return fetchActivityPaymentSummaryLegacy(organizationId);
  }
}

/** Recent backup completions + org-scoped error logs (light query). */
export async function fetchActivitySystemEvents(
  organizationId: string,
): Promise<ActivitySystemEvent[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [backupRes, errorRes] = await Promise.all([
    supabase
      .from("backup_logs")
      .select("id, status, completed_at, created_at, file_size, backup_type")
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(2),
    supabase
      .from("app_error_logs")
      .select("id, operation, error_message, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const events: ActivitySystemEvent[] = [];

  for (const b of backupRes.data ?? []) {
    const ts = b.completed_at || b.created_at;
    const sizeMb =
      b.file_size && Number(b.file_size) > 0
        ? `${Math.round(Number(b.file_size) / 1024 / 1024)} MB`
        : "";
    events.push({
      id: `backup-${b.id}`,
      kind: "backup",
      title: "Daily backup completed",
      subtitle: [b.backup_type === "automatic" ? "Automatic" : "Manual", sizeMb]
        .filter(Boolean)
        .join(" · "),
      timestamp: ts,
    });
  }

  const errorRows = errorRes.data ?? [];
  if (errorRows.length > 0) {
    const latest = errorRows[0];
    events.push({
      id: `errors-${latest.id}`,
      kind: "error",
      title:
        errorRows.length === 1
          ? "System warning logged"
          : `${errorRows.length} system warnings`,
      subtitle: latest.error_message?.slice(0, 120) || latest.operation || "Error logged",
      timestamp: latest.created_at,
    });
  }

  return events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/** Unread count + top customer names for activity subtitle (lightweight — inbox recalculates on open). */
export async function fetchActivityWhatsAppPreview(
  organizationId: string,
): Promise<ActivityWhatsAppPreview> {
  const unreadCount = await fetchActualUnreadMessageCount(organizationId);
  if (unreadCount <= 0) {
    return { unreadCount: 0, previewNames: [], updatedAt: new Date().toISOString() };
  }

  const { data: conversations, error } = await supabase
    .from("whatsapp_conversations")
    .select("customer_name, customer_phone, last_message_at, unread_count")
    .eq("organization_id", organizationId)
    .gt("unread_count", 0)
    .order("last_message_at", { ascending: false })
    .limit(5);

  if (error) {
    console.warn("fetchActivityWhatsAppPreview conversations:", error.message);
    return { unreadCount, previewNames: [], updatedAt: new Date().toISOString() };
  }

  const previewNames = (conversations ?? [])
    .map((c) => c.customer_name?.trim() || c.customer_phone || "Customer")
    .slice(0, 3);

  return {
    unreadCount,
    previewNames,
    updatedAt: conversations?.[0]?.last_message_at ?? new Date().toISOString(),
  };
}
