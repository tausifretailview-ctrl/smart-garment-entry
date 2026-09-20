import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchCustomerPartyBalancesPayload } from "@/utils/customerPartyBalanceSnapshot";

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtAmt(n: number) {
  return inr.format(Math.abs(Number(n) || 0));
}

/**
 * Minimal Tally-style customer outstanding report: Sr No, Customer Name,
 * Total Balance — nothing else. Shows only customers with a non-zero
 * balance, sorted by balance descending, with a Grand Total footer.
 *
 * Uses the same fetchCustomerPartyBalancesPayload as Customer Balances
 * (/customer-party-balances), so the numbers here match that page's
 * numbers exactly. For very large / heavily-transacted orgs, the
 * underlying get_customer_party_balances calculation can time out — when
 * that happens this page shows the same honest "still loading" note
 * rather than silently substituting wrong figures.
 */
export default function CustomerOutstandingReport() {
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const orgId = currentOrganization?.id;

  const { data: payload, isLoading } = useQuery({
    queryKey: ["customer-outstanding-report", orgId],
    queryFn: () => fetchCustomerPartyBalancesPayload(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const all = payload?.rows ?? [];
    return all
      .filter((r) => Math.round(Number(r.net_position) || 0) !== 0)
      .sort((a, b) => Number(b.net_position) - Number(a.net_position));
  }, [payload]);

  const grandTotal = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.net_position) || 0), 0),
    [rows],
  );

  const balancesComplete = payload?.partyBalancesComplete !== false;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Customer Outstanding</h1>
            <p className="text-xs text-muted-foreground">
              Sr No · Customer Name · Total Balance — Tally-style outstanding list
            </p>
          </div>
        </div>
      </div>

      {!balancesComplete && (
        <div className="text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2">
          Full balances are still loading for this organization — the list below may be
          incomplete until the underlying calculation finishes. Refresh in a moment to retry.
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Sr No</TableHead>
              <TableHead>Customer Name</TableHead>
              <TableHead className="text-right">Total Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Loading balances…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  No outstanding balances.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={r.customer_id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.customer_name}</TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums font-mono ${
                      r.net_position >= 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    ₹{fmtAmt(r.net_position)} {r.net_position >= 0 ? "Dr" : "Cr"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">
                  Grand Total
                </TableCell>
                <TableCell
                  className={`text-right font-semibold tabular-nums font-mono ${
                    grandTotal >= 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  ₹{fmtAmt(grandTotal)} {grandTotal >= 0 ? "Dr" : "Cr"}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
