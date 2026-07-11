import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
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
  Link2,
} from "lucide-react";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn } from "@/lib/utils";
import { PaymentLinkDialog } from "@/components/PaymentLinkDialog";
import { fetchAllCustomers, fetchAllSalesSummary } from "@/utils/fetchAllRows";
import {
  fetchCustomerFinancialSnapshotMap,
  fetchCustomersWithFinancialActivity,
} from "@/utils/customerFinancialSnapshot";

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
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const [searchTerm, setSearchTerm] = useState("");
  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOutstanding | null>(null);

  const {
    data: outstandingData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["salesman-outstanding", orgId],
    enabled: !!orgId,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const customersData = await fetchAllCustomers(orgId!);
      const allSales = await fetchAllSalesSummary(orgId!);
      const financialIds = await fetchCustomersWithFinancialActivity(orgId!);
      const customerIds = (customersData || [])
        .map((c: { id: string }) => c.id)
        .filter((id) => financialIds.has(id));
      const snapMap = await fetchCustomerFinancialSnapshotMap(orgId!, customerIds);

      const invoiceCountMap: Record<string, number> = {};
      (allSales || []).forEach((sale: any) => {
        if (sale.customer_id && sale.payment_status !== "completed") {
          invoiceCountMap[sale.customer_id] = (invoiceCountMap[sale.customer_id] || 0) + 1;
        }
      });

      const outstandingCustomers: CustomerOutstanding[] = (customersData || [])
        .map((c: any) => {
          const balance = snapMap.get(c.id)?.outstandingDr ?? 0;
          const openingBalance = c.opening_balance || 0;
          return {
            id: c.id,
            customer_name: c.customer_name,
            phone: c.phone,
            balance,
            invoiceCount: (invoiceCountMap[c.id] || 0) + (openingBalance > 0 ? 1 : 0),
          };
        })
        .filter((c) => c.balance >= 1)
        .sort((a, b) => b.balance - a.balance);

      const totalOutstanding = outstandingCustomers.reduce((sum, c) => sum + c.balance, 0);
      return { customers: outstandingCustomers, totalOutstanding };
    },
  });

  const customers = outstandingData?.customers ?? [];
  const totalOutstanding = outstandingData?.totalOutstanding ?? 0;

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(term) ||
        (c.phone && c.phone.includes(term)),
    );
  }, [searchTerm, customers]);

  const handleRefresh = () => {
    if (orgId) {
      void queryClient.invalidateQueries({ queryKey: ["salesman-outstanding", orgId] });
    } else {
      void refetch();
    }
  };

  const sendReminder = async (customer: CustomerOutstanding) => {
    if (!customer.phone) return;

    const message =
      `🔔 *Payment Reminder*\n\n` +
      `Dear ${customer.customer_name},\n\n` +
      `This is a friendly reminder that you have an outstanding balance of *₹${Math.round(customer.balance).toLocaleString("en-IN")}*.\n\n` +
      `Pending Invoices: ${customer.invoiceCount}\n\n` +
      `Please clear your dues at the earliest convenience.\n\n` +
      `Thank you for your business!`;

    await sendWhatsApp(customer.phone, message);
  };

  const openPaymentLink = (customer: CustomerOutstanding) => {
    setSelectedCustomer(customer);
    setPaymentLinkOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-24" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
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
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
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
