import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon, Plus, X, Search, Save, ClipboardList } from "lucide-react";
import { FloatingTotalQty } from "@/components/FloatingTotalQty";
import { format } from "date-fns";
import { cn, sortSearchResults } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SizeGridDialog } from "@/components/SizeGridDialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDraftSave } from "@/hooks/useDraftSave";
import { DraftResumeDialog } from "@/components/DraftResumeDialog";

interface LineItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  barcode: string;
  orderQty: number;
  purPrice: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode?: string;
  color?: string;
}

const supplierSchema = z.object({
  supplier_name: z.string().trim().min(1, "Supplier name is required").max(100),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

export default function PurchaseOrderEntry() {
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
      purPrice: 0,
      gstPercent: 0,
      lineTotal: 0,
    }))
  );
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [productDisplayLimit, setProductDisplayLimit] = useState(100);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [openSupplierDialog, setOpenSupplierDialog] = useState(false);
  const [termsConditions, setTermsConditions] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("exclusive");
  const tableEndRef = useRef<HTMLDivElement>(null);
  const skipDraftSaveOnUnmountRef = useRef(false);

  // Size grid entry mode
  const [entryMode, setEntryMode] = useState<"grid" | "inline">("inline");
  const [entryModeInitialized, setEntryModeInitialized] = useState(false);
  const [showSizeGrid, setShowSizeGrid] = useState(false);
  const [sizeGridProduct, setSizeGridProduct] = useState<any>(null);
  const [sizeGridVariants, setSizeGridVariants] = useState<any[]>([]);
  const [showDraftDialog, setShowDraftDialog] = useState(false);

  // Draft save hook
  const {
    hasDraft,
    draftData,
    saveDraft,
    deleteDraft,
    updateCurrentData,
    startAutoSave,
    stopAutoSave,
  } = useDraftSave('purchase_order');

  // Load draft data
  const loadDraftData = useCallback((data: any) => {
    if (!data) return;
    setOrderDate(data.orderDate ? new Date(data.orderDate) : new Date());
    setExpectedDelivery(data.expectedDelivery ? new Date(data.expectedDelivery) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setLineItems(data.lineItems || Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`, productId: '', variantId: '', productName: '', size: '', barcode: '',
      orderQty: 0, purPrice: 0, gstPercent: 0, lineTotal: 0,
    })));
    setSelectedSupplierId(data.selectedSupplierId || "");
    setSelectedSupplier(data.selectedSupplier || null);
    setTermsConditions(data.termsConditions || "");
    setNotes(data.notes || "");
    setTaxType(data.taxType || "exclusive");
    // Silent restore - no toast to avoid disturbing user
  }, [toast]);

  // Check for draft on mount
  useEffect(() => {
    if (!location.state?.editOrderId && hasDraft && draftData) {
      setShowDraftDialog(true);
    }
  }, [hasDraft, draftData, location.state?.editOrderId]);

  // Update current data for auto-save
  useEffect(() => {
    const filledItems = lineItems.filter(item => item.productId !== '');
    if (!editingOrderId && filledItems.length > 0) {
      updateCurrentData({
        orderDate: orderDate.toISOString(),
        expectedDelivery: expectedDelivery.toISOString(),
        lineItems,
        selectedSupplierId,
        selectedSupplier,
        termsConditions,
        notes,
        taxType,
      });
    }
  }, [orderDate, expectedDelivery, lineItems, selectedSupplierId, selectedSupplier, termsConditions, notes, taxType, editingOrderId, updateCurrentData]);

  // Start auto-save when not in edit mode
  useEffect(() => {
    if (!editingOrderId && !location.state?.editOrderId) {
      startAutoSave();
    }
    return () => {
      const filledItems = lineItems.filter(item => item.productId !== '');
      if (!skipDraftSaveOnUnmountRef.current && !editingOrderId && filledItems.length > 0) {
        saveDraft({
          orderDate: orderDate.toISOString(),
          expectedDelivery: expectedDelivery.toISOString(),
          lineItems,
          selectedSupplierId,
          selectedSupplier,
          termsConditions,
          notes,
          taxType,
        }, false);
      }
      stopAutoSave();
    };
  }, [editingOrderId, startAutoSave, stopAutoSave, location.state?.editOrderId, lineItems, orderDate, expectedDelivery, selectedSupplierId, selectedSupplier, termsConditions, notes, taxType, saveDraft]);

  // Fetch settings (centralized, cached 5min)
  const { data: settings } = useSettings();

  const supplierForm = useForm<z.infer<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { supplier_name: "", phone: "", email: "", address: "", gst_number: "" },
  });

  // Generate order number
  useEffect(() => {
    const generateOrderNumber = async () => {
      if (!currentOrganization?.id || editingOrderId) return;
      try {
        const { data, error } = await supabase.rpc('generate_purchase_order_number', {
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

  // Fetch suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const allSuppliers: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('suppliers')
          .select('id, supplier_name, phone, email, gst_number, address')
          .eq('organization_id', currentOrganization.id)
          .is('deleted_at', null)
          .order('supplier_name')
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allSuppliers.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      return allSuppliers;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  // Fetch products with pagination
  const { data: productsData } = useQuery({
    queryKey: ['products-with-stock', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const allProducts: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select(`id, product_name, brand, hsn_code, gst_per, product_type, status, category, style, color, size_group_id, uom, product_variants (id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, deleted_at, organization_id)`)
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
      return allProducts.map((product: any) => ({
        ...product,
        product_variants: product.product_variants?.filter((v: any) => !v.deleted_at)
      }));
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  // Initialize entry mode from settings
  useEffect(() => {
    if (settings && !entryModeInitialized) {
      const purchaseSettings = settings.purchase_settings as any;
      if (purchaseSettings?.defaultEntryMode) {
        setEntryMode(purchaseSettings.defaultEntryMode);
      }
      setEntryModeInitialized(true);
    }
  }, [settings, entryModeInitialized]);

  // Load order for editing
  useEffect(() => {
    const state = location.state;
    
    if (state?.orderData) {
      const o = state.orderData;
      setEditingOrderId(o.id);
      setOrderNumber(o.order_number);
      setOrderDate(new Date(o.order_date));
      setExpectedDelivery(o.expected_delivery_date ? new Date(o.expected_delivery_date) : new Date());
      setSelectedSupplierId(o.supplier_id || "");
      setTaxType(o.tax_type || "exclusive");
      setTermsConditions(o.terms_conditions || "");
      setNotes(o.notes || "");
      
      if (o.supplier_id) {
        setSelectedSupplier({
          id: o.supplier_id,
          supplier_name: o.supplier_name,
          phone: o.supplier_phone,
          email: o.supplier_email,
          address: o.supplier_address,
          gst_number: o.supplier_gst,
        });
      }
      
      if (o.purchase_order_items?.length > 0) {
        const items = o.purchase_order_items.map((item: any, i: number) => ({
          id: `row-${i}`,
          productId: item.product_id,
          variantId: item.variant_id,
          productName: item.product_name,
          size: item.size,
          barcode: item.barcode || '',
          orderQty: item.order_qty,
          purPrice: item.unit_price,
          gstPercent: item.gst_percent,
          lineTotal: item.line_total,
          hsnCode: item.hsn_code || '',
          color: item.color || '',
        }));
        while (items.length < 5) {
          items.push({
            id: `row-${items.length}`,
            productId: '', variantId: '', productName: '', size: '', barcode: '',
            orderQty: 0, purPrice: 0, gstPercent: 0, lineTotal: 0, hsnCode: '',
          });
        }
        setLineItems(items);
      }
    }
  }, [location.state, productsData]);

  // Supplier selection
  const handleSupplierChange = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    const supplier = suppliersData?.find((s: any) => s.id === supplierId);
    if (supplier) {
      setSelectedSupplier(supplier);
    }
  };

  // Product search
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  const searchProducts = async (query: string) => {
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    searchAbortControllerRef.current = new AbortController();
    const currentController = searchAbortControllerRef.current;

    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }

    try {
      const { data: matchingProducts } = await supabase
        .from("products")
        .select("id, size_group_id")
        .is("deleted_at", null)
        .or(`product_name.ilike.%${query}%,brand.ilike.%${query}%,style.ilike.%${query}%`);

      if (currentController.signal.aborted) return;

      const productIds = matchingProducts?.map(p => p.id) || [];

      let variantsQuery = supabase
        .from("product_variants")
        .select(`
          id, size, pur_price, sale_price, mrp, barcode, active, color, product_id,
          products (id, product_name, brand, category, style, color, hsn_code, gst_per, default_pur_price)
        `)
        .eq("active", true)
        .is("deleted_at", null);

      if (productIds.length > 0) {
        variantsQuery = variantsQuery.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
      } else {
        variantsQuery = variantsQuery.ilike("barcode", `%${query}%`);
      }

      const { data, error } = await variantsQuery;
      if (currentController.signal.aborted) return;
      if (error) throw error;

      const formattedResults = (data || []).map((v: any) => ({
        variantId: v.id,
        productId: v.products?.id || "",
        productName: v.products?.product_name || "",
        brand: v.products?.brand || "",
        style: v.products?.style || "",
        size: v.size,
        barcode: v.barcode,
        purPrice: v.pur_price || v.products?.default_pur_price || 0,
        gstPercent: v.products?.gst_per || 0,
        hsnCode: v.products?.hsn_code || "",
        color: v.color || v.products?.color || "",
      }));

      const sortedResults = sortSearchResults(
        formattedResults, 
        query, 
        { productName: 'productName', barcode: 'barcode', style: 'style' }
      );
      setSearchResults(sortedResults.slice(0, 100));
      setProductDisplayLimit(100);
    } catch (error) {
      console.error("Product search error:", error);
    }
  };

  const handleProductSelect = (result: any) => {
    const firstEmptyIndex = lineItems.findIndex(item => !item.productId);
    const targetIndex = firstEmptyIndex >= 0 ? firstEmptyIndex : lineItems.length;

    const newItem: LineItem = {
      id: `row-${targetIndex}`,
      productId: result.productId,
      variantId: result.variantId,
      productName: `${result.productName}${result.brand ? ` - ${result.brand}` : ''}${result.style ? ` - ${result.style}` : ''}`,
      size: result.size,
      barcode: result.barcode || '',
      orderQty: 1,
      purPrice: result.purPrice,
      gstPercent: result.gstPercent,
      lineTotal: result.purPrice,
      hsnCode: result.hsnCode,
      color: result.color,
    };

    if (firstEmptyIndex >= 0) {
      const newItems = [...lineItems];
      newItems[firstEmptyIndex] = newItem;
      setLineItems(newItems);
    } else {
      setLineItems([...lineItems, newItem]);
    }

    setSearchInput("");
    setSearchResults([]);
    setOpenProductSearch(false);
  };

  // Calculate line total
  const calculateLineTotal = (item: LineItem) => {
    if (taxType === "exclusive") {
      return item.orderQty * item.purPrice * (1 + item.gstPercent / 100);
    }
    return item.orderQty * item.purPrice;
  };

  // Update line item
  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...lineItems];
    newItems[index] = { ...newItems[index], [field]: value };
    newItems[index].lineTotal = calculateLineTotal(newItems[index]);
    setLineItems(newItems);
  };

  // Remove line item
  const removeLineItem = (index: number) => {
    const newItems = lineItems.filter((_, i) => i !== index);
    if (newItems.length < 5) {
      const emptyRows = Array(5 - newItems.length).fill(null).map((_, i) => ({
        id: `row-${newItems.length + i}`,
        productId: '', variantId: '', productName: '', size: '', barcode: '',
        orderQty: 0, purPrice: 0, gstPercent: 0, lineTotal: 0,
      }));
      setLineItems([...newItems, ...emptyRows]);
    } else {
      setLineItems(newItems);
    }
  };

  // Calculate totals
  const filledItems = lineItems.filter(item => item.productId !== '');
  const grossAmount = filledItems.reduce((sum, item) => sum + (item.orderQty * item.purPrice), 0);
  const gstAmount = taxType === "exclusive"
    ? filledItems.reduce((sum, item) => sum + (item.orderQty * item.purPrice * item.gstPercent / 100), 0)
    : 0;
  const netAmount = grossAmount + gstAmount;

  // Create supplier
  const handleCreateSupplier = async (values: z.infer<typeof supplierSchema>) => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert([{
          organization_id: currentOrganization?.id,
          supplier_name: values.supplier_name,
          phone: values.phone,
          email: values.email,
          address: values.address,
          gst_number: values.gst_number,
        }])
        .select()
        .single();

      if (error) throw error;

      setSelectedSupplierId(data.id);
      setSelectedSupplier(data);
      setOpenSupplierDialog(false);
      supplierForm.reset();
      toast({ title: "Success", description: "Supplier created successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Save order
  const handleSave = async () => {
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const orderData = {
        organization_id: currentOrganization?.id,
        order_number: orderNumber,
        order_date: orderDate.toISOString(),
        expected_delivery_date: expectedDelivery.toISOString().split('T')[0],
        supplier_id: selectedSupplierId || null,
        supplier_name: selectedSupplier?.supplier_name || 'Walk in Supplier',
        supplier_phone: selectedSupplier?.phone || null,
        supplier_email: selectedSupplier?.email || null,
        supplier_address: selectedSupplier?.address || null,
        supplier_gst: selectedSupplier?.gst_number || null,
        gross_amount: grossAmount,
        gst_amount: gstAmount,
        net_amount: netAmount,
        status: 'pending',
        tax_type: taxType,
        terms_conditions: termsConditions,
        notes: notes,
      };

      let orderId: string;

      if (editingOrderId) {
        const { error } = await supabase
          .from('purchase_orders')
          .update(orderData)
          .eq('id', editingOrderId);
        if (error) throw error;
        orderId = editingOrderId;

        // Delete old items and insert new ones
        await supabase.from('purchase_order_items').delete().eq('order_id', editingOrderId);
      } else {
        const { data, error } = await supabase
          .from('purchase_orders')
          .insert([orderData])
          .select()
          .single();
        if (error) throw error;
        orderId = data.id;
      }

      // Insert items
      const itemsToInsert = filledItems.map(item => ({
        order_id: orderId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode,
        color: item.color,
        hsn_code: item.hsnCode,
        order_qty: item.orderQty,
        pending_qty: item.orderQty,
        unit_price: item.purPrice,
        gst_percent: item.gstPercent,
        line_total: item.lineTotal,
      }));

      const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      skipDraftSaveOnUnmountRef.current = true;
      deleteDraft();

      toast({ title: "Success", description: `Purchase Order ${orderNumber} saved successfully` });
      navigate('/purchase-orders');
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <BackToDashboard to="/purchase-orders" label="Purchase Orders" />

      <DraftResumeDialog
        open={showDraftDialog}
        onOpenChange={setShowDraftDialog}
        onResume={() => {
          loadDraftData(draftData);
          setShowDraftDialog(false);
        }}
        onStartFresh={() => {
          deleteDraft();
          setShowDraftDialog(false);
        }}
        draftType="purchase_order"
      />

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            {editingOrderId ? 'Edit Purchase Order' : 'New Purchase Order'}
          </h1>
          <span className="text-lg font-semibold text-primary">{orderNumber}</span>
        </div>

        {/* Header Fields */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          {/* Order Date */}
          <div>
            <Label>Order Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(orderDate, "dd-MM-yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={orderDate} onSelect={(date) => date && setOrderDate(date)} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Expected Delivery */}
          <div>
            <Label>Expected Delivery</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(expectedDelivery, "dd-MM-yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={expectedDelivery} onSelect={(date) => date && setExpectedDelivery(date)} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Supplier */}
          <div>
            <Label>Supplier</Label>
            <div className="flex gap-2">
              <Select value={selectedSupplierId} onValueChange={handleSupplierChange}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select Supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliersData?.map((supplier: any) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.supplier_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => setOpenSupplierDialog(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tax Type */}
          <div>
            <Label>Tax Type</Label>
            <Select value={taxType} onValueChange={(v) => setTaxType(v as "exclusive" | "inclusive")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exclusive">Tax Exclusive</SelectItem>
                <SelectItem value="inclusive">Tax Inclusive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Supplier Info */}
        {selectedSupplier && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-3 bg-muted rounded-md">
            <div>
              <Label className="text-xs text-muted-foreground">Supplier Name</Label>
              <p className="font-medium">{selectedSupplier.supplier_name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <p>{selectedSupplier.phone || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">GST Number</Label>
              <p>{selectedSupplier.gst_number || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Address</Label>
              <p className="truncate">{selectedSupplier.address || '-'}</p>
            </div>
          </div>
        )}

        {/* Product Search */}
        <div className="mb-4">
          <Label>Search Products</Label>
          <div className="relative">
            <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by product name, brand, style, or barcode..."
                    value={searchInput}
                    onChange={(e) => {
                      setSearchInput(e.target.value);
                      searchProducts(e.target.value);
                      setOpenProductSearch(true);
                    }}
                    className="pl-10"
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] p-0" align="start">
                <Command>
                  <CommandList>
                    <CommandEmpty>No products found</CommandEmpty>
                    {searchResults.length > productDisplayLimit && (
                      <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
                        <span>Showing {productDisplayLimit} of {searchResults.length} results</span>
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
                      <ScrollArea className="h-[300px]">
                        {searchResults.slice(0, productDisplayLimit).map((result) => (
                          <CommandItem
                            key={result.variantId}
                            onSelect={() => handleProductSelect(result)}
                            className="cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {result.productName} {result.brand && `- ${result.brand}`} {result.style && `- ${result.style}`}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                Size: {result.size} | Barcode: {result.barcode || '-'} | Price: ₹{result.purPrice}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </ScrollArea>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead className="w-[80px]">Size</TableHead>
                <TableHead className="w-[100px]">Barcode</TableHead>
                <TableHead className="w-[80px]">Qty</TableHead>
                <TableHead className="w-[100px]">Price</TableHead>
                <TableHead className="w-[80px]">GST %</TableHead>
                <TableHead className="w-[120px]">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    <Input
                      value={item.productName}
                      readOnly
                      placeholder="Search to add product"
                      className="bg-muted"
                    />
                  </TableCell>
                  <TableCell>{item.size}</TableCell>
                  <TableCell>{item.barcode}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      value={item.orderQty || ''}
                      onChange={(e) => updateLineItem(index, 'orderQty', parseInt(e.target.value) || 0)}
                      disabled={!item.productId}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.purPrice || ''}
                      onChange={(e) => updateLineItem(index, 'purPrice', parseFloat(e.target.value) || 0)}
                      disabled={!item.productId}
                    />
                  </TableCell>
                  <TableCell>{item.gstPercent}%</TableCell>
                  <TableCell className="font-medium">₹{item.lineTotal.toFixed(2)}</TableCell>
                  <TableCell>
                    {item.productId && (
                      <Button variant="ghost" size="icon" onClick={() => removeLineItem(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div ref={tableEndRef} />
        </div>

        {/* Add Row Button */}
        <Button
          variant="outline"
          className="mt-2"
          onClick={() => setLineItems([...lineItems, {
            id: `row-${lineItems.length}`,
            productId: '', variantId: '', productName: '', size: '', barcode: '',
            orderQty: 0, purPrice: 0, gstPercent: 0, lineTotal: 0,
          }])}
        >
          <Plus className="h-4 w-4 mr-2" /> Add Row
        </Button>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-sm space-y-2">
            <div className="flex justify-between">
              <span>Gross Amount:</span>
              <span className="font-medium">₹{grossAmount.toFixed(2)}</span>
            </div>
            {taxType === "exclusive" && (
              <div className="flex justify-between">
                <span>GST Amount:</span>
                <span className="font-medium">₹{gstAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Net Amount:</span>
              <span>₹{netAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={3}
            />
          </div>
          <div>
            <Label>Terms & Conditions</Label>
            <Textarea
              value={termsConditions}
              onChange={(e) => setTermsConditions(e.target.value)}
              placeholder="Terms and conditions..."
              rows={3}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/purchase-orders')}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Order'}
          </Button>
        </div>
      </Card>

      {/* Create Supplier Dialog */}
      <Dialog open={openSupplierDialog} onOpenChange={setOpenSupplierDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Supplier</DialogTitle>
          </DialogHeader>
          <Form {...supplierForm}>
            <form onSubmit={supplierForm.handleSubmit(handleCreateSupplier)} className="space-y-4">
              <FormField
                control={supplierForm.control}
                name="supplier_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierForm.control}
                name="gst_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpenSupplierDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Supplier</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Floating Total Quantity Badge */}
      <FloatingTotalQty 
        totalQty={lineItems.reduce((sum, item) => sum + item.orderQty, 0)} 
        itemCount={lineItems.filter(i => i.productId).length}
      />
    </div>
  );
}
