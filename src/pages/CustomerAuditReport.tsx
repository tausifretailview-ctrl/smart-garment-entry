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
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import { cn } from "@/lib/utils";
import { computeCustomerOutstanding, isAdvanceApplicationVoucher } from "@/utils/customerAuditMath";
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

interface CustomerOption {
  id: string;
  customer_name: string;
  phone: string | null;
}

interface AuditRow {
  id: string;
  at: string;
  type: string;
  ref: string;
  particulars: string;
  debit: number;
  credit: number;
  internal: boolean;
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** INR display helper (matches Customer Account Statement style). */
const fmt = (n: number) => (Math.abs(n) >= 0.005 ? inr.format(Math.abs(n)) : "");

function voucherCreditAmount(v: { total_amount?: number | null; discount_amount?: number | null }) {
  return Math.max(0, Number(v.total_amount || 0) + Number(v.discount_amount || 0));
}

function ymdBoundary(d: Date | undefined): string | null {
  if (!d) return null;
  return format(d, "yyyy-MM-dd");
}

function buildAuditRows(params: {
  sales: any[];
  saleReturns: any[];
  vouchers: any[];
  advances: any[];
  refunds: any[];
}): AuditRow[] {
  const rows: AuditRow[] = [];

  for (const s of params.sales) {
    const st = String(s.payment_status || "").toLowerCase();
    if (st === "cancelled" || st === "hold") continue;
    const d = String(s.sale_date || "").slice(0, 10);
    const net = Number(s.net_amount || 0);
    const sn = String(s.sale_number || "").trim() || "—";
    rows.push({
      id: `sale-${s.id}`,
      at: d,
      type: "Sale",
      ref: sn,
      particulars: `Invoice ${sn}`,
      debit: net,
      credit: 0,
      internal: false,
    });
    const sra = Number(s.sale_return_adjust || 0);
    if (sra > 0.005) {
      rows.push({
        id: `sra-${s.id}`,
        at: d,
        type: "Sale return adjust",
        ref: sn,
        particulars: `Sale return / credit adjusted to ${sn}`,
        debit: 0,
        credit: sra,
        internal: false,
      });
    }
  }

  for (const sr of params.saleReturns) {
    const cs = String(sr.credit_status || "").toLowerCase();
    if (cs === "adjusted") continue;
    const d = String(sr.return_date || "").slice(0, 10);
    const rn = String(sr.return_number || "").trim() || "—";
    rows.push({
      id: `sr-${sr.id}`,
      at: d,
      type: "Sale Return",
      ref: rn,
      particulars: String(sr.notes || "").trim() || `Sale return / credit note ${rn}`,
      debit: 0,
      credit: Number(sr.net_amount || 0),
      internal: false,
    });
  }

  for (const v of params.vouchers) {
    const d = String(v.voucher_date || "").slice(0, 10);
    const vn = String(v.voucher_number || "").trim() || "—";
    const vt = String(v.voucher_type || "").toLowerCase();
    const refT = String(v.reference_type || "").toLowerCase();

    if (vt === "receipt" && refT === "sale" && isAdvanceApplicationVoucher(v)) {
      rows.push({
        id: `ve-adv-${v.id}`,
        at: d,
        type: "Internal Transfer",
        ref: vn,
        particulars: String(v.description || "Advance applied to invoice").trim(),
        debit: 0,
        credit: 0,
        internal: true,
      });
      continue;
    }

    if (vt === "receipt") {
      const cr = voucherCreditAmount(v);
      if (cr <= 0) continue;
      rows.push({
        id: `ve-rcpt-${v.id}`,
        at: d,
        type: "Receipt",
        ref: vn,
        particulars: String(v.description || "Receipt").trim() || "Receipt",
        debit: 0,
        credit: cr,
        internal: false,
      });
      continue;
    }

    if (vt === "credit_note" && refT === "customer") {
      const cr = voucherCreditAmount(v);
      if (cr <= 0) continue;
      rows.push({
        id: `ve-cn-${v.id}`,
        at: d,
        type: "Credit Note",
        ref: vn,
        particulars: String(v.description || "Credit note").trim(),
        debit: 0,
        credit: cr,
        internal: false,
      });
      continue;
    }

    if (vt === "payment" && refT === "customer") {
      const dr = Number(v.total_amount || 0);
      if (dr <= 0) continue;
      rows.push({
        id: `ve-pay-${v.id}`,
        at: d,
        type: "Payment",
        ref: vn,
        particulars: String(v.description || "Payment / refund to customer").trim(),
        debit: dr,
        credit: 0,
        internal: false,
      });
    }
  }

  for (const a of params.advances) {
    const d = String(a.advance_date || "").slice(0, 10);
    const an = String(a.advance_number || "").trim() || "—";
    const amt = Number(a.amount || 0);
    if (amt <= 0) continue;
    const pm = a.payment_method ? String(a.payment_method) : "";
    rows.push({
      id: `adv-${a.id}`,
      at: d,
      type: "Advance Booking",
      ref: an,
      particulars:
        (a.description ? `${a.description} — ` : "") +
        `Advance booking${pm ? ` (${pm})` : ""}${a.status ? ` [${a.status}]` : ""}`,
      debit: 0,
      credit: amt,
      internal: false,
    });
  }

  for (const r of params.refunds) {
    const d = String(r.refund_date || "").slice(0, 10);
    const dr = Number(r.refund_amount || 0);
    if (dr <= 0) continue;
    rows.push({
      id: `arf-${r.id}`,
      at: d,
      type: "Advance Refund",
      ref: `REF-${String(r.id).slice(0, 8)}`,
      particulars: String(r.reason || "Advance refund").trim() + (r.payment_method ? ` (${r.payment_method})` : ""),
      debit: dr,
      credit: 0,
      internal: false,
    });
  }

  rows.sort((a, b) => {
    if (a.at !== b.at) return a.at.localeCompare(b.at);
    return a.id.localeCompare(b.id);
  });

  return rows;
}

export default function CustomerAuditReport() {
  const { currentOrganization } = useOrganization();
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
      const orgId = currentOrganization!.id;
      const custId = customerId!;

      const { data: customerRow, error: custErr } = await supabase
        .from("customers")
        .select("id, customer_name, phone, opening_balance, organization_id")
        .eq("id", custId)
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .maybeSingle();
      if (custErr) throw custErr;
      if (!customerRow) throw new Error("Customer not found");

      const { data: allSales, error: salesErr } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, net_amount, sale_return_adjust, payment_status")
        .eq("customer_id", custId)
        .eq("organization_id", orgId)
        .is("deleted_at", null);
      if (salesErr) throw salesErr;

      const saleIds = (allSales || []).map((s: { id: string }) => s.id).filter(Boolean);

      const { data: saleReturns, error: srErr } = await supabase
        .from("sale_returns")
        .select("id, return_number, return_date, net_amount, credit_status, notes")
        .eq("customer_id", custId)
        .eq("organization_id", orgId)
        .is("deleted_at", null);
      if (srErr) throw srErr;

      let veCustQ = supabase
        .from("voucher_entries")
        .select(
          "id, voucher_number, voucher_date, voucher_type, reference_type, reference_id, total_amount, discount_amount, description, payment_method",
        )
        .eq("organization_id", orgId)
        .eq("reference_type", "customer")
        .eq("reference_id", custId)
        .is("deleted_at", null)
        .in("voucher_type", ["receipt", "payment", "credit_note"]);

      const { data: vouchersCustomer, error: veCustErr } = await veCustQ;
      if (veCustErr) throw veCustErr;

      // Legacy safety: refund vouchers for sale returns may still reference an old/orphan customer_id.
      // Pull them by matching SR number in description.
      let vouchersRefundBySr: any[] = [];
      const returnNumbers = (saleReturns || [])
        .map((sr: any) => String(sr.return_number || "").trim())
        .filter(Boolean);
      if (returnNumbers.length > 0) {
        const orFilter = returnNumbers
          .map((rn: string) => `description.ilike.%${rn.replace(/[%,()]/g, " ")}%`)
          .join(",");
        if (orFilter) {
          const { data: vr, error: vrErr } = await supabase
            .from("voucher_entries")
            .select(
              "id, voucher_number, voucher_date, voucher_type, reference_type, reference_id, total_amount, discount_amount, description, payment_method",
            )
            .eq("organization_id", orgId)
            .eq("voucher_type", "payment")
            .eq("reference_type", "customer")
            .is("deleted_at", null)
            .or(orFilter);
          if (vrErr) throw vrErr;
          vouchersRefundBySr = vr || [];
        }
      }

      let vouchersSale: any[] = [];
      if (saleIds.length > 0) {
        const { data: vs, error: veSaleErr } = await supabase
          .from("voucher_entries")
          .select(
            "id, voucher_number, voucher_date, voucher_type, reference_type, reference_id, total_amount, discount_amount, description, payment_method",
          )
          .eq("organization_id", orgId)
          .eq("voucher_type", "receipt")
          .eq("reference_type", "sale")
          .in("reference_id", saleIds)
          .is("deleted_at", null);
        if (veSaleErr) throw veSaleErr;
        vouchersSale = vs || [];
      }

      const voucherById = new Map<string, any>();
      for (const v of [...(vouchersCustomer || []), ...vouchersSale, ...vouchersRefundBySr]) {
        voucherById.set(v.id, v);
      }
      const vouchersMerged = Array.from(voucherById.values());

      const { data: advances, error: advErr } = await supabase
        .from("customer_advances")
        .select("id, advance_number, advance_date, amount, used_amount, status, description, payment_method")
        .eq("customer_id", custId)
        .eq("organization_id", orgId);
      if (advErr) throw advErr;

      const advanceIds = (advances || []).map((a: { id: string }) => a.id).filter(Boolean);
      let refunds: any[] = [];
      if (advanceIds.length > 0) {
        const { data: ar, error: arErr } = await supabase
          .from("advance_refunds")
          .select("id, refund_date, refund_amount, advance_id, reason, payment_method")
          .eq("organization_id", orgId)
          .in("advance_id", advanceIds);
        if (arErr) throw arErr;
        refunds = ar || [];
      }

      return {
        customer: customerRow,
        allSales: allSales || [],
        vouchersMerged,
        saleReturns: saleReturns || [],
        advances: advances || [],
        refunds,
      };
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
    return computeCustomerOutstanding({
      openingBalance: Number(auditBundle.customer.opening_balance || 0),
      sales: salesInRange,
      voucherEntries: vouchersInRange,
      customerAdvances: auditBundle.advances,
      advanceRefunds: auditBundle.refunds,
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
    });
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

  const netInvoiced =
    math != null ? math.totalInvoiced - math.totalSaleReturnAdjust : 0;

  const card2Total =
    math != null ? math.totalRealPayments + math.totalAdvanceReceived : 0;

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
              {math.outstanding > 0.005 ? (
                <Card className="shadow-sm border-l-4 border-l-red-500 text-red-700 dark:text-red-400">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-wide font-medium opacity-80">Outstanding</div>
                    <div className="text-2xl font-bold mt-1 tabular-nums">
                      ₹ {fmt(math.outstanding)} Dr
                    </div>
                  </CardContent>
                </Card>
              ) : math.outstanding < -0.005 ? (
                <Card className="shadow-sm border-l-4 border-l-emerald-600 text-emerald-700 dark:text-emerald-300">
                  <CardContent className="p-4">
                    <div className="text-xs uppercase tracking-wide font-medium opacity-80">
                      Customer Credit
                    </div>
                    <div className="text-2xl font-bold mt-1 tabular-nums">
                      ₹ {fmt(Math.abs(math.outstanding))} Cr
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
              </Table>
            </div>
          </Card>

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
