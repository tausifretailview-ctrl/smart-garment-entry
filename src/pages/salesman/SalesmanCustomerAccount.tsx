import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { useCustomerFinancialSnapshot } from "@/hooks/useCustomerFinancialSnapshot";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Phone, 
  Share2,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Clock,
  FileText,
  MessageCircle,
  Percent
} from "lucide-react";
import { format } from "date-fns";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn } from "@/lib/utils";
import { fetchSaleReceiptSplitsForInvoices } from "@/utils/customerBalanceUtils";
import { fetchItemsGrossBySaleId } from "@/utils/fetchItemsGrossBySaleId";
import {
  buildOutstandingReminderInvoices,
  outstandingReminderBalanceLines,
} from "@/utils/salesmanOutstandingReminder";

interface CustomerDetails {
  id: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  opening_balance: number;
}

interface Transaction {
  id: string;
  date: string;
  timestamp: string | null;
  type: "sale" | "payment" | "sale_return" | "credit_note";
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  discountAmount?: number;
  flatDiscountAmount?: number;
  grossAmount?: number;
}

interface Summary {
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  currentBalance: number;
  pendingInvoices: number;
  totalDiscount: number;
}

const SalesmanCustomerAccount = () => {
  const { customerId } = useParams();
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { sendWhatsApp } = useWhatsAppSend();
  const {
    outstandingDr: ledgerOutstanding,
    isLoading: snapshotLoading,
    refetch: refetchLedgerSnapshot,
  } = useCustomerFinancialSnapshot(customerId || null, currentOrganization?.id || null);
  const {
    openingBalance: hookOpeningBalance,
    totalSales: hookTotalSales,
    totalPaid: hookTotalPaid,
    isLoading: balanceHookLoading,
    refetch: refetchCoreBalance,
  } = useCustomerBalance(customerId || null, currentOrganization?.id || null);

  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingInvoices, setPendingInvoices] = useState<Array<{
    id: string;
    sale_number: string;
    sale_date: string;
    net_amount: number;
    paid_amount: number;
    balance: number;
    days_overdue: number;
    discount_amount: number;
  }>>([]);

  useEffect(() => {
    if (currentOrganization?.id && customerId) {
      fetchCustomerData();
    }
  }, [currentOrganization?.id, customerId]);

  const fetchCustomerData = async () => {
    try {
      // Fetch customer details
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id, customer_name, phone, address, email, opening_balance")
        .eq("id", customerId!)
        .single();

      if (customerError) throw customerError;
      setCustomer(customerData);

      // Fetch sales
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select(
          "id, sale_number, sale_date, net_amount, paid_amount, payment_status, created_at, discount_amount, flat_discount_amount, gross_amount, sale_return_adjust, cash_amount, card_amount, upi_amount, customer_id",
        )
        .eq("customer_id", customerId!)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .order("sale_date", { ascending: true });

      if (salesError) throw salesError;

      // Fetch payment receipts — scope to this customer's sale IDs + opening-balance
      // receipts so we never hit the 1000-row org cap and silently miss old payments.
      const saleIdList = (salesData || []).map((s: any) => s.id);
      const referenceIds = Array.from(new Set([...saleIdList, customerId!])).filter(Boolean);
      const { data: receiptsData, error: receiptsError } = await supabase
        .from("voucher_entries")
        .select("id, voucher_number, voucher_date, total_amount, reference_id, reference_type, created_at")
        .eq("voucher_type", "receipt")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .in("reference_id", referenceIds.length > 0 ? referenceIds : ["00000000-0000-0000-0000-000000000000"])
        .order("voucher_date", { ascending: true });

      if (receiptsError) throw receiptsError;

      // Fetch sale returns / credit notes for this customer
      const { data: saleReturnsData, error: saleReturnsError } = await supabase
        .from("sale_returns")
        .select("id, return_number, return_date, net_amount, credit_status, created_at")
        .eq("customer_id", customerId!)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .order("return_date", { ascending: true });

      if (saleReturnsError) throw saleReturnsError;

      // Filter receipts for this customer's sales AND opening balance payments
      const customerSaleIds = new Set((salesData || []).map(s => s.id));
      const customerReceipts = (receiptsData || []).filter(r => 
        r.reference_id && (
          customerSaleIds.has(r.reference_id) ||
          (r.reference_type === 'customer' && r.reference_id === customerId)
        )
      );

      // Build voucher payments map by sale id to detect which payments came from vouchers
      const voucherPaymentsBySaleId: Record<string, number> = {};
      let openingBalanceVoucherPayments = 0;
      customerReceipts.forEach(r => {
        if (r.reference_id && customerSaleIds.has(r.reference_id)) {
          voucherPaymentsBySaleId[r.reference_id] = 
            (voucherPaymentsBySaleId[r.reference_id] || 0) + (r.total_amount || 0);
        } else if (r.reference_type === 'customer' && r.reference_id === customerId) {
          openingBalanceVoucherPayments += Number(r.total_amount) || 0;
        }
      });

      // Build transaction list
      let runningBalance = customerData.opening_balance || 0;
      const txns: Transaction[] = [];

      // Add opening balance if exists
      if (customerData.opening_balance && customerData.opening_balance !== 0) {
        txns.push({
          id: "opening",
          date: "Opening Balance",
          timestamp: null,
          type: "sale",
          reference: "Opening",
          debit: customerData.opening_balance > 0 ? customerData.opening_balance : 0,
          credit: customerData.opening_balance < 0 ? Math.abs(customerData.opening_balance) : 0,
          balance: runningBalance,
        });
      }

      // Combine and sort all transactions
      const allTxns: { date: Date; timestamp: string | null; type: "sale" | "payment" | "sale_return"; data: any }[] = [];
      
      (salesData || []).forEach(sale => {
        allTxns.push({ date: new Date(sale.sale_date), timestamp: sale.created_at || null, type: "sale", data: sale });
      });

      customerReceipts.forEach(receipt => {
        allTxns.push({ date: new Date(receipt.voucher_date), timestamp: receipt.created_at || null, type: "payment", data: receipt });
      });

      (saleReturnsData || []).forEach((sr: any) => {
        allTxns.push({
          date: new Date(sr.return_date),
          timestamp: sr.created_at || null,
          type: "sale_return",
          data: sr,
        });
      });

      allTxns.sort((a, b) => {
        // Primary sort by transaction date, secondary by created timestamp
        const dateA = a.date.getTime();
        const dateB = b.date.getTime();
        if (dateA !== dateB) return dateA - dateB;
        const tsA = a.timestamp ? new Date(a.timestamp).getTime() : dateA;
        const tsB = b.timestamp ? new Date(b.timestamp).getTime() : dateB;
        return tsA - tsB;
      });

      allTxns.forEach(txn => {
        if (txn.type === "sale") {
          const totalDisc = (txn.data.discount_amount || 0) + (txn.data.flat_discount_amount || 0);
          runningBalance += txn.data.net_amount;
          txns.push({
            id: txn.data.id,
            date: txn.data.sale_date,
            timestamp: txn.timestamp,
            type: "sale",
            reference: txn.data.sale_number,
            debit: txn.data.net_amount,
            credit: 0,
            balance: runningBalance,
            discountAmount: totalDisc,
            grossAmount: txn.data.gross_amount || 0,
          });

          // Add at-sale payment ONLY if it's NOT covered by voucher receipts
          // (i.e., the paid_amount was recorded at the time of sale, not via a later voucher)
          const saleVoucherPayments = voucherPaymentsBySaleId[txn.data.id] || 0;
          const atSalePayment = Math.max(0, (txn.data.paid_amount || 0) - saleVoucherPayments);
          
          if (atSalePayment > 0) {
            runningBalance -= atSalePayment;
            txns.push({
              id: `${txn.data.id}-payment`,
              date: txn.data.sale_date,
              timestamp: txn.timestamp,
              type: "payment",
              reference: `${txn.data.sale_number} Payment`,
              debit: 0,
              credit: atSalePayment,
              balance: runningBalance,
            });
          }
        } else if (txn.type === "payment") {
          runningBalance -= txn.data.total_amount;
          txns.push({
            id: txn.data.id,
            date: txn.data.voucher_date,
            timestamp: txn.timestamp,
            type: "payment",
            reference: txn.data.voucher_number,
            debit: 0,
            credit: txn.data.total_amount,
            balance: runningBalance,
          });
        } else if (txn.type === "sale_return") {
          const creditAmount = Number(txn.data.net_amount) || 0;
          if (creditAmount <= 0) return;
          runningBalance -= creditAmount;

          const isCreditNote = (txn.data.credit_status || "").toLowerCase() !== "refunded";
          const label = isCreditNote ? "Credit Note" : "Sale Return";

          txns.push({
            id: txn.data.id,
            date: txn.data.return_date,
            timestamp: txn.timestamp,
            type: isCreditNote ? "credit_note" : "sale_return",
            reference: txn.data.return_number || label,
            debit: 0,
            credit: creditAmount,
            balance: runningBalance,
          });
        }
      });

      setTransactions(txns);

      const totalSales = (salesData || []).reduce((sum, s) => sum + (s.net_amount || 0), 0);
      const totalDiscount = (salesData || []).reduce((sum, s) => sum + (s.discount_amount || 0) + (s.flat_discount_amount || 0), 0);
      
      // Use MAX of paid_amount or voucher payments for each sale (same logic as useCustomerBalance)
      let totalPaidOnSales = 0;
      (salesData || []).forEach(sale => {
        const salePaidAmount = sale.paid_amount || 0;
        const voucherAmount = voucherPaymentsBySaleId[sale.id] || 0;
        totalPaidOnSales += Math.max(salePaidAmount, voucherAmount);
      });

      // Total paid includes both invoice payments AND opening balance payments
      const totalPaid = totalPaidOnSales + openingBalanceVoucherPayments;
      
      // Per-invoice outstanding must match Invoice Dashboard. Paid + S/R rows
      // (INV/26-27/236) were still listed because reconcile leftover equalled
      // sale_return_adjust when items_gross / CN split was missing.
      const receiptSplitMap = await fetchSaleReceiptSplitsForInvoices(
        supabase,
        currentOrganization!.id,
        (salesData || []).map((s) => ({
          id: s.id,
          sale_number: s.sale_number,
          customer_id: s.customer_id ?? customerId,
        })),
      );

      const saleIdsNeedingGross = (salesData || [])
        .filter((s) => Number(s.sale_return_adjust || 0) > 0.005)
        .map((s) => s.id);
      const itemsGrossBySale = await fetchItemsGrossBySaleId(supabase, saleIdsNeedingGross);

      const pendingList = buildOutstandingReminderInvoices({
        sales: salesData || [],
        splitBySale: receiptSplitMap,
        itemsGrossBySale,
      });

      setPendingInvoices(pendingList);

      setSummary({
        openingBalance: customerData.opening_balance || 0,
        totalSales,
        totalPaid,
        currentBalance: (customerData.opening_balance || 0) + totalSales - totalPaid,
        pendingInvoices: pendingList.length,
        totalDiscount,
      });

      void refetchLedgerSnapshot();
      void refetchCoreBalance();

    } catch (error) {
      console.error("Error fetching customer data:", error);
    } finally {
      setLoading(false);
    }
  };

  const shareStatement = async () => {
    if (!customer?.phone || !summary) return;

    // Build pending invoices list (only invoices with remaining balance)
    const invoiceTxns = transactions.filter(t => t.type === "sale" && t.debit > 0 && t.id !== "opening");
    const paymentsByRef = new Map<string, number>();
    transactions.forEach(t => {
      if (t.credit > 0 && t.reference) {
        const baseRef = t.reference.replace(/ Payment$/, '');
        paymentsByRef.set(baseRef, (paymentsByRef.get(baseRef) || 0) + t.credit);
      }
    });
    
    const pendingInvoices = invoiceTxns
      .map(t => {
        const paid = paymentsByRef.get(t.reference) || 0;
        const remaining = Math.round(t.debit - paid);
        return { ...t, remaining };
      })
      .filter(t => t.remaining > 0);

    let txnList = "";
    if (pendingInvoices.length > 0) {
      txnList = "\n📋 *Pending Invoices:*\n";
      pendingInvoices.forEach(txn => {
        const dateStr = format(new Date(txn.date), "dd/MM/yy");
        txnList += `${dateStr} | ${txn.reference} | ₹${Math.round(txn.debit).toLocaleString("en-IN")} | Bal: ₹${txn.remaining.toLocaleString("en-IN")}\n`;
      });
    }

    const message = `📊 *Account Statement*\n\n` +
      `*${customer.customer_name}*\n` +
      `As on: ${format(new Date(), "dd MMM yyyy")}\n\n` +
      `Opening Balance: ₹${summary.openingBalance.toLocaleString("en-IN")}\n` +
      `Total Sales: ₹${summary.totalSales.toLocaleString("en-IN")}\n` +
      `Total Paid: ₹${summary.totalPaid.toLocaleString("en-IN")}\n` +
      `────────────────\n` +
      `*Outstanding: ₹${Math.abs(ledgerOutstanding).toLocaleString("en-IN")}${ledgerOutstanding < 0 ? " CR" : ""}*` +
      txnList +
      `\n\nPlease clear your dues at the earliest. Thank you! 🙏`;

    await sendWhatsApp(customer.phone, message);
  };

  const sendInvoiceReminder = async (invoice: typeof pendingInvoices[0]) => {
    if (!customer?.phone) return;

    const orgSlug = currentOrganization?.slug || '';
    const invoiceLink = `https://app.inventoryshop.in/${orgSlug}/invoice/view/${invoice.id}`;

    const message =
      `🔔 *Payment Reminder*\n\n` +
      `Dear *${customer.customer_name}*,\n\n` +
      `Invoice *${invoice.sale_number}* dated ${format(new Date(invoice.sale_date), 'dd MMM yyyy')} ` +
      `is pending.\n\n` +
      `Invoice Amount: ₹${Math.round(invoice.net_amount).toLocaleString('en-IN')}\n` +
      (invoice.paid_amount > 0
        ? `Paid: ₹${invoice.paid_amount.toLocaleString('en-IN')}\n`
        : '') +
      `*Outstanding: ₹${Math.round(invoice.balance).toLocaleString('en-IN')}*\n\n` +
      `📄 View Invoice:\n${invoiceLink}\n\n` +
      `Please clear your dues at the earliest. Thank you! 🙏`;

    await sendWhatsApp(customer.phone, message);
  };

  const sendAllOutstandingReminder = async () => {
    if (!customer?.phone || pendingInvoices.length === 0) return;

    const totalOutstanding = ledgerOutstanding;
    const openingBal = customer.opening_balance || 0;
    const billWisePending = Math.round(totalOutstanding - openingBal);
    const billWiseSum = pendingInvoices.reduce((s, inv) => s + (inv.balance || 0), 0);
    const excessOverLedger = Math.round(billWiseSum - Math.max(0, billWisePending));

    const invoiceLines = pendingInvoices
      .map(inv =>
        `• ${inv.sale_number} (${format(new Date(inv.sale_date), 'dd MMM')})` +
        ` — ₹${Math.round(inv.balance).toLocaleString('en-IN')}` +
        (inv.days_overdue > 0 ? ` — ${inv.days_overdue}d` : '')
      )
      .join('\n');

    const openingLine = openingBal > 0
      ? `\n💰 Opening Balance: ₹${Math.round(openingBal).toLocaleString('en-IN')}\n📋 Bill-wise Pending: ₹${billWisePending.toLocaleString('en-IN')}\n`
      : '';

    const message =
      `🔔 *Outstanding Invoice Reminder*\n\n` +
      `Dear *${customer.customer_name}*,\n\n` +
      `You have *${pendingInvoices.length} pending invoice${pendingInvoices.length > 1 ? 's' : ''}*:\n\n` +
      `${invoiceLines}\n\n` +
      `────────────────${openingLine}\n` +
      `${outstandingReminderBalanceLines({
        invoiceBalanceTotal: billWiseSum,
        ledgerBalance: totalOutstanding,
      })}\n\n` +
      `Please clear your dues at the earliest.\n` +
      `Thank you for your business! 🙏`;

    await sendWhatsApp(customer.phone, message);

    if (excessOverLedger >= 1) {
      try {
        const { toast } = await import('sonner');
        toast.message(
          `Listed invoice total (₹${billWiseSum.toLocaleString('en-IN')}) exceeds bill-wise pending (₹${billWisePending.toLocaleString('en-IN')}) by ₹${excessOverLedger.toLocaleString('en-IN')}. Reassign receipts posted to closed invoices from History to align records.`,
          { duration: 8000 },
        );
      } catch { /* ignore */ }
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-32" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  if (!customer || !summary) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Customer not found
      </div>
    );
  }

  // Same RPC as Customer Ledger (get_customer_financial_snapshot)
  const displayBalance = ledgerOutstanding;
  const metricsLoading = snapshotLoading || balanceHookLoading;

  const summaryCards = [
    { label: "Opening", value: hookOpeningBalance || summary.openingBalance, icon: Clock, color: "text-blue-500" },
    { label: "Total Sales", value: hookTotalSales || summary.totalSales, icon: TrendingUp, color: "text-green-500" },
    { label: "Total Discount", value: summary.totalDiscount, icon: Percent, color: "text-orange-500" },
    { label: "Total Paid", value: hookTotalPaid || summary.totalPaid, icon: TrendingDown, color: "text-purple-500" },
    { label: "Outstanding", value: displayBalance, icon: IndianRupee, color: displayBalance > 0 ? "text-red-500" : "text-green-500" },
  ];

  return (
    <div className="flex min-h-full flex-col" data-testid="fs-customer-account">
      {/* Customer + balance */}
      <div className="space-y-3 px-3 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/salesman/customers")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 active:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-bold leading-tight text-slate-900">{customer.customer_name}</h1>
            <p className="truncate text-xs leading-tight text-slate-500">
              {[customer.phone, customer.address].filter(Boolean).join(" · ") || "No phone or address"}
            </p>
          </div>
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm active:bg-emerald-600"
              aria-label={`Call ${customer.customer_name}`}
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {displayBalance < 0 ? "Advance with us" : "Outstanding balance"}
            </p>
            {metricsLoading ? (
              <Skeleton className="mt-1 h-8 w-32 bg-white/10" />
            ) : (
              <p
                className={cn(
                  "truncate text-[28px] font-bold leading-tight tabular-nums",
                  displayBalance > 0 ? "text-rose-300" : "text-emerald-300",
                )}
              >
                ₹{Math.abs(displayBalance).toLocaleString("en-IN")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate(`/salesman/order/new?customerId=${customer.id}`)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 text-sm font-bold text-white shadow-sm active:bg-orange-600"
          >
            New order
          </button>
        </div>

        <button
          type="button"
          onClick={sendAllOutstandingReminder}
          disabled={!customer.phone || pendingInvoices.length === 0}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 active:bg-emerald-100 disabled:opacity-40"
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          Send outstanding on WhatsApp
        </button>

        <div className="grid grid-cols-2 gap-2">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", card.color)} />
                  <span className="truncate">{card.label}</span>
                </p>
                <p className="mt-0.5 truncate text-base font-bold tabular-nums text-slate-900">
                  ₹{Math.round(card.value).toLocaleString("en-IN")}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transactions */}
      <div className="flex-1 p-4">
        <Tabs defaultValue="transactions">
          <TabsList className="w-full">
            <TabsTrigger value="transactions" className="flex-1 data-[state=active]:text-orange-600">Transactions</TabsTrigger>
            <TabsTrigger value="pending" className="flex-1 data-[state=active]:text-orange-600">
              Outstanding ({pendingInvoices.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="transactions" className="mt-4 space-y-2">
            {transactions.map((txn) => (
              <Card key={txn.id} className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{txn.reference}</p>
                      <p className="text-xs text-muted-foreground">
                        {txn.date === "Opening Balance" ? txn.date : (
                          <>
                            {format(new Date(txn.date), "dd MMM yyyy")}
                            {txn.timestamp && (
                              <span className="ml-1 text-muted-foreground/70">
                                {format(new Date(txn.timestamp), "hh:mm a")}
                              </span>
                            )}
                          </>
                        )}
                      </p>
                      {txn.type === "sale" && (txn.discountAmount || 0) > 0 && (
                        <p className="text-xs text-orange-500 mt-0.5">
                          Disc: ₹{(txn.discountAmount || 0).toLocaleString("en-IN")}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {txn.debit > 0 && (
                        <p className="text-red-600 font-medium">+₹{txn.debit.toLocaleString("en-IN")}</p>
                      )}
                      {txn.credit > 0 && (
                        <p className="text-green-600 font-medium">-₹{txn.credit.toLocaleString("en-IN")}</p>
                      )}
                      <p className="text-xs text-muted-foreground">Bal: ₹{txn.balance.toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="pending" className="mt-4 space-y-3">
            {pendingInvoices.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No outstanding invoices</p>
                <p className="text-xs mt-1">All invoices are cleared ✅</p>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="w-full h-11 text-green-700 border-green-300 hover:bg-green-50"
                  onClick={sendAllOutstandingReminder}
                  disabled={!customer.phone}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Send All {pendingInvoices.length} Outstanding on WhatsApp
                </Button>

                {pendingInvoices.map(invoice => (
                  <Card key={invoice.id} className="border-0 shadow-sm overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex items-start justify-between p-3 pb-2">
                        <div>
                          <p className="font-bold text-sm">{invoice.sale_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(invoice.sale_date), 'dd MMM yyyy')}
                            {invoice.days_overdue > 0 && (
                              <span className={cn(
                                "ml-2 font-medium",
                                invoice.days_overdue > 30 ? "text-red-500" : "text-amber-500"
                              )}>
                                {invoice.days_overdue}d overdue
                              </span>
                            )}
                          </p>
                          {invoice.discount_amount > 0 && (
                            <p className="text-xs text-orange-500">
                              Disc: ₹{invoice.discount_amount.toLocaleString("en-IN")}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">
                            ₹{Math.round(invoice.balance).toLocaleString('en-IN')}
                          </p>
                          {invoice.paid_amount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              of ₹{invoice.net_amount.toLocaleString('en-IN')}
                            </p>
                          )}
                        </div>
                      </div>

                      {invoice.paid_amount > 0 && invoice.net_amount > 0 && (
                        <div className="px-3 pb-2">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${Math.min(100, (invoice.paid_amount / invoice.net_amount) * 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            ₹{invoice.paid_amount.toLocaleString('en-IN')} paid
                          </p>
                        </div>
                      )}

                      <div className="flex border-t">
                        <a
                          href={`https://app.inventoryshop.in/${currentOrganization?.slug || ''}/invoice/view/${invoice.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-blue-600 hover:bg-blue-50 border-r"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View Invoice
                        </a>
                        <button
                          onClick={() => sendInvoiceReminder(invoice)}
                          disabled={!customer.phone}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-40"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Send Reminder
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
};

export default SalesmanCustomerAccount;
