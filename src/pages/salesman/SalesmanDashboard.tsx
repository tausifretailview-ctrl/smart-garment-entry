import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFieldSalesAccess } from "@/hooks/useFieldSalesAccess";
import { supabase } from "@/integrations/supabase/client";
import { 
  ShoppingCart, 
  Users, 
  Clock, 
  Plus, 
  ListOrdered,
  Wallet,
  ChevronRight,
  RefreshCw,
  BookImage,
} from "lucide-react";
import { format } from "date-fns";
import { useSettings } from "@/hooks/useSettings";
import { isFieldSalesCatalogueOn } from "@/lib/fieldSalesCatalogue";

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
  const { employeeName } = useFieldSalesAccess();
  const { data: settingsData } = useSettings();
  const catalogueOn = isFieldSalesCatalogueOn(
    (settingsData as { sale_settings?: Record<string, unknown> } | null)?.sale_settings,
  );
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

  const quickActions = [
    { label: "Customers", hint: "Call, ledger, order", icon: Users, path: "/salesman/customers", tint: "bg-sky-100 text-sky-700" },
    { label: "My Orders", hint: "Today and pending", icon: ListOrdered, path: "/salesman/orders", tint: "bg-violet-100 text-violet-700" },
    { label: "Outstanding", hint: "Who has to pay", icon: Wallet, path: "/salesman/outstanding", tint: "bg-rose-100 text-rose-700" },
    ...(catalogueOn
      ? [{ label: "Catalogue", hint: "PDF on WhatsApp", icon: BookImage, path: "/salesman/catalogue", tint: "bg-emerald-100 text-emerald-700" }]
      : []),
  ];
  const rupees = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="space-y-3 p-3 animate-in fade-in-0 duration-300">
        <div className="h-12 w-48 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-36 animate-pulse rounded-3xl bg-slate-200" />
        <div className="h-14 animate-pulse rounded-2xl bg-slate-200" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 pb-6" data-testid="fs-home">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight text-slate-900">
            Hello, {employeeName?.split(" ")[0] || "Salesman"} 👋
          </h1>
          <p className="text-xs text-slate-500">{format(new Date(), "EEEE, dd MMM yyyy")}</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchDashboardData()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 active:bg-slate-100"
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Today at a glance */}
      <section className="overflow-hidden rounded-3xl bg-slate-900 p-4 text-white shadow-lg" data-testid="fs-today-card">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Today's order value</p>
        <p className="mt-1 break-all text-[32px] font-bold leading-none tracking-tight tabular-nums" data-testid="fs-today-value">
          {rupees(stats.todayValue)}
        </p>
        <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/5">
          {[
            { label: "Orders", value: stats.todayOrders, icon: ShoppingCart },
            { label: "Pending", value: stats.pendingOrders, icon: Clock },
            { label: "Customers", value: stats.customersVisited, icon: Users },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="min-w-0 px-2.5 py-2.5">
                <p className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                  <Icon className="h-3 w-3 shrink-0 text-orange-400" />
                  <span className="truncate">{stat.label}</span>
                </p>
                <p className="mt-0.5 text-xl font-bold leading-tight tabular-nums">{stat.value}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Main action */}
      <button
        type="button"
        onClick={() => navigate("/salesman/order/new")}
        className="flex h-14 w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 text-left text-white shadow-md shadow-orange-500/30 active:scale-[0.99]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <span className="min-w-0 flex-1 text-base font-bold">New Sales Order</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-white/80" />
      </button>

      <div className={quickActions.length === 4 ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={() => navigate(action.path)}
              data-testid={`fs-quick-${action.label.toLowerCase().replace(/\s+/g, "-")}`}
              className="flex min-w-0 flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm active:bg-slate-50"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${action.tint}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="w-full min-w-0">
                <span className="block truncate text-[13px] font-semibold leading-tight text-slate-900">{action.label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">{action.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Recent orders */}
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-900">Today's orders</h2>
          {recentOrders.length > 0 && (
            <button type="button" onClick={() => navigate("/salesman/orders")} className="text-xs font-semibold text-orange-600">
              See all
            </button>
          )}
        </div>
        {recentOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-700">No orders yet today</p>
            <p className="mt-1 text-xs text-slate-500">Tap New Sales Order to book the first one.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {recentOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-orange-50"
                onClick={() => navigate(`/salesman/order/${order.id}`)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-tight text-slate-900">{order.customer_name}</span>
                  <span className="mt-0.5 block truncate text-xs leading-tight text-slate-500">
                    {order.order_number} · {format(new Date(order.created_at), "hh:mm a")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-bold leading-tight tabular-nums text-slate-900">{rupees(order.net_amount)}</span>
                  <span
                    className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      order.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : order.status === "invoiced"
                          ? "bg-green-600 text-white"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {order.status}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default SalesmanDashboard;
