import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeleton } from "@/components/ui/skeletons";
import { cn } from "@/lib/utils";

export type CustomerPartyBalanceRow = {
  customer_id: string;
  customer_name: string;
  signed_balance: number;
  advance_available: number;
  direction: string;
  net_position: number;
  total_dr: number;
  total_cr: number;
  net_receivable: number;
};

const SETTLED_THRESHOLD = 0.5;
const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtAmt(n: number) {
  return inr.format(Math.abs(n));
}

export default function CustomerPartyBalancesPage() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const [search, setSearch] = useState("");
  const [showSettled, setShowSettled] = useState(false);

  const orgId = currentOrganization?.id;

  const { data: rows = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["customer-party-balances", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc("get_customer_party_balances", {
        p_organization_id: orgId!,
      });
      if (rpcError) throw rpcError;
      return (data ?? []) as CustomerPartyBalanceRow[];
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
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showSettled && Math.abs(Number(row.signed_balance ?? 0)) < SETTLED_THRESHOLD) {
        return false;
      }
      if (!q) return true;
      return (row.customer_name || "").toLowerCase().includes(q);
    });
  }, [rows, search, showSettled]);

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
    <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto">
      <BackToDashboard label="Back to Accounts" to="/accounts" />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-teal-600" />
                Customer Balances
              </CardTitle>
              <CardDescription className="mt-1">
                Tally-style party list — one RPC load, same signed balance as Customer Ledger.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="shrink-0"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer name…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="show-settled" checked={showSettled} onCheckedChange={setShowSettled} />
              <Label htmlFor="show-settled" className="text-sm font-normal cursor-pointer">
                Show settled (₹0)
              </Label>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Failed to load balances: {(error as Error).message}
            </div>
          ) : isLoading ? (
            <ReportSkeleton />
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Party Name</TableHead>
                    <TableHead className="text-right font-semibold w-[140px]">Amount</TableHead>
                    <TableHead className="text-center font-semibold w-[72px]">Dr/Cr</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        {rows.length === 0 ? "No customers found." : "No matching customers."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => {
                      const signed = Number(row.signed_balance ?? 0);
                      const direction = row.direction || (signed > SETTLED_THRESHOLD ? "Dr" : signed < -SETTLED_THRESHOLD ? "Cr" : "Settled");
                      const isDr = direction === "Dr";
                      const isCr = direction === "Cr";

                      return (
                        <TableRow
                          key={row.customer_id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => openCustomerLedger(row.customer_id)}
                          title="Open Customer Ledger"
                        >
                          <TableCell className="font-medium">{row.customer_name}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right tabular-nums font-medium",
                              isDr && "text-red-600 dark:text-red-400",
                              isCr && "text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {fmtAmt(signed)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={cn(
                                "inline-flex min-w-[2.5rem] justify-center rounded px-2 py-0.5 text-xs font-semibold",
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

              <div className="border-t bg-muted/30 px-4 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="flex items-center justify-between sm:block">
                    <span className="text-muted-foreground">Total Receivable (Dr)</span>
                    <span className="font-semibold tabular-nums text-red-600 dark:text-red-400 sm:mt-0.5 sm:block sm:text-right">
                      ₹{fmtAmt(orgTotals.totalDr)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:block">
                    <span className="text-muted-foreground">Total Credit (Cr)</span>
                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 sm:mt-0.5 sm:block sm:text-right">
                      ₹{fmtAmt(orgTotals.totalCr)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:block">
                    <span className="text-muted-foreground">Net Receivable</span>
                    <span className="font-semibold tabular-nums sm:mt-0.5 sm:block sm:text-right">
                      ₹{fmtAmt(orgTotals.netReceivable)}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Showing {filteredRows.length.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")} parties
                  {!showSettled ? " (settled hidden)" : ""}.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
