import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon, Home, Plus, X, Search } from "lucide-react";
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
  quantity: number;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  discountAmount: number;
  gstPercent: number;
  lineTotal: number;
}

const customerSchema = z.object({
  customer_name: z.string().trim().min(1, "Customer name is required").max(100),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

export default function SalesInvoice() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [openProductSearch, setOpenProductSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [paymentTerm, setPaymentTerm] = useState<string>("");
  const [termsConditions, setTermsConditions] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [shippingInstructions, setShippingInstructions] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const customerForm = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      customer_name: "",
      phone: "",
      email: "",
      address: "",
      gst_number: "",
    },
  });

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

  // Fetch products with variants
  const { data: productsData } = useQuery({
    queryKey: ['products-with-variants', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          product_variants (*)
        `)
        .eq('organization_id', currentOrganization.id)
        .eq('status', 'active');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const addProductToInvoice = (product: any, variant: any) => {
    // Check if product already exists
    const existingIndex = lineItems.findIndex(item => item.variantId === variant.id);
    
    if (existingIndex >= 0) {
      // Increase quantity if already exists
      const updatedItems = [...lineItems];
      updatedItems[existingIndex].quantity += 1;
      updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
      setLineItems(updatedItems);
    } else {
      // Add new line item
      const newItem: LineItem = {
        id: `${Date.now()}-${variant.id}`,
        productId: product.id,
        variantId: variant.id,
        productName: product.product_name,
        size: variant.size,
        barcode: variant.barcode || '',
        quantity: 1,
        mrp: variant.sale_price || 0,
        salePrice: variant.sale_price || 0,
        discountPercent: 0,
        discountAmount: 0,
        gstPercent: product.gst_per || 0,
        lineTotal: variant.sale_price || 0,
      };
      setLineItems([...lineItems, calculateLineTotal(newItem)]);
    }
    
    setOpenProductSearch(false);
    setSearchInput("");
    toast({
      title: "Product Added",
      description: `${product.product_name} (${variant.size}) added to invoice`,
    });
  };

  const calculateLineTotal = (item: LineItem): LineItem => {
    const baseAmount = item.salePrice * item.quantity;
    const discountAmount = item.discountPercent > 0 
      ? (baseAmount * item.discountPercent) / 100 
      : item.discountAmount;
    const amountAfterDiscount = baseAmount - discountAmount;
    const lineTotal = amountAfterDiscount;
    
    return {
      ...item,
      discountAmount,
      lineTotal,
    };
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) return;
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, quantity }) : item
    );
    setLineItems(updatedItems);
  };

  const updateDiscountPercent = (id: string, discountPercent: number) => {
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, discountPercent, discountAmount: 0 }) : item
    );
    setLineItems(updatedItems);
  };

  const updateDiscountAmount = (id: string, discountAmount: number) => {
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, discountAmount, discountPercent: 0 }) : item
    );
    setLineItems(updatedItems);
  };

  const removeItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const handleCreateCustomer = async (values: z.infer<typeof customerSchema>) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          customer_name: values.customer_name,
          phone: values.phone || null,
          email: values.email || null,
          address: values.address || null,
          gst_number: values.gst_number || null,
          organization_id: currentOrganization?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Customer Created",
        description: `${values.customer_name} has been added successfully`,
      });

      // Auto-select the new customer
      setSelectedCustomerId(data.id);
      setSelectedCustomer(data);
      
      // Reset form and close dialog
      customerForm.reset();
      setOpenCustomerDialog(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create customer",
      });
    }
  };

  const handleSaveInvoice = async () => {
    // Validation
    if (!selectedCustomerId || !selectedCustomer) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select a customer",
      });
      return;
    }

    if (lineItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please add at least one product",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Generate invoice number
      const { data: saleNumber, error: saleNumError } = await supabase
        .rpc('generate_sale_number');

      if (saleNumError) throw saleNumError;

      // Create the sale record
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([{
          sale_number: saleNumber,
          sale_date: invoiceDate.toISOString(),
          sale_type: 'invoice',
          customer_id: selectedCustomerId,
          customer_name: selectedCustomer.customer_name,
          customer_phone: selectedCustomer.phone || null,
          customer_email: selectedCustomer.email || null,
          customer_address: selectedCustomer.address || null,
          gross_amount: grossAmount,
          discount_amount: totalDiscount,
          net_amount: netAmount,
          payment_method: 'pending',
          payment_status: 'pending',
          round_off: 0,
          flat_discount_amount: 0,
          flat_discount_percent: 0,
          organization_id: currentOrganization?.id,
          due_date: dueDate.toISOString().split('T')[0],
          payment_term: paymentTerm || null,
          terms_conditions: termsConditions || null,
          notes: notes || null,
          shipping_address: shippingAddress || null,
          shipping_instructions: shippingInstructions || null,
        }])
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItems = lineItems.map(item => ({
        sale_id: saleData.id,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode || null,
        quantity: item.quantity,
        unit_price: item.salePrice,
        mrp: item.mrp,
        discount_percent: item.discountPercent,
        gst_percent: item.gstPercent,
        line_total: item.lineTotal,
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Invoice Saved",
        description: `Invoice ${saleNumber} has been created successfully`,
      });

      // Reset form
      setLineItems([]);
      setSelectedCustomerId("");
      setSelectedCustomer(null);
      setInvoiceDate(new Date());
      setDueDate(new Date());
      setPaymentTerm("");
      setTermsConditions("");
      setNotes("");
      setShippingAddress("");
      setShippingInstructions("");

    } catch (error: any) {
      console.error('Error saving invoice:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save invoice",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate totals
  const grossAmount = lineItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
  const totalDiscount = lineItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const amountAfterDiscount = grossAmount - totalDiscount;
  const totalGST = lineItems.reduce((sum, item) => {
    const baseAmount = item.salePrice * item.quantity - item.discountAmount;
    return sum + (baseAmount * item.gstPercent) / 100;
  }, 0);
  const netAmount = amountAfterDiscount + totalGST;

  return (
    <div className="min-h-screen bg-background p-4">
      <BackToDashboard />
      
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Home className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground">- Invoice</span>
          <h1 className="text-2xl font-semibold">New Invoice</h1>
        </div>

        {/* Main Form */}
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {/* Select Customer */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Select Customer<span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Select
                  value={selectedCustomerId}
                  onValueChange={(value) => {
                    setSelectedCustomerId(value);
                    const customer = customersData?.find(c => c.id === value);
                    setSelectedCustomer(customer || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Search Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customersData?.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.customer_name} {customer.phone ? `- ${customer.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  size="icon" 
                  variant="outline"
                  onClick={() => setOpenCustomerDialog(true)}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {selectedCustomer && (
                <div className="text-xs text-muted-foreground space-y-1 mt-2">
                  {selectedCustomer.phone && <div>Phone: {selectedCustomer.phone}</div>}
                  {selectedCustomer.email && <div>Email: {selectedCustomer.email}</div>}
                  {selectedCustomer.address && <div>Address: {selectedCustomer.address}</div>}
                  {selectedCustomer.gst_number && <div>GST: {selectedCustomer.gst_number}</div>}
                  {!selectedCustomer.address && <div>Address is Not Provided</div>}
                </div>
              )}
              {!selectedCustomer && (
                <div className="text-xs text-muted-foreground space-y-1 mt-2">
                  <div>Please select a customer to view details</div>
                </div>
              )}
            </div>

            {/* Invoice Date */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Invoice Date<span className="text-destructive">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(invoiceDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={invoiceDate} onSelect={(date) => date && setInvoiceDate(date)} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Invoice No */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Invoice No.<span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input value="INV/24-25/" className="flex-1" readOnly />
                <Input defaultValue="9185" className="w-20" />
              </div>
            </div>

            {/* Payment Term */}
            <div className="space-y-2">
              <Label className="text-foreground">Payment Term</Label>
              <div className="flex gap-2">
                <Select value={paymentTerm} onValueChange={setPaymentTerm}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Payment Term" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="net15">Net 15</SelectItem>
                    <SelectItem value="net30">Net 30</SelectItem>
                    <SelectItem value="net60">Net 60</SelectItem>
                    <SelectItem value="net90">Net 90</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" type="button">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Due Date<span className="text-destructive">*</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dueDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dueDate} onSelect={(date) => date && setDueDate(date)} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Tax Type */}
            <div className="space-y-2">
              <Label className="text-foreground">Tax Type</Label>
              <Select defaultValue="default">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="gst">GST</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Create Invoice From */}
            <div className="space-y-2">
              <Label className="text-foreground">Create Invoice From</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quotation">Quotation</SelectItem>
                  <SelectItem value="order">Sales Order</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sales Man */}
            <div className="space-y-2">
              <Label className="text-foreground">Sales Man</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select Employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="emp1">Employee 1</SelectItem>
                  <SelectItem value="emp2">Employee 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex gap-6 mb-6">
            <div className="flex items-center space-x-2">
              <Checkbox id="reminder" />
              <Label htmlFor="reminder" className="text-sm cursor-pointer">Payment Reminder</Label>
            </div>
          </div>

          {/* Tabs Section */}
          <Tabs defaultValue="products" className="w-full">
            <TabsList>
              <TabsTrigger value="products">Product Details</TabsTrigger>
              <TabsTrigger value="terms">Terms & Condition/Note</TabsTrigger>
              <TabsTrigger value="shipping">Shipping Details</TabsTrigger>
            </TabsList>
            
            <TabsContent value="products" className="mt-4 space-y-4">
              {/* Product Search */}
              <div className="flex gap-2">
                <Popover open={openProductSearch} onOpenChange={setOpenProductSearch}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start">
                      <Search className="mr-2 h-4 w-4" />
                      {searchInput || "Search products by name, brand, or barcode..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[600px] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search products..."
                        value={searchInput}
                        onValueChange={setSearchInput}
                      />
                      <CommandList>
                        <CommandEmpty>No products found.</CommandEmpty>
                        <CommandGroup>
                          {productsData?.map((product) =>
                            product.product_variants?.map((variant: any) => (
                              <CommandItem
                                key={variant.id}
                                value={`${product.product_name} ${product.brand || ''} ${variant.size} ${variant.barcode || ''}`}
                                onSelect={() => addProductToInvoice(product, variant)}
                              >
                                <div className="flex justify-between w-full">
                                  <div>
                                    <div className="font-medium">{product.product_name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {product.brand} | Size: {variant.size} | 
                                      Barcode: {variant.barcode || 'N/A'}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-medium">₹{variant.sale_price}</div>
                                    <div className="text-sm text-muted-foreground">
                                      Stock: {variant.stock_qty}
                                    </div>
                                  </div>
                                </div>
                              </CommandItem>
                            ))
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Line Items Table */}
              {lineItems.length > 0 ? (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">#</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead className="w-[100px]">Qty</TableHead>
                        <TableHead className="w-[120px]">Price</TableHead>
                        <TableHead className="w-[100px]">Disc%</TableHead>
                        <TableHead className="w-[120px]">Disc Amt</TableHead>
                        <TableHead className="w-[80px]">GST%</TableHead>
                        <TableHead className="text-right w-[120px]">Total</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell>{item.size}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>₹{item.salePrice.toFixed(2)}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discountPercent}
                              onChange={(e) => updateDiscountPercent(item.id, parseFloat(e.target.value) || 0)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={item.discountAmount}
                              onChange={(e) => updateDiscountAmount(item.id, parseFloat(e.target.value) || 0)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>{item.gstPercent}%</TableCell>
                          <TableCell className="text-right font-medium">
                            ₹{item.lineTotal.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(item.id)}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {/* Summary Section */}
                  <div className="border-t p-4 bg-muted/30">
                    <div className="flex justify-end">
                      <div className="w-[400px] space-y-2">
                        <div className="flex justify-between">
                          <span>Gross Amount:</span>
                          <span className="font-medium">₹{grossAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-destructive">
                          <span>Total Discount:</span>
                          <span className="font-medium">- ₹{totalDiscount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Amount After Discount:</span>
                          <span className="font-medium">₹{amountAfterDiscount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total GST:</span>
                          <span className="font-medium">₹{totalGST.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold border-t pt-2">
                          <span>Net Amount:</span>
                          <span className="text-primary">₹{netAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Card className="p-4 min-h-[300px] flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No products added yet</p>
                    <p className="text-sm">Click the search box above to add products</p>
                  </div>
                </Card>
              )}
            </TabsContent>
            
            <TabsContent value="terms" className="mt-4">
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <Label>Terms & Conditions</Label>
                    <Textarea 
                      className="w-full min-h-[100px] mt-2" 
                      placeholder="Enter terms and conditions..."
                      value={termsConditions}
                      onChange={(e) => setTermsConditions(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea 
                      className="w-full min-h-[100px] mt-2" 
                      placeholder="Enter additional notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            <TabsContent value="shipping" className="mt-4">
              <Card className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Shipping Address</Label>
                    <Textarea 
                      className="w-full min-h-[100px] mt-2" 
                      placeholder="Enter shipping address..."
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Delivery Instructions</Label>
                    <Textarea 
                      className="w-full min-h-[100px] mt-2" 
                      placeholder="Enter delivery instructions..."
                      value={shippingInstructions}
                      onChange={(e) => setShippingInstructions(e.target.value)}
                    />
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" type="button">Cancel</Button>
            <Button variant="outline" type="button">Save as Draft</Button>
            <Button 
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
              onClick={handleSaveInvoice}
              disabled={isSaving}
              type="button"
            >
              {isSaving ? "Saving..." : "Save Invoice"}
            </Button>
          </div>
        </Card>
      </div>

      {/* Create Customer Dialog */}
      <Dialog open={openCustomerDialog} onOpenChange={setOpenCustomerDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <Form {...customerForm}>
            <form onSubmit={customerForm.handleSubmit(handleCreateCustomer)} className="space-y-4">
              <FormField
                control={customerForm.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name<span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter customer name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={customerForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter phone number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={customerForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="Enter email address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={customerForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter address" rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={customerForm.control}
                name="gst_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter GST number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    customerForm.reset();
                    setOpenCustomerDialog(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  Create Customer
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
