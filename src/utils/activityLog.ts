/**
 * Operator activity log (Audit Log page): categories, labels and before/after
 * diffs for audit_logs rows written by the DB audit triggers.
 */

export type ActivityLogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

export type ActivityCategoryId =
  | "all"
  | "invoice_edits"
  | "invoice_deletes"
  | "discounts"
  | "payments"
  | "credit_notes"
  | "purchases"
  | "products"
  | "users";

export type ActivityCategory = {
  id: ActivityCategoryId;
  label: string;
  /** Server-side action filter; null = no filter. */
  actions: string[] | null;
};

export const ACTIVITY_CATEGORIES: ReadonlyArray<ActivityCategory> = [
  { id: "all", label: "All activity", actions: null },
  { id: "invoice_edits", label: "Invoice edits", actions: ["SALE_UPDATED"] },
  {
    id: "invoice_deletes",
    label: "Invoice deletes / cancels",
    actions: ["SALE_DELETED", "SALE_CANCELLED", "SALE_RESTORED"],
  },
  // SALE_UPDATED rows are narrowed to discount changes on the client.
  { id: "discounts", label: "Discounts", actions: ["DISCOUNT_GIVEN", "SALE_UPDATED"] },
  {
    id: "payments",
    label: "Payments & receipts",
    actions: [
      "PAYMENT_RECORDED",
      "PAYMENT_UPDATED",
      "PAYMENT_DELETED",
      "PAYMENT_RESTORED",
      "SALE_ADVANCE_ADJUST_UPDATED",
    ],
  },
  {
    id: "credit_notes",
    label: "Credit notes & returns",
    actions: [
      "CREDIT_NOTE_CREATED",
      "CREDIT_NOTE_UPDATED",
      "CREDIT_NOTE_DELETED",
      "CREDIT_NOTE_RESTORED",
      "SALE_RETURN_CREATED",
      "SALE_RETURN_UPDATED",
      "SALE_RETURN_DELETED",
      "SALE_RETURN_RESTORED",
    ],
  },
  {
    id: "purchases",
    label: "Purchases",
    actions: ["PURCHASE_CREATED", "PURCHASE_UPDATED", "PURCHASE_DELETED"],
  },
  { id: "products", label: "Products & prices", actions: ["PRICE_CHANGE", "CREATE", "UPDATE", "DELETE"] },
  {
    id: "users",
    label: "Logins & user roles",
    actions: ["LOGIN", "ROLE_ASSIGNED", "ROLE_UPDATED", "ROLE_REMOVED", "SECURITY_EVENT"],
  },
];

export function getActivityCategory(id: string): ActivityCategory {
  return ACTIVITY_CATEGORIES.find((c) => c.id === id) ?? ACTIVITY_CATEGORIES[0];
}

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  receipt: "Receipt",
  payment: "Payment",
  expense: "Expense",
  credit_note: "Credit note voucher",
  journal: "Journal",
};

export type ActivityTone = "create" | "edit" | "delete" | "neutral";

const ACTION_LABELS: Record<string, { label: string; tone: ActivityTone }> = {
  SALE_CREATED: { label: "Invoice created", tone: "create" },
  SALE_UPDATED: { label: "Invoice edited", tone: "edit" },
  SALE_DELETED: { label: "Invoice deleted", tone: "delete" },
  SALE_CANCELLED: { label: "Invoice cancelled", tone: "delete" },
  SALE_RESTORED: { label: "Invoice restored", tone: "create" },
  DISCOUNT_GIVEN: { label: "Discount given", tone: "edit" },
  SALE_ADVANCE_ADJUST_UPDATED: { label: "Advance adjusted on invoice", tone: "edit" },
  CREDIT_NOTE_CREATED: { label: "Credit note created", tone: "create" },
  CREDIT_NOTE_UPDATED: { label: "Credit note updated", tone: "edit" },
  CREDIT_NOTE_DELETED: { label: "Credit note deleted", tone: "delete" },
  CREDIT_NOTE_RESTORED: { label: "Credit note restored", tone: "create" },
  SALE_RETURN_CREATED: { label: "Sale return created", tone: "create" },
  SALE_RETURN_UPDATED: { label: "Sale return updated", tone: "edit" },
  SALE_RETURN_DELETED: { label: "Sale return deleted", tone: "delete" },
  SALE_RETURN_RESTORED: { label: "Sale return restored", tone: "create" },
  PURCHASE_CREATED: { label: "Purchase bill created", tone: "create" },
  PURCHASE_UPDATED: { label: "Purchase bill edited", tone: "edit" },
  PURCHASE_DELETED: { label: "Purchase bill deleted", tone: "delete" },
  PRICE_CHANGE: { label: "Price changed", tone: "edit" },
  LOGIN: { label: "Logged in", tone: "neutral" },
  ROLE_ASSIGNED: { label: "Role assigned", tone: "create" },
  ROLE_UPDATED: { label: "Role changed", tone: "edit" },
  ROLE_REMOVED: { label: "Role removed", tone: "delete" },
};

const PAYMENT_VERBS: Record<string, { verb: string; tone: ActivityTone }> = {
  PAYMENT_RECORDED: { verb: "recorded", tone: "create" },
  PAYMENT_UPDATED: { verb: "edited", tone: "edit" },
  PAYMENT_DELETED: { verb: "deleted", tone: "delete" },
  PAYMENT_RESTORED: { verb: "restored", tone: "create" },
};

/** POS writes settlement fields right after insert; those are not operator edits. */
export const AUTO_UPDATE_WINDOW_SECONDS = 60;

export function isAutoUpdateAfterSave(row: Pick<ActivityLogRow, "action" | "metadata">): boolean {
  if (row.action !== "SALE_UPDATED") return false;
  const secs = Number(row.metadata?.seconds_since_created);
  return Number.isFinite(secs) && secs >= 0 && secs < AUTO_UPDATE_WINDOW_SECONDS;
}

export function describeActivity(row: Pick<ActivityLogRow, "action" | "entity_type" | "metadata" | "new_values" | "old_values">): {
  label: string;
  tone: ActivityTone;
} {
  const pay = PAYMENT_VERBS[row.action];
  if (pay) {
    const vt = String(
      row.metadata?.voucher_type ?? row.new_values?.voucher_type ?? row.old_values?.voucher_type ?? "",
    ).toLowerCase();
    const noun = VOUCHER_TYPE_LABELS[vt] ?? "Voucher";
    return { label: `${noun} ${pay.verb}`, tone: pay.tone };
  }
  if (row.action === "SALE_UPDATED" && isAutoUpdateAfterSave(row)) {
    return { label: "Invoice saved (payment update)", tone: "neutral" };
  }
  const known = ACTION_LABELS[row.action];
  if (known) return known;
  if (row.action === "CREATE" || row.action === "UPDATE" || row.action === "DELETE") {
    const entity = row.entity_type.replace(/_/g, " ");
    const verb = row.action === "CREATE" ? "created" : row.action === "UPDATE" ? "updated" : "deleted";
    return {
      label: `${entity.charAt(0).toUpperCase()}${entity.slice(1)} ${verb}`,
      tone: row.action === "CREATE" ? "create" : row.action === "UPDATE" ? "edit" : "delete",
    };
  }
  return { label: row.action.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), tone: "neutral" };
}

function pick(row: Pick<ActivityLogRow, "old_values" | "new_values">, keys: string[]): string | null {
  for (const values of [row.new_values, row.old_values]) {
    if (!values) continue;
    for (const k of keys) {
      const v = values[k];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
  }
  return null;
}

/** Bill / voucher / CN number shown in the report. */
export function activityDocumentNumber(row: Pick<ActivityLogRow, "old_values" | "new_values">): string | null {
  return pick(row, [
    "sale_number",
    "voucher_number",
    "credit_note_number",
    "return_number",
    "software_bill_no",
    "supplier_invoice_no",
  ]);
}

export function activityParty(row: Pick<ActivityLogRow, "old_values" | "new_values">): string | null {
  return pick(row, ["customer_name", "supplier_name", "product_name", "description"]);
}

export function activityAmount(row: Pick<ActivityLogRow, "old_values" | "new_values">): number | null {
  const raw = pick(row, ["net_amount", "total_amount", "credit_amount", "advance_adjust"]);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const FIELD_LABELS: Record<string, string> = {
  sale_number: "Invoice no.",
  sale_type: "Invoice type",
  sale_date: "Invoice date",
  customer_name: "Customer",
  gross_amount: "Gross amount",
  net_amount: "Net amount",
  payment_status: "Payment status",
  discount_amount: "Item discount",
  flat_discount_amount: "Invoice discount",
  flat_discount_percent: "Invoice discount %",
  points_redeemed_amount: "Points redeemed",
  sale_return_adjust: "S/R adjust",
  advance_adjust: "Advance adjust",
  paid_amount: "Paid amount",
  cash_amount: "Cash",
  upi_amount: "UPI",
  card_amount: "Card",
  payment_method: "Payment method",
  is_cancelled: "Cancelled",
  deleted_at: "Deleted at",
  voucher_number: "Voucher no.",
  voucher_type: "Voucher type",
  voucher_date: "Voucher date",
  total_amount: "Amount",
  reference_type: "Against",
  reference_id: "Reference",
  description: "Description",
  credit_note_number: "Credit note no.",
  credit_amount: "Credit amount",
  used_amount: "Used amount",
  status: "Status",
  expiry_date: "Expiry date",
  sale_id: "Invoice",
  return_number: "Return no.",
  return_date: "Return date",
  refund_type: "Refund type",
  credit_status: "Credit status",
  original_sale_number: "Original invoice",
};

const MONEY_FIELDS = new Set([
  "gross_amount",
  "net_amount",
  "discount_amount",
  "flat_discount_amount",
  "points_redeemed_amount",
  "sale_return_adjust",
  "advance_adjust",
  "paid_amount",
  "cash_amount",
  "upi_amount",
  "card_amount",
  "total_amount",
  "credit_amount",
  "used_amount",
  "other_charges",
  "round_off",
  "gst_amount",
]);

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatActivityValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (MONEY_FIELDS.has(key)) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sameValue(key: string, a: unknown, b: unknown): boolean {
  if (MONEY_FIELDS.has(key) || key.endsWith("_percent")) {
    const na = Number(a ?? 0);
    const nb = Number(b ?? 0);
    if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 0.005;
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export type ActivityDiffRow = {
  key: string;
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

/** Field-by-field before/after, changed fields first. */
export function diffActivityValues(
  oldValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined,
): ActivityDiffRow[] {
  const keys: string[] = [];
  for (const k of [...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})]) {
    if (!keys.includes(k)) keys.push(k);
  }
  const rows = keys.map((key) => {
    const a = oldValues?.[key];
    const b = newValues?.[key];
    return {
      key,
      label: fieldLabel(key),
      before: oldValues ? formatActivityValue(key, a) : "—",
      after: newValues ? formatActivityValue(key, b) : "—",
      changed: !!oldValues && !!newValues && !sameValue(key, a, b),
    };
  });
  return [...rows.filter((r) => r.changed), ...rows.filter((r) => !r.changed)];
}

/** One-line "what changed" text for the report table. */
export function activityChangeSummary(row: ActivityLogRow, max = 3): string {
  if (!row.old_values || !row.new_values) return "";
  const changed = diffActivityValues(row.old_values, row.new_values).filter(
    (d) => d.changed && d.key !== "deleted_at",
  );
  const parts = changed.slice(0, max).map((d) => `${d.label}: ${d.before} → ${d.after}`);
  if (changed.length > max) parts.push(`+${changed.length - max} more`);
  return parts.join(" · ");
}

const DISCOUNT_KEYS = ["discount_amount", "flat_discount_amount", "flat_discount_percent"];

export function isDiscountChange(row: Pick<ActivityLogRow, "action" | "old_values" | "new_values">): boolean {
  if (row.action === "DISCOUNT_GIVEN") return true;
  if (row.action !== "SALE_UPDATED" || !row.old_values || !row.new_values) return false;
  return DISCOUNT_KEYS.some((k) => !sameValue(k, row.old_values?.[k], row.new_values?.[k]));
}

/** Client-side narrowing the server action filter cannot express. */
export function matchesActivityCategory(row: ActivityLogRow, categoryId: ActivityCategoryId): boolean {
  if (categoryId === "discounts") return isDiscountChange(row);
  return true;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function activityRowsToCsv(rows: ActivityLogRow[], formatTime: (iso: string) => string): string {
  const header = ["Date & time", "Operator", "Activity", "Document", "Party", "Amount", "Changes"];
  const lines = rows.map((r) => {
    const amount = activityAmount(r);
    return [
      formatTime(r.created_at),
      r.user_email || "System",
      describeActivity(r).label,
      activityDocumentNumber(r) ?? "",
      activityParty(r) ?? "",
      amount == null ? "" : amount.toFixed(2),
      activityChangeSummary(r, 20),
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...lines].join("\n");
}
