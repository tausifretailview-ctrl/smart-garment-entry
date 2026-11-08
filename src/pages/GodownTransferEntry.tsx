import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeftRight, Barcode, ChevronLeft, Loader2, Printer, Save, Search, Trash2, Truck, Warehouse, X } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useIndustrialMode } from "@/hooks/useIndustrialMode";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { INSIGHTS_NEUTRAL_TH } from "@/components/business-insights/insightsLayout";
import { cn } from "@/lib/utils";
import { entryPageMainClass, entryPageSectionX, entryPageShellClass } from "@/lib/entryPageLayout";
import { searchTransferProducts, type TransferSearchResult } from "@/utils/stockTransferSearch";
import { fetchGodowns, formatGodownQty, formatGodownValue, godownTypeInfo, type Godown } from "@/utils/godowns";
import {
  addTransferLine,
  fetchVariantGodownQty,
  mergeGodownQty,
  qtyInGodown,
  roundQty,
  saveGodownTransfer,
  setTransferLineQty,
  transferLineProblems,
  transferTotals,
  type GodownQtyMap,
  type GodownTransferItem,
  type GodownTransferLine,
  type GodownTransport,
} from "@/utils/godownTransfer";
import { challanShopOf, printGodownTransferChallan } from "@/utils/godownTransferPrint";
import { useEwayBillOn } from "@/hooks/useEwayBillOn";
import { EWB_VALUE_LIMIT } from "@/utils/ewayBill";
import { GodownTransferEwayBillDialog } from "@/components/ewaybill/GodownTransferEwayBillDialog";

const TH = cn(INSIGHTS_NEUTRAL_TH, "h-11 !text-[13px]");
const todayYmd = () => format(new Date(), "yyyy-MM-dd");

const itemOf = (m: TransferSearchResult): GodownTransferItem => ({
  variant_id: m.id,
  product_name: m.product_name,
  brand: m.brand,
  size: m.size,
  color: m.color,
  barcode: m.barcode,
  uom: m.uom ?? null,
  rate: Number(m.pur_price) || 0,
});

/** Quantity box that lets people type 12.5 (keeps the text while typing). */
function QtyBox({ value, max, bad, onChange }: { value: number; max: number; bad: boolean; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.]/g, "");
        setText(t);
        const n = Number(t);
        if (t !== "" && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setText(String(value))}
      onFocus={(e) => e.target.select()}
      title={`Up to ${formatGodownQty(max)}`}
      className={cn("mx-auto h-8 w-[84px] text-center font-mono text-sm border-black/20", bad && "border-red-500 ring-1 ring-red-200")}
    />
  );
}

/**
 * Industrial mode, Phase 3 step 3b: move goods from one godown to another. Shop stock stays the
 * same; only the split between godowns changes. Saved as GT/yy-yy/n with a delivery challan.
 */
const GodownTransferEntry = () => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";
  const industrialOn = useIndustrialMode().enabled;
  const { data: settings } = useSettings();
  const { orgNavigate } = useOrgNavigation();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [date, setDate] = useState<string>(todayYmd);
  const [note, setNote] = useState("");
  const [transport, setTransport] = useState<GodownTransport>({});
  const [lines, setLines] = useState<GodownTransferLine[]>([]);
  const [qtyMap, setQtyMap] = useState<GodownQtyMap>({});
  const [scan, setScan] = useState("");
  const [matches, setMatches] = useState<TransferSearchResult[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState<{ id: string; move_no: string; move_date: string; total_qty: number; total_value: number } | null>(null);
  const [ewbFor, setEwbFor] = useState<{ id: string; move_no: string; move_date: string; total_value: number } | null>(null);
  const ewbOn = useEwayBillOn();
  const [printing, setPrinting] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const list = useQuery({
    queryKey: ["godowns", orgId],
    queryFn: () => fetchGodowns(orgId),
    enabled: !!orgId && industrialOn,
    staleTime: 60_000,
  });
  const godowns = useMemo(() => list.data?.godowns ?? [], [list.data]);
  const missingSql = !!list.data?.missingSql;
  const byId = useMemo(() => new Map(godowns.map((g) => [g.id, g])), [godowns]);
  const from = byId.get(fromId) ?? null;
  const to = byId.get(toId) ?? null;
  const fromName = from?.name ?? "the godown";

  // Start from the godown asked for (Godowns page "Move stock"), else Main; To = the first other open godown.
  useEffect(() => {
    if (!godowns.length || fromId) return;
    const asked = params.get("from");
    const start = godowns.find((g) => g.id === asked) ?? godowns.find((g) => g.godown_type === "main") ?? godowns[0];
    setFromId(start.id);
    const dest = godowns.find((g) => g.id !== start.id && g.is_active);
    if (dest) setToId(dest.id);
  }, [godowns, fromId, params]);

  const toOptions = useMemo(() => godowns.filter((g) => g.is_active && g.id !== fromId), [godowns, fromId]);

  const pickFrom = (id: string) => {
    setFromId(id);
    if (id === toId) setToId(godowns.find((g) => g.id !== id && g.is_active)?.id ?? "");
  };
  const canSwap = !!from && !!to && from.is_active;
  const swap = () => {
    if (!canSwap) return;
    setFromId(toId);
    setToId(fromId);
  };

  const problems = useMemo(() => transferLineProblems(lines, qtyMap, fromId, fromName), [lines, qtyMap, fromId, fromName]);
  const problemCount = Object.keys(problems).length;
  const totals = useMemo(() => transferTotals(lines), [lines]);

  const addItem = (m: TransferSearchResult, map: GodownQtyMap = qtyMap) => {
    const r = addTransferLine(lines, itemOf(m), qtyInGodown(map, m.id, fromId), fromName);
    if (!r.ok) {
      toast.error((r as { reason: string }).reason);
      return;
    }
    setLines(r.lines);
    setMatches([]);
    setScan("");
    scanRef.current?.focus();
  };

  /** Search like the Sale bill, then read how much of each result is in each godown. */
  const runSearch = async (term: string): Promise<{ rows: TransferSearchResult[]; map: GodownQtyMap }> => {
    const rows = await searchTransferProducts(orgId, term);
    const ids = rows.slice(0, 60).map((r) => r.id);
    const qty = await fetchVariantGodownQty(orgId, ids);
    setQtyMap((m) => mergeGodownQty(m, ids, qty));
    // The fresh numbers for these items, for an add straight after this search.
    return { rows: rows.slice(0, 60), map: mergeGodownQty(qtyMap, ids, qty) };
  };

  const sortByStock = (rows: TransferSearchResult[], map: GodownQtyMap) =>
    [...rows].sort((a, b) => Number(qtyInGodown(map, b.id, fromId) > 0) - Number(qtyInGodown(map, a.id, fromId) > 0));

  // Live search while typing (debounced; a slower old search never wins).
  const searchSeq = useRef(0);
  useEffect(() => {
    const term = scan.trim();
    const seq = ++searchSeq.current;
    if (term.length < 2 || !orgId || !fromId) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void runSearch(term)
        .then(({ rows, map }) => {
          if (seq !== searchSeq.current) return;
          setMatches(sortByStock(rows, map));
          setHighlight(0);
        })
        .catch((e: Error) => {
          if (seq === searchSeq.current) toast.error(e.message || "Search failed");
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, orgId, fromId]);

  // Enter: an exact barcode adds straight away (scanner), else the highlighted row.
  const handleEnter = async () => {
    const code = scan.trim();
    if (!code || !orgId || !fromId) return;
    const pick = matches[highlight];
    if (pick && !searching) {
      addItem(pick);
      return;
    }
    searchSeq.current += 1;
    setSearching(true);
    try {
      const { rows, map } = await runSearch(code);
      const exact = rows.filter((r) => (r.barcode ?? "").toLowerCase() === code.toLowerCase());
      if (exact.length === 1 || rows.length === 1) {
        addItem(exact[0] ?? rows[0], map);
        return;
      }
      if (rows.length === 0) {
        toast.error(`No item with stock found for "${code}"`);
        setMatches([]);
        return;
      }
      setMatches(sortByStock(rows, map));
      setHighlight(0);
    } catch (e) {
      toast.error((e as Error).message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const blocker = !industrialOn
    ? "Godown transfer is part of Industrial mode. Turn it on in Settings > Product."
    : missingSql
      ? "Run the Phase 3 step 3a SQL first: it adds the godown tables."
      : list.error
        ? list.error instanceof Error
          ? list.error.message
          : "Could not read the godowns"
        : !list.isLoading && godowns.filter((g) => g.is_active).length < 2
          ? "Add a second godown first (Inventory > Godowns), then move stock to it here."
          : null;

  const saveProblem = !fromId || !toId
    ? "Pick both godowns"
    : fromId === toId
      ? "From and To must be different godowns"
      : lines.length === 0
        ? "Add at least one item"
        : problemCount > 0
          ? `Fix ${problemCount} line${problemCount === 1 ? "" : "s"} marked in red`
          : date > todayYmd()
            ? "The date is in the future"
            : null;

  const saveMutation = useMutation({
    mutationFn: () => saveGodownTransfer({ organizationId: orgId, fromId, toId, date, lines, note, transport }),
    onSuccess: (res) => {
      setConfirmOpen(false);
      setLines([]);
      setNote("");
      setTransport({});
      setQtyMap({});
      setSaved({ id: res.id, move_no: res.move_no, move_date: date, total_qty: res.total_qty, total_value: res.total_value });
      for (const key of ["godown-summary", "godown-stock", "godown-transfers", "godown-transfer-stats"]) {
        void queryClient.invalidateQueries({ queryKey: [key, orgId] });
      }
    },
    onError: (e: Error) => {
      setConfirmOpen(false);
      toast.error(e.message || "Could not save the transfer");
    },
  });

  const shop = challanShopOf(settings, currentOrganization?.name ?? "");
  const printSaved = async (allCopies: boolean) => {
    if (!saved || printing) return;
    setPrinting(true);
    try {
      await printGodownTransferChallan({ moveId: saved.id, godowns, shop, allCopies });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not print the challan");
    } finally {
      setPrinting(false);
    }
  };

  const godownOption = (g: Godown) => (
    <SelectItem key={g.id} value={g.id}>
      <span className="font-semibold">{g.name}</span>
      <span className="ml-2 text-[11px] text-black/45">
        {godownTypeInfo(g.godown_type).label}
        {g.is_active ? "" : " · closed"}
      </span>
    </SelectItem>
  );

  return (
    <div className={cn(entryPageShellClass, "bg-white sale-order-readable min-h-0 relative")} data-entry-form>
      <header className="bg-white border-b-2 border-black shrink-0 flex flex-col">
        <div className={cn("entry-page-header-row h-[52px] flex items-center gap-2", entryPageSectionX)}>
          <div className="entry-page-header-leading flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => orgNavigate("/godown-transfers")}
              className="h-8 shrink-0 text-black hover:text-black hover:bg-black/5 border border-black/20 text-xs gap-1.5 font-bold"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Transfers</span>
            </Button>
            <div className="w-px h-6 bg-black/15 shrink-0" />
            <Warehouse className="h-5 w-5 text-teal-700 shrink-0" />
            <span className="text-black font-bold text-[15px] whitespace-nowrap hidden md:inline">Godown Transfer</span>
            <span className="border-2 border-black text-black font-mono text-[11px] font-bold px-3 py-1 rounded-md shrink-0">NEW</span>
          </div>
        </div>
      </header>

      {blocker || list.isLoading ? (
        <main className={entryPageMainClass}>
          <div className={cn("py-6 text-[15px] text-black/70 font-semibold flex items-center gap-2", entryPageSectionX)}>
            {list.isLoading && !blocker ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {blocker ?? "Loading godowns…"}
          </div>
        </main>
      ) : (
        <main className={entryPageMainClass}>
          <section className={cn("bg-white border-b border-black/10 py-2 shrink-0 shadow-sm space-y-2", entryPageSectionX)}>
            <div className="flex flex-wrap lg:flex-nowrap items-end gap-3">
              <div className="space-y-1 flex-[1.4] min-w-[180px]">
                <Label className="text-[13px] font-bold text-black">From godown</Label>
                <Select value={fromId} onValueChange={pickFrom}>
                  <SelectTrigger className="h-10 border-black/20 text-sm font-semibold">
                    <SelectValue placeholder="Choose godown" />
                  </SelectTrigger>
                  <SelectContent>{godowns.map(godownOption)}</SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={swap}
                disabled={!canSwap || lines.length > 0}
                title={lines.length > 0 ? "Clear the lines to swap the godowns" : "Swap From and To"}
                aria-label="Swap From and To"
                className="h-10 w-10 shrink-0 border-black/20"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
              <div className="space-y-1 flex-[1.4] min-w-[180px]">
                <Label className="text-[13px] font-bold text-black">To godown</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger className="h-10 border-black/20 text-sm font-semibold">
                    <SelectValue placeholder="Choose godown" />
                  </SelectTrigger>
                  <SelectContent>{toOptions.map(godownOption)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 w-[150px] shrink-0">
                <Label className="text-[13px] font-bold text-black">Date</Label>
                <Input type="date" value={date} max={todayYmd()} onChange={(e) => setDate(e.target.value || todayYmd())} className="h-10 text-sm border-black/20" />
              </div>
              <div className="space-y-1 flex-[1.6] min-w-[180px]">
                <Label className="text-[13px] font-bold text-black">Note</Label>
                <Input
                  placeholder="Why the goods are moving (optional)"
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                  className="no-uppercase h-10 text-sm border-black/20"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-1.5 pb-2 text-[12px] font-bold uppercase tracking-wide text-black/50">
                <Truck className="h-4 w-4" />
                Transport
              </div>
              <div className="space-y-1 w-[170px]">
                <Label className="text-[12px] font-semibold text-black/70">Vehicle no</Label>
                <Input
                  placeholder="MH04AB1234"
                  value={transport.vehicle_no ?? ""}
                  maxLength={15}
                  onChange={(e) => setTransport((t) => ({ ...t, vehicle_no: e.target.value.toUpperCase() }))}
                  className="h-9 font-mono text-sm border-black/20 uppercase"
                />
              </div>
              <div className="space-y-1 flex-1 min-w-[160px] max-w-[320px]">
                <Label className="text-[12px] font-semibold text-black/70">Transporter</Label>
                <Input
                  placeholder="Own vehicle / transporter name"
                  value={transport.transporter_name ?? ""}
                  maxLength={100}
                  onChange={(e) => setTransport((t) => ({ ...t, transporter_name: e.target.value }))}
                  className="no-uppercase h-9 text-sm border-black/20"
                />
              </div>
              <div className="space-y-1 w-[150px]">
                <Label className="text-[12px] font-semibold text-black/70">LR / doc no</Label>
                <Input
                  value={transport.lr_no ?? ""}
                  maxLength={30}
                  onChange={(e) => setTransport((t) => ({ ...t, lr_no: e.target.value }))}
                  className="h-9 text-sm border-black/20"
                />
              </div>
            </div>
          </section>

          <section className={cn("bg-neutral-50 border-b border-black/10 py-3 shrink-0", entryPageSectionX)}>
            <form
              className="flex items-center gap-3 flex-wrap"
              onSubmit={(e) => {
                e.preventDefault();
                void handleEnter();
              }}
            >
              <div className="relative flex-1 min-w-[280px]">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 pointer-events-none" />
                <Input
                  ref={scanRef}
                  type="text"
                  autoFocus
                  autoComplete="off"
                  placeholder={`SCAN BARCODE OR SEARCH ITEMS IN ${fromName.toUpperCase()}...`}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setScan("");
                      setMatches([]);
                    } else if (e.key === "ArrowDown" && matches.length > 0) {
                      e.preventDefault();
                      setHighlight((h) => Math.min(h + 1, matches.length - 1));
                    } else if (e.key === "ArrowUp" && matches.length > 0) {
                      e.preventDefault();
                      setHighlight((h) => Math.max(h - 1, 0));
                    }
                  }}
                  className="pl-10 h-10 text-sm bg-white border-black/20 uppercase font-semibold"
                />
                {scan.trim().length >= 2 && (matches.length > 0 || !searching) && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 border border-black/20 rounded-md bg-white shadow-lg max-h-80 overflow-auto">
                    {matches.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-black/50 text-center">No items with stock found</p>
                    ) : (
                      matches.map((m, i) => {
                        const avail = qtyInGodown(qtyMap, m.id, fromId);
                        const inTo = qtyInGodown(qtyMap, m.id, toId);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onMouseEnter={() => setHighlight(i)}
                            onClick={() => addItem(m)}
                            className={cn(
                              "w-full text-left px-3.5 py-2.5 border-b border-black/5 last:border-0 transition-colors",
                              i === highlight ? "bg-teal-50" : "hover:bg-teal-50",
                              avail <= 0 && "opacity-55",
                            )}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-bold text-black truncate">{m.product_name}</p>
                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                  {m.brand && (
                                    <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">{m.brand}</span>
                                  )}
                                  {m.color && m.color !== "-" && (
                                    <span className="text-[11px] bg-neutral-100 text-black/70 px-1.5 py-0.5 rounded">{m.color}</span>
                                  )}
                                  {m.size && (
                                    <span className="text-[11px] bg-neutral-100 text-black/70 px-1.5 py-0.5 rounded font-mono">Size: {m.size}</span>
                                  )}
                                  {m.barcode && <span className="text-xs text-black/50 font-mono ml-1">{m.barcode}</span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={cn("text-sm font-bold", avail > 0 ? "text-emerald-700" : "text-black/40")}>
                                  {formatGodownQty(Math.max(avail, 0))} {m.uom || ""} <span className="font-medium text-[11px]">in {fromName}</span>
                                </p>
                                {to ? (
                                  <p className="text-[11px] text-black/45">
                                    {formatGodownQty(inTo)} in {to.name}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
              <Button type="submit" className="h-10 px-5 bg-black text-white hover:bg-black/90 font-bold shrink-0">
                {searching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                Add
              </Button>
              <div className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg ml-auto shrink-0">
                <span className="text-[12px] font-bold opacity-80">Total Qty</span>
                <span className="font-black tabular-nums text-[16px]">{formatGodownQty(totals.qty)}</span>
              </div>
            </form>
          </section>

          <section className={cn("flex-1 min-h-0 py-2 overflow-hidden bg-neutral-100 relative w-full min-w-0", entryPageSectionX)}>
            <div className="h-full w-full min-w-0 overflow-x-auto overflow-y-auto isolate rounded-lg border border-black/15 shadow-sm bg-white">
              {lines.length > 0 ? (
                <Table className="table-fixed w-full min-w-[980px] border-separate border-spacing-0 erp-desktop-table erp-entry-lines-table">
                  <TableHeader className="sticky top-0 z-10 [&_tr]:border-none">
                    <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                      <TableHead className={cn(TH, "w-[48px] text-center")}>#</TableHead>
                      <TableHead className={cn(TH, "min-w-[220px]")}>Item</TableHead>
                      <TableHead className={cn(TH, "w-[100px] text-center")}>Colour</TableHead>
                      <TableHead className={cn(TH, "w-[80px] text-center")}>Size</TableHead>
                      <TableHead className={cn(TH, "w-[130px] text-center")}>Barcode</TableHead>
                      <TableHead className={cn(TH, "w-[120px] text-right")}>In {fromName}</TableHead>
                      <TableHead className={cn(TH, "w-[110px] text-center")}>Qty</TableHead>
                      <TableHead className={cn(TH, "w-[64px] text-center")}>Unit</TableHead>
                      <TableHead className={cn(TH, "w-[100px] text-right")}>Rate</TableHead>
                      <TableHead className={cn(TH, "w-[120px] text-right")}>Value</TableHead>
                      <TableHead className={cn(TH, "w-[48px]")} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, index) => {
                      const avail = qtyInGodown(qtyMap, l.variant_id, fromId);
                      const problem = problems[l.variant_id];
                      return (
                        <TableRow key={l.variant_id} className={cn("border-b border-slate-100 hover:bg-teal-50/60 even:bg-slate-50/80", problem && "!bg-red-50/70")}>
                          <TableCell className="text-center text-black/60 font-mono !text-[15px] py-1.5">{index + 1}</TableCell>
                          <TableCell className="py-1.5 leading-snug">
                            <div className="font-bold !text-[16px] text-black">{l.product_name}</div>
                            {problem ? <div className="text-[12px] font-semibold text-red-600">{problem}</div> : l.brand ? <div className="text-[12px] text-black/45">{l.brand}</div> : null}
                          </TableCell>
                          <TableCell className="text-center !text-[15px] font-medium text-black py-1.5">{l.color || "-"}</TableCell>
                          <TableCell className="text-center !text-[15px] font-mono font-semibold text-black py-1.5">{l.size || "-"}</TableCell>
                          <TableCell className="text-center !text-[14px] font-mono text-black/70 py-1.5">{l.barcode || "-"}</TableCell>
                          <TableCell className="text-right !text-[15px] font-mono text-black/70 py-1.5">{formatGodownQty(Math.max(avail, 0))}</TableCell>
                          <TableCell className="py-1">
                            <QtyBox
                              value={l.qty}
                              max={avail}
                              bad={!!problem}
                              onChange={(n) => setLines((ls) => setTransferLineQty(ls, l.variant_id, n))}
                            />
                          </TableCell>
                          <TableCell className="text-center !text-[13px] text-black/60 py-1.5">{l.uom || "-"}</TableCell>
                          <TableCell className="text-right !text-[15px] font-mono text-black py-1.5">{formatGodownValue(l.rate)}</TableCell>
                          <TableCell className="text-right font-bold text-[15px] font-mono tabular-nums text-black py-1.5">
                            {formatGodownValue(roundQty(l.qty) * l.rate)}
                          </TableCell>
                          <TableCell className="py-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-red-50"
                              aria-label={`Remove ${l.product_name}`}
                              onClick={() => setLines((ls) => ls.filter((x) => x.variant_id !== l.variant_id))}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-black/45">
                  <ArrowLeftRight className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm font-semibold">Scan a barcode or type an item name to add what is moving</p>
                  <p className="text-xs mt-1">Shop stock stays the same; only the stock in each godown changes</p>
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      <footer className="entry-page-footer sale-order-footer shrink-0 relative z-40">
        <div className="bg-white text-black border-t-2 border-black w-full">
          <div className="flex items-center justify-between px-4 py-3 gap-4 w-full min-w-0 flex-wrap">
            <div className="flex items-center gap-3 shrink-0 text-[13px] font-bold text-black/70">
              {lines.length === 0 ? (
                <span>No items added yet</span>
              ) : (
                <span>
                  {lines.length} item{lines.length !== 1 ? "s" : ""} from {fromName} to {to?.name ?? "…"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0 ml-auto">
              <div className="hidden md:flex flex-col gap-0.5 pl-4 border-l border-black/15">
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Items</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{lines.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3 min-w-[120px]">
                  <span className="text-[12px] uppercase tracking-wide font-extrabold text-black/70">Total Qty</span>
                  <span className="text-[16px] font-extrabold tabular-nums">{formatGodownQty(totals.qty)}</span>
                </div>
              </div>
              <div className="pl-4 border-l-2 border-black flex flex-col items-end shrink-0">
                <span className="text-[13px] font-extrabold uppercase tracking-wide text-black underline underline-offset-2">Value at cost</span>
                <span className="text-[36px] font-black font-mono tabular-nums leading-none text-black tracking-tighter">
                  {formatGodownValue(totals.value)}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-neutral-100 border-t border-black/10 flex flex-wrap items-center px-4 py-2.5 gap-x-3 gap-y-1.5">
          <div className={cn("text-[13px] font-semibold flex-1 min-w-0", lines.length > 0 && saveProblem ? "text-red-700" : "text-black/60")}>
            {lines.length > 0 && saveProblem ? saveProblem : "Saved as a godown transfer with a delivery challan to print."}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              disabled={lines.length === 0}
              onClick={() => setLines([])}
              className="h-9 px-3 text-[13px] font-bold text-red-700 hover:bg-red-50 gap-1.5 border border-red-200"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
            <Button
              size="sm"
              disabled={!!blocker || !!saveProblem || saveMutation.isPending}
              onClick={() => setConfirmOpen(true)}
              className="h-9 px-5 text-[14px] bg-teal-700 text-white hover:bg-teal-800 font-extrabold gap-1.5"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveMutation.isPending ? "Saving…" : "Save Transfer"}
            </Button>
          </div>
        </div>
      </footer>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !saveMutation.isPending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move {formatGodownQty(totals.qty)} from {fromName} to {to?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lines.length} item{lines.length === 1 ? "" : "s"} worth {formatGodownValue(totals.value)} at cost. The stock leaves {fromName} and
              shows in {to?.name} now. Shop stock stays the same. You can cancel the transfer later while the goods are still in {to?.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveMutation.isPending}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={saveMutation.isPending}
              className="bg-teal-700 hover:bg-teal-800"
              onClick={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
            >
              {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Move stock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!saved} onOpenChange={(o) => !o && setSaved(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer {saved?.move_no} saved</AlertDialogTitle>
            <AlertDialogDescription>
              {formatGodownQty(saved?.total_qty ?? 0)} moved. Print the delivery challan to send with the goods: one copy, or three copies
              (consignee, transporter, your file) as GST Rule 55 asks.
              {ewbOn && saved && saved.total_value > EWB_VALUE_LIMIT
                ? ` Worth ${formatGodownValue(saved.total_value)}: make the e-way bill before the vehicle leaves.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              onClick={() => {
                setSaved(null);
                setTimeout(() => scanRef.current?.focus(), 50);
              }}
            >
              New transfer
            </AlertDialogCancel>
            {ewbOn && saved && saved.total_value > EWB_VALUE_LIMIT ? (
              <Button
                variant="outline"
                className="border-teal-200 text-teal-700 hover:bg-teal-50"
                onClick={() => {
                  setEwbFor({ id: saved.id, move_no: saved.move_no, move_date: saved.move_date, total_value: saved.total_value });
                  setSaved(null);
                }}
              >
                <Truck className="mr-1.5 h-4 w-4" />
                E-way bill
              </Button>
            ) : null}
            <Button variant="outline" disabled={printing} onClick={() => void printSaved(true)}>
              3 copies
            </Button>
            <Button className="bg-teal-700 hover:bg-teal-800" disabled={printing} onClick={() => void printSaved(false)}>
              {printing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
              Print challan
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {orgId ? (
        <GodownTransferEwayBillDialog
          open={!!ewbFor}
          onOpenChange={(o) => {
            if (!o) {
              setEwbFor(null);
              setTimeout(() => scanRef.current?.focus(), 50);
            }
          }}
          organizationId={orgId}
          move={ewbFor}
          ewayBill={null}
          missingSql={false}
          onChanged={() => undefined}
        />
      ) : null}
    </div>
  );
};

export default GodownTransferEntry;
