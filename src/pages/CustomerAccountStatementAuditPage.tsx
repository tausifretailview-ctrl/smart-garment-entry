import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { CalendarIcon, Check, ChevronsUpDown, FileDown, FileText, Printer, Scale } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import {
  buildAuditRows,
  fetchCustomerAuditBundle,
  type AuditRow,
} from "@/utils/customerAuditBundle";
import { computeCustomerOutstanding } from "@/utils/customerAuditMath";
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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CustomerOption {
  id: string;
  customer_name: string;
  phone: string | null;
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => (Math.abs(n) >= 0.005 ? inr.format(Math.abs(n)) : "");

function ymdBoundary(d: Date | undefined): string | null {
  if (!d) return null;
  return format(d, "yyyy-MM-dd");
}

export default function CustomerAccountStatementAuditPage() {
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
    documentTitle: `Customer_Account_Statement_Audit_${format(new Date(), "yyyy-MM-dd")}`,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-audit-statement", currentOrganization?.id],
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

  const { data: auditBundle, isFetching, error } = useQuery({
    queryKey: ["customer-account-statement-audit", currentOrganization?.id, customerId],
    enabled: !!currentOrganization?.id && !!customerId && !!fromYmd && !!toYmd && !isSchool,
    queryFn: async () => {
      return fetchCustomerAuditBundle(supabase, currentOrganization!.id, customerId!);
    },
  });

  const math = useMemo(() => {
    if (!auditBundle || !fromYmd || !toYmd) return null;
    const salesInRange = auditBundle.allSales.filter((s: any) => {
      const d = String(s.sale_date || "").slice(0, 10);
      return d >= fromYmd && d <= toYmd;
    });
    const vouchersInRange = auditBundle.vouchersMerged.filter((v: any) => {
      const d = String(v.voucher_date || "").slice(0, 10);
      return d >= fromYmd && d <= toYmd;
    });
    const adjustmentsInRange = ((auditBundle as any).balanceAdjustments || []).filter((a: any) => {
      const d = String(a.adjustment_date || "").slice(0, 10);
      return d >= fromYmd && d <= toYmd;
    });
    const adjustmentTotal = adjustmentsInRange.reduce(
      (sum: number, a: any) => sum + Number(a.outstanding_difference || 0),
      0,
    );
    return computeCustomerOutstanding(
      {
        openingBalance: Number(auditBundle.customer.opening_balance || 0),
        sales: salesInRange,
        voucherEntries: vouchersInRange,
        customerAdvances: auditBundle.advances,
        advanceRefunds: auditBundle.refunds,
        adjustmentTotal,
      },
      { ledgerAlignedApplicationReceipts: true },
    );
  }, [auditBundle, fromYmd, toYmd]);

  const allRows = useMemo(() => {
    if (!auditBundle) return [];
    return buildAuditRows(
      {
        sales: auditBundle.allSales,
        saleReturns: auditBundle.saleReturns,
        vouchers: auditBundle.vouchersMerged,
        advances: auditBundle.advances,
        refunds: auditBundle.refunds,
        balanceAdjustments: auditBundle.balanceAdjustments,
      },
      { ledgerAlignedApplicationReceipts: true },
    );
  }, [auditBundle]);

  const { openingCarried, displayRows, rowBalances } = useMemo(() => {
    if (!auditBundle || !fromYmd || !toYmd) {
      return { openingCarried: 0, displayRows: [] as AuditRow[], rowBalances: [] as number[] };
    }
    const ob = Number(auditBundle.customer.opening_balance || 0);
    let carried = ob;
    for (const r of allRows) {
      if (r.at < fromYmd) {
        if (!r.internal) carried += r.debit - r.credit;
      }
    }
    const disp = allRows.filter((r) => r.at >= fromYmd && r.at <= toYmd);
    let running = carried;
    const balances: number[] = [];
    for (const r of disp) {
      if (r.internal) {
        balances.push(running);
      } else {
        running += r.debit - r.credit;
        balances.push(running);
      }
    }
    return { openingCarried: carried, displayRows: disp, rowBalances: balances };
  }, [allRows, auditBundle, fromYmd, toYmd]);

  const finalOutstanding =
    displayRows.length > 0 ? (rowBalances[rowBalances.length - 1] ?? openingCarried) : openingCarried;

  const { totalDebit, totalCredit } = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const r of displayRows) {
      if (r.internal) continue;
      d += r.debit || 0;
      c += r.credit || 0;
    }
    return { totalDebit: d, totalCredit: c };
  }, [displayRows]);

  const customerQuery = customerId ? `?customer=${encodeURIComponent(customerId)}` : "";

  const exportExcel = () => {
    if (!selectedCustomer || !auditBundle || displayRows.length === 0) return;
    const rows: (string | number)[][] = [
      ["Customer Account Statement (audit register)"],
      [currentOrganization?.name || ""],
      ["Customer", selectedCustomer.customer_name],
      ["Phone", selectedCustomer.phone || ""],
      ["Period", `${fromYmd} → ${toYmd}`],
      ["Opening carried (B/F)", openingCarried],
      ["Closing balance (register)", finalOutstanding],
      [],
      ["Date", "Type", "VCH/REF NO", "Particulars", "Debit", "Credit", "Balance Dr/Cr"],
    ];
    displayRows.forEach((r, i) => {
      const bal = rowBalances[i] ?? 0;
      rows.push([
        r.at,
        r.type,
        r.ref,
        r.particulars.replace(/\n/g, " "),
        r.debit || "",
        r.credit || "",
        `${bal >= 0 ? "" : "-"}${fmt(Math.abs(bal))} ${bal >= 0 ? "Dr" : "Cr"}`,
      ]);
    });
    if (math) {
      rows.push([]);
      rows.push(["Period formula check (customerAuditMath)", ""]);
      rows.push(["Outstanding (+ = Dr)", math.outstanding]);
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    const safeName = selectedCustomer.customer_name.replace(/[^\w\-]+/g, "_").slice(0, 40);
    XLSX.writeFile(wb, `Customer_Statement_Audit_${safeName}_${fromYmd}_to_${toYmd}.xlsx`);
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
        <div className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Customer account statement (audit)
              </CardTitle>
              <CardDescription>
                This audit-aligned receivables register is for <strong>business</strong> organizations (sales and
                voucher_entries). School fee balances use the student fee ledger instead.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Open <strong>Student Ledger</strong> or <strong>Fee Collection</strong> from the school menu for
                per-student statements.
              </p>
              <Button variant="outline" asChild>
                <Link to={getOrgPath("/student-ledger")}>Go to Student Ledger</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background p-4 print:p-0 print:bg-white">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <FileText className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Customer account statement (audit)</h1>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Audit register — same row basis as <strong>Customer Audit Report</strong> and the audit closing used in
                Customer Ledger (classic). Use this to compare with the classic ledger or the RPC account statement
                without changing those screens.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => handlePrint()}
              disabled={!selectedCustomer || displayRows.length === 0}
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button
              variant="outline"
              onClick={exportExcel}
              disabled={!selectedCustomer || displayRows.length === 0}
            >
              <FileDown className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </div>

        <Card className="print:hidden border-dashed">
          <CardContent className="p-4 flex flex-wrap gap-3 text-sm">
            <span className="text-muted-foreground">Compare:</span>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to={`${getOrgPath("/customer-ledger-report")}${customerQuery}`}>
                Customer Ledger (classic)
              </Link>
            </Button>
            <span className="text-muted-foreground">·</span>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to={`${getOrgPath("/customer-account-statement")}${customerQuery}`}>
                Account statement (RPC)
              </Link>
            </Button>
            <span className="text-muted-foreground">·</span>
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to={`${getOrgPath("/customer-audit-report")}${customerQuery}`}>Customer Audit Report</Link>
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
                            <Check
                              className={cn("mr-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")}
                            />
                            <span>{c.customer_name}</span>
                            {c.phone && (
                              <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                            )}
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
              {(error as Error).message || "Failed to load statement"}
            </CardContent>
          </Card>
        )}

        <div ref={printRef} className="space-y-4">
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold">{currentOrganization.name}</h1>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Customer account statement (audit register)
            </h2>
            {selectedCustomer && (
              <p className="text-sm">
                Customer: <strong>{selectedCustomer.customer_name}</strong>
                {selectedCustomer.phone ? ` (${selectedCustomer.phone})` : ""}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Period: {fromYmd} → {toYmd} · Opening carried: ₹{fmt(openingCarried)}{" "}
              {openingCarried >= 0 ? "Dr" : "Cr"}
            </p>
          </div>

          {selectedCustomer && fromYmd && toYmd && !isFetching && auditBundle && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="shadow-sm border-l-4 border-l-slate-500">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Opening carried (B/F)
                  </div>
                  <div className="text-2xl font-bold mt-1 tabular-nums">
                    ₹ {fmt(openingCarried)} {openingCarried >= 0 ? "Dr" : "Cr"}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Before {fromYmd}</p>
                </CardContent>
              </Card>
              {finalOutstanding > 0.005 ? (
                <Card className="shadow-sm border-l-4 border-l-red-500 text-red-700 dark:text-red-400 md:col-span-2">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-wide font-medium opacity-80">Closing (register)</div>
                    <div className="text-2xl font-bold mt-1 tabular-nums">₹ {fmt(finalOutstanding)} Dr</div>
                    <p className="text-[10px] text-muted-foreground mt-1">End of period — same running total as audit</p>
                  </CardContent>
                </Card>
              ) : finalOutstanding < -0.005 ? (
                <Card className="shadow-sm border-l-4 border-l-emerald-600 text-emerald-700 dark:text-emerald-300 md:col-span-2">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-wide font-medium opacity-80">Closing (register)</div>
                    <div className="text-2xl font-bold mt-1 tabular-nums">₹ {fmt(Math.abs(finalOutstanding))} Cr</div>
                    <p className="text-[10px] text-muted-foreground mt-1">End of period — same running total as audit</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="shadow-sm border-l-4 border-l-blue-500 text-blue-700 dark:text-blue-300 md:col-span-2">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-wide font-medium opacity-80">Closing (register)</div>
                    <div className="text-2xl font-bold mt-1 tabular-nums">₹ 0.00</div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="border-collapse text-[13px]">
                <TableHeader>
                  <TableRow className="bg-slate-100 dark:bg-muted/40">
                    <TableHead className="border px-3 py-2 text-xs !text-black dark:!text-white">Date</TableHead>
                    <TableHead className="border px-3 py-2 text-xs !text-black dark:!text-white">Type</TableHead>
                    <TableHead className="border px-3 py-2 text-xs !text-black dark:!text-white">VCH/REF NO</TableHead>
                    <TableHead className="border px-3 py-2 text-xs !text-black dark:!text-white">Particulars</TableHead>
                    <TableHead className="border px-3 py-2 text-xs text-right !text-black dark:!text-white">Debit (₹)</TableHead>
                    <TableHead className="border px-3 py-2 text-xs text-right !text-black dark:!text-white">Credit (₹)</TableHead>
                    <TableHead className="border px-3 py-2 text-xs text-right !text-black dark:!text-white">Balance (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!selectedCustomer ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        Select a customer
                      </TableCell>
                    </TableRow>
                  ) : isFetching ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : displayRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No transactions in this period
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayRows.map((r, i) => {
                      const bal = rowBalances[i] ?? 0;
                      return (
                        <TableRow
                          key={r.id}
                          className={cn(
                            r.internal && "bg-slate-50/90 dark:bg-muted/25 italic text-muted-foreground",
                          )}
                        >
                          <TableCell className="border px-3 py-1.5 whitespace-nowrap">
                            {r.at ? format(new Date(r.at + "T12:00:00"), "dd-MM-yyyy") : "—"}
                          </TableCell>
                          <TableCell className="border px-3 py-1.5 font-medium text-xs uppercase">{r.type}</TableCell>
                          <TableCell className="border px-3 py-1.5 font-mono text-xs">{r.ref}</TableCell>
                          <TableCell className="border px-3 py-1.5 max-w-md">
                            {r.particulars}
                            {r.internal && (
                              <span className="block text-[11px] not-italic text-muted-foreground mt-0.5">
                                (reclassification — does not change balance)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="border px-3 py-1.5 text-right font-mono tabular-nums">
                            {r.debit > 0 ? fmt(r.debit) : "—"}
                          </TableCell>
                          <TableCell className="border px-3 py-1.5 text-right font-mono tabular-nums">
                            {r.credit > 0 ? fmt(r.credit) : "—"}
                          </TableCell>
                          <TableCell className="border px-3 py-1.5 text-right font-mono tabular-nums font-semibold">
                            {fmt(Math.abs(bal))} {bal >= 0 ? "Dr" : "Cr"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
                {selectedCustomer && !isFetching && displayRows.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-slate-100 dark:bg-muted/40 font-bold">
                      <TableCell colSpan={4} className="border px-3 py-2 text-right uppercase text-xs tracking-wide">
                        Grand Total
                      </TableCell>
                      <TableCell className="border px-3 py-2 text-right font-mono tabular-nums">
                        {fmt(totalDebit)}
                      </TableCell>
                      <TableCell className="border px-3 py-2 text-right font-mono tabular-nums">
                        {fmt(totalCredit)}
                      </TableCell>
                      <TableCell className="border px-3 py-2 text-right font-mono tabular-nums">
                        {fmt(Math.abs(finalOutstanding))} {finalOutstanding >= 0 ? "Dr" : "Cr"}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </Card>
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
