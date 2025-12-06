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
import { CalendarIcon, Plus, X, Search, Save, FileText, Printer } from "lucide-react";
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
import { useLocation, useNavigate } from "react-router-dom";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useReactToPrint } from "react-to-print";
import { QuotationPrint } from "@/components/QuotationPrint";

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
  hsnCode?: string;
}

const customerSchema = z.object({
  customer_name: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Mobile number is required").max(20),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

export default function QuotationEntry() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const location = useLocation();
  const navigate = useNavigate();
  const [quotationDate, setQuotationDate] = useState<Date>(new Date());
  const [validUntil, setValidUntil] = useState<Date>(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [quotationNumber, setQuotationNumber] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>(
    Array(5).fill(null).map((_, i) => ({
      id: `row-${i}`,
      productId: '',
      variantId: '',
      productName: '',
      size: '',
      barcode: '',
      quantity: 0,
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
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("inclusive");
  const [printData, setPrintData] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [salesman, setSalesman] = useState<string>("");

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
    documentTitle: `Quotation_${quotationNumber}`,
  });

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

  // Generate quotation number on load
  useEffect(() => {
    const generateQuotationNumber = async () => {
      if (!currentOrganization?.id || editingQuotationId) return;
      
      try {
        const { data, error } = await supabase.rpc('generate_quotation_number', {
          p_organization_id: currentOrganization.id
        });
        
        if (error) throw error;
        setQuotationNumber(data);
      } catch (error) {
        console.error('Error generating quotation number:', error);
      }
    };
    
    generateQuotationNumber();
  }, [currentOrganization?.id, editingQuotationId]);

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

  // Fetch products - NO stock filter for quotations
  const { data: productsData } = useQuery({
    queryKey: ['products-all', currentOrganization?.id],
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

  // Load edit data
  useEffect(() => {
    const quotationData = location.state?.quotationData;
    if (quotationData) {
      setEditingQuotationId(quotationData.id);
      setQuotationNumber(quotationData.quotation_number);
      setQuotationDate(new Date(quotationData.quotation_date));
      setValidUntil(quotationData.valid_until ? new Date(quotationData.valid_until) : new Date());
      setSelectedCustomerId(quotationData.customer_id || "");
      setTaxType(quotationData.tax_type || "inclusive");
      setTermsConditions(quotationData.terms_conditions || "");
      setNotes(quotationData.notes || "");
      setShippingAddress(quotationData.shipping_address || "");
      setSalesman(quotationData.salesman || "");
      
      if (quotationData.customer_id) {
        setSelectedCustomer({
          id: quotationData.customer_id,
          customer_name: quotationData.customer_name,
          phone: quotationData.customer_phone,
          email: quotationData.customer_email,
          address: quotationData.customer_address,
        });
      }
      
      if (quotationData.quotation_items?.length > 0) {
        const items = quotationData.quotation_items.map((item: any, i: number) => ({
          id: `row-${i}`,
          productId: item.product_id,
          variantId: item.variant_id,
          productName: item.product_name,
          size: item.size,
          barcode: item.barcode || '',
          quantity: item.quantity,
          mrp: item.mrp,
          salePrice: item.unit_price,
          discountPercent: item.discount_percent,
          discountAmount: 0,
          gstPercent: item.gst_percent,
          lineTotal: item.line_total,
          hsnCode: item.hsn_code || '',
        }));
        // Pad to 5 rows
        while (items.length < 5) {
          items.push({
            id: `row-${items.length}`,
            productId: '', variantId: '', productName: '', size: '', barcode: '',
            quantity: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0, hsnCode: '',
          });
        }
        setLineItems(items);
      }
    }
  }, [location.state]);

  useEffect(() => {
    if (lineItems.length > 0) {
      setLineItems(prev => prev.map(item => calculateLineTotal(item)));
    }
  }, [taxType]);

  const addProductToQuotation = (product: any, variant: any) => {
    const existingIndex = lineItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
    
    if (existingIndex >= 0) {
      const updatedItems = [...lineItems];
      updatedItems[existingIndex].quantity += 1;
      updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
      setLineItems(updatedItems);
    } else {
      const emptyRowIndex = lineItems.findIndex(item => item.productId === '');
      if (emptyRowIndex === -1) {
        toast({ title: "Table Full", description: "All 5 rows are filled.", variant: "destructive" });
        return;
      }
      
      const updatedItems = [...lineItems];
      updatedItems[emptyRowIndex] = calculateLineTotal({
        id: updatedItems[emptyRowIndex].id,
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
        lineTotal: 0,
        hsnCode: product.hsn_code || '',
      });
      setLineItems(updatedItems);
    }
    
    setOpenProductSearch(false);
    setSearchInput("");
    toast({ title: "Product Added", description: `${product.product_name} (${variant.size}) added` });
  };

  const calculateLineTotal = (item: LineItem): LineItem => {
    const baseAmount = item.salePrice * item.quantity;
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

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) return;
    setLineItems(prev => prev.map(item => 
      item.id === id ? calculateLineTotal({ ...item, quantity }) : item
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
        quantity: 0, mrp: 0, salePrice: 0, discountPercent: 0, discountAmount: 0, gstPercent: 0, lineTotal: 0,
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
  const grossAmount = filledItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
  const totalDiscount = filledItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const amountAfterDiscount = grossAmount - totalDiscount;
  const totalGST = taxType === "exclusive" 
    ? filledItems.reduce((sum, item) => sum + ((item.salePrice * item.quantity - item.discountAmount) * item.gstPercent / 100), 0)
    : 0;
  const netAmount = amountAfterDiscount + totalGST;

  const handleSaveQuotation = async () => {
    if (filledItems.length === 0) {
      toast({ title: "Error", description: "Add at least one item", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const quotationData = {
        organization_id: currentOrganization?.id,
        quotation_number: quotationNumber,
        quotation_date: quotationDate.toISOString(),
        valid_until: validUntil.toISOString().split('T')[0],
        customer_id: selectedCustomerId || null,
        customer_name: selectedCustomer?.customer_name || 'Walk in Customer',
        customer_phone: selectedCustomer?.phone || null,
        customer_email: selectedCustomer?.email || null,
        customer_address: selectedCustomer?.address || null,
        gross_amount: grossAmount,
        discount_amount: totalDiscount,
        gst_amount: totalGST,
        net_amount: netAmount,
        status: 'draft',
        tax_type: taxType,
        notes,
        terms_conditions: termsConditions,
        shipping_address: shippingAddress,
        salesman: salesman || null,
      };

      let quotationId = editingQuotationId;

      if (editingQuotationId) {
        const { error } = await supabase
          .from('quotations')
          .update(quotationData)
          .eq('id', editingQuotationId);
        if (error) throw error;
        
        await supabase.from('quotation_items').delete().eq('quotation_id', editingQuotationId);
      } else {
        const { data, error } = await supabase
          .from('quotations')
          .insert([quotationData])
          .select()
          .single();
        if (error) throw error;
        quotationId = data.id;
      }

      const quotationItems = filledItems.map(item => ({
        quotation_id: quotationId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        size: item.size,
        barcode: item.barcode,
        quantity: item.quantity,
        unit_price: item.salePrice,
        mrp: item.mrp,
        discount_percent: item.discountPercent,
        gst_percent: item.gstPercent,
        line_total: item.lineTotal,
        hsn_code: item.hsnCode || null,
      }));

      const { error: itemsError } = await supabase
        .from('quotation_items')
        .insert(quotationItems);
      if (itemsError) throw itemsError;

      toast({ title: "Success", description: `Quotation ${quotationNumber} saved` });
      return { success: true, quotationId };
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      return { success: false };
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndPrint = async () => {
    const result = await handleSaveQuotation();
    if (result.success) {
      // Prepare print data
      const printItems = filledItems.map((item, index) => ({
        sr: index + 1,
        particulars: item.productName,
        size: item.size,
        barcode: item.barcode,
        hsn: '',
        qty: item.quantity,
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
        navigate('/quotation-dashboard');
      }, 100);
    }
  };

  const filteredProducts = productsData?.filter(product => {
    const searchLower = searchInput.toLowerCase();
    const matchesProduct = product.product_name?.toLowerCase().includes(searchLower) ||
      product.brand?.toLowerCase().includes(searchLower) ||
      product.color?.toLowerCase().includes(searchLower);
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
            <FileText className="h-6 w-6" />
            {editingQuotationId ? 'Edit Quotation' : 'New Quotation'}
          </h1>
          <div className="flex items-center gap-2">
            <Label>Quotation No:</Label>
            <Input value={quotationNumber} readOnly className="w-40 bg-muted" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <Label>Quotation Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(quotationDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={quotationDate} onSelect={(d) => d && setQuotationDate(d)} />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Valid Until</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(validUntil, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={validUntil} onSelect={(d) => d && setValidUntil(d)} />
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
                Search Products (No Stock Restriction)
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[500px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search by name, barcode..." value={searchInput} onValueChange={setSearchInput} />
                <CommandList>
                  <CommandEmpty>No products found</CommandEmpty>
                  <CommandGroup>
                    {filteredProducts.slice(0, 10).map(product => (
                      product.product_variants?.map((variant: any) => (
                        <CommandItem
                          key={variant.id}
                          onSelect={() => addProductToQuotation(product, variant)}
                          className="cursor-pointer"
                        >
                          <div className="flex justify-between w-full">
                            <span>{product.product_name} - {variant.size}</span>
                            <span className="text-muted-foreground">₹{variant.sale_price}</span>
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

        {/* Line Items Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="w-20">Qty</TableHead>
              <TableHead className="w-24">Price</TableHead>
              <TableHead className="w-20">Disc %</TableHead>
              <TableHead className="w-20">GST %</TableHead>
              <TableHead className="w-24 text-right">Total</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((item, index) => (
              <TableRow key={item.id} className={item.productId ? '' : 'opacity-50'}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{item.productName || '-'}</TableCell>
                <TableCell>{item.size || '-'}</TableCell>
                <TableCell>
                  {item.productId && (
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                      className="w-16 h-8"
                    />
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
                <TableCell>{item.gstPercent}%</TableCell>
                <TableCell className="text-right font-medium">₹{item.lineTotal.toFixed(2)}</TableCell>
                <TableCell>
                  {item.productId && (
                    <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Summary */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-2">
            <div className="flex justify-between"><span>Gross Amount:</span><span>₹{grossAmount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Discount:</span><span>-₹{totalDiscount.toFixed(2)}</span></div>
            {taxType === "exclusive" && (
              <div className="flex justify-between"><span>GST:</span><span>₹{totalGST.toFixed(2)}</span></div>
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
          <Button onClick={() => handleSaveQuotation().then(r => r.success && navigate('/quotation-dashboard'))} disabled={isSaving} className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Quotation'}
          </Button>
          <Button onClick={handleSaveAndPrint} disabled={isSaving} variant="outline" className="flex-1">
            <Printer className="mr-2 h-4 w-4" />
            Save & Print
          </Button>
        </div>
      </Card>

      {/* Print Component (hidden) */}
      <div className="hidden">
        <QuotationPrint
          ref={printRef}
          businessName={settings?.business_name || ''}
          address={settings?.address || ''}
          mobile={settings?.mobile_number || ''}
          email={settings?.email_id || ''}
          gstNumber={settings?.gst_number || ''}
          logoUrl=""
          quotationNumber={quotationNumber}
          quotationDate={quotationDate}
          validUntil={validUntil}
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
