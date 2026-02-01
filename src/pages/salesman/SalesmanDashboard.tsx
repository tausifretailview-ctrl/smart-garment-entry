import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCardSkeleton, ListSkeleton } from "@/components/ui/skeletons";
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
    { label: "Today's Orders", value: stats.todayOrders, icon: ShoppingCart, gradient: "from-orange-500 to-amber-500" },
    { label: "Pending", value: stats.pendingOrders, icon: Clock, gradient: "from-yellow-500 to-orange-400" },
    { label: "Customers", value: stats.customersVisited, icon: Users, gradient: "from-amber-500 to-yellow-500" },
    { label: "Total Value", value: `₹${stats.todayValue.toLocaleString("en-IN")}`, icon: IndianRupee, gradient: "from-orange-600 to-amber-500" },
  ];

  const quickActions = [
    { label: "New Sales Order", icon: Plus, path: "/salesman/order/new", primary: true },
    { label: "Customer List", icon: Users, path: "/salesman/customers", primary: false },
    { label: "My Orders Today", icon: ListOrdered, path: "/salesman/orders", primary: false },
    { label: "Outstanding Report", icon: Wallet, path: "/salesman/outstanding", primary: false },
  ];

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-in fade-in-0 duration-300">
        <div className="space-y-1">
          <div className="h-6 w-32 bg-muted animate-pulse rounded" />
          <div className="h-4 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <MetricCardSkeleton key={i} />)}
        </div>
        <ListSkeleton items={4} showIcon={true} />
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

      {/* Stats Grid - Orange gradient cards */}
      <div className="grid grid-cols-2 gap-2">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className={`bg-gradient-to-br ${stat.gradient} text-white border-0 shadow-lg`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-white/20">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{stat.value}</p>
                    <p className="text-[10px] text-white/80">{stat.label}</p>
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
              variant={action.primary ? "default" : "outline"}
              className={`w-full h-10 justify-start text-left text-sm ${
                action.primary 
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white border-0" 
                  : "border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-500"
              }`}
              onClick={() => navigate(action.path)}
            >
              <Icon className="h-4 w-4 mr-2" />
              <span className="flex-1">{action.label}</span>
              <ChevronRight className={`h-4 w-4 ${action.primary ? "text-white/70" : "text-muted-foreground"}`} />
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
              className="border border-orange-500/20 shadow-sm cursor-pointer hover:bg-orange-500/5 transition-colors"
              onClick={() => navigate(`/salesman/order/${order.id}`)}
            >
              <CardContent className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-xs text-orange-500">{order.order_number}</p>
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
