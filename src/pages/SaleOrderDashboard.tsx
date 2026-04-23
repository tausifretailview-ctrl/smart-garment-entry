import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

import { Search, Edit, ChevronDown, ChevronUp, Trash2, Loader2, ClipboardList, ArrowRight, Plus, CheckCircle, AlertTriangle, Printer, Clock, Package, IndianRupee, MessageCircle, CalendarIcon } from "lucide-react";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { format } from "date-fns";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useReactToPrint } from "react-to-print";
import { SaleOrderPrint } from "@/components/SaleOrderPrint";
import { ThermalPrint80mm } from "@/components/ThermalPrint80mm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { Check, FileText, X } from "lucide-react";
import { useDraftSave } from "@/hooks/useDraftSave";
import { formatDistanceToNow } from "date-fns";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";

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
  hsn_code?: string;
}

export default function SaleOrderDashboard() {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [orderToDelete, setOrderToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  
  // Conversion dialog state
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [conversionItems, setConversionItems] = useState<ConversionItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [orderToPrint, setOrderToPrint] = useState<any>(null);
  const { formatSaleOrderMessage } = useWhatsAppTemplates();
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [orderToAccept, setOrderToAccept] = useState<any>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  
  // Draft save hook
  const { hasDraft, draftData, deleteDraft, lastSaved } = useDraftSave('sale_order');
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);

  // Fetch settings for print (centralized, cached 5min)
  const { data: settings } = useSettings();

  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['sale-orders', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('sale_orders')
        .select(`*, sale_order_items (*)`)
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const handleWhatsAppShare = (order: any) => {
    if (!order.customer_phone) {
      toast({ title: "Error", description: "Customer phone number not available", variant: "destructive" });
      return;
    }

    // Build itemized list with color
    const itemLines = (order.sale_order_items || [])
      .filter((item: any) => !item.deleted_at)
      .map((item: any) => {
        const colorPart = item.color ? ` - ${item.color}` : '';
        return `• ${item.product_name}${colorPart} (${item.size}) x ${item.order_qty} = ₹${Number(item.line_total).toLocaleString('en-IN')}`;
      })
      .join('\n');

    const message = formatSaleOrderMessage({
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      order_date: order.order_date,
      net_amount: order.net_amount,
      status: order.status,
      expected_delivery_date: order.expected_delivery_date,
    }, itemLines);

    // Copy to clipboard with improved UX
    const isMac = navigator.platform?.toUpperCase().indexOf("MAC") >= 0;
    const shortcut = isMac ? "Cmd+V" : "Ctrl+V";
    
    navigator.clipboard.writeText(message).then(() => {
      toast({ title: "WhatsApp", description: `✓ Message copied! Paste with ${shortcut} if it doesn't auto-fill` });
    });

    // Open WhatsApp
    const phone = order.customer_phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
    
    setTimeout(() => {
      window.open(whatsappUrl, '_blank');
    }, 300);
  };

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
          hsn_code: item.hsn_code,
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
      const { data: saleNumber } = await supabase.rpc('generate_sale_number_atomic', {
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
        hsn_code: item.hsn_code || null,
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

  const { softDelete } = useSoftDelete();

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;

    setIsDeleting(true);
    try {
      const success = await softDelete("sale_orders", orderToDelete.id);
      if (!success) throw new Error("Failed to delete sale order");

      toast({ title: "Success", description: `Sale Order ${orderToDelete.order_number} moved to recycle bin` });
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setOrderToDelete(null);
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

      toast({ title: "Success", description: `Sale Order ${orderToAccept.order_number} accepted` });
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAccepting(false);
      setOrderToAccept(null);
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

  // Get unique customers for dropdown
  const uniqueCustomers = Array.from(
    new Map((ordersData || []).map((o: any) => [o.customer_id || o.customer_name, { id: o.customer_id, name: o.customer_name }]))
  ).map(([_, customer]) => customer).filter((c: any) => c.name);

  const filteredOrders = (ordersData || []).filter((o: any) => {
    // Apply status filter
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    // Apply customer filter
    if (customerFilter !== 'all') {
      if (o.customer_id && o.customer_id !== customerFilter) return false;
      if (!o.customer_id && o.customer_name !== customerFilter) return false;
    }
    // Apply date range filter
    if (fromDate) {
      const oDate = new Date(o.order_date);
      if (oDate < fromDate) return false;
    }
    if (toDate) {
      const oDate = new Date(o.order_date);
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (oDate > endOfDay) return false;
    }
    // Apply search filter
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
    const variants: Record<string, { className: string, label: string }> = {
      pending: { className: "min-w-[80px] justify-center bg-pink-400 hover:bg-pink-500 text-white", label: "Pending" },
      partial: { className: "min-w-[80px] justify-center bg-amber-500 hover:bg-amber-600 text-white", label: "Partial" },
      confirmed: { className: "min-w-[80px] justify-center bg-green-500 hover:bg-green-600 text-white", label: "Confirmed" },
      cancelled: { className: "min-w-[80px] justify-center bg-red-500 hover:bg-red-600 text-white", label: "Cancelled" },
    };
    const config = variants[status] || { className: "min-w-[80px] justify-center bg-gray-400 text-white", label: status };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  // Calculate statistics
  const allOrders = ordersData || [];
  const stats = {
    total: allOrders.length,
    totalValue: allOrders.reduce((sum: number, o: any) => sum + (o.net_amount || 0), 0),
    pending: allOrders.filter((o: any) => o.status === 'pending').length,
    partial: allOrders.filter((o: any) => o.status === 'partial').length,
    confirmed: allOrders.filter((o: any) => o.status === 'confirmed').length,
    pendingItems: allOrders.reduce((sum: number, o: any) => {
      return sum + (o.sale_order_items?.reduce((s: number, i: any) => s + (i.pending_qty || 0), 0) || 0);
    }, 0),
    pendingValue: allOrders
      .filter((o: any) => o.status === 'pending' || o.status === 'partial')
      .reduce((sum: number, o: any) => sum + (o.net_amount || 0), 0),
    conversionRate: allOrders.length > 0 
      ? ((allOrders.filter((o: any) => o.status === 'confirmed').length / allOrders.length) * 100).toFixed(1)
      : '0',
  };

  const handleCardClick = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  return (
    <div className="p-6 space-y-6">

      {/* Unsaved Draft Card */}
      {hasDraft && draftData && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-amber-800 dark:text-amber-200">
                    Unsaved Sale Order Found
                  </h3>
                  <CardDescription className="text-black dark:text-black font-bold">
                    {lastSaved ? `Draft available • Last saved ${formatDistanceToNow(lastSaved, { addSuffix: true })}` : 'Draft available'}
                    {draftData.lineItems?.length > 0 && ` • ${draftData.lineItems.length} item(s)`}
                    {draftData.billData?.customer_name && ` • ${draftData.billData.customer_name}`}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await deleteDraft();
                    toast({
                      title: "Draft Discarded",
                      description: "The unsaved sale order has been removed",
                    });
                  }}
                  className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                >
                  <X className="h-4 w-4" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    navigate("/sale-order-entry", { state: { loadDraft: true } });
                  }}
                  className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Edit className="h-4 w-4" />
                  Resume Draft
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Summary Statistics Cards - Vasy ERP Style Vibrant */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg ${statusFilter === 'all' ? 'ring-2 ring-white' : ''}`}
          onClick={() => handleCardClick('all')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Total Orders</CardDescription>
            <ClipboardList className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <p className="text-xs text-white/70">All orders</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg ${statusFilter === 'pending' ? 'ring-2 ring-white' : ''}`}
          onClick={() => handleCardClick('pending')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Pending</CardDescription>
            <Clock className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.pending}</div>
            <p className="text-xs text-white/70">Awaiting action</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-lg ${statusFilter === 'partial' ? 'ring-2 ring-white' : ''}`}
          onClick={() => handleCardClick('partial')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Partial</CardDescription>
            <Package className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.partial}</div>
            <p className="text-xs text-white/70">Partially fulfilled</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg ${statusFilter === 'confirmed' ? 'ring-2 ring-white' : ''}`}
          onClick={() => handleCardClick('confirmed')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Confirmed</CardDescription>
            <CheckCircle className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.confirmed}</div>
            <p className="text-xs text-white/70">Completed</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Pending Items</CardDescription>
            <AlertTriangle className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.pendingItems}</div>
            <p className="text-xs text-white/70">To be fulfilled</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardDescription className="text-xs font-medium text-white/80">Pending Value</CardDescription>
            <IndianRupee className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₹{stats.pendingValue.toLocaleString('en-IN')}</div>
            <p className="text-xs text-white/70">Outstanding</p>
          </CardContent>
        </Card>
      </div>
      
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
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order no, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !fromDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {fromDate ? format(fromDate, "dd/MM/yy") : "From Date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !toDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {toDate ? format(toDate, "dd/MM/yy") : "To Date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          {(fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setFromDate(undefined); setToDate(undefined); }}>
              Clear Dates
            </Button>
          )}
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {uniqueCustomers.map((customer: any) => (
                <SelectItem key={customer.id || customer.name} value={customer.id || customer.name}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading orders...</span>
          </div>
        ) : paginatedOrders.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            No sale orders found
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-320px)] rounded-md border">
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
                  <TableHead>Accept</TableHead>
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
                          <div>
                            <button
                              className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCustomerForHistory({ id: order.customer_id, name: order.customer_name });
                                setShowCustomerHistory(true);
                              }}
                            >
                              {order.customer_name}
                            </button>
                          </div>
                          <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">₹{order.net_amount?.toFixed(2)}</div>
                          <div className="text-sm text-muted-foreground">{fulfilledItems}/{totalItems} items</div>
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          {order.customer_accepted ? (
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              disabled 
                              className="!bg-gray-500 hover:!bg-gray-500 !text-white !opacity-100 cursor-not-allowed"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Accepted
                            </Button>
                          ) : (
                            <Button 
                              variant="default" 
                              size="sm"
                              className="bg-blue-800 hover:bg-blue-900 text-white"
                              onClick={() => setOrderToAccept(order)}
                            >
                              Accept
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleWhatsAppShare(order)} title="WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </Button>
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
                          <TableCell colSpan={9} className="bg-muted/50">
                            <div className="p-4">
                              <h4 className="font-medium mb-2">Order Items</h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Color</TableHead>
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
                                      <TableCell>{item.color || "—"}</TableCell>
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
            <ScrollBar orientation="vertical" className="w-3 bg-slate-200" forceMount />
          </ScrollArea>
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

      {/* Accept Dialog */}
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

      <CustomerHistoryDialog
        open={showCustomerHistory}
        onOpenChange={setShowCustomerHistory}
        customerId={selectedCustomerForHistory?.id || null}
        customerName={selectedCustomerForHistory?.name || ''}
        organizationId={currentOrganization?.id || ''}
      />
    </div>
  );
}

// Print Dialog Component
function PrintSaleOrderDialog({ order, settings, onClose }: { order: any; settings: any; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [printItems, setPrintItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal'>(
    settings?.sale_settings?.bill_format || 'a4'
  );
  const [invoiceStyle, setInvoiceStyle] = useState<"standard" | "wholesale-size-grouping">(
    order.invoice_format || "standard"
  );
  
  const getPageStyle = () => {
    switch (selectedFormat) {
      case 'a5':
        return '@page { size: 148mm 210mm; margin: 4mm; }';
      case 'a5-horizontal':
        return '@page { size: 210mm 148mm; margin: 4mm; }';
      case 'thermal':
        return '@page { size: 80mm auto; margin: 2mm 4mm; }';
      default:
        return '@page { size: A4 portrait; margin: 10mm; }';
    }
  };
  
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `SaleOrder-${order.order_number}`,
    pageStyle: getPageStyle(),
  });

  // Fetch brand/style from products
  useEffect(() => {
    const fetchProductDetails = async () => {
      const productIds = [...new Set((order.sale_order_items || []).map((item: any) => item.product_id).filter(Boolean))] as string[];
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

      const items = (order.sale_order_items || [])
        .filter((item: any) => !item.deleted_at) // Filter out soft-deleted items
        .map((item: any, index: number) => ({
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
          color: item.color || '',
          brand: item.product_id ? productDetails[item.product_id]?.brand : null,
          style: item.product_id ? productDetails[item.product_id]?.style : null,
        }));
      
      setPrintItems(items);
      setLoading(false);
    };

    fetchProductDetails();
  }, [order]);

  return (
    <AlertDialog open={true} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Print Sale Order</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <Label className="text-foreground">Bill Format:</Label>
                <Select value={selectedFormat} onValueChange={(v: 'a4' | 'a5' | 'a5-horizontal' | 'thermal') => setSelectedFormat(v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4">A4 (210mm × 297mm)</SelectItem>
                    <SelectItem value="a5">A5 Vertical (148mm × 210mm)</SelectItem>
                    <SelectItem value="a5-horizontal">A5 Horizontal (210mm × 148mm)</SelectItem>
                    <SelectItem value="thermal">Thermal (80mm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedFormat !== 'thermal' && (
                <div className="flex items-center gap-2">
                  <Label className="text-foreground">Invoice Style:</Label>
                  <Select value={invoiceStyle} onValueChange={(v: "standard" | "wholesale-size-grouping") => setInvoiceStyle(v)}>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="wholesale-size-grouping">Modern Wholesale Size Grouping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="border rounded-lg overflow-auto max-h-[60vh] bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : printItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-destructive font-medium">No items found for this order</p>
              <p className="text-sm text-muted-foreground mt-2">
                This order may have been created without items. Please re-create the order.
              </p>
            </div>
          ) : selectedFormat === 'thermal' ? (
            <ThermalPrint80mm
              ref={printRef}
              billNo={order.order_number}
              date={new Date(order.order_date)}
              customerName={order.customer_name}
              customerPhone={order.customer_phone}
              customerAddress={order.customer_address}
              items={printItems.map((item: any, idx: number) => ({
                sr: idx + 1,
                particulars: item.particulars,
                qty: item.orderQty,
                rate: item.rate,
                total: item.total,
              }))}
              subTotal={order.gross_amount}
              discount={order.discount_amount + order.flat_discount_amount}
              grandTotal={order.net_amount}
              gstBreakdown={{
                cgst: order.gst_amount / 2,
                sgst: order.gst_amount / 2,
              }}
              documentType="sale-order"
              termsConditions={order.terms_conditions}
            />
          ) : (
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
              format={selectedFormat === 'a5' ? 'a5-vertical' : selectedFormat === 'a5-horizontal' ? 'a5-horizontal' : 'a4'}
              colorScheme={settings?.sale_settings?.invoice_color_scheme || 'blue'}
              invoiceFormat={invoiceStyle}
            />
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <Button onClick={() => handlePrint()} disabled={loading}>
            <Printer className="h-4 w-4 mr-2" />
            {loading ? 'Loading...' : 'Print'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
