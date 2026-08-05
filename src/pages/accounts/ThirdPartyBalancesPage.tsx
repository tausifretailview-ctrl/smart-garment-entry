import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  BookOpen,
  Loader2,
  RefreshCw,
  Search,
  Scale,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";
import { calculateGlAccountLedger } from "@/utils/accountingReportUtils";
import {
  fetchThirdPartyBalances,
  summarizeThirdPartyBalances,
  thirdPartyBalanceDirection,
  type ThirdPartyBalanceRow,
} from "@/utils/accounting/thirdPartyBalances";

type DirectionFilter = "all" | "Dr" | "Cr";

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAmt = (n: number) => inr.format(n);

/**
 * Summary + per-account ledger for third-party COA masters (not customers/suppliers).
 * Reads chart_of_accounts + journal_lines / journal_entries only.
 */
export default function ThirdPartyBalancesPage() {
  const { currentOrganization } = useOrganization();
  const { getOrgPath } = useOrgNavigation();
  const orgId = currentOrganization?.id;

  const [search, setSearch] = useState("");
  const [showZero, setShowZero] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [ledgerRow, setLedgerRow] = useState<ThirdPartyBalanceRow | null>(null);
  const [ledgerFrom, setLedgerFrom] = useState("2000-01-01");
  const [ledgerTo, setLedgerTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const {
    data: rows = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["third-party-balances", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: () => fetchThirdPartyBalances(orgId!),
  });

  const orgTotals = useMemo(() => summarizeThirdPartyBalances(rows), [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showZero && Math.abs(row.signedBalance) < 0.005) return false;
      const dir = thirdPartyBalanceDirection(row.signedBalance);
      if (directionFilter === "Dr" && dir !== "Dr") return false;
      if (directionFilter === "Cr" && dir !== "Cr") return false;
      if (!q) return true;
      return (
        row.accountName.toLowerCase().includes(q) ||
        row.accountCode.toLowerCase().includes(q) ||
        (row.accountGroup || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, showZero, directionFilter]);

  const ledgerQuery = useQuery({
    queryKey: [
      "third-party-balance-ledger",
      orgId,
      ledgerRow?.accountId,
      ledgerFrom,
      ledgerTo,
    ],
    enabled: !!orgId && !!ledgerRow?.accountId,
    queryFn: () =>
      calculateGlAccountLedger(orgId!, ledgerRow!.accountId, ledgerFrom, ledgerTo, null),
  });

  useEffect(() => {
    if (!ledgerRow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setLedgerRow(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ledgerRow]);

  const emptyMessage = (() => {
    if (rows.length === 0) {
      return "No third-party accounts yet — create one on Third-party Pay/Receive.";
    }
    if (filteredRows.length === 0 && !showZero && rows.every((r) => Math.abs(r.signedBalance) < 0.005)) {
      return "All third-party accounts are settled at ₹0. Turn on “Show zero balances” to list them.";
    }
    return "No accounts match the current search / Dr·Cr filter.";
  })();

  return (
    <div className="third-party-balances-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
              <Scale className="h-5 w-5 shrink-0" />
              Third-party Balances
            </h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {isFetching && !isLoading ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Refreshing…
                </span>
              ) : (
                <>
                  {rows.length.toLocaleString("en-IN")} accounts
                  {!showZero ? " · zero balances hidden" : ""}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-9 text-sm" asChild>
              <Link to={getOrgPath("/third-party-entry")}>
                <BookOpen className="h-4 w-4 mr-1.5" />
                Post entry
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="h-9 text-sm"
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full shrink-0">
          <div className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Total Dr</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(orgTotals.totalDr)}
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Total Cr</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(orgTotals.totalCr)}
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 px-3 py-2 min-w-0 shadow-sm">
            <p className="text-xs font-medium text-white/80 leading-none">Net (Dr − Cr)</p>
            <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">
              ₹{fmtAmt(Math.abs(orgTotals.net))}
              <span className="text-xs font-semibold ml-1 opacity-90">
                {orgTotals.net > 0.005 ? "Dr" : orgTotals.net < -0.005 ? "Cr" : ""}
              </span>
            </p>
          </div>
        </div>

        <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
            <div className="relative flex-1 min-w-[200px] max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, name, or group…"
                className="pl-10 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch id="show-zero-tp" checked={showZero} onCheckedChange={setShowZero} />
              <Label htmlFor="show-zero-tp" className="text-sm font-normal cursor-pointer whitespace-nowrap">
                Show zero balances
              </Label>
            </div>
            <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 shrink-0">
              {(
                [
                  { value: "all" as const, label: "All" },
                  { value: "Dr" as const, label: "Dr" },
                  { value: "Cr" as const, label: "Cr" },
                ] as const
              ).map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  variant={directionFilter === value ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 px-3 text-sm font-semibold",
                    directionFilter === value
                      ? value === "Dr"
                        ? "bg-red-600 hover:bg-red-600 text-white"
                        : value === "Cr"
                          ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                          : "bg-slate-700 hover:bg-slate-700 text-white"
                      : "text-slate-600",
                  )}
                  onClick={() => setDirectionFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground tabular-nums ml-auto">
              {filteredRows.length.toLocaleString("en-IN")} matching
            </span>
          </div>

          {error ? (
            <div className="m-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              Failed to load balances: {(error as Error).message}
            </div>
          ) : isLoading ? (
            <div className="p-2">
              <ReportSkeleton />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-white tab-scroll-stable">
              <Table className="[&_td]:px-4 [&_th]:px-4">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                    <TableHead className="h-10 w-[56px] text-xs font-bold uppercase tracking-wide text-white">
                      Sr.
                    </TableHead>
                    <TableHead className="h-10 text-xs font-bold uppercase tracking-wide text-white">
                      Account
                    </TableHead>
                    <TableHead className="h-10 text-xs font-bold uppercase tracking-wide text-white">
                      Group
                    </TableHead>
                    <TableHead className="h-10 text-right text-xs font-bold uppercase tracking-wide text-white w-[150px]">
                      Balance
                    </TableHead>
                    <TableHead className="h-10 text-center text-xs font-bold uppercase tracking-wide text-white w-[72px]">
                      Dr/Cr
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-base text-muted-foreground px-6">
                        {emptyMessage}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row, index) => {
                      const direction = thirdPartyBalanceDirection(row.signedBalance);
                      const displayAmount = Math.abs(row.signedBalance);
                      const isDr = direction === "Dr";
                      const isCr = direction === "Cr";

                      return (
                        <TableRow
                          key={row.accountId}
                          className="h-11 cursor-pointer hover:bg-teal-50/80 dark:hover:bg-teal-950/20"
                          onClick={() => {
                            setLedgerFrom("2000-01-01");
                            setLedgerTo(format(new Date(), "yyyy-MM-dd"));
                            setLedgerRow(row);
                          }}
                          title="Open account ledger"
                        >
                          <TableCell className="py-2.5 text-sm tabular-nums text-muted-foreground font-medium">
                            {index + 1}
                          </TableCell>
                          <TableCell className="py-2.5 text-base font-medium">
                            <span className="font-mono text-sm text-muted-foreground mr-2">
                              {row.accountCode}
                            </span>
                            {row.accountName}
                          </TableCell>
                          <TableCell className="py-2.5 text-sm text-muted-foreground">
                            {row.accountGroup || "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "py-2.5 text-right tabular-nums text-base font-semibold",
                              isDr && "text-red-600 dark:text-red-400",
                              isCr && "text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {fmtAmt(displayAmount)}
                          </TableCell>
                          <TableCell className="py-2.5 text-center">
                            <span
                              className={cn(
                                "inline-flex min-w-[2.75rem] justify-center rounded px-2 py-0.5 text-xs font-bold",
                                isDr && "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
                                isCr &&
                                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
                                !isDr && !isCr && "bg-muted text-muted-foreground",
                              )}
                            >
                              {direction}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!ledgerRow} onOpenChange={(open) => !open && setLedgerRow(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="pr-6">
              {ledgerRow ? `${ledgerRow.accountCode} — ${ledgerRow.accountName}` : "Ledger"}
            </DialogTitle>
            <DialogDescription>
              Running balance from journal lines only
              {ledgerRow ? (
                <>
                  {" "}
                  · summary balance ₹{fmtAmt(Math.abs(ledgerRow.signedBalance))}{" "}
                  {thirdPartyBalanceDirection(ledgerRow.signedBalance)}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-3 shrink-0">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                className="h-9 w-[150px]"
                value={ledgerFrom}
                onChange={(e) => setLedgerFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                className="h-9 w-[150px]"
                value={ledgerTo}
                onChange={(e) => setLedgerTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto border rounded-md">
            {ledgerQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading ledger…
              </div>
            ) : ledgerQuery.error ? (
              <p className="p-4 text-sm text-destructive">
                {(ledgerQuery.error as Error).message || "Failed to load ledger"}
              </p>
            ) : (ledgerQuery.data?.length || 0) === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No journal lines in this date range.</p>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Narration</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerQuery.data!.map((line) => (
                    <TableRow key={`${line.journalLineId || line.lineSeq}-${line.entryDate}`}>
                      <TableCell className="whitespace-nowrap tabular-nums">{line.entryDate}</TableCell>
                      <TableCell className="max-w-[240px] truncate" title={line.description || ""}>
                        {line.description || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {line.debitAmount ? fmtAmt(line.debitAmount) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {line.creditAmount ? fmtAmt(line.creditAmount) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-medium">
                        {fmtAmt(line.runningBalance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
