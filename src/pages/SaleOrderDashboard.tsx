import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Search, Edit, ChevronDown, ChevronUp, Trash2, Loader2, ClipboardList, ArrowRight, Plus, CheckCircle, AlertTriangle, Printer } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useReactToPrint } from "react-to-print";
import { SaleOrderPrint } from "@/components/SaleOrderPrint";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ConversionItem {
  id: string;
  product_name: string;
  size: string;
  order_qty: number;
  pending_qty: number;
  stock_qty: number;
  convert_qty: number;
  selected: boolean;
  variant_id: string;
  product_id: string;
  unit_price: number;
  mrp: number;
  discount_percent: number;
  gst_percent: number;
  barcode: string;
}

export default function SaleOrderDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [orderToDelete, setOrderToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  // Conversion dialog state
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [conversionItems, setConversionItems] = useState<ConversionItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [orderToPrint, setOrderToPrint] = useState<any>(null);

  // Fetch settings for print
  const { data: settings } = useQuery({
    queryKey: ['settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['sale-orders', currentOrganization?.id, statusFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      let query = supabase
        .from('sale_orders')
        .select(`*, sale_order_items (*)`)
        .eq('organization_id', currentOrganization.id)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch current stock for conversion
  const fetchStockForConversion = async (order: any) => {
    const variantIds = order.sale_order_items.map((item: any) => item.variant_id);
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id, stock_qty')
      .in('id', variantIds);

    const stockMap = new Map(variants?.map(v => [v.id, v.stock_qty]) || []);

    const items: ConversionItem[] = order.sale_order_items
      .filter((item: any) => item.pending_qty > 0)
      .map((item: any) => {
        const stockQty = stockMap.get(item.variant_id) || 0;
        const maxConvert = Math.min(item.pending_qty, stockQty);
        return {
          id: item.id,
          product_name: item.product_name,
          size: item.size,
          order_qty: item.order_qty,
          pending_qty: item.pending_qty,
          stock_qty: stockQty,
          convert_qty: maxConvert,
          selected: maxConvert > 0,
          variant_id: item.variant_id,
          product_id: item.product_id,
          unit_price: item.unit_price,
          mrp: item.mrp,
          discount_percent: item.discount_percent,
          gst_percent: item.gst_percent,
          barcode: item.barcode,
        };
      });

    return items;
  };

  const handleOpenConversion = async (order: any) => {
    const items = await fetchStockForConversion(order);
    setConversionItems(items);
    setSelectedOrder(order);
    setShowConversionDialog(true);
  };

  const handleConvertToSaleBill = async () => {
    if (!selectedOrder) return;

    const itemsToConvert = conversionItems.filter(item => item.selected && item.convert_qty > 0);
    if (itemsToConvert.length === 0) {
      toast({ title: "Error", description: "No items selected for conversion", variant: "destructive" });
      return;
    }

    setIsConverting(true);
    try {
      // Generate sale number
      const { data: saleNumber } = await supabase.rpc('generate_sale_number', {
        p_organization_id: currentOrganization?.id
      });

      // Calculate totals
      const grossAmount = itemsToConvert.reduce((sum, item) => sum + (item.unit_price * item.convert_qty), 0);
      const discountAmount = itemsToConvert.reduce((sum, item) => {
        const lineAmount = item.unit_price * item.convert_qty;
        return sum + (lineAmount * item.discount_percent / 100);
      }, 0);
      const gstAmount = selectedOrder.tax_type === "exclusive" 
        ? itemsToConvert.reduce((sum, item) => {
            const lineAmount = item.unit_price * item.convert_qty;
            const lineDiscount = lineAmount * item.discount_percent / 100;
            return sum + ((lineAmount - lineDiscount) * item.gst_percent / 100);
          }, 0)
        : 0;
      const netAmount = grossAmount - discountAmount + gstAmount;

      // Create sale record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert([{
          organization_id: currentOrganization?.id,
          sale_number: saleNumber,
          sale_date: new Date().toISOString(),
          sale_type: 'invoice',
          customer_id: selectedOrder.customer_id,
          customer_name: selectedOrder.customer_name,
          customer_phone: selectedOrder.customer_phone,
          customer_email: selectedOrder.customer_email,
          customer_address: selectedOrder.customer_address,
          gross_amount: grossAmount,
          discount_amount: discountAmount,
          net_amount: netAmount,
          payment_method: 'pay_later',
          payment_status: 'pending',
          notes: `Converted from Sale Order ${selectedOrder.order_number}`,
          terms_conditions: selectedOrder.terms_conditions,
          shipping_address: selectedOrder.shipping_address,
        }])
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItems = itemsToConvert.map(item => ({
        sale_id: sale.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        size: item.size,
        barcode: item.barcode,
        quantity: item.convert_qty,
        unit_price: item.unit_price,
        mrp: item.mrp,
        discount_percent: item.discount_percent,
        gst_percent: item.gst_percent,
        line_total: item.unit_price * item.convert_qty * (1 - item.discount_percent / 100) * (1 + (selectedOrder.tax_type === "exclusive" ? item.gst_percent / 100 : 0)),
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw itemsError;

      // Update sale order items fulfilled/pending qty
      for (const item of itemsToConvert) {
        const { error: updateError } = await supabase
          .from('sale_order_items')
          .update({
            fulfilled_qty: item.order_qty - item.pending_qty + item.convert_qty,
            pending_qty: item.pending_qty - item.convert_qty,
          })
          .eq('id', item.id);
        if (updateError) throw updateError;
      }

      // Update sale order status
      const allFulfilled = conversionItems.every(item => 
        item.selected ? item.pending_qty - item.convert_qty === 0 : item.pending_qty === 0
      );
      const newStatus = allFulfilled ? 'confirmed' : 'partial';
      
      await supabase
        .from('sale_orders')
        .update({ status: newStatus })
        .eq('id', selectedOrder.id);

      toast({ title: "Success", description: `Sale Bill ${saleNumber} created from order` });
      setShowConversionDialog(false);
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsConverting(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;

    setIsDeleting(true);
    try {
      await supabase.from("sale_order_items").delete().eq("order_id", orderToDelete.id);
      await supabase.from("sale_orders").delete().eq("id", orderToDelete.id);

      toast({ title: "Success", description: `Sale Order ${orderToDelete.order_number} deleted` });
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setOrderToDelete(null);
    }
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const filteredOrders = (ordersData || []).filter((o: any) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return o.order_number?.toLowerCase().includes(searchLower) ||
      o.customer_name?.toLowerCase().includes(searchLower) ||
      o.customer_phone?.toLowerCase().includes(searchLower);
  });

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      partial: { variant: "outline", label: "Partial" },
      confirmed: { variant: "default", label: "Confirmed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="p-4 space-y-4">
      <BackToDashboard />
      
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Sale Order Dashboard
          </h1>
          <Button onClick={() => navigate('/sale-order-entry')}>
            <Plus className="h-4 w-4 mr-2" />
            New Sale Order
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order no, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Order No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedOrders.map((order: any) => {
                const totalItems = order.sale_order_items?.reduce((sum: number, i: any) => sum + i.order_qty, 0) || 0;
                const fulfilledItems = order.sale_order_items?.reduce((sum: number, i: any) => sum + i.fulfilled_qty, 0) || 0;
                
                return (
                  <>
                    <TableRow key={order.id}>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => toggleExpanded(order.id)}>
                          {expandedRows.has(order.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>{format(new Date(order.order_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{order.expected_delivery_date ? format(new Date(order.expected_delivery_date), 'dd/MM/yyyy') : '-'}</TableCell>
                      <TableCell>
                        <div>{order.customer_name}</div>
                        <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">₹{order.net_amount?.toFixed(2)}</div>
                        <div className="text-sm text-muted-foreground">{fulfilledItems}/{totalItems} items</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setOrderToPrint(order)} title="Print">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => navigate('/sale-order-entry', { state: { orderData: order } })}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          {order.status !== 'confirmed' && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleOpenConversion(order)}
                              title="Convert to Sale Bill"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => setOrderToDelete(order)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(order.id) && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/50">
                          <div className="p-4">
                            <h4 className="font-medium mb-2">Order Items</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Product</TableHead>
                                  <TableHead>Size</TableHead>
                                  <TableHead>Order Qty</TableHead>
                                  <TableHead>Fulfilled</TableHead>
                                  <TableHead>Pending</TableHead>
                                  <TableHead>Price</TableHead>
                                  <TableHead>Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {order.sale_order_items?.map((item: any) => (
                                  <TableRow key={item.id}>
                                    <TableCell>{item.product_name}</TableCell>
                                    <TableCell>{item.size}</TableCell>
                                    <TableCell>{item.order_qty}</TableCell>
                                    <TableCell className="text-green-600">{item.fulfilled_qty}</TableCell>
                                    <TableCell className={item.pending_qty > 0 ? "text-orange-600" : ""}>{item.pending_qty}</TableCell>
                                    <TableCell>₹{item.unit_price?.toFixed(2)}</TableCell>
                                    <TableCell>₹{item.line_total?.toFixed(2)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredOrders.length)} of {filteredOrders.length}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>Previous</Button>
              <Button variant="outline" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={!!orderToDelete} onOpenChange={() => setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sale Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete sale order {orderToDelete?.order_number}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conversion Dialog */}
      <Dialog open={showConversionDialog} onOpenChange={setShowConversionDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Convert to Sale Bill</DialogTitle>
            <DialogDescription>
              Select items and quantities to convert to a sale bill. Only items with available stock can be converted.
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Convert Qty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversionItems.map((item, index) => {
                  const canConvert = item.stock_qty > 0;
                  return (
                    <TableRow key={item.id} className={!canConvert ? "opacity-50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={item.selected}
                          disabled={!canConvert}
                          onCheckedChange={(checked) => {
                            const newItems = [...conversionItems];
                            newItems[index].selected = !!checked;
                            setConversionItems(newItems);
                          }}
                        />
                      </TableCell>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>{item.pending_qty}</TableCell>
                      <TableCell>
                        <Badge variant={item.stock_qty > 0 ? "default" : "destructive"}>
                          {item.stock_qty}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={Math.min(item.pending_qty, item.stock_qty)}
                          value={item.convert_qty}
                          disabled={!canConvert}
                          onChange={(e) => {
                            const newItems = [...conversionItems];
                            newItems[index].convert_qty = Math.min(
                              parseInt(e.target.value) || 0,
                              item.pending_qty,
                              item.stock_qty
                            );
                            setConversionItems(newItems);
                          }}
                          className="w-20 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        {item.stock_qty >= item.pending_qty ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            Full
                          </div>
                        ) : item.stock_qty > 0 ? (
                          <div className="flex items-center gap-1 text-orange-600">
                            <AlertTriangle className="h-4 w-4" />
                            Partial
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                            No Stock
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConversionDialog(false)}>Cancel</Button>
            <Button onClick={handleConvertToSaleBill} disabled={isConverting}>
              {isConverting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              Create Sale Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
      {orderToPrint && (
        <PrintSaleOrderDialog 
          order={orderToPrint}
          settings={settings}
          onClose={() => setOrderToPrint(null)}
        />
      )}
    </div>
  );
}

// Print Dialog Component
function PrintSaleOrderDialog({ order, settings, onClose }: { order: any; settings: any; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `SaleOrder-${order.order_number}`,
  });

  const printItems = (order.sale_order_items || []).map((item: any, index: number) => ({
    sr: index + 1,
    particulars: item.product_name,
    size: item.size,
    barcode: item.barcode || '',
    hsn: '',
    orderQty: item.order_qty,
    fulfilledQty: item.fulfilled_qty,
    pendingQty: item.pending_qty,
    rate: item.unit_price,
    mrp: item.mrp,
    discountPercent: item.discount_percent,
    total: item.line_total,
  }));

  return (
    <AlertDialog open={true} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Print Sale Order</AlertDialogTitle>
        </AlertDialogHeader>
        
        <div className="border rounded-lg overflow-auto max-h-[60vh] bg-white">
          <SaleOrderPrint
            ref={printRef}
            businessName={settings?.business_name || 'Business Name'}
            address={settings?.address || ''}
            mobile={settings?.mobile_number || ''}
            email={settings?.email_id}
            gstNumber={settings?.gst_number}
            logoUrl={settings?.bill_barcode_settings?.logo_url}
            orderNumber={order.order_number}
            orderDate={new Date(order.order_date)}
            expectedDeliveryDate={order.expected_delivery_date ? new Date(order.expected_delivery_date) : undefined}
            quotationNumber={order.quotation_id ? `Linked` : undefined}
            customerName={order.customer_name}
            customerAddress={order.customer_address}
            customerMobile={order.customer_phone}
            customerEmail={order.customer_email}
            items={printItems}
            grossAmount={order.gross_amount}
            discountAmount={order.discount_amount + order.flat_discount_amount}
            taxableAmount={order.gross_amount - order.discount_amount - order.flat_discount_amount}
            gstAmount={order.gst_amount}
            roundOff={order.round_off}
            netAmount={order.net_amount}
            status={order.status}
            termsConditions={order.terms_conditions}
            notes={order.notes}
            shippingAddress={order.shipping_address}
            taxType={order.tax_type}
            format="a5-vertical"
            colorScheme={settings?.sale_settings?.invoice_color_scheme || 'blue'}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <Button onClick={() => handlePrint()}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
