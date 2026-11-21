import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Share2, Printer } from "lucide-react";
import { format } from "date-fns";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { useSettings } from "@/hooks/useSettings";
import { FIELD_SALES_SAFE_BOTTOM, FIELD_SALES_SAFE_TOP } from "@/hooks/useFieldSalesShell";

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

const SalesmanOrderView = () => {
  const { orderId } = useParams();
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { sendWhatsApp } = useWhatsAppSend();
  const printRef = useRef<HTMLDivElement>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const { data: settings } = useSettings();
  const [loading, setLoading] = useState(true);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: order?.order_number || "Sale Order",
  });

  useEffect(() => {
    if (currentOrganization?.id && orderId) {
      fetchOrderDetails();
    }
  }, [currentOrganization?.id, orderId]);

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
    if (!order) return;

    const itemsList = items.map(i => {
      const colorPart = (i as any).color ? ` - ${(i as any).color}` : '';
      return `• ${i.product_name}${colorPart} (${i.size}) x ${i.order_qty} = ₹${i.line_total.toLocaleString("en-IN")}`;
    }).join("\n");

    const message = `🛒 *Sales Order*\n\n` +
      `Order No: ${order.order_number}\n` +
      `Date: ${format(new Date(order.order_date), "dd MMM yyyy")}\n` +
      `Customer: ${order.customer_name}\n\n` +
      `*Items:*\n${itemsList}\n\n` +
      `*Total: ₹${order.net_amount.toLocaleString("en-IN")}*\n\n` +
      `Thank you!`;

    try {
      if (navigator.share) {
        await navigator.share({ title: order.order_number, text: message });
      } else if (order.customer_phone) {
        await sendWhatsApp(order.customer_phone, message);
      } else {
        await navigator.clipboard.writeText(message);
        toast.success("Order details copied to clipboard");
      }
    } catch {
      if (order.customer_phone) {
        await sendWhatsApp(order.customer_phone, message);
      } else {
        await navigator.clipboard.writeText(message);
        toast.success("Order details copied to clipboard");
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-100 text-amber-800";
      case "confirmed": return "bg-sky-100 text-sky-800";
      case "fulfilled": return "bg-emerald-100 text-emerald-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-white/90 text-slate-700";
    }
  };

  const totalQty = items.reduce((sum, item) => sum + item.order_qty, 0);

  if (loading) {
    return (
      <div className="space-y-4 p-4" style={{ paddingTop: `calc(${FIELD_SALES_SAFE_TOP} + 16px)` }}>
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
      <div className="p-4 text-center" style={{ paddingTop: `calc(${FIELD_SALES_SAFE_TOP} + 48px)` }}>
        <p className="text-muted-foreground">Order not found</p>
        <Button className="mt-4" onClick={() => navigate("/salesman/orders")}>
          Back to Orders
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-50" data-testid="fs-order-view">
      {/* App bar */}
      <div
        className="sticky top-0 z-20 bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-sm"
        style={{ paddingTop: FIELD_SALES_SAFE_TOP }}
      >
        <div className="flex h-14 items-center gap-1 px-1.5">
          <button
            type="button"
            onClick={() => navigate("/salesman/orders")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:bg-white/20"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-semibold leading-tight">{order.customer_name}</h1>
            <p className="truncate text-xs leading-tight text-white/80">
              {order.order_number} · {format(new Date(order.order_date), "dd MMM yyyy")}
            </p>
          </div>
          <span className={cn("mr-2 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", getStatusColor(order.status))}>
            {order.status}
          </span>
        </div>
      </div>

      {/* Compact Order View - Printable */}
      <div className="flex-1 p-3">
        <div 
          ref={printRef} 
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-black shadow-sm"
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

          {/* Items Table - Compact, scroll-safe */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-1 py-1 text-left w-6">#</th>
                  <th className="border border-gray-300 px-1 py-1 text-left">Item / Size</th>
                  <th className="border border-gray-300 px-1 py-1 text-center w-8">Qty</th>
                  <th className="border border-gray-300 px-1 py-1 text-right w-16">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id}>
                    <td className="border border-gray-300 px-1 py-0.5 text-center">{idx + 1}</td>
                    <td className="border border-gray-300 px-1 py-0.5">
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-gray-500 text-[9px]">Size: {item.size}{item.color ? ` | ${item.color}` : ""} | ₹{item.unit_price}</p>
                    </td>
                    <td className="border border-gray-300 px-1 py-0.5 text-center font-bold">{item.order_qty}</td>
                    <td className="border border-gray-300 px-1 py-0.5 text-right font-medium">₹{item.line_total.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer Totals with GST breakdown */}
          {(() => {
            const totalGST = items.reduce((sum, item) => {
              const gstPer = (item as any).gst_percent || 0;
              const taxable = item.line_total / (1 + gstPer / 100);
              return sum + (item.line_total - taxable);
            }, 0);
            return (
              <div className="px-3 py-2 border-t border-gray-300 text-xs">
                <div className="flex justify-between"><span>Total Qty:</span><span className="font-semibold">{totalQty} pcs</span></div>
                <div className="flex justify-between text-gray-500"><span>Taxable Value:</span><span>₹{(order.net_amount - totalGST).toFixed(2)}</span></div>
                <div className="flex justify-between text-gray-500"><span>GST (incl.):</span><span>₹{totalGST.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-sm border-t border-gray-300 mt-1 pt-1">
                  <span>Grand Total</span><span>₹{order.net_amount.toLocaleString("en-IN")}</span>
                </div>
              </div>
            );
          })()}

          {/* Notes */}
          {order.notes && (
            <div className="px-3 py-1 border-t border-gray-200 text-xs">
              <strong>Notes:</strong> {order.notes}
            </div>
          )}
        </div>
      </div>

      {/* Actions, always on screen */}
      <div
        className="sticky bottom-0 z-20 flex gap-2 border-t border-slate-200 bg-white px-3 pt-2.5 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]"
        style={{ paddingBottom: `calc(${FIELD_SALES_SAFE_BOTTOM} + 10px)` }}
      >
        <button
          type="button"
          onClick={() => handlePrint()}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-[15px] font-semibold text-slate-800 active:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
        <button
          type="button"
          onClick={shareOrder}
          className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-[15px] font-bold text-white shadow-md shadow-orange-500/30 active:scale-[0.99]"
        >
          <Share2 className="h-4 w-4" />
          Share on WhatsApp
        </button>
      </div>
    </div>
  );
};

export default SalesmanOrderView;
