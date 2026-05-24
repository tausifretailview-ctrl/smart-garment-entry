import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  FileDown,
  FileSearch,
  Printer,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Search,
  RefreshCw,
  History,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import { cn } from "@/lib/utils";
import { computeCustomerOutstanding } from "@/utils/customerAuditMath";
import {
  buildAuditRows,
  computeAuditFormulaOutstanding,
  fetchCustomerAuditBundle,
  type AuditRow,
} from "@/utils/customerAuditBundle";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface CustomerOption {
  id: string;
  customer_name: string;
  phone: string | null;
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** INR display helper (matches Customer Account Statement style). */
const fmt = (n: number) => (Math.abs(n) >= 0.005 ? inr.format(Math.abs(n)) : "");

function ymdBoundary(d: Date | undefined): string | null {
  if (!d) return null;
  return format(d, "yyyy-MM-dd");
}

type IntegrityRow = { source: string; amount: number; detail: string };

type ReconHistoryRow = {
  check_date: string;
  rpc_outstanding: number;
  invoice_sum_outstanding: number;
  drift_rpc_vs_invoices: number;
  severity: string;
  notes: string | null;
  has_phantom_advance: boolean;
  has_mistagged_receipts: boolean;
  has_overpaid_invoices: boolean;
  has_sr_invoice_drift: boolean;
};

export default function CustomerAuditReport() {
  const { currentOrganization } = useOrganization();
  const { isAdmin } = useUserPermissions();
  const { toast } = useToast();
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
  const [integrityDialogOpen, setIntegrityDialogOpen] = useState(false);
  const [integrityBreakdown, setIntegrityBreakdown] = useState<IntegrityRow[] | null>(null);
  const [reconRunning, setReconRunning] = useState(false);
  const [lastReconSummary, setLastReconSummary] = useState<{
    checked: number;
    warnings: number;
    critical: number;
    ok: number;
    date: string;
  } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Customer_Audit_${format(new Date(), "yyyy-MM-dd")}`,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-audit-report", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
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
    // Full customer snapshot; date range only affects client-side filters and math.
    queryKey: ["customer-audit-report", currentOrganization?.id, customerId],
    enabled: !!currentOrganization?.id && !!customerId && !!fromYmd && !!toYmd,
    queryFn: async () => {
      return fetchCustomerAuditBundle(supabase, currentOrganization!.id, customerId!);
    },
  });

  const { data: dbTrueBalance } = useQuery({
    queryKey: ["customer-true-outstanding", customerId, currentOrganization?.id],
    queryFn: async () => {
      if (!customerId || !currentOrganization?.id) return null;
      const { data, error } = await (supabase.rpc as any)("get_customer_true_outstanding", {
        p_customer_id: customerId,
        p_organization_id: currentOrganization.id,
      });
      if (error) {
        console.error("Balance integrity check failed:", error);
        return null;
      }
      return Number(data);
    },
    enabled: !!customerId && !!currentOrganization?.id,
    staleTime: 30_000,
  });

  const { data: srIntegrityDrift = [] } = useQuery({
    queryKey: ["sr-invoice-integrity-check", currentOrganization?.id, customerId],
    enabled: !!currentOrganization?.id && !!customerId,
    queryFn: async () => {
      const { data, error: qErr } = await (supabase as any)
        .from("sr_invoice_integrity_check")
        .select(
          "sale_return_id, return_number, sr_net_amount, sale_number, invoice_sra, drift_amount, customer_name",
        )
        .eq("organization_id", currentOrganization!.id)
        .eq("customer_id", customerId!);
      if (qErr) {
        if (qErr.code === "42P01" || qErr.message?.includes("does not exist")) return [];
        throw qErr;
      }
      return (data || []) as Array<{
        sale_return_id: string;
        return_number: string | null;
        sr_net_amount: number;
        sale_number: string | null;
        invoice_sra: number | null;
        drift_amount: number;
        customer_name: string | null;
      }>;
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
    return computeCustomerOutstanding({
      openingBalance: Number(auditBundle.customer.opening_balance || 0),
      sales: salesInRange,
      voucherEntries: vouchersInRange,
      customerAdvances: auditBundle.advances,
      advanceRefunds: auditBundle.refunds,
      adjustmentTotal,
    });
  }, [auditBundle, fromYmd, toYmd]);

  const allRows = useMemo(() => {
    if (!auditBundle) return [];
    return buildAuditRows({
      sales: auditBundle.allSales,
      saleReturns: auditBundle.saleReturns,
      vouchers: auditBundle.vouchersMerged,
      advances: auditBundle.advances,
      refunds: auditBundle.refunds,
      balanceAdjustments: auditBundle.balanceAdjustments,
    });
  }, [auditBundle]);

  const cancelledInvoices = useMemo(() => {
    if (!auditBundle) return [];
    return auditBundle.allSales
      .filter((s: any) => {
        const st = String(s.payment_status || "").toLowerCase();
        const d = String(s.sale_date || "").slice(0, 10);
        return (
          (st === "cancelled" || s.is_cancelled === true) &&
          fromYmd &&
          toYmd &&
          d >= fromYmd &&
          d <= toYmd
        );
      })
      .sort((a: any, b: any) =>
        String(a.sale_date || "").localeCompare(String(b.sale_date || "")),
      );
  }, [auditBundle, fromYmd, toYmd]);

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

  const outstandingFromRunningBalance =
    displayRows.length > 0 ? (rowBalances[rowBalances.length - 1] ?? openingCarried) : openingCarried;
  const finalOutstanding = outstandingFromRunningBalance;

  useEffect(() => {
    if (!selectedCustomer || !math) return;
    if (Math.abs(math.outstanding - finalOutstanding) > 1) {
      console.warn("[CustomerAuditReport] Outstanding mismatch", {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.customer_name,
        formulaOutstanding: math.outstanding,
        runningBalanceOutstanding: finalOutstanding,
      });
    }
  }, [selectedCustomer, math, finalOutstanding]);

  const netInvoiced =
    math != null ? math.totalInvoiced - math.totalSaleReturnAdjust : 0;

  const card2Total =
    math != null ? math.totalRealPayments + math.totalAdvanceReceived : 0;

  /** Lifetime audit formula (all-time); compare to DB RPC — not FY-scoped `math`. */
  const lifetimeFormula = useMemo(() => {
    if (!auditBundle) return null;
    return computeAuditFormulaOutstanding(auditBundle);
  }, [auditBundle]);

  const runIntegrityCheck = async () => {
    if (!customerId || !currentOrganization?.id) return;
    const { data, error } = await (supabase.rpc as any)("reconcile_customer_balance", {
      p_customer_id: customerId,
      p_organization_id: currentOrganization.id,
    });
    if (error) {
      toast({ title: "Check failed", description: error.message, variant: "destructive" });
      return;
    }
    const rows = (data || []) as Array<{ source: string; amount: string | number; detail: string }>;
    setIntegrityBreakdown(
      rows.map((r) => ({
        source: r.source,
        amount: Number(r.amount),
        detail: r.detail,
      })),
    );
    setIntegrityDialogOpen(true);
  };

  const integrityTotal =
    integrityBreakdown?.reduce((s, r) => s + r.amount, 0) ?? null;

  const { data: reconHistory = [], refetch: refetchReconHistory } = useQuery({
    queryKey: ["balance-recon-history", currentOrganization?.id, customerId],
    enabled: !!currentOrganization?.id && !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("balance_reconciliation_log")
        .select(
          "check_date, rpc_outstanding, invoice_sum_outstanding, drift_rpc_vs_invoices, severity, notes, has_phantom_advance, has_mistagged_receipts, has_overpaid_invoices, has_sr_invoice_drift",
        )
        .eq("organization_id", currentOrganization!.id)
        .eq("customer_id", customerId!)
        .order("check_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as ReconHistoryRow[];
    },
  });

  const runFullReconciliation = async () => {
    if (!currentOrganization?.id) return;
    setReconRunning(true);
    try {
      const { data, error } = await (supabase.rpc as any)("run_nightly_balance_reconciliation", {
        p_organization_id: currentOrganization.id,
      });
      if (error) throw error;
      const summary = data as {
        checked?: number;
        warnings?: number;
        critical?: number;
        ok?: number;
        date?: string;
      };
      setLastReconSummary({
        checked: Number(summary?.checked ?? 0),
        warnings: Number(summary?.warnings ?? 0),
        critical: Number(summary?.critical ?? 0),
        ok: Number(summary?.ok ?? 0),
        date: String(summary?.date ?? format(new Date(), "yyyy-MM-dd")),
      });
      await refetchReconHistory();
      toast({
        title: "Reconciliation complete",
        description: `Checked ${summary?.checked ?? 0} customers: ${summary?.critical ?? 0} critical, ${summary?.warnings ?? 0} warnings, ${summary?.ok ?? 0} OK.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Reconciliation failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setReconRunning(false);
    }
  };

  const exportExcel = () => {
    if (!selectedCustomer || !math || !auditBundle) return;
    const rows: (string | number)[][] = [
      ["Customer Audit Report"],
      [currentOrganization?.name || ""],
      ["Customer", selectedCustomer.customer_name],
      ["Phone", selectedCustomer.phone || ""],
      ["Period", `${fromYmd} → ${toYmd}`],
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
    rows.push([]);
    rows.push(["Reconciliation"]);
    rows.push(["Opening Balance", math.openingBalance]);
    rows.push(["Total Invoiced", math.totalInvoiced]);
    rows.push(["Sale return adjust (on invoices)", -math.totalSaleReturnAdjust]);
    rows.push(["Net Invoiced", netInvoiced]);
    rows.push(["Receipts (excl. Adv Adj)", -math.receiptCredits]);
    rows.push(["Payments / Refunds to customer", math.customerPaymentDebits]);
    rows.push(["Credit notes", -math.creditNoteCredits]);
    rows.push(["Advance applied to invoices", -math.totalAdvanceUsed]);
    rows.push(["Unused advance (net)", -math.unusedAdvance]);
    rows.push(["Outstanding (+ = Dr)", math.outstanding]);

    if (cancelledInvoices.length > 0) {
      rows.push([]);
      rows.push(["Cancelled Invoices (excluded from balance)"]);
      rows.push(["Date", "Invoice No", "Amount", "Cancelled Reason"]);
      cancelledInvoices.forEach((inv: any) => {
        rows.push([
          String(inv.sale_date || "").slice(0, 10),
          inv.sale_number || "—",
          Number(inv.net_amount || 0),
          inv.cancelled_reason || "No reason recorded",
        ]);
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Audit");
    const safeName = selectedCustomer.customer_name.replace(/[^\w\-]+/g, "_").slice(0, 40);
    XLSX.writeFile(wb, `Customer_Audit_${safeName}_${fromYmd}_to_${toYmd}.xlsx`);
  };

  if (!currentOrganization?.id) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background p-4 print:p-0 print:bg-white">
      <div className="max-w-[1600px] mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Customer Audit Report</h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Mathematically verified outstanding balance — for cross-checking with Customer Account
                Statement
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
              Print Report
            </Button>
            <Button
              variant="outline"
              onClick={exportExcel}
              disabled={!selectedCustomer || !math || displayRows.length === 0}
            >
              <FileDown className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => void runIntegrityCheck()}
              disabled={!selectedCustomer || !currentOrganization?.id}
            >
              <Search className="h-4 w-4 mr-2" />
              Integrity check
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => void runFullReconciliation()}
                disabled={!currentOrganization?.id || reconRunning}
              >
                {reconRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Run full reconciliation
              </Button>
            )}
          </div>
        </div>

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
                              className={cn(
                                "mr-2 h-4 w-4",
                                customerId === c.id ? "opacity-100" : "opacity-0",
                              )}
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
              {(error as Error).message || "Failed to load audit data"}
            </CardContent>
          </Card>
        )}

        <div ref={printRef} className="space-y-4">
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold">{currentOrganization.name}</h1>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Customer Audit Report
            </h2>
            {selectedCustomer && (
              <p className="text-sm">
                Customer: <strong>{selectedCustomer.customer_name}</strong>
                {selectedCustomer.phone ? ` (${selectedCustomer.phone})` : ""}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Period: {fromYmd} → {toYmd}
            </p>
          </div>

          {math && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="shadow-sm border-l-4 border-l-amber-500">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                      Total Billed (Dr)
                    </div>
                    <div className="text-2xl font-bold mt-1 tabular-nums">₹ {fmt(math.totalInvoiced)}</div>
                    <p className="text-[10px] text-muted-foreground mt-1">Invoices in period (net)</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-l-4 border-l-emerald-500">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                      Total Received (Cr)
                    </div>
                    <div className="text-2xl font-bold mt-1 tabular-nums">₹ {fmt(card2Total)}</div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Receipts &amp; credit notes (excl. Adv Adj) + all advance booked (lifetime)
                    </p>
                  </div>
                </CardContent>
              </Card>
              {finalOutstanding > 0.005 ? (
                <Card className="shadow-sm border-l-4 border-l-red-500 text-red-700 dark:text-red-400">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-wide font-medium opacity-80">Outstanding</div>
                    <div className="text-2xl font-bold mt-1 tabular-nums">
                      ₹ {fmt(finalOutstanding)} Dr
                    </div>
                  </CardContent>
                </Card>
              ) : finalOutstanding < -0.005 ? (
                <Card className="shadow-sm border-l-4 border-l-emerald-600 text-emerald-700 dark:text-emerald-300">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-wide font-medium opacity-80">
                      Customer Credit
                    </div>
                    <div className="text-2xl font-bold mt-1 tabular-nums">
                      ₹ {fmt(Math.abs(finalOutstanding))} Cr
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="shadow-sm border-l-4 border-l-blue-500 text-blue-700 dark:text-blue-300">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-wide font-medium opacity-80">Settled</div>
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
                    <TableHead className="border px-3 py-2 text-xs">Date</TableHead>
                    <TableHead className="border px-3 py-2 text-xs">Type</TableHead>
                    <TableHead className="border px-3 py-2 text-xs">VCH/REF NO</TableHead>
                    <TableHead className="border px-3 py-2 text-xs">Particulars</TableHead>
                    <TableHead className="border px-3 py-2 text-xs text-right">Debit (₹)</TableHead>
                    <TableHead className="border px-3 py-2 text-xs text-right">Credit (₹)</TableHead>
                    <TableHead className="border px-3 py-2 text-xs text-right">Balance (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!selectedCustomer ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        Select a customer to run the audit
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
                          <TableCell className="border px-3 py-1.5 font-medium text-xs uppercase">
                            {r.type}
                          </TableCell>
                          <TableCell className="border px-3 py-1.5 font-mono text-xs">{r.ref}</TableCell>
                          <TableCell className="border px-3 py-1.5 max-w-md">
                            {r.particulars}
                            {r.internal && (
                              <span className="block text-[11px] not-italic text-muted-foreground mt-0.5">
                                {r.internalHint ?? "(reclassification — does not change balance)"}
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
              </Table>
            </div>
          </Card>

          {cancelledInvoices.length > 0 && (
            <Card className="border-orange-200 bg-orange-50/40 dark:bg-orange-950/20">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-base flex items-center gap-2 text-orange-700 dark:text-orange-400">
                  <XCircle className="h-4 w-4" />
                  Cancelled Invoices in Period ({cancelledInvoices.length})
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    — excluded from balance calculation
                  </span>
                </h3>
                <div className="overflow-x-auto">
                  <Table className="border-collapse text-[13px]">
                    <TableHeader>
                      <TableRow className="bg-orange-100/60 dark:bg-orange-900/20">
                        <TableHead className="border px-3 py-2 text-xs">Date</TableHead>
                        <TableHead className="border px-3 py-2 text-xs">Invoice No</TableHead>
                        <TableHead className="border px-3 py-2 text-xs text-right">Amount (₹)</TableHead>
                        <TableHead className="border px-3 py-2 text-xs">Cancellation Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cancelledInvoices.map((inv: any) => (
                        <TableRow key={inv.id} className="opacity-75">
                          <TableCell className="border px-3 py-1.5 whitespace-nowrap">
                            {inv.sale_date
                              ? format(
                                  new Date(String(inv.sale_date).slice(0, 10) + "T12:00:00"),
                                  "dd-MM-yyyy",
                                )
                              : "—"}
                          </TableCell>
                          <TableCell className="border px-3 py-1.5 font-mono text-xs line-through decoration-orange-400">
                            {inv.sale_number || "—"}
                          </TableCell>
                          <TableCell className="border px-3 py-1.5 text-right font-mono tabular-nums line-through decoration-orange-400">
                            {fmt(Number(inv.net_amount || 0))}
                          </TableCell>
                          <TableCell className="border px-3 py-1.5 text-xs text-muted-foreground">
                            {inv.cancelled_reason || "No reason recorded"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-orange-700/70 dark:text-orange-300/70">
                  These invoices were cancelled by a user. Stock was restored and balances were not
                  affected. They are shown here for audit transparency only.
                </p>
              </CardContent>
            </Card>
          )}

          {srIntegrityDrift.length > 0 && (
            <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/25">
              <CardContent className="p-4 space-y-2">
                <h3 className="font-semibold text-base flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Sale return ↔ invoice mismatch ({srIntegrityDrift.length})
                </h3>
                <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
                  These linked sale returns are marked adjusted but their net amount does not match the
                  invoice&apos;s sale return adjustment. Correct the data or re-apply credit so the
                  customer&apos;s balance stays accurate.
                </p>
                <ul className="text-xs font-mono space-y-1 list-disc pl-4">
                  {srIntegrityDrift.map((row) => (
                    <li key={row.sale_return_id}>
                      {row.return_number || row.sale_return_id.slice(0, 8)} → {row.sale_number || "—"}:
                      drift ₹{fmt(Math.abs(Number(row.drift_amount)))}{" "}
                      (SR ₹{fmt(Number(row.sr_net_amount))} vs inv. adjust ₹
                      {fmt(Number(row.invoice_sra ?? 0))})
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {math && auditBundle && (
            <Card>
              <CardContent className="p-4 space-y-3 text-sm">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Balance reconciliation
                </h3>
                <div className="font-mono text-[13px] space-y-1 max-w-lg">
                  <div className="flex justify-between gap-4">
                    <span>Opening Balance</span>
                    <span>₹ {fmt(math.openingBalance)}</span>
                  </div>
                  {math.adjustmentTotal !== 0 && (
                    <div className="flex justify-between gap-4">
                      <span className={math.adjustmentTotal < 0 ? "text-green-600" : "text-red-600"}>
                        ({math.adjustmentTotal < 0 ? "−" : "+"}) Balance Adjustments
                      </span>
                      <span>₹ {fmt(Math.abs(math.adjustmentTotal))}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <span>(+) Total Invoiced</span>
                    <span>₹ {fmt(math.totalInvoiced)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>(-) Sale Returns (adjust on invoices)</span>
                    <span>₹ {fmt(math.totalSaleReturnAdjust)}</span>
                  </div>
                  <div className="flex justify-between gap-4 font-semibold border-t border-border pt-1">
                    <span>(=) Net Invoiced</span>
                    <span>₹ {fmt(netInvoiced)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>(-) Real Cash/UPI/Card Receipts</span>
                    <span>₹ {fmt(math.receiptCredits)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-0">
                    Excludes advance-application receipts (Adv Adj).
                  </p>
                  <div className="flex justify-between gap-4">
                    <span>(+) Payments / Refunds to Customer</span>
                    <span>₹ {fmt(math.customerPaymentDebits)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>(-) Credit notes (customer)</span>
                    <span>₹ {fmt(math.creditNoteCredits)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>(-) Advance Applied to Invoices</span>
                    <span>₹ {fmt(math.totalAdvanceUsed)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>(-) Unused Advance Credit</span>
                    <span>₹ {fmt(math.unusedAdvance)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Advance applied + unused advance (after refunds) equals total advance received — both
                    reduce what the customer owes.
                  </p>
                  <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold text-base">
                    <span>
                      {math.outstanding >= 0 ? "OUTSTANDING (Dr)" : "CREDIT (Cr)"}
                    </span>
                    <span>
                      ₹ {fmt(Math.abs(math.outstanding))} {math.outstanding >= 0 ? "Dr" : "Cr"}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground border-t pt-3">
                  Adv Adj entries appear above as &quot;Internal Transfer&quot; but do not affect the
                  balance because the cash was already counted when the advance was originally received.
                </p>
                <p className="text-xs text-muted-foreground">
                  The table running balance starts from{" "}
                  <span className="font-mono font-medium text-foreground">₹ {fmt(openingCarried)}</span>{" "}
                  (opening balance on file plus all movements before {fromYmd}). The summary
                  outstanding above uses the master opening balance with period invoices and vouchers
                  — compare both to your books if you use a partial period.
                </p>
              </CardContent>
            </Card>
          )}

          {dbTrueBalance != null &&
            lifetimeFormula != null &&
            Math.abs(lifetimeFormula.outstanding - dbTrueBalance) > 1 && (
              <Card className="border-red-300 bg-red-50/60 dark:bg-red-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Balance integrity warning
                  </div>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                    The lifetime audit formula shows ₹{fmt(Math.abs(lifetimeFormula.outstanding))}{" "}
                    {lifetimeFormula.outstanding >= 0 ? "Dr" : "Cr"} but the database cross-check
                    calculates ₹{fmt(Math.abs(dbTrueBalance))} {dbTrueBalance >= 0 ? "Dr" : "Cr"}.
                    Difference: ₹{fmt(Math.abs(lifetimeFormula.outstanding - dbTrueBalance))}. This may
                    indicate drift between SQL and the report formula. Use Integrity check for a
                    component breakdown or contact support.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Integrity uses all-time totals; FY cards above are date-filtered.
                  </p>
                </CardContent>
              </Card>
            )}

          {selectedCustomer && (
            <Card className="print:hidden">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Nightly reconciliation history
                </h3>
                {lastReconSummary && (
                  <p className="text-xs text-muted-foreground">
                    Last manual run ({lastReconSummary.date}): checked {lastReconSummary.checked} —{" "}
                    {lastReconSummary.critical} critical, {lastReconSummary.warnings} warnings,{" "}
                    {lastReconSummary.ok} OK.
                  </p>
                )}
                {reconHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No logged issues for this customer in the last 30 days (only warnings/critical are
                    stored).
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {reconHistory.map((row) => {
                      const d = String(row.check_date).slice(0, 10);
                      const out = Number(row.rpc_outstanding || 0);
                      const drift = Number(row.drift_rpc_vs_invoices || 0);
                      const icon =
                        row.severity === "critical" ? "🔴" : row.severity === "warning" ? "🟡" : "✅";
                      return (
                        <li
                          key={d + row.severity}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/60 pb-2 last:border-0"
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            {format(new Date(d + "T12:00:00"), "dd-MMM-yyyy")}:
                          </span>
                          <span>
                            {icon}{" "}
                            {row.severity === "ok" ? "OK" : row.severity} — Outstanding ₹
                            {fmt(Math.abs(out))} {out >= 0 ? "Dr" : "Cr"}
                          </span>
                          {drift > 1 && (
                            <span className="text-amber-700 dark:text-amber-300 text-xs">
                              Drift ₹{fmt(drift)}
                            </span>
                          )}
                          {row.notes && (
                            <span className="text-xs text-muted-foreground w-full">{row.notes}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="bg-muted/30">
            <CardContent className="p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Compare with Customer Account Statement</p>
              <p>
                To verify, open the same customer in Customer Account Statement and compare the Closing
                Balance shown there with the OUTSTANDING shown here. If they match, both views are
                consistent. If they differ, this audit view shows the mathematically corrected value for
                advance-application handling.
              </p>
            </CardContent>
          </Card>
        </div>

        <Dialog open={integrityDialogOpen} onOpenChange={setIntegrityDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Balance integrity breakdown</DialogTitle>
              <DialogDescription>
                Lifetime components from the database (SUM(amount) = true outstanding per migration
                comments). Positive amount increases net receivable (Dr).
              </DialogDescription>
            </DialogHeader>
            {integrityBreakdown && integrityBreakdown.length > 0 ? (
              <div className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {integrityBreakdown.map((row) => (
                      <TableRow key={row.source}>
                        <TableCell className="font-mono text-xs">{row.source}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmt(Math.abs(row.amount))}
                          {row.amount !== 0 ? ` ${row.amount >= 0 ? "Dr" : "Cr"}` : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.detail}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell>Total (true balance)</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {integrityTotal != null && (
                          <>
                            {fmt(Math.abs(integrityTotal))} {integrityTotal >= 0 ? "Dr" : "Cr"}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">SUM(amount)</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data.</p>
            )}
          </DialogContent>
        </Dialog>
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
