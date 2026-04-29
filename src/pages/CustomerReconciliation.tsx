import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Download, Search, Wrench, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";

interface RawBalance {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  total_invoices: number;
  total_cash_payments: number;
  total_advances: number;
  total_advance_used: number;
  total_sale_returns: number;
  total_refunds_paid: number;
  calculated_balance: number;
  advance_available: number;
  notes: string;
}

interface LedgerBalance {
  customerId: string;
  balance: number;
  unusedAdvanceTotal: number;
}

interface AuditTransactionRow {
  type: string;
  reference: string;
  date: string;
  debit: number;
  credit: number;
}

export default function CustomerReconciliation() {
  const { currentOrganization } = useOrganization();
  const { navigate } = useOrgNavigation();
  const [search, setSearch] = useState("");
  const [mismatchOnly, setMismatchOnly] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>("");
  const [isCalculatingTrueBalance, setIsCalculatingTrueBalance] = useState(false);
  const [auditTransactions, setAuditTransactions] = useState<AuditTransactionRow[]>([]);
  const [calculatedBalance, setCalculatedBalance] = useState(0);
  const [calculatedBalanceType, setCalculatedBalanceType] = useState<"Dr (Outstanding)" | "Cr (Advance)">("Dr (Outstanding)");
  const [systemLedgerBalance, setSystemLedgerBalance] = useState(0);

  // Source 1: Raw transaction math via RPC
  const { data: rawBalances, isLoading: rawLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["reconcile-balances", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase.rpc("reconcile_customer_balances", {
        p_organization_id: currentOrganization.id,
      });
      if (error) throw error;
      return (data || []) as RawBalance[];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Source 2: Ledger-style balance for each customer (mirrors useCustomerBalance logic)
  const { data: ledgerBalances, isLoading: ledgerLoading } = useQuery({
    queryKey: ["reconcile-ledger-balances", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return new Map<string, LedgerBalance>();
      const orgId = currentOrganization.id;

      // Fetch customers
      const { data: customers } = await supabase
        .from("customers")
        .select("id, opening_balance")
        .eq("organization_id", orgId)
        .is("deleted_at", null);

      if (!customers?.length) return new Map<string, LedgerBalance>();

      // Fetch all sales
      const { data: sales } = await supabase
        .from("sales")
        .select("id, customer_id, net_amount, paid_amount, sale_return_adjust, payment_status")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .neq("payment_status", "cancelled")
        .neq("payment_status", "hold");

      const saleIds = sales?.map((s) => s.id) || [];

      // Fetch vouchers
      const { data: allVouchers } = await supabase
        .from("voucher_entries")
        .select("reference_id, reference_type, total_amount, voucher_type, payment_method, description")
        .eq("organization_id", orgId)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      // Fetch advances
      const { data: advances } = await supabase
        .from("customer_advances")
        .select("id, customer_id, amount, used_amount, status")
        .eq("organization_id", orgId)
        .in("status", ["active", "partially_used"]);

      // Fetch advance refunds
      const advanceIds = advances?.map((a) => a.id) || [];
      let advRefundMap = new Map<string, number>();
      if (advanceIds.length > 0) {
        const { data: advRefunds } = await supabase
          .from("advance_refunds")
          .select("advance_id, refund_amount")
          .in("advance_id", advanceIds);
        advRefunds?.forEach((r) => {
          advRefundMap.set(r.advance_id, (advRefundMap.get(r.advance_id) || 0) + (r.refund_amount || 0));
        });
      }

      // Fetch sale returns
      const { data: saleReturns } = await supabase
        .from("sale_returns")
        .select("customer_id, net_amount")
        .eq("organization_id", orgId)
        .is("deleted_at", null);

      // Fetch refund vouchers
      const { data: refundVouchers } = await supabase
        .from("voucher_entries")
        .select("reference_id, total_amount")
        .eq("organization_id", orgId)
        .eq("voucher_type", "payment")
        .eq("reference_type", "customer")
        .is("deleted_at", null);

      // Fetch adjustments
      const { data: adjustments } = await supabase
        .from("customer_balance_adjustments")
        .select("customer_id, outstanding_difference")
        .eq("organization_id", orgId);

      // Build per-customer ledger balance
      const saleIdSet = new Set(saleIds);
      const result = new Map<string, LedgerBalance>();

      // Map sale_id -> customer_id for fast lookup
      const saleToCustomerMap = new Map<string, string>();
      sales?.forEach((s) => {
        if (s.customer_id) saleToCustomerMap.set(s.id, s.customer_id);
      });

      // Classify all voucher receipts ONCE into cash/adv/CN buckets per invoice
      const invoiceCashVouchers = new Map<string, number>();
      const invoiceAdvPortions = new Map<string, number>();
      const invoiceCnPortions = new Map<string, number>();
      const openingBalancePaymentsMap = new Map<string, number>();

      allVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        const desc = (v.description || "").toLowerCase();
        const isAdv =
          v.payment_method === "advance_adjustment" ||
          desc.includes("adjusted from advance balance") ||
          desc.includes("advance adjusted");
        const isCn =
          v.payment_method === "credit_note_adjustment" ||
          desc.includes("credit note adjusted") ||
          desc.includes("cn adjusted");
        if (saleToCustomerMap.has(v.reference_id)) {
          const amt = Number(v.total_amount || 0);
          if (isAdv) {
            invoiceAdvPortions.set(v.reference_id, (invoiceAdvPortions.get(v.reference_id) || 0) + amt);
          } else if (isCn) {
            invoiceCnPortions.set(v.reference_id, (invoiceCnPortions.get(v.reference_id) || 0) + amt);
          } else {
            invoiceCashVouchers.set(v.reference_id, (invoiceCashVouchers.get(v.reference_id) || 0) + amt);
          }
        } else if (v.reference_type === "customer" && !isAdv && !isCn) {
          openingBalancePaymentsMap.set(
            v.reference_id,
            (openingBalancePaymentsMap.get(v.reference_id) || 0) + Number(v.total_amount || 0)
          );
        }
      });

      customers.forEach((cust) => {
        const custId = cust.id;
        const openingBalance = cust.opening_balance || 0;

        // Sales for this customer
        const custSales = sales?.filter((s) => s.customer_id === custId) || [];
        const totalSales = custSales.reduce((sum, s) => sum + (s.net_amount || 0), 0);

        // Per-customer totalPaid using cash/adv/CN split (mirrors CustomerLedger)
        let totalPaidOnSales = 0;
        let totalAdvApplied = 0;
        let totalCnApplied = 0;
        custSales.forEach((sale: any) => {
          const salePaid = sale.paid_amount || 0;
          const cashVoucher = invoiceCashVouchers.get(sale.id) || 0;
          const advVoucher = invoiceAdvPortions.get(sale.id) || 0;
          const cnVoucher = invoiceCnPortions.get(sale.id) || 0;
          totalPaidOnSales += Math.max(salePaid - advVoucher - cnVoucher, cashVoucher);
          totalAdvApplied += advVoucher;
          totalCnApplied += cnVoucher;
        });
        const totalPaid =
          totalPaidOnSales +
          totalAdvApplied +
          totalCnApplied +
          (openingBalancePaymentsMap.get(custId) || 0);

        const adjustmentTotal = adjustments?.filter((a) => a.customer_id === custId).reduce((s, a) => s + (a.outstanding_difference || 0), 0) || 0;

        const custAdvances = advances?.filter((a) => a.customer_id === custId) || [];
        const unusedAdvanceTotal = custAdvances.reduce((s, a) => {
          const refunded = advRefundMap.get(a.id) || 0;
          return s + Math.max(0, (a.amount || 0) - (a.used_amount || 0));
        }, 0);
        const advanceRefundTotal = custAdvances.reduce((s, a) => s + (advRefundMap.get(a.id) || 0), 0);
        const effectiveUnused = Math.max(0, unusedAdvanceTotal - advanceRefundTotal);

        const saleReturnTotal = saleReturns?.filter((sr) => sr.customer_id === custId).reduce((s, sr) => s + (sr.net_amount || 0), 0) || 0;

        const refundsPaid = refundVouchers?.filter((v) => v.reference_id === custId).reduce((s, v) => s + (v.total_amount || 0), 0) || 0;

        const balance = Math.round(openingBalance + totalSales - totalPaid + adjustmentTotal - effectiveUnused - saleReturnTotal + refundsPaid);

        result.set(custId, { customerId: custId, balance, unusedAdvanceTotal: Math.round(effectiveUnused) });
      });

      return result;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const isLoading = rawLoading || ledgerLoading;

  const rows = useMemo(() => {
    if (!rawBalances) return [];
    return rawBalances.map((raw) => {
      const ledger = ledgerBalances?.get(raw.customer_id);
      const ledgerBal = ledger?.balance ?? 0;
      const ledgerAdv = ledger?.unusedAdvanceTotal ?? 0;
      const diff = Math.round(raw.calculated_balance - ledgerBal);
      const advDiff = Math.round(raw.advance_available - ledgerAdv);
      return { ...raw, ledgerBalance: ledgerBal, ledgerAdvance: ledgerAdv, difference: diff, advanceDiff: advDiff, matched: Math.abs(diff) <= 1 };
    });
  }, [rawBalances, ledgerBalances]);

  const filtered = useMemo(() => {
    let list = rows;
    if (mismatchOnly) list = list.filter((r) => !r.matched);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.customer_name?.toLowerCase().includes(q) || r.phone?.includes(q));
    }
    return list;
  }, [rows, mismatchOnly, search]);

  const matchedCount = rows.filter((r) => r.matched).length;
  const mismatchCount = rows.filter((r) => !r.matched).length;
  const totalDrift = rows.reduce((s, r) => s + Math.abs(r.difference), 0);

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN")}${n < 0 ? " Cr" : n > 0 ? " Dr" : ""}`;

  const handleCalculateTrueBalance = useCallback(async () => {
    if (!currentOrganization?.id || !selectedCustomerId) return;
    setIsCalculatingTrueBalance(true);
    try {
      // Fetch all source records in parallel for fast reconciliation.
      const [{ data: customer }, { data: sales }, { data: returns }] = await Promise.all([
        supabase
          .from("customers")
          .select("opening_balance")
          .eq("organization_id", currentOrganization.id)
          .eq("id", selectedCustomerId)
          .maybeSingle(),
        supabase
          .from("sales")
          .select("id, net_amount, sale_number, created_at, payment_status")
          .eq("organization_id", currentOrganization.id)
          .eq("customer_id", selectedCustomerId)
          .is("deleted_at", null)
          .not("payment_status", "in", '("cancelled","hold","draft")'),
        supabase
          .from("sale_returns")
          .select("net_amount, return_number, created_at")
          .eq("organization_id", currentOrganization.id)
          .eq("customer_id", selectedCustomerId)
          .is("deleted_at", null),
      ]);

      const saleIds = (sales || []).map((s: any) => s.id).filter(Boolean);
      const { data: vouchers } = await supabase
        .from("voucher_entries")
        .select("total_amount, voucher_number, voucher_type, created_at, reference_id, reference_type")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .in("voucher_type", ["receipt", "payment", "credit_note", "advance"])
        .or([
          `and(reference_type.eq.customer,reference_id.eq.${selectedCustomerId})`,
          saleIds.length > 0 ? `and(reference_type.eq.sale,reference_id.in.(${saleIds.join(",")}))` : "",
        ].filter(Boolean).join(","));

      const txns: AuditTransactionRow[] = [];

      const opening = Number((customer as any)?.opening_balance || 0);
      if (opening !== 0) {
        txns.push({
          type: "Opening Balance",
          reference: "OB",
          date: new Date(0).toISOString(),
          debit: opening > 0 ? Math.abs(opening) : 0,
          credit: opening < 0 ? Math.abs(opening) : 0,
        });
      }

      (sales || []).forEach((sale: any) => {
        txns.push({
          type: "Sale",
          reference: sale.sale_number || "-",
          date: sale.created_at || new Date().toISOString(),
          debit: Number(sale.net_amount || 0),
          credit: 0,
        });
      });

      (returns || []).forEach((ret: any) => {
        txns.push({
          type: "Sale Return",
          reference: ret.return_number || "-",
          date: ret.created_at || new Date().toISOString(),
          debit: 0,
          credit: Number(ret.net_amount || 0),
        });
      });

      (vouchers || []).forEach((v: any) => {
        txns.push({
          type: (v.voucher_type || "").toUpperCase(),
          reference: v.voucher_number || "-",
          date: v.created_at || new Date().toISOString(),
          debit: 0,
          credit: Number(v.total_amount || 0),
        });
      });

      txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const totalDebits = txns.reduce((sum, t) => sum + Number(t.debit || 0), 0);
      const totalCredits = txns.reduce((sum, t) => sum + Number(t.credit || 0), 0);
      const calcBal = Math.abs(totalDebits - totalCredits);
      const balType: "Dr (Outstanding)" | "Cr (Advance)" =
        totalDebits >= totalCredits ? "Dr (Outstanding)" : "Cr (Advance)";

      setAuditTransactions(txns);
      setCalculatedBalance(Math.round(calcBal * 100) / 100);
      setCalculatedBalanceType(balType);

      const selectedRow = rows.find((r) => r.customer_id === selectedCustomerId);
      setSystemLedgerBalance(Number(selectedRow?.ledgerBalance || 0));
    } finally {
      setIsCalculatingTrueBalance(false);
    }
  }, [currentOrganization?.id, selectedCustomerId, rows]);

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((r) => ({
        Customer: r.customer_name,
        Phone: r.phone || "",
        Invoices: r.total_invoices,
        Payments: r.total_cash_payments,
        Advances: r.total_advances,
        "Sale Returns": r.total_sale_returns,
        "Calculated Balance": r.calculated_balance,
        "Ledger Balance": r.ledgerBalance,
        "Advance Available": r.advance_available,
        "Ledger Advance": r.ledgerAdvance,
        Difference: r.difference,
        Status: r.matched ? "Match" : "Mismatch",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
    XLSX.writeFile(wb, `Customer_Reconciliation_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 w-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <BackToDashboard />
            <h1 className="text-xl font-bold">Customer Balance Reconciliation</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-9">Cross-verify balances from raw transactions vs ledger</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {dataUpdatedAt ? `Last checked: ${format(new Date(dataUpdatedAt), "dd/MM/yyyy hh:mm a")}` : ""}
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{rows.length}</div>
            <div className="text-xs text-muted-foreground">Customers Checked</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{matchedCount}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Matched
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{mismatchCount}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <XCircle className="h-3.5 w-3.5" /> Mismatched
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">₹{totalDrift.toLocaleString("en-IN")}</div>
            <div className="text-xs text-muted-foreground">Total Drift</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customer name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="mismatch" checked={mismatchOnly} onCheckedChange={setMismatchOnly} />
          <Label htmlFor="mismatch" className="text-sm cursor-pointer">Show Mismatches Only</Label>
        </div>
        <Button size="sm" variant="outline" onClick={exportToExcel} disabled={!filtered.length}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export Report
        </Button>
        <Button
          size="sm"
          onClick={handleCalculateTrueBalance}
          disabled={!selectedCustomerId || isCalculatingTrueBalance}
        >
          {isCalculatingTrueBalance ? "Calculating..." : "Calculate True Balance"}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" disabled>
              <Wrench className="h-3.5 w-3.5 mr-1" /> Fix All
            </Button>
          </TooltipTrigger>
          <TooltipContent>Coming soon</TooltipContent>
        </Tooltip>
      </div>

      {/* Table */}
      <div className="border rounded-md overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="min-w-[160px]">CUSTOMER</TableHead>
              <TableHead className="min-w-[90px]">PHONE</TableHead>
              <TableHead className="text-right min-w-[90px]">INVOICES</TableHead>
              <TableHead className="text-right min-w-[90px]">PAYMENTS</TableHead>
              <TableHead className="text-right min-w-[90px]">ADVANCES</TableHead>
              <TableHead className="text-right min-w-[90px]">RETURNS</TableHead>
              <TableHead className="text-right min-w-[100px]">CALC BAL</TableHead>
              <TableHead className="text-right min-w-[100px]">LEDGER BAL</TableHead>
              <TableHead className="text-right min-w-[80px]">ADV AVAIL</TableHead>
              <TableHead className="text-right min-w-[80px]">LDGR ADV</TableHead>
              <TableHead className="text-right min-w-[80px]">DIFF</TableHead>
              <TableHead className="text-center min-w-[70px]">STATUS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading reconciliation data...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  {mismatchOnly ? "No mismatches found — all balances match! 🎉" : "No customers with transactions found."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow
                  key={row.customer_id}
                  className={`cursor-pointer text-xs ${selectedCustomerId === row.customer_id ? "bg-blue-50 dark:bg-blue-950/20" : ""} ${!row.matched ? "border-l-4 border-l-red-500" : "hover:bg-muted/50"}`}
                  onClick={() => {
                    setSelectedCustomerId(row.customer_id);
                    setSelectedCustomerName(row.customer_name);
                  }}
                  onDoubleClick={() => navigate(`/customer-ledger/${row.customer_id}`)}
                >
                  <TableCell className="font-medium">{row.customer_name}</TableCell>
                  <TableCell>{row.phone || "—"}</TableCell>
                  <TableCell className="text-right font-mono">₹{row.total_invoices.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right font-mono">₹{row.total_cash_payments.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right font-mono">₹{row.total_advances.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right font-mono">₹{row.total_sale_returns.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(row.calculated_balance)}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(row.ledgerBalance)}</TableCell>
                  <TableCell className="text-right font-mono">₹{row.advance_available.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right font-mono">₹{row.ledgerAdvance.toLocaleString("en-IN")}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${row.difference !== 0 ? "text-red-600" : "text-green-600"}`}>
                    {row.difference === 0 ? "₹0" : fmt(row.difference)}
                  </TableCell>
                  <TableCell className="text-center">
                    {row.matched ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-red-600 mx-auto" />}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Audit Log / Discrepancy Details */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span><b>Selected Customer:</b> {selectedCustomerName || "—"}</span>
          <span><b>Calculated Balance:</b> ₹{calculatedBalance.toLocaleString("en-IN")} {calculatedBalanceType}</span>
          <span><b>Ledger Balance:</b> {fmt(systemLedgerBalance)}</span>
          <span><b>Discrepancy:</b> {fmt(Math.round((calculatedBalance - Math.abs(systemLedgerBalance)) * 100) / 100)}</span>
        </div>
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>TYPE</TableHead>
                <TableHead>REFERENCE</TableHead>
                <TableHead>DATE</TableHead>
                <TableHead className="text-right">DEBIT</TableHead>
                <TableHead className="text-right">CREDIT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    Select customer and click Calculate True Balance.
                  </TableCell>
                </TableRow>
              ) : (
                auditTransactions.map((tx, idx) => (
                  <TableRow key={`${tx.reference}-${idx}`} className="text-xs">
                    <TableCell>{tx.type}</TableCell>
                    <TableCell>{tx.reference}</TableCell>
                    <TableCell>{format(new Date(tx.date), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="text-right font-mono">{tx.debit > 0 ? `₹${tx.debit.toLocaleString("en-IN")}` : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{tx.credit > 0 ? `₹${tx.credit.toLocaleString("en-IN")}` : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
