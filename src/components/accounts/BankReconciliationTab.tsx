import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Landmark, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchBankLedgerNetBalance,
  fetchUnclearedBankTransactions,
  reconcileTransactions,
} from "@/utils/accounting/reconciliationService";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const fmtInr = (n: number) => `₹${round2(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface BankReconciliationTabProps {
  organizationId: string;
}

export function BankReconciliationTab({ organizationId }: BankReconciliationTabProps) {
  const queryClient = useQueryClient();
  const [bankLedgerId, setBankLedgerId] = useState<string>("");
  const [statementDate, setStatementDate] = useState<Date>(new Date());
  const [bankEndingInput, setBankEndingInput] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const statementYmd = format(statementDate, "yyyy-MM-dd");

  const { data: bankLedgers = [], isLoading: banksLoading } = useQuery({
    queryKey: ["bank-recon-ledgers", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("organization_id", organizationId)
        .eq("account_type", "Asset")
        .or("account_name.ilike.%bank%,account_code.eq.1010")
        .order("account_code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; account_code: string; account_name: string; account_type: string }>;
    },
    enabled: !!organizationId,
  });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [bankLedgerId, statementYmd, organizationId]);

  const { data: systemBalance = 0, isLoading: systemLoading } = useQuery({
    queryKey: ["bank-recon-system-balance", organizationId, bankLedgerId, statementYmd],
    queryFn: () =>
      fetchBankLedgerNetBalance(organizationId, bankLedgerId, statementYmd, supabase),
    enabled: !!organizationId && !!bankLedgerId,
  });

  const { data: unclearedRows = [], isLoading: rowsLoading } = useQuery({
    queryKey: ["bank-recon-uncleared", organizationId, bankLedgerId, statementYmd],
    queryFn: () =>
      fetchUnclearedBankTransactions(organizationId, bankLedgerId, supabase, {
        statementDateEnd: statementYmd,
      }),
    enabled: !!organizationId && !!bankLedgerId,
  });

  const selectedNetSum = useMemo(() => {
    let s = 0;
    for (const row of unclearedRows) {
      if (!selectedIds.has(row.id)) continue;
      s += row.debit - row.credit;
    }
    return round2(s);
  }, [unclearedRows, selectedIds]);

  const clearedBalance = useMemo(
    () => round2(systemBalance - selectedNetSum),
    [systemBalance, selectedNetSum]
  );

  const bankEnding = useMemo(() => {
    const n = parseFloat(bankEndingInput.replace(/,/g, ""));
    return Number.isFinite(n) ? round2(n) : null;
  }, [bankEndingInput]);

  const difference = useMemo(() => {
    if (bankEnding === null) return null;
    return round2(bankEnding - clearedBalance);
  }, [bankEnding, clearedBalance]);

  const canReconcile =
    !!bankLedgerId &&
    difference !== null &&
    Math.abs(difference) < 0.005 &&
    selectedIds.size > 0;

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allSelected =
    unclearedRows.length > 0 && unclearedRows.every((r) => selectedIds.has(r.id));
  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(unclearedRows.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const iso = new Date(
        `${statementYmd}T12:00:00`
      ).toISOString();
      await reconcileTransactions([...selectedIds], iso, supabase);
    },
    onSuccess: () => {
      toast.success("Selected lines marked reconciled.");
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ["bank-recon-uncleared"] });
      void queryClient.invalidateQueries({ queryKey: ["bank-recon-system-balance"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Reconciliation failed";
      toast.error(msg);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="h-5 w-5" />
          Bank GL reconciliation
        </CardTitle>
        <CardDescription>
          Match journal lines to your bank statement: select clearing lines, confirm the calculator ties to the statement
          ending balance, then commit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Bank ledger</Label>
            <Select
              value={bankLedgerId || undefined}
              onValueChange={setBankLedgerId}
              disabled={banksLoading || !bankLedgers.length}
            >
              <SelectTrigger>
                <SelectValue placeholder={banksLoading ? "Loading…" : "Select bank account"} />
              </SelectTrigger>
              <SelectContent>
                {bankLedgers.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    No bank-like asset accounts
                  </SelectItem>
                ) : (
                  bankLedgers.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.account_code} — {a.account_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Statement date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !statementDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {statementDate ? format(statementDate, "PPP") : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={statementDate} onSelect={(d) => d && setStatementDate(d)} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Bank statement ending balance</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={bankEndingInput}
              onChange={(e) => setBankEndingInput(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border bg-muted/40 p-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">System balance</p>
            <p className="text-base font-semibold tabular-nums mt-1">
              {systemLoading ? "…" : !bankLedgerId ? "—" : fmtInr(systemBalance)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Net DR−CR on this ledger through statement date</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Selected (uncleared) net</p>
            <p className="text-base font-semibold tabular-nums mt-1">{!bankLedgerId ? "—" : fmtInr(selectedNetSum)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">DR − CR for checked rows</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Cleared balance</p>
            <p className="text-base font-semibold tabular-nums mt-1">
              {!bankLedgerId ? "—" : fmtInr(clearedBalance)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">System balance − selected net</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Difference</p>
            <p
              className={cn(
                "text-base font-semibold tabular-nums mt-1",
                difference === null ? "text-muted-foreground" : Math.abs(difference) < 0.005 ? "text-emerald-600" : "text-destructive"
              )}
            >
              {difference === null ? "Enter statement balance" : fmtInr(difference)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Statement ending − cleared balance (must be 0.00)</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!canReconcile || reconcileMutation.isPending}
            onClick={() => reconcileMutation.mutate()}
          >
            {reconcileMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Reconcile selected"
            )}
          </Button>
          {!canReconcile && bankLedgerId && difference !== null && Math.abs(difference) >= 0.005 && (
            <span className="text-sm text-muted-foreground">Difference must be exactly ₹0.00 to reconcile.</span>
          )}
          {bankLedgerId && difference !== null && Math.abs(difference) < 0.005 && selectedIds.size === 0 && (
            <span className="text-sm text-muted-foreground">Select at least one line to mark reconciled.</span>
          )}
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    disabled={!unclearedRows.length || rowsLoading}
                    aria-label="Select all uncleared lines"
                  />
                </TableHead>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right w-[100px]">Debit</TableHead>
                <TableHead className="text-right w-[100px]">Credit</TableHead>
                <TableHead className="text-right w-[110px]">Net (DR−CR)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Loading uncleared lines…
                  </TableCell>
                </TableRow>
              ) : !bankLedgerId ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Choose a bank ledger to load uncleared journal lines.
                  </TableCell>
                </TableRow>
              ) : unclearedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No uncleared lines through this statement date.
                  </TableCell>
                </TableRow>
              ) : (
                unclearedRows.map((row) => {
                  const net = round2(row.debit - row.credit);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={(v) => toggleRow(row.id, v === true)}
                          aria-label={`Select line ${row.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{row.date}</TableCell>
                      <TableCell className="max-w-[320px] truncate text-sm">{row.description || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtInr(row.debit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtInr(row.credit)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtInr(net)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
