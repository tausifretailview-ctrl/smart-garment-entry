import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Phone, 
  MapPin, 
  ShoppingCart, 
  Share2,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn } from "@/lib/utils";

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
  type: "sale" | "payment";
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Summary {
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  currentBalance: number;
  pendingInvoices: number;
}

const SalesmanCustomerAccount = () => {
  const { customerId } = useParams();
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { sendWhatsApp } = useWhatsAppSend();

  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

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
        .select("id, sale_number, sale_date, net_amount, paid_amount, payment_status, created_at")
        .eq("customer_id", customerId!)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .order("sale_date", { ascending: true });

      if (salesError) throw salesError;

      // Fetch payment receipts
      const { data: receiptsData, error: receiptsError } = await supabase
        .from("voucher_entries")
        .select("id, voucher_number, voucher_date, total_amount, reference_id, reference_type, created_at")
        .eq("voucher_type", "receipt")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .order("voucher_date", { ascending: true });

      if (receiptsError) throw receiptsError;

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
      const allTxns: { date: Date; type: "sale" | "payment"; data: any }[] = [];
      
      (salesData || []).forEach(sale => {
        allTxns.push({ date: new Date(sale.sale_date), type: "sale", data: sale });
      });

      customerReceipts.forEach(receipt => {
        allTxns.push({ date: new Date(receipt.voucher_date), type: "payment", data: receipt });
      });

      allTxns.sort((a, b) => a.date.getTime() - b.date.getTime());

      allTxns.forEach(txn => {
        if (txn.type === "sale") {
          runningBalance += txn.data.net_amount;
          txns.push({
            id: txn.data.id,
            date: txn.data.sale_date,
            type: "sale",
            reference: txn.data.sale_number,
            debit: txn.data.net_amount,
            credit: 0,
            balance: runningBalance,
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
              type: "payment",
              reference: `${txn.data.sale_number} Payment`,
              debit: 0,
              credit: atSalePayment,
              balance: runningBalance,
            });
          }
        } else {
          runningBalance -= txn.data.total_amount;
          txns.push({
            id: txn.data.id,
            date: txn.data.voucher_date,
            type: "payment",
            reference: txn.data.voucher_number,
            debit: 0,
            credit: txn.data.total_amount,
            balance: runningBalance,
          });
        }
      });

      setTransactions(txns);

      // Calculate summary using MAX logic to avoid double-counting
      const totalSales = (salesData || []).reduce((sum, s) => sum + (s.net_amount || 0), 0);
      
      // Use MAX of paid_amount or voucher payments for each sale (same logic as useCustomerBalance)
      let totalPaidOnSales = 0;
      (salesData || []).forEach(sale => {
        const salePaidAmount = sale.paid_amount || 0;
        const voucherAmount = voucherPaymentsBySaleId[sale.id] || 0;
        totalPaidOnSales += Math.max(salePaidAmount, voucherAmount);
      });

      // Total paid includes both invoice payments AND opening balance payments
      const totalPaid = totalPaidOnSales + openingBalanceVoucherPayments;
      
      const pendingInvoices = (salesData || []).filter(s => s.payment_status !== "completed").length;

      setSummary({
        openingBalance: customerData.opening_balance || 0,
        totalSales,
        totalPaid,
        currentBalance: (customerData.opening_balance || 0) + totalSales - totalPaid,
        pendingInvoices,
      });

    } catch (error) {
      console.error("Error fetching customer data:", error);
    } finally {
      setLoading(false);
    }
  };

  const shareStatement = async () => {
    if (!customer?.phone || !summary) return;

    // Get recent transactions (excluding opening balance entry)
    const recentTxns = transactions
      .filter(t => t.id !== "opening")
      .slice(-10); // Last 10 transactions

    let txnList = "";
    if (recentTxns.length > 0) {
      txnList = "\n📋 *Recent Transactions:*\n";
      recentTxns.forEach(txn => {
        const dateStr = txn.date === "Opening Balance" 
          ? "Opening" 
          : format(new Date(txn.date), "dd/MM/yy");
        const amount = txn.debit > 0 
          ? `+₹${txn.debit.toLocaleString("en-IN")}` 
          : `-₹${txn.credit.toLocaleString("en-IN")}`;
        txnList += `${dateStr} | ${txn.reference} | ${amount}\n`;
      });
    }

    const message = `📊 *Account Statement*\n\n` +
      `*${customer.customer_name}*\n` +
      `As on: ${format(new Date(), "dd MMM yyyy")}\n\n` +
      `Opening Balance: ₹${summary.openingBalance.toLocaleString("en-IN")}\n` +
      `Total Sales: ₹${summary.totalSales.toLocaleString("en-IN")}\n` +
      `Total Paid: ₹${summary.totalPaid.toLocaleString("en-IN")}\n` +
      `────────────────\n` +
      `*Outstanding: ₹${Math.abs(summary.currentBalance).toLocaleString("en-IN")}${summary.currentBalance < 0 ? " CR" : ""}*\n` +
      `Pending Invoices: ${summary.pendingInvoices}` +
      txnList +
      `\n\nPlease clear your dues at the earliest. Thank you! 🙏`;

    await sendWhatsApp(customer.phone, message);
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

  const summaryCards = [
    { label: "Opening", value: summary.openingBalance, icon: Clock, color: "text-blue-500" },
    { label: "Total Sales", value: summary.totalSales, icon: TrendingUp, color: "text-green-500" },
    { label: "Total Paid", value: summary.totalPaid, icon: TrendingDown, color: "text-purple-500" },
    { label: "Outstanding", value: summary.currentBalance, icon: IndianRupee, color: summary.currentBalance > 0 ? "text-red-500" : "text-green-500" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="p-4 bg-background border-b">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/salesman/customers")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold text-lg">{customer.customer_name}</h1>
            {customer.phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {customer.phone}
              </p>
            )}
          </div>
          {customer.phone && (
            <Button variant="outline" size="icon" onClick={() => window.open(`tel:${customer.phone}`)}>
              <Phone className="h-4 w-4" />
            </Button>
          )}
        </div>

        {customer.address && (
          <p className="text-sm text-muted-foreground flex items-center gap-1 mb-4">
            <MapPin className="h-4 w-4" />
            {customer.address}
          </p>
        )}

        {/* Outstanding Banner */}
        <Card className={cn(
          "border-0",
          summary.currentBalance > 0 ? "bg-red-500/10" : "bg-green-500/10"
        )}>
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Outstanding Balance</p>
            <p className={cn(
              "text-3xl font-bold",
              summary.currentBalance > 0 ? "text-red-600" : "text-green-600"
            )}>
              ₹{Math.abs(summary.currentBalance).toLocaleString("en-IN")}
              {summary.currentBalance < 0 && " CR"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn("h-4 w-4", card.color)} />
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className="font-semibold">₹{card.value.toLocaleString("en-IN")}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Transactions */}
      <div className="flex-1 p-4">
        <Tabs defaultValue="transactions">
          <TabsList className="w-full">
            <TabsTrigger value="transactions" className="flex-1">Transactions</TabsTrigger>
            <TabsTrigger value="pending" className="flex-1">Pending ({summary.pendingInvoices})</TabsTrigger>
          </TabsList>
          
          <TabsContent value="transactions" className="mt-4 space-y-2">
            {transactions.map((txn) => (
              <Card key={txn.id} className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{txn.reference}</p>
                      <p className="text-xs text-muted-foreground">
                        {txn.date === "Opening Balance" ? txn.date : format(new Date(txn.date), "dd MMM yyyy")}
                      </p>
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

          <TabsContent value="pending" className="mt-4">
            <p className="text-center text-muted-foreground py-8">
              {summary.pendingInvoices} pending invoice{summary.pendingInvoices !== 1 ? "s" : ""}
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Actions */}
      <div className="p-4 bg-background border-t flex gap-3 safe-area-pb">
        <Button
          variant="outline"
          className="flex-1 h-12"
          onClick={shareStatement}
          disabled={!customer.phone}
        >
          <Share2 className="h-5 w-5 mr-2" />
          Share Statement
        </Button>
        <Button
          className="flex-1 h-12"
          onClick={() => navigate(`/salesman/order/new?customerId=${customer.id}`)}
        >
          <ShoppingCart className="h-5 w-5 mr-2" />
          New Order
        </Button>
      </div>
    </div>
  );
};

export default SalesmanCustomerAccount;
