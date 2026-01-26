import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowLeft, 
  Eye, 
  Share2, 
  Calendar,
  ShoppingCart,
  RefreshCw,
  Plus,
  Check,
  Loader2
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

  useEffect(() => {
    if (currentOrganization?.id && user?.id) {
      fetchOrders();
    }
  }, [currentOrganization?.id, user?.id, activeTab]);

  const fetchOrders = async () => {
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
        return "bg-yellow-500/10 text-yellow-600";
      case "confirmed":
        return "bg-blue-500/10 text-blue-600";
      case "fulfilled":
        return "bg-green-500/10 text-green-600";
      case "cancelled":
        return "bg-red-500/10 text-red-600";
      default:
        return "bg-muted text-muted-foreground";
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
      .select("product_name, size, order_qty, unit_price, line_total")
      .eq("order_id", order.id);

    const itemsList = (items || []).map(i => 
      `• ${i.product_name} (${i.size}) x ${i.order_qty} = ₹${i.line_total.toLocaleString("en-IN")}`
    ).join("\n");

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
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
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
            <div>
              <h1 className="font-semibold text-lg">My Orders</h1>
              <p className="text-sm text-muted-foreground">
                {format(new Date(), "dd MMM yyyy")}
              </p>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>

        {/* Today's Summary */}
        <Card className="border-0 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Today's Orders</p>
              <p className="text-2xl font-bold">{orders.filter(o => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return new Date(o.order_date) >= today;
              }).length}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-2xl font-bold text-primary">₹{todayTotal.toLocaleString("en-IN")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex-1 p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="today" className="flex-1">Today</TabsTrigger>
            <TabsTrigger value="pending" className="flex-1">Pending</TabsTrigger>
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 space-y-3">
            {orders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders found</p>
                <Button className="mt-4" onClick={() => navigate("/salesman/order/new")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Order
                </Button>
              </div>
            ) : (
              orders.map((order) => (
                <Card key={order.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold">{order.order_number}</p>
                        <p className="text-sm text-muted-foreground">{order.customer_name}</p>
                      </div>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(order.order_date), "dd MMM yyyy, hh:mm a")}
                      </span>
                      <span className="font-semibold text-foreground">
                        ₹{order.net_amount.toLocaleString("en-IN")}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => navigate(`/salesman/order/${order.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      {order.customer_accepted ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 bg-gray-400 hover:bg-gray-400 text-white cursor-not-allowed"
                          disabled
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Accepted
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1"
                          onClick={() => setOrderToAccept(order)}
                        >
                          Accept
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => shareOrder(order)}
                        disabled={!order.customer_phone}
                      >
                        <Share2 className="h-4 w-4 mr-1" />
                        Share
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* FAB for new order */}
      <Button
        className="fixed bottom-24 right-4 h-14 w-14 rounded-full shadow-lg z-40"
        onClick={() => navigate("/salesman/order/new")}
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Accept Order Dialog */}
      <AlertDialog open={!!orderToAccept} onOpenChange={() => setOrderToAccept(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept Sale Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to accept this order ({orderToAccept?.order_number})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAcceptOrder} disabled={isAccepting}>
              {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SalesmanOrders;
