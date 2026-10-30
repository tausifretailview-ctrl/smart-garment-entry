import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isToday, parseISO, subDays } from "date-fns";
import {
  ArrowDownLeft, ArrowUpRight, Banknote, CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight,
  CreditCard, Landmark, Lock, Pencil, Printer, RefreshCw, Save, Smartphone, UserRound, Wallet,
  AlertTriangle, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useDcVisibility } from "@/hooks/useDcVisibility";
import { useSettings } from "@/hooks/useSettings";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuietRefreshBar } from "@/components/QuietRefreshBar";
import { cn } from "@/lib/utils";
import { localDayBounds } from "@/lib/localDayBounds";
import { fetchAllSalesWithFilters } from "@/utils/fetchAllRows";
import { syncDailyTallyBankDeposit } from "@/utils/accounting/bankStatement";
import { syncDayCloseCashJournal } from "@/utils/accounting/dayCloseJournal";
import {
  aggregateCashTallyDrawerFlows,
  computeExpectedDrawerCash,
} from "@/utils/cashTallyExpectedDrawer";
import {
  ACCOUNT_TALLY_NOTES,
  buildAccountTallyData,
  computeClosingCash,
  denominationPieces,
  denominationTotal,
  emptyDenominationCounts,
  openingFromPreviousClose,
  parseAccountTallyData,
  round2,
  tallyDifferenceStatus,
  type AccountTallyMeta,
  type DenominationCounts,
} from "@/utils/accountTally";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(
    Number(n) || 0,
  );

const REPORT_CACHE = { staleTime: 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false as const };

const amountInput = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

type SnapshotRow = {
  id: string;
  tally_date: string;
  opening_cash: number | null;
  expected_cash: number | null;
  physical_cash: number | null;
  difference_amount: number | null;
  leave_in_drawer: number | null;
  deposit_to_bank: number | null;
  handover_to_owner: number | null;
  notes: string | null;
  denomination_data: Json | null;
  created_at: string | null;
};

const SNAPSHOT_COLUMNS =
  "id, tally_date, opening_cash, expected_cash, physical_cash, difference_amount, leave_in_drawer, deposit_to_bank, handover_to_owner, notes, denomination_data, created_at";

export default function DailyAccountTally() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { isAdmin, isManager } = useUserRoles();
  const { hideDc, onlyDc } = useDcVisibility();
  const { data: settings } = useSettings();
  const { orgNavigate } = useOrgNavigation();
  const queryClient = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const noteInputs = useRef<Array<HTMLInputElement | null>>([]);

  const orgId = currentOrganization?.id;
  const canEditAnyDate = isAdmin || isManager;

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { startIso, endIso } = localDayBounds(dateStr, dateStr);

  const [counts, setCounts] = useState<DenominationCounts>(emptyDenominationCounts);
  const [coins, setCoins] = useState(0);
  const [openingCash, setOpeningCash] = useState(0);
  const [editOpening, setEditOpening] = useState(false);
  const [handover, setHandover] = useState(0);
  const [handoverTo, setHandoverTo] = useState("");
  const [deposit, setDeposit] = useState(0);
  const [actualCard, setActualCard] = useState<number | null>(null);
  const [actualUpi, setActualUpi] = useState<number | null>(null);
  const [shortReason, setShortReason] = useState("");
  const [notes, setNotes] = useState("");

  // ─── Day's money (same sources as Daily Tally / POS Cash Tally) ─────────
  const salesQ = useQuery({
    queryKey: ["daily-tally-sales", orgId, dateStr, hideDc, onlyDc],
    queryFn: () => fetchAllSalesWithFilters(orgId!, { startDate: startIso, endDate: endIso, hideDc, onlyDc }),
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  const vouchersQ = useQuery({
    queryKey: ["daily-tally-vouchers", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("id, voucher_number, voucher_date, voucher_type, total_amount, discount_amount, description, reference_type, reference_id, category, payment_method")
        .eq("organization_id", orgId!)
        .is("deleted_at", null)
        .eq("voucher_date", dateStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  const advancesQ = useQuery({
    queryKey: ["daily-tally-advances", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_advances")
        .select("id, amount, payment_method, advance_date")
        .eq("organization_id", orgId!)
        .eq("advance_date", dateStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  const refundsQ = useQuery({
    queryKey: ["account-tally-refunds", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_returns")
        .select("id, net_amount, return_date, refund_type, payment_method")
        .eq("organization_id", orgId!)
        .eq("return_date", dateStr)
        .is("deleted_at", null);
      if (error) return [];
      return data || [];
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  const advanceRefundsQ = useQuery({
    queryKey: ["daily-tally-advance-refunds", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advance_refunds")
        .select("id, refund_amount, payment_method, refund_date")
        .eq("organization_id", orgId!)
        .eq("refund_date", dateStr);
      if (error) return [];
      return data || [];
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  const snapshotQ = useQuery({
    // Own key: Daily Tally caches a 2-column "yesterday" row under daily-tally-snapshot.
    queryKey: ["account-tally-snapshot", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .select(SNAPSHOT_COLUMNS)
        .eq("organization_id", orgId!)
        .eq("tally_date", dateStr)
        .maybeSingle();
      if (error) throw error;
      return (data as SnapshotRow | null) ?? null;
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  // Last closed day before this date (shop may be closed on Sundays / holidays).
  const previousQ = useQuery({
    queryKey: ["account-tally-previous", orgId, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .select("tally_date, leave_in_drawer")
        .eq("organization_id", orgId!)
        .lt("tally_date", dateStr)
        .order("tally_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  const registerFrom = format(subDays(selectedDate, 30), "yyyy-MM-dd");
  const registerQ = useQuery({
    queryKey: ["account-tally-register", orgId, registerFrom, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .select(SNAPSHOT_COLUMNS)
        .eq("organization_id", orgId!)
        .gte("tally_date", registerFrom)
        .lte("tally_date", dateStr)
        .order("tally_date", { ascending: false });
      if (error) throw error;
      return (data as SnapshotRow[] | null) ?? [];
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  const snapshot = snapshotQ.data ?? null;
  const previous = previousQ.data ?? null;
  const dataLoading =
    salesQ.isLoading || vouchersQ.isLoading || advancesQ.isLoading || refundsQ.isLoading || advanceRefundsQ.isLoading;

  // ─── Load saved close / reset for a new day ────────────────────────────
  useEffect(() => {
    if (snapshotQ.isLoading) return;
    if (snapshot) {
      const parsed = parseAccountTallyData(snapshot.denomination_data);
      setCounts(parsed.counts);
      setCoins(parsed.coins);
      setOpeningCash(Number(snapshot.opening_cash) || 0);
      setDeposit(Number(snapshot.deposit_to_bank) || 0);
      const counted = Number(snapshot.physical_cash) || 0;
      const closing = Number(snapshot.leave_in_drawer) || 0;
      // Older saves stored handover as a formula result; rebuild it from the identity.
      setHandover(Math.max(0, round2(counted - closing - (Number(snapshot.deposit_to_bank) || 0))));
      setNotes(snapshot.notes || "");
      setHandoverTo(parsed.meta?.handoverTo || "");
      setActualCard(parsed.meta?.actualCard ?? null);
      setActualUpi(parsed.meta?.actualUpi ?? null);
      setShortReason(parsed.meta?.shortReason || "");
    } else {
      setCounts(emptyDenominationCounts());
      setCoins(0);
      setOpeningCash(openingFromPreviousClose(previous));
      setDeposit(0);
      setHandover(0);
      setNotes("");
      setHandoverTo("");
      setActualCard(null);
      setActualUpi(null);
      setShortReason("");
    }
    setEditOpening(false);
  }, [snapshot, previous, snapshotQ.isLoading]);

  // ─── Totals ────────────────────────────────────────────────────────────
  const flows = useMemo(
    () =>
      aggregateCashTallyDrawerFlows({
        sales: salesQ.data,
        vouchers: vouchersQ.data,
        advances: advancesQ.data,
        saleReturns: refundsQ.data,
        advanceRefunds: advanceRefundsQ.data,
      }),
    [salesQ.data, vouchersQ.data, advancesQ.data, refundsQ.data, advanceRefundsQ.data],
  );

  const sale = useMemo(() => {
    const p = flows.posSales;
    const i = flows.invoiceSales;
    return {
      cash: p.cash + i.cash,
      card: p.card + i.card,
      upi: p.upi + i.upi,
      bank: p.bank + i.bank,
      credit: p.credit + i.credit,
      total: p.total + i.total,
    };
  }, [flows]);

  const inParts = [flows.posSales, flows.invoiceSales, flows.receipts, flows.advances];
  const expectedCard = round2(inParts.reduce((s, b) => s + b.card, 0));
  const expectedUpi = round2(inParts.reduce((s, b) => s + b.upi, 0));

  const cashBookRows: Array<{ label: string; amount: number; sign: 1 | -1 }> = [
    { label: "Cash sale (POS)", amount: flows.posSales.cash, sign: 1 },
    { label: "Cash sale (Invoice)", amount: flows.invoiceSales.cash, sign: 1 },
    { label: "Old balance received", amount: flows.receipts.cash, sign: 1 },
    { label: "Advance received", amount: flows.advances.cash, sign: 1 },
    { label: "Supplier payment", amount: flows.supplierPayments.cash, sign: -1 },
    { label: "Shop expenses", amount: flows.expenses.cash, sign: -1 },
    { label: "Staff salary", amount: flows.employeeSalary.cash, sign: -1 },
    { label: "Third-party payment", amount: flows.thirdPartyPayments.cash, sign: -1 },
    { label: "Sale return refund", amount: flows.saleReturnRefunds.cash, sign: -1 },
    { label: "Advance refund", amount: flows.advanceRefunds.cash, sign: -1 },
  ];

  const expectedCash = round2(computeExpectedDrawerCash(openingCash, flows.cashIn, flows.cashOut));
  const counted = denominationTotal(counts, coins);
  const difference = round2(counted - expectedCash);
  const diffStatus = tallyDifferenceStatus(difference);
  const closingCash = computeClosingCash(counted, handover, deposit);
  const pieces = denominationPieces(counts);

  const isClosed = !!snapshot;
  const savedMeta = snapshot ? parseAccountTallyData(snapshot.denomination_data).meta : null;
  const openingFromLabel = previous?.tally_date
    ? `Closing of ${format(parseISO(previous.tally_date), "dd MMM")}`
    : "No earlier day closed";

  const userLabel =
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || "User";

  // ─── Save (close day) ──────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const meta: AccountTallyMeta = {
        version: 1,
        cashSale: round2(sale.cash),
        cardSale: round2(sale.card),
        upiSale: round2(sale.upi),
        bankSale: round2(sale.bank),
        creditSale: round2(sale.credit),
        totalSale: round2(sale.total),
        cashIn: round2(flows.cashIn),
        cashOut: round2(flows.cashOut),
        expectedCard,
        expectedUpi,
        actualCard,
        actualUpi,
        shortReason: shortReason.trim(),
        handoverTo: handoverTo.trim(),
        closedBy: userLabel,
        closedAt: new Date().toISOString(),
      };
      const payload = {
        organization_id: orgId!,
        tally_date: dateStr,
        opening_cash: openingCash,
        expected_cash: expectedCash,
        physical_cash: counted,
        difference_amount: difference,
        leave_in_drawer: closingCash,
        deposit_to_bank: deposit,
        handover_to_owner: handover,
        notes: notes.trim() || null,
        created_by: user?.id || null,
        denomination_data: buildAccountTallyData(counts, coins, meta) as unknown as Json,
      };
      const { data, error } = await supabase
        .from("daily_tally_snapshot")
        .upsert(payload, { onConflict: "organization_id,tally_date" })
        .select("id")
        .single();
      if (error) throw error;
      // "Deposit to bank" goes to the Bank Statement (Contra in the default bank).
      try {
        await syncDailyTallyBankDeposit({
          organizationId: orgId!,
          snapshotId: (data as { id: string }).id,
          tallyDate: dateStr,
          amount: deposit,
        });
      } catch (e) {
        toast.warning(`Day closed, but the bank deposit was not posted: ${(e as Error).message}`);
      }
      // Owner handover and cash short/excess go to the ledger so Cash in Hand follows the drawer.
      try {
        await syncDayCloseCashJournal({
          organizationId: orgId!,
          snapshotId: (data as { id: string }).id,
          tallyDate: dateStr,
          handover,
          difference,
        });
      } catch (e) {
        toast.warning(`Day closed, but the owner handover / cash difference was not posted: ${(e as Error).message}`);
      }
    },
    onSuccess: () => {
      toast.success(`Day closed. ${fmt(closingCash)} carried to next day's opening.`);
      void snapshotQ.refetch();
      void registerQ.refetch();
      void queryClient.invalidateQueries({ queryKey: ["daily-tally-snapshot", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["account-tally-previous", orgId] });
    },
    onError: (e: Error) => toast.error(`Could not close the day: ${e.message}`),
  });

  const handleClose = () => {
    if (!orgId) return;
    if (counted <= 0 && expectedCash > 0) {
      toast.error("Count the cash in the drawer first.");
      noteInputs.current[0]?.focus();
      return;
    }
    if (closingCash < 0) {
      toast.error("Owner handover + bank deposit is more than the cash counted.");
      return;
    }
    if (diffStatus !== "balanced" && !shortReason.trim()) {
      toast.error(`Write a reason for the cash ${diffStatus === "short" ? "shortage" : "excess"}.`);
      return;
    }
    saveMutation.mutate();
  };

  const handleRefresh = useCallback(() => {
    void salesQ.refetch();
    void vouchersQ.refetch();
    void advancesQ.refetch();
    void refundsQ.refetch();
    void advanceRefundsQ.refetch();
    void snapshotQ.refetch();
    void previousQ.refetch();
    void registerQ.refetch();
  }, [salesQ, vouchersQ, advancesQ, refundsQ, advanceRefundsQ, snapshotQ, previousQ, registerQ]);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const moveDay = (delta: number) => {
    const next = addDays(selectedDate, delta);
    if (delta > 0 && next > new Date()) return;
    setSelectedDate(next);
  };

  const setNote = (note: number, value: string) =>
    setCounts((prev) => ({ ...prev, [note]: Math.max(0, Math.floor(Number(value) || 0)) }));

  const focusNext = (index: number) => {
    const next = noteInputs.current[index + 1];
    if (next) {
      next.focus();
      next.select();
    }
  };

  // Register rows: flag a day whose opening does not match the day before's closing.
  const registerRows = useMemo(() => {
    const rows = registerQ.data ?? [];
    return rows.map((r, idx) => {
      const prev = rows[idx + 1];
      const meta = parseAccountTallyData(r.denomination_data).meta;
      const openingMismatch =
        !!prev && Math.abs((Number(r.opening_cash) || 0) - (Number(prev.leave_in_drawer) || 0)) >= 1;
      return { row: r, meta, openingMismatch };
    });
  }, [registerQ.data]);

  const statCards = [
    { label: "Opening cash", value: openingCash, sub: openingFromLabel, icon: Wallet, tone: "text-slate-700 dark:text-slate-200", bg: "bg-slate-100 dark:bg-slate-800" },
    { label: "Cash sale", value: sale.cash, sub: "POS + invoice", icon: Banknote, tone: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
    { label: "Card", value: sale.card, sub: "Card machine", icon: CreditCard, tone: "text-violet-700 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/40" },
    { label: "UPI", value: sale.upi, sub: "QR / UPI apps", icon: Smartphone, tone: "text-sky-700 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/40" },
    { label: "Credit (udhaar)", value: sale.credit, sub: "Pay later bills", icon: BookOpen, tone: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40" },
    { label: "Total sale", value: sale.total, sub: `${(salesQ.data || []).length} bills`, icon: ArrowDownLeft, tone: "text-teal-700 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/40" },
  ];

  const diffTone =
    diffStatus === "balanced"
      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      : diffStatus === "short"
        ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        : "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";

  const checkLine = (label: string, expected: number, actual: number | null, setActual: (v: number | null) => void, icon: typeof CreditCard) => {
    const Icon = icon;
    const diff = actual === null ? null : round2(actual - expected);
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
          <span className="text-xs font-normal text-muted-foreground">expected {fmt(expected)}</span>
        </div>
        <Input
          type="number"
          inputMode="decimal"
          value={actual ?? ""}
          onChange={(e) => setActual(e.target.value === "" ? null : amountInput(e.target.value))}
          placeholder="As per app"
          className="h-9 w-32 text-right tabular-nums"
        />
        {diff !== null && (
          <p
            className={cn(
              "col-span-2 text-xs font-semibold",
              Math.abs(diff) < 1 ? "text-emerald-600" : "text-red-600",
            )}
          >
            {Math.abs(diff) < 1 ? "Matches" : `${diff > 0 ? "More" : "Less"} by ${fmt(Math.abs(diff))}`}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex w-full flex-col gap-3 bg-slate-50 px-2 py-2 dark:bg-background sm:px-3">
      <QuietRefreshBar
        queryKeys={[
          ["daily-tally-sales", orgId],
          ["daily-tally-vouchers", orgId],
          ["account-tally-snapshot", orgId],
        ]}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold leading-none tracking-tight text-teal-700">
            <Wallet className="h-5 w-5 shrink-0" />
            Account Tally
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Day close: count cash, hand over, deposit and carry the balance to tomorrow
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border bg-white shadow-sm dark:bg-card">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => moveDay(-1)} disabled={!canEditAnyDate} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2 text-sm font-semibold">
                  <CalendarIcon className="h-4 w-4" />
                  {format(selectedDate, "EEE, dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  disabled={(d) => d > new Date() || (!canEditAnyDate && !isToday(d))}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => moveDay(1)}
              disabled={!canEditAnyDate || isToday(selectedDate)}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {!isToday(selectedDate) && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => setSelectedDate(new Date())}>
              Today
            </Button>
          )}
          <span
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold",
              isClosed
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
            )}
          >
            {isClosed ? <Lock className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {isClosed ? "Day closed" : "Day open"}
          </span>
          <Button variant="outline" size="sm" className="h-9" onClick={handleRefresh}>
            <RefreshCw className={cn("mr-1.5 h-4 w-4", dataLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => handlePrint()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => orgNavigate("/daily-tally")}>
            Full day book
          </Button>
        </div>
      </div>

      {isClosed && savedMeta && (
        <p className="text-xs text-muted-foreground">
          Closed by <span className="font-semibold text-foreground">{savedMeta.closedBy}</span>
          {savedMeta.closedAt ? ` at ${format(parseISO(savedMeta.closedAt), "dd MMM, hh:mm a")}` : ""}. You can correct
          and close again.
        </p>
      )}

      {/* Today's accounts */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {statCards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-white p-3 shadow-sm dark:bg-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</span>
              <span className={cn("rounded-md p-1.5", c.bg)}>
                <c.icon className={cn("h-4 w-4", c.tone)} />
              </span>
            </div>
            {dataLoading && c.label !== "Opening cash" ? (
              <Skeleton className="mt-2 h-7 w-24" />
            ) : (
              <p className={cn("mt-1 text-xl font-bold tabular-nums", c.tone)}>{fmt(c.value)}</p>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 1. Cash book */}
        <section className="rounded-lg border bg-white p-4 shadow-sm dark:bg-card">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs text-white">1</span>
            Cash book
          </h2>
          <div className="flex items-center justify-between gap-2 border-b pb-2">
            <div>
              <p className="text-sm font-semibold">Opening cash</p>
              <p className="text-xs text-muted-foreground">{openingFromLabel}</p>
            </div>
            {editOpening ? (
              <Input
                type="number"
                inputMode="decimal"
                autoFocus
                value={openingCash || ""}
                onChange={(e) => setOpeningCash(amountInput(e.target.value))}
                onBlur={() => setEditOpening(false)}
                className="h-9 w-32 text-right font-semibold tabular-nums"
              />
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-base font-bold tabular-nums">{fmt(openingCash)}</span>
                {(canEditAnyDate || !previous) && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditOpening(true)} aria-label="Edit opening cash">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="divide-y text-sm">
            {cashBookRows.map((r) => (
              <div key={r.label} className={cn("flex items-center justify-between py-1.5", r.amount === 0 && "text-muted-foreground/70")}>
                <span className="flex items-center gap-1.5">
                  {r.sign > 0 ? (
                    <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" />
                  )}
                  {r.label}
                </span>
                <span className={cn("tabular-nums", r.amount !== 0 && (r.sign > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"))}>
                  {r.sign > 0 ? "+" : "−"} {fmt(r.amount)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-md bg-teal-50 px-3 py-2 dark:bg-teal-950/40">
            <span className="text-sm font-bold text-teal-800 dark:text-teal-300">Cash should be in drawer</span>
            <span className="text-lg font-bold tabular-nums text-teal-800 dark:text-teal-300">{fmt(expectedCash)}</span>
          </div>

          <h3 className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">Card &amp; UPI check</h3>
          <p className="text-xs text-muted-foreground">
            Enter today's total from the card machine settlement and the UPI / bank app to catch missed or wrong-mode bills.
          </p>
          <div className="divide-y">
            {checkLine("Card", expectedCard, actualCard, setActualCard, CreditCard)}
            {checkLine("UPI", expectedUpi, actualUpi, setActualUpi, Smartphone)}
          </div>
        </section>

        {/* 2. Count cash */}
        <section className="rounded-lg border bg-white p-4 shadow-sm dark:bg-card">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs text-white">2</span>
            Count cash (notes)
          </h2>
          <div className="space-y-1.5">
            {ACCOUNT_TALLY_NOTES.map((note, index) => (
              <div key={note} className="grid grid-cols-[72px_1fr_auto] items-center gap-2">
                <span className="rounded-md bg-emerald-50 px-2 py-1.5 text-center text-sm font-bold tabular-nums text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  ₹{note.toLocaleString("en-IN")}
                </span>
                <Input
                  ref={(el) => {
                    noteInputs.current[index] = el;
                  }}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={counts[note] || ""}
                  onChange={(e) => setNote(note, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      focusNext(index);
                    }
                  }}
                  placeholder="0"
                  aria-label={`Number of ₹${note} notes`}
                  className="h-9 text-center text-base font-semibold tabular-nums"
                />
                <span className="w-28 text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                  {fmt(note * (counts[note] || 0))}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[72px_1fr_auto] items-center gap-2 border-t pt-2">
              <span className="rounded-md bg-slate-100 px-2 py-1.5 text-center text-sm font-bold dark:bg-slate-800">Coins</span>
              <Input
                ref={(el) => {
                  noteInputs.current[ACCOUNT_TALLY_NOTES.length] = el;
                }}
                type="number"
                inputMode="decimal"
                min={0}
                value={coins || ""}
                onChange={(e) => setCoins(amountInput(e.target.value))}
                placeholder="₹ total"
                aria-label="Coins total in rupees"
                className="h-9 text-center text-base font-semibold tabular-nums"
              />
              <span className="w-28 text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">{fmt(coins)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <span className="text-sm font-bold">
              Cash counted <span className="font-normal text-muted-foreground">({pieces} notes)</span>
            </span>
            <span className="text-lg font-bold tabular-nums">{fmt(counted)}</span>
          </div>
          <div className={cn("mt-2 rounded-md border-l-4 px-3 py-2", diffTone)}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-bold">
                {diffStatus === "balanced" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {diffStatus === "balanced" ? "Cash matches" : diffStatus === "short" ? "Cash short" : "Cash excess"}
              </span>
              <span className="text-lg font-bold tabular-nums">
                {difference > 0 ? "+" : ""}
                {fmt(difference)}
              </span>
            </div>
            <p className="text-xs opacity-80">
              Counted {fmt(counted)} − should be {fmt(expectedCash)}
            </p>
          </div>
          {diffStatus !== "balanced" && (
            <div className="mt-2">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Reason for {diffStatus === "short" ? "shortage" : "excess"} (required)
              </label>
              <Input
                value={shortReason}
                onChange={(e) => setShortReason(e.target.value)}
                placeholder="e.g. change given wrong, expense not entered"
                className="h-9"
              />
            </div>
          )}
        </section>

        {/* 3. Close the day */}
        <section className="rounded-lg border bg-white p-4 shadow-sm dark:bg-card">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-xs text-white">3</span>
            Hand over &amp; close
          </h2>

          <div className="space-y-3">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                <UserRound className="h-4 w-4 text-indigo-600" /> Handover to owner
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={handover || ""}
                  onChange={(e) => setHandover(amountInput(e.target.value))}
                  placeholder="0"
                  className="h-10 flex-1 text-right text-base font-semibold tabular-nums"
                />
                <Input
                  value={handoverTo}
                  onChange={(e) => setHandoverTo(e.target.value)}
                  placeholder="Given to"
                  className="h-10 w-32"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                <Landmark className="h-4 w-4 text-sky-600" /> Deposit to bank
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={deposit || ""}
                onChange={(e) => setDeposit(amountInput(e.target.value))}
                placeholder="0"
                className="h-10 text-right text-base font-semibold tabular-nums"
              />
              <p className="mt-1 text-xs text-muted-foreground">Posted to your default bank in Bank Statement as a cash deposit.</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setHandover(Math.max(0, round2(counted - deposit - openingCash)))}
                disabled={counted <= 0}
              >
                Keep opening {fmt(openingCash)}, rest to owner
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setHandover(Math.max(0, round2(counted - deposit)))}
                disabled={counted <= 0}
              >
                All to owner
              </Button>
            </div>

            <div
              className={cn(
                "rounded-md border-2 px-3 py-2",
                closingCash < 0
                  ? "border-red-400 bg-red-50 dark:bg-red-950/40"
                  : "border-teal-500 bg-teal-50 dark:bg-teal-950/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Closing cash in drawer</span>
                <span className={cn("text-xl font-bold tabular-nums", closingCash < 0 ? "text-red-700" : "text-teal-800 dark:text-teal-300")}>
                  {fmt(closingCash)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {closingCash < 0
                  ? "Handover + deposit is more than the cash counted."
                  : `Counted ${fmt(counted)} − owner ${fmt(handover)} − bank ${fmt(deposit)}. Becomes next day's opening.`}
              </p>
            </div>

            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} />

            <Button
              onClick={handleClose}
              disabled={saveMutation.isPending || !orgId || dataLoading}
              className="h-11 w-full gap-2 bg-teal-700 text-base font-semibold text-white hover:bg-teal-800"
            >
              <Save className="h-5 w-5" />
              {saveMutation.isPending ? "Saving…" : isClosed ? "Update day close" : "Close the day"}
            </Button>
          </div>
        </section>
      </div>

      {/* Day register */}
      <section className="rounded-lg border bg-white shadow-sm dark:bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Day register (last 30 days)</h2>
          <span className="text-xs text-muted-foreground">Click a day to open it</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-900">
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Cash sale</TableHead>
                <TableHead className="text-right">Card</TableHead>
                <TableHead className="text-right">UPI</TableHead>
                <TableHead className="text-right">Should be</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Short / excess</TableHead>
                <TableHead className="text-right">To owner</TableHead>
                <TableHead className="text-right">To bank</TableHead>
                <TableHead className="text-right">Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registerQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={11}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ) : registerRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-6 text-center text-sm text-muted-foreground">
                    No day closed yet. Count the cash above and press Close the day.
                  </TableCell>
                </TableRow>
              ) : (
                registerRows.map(({ row, meta, openingMismatch }) => {
                  const diff = Number(row.difference_amount) || 0;
                  const status = tallyDifferenceStatus(diff);
                  return (
                    <TableRow
                      key={row.id}
                      className={cn("cursor-pointer", row.tally_date === dateStr && "bg-teal-50/70 dark:bg-teal-950/30")}
                      onClick={() => (canEditAnyDate || isToday(parseISO(row.tally_date))) && setSelectedDate(parseISO(row.tally_date))}
                    >
                      <TableCell className="whitespace-nowrap font-medium">{format(parseISO(row.tally_date), "dd MMM, EEE")}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", openingMismatch && "text-amber-700")} title={openingMismatch ? "Opening does not match the previous day's closing" : undefined}>
                        {fmt(Number(row.opening_cash) || 0)}
                        {openingMismatch && " *"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{meta ? fmt(meta.cashSale) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{meta ? fmt(meta.cardSale) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{meta ? fmt(meta.upiSale) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(Number(row.expected_cash) || 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(Number(row.physical_cash) || 0)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          status === "balanced" ? "text-emerald-700" : status === "short" ? "text-red-700" : "text-amber-700",
                        )}
                      >
                        {status === "balanced" ? "OK" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(Number(row.handover_to_owner) || 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(Number(row.deposit_to_bank) || 0)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(Number(row.leave_in_drawer) || 0)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {registerRows.some((r) => r.openingMismatch) && (
          <p className="border-t px-4 py-2 text-xs text-amber-700">
            * Opening differs from the day before's closing. Open that day and close it again to carry the right balance.
          </p>
        )}
      </section>

      {/* Print slip */}
      <div className="hidden">
        <div ref={printRef} className="p-6 font-sans text-[12px] text-black">
          <h1 className="text-center text-base font-bold">{settings?.business_name || currentOrganization?.name || ""}</h1>
          <p className="mb-3 text-center">Day close — {format(selectedDate, "dd MMM yyyy (EEEE)")}</p>
          <table className="w-full border-collapse">
            <tbody>
              {[
                ["Opening cash", openingCash],
                ["Cash sale", sale.cash],
                ["Card", sale.card],
                ["UPI", sale.upi],
                ["Credit (udhaar)", sale.credit],
                ["Total sale", sale.total],
                ["Cash in (all)", flows.cashIn],
                ["Cash out (all)", flows.cashOut],
                ["Cash should be in drawer", expectedCash],
                ["Cash counted", counted],
                ["Short / excess", difference],
                ["Handover to owner", handover],
                ["Deposit to bank", deposit],
                ["Closing cash in drawer", closingCash],
              ].map(([label, value]) => (
                <tr key={label as string} className="border-b border-dashed border-gray-400">
                  <td className="py-1">{label}</td>
                  <td className="py-1 text-right">{fmt(value as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 font-bold">Notes counted</p>
          <p>
            {ACCOUNT_TALLY_NOTES.filter((n) => counts[n] > 0)
              .map((n) => `₹${n} × ${counts[n]}`)
              .join(", ") || "—"}
            {coins > 0 ? `, coins ${fmt(coins)}` : ""}
          </p>
          {handoverTo && <p className="mt-1">Handed to: {handoverTo}</p>}
          {shortReason && <p className="mt-1">Reason: {shortReason}</p>}
          {notes && <p className="mt-1">Notes: {notes}</p>}
          <div className="mt-10 flex justify-between">
            <span>Cashier sign</span>
            <span>Owner sign</span>
          </div>
        </div>
      </div>
    </div>
  );
}
