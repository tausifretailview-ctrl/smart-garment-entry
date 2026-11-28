import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Flag,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CHEQUE_STATUSES,
  PLANNER_TYPES,
  defaultTitle,
  entryStateLabel,
  fetchMyEmployeeIds,
  fetchPlannerEmployees,
  fetchPlannerRange,
  filterEntries,
  groupByDate,
  isRedEntry,
  monthGrid,
  plannerTypeInfo,
  removePlannerEntry,
  savePlannerEntry,
  searchParties,
  summarize,
  todayIso,
  updatePlannerStatus,
  type ChequeStatus,
  type PartyHit,
  type PlannerEmployee,
  type PlannerEntry,
  type PlannerEntryInput,
  type PlannerType,
} from "@/lib/data/planner";

/**
 * Calendar - Planner (Nov 2026): the shop's work on a month calendar — tasks, payment
 * collections, cheque deposits, supplier payments and notes, each tagged with the staff who
 * will do it. Pending work shows red on its day (and after) until it is marked done.
 * Phase 1 is a reminder only: cheques and collections are not posted to the accounts here.
 */
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const longDate = (iso: string) => format(parseISO(iso), "EEEE, d MMMM yyyy");
const time12 = (t: string | null) => (t ? format(parseISO(`2000-01-01T${t}`), "h:mm a") : "");

const blankInput = (date: string): PlannerEntryInput => ({
  entry_date: date,
  entry_time: null,
  entry_type: "task",
  title: "",
  notes: null,
  customer_id: null,
  supplier_id: null,
  party_name: null,
  amount: null,
  cheque_number: null,
  bank_name: null,
  cheque_status: null,
  priority: "normal",
  status: "pending",
  assigned_employee_ids: [],
});

const toInput = (e: PlannerEntry): PlannerEntryInput => ({
  entry_date: e.entry_date,
  entry_time: e.entry_time,
  entry_type: e.entry_type,
  title: e.title,
  notes: e.notes,
  customer_id: e.customer_id,
  supplier_id: e.supplier_id,
  party_name: e.party_name,
  amount: e.amount,
  cheque_number: e.cheque_number,
  bank_name: e.bank_name,
  cheque_status: e.cheque_status,
  priority: e.priority,
  status: e.status,
  assigned_employee_ids: e.assigned_employee_ids,
});

export default function Planner() {
  const { currentOrganization, organizationRole } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const today = todayIso();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [typeFilter, setTypeFilter] = useState<PlannerType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "done">("all");
  const [who, setWho] = useState<string>("everyone");
  const [whoChosen, setWhoChosen] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; input: PlannerEntryInput } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const weeks = useMemo(() => monthGrid(month.y, month.m), [month]);
  const from = weeks[0][0].iso;
  const to = weeks[weeks.length - 1][6].iso;

  const { data: entries, isLoading } = useQuery({
    queryKey: ["planner-entries", orgId, from, to],
    enabled: !!orgId,
    queryFn: () => fetchPlannerRange(orgId, from, to),
    staleTime: 30 * 1000,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["planner-employees", orgId],
    enabled: !!orgId,
    queryFn: () => fetchPlannerEmployees(orgId),
    staleTime: 5 * 60 * 1000,
  });
  const { data: myIds = [] } = useQuery({
    queryKey: ["planner-my-employee-ids", orgId, user?.id],
    enabled: !!orgId && !!user?.id,
    queryFn: () => fetchMyEmployeeIds(orgId, user!.id),
    staleTime: 5 * 60 * 1000,
  });

  // Staff open on their own work; owners and managers on everyone's.
  const isBoss = organizationRole === "admin" || organizationRole === "manager";
  useEffect(() => {
    if (!whoChosen && !isBoss && myIds.length > 0) setWho("mine");
  }, [whoChosen, isBoss, myIds]);

  const employeeId = who === "everyone" ? null : who === "mine" ? myIds[0] ?? null : who;
  const missingSql = entries === null;
  const all = entries ?? [];
  const shown = useMemo(
    () => filterEntries(all, { type: typeFilter, status: statusFilter, employeeId }),
    [all, typeFilter, statusFilter, employeeId],
  );
  const byDate = useMemo(() => groupByDate(shown, today), [shown, today]);
  const summary = useMemo(() => summarize(filterEntries(all, { employeeId }), today), [all, employeeId, today]);
  const empName = useMemo(() => new Map(employees.map((e) => [e.id, e.employee_name])), [employees]);
  const dayList = byDate.get(selected) ?? [];

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ["planner-entries", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["planner-due-count", orgId] });
  };

  const run = async (id: string, work: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    try {
      await work();
      toast.success(done);
      reload();
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusyId(null);
    }
  };

  const goMonth = (delta: number) => {
    const d = addMonths(new Date(month.y, month.m, 1), delta);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => {
    const d = new Date();
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(today);
  };

  return (
    <div className="space-y-4 p-3 sm:p-5" data-testid="planner-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">Calendar - Planner</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">Tasks, payment collections, cheque deposits and staff work on dates</p>
          </div>
        </div>
        <Button onClick={() => setEditing({ input: blankInput(selected) })} disabled={missingSql} data-testid="planner-add">
          <Plus className="mr-1 h-4 w-4" /> Add entry
        </Button>
      </div>

      {missingSql ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Run SQL 80 (Calendar - Planner) in the database to start using the planner.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={ClipboardList} label="Due today" value={String(summary.dueToday)} tone={summary.dueToday > 0 ? "amber" : "slate"} testId="planner-due-today" />
        <SummaryCard icon={AlertTriangle} label="Overdue" value={String(summary.overdue)} tone={summary.overdue > 0 ? "red" : "slate"} testId="planner-overdue" />
        <SummaryCard icon={Banknote} label="Collections to get" value={money(summary.collectionAmount)} tone="emerald" testId="planner-collections" />
        <SummaryCard icon={Landmark} label="Cheques to deposit" value={String(summary.chequesToDeposit)} tone="violet" testId="planner-cheques" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => goMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[10rem] text-center text-lg font-extrabold uppercase tracking-wide" data-testid="planner-month">
            {format(new Date(month.y, month.m, 1), "MMMM yyyy")}
          </div>
          <Button variant="outline" size="icon" onClick={() => goMonth(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as PlannerType | "all")}>
            <SelectTrigger className="h-9 w-[170px]" aria-label="Entry type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entries</SelectItem>
              {PLANNER_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={who}
            onValueChange={(v) => {
              setWho(v);
              setWhoChosen(true);
            }}
          >
            <SelectTrigger className="h-9 w-[170px]" aria-label="Staff">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone</SelectItem>
              {myIds.length > 0 ? <SelectItem value="mine">Mine</SelectItem> : null}
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.employee_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border p-0.5">
            {(["all", "pending", "done"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-semibold capitalize",
                  statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm" data-testid="planner-grid">
          <div className="grid grid-cols-7 bg-slate-800 text-white">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wider sm:text-xs">
                <span className="hidden md:inline">{d}</span>
                <span className="md:hidden">{d.slice(0, 3)}</span>
              </div>
            ))}
          </div>
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            weeks.map((week) => (
              <div key={week[0].iso} className="grid grid-cols-7 border-t">
                {week.map((d) => {
                  const list = byDate.get(d.iso) ?? [];
                  const red = list.filter((e) => isRedEntry(e, today)).length;
                  const isSel = d.iso === selected;
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setSelected(d.iso)}
                      onDoubleClick={() => !missingSql && setEditing({ input: blankInput(d.iso) })}
                      data-testid={`planner-day-${d.iso}`}
                      aria-label={`${longDate(d.iso)}${list.length ? `, ${list.length} entries` : ""}${red ? `, ${red} pending` : ""}`}
                      aria-pressed={isSel}
                      className={cn(
                        "relative flex min-h-[64px] flex-col items-stretch gap-1 border-l p-1 text-left align-top transition-colors first:border-l-0 sm:min-h-[112px] sm:p-1.5",
                        !d.inMonth && "bg-slate-50/70 text-slate-400",
                        isSel ? "bg-primary/10 ring-2 ring-inset ring-primary" : "hover:bg-muted/50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold sm:h-7 sm:w-7 sm:text-sm",
                            d.iso === today ? "bg-primary text-primary-foreground" : d.inMonth ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-500",
                          )}
                        >
                          {d.day}
                        </span>
                        {red > 0 ? (
                          <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white" aria-hidden>
                            {red}
                          </span>
                        ) : null}
                      </div>
                      <div className="hidden flex-col gap-0.5 sm:flex">
                        {list.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className={cn(
                              "flex items-center gap-1 truncate rounded border px-1 py-0.5 text-[11px] font-medium leading-tight",
                              isRedEntry(e, today)
                                ? "border-red-300 bg-red-50 text-red-700"
                                : e.status === "done"
                                  ? "border-transparent text-slate-400 line-through"
                                  : plannerTypeInfo(e.entry_type).chip,
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isRedEntry(e, today) ? "bg-red-600" : plannerTypeInfo(e.entry_type).dot)} />
                            <span className="truncate">{e.title}</span>
                          </span>
                        ))}
                        {list.length > 3 ? <span className="text-[10px] font-semibold text-muted-foreground">+{list.length - 3} more</span> : null}
                      </div>
                      <div className="flex flex-wrap gap-0.5 sm:hidden">
                        {list.slice(0, 4).map((e) => (
                          <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", isRedEntry(e, today) ? "bg-red-600" : e.status === "done" ? "bg-slate-300" : plannerTypeInfo(e.entry_type).dot)} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4" data-testid="planner-day">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-base font-bold">{longDate(selected)}</div>
              <div className="text-xs text-muted-foreground">{dayList.length ? `${dayList.length} entr${dayList.length === 1 ? "y" : "ies"}` : "Nothing planned"}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing({ input: blankInput(selected) })} disabled={missingSql}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          {dayList.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              today={today}
              busy={busyId === e.id}
              empName={empName}
              onDone={() =>
                void run(e.id, () => updatePlannerStatus(orgId, e, { status: e.status === "done" ? "pending" : "done" }), e.status === "done" ? "Marked pending" : "Marked done")
              }
              onCheque={(cs) => void run(e.id, () => updatePlannerStatus(orgId, e, { cheque_status: cs }), `Cheque ${cs}`)}
              onEdit={() => setEditing({ id: e.id, input: toInput(e) })}
              onRemove={() => {
                if (!window.confirm(`Remove "${e.title}"?`)) return;
                void run(e.id, () => removePlannerEntry(orgId, e.id), "Entry removed");
              }}
            />
          ))}
          {dayList.length === 0 && !missingSql ? (
            <button
              type="button"
              onClick={() => setEditing({ input: blankInput(selected) })}
              className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed p-6 text-sm text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-5 w-5" />
              Add a task, collection or cheque for this day
            </button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <EntryDialog
          orgId={orgId}
          employees={employees}
          initial={editing.input}
          isEdit={!!editing.id}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            await savePlannerEntry(orgId, input, editing.id);
            toast.success(editing.id ? "Entry saved" : "Entry added");
            setEditing(null);
            setSelected(input.entry_date);
            const d = parseISO(input.entry_date);
            setMonth({ y: d.getFullYear(), m: d.getMonth() });
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
  testId,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
  tone: "red" | "amber" | "emerald" | "violet" | "slate";
  testId: string;
}) {
  const tones = {
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
    slate: "border-slate-200 bg-white text-slate-700",
  };
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border p-3", tones[tone])} data-testid={testId}>
      <Icon className="h-5 w-5 shrink-0 opacity-80" />
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
        <div className="truncate text-lg font-extrabold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function EntryCard({
  entry: e,
  today,
  busy,
  empName,
  onDone,
  onCheque,
  onEdit,
  onRemove,
}: {
  entry: PlannerEntry;
  today: string;
  busy: boolean;
  empName: Map<string, string>;
  onDone: () => void;
  onCheque: (cs: ChequeStatus) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const info = plannerTypeInfo(e.entry_type);
  const red = isRedEntry(e, today);
  const state = entryStateLabel(e, today);
  return (
    <div
      data-testid="planner-entry"
      className={cn(
        "space-y-2 rounded-xl border p-3",
        red ? "border-red-300 bg-red-50/60" : e.status === "done" ? "bg-muted/40" : "bg-white",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", info.chip)}>{info.short}</span>
        <span
          data-testid="planner-entry-state"
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
            red ? "bg-red-600 text-white" : e.status === "done" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600",
          )}
        >
          {state}
        </span>
        {e.priority === "high" ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase text-red-600">
            <Flag className="h-3 w-3" /> High
          </span>
        ) : null}
        {e.entry_time ? <span className="ml-auto text-xs font-semibold text-muted-foreground">{time12(e.entry_time)}</span> : null}
      </div>
      <div className={cn("font-semibold leading-snug", e.status === "done" && "text-muted-foreground line-through")}>{e.title}</div>
      {e.party_name || e.amount != null ? (
        <div className="text-sm text-slate-700">
          {[e.party_name, e.amount != null ? money(e.amount) : null].filter(Boolean).join(" · ")}
        </div>
      ) : null}
      {e.entry_type === "cheque" && (e.cheque_number || e.bank_name) ? (
        <div className="text-xs text-slate-600">
          {[e.cheque_number ? `Cheque ${e.cheque_number}` : null, e.bank_name].filter(Boolean).join(" · ")}
        </div>
      ) : null}
      {e.assigned_employee_ids.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          {e.assigned_employee_ids.map((id) => (
            <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {empName.get(id) ?? "Staff"}
            </span>
          ))}
        </div>
      ) : null}
      {e.notes ? <div className="whitespace-pre-wrap text-xs text-muted-foreground">{e.notes}</div> : null}
      <div className="flex flex-wrap gap-1.5 border-t pt-2">
        {e.entry_type === "cheque" && e.status !== "cancelled" ? (
          CHEQUE_STATUSES.filter((c) => c.id !== "received" && c.id !== e.cheque_status).map((c) => (
            <Button key={c.id} size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onCheque(c.id)} aria-label={`${c.label} ${e.title}`}>
              {c.label}
            </Button>
          ))
        ) : (
          <Button
            size="sm"
            variant={e.status === "done" ? "outline" : "default"}
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={onDone}
            aria-label={`${e.status === "done" ? "Undo done" : "Mark done"} ${e.title}`}
          >
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : e.status === "done" ? <RotateCcw className="mr-1 h-3.5 w-3.5" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            {e.status === "done" ? "Undo" : "Done"}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={onEdit} aria-label={`Edit ${e.title}`}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600 hover:text-red-700" onClick={onRemove} aria-label={`Remove ${e.title}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function PartyPicker({
  orgId,
  kind,
  name,
  onChange,
}: {
  orgId: string;
  kind: "customer" | "supplier";
  name: string;
  onChange: (p: { id: string | null; name: string }) => void;
}) {
  const [text, setText] = useState(name);
  const [hits, setHits] = useState<PartyHit[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(name), [name]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = window.setTimeout(() => {
      void searchParties(orgId, kind, text).then((r) => live && setHits(r));
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [orgId, kind, text, open]);
  return (
    <div className="relative">
      <Input
        value={text}
        placeholder={kind === "supplier" ? "Supplier name or phone" : "Customer name or phone"}
        aria-label={kind === "supplier" ? "Supplier" : "Customer"}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          onChange({ id: null, name: e.target.value });
        }}
      />
      {open && hits.length > 0 ? (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-lg" role="listbox">
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              role="option"
              aria-selected={false}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText(h.name);
                setOpen(false);
                onChange({ id: h.id, name: h.name });
              }}
            >
              <span className="truncate font-medium">{h.name}</span>
              {h.phone ? <span className="shrink-0 text-xs text-muted-foreground">{h.phone}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EntryDialog({
  orgId,
  employees,
  initial,
  isEdit,
  onCancel,
  onSave,
}: {
  orgId: string;
  employees: PlannerEmployee[];
  initial: PlannerEntryInput;
  isEdit: boolean;
  onCancel: () => void;
  onSave: (input: PlannerEntryInput) => Promise<void>;
}) {
  const [f, setF] = useState<PlannerEntryInput>(initial);
  const [saving, setSaving] = useState(false);
  const [titleTouched, setTitleTouched] = useState(!!initial.title);
  const set = (patch: Partial<PlannerEntryInput>) => setF((x) => ({ ...x, ...patch }));
  const partyKind = f.entry_type === "supplier_payment" ? "supplier" : "customer";
  const showAmount = f.entry_type === "collection" || f.entry_type === "cheque" || f.entry_type === "supplier_payment";

  // A title from the type and party until one is typed.
  const autoTitle = defaultTitle(f.entry_type, f.party_name);
  const title = titleTouched ? f.title : f.title || autoTitle;

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ ...f, title });
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onCancel()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit entry" : "Add to planner"}</DialogTitle>
          <DialogDescription>Shows on the calendar date, red until it is done.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Entry type">
            {PLANNER_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={f.entry_type === t.id}
                onClick={() =>
                  set({
                    entry_type: t.id,
                    // A supplier picked for a customer entry (or the other way) does not carry over.
                    ...(t.id === "supplier_payment" ? { customer_id: null } : { supplier_id: null }),
                    cheque_status: t.id === "cheque" ? f.cheque_status ?? "received" : null,
                  })
                }
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
                  f.entry_type === t.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {t.short}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="planner-date">{f.entry_type === "cheque" ? "Cheque date" : "Date"}</Label>
              <Input id="planner-date" type="date" value={f.entry_date} onChange={(e) => set({ entry_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="planner-time">Time (optional)</Label>
              <Input id="planner-time" type="time" value={f.entry_time ?? ""} onChange={(e) => set({ entry_time: e.target.value || null })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{partyKind === "supplier" ? "Supplier" : "Customer"} (optional)</Label>
            <PartyPicker
              orgId={orgId}
              kind={partyKind}
              name={f.party_name ?? ""}
              onChange={(p) =>
                set(partyKind === "supplier" ? { supplier_id: p.id, party_name: p.name || null } : { customer_id: p.id, party_name: p.name || null })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="planner-title">What is to be done</Label>
            <Input
              id="planner-title"
              value={title}
              placeholder="e.g. Visit Ramesh Traders for new order"
              onChange={(e) => {
                setTitleTouched(true);
                set({ title: e.target.value });
              }}
            />
          </div>
          {showAmount ? (
            <div className="space-y-1.5">
              <Label htmlFor="planner-amount">Amount (₹)</Label>
              <Input
                id="planner-amount"
                type="number"
                inputMode="decimal"
                min={0}
                value={f.amount ?? ""}
                onChange={(e) => set({ amount: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
          ) : null}
          {f.entry_type === "cheque" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="planner-cheque-no">Cheque no.</Label>
                <Input id="planner-cheque-no" value={f.cheque_number ?? ""} onChange={(e) => set({ cheque_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="planner-bank">Bank</Label>
                <Input id="planner-bank" value={f.bank_name ?? ""} onChange={(e) => set({ bank_name: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Cheque status</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CHEQUE_STATUSES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={(f.cheque_status ?? "received") === c.id}
                      onClick={() => set({ cheque_status: c.id })}
                      className={cn(
                        "rounded-md border px-3 py-1 text-xs font-semibold",
                        (f.cheque_status ?? "received") === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Staff (tag who will do it)</Label>
            {employees.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add staff in Master → Employee Master to tag them here.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5" aria-label="Staff">
                {employees.map((emp) => {
                  const on = f.assigned_employee_ids.includes(emp.id);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set({
                          assigned_employee_ids: on ? f.assigned_employee_ids.filter((x) => x !== emp.id) : [...f.assigned_employee_ids, emp.id],
                        })
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
                        on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {on ? <Check className="h-3 w-3" /> : null}
                      {emp.employee_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-pressed={f.priority === "high"}
              onClick={() => set({ priority: f.priority === "high" ? "normal" : "high" })}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold",
                f.priority === "high" ? "border-red-300 bg-red-50 text-red-700" : "hover:bg-muted",
              )}
            >
              <Flag className="h-3.5 w-3.5" /> High priority
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="planner-notes">Notes</Label>
            <Textarea id="planner-notes" rows={2} value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving} data-testid="planner-save">
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
