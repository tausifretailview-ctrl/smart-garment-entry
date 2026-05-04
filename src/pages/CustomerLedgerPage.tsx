import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon, Printer, FileText, ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import { cn } from "@/lib/utils";
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
import { Check, ChevronsUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface LedgerRow {
  id: string;
  transaction_date: string;
  voucher_type: string;
  voucher_no: string | null;
  particulars: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

interface CustomerOption {
  id: string;
  customer_name: string;
  phone: string | null;
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAmt = (n: number) => (n ? inr.format(Math.abs(n)) : "");

/**
 * Statement running balance uses `running += debit - credit` (negative = customer Cr).
 * Advance / CN *applications* are not new receipts — they allocate existing customer-side
 * credit; they must post as **debit** so totals and closing balance match reality.
 */
function normalizeApplicationLedgerRow(row: LedgerRow): LedgerRow {
  const vt = (row.voucher_type || "").toUpperCase();
  if (vt !== "ADVANCE_APPLIED" && vt !== "CN_APPLIED") return row;
  const cr = Number(row.credit || 0);
  const dr = Number(row.debit || 0);
  if (cr > 0.005 && dr < 0.005) {
    return { ...row, debit: cr, credit: 0 };
  }
  return row;
}

export default function CustomerLedgerPage() {
  const { currentOrganization } = useOrganization();
  const [searchParams] = useSearchParams();
  const preSelectedCustomerId = searchParams.get("customer");

  // Default to current Indian Financial Year (1-Apr → 31-Mar)
  const { fyStart, fyEnd } = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth(); // 0-indexed
    const startYear = m >= 3 ? y : y - 1; // Apr=3
    return {
      fyStart: new Date(startYear, 3, 1),
      fyEnd: new Date(startYear + 1, 2, 31),
    };
  }, []);

  const [customerId, setCustomerId] = useState<string | null>(preSelectedCustomerId);
  const [fromDate, setFromDate] = useState<Date | undefined>(fyStart);
  const [toDate, setToDate] = useState<Date | undefined>(fyEnd);
  const [custOpen, setCustOpen] = useState(false);

  // Customers list — paginate past PostgREST default max (1000 rows).
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-ledger", currentOrganization?.id],
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

  const { data: ledger = [], isFetching } = useQuery({
    queryKey: [
      "customer-ledger-statement",
      currentOrganization?.id,
      customerId,
      fromDate?.toISOString() ?? null,
      toDate?.toISOString() ?? null,
    ],
    enabled: !!currentOrganization?.id && !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_ledger_statement", {
        p_customer_id: customerId!,
        p_organization_id: currentOrganization!.id,
        p_start_date: fromDate ? format(fromDate, "yyyy-MM-dd") : undefined,
        p_end_date: toDate ? format(toDate, "yyyy-MM-dd") : undefined,
      });
      if (error) throw error;

      const rpcRowsNormalized = ((data ?? []) as LedgerRow[]).map(normalizeApplicationLedgerRow);

      // Mamta Footwear customer balance reconciliation - Apr 2026:
      // ensure in-range invoices are never dropped by RPC-side joins/filters.
      let salesQuery = supabase
        .from("sales")
        .select("id, sale_number, sale_date, net_amount, payment_status")
        .eq("customer_id", customerId!)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .not("payment_status", "in", '("cancelled","hold")');
      if (fromDate) salesQuery = salesQuery.gte("sale_date", format(fromDate, "yyyy-MM-dd"));
      if (toDate) salesQuery = salesQuery.lte("sale_date", format(toDate, "yyyy-MM-dd"));

      const { data: inRangeSales, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      const existingInvoiceRefs = new Set(
        rpcRowsNormalized
          .filter((row) => Number(row.debit || 0) > 0)
          .map((row) => (row.voucher_no || "").trim())
      );

      const missingInvoiceRows: LedgerRow[] = (inRangeSales || [])
        .filter((sale: any) => !existingInvoiceRefs.has((sale.sale_number || "").trim()))
        .map((sale: any) => ({
          id: `sale-${sale.id}`,
          transaction_date: sale.sale_date,
          voucher_type: "INVOICE",
          voucher_no: sale.sale_number || null,
          particulars: `Invoice - ${sale.payment_status || "pending"}`,
          debit: Number(sale.net_amount || 0),
          credit: 0,
          running_balance: 0,
        }));

      // Include sale return / credit note adjustments in statement transactions.
      let saleReturnsQuery = supabase
        .from("sale_returns")
        .select("id, return_number, return_date, net_amount, credit_status, created_at")
        .eq("customer_id", customerId!)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null);

      if (fromDate) saleReturnsQuery = saleReturnsQuery.gte("return_date", format(fromDate, "yyyy-MM-dd"));
      if (toDate) saleReturnsQuery = saleReturnsQuery.lte("return_date", format(toDate, "yyyy-MM-dd"));

      const { data: saleReturns, error: saleReturnsError } = await saleReturnsQuery;
      if (saleReturnsError) throw saleReturnsError;

      // Also include direct credit-note vouchers when present in ledger period.
      let creditNoteVouchersQuery = supabase
        .from("voucher_entries")
        .select("id, voucher_number, voucher_date, total_amount, description")
        .eq("organization_id", currentOrganization!.id)
        .eq("voucher_type", "credit_note")
        .eq("reference_type", "customer")
        .eq("reference_id", customerId!)
        .is("deleted_at", null);

      if (fromDate) creditNoteVouchersQuery = creditNoteVouchersQuery.gte("voucher_date", format(fromDate, "yyyy-MM-dd"));
      if (toDate) creditNoteVouchersQuery = creditNoteVouchersQuery.lte("voucher_date", format(toDate, "yyyy-MM-dd"));

      const { data: creditNoteVouchers, error: creditNoteVouchersError } = await creditNoteVouchersQuery;
      if (creditNoteVouchersError) throw creditNoteVouchersError;

      const existingReturnRefs = new Set(
        rpcRowsNormalized
          .filter((row) => Number(row.credit || 0) > 0)
          .map((row) => (row.voucher_no || "").trim())
      );

      // Fully applied to invoice(s): settlement appears as CN_APPLIED / sale receipts — omit duplicate SR credit.
      const returnRows: LedgerRow[] = (saleReturns || [])
        .filter((sr: any) => String(sr.credit_status || "").toLowerCase() !== "adjusted")
        .map((sr: any) => ({
        id: `sr-${sr.id}`,
        transaction_date: sr.return_date,
        voucher_type: sr.credit_status === "pending" ? "CREDIT_NOTE" : sr.credit_status === "adjusted_outstanding" ? "CREDIT_NOTE" : "SALE_RETURN",
        voucher_no: sr.return_number || null,
        particulars:
          sr.credit_status === "pending"
            ? `Credit Note pending adjustment (${sr.return_number || "N/A"})`
            : sr.credit_status === "adjusted_outstanding"
            ? `Credit Note adjusted to outstanding (${sr.return_number || "N/A"})`
            : `Sale Return / Credit Note (${sr.return_number || "N/A"})`,
        debit: 0,
        credit: Number(sr.net_amount || 0),
        running_balance: 0,
      }))
        .filter((row) => !existingReturnRefs.has((row.voucher_no || "").trim()));

      const creditNoteRows: LedgerRow[] = (creditNoteVouchers || []).map((v: any) => ({
        id: `cnv-${v.id}`,
        transaction_date: v.voucher_date,
        voucher_type: "CREDIT_NOTE",
        voucher_no: v.voucher_number || null,
        particulars: v.description || "Credit Note",
        debit: 0,
        credit: Number(v.total_amount || 0),
        running_balance: 0,
      })).filter((row) => !existingReturnRefs.has((row.voucher_no || "").trim()));

      // Voucher numbers already represented (RPC + supplements) — skip duplicate voucher rows.
      const existingVoucherNumbers = new Set<string>();
      for (const row of [
        ...rpcRowsNormalized,
        ...missingInvoiceRows,
        ...returnRows,
        ...creditNoteRows,
      ]) {
        const vn = (row.voucher_no || "").trim();
        if (vn) existingVoucherNumbers.add(vn);
      }

      const voucherCreditAmount = (v: { total_amount?: number | null; discount_amount?: number | null }) =>
        Math.max(0, Number(v.total_amount || 0) + Number(v.discount_amount || 0));

      const receiptVoucherType = (paymentMethod: string | null | undefined) => {
        const pm = (paymentMethod || "").toLowerCase();
        if (pm === "advance_adjustment") return "ADVANCE_APPLIED";
        if (pm === "credit_note_adjustment") return "CN_APPLIED";
        return "RECEIPT";
      };

      // All sales for this customer (voucher_date filters receipts; sales may be older).
      const { data: custSaleList, error: custSaleListErr } = await supabase
        .from("sales")
        .select("id")
        .eq("customer_id", customerId!)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null);
      if (custSaleListErr) throw custSaleListErr;
      const saleIds = (custSaleList || []).map((s: { id: string }) => s.id).filter(Boolean);

      const saleReceiptLedgerRows: LedgerRow[] = [];
      if (saleIds.length > 0) {
        let veSaleQ = supabase
          .from("voucher_entries")
          .select(
            "id, voucher_number, voucher_date, total_amount, discount_amount, description, payment_method, reference_type, reference_id, voucher_type",
          )
          .eq("organization_id", currentOrganization!.id)
          .eq("voucher_type", "receipt")
          .eq("reference_type", "sale")
          .in("reference_id", saleIds)
          .is("deleted_at", null);
        if (fromDate) veSaleQ = veSaleQ.gte("voucher_date", format(fromDate, "yyyy-MM-dd"));
        if (toDate) veSaleQ = veSaleQ.lte("voucher_date", format(toDate, "yyyy-MM-dd"));
        const { data: saleReceiptVouchers, error: saleReceiptVouchersErr } = await veSaleQ;
        if (saleReceiptVouchersErr) throw saleReceiptVouchersErr;
        for (const v of saleReceiptVouchers || []) {
          const vn = ((v as any).voucher_number || "").trim();
          if (vn && existingVoucherNumbers.has(vn)) continue;
          if (vn) existingVoucherNumbers.add(vn);
          const cr = voucherCreditAmount(v as any);
          if (cr <= 0) continue;
          const pm = String((v as any).payment_method || "").toLowerCase();
          const isAdvanceApplied = pm === "advance_adjustment";
          const isCnApplied = pm === "credit_note_adjustment";
          const isAllocateExistingCredit = isAdvanceApplied || isCnApplied;
          saleReceiptLedgerRows.push({
            id: `ve-sale-${(v as any).id}`,
            transaction_date: (v as any).voucher_date,
            voucher_type: receiptVoucherType((v as any).payment_method),
            voucher_no: (v as any).voucher_number || null,
            particulars:
              (v as any).description ||
              `Receipt (${String((v as any).payment_method || "cash").replace(/_/g, " ")})`,
            debit: isAllocateExistingCredit ? cr : 0,
            credit: isAllocateExistingCredit ? 0 : cr,
            running_balance: 0,
          });
        }
      }

      // Opening balance payments & customer-level payment (refund) vouchers.
      let veCustQ = supabase
        .from("voucher_entries")
        .select(
          "id, voucher_number, voucher_date, total_amount, discount_amount, description, payment_method, voucher_type",
        )
        .eq("organization_id", currentOrganization!.id)
        .eq("reference_type", "customer")
        .eq("reference_id", customerId!)
        .is("deleted_at", null)
        .in("voucher_type", ["receipt", "payment"]);
      if (fromDate) veCustQ = veCustQ.gte("voucher_date", format(fromDate, "yyyy-MM-dd"));
      if (toDate) veCustQ = veCustQ.lte("voucher_date", format(toDate, "yyyy-MM-dd"));
      const { data: customerVouchers, error: customerVouchersErr } = await veCustQ;
      if (customerVouchersErr) throw customerVouchersErr;

      const customerVoucherLedgerRows: LedgerRow[] = [];
      for (const v of customerVouchers || []) {
        const vn = ((v as any).voucher_number || "").trim();
        if (vn && existingVoucherNumbers.has(vn)) continue;
        if (vn) existingVoucherNumbers.add(vn);
        const vtype = String((v as any).voucher_type || "").toLowerCase();
        if (vtype === "payment") {
          const dr = Number((v as any).total_amount || 0);
          if (dr <= 0) continue;
          customerVoucherLedgerRows.push({
            id: `ve-custpay-${(v as any).id}`,
            transaction_date: (v as any).voucher_date,
            voucher_type: "PAYMENT",
            voucher_no: (v as any).voucher_number || null,
            particulars: (v as any).description || "Payment / refund to customer",
            debit: dr,
            credit: 0,
            running_balance: 0,
          });
        } else {
          const cr = voucherCreditAmount(v as any);
          if (cr <= 0) continue;
          const pm = String((v as any).payment_method || "").toLowerCase();
          const isAllocateExistingCredit =
            pm === "advance_adjustment" || pm === "credit_note_adjustment";
          customerVoucherLedgerRows.push({
            id: `ve-cust-${(v as any).id}`,
            transaction_date: (v as any).voucher_date,
            voucher_type:
              pm === "advance_adjustment"
                ? "ADVANCE_APPLIED"
                : pm === "credit_note_adjustment"
                  ? "CN_APPLIED"
                  : "RECEIPT",
            voucher_no: (v as any).voucher_number || null,
            particulars: (v as any).description || "Receipt (customer account)",
            debit: isAllocateExistingCredit ? cr : 0,
            credit: isAllocateExistingCredit ? 0 : cr,
            running_balance: 0,
          });
        }
      }

      // Advance bookings (not always mirrored in customer_ledger_entries).
      let advBookQ = supabase
        .from("customer_advances")
        .select("id, advance_number, advance_date, amount, payment_method, description, status")
        .eq("customer_id", customerId!)
        .eq("organization_id", currentOrganization!.id);
      if (fromDate) advBookQ = advBookQ.gte("advance_date", format(fromDate, "yyyy-MM-dd"));
      if (toDate) advBookQ = advBookQ.lte("advance_date", format(toDate, "yyyy-MM-dd"));
      const { data: advanceBookings, error: advanceBookingsErr } = await advBookQ;
      if (advanceBookingsErr) throw advanceBookingsErr;

      const advanceBookingLedgerRows: LedgerRow[] = [];
      for (const a of advanceBookings || []) {
        const vn = ((a as any).advance_number || "").trim();
        if (vn && existingVoucherNumbers.has(vn)) continue;
        if (vn) existingVoucherNumbers.add(vn);
        const amt = Number((a as any).amount || 0);
        if (amt <= 0) continue;
        const pm = (a as any).payment_method ? String((a as any).payment_method) : "cash";
        advanceBookingLedgerRows.push({
          id: `adv-book-${(a as any).id}`,
          transaction_date: (a as any).advance_date,
          voucher_type: "ADVANCE",
          voucher_no: (a as any).advance_number || null,
          particulars:
            ((a as any).description ? `${(a as any).description} — ` : "") +
            `Advance booking (${pm})${(a as any).status ? ` [${(a as any).status}]` : ""}`,
          debit: 0,
          credit: amt,
          running_balance: 0,
        });
      }

      // Advance refunds (cash out) — debit.
      const { data: advIdsRows } = await supabase
        .from("customer_advances")
        .select("id")
        .eq("customer_id", customerId!)
        .eq("organization_id", currentOrganization!.id);
      const advanceIds = (advIdsRows || []).map((r: { id: string }) => r.id).filter(Boolean);
      const advanceRefundLedgerRows: LedgerRow[] = [];
      if (advanceIds.length > 0) {
        let arq = supabase
          .from("advance_refunds")
          .select("id, refund_date, refund_amount, reason, payment_method, advance_id")
          .eq("organization_id", currentOrganization!.id)
          .in("advance_id", advanceIds);
        if (fromDate) arq = arq.gte("refund_date", format(fromDate, "yyyy-MM-dd"));
        if (toDate) arq = arq.lte("refund_date", format(toDate, "yyyy-MM-dd"));
        const { data: advRefunds, error: advRefundsErr } = await arq;
        if (advRefundsErr) throw advRefundsErr;
        for (const r of advRefunds || []) {
          const dr = Number((r as any).refund_amount || 0);
          if (dr <= 0) continue;
          advanceRefundLedgerRows.push({
            id: `adv-ref-${(r as any).id}`,
            transaction_date: (r as any).refund_date,
            voucher_type: "ADV_REFUND",
            voucher_no: `REF-${String((r as any).id).slice(0, 8)}`,
            particulars:
              ((r as any).reason || "Advance refund") +
              ((r as any).payment_method ? ` (${(r as any).payment_method})` : ""),
            debit: dr,
            credit: 0,
            running_balance: 0,
          });
        }
      }

      // Manual balance adjustments (aligned with CustomerLedger adjustment math).
      let adjQ = supabase
        .from("customer_balance_adjustments")
        .select(
          "id, adjustment_date, reason, outstanding_difference, advance_difference",
        )
        .eq("customer_id", customerId!)
        .eq("organization_id", currentOrganization!.id);
      if (fromDate) adjQ = adjQ.gte("adjustment_date", format(fromDate, "yyyy-MM-dd"));
      if (toDate) adjQ = adjQ.lte("adjustment_date", format(toDate, "yyyy-MM-dd"));
      const { data: balAdjs, error: balAdjsErr } = await adjQ;
      if (balAdjsErr) throw balAdjsErr;

      const balanceAdjustmentLedgerRows: LedgerRow[] = [];
      for (const adj of balAdjs || []) {
        const outDiff = Number((adj as any).outstanding_difference || 0);
        const advDiff = Number((adj as any).advance_difference || 0);
        const debit =
          (outDiff > 0 ? outDiff : 0) + (advDiff < 0 ? Math.abs(advDiff) : 0);
        const credit =
          (outDiff < 0 ? Math.abs(outDiff) : 0) + (advDiff > 0 ? advDiff : 0);
        const net = Math.round((debit - credit) * 100) / 100;
        if (Math.abs(net) < 0.01) continue;
        if (net > 0) {
          balanceAdjustmentLedgerRows.push({
            id: `cba-${(adj as any).id}`,
            transaction_date: (adj as any).adjustment_date,
            voucher_type: "BAL_ADJ",
            voucher_no: `ADJ-${String((adj as any).id).slice(0, 8)}`,
            particulars: (adj as any).reason || "Balance adjustment",
            debit: net,
            credit: 0,
            running_balance: 0,
          });
        } else {
          balanceAdjustmentLedgerRows.push({
            id: `cba-${(adj as any).id}`,
            transaction_date: (adj as any).adjustment_date,
            voucher_type: "BAL_ADJ",
            voucher_no: `ADJ-${String((adj as any).id).slice(0, 8)}`,
            particulars: (adj as any).reason || "Balance adjustment",
            debit: 0,
            credit: -net,
            running_balance: 0,
          });
        }
      }

      const combined = (
        [
          ...rpcRowsNormalized,
          ...missingInvoiceRows,
          ...returnRows,
          ...creditNoteRows,
          ...saleReceiptLedgerRows,
          ...customerVoucherLedgerRows,
          ...advanceBookingLedgerRows,
          ...advanceRefundLedgerRows,
          ...balanceAdjustmentLedgerRows,
        ] as LedgerRow[]
      ).sort((a, b) => {
        const dA = new Date(a.transaction_date).getTime();
        const dB = new Date(b.transaction_date).getTime();
        if (dA !== dB) return dA - dB;
        return String(a.id).localeCompare(String(b.id));
      });

      // Recompute running balance after merge so header/table stay consistent.
      let running = 0;
      return combined.map((row) => {
        running += Number(row.debit || 0) - Number(row.credit || 0);
        return { ...row, running_balance: running };
      });
    },
  });

  // RPC returns DESC; for display we want chronological ASC so balance reads top→bottom
  const rows = useMemo(
    () =>
      [...ledger].sort(
        (a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime(),
      ),
    [ledger],
  );

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const closing = rows.length ? Number(rows[rows.length - 1].running_balance) : 0;

  const handlePrint = () => window.print();

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
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Customer Account Statement</h1>
            <p className="text-sm text-muted-foreground">
              Detailed ledger with running balance (Dr/Cr)
            </p>
          </div>
          <Button onClick={handlePrint} disabled={!selectedCustomer || rows.length === 0}>
            <Printer className="h-4 w-4 mr-2" /> Print Statement
          </Button>
        </div>

        {/* Controls */}
        <Card className="print:hidden">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Customer</label>
              <Popover open={custOpen} onOpenChange={setCustOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedCustomer
                      ? selectedCustomer.phone
                        ? `${selectedCustomer.customer_name} — ${selectedCustomer.phone}`
                        : selectedCustomer.customer_name
                      : <span className="text-muted-foreground">Select customer...</span>}
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

        {/* Print Header */}
        <div className="hidden print:block">
          <h1 className="text-xl font-bold">{currentOrganization.name}</h1>
          <h2 className="text-base font-semibold">Customer Account Statement</h2>
          {selectedCustomer && (
            <p className="text-sm">
              Customer: <strong>{selectedCustomer.customer_name}</strong>
              {selectedCustomer.phone ? ` (${selectedCustomer.phone})` : ""}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Period: {fromDate ? format(fromDate, "dd-MM-yyyy") : "Beginning"} →{" "}
            {toDate ? format(toDate, "dd-MM-yyyy") : "Today"}
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SummaryCard
            icon={<ArrowUpCircle className="h-5 w-5" />}
            label="Total Billed (Dr)"
            value={totalDebit}
            tone="debit"
          />
          <SummaryCard
            icon={<ArrowDownCircle className="h-5 w-5" />}
            label="Total Received / Returned (Cr)"
            value={totalCredit}
            tone="credit"
          />
          <SummaryCard
            icon={<Wallet className="h-5 w-5" />}
            label="Closing Balance"
            value={Math.abs(closing)}
            suffix={closing >= 0 ? "Dr" : "Cr"}
            tone={closing >= 0 ? "debit" : "credit"}
          />
        </div>

        {/* Ledger Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="border-collapse">
              <TableHeader>
                <TableRow className="bg-slate-100 dark:bg-muted/40 hover:bg-slate-100">
                  <TableHead className="border px-3 py-2 text-xs">Date</TableHead>
                  <TableHead className="border px-3 py-2 text-xs">Vch Type</TableHead>
                  <TableHead className="border px-3 py-2 text-xs">Vch / Ref No</TableHead>
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
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      Select a customer to view their account statement
                    </TableCell>
                  </TableRow>
                ) : isFetching ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      Loading ledger...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No transactions found for this period
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const debit = Number(r.debit || 0);
                    const credit = Number(r.credit || 0);
                    const bal = Number(r.running_balance || 0);
                    const rowTone =
                      debit > 0
                        ? "bg-red-50/30 hover:bg-red-50/60 dark:bg-red-950/10"
                        : credit > 0
                          ? "bg-green-50/30 hover:bg-green-50/60 dark:bg-green-950/10"
                          : "";
                    return (
                      <TableRow key={r.id} className={cn("text-[13px]", rowTone)}>
                        <TableCell className="border px-3 py-1.5 whitespace-nowrap">
                          {format(new Date(r.transaction_date), "dd-MM-yyyy")}
                        </TableCell>
                        <TableCell className="border px-3 py-1.5 font-medium uppercase text-xs">
                          {r.voucher_type}
                        </TableCell>
                        <TableCell className="border px-3 py-1.5 font-mono text-xs">
                          {r.voucher_no || "—"}
                        </TableCell>
                        <TableCell className="border px-3 py-1.5">
                          {r.particulars || "—"}
                        </TableCell>
                        <TableCell className="border px-3 py-1.5 text-right font-mono tabular-nums">
                          {debit > 0 ? fmtAmt(debit) : ""}
                        </TableCell>
                        <TableCell className="border px-3 py-1.5 text-right font-mono tabular-nums">
                          {credit > 0 ? fmtAmt(credit) : ""}
                        </TableCell>
                        <TableCell className="border px-3 py-1.5 text-right font-mono tabular-nums font-semibold">
                          {fmtAmt(bal)} {bal >= 0 ? "Dr" : "Cr"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 dark:bg-muted/50 font-semibold">
                    <td colSpan={4} className="border px-3 py-2 text-right text-xs uppercase">
                      Totals
                    </td>
                    <td className="border px-3 py-2 text-right font-mono tabular-nums">
                      {fmtAmt(totalDebit)}
                    </td>
                    <td className="border px-3 py-2 text-right font-mono tabular-nums">
                      {fmtAmt(totalCredit)}
                    </td>
                    <td className="border px-3 py-2 text-right font-mono tabular-nums">
                      {fmtAmt(Math.abs(closing))} {closing >= 0 ? "Dr" : "Cr"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </Table>
          </div>
        </Card>
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

function SummaryCard({
  icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  tone: "debit" | "credit";
}) {
  const toneClass =
    tone === "debit"
      ? "border-l-4 border-l-red-500 text-red-700 dark:text-red-400"
      : "border-l-4 border-l-emerald-500 text-emerald-700 dark:text-emerald-400";
  return (
    <Card className={cn("shadow-sm", toneClass)}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            {label}
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            ₹ {inr.format(value)}
            {suffix && <span className="text-sm ml-2 font-semibold">{suffix}</span>}
          </div>
        </div>
        <div className="opacity-70">{icon}</div>
      </CardContent>
    </Card>
  );
}
