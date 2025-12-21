import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ShoppingCart, 
  Users, 
  IndianRupee, 
  Clock, 
  Plus, 
  ListOrdered,
  Wallet,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";

interface DashboardStats {
  todayOrders: number;
  pendingOrders: number;
  todayValue: number;
  customersVisited: number;
}

interface RecentOrder {
  id: string;
  order_number: string;
  customer_name: string;
  net_amount: number;
  created_at: string;
  status: string;
}

const SalesmanDashboard = () => {
  const { navigate, getOrgPath } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    todayOrders: 0,
    pendingOrders: 0,
    todayValue: 0,
    customersVisited: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentOrganization?.id && user?.id) {
      fetchDashboardData();
    }
  }, [currentOrganization?.id, user?.id]);

  const fetchDashboardData = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch today's orders for this salesman
      const { data: orders, error } = await supabase
        .from("sale_orders")
        .select("id, order_number, customer_name, customer_id, net_amount, created_at, status")
        .eq("organization_id", currentOrganization!.id)
        .eq("created_by", user!.id)
        .gte("order_date", today.toISOString())
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const todayOrders = orders || [];
      const pendingOrders = todayOrders.filter(o => o.status === "pending").length;
      const todayValue = todayOrders.reduce((sum, o) => sum + (o.net_amount || 0), 0);
      const uniqueCustomers = new Set(todayOrders.map(o => o.customer_id)).size;

      setStats({
        todayOrders: todayOrders.length,
        pendingOrders,
        todayValue,
        customersVisited: uniqueCustomers,
      });

      setRecentOrders(todayOrders.slice(0, 5));
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: "Today's Orders", value: stats.todayOrders, icon: ShoppingCart, color: "text-blue-500" },
    { label: "Pending", value: stats.pendingOrders, icon: Clock, color: "text-yellow-500" },
    { label: "Customers", value: stats.customersVisited, icon: Users, color: "text-green-500" },
    { label: "Total Value", value: `₹${stats.todayValue.toLocaleString("en-IN")}`, icon: IndianRupee, color: "text-purple-500" },
  ];

  const quickActions = [
    { label: "New Sales Order", icon: Plus, path: "/salesman/order/new", variant: "default" as const },
    { label: "Customer List", icon: Users, path: "/salesman/customers", variant: "outline" as const },
    { label: "My Orders Today", icon: ListOrdered, path: "/salesman/orders", variant: "outline" as const },
    { label: "Outstanding Report", icon: Wallet, path: "/salesman/outstanding", variant: "outline" as const },
  ];

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Welcome */}
      <div>
        <h1 className="text-lg font-bold text-foreground">Welcome back!</h1>
        <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, dd MMM yyyy")}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border shadow-sm">
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-full bg-muted ${stat.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="space-y-2">
        <h2 className="font-semibold text-sm text-foreground">Quick Actions</h2>
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.label}
              variant={action.variant}
              className="w-full h-10 justify-start text-left text-sm"
              onClick={() => navigate(action.path)}
            >
              <Icon className="h-4 w-4 mr-2" />
              <span className="flex-1">{action.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          );
        })}
      </div>

      {/* Recent Orders */}
      {recentOrders.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm text-foreground">Recent Orders</h2>
          {recentOrders.map((order) => (
            <Card
              key={order.id}
              className="border shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/salesman/order/${order.id}`)}
            >
              <CardContent className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-xs">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">{order.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">₹{order.net_amount.toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(order.created_at), "hh:mm a")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SalesmanDashboard;
