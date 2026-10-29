import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, endOfQuarter, format, startOfMonth, startOfQuarter, subMonths } from "date-fns";
import { AlertTriangle, ArrowLeft, Calculator, Info, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadGstAnalysis } from "@/utils/gstAnalysisData";
import {
  computeGstSetOff,
  docAtRate,
  emptyHeads,
  gstr3bDueDate,
  netByRate,
  sumByRate,
  sumRows,
  totalTax,
  type GstDocRow,
  type GstHeads,
  type GstRateRow,
} from "@/utils/gstAnalysis";

// Same look as the Manufacturing page: coloured totals, dark table headers.
const CARD = "rounded-lg border border-slate-200 bg-white shadow-sm";
const CARD_TITLE = "text-base font-bold text-slate-800 leading-tight flex items-center gap-2";
const TABLE = "[&_td]:px-3 [&_td]:py-2 [&_td]:text-sm";
const THEAD = "sticky top-0 z-10 [&_tr]:border-none";
const HEAD_ROW = "bg-slate-800 hover:bg-slate-800 border-none";
const TH = "h-10 text-xs font-bold uppercase tracking-wide text-white bg-slate-800 px-3 py-2.5 border-none shadow-none whitespace-nowrap";
const ROW = "h-10 border-b border-slate-100 hover:bg-sky-50/70 even:bg-slate-50/80";
const TOTAL_ROW = "bg-slate-100 hover:bg-slate-100 font-bold border-t-2 border-slate-300";
const NUM = "text-right tabular-nums whitespace-nowrap";

const KPI_CARD = "rounded-lg bg-gradient-to-br px-3 py-2 min-w-0 shadow-sm";
const KPI_LABEL = "text-xs font-medium text-white/80 leading-none";
const KPI_VALUE = "text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate";
const KPI_SUB = "text-[10px] text-white/70 mt-0.5 truncate";

const TAB_PANEL = "flex-1 min-h-0 overflow-y-auto mt-0 tab-scroll-stable data-[state=inactive]:hidden space-y-2";
const DOC_ROW_LIMIT = 500;

const inr = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const count = (n: number) => (Number(n) || 0).toLocaleString("en-IN");
const headsLine = (h: GstHeads) => `CGST ${inr(h.cgst)} · SGST ${inr(h.sgst)} · IGST ${inr(h.igst)}`;
const subtractHeads = (a: GstHeads, b: GstHeads): GstHeads => ({
  igst: a.igst - b.igst,
  cgst: a.cgst - b.cgst,
  sgst: a.sgst - b.sgst,
});
const addHeads = (a: GstHeads, b: GstHeads): GstHeads => ({
  igst: a.igst + b.igst,
  cgst: a.cgst + b.cgst,
  sgst: a.sgst + b.sgst,
});
const showDate = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ymd;
};

type PeriodType = "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-fy" | "last-fy" | "custom";

function periodRange(value: PeriodType, today = new Date()): { from: Date; to: Date } | null {
  const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  switch (value) {
    case "this-month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last-month": {
      const d = subMonths(today, 1);
      return { from: startOfMonth(d), to: endOfMonth(d) };
    }
    case "this-quarter":
      return { from: startOfQuarter(today), to: endOfQuarter(today) };
    case "last-quarter": {
      const d = subMonths(today, 3);
      return { from: startOfQuarter(d), to: endOfQuarter(d) };
    }
    case "this-fy":
      return { from: new Date(fyStartYear, 3, 1), to: new Date(fyStartYear + 1, 2, 31) };
    case "last-fy":
      return { from: new Date(fyStartYear - 1, 3, 1), to: new Date(fyStartYear, 2, 31) };
    default:
      return null;
  }
}

/** The single calendar month the range covers exactly, if any. */
function wholeMonth(fromYmd: string, toYmd: string): Date | null {
  const from = new Date(`${fromYmd}T00:00:00`);
  if (Number.isNaN(from.getTime())) return null;
  const start = startOfMonth(from);
  if (format(start, "yyyy-MM-dd") !== fromYmd) return null;
  return format(endOfMonth(start), "yyyy-MM-dd") === toYmd ? start : null;
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={cn(KPI_CARD, tone)}>
      <p className={KPI_LABEL}>{label}</p>
      <p className={KPI_VALUE}>{value}</p>
      {sub ? <p className={KPI_SUB}>{sub}</p> : null}
    </div>
  );
}

function Section({ title, description, right, children }: { title: string; description?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card className={CARD}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 border-b border-slate-100 px-4 py-3">
        <div className="space-y-1 min-w-0">
          <CardTitle className={CARD_TITLE}>{title}</CardTitle>
          {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
        </div>
        {right}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

/** Bills vs returns, rate by rate, with the net. */
function RateTable({
  bills,
  returns,
  billLabel,
  returnLabel,
  netLabel,
}: {
  bills: GstRateRow[];
  returns: GstRateRow[];
  billLabel: string;
  returnLabel: string;
  netLabel: string;
}) {
  const net = netByRate(bills, returns);
  const byRate = (rows: GstRateRow[], rate: number) => rows.find((r) => r.rate === rate);
  const t = { bills: sumRows(bills), returns: sumRows(returns), net: sumRows(net) };
  if (net.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No GST bills in this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table className={TABLE}>
        <TableHeader className={THEAD}>
          <TableRow className={HEAD_ROW}>
            <TableHead className={TH}>GST rate</TableHead>
            <TableHead className={cn(TH, "text-right")}>{billLabel} taxable</TableHead>
            <TableHead className={cn(TH, "text-right")}>{billLabel} GST</TableHead>
            <TableHead className={cn(TH, "text-right")}>{returnLabel} taxable</TableHead>
            <TableHead className={cn(TH, "text-right")}>{returnLabel} GST</TableHead>
            <TableHead className={cn(TH, "text-right")}>Net taxable</TableHead>
            <TableHead className={cn(TH, "text-right")}>CGST</TableHead>
            <TableHead className={cn(TH, "text-right")}>SGST</TableHead>
            <TableHead className={cn(TH, "text-right")}>IGST</TableHead>
            <TableHead className={cn(TH, "text-right")}>{netLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {net.map((n) => {
            const b = byRate(bills, n.rate);
            const r = byRate(returns, n.rate);
            return (
              <TableRow key={n.rate} className={ROW}>
                <TableCell className="font-semibold">{n.rate}%</TableCell>
                <TableCell className={NUM}>{inr(b?.taxable || 0)}</TableCell>
                <TableCell className={NUM}>{inr(b ? totalTax(b) : 0)}</TableCell>
                <TableCell className={cn(NUM, "text-rose-700")}>{inr(r?.taxable || 0)}</TableCell>
                <TableCell className={cn(NUM, "text-rose-700")}>{inr(r ? totalTax(r) : 0)}</TableCell>
                <TableCell className={NUM}>{inr(n.taxable)}</TableCell>
                <TableCell className={NUM}>{inr(n.cgst)}</TableCell>
                <TableCell className={NUM}>{inr(n.sgst)}</TableCell>
                <TableCell className={NUM}>{inr(n.igst)}</TableCell>
                <TableCell className={cn(NUM, "font-bold")}>{inr(totalTax(n))}</TableCell>
              </TableRow>
            );
          })}
          <TableRow className={TOTAL_ROW}>
            <TableCell>Total</TableCell>
            <TableCell className={NUM}>{inr(t.bills.taxable)}</TableCell>
            <TableCell className={NUM}>{inr(totalTax(t.bills))}</TableCell>
            <TableCell className={cn(NUM, "text-rose-700")}>{inr(t.returns.taxable)}</TableCell>
            <TableCell className={cn(NUM, "text-rose-700")}>{inr(totalTax(t.returns))}</TableCell>
            <TableCell className={NUM}>{inr(t.net.taxable)}</TableCell>
            <TableCell className={NUM}>{inr(t.net.cgst)}</TableCell>
            <TableCell className={NUM}>{inr(t.net.sgst)}</TableCell>
            <TableCell className={NUM}>{inr(t.net.igst)}</TableCell>
            <TableCell className={NUM}>{inr(totalTax(t.net))}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

/** Bill-wise list with a search box. */
function DocTable({
  docs,
  numberLabel,
  partyLabel,
  itcColumn,
  isItcEligible,
}: {
  docs: GstDocRow[];
  numberLabel: string;
  partyLabel: string;
  itcColumn?: boolean;
  isItcEligible?: (d: GstDocRow) => boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => [d.number, d.party, d.gstin].some((v) => (v || "").toLowerCase().includes(q)));
  }, [docs, search]);
  const t = sumRows(filtered);
  const shown = filtered.slice(0, DOC_ROW_LIMIT);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <Badge variant="secondary" className="tabular-nums">
          {count(filtered.length)} {filtered.length === 1 ? "entry" : "entries"}
        </Badge>
        <Input
          className="w-full sm:w-72 h-9"
          placeholder={`Search ${numberLabel.toLowerCase()}, ${partyLabel.toLowerCase()}, GSTIN`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search bills"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nothing to show.</p>
      ) : (
        <div className="overflow-x-auto max-h-[60vh]">
          <Table className={TABLE}>
            <TableHeader className={THEAD}>
              <TableRow className={HEAD_ROW}>
                <TableHead className={TH}>Date</TableHead>
                <TableHead className={TH}>{numberLabel}</TableHead>
                <TableHead className={TH}>{partyLabel}</TableHead>
                <TableHead className={TH}>GSTIN</TableHead>
                <TableHead className={TH}>Rates</TableHead>
                {itcColumn ? <TableHead className={TH}>ITC</TableHead> : null}
                <TableHead className={cn(TH, "text-right")}>Taxable</TableHead>
                <TableHead className={cn(TH, "text-right")}>CGST</TableHead>
                <TableHead className={cn(TH, "text-right")}>SGST</TableHead>
                <TableHead className={cn(TH, "text-right")}>IGST</TableHead>
                <TableHead className={cn(TH, "text-right")}>Total GST</TableHead>
                <TableHead className={cn(TH, "text-right")}>Bill amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((d) => {
                const eligible = isItcEligible ? isItcEligible(d) : true;
                return (
                  <TableRow key={d.id} className={ROW}>
                    <TableCell className="whitespace-nowrap">{showDate(d.date)}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{d.number || "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{d.party || "—"}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {d.gstin || <span className="text-muted-foreground">Unregistered</span>}
                      {d.interState ? <Badge variant="outline" className="ml-1 text-[10px]">Other state</Badge> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{d.rates.map((r) => `${r.rate}%`).join(", ") || "—"}</TableCell>
                    {itcColumn ? (
                      <TableCell>
                        {eligible ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">Claim</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">No GSTIN</Badge>
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell className={NUM}>{inr(d.taxable)}</TableCell>
                    <TableCell className={NUM}>{inr(d.cgst)}</TableCell>
                    <TableCell className={NUM}>{inr(d.sgst)}</TableCell>
                    <TableCell className={NUM}>{inr(d.igst)}</TableCell>
                    <TableCell className={cn(NUM, "font-semibold")}>{inr(totalTax(d))}</TableCell>
                    <TableCell className={NUM}>{inr(d.billValue)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className={TOTAL_ROW}>
                <TableCell colSpan={itcColumn ? 6 : 5}>Total ({count(filtered.length)})</TableCell>
                <TableCell className={NUM}>{inr(t.taxable)}</TableCell>
                <TableCell className={NUM}>{inr(t.cgst)}</TableCell>
                <TableCell className={NUM}>{inr(t.sgst)}</TableCell>
                <TableCell className={NUM}>{inr(t.igst)}</TableCell>
                <TableCell className={NUM}>{inr(totalTax(t))}</TableCell>
                <TableCell className={NUM}>{inr(filtered.reduce((s, d) => s + d.billValue, 0))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
      {filtered.length > DOC_ROW_LIMIT ? (
        <p className="text-xs text-muted-foreground px-4 pb-3">
          Showing the first {count(DOC_ROW_LIMIT)} of {count(filtered.length)}. The total row counts all of them. Search to narrow the list.
        </p>
      ) : null}
    </div>
  );
}

const DOC_TAB_LIST = "flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 px-4 pt-3";
const DOC_TAB_TRIGGER =
  "h-8 px-3 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-600 data-[state=active]:bg-teal-700 data-[state=active]:text-white data-[state=active]:border-teal-700";

const TAB_ITEMS = [
  { id: "sale", label: "Sale GST" },
  { id: "purchase", label: "Purchase GST (ITC)" },
  { id: "final", label: "Final GST Payable" },
] as const;

const GSTAnalysis = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const orgId = currentOrganization?.id;

  const [periodType, setPeriodType] = useState<PeriodType>("this-month");
  const [fromDate, setFromDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [rate, setRate] = useState("all");
  const [countNoGstinItc, setCountNoGstinItc] = useState(false);
  const [tab, setTab] = useState("final");
  const [opening, setOpening] = useState({ igst: "", cgst: "", sgst: "" });

  const onPeriod = (value: PeriodType) => {
    setPeriodType(value);
    const r = periodRange(value);
    if (!r) return;
    setFromDate(format(r.from, "yyyy-MM-dd"));
    setToDate(format(r.to, "yyyy-MM-dd"));
  };

  const validRange = !!fromDate && !!toDate && fromDate <= toDate;
  const query = useQuery({
    queryKey: ["gst-analysis", orgId, fromDate, toDate],
    queryFn: () => loadGstAnalysis(orgId!, fromDate, toDate),
    enabled: !!orgId && validRange,
    staleTime: 60_000,
  });
  const data = query.data;

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else orgNavigate("/reports");
  };

  const a = useMemo(() => {
    const sales = data?.sales ?? [];
    const saleReturns = data?.saleReturns ?? [];
    const itcOk = (d: GstDocRow) => countNoGstinItc || d.registered;
    const purchases = data?.purchases ?? [];
    const purchaseReturns = data?.purchaseReturns ?? [];
    const claimPurchases = purchases.filter(itcOk);
    const claimPurchaseReturns = purchaseReturns.filter(itcOk);
    const blocked = purchases.filter((d) => !itcOk(d) && totalTax(d) > 0);

    const rateFilter = rate === "all" ? null : Number(rate);
    const atRate = (docs: GstDocRow[]) =>
      docs.map((d) => docAtRate(d, rateFilter)).filter((d): d is GstDocRow => d != null);

    const rates = new Set<number>();
    [sales, saleReturns, purchases, purchaseReturns].forEach((list) => list.forEach((d) => d.rates.forEach((r) => rates.add(r.rate))));

    // Final payable always uses every rate: tax is set off by head, not by rate.
    const salesTotal = sumRows(sales);
    const saleReturnsTotal = sumRows(saleReturns);
    const liability = subtractHeads(salesTotal, saleReturnsTotal);
    const itcBills = sumRows(claimPurchases);
    const itcReversed = sumRows(claimPurchaseReturns);
    const openingHeads: GstHeads = {
      igst: Math.max(0, Number(opening.igst) || 0),
      cgst: Math.max(0, Number(opening.cgst) || 0),
      sgst: Math.max(0, Number(opening.sgst) || 0),
    };
    const netItc = subtractHeads(itcBills, itcReversed);
    const credit = addHeads(netItc, openingHeads);
    const setOff = computeGstSetOff(liability, credit);
    const nilRated = sumByRate(sales).filter((r) => r.rate === 0).reduce((s, r) => s + r.taxable, 0)
      - sumByRate(saleReturns).filter((r) => r.rate === 0).reduce((s, r) => s + r.taxable, 0);

    return {
      rateList: [...rates].sort((x, y) => x - y),
      sale: { bills: atRate(sales), returns: atRate(saleReturns) },
      purchase: {
        bills: atRate(purchases),
        returns: atRate(purchaseReturns),
        claimBills: atRate(claimPurchases),
        claimReturns: atRate(claimPurchaseReturns),
        blocked: atRate(blocked),
      },
      itcOk,
      final: {
        salesTotal,
        saleReturnsTotal,
        liability,
        itcBills,
        itcReversed,
        openingHeads,
        netItc,
        credit,
        setOff,
        nilRated,
        outputByRate: netByRate(sumByRate(sales), sumByRate(saleReturns)),
        itcByRate: netByRate(sumByRate(claimPurchases), sumByRate(claimPurchaseReturns)),
        claimPurchaseCount: claimPurchases.length,
      },
    };
  }, [data, rate, countNoGstinItc, opening]);

  const month = wholeMonth(fromDate, toDate);
  const due = month ? gstr3bDueDate(toDate) : null;
  const cashTotal = totalTax(a.final.setOff.cash);
  const carryTotal = totalTax(a.final.setOff.carryForward);
  const rateNote = rate === "all" ? "All rates" : `${rate}% only`;

  const saleSum = { bills: sumRows(a.sale.bills), returns: sumRows(a.sale.returns) };
  const saleNet = subtractHeads(saleSum.bills, saleSum.returns);
  const purSum = {
    bills: sumRows(a.purchase.claimBills),
    returns: sumRows(a.purchase.claimReturns),
    blocked: sumRows(a.purchase.blocked),
  };
  const purNet = subtractHeads(purSum.bills, purSum.returns);
  const b2bCount = a.sale.bills.filter((d) => d.registered).length;

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" className="h-9 px-3 text-sm shrink-0" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <Calculator className="h-5 w-5 shrink-0" />
                GST Analysis
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                Sale GST − sale returns − purchase ITC = GST to pay (GSTR-3B) · DC bills not included
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => query.refetch()} disabled={query.isFetching || !validRange}>
            <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Period</Label>
              <Select value={periodType} onValueChange={(v) => onPeriod(v as PeriodType)}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-month">This month</SelectItem>
                  <SelectItem value="last-month">Last month</SelectItem>
                  <SelectItem value="this-quarter">This quarter</SelectItem>
                  <SelectItem value="last-quarter">Last quarter</SelectItem>
                  <SelectItem value="this-fy">This financial year</SelectItem>
                  <SelectItem value="last-fy">Last financial year</SelectItem>
                  <SelectItem value="custom">Custom dates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gst-analysis-from" className="text-xs text-slate-500">From</Label>
              <Input id="gst-analysis-from" type="date" className="h-9 w-40" value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPeriodType("custom"); }} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gst-analysis-to" className="text-xs text-slate-500">To</Label>
              <Input id="gst-analysis-to" type="date" className="h-9 w-40" value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPeriodType("custom"); }} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">GST rate</Label>
              <Select value={rate} onValueChange={setRate}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rates</SelectItem>
                  {a.rateList.map((r) => (
                    <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 h-9">
              <Switch id="gst-analysis-no-gstin" checked={countNoGstinItc} onCheckedChange={setCountNoGstinItc} />
              <Label htmlFor="gst-analysis-no-gstin" className="text-xs text-slate-600 cursor-pointer">
                Count ITC on purchases without supplier GSTIN
              </Label>
            </div>
          </div>
          {!validRange ? <p className="text-xs text-destructive mt-2">From date must be on or before To date.</p> : null}
        </div>

        {query.error ? (
          <Card className={CARD}>
            <CardContent className="py-8 text-center space-y-1">
              <p className="font-medium text-destructive">Could not load GST data</p>
              <p className="text-sm text-muted-foreground">{(query.error as Error)?.message || String(query.error)}</p>
            </CardContent>
          </Card>
        ) : query.isLoading || !data ? (
          <Card className={CARD}>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading sale and purchase bills…</CardContent>
          </Card>
        ) : (
          <>
            {!data.shopGstin ? (
              <div className="shrink-0 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                Shop GSTIN is not set in Settings, so every bill is taken as within the state (CGST + SGST). Add the GSTIN to see IGST for other-state parties.
              </div>
            ) : null}
            <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0 gap-2">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 shrink-0">
                {TAB_ITEMS.map(({ id, label }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className={cn(
                      "h-9 px-4 text-sm font-semibold rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm",
                      "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:border-slate-700",
                    )}
                  >
                    {label}
                  </TabsTrigger>
                ))}
                <span className="ml-auto self-center text-xs text-muted-foreground">
                  DC left out: {count(data.dcLeftOut.sales)} sale · {count(data.dcLeftOut.saleReturns)} sale return ·{" "}
                  {count(data.dcLeftOut.purchases)} purchase · {count(data.dcLeftOut.purchaseReturns)} purchase return
                </span>
              </TabsList>

              {/* ───────── Sale ───────── */}
              <TabsContent value="sale" className={TAB_PANEL}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <Kpi tone="from-blue-500 to-blue-600" label={`Sale taxable value · ${rateNote}`} value={inr(saleSum.bills.taxable)}
                    sub={`${count(a.sale.bills.length)} bills · ${count(b2bCount)} B2B · ${count(a.sale.bills.length - b2bCount)} B2C`} />
                  <Kpi tone="from-indigo-500 to-indigo-600" label="GST on sales" value={inr(totalTax(saleSum.bills))} sub={headsLine(saleSum.bills)} />
                  <Kpi tone="from-rose-500 to-rose-600" label="Less: GST on sale returns" value={inr(totalTax(saleSum.returns))}
                    sub={`${count(a.sale.returns.length)} credit notes · taxable ${inr(saleSum.returns.taxable)}`} />
                  <Kpi tone="from-emerald-500 to-emerald-600" label="Net output GST" value={inr(totalTax(saleNet))} sub={headsLine(saleNet)} />
                </div>
                <Section title="Rate-wise sale GST" description="Taxable value is after bill discount. Sale returns (credit notes) come off at the same rate.">
                  <RateTable bills={sumByRate(a.sale.bills)} returns={sumByRate(a.sale.returns)}
                    billLabel="Sale" returnLabel="Return" netLabel="Net GST" />
                </Section>
                <Section title="Bill-wise detail">
                  <Tabs defaultValue="bills">
                    <TabsList className={DOC_TAB_LIST}>
                      <TabsTrigger value="bills" className={DOC_TAB_TRIGGER}>Sale bills ({count(a.sale.bills.length)})</TabsTrigger>
                      <TabsTrigger value="returns" className={DOC_TAB_TRIGGER}>Sale returns ({count(a.sale.returns.length)})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="bills" className="mt-0">
                      <DocTable docs={a.sale.bills} numberLabel="Bill no" partyLabel="Customer" />
                    </TabsContent>
                    <TabsContent value="returns" className="mt-0">
                      <DocTable docs={a.sale.returns} numberLabel="Return no" partyLabel="Customer" />
                    </TabsContent>
                  </Tabs>
                </Section>
              </TabsContent>

              {/* ───────── Purchase ───────── */}
              <TabsContent value="purchase" className={TAB_PANEL}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <Kpi tone="from-blue-500 to-blue-600" label={`Purchase taxable value · ${rateNote}`} value={inr(purSum.bills.taxable)}
                    sub={`${count(a.purchase.claimBills.length)} of ${count(a.purchase.bills.length)} bills counted for ITC`} />
                  <Kpi tone="from-indigo-500 to-indigo-600" label="ITC on purchase bills" value={inr(totalTax(purSum.bills))} sub={headsLine(purSum.bills)} />
                  <Kpi tone="from-rose-500 to-rose-600" label="Less: ITC on purchase returns" value={inr(totalTax(purSum.returns))}
                    sub={`${count(a.purchase.claimReturns.length)} debit notes · taxable ${inr(purSum.returns.taxable)}`} />
                  <Kpi tone="from-emerald-500 to-emerald-600" label="Net ITC" value={inr(totalTax(purNet))} sub={headsLine(purNet)} />
                </div>
                {a.purchase.blocked.length > 0 ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {inr(totalTax(purSum.blocked))} GST on {count(a.purchase.blocked.length)} purchase bill(s) is not counted as ITC because the supplier has no
                      15-digit GSTIN in Supplier Master. ITC can only be claimed on a tax invoice from a registered supplier. Add the GSTIN, or turn on
                      "Count ITC on purchases without supplier GSTIN" above if those suppliers are registered.
                    </span>
                  </div>
                ) : null}
                <Section title="Rate-wise input tax credit (ITC)" description="GST on purchase bills counted for ITC, less GST on purchase returns (debit notes).">
                  <RateTable bills={sumByRate(a.purchase.claimBills)} returns={sumByRate(a.purchase.claimReturns)}
                    billLabel="Purchase" returnLabel="Return" netLabel="Net ITC" />
                </Section>
                <Section title="Bill-wise detail">
                  <Tabs defaultValue="bills">
                    <TabsList className={DOC_TAB_LIST}>
                      <TabsTrigger value="bills" className={DOC_TAB_TRIGGER}>Purchase bills ({count(a.purchase.bills.length)})</TabsTrigger>
                      <TabsTrigger value="returns" className={DOC_TAB_TRIGGER}>Purchase returns ({count(a.purchase.returns.length)})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="bills" className="mt-0">
                      <DocTable docs={a.purchase.bills} numberLabel="Supplier bill no" partyLabel="Supplier" itcColumn isItcEligible={a.itcOk} />
                    </TabsContent>
                    <TabsContent value="returns" className="mt-0">
                      <DocTable docs={a.purchase.returns} numberLabel="Return no" partyLabel="Supplier" itcColumn isItcEligible={a.itcOk} />
                    </TabsContent>
                  </Tabs>
                </Section>
              </TabsContent>

              {/* ───────── Final ───────── */}
              <TabsContent value="final" className={TAB_PANEL}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <Kpi tone="from-blue-500 to-blue-600" label="Output GST (sales − returns)" value={inr(totalTax(a.final.liability))}
                    sub={headsLine(a.final.liability)} />
                  <Kpi tone="from-indigo-500 to-indigo-600" label="ITC available" value={inr(totalTax(a.final.credit))}
                    sub={totalTax(a.final.openingHeads) > 0 ? `incl. ${inr(totalTax(a.final.openingHeads))} opening balance` : headsLine(a.final.credit)} />
                  <Kpi tone={cashTotal > 0 ? "from-red-500 to-red-600" : "from-emerald-500 to-emerald-600"} label="GST to pay in cash"
                    value={inr(cashTotal)} sub={due ? `Pay and file GSTR-3B by ${format(due, "dd MMM yyyy")}` : headsLine(a.final.setOff.cash)} />
                  <Kpi tone="from-violet-500 to-violet-600" label="ITC carried forward" value={inr(carryTotal)} sub={headsLine(a.final.setOff.carryForward)} />
                </div>
                {due && month ? (
                  <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      GSTR-3B for {format(month, "MMMM yyyy")} (monthly filer) is due by <b>{format(due, "dd MMM yyyy")}</b>. Quarterly (QRMP) filers pay by the
                      25th of the next month with PMT-06 and file by the 22nd / 24th after the quarter. Late payment carries 18% a year interest.
                    </span>
                  </div>
                ) : null}

                <Section title="How the tax is paid (GSTR-3B table 6.1)"
                  description="ITC is set off in the order the law sets: IGST credit first, then CGST and SGST credit. CGST credit cannot pay SGST, and SGST credit cannot pay CGST.">
                  <div className="overflow-x-auto">
                    <Table className={TABLE}>
                      <TableHeader className={THEAD}>
                        <TableRow className={HEAD_ROW}>
                          <TableHead className={TH}>Tax</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Tax payable</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Paid by IGST credit</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Paid by CGST credit</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Paid by SGST credit</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Pay in cash</TableHead>
                          <TableHead className={cn(TH, "text-right")}>ITC left</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(["igst", "cgst", "sgst"] as const).map((h) => (
                          <TableRow key={h} className={ROW}>
                            <TableCell className="font-semibold uppercase">{h}</TableCell>
                            <TableCell className={NUM}>{inr(a.final.setOff.liability[h])}</TableCell>
                            <TableCell className={NUM}>{inr(a.final.setOff.usedIgst[h])}</TableCell>
                            <TableCell className={NUM}>{inr(a.final.setOff.usedCgst[h])}</TableCell>
                            <TableCell className={NUM}>{inr(a.final.setOff.usedSgst[h])}</TableCell>
                            <TableCell className={cn(NUM, "font-bold", a.final.setOff.cash[h] > 0 ? "text-red-700" : "text-emerald-700")}>
                              {inr(a.final.setOff.cash[h])}
                            </TableCell>
                            <TableCell className={NUM}>{inr(a.final.setOff.carryForward[h])}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className={TOTAL_ROW}>
                          <TableCell>Total</TableCell>
                          <TableCell className={NUM}>{inr(totalTax(a.final.setOff.liability))}</TableCell>
                          <TableCell className={NUM}>{inr(totalTax(a.final.setOff.usedIgst))}</TableCell>
                          <TableCell className={NUM}>{inr(totalTax(a.final.setOff.usedCgst))}</TableCell>
                          <TableCell className={NUM}>{inr(totalTax(a.final.setOff.usedSgst))}</TableCell>
                          <TableCell className={cn(NUM, "text-red-700")}>{inr(cashTotal)}</TableCell>
                          <TableCell className={NUM}>{inr(carryTotal)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </Section>

                <Section title="GSTR-3B summary" description="All GST rates. Use these figures to check what your accountant files.">
                  <div className="overflow-x-auto">
                    <Table className={TABLE}>
                      <TableHeader className={THEAD}>
                        <TableRow className={HEAD_ROW}>
                          <TableHead className={TH}>Particulars</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Taxable value</TableHead>
                          <TableHead className={cn(TH, "text-right")}>IGST</TableHead>
                          <TableHead className={cn(TH, "text-right")}>CGST</TableHead>
                          <TableHead className={cn(TH, "text-right")}>SGST</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Total tax</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { label: "Sales (outward taxable supplies)", t: a.final.salesTotal.taxable, h: a.final.salesTotal },
                          { label: "Less: sale returns / credit notes", t: -a.final.saleReturnsTotal.taxable, h: subtractHeads(emptyHeads(), a.final.saleReturnsTotal), neg: true },
                          { label: "3.1(a) Net outward taxable supplies", t: a.final.salesTotal.taxable - a.final.saleReturnsTotal.taxable, h: a.final.liability, bold: true },
                          { label: "3.1(c) of which nil-rated (0%) sales", t: a.final.nilRated, h: emptyHeads() },
                          { label: `ITC on purchase bills (${count(a.final.claimPurchaseCount)} bills)`, t: a.final.itcBills.taxable, h: a.final.itcBills },
                          { label: "Less: purchase returns / debit notes", t: -a.final.itcReversed.taxable, h: subtractHeads(emptyHeads(), a.final.itcReversed), neg: true },
                          { label: "Opening ITC balance (entered below)", t: null, h: a.final.openingHeads },
                          { label: "4(C) Net ITC available", t: null, h: a.final.credit, bold: true },
                          { label: "6.1 GST to pay in cash", t: null, h: a.final.setOff.cash, bold: true },
                        ].map((r) => (
                          <TableRow key={r.label} className={cn(ROW, r.bold && "font-bold bg-slate-100")}>
                            <TableCell>{r.label}</TableCell>
                            <TableCell className={cn(NUM, r.neg && "text-rose-700")}>{r.t == null ? "—" : inr(r.t)}</TableCell>
                            <TableCell className={cn(NUM, r.neg && "text-rose-700")}>{inr(r.h.igst)}</TableCell>
                            <TableCell className={cn(NUM, r.neg && "text-rose-700")}>{inr(r.h.cgst)}</TableCell>
                            <TableCell className={cn(NUM, r.neg && "text-rose-700")}>{inr(r.h.sgst)}</TableCell>
                            <TableCell className={cn(NUM, r.neg && "text-rose-700")}>{inr(totalTax(r.h))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Section>

                <Section title="Rate-wise: output GST vs ITC" description="For analysis only. The law sets off tax by head (IGST / CGST / SGST), not by rate.">
                  <div className="overflow-x-auto">
                    <Table className={TABLE}>
                      <TableHeader className={THEAD}>
                        <TableRow className={HEAD_ROW}>
                          <TableHead className={TH}>GST rate</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Net sale taxable</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Output GST</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Net purchase taxable</TableHead>
                          <TableHead className={cn(TH, "text-right")}>ITC</TableHead>
                          <TableHead className={cn(TH, "text-right")}>Output − ITC</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {a.rateList.map((r) => {
                          const out = a.final.outputByRate.find((x) => x.rate === r);
                          const itc = a.final.itcByRate.find((x) => x.rate === r);
                          const diff = (out ? totalTax(out) : 0) - (itc ? totalTax(itc) : 0);
                          return (
                            <TableRow key={r} className={ROW}>
                              <TableCell className="font-semibold">{r}%</TableCell>
                              <TableCell className={NUM}>{inr(out?.taxable || 0)}</TableCell>
                              <TableCell className={NUM}>{inr(out ? totalTax(out) : 0)}</TableCell>
                              <TableCell className={NUM}>{inr(itc?.taxable || 0)}</TableCell>
                              <TableCell className={NUM}>{inr(itc ? totalTax(itc) : 0)}</TableCell>
                              <TableCell className={cn(NUM, "font-bold", diff > 0 ? "text-red-700" : "text-emerald-700")}>{inr(diff)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </Section>

                <Section title="Opening ITC balance"
                  description="ITC left over from last month, as shown in the Electronic Credit Ledger on the GST portal. It is not saved; enter it each time.">
                  <div className="flex flex-wrap gap-3 p-4">
                    {(["igst", "cgst", "sgst"] as const).map((h) => (
                      <div key={h} className="space-y-1">
                        <Label htmlFor={`gst-opening-${h}`} className="text-xs uppercase text-slate-500">{h}</Label>
                        <Input id={`gst-opening-${h}`} type="number" min={0} step="0.01" inputMode="decimal" className="h-9 w-40"
                          value={opening[h]} placeholder="0.00"
                          onChange={(e) => setOpening((o) => ({ ...o, [h]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="How this is worked out">
                  <ul className="list-disc space-y-1 py-3 pl-8 pr-4 text-xs text-slate-600">
                    <li>Sale GST comes from every saved sale bill (POS and Sales Invoice) in the period, at each line's GST rate, after the bill discount. Cancelled and deleted bills are left out.</li>
                    <li>Sale returns lower the GST by the credit note amount at the same rate, whatever the refund mode (cash, credit note or exchange).</li>
                    <li>ITC comes from purchase bills by bill date, after the bill discount, only where the supplier has a 15-digit GSTIN (unless you turn that check off). Purchase returns lower the ITC.</li>
                    <li>DC (No GST) purchases, DC purchase returns and DC sale lines are never counted. A bill with both GST and DC items counts only its GST items.</li>
                    <li>IGST is used when the party's GSTIN state is not your state; customers without a GSTIN are taken as within the state (CGST + SGST half each).</li>
                    <li>Not covered: reverse charge, cess, GST on freight / other charges on purchase bills, ITC blocked under section 17(5), and whether the supplier filed GSTR-1 (the portal allows only ITC that shows in your GSTR-2B). Check GSTR-2B before you pay.</li>
                  </ul>
                </Section>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
};

export default GSTAnalysis;
