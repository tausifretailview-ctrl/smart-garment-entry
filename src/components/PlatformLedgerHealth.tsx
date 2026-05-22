import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface AnomalyRow {
  organization_id: string;
  organization_name: string;
  mistagged_receipts_count: number;
  mistagged_receipts_amount: number;
  paid_drift_count: number;
  paid_drift_amount: number;
  overpaid_count: number;
  overpaid_amount: number;
  ghost_receipts_count: number;
  ghost_receipts_amount: number;
  null_ref_receipts_count: number;
  null_ref_receipts_amount: number;
  advance_drift_count?: number;
  advance_drift_amount?: number;
  discount_drift_count?: number;
  discount_drift_amount?: number;
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function CountCell({ count, amount }: { count: number; amount: number }) {
  if (!count) {
    return <span className="text-muted-foreground tabular-nums font-mono">0</span>;
  }
  return (
    <div className="flex flex-col items-end tabular-nums font-mono">
      <span className="font-semibold text-destructive">{count.toLocaleString("en-IN")}</span>
      <span className="text-[11px] text-muted-foreground">₹{inr.format(Math.round(amount))}</span>
    </div>
  );
}

/**
 * Customer Ledger Health diagnostic — platform admin only.
 * Surfaces 7 classes of voucher_entries / sales drift per organization.
 * Read-only; repairs happen elsewhere.
 */
export function PlatformLedgerHealth() {
  const { data, isLoading, error } = useQuery<AnomalyRow[]>({
    queryKey: ["platform-customer-ledger-anomalies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_customer_ledger_anomalies");
      if (error) throw error;
      return (data as AnomalyRow[]) || [];
    },
    staleTime: 60_000,
  });

  const totals = (data || []).reduce(
    (acc, r) => {
      acc.mistagged += r.mistagged_receipts_count;
      acc.drift += r.paid_drift_count;
      acc.overpaid += r.overpaid_count;
      acc.ghost += r.ghost_receipts_count;
      acc.nullRef += r.null_ref_receipts_count;
      acc.advance += Number(r.advance_drift_count || 0);
      acc.discount += Number(r.discount_drift_count || 0);
      return acc;
    },
    { mistagged: 0, drift: 0, overpaid: 0, ghost: 0, nullRef: 0, advance: 0, discount: 0 }
  );

  const totalAnomalies =
    totals.mistagged +
    totals.drift +
    totals.overpaid +
    totals.ghost +
    totals.nullRef +
    totals.advance +
    totals.discount;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Customer Ledger Health</h2>
        <p className="text-sm text-muted-foreground">
          Per-organization voucher / sales integrity defects. Read-only diagnostic — fixes
          are applied through targeted migrations.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <SummaryCard label="Mis-tagged Receipts" count={totals.mistagged} hint="ref_type=customer but points to a sale" />
        <SummaryCard label="Paid Drift" count={totals.drift} hint="sales.paid_amount ≠ receipts" />
        <SummaryCard label="Over-paid Bills" count={totals.overpaid} hint="receipts > bill amount" />
        <SummaryCard label="Ghost Receipts" count={totals.ghost} hint="customer ref, no sale, opening=0" />
        <SummaryCard label="NULL Ref" count={totals.nullRef} hint="receipt with no reference_id" />
        <SummaryCard label="Advance Drift" count={totals.advance} hint="used_amount ≠ advance vouchers" />
        <SummaryCard label="Discount Drift" count={totals.discount} hint="paid_amount vs receipt+discount" />
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            Failed to load anomalies: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Organization Breakdown</CardTitle>
          <CardDescription>
            {isLoading
              ? "Computing…"
              : totalAnomalies === 0
                ? "All organizations clean."
                : `${totalAnomalies.toLocaleString("en-IN")} anomalies across ${(data || []).filter((r) =>
                    r.mistagged_receipts_count +
                      r.paid_drift_count +
                      r.overpaid_count +
                      r.ghost_receipts_count +
                      r.null_ref_receipts_count +
                      Number(r.advance_drift_count || 0) +
                      Number(r.discount_drift_count || 0) >
                    0
                  ).length} organizations.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead className="text-right">Mis-tagged</TableHead>
                    <TableHead className="text-right">Paid Drift</TableHead>
                    <TableHead className="text-right">Over-paid</TableHead>
                    <TableHead className="text-right">Ghost</TableHead>
                    <TableHead className="text-right">NULL Ref</TableHead>
                    <TableHead className="text-right">Adv Drift</TableHead>
                    <TableHead className="text-right">Disc Drift</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data || []).map((row) => {
                    const total =
                      row.mistagged_receipts_count +
                      row.paid_drift_count +
                      row.overpaid_count +
                      row.ghost_receipts_count +
                      row.null_ref_receipts_count +
                      Number(row.advance_drift_count || 0) +
                      Number(row.discount_drift_count || 0);
                    return (
                      <TableRow key={row.organization_id}>
                        <TableCell className="font-medium">{row.organization_name}</TableCell>
                        <TableCell className="text-right">
                          <CountCell count={row.mistagged_receipts_count} amount={row.mistagged_receipts_amount} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CountCell count={row.paid_drift_count} amount={row.paid_drift_amount} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CountCell count={row.overpaid_count} amount={row.overpaid_amount} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CountCell count={row.ghost_receipts_count} amount={row.ghost_receipts_amount} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CountCell count={row.null_ref_receipts_count} amount={row.null_ref_receipts_amount} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CountCell count={Number(row.advance_drift_count || 0)} amount={Number(row.advance_drift_amount || 0)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CountCell count={Number(row.discount_drift_count || 0)} amount={Number(row.discount_drift_amount || 0)} />
                        </TableCell>
                        <TableCell className="text-right">
                          {total === 0 ? (
                            <Badge variant="outline" className="border-success text-success">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Clean
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" /> {total.toLocaleString("en-IN")}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What each defect means</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Mis-tagged Receipts:</strong> Voucher rows saved with reference_type='customer' even though reference_id is actually a sale id. Front-end now reads them via id-match (Phase 1), but they should be re-labelled in Phase 4.</p>
          <p><strong className="text-foreground">Paid Drift:</strong> sales.paid_amount differs from the sum of non-advance receipts for that invoice by more than ₹1.</p>
          <p><strong className="text-foreground">Over-paid:</strong> Receipts exceed the bill amount (after sale-return adjust) by more than ₹1 — usually duplicates.</p>
          <p><strong className="text-foreground">Ghost Receipts:</strong> reference_type='customer' rows that don't match any invoice and the customer's opening balance is ₹0 — orphan / unidentified payments.</p>
          <p><strong className="text-foreground">NULL Ref:</strong> Receipts saved with no reference_id at all — cannot be classified.</p>
          <p><strong className="text-foreground">Advance Drift:</strong> customer_advances.used_amount does not match advance_adjustment receipt vouchers (Phase 2 FIFO).</p>
          <p><strong className="text-foreground">Discount Drift:</strong> Receipt discount_amount present but sales.paid_amount still exceeds voucher settlement total.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, count, hint }: { label: string; count: number; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground font-normal">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className={`text-2xl font-bold tabular-nums font-mono ${count > 0 ? "text-destructive" : "text-success"}`}>
          {count.toLocaleString("en-IN")}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}