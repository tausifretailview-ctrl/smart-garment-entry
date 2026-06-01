import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Download, Phone, Mail, MapPin, IndianRupee, Calendar, FileText, CalendarIcon, AlertTriangle, Undo2, Clock, Scale, BookOpen } from "lucide-react";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { accountsHistoryTableClass, accountsHistoryTableWrapClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import {
  fetchSupplierBalanceSnapshot,
  fetchSupplierBalanceSnapshotsForOrg,
} from "@/utils/supplierBalanceUtils";
import { fetchAllSuppliers } from "@/utils/fetchAllRows";
import { voucherSettlementCredit } from "@/utils/paymentSettlementBreakdown";
import {
  supplierCreditNoteLedgerDebit,
  supplierCreditNoteLedgerDescriptionFromCn,
} from "@/utils/purchaseSupplierLedgerCn";
import { linkedBillDisplayNo } from "@/utils/purchaseReturnCnDisplay";
import * as XLSX from "xlsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SupplierLedgerProps {
  organizationId: string;
}

interface Supplier {
  id: string;
  supplier_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number;
  totalPurchases: number;
  totalPaid: number;
  totalCreditNotes: number;
  balance: number;
}

type LedgerTab = 'all' | 'payments' | 'cn-adjusted' | 'cn-pending';

interface Transaction {
  id: string;
  date: string;
  type: 'bill' | 'payment' | 'credit_note' | 'purchase_return';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  /** Which detail tab this row belongs to (besides "all"). */
  category?: Exclude<LedgerTab, 'all'>;
}

export function SupplierLedger({ organizationId }: SupplierLedgerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<LedgerTab>("all");

  // Suppliers list + balances: keep list loading even if balance aggregation fails (RLS / schema).
  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ["supplier-ledger", organizationId],
    queryFn: async () => {
      const suppliersData = await fetchAllSuppliers(organizationId);

      let balanceMap: Awaited<ReturnType<typeof fetchSupplierBalanceSnapshotsForOrg>>;
      let balanceSnapshotError: string | null = null;
      try {
        balanceMap = await fetchSupplierBalanceSnapshotsForOrg(supabase, organizationId);
      } catch (e) {
        console.error("Supplier ledger: balance snapshot failed", e);
        balanceMap = new Map();
        balanceSnapshotError =
          e instanceof Error ? e.message : "Could not compute balances from bills and vouchers.";
      }

      const suppliers = (suppliersData || []).map((supplier: any) => {
        const snap = balanceMap.get(supplier.id);
        const openingBalance = snap?.openingBalance ?? (Number(supplier.opening_balance) || 0);
        return {
          ...supplier,
          opening_balance: openingBalance,
          totalPurchases: snap?.totalPurchases ?? 0,
          totalPaid: snap?.totalPaid ?? 0,
          totalCreditNotes: (snap?.totalCreditNotesNet ?? 0) + (snap?.unreflectedReturns ?? 0),
          balance: snap?.balance ?? openingBalance,
        };
      });

      return { suppliers, balanceSnapshotError };
    },
    enabled: !!organizationId,
  });

  const suppliers = ledgerData?.suppliers;
  const balanceSnapshotError = ledgerData?.balanceSnapshotError ?? null;

  const { data: selectedSupplierSnapshot } = useQuery({
    queryKey: ["supplier-balance-snapshot", organizationId, selectedSupplier?.id],
    queryFn: async () =>
      fetchSupplierBalanceSnapshot(supabase, organizationId, selectedSupplier!.id),
    enabled: !!organizationId && !!selectedSupplier?.id,
  });

  // Fetch detailed transactions for selected supplier
  const { data: transactions } = useQuery({
    queryKey: ["supplier-transactions", selectedSupplier?.id, startDate, endDate],
    queryFn: async () => {
      if (!selectedSupplier) return [];

      // Build date filter for displayed bills
      let billsQuery = supabase
        .from("purchase_bills")
        .select("*")
        .eq("supplier_id", selectedSupplier.id)
        .is("deleted_at", null)
        .or("is_cancelled.is.null,is_cancelled.eq.false");

      if (startDate) {
        billsQuery = billsQuery.gte("bill_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        billsQuery = billsQuery.lte("bill_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: billsData, error: billsError } = await billsQuery.order("bill_date", { ascending: true });

      if (billsError) throw billsError;

      // Fetch voucher payments for this supplier
      let vouchersQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "supplier")
        .eq("voucher_type", "payment")
        .is("deleted_at", null);

      // Get all bill IDs for this supplier to find related payments
      const { data: allBills } = await supabase
        .from("purchase_bills")
        .select("id")
        .eq("supplier_id", selectedSupplier.id)
        .is("deleted_at", null)
        .or("is_cancelled.is.null,is_cancelled.eq.false");

      const billIds = allBills?.map(b => b.id) || [];
      const billById = new Map(
        (billsData || []).map((b: any) => [
          b.id,
          { software_bill_no: b.software_bill_no, supplier_invoice_no: b.supplier_invoice_no },
        ])
      );

      if (billIds.length > 0) {
        vouchersQuery = vouchersQuery.in("reference_id", billIds);
      } else {
        vouchersQuery = vouchersQuery.eq("reference_id", "00000000-0000-0000-0000-000000000000");
      }

      if (startDate) {
        vouchersQuery = vouchersQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        vouchersQuery = vouchersQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: true });

      if (vouchersError) throw vouchersError;

      // Also fetch opening balance payments (reference_id = supplier_id)
      let openingBalanceQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "supplier")
        .eq("reference_id", selectedSupplier.id)
        .eq("voucher_type", "payment")
        .is("deleted_at", null);

      if (startDate) {
        openingBalanceQuery = openingBalanceQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        openingBalanceQuery = openingBalanceQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: openingBalancePayments, error: openingError } = await openingBalanceQuery.order("voucher_date", { ascending: true });

      if (openingError) throw openingError;

      // Fetch credit notes for this supplier
      let creditNotesQuery = supabase
        .from("voucher_entries")
        .select("id, voucher_number, voucher_date, description, total_amount")
        .eq("reference_type", "supplier")
        .eq("reference_id", selectedSupplier.id)
        .eq("voucher_type", "credit_note")
        .is("deleted_at", null);

      if (startDate) {
        creditNotesQuery = creditNotesQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        creditNotesQuery = creditNotesQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: creditNotesData, error: creditNotesError } = await creditNotesQuery.order("voucher_date", { ascending: true });

      if (creditNotesError) throw creditNotesError;

      // Fetch purchase returns (direct, as fallback/supplement to credit_note vouchers).
      // Tiered SELECT: older org schemas may lack credit_available_balance/created_at.
      // A single hard select used to error silently here -> purchaseReturnsData = null ->
      // CN/return rows vanished from the ledger while the account balance (snapshot, which
      // has its own fallback) stayed correct. Hence "outstanding OK, but CN not showing".
      const prSelectTiers = [
        "id, return_number, return_date, net_amount, credit_status, credit_note_id, linked_bill_id, credit_available_balance, created_at",
        "id, return_number, return_date, net_amount, credit_status, credit_note_id, linked_bill_id, credit_available_balance",
        "id, return_number, return_date, net_amount, credit_status, credit_note_id, linked_bill_id",
        "id, return_number, return_date, net_amount, credit_status, credit_note_id",
      ];
      let purchaseReturnsData: any[] | null = null;
      for (const sel of prSelectTiers) {
        const res = await supabase
          .from("purchase_returns" as any)
          .select(sel)
          .eq("supplier_id", selectedSupplier.id)
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("return_date", { ascending: true });
        if (!res.error) {
          purchaseReturnsData = (res.data as any[]) || [];
          break;
        }
        console.warn("Supplier ledger: purchase_returns select failed, retrying simpler", res.error?.message);
      }
      purchaseReturnsData = purchaseReturnsData || [];

      // Only include purchase returns that have NO linked credit_note voucher
      const creditNoteVoucherIds = new Set((creditNotesData || []).map((cn: any) => cn.id));
      // Returns whose adjustment affects balance (already chosen by user)
      const unreflectedReturns = (purchaseReturnsData || []).filter((pr: any) =>
        (!pr.credit_note_id || !creditNoteVoucherIds.has(pr.credit_note_id)) &&
        ['adjusted', 'adjusted_outstanding', 'refunded'].includes(pr.credit_status)
      );
      // Pending returns: show informationally but do not affect running balance
      const pendingReturns = (purchaseReturnsData || []).filter((pr: any) =>
        (!pr.credit_note_id || !creditNoteVoucherIds.has(pr.credit_note_id)) &&
        (pr.credit_status === 'pending' || !pr.credit_status)
      );

      // Fetch refunds received from supplier (when CN is marked 'refunded')
      const { data: supplierRefunds } = await supabase
        .from('voucher_entries').select('*')
        .eq('reference_type', 'supplier').eq('reference_id', selectedSupplier.id)
        .eq('voucher_type', 'receipt').is('deleted_at', null)
        .order('voucher_date', { ascending: true });

      // Merge bill payments and opening balance payments
      // Skip legacy supplier-referenced vouchers whose description already names a specific bill
      // (those are now rendered via the bill row's "Payment at purchase" calc)
      const billRefs = (billsData || [])
        .map((b: any) => b.software_bill_no || b.supplier_invoice_no)
        .filter(Boolean);
      const trueOpeningPayments = (openingBalancePayments || []).filter((v: any) =>
        !billRefs.some((r: string) => (v.description || "").includes(r))
      );
      const allVouchers = [...(vouchersData || []), ...trueOpeningPayments];

      // Calculate total voucher payments per bill
      const voucherPaymentsByBillId: Record<string, number> = {};
      (vouchersData || []).forEach((voucher) => {
        if (voucher.reference_id) {
          voucherPaymentsByBillId[voucher.reference_id] =
            (voucherPaymentsByBillId[voucher.reference_id] || 0) + voucherSettlementCredit(voucher);
        }
      });

      // Combine and sort transactions
      const allTransactions: Transaction[] = [];
      
      // Start with opening balance
      const openingBalance = selectedSupplier.opening_balance || 0;
      let runningBalance = openingBalance;

      // Add opening balance as first entry if it exists
      if (openingBalance !== 0) {
        allTransactions.push({
          id: 'opening-balance',
          date: '1900-01-01',
          type: 'bill',
          reference: 'Opening',
          description: 'Opening Balance (Carried Forward)',
          debit: 0,
          credit: openingBalance,  // Supplier opening balance is a liability (credit)
          balance: runningBalance,
        });
      }

      // Merge bills, payments, and credit notes chronologically
      const combined = [
        ...(billsData || []).map((bill) => ({
          date: bill.bill_date,
          type: 'bill' as const,
          data: bill,
        })),
        ...allVouchers.map((voucher) => ({
          date: voucher.voucher_date,
          type: 'payment' as const,
          data: voucher,
        })),
        ...(creditNotesData || []).map((cn) => ({
          date: cn.voucher_date,
          type: 'credit_note' as const,
          data: cn,
        })),
        ...(supplierRefunds || []).map((r) => ({
          date: r.voucher_date,
          type: 'refund_received' as const,
          data: r,
        })),
        ...(unreflectedReturns || []).map((pr: any) => ({
          date: pr.return_date,
          type: 'purchase_return' as const,
          data: pr,
        })),
        ...(pendingReturns || []).map((pr: any) => ({
          date: pr.return_date,
          type: 'purchase_return_pending' as const,
          data: pr,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      combined.forEach((item) => {
        if (item.type === 'bill') {
          const bill = item.data as any;
          runningBalance += bill.net_amount;
          
          allTransactions.push({
            id: bill.id,
            date: bill.bill_date,
            type: 'bill',
            reference: bill.supplier_invoice_no || bill.software_bill_no || 'N/A',
            description: `Purchase Bill - ${bill.payment_status || 'pending'}`,
            debit: 0,
            credit: bill.net_amount,
            balance: runningBalance,
          });

          // Calculate payment at purchase (exclude amounts paid via vouchers)
          const totalPaidOnBill = bill.paid_amount || 0;
          const voucherPayments = voucherPaymentsByBillId[bill.id] || 0;
          const billRef = bill.software_bill_no || bill.supplier_invoice_no || '';
          const legacyVoucherPayments = billRef
            ? (openingBalancePayments || [])
                .filter((v: any) => (v.description || "").includes(billRef))
                .reduce((s: number, v: any) => s + voucherSettlementCredit(v), 0)
            : 0;
          const paidAtPurchase = Math.max(0, totalPaidOnBill - voucherPayments - legacyVoucherPayments);
          
          if (paidAtPurchase > 0) {
            runningBalance -= paidAtPurchase;
            
            allTransactions.push({
              id: `${bill.id}-payment-at-purchase`,
              date: bill.bill_date,
              type: 'payment',
              reference: bill.supplier_invoice_no || bill.software_bill_no || 'N/A',
              description: 'Payment at purchase',
              debit: paidAtPurchase,
              credit: 0,
              balance: runningBalance,
              category: 'payments',
            });
          }
        } else if (item.type === 'credit_note') {
          const creditNote = item.data as any;
          const prLinked = (purchaseReturnsData || []).filter(
            (pr: any) => pr.credit_note_id === creditNote.id
          );
          const cnEffect = supplierCreditNoteLedgerDebit(
            Number(creditNote.total_amount) || 0,
            prLinked
          );
          runningBalance -= cnEffect;

          allTransactions.push({
            id: creditNote.id,
            date: creditNote.voucher_date,
            type: 'credit_note',
            reference: creditNote.voucher_number,
            description: supplierCreditNoteLedgerDescriptionFromCn(
              creditNote,
              prLinked,
              billById
            ),
            debit: cnEffect,
            credit: 0,
            balance: runningBalance,
            category: 'cn-adjusted',
          });
        } else if (item.type === 'refund_received') {
          const r = item.data as any;
          runningBalance -= r.total_amount;
          allTransactions.push({
            id: r.id,
            date: r.voucher_date,
            type: 'payment',
            reference: r.voucher_number,
            description: r.description || 'Refund Received from Supplier',
            debit: r.total_amount,
            credit: 0,
            balance: runningBalance,
            category: 'payments',
          });
        } else if (item.type === 'purchase_return') {
          const pr = item.data as any;
          const amount = Number(pr.net_amount) || 0;
          runningBalance -= amount;

          let description = `Purchase Return - ${pr.return_number}`;
          const linkedBill = pr.linked_bill_id ? billById.get(pr.linked_bill_id) : null;
          const linkedLabel = linkedBillDisplayNo(linkedBill);
          if (pr.credit_status === 'adjusted_outstanding') description += ` (Adj. Outstanding)`;
          else if (pr.credit_status === 'adjusted' && linkedLabel) {
            description += ` (Adj. Against Bill ${linkedLabel})`;
          } else if (pr.credit_status === 'adjusted') description += ` (Adj. Against Bill)`;
          else if (pr.credit_status === 'refunded') description += ` (Refunded)`;
          else description += ` (Pending)`;

          allTransactions.push({
            id: `pr-${pr.id}`,
            date: pr.return_date,
            type: 'credit_note',
            reference: pr.return_number,
            description,
            debit: amount,
            credit: 0,
            balance: runningBalance,
            category: 'cn-adjusted',
          });
        } else if (item.type === 'purchase_return_pending') {
          // Display-only row for pending purchase returns — does NOT mutate balance
          const pr = item.data as any;
          allTransactions.push({
            id: `pr-pending-${pr.id}`,
            date: pr.return_date,
            type: 'purchase_return',
            reference: pr.return_number,
            description: `Purchase Return - ${pr.return_number} (Pending — not adjusted)`,
            debit: 0,
            credit: 0,
            balance: runningBalance,
            category: 'cn-pending',
          });
        } else {
          const voucher = item.data as any;
          const cashPaid = Number(voucher.total_amount || 0);
          const disc = Number(voucher.discount_amount || 0);
          const settlement = voucherSettlementCredit(voucher);
          runningBalance -= settlement;

          const isOpeningBalancePayment = !billIds.includes(voucher.reference_id);
          const relatedBill = !isOpeningBalancePayment ? billsData?.find((b) => b.id === voucher.reference_id) : null;
          const billRef = relatedBill ? ` - for ${relatedBill.supplier_invoice_no || relatedBill.software_bill_no}` : "";
          const discNote = disc > 0 ? ` (cash ₹${cashPaid.toFixed(2)} + discount ₹${disc.toFixed(2)})` : "";

          allTransactions.push({
            id: voucher.id,
            date: voucher.voucher_date,
            type: "payment",
            reference: voucher.voucher_number,
            description:
              (isOpeningBalancePayment
                ? voucher.description || "Opening balance payment"
                : (voucher.description || "Payment made") + billRef) + discNote,
            debit: settlement,
            credit: 0,
            balance: runningBalance,
            category: 'payments',
          });
        }
      });

      return allTransactions;
    },
    enabled: !!selectedSupplier?.id,
  });

  const ledgerClosingBalance = useMemo(() => {
    if (!transactions?.length) return null;
    return transactions[transactions.length - 1]?.balance ?? 0;
  }, [transactions]);

  const tabCounts = useMemo(() => {
    const t = transactions || [];
    return {
      all: t.length,
      payments: t.filter((x) => x.category === 'payments').length,
      'cn-adjusted': t.filter((x) => x.category === 'cn-adjusted').length,
      'cn-pending': t.filter((x) => x.category === 'cn-pending').length,
    };
  }, [transactions]);

  const visibleTransactions = useMemo(() => {
    const t = transactions || [];
    if (activeTab === 'all') return t;
    return t.filter((x) => x.category === activeTab);
  }, [transactions, activeTab]);

  // Reset to the full view whenever a different supplier is opened.
  useEffect(() => {
    setActiveTab('all');
  }, [selectedSupplier?.id]);

  // Filter suppliers based on search and payment status
  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    
    return suppliers.filter((supplier) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (
        supplier.supplier_name.toLowerCase().includes(searchLower) ||
        supplier.phone?.toLowerCase().includes(searchLower) ||
        supplier.email?.toLowerCase().includes(searchLower)
      );

      let matchesPaymentStatus = true;
      if (paymentStatusFilter === "outstanding") {
        matchesPaymentStatus = supplier.balance > 0;
      } else if (paymentStatusFilter === "settled") {
        matchesPaymentStatus = supplier.balance === 0;
      } else if (paymentStatusFilter === "advance") {
        matchesPaymentStatus = supplier.balance < 0;
      }

      return matchesSearch && matchesPaymentStatus;
    });
  }, [suppliers, searchQuery, paymentStatusFilter]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!filteredSuppliers) return { totalSuppliers: 0, totalOutstanding: 0, totalPayable: 0 };
    
    return {
      totalSuppliers: filteredSuppliers.length,
      totalOutstanding: filteredSuppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0),
      totalPayable: filteredSuppliers.reduce((sum, s) => sum + s.totalPurchases, 0),
    };
  }, [filteredSuppliers]);

  const { data: supplierBillPaymentDrift } = useQuery({
    queryKey: ["supplier-bill-payment-voucher-drift", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_bill_payment_voucher_drift" as any)
        .select("bill_id")
        .eq("organization_id", organizationId)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!organizationId,
  });

  const handleExportToExcel = () => {
    if (!selectedSupplier || !transactions) return;

    const exportData = transactions.map((t) => ({
      Date: t.id === 'opening-balance' ? 'Opening' : format(new Date(t.date), "dd/MM/yyyy"),
      Type: t.type === 'bill' ? 'Bill' : 'Payment',
      Reference: t.reference,
      Description: t.description,
      Debit: t.debit > 0 ? t.debit.toFixed(2) : '',
      Credit: t.credit > 0 ? t.credit.toFixed(2) : '',
      Balance: t.balance.toFixed(2),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier Ledger");
    XLSX.writeFile(wb, `${selectedSupplier.supplier_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  if (selectedSupplier && transactions) {
    return (
      <div className="space-y-3">
        {supplierBillPaymentDrift && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Bill payment sync check</AlertTitle>
            <AlertDescription>
              At least one purchase bill has a paid amount that does not match bill-linked payment vouchers. Query the
              database view <span className="font-mono text-xs">supplier_bill_payment_voucher_drift</span> for this
              organization to review rows. Credit-note adjustments use{" "}
              <span className="font-mono text-xs">supplier_cn_bill_integrity_check</span>.
            </AlertDescription>
          </Alert>
        )}
        {balanceSnapshotError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Supplier balances could not be loaded fully</AlertTitle>
            <AlertDescription className="text-sm space-y-2">
              <span className="block font-medium">{balanceSnapshotError}</span>
              <span className="block text-muted-foreground">
                Outstanding needs purchase bills plus supplier payment/credit-note vouchers from the database. If totals stay at zero:
                run pending Supabase migrations; confirm your login is a member of this organization (User Rights / org access); in
                Supabase RLS, ensure <span className="font-mono text-xs">SELECT</span> on{" "}
                <span className="font-mono text-xs">voucher_entries</span> and{" "}
                <span className="font-mono text-xs">purchase_returns</span> for your role; check the browser console for the exact error.
              </span>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedSupplier(null)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Suppliers
          </Button>
          
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 w-full md:w-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[200px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd MMM yyyy") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[200px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd MMM yyyy") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {(startDate || endDate) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }}
              >
                Clear
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportToExcel}
            >
              <Download className="mr-2 h-4 w-4" />
              Export to Excel
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{selectedSupplier.supplier_name}</CardTitle>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {selectedSupplier.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedSupplier.phone}
                    </div>
                  )}
                  {selectedSupplier.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {selectedSupplier.email}
                    </div>
                  )}
                  {selectedSupplier.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedSupplier.address}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">
                  {selectedSupplier.balance > 0
                    ? "Outstanding Payable (Cr)"
                    : selectedSupplier.balance < 0
                      ? "Credit / Overpayment"
                      : "Balance"}
                </div>
                <div className={cn(
                  "text-3xl font-bold",
                  selectedSupplier.balance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                )}>
                  ₹{Math.abs(selectedSupplier.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                {selectedSupplier.balance > 0 && (
                  <Badge variant="destructive" className="mt-2">Payable</Badge>
                )}
                {selectedSupplier.balance < 0 && (
                  <Badge variant="default" className="mt-2 bg-green-600">Supplier Credit</Badge>
                )}
                {selectedSupplier.balance === 0 && (
                  <Badge variant="outline" className="mt-2">Settled</Badge>
                )}
                {ledgerClosingBalance != null &&
                  Math.abs(ledgerClosingBalance - selectedSupplier.balance) > 1 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 max-w-[260px] ml-auto text-left">
                      <span className="inline-flex items-start gap-1 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        Ledger running total ₹
                        {Math.abs(ledgerClosingBalance).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        {ledgerClosingBalance >= 0 ? "payable" : "credit"} vs account balance ₹
                        {Math.abs(selectedSupplier.balance).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                        . Check bill payments and purchase return credit notes.
                      </span>
                    </p>
                  )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {selectedSupplier.opening_balance !== 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground mb-1">Opening Balance</div>
                    <div className={cn(
                      "text-2xl font-bold",
                      selectedSupplier.opening_balance > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"
                    )}>
                      ₹{Math.abs(selectedSupplier.opening_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedSupplier.opening_balance > 0 ? "Payable" : "Advance"}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Purchases</div>
                  <div className="text-2xl font-bold">
                    ₹{selectedSupplier.totalPurchases.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Paid</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ₹{selectedSupplier.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              {(selectedSupplierSnapshot?.unappliedCreditNotes ?? 0) > 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground mb-1">Unapplied CN / Returns</div>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      ₹{(selectedSupplierSnapshot?.unappliedCreditNotes ?? 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Payment Rate</div>
                  <div className="text-2xl font-bold">
                    {(selectedSupplier.totalPurchases + Math.max(0, selectedSupplier.opening_balance)) > 0
                      ? ((selectedSupplier.totalPaid / (selectedSupplier.totalPurchases + Math.max(0, selectedSupplier.opening_balance))) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator className="my-6" />

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LedgerTab)} className="w-full">
              <TabsList className="flex w-full max-w-full flex-nowrap overflow-x-auto gap-1 mb-4 min-h-10 bg-muted/60 rounded-xl p-1">
                <TabsTrigger value="all" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <BookOpen className="h-4 w-4" />
                  Transactions
                  <Badge variant="secondary" className="ml-1">{tabCounts.all}</Badge>
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <IndianRupee className="h-4 w-4" />
                  Payment History
                  <Badge variant="secondary" className="ml-1">{tabCounts.payments}</Badge>
                </TabsTrigger>
                <TabsTrigger value="cn-adjusted" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <FileText className="h-4 w-4" />
                  CN Adjusted
                  <Badge variant="secondary" className="ml-1">{tabCounts['cn-adjusted']}</Badge>
                </TabsTrigger>
                <TabsTrigger value="cn-pending" className="flex shrink-0 items-center gap-2 rounded-lg text-sm font-medium px-3">
                  <Clock className="h-4 w-4" />
                  CN Pending
                  <Badge variant="secondary" className="ml-1">{tabCounts['cn-pending']}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className={accountsHistoryTableWrapClass}>
              <Table className={accountsHistoryTableClass}>
                <TableHeader className="!static">
                  <TableRow>
                    <TableHead className={accountsHistoryThClass}>Date</TableHead>
                    <TableHead className={accountsHistoryThClass}>Type</TableHead>
                    <TableHead className={accountsHistoryThClass}>Reference</TableHead>
                    <TableHead className={accountsHistoryThClass}>Description</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Debit (Paid)</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Credit (Bill)</TableHead>
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {activeTab === 'all'
                          ? 'No transactions found'
                          : activeTab === 'payments'
                            ? 'No payments / refunds recorded'
                            : activeTab === 'cn-adjusted'
                              ? 'No adjusted credit notes / purchase returns'
                              : 'No pending purchase return credit notes'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleTransactions.map((transaction) => (
                      <TableRow key={transaction.id} className={transaction.id === 'opening-balance' ? 'bg-muted/50' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {transaction.id === 'opening-balance' 
                              ? <span className="font-semibold">Opening</span>
                              : format(new Date(transaction.date), "dd MMM yyyy")
                            }
                          </div>
                        </TableCell>
                        <TableCell>
                          {transaction.id === 'opening-balance' ? (
                            <Badge variant="outline" className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                              B/F
                            </Badge>
                          ) : transaction.type === 'credit_note' ? (
                            <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                              <FileText className="h-3 w-3 mr-1" /> Credit Note
                            </Badge>
                          ) : (
                            <Badge variant={transaction.type === 'bill' ? 'default' : 'secondary'}>
                              {transaction.type === 'bill' ? (
                                <><FileText className="h-3 w-3 mr-1" /> Bill</>
                              ) : (
                                <><IndianRupee className="h-3 w-3 mr-1" /> Payment</>
                              )}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{transaction.reference}</TableCell>
                        <TableCell className="text-muted-foreground">{transaction.description}</TableCell>
                        <TableCell className="text-right font-medium">
                          {transaction.debit > 0 && (
                            <span className="text-green-600 dark:text-green-400">
                              ₹{transaction.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {transaction.credit > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              ₹{transaction.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-bold",
                          transaction.balance > 0 ? "text-red-600 dark:text-red-400" : 
                          transaction.balance < 0 ? "text-green-600 dark:text-green-400" : 
                          "text-foreground"
                        )}>
                          ₹{Math.abs(transaction.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {/* Grand Total Row */}
                  {visibleTransactions.length > 0 && (() => {
                    const totalDebit = visibleTransactions.reduce((sum, t) => sum + t.debit, 0);
                    const totalCredit = visibleTransactions.reduce((sum, t) => sum + t.credit, 0);
                    const totalCreditNoteAdjust = visibleTransactions.filter(t => t.type === 'credit_note').reduce((sum, t) => sum + t.debit, 0);
                    const finalBalance = visibleTransactions[visibleTransactions.length - 1]?.balance || 0;
                    return (
                      <TableRow className="bg-muted/70 border-t-2 border-primary/20 font-bold">
                        <TableCell colSpan={4} className="text-right text-base font-bold">
                          Grand Total
                        </TableCell>
                        <TableCell className="text-right text-base">
                          <span className="text-green-600 dark:text-green-400">
                            ₹{totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                          {totalCreditNoteAdjust > 0 && (
                            <div className="text-xs text-purple-600 dark:text-purple-400 font-normal mt-1">
                              (CN Adj: ₹{totalCreditNoteAdjust.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-base">
                          <span className="text-red-600 dark:text-red-400">
                            ₹{totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell className={cn(
                          "text-right text-base font-bold",
                          finalBalance > 0 ? "text-red-600 dark:text-red-400" :
                          finalBalance < 0 ? "text-green-600 dark:text-green-400" :
                          "text-foreground"
                        )}>
                          ₹{Math.abs(finalBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
            </div>

            {/* Balance Reconciliation — uses the authoritative supplier snapshot so it always
                ties out to the headline "Outstanding Payable", even when individual CN/return
                rows are hidden by a tab filter or a partial schema. */}
            {selectedSupplierSnapshot && (() => {
              const snap = selectedSupplierSnapshot;
              const netPurchases =
                snap.openingBalance + snap.totalPurchases - snap.totalCreditNotesNet - snap.unreflectedReturns;
              const out = snap.balance;
              return (
                <div className="mt-4 rounded-md border bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                    <Scale className="h-3.5 w-3.5" />
                    Balance Reconciliation
                  </div>
                  <div className="space-y-1.5 text-sm tabular-nums max-w-md">
                    <div className="flex justify-between">
                      <span>Opening Balance</span>
                      <span className="font-medium">₹{Math.round(snap.openingBalance).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>(+) Total Purchases</span>
                      <span className="font-medium">₹{Math.round(snap.totalPurchases).toLocaleString("en-IN")}</span>
                    </div>
                    {snap.totalCreditNotesNet > 0 && (
                      <div className="flex justify-between text-purple-700 dark:text-purple-400">
                        <span>(−) Credit Notes Adjusted (net)</span>
                        <span className="font-medium">₹{Math.round(snap.totalCreditNotesNet).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {snap.unreflectedReturns > 0 && (
                      <div className="flex justify-between text-purple-700 dark:text-purple-400">
                        <span>(−) Purchase Returns Adjusted</span>
                        <span className="font-medium">₹{Math.round(snap.unreflectedReturns).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-1.5">
                      <span className="font-semibold">(=) Net Purchases</span>
                      <span className="font-semibold">₹{Math.round(netPurchases).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                      <span>(−) Paid (Cash / Bank)</span>
                      <span className="font-medium">₹{Math.round(snap.totalPaid).toLocaleString("en-IN")}</span>
                    </div>
                    {snap.refundsReceived > 0 && (
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                        <span>(−) Refunds Received from Supplier</span>
                        <span className="font-medium">₹{Math.round(snap.refundsReceived).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className={cn(
                      "flex justify-between border-t-2 pt-2 mt-2 text-base font-bold",
                      out > 0 ? "text-red-600 dark:text-red-400" :
                      out < 0 ? "text-emerald-700 dark:text-emerald-300" :
                      "text-foreground"
                    )}>
                      <span>Outstanding ({out > 0 ? 'Payable / Cr' : out < 0 ? 'Supplier Credit / Dr' : 'Settled'})</span>
                      <span>₹{Math.abs(Math.round(out)).toLocaleString("en-IN")}</span>
                    </div>
                    {snap.unappliedCreditNotes > 0 && (
                      <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                        <span>Unapplied CN credit available</span>
                        <span>₹{Math.round(snap.unappliedCreditNotes).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {tabCounts['cn-pending'] > 0 && (
                      <div className="text-[11px] text-orange-500 pt-0.5">
                        {tabCounts['cn-pending']} pending purchase-return CN(s) — listed in the “CN Pending” tab, not yet
                        deducted from this balance.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {supplierBillPaymentDrift && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Bill payment sync check</AlertTitle>
          <AlertDescription>
            At least one purchase bill has a paid amount that does not match bill-linked payment vouchers. Query the
            database view <span className="font-mono text-xs">supplier_bill_payment_voucher_drift</span> for this
            organization to review rows. Credit-note adjustments use{" "}
            <span className="font-mono text-xs">supplier_cn_bill_integrity_check</span>.
          </AlertDescription>
        </Alert>
      )}
      {balanceSnapshotError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Supplier balances could not be loaded fully</AlertTitle>
          <AlertDescription className="text-sm space-y-2">
            <span className="block font-medium">{balanceSnapshotError}</span>
            <span className="block text-muted-foreground">
              Outstanding needs purchase bills plus supplier payment/credit-note vouchers from the database. If totals stay at zero:
              run pending Supabase migrations; confirm your login is a member of this organization (User Rights / org access); in
              Supabase RLS, ensure <span className="font-mono text-xs">SELECT</span> on{" "}
              <span className="font-mono text-xs">voucher_entries</span> and{" "}
              <span className="font-mono text-xs">purchase_returns</span> for your role; check the browser console for the exact error.
            </span>
          </AlertDescription>
        </Alert>
      )}
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card
          className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-blue-500 to-blue-600"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardContent className="p-3">
            <p className="text-xs font-medium text-white/80">Total Suppliers</p>
            <div className="text-2xl font-black text-white tabular-nums mt-0.5">{summary.totalSuppliers}</div>
            <p className="text-xs text-white/65 mt-0.5">Active supplier accounts</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-red-500 to-red-600"
          onClick={() => setPaymentStatusFilter("outstanding")}
        >
          <CardContent className="p-3">
            <p className="text-xs font-medium text-white/80">Total Payable</p>
            <div className="text-2xl font-black text-white tabular-nums mt-0.5">
              ₹{summary.totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-white/65 mt-0.5">Amount pending payment</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardContent className="p-3">
            <p className="text-xs font-medium text-white/80">Total Purchases</p>
            <div className="text-2xl font-black text-white tabular-nums mt-0.5">
              ₹{summary.totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-white/65 mt-0.5">Total purchase value</p>
          </CardContent>
        </Card>
      </div>

      {/* Supplier List */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-semibold text-slate-800">Supplier Ledger</h3>
          <p className="text-xs text-slate-500 mt-0.5">Transaction history per supplier</p>
        </div>
        <div className="p-2 sm:p-3">
          <div className="flex flex-wrap items-center gap-2 mb-3 w-full">
            <div className="relative flex-[2] min-w-[140px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm border-slate-200"
              />
            </div>
            
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger className="flex-1 min-w-[120px] h-9 text-sm">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="advance">Advance Paid</SelectItem>
              </SelectContent>
            </Select>

            {paymentStatusFilter !== "all" && (
              <Button
                variant="ghost"
                onClick={() => setPaymentStatusFilter("all")}
                className="h-9 shrink-0"
              >
                Clear
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 overflow-auto max-h-[min(52vh,520px)]">
            <Table className={accountsHistoryTableClass}>
              <TableHeader className="!static">
                <TableRow>
                  <TableHead className={accountsHistoryThClass}>Supplier Name</TableHead>
                  <TableHead className={accountsHistoryThClass}>Contact</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-right")}>Total Purchases</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-right")}>Total Paid</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-right")}>Balance</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-center")}>Status</TableHead>
                  <TableHead className={cn(accountsHistoryThClass, "text-right")}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Loading suppliers...
                    </TableCell>
                  </TableRow>
                ) : filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow 
                      key={supplier.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedSupplier(supplier)}
                    >
                      <TableCell className="font-medium">{supplier.supplier_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          {supplier.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {supplier.phone}
                            </div>
                          )}
                          {supplier.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {supplier.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{supplier.totalPurchases.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-green-600 dark:text-green-400">
                        ₹{supplier.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-bold",
                        supplier.balance > 0 ? "text-red-600 dark:text-red-400" : 
                        supplier.balance < 0 ? "text-green-600 dark:text-green-400" : 
                        "text-foreground"
                      )}>
                        ₹{Math.abs(supplier.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {supplier.balance > 0 && (
                          <Badge variant="destructive">Payable</Badge>
                        )}
                        {supplier.balance < 0 && (
                          <Badge variant="default" className="bg-green-600">Advance</Badge>
                        )}
                        {supplier.balance === 0 && (
                          <Badge variant="outline">Settled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSupplier(supplier);
                          }}
                        >
                          View Ledger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
