import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  size: string;
  quantity: number;
  mrp: number;
  gstPer: number;
  discount: number;
  unitCost: number;
  netAmount: number;
  productId: string;
  variantId: string;
}

export default function POSSales() {
  const { toast } = useToast();
  const { saveSale, isSaving } = useSaveSale();
  const [customerName, setCustomerName] = useState("Walk in Customer");
  const [searchInput, setSearchInput] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [flatDiscountPercent, setFlatDiscountPercent] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [currentInvoiceIndex, setCurrentInvoiceIndex] = useState(0);
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);

  // Fetch today's sales
  const { data: todaysSales } = useQuery({
    queryKey: ['todays-sales'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await (supabase as any)
        .from('sales')
        .select(`
          *,
          sale_items (*)
        `)
        .gte('sale_date', today.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all products with variants
  const { data: productsData } = useQuery({
    queryKey: ['pos-products'],
    queryFn: async () => {
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*, product_variants(*)');
      
      if (productsError) throw productsError;
      return products;
    },
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
        discount: 0,
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
    const discountAmount = (baseAmount * item.discount) / 100;
    return baseAmount - discountAmount;
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

  // Calculate totals
  const totals = {
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    mrp: items.reduce((sum, item) => sum + (item.mrp * item.quantity), 0),
    discount: items.reduce((sum, item) => sum + ((item.mrp * item.quantity * item.discount) / 100), 0),
    subtotal: items.reduce((sum, item) => sum + item.netAmount, 0),
  };

  const flatDiscountAmount = (totals.subtotal * flatDiscountPercent) / 100;
  const finalAmount = totals.subtotal - flatDiscountAmount + roundOff;

  // Handle payment
  const handlePayment = async (paymentMethod: 'cash' | 'card' | 'upi' | 'multiple' | 'pay_later') => {
    const saleData = {
      customerName,
      items,
      grossAmount: totals.mrp,
      discountAmount: totals.discount,
      flatDiscountPercent,
      flatDiscountAmount,
      roundOff,
      netAmount: finalAmount,
    };

    const result = await saveSale(saleData, paymentMethod);
    
    if (result) {
      // Clear cart on success
      setItems([]);
      setCustomerName("Walk in Customer");
      setFlatDiscountPercent(0);
      setRoundOff(0);
      setSearchInput("");
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
      discount: Number(item.discount_percent),
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

  const actionButtons = [
    {
      label: "New Invoice",
      icon: FileText,
      onClick: handleNewInvoice,
      className: "bg-cyan-600 hover:bg-cyan-700",
      shortcut: "F1",
      type: "action"
    },
    {
      label: "Last Invoice",
      icon: RotateCcw,
      onClick: handleLastInvoice,
      className: "bg-indigo-600 hover:bg-indigo-700",
      shortcut: "F2",
      type: "action"
    },
    ...(currentSaleId ? [{
      label: "Delete Invoice",
      icon: Trash2,
      onClick: handleDeleteInvoice,
      className: "bg-red-600 hover:bg-red-700",
      shortcut: "Del",
      type: "action"
    }] : []),
  ];

  const paymentButtons = [
    {
      label: "Cash Paid",
      icon: Banknote,
      onClick: () => handlePayment('cash'),
      className: "bg-green-600 hover:bg-green-700",
      shortcut: "F4",
      type: "payment"
    },
    {
      label: "Card Paid",
      icon: CreditCard,
      onClick: () => handlePayment('card'),
      className: "bg-blue-600 hover:bg-blue-700",
      shortcut: "F5",
      type: "payment"
    },
    {
      label: "UPI Paid",
      icon: Smartphone,
      onClick: () => handlePayment('upi'),
      className: "bg-purple-600 hover:bg-purple-700",
      shortcut: "F6",
      type: "payment"
    },
    {
      label: "Multi Pay",
      icon: CreditCard,
      onClick: () => handlePayment('multiple'),
      className: "bg-orange-600 hover:bg-orange-700",
      shortcut: "F7",
      type: "payment"
    },
    {
      label: "Print",
      icon: Printer,
      onClick: () => {
        toast({
          title: "Print",
          description: "Print functionality coming soon",
        });
      },
      className: "bg-gray-600 hover:bg-gray-700",
      shortcut: "F8",
      type: "action"
    },
  ];

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        {/* Left Sidebar with Action and Payment Buttons */}
        <Sidebar className="border-r">
          <SidebarContent>
            {/* Action Buttons Section */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-lg font-semibold px-4 py-3">
                Actions
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {actionButtons.map((button) => (
                    <SidebarMenuItem key={button.label}>
                      <SidebarMenuButton
                        onClick={button.onClick}
                        disabled={button.label === "Last Invoice" && (!todaysSales || todaysSales.length === 0)}
                        className={`h-16 ${button.className} text-white hover:text-white disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <button.icon className="h-6 w-6" />
                        <div className="flex flex-col items-start">
                          <span className="text-base font-medium">{button.label}</span>
                          <span className="text-xs opacity-75">{button.shortcut}</span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Payment Buttons Section */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-lg font-semibold px-4 py-3">
                Payment Options
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {paymentButtons.map((button) => (
                    <SidebarMenuItem key={button.label}>
                      <SidebarMenuButton
                        onClick={button.onClick}
                        disabled={button.type === "payment" && (items.length === 0 || isSaving)}
                        className={`h-16 ${button.className} text-white hover:text-white disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <button.icon className="h-6 w-6" />
                        <div className="flex flex-col items-start">
                          <span className="text-base font-medium">{button.label}</span>
                          <span className="text-xs opacity-75">{button.shortcut}</span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        {/* Main Content */}
        <div className="flex-1 p-2 md:p-4">
          <BackToDashboard />
          
          <div className="max-w-[1800px] mx-auto space-y-3">
        {/* Header Section - Larger inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                          <div className="flex flex-col">
                            <span className="font-medium">{displayName}</span>
                            <span className="text-sm text-muted-foreground">
                              Size: {item.variant.size} | 
                              {item.variant.barcode && ` Barcode: ${item.variant.barcode} | `}
                              Price: ₹{item.variant.sale_price} | 
                              Stock: {item.variant.stock_qty}
                            </span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          <div className="relative">
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-12 text-lg pr-20"
            />
            {customerName !== "Walk in Customer" && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-10 top-1/2 -translate-y-1/2 h-9 w-9"
                onClick={() => setCustomerName("Walk in Customer")}
              >
                <X className="h-5 w-5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={handlePreviousInvoice}
              variant="outline"
              size="lg"
              className="h-12"
              disabled={!todaysSales || todaysSales.length === 0}
            >
              <ChevronLeft className="h-5 w-5 mr-2" />
              Previous
            </Button>
            <Input 
              placeholder={todaysSales && todaysSales.length > 0 
                ? `Invoice ${currentInvoiceIndex + 1} of ${todaysSales.length} (Today)` 
                : "No invoices today"
              } 
              className="h-12 text-lg flex-1 text-center font-medium" 
              readOnly
            />
            <Button
              onClick={handleNextInvoice}
              variant="outline"
              size="lg"
              className="h-12"
              disabled={!todaysSales || todaysSales.length === 0}
            >
              Next
              <ChevronRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>

        {/* Items Table */}
        <Card className="overflow-hidden">
          <div className="bg-black text-white overflow-x-auto">
            <div className="min-w-[900px] grid grid-cols-12 gap-2 p-4 text-base font-medium">
              <div className="col-span-1">Barcode</div>
              <div className="col-span-3">Product</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-1">MRP</div>
              <div className="col-span-1">Tax%</div>
              <div className="col-span-1">Disc%</div>
              <div className="col-span-2">Unit Price</div>
              <div className="col-span-2">Net Amount</div>
            </div>
          </div>
          
          <div className="min-h-[350px] max-h-[450px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="text-center text-muted-foreground py-24 text-lg">
                Scan or enter product to add items
              </div>
            ) : (
              <div className="overflow-x-auto">
                {items.map((item, index) => (
                  <div key={index} className="min-w-[900px] grid grid-cols-12 gap-2 p-4 border-b hover:bg-muted/50 text-base">
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
                    <div className="col-span-1 flex items-center">{item.discount}%</div>
                    <div className="col-span-2 flex items-center">₹{item.unitCost.toFixed(2)}</div>
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
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Totals Section - Compact */}
        <div className="bg-cyan-500 text-white p-3 rounded-lg">
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
        </div>
      </div>
    </SidebarProvider>
  );
}
