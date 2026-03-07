import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useStockValidation } from "@/hooks/useStockValidation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon, Home, Plus, X, Search, Loader2, FileText, ArrowRight, Scan } from "lucide-react";
import { SizeGridDialog } from "@/components/SizeGridDialog";
import { format } from "date-fns";
import { cn, sortSearchResults } from "@/lib/utils";
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

interface LineItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string;
  color: string;
  quantity: number;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  lineTotal: number;
  hsnCode: string;
}

const customerSchema = z.object({
  customer_name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Mobile number is required").max(20),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

export default function DeliveryChallanEntry() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { validateCartStock, showMultipleStockErrors } = useStockValidation();
  const location = useLocation();
  const { orgNavigate: navigate } = useOrgNavigation();
  
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [challanDate, setChallanDate] = useState<Date>(new Date());
  const [lineItems, setLineItems] = useState<LineItem[]>(
    Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`,
      productId: '',
      variantId: '',
      productName: '',
      size: '',
      barcode: '',
      color: '',
      quantity: 0,
      mrp: 0,
      salePrice: 0,
      discountPercent: 0,
      lineTotal: 0,
      hsnCode: '',
    }))
  );
  
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [productDisplayLimit, setProductDisplayLimit] = useState(100);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [editingChallanId, setEditingChallanId] = useState<string | null>(null);
  const [originalItemsForEdit, setOriginalItemsForEdit] = useState<Array<{ variantId: string; quantity: number }>>([]);
  const [salesman, setSalesman] = useState<string>("");
  const [flatDiscountPercent, setFlatDiscountPercent] = useState<number>(0);
  const [flatDiscountRupees, setFlatDiscountRupees] = useState<number>(0);
  const [roundOff, setRoundOff] = useState<number>(0);
  const [nextChallanPreview, setNextChallanPreview] = useState<string>("");
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("inline");
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [sizeGridProduct, setSizeGridProduct] = useState<any>(null);
  const [sizeGridVariants, setSizeGridVariants] = useState<any[]>([]);
  const [selectedSaleOrderId, setSelectedSaleOrderId] = useState<string | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const { filteredCustomers, isLoading: isCustomersLoading, refetch: refetchCustomers } = useCustomerSearch(customerSearchInput);

  const customerForm = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: { customer_name: "", phone: "", email: "", address: "", gst_number: "" },
  });

  // Fetch products with pagination
  const { data: productsData } = useQuery({
    queryKey: ['products-with-variants', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const allProducts: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select(`id, product_name, brand, hsn_code, gst_per, product_type, status, category, style, color, size_group_id, uom, product_variants (id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, deleted_at, organization_id), size_groups (id, group_name, sizes)`)
          .eq('organization_id', currentOrganization.id)
          .eq('status', 'active')
          .is('deleted_at', null)
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allProducts.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      return allProducts.map((product: any) => {
        const sizeGroup = product.size_groups;
        let size_range: string | null = null;
        if (sizeGroup && Array.isArray(sizeGroup.sizes) && sizeGroup.sizes.length > 0) {
          size_range = sizeGroup.sizes.length > 1
            ? `${sizeGroup.sizes[0]}-${sizeGroup.sizes[sizeGroup.sizes.length - 1]}`
            : sizeGroup.sizes[0];
        }
        return { 
          ...product, 
          size_range,
          product_variants: product.product_variants?.filter((v: any) => !v.deleted_at)
        };
      });
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  // Fetch employees
  const { data: employeesData } = useQuery({
    queryKey: ['employees', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_name, status')
        .eq('organization_id', currentOrganization.id)
        .eq('status', 'active')
        .order('employee_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch pending sale orders
  const { data: pendingSaleOrders } = useQuery({
    queryKey: ['pending-sale-orders', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('sale_orders')
        .select(`*, sale_order_items (*)`)
        .eq('organization_id', currentOrganization.id)
        .in('status', ['pending', 'partially_fulfilled'])
        .is('deleted_at', null)
        .order('order_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Generate next challan number preview
  useEffect(() => {
    const previewNextChallan = async () => {
      if (!currentOrganization?.id || editingChallanId) return;
      try {
        const { data: nextNumber } = await supabase.rpc('generate_challan_number', {
          p_organization_id: currentOrganization.id
        });
        if (nextNumber) setNextChallanPreview(nextNumber);
      } catch (e) {
        console.error('Error getting challan preview:', e);
      }
    };
    previewNextChallan();
  }, [currentOrganization?.id, editingChallanId]);

  // Load from sale order if passed via location state
  useEffect(() => {
    if (location.state?.fromSaleOrder && pendingSaleOrders) {
      const order = pendingSaleOrders.find((o: any) => o.id === location.state.fromSaleOrder);
      if (order) {
        loadFromSaleOrder(order);
      }
    }
  }, [location.state, pendingSaleOrders]);

  const loadFromSaleOrder = (order: any) => {
    setSelectedSaleOrderId(order.id);
    setSelectedCustomerId(order.customer_id || "");
    setSelectedCustomer({
      id: order.customer_id,
      customer_name: order.customer_name,
      phone: order.customer_phone,
      email: order.customer_email,
      address: order.customer_address,
    });
    setShippingAddress(order.shipping_address || "");
    setSalesman(order.salesman || "");
    setNotes(`From Sale Order: ${order.order_number}`);
    
    // Load items from sale order (only pending quantities)
    const items: LineItem[] = order.sale_order_items
      .filter((item: any) => item.pending_qty > 0 && !item.deleted_at)
      .map((item: any, idx: number) => ({
        id: `row-${idx}`,
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        size: item.size,
        barcode: item.barcode || '',
        color: item.color || '',
        quantity: item.pending_qty,
        mrp: item.mrp,
        salePrice: item.unit_price,
        discountPercent: item.discount_percent,
        lineTotal: item.pending_qty * item.unit_price * (1 - item.discount_percent / 100),
        hsnCode: item.hsn_code || '',
      }));
    
    // Pad with empty rows
    while (items.length < 5) {
      items.push({
        id: `row-${items.length}`,
        productId: '', variantId: '', productName: '', size: '', barcode: '', color: '',
        quantity: 0, mrp: 0, salePrice: 0, discountPercent: 0, lineTotal: 0, hsnCode: '',
      });
    }
    setLineItems(items);
  };

  // Product search
  useEffect(() => {
    if (searchInput.length < 2) {
      setProductSearchResults([]);
      return;
    }
    setIsSearching(true);
    const searchLower = searchInput.toLowerCase();
    const results = (productsData || []).filter((product: any) => {
      return product.product_name?.toLowerCase().includes(searchLower) ||
        product.style?.toLowerCase().includes(searchLower) ||
        product.brand?.toLowerCase().includes(searchLower);
    });
    setProductSearchResults(results.slice(0, 100));
    setProductDisplayLimit(100);
    setIsSearching(false);
  }, [searchInput, productsData]);

  const addProductToLine = (product: any, variant: any) => {
    const firstEmptyIdx = lineItems.findIndex(item => item.productId === '');
    if (firstEmptyIdx === -1) {
      setLineItems([...lineItems, {
        id: `row-${lineItems.length}`,
        productId: product.id,
        variantId: variant.id,
        productName: product.product_name,
        size: variant.size,
        barcode: variant.barcode || '',
        color: variant.color || product.color || '',
        quantity: 1,
        mrp: variant.mrp || 0,
        salePrice: variant.sale_price || 0,
        discountPercent: 0,
        lineTotal: variant.sale_price || 0,
        hsnCode: product.hsn_code || '',
      }]);
    } else {
      const newItems = [...lineItems];
      newItems[firstEmptyIdx] = {
        ...newItems[firstEmptyIdx],
        productId: product.id,
        variantId: variant.id,
        productName: product.product_name,
        size: variant.size,
        barcode: variant.barcode || '',
        color: variant.color || product.color || '',
        quantity: 1,
        mrp: variant.mrp || 0,
        salePrice: variant.sale_price || 0,
        discountPercent: 0,
        lineTotal: variant.sale_price || 0,
        hsnCode: product.hsn_code || '',
      };
      setLineItems(newItems);
    }
    setOpenProductSearch(false);
    setSearchInput("");
  };

  // Handle barcode/product search on Enter (like POS)
  const handleBarcodeSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      searchAndAddProduct(searchInput.trim());
    }
  };

  const searchAndAddProduct = (searchTerm: string) => {
    if (!productsData) return;

    // Search by barcode first (exact match)
    let foundVariant: any = null;
    let foundProduct: any = null;

    for (const product of productsData) {
      const variantMatch = product.product_variants?.find((v: any) => 
        v.barcode?.toLowerCase() === searchTerm.toLowerCase() && v.stock_qty > 0
      );
      
      if (variantMatch) {
        foundVariant = variantMatch;
        foundProduct = product;
        break;
      }
    }

    if (foundVariant && foundProduct) {
      // If in grid mode, open size grid dialog
      if (entryMode === "grid") {
        setSizeGridProduct(foundProduct);
        setSizeGridVariants(foundProduct.product_variants || []);
        setShowSizeGrid(true);
        setSearchInput("");
        barcodeInputRef.current?.focus();
        return;
      }
      
      // Check if product already exists in filled rows
      const existingIndex = lineItems.findIndex(item => item.variantId === foundVariant.id && item.productId !== '');
      
      if (existingIndex >= 0) {
        // Increment quantity
        const newItems = [...lineItems];
        newItems[existingIndex].quantity += 1;
        newItems[existingIndex].lineTotal = newItems[existingIndex].quantity * newItems[existingIndex].salePrice * (1 - newItems[existingIndex].discountPercent / 100);
        setLineItems(newItems);
      } else {
        // Add as new line
        addProductToLine(foundProduct, foundVariant);
      }
      
      setSearchInput("");
      // Keep focus on barcode input for continuous scanning
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    } else {
      toast({
        title: "Product not found",
        description: "No product matches the scanned barcode.",
        variant: "destructive",
      });
      setSearchInput("");
      barcodeInputRef.current?.focus();
    }
  };

  const handleProductSelect = (product: any) => {
    if (entryMode === 'grid' && product.product_variants?.length > 1) {
      setSizeGridProduct(product);
      setSizeGridVariants(product.product_variants || []);
      setShowSizeGrid(true);
    } else if (product.product_variants?.length === 1) {
      addProductToLine(product, product.product_variants[0]);
    } else {
      setSizeGridProduct(product);
      setSizeGridVariants(product.product_variants || []);
      setShowSizeGrid(true);
    }
    setOpenProductSearch(false);
    setSearchInput("");
  };

  const handleSizeGridConfirm = (items: Array<{ variant: any; qty: number }>) => {
    if (!sizeGridProduct) return;
    items.forEach(({ variant, qty }) => {
      if (qty > 0) {
        const existingIdx = lineItems.findIndex(item => item.variantId === variant.id);
        if (existingIdx !== -1) {
          const newItems = [...lineItems];
          newItems[existingIdx].quantity += qty;
          newItems[existingIdx].lineTotal = newItems[existingIdx].quantity * newItems[existingIdx].salePrice * (1 - newItems[existingIdx].discountPercent / 100);
          setLineItems(newItems);
        } else {
          addProductToLine(sizeGridProduct, variant);
          setLineItems(prev => {
            const newItems = [...prev];
            const idx = newItems.findIndex(item => item.variantId === variant.id);
            if (idx !== -1) {
              newItems[idx].quantity = qty;
              newItems[idx].lineTotal = qty * newItems[idx].salePrice * (1 - newItems[idx].discountPercent / 100);
            }
            return newItems;
          });
        }
      }
    });
    setShowSizeGrid(false);
    setSizeGridProduct(null);
  };

  const updateQuantity = (idx: number, qty: number) => {
    const newItems = [...lineItems];
    newItems[idx].quantity = qty;
    newItems[idx].lineTotal = qty * newItems[idx].salePrice * (1 - newItems[idx].discountPercent / 100);
    setLineItems(newItems);
  };

  const updateDiscountPercent = (idx: number, disc: number) => {
    const newItems = [...lineItems];
    newItems[idx].discountPercent = disc;
    newItems[idx].lineTotal = newItems[idx].quantity * newItems[idx].salePrice * (1 - disc / 100);
    setLineItems(newItems);
  };

  const removeItem = (idx: number) => {
    const newItems = [...lineItems];
    newItems.splice(idx, 1);
    newItems.push({
      id: `row-${Date.now()}`,
      productId: '', variantId: '', productName: '', size: '', barcode: '', color: '',
      quantity: 0, mrp: 0, salePrice: 0, discountPercent: 0, lineTotal: 0, hsnCode: '',
    });
    setLineItems(newItems);
  };

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomerId(customer.id);
    setSelectedCustomer(customer);
    setOpenCustomerSearch(false);
    setCustomerSearchInput("");
    if (customer.address) setShippingAddress(customer.address);
  };

  const handleCreateCustomer = async (data: z.infer<typeof customerSchema>) => {
    try {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      
      const { createOrGetCustomer } = await import("@/utils/customerUtils");
      
      const result = await createOrGetCustomer({
        customer_name: data.customer_name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        gst_number: data.gst_number,
        organization_id: currentOrganization.id,
      });
      
      setSelectedCustomerId(result.customer.id);
      setSelectedCustomer(result.customer);
      setOpenCustomerDialog(false);
      customerForm.reset();
      refetchCustomers();
      
      if (result.isExisting) {
        toast({ title: "Customer Found", description: `${result.customer.customer_name} already exists and has been selected` });
      } else {
        toast({ title: "Customer Created", description: "New customer has been added" });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // Calculations - NO GST for delivery challan
  const filledItems = lineItems.filter(item => item.productId !== '');
  const grossAmount = filledItems.reduce((sum, item) => sum + (item.quantity * item.salePrice), 0);
  const lineItemDiscount = filledItems.reduce((sum, item) => sum + (item.quantity * item.salePrice * item.discountPercent / 100), 0);
  const subtotalAfterLineDiscount = grossAmount - lineItemDiscount;
  const flatDiscountAmount = flatDiscountPercent > 0 
    ? subtotalAfterLineDiscount * flatDiscountPercent / 100 
    : flatDiscountRupees;
  const netAmount = subtotalAfterLineDiscount - flatDiscountAmount + roundOff;
  const totalQty = filledItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleSaveChallan = async () => {
    if (!selectedCustomerId || !selectedCustomer) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please select a customer" });
      return;
    }
    if (filledItems.length === 0) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please add at least one product" });
      return;
    }

    // Stock validation
    const challanItems = filledItems.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));
    const insufficientItems = await validateCartStock(challanItems, editingChallanId ? originalItemsForEdit : undefined);
    if (insufficientItems.length > 0) {
      showMultipleStockErrors(insufficientItems);
      return;
    }

    setIsSaving(true);
    try {
      if (editingChallanId) {
        // Delete existing items and re-insert
        await supabase.from('delivery_challan_items').delete().eq('challan_id', editingChallanId);
        
        const challanItemsData = filledItems.map(item => ({
          challan_id: editingChallanId,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode || null,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.salePrice,
          mrp: item.mrp,
          discount_percent: item.discountPercent,
          line_total: item.lineTotal,
          hsn_code: item.hsnCode || null,
        }));
        await supabase.from('delivery_challan_items').insert(challanItemsData);
        
        await supabase.from('delivery_challans').update({
          challan_date: challanDate.toISOString(),
          customer_id: selectedCustomerId,
          customer_name: selectedCustomer.customer_name,
          customer_phone: selectedCustomer.phone || null,
          customer_email: selectedCustomer.email || null,
          customer_address: selectedCustomer.address || null,
          gross_amount: grossAmount,
          discount_amount: lineItemDiscount,
          flat_discount_percent: flatDiscountPercent,
          flat_discount_amount: flatDiscountAmount,
          round_off: roundOff,
          net_amount: netAmount,
          salesman: salesman || null,
          shipping_address: shippingAddress || null,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        }).eq('id', editingChallanId);
        
        toast({ title: "Challan Updated", description: "Delivery challan has been updated" });
      } else {
        // Create new challan
        const { data: challanNumber } = await supabase.rpc('generate_challan_number', { 
          p_organization_id: currentOrganization?.id 
        });

        const { data: challanData, error: challanError } = await supabase
          .from('delivery_challans')
          .insert([{
            challan_number: challanNumber,
            challan_date: challanDate.toISOString(),
            organization_id: currentOrganization?.id,
            customer_id: selectedCustomerId,
            customer_name: selectedCustomer.customer_name,
            customer_phone: selectedCustomer.phone || null,
            customer_email: selectedCustomer.email || null,
            customer_address: selectedCustomer.address || null,
            sale_order_id: selectedSaleOrderId,
            gross_amount: grossAmount,
            discount_amount: lineItemDiscount,
            flat_discount_percent: flatDiscountPercent,
            flat_discount_amount: flatDiscountAmount,
            round_off: roundOff,
            net_amount: netAmount,
            salesman: salesman || null,
            shipping_address: shippingAddress || null,
            notes: notes || null,
            status: 'pending',
          }])
          .select()
          .single();

        if (challanError) throw challanError;

        const challanItemsData = filledItems.map(item => ({
          challan_id: challanData.id,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          size: item.size,
          barcode: item.barcode || null,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.salePrice,
          mrp: item.mrp,
          discount_percent: item.discountPercent,
          line_total: item.lineTotal,
          hsn_code: item.hsnCode || null,
        }));

        const { error: itemsError } = await supabase.from('delivery_challan_items').insert(challanItemsData);
        if (itemsError) throw itemsError;

        // Update sale order fulfilled quantities if created from order
        if (selectedSaleOrderId) {
          for (const item of filledItems) {
            // Get current values first
            const { data: orderItem } = await supabase
              .from('sale_order_items')
              .select('fulfilled_qty, pending_qty')
              .eq('order_id', selectedSaleOrderId)
              .eq('variant_id', item.variantId)
              .maybeSingle();
            
            if (orderItem) {
              await supabase
                .from('sale_order_items')
                .update({ 
                  fulfilled_qty: (orderItem.fulfilled_qty || 0) + item.quantity,
                  pending_qty: Math.max(0, (orderItem.pending_qty || 0) - item.quantity),
                })
                .eq('order_id', selectedSaleOrderId)
                .eq('variant_id', item.variantId);
            }
          }
        }

        toast({ title: "Challan Saved", description: `Delivery Challan ${challanNumber} created successfully` });
        
        // Reset form
        setLineItems(Array(5).fill(null).map((_, i) => ({
          id: `row-${i}`, productId: '', variantId: '', productName: '', size: '', barcode: '', color: '',
          quantity: 0, mrp: 0, salePrice: 0, discountPercent: 0, lineTotal: 0, hsnCode: '',
        })));
        setSelectedCustomerId("");
        setSelectedCustomer(null);
        setNotes("");
        setShippingAddress("");
        setSalesman("");
        setFlatDiscountPercent(0);
        setFlatDiscountRupees(0);
        setRoundOff(0);
        setSelectedSaleOrderId(null);
      }
    } catch (error: any) {
      console.error('Error saving challan:', error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save challan" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <BackToDashboard />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Delivery Challan</h1>
              <p className="text-sm text-muted-foreground">No GST - Stock will be deducted on save</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Entry Mode:</Label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Inline</span>
                <Switch checked={entryMode === 'grid'} onCheckedChange={(c) => setEntryMode(c ? 'grid' : 'inline')} />
                <span className="text-xs text-muted-foreground">Grid</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          {/* Challan Info */}
          <Card className="p-4">
            <div className="space-y-3">
              <div>
                <Label>Challan No</Label>
                <Input value={editingChallanId ? "Editing..." : nextChallanPreview || "Auto"} disabled className="bg-muted" />
              </div>
              <div>
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !challanDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {challanDate ? format(challanDate, "dd/MM/yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={challanDate} onSelect={(d) => d && setChallanDate(d)} /></PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Salesman</Label>
                <Select value={salesman} onValueChange={setSalesman}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {employeesData?.map((emp: any) => (
                      <SelectItem key={emp.id} value={emp.employee_name}>{emp.employee_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Customer Selection */}
          <Card className="p-4 lg:col-span-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Customer</Label>
                <Button variant="ghost" size="sm" onClick={() => setOpenCustomerDialog(true)}>
                  <Plus className="h-3 w-3 mr-1" /> New
                </Button>
              </div>
              <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <Search className="mr-2 h-3 w-3" />
                    {selectedCustomer ? `${selectedCustomer.customer_name} - ${selectedCustomer.phone || ''}` : "Search customer..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Search by name or phone..." value={customerSearchInput} onValueChange={setCustomerSearchInput} />
                    <CommandList>
                      {isCustomersLoading ? <CommandEmpty>Loading...</CommandEmpty> : 
                       filteredCustomers?.length === 0 ? <CommandEmpty>No customers found.</CommandEmpty> : (
                        <CommandGroup>
                          {filteredCustomers?.map((customer: any) => (
                            <CommandItem key={customer.id} value={customer.customer_name} onSelect={() => handleSelectCustomer(customer)}>
                              <span className="font-medium">{customer.customer_name}</span>
                              <span className="ml-2 text-muted-foreground text-xs">{customer.phone}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedCustomer && (
                <div className="text-xs text-muted-foreground">
                  <p>{selectedCustomer.address}</p>
                  {selectedCustomer.gst_number && <p>GST: {selectedCustomer.gst_number}</p>}
                </div>
              )}
            </div>
          </Card>

          {/* From Sale Order */}
          <Card className="p-4">
            <div className="space-y-3">
              <Label>From Sale Order</Label>
              <Select value={selectedSaleOrderId || ""} onValueChange={(v) => {
                const order = pendingSaleOrders?.find((o: any) => o.id === v);
                if (order) loadFromSaleOrder(order);
              }}>
                <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                <SelectContent>
                  {pendingSaleOrders?.map((order: any) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_number} - {order.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('/sale-order-dashboard')}>
                <FileText className="h-3 w-3 mr-1" /> View Orders
              </Button>
            </div>
          </Card>
        </div>

        {/* Product Search with Barcode Scan */}
        <Card className="mb-4 p-3">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Barcode Scan Input - Direct scan like POS */}
            <div className="relative w-[200px]">
              <Scan className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={barcodeInputRef}
                placeholder="Scan barcode..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleBarcodeSearch}
                className="pl-10 pr-4 h-10"
                autoFocus
              />
            </div>

            {/* Browse Products Search Bar */}
            <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 min-w-[250px] h-10 justify-start text-left font-normal">
                  <Search className="mr-2 h-4 w-4" /> Browse products by name, style...
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[600px] p-0">
                <Command>
                  <CommandInput placeholder="Type to search..." value={searchInput} onValueChange={setSearchInput} />
                  <CommandList>
                    {isSearching ? <CommandEmpty>Searching...</CommandEmpty> : 
                     productSearchResults.length === 0 ? <CommandEmpty>No products found.</CommandEmpty> : (
                      <>
                        {productSearchResults.length > productDisplayLimit && (
                          <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
                            <span>Showing {productDisplayLimit} of {productSearchResults.length} results</span>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductDisplayLimit(prev => prev + 100);
                              }}
                            >
                              Load More
                            </Button>
                          </div>
                        )}
                        <CommandGroup>
                          {productSearchResults.slice(0, productDisplayLimit).map((product: any) => (
                          <CommandItem key={product.id} onSelect={() => handleProductSelect(product)}>
                            <div className="flex justify-between w-full">
                              <div>
                                <span className="font-medium">{product.product_name}</span>
                                {product.style && <span className="ml-2 text-muted-foreground text-xs">({product.style})</span>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {product.size_range && <span className="mr-2">Sizes: {product.size_range}</span>}
                                <span>₹{product.default_sale_price || 0}</span>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </Card>

        {/* Items Table */}
        <Card className="mb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="w-20">Size</TableHead>
                <TableHead className="w-24">Barcode</TableHead>
                <TableHead className="w-16 text-right">Qty</TableHead>
                <TableHead className="w-20 text-right">Rate</TableHead>
                <TableHead className="w-16 text-right">Disc%</TableHead>
                <TableHead className="w-24 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, idx) => (
                <TableRow key={item.id} className={item.productId ? '' : 'opacity-50'}>
                  <TableCell className="text-xs">{idx + 1}</TableCell>
                  <TableCell className="text-sm font-medium">{item.productName || '-'}</TableCell>
                  <TableCell className="text-sm">{item.size || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.barcode || '-'}</TableCell>
                  <TableCell>
                    <Input type="number" min={0} value={item.quantity || ''} onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 0)}
                      disabled={!item.productId} className="h-7 w-16 text-right text-sm" />
                  </TableCell>
                  <TableCell className="text-right text-sm">₹{item.salePrice.toFixed(2)}</TableCell>
                  <TableCell>
                    <Input type="number" min={0} max={100} value={item.discountPercent || ''} onChange={(e) => updateDiscountPercent(idx, parseFloat(e.target.value) || 0)}
                      disabled={!item.productId} className="h-7 w-14 text-right text-sm" />
                  </TableCell>
                  <TableCell className="text-right font-medium text-sm">₹{item.lineTotal.toFixed(2)}</TableCell>
                  <TableCell>
                    {item.productId && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeItem(idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Notes */}
          <Card className="p-4">
            <Label className="mb-2 block">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." rows={3} />
            <Label className="mt-3 mb-2 block">Shipping Address</Label>
            <Textarea value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="Delivery address..." rows={2} />
          </Card>

          {/* Discounts */}
          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Flat Discount %</Label>
                <Input type="number" min={0} max={100} value={flatDiscountPercent || ''} onChange={(e) => { setFlatDiscountPercent(parseFloat(e.target.value) || 0); setFlatDiscountRupees(0); }}
                  className="h-7 w-20 text-right text-sm" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Flat Discount ₹</Label>
                <Input type="number" min={0} value={flatDiscountRupees || ''} onChange={(e) => { setFlatDiscountRupees(parseFloat(e.target.value) || 0); setFlatDiscountPercent(0); }}
                  className="h-7 w-20 text-right text-sm" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Round Off</Label>
                <Input type="number" value={roundOff || ''} onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                  className="h-7 w-20 text-right text-sm" />
              </div>
            </div>
          </Card>

          {/* Summary */}
          <Card className="p-4 bg-muted/50">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Gross Amount:</span><span>₹{grossAmount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Line Discount:</span><span>-₹{lineItemDiscount.toFixed(2)}</span></div>
              {flatDiscountAmount > 0 && <div className="flex justify-between"><span>Flat Discount:</span><span>-₹{flatDiscountAmount.toFixed(2)}</span></div>}
              {roundOff !== 0 && <div className="flex justify-between"><span>Round Off:</span><span>₹{roundOff.toFixed(2)}</span></div>}
              <div className="border-t pt-2 flex justify-between font-bold text-lg">
                <span>Net Amount:</span><span>₹{netAmount.toFixed(2)}</span>
              </div>
              <div className="text-xs text-muted-foreground">Total Qty: {totalQty} | Items: {filledItems.length}</div>
            </div>
            <Button className="w-full mt-4" onClick={handleSaveChallan} disabled={isSaving || filledItems.length === 0}>
              {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Delivery Challan"}
            </Button>
          </Card>
        </div>
      </div>

      {/* Customer Dialog */}
      <Dialog open={openCustomerDialog} onOpenChange={setOpenCustomerDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Customer</DialogTitle></DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleCreateCustomer)} className="space-y-4">
              <FormField control={customerForm.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Mobile Number *</FormLabel><FormControl><Input {...field} placeholder="9876543210" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={customerForm.control} name="customer_name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} placeholder="Customer name" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={customerForm.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea {...field} placeholder="Address" rows={2} /></FormControl><FormMessage /></FormItem>
              )} />
              <Button type="submit" className="w-full">Create Customer</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Size Grid Dialog */}
      <SizeGridDialog 
        open={showSizeGrid} 
        onClose={() => setShowSizeGrid(false)}
        product={sizeGridProduct}
        variants={sizeGridVariants}
        onConfirm={handleSizeGridConfirm}
      />
    </div>
  );
}