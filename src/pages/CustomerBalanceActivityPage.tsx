/**
 * Manual QA (compare header "Amount owed" with POS / useCustomerBalance):
 * - Receipt with settlement discount (CD): total_amount + discount_amount
 * - Advance applied to invoice (memo row + payment split)
 * - Credit note applied to invoice
 * - Sale return CN with credit_status adjusted and linked_sale_id null (must show as return credit)
 * - Opening balance receipt only
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, FileDown, LayoutList, Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import { fetchCustomerAuditBundle } from "@/utils/customerAuditBundle";
import { fetchCustomerBalanceSnapshot } from "@/utils/customerBalanceUtils";
import { useCustomerFinancialSnapshot } from "@/hooks/useCustomerFinancialSnapshot";
import {
  buildCustomerActivityRows,
  sliceActivityByDateRange,
  verifyActivityMatchesSnapshot,
} from "@/utils/customerBalanceActivity";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CustomerOption {
  id: string;
  customer_name: string;
  phone: string | null;
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => (Math.abs(n) >= 0.005 ? inr.format(Math.abs(n)) : "0.00");

function ymdBoundary(d: Date | undefined): string | null {
  if (!d) return null;
  return format(d, "yyyy-MM-dd");
}

function formatEffect(n: number, internal: boolean): string {
  if (internal) return "—";
  if (Math.abs(n) < 0.005) return "—";
  const sign = n > 0 ? "+" : "−";
  return `${sign}₹${fmt(Math.abs(n))}`;
}

export default function CustomerBalanceActivityPage() {
  const { currentOrganization } = useOrganization();
  const { isSchool } = useSchoolFeatures();
  const { getOrgPath } = useOrgNavigation();
  const [searchParams] = useSearchParams();
  const preSelectedCustomerId = searchParams.get("customer");

  const { fyStart, fyEnd } = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const startYear = m >= 3 ? y : y - 1;
    return {
      fyStart: new Date(startYear, 3, 1),
      fyEnd: new Date(startYear + 1, 2, 31),
    };
  }, []);

  const [customerId, setCustomerId] = useState<string | null>(preSelectedCustomerId);
  const [fromDate, setFromDate] = useState<Date | undefined>(fyStart);
  const [toDate, setToDate] = useState<Date | undefined>(fyEnd);
  const [custOpen, setCustOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Customer_Balance_Activity_${format(new Date(), "yyyy-MM-dd")}`,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-balance-activity", currentOrganization?.id],
    enabled: !!currentOrganization?.id && !isSchool,
    queryFn: async () => {
      const rows = await fetchAllCustomers(currentOrganization!.id);
      return rows.map((c: { id: string; customer_name: string; phone?: string | null }) => ({
        id: c.id,
        customer_name: c.customer_name,
        phone: c.phone ?? null,
      })) as CustomerOption[];
    },
  });

  useEffect(() => {
    if (!customerId && preSelectedCustomerId) setCustomerId(preSelectedCustomerId);
  }, [preSelectedCustomerId, customerId]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) || null,
    [customers, customerId],
  );

  const fromYmd = ymdBoundary(fromDate);
  const toYmd = ymdBoundary(toDate);

  const { data: activityData, isFetching, error } = useQuery({
    queryKey: ["customer-balance-activity", currentOrganization?.id, customerId],
    enabled: !!currentOrganization?.id && !!customerId && !isSchool,
    queryFn: async () => {
      const [bundle, snap] = await Promise.all([
        fetchCustomerAuditBundle(supabase, currentOrganization!.id, customerId!),
        fetchCustomerBalanceSnapshot(supabase, currentOrganization!.id, customerId!),
      ]);
      const allRows = buildCustomerActivityRows(bundle);
      const snapshotCheck = verifyActivityMatchesSnapshot(bundle, snap.balance);
      return { bundle, snap, allRows, snapshotCheck };
    },
  });

  const period = useMemo(() => {
    if (!activityData || !fromYmd || !toYmd) return null;
    const ob = Number(activityData.bundle.customer.opening_balance || 0);
    return sliceActivityByDateRange(activityData.allRows, fromYmd, toYmd, ob);
  }, [activityData, fromYmd, toYmd]);

  const snap = activityData?.snap;
  const mismatch = activityData?.snapshotCheck.mismatch ?? false;
  const delta = activityData?.snapshotCheck.delta ?? 0;

  const {
    outstandingDr: rpcOutstanding,
    advanceAvailable: rpcAdvance,
    cnAvailableTotal: rpcCn,
    isLoading: rpcLoading,
  } = useCustomerFinancialSnapshot(customerId, currentOrganization?.id ?? null);

  const rpcVsLegacy = useMemo(() => {
    if (!snap || rpcLoading) return null;
    return {
      outstandingDelta: Math.abs((rpcOutstanding ?? 0) - snap.balance),
      advanceDelta: Math.abs((rpcAdvance ?? 0) - snap.unusedAdvanceTotal),
      outstandingOk: Math.abs((rpcOutstanding ?? 0) - snap.balance) <= 1,
      advanceOk: Math.abs((rpcAdvance ?? 0) - snap.unusedAdvanceTotal) <= 1,
    };
  }, [snap, rpcOutstanding, rpcAdvance, rpcLoading]);

  const customerQuery = customerId ? `?customer=${encodeURIComponent(customerId)}` : "";

  const exportExcel = () => {
    if (!selectedCustomer || !period || period.rows.length === 0 || !fromYmd || !toYmd || !activityData) return;
    const rows: (string | number)[][] = [
      ["Customer balance & activity"],
      [currentOrganization?.name || ""],
      ["Customer", selectedCustomer.customer_name],
      ["Phone", selectedCustomer.phone || ""],
      ["Period", `${fromYmd} → ${toYmd}`],
      ["Opening (carried)", period.openingCarried],
      ["Closing (period)", period.closingInPeriod],
      ["Lifetime balance (POS)", activityData.snap.balance],
      [],
      ["Date", "Category", "Reference", "Description", "Effect on owed", "Balance owed"],
    ];
    period.rows.forEach((r) => {
      rows.push([
        r.at,
        r.categoryLabel,
        r.reference,
        r.description.replace(/\n/g, " "),
        r.internal ? "Memo" : formatEffect(r.effectOnReceivable, false),
        `${fmt(Math.abs(r.runningBalanceOwed))} ${r.runningBalanceOwed >= 0 ? "Dr" : "Cr"}`,
      ]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Activity");
    const safeName = selectedCustomer.customer_name.replace(/[^\w\-]+/g, "_").slice(0, 40);
    XLSX.writeFile(wb, `Customer_Balance_Activity_${safeName}_${fromYmd}_to_${toYmd}.xlsx`);
  };

  if (!currentOrganization?.id) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (isSchool) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-background p-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Customer balance & activity</CardTitle>
            <CardDescription>
              This screen is for business receivables. School organizations use the student fee ledger.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link to={getOrgPath("/student-ledger")}>Student Ledger</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background p-4 print:p-0 print:bg-white">
      <div className="w-full max-w-none mx-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <LayoutList className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Customer balance & activity</h1>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Plain-language movements and one running total (amount the customer owes). Same data as payments /
                POS balance — not the classic Dr/Cr ledger layout.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => handlePrint()} disabled={!selectedCustomer || !period?.rows.length}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={!selectedCustomer || !period?.rows.length}>
              <FileDown className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </div>

        <Card className="print:hidden border-dashed">
          <CardContent className="p-4 flex flex-wrap gap-3 text-sm">
            <span className="text-muted-foreground">Also see:</span>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to={`${getOrgPath("/customer-account-statement-audit")}${customerQuery}`}>Audit register</Link>
            </Button>
            <span className="text-muted-foreground">·</span>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to={`${getOrgPath("/customer-account-statement")}${customerQuery}`}>Account statement</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="print:hidden">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Customer</label>
              <Popover open={custOpen} onOpenChange={setCustOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedCustomer ? (
                      selectedCustomer.phone ? (
                        `${selectedCustomer.customer_name} — ${selectedCustomer.phone}`
                      ) : (
                        selectedCustomer.customer_name
                      )
                    ) : (
                      <span className="text-muted-foreground">Select customer...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder="Search by name or phone..." />
                    <CommandList>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup>
                        {customers.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.customer_name} ${c.phone ?? ""}`}
                            onSelect={() => {
                              setCustomerId(c.id);
                              setCustOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")} />
                            <span>{c.customer_name}</span>
                            {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <DateField label="From Date" value={fromDate} onChange={setFromDate} />
            <DateField label="To Date" value={toDate} onChange={setToDate} />
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">
              {(error as Error).message || "Failed to load"}
            </CardContent>
          </Card>
        )}

        {mismatch && activityData && (
          <Alert variant="destructive" className="print:hidden">
            <AlertTitle>Activity vs POS balance mismatch</AlertTitle>
            <AlertDescription>
              Lifetime total from this activity list (₹{fmt(activityData.snapshotCheck.closingFromActivity)} Dr/Cr
              basis) differs from the payments dashboard balance by ₹{fmt(Math.abs(delta))}. If this persists, report
              it — underlying data may need reconciliation.
            </AlertDescription>
          </Alert>
        )}

        {selectedCustomer && snap && rpcVsLegacy && (
          <Card className="print:hidden border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Financial snapshot parity (QA)</CardTitle>
              <CardDescription>
                Compare live RPC (`get_customer_financial_snapshot`) with legacy app snapshot. All windows should match RPC within ₹1.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Outstanding Dr</div>
                  <div className="font-mono tabular-nums">
                    RPC ₹{fmt(Math.abs(rpcOutstanding))} · Legacy ₹{fmt(Math.abs(snap.balance))}
                  </div>
                  <div className={cn("text-xs mt-0.5", rpcVsLegacy.outstandingOk ? "text-emerald-600" : "text-destructive")}>
                    {rpcVsLegacy.outstandingOk ? "OK (≤ ₹1)" : `Δ ₹${fmt(rpcVsLegacy.outstandingDelta)}`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Advance available</div>
                  <div className="font-mono tabular-nums">
                    RPC ₹{fmt(rpcAdvance)} · Legacy ₹{fmt(snap.unusedAdvanceTotal)}
                  </div>
                  <div className={cn("text-xs mt-0.5", rpcVsLegacy.advanceOk ? "text-emerald-600" : "text-destructive")}>
                    {rpcVsLegacy.advanceOk ? "OK (≤ ₹1)" : `Δ ₹${fmt(rpcVsLegacy.advanceDelta)}`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">CN available (RPC only)</div>
                  <div className="font-mono tabular-nums">₹{fmt(rpcCn)}</div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1 border-t">
                Acceptance: Ledger, POS picker, Payment, Statement, and Settle Account show the same three numbers as RPC;
                after sale/receipt/SR/CN/advance, refresh all surfaces together.
              </p>
            </CardContent>
          </Card>
        )}

        <div ref={printRef} className="space-y-4">
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold">{currentOrganization.name}</h1>
            <h2 className="text-base font-semibold">Customer balance & activity</h2>
            {selectedCustomer && (
              <p className="text-sm">
                Customer: <strong>{selectedCustomer.customer_name}</strong>
                {selectedCustomer.phone ? ` (${selectedCustomer.phone})` : ""}
              </p>
            )}
            {fromYmd && toYmd && period && (
              <p className="text-xs text-muted-foreground">
                Period: {fromYmd} → {toYmd} · Opening carried: ₹{fmt(Math.abs(period.openingCarried))}{" "}
                {period.openingCarried >= 0 ? "Dr" : "Cr"}
              </p>
            )}
          </div>

          {selectedCustomer && snap && fromYmd && toYmd && !isFetching && period && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="shadow-sm border-l-4 border-l-slate-500">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Amount owed (POS)</div>
                  <div className="text-2xl font-bold mt-1 tabular-nums">
                    ₹ {fmt(Math.abs(snap.balance))} {snap.balance >= 0 ? "Dr" : "Cr"}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Lifetime — same as payment screen</p>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Unused advance</div>
                  <div className="text-2xl font-bold mt-1 tabular-nums">₹ {fmt(snap.unusedAdvanceTotal)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs uppercase text-muted-foreground font-medium">Billed (net of return adjust)</div>
                  <div className="text-lg font-semibold tabular-nums">₹ {fmt(snap.totalSales)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs uppercase text-muted-foreground font-medium">Settled (cash + CN + OB)</div>
                  <div className="text-lg font-semibold tabular-nums">₹ {fmt(snap.totalPaid)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {selectedCustomer && fromYmd && toYmd && !isFetching && period && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Activity in period</CardTitle>
                <CardDescription>
                  Opening carried: ₹{fmt(Math.abs(period.openingCarried))} {period.openingCarried >= 0 ? "Dr" : "Cr"} ·
                  Closing: ₹{fmt(Math.abs(period.closingInPeriod))}{" "}
                  {period.closingInPeriod >= 0 ? "Dr" : "Cr"}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-2">
                <div className="overflow-x-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="whitespace-nowrap">Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="min-w-[200px]">Description</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Effect on owed</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Balance owed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {period.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No movements in this date range.
                          </TableCell>
                        </TableRow>
                      ) : (
                        period.rows.map((r) => (
                          <TableRow
                            key={r.id}
                            className={cn(r.internal && "bg-muted/30 text-muted-foreground italic text-sm")}
                          >
                            <TableCell className="font-mono text-xs whitespace-nowrap">{r.at}</TableCell>
                            <TableCell>{r.categoryLabel}</TableCell>
                            <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                            <TableCell className="text-sm max-w-md">{r.description}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {r.internal ? (
                                <span className="text-muted-foreground">Memo</span>
                              ) : (
                                <span
                                  className={cn(
                                    r.effectOnReceivable > 0.005 && "text-red-700 dark:text-red-400",
                                    r.effectOnReceivable < -0.005 && "text-emerald-700 dark:text-emerald-400",
                                  )}
                                >
                                  {formatEffect(r.effectOnReceivable, false)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums font-medium">
                              ₹{fmt(Math.abs(r.runningBalanceOwed))}{" "}
                              <span className="text-xs text-muted-foreground">
                                {r.runningBalanceOwed >= 0 ? "Dr" : "Cr"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-[11px] text-muted-foreground px-2 pt-3">
                  Positive effect increases what the customer owes; negative effect is payment, return credit, or
                  similar. Memo rows are informational (advance/CN applied to invoice) and do not change the running
                  total.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "dd-MM-yyyy") : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
