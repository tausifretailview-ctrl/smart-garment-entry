import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
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
      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("id, customer_name, phone, address, opening_balance")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .order("customer_name");

      if (customersError) throw customersError;

      // Fetch all sales for balance calculation
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("customer_id, net_amount, paid_amount, sale_date")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null);

      if (salesError) throw salesError;

      // Calculate balances
      const customerBalances: Record<string, { totalSales: number; totalPaid: number; lastOrderDate: string | null }> = {};
      
      salesData?.forEach((sale) => {
        if (sale.customer_id) {
          if (!customerBalances[sale.customer_id]) {
            customerBalances[sale.customer_id] = { totalSales: 0, totalPaid: 0, lastOrderDate: null };
          }
          customerBalances[sale.customer_id].totalSales += sale.net_amount || 0;
          customerBalances[sale.customer_id].totalPaid += sale.paid_amount || 0;
          if (!customerBalances[sale.customer_id].lastOrderDate || 
              sale.sale_date > customerBalances[sale.customer_id].lastOrderDate!) {
            customerBalances[sale.customer_id].lastOrderDate = sale.sale_date;
          }
        }
      });

      const customersWithBalance: CustomerWithBalance[] = (customersData || []).map((c) => {
        const balanceData = customerBalances[c.id] || { totalSales: 0, totalPaid: 0, lastOrderDate: null };
        const openingBalance = c.opening_balance || 0;
        const balance = openingBalance + balanceData.totalSales - balanceData.totalPaid;
        return {
          ...c,
          opening_balance: openingBalance,
          totalSales: balanceData.totalSales,
          totalPaid: balanceData.totalPaid,
          balance,
          lastOrderDate: balanceData.lastOrderDate,
        };
      });

      // Sort by balance (highest first)
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
                  <h3 className="font-semibold text-foreground truncate">{customer.customer_name}</h3>
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
