import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays, startOfMonth } from "date-fns";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileDown,
  LayoutList,
  Loader2,
  Receipt,
  Pause,
  Play,
  RotateCcw,
  Search,
  Truck,
  Users,
  Workflow,
} from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useIsNarrowViewport } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  billPaymentSteps,
  loadCustomerPaymentFlow,
  loadSupplierPaymentFlow,
  type FlowBill,
  type FlowKind,
  type FlowSource,
  type FlowStep,
  type PartyFlowModel,
  type PartyKind,
} from "@/utils/partyPaymentFlow";

/* ─────────────────────────── look ─────────────────────────── */

const KIND_COLOR: Record<FlowKind | "bill" | "due", string> = {
  payment: "#16a34a",
  cn: "#7c3aed",
  advance: "#2563eb",
  refund: "#dc2626",
  opening: "#d97706",
  adjustment: "#64748b",
  account: "#0d9488",
  bill: "#0f172a",
  due: "#f59e0b",
};

const KIND_ICON: Record<FlowKind, string> = {
  payment: "₹",
  cn: "CN",
  advance: "A",
  refund: "↩",
  opening: "OB",
  adjustment: "±",
  account: "≡",
};

const STATUS_STYLE: Record<FlowBill["status"], { label: string; cls: string }> = {
  paid: { label: "PAID", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
  partial: { label: "PARTLY PAID", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  unpaid: { label: "UNPAID", cls: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300" },
};

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const rs = (n: number) => `₹${inr.format(Math.abs(n))}`;

function fmtDate(d: string) {
  if (!d || d.startsWith("1900")) return "Carried forward";
  try {
    return format(parseISO(d.slice(0, 10)), "dd MMM yyyy");
  } catch {
    return d;
  }
}

/** Customer: + = customer owes (Dr). Supplier: + = we owe (Cr). */
function balanceText(party: PartyKind, n: number) {
  if (Math.abs(n) < 0.005) return "₹0";
  if (party === "customer") return `${rs(n)} ${n > 0 ? "Dr" : "Cr"}`;
  return `${rs(n)} ${n > 0 ? "Cr" : "Dr"}`;
}

const FLOW_CSS = `
@keyframes ppf-dash { to { stroke-dashoffset: -36; } }
@keyframes ppf-draw { from { stroke-dashoffset: var(--ppf-len); } to { stroke-dashoffset: 0; } }
@keyframes ppf-pop { 0% { transform: scale(.96); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.ppf-link { fill: none; stroke-linecap: round; stroke-dasharray: 8 10; animation: ppf-dash 1.2s linear infinite; transition: opacity .25s; }
.ppf-pop { animation: ppf-pop .35s ease-out backwards; }
.ppf-bar > i { transition: width .6s cubic-bezier(.2,.8,.2,1); }
@media (prefers-reduced-motion: reduce) { .ppf-link, .ppf-pop { animation: none; } }
`;

/* ─────────────────────────── party picker ─────────────────────────── */

interface PartyOption {
  id: string;
  name: string;
  phone: string | null;
  opening_balance: number;
}

function usePartySearch(orgId: string | undefined, party: PartyKind, term: string) {
  return useQuery({
    queryKey: ["payment-flow-party-search", orgId, party, term],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<PartyOption[]> => {
      const t = term.trim().replace(/[%,()]/g, " ");
      if (party === "customer") {
        let q = supabase
          .from("customers")
          .select("id, customer_name, phone, opening_balance")
          .eq("organization_id", orgId!)
          .is("deleted_at", null)
          .order("customer_name")
          .limit(20);
        if (t) q = q.or(`customer_name.ilike.%${t}%,phone.ilike.%${t}%`);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []).map((c: any) => ({
          id: c.id,
          name: c.customer_name,
          phone: c.phone,
          opening_balance: Number(c.opening_balance) || 0,
        }));
      }
      let q = supabase
        .from("suppliers")
        .select("id, supplier_name, phone, opening_balance")
        .eq("organization_id", orgId!)
        .is("deleted_at", null)
        .order("supplier_name")
        .limit(20);
      if (t) q = q.or(`supplier_name.ilike.%${t}%,phone.ilike.%${t}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((s: any) => ({
        id: s.id,
        name: s.supplier_name,
        phone: s.phone,
        opening_balance: Number(s.opening_balance) || 0,
      }));
    },
  });
}

function usePartyById(orgId: string | undefined, party: PartyKind, id: string | null) {
  return useQuery({
    queryKey: ["payment-flow-party", orgId, party, id],
    enabled: !!orgId && !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<PartyOption | null> => {
      if (party === "customer") {
        const { data, error } = await supabase
          .from("customers")
          .select("id, customer_name, phone, opening_balance")
          .eq("organization_id", orgId!)
          .eq("id", id!)
          .maybeSingle();
        if (error) throw error;
        return data
          ? { id: data.id, name: data.customer_name, phone: data.phone, opening_balance: Number(data.opening_balance) || 0 }
          : null;
      }
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, supplier_name, phone, opening_balance")
        .eq("organization_id", orgId!)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { id: data.id, name: data.supplier_name, phone: data.phone, opening_balance: Number(data.opening_balance) || 0 }
        : null;
    },
  });
}

function PartyPicker({
  orgId,
  party,
  selected,
  onPick,
}: {
  orgId: string | undefined;
  party: PartyKind;
  selected: PartyOption | null | undefined;
  onPick: (p: PartyOption) => void;
}) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);
  const { data: options = [], isFetching } = usePartySearch(open ? orgId : undefined, party, debounced);

  return (
    <div className="relative w-full sm:w-80">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={open ? term : selected ? `${selected.name}${selected.phone ? ` · ${selected.phone}` : ""}` : term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setTerm("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={party === "customer" ? "Search customer name or phone" : "Search supplier name or phone"}
        className="pl-8 h-9"
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-lg">
          {isFetching && options.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : options.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No match</div>
          ) : (
            options.map((o) => (
              <button
                key={o.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between gap-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(o);
                  setOpen(false);
                  setTerm("");
                }}
              >
                <span className="font-medium truncate">{o.name}</span>
                <span className="text-muted-foreground shrink-0">{o.phone || ""}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── date range ─────────────────────────── */

type RangeKey = "all" | "month" | "90d" | "fy" | "custom";

function fyStart(today: Date) {
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return new Date(y, 3, 1);
}

function rangeDates(key: RangeKey, from: string, to: string): { startDate: Date | null; endDate: Date | null } {
  const today = new Date();
  if (key === "month") return { startDate: startOfMonth(today), endDate: null };
  if (key === "90d") return { startDate: subDays(today, 90), endDate: null };
  if (key === "fy") return { startDate: fyStart(today), endDate: null };
  if (key === "custom") {
    return {
      startDate: from ? parseISO(from) : null,
      endDate: to ? parseISO(to) : null,
    };
  }
  return { startDate: null, endDate: null };
}

/* ─────────────────────────── board pieces ─────────────────────────── */

function SourceCard({
  s,
  party,
  hidden = false,
  dim,
  active,
  onSelect,
  refCb,
}: {
  s: FlowSource;
  party: PartyKind;
  /** Not reached yet in Play story: keeps its place so the lines do not jump. */
  hidden?: boolean;
  dim: boolean;
  active: boolean;
  onSelect: () => void;
  refCb?: (el: HTMLDivElement | null) => void;
}) {
  const color = KIND_COLOR[s.kind];
  const refundWord = party === "customer" ? "paid back" : "received back";
  return (
    <div
      ref={refCb}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" ? onSelect() : undefined)}
      className={cn(
        "relative z-[2] flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 cursor-pointer transition-opacity duration-300",
        hidden ? "opacity-[0.08]" : "ppf-pop",
        !hidden && dim && "opacity-25",
        active && "ring-2 ring-offset-1",
      )}
      style={{ borderLeft: `4px solid ${color}`, ...(active ? ({ "--tw-ring-color": color } as any) : {}) }}
    >
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-bold"
        style={{ background: `${color}1f`, color }}
      >
        {KIND_ICON[s.kind]}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{s.reference}</div>
        <div className="truncate text-xs text-muted-foreground">
          {s.label} · {fmtDate(s.date)}
          {s.raisesBalance && s.kind === "refund" ? ` · ${refundWord}` : ""}
          {s.note ? ` · ${s.note}` : ""}
        </div>
      </div>
      <div className="ml-auto pl-2 text-sm font-bold tabular-nums whitespace-nowrap" style={s.raisesBalance ? { color } : undefined}>
        {s.raisesBalance ? "−" : ""}
        {rs(s.amount)}
      </div>
    </div>
  );
}

function BillCard({
  bill,
  playStep,
  hidden = false,
  dim,
  active,
  onSelect,
  onOpen,
  sourceRef,
  refCb,
}: {
  bill: FlowBill;
  playStep: number | null;
  hidden?: boolean;
  dim: boolean;
  active: boolean;
  onSelect: () => void;
  /** Open in the one-bill view. */
  onOpen?: () => void;
  sourceRef: (id: string | null) => string;
  refCb?: (el: HTMLDivElement | null) => void;
}) {
  const visibleParts = bill.parts.filter((p) => playStep === null || p.step <= playStep);
  const settled = Math.min(bill.amount, visibleParts.reduce((t, p) => t + p.amount, 0));
  const due = Math.max(0, bill.amount - settled);
  const status: FlowBill["status"] =
    playStep === null ? bill.status : due <= 0.5 ? "paid" : settled > 0.5 ? "partial" : "unpaid";
  const st = STATUS_STYLE[status];
  return (
    <div
      ref={refCb}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" ? onSelect() : undefined)}
      className={cn(
        "relative z-[2] rounded-xl border bg-card px-3.5 py-3 cursor-pointer transition-opacity duration-300",
        hidden ? "opacity-[0.08]" : "ppf-pop",
        !hidden && dim && "opacity-25",
        active && "ring-2 ring-primary ring-offset-1",
      )}
      style={bill.isOpening ? { borderLeft: `4px solid ${KIND_COLOR.opening}` } : undefined}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-bold truncate">{bill.reference}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(bill.date)}</span>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", st.cls)}>{st.label}</span>
        {onOpen && (
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/40"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            Open
          </button>
        )}
      </div>
      <div className="ppf-bar my-2 flex h-3 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950/50">
        {visibleParts.map((p, i) => (
          <i
            key={`${p.sourceId}-${i}`}
            title={`${sourceRef(p.sourceId)} ${rs(p.amount)}`}
            className="block h-full"
            style={{
              width: `${bill.amount > 0 ? (p.amount / bill.amount) * 100 : 0}%`,
              background: KIND_COLOR[p.kind],
              opacity: i % 2 ? 0.8 : 1,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {bill.isOpening ? "Amount" : "Bill"} <b className="text-foreground tabular-nums">{rs(bill.amount)}</b>
        </span>
        <span>
          Settled <b className="text-foreground tabular-nums">{rs(settled)}</b>
        </span>
        <span>
          Due{" "}
          <b className={cn("tabular-nums", due > 0.5 ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>{rs(due)}</b>
        </span>
      </div>
    </div>
  );
}

interface LinkGeom {
  id: string;
  d: string;
  color: string;
  width: number;
  lx: number;
  ly: number;
  amount: number;
  sourceId: string;
  billId: string;
  step: number;
}

function FlowBoard({
  model,
  playStep,
  selected,
  onSelect,
  onOpenBill,
}: {
  model: PartyFlowModel;
  playStep: number | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpenBill: (billId: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [geoms, setGeoms] = useState<LinkGeom[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const setRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) nodeRefs.current.set(id, el);
      else nodeRefs.current.delete(id);
    },
    [],
  );

  const maxAmount = useMemo(() => Math.max(1, ...model.links.map((l) => l.amount)), [model.links]);

  const measure = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const b = board.getBoundingClientRect();
    setSize({ w: b.width, h: b.height });
    const perBill = new Map<string, number>();
    const out: LinkGeom[] = [];
    for (const l of model.links) {
      const s = nodeRefs.current.get(`s:${l.sourceId}`);
      const t = nodeRefs.current.get(`b:${l.billId}`);
      if (!s || !t) continue;
      const S = s.getBoundingClientRect();
      const T = t.getBoundingClientRect();
      const k = perBill.get(l.billId) || 0;
      perBill.set(l.billId, k + 1);
      const x1 = S.right - b.left;
      const y1 = S.top + S.height / 2 - b.top;
      const x2 = T.left - b.left;
      const spread = Math.min(T.height / 2 - 8, 10);
      const y2 = T.top + T.height / 2 - b.top + (k % 3 === 0 ? 0 : k % 3 === 1 ? -spread : spread);
      const mx = (x1 + x2) / 2;
      out.push({
        id: l.id,
        d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`,
        color: KIND_COLOR[l.kind],
        width: 2 + (l.amount / maxAmount) * 6,
        lx: x1 + (x2 - x1) * 0.22,
        ly: y1 + (y2 - y1) * 0.22 - 6,
        amount: l.amount,
        sourceId: l.sourceId,
        billId: l.billId,
        step: l.step,
      });
    }
    setGeoms(out);
  }, [model.links, maxAmount]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(board);
    return () => ro.disconnect();
  }, [measure]);

  const connected = useMemo(() => {
    if (!selected) return null;
    const ids = new Set<string>([selected]);
    for (const l of model.links) {
      if (`s:${l.sourceId}` === selected) ids.add(`b:${l.billId}`);
      if (`b:${l.billId}` === selected) ids.add(`s:${l.sourceId}`);
    }
    return ids;
  }, [selected, model.links]);

  const sourceRef = useCallback(
    (id: string | null) => (id ? model.sources.find((s) => s.id === id)?.reference ?? "" : "From account balance"),
    [model.sources],
  );

  const shown = (step: number) => playStep === null || step <= playStep;

  return (
    <div
      ref={boardRef}
      className="relative grid grid-cols-[minmax(300px,1fr)_minmax(80px,0.7fr)_minmax(380px,1.1fr)] rounded-2xl border bg-card p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <svg className="pointer-events-none absolute inset-0 z-[1]" width={size.w} height={size.h}>
        {geoms.map((g) => {
          const visible = shown(g.step);
          const lit = !connected || (connected.has(`s:${g.sourceId}`) && connected.has(`b:${g.billId}`));
          return (
            <g key={g.id} style={{ opacity: visible ? (lit ? 1 : 0.08) : 0, transition: "opacity .35s" }}>
              <path d={g.d} className="ppf-link" stroke={g.color} strokeWidth={g.width} strokeOpacity={0.5} />
              <text
                x={g.lx}
                y={g.ly}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={g.color}
                stroke="hsl(var(--card))"
                strokeWidth={4}
                paintOrder="stroke"
              >
                {rs(g.amount)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="space-y-2.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {model.party === "customer" ? "Money and credit received" : "Payments and credit notes"} (by date)
        </div>
        {model.sources.length === 0 && <div className="text-sm text-muted-foreground">Nothing in this period.</div>}
        {model.sources.map((s) => (
          <SourceCard
            key={s.id}
            s={s}
            party={model.party}
            hidden={!shown(s.step)}
            dim={!!connected && !connected.has(`s:${s.id}`)}
            active={selected === `s:${s.id}`}
            onSelect={() => onSelect(selected === `s:${s.id}` ? null : `s:${s.id}`)}
            refCb={setRef(`s:${s.id}`)}
          />
        ))}
      </div>
      <div />
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bills and what settled them</div>
        {model.bills.length === 0 && <div className="text-sm text-muted-foreground">No bills in this period.</div>}
        {model.bills.map((bill) => (
          <BillCard
            key={bill.id}
            bill={bill}
            playStep={playStep}
            hidden={!shown(bill.step)}
            dim={!!connected && !connected.has(`b:${bill.id}`)}
            active={selected === `b:${bill.id}`}
            onSelect={() => onSelect(selected === `b:${bill.id}` ? null : `b:${bill.id}`)}
            onOpen={() => onOpenBill(bill.id)}
            sourceRef={sourceRef}
            refCb={setRef(`b:${bill.id}`)}
          />
        ))}
      </div>
    </div>
  );
}

/** Phone layout: each bill lists what settled it; no lines. */
function FlowList({ model, playStep }: { model: PartyFlowModel; playStep: number | null }) {
  const byId = useMemo(() => new Map(model.sources.map((s) => [s.id, s])), [model.sources]);
  const shown = (step: number) => playStep === null || step <= playStep;
  const linkedIds = new Set(model.links.map((l) => l.sourceId));
  const loose = model.sources.filter((s) => shown(s.step) && (!linkedIds.has(s.id) || s.raisesBalance));
  return (
    <div className="space-y-3">
      {model.bills.filter((b) => shown(b.step)).map((bill) => (
        <div key={bill.id} className="space-y-1.5">
          <BillCard
            bill={bill}
            playStep={playStep}
            dim={false}
            active={false}
            onSelect={() => undefined}
            sourceRef={(id) => (id ? byId.get(id)?.reference ?? "" : "From account balance")}
          />
          {bill.parts
            .filter((p) => shown(p.step))
            .map((p, i) => {
              const s = p.sourceId ? byId.get(p.sourceId) : null;
              return (
                <div
                  key={`${p.sourceId}-${i}`}
                  className="ppf-pop ml-4 flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs"
                  style={{ borderLeft: `3px solid ${KIND_COLOR[p.kind]}` }}
                >
                  <span className="font-semibold truncate">{s ? s.reference : "From account balance"}</span>
                  <span className="text-muted-foreground truncate">{s ? `${s.label} · ${fmtDate(s.date)}` : ""}</span>
                  <span className="ml-auto font-bold tabular-nums" style={{ color: KIND_COLOR[p.kind] }}>
                    {rs(p.amount)}
                  </span>
                </div>
              );
            })}
        </div>
      ))}
      {loose.length > 0 && (
        <div className="space-y-1.5 pt-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">On account / not tied to a bill</div>
          {loose.map((s) => (
            <SourceCard key={s.id} s={s} party={model.party} dim={false} active={false} onSelect={() => undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function StoryStrip({
  model,
  playStep,
  onJump,
  highlight,
  hint,
}: {
  model: PartyFlowModel;
  playStep: number | null;
  onJump: (step: number) => void;
  /** Steps of the bill in focus. */
  highlight?: Set<number> | null;
  hint: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const steps = model.steps.filter((s) => !s.memo || s.kind === "opening");
  const current = playStep === null ? null : [...steps].reverse().find((s) => s.step <= playStep) ?? null;

  const firstHighlight = highlight && highlight.size ? Math.min(...highlight) : null;
  const currentStep = current?.step ?? firstHighlight;
  useEffect(() => {
    if (currentStep === null || !scroller.current) return;
    const box = scroller.current;
    const el = box.querySelector<HTMLElement>(`[data-step="${currentStep}"]`);
    // Scroll only the strip, never the page.
    if (el) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [currentStep]);

  if (steps.length === 0) return null;
  return (
    <div className="rounded-2xl border bg-card px-4 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Story · balance after each step ({hint})
      </div>
      <div ref={scroller} className="relative flex overflow-x-auto pb-2">
        {steps.map((st: FlowStep) => {
          const color = KIND_COLOR[st.kind === "bill" ? "bill" : st.kind];
          const isNow = current?.step === st.step;
          const future = playStep !== null && st.step > playStep;
          const lit = highlight ? highlight.has(st.step) : true;
          return (
            <button
              key={st.id}
              type="button"
              data-step={st.step}
              onClick={() => onJump(st.step)}
              className={cn(
                "relative min-w-[112px] flex-1 shrink-0 px-2 text-center text-[11px] text-muted-foreground transition-opacity",
                (future || !lit) && "opacity-35",
              )}
            >
              {highlight && lit && <span className="absolute inset-x-1 -top-0.5 bottom-0 rounded-lg bg-violet-500/10" />}
              <span className="absolute left-0 right-0 top-[9px] h-0.5 bg-border" />
              <span
                className={cn("relative mx-auto mb-1.5 block h-5 w-5 rounded-full border-[3px] border-card", isNow && "scale-125")}
                style={{ background: color, boxShadow: `0 0 0 ${isNow ? 4 : 1}px ${color}${isNow ? "55" : ""}`, transition: "transform .2s" }}
              />
              <b className="relative block whitespace-nowrap text-xs text-foreground">{st.reference}</b>
              <span className="relative block whitespace-nowrap">{st.date.startsWith("1900") ? "Opening" : fmtDate(st.date)}</span>
              <span className="relative block whitespace-nowrap tabular-nums font-semibold text-foreground">
                {balanceText(model.party, st.balance)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── one bill ─────────────────────────── */

function BillPicker({
  bills,
  focusId,
  onFocus,
}: {
  bills: FlowBill[];
  focusId: string | null;
  onFocus: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const idx = bills.findIndex((b) => b.id === focusId);
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-bill="${CSS.escape(focusId ?? "")}"]`);
    if (box && el) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [focusId]);
  const dot: Record<FlowBill["status"], string> = {
    paid: KIND_COLOR.payment,
    partial: KIND_COLOR.due,
    unpaid: KIND_COLOR.refund,
  };
  return (
    <div className="flex items-center gap-2">
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0"
        disabled={idx <= 0}
        onClick={() => onFocus(bills[idx - 1].id)}
        aria-label="Previous bill"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div ref={scroller} className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
        {bills.map((b) => {
          const on = b.id === focusId;
          return (
            <button
              key={b.id}
              type="button"
              data-bill={b.id}
              onClick={() => onFocus(b.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                on ? "border-violet-500 bg-violet-600 text-white shadow" : "bg-card hover:bg-accent",
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot[b.status] }} />
              <b className="whitespace-nowrap">{b.reference}</b>
              <span className={cn("whitespace-nowrap tabular-nums", on ? "text-white/80" : "text-muted-foreground")}>
                {b.due > 0.5 ? `due ${rs(b.due)}` : rs(b.amount)}
              </span>
            </button>
          );
        })}
      </div>
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0"
        disabled={idx < 0 || idx >= bills.length - 1}
        onClick={() => onFocus(bills[idx + 1].id)}
        aria-label="Next bill"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

const FOCUS_CARD_H = 64;
const FOCUS_GAP = 12;

/** One bill: what paid it (left), lines into the bill (middle), the bill (right), then step by step. */
function BillFocus({ model, bill, narrow }: { model: PartyFlowModel; bill: FlowBill; narrow: boolean }) {
  const steps = useMemo(() => billPaymentSteps(bill, model.sources), [bill, model.sources]);
  const payers = steps.slice(1);
  // Replay this bill's steps one by one whenever the bill changes.
  const [shownUpTo, setShownUpTo] = useState(0);
  const [replayKey, setReplayKey] = useState(0);
  useEffect(() => {
    setShownUpTo(0);
    if (payers.length === 0) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setShownUpTo(i);
      if (i >= payers.length) clearInterval(timer);
    }, 650);
    return () => clearInterval(timer);
  }, [bill.id, payers.length, replayKey]);

  const visible = payers.slice(0, shownUpTo);
  const settled = Math.min(bill.amount, visible.reduce((t, p) => t + p.amount, 0));
  const due = Math.max(0, bill.amount - settled);
  const status: FlowBill["status"] = shownUpTo >= payers.length ? bill.status : due <= 0.5 ? "paid" : settled > 0.5 ? "partial" : "unpaid";
  const st = STATUS_STYLE[status];
  const pct = bill.amount > 0 ? Math.round((settled / bill.amount) * 100) : 0;

  const n = Math.max(1, payers.length);
  const H = Math.max(240, n * (FOCUS_CARD_H + FOCUS_GAP) - FOCUS_GAP);
  const maxPart = Math.max(1, ...payers.map((p) => p.amount));
  const partyWord = model.party === "customer" ? "customer" : "supplier";

  const billCard = (
    <div className="ppf-pop w-full rounded-2xl border-2 bg-card p-5 shadow-sm" style={{ borderColor: bill.isOpening ? KIND_COLOR.opening : "hsl(var(--border))" }}>
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
          <Receipt className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold">{bill.reference}</div>
          <div className="text-sm text-muted-foreground">
            {bill.isOpening ? "Opening balance carried forward" : `${model.party === "customer" ? "Sale bill" : "Purchase bill"} · ${fmtDate(bill.date)}`}
          </div>
        </div>
        <span className={cn("ml-auto rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap", st.cls)}>{st.label}</span>
      </div>
      <div className="ppf-bar mt-4 flex h-5 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950/50">
        {visible.map((p, i) => (
          <i
            key={`${p.sourceId}-${i}`}
            title={`${p.reference} ${rs(p.amount)}`}
            className="block h-full"
            style={{ width: `${bill.amount > 0 ? (p.amount / bill.amount) * 100 : 0}%`, background: KIND_COLOR[p.kind], opacity: i % 2 ? 0.8 : 1 }}
          />
        ))}
      </div>
      <div className="mt-1 text-right text-xs text-muted-foreground">{pct}% settled</div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-muted/60 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{bill.isOpening ? "Amount" : "Bill amount"}</div>
          <div className="text-lg font-bold tabular-nums">{rs(bill.amount)}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/40">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Settled</div>
          <div className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{rs(settled)}</div>
        </div>
        <div className={cn("rounded-xl px-3 py-2", due > 0.5 ? "bg-amber-50 dark:bg-amber-950/40" : "bg-muted/60")}>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Due</div>
          <div className={cn("text-lg font-bold tabular-nums", due > 0.5 ? "text-amber-700 dark:text-amber-400" : "")}>{rs(due)}</div>
        </div>
      </div>
    </div>
  );

  const payerCard = (p: (typeof payers)[number], i: number) => {
    const color = KIND_COLOR[p.kind];
    const on = i < shownUpTo;
    return (
      <div
        key={`${p.sourceId}-${i}`}
        className={cn("flex items-center gap-3 rounded-xl border bg-card px-3 transition-all duration-300", on ? "opacity-100" : "opacity-15")}
        style={{ height: FOCUS_CARD_H, borderLeft: `5px solid ${color}` }}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold" style={{ background: `${color}1f`, color }}>
          {KIND_ICON[p.kind as FlowKind]}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{p.reference}</div>
          <div className="truncate text-xs text-muted-foreground">
            {p.label} · {fmtDate(p.date)}
            {p.sourceTotal ? ` · ${rs(p.amount)} of ${rs(p.sourceTotal)} used here` : ""}
          </div>
        </div>
        <div className="ml-auto pl-2 text-base font-bold tabular-nums whitespace-nowrap" style={{ color }}>
          {rs(p.amount)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {narrow ? (
        <div className="space-y-3">
          {billCard}
          <div className="space-y-2">{payers.map(payerCard)}</div>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(320px,1fr)_minmax(120px,0.55fr)_minmax(420px,1.15fr)] items-center rounded-2xl border bg-card p-5">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paid by</div>
            {payers.length === 0 ? (
              <div className="grid place-items-center rounded-xl border border-dashed text-sm text-muted-foreground" style={{ height: H }}>
                Nothing paid on this bill yet
              </div>
            ) : (
              <div className="flex flex-col justify-center" style={{ height: H, gap: FOCUS_GAP }}>
                {payers.map(payerCard)}
              </div>
            )}
          </div>
          <div className="self-end" style={{ height: H }}>
            <svg width="100%" height={H} viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="block overflow-visible">
              {payers.map((p, i) => {
                const blockH = payers.length * (FOCUS_CARD_H + FOCUS_GAP) - FOCUS_GAP;
                const y1 = (H - blockH) / 2 + i * (FOCUS_CARD_H + FOCUS_GAP) + FOCUS_CARD_H / 2;
                const y2 = H / 2 + (i - (payers.length - 1) / 2) * Math.min(10, 60 / Math.max(1, payers.length));
                return (
                  <path
                    key={`${p.sourceId}-${i}`}
                    d={`M0,${y1} C50,${y1} 50,${y2} 100,${y2}`}
                    className="ppf-link"
                    stroke={KIND_COLOR[p.kind]}
                    strokeWidth={3 + (p.amount / maxPart) * 7}
                    strokeOpacity={i < shownUpTo ? 0.6 : 0}
                    vectorEffect="non-scaling-stroke"
                    style={{ transition: "stroke-opacity .4s" }}
                  />
                );
              })}
            </svg>
          </div>
          <div className="flex items-center self-end" style={{ height: H }}>
            {billCard}
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How {bill.reference} was paid
          <button
            type="button"
            className="ml-auto flex items-center gap-1 normal-case text-violet-600 hover:underline"
            onClick={() => setReplayKey((k) => k + 1)}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Replay
          </button>
        </div>
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
          {steps.map((s, i) => {
            const color = KIND_COLOR[s.kind === "bill" ? "bill" : s.kind];
            const on = i === 0 || i <= shownUpTo;
            return (
              <div key={`${s.sourceId}-${i}`} className="flex shrink-0 items-center gap-2">
                {i > 0 && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
                <div
                  className={cn("min-w-[170px] rounded-xl border px-3 py-2 transition-opacity duration-300", on ? "opacity-100" : "opacity-25")}
                  style={{ borderTop: `4px solid ${color}` }}
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: color }}>
                      {i + 1}
                    </span>
                    {fmtDate(s.date)}
                  </div>
                  <div className="mt-0.5 whitespace-nowrap text-sm font-semibold">{s.reference}</div>
                  <div className="whitespace-nowrap text-xs text-muted-foreground">{s.label}</div>
                  <div className="mt-1 whitespace-nowrap text-sm font-bold tabular-nums" style={{ color }}>
                    {i === 0 ? rs(s.amount) : `− ${rs(s.amount)}`}
                  </div>
                  <div className={cn("whitespace-nowrap text-xs font-semibold tabular-nums", s.dueAfter > 0.5 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>
                    {s.dueAfter > 0.5 ? `Due after: ${rs(s.dueAfter)}` : "Fully paid ✓"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {steps.some((s) => s.kind === "account") && (
          <p className="mt-2 text-xs text-muted-foreground">
            "Account balance" means the ledger shows this bill settled by an amount the {partyWord} paid on account, not against one bill.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── page ─────────────────────────── */

export default function PartyPaymentFlowPage() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { orgNavigate } = useOrgNavigation();
  const isNarrow = useIsNarrowViewport();
  const [params, setParams] = useSearchParams();
  const party: PartyKind = params.get("type") === "supplier" ? "supplier" : "customer";
  const partyId = params.get("id");

  const [rangeKey, setRangeKey] = useState<RangeKey>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = useMemo(() => rangeDates(rangeKey, from, to), [rangeKey, from, to]);

  const { data: partyRow } = usePartyById(orgId, party, partyId);

  const { data: model, isLoading, error } = useQuery({
    queryKey: [
      "payment-flow",
      orgId,
      party,
      partyId,
      range.startDate?.toISOString() ?? null,
      range.endDate?.toISOString() ?? null,
      partyRow?.opening_balance ?? null,
    ],
    enabled: !!orgId && !!partyId && (party === "customer" || !!partyRow),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      party === "customer"
        ? loadCustomerPaymentFlow(orgId!, partyId!, range)
        : loadSupplierPaymentFlow(orgId!, { id: partyId!, opening_balance: partyRow!.opening_balance }, range),
  });

  const [playStep, setPlayStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const view: "bill" | "all" = params.get("view") === "all" ? "all" : "bill";
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Reset playback when the party or period changes.
  useEffect(() => {
    setPlaying(false);
    setPlayStep(null);
    setSelected(null);
    setFocusId(null);
  }, [party, partyId, rangeKey, from, to]);

  // One-bill view opens on the oldest bill still due, else the latest bill.
  const focusBill = useMemo(() => {
    if (!model || model.bills.length === 0) return null;
    return (
      model.bills.find((b) => b.id === focusId) ??
      model.bills.find((b) => b.due > 0.5) ??
      model.bills[model.bills.length - 1]
    );
  }, [model, focusId]);

  const focusSteps = useMemo(() => {
    if (view !== "bill" || !focusBill) return null;
    return new Set<number>([focusBill.step, ...focusBill.parts.map((p) => p.step)]);
  }, [view, focusBill]);

  const setView = (next: "bill" | "all") => {
    const p = new URLSearchParams(params);
    if (next === "all") p.set("view", "all");
    else p.delete("view");
    setParams(p, { replace: true });
    setPlaying(false);
    setPlayStep(null);
  };

  /** Bill whose own row or one of whose payments is this story step. */
  const billAtStep = (step: number) =>
    model?.bills.find((b) => b.step === step) ?? model?.bills.find((b) => b.parts.some((p) => p.step === step)) ?? null;

  const periodLabel =
    rangeKey === "all"
      ? "All time"
      : rangeKey === "fy"
        ? "This financial year"
        : rangeKey === "90d"
          ? "Last 90 days"
          : rangeKey === "month"
            ? "This month"
            : `${from ? fmtDate(from) : "Start"} to ${to ? fmtDate(to) : "today"}`;

  const exportPdf = async () => {
    if (!model || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { exportPaymentFlowPdf } = await import("@/utils/paymentFlowPdf");
      await exportPaymentFlowPdf({
        model,
        partyName: partyRow?.name || (party === "customer" ? "Customer" : "Supplier"),
        partyPhone: partyRow?.phone,
        periodLabel,
        businessName: currentOrganization?.name,
        billId: view === "bill" ? focusBill?.id ?? null : null,
      });
    } catch (e) {
      toast.error(`Could not make the PDF: ${(e as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const lastStep = model ? model.steps.length - 1 : -1;

  useEffect(() => {
    if (!playing || !model) return;
    const timer = setInterval(() => {
      setPlayStep((cur) => Math.min(lastStep, cur === null ? 0 : cur + 1));
    }, 850);
    return () => clearInterval(timer);
  }, [playing, model, lastStep]);

  useEffect(() => {
    if (playing && playStep !== null && playStep >= lastStep) setPlaying(false);
  }, [playing, playStep, lastStep]);

  const keepView = view === "all" ? { view: "all" } : {};
  const setParty = (next: PartyKind) => setParams({ type: next, ...keepView }, { replace: true });
  const pick = (p: PartyOption) => setParams({ type: party, id: p.id, ...keepView }, { replace: true });

  const t = model?.totals;
  const tiles = t
    ? [
        { k: "Opening", v: balanceText(party, t.opening), c: KIND_COLOR.opening },
        { k: party === "customer" ? "Billed" : "Purchases", v: rs(t.billed), c: KIND_COLOR.bill },
        { k: party === "customer" ? "Received" : "Paid", v: rs(t.paid), c: KIND_COLOR.payment },
        { k: party === "customer" ? "CN / Returns" : "CN / Returns", v: rs(t.cn), c: KIND_COLOR.cn },
        ...(party === "customer" ? [{ k: "Advance", v: rs(t.advance), c: KIND_COLOR.advance }] : []),
        { k: party === "customer" ? "Refunds paid" : "Refunds received", v: rs(t.refund), c: KIND_COLOR.refund },
        ...(Math.abs(t.adjustment) > 0.005
          ? [{ k: "Adjustments", v: `${t.adjustment < 0 ? "−" : ""}${rs(t.adjustment)}`, c: KIND_COLOR.adjustment }]
          : []),
      ]
    : [];

  const legend: Array<[string, string]> = [
    [KIND_COLOR.payment, "Payment"],
    [KIND_COLOR.cn, party === "customer" ? "CN / sale return" : "CN / purchase return"],
    ...(party === "customer" ? ([[KIND_COLOR.advance, "Advance adjusted"]] as Array<[string, string]>) : []),
    [KIND_COLOR.opening, "Opening balance"],
    [KIND_COLOR.refund, "Refund"],
    [KIND_COLOR.account, "From account balance"],
    [KIND_COLOR.due, "Still due"],
  ];

  return (
    <div className="w-full space-y-3 px-3 py-3 sm:px-4">
      <style>{FLOW_CSS}</style>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2"
          onClick={() => orgNavigate(party === "customer" ? "/customer-party-balances" : "/supplier-party-balances")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Workflow className="h-5 w-5 text-violet-600" /> Payment Flow
        </h1>
        <div className="flex rounded-lg bg-muted p-1">
          {(["customer", "supplier"] as PartyKind[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setParty(p)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-semibold",
                party === p ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {p === "customer" ? <Users className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}
              {p === "customer" ? "Customer" : "Supplier"}
            </button>
          ))}
        </div>
        <PartyPicker key={party} orgId={orgId} party={party} selected={partyRow} onPick={pick} />
        <select
          value={rangeKey}
          onChange={(e) => setRangeKey(e.target.value as RangeKey)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Period"
        >
          <option value="all">All time</option>
          <option value="fy">This financial year</option>
          <option value="90d">Last 90 days</option>
          <option value="month">This month</option>
          <option value="custom">Custom dates</option>
        </select>
        {rangeKey === "custom" && (
          <div className="flex items-center gap-1">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
            <span className="text-muted-foreground">→</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
          </div>
        )}
        {model && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <div className="flex rounded-lg bg-muted p-1">
              {(
                [
                  ["bill", "One bill", Receipt],
                  ["all", "All bills", LayoutList],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-semibold",
                    view === v ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            {view === "all" && (
            <Button
              size="sm"
              className="h-9"
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                  return;
                }
                if (playStep === null || playStep >= lastStep) setPlayStep(0);
                setPlaying(true);
              }}
              disabled={lastStep < 0}
            >
              {playing ? <Pause className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4" />}
              {playing ? "Pause" : "Play story"}
            </Button>
            )}
            {view === "all" && playStep !== null && (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => {
                  setPlaying(false);
                  setPlayStep(null);
                }}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" /> Show all
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() =>
                orgNavigate(
                  party === "customer" ? "/customer-party-balances" : "/supplier-party-balances",
                )
              }
            >
              <BookOpen className="mr-1.5 h-4 w-4" /> Balances
            </Button>
            <Button
              size="sm"
              className="h-9 bg-gradient-to-r from-violet-600 to-teal-600 text-white hover:opacity-90"
              onClick={() => void exportPdf()}
              disabled={pdfBusy}
            >
              {pdfBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
              PDF{view === "bill" && focusBill ? ` · ${focusBill.reference}` : ""}
            </Button>
          </div>
        )}
      </div>

      {!partyId && (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          <Workflow className="mx-auto mb-3 h-10 w-10 text-violet-500" />
          Pick a {party} to see which payment, credit note, advance or refund settled each bill.
        </div>
      )}

      {partyId && isLoading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading ledger…
        </div>
      )}

      {partyId && error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Could not load this {party}'s ledger: {(error as Error).message}
        </div>
      )}

      {model && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
            {tiles.map((tile) => (
              <div key={tile.k} className="rounded-xl border bg-card px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: tile.c }} />
                  {tile.k}
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">{tile.v}</div>
              </div>
            ))}
            <div className="col-span-2 rounded-xl border-2 border-amber-400 bg-card px-3 py-2.5 sm:col-span-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Closing balance</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {balanceText(party, model.totals.closing)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {legend.map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                {l}
              </span>
            ))}
            {model.unlinkedCredit > 0.5 && (
              <span className="sm:ml-auto">
                Not tied to a bill (on account): <b className="text-foreground">{rs(model.unlinkedCredit)}</b>
              </span>
            )}
          </div>

          <StoryStrip
            model={model}
            playStep={view === "all" ? playStep : null}
            highlight={focusSteps}
            hint={view === "bill" ? "tap a step to open its bill" : "tap a step to replay up to it"}
            onJump={(s) => {
              if (view === "bill") {
                const b = billAtStep(s);
                if (b) setFocusId(b.id);
                return;
              }
              setPlaying(false);
              setPlayStep(s);
            }}
          />

          {view === "bill" ? (
            focusBill ? (
              <>
                <BillPicker bills={model.bills} focusId={focusBill.id} onFocus={setFocusId} />
                <BillFocus model={model} bill={focusBill} narrow={isNarrow} />
              </>
            ) : (
              <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                No bills in this period.
              </div>
            )
          ) : isNarrow ? (
            <FlowList model={model} playStep={playStep} />
          ) : (
            <FlowBoard
              model={model}
              playStep={playStep}
              selected={selected}
              onSelect={setSelected}
              onOpenBill={(id) => {
                setFocusId(id);
                setView("bill");
              }}
            />
          )}

          <p className="text-xs text-muted-foreground">
            Amounts and balances are the same rows as the {party === "customer" ? "Customer" : "Supplier"} Ledger. When a
            payment is not linked to one bill, the bill shows "From account balance". Advances and credit notes used on a
            bill are matched oldest first.
          </p>
        </>
      )}
    </div>
  );
}
