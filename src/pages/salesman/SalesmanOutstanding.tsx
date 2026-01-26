import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, 
  Search, 
  Phone, 
  MessageCircle,
  IndianRupee,
  Users,
  RefreshCw,
  Link2
} from "lucide-react";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn } from "@/lib/utils";
import { PaymentLinkDialog } from "@/components/PaymentLinkDialog";

interface CustomerOutstanding {
  id: string;
  customer_name: string;
  phone: string | null;
  balance: number;
  invoiceCount: number;
}

const SalesmanOutstanding = () => {
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { sendWhatsApp } = useWhatsAppSend();

  const [customers, setCustomers] = useState<CustomerOutstanding[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerOutstanding[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  
  // Payment link dialog state
  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOutstanding | null>(null);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchOutstanding();
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      setFilteredCustomers(
        customers.filter(c =>
          c.customer_name.toLowerCase().includes(term) ||
          (c.phone && c.phone.includes(term))
        )
      );
    } else {
      setFilteredCustomers(customers);
    }
  }, [searchTerm, customers]);

  const fetchOutstanding = async () => {
    try {
      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("id, customer_name, phone, opening_balance")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null);

      if (customersError) throw customersError;

      // Fetch sales with IDs for voucher matching
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id, customer_id, net_amount, paid_amount, payment_status")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null);

      if (salesError) throw salesError;

      // Fetch ALL voucher payments
      const { data: allVouchers, error: vouchersError } = await supabase
        .from("voucher_entries")
        .select("reference_id, reference_type, total_amount")
        .eq("organization_id", currentOrganization!.id)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      if (vouchersError) throw vouchersError;

      // Build sale_id -> customer_id map
      const saleToCustomerMap: Record<string, string> = {};
      (salesData || []).forEach(sale => {
        if (sale.customer_id) {
          saleToCustomerMap[sale.id] = sale.customer_id;
        }
      });

      // Separate opening balance payments from invoice payments
      const openingBalancePayments: Record<string, number> = {};
      const invoiceVoucherPayments: Record<string, number> = {};

      (allVouchers || []).forEach(v => {
        if (!v.reference_id) return;
        
        const customerId = saleToCustomerMap[v.reference_id];
        if (v.reference_type === 'sale' || customerId) {
          invoiceVoucherPayments[v.reference_id] = 
            (invoiceVoucherPayments[v.reference_id] || 0) + (Number(v.total_amount) || 0);
        } else if (v.reference_type === 'customer') {
          openingBalancePayments[v.reference_id] = 
            (openingBalancePayments[v.reference_id] || 0) + (Number(v.total_amount) || 0);
        }
      });

      // Calculate balances with consistent logic
      const balanceMap: Record<string, { balance: number; invoiceCount: number }> = {};

      (salesData || []).forEach(sale => {
        if (sale.customer_id) {
          if (!balanceMap[sale.customer_id]) {
            balanceMap[sale.customer_id] = { balance: 0, invoiceCount: 0 };
          }
          // Use Math.max to avoid double-counting
          const salePaidAmount = sale.paid_amount || 0;
          const voucherAmount = invoiceVoucherPayments[sale.id] || 0;
          const totalPaid = Math.max(salePaidAmount, voucherAmount);
          
          balanceMap[sale.customer_id].balance += (sale.net_amount || 0) - totalPaid;
          if (sale.payment_status !== "completed") {
            balanceMap[sale.customer_id].invoiceCount += 1;
          }
        }
      });

      const outstandingCustomers: CustomerOutstanding[] = (customersData || [])
        .map(c => {
          const salesBalance = balanceMap[c.id] || { balance: 0, invoiceCount: 0 };
          const openingBalance = c.opening_balance || 0;
          const openingBalancePaid = openingBalancePayments[c.id] || 0;
          // Round balance to whole number (no decimals)
          const totalBalance = Math.round(openingBalance + salesBalance.balance - openingBalancePaid);
          return {
            id: c.id,
            customer_name: c.customer_name,
            phone: c.phone,
            balance: totalBalance,
            invoiceCount: salesBalance.invoiceCount + (openingBalance - openingBalancePaid > 0 ? 1 : 0),
          };
        })
        .filter(c => c.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      setCustomers(outstandingCustomers);
      setFilteredCustomers(outstandingCustomers);
      setTotalOutstanding(outstandingCustomers.reduce((sum, c) => sum + c.balance, 0));
    } catch (error) {
      console.error("Error fetching outstanding:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchOutstanding();
  };

  const sendReminder = async (customer: CustomerOutstanding) => {
    if (!customer.phone) return;

    const message = `🔔 *Payment Reminder*\n\n` +
      `Dear ${customer.customer_name},\n\n` +
      `This is a friendly reminder that you have an outstanding balance of *₹${customer.balance.toLocaleString("en-IN")}*.\n\n` +
      `Pending Invoices: ${customer.invoiceCount}\n\n` +
      `Please clear your dues at the earliest convenience.\n\n` +
      `Thank you for your business!`;

    await sendWhatsApp(customer.phone, message);
  };

  const openPaymentLink = (customer: CustomerOutstanding) => {
    setSelectedCustomer(customer);
    setPaymentLinkOpen(true);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-24" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="p-4 bg-background border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/salesman")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold text-lg">Outstanding Report</h1>
          </div>
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>

        {/* Summary */}
        <Card className="border-0 bg-red-500/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-500/20">
                  <IndianRupee className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Outstanding</p>
                  <p className="text-2xl font-bold text-red-600">
                    ₹{totalOutstanding.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="font-semibold text-foreground">{customers.length}</span>
                </div>
                <p className="text-xs text-muted-foreground">Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="p-4 bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
      </div>

      {/* Customer List */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <IndianRupee className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No outstanding found</p>
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <Card key={customer.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => navigate(`/salesman/customer/${customer.id}`)}
                  >
                    <p className="font-semibold">{customer.customer_name}</p>
                    {customer.phone && (
                      <p className="text-sm text-muted-foreground">{customer.phone}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-600">
                      ₹{customer.balance.toLocaleString("en-IN")}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {customer.invoiceCount} invoice{customer.invoiceCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>

                <div className="flex gap-2">
                  {customer.phone && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => window.open(`tel:${customer.phone}`)}
                      >
                        <Phone className="h-4 w-4 mr-1" />
                        Call
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => sendReminder(customer)}
                      >
                        <MessageCircle className="h-4 w-4 mr-1" />
                        Remind
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openPaymentLink(customer)}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        Pay Link
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Payment Link Dialog */}
      {selectedCustomer && (
        <PaymentLinkDialog
          open={paymentLinkOpen}
          onOpenChange={setPaymentLinkOpen}
          customerName={selectedCustomer.customer_name}
          customerPhone={selectedCustomer.phone}
          amount={selectedCustomer.balance}
          invoiceCount={selectedCustomer.invoiceCount}
        />
      )}
    </div>
  );
};

export default SalesmanOutstanding;
