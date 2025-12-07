import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon, Plus, X, Search, Save, ClipboardList, AlertTriangle, CheckCircle, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useReactToPrint } from "react-to-print";
import { SaleOrderPrint } from "@/components/SaleOrderPrint";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LineItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string;
  orderQty: number;
  stockQty: number;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  discountAmount: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode?: string;
  color?: string;
}

const customerSchema = z.object({
  customer_name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Mobile number is required").max(20),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

export default function SaleOrderEntry() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const location = useLocation();
  const { orgNavigate: navigate } = useOrgNavigation();
  const [orderDate, setOrderDate] = useState<Date>(new Date());
  const [expectedDelivery, setExpectedDelivery] = useState<Date>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>(
    Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`,
      productId: '',
      variantId: '',
      productName: '',
      size: '',
      barcode: '',
      orderQty: 0,
      stockQty: 0,
      mrp: 0,
      salePrice: 0,
      discountPercent: 0,
      discountAmount: 0,
      gstPercent: 0,
      lineTotal: 0,
    }))
  );
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [termsConditions, setTermsConditions] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [quotationId, setQuotationId] = useState<string | null>(null);
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("inclusive");
  const [printData, setPrintData] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const tableEndRef = useRef<HTMLDivElement>(null);
  const [salesman, setSalesman] = useState<string>("");
  const [flatDiscountPercent, setFlatDiscountPercent] = useState<number>(0);
  const [flatDiscountAmount, setFlatDiscountAmount] = useState<number>(0);
  const [roundOff, setRoundOff] = useState<number>(0);

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

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `SaleOrder_${orderNumber}`,
  });

  const customerForm = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: { customer_name: "", phone: "", email: "", address: "", gst_number: "" },
  });

  // Generate order number
  useEffect(() => {
    const generateOrderNumber = async () => {
      if (!currentOrganization?.id || editingOrderId) return;
      try {
        const { data, error } = await supabase.rpc('generate_sale_order_number', {
          p_organization_id: currentOrganization.id
        });
        if (error) throw error;
        setOrderNumber(data);
      } catch (error) {
        console.error('Error generating order number:', error);
      }
    };
    generateOrderNumber();
  }, [currentOrganization?.id, editingOrderId]);

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ['customers', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .order('customer_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch products WITH stock
  const { data: productsData } = useQuery({
    queryKey: ['products-with-stock', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('products')
        .select(`*, product_variants (*)`)
        .eq('organization_id', currentOrganization.id)
        .eq('status', 'active');
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch employees for Salesman dropdown
  const { data: employeesData } = useQuery({
    queryKey: ['employees', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('status', 'active')
        .order('employee_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Load from quotation or edit
  useEffect(() => {
    const state = location.state;
    
    if (state?.fromQuotation && state?.quotationData) {
      const q = state.quotationData;
      setQuotationId(q.id);
      setSelectedCustomerId(q.customer_id || "");
      setTaxType(q.tax_type || "inclusive");
      setTermsConditions(q.terms_conditions || "");
      setNotes(q.notes || "");
      setShippingAddress(q.shipping_address || "");
      
      if (q.customer_id) {
        setSelectedCustomer({
          id: q.customer_id,
          customer_name: q.customer_name,
          phone: q.customer_phone,
          email: q.customer_email,
          address: q.customer_address,
        });
      }
      
      // Load items from quotation
      if (q.quotation_items?.length > 0) {
        const items = q.quotation_items.map((item: any, i: number) => {
          // Find stock qty for this variant
          const product = productsData?.find(p => p.id === item.product_id);
          const variant = product?.product_variants?.find((v: any) => v.id === item.variant_id);
          
          return {
            id: `row-${i}`,
            productId: item.product_id,
            variantId: item.variant_id,
            productName: item.product_name,
            size: item.size,
            barcode: item.barcode || '',
            orderQty: item.quantity,
            stockQty: variant?.stock_qty || 0,
            mrp: item.mrp,
            salePrice: item.unit_price,
            discountPercent: item.discount_percent,
            discountAmount: 0,
            gstPercent: item.gst_percent,
            lineTotal: item.line_total,
            hsnCode: item.hsn_code || '',
          };
        });
        while (items.length < 5) {
          items.push({
            id: `row-${items.length}`,
            productId: '', variantId: '', productName: '', size: '', barcode: '',
            orderQty: 0, stockQty: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, hsnCode: '',
          });
        }
        setLineItems(items);
      }
      
      // Update quotation status to confirmed
      supabase.from('quotations').update({ status: 'confirmed' }).eq('id', q.id);
    } else if (state?.orderData) {
      const o = state.orderData;
      setEditingOrderId(o.id);
      setOrderNumber(o.order_number);
      setOrderDate(new Date(o.order_date));
      setExpectedDelivery(o.expected_delivery_date ? new Date(o.expected_delivery_date) : new Date());
      setSelectedCustomerId(o.customer_id || "");
      setQuotationId(o.quotation_id);
      setTaxType(o.tax_type || "inclusive");
      setTermsConditions(o.terms_conditions || "");
      setNotes(o.notes || "");
      setShippingAddress(o.shipping_address || "");
      setSalesman(o.salesman || "");
      
      if (o.customer_id) {
        setSelectedCustomer({
          id: o.customer_id,
          customer_name: o.customer_name,
          phone: o.customer_phone,
          email: o.customer_email,
          address: o.customer_address,
        });
      }
      
      if (o.sale_order_items?.length > 0) {
        const items = o.sale_order_items.map((item: any, i: number) => {
          const product = productsData?.find(p => p.id === item.product_id);
          const variant = product?.product_variants?.find((v: any) => v.id === item.variant_id);
          
          return {
            id: `row-${i}`,
            productId: item.product_id,
            variantId: item.variant_id,
            productName: item.product_name,
            size: item.size,
            barcode: item.barcode || '',
            orderQty: item.order_qty,
            stockQty: variant?.stock_qty || 0,
            mrp: item.mrp,
            salePrice: item.unit_price,
            discountPercent: item.discount_percent,
            discountAmount: 0,
            gstPercent: item.gst_percent,
            lineTotal: item.line_total,
            hsnCode: item.hsn_code || '',
          };
        });
        while (items.length < 5) {
          items.push({
            id: `row-${items.length}`,
            productId: '', variantId: '', productName: '', size: '', barcode: '',
            orderQty: 0, stockQty: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, hsnCode: '',
          });
        }
        setLineItems(items);
      }
    }
  }, [location.state, productsData]);

  useEffect(() => {
    if (lineItems.length > 0) {
      setLineItems(prev => prev.map(item => calculateLineTotal(item)));
    }
  }, [taxType]);

  const addProductToOrder = (product: any, variant: any) => {
    const existingIndex = lineItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
    
    if (existingIndex >= 0) {
      const updatedItems = [...lineItems];
      updatedItems[existingIndex].orderQty += 1;
      updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
      setLineItems(updatedItems);
    } else {
      const emptyRowIndex = lineItems.findIndex(item => item.productId === '');
      if (emptyRowIndex === -1) {
        // Add new row
        const newRow: LineItem = calculateLineTotal({
          id: `row-${lineItems.length}`,
          productId: product.id,
          variantId: variant.id,
          productName: product.product_name,
          size: variant.size,
          barcode: variant.barcode || '',
          orderQty: 1,
          stockQty: variant.stock_qty || 0,
          mrp: variant.sale_price || 0,
          salePrice: variant.sale_price || 0,
          discountPercent: 0,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
          color: variant.color || product.color || '',
        });
        setLineItems(prev => [...prev, newRow]);
      } else {
        const updatedItems = [...lineItems];
        updatedItems[emptyRowIndex] = calculateLineTotal({
          id: updatedItems[emptyRowIndex].id,
          productId: product.id,
          variantId: variant.id,
          productName: product.product_name,
          size: variant.size,
          barcode: variant.barcode || '',
          orderQty: 1,
          stockQty: variant.stock_qty || 0,
          mrp: variant.sale_price || 0,
          salePrice: variant.sale_price || 0,
          discountPercent: 0,
          discountAmount: 0,
          gstPercent: product.gst_per || 0,
          lineTotal: 0,
          hsnCode: product.hsn_code || '',
          color: variant.color || product.color || '',
        });
        setLineItems(updatedItems);
      }
    }
    
    setOpenProductSearch(false);
    setSearchInput("");
    toast({ title: "Product Added", description: `${product.product_name} (${variant.size}) added` });
    
    // Auto scroll to bottom
    setTimeout(() => {
      tableEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const calculateLineTotal = (item: LineItem): LineItem => {
    const baseAmount = item.salePrice * item.orderQty;
    const discountAmount = item.discountPercent > 0 
      ? (baseAmount * item.discountPercent) / 100 
      : item.discountAmount;
    const amountAfterDiscount = baseAmount - discountAmount;
    
    let lineTotal: number;
    if (taxType === "inclusive") {
      lineTotal = amountAfterDiscount;
    } else {
      const gstAmount = (amountAfterDiscount * item.gstPercent) / 100;
      lineTotal = amountAfterDiscount + gstAmount;
    }
    
    return { ...item, discountAmount, lineTotal };
  };

  const updateQuantity = (id: string, orderQty: number) => {
    if (orderQty < 1) return;
    setLineItems(prev => prev.map(item => 
      item.id === id ? calculateLineTotal({ ...item, orderQty }) : item
    ));
  };

  const updateDiscountPercent = (id: string, discountPercent: number) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? calculateLineTotal({ ...item, discountPercent, discountAmount: 0 }) : item
    ));
  };

  const removeItem = (id: string) => {
    setLineItems(prev => prev.map(item => 
      item.id === id ? {
        ...item, productId: '', variantId: '', productName: '', size: '', barcode: '',
        orderQty: 0, stockQty: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0,
      } : item
    ));
  };

  const handleCreateCustomer = async (values: z.infer<typeof customerSchema>) => {
    try {
      const customerName = values.customer_name?.trim() || values.phone;
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          customer_name: customerName,
          phone: values.phone,
          email: values.email || null,
          address: values.address || null,
          gst_number: values.gst_number || null,
          organization_id: currentOrganization?.id,
        }])
        .select()
        .single();

      if (error) throw error;
      toast({ title: "Customer Created", description: `${customerName} has been added` });
      setSelectedCustomerId(data.id);
      setSelectedCustomer(data);
      customerForm.reset();
      setOpenCustomerDialog(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // Calculate totals
  const filledItems = lineItems.filter(item => item.productId !== '');
  const grossAmount = filledItems.reduce((sum, item) => sum + (item.salePrice * item.orderQty), 0);
  const totalLineDiscount = filledItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const amountAfterLineDiscount = grossAmount - totalLineDiscount;
  
  // Flat discount calculation
  const calculatedFlatDiscount = flatDiscountPercent > 0 
    ? (amountAfterLineDiscount * flatDiscountPercent) / 100 
    : flatDiscountAmount;
  const amountAfterFlatDiscount = amountAfterLineDiscount - calculatedFlatDiscount;
  
  const totalGST = taxType === "exclusive" 
    ? filledItems.reduce((sum, item) => sum + ((item.salePrice * item.orderQty - item.discountAmount) * item.gstPercent / 100), 0)
    : 0;
  const subtotal = amountAfterFlatDiscount + totalGST;
  const netAmount = subtotal + roundOff;
  const totalDiscount = totalLineDiscount + calculatedFlatDiscount;

  const getStockDifference = (item: LineItem) => {
    if (!item.productId) return null;
    const diff = item.stockQty - item.orderQty;
    if (diff >= 0) return { color: 'text-green-600', icon: CheckCircle, text: `+${diff} available` };
    return { color: 'text-red-600', icon: AlertTriangle, text: `${diff} short` };
  };

  const handleSaveOrder = async () => {
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "Add at least one item", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const orderData = {
        organization_id: currentOrganization?.id,
        order_number: orderNumber,
        order_date: orderDate.toISOString(),
        expected_delivery_date: expectedDelivery.toISOString().split('T')[0],
        customer_id: selectedCustomerId || null,
        customer_name: selectedCustomer?.customer_name || 'Walk in Customer',
        customer_phone: selectedCustomer?.phone || null,
        customer_email: selectedCustomer?.email || null,
        customer_address: selectedCustomer?.address || null,
        gross_amount: grossAmount,
        discount_amount: totalDiscount,
        flat_discount_percent: flatDiscountPercent,
        flat_discount_amount: calculatedFlatDiscount,
        gst_amount: totalGST,
        round_off: roundOff,
        net_amount: netAmount,
        status: 'pending',
        tax_type: taxType,
        quotation_id: quotationId,
        notes,
        terms_conditions: termsConditions,
        shipping_address: shippingAddress,
        salesman: salesman || null,
      };

      let orderId = editingOrderId;

      if (editingOrderId) {
        const { error } = await supabase
          .from('sale_orders')
          .update(orderData)
          .eq('id', editingOrderId);
        if (error) throw error;
        
        await supabase.from('sale_order_items').delete().eq('order_id', editingOrderId);
      } else {
        const { data, error } = await supabase
          .from('sale_orders')
          .insert([orderData])
          .select()
          .single();
        if (error) throw error;
        orderId = data.id;
      }

      const orderItems = filledItems.map(item => ({
        order_id: orderId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode,
        color: item.color || null,
        order_qty: item.orderQty,
        fulfilled_qty: 0,
        pending_qty: item.orderQty,
        unit_price: item.salePrice,
        mrp: item.mrp,
        discount_percent: item.discountPercent,
        gst_percent: item.gstPercent,
        line_total: item.lineTotal,
        hsn_code: item.hsnCode || null,
      }));

      const { error: itemsError } = await supabase
        .from('sale_order_items')
        .insert(orderItems);
      if (itemsError) throw itemsError;

      toast({ title: "Success", description: `Sale Order ${orderNumber} saved` });
      return { success: true, orderId };
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      return { success: false };
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndPrint = async () => {
    const result = await handleSaveOrder();
    if (result.success) {
      // Prepare print data
      const printItems = filledItems.map((item, index) => ({
        sr: index + 1,
        particulars: item.productName,
        size: item.size,
        barcode: item.barcode,
        hsn: '',
        qty: item.orderQty,
        rate: item.salePrice,
        mrp: item.mrp,
        discountPercent: item.discountPercent,
        total: item.lineTotal,
      }));

      setPrintData({
        items: printItems,
        grossAmount,
        discountAmount: totalDiscount,
        taxableAmount: grossAmount - totalDiscount,
        gstAmount: totalGST,
        roundOff: 0,
        netAmount,
      });

      setTimeout(() => {
        handlePrint();
        navigate('/sale-order-dashboard');
      }, 100);
    }
  };

  const filteredProducts = productsData?.filter(product => {
    const searchLower = searchInput.toLowerCase();
    const matchesProduct = product.product_name?.toLowerCase().includes(searchLower) ||
      product.brand?.toLowerCase().includes(searchLower);
    const matchesVariant = product.product_variants?.some((v: any) => 
      v.barcode?.toLowerCase().includes(searchLower)
    );
    return matchesProduct || matchesVariant;
  }) || [];

  return (
    <div className="p-4 space-y-4">
      <BackToDashboard />
      
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            {editingOrderId ? 'Edit Sale Order' : 'New Sale Order'}
            {quotationId && <Badge variant="outline">From Quotation</Badge>}
          </h1>
          <div className="flex items-center gap-2">
            <Label>Order No:</Label>
            <Input value={orderNumber} readOnly className="w-40 bg-muted" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <Label>Order Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(orderDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={orderDate} onSelect={(d) => d && setOrderDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Expected Delivery</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(expectedDelivery, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={expectedDelivery} onSelect={(d) => d && setExpectedDelivery(d)} />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Customer</Label>
            <div className="flex gap-2">
              <Select value={selectedCustomerId} onValueChange={(value) => {
                setSelectedCustomerId(value);
                const customer = customersData?.find(c => c.id === value);
                setSelectedCustomer(customer);
              }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customersData?.map(customer => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.customer_name} - {customer.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => setOpenCustomerDialog(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label>Tax Type</Label>
            <Select value={taxType} onValueChange={(v: "exclusive" | "inclusive") => setTaxType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exclusive">Exclusive GST</SelectItem>
                <SelectItem value="inclusive">Inclusive GST</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Salesman</Label>
            <Select value={salesman || "none"} onValueChange={(v) => setSalesman(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select Salesman" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {employeesData?.map(emp => (
                  <SelectItem key={emp.id} value={emp.employee_name}>
                    {emp.employee_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Product Search */}
        <div className="mb-4">
          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start">
                <Search className="mr-2 h-4 w-4" />
                Search Products (Shows Stock)
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[600px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search by name, barcode..." value={searchInput} onValueChange={setSearchInput} />
                <CommandList>
                  <CommandEmpty>No products found</CommandEmpty>
                  <CommandGroup>
                    {filteredProducts.slice(0, 10).map(product => (
                      product.product_variants?.map((variant: any) => (
                        <CommandItem
                          key={variant.id}
                          onSelect={() => addProductToOrder(product, variant)}
                          className="cursor-pointer"
                        >
                          <div className="flex justify-between w-full items-center">
                            <span>{product.product_name} - {variant.size}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-muted-foreground">₹{variant.sale_price}</span>
                              <Badge variant={variant.stock_qty > 0 ? "default" : "destructive"}>
                                Stock: {variant.stock_qty}
                              </Badge>
                            </div>
                          </div>
                        </CommandItem>
                      ))
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Line Items Table with Stock Difference */}
        <ScrollArea className="max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="w-20">Order Qty</TableHead>
                <TableHead className="w-20">Stock</TableHead>
                <TableHead className="w-28">Difference</TableHead>
                <TableHead className="w-24">Price</TableHead>
                <TableHead className="w-20">Disc %</TableHead>
                <TableHead className="w-24 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, index) => {
                const stockInfo = getStockDifference(item);
                return (
                  <TableRow key={item.id} className={item.productId ? '' : 'opacity-50'}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{item.productName || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.barcode || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{item.hsnCode || '-'}</TableCell>
                    <TableCell className="text-xs">{item.color || '-'}</TableCell>
                    <TableCell>{item.size || '-'}</TableCell>
                    <TableCell>
                      {item.productId && (
                        <Input
                          type="number"
                          min="1"
                          value={item.orderQty}
                          onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                          className="w-16 h-8"
                        />
                      )}
                    </TableCell>
                    <TableCell>{item.productId ? item.stockQty : '-'}</TableCell>
                    <TableCell>
                      {stockInfo && (
                        <div className={cn("flex items-center gap-1 text-sm", stockInfo.color)}>
                          <stockInfo.icon className="h-4 w-4" />
                          {stockInfo.text}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>₹{item.salePrice.toFixed(2)}</TableCell>
                    <TableCell>
                      {item.productId && (
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discountPercent}
                          onChange={(e) => updateDiscountPercent(item.id, parseFloat(e.target.value) || 0)}
                          className="w-16 h-8"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{item.lineTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      {item.productId && (
                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div ref={tableEndRef} />
        </ScrollArea>

        {/* Summary with Flat Discount & Round Off */}
        <div className="mt-4 flex justify-between items-start">
          <div className="grid grid-cols-2 gap-4 w-80">
            <div>
              <Label>Flat Discount %</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={flatDiscountPercent}
                onChange={(e) => {
                  setFlatDiscountPercent(parseFloat(e.target.value) || 0);
                  setFlatDiscountAmount(0);
                }}
                className="h-9"
              />
            </div>
            <div>
              <Label>Flat Discount ₹</Label>
              <Input
                type="number"
                min="0"
                value={flatDiscountAmount}
                onChange={(e) => {
                  setFlatDiscountAmount(parseFloat(e.target.value) || 0);
                  setFlatDiscountPercent(0);
                }}
                className="h-9"
              />
            </div>
            <div className="col-span-2">
              <Label>Round Off</Label>
              <Input
                type="number"
                step="0.01"
                value={roundOff}
                onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                className="h-9"
              />
            </div>
          </div>
          <div className="w-72 space-y-2">
            <div className="flex justify-between"><span>Gross Amount:</span><span>₹{grossAmount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Line Discount:</span><span>-₹{totalLineDiscount.toFixed(2)}</span></div>
            {calculatedFlatDiscount > 0 && (
              <div className="flex justify-between"><span>Flat Discount:</span><span>-₹{calculatedFlatDiscount.toFixed(2)}</span></div>
            )}
            {taxType === "exclusive" && (
              <div className="flex justify-between"><span>GST:</span><span>₹{totalGST.toFixed(2)}</span></div>
            )}
            {roundOff !== 0 && (
              <div className="flex justify-between"><span>Round Off:</span><span>₹{roundOff.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Net Amount:</span><span>₹{netAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Terms & Conditions</Label>
            <Textarea value={termsConditions} onChange={(e) => setTermsConditions(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-4">
          <Button onClick={() => handleSaveOrder().then(r => r.success && navigate('/sale-order-dashboard'))} disabled={isSaving} className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Book Sale Order'}
          </Button>
          <Button onClick={handleSaveAndPrint} disabled={isSaving} variant="outline" className="flex-1">
            <Printer className="mr-2 h-4 w-4" />
            Save & Print
          </Button>
        </div>
      </Card>

      {/* Print Component (hidden) */}
      <div className="hidden">
        <SaleOrderPrint
          ref={printRef}
          businessName={settings?.business_name || ''}
          address={settings?.address || ''}
          mobile={settings?.mobile_number || ''}
          email={settings?.email_id || ''}
          gstNumber={settings?.gst_number || ''}
          logoUrl=""
          orderNumber={orderNumber}
          orderDate={orderDate}
          expectedDeliveryDate={expectedDelivery}
          status="pending"
          customerName={selectedCustomer?.customer_name || 'Walk in Customer'}
          customerAddress={selectedCustomer?.address}
          customerMobile={selectedCustomer?.phone}
          customerEmail={selectedCustomer?.email}
          customerGSTIN={selectedCustomer?.gst_number}
          items={printData?.items || []}
          grossAmount={printData?.grossAmount || 0}
          discountAmount={printData?.discountAmount || 0}
          taxableAmount={printData?.taxableAmount || 0}
          gstAmount={printData?.gstAmount || 0}
          roundOff={0}
          netAmount={printData?.netAmount || 0}
          termsConditions={termsConditions}
          notes={notes}
          taxType={taxType}
          salesman={salesman}
        />
      </div>

      {/* Create Customer Dialog */}
      <Dialog open={openCustomerDialog} onOpenChange={setOpenCustomerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleCreateCustomer)} className="space-y-4">
              <FormField control={customerForm.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobile Number *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={customerForm.control} name="customer_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={customerForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={customerForm.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full">Create Customer</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
