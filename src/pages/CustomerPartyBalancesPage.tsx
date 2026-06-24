import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, RefreshCw, ChevronLeft, ChevronRight, ArrowLeft, Loader2 } from "lucide-react";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";
import { fetchAllCustomerPartyBalances, fetchCustomerPhoneMap } from "@/utils/fetchAllRows";
import {
  CUSTOMER_PARTY_BALANCES_PAGE_SIZE,
  clampPartyBalancePage,
  isPartyBalanceSettled,
  matchesPartyBalanceSearch,
  partyBalanceDirection,
  partyBalanceDisplayAmount,
  partyBalanceTotalPages,
  slicePartyBalancePage,
} from "@/utils/customerPartyBalanceDisplay";

export type CustomerPartyBalanceRow = {
  customer_id: string;
  customer_name: string;
  phone?: string;
  signed_balance: number;
  advance_available: number;
  direction: string;
  net_position: number;
  total_dr: number;
  total_cr: number;
  net_receivable: number;
};

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtAmt(n: number) {
  return inr.format(n);
}

export default function CustomerPartyBalancesPage() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const inTabCache = useTabCacheLayout();
  const sharedShell = useSharedAppShell();
  const [search, setSearch] = useState("");
  const [showSettled, setShowSettled] = useState(false);
  const [page, setPage] = useState(1);

  const orgId = currentOrganization?.id;

  const { data: rows = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["customer-party-balances", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const [partyRows, phoneMap] = await Promise.all([
        fetchAllCustomerPartyBalances(orgId!),
        fetchCustomerPhoneMap(orgId!),
      ]);
      return partyRows.map((row) => ({
        ...row,
        phone: phoneMap.get(row.customer_id) ?? "",
      }));
    },
  });

  const orgTotals = useMemo(() => {
    const first = rows[0];
    return {
      totalDr: Number(first?.total_dr ?? 0),
      totalCr: Number(first?.total_cr ?? 0),
      netReceivable: Number(first?.net_receivable ?? 0),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!showSettled && isPartyBalanceSettled(row.signed_balance)) {
        return false;
      }
      return matchesPartyBalanceSearch(row, search);
    });
  }, [rows, search, showSettled]);

  const totalPages = partyBalanceTotalPages(filteredRows.length);
  const currentPage = clampPartyBalancePage(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [search, showSettled]);

  const paginatedRows = useMemo(
    () => slicePartyBalancePage(filteredRows, currentPage),
    [filteredRows, currentPage],
  );

  const pageStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * CUSTOMER_PARTY_BALANCES_PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * CUSTOMER_PARTY_BALANCES_PAGE_SIZE, filteredRows.length);

  const openCustomerLedger = (customerId: string) => {
    orgNavigate(`/customer-ledger-report?customer=${customerId}`);
  };

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select an organization to view customer balances.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "customer-party-balances-dashboard flex flex-col bg-slate-50 px-1.5 sm:px-2 md:px-3 py-1.5 min-h-0 overflow-hidden",
        inTabCache || sharedShell ? "h-full w-full" : "h-[calc(100vh-3.5rem)]",
      )}
    >
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-1.5">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs shrink-0"
              onClick={() => orgNavigate("/accounts")}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Accounts
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-teal-700 tracking-tight leading-none flex items-center gap-1.5">
                <Users className="h-4 w-4 shrink-0" />
                Customer Balances
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {isFetching && !isLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Refreshing…
                  </span>
                ) : (
                  <>
                    {rows.length.toLocaleString("en-IN")} parties loaded
                    {!showSettled ? " · settled hidden" : ""}
                  </>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 text-xs shrink-0"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Org totals — compact strip */}
        <div className="grid grid-cols-3 gap-1.5 w-full shrink-0">
          <div className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-2.5 py-1.5 min-w-0 shadow-sm">
            <p className="text-[10px] font-medium text-white/80 leading-none">Total Receivable (Dr)</p>
            <p className="text-sm sm:text-base font-black text-white tabular-nums leading-tight mt-0.5 truncate">
              ₹{fmtAmt(Math.abs(orgTotals.totalDr))}
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 px-2.5 py-1.5 min-w-0 shadow-sm">
            <p className="text-[10px] font-medium text-white/80 leading-none">Total Credit (Cr)</p>
            <p className="text-sm sm:text-base font-black text-white tabular-nums leading-tight mt-0.5 truncate">
              ₹{fmtAmt(Math.abs(orgTotals.totalCr))}
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 px-2.5 py-1.5 min-w-0 shadow-sm">
            <p className="text-[10px] font-medium text-white/80 leading-none">Net Receivable</p>
            <p className="text-sm sm:text-base font-black text-white tabular-nums leading-tight mt-0.5 truncate">
              ₹{fmtAmt(Math.abs(orgTotals.netReceivable))}
            </p>
          </div>
        </div>

        {/* Party list — primary focus */}
        <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-slate-100 bg-white shrink-0">
            <div className="relative flex-1 min-w-[180px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="pl-8 h-8 text-sm border-slate-200 bg-slate-50 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch id="show-settled" checked={showSettled} onCheckedChange={setShowSettled} />
              <Label htmlFor="show-settled" className="text-xs font-normal cursor-pointer whitespace-nowrap">
                Show settled (₹0)
              </Label>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums ml-auto">
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
            <>
              <div className="flex-1 min-h-0 overflow-hidden bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                      <TableHead className="h-8 w-[52px] text-[11px] font-bold uppercase tracking-wide text-white">
                        Sr.
                      </TableHead>
                      <TableHead className="h-8 text-[11px] font-bold uppercase tracking-wide text-white">
                        Party Name
                      </TableHead>
                      <TableHead className="h-8 text-right text-[11px] font-bold uppercase tracking-wide text-white w-[130px]">
                        Amount
                      </TableHead>
                      <TableHead className="h-8 text-center text-[11px] font-bold uppercase tracking-wide text-white w-[64px]">
                        Dr/Cr
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-16 text-center text-sm text-muted-foreground">
                          {rows.length === 0 ? "No customers found." : "No matching customers."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRows.map((row, index) => {
                        const direction = partyBalanceDirection(row);
                        const displayAmount = partyBalanceDisplayAmount(row.signed_balance);
                        const isDr = direction === "Dr";
                        const isCr = direction === "Cr";
                        const srNo = pageStart + index;

                        return (
                          <TableRow
                            key={row.customer_id}
                            className="h-7 cursor-pointer hover:bg-teal-50/80 dark:hover:bg-teal-950/20"
                            onClick={() => openCustomerLedger(row.customer_id)}
                            title="Open Customer Ledger"
                          >
                            <TableCell className="py-0 text-xs tabular-nums text-muted-foreground font-medium">
                              {srNo}
                            </TableCell>
                            <TableCell className="py-0 text-sm font-medium truncate max-w-[1px]">
                              {row.customer_name}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "py-0 text-right tabular-nums text-sm font-semibold",
                                isDr && "text-red-600 dark:text-red-400",
                                isCr && "text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              {fmtAmt(displayAmount)}
                            </TableCell>
                            <TableCell className="py-0 text-center">
                              <span
                                className={cn(
                                  "inline-flex min-w-[2.25rem] justify-center rounded px-1.5 py-0 text-[10px] font-bold",
                                  isDr && "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
                                  isCr && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
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

              {filteredRows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 border-t border-slate-100 bg-white shrink-0">
                  <p className="text-xs text-slate-500 tabular-nums">
                    Showing {pageStart.toLocaleString("en-IN")}–{pageEnd.toLocaleString("en-IN")} of{" "}
                    {filteredRows.length.toLocaleString("en-IN")}
                    <span className="hidden sm:inline text-slate-400">
                      {" "}
                      · {CUSTOMER_PARTY_BALANCES_PAGE_SIZE} per page
                    </span>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-7 text-xs px-2.5 border-slate-200"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
                      Previous
                    </Button>
                    <span className="text-xs text-slate-600 font-medium tabular-nums px-0.5">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-7 text-xs px-2.5 border-slate-200"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
