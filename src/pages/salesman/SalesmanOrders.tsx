import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Eye, 
  Share2, 
  ShoppingCart,
  RefreshCw,
  Plus,
  Check,
  Loader2,
  Search
} from "lucide-react";
import { format } from "date-fns";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface SaleOrder {
  id: string;
  order_number: string;
  order_date: string;
  customer_name: string;
  customer_phone: string | null;
  net_amount: number;
  status: string;
  created_at: string;
  customer_accepted: boolean | null;
}

const SalesmanOrders = () => {
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { sendWhatsApp } = useWhatsAppSend();

  const { toast } = useToast();

  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("today");
  const [orderToAccept, setOrderToAccept] = useState<SaleOrder | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (currentOrganization?.id && user?.id) {
      fetchOrders();
    }
  }, [currentOrganization?.id, user?.id, activeTab]);

  const fetchOrders = async () => {
    setLoading(true);
    setOrders([]);
    try {
      let query = supabase
        .from("sale_orders")
        .select("id, order_number, order_date, customer_name, customer_phone, net_amount, status, created_at, customer_accepted")
        .eq("organization_id", currentOrganization!.id)
        .eq("created_by", user!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (activeTab === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.gte("order_date", today.toISOString());
      } else if (activeTab === "pending") {
        query = query.eq("status", "pending");
      }

      const { data, error } = await query;

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-700";
      case "confirmed":
        return "bg-sky-100 text-sky-700";
      case "fulfilled":
        return "bg-emerald-100 text-emerald-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  const handleAcceptOrder = async () => {
    if (!orderToAccept) return;

    setIsAccepting(true);
    try {
      const { error } = await supabase
        .from('sale_orders')
        .update({ customer_accepted: true })
        .eq('id', orderToAccept.id);

      if (error) throw error;

      toast({ title: "Success", description: `Order ${orderToAccept.order_number} accepted` });
      fetchOrders();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAccepting(false);
      setOrderToAccept(null);
    }
  };

  const shareOrder = async (order: SaleOrder) => {
    if (!order.customer_phone) return;

    // Fetch order items
    const { data: items } = await supabase
      .from("sale_order_items")
      .select("product_name, size, color, order_qty, unit_price, line_total")
      .eq("order_id", order.id);

    const itemsList = (items || []).map(i => {
      const colorPart = i.color ? ` - ${i.color}` : '';
      return `• ${i.product_name}${colorPart} (${i.size}) x ${i.order_qty} = ₹${i.line_total.toLocaleString("en-IN")}`;
    }).join("\n");

    const message = `🛒 *Sales Order*\n\n` +
      `Order No: ${order.order_number}\n` +
      `Date: ${format(new Date(order.order_date), "dd MMM yyyy")}\n` +
      `Customer: ${order.customer_name}\n\n` +
      `*Items:*\n${itemsList}\n\n` +
      `*Total: ₹${order.net_amount.toLocaleString("en-IN")}*\n\n` +
      `Status: ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}\n\n` +
      `Thank you!`;

    await sendWhatsApp(order.customer_phone, message);
  };

  const todayTotal = orders
    .filter(o => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(o.order_date) >= today;
    })
    .reduce((sum, o) => sum + o.net_amount, 0);

  if (loading) {
    return (
      <div className="space-y-3 p-3">
        <div className="h-20 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-12 animate-pulse rounded-2xl bg-slate-200" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
    );
  }

  const todayCount = orders.filter((o) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(o.order_date) >= today;
  }).length;
  const displayOrders = orders.filter(
    (o) =>
      !searchQuery ||
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const tabs: Array<{ id: string; label: string }> = [
    { id: "today", label: "Today" },
    { id: "pending", label: "Pending" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="flex min-h-full flex-col" data-testid="fs-orders">
      <div className="sticky top-0 z-10 space-y-2.5 bg-slate-50 px-3 pb-2 pt-3">
        {/* Today's summary */}
        <div className="flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Today · {todayCount} order{todayCount !== 1 ? "s" : ""}
            </p>
            <p className="truncate text-2xl font-bold leading-tight tabular-nums">₹{todayTotal.toLocaleString("en-IN")}</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search order no. or customer"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-3 text-base text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "h-9 rounded-xl text-sm font-semibold",
                activeTab === tab.id ? "bg-white text-orange-600 shadow-sm" : "text-slate-600",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-2.5 px-3 pb-6 pt-1">
        {displayOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-500">
              <ShoppingCart className="h-8 w-8" />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-slate-800">No orders found</p>
            <button
              type="button"
              onClick={() => navigate("/salesman/order/new")}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-orange-500 px-5 text-sm font-bold text-white shadow-sm active:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              New order
            </button>
          </div>
        ) : (
          displayOrders.map((order) => (
            <div
              key={order.id}
              className={cn(
                "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
                order.customer_accepted && "border-l-4 border-l-emerald-500",
              )}
              data-testid="fs-order"
            >
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 pb-2 pt-3 text-left active:bg-slate-50"
                onClick={() => navigate(`/salesman/order/${order.id}`)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-tight text-slate-900">{order.customer_name}</span>
                  <span className="mt-0.5 block truncate text-xs leading-tight text-slate-500">
                    {order.order_number} · {format(new Date(order.order_date), "dd MMM, hh:mm a")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-bold leading-tight tabular-nums text-slate-900">
                    ₹{order.net_amount.toLocaleString("en-IN")}
                  </span>
                  <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", getStatusColor(order.status))}>
                    {order.status}
                  </span>
                </span>
              </button>

              <div className="flex gap-2 border-t border-slate-100 px-3 py-2">
                <button
                  type="button"
                  className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 active:bg-slate-100"
                  onClick={() => navigate(`/salesman/order/${order.id}`)}
                >
                  <Eye className="h-4 w-4 shrink-0" />
                  <span className="truncate">View</span>
                </button>
                <button
                  type="button"
                  className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 active:bg-slate-100 disabled:opacity-40"
                  onClick={() => shareOrder(order)}
                  disabled={!order.customer_phone}
                >
                  <Share2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">Share</span>
                </button>
                {order.customer_accepted ? (
                  <span className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 text-sm font-semibold text-emerald-700">
                    <Check className="h-4 w-4 shrink-0" />
                    <span className="truncate">Accepted</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl bg-orange-500 text-sm font-bold text-white shadow-sm active:bg-orange-600"
                    onClick={() => setOrderToAccept(order)}
                  >
                    <span className="truncate">Accept</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Accept Order Dialog */}
      <AlertDialog open={!!orderToAccept} onOpenChange={() => setOrderToAccept(null)}>
        <AlertDialogContent className="max-w-[320px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Accept this order?</AlertDialogTitle>
            <AlertDialogDescription>
              {orderToAccept?.order_number} for {orderToAccept?.customer_name} will be marked as accepted by the customer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-500 hover:bg-orange-600" onClick={handleAcceptOrder} disabled={isAccepting}>
              {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SalesmanOrders;
