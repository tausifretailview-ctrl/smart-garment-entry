import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { fetchCustomerPartyBalancesPayload } from "@/utils/customerPartyBalanceSnapshot";
import {
  clampPartyBalancePage,
  partyBalanceTotalPages,
  slicePartyBalancePage,
} from "@/utils/customerPartyBalanceDisplay";
import { cn } from "@/lib/utils";

/** Tally-style list density — ~50–80 parties per screen page. */
const CUSTOMER_OUTSTANDING_PAGE_SIZE = 60;

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtAmt(n: number) {
  return inr.format(Math.abs(Number(n) || 0));
}

/**
 * Tally-style customer outstanding: Sr No, Customer Name, Total Balance + grand total.
 * Same numbers as Customer Balances via fetchCustomerPartyBalancesPayload.
 */
export default function CustomerOutstandingReport() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const orgId = currentOrganization?.id;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const serverSearch = debouncedSearch.length >= 2 ? debouncedSearch : null;

  const { data: payload, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["customer-outstanding-report", orgId, serverSearch ?? ""],
    queryFn: () => fetchCustomerPartyBalancesPayload(orgId!, { search: serverSearch }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const outstandingRows = useMemo(() => {
    const all = payload?.rows ?? [];
    return all
      .filter((r) => Math.round(Number(r.net_position) || 0) !== 0)
      .sort((a, b) => Number(b.net_position) - Number(a.net_position));
  }, [payload]);

  const searchTerm = search.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!searchTerm || serverSearch) return outstandingRows;
    return outstandingRows.filter((r) => {
      const name = (r.customer_name ?? "").toLowerCase();
      const phone = (r.phone ?? "").toLowerCase();
      return name.includes(searchTerm) || phone.includes(searchTerm);
    });
  }, [outstandingRows, searchTerm, serverSearch]);

  useEffect(() => {
    setPage(1);
  }, [search, serverSearch]);

  const matchingCount = filteredRows.length;
  const totalPages = partyBalanceTotalPages(matchingCount, CUSTOMER_OUTSTANDING_PAGE_SIZE);
  const currentPage = clampPartyBalancePage(page, totalPages);
  const paginatedRows = useMemo(
    () => slicePartyBalancePage(filteredRows, currentPage, CUSTOMER_OUTSTANDING_PAGE_SIZE),
    [filteredRows, currentPage],
  );

  const pageStart = matchingCount === 0 ? 0 : (currentPage - 1) * CUSTOMER_OUTSTANDING_PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * CUSTOMER_OUTSTANDING_PAGE_SIZE, matchingCount);

  const grandTotal = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (Number(r.net_position) || 0), 0),
    [filteredRows],
  );

  const balancesComplete = payload?.partyBalancesComplete !== false;

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Select an organization to view customer outstanding.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "customer-party-balances-workspace customer-party-balances-dashboard flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full",
      )}
    >
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={() => orgNavigate("/reports")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Reports
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
                <ClipboardList className="h-5 w-5 shrink-0" />
                Customer Outstanding
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {isLoading
                  ? "Loading balances…"
                  : `${matchingCount.toLocaleString("en-IN")} parties with balance${
                      searchTerm ? " (filtered)" : ""
                    }`}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm shrink-0"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {!balancesComplete && (
          <Alert className="py-2 px-3 border-amber-200 bg-amber-50 text-amber-900 shrink-0">
            <AlertDescription className="text-xs leading-snug">
              Full balances are still loading — search by name or phone (2+ letters) for targeted results, or refresh
              in a moment.
            </AlertDescription>
          </Alert>
        )}

        <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
            <div className="relative flex-1 min-w-[200px] max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone (2+ chars)…"
                className="pl-10 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white w-full"
              />
            </div>
            <span className="text-sm text-muted-foreground tabular-nums ml-auto shrink-0">
              Grand total:{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums font-mono",
                  grandTotal >= 0 ? "text-red-600" : "text-emerald-600",
                )}
              >
                ₹{fmtAmt(grandTotal)} {grandTotal >= 0 ? "Dr" : "Cr"}
              </span>
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-white tab-scroll-stable">
            <Table className="w-full table-fixed [&_td]:px-4 [&_th]:px-4">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-slate-800 hover:bg-slate-800 border-none">
                  <TableHead className="h-10 w-[4.5rem] text-xs font-bold uppercase tracking-wide text-white">
                    Sr No
                  </TableHead>
                  <TableHead className="h-10 text-xs font-bold uppercase tracking-wide text-white">
                    Customer Name
                  </TableHead>
                  <TableHead className="h-10 w-[11rem] text-right text-xs font-bold uppercase tracking-wide text-white">
                    Total Balance
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-20 text-center text-base text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Loading balances…
                    </TableCell>
                  </TableRow>
                ) : matchingCount === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-20 text-center text-base text-muted-foreground">
                      {searchTerm
                        ? debouncedSearch.length >= 2 && isFetching
                          ? "Searching…"
                          : "No matching outstanding balances."
                        : "No outstanding balances."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((r, index) => (
                    <TableRow key={r.customer_id} className="h-11">
                      <TableCell className="py-2.5 text-sm tabular-nums text-muted-foreground font-medium">
                        {pageStart + index}
                      </TableCell>
                      <TableCell className="py-2.5 text-base font-medium truncate">{r.customer_name}</TableCell>
                      <TableCell
                        className={cn(
                          "py-2.5 text-right tabular-nums text-base font-semibold font-mono",
                          r.net_position >= 0 ? "text-red-600" : "text-emerald-600",
                        )}
                      >
                        ₹{fmtAmt(r.net_position)} {r.net_position >= 0 ? "Dr" : "Cr"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {matchingCount > 0 && (
            <>
              <div className="flex items-center justify-between gap-4 px-3 py-2 border-t border-slate-100 bg-slate-50 text-sm font-semibold shrink-0">
                <span className="text-slate-800">Grand Total (all matching)</span>
                <span
                  className={cn(
                    "tabular-nums font-mono",
                    grandTotal >= 0 ? "text-red-600" : "text-emerald-600",
                  )}
                >
                  ₹{fmtAmt(grandTotal)} {grandTotal >= 0 ? "Dr" : "Cr"}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 bg-white shrink-0">
                <p className="text-sm text-slate-600 tabular-nums">
                  Showing {pageStart.toLocaleString("en-IN")}–{pageEnd.toLocaleString("en-IN")} of{" "}
                  {matchingCount.toLocaleString("en-IN")}
                  <span className="hidden sm:inline text-slate-400">
                    {" "}
                    · {CUSTOMER_OUTSTANDING_PAGE_SIZE} per page
                  </span>
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-9 text-sm px-3 border-slate-200"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-slate-700 font-medium tabular-nums px-1">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-9 text-sm px-3 border-slate-200"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
