import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Share2, Printer } from "lucide-react";
import { format } from "date-fns";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { cn } from "@/lib/utils";
import { useReactToPrint } from "react-to-print";

interface OrderItem {
  id: string;
  product_name: string;
  size: string;
  color: string | null;
  order_qty: number;
  unit_price: number;
  line_total: number;
  brand?: string | null;
  style?: string | null;
}

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  net_amount: number;
  status: string;
  salesman: string | null;
  notes: string | null;
}

interface Settings {
  business_name: string | null;
  address: string | null;
}

const SalesmanOrderView = () => {
  const { orderId } = useParams();
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { sendWhatsApp } = useWhatsAppSend();
  const printRef = useRef<HTMLDivElement>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: order?.order_number || "Sale Order",
  });

  useEffect(() => {
    if (currentOrganization?.id && orderId) {
      fetchOrderDetails();
      fetchSettings();
    }
  }, [currentOrganization?.id, orderId]);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("settings")
      .select("business_name, address")
      .eq("organization_id", currentOrganization!.id)
      .single();
    if (data) setSettings(data);
  };

  const fetchOrderDetails = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from("sale_orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData);

      const { data: itemsData, error: itemsError } = await supabase
        .from("sale_order_items")
        .select("id, product_id, product_name, size, color, order_qty, unit_price, line_total")
        .eq("order_id", orderId)
        .is("deleted_at", null);

      if (itemsError) throw itemsError;

      // Fetch product details (brand, style) for each item
      const productIds = [...new Set(itemsData?.map(i => i.product_id).filter(Boolean) || [])];
      let productDetails: Record<string, { brand: string | null; style: string | null }> = {};
      
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, brand, style")
          .in("id", productIds);
        
        if (products) {
          productDetails = products.reduce((acc, p) => {
            acc[p.id] = { brand: p.brand, style: p.style };
            return acc;
          }, {} as Record<string, { brand: string | null; style: string | null }>);
        }
      }

      const enrichedItems = (itemsData || []).map(item => ({
        ...item,
        brand: item.product_id ? productDetails[item.product_id]?.brand : null,
        style: item.product_id ? productDetails[item.product_id]?.style : null,
      }));

      setItems(enrichedItems);
    } catch (error) {
      console.error("Error fetching order:", error);
    } finally {
      setLoading(false);
    }
  };

  const shareOrder = async () => {
    if (!order?.customer_phone) return;

    const itemsList = items.map(i => 
      `• ${i.product_name} (${i.size}) x ${i.order_qty} = ₹${i.line_total.toLocaleString("en-IN")}`
    ).join("\n");

    const message = `🛒 *Sales Order*\n\n` +
      `Order No: ${order.order_number}\n` +
      `Date: ${format(new Date(order.order_date), "dd MMM yyyy")}\n` +
      `Customer: ${order.customer_name}\n\n` +
      `*Items:*\n${itemsList}\n\n` +
      `*Total: ₹${order.net_amount.toLocaleString("en-IN")}*\n\n` +
      `Thank you!`;

    await sendWhatsApp(order.customer_phone, message);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-500/10 text-yellow-600";
      case "confirmed": return "bg-blue-500/10 text-blue-600";
      case "fulfilled": return "bg-green-500/10 text-green-600";
      case "cancelled": return "bg-red-500/10 text-red-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const totalQty = items.reduce((sum, item) => sum + item.order_qty, 0);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground">Order not found</p>
        <Button className="mt-4" onClick={() => navigate("/salesman/orders")}>
          Back to Orders
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-muted/30">
      {/* Header */}
      <div className="p-3 bg-background border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate("/salesman/orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-sm">{order.order_number}</h1>
            <p className="text-xs text-muted-foreground">{format(new Date(order.order_date), "dd MMM yyyy")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn("text-xs", getStatusColor(order.status))}>
            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </Badge>
        </div>
      </div>

      {/* Compact Order View - Printable */}
      <div className="flex-1 overflow-auto p-2">
        <div 
          ref={printRef} 
          className="bg-white rounded shadow-sm text-black"
          style={{ fontSize: '10pt' }}
        >
          {/* Print Header */}
          <div className="text-center border-b border-gray-300 py-2 px-3">
            <p className="font-bold text-sm uppercase">{settings?.business_name || currentOrganization?.name}</p>
            <p className="text-xs text-gray-600">{settings?.address}</p>
          </div>

          {/* Order Info Row */}
          <div className="flex justify-between px-3 py-2 border-b border-gray-200 text-xs">
            <div>
              <p><strong>Customer:</strong> {order.customer_name}</p>
              {order.customer_address && <p className="text-gray-600 text-xs">{order.customer_address}</p>}
            </div>
            <div className="text-right">
              <p><strong>Date:</strong> {format(new Date(order.order_date), "dd/MM/yyyy")}</p>
              <p><strong>Order:</strong> {order.order_number}</p>
              {order.salesman && <p><strong>Salesman:</strong> {order.salesman}</p>}
            </div>
          </div>

          {/* Items Table - Compact */}
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-1 py-1 text-left w-8">Sr</th>
                <th className="border border-gray-300 px-1 py-1 text-left">Description</th>
                <th className="border border-gray-300 px-1 py-1 text-center w-12">Size</th>
                <th className="border border-gray-300 px-1 py-1 text-center w-10">Qty</th>
                <th className="border border-gray-300 px-1 py-1 text-right w-14">Rate</th>
                <th className="border border-gray-300 px-1 py-1 text-right w-16">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const details = [item.brand, item.style, item.color].filter(Boolean).join(' | ');
                return (
                  <tr key={item.id}>
                    <td className="border border-gray-300 px-1 py-0.5 text-center">{idx + 1}</td>
                    <td className="border border-gray-300 px-1 py-0.5">
                      {item.product_name}
                      {details && <span className="text-gray-500 text-[9px]"> ({details})</span>}
                    </td>
                    <td className="border border-gray-300 px-1 py-0.5 text-center font-semibold">{item.size}</td>
                    <td className="border border-gray-300 px-1 py-0.5 text-center">{item.order_qty}</td>
                    <td className="border border-gray-300 px-1 py-0.5 text-right">₹{item.unit_price}</td>
                    <td className="border border-gray-300 px-1 py-0.5 text-right">₹{item.line_total.toLocaleString("en-IN")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer Totals */}
          <div className="flex justify-end gap-6 px-3 py-2 border-t border-gray-300 font-semibold text-xs">
            <span>Total Qty: {totalQty}</span>
            <span>Total: ₹{order.net_amount.toLocaleString("en-IN")}</span>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="px-3 py-1 border-t border-gray-200 text-xs">
              <strong>Notes:</strong> {order.notes}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-3 bg-background border-t flex gap-2 safe-area-pb">
        <Button
          variant="outline"
          className="flex-1 h-11"
          onClick={() => handlePrint()}
        >
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
        <Button
          className="flex-1 h-11"
          onClick={shareOrder}
          disabled={!order.customer_phone}
        >
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </div>
    </div>
  );
};

export default SalesmanOrderView;
