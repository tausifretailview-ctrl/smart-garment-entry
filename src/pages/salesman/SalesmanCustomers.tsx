import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { computeCustomerOutstanding } from "@/utils/customerBalanceUtils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Phone, MapPin, ShoppingCart, ChevronRight, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomerWithBalance {
  id: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  opening_balance: number;
  totalSales: number;
  totalPaid: number;
  balance: number;
  lastOrderDate: string | null;
}

const SalesmanCustomers = () => {
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerWithBalance[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchCustomersWithBalance();
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      setFilteredCustomers(
        customers.filter(
          (c) =>
            c.customer_name.toLowerCase().includes(term) ||
            (c.phone && c.phone.includes(term)) ||
            (c.address && c.address.toLowerCase().includes(term))
        )
      );
    } else {
      setFilteredCustomers(customers);
    }
  }, [searchTerm, customers]);

  const fetchCustomersWithBalance = async () => {
    try {
      const orgId = currentOrganization!.id;

      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("id, customer_name, phone, address, opening_balance")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .order("customer_name");
      if (customersError) throw customersError;

      // Fetch all sales (exclude cancelled/hold — same as ledger)
      const { data: salesData } = await supabase
        .from("sales")
        .select("id, customer_id, net_amount, paid_amount, sale_date, sale_return_adjust, payment_status")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .not("payment_status", "in", '("cancelled","hold")');

      // Receipt vouchers (full rows for CN / advance split)
      const { data: receiptVouchers } = await supabase
        .from("voucher_entries")
        .select("reference_id, reference_type, total_amount, payment_method, description")
        .eq("organization_id", orgId)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      const { data: allSaleReturns } = await supabase
        .from("sale_returns")
        .select("customer_id, net_amount, credit_status, linked_sale_id")
        .eq("organization_id", orgId)
        .is("deleted_at", null);

      const returnsByCustomer = new Map<string, { net_amount: number | null; credit_status: string | null; linked_sale_id: string | null }[]>();
      (allSaleReturns || []).forEach((sr: any) => {
        if (!sr.customer_id) return;
        if (!returnsByCustomer.has(sr.customer_id)) returnsByCustomer.set(sr.customer_id, []);
        returnsByCustomer.get(sr.customer_id)!.push({
          net_amount: sr.net_amount,
          credit_status: sr.credit_status,
          linked_sale_id: sr.linked_sale_id,
        });
      });

      // Fetch refund payments (outgoing to customer)
      const { data: refundVouchers } = await supabase
        .from("voucher_entries")
        .select("reference_id, total_amount")
        .eq("organization_id", orgId)
        .eq("voucher_type", "payment")
        .eq("reference_type", "customer")
        .is("deleted_at", null);

      // Fetch balance adjustments
      const { data: adjustments } = await supabase
        .from("customer_balance_adjustments")
        .select("customer_id, outstanding_difference")
        .eq("organization_id", orgId);

      const { data: advances } = await supabase
        .from("customer_advances")
        .select("id, customer_id, amount, used_amount")
        .eq("organization_id", orgId)
        .in("status", ["active", "partially_used"]);

      const advanceIds = (advances || []).map((a: any) => a.id).filter(Boolean);
      const refundByAdvanceId = new Map<string, number>();
      if (advanceIds.length > 0) {
        const { data: advRefunds } = await supabase
          .from("advance_refunds")
          .select("advance_id, refund_amount")
          .in("advance_id", advanceIds);
        (advRefunds || []).forEach((r: any) => {
          if (!r.advance_id) return;
          refundByAdvanceId.set(
            r.advance_id,
            (refundByAdvanceId.get(r.advance_id) || 0) + (Number(r.refund_amount) || 0)
          );
        });
      }

      const advancesByCustomer = new Map<string, { id: string; amount: number | null; used_amount: number | null }[]>();
      (advances || []).forEach((a: any) => {
        if (!a.customer_id) return;
        if (!advancesByCustomer.has(a.customer_id)) advancesByCustomer.set(a.customer_id, []);
        advancesByCustomer.get(a.customer_id)!.push({
          id: a.id,
          amount: a.amount,
          used_amount: a.used_amount,
        });
      });

      // Build per-customer maps
      const adjMap = new Map<string, number>();
      (adjustments || []).forEach((a: any) => {
        adjMap.set(a.customer_id, (adjMap.get(a.customer_id) || 0) + (a.outstanding_difference || 0));
      });

      const refundMap = new Map<string, number>();
      (refundVouchers || []).forEach((v: any) => {
        if (v.reference_id) refundMap.set(v.reference_id, (refundMap.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
      });

      // Group sales and track last order date per customer
      const customerSales: Record<string, { sales: any[]; lastOrderDate: string | null }> = {};
      (salesData || []).forEach((sale: any) => {
        if (sale.customer_id) {
          if (!customerSales[sale.customer_id]) customerSales[sale.customer_id] = { sales: [], lastOrderDate: null };
          customerSales[sale.customer_id].sales.push(sale);
          if (!customerSales[sale.customer_id].lastOrderDate || sale.sale_date > customerSales[sale.customer_id].lastOrderDate!) {
            customerSales[sale.customer_id].lastOrderDate = sale.sale_date;
          }
        }
      });

      const customersWithBalance: CustomerWithBalance[] = (customersData || []).map((c: any) => {
        const customerData = customerSales[c.id] || { sales: [], lastOrderDate: null };
        const openingBalance = c.opening_balance || 0;
        const custAdvances = advancesByCustomer.get(c.id) || [];
        const advanceRefundTotal = custAdvances.reduce(
          (s, adv) => s + (refundByAdvanceId.get(adv.id) || 0),
          0
        );

        const balanceResult = computeCustomerOutstanding({
          openingBalance,
          customerId: c.id,
          sales: customerData.sales,
          vouchers: (receiptVouchers || []) as any[],
          adjustmentTotal: adjMap.get(c.id) || 0,
          advances: custAdvances,
          advanceRefundTotal,
          saleReturns: returnsByCustomer.get(c.id) || [],
          refundsPaidTotal: refundMap.get(c.id) || 0,
        });

        return {
          ...c,
          opening_balance: openingBalance,
          totalSales: balanceResult.totalSales,
          totalPaid: balanceResult.totalPaid,
          balance: balanceResult.balance,
          lastOrderDate: customerData.lastOrderDate,
        };
      });

      customersWithBalance.sort((a, b) => b.balance - a.balance);
      setCustomers(customersWithBalance);
      setFilteredCustomers(customersWithBalance);
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCustomersWithBalance();
  };

  const getBalanceColor = (balance: number) => {
    if (balance <= 0) return "bg-green-500/10 text-green-600";
    if (balance < 5000) return "bg-yellow-500/10 text-yellow-600";
    return "bg-red-500/10 text-red-600";
  };

  const formatDaysAgo = (dateStr: string | null) => {
    if (!dateStr) return "No orders";
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-background pb-2 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or area..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
        <Button variant="outline" size="icon" className="h-12 w-12" onClick={handleRefresh}>
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Customer Count */}
      <p className="text-sm text-muted-foreground">
        {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? "s" : ""}
      </p>

      {/* Customer List */}
      <div className="space-y-3">
        {filteredCustomers.map((customer) => (
          <Card key={customer.id} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="font-semibold text-left text-primary underline-offset-2 hover:underline truncate w-full text-base"
                    onClick={() => navigate(`/salesman/customer/${customer.id}`)}
                  >
                    {customer.customer_name}
                  </button>
                  {customer.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Phone className="h-3 w-3" />
                      {customer.phone}
                    </p>
                  )}
                  {customer.address && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      {customer.address}
                    </p>
                  )}
                </div>
                <Badge className={cn("ml-2 shrink-0", getBalanceColor(customer.balance))}>
                  ₹{Math.abs(customer.balance).toLocaleString("en-IN")}
                  {customer.balance < 0 && " CR"}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                <span>Last Order: {formatDaysAgo(customer.lastOrderDate)}</span>
                <span>Total: ₹{customer.totalSales.toLocaleString("en-IN")}</span>
              </div>

              <div className="flex gap-2">
                {customer.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(`tel:${customer.phone}`)}
                  >
                    <Phone className="h-4 w-4 mr-1" />
                    Call
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/salesman/customer/${customer.id}`)}
                >
                  Account
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/salesman/order/new?customerId=${customer.id}`)}
                >
                  <ShoppingCart className="h-4 w-4 mr-1" />
                  Order
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No customers found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesmanCustomers;
