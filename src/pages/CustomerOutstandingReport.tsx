import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { fetchCustomerPartyBalancesPayload } from "@/utils/customerPartyBalanceSnapshot";
import { cn } from "@/lib/utils";
import {
  INSIGHTS_BODY_CELL,
  INSIGHTS_BODY_CELL_NUM,
  INSIGHTS_BODY_ROW,
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsKpiStrip,
  InsightsPanel,
  InsightsStaticTh,
  InsightsTableHeader,
} from "@/components/business-insights/insightsLayout";

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

  const { data: payload, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["customer-outstanding-report", orgId],
    queryFn: () => fetchCustomerPartyBalancesPayload(orgId!),
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
    if (!searchTerm) return outstandingRows;
    return outstandingRows.filter((r) => {
      const name = (r.customer_name ?? "").toLowerCase();
      const phone = (r.phone ?? "").toLowerCase();
      return name.includes(searchTerm) || phone.includes(searchTerm);
    });
  }, [outstandingRows, searchTerm]);

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
    <div className="customer-party-balances-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className={INSIGHTS_TAB_SHELL}>
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
                  : `${filteredRows.length.toLocaleString("en-IN")} parties with balance${
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
              Full balances are still loading — the list may be incomplete until the calculation
              finishes. Refresh in a moment to retry.
            </AlertDescription>
          </Alert>
        )}

        <InsightsKpiStrip>
          <InsightsKpiCard
            label="Parties listed"
            value={filteredRows.length}
            valueFormat="int"
            sub={searchTerm ? "Matches search" : "Non-zero net balance"}
          />
          <InsightsKpiCard
            label="Grand total (net)"
            value={`₹${fmtAmt(grandTotal)} ${grandTotal >= 0 ? "Dr" : "Cr"}`}
            tone={grandTotal >= 0 ? "attention" : "positive"}
            sub="Sum of Total Balance column"
          />
          <InsightsKpiCard
            label="Organization"
            value={currentOrganization?.name ?? "—"}
            sub="Same source as Customer Balances"
          />
        </InsightsKpiStrip>

        <InsightsPanel
          className="flex-1 min-h-0"
          toolbar={
            <div className="relative flex-1 min-w-[200px] max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="pl-10 h-9 text-sm border-slate-200 bg-slate-50 focus:bg-white w-full"
              />
            </div>
          }
          footer={
            filteredRows.length > 0 ? (
              <div className="flex items-center justify-between gap-4 text-sm font-semibold">
                <span className="text-slate-800">Grand Total</span>
                <span
                  className={cn(
                    "tabular-nums font-mono",
                    grandTotal >= 0 ? "text-red-600" : "text-emerald-600",
                  )}
                >
                  ₹{fmtAmt(grandTotal)} {grandTotal >= 0 ? "Dr" : "Cr"}
                </span>
              </div>
            ) : undefined
          }
        >
          <Table className="w-full table-fixed">
            <InsightsTableHeader>
              <InsightsStaticTh label="Sr No" className="w-[4.5rem]" />
              <InsightsStaticTh label="Customer Name" />
              <InsightsStaticTh label="Total Balance" className="w-[11rem] text-right" />
            </InsightsTableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className={INSIGHTS_BODY_ROW}>
                  <TableCell colSpan={3} className={cn(INSIGHTS_BODY_CELL, "text-center py-6")}>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading balances…
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow className={INSIGHTS_BODY_ROW}>
                  <TableCell
                    colSpan={3}
                    className={cn(INSIGHTS_BODY_CELL, "text-center py-6 text-muted-foreground")}
                  >
                    {searchTerm ? "No matching outstanding balances." : "No outstanding balances."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((r, i) => (
                  <TableRow key={r.customer_id} className={INSIGHTS_BODY_ROW}>
                    <TableCell className={cn(INSIGHTS_BODY_CELL, "text-slate-500 tabular-nums")}>
                      {i + 1}
                    </TableCell>
                    <TableCell className={cn(INSIGHTS_BODY_CELL, "font-medium text-slate-900 truncate")}>
                      {r.customer_name}
                    </TableCell>
                    <TableCell
                      className={cn(
                        INSIGHTS_BODY_CELL_NUM,
                        "font-semibold",
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
        </InsightsPanel>
      </div>
    </div>
  );
}
