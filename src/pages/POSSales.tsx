import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scan, X, Plus, Trash2, Banknote, CreditCard, Smartphone, Printer, ChevronLeft, ChevronRight, FileText, RotateCcw, Check } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useToast } from "@/hooks/use-toast";
import { useSaveSale } from "@/hooks/useSaveSale";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InvoicePrint } from "@/components/InvoicePrint";

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  quantity: number;
  mrp: number;
  gstPer: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
}

export default function POSSales() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { saveSale, isSaving } = useSaveSale();
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("Walk in Customer");
  const [searchInput, setSearchInput] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [flatDiscountPercent, setFlatDiscountPercent] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState(0);
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [currentInvoiceNumber, setCurrentInvoiceNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'multiple' | 'pay_later'>('cash');
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch settings to apply defaults
  const { data: settingsData } = useQuery({
    queryKey: ['pos-settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data, error } = await supabase
        .from('settings' as any)
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Keyboard shortcuts for POS actions
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // F1 - Cash Payment
      if (e.key === 'F1') {
        e.preventDefault();
        setPaymentMethod('cash');
      }
      // F2 - Card Payment
      else if (e.key === 'F2') {
        e.preventDefault();
        setPaymentMethod('card');
      }
      // F3 - UPI Payment
      else if (e.key === 'F3') {
        e.preventDefault();
        setPaymentMethod('upi');
      }
      // Esc - Clear items
      else if (e.key === 'Escape') {
        e.preventDefault();
        handleClearAll();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [items, customerName, flatDiscountPercent, roundOff, paymentMethod]);

  // Apply defaults when settings are loaded
  useEffect(() => {
    if (settingsData && (settingsData as any).sale_settings) {
      const saleSettings = (settingsData as any).sale_settings;
      if (saleSettings.default_discount) {
        setFlatDiscountPercent(saleSettings.default_discount);
      }
      if (saleSettings.default_payment_method) {
        setPaymentMethod(saleSettings.default_payment_method.toLowerCase() as any);
      }
    }
  }, [settingsData]);

  // Fetch today's sales
  const { data: todaysSales } = useQuery({
    queryKey: ['todays-sales', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await (supabase as any)
        .from('sales')
        .select(`
          *,
          sale_items (*)
        `)
        .eq('organization_id', currentOrganization.id)
        .gte('sale_date', today.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch all products with variants and batch stock (only with available stock)
  const { data: productsData } = useQuery({
    queryKey: ['pos-products', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select(`
          *,
          product_variants (
            *,
            batch_stock (
              bill_number,
              quantity,
              purchase_date
            )
          )
        `)
        .eq('organization_id', currentOrganization.id)
        .eq('status', 'active');
      
      if (productsError) throw productsError;
      
      // Filter out products with no variants or all variants with stock_qty <= 0
      return products?.filter((product: any) => {
        const hasAvailableStock = product.product_variants?.some((v: any) => v.stock_qty > 0);
        return hasAvailableStock;
      }).map((product: any) => ({
        ...product,
        product_variants: product.product_variants?.filter((v: any) => v.stock_qty > 0)
      })) || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("customer_name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Handle barcode/product search on Enter
  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      searchAndAddProduct(searchInput.trim());
    }
  };

  const searchAndAddProduct = (searchTerm: string) => {
    if (!productsData) return;

    // Search by barcode or product name
    let foundVariant: any = null;
    let foundProduct: any = null;

    for (const product of productsData) {
      // Check variants for barcode match
      const variantMatch = product.product_variants?.find((v: any) => 
        v.barcode?.toLowerCase() === searchTerm.toLowerCase()
      );
      
      if (variantMatch) {
        foundVariant = variantMatch;
        foundProduct = product;
        break;
      }

      // Check product name match
      if (product.product_name.toLowerCase().includes(searchTerm.toLowerCase())) {
        // Get first available variant
        foundVariant = product.product_variants?.[0];
        foundProduct = product;
        break;
      }
    }

    if (foundVariant && foundProduct) {
      addItemToCart(foundProduct, foundVariant);
      setSearchInput("");
    } else {
      toast({
        title: "Product not found",
        description: "No product matches your search.",
        variant: "destructive",
      });
    }
  };

  const addItemToCart = (product: any, variant: any) => {
    const existingItemIndex = items.findIndex(item => item.barcode === variant.barcode);
    
    if (existingItemIndex >= 0) {
      // Increment quantity if already in cart
      const updatedItems = [...items];
      updatedItems[existingItemIndex].quantity += 1;
      updatedItems[existingItemIndex].netAmount = calculateNetAmount(updatedItems[existingItemIndex]);
      setItems(updatedItems);
    } else {
      // Build product description: name-category-style,brand-color
      const descriptionParts = [product.product_name];
      if (product.category) descriptionParts.push(product.category);
      if (product.style) descriptionParts.push(product.style);
      
      let description = descriptionParts.join('-');
      
      const extraParts = [];
      if (product.brand) extraParts.push(product.brand);
      if (product.color) extraParts.push(product.color);
      
      if (extraParts.length > 0) {
        description += ',' + extraParts.join('-');
      }
      
      // Add new item
      const newItem: CartItem = {
        id: variant.id,
        barcode: variant.barcode || '',
        productName: description,
        size: variant.size,
        quantity: 1,
        mrp: parseFloat(variant.sale_price || 0),
        gstPer: product.gst_per || 0,
        discountPercent: 0,
        discountAmount: 0,
        unitCost: parseFloat(variant.sale_price || 0),
        netAmount: parseFloat(variant.sale_price || 0),
        productId: product.id,
        variantId: variant.id,
      };
      setItems([...items, newItem]);
    }
    
    // Close search dropdown and clear input
    setOpenProductSearch(false);
    setSearchInput("");
  };

  const calculateNetAmount = (item: CartItem) => {
    const baseAmount = item.mrp * item.quantity;
    const percentDiscount = (baseAmount * item.discountPercent) / 100;
    const totalDiscount = percentDiscount + item.discountAmount;
    return baseAmount - totalDiscount;
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, newQty: number) => {
    if (newQty < 1) return;
    const updatedItems = [...items];
    updatedItems[index].quantity = newQty;
    updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
    setItems(updatedItems);
  };

  const updateDiscountPercent = (index: number, discountPercent: number) => {
    if (discountPercent < 0 || discountPercent > 100) return;
    const updatedItems = [...items];
    updatedItems[index].discountPercent = discountPercent;
    updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
    setItems(updatedItems);
  };

  const updateDiscountAmount = (index: number, discountAmount: number) => {
    if (discountAmount < 0) return;
    const updatedItems = [...items];
    updatedItems[index].discountAmount = discountAmount;
    updatedItems[index].netAmount = calculateNetAmount(updatedItems[index]);
    setItems(updatedItems);
  };

  // Calculate totals
  const totals = {
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    mrp: items.reduce((sum, item) => sum + (item.mrp * item.quantity), 0),
    discount: items.reduce((sum, item) => {
      const baseAmount = item.mrp * item.quantity;
      const percentDiscount = (baseAmount * item.discountPercent) / 100;
      return sum + percentDiscount + item.discountAmount;
    }, 0),
    subtotal: items.reduce((sum, item) => sum + item.netAmount, 0),
  };

  const flatDiscountAmount = (totals.subtotal * flatDiscountPercent) / 100;
  const finalAmount = totals.subtotal - flatDiscountAmount + roundOff;

  // Handle save sale
  const handleSaveSale = async (forcePaymentMethod?: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later') => {
    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to the cart before saving",
        variant: "destructive",
      });
      return;
    }

    const saleData = {
      customerId: customerId || null,
      customerName,
      items,
      grossAmount: totals.mrp,
      discountAmount: totals.discount,
      flatDiscountPercent,
      flatDiscountAmount,
      roundOff,
      netAmount: finalAmount,
    };

    const result = await saveSale(saleData, forcePaymentMethod || paymentMethod);
    
    if (result) {
      // Store invoice number for printing
      setCurrentInvoiceNumber(result.sale_number);
      
      // Refetch today's sales to include the new invoice
      await queryClient.invalidateQueries({ queryKey: ['todays-sales', currentOrganization?.id] });
      
      // Reset to show the newly saved invoice (index 0, as sales are sorted by created_at desc)
      setCurrentInvoiceIndex(0);
      setCurrentSaleId(result.id);
      
      toast({
        title: "Sale Saved",
        description: `Invoice ${result.sale_number} saved successfully`,
      });
      
      // Clear cart on success
      setItems([]);
      setCustomerId("");
      setCustomerName("Walk in Customer");
      setFlatDiscountPercent(0);
      setRoundOff(0);
      setSearchInput("");
    }
  };

  const handlePaymentMethodChange = (method: 'cash' | 'card' | 'upi') => {
    setPaymentMethod(method);
    toast({
      title: "Payment Method Selected",
      description: `${method.toUpperCase()} payment selected`,
    });
  };

  const handlePrint = () => {
    if (items.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to the cart before printing",
        variant: "destructive",
      });
      return;
    }
    
    setShowPrintDialog(true);
  };

  const handlePrintInvoice = () => {
    if (printRef.current) {
      const printContent = printRef.current;
      const windowPrint = window.open('', '', 'width=800,height=600');
      
      if (windowPrint) {
        windowPrint.document.write('<html><head><title>Print Invoice</title>');
        windowPrint.document.write('<style>');
        windowPrint.document.write(`
          body { margin: 0; padding: 0; }
          @media print {
            @page { size: A5 portrait; margin: 0; }
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        `);
        windowPrint.document.write('</style></head><body>');
        windowPrint.document.write(printContent.innerHTML);
        windowPrint.document.write('</body></html>');
        windowPrint.document.close();
        windowPrint.focus();
        
        setTimeout(() => {
          windowPrint.print();
          windowPrint.close();
        }, 250);
      }
    }
  };

  const loadInvoice = (sale: any) => {
    if (!sale || !sale.sale_items) return;

    // Load customer info
    setCustomerName(sale.customer_name || "Walk in Customer");
    
    // Load items from sale_items
    const loadedItems: CartItem[] = sale.sale_items.map((item: any) => ({
      id: item.variant_id,
      barcode: item.barcode || '',
      productName: item.product_name,
      size: item.size,
      quantity: item.quantity,
      mrp: Number(item.mrp),
      gstPer: item.gst_percent,
      discountPercent: Number(item.discount_percent),
      discountAmount: 0,
      unitCost: Number(item.unit_price),
      netAmount: Number(item.line_total),
      productId: item.product_id,
      variantId: item.variant_id,
    }));

    setItems(loadedItems);
    setFlatDiscountPercent(Number(sale.flat_discount_percent) || 0);
    setRoundOff(Number(sale.round_off) || 0);
    setCurrentSaleId(sale.id);

    toast({
      title: "Invoice Loaded",
      description: `Invoice #${sale.sale_number} loaded successfully`,
    });
  };

  const handleDeleteInvoice = async () => {
    if (!currentSaleId) {
      toast({
        title: "No Invoice Loaded",
        description: "Please load an invoice first",
        variant: "destructive",
      });
      return;
    }

    try {
      // Fetch sale items to reverse stock
      const { data: saleItems, error: itemsError } = await (supabase as any)
        .from('sale_items')
        .select('*')
        .eq('sale_id', currentSaleId);

      if (itemsError) throw itemsError;

      // Reverse stock for each item
      for (const item of saleItems) {
        // Get current stock
        const { data: variant, error: variantError } = await (supabase as any)
          .from('product_variants')
          .select('stock_qty')
          .eq('id', item.variant_id)
          .single();

        if (variantError) throw variantError;

        // Add stock back
        const { error: stockError } = await (supabase as any)
          .from('product_variants')
          .update({ 
            stock_qty: variant.stock_qty + item.quantity
          })
          .eq('id', item.variant_id);

        if (stockError) throw stockError;

        // Create stock movement record
        const { error: movementError } = await (supabase as any)
          .from('stock_movements')
          .insert({
            variant_id: item.variant_id,
            movement_type: 'adjustment',
            quantity: item.quantity,
            reference_id: currentSaleId,
            notes: 'Stock restored due to sale deletion',
          });

        if (movementError) throw movementError;
      }

      // Delete sale items
      const { error: deleteItemsError } = await (supabase as any)
        .from('sale_items')
        .delete()
        .eq('sale_id', currentSaleId);

      if (deleteItemsError) throw deleteItemsError;

      // Delete sale
      const { error: deleteSaleError } = await (supabase as any)
        .from('sales')
        .delete()
        .eq('id', currentSaleId);

      if (deleteSaleError) throw deleteSaleError;

      toast({
        title: "Invoice Deleted",
        description: "Invoice has been deleted and stock has been restored",
      });

      handleNewInvoice();
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      toast({
        title: "Error Deleting Invoice",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handlePreviousInvoice = () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast({
        title: "No Invoices",
        description: "No invoices found for today",
        variant: "destructive",
      });
      return;
    }

    const newIndex = currentInvoiceIndex > 0 ? currentInvoiceIndex - 1 : todaysSales.length - 1;
    setCurrentInvoiceIndex(newIndex);
    loadInvoice(todaysSales[newIndex]);
  };

  const handleNextInvoice = () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast({
        title: "No Invoices",
        description: "No invoices found for today",
        variant: "destructive",
      });
      return;
    }

    const newIndex = currentInvoiceIndex < todaysSales.length - 1 ? currentInvoiceIndex + 1 : 0;
    setCurrentInvoiceIndex(newIndex);
    loadInvoice(todaysSales[newIndex]);
  };

  const handleLastInvoice = () => {
    if (!todaysSales || todaysSales.length === 0) {
      toast({
        title: "No Invoices",
        description: "No invoices found for today",
        variant: "destructive",
      });
      return;
    }

    setCurrentInvoiceIndex(0);
    loadInvoice(todaysSales[0]);
  };

  const handleClearAll = () => {
    if (items.length === 0) {
      toast({
        title: "Cart is already empty",
        variant: "default",
      });
      return;
    }
    
    setItems([]);
    setCustomerName("Walk in Customer");
    setCustomerId("");
    setFlatDiscountPercent(0);
    setRoundOff(0);
    setSearchInput("");
    
    toast({
      title: "Cart Cleared",
      description: "All items removed from cart",
    });
  };

  const handleNewInvoice = () => {
    setItems([]);
    setCustomerName("Walk in Customer");
    setFlatDiscountPercent(0);
    setRoundOff(0);
    setSearchInput("");
    setCurrentInvoiceIndex(0);
    setCurrentSaleId(null);
    
    toast({
      title: "New Invoice",
      description: "Cart cleared. Ready for new sale.",
    });
  };

  // Filter products based on search input
  const filteredProducts = productsData?.flatMap(product => 
    product.product_variants?.map((variant: any) => ({
      product,
      variant,
      searchText: `${product.product_name} ${variant.size} ${variant.barcode || ''} ${product.brand || ''} ${product.category || ''}`.toLowerCase()
    })).filter((item: any) => 
      item.searchText.includes(searchInput.toLowerCase())
    ) || []
  ) || [];

  return (
    <div className="min-h-screen w-full bg-background flex">
      {/* Left Action Button Bar */}
      <div className="w-20 bg-gradient-to-b from-primary/10 to-secondary/10 border-r flex flex-col gap-2 p-2">
        <Button
          onClick={handleNewInvoice}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs"
          title="New Invoice"
        >
          <FileText className="h-5 w-5" />
          <span>New</span>
        </Button>
        
        <Button
          onClick={() => handleSaveSale('pay_later')}
          disabled={items.length === 0 || isSaving}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-xs disabled:opacity-50"
          title="Credit Sale"
        >
          <Check className="h-5 w-5" />
          <span>Credit</span>
        </Button>

        <Button
          onClick={handleLastInvoice}
          disabled={!todaysSales || todaysSales.length === 0}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs disabled:opacity-50"
          title="Last Invoice"
        >
          <RotateCcw className="h-5 w-5" />
          <span>Last</span>
        </Button>

        <Button
          onClick={handleDeleteInvoice}
          disabled={!currentSaleId}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs disabled:opacity-50"
          title="Delete Invoice"
        >
          <Trash2 className="h-5 w-5" />
          <span>Delete</span>
        </Button>

        <Button
          onClick={handlePrint}
          disabled={!currentSaleId}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-gray-600 hover:bg-gray-700 text-white text-xs disabled:opacity-50"
          title="Print"
        >
          <Printer className="h-5 w-5" />
          <span>Print</span>
        </Button>
        
        <Button
          onClick={handleClearAll}
          className="h-16 flex flex-col items-center justify-center gap-1 bg-orange-600 hover:bg-orange-700 text-white text-xs relative"
          title="Clear (Esc)"
        >
          <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">ESC</Badge>
          <X className="h-5 w-5" />
          <span>Clear</span>
        </Button>
        
        {/* Payment Method Buttons */}
        <div className="mt-auto space-y-2">
          <div className="text-[10px] text-center text-muted-foreground px-1 mb-1">Payment</div>
          <Button
            onClick={() => handlePaymentMethodChange('cash')}
            variant={paymentMethod === 'cash' ? 'default' : 'outline'}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full"
            title="Cash (F1)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F1</Badge>
            <Banknote className="h-4 w-4" />
            <span>Cash</span>
          </Button>
          <Button
            onClick={() => handlePaymentMethodChange('card')}
            variant={paymentMethod === 'card' ? 'default' : 'outline'}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full"
            title="Card (F2)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F2</Badge>
            <CreditCard className="h-4 w-4" />
            <span>Card</span>
          </Button>
          <Button
            onClick={() => handlePaymentMethodChange('upi')}
            variant={paymentMethod === 'upi' ? 'default' : 'outline'}
            className="h-14 flex flex-col items-center justify-center gap-1 text-xs relative w-full"
            title="UPI (F3)"
          >
            <Badge className="absolute top-1 right-1 h-4 px-1 text-[9px] bg-black/40 hover:bg-black/40">F3</Badge>
            <Smartphone className="h-4 w-4" />
            <span>UPI</span>
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-2 md:p-4">
        <BackToDashboard />
        
        <div className="max-w-[1800px] mx-auto space-y-3">
          {/* Header Section with Invoice Number */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Input
                  placeholder="Scan Barcode/Enter Product Name"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setOpenProductSearch(true);
                  }}
                  onKeyDown={handleSearch}
                  className="h-12 text-lg pr-12"
                  autoFocus
                />
                <Scan className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 z-50" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search by name, barcode, brand..." 
                  value={searchInput}
                  onValueChange={setSearchInput}
                />
                <CommandList>
                  <CommandEmpty>No products found.</CommandEmpty>
                  <CommandGroup heading="Products">
                    {filteredProducts.slice(0, 10).map((item: any, index: number) => {
                      const product = item.product;
                      const descriptionParts = [product.product_name];
                      if (product.category) descriptionParts.push(product.category);
                      if (product.style) descriptionParts.push(product.style);
                      
                      let displayName = descriptionParts.join('-');
                      
                      const extraParts = [];
                      if (product.brand) extraParts.push(product.brand);
                      if (product.color) extraParts.push(product.color);
                      
                      if (extraParts.length > 0) {
                        displayName += ',' + extraParts.join('-');
                      }
                      
                      return (
                        <CommandItem
                          key={`${product.id}-${item.variant.id}-${index}`}
                          value={item.searchText}
                          onSelect={() => {
                            addItemToCart(product, item.variant);
                          }}
                          className="cursor-pointer"
                        >
                           <Check className="mr-2 h-4 w-4 opacity-0" />
                          <div className="flex flex-col flex-1">
                            <span className="font-medium">{displayName}</span>
                            <span className="text-sm text-muted-foreground">
                              Size: {item.variant.size} | 
                              {item.variant.barcode && ` Barcode: ${item.variant.barcode} | `}
                              Price: ₹{item.variant.sale_price} | 
                              Stock: {item.variant.stock_qty}
                            </span>
                            {item.variant.batch_stock && item.variant.batch_stock.length > 0 && (
                              <span className="text-xs text-muted-foreground mt-1">
                                <span className="font-semibold">Bills: </span>
                                {item.variant.batch_stock
                                  .slice(0, 3)
                                  .map((batch: any, idx: number) => (
                                    <span key={batch.bill_number} className="font-mono">
                                      {batch.bill_number}({batch.quantity})
                                      {idx < Math.min(item.variant.batch_stock.length - 1, 2) ? ', ' : ''}
                                    </span>
                                  ))}
                                {item.variant.batch_stock.length > 3 && (
                                  <span> +{item.variant.batch_stock.length - 3} more</span>
                                )}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Input
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setOpenCustomerSearch(true);
                  }}
                  className="h-12 text-lg pr-20"
                  placeholder="Select or enter customer"
                />
                {customerName !== "Walk in Customer" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-10 top-1/2 -translate-y-1/2 h-9 w-9"
                    onClick={() => {
                      setCustomerName("Walk in Customer");
                      setCustomerId("");
                    }}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9"
                  onClick={() => window.open('/customers', '_blank')}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 z-50" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search customers..." 
                  value={customerName}
                  onValueChange={setCustomerName}
                />
                <CommandList>
                  <CommandEmpty>No customers found.</CommandEmpty>
                  <CommandGroup heading="Customers">
                    {customers
                      .filter(c => 
                        c.customer_name.toLowerCase().includes(customerName.toLowerCase()) ||
                        c.phone?.toLowerCase().includes(customerName.toLowerCase()) ||
                        c.email?.toLowerCase().includes(customerName.toLowerCase())
                      )
                      .slice(0, 10)
                      .map((customer) => (
                        <CommandItem
                          key={customer.id}
                          value={customer.customer_name}
                          onSelect={() => {
                            setCustomerId(customer.id);
                            setCustomerName(customer.customer_name);
                            setOpenCustomerSearch(false);
                          }}
                          className="cursor-pointer"
                        >
                          <Check className="mr-2 h-4 w-4 opacity-0" />
                          <div className="flex flex-col">
                            <span className="font-medium">{customer.customer_name}</span>
                            <span className="text-sm text-muted-foreground">
                              {customer.phone && `Phone: ${customer.phone}`}
                              {customer.email && ` | Email: ${customer.email}`}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          {/* Invoice Number Display */}
          <div className="relative">
            <Input
              value={currentInvoiceNumber || "NEW"}
              readOnly
              className="h-12 text-lg font-semibold text-center bg-gradient-to-r from-primary/10 to-secondary/10"
              placeholder="Invoice #"
            />
          </div>
          
          {/* Running Total Display - Split into 2 boxes */}
          <div className="relative h-12 bg-gradient-to-r from-green-600 to-emerald-600 rounded-md px-4 flex items-center justify-center">
            <div className="text-white font-bold text-xl">
              ₹{finalAmount.toFixed(2)}
            </div>
          </div>
          
          <div className="relative h-12 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-md px-4 flex items-center justify-center">
            <div className="text-white font-semibold text-base">
              {items.length} {items.length === 1 ? 'Item' : 'Items'}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={handlePreviousInvoice}
              variant="outline"
              size="sm"
              className="h-12"
              disabled={!todaysSales || todaysSales.length === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              onClick={handleNextInvoice}
              variant="outline"
              size="sm"
              className="h-12"
              disabled={!todaysSales || todaysSales.length === 0}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-hidden flex flex-col p-4 pb-0">
          <Card className="flex-1 overflow-hidden flex flex-col mb-32">
            <div className="bg-black text-white overflow-x-auto">
              <div className="min-w-[1100px] grid grid-cols-13 gap-2 p-4 text-base font-medium">
                <div className="col-span-1">Sr No</div>
                <div className="col-span-1">Barcode</div>
                <div className="col-span-3">Product</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">MRP</div>
                <div className="col-span-1">Tax%</div>
                <div className="col-span-1">Disc%</div>
                <div className="col-span-1">Disc Rs</div>
                <div className="col-span-1">Unit Price</div>
                <div className="col-span-2">Net Amount</div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="overflow-x-auto">
                {items.length === 0 ? (
                  // Show 6 blank rows with serial numbers
                  Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="min-w-[1100px] grid grid-cols-13 gap-2 p-4 border-b text-base">
                      <div className="col-span-1 flex items-center text-muted-foreground">{index + 1}</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-3 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-1 flex items-center text-muted-foreground">-</div>
                      <div className="col-span-2 flex items-center text-muted-foreground">-</div>
                    </div>
                  ))
                ) : (
                  items.map((item, index) => (
                    <div key={index} className="min-w-[1100px] grid grid-cols-13 gap-2 p-4 border-b hover:bg-muted/50 text-base">
                      <div className="col-span-1 flex items-center font-semibold">{index + 1}</div>
                      <div className="col-span-1 flex items-center">{item.barcode}</div>
                      <div className="col-span-3 flex items-center font-medium">{item.productName}</div>
                      <div className="col-span-1">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(index, parseInt(e.target.value) || 1)}
                          className="h-9 text-base"
                          min="1"
                        />
                      </div>
                      <div className="col-span-1 flex items-center">₹{item.mrp.toFixed(2)}</div>
                      <div className="col-span-1 flex items-center">{item.gstPer}%</div>
                      <div className="col-span-1">
                        <Input
                          type="number"
                          value={item.discountPercent}
                          onChange={(e) => updateDiscountPercent(index, parseFloat(e.target.value) || 0)}
                          className="h-9 text-base"
                          min="0"
                          max="100"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-1">
                        <Input
                          type="number"
                          value={item.discountAmount}
                          onChange={(e) => updateDiscountAmount(index, parseFloat(e.target.value) || 0)}
                          className="h-9 text-base"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-1 flex items-center">₹{item.unitCost.toFixed(2)}</div>
                      <div className="col-span-2 flex items-center justify-between">
                        <span className="font-semibold">₹{item.netAmount.toFixed(2)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeItem(index)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                ))
              )}
            </div>
          </div>
        </Card>
        </div>

        {/* Totals Section - Fixed at Bottom */}
        <div className="fixed bottom-0 left-20 right-0 bg-cyan-500 text-white p-4 shadow-lg z-10">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold">{totals.quantity}</div>
              <div className="text-xs md:text-sm mt-1">Quantity</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold">₹{totals.mrp.toFixed(2)}</div>
              <div className="text-xs md:text-sm mt-1">MRP</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold">₹0.00</div>
              <div className="text-xs md:text-sm mt-1">Add. Charges</div>
            </div>
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold">₹{totals.discount.toFixed(2)}</div>
              <div className="text-xs md:text-sm mt-1">Discount</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="bg-black text-white px-2 py-1 text-sm rounded">%</span>
                <Input 
                  type="number"
                  className="w-16 h-8 bg-white text-black text-center text-base font-semibold" 
                  value={flatDiscountPercent}
                  onChange={(e) => setFlatDiscountPercent(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="text-xs md:text-sm mt-1">Flat Discount</div>
            </div>
            <div className="text-center">
              <Input 
                type="number"
                className="w-20 h-8 bg-white text-black text-center text-base font-semibold mx-auto" 
                value={roundOff}
                onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                step="0.01"
              />
              <div className="text-xs md:text-sm mt-1">Round OFF</div>
            </div>
            <div className="text-center col-span-2 md:col-span-1">
              <div className="text-2xl md:text-3xl font-bold">₹{finalAmount.toFixed(2)}</div>
              <div className="text-xs md:text-sm mt-1">Amount</div>
            </div>
          </div>
        </div>
        </div>

        {/* Print Dialog */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice Preview</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <InvoicePrint
                ref={printRef}
                billNo={currentInvoiceNumber || "DRAFT"}
                date={new Date()}
                customerName={customerName}
                customerAddress=""
                customerMobile=""
                items={items.map((item, index) => ({
                  sr: index + 1,
                  particulars: item.productName,
                  size: item.size,
                  barcode: item.barcode,
                  hsn: "",
                  sp: item.size ? parseInt(item.size) || 1 : 1,
                  qty: item.quantity,
                  rate: item.mrp,
                  total: item.netAmount,
                }))}
                subTotal={totals.subtotal}
                discount={totals.discount + flatDiscountAmount}
                grandTotal={finalAmount}
                tenderAmount={finalAmount}
                cashPaid={0}
                refundCash={0}
                upiPaid={0}
                paymentMethod={paymentMethod}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPrintDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handlePrintInvoice} className="bg-primary">
                  <Printer className="mr-2 h-4 w-4" />
                  Print Invoice
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
