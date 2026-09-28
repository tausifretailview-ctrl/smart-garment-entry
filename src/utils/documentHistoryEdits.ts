import { supabase } from "@/integrations/supabase/client";

export type DocumentEditEvent = {
  id: string;
  timestamp: string;
  userEmail?: string | null;
  lines: string[];
};

const EDIT_ACTION_RE = /UPDATE|EDIT|MODIFY/i;
const NON_EDIT_ACTION_RE = /CREATE|DELETE|CANCEL|RESTORE|SOFT_DELETE/i;

function isEditAction(action: string): boolean {
  if (!action) return false;
  if (NON_EDIT_ACTION_RE.test(action) && !EDIT_ACTION_RE.test(action)) return false;
  return EDIT_ACTION_RE.test(action);
}

function fmtMoneyValue(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Audited sale/purchase fields shown in History, in display order. */
const DELTA_FIELDS: ReadonlyArray<{ key: string; label: string; money: boolean }> = [
  { key: "net_amount", label: "net amount", money: true },
  { key: "gross_amount", label: "gross amount", money: true },
  { key: "flat_discount_amount", label: "invoice discount", money: true },
  { key: "flat_discount_percent", label: "invoice discount %", money: false },
  { key: "discount_amount", label: "item discount", money: true },
  { key: "sale_return_adjust", label: "S/R adjust", money: true },
  { key: "advance_adjust", label: "advance adjust", money: true },
  { key: "points_redeemed_amount", label: "points redeemed", money: true },
  { key: "paid_amount", label: "paid amount", money: true },
  { key: "payment_status", label: "payment status", money: false },
  { key: "payment_method", label: "payment method", money: false },
];

export function summarizeValueDelta(
  oldValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined,
): string[] {
  const lines: string[] = [];
  for (const { key, label, money } of DELTA_FIELDS) {
    const oldV = oldValues?.[key];
    const newV = newValues?.[key];
    if (oldV === undefined && newV === undefined) continue;
    if (money) {
      // 100 vs 100.00 from numeric columns is not a change.
      if (Number(oldV ?? 0) === Number(newV ?? 0)) continue;
      const from = fmtMoneyValue(oldV ?? 0);
      const to = fmtMoneyValue(newV ?? 0);
      if (from && to) lines.push(`${label}: ${from} → ${to}`);
      else if (to) lines.push(`${label}: ${to}`);
    } else {
      if (String(oldV ?? "") === String(newV ?? "")) continue;
      lines.push(`${label}: ${oldV == null ? "—" : String(oldV)} → ${newV == null ? "—" : String(newV)}`);
    }
  }
  return lines.slice(0, 8);
}

/**
 * Load edit/update audit rows for a sale or purchase bill.
 * Falls back to a single updated_at event when audit rows are missing
 * but the document was clearly changed after create.
 */
export async function fetchDocumentEditEvents(opts: {
  organizationId: string;
  entityId: string;
  entityTypes: string[];
  createdAt: string;
  updatedAt?: string | null;
  /** Timestamps that often bump updated_at (payments, cancel) — suppress fallback if matched. */
  ignoreUpdatedNearTimestamps?: string[];
}): Promise<DocumentEditEvent[]> {
  const {
    organizationId,
    entityId,
    entityTypes,
    createdAt,
    updatedAt,
    ignoreUpdatedNearTimestamps = [],
  } = opts;

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, created_at, user_email, old_values, new_values")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("entity_type", entityTypes)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.warn("[documentHistoryEdits] audit_logs query failed", error.message);
  }

  const fromAudit: DocumentEditEvent[] = (data || [])
    .filter((row) => isEditAction(row.action || ""))
    .map((row) => {
      const lines = summarizeValueDelta(
        (row.old_values as Record<string, unknown> | null) || null,
        (row.new_values as Record<string, unknown> | null) || null,
      );
      if (row.user_email) lines.unshift(`By: ${row.user_email}`);
      if (lines.length === 0) lines.push("Document details were updated");
      return {
        id: `audit-edit-${row.id}`,
        timestamp: row.created_at || createdAt,
        userEmail: row.user_email,
        lines,
      };
    });

  if (fromAudit.length > 0) return fromAudit;

  if (!updatedAt) return [];
  const createdMs = new Date(createdAt).getTime();
  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(updatedMs)) return [];
  // Require a clear gap so create→trigger noise does not look like an edit.
  if (updatedMs - createdMs < 90_000) return [];

  for (const ts of ignoreUpdatedNearTimestamps) {
    if (!ts) continue;
    const t = new Date(ts).getTime();
    if (Number.isFinite(t) && Math.abs(updatedMs - t) < 15_000) return [];
  }

  return [
    {
      id: `fallback-edit-${entityId}`,
      timestamp: updatedAt,
      lines: ["Document details were updated"],
    },
  ];
}
