/**
 * Calendar - Planner (Nov 2026, SQL 80 `20270617120000_planner_entries.sql`): work entries on
 * dates — tasks, payment collections, cheque deposits, supplier payments and other notes — with
 * the employees they are for. A pending entry on or before today shows red until it is done.
 * Phase 1 is a reminder only: nothing here posts to the accounts.
 */
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/data/fetchInIdBatches";

export type PlannerType = "task" | "collection" | "cheque" | "supplier_payment" | "other";
export type PlannerStatus = "pending" | "done" | "cancelled";
export type ChequeStatus = "received" | "deposited" | "cleared" | "bounced";
export type PlannerPriority = "normal" | "high";

export const PLANNER_TYPES: ReadonlyArray<{ id: PlannerType; label: string; short: string; chip: string; dot: string }> = [
  { id: "task", label: "Task", short: "Task", chip: "bg-blue-50 text-blue-800 border-blue-200", dot: "bg-blue-500" },
  { id: "collection", label: "Payment collection", short: "Collection", chip: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  { id: "cheque", label: "Cheque deposit", short: "Cheque", chip: "bg-violet-50 text-violet-800 border-violet-200", dot: "bg-violet-500" },
  { id: "supplier_payment", label: "Supplier payment", short: "Supplier pay", chip: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  { id: "other", label: "Other", short: "Other", chip: "bg-slate-50 text-slate-700 border-slate-200", dot: "bg-slate-400" },
];

export const CHEQUE_STATUSES: ReadonlyArray<{ id: ChequeStatus; label: string }> = [
  { id: "received", label: "Received" },
  { id: "deposited", label: "Deposited" },
  { id: "cleared", label: "Cleared" },
  { id: "bounced", label: "Bounced" },
];

export const plannerTypeInfo = (t: PlannerType) => PLANNER_TYPES.find((x) => x.id === t) ?? PLANNER_TYPES[4];

export type PlannerEntry = {
  id: string;
  organization_id: string;
  entry_date: string;
  entry_time: string | null;
  entry_type: PlannerType;
  title: string;
  notes: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  party_name: string | null;
  amount: number | null;
  cheque_number: string | null;
  bank_name: string | null;
  cheque_status: ChequeStatus | null;
  priority: PlannerPriority;
  status: PlannerStatus;
  assigned_employee_ids: string[];
  done_at: string | null;
  created_at: string;
};

/** What the entry form saves. */
export type PlannerEntryInput = {
  entry_date: string;
  entry_time: string | null;
  entry_type: PlannerType;
  title: string;
  notes: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  party_name: string | null;
  amount: number | null;
  cheque_number: string | null;
  bank_name: string | null;
  cheque_status: ChequeStatus | null;
  priority: PlannerPriority;
  status: PlannerStatus;
  assigned_employee_ids: string[];
};

/** Today as yyyy-MM-dd in the device's time zone (the shop's day). */
export const todayIso = (now: Date = new Date()) => format(now, "yyyy-MM-dd");

/** Pending and its day has come (today) or passed: shown red until done. */
export const isRedEntry = (e: Pick<PlannerEntry, "status" | "entry_date">, today: string) =>
  e.status === "pending" && e.entry_date <= today;

export const isOverdueEntry = (e: Pick<PlannerEntry, "status" | "entry_date">, today: string) =>
  e.status === "pending" && e.entry_date < today;

/** A cheque's own status decides done / pending: cleared is done; bounced stays pending (follow up). */
export function statusForCheque(cs: ChequeStatus | null, current: PlannerStatus): PlannerStatus {
  if (current === "cancelled") return current;
  if (cs === "cleared") return "done";
  return "pending";
}

/** A short label for the entry's state, e.g. "Overdue", "Due today", "Done", "Bounced". */
export function entryStateLabel(e: Pick<PlannerEntry, "status" | "entry_date" | "entry_type" | "cheque_status">, today: string): string {
  if (e.status === "done") return e.entry_type === "cheque" && e.cheque_status === "cleared" ? "Cleared" : "Done";
  if (e.status === "cancelled") return "Cancelled";
  if (e.entry_type === "cheque" && e.cheque_status === "bounced") return "Bounced";
  if (e.entry_date < today) return "Overdue";
  if (e.entry_date === today) return "Due today";
  if (e.entry_type === "cheque" && e.cheque_status === "deposited") return "Deposited";
  return "Pending";
}

export type GridDay = { iso: string; day: number; inMonth: boolean };

/** Weeks Monday → Sunday covering the month (like a printed calendar). */
export function monthGrid(year: number, month0: number): GridDay[][] {
  const first = startOfMonth(new Date(year, month0, 1));
  const last = endOfMonth(first);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  let d = addDays(first, -lead);
  const weeks: GridDay[][] = [];
  while (weeks.length === 0 || d <= last) {
    const week: GridDay[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({ iso: format(d, "yyyy-MM-dd"), day: d.getDate(), inMonth: d.getMonth() === month0 });
      d = addDays(d, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Entries of each date: red (pending, due) first, then pending, then by time; done last. */
export function groupByDate(entries: readonly PlannerEntry[], today: string): Map<string, PlannerEntry[]> {
  const rank = (e: PlannerEntry) => (e.status === "pending" ? (e.entry_date <= today ? 0 : 1) : e.status === "done" ? 2 : 3);
  const out = new Map<string, PlannerEntry[]>();
  for (const e of entries) {
    const list = out.get(e.entry_date) ?? [];
    list.push(e);
    out.set(e.entry_date, list);
  }
  for (const list of out.values()) {
    list.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1) ||
        String(a.entry_time ?? "99").localeCompare(String(b.entry_time ?? "99")) ||
        a.created_at.localeCompare(b.created_at),
    );
  }
  return out;
}

export type PlannerFilter = {
  type?: PlannerType | "all";
  /** Only entries tagged with this employee. */
  employeeId?: string | null;
  status?: "all" | "pending" | "done";
};

export function filterEntries(entries: readonly PlannerEntry[], f: PlannerFilter): PlannerEntry[] {
  return entries.filter(
    (e) =>
      (!f.type || f.type === "all" || e.entry_type === f.type) &&
      (!f.employeeId || e.assigned_employee_ids.includes(f.employeeId)) &&
      (!f.status || f.status === "all" || (f.status === "pending" ? e.status === "pending" : e.status === "done")),
  );
}

export type PlannerSummary = { dueToday: number; overdue: number; collectionAmount: number; chequesToDeposit: number };

/** Top cards: today's and overdue pending entries, collections still to get, cheques not yet deposited. */
export function summarize(entries: readonly PlannerEntry[], today: string): PlannerSummary {
  const s: PlannerSummary = { dueToday: 0, overdue: 0, collectionAmount: 0, chequesToDeposit: 0 };
  for (const e of entries) {
    if (e.status !== "pending") continue;
    if (e.entry_date === today) s.dueToday += 1;
    if (e.entry_date < today) s.overdue += 1;
    if (e.entry_type === "collection") s.collectionAmount += Number(e.amount) || 0;
    if (e.entry_type === "cheque" && (e.cheque_status ?? "received") === "received") s.chequesToDeposit += 1;
  }
  return s;
}

/** Form checks; returns the problem, or null when the entry can be saved. */
export function validateEntry(input: PlannerEntryInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entry_date)) return "Pick a date";
  if (!input.title.trim()) return "Write what is to be done";
  if (input.amount != null && (!Number.isFinite(input.amount) || input.amount < 0)) return "Amount must be 0 or more";
  return null;
}

/** A title from the type and party when none is typed: "Collect payment – Ramesh Traders". */
export function defaultTitle(type: PlannerType, party: string | null): string {
  const p = party?.trim();
  const base =
    type === "collection" ? "Collect payment" :
    type === "cheque" ? "Deposit cheque" :
    type === "supplier_payment" ? "Pay supplier" :
    "";
  return base && p ? `${base} – ${p}` : base;
}

// ── Database ─────────────────────────────────────────────────────────────────────────────

type DbError = { code?: string; message?: string } | null;

export function isMissingPlannerTable(err: DbError): boolean {
  if (!err) return false;
  if (["42P01", "PGRST205"].includes(String(err.code))) return true;
  return /planner_entries/i.test(String(err.message || "")) && /does not exist|schema cache|not find/i.test(String(err.message || ""));
}

const MISSING_SQL = "Run SQL 80 (Calendar - Planner) in the database first.";

const COLUMNS =
  "id, organization_id, entry_date, entry_time, entry_type, title, notes, customer_id, supplier_id, party_name, amount, cheque_number, bank_name, cheque_status, priority, status, assigned_employee_ids, done_at, created_at";

const table = () => supabase.from("planner_entries" as never);

function toEntry(r: Record<string, unknown>): PlannerEntry {
  return {
    id: String(r.id),
    organization_id: String(r.organization_id),
    entry_date: String(r.entry_date ?? "").slice(0, 10),
    entry_time: r.entry_time ? String(r.entry_time).slice(0, 5) : null,
    entry_type: (r.entry_type as PlannerType) ?? "task",
    title: String(r.title ?? ""),
    notes: (r.notes as string | null) ?? null,
    customer_id: (r.customer_id as string | null) ?? null,
    supplier_id: (r.supplier_id as string | null) ?? null,
    party_name: (r.party_name as string | null) ?? null,
    amount: r.amount == null ? null : Number(r.amount),
    cheque_number: (r.cheque_number as string | null) ?? null,
    bank_name: (r.bank_name as string | null) ?? null,
    cheque_status: (r.cheque_status as ChequeStatus | null) ?? null,
    priority: r.priority === "high" ? "high" : "normal",
    status: (r.status as PlannerStatus) ?? "pending",
    assigned_employee_ids: Array.isArray(r.assigned_employee_ids) ? (r.assigned_employee_ids as unknown[]).map(String) : [],
    done_at: (r.done_at as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
  };
}

/** Entries from `from` to `to` (yyyy-MM-dd, both included). null before SQL 80 is run. */
export async function fetchPlannerRange(orgId: string, from: string, to: string): Promise<PlannerEntry[] | null> {
  try {
    const rows = await fetchAllRows<Record<string, unknown>>(
      () =>
        table()
          .select(COLUMNS)
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .gte("entry_date", from)
          .lte("entry_date", to)
          .order("entry_date")
          .order("id") as never,
    );
    return rows.map(toEntry);
  } catch (e) {
    if (isMissingPlannerTable(e as DbError)) return null;
    throw new Error((e as { message?: string })?.message || "Could not load the planner");
  }
}

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

function toRow(input: PlannerEntryInput) {
  const isCheque = input.entry_type === "cheque";
  const chequeStatus = isCheque ? input.cheque_status ?? "received" : null;
  return {
    entry_date: input.entry_date,
    entry_time: input.entry_time || null,
    entry_type: input.entry_type,
    title: input.title.trim(),
    notes: clean(input.notes),
    customer_id: input.customer_id,
    supplier_id: input.supplier_id,
    party_name: clean(input.party_name),
    amount: input.amount,
    cheque_number: isCheque ? clean(input.cheque_number) : null,
    bank_name: isCheque ? clean(input.bank_name) : null,
    cheque_status: chequeStatus,
    priority: input.priority,
    status: isCheque ? statusForCheque(chequeStatus, input.status) : input.status,
    assigned_employee_ids: [...new Set(input.assigned_employee_ids)],
  };
}

/** Add an entry (no id) or save changes to one. */
export async function savePlannerEntry(orgId: string, input: PlannerEntryInput, id?: string): Promise<PlannerEntry> {
  const problem = validateEntry(input);
  if (problem) throw new Error(problem);
  const row = toRow(input);
  const { data, error } = id
    ? await table().update(row as never).eq("id", id).eq("organization_id", orgId).select(COLUMNS).single()
    : await table().insert({ ...row, organization_id: orgId } as never).select(COLUMNS).single();
  if (error) {
    if (isMissingPlannerTable(error)) throw new Error(MISSING_SQL);
    throw new Error(error.message || "Entry not saved");
  }
  return toEntry(data as Record<string, unknown>);
}

/** Mark done / pending / cancelled, or move a cheque on (deposited, cleared, bounced). */
export async function updatePlannerStatus(
  orgId: string,
  entry: Pick<PlannerEntry, "id" | "entry_type" | "status">,
  patch: { status?: PlannerStatus; cheque_status?: ChequeStatus },
): Promise<void> {
  const next: Record<string, unknown> = {};
  if (patch.cheque_status && entry.entry_type === "cheque") {
    next.cheque_status = patch.cheque_status;
    next.status = statusForCheque(patch.cheque_status, patch.status ?? entry.status);
  } else if (patch.status) {
    next.status = patch.status;
    // A cheque marked done by hand is a cleared cheque.
    if (entry.entry_type === "cheque" && patch.status === "done") next.cheque_status = "cleared";
  }
  const { error } = await table().update(next as never).eq("id", entry.id).eq("organization_id", orgId);
  if (error) throw new Error(isMissingPlannerTable(error) ? MISSING_SQL : error.message || "Not saved");
}

/** Remove an entry (kept in the database as deleted). */
export async function removePlannerEntry(orgId: string, id: string): Promise<void> {
  const { error } = await table()
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message || "Entry not removed");
}

/** Pending entries due today or earlier (menu badge); only `employeeId`'s when given. 0 before SQL 80. */
export async function countPlannerDue(orgId: string, today: string, employeeId: string | null): Promise<number> {
  let q = table()
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .lte("entry_date", today);
  if (employeeId) q = q.contains("assigned_employee_ids", [employeeId]);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

/** The logged-in user's own Employee Master rows (for "Mine"). */
export async function fetchMyEmployeeIds(orgId: string, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) return [];
  return (data ?? []).map((r) => String(r.id));
}

export type PlannerEmployee = { id: string; employee_name: string; designation: string | null };

export async function fetchPlannerEmployees(orgId: string): Promise<PlannerEmployee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_name, designation, status")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("employee_name");
  if (error) throw new Error(error.message || "Could not load employees");
  return (data ?? [])
    .filter((e) => (e.status ?? "active") !== "inactive")
    .map((e) => ({ id: String(e.id), employee_name: String(e.employee_name), designation: e.designation ?? null }));
}

export type PartyHit = { id: string; name: string; phone: string | null };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Customers (or suppliers) whose name or phone matches what is typed. */
export async function searchParties(orgId: string, kind: "customer" | "supplier", q: string): Promise<PartyHit[]> {
  // Commas and brackets would break the "or" filter text.
  const text = q.replace(/[,()]/g, " ").trim();
  if (text.length < 2) return [];
  const like = `%${escapeLike(text)}%`;
  if (kind === "customer") {
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .or(`customer_name.ilike.${like},phone.ilike.${like}`)
      .order("customer_name")
      .limit(8);
    if (error) return [];
    return (data ?? []).map((r) => ({ id: String(r.id), name: String(r.customer_name), phone: r.phone ?? null }));
  }
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_name, phone")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or(`supplier_name.ilike.${like},phone.ilike.${like}`)
    .order("supplier_name")
    .limit(8);
  if (error) return [];
  return (data ?? []).map((r) => ({ id: String(r.id), name: String(r.supplier_name), phone: r.phone ?? null }));
}
