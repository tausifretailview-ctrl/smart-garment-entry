import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarIcon, Home, Plus, X, Search, Eye, IndianRupee, ArrowUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { useReactToPrint } from "react-to-print";
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
import { useStockValidation } from "@/hooks/useStockValidation";
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
  phone: z.string().trim().min(1, "Mobile number is required").max(20, "Mobile number must be less than 20 characters"),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(15).optional(),
});

export default function SalesInvoice() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { checkStock, validateCartStock, showStockError, showMultipleStockErrors } = useStockValidation();
  const location = useLocation();
  const { orgNavigate: navigate } = useOrgNavigation();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  
  // Customer balance hook
  const { balance: customerBalance, openingBalance: customerOpeningBalance, isLoading: isBalanceLoading } = useCustomerBalance(
    selectedCustomerId || null,
    currentOrganization?.id || null
  );
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const printRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  // Initialize 5 empty rows for predefined table
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
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [openCustomerSearch, setOpenCustomerSearch] = useState(false);
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const [paymentTerm, setPaymentTerm] = useState<string>("");
  const [termsConditions, setTermsConditions] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [shippingInstructions, setShippingInstructions] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [taxType, setTaxType] = useState<"exclusive" | "inclusive">("inclusive");
  const [selectedTemplate, setSelectedTemplate] = useState<"classic" | "modern" | "minimal">("classic");
  const [showPreview, setShowPreview] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<any>(null);

  // Keyboard shortcut for printing and scroll detection
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        if (savedInvoiceData) {
          handlePrintInvoice();
        }
      }
    };

    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 200);
    };

    window.addEventListener("keydown", handleKeyPress);
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [savedInvoiceData]);

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

  // Fetch customer balances for dropdown display
  const { data: customerBalances = {} } = useQuery({
    queryKey: ["customer-balances", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return {};
      const { data: sales, error } = await supabase
        .from("sales")
        .select("customer_id, net_amount, paid_amount")
        .eq("organization_id", currentOrganization.id)
        .not("customer_id", "is", null);
      if (error) throw error;
      
      // Aggregate by customer_id
      const balanceMap: Record<string, { totalSales: number; totalPaid: number }> = {};
      sales?.forEach((sale) => {
        if (!sale.customer_id) return;
        if (!balanceMap[sale.customer_id]) {
          balanceMap[sale.customer_id] = { totalSales: 0, totalPaid: 0 };
        }
        balanceMap[sale.customer_id].totalSales += sale.net_amount || 0;
        balanceMap[sale.customer_id].totalPaid += sale.paid_amount || 0;
      });
      return balanceMap;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Helper to calculate customer balance
  const getCustomerBalance = (customer: any) => {
    const openingBalance = customer.opening_balance || 0;
    const salesData = customerBalances[customer.id] || { totalSales: 0, totalPaid: 0 };
    return openingBalance + salesData.totalSales - salesData.totalPaid;
  };

  // Fetch settings
  const { data: settingsData } = useQuery({
    queryKey: ['settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .single();
      
      if (error) throw error;
      return data;
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

  // Pre-populate form if editing existing invoice
  useState(() => {
    const invoiceData = location.state?.invoiceData;
    if (invoiceData) {
      setEditingInvoiceId(invoiceData.id);
      setInvoiceDate(new Date(invoiceData.sale_date));
      setDueDate(invoiceData.due_date ? new Date(invoiceData.due_date) : new Date());
      setSelectedCustomerId(invoiceData.customer_id || "");
      
      // Set customer if available
      if (invoiceData.customer_id) {
        const customer = {
          id: invoiceData.customer_id,
          customer_name: invoiceData.customer_name,
          phone: invoiceData.customer_phone,
          email: invoiceData.customer_email,
          address: invoiceData.customer_address,
        };
        setSelectedCustomer(customer);
      }
      
      setPaymentTerm(invoiceData.payment_term || "");
      setTermsConditions(invoiceData.terms_conditions || "");
      setNotes(invoiceData.notes || "");
      setShippingAddress(invoiceData.shipping_address || "");
      setShippingInstructions(invoiceData.shipping_instructions || "");
      
      // Transform sale items back to line items
      if (invoiceData.sale_items && invoiceData.sale_items.length > 0) {
        const transformedItems = invoiceData.sale_items.map((item: any) => ({
          id: item.id,
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
        setLineItems(transformedItems);
      }
    }
  });

  // Recalculate all line items when tax type changes
  useEffect(() => {
    if (lineItems.length > 0) {
      setLineItems(prevItems => prevItems.map(item => calculateLineTotal(item)));
    }
  }, [taxType]);

  const addProductToInvoice = async (product: any, variant: any) => {
    // Real-time stock validation
    const stockCheck = await checkStock(variant.id, 1);
    if (!stockCheck.isAvailable) {
      showStockError(
        stockCheck.productName,
        stockCheck.size,
        1,
        stockCheck.availableStock
      );
      return;
    }

    // Check if product already exists in filled rows
    const existingIndex = lineItems.findIndex(item => item.variantId === variant.id && item.productId !== '');
    
    if (existingIndex >= 0) {
      // Real-time stock validation for increased quantity
      const newQty = lineItems[existingIndex].quantity + 1;
      const stockCheckIncrease = await checkStock(variant.id, newQty);
      
      if (!stockCheckIncrease.isAvailable) {
        showStockError(
          stockCheckIncrease.productName,
          stockCheckIncrease.size,
          newQty,
          stockCheckIncrease.availableStock
        );
        return;
      }
      
      // Increase quantity if already exists
      const updatedItems = [...lineItems];
      updatedItems[existingIndex].quantity = newQty;
      updatedItems[existingIndex] = calculateLineTotal(updatedItems[existingIndex]);
      setLineItems(updatedItems);
    } else {
      // Find first empty row and fill it
      const emptyRowIndex = lineItems.findIndex(item => item.productId === '');
      
      if (emptyRowIndex === -1) {
        toast({
          title: "Table Full",
          description: "All 5 rows are filled. Remove an item to add more.",
          variant: "destructive"
        });
        return;
      }

      const updatedItems = [...lineItems];
      const newItem: LineItem = {
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
      };
      updatedItems[emptyRowIndex] = calculateLineTotal(newItem);
      setLineItems(updatedItems);
    }
    
    setOpenProductSearch(false);
    setSearchInput("");
    
    // Auto-scroll to show newly added product
    setTimeout(() => {
      if (tableContainerRef.current) {
        tableContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    
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
    
    let lineTotal: number;
    if (taxType === "inclusive") {
      // For inclusive GST, the price already includes tax
      lineTotal = amountAfterDiscount;
    } else {
      // For exclusive GST, add tax on top
      const gstAmount = (amountAfterDiscount * item.gstPercent) / 100;
      lineTotal = amountAfterDiscount + gstAmount;
    }
    
    return {
      ...item,
      discountAmount,
      lineTotal,
    };
  };

  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity < 1) return;
    
    // Find the item being updated
    const item = lineItems.find(i => i.id === id);
    if (!item || !item.variantId) return;
    
    // Real-time stock validation
    const stockCheck = await checkStock(item.variantId, quantity);
    
    if (!stockCheck.isAvailable) {
      showStockError(
        item.productName,
        item.size,
        quantity,
        stockCheck.availableStock
      );
      return;
    }
    
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

  const updateGSTPercent = (id: string, gstPercent: number) => {
    const updatedItems = lineItems.map(item => 
      item.id === id ? calculateLineTotal({ ...item, gstPercent }) : item
    );
    setLineItems(updatedItems);
  };

  const removeItem = (id: string) => {
    // Clear the row instead of removing it
    const updatedItems = lineItems.map(item => 
      item.id === id ? {
        ...item,
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
      } : item
    );
    setLineItems(updatedItems);
  };

  const handleCreateCustomer = async (values: z.infer<typeof customerSchema>) => {
    try {
      // Use phone as customer name if name is empty
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

      toast({
        title: "Customer Created",
        description: `${customerName} has been added successfully`,
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

  const sendToWhatsApp = async (invoiceNumber: string, customerPhone: string, items: LineItem[], totalAmount: number) => {
    if (!customerPhone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send via WhatsApp",
        variant: "destructive"
      });
      return;
    }

    try {
      // Fetch the full invoice data from database
      const { data: invoiceData, error: fetchError } = await supabase
        .from('sales')
        .select(`
          *,
          sale_items (*)
        `)
        .eq('sale_number', invoiceNumber)
        .single();

      if (fetchError || !invoiceData) {
        throw new Error('Failed to fetch invoice data');
      }

      // Generate and download PDF first
      const billSettings = settingsData?.bill_barcode_settings as any || {};
      const declarationText = billSettings.bill_header || 'Declaration: Composition taxable person, not eligible to collect tax on supplies.';
      const termsText = billSettings.bill_footer || '';
      const termsList = termsText ? termsText.split('\n').filter((t: string) => t.trim()) : [
        'GOODS ONCE SOLD WILL NOT BE TAKEN BACK.',
        'NO EXCHANGE WITHOUT BARCODE & BILL.',
        'EXCHANGE TIME: 01:00 TO 04:00 PM.'
      ];

      // Fetch shop logo if available
      let logoUrl: string | undefined;
      const saleSettings = settingsData?.sale_settings as any || {};
      if (saleSettings.shop_logo_path) {
        const { data: logoData } = await supabase
          .storage
          .from('company-logos')
          .createSignedUrl(saleSettings.shop_logo_path, 3600);
        
        if (logoData?.signedUrl) {
          logoUrl = logoData.signedUrl;
        }
      }

      // Transform invoice items for PDF generation
      const transformedItems = invoiceData.sale_items?.map((item: any, index: number) => ({
        sr: index + 1,
        particulars: item.product_name,
        size: item.size,
        barcode: item.barcode || '',
        hsn: '',
        sp: item.mrp,
        qty: item.quantity,
        rate: item.unit_price,
        total: item.line_total,
      })) || [];

      // Calculate payment details
      const paymentMethod = invoiceData.payment_method || 'pending';
      let cashPaid = 0, upiPaid = 0, cardPaid = 0;
      if (invoiceData.payment_status === 'completed') {
        if (paymentMethod === 'cash') cashPaid = invoiceData.net_amount;
        else if (paymentMethod === 'upi') upiPaid = invoiceData.net_amount;
        else if (paymentMethod === 'card') cardPaid = invoiceData.net_amount;
      }

      // Prepare invoice data for PDF
      const pdfInvoiceData = {
        billNo: invoiceData.sale_number,
        date: new Date(invoiceData.sale_date),
        time: new Date(invoiceData.sale_date).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        customerName: invoiceData.customer_name,
        customerAddress: invoiceData.customer_address || '',
        customerMobile: invoiceData.customer_phone || '',
        items: transformedItems,
        subTotal: invoiceData.gross_amount,
        discount: invoiceData.discount_amount,
        grandTotal: invoiceData.net_amount,
        tenderAmount: invoiceData.net_amount,
        cashPaid,
        upiPaid,
        cardPaid,
        refundCash: 0,
        paymentMethod,
        businessName: settingsData?.business_name || 'BUSINESS NAME',
        businessAddress: settingsData?.address || '',
        businessContact: settingsData?.mobile_number || '',
        businessEmail: settingsData?.email_id || '',
        gstNumber: settingsData?.gst_number || '',
        logo: logoUrl,
        mrpTotal: invoiceData.gross_amount,
        declarationText,
        termsList,
      };

      // TODO: Re-implement PDF generation for WhatsApp sharing
      // await generateInvoiceFromHTML(pdfInvoiceData);

      // Create WhatsApp message
      const message = `Hello ${selectedCustomer?.customer_name || 'Customer'},

Thank you for your business!

*Invoice Details:*
Invoice No: ${invoiceNumber}
Date: ${format(invoiceDate, 'dd/MM/yyyy')}
Amount: ₹${totalAmount.toFixed(2)}

Items: ${items.length} product(s)

${items.map((item, i) => 
  `${i + 1}. ${item.productName} (${item.size}) - Qty: ${item.quantity} - ₹${item.lineTotal.toFixed(2)}`
).join('\n')}

Total Amount: *₹${totalAmount.toFixed(2)}*

${paymentTerm ? `Payment Terms: ${paymentTerm}` : ''}

Thank you for choosing us!`;

      // Format phone number (remove non-digits and ensure country code)
      let formattedPhone = customerPhone.replace(/[^\d]/g, '');
      if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
        formattedPhone = '91' + formattedPhone;
      }

      // Open WhatsApp with pre-filled message
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');

      toast({
        title: "PDF Downloaded & WhatsApp Opened",
        description: "Please attach the downloaded PDF in WhatsApp chat",
      });
    } catch (error: any) {
      console.error('Error sending to WhatsApp:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate invoice PDF",
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

    // Check if customer mobile is required (for any sale with pending/partial payment)
    // Since Sales Invoice defaults to pay_later, customer mobile is mandatory
    if (!selectedCustomer.phone || !selectedCustomer.phone.trim()) {
      toast({
        variant: "destructive",
        title: "Customer Details Required",
        description: "Please enter customer details first for balance invoice. Mobile number is mandatory for invoices.",
      });
      return;
    }

    const filledItems = lineItems.filter(item => item.productId !== '');
    if (filledItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please add at least one product",
      });
      return;
    }

    // Real-time stock validation before saving
    const invoiceItems = filledItems.map(item => ({
      variantId: item.variantId,
      quantity: item.quantity,
      productName: item.productName,
      size: item.size,
    }));

    const insufficientItems = await validateCartStock(invoiceItems);
    
    if (insufficientItems.length > 0) {
      showMultipleStockErrors(insufficientItems);
      return;
    }

    setIsSaving(true);
    try {
      if (editingInvoiceId) {
        // Update existing invoice - correct order for stock triggers:
        // 1. Delete sale_items (triggers stock restoration via handle_sale_item_delete)
        // 2. Insert new sale_items (triggers stock deduction via update_stock_on_sale)
        // 3. Update sales record
        
        // Step 1: Delete existing sale items (triggers stock restoration)
        const { error: deleteError } = await supabase
          .from('sale_items')
          .delete()
          .eq('sale_id', editingInvoiceId);

        if (deleteError) throw deleteError;

        // Step 2: Insert updated sale items (triggers stock deduction)
        const saleItems = filledItems.map(item => ({
          sale_id: editingInvoiceId,
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
          hsn_code: item.hsnCode || null,
        }));

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItems);

        if (itemsError) throw itemsError;

        // Step 3: Update the sales record
        const { error: updateError } = await supabase
          .from('sales')
          .update({
            sale_date: invoiceDate.toISOString(),
            customer_id: selectedCustomerId,
            customer_name: selectedCustomer.customer_name,
            customer_phone: selectedCustomer.phone || null,
            customer_email: selectedCustomer.email || null,
            customer_address: selectedCustomer.address || null,
            gross_amount: grossAmount,
            discount_amount: totalDiscount,
            net_amount: netAmount,
            due_date: dueDate.toISOString().split('T')[0],
            payment_term: paymentTerm || null,
            terms_conditions: termsConditions || null,
            notes: notes || null,
            shipping_address: shippingAddress || null,
            shipping_instructions: shippingInstructions || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingInvoiceId);

        if (updateError) throw updateError;

        toast({
          title: "Invoice Updated",
          description: "Invoice has been updated successfully",
        });

        // Fetch the updated invoice number
        const { data: invoiceData } = await supabase
          .from('sales')
          .select('sale_number')
          .eq('id', editingInvoiceId)
          .single();

        // Store invoice data and show print dialog
        setSavedInvoiceData({
          invoiceNumber: invoiceData?.sale_number,
          filledItems,
          netAmount,
          customer: selectedCustomer,
        });
        setShowPrintDialog(true);
      } else {
        // Create new invoice
        const { data: saleNumber, error: saleNumError } = await supabase
          .rpc('generate_sale_number', { p_organization_id: currentOrganization?.id });

        if (saleNumError) throw saleNumError;

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
            payment_method: 'pay_later',
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

        const saleItems = filledItems.map(item => ({
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
          hsn_code: item.hsnCode || null,
        }));

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItems);

        if (itemsError) throw itemsError;

        toast({
          title: "Invoice Saved",
          description: `Invoice ${saleNumber} has been created successfully`,
        });

        // Store invoice data and show print dialog
        setSavedInvoiceData({
          invoiceNumber: saleNumber,
          filledItems,
          netAmount,
          customer: selectedCustomer,
        });
        setShowPrintDialog(true);

        // Reset form after user closes print dialog (will be handled in dialog onClose)
        // Don't reset immediately to allow printing
      }
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

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => {
      toast({
        title: "Success",
        description: "Invoice printed successfully",
      });
    },
  });

  const handlePrintInvoice = async () => {
    if (!savedInvoiceData || !currentOrganization?.id) return;
    
    // Trigger print
    setTimeout(() => {
      handlePrint();
    }, 100);
  };

  const handleClosePrintDialog = () => {
    setShowPrintDialog(false);
    
    // Reset form if it was a new invoice
    if (!editingInvoiceId) {
      setLineItems(
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
      setSelectedCustomerId("");
      setSelectedCustomer(null);
      setInvoiceDate(new Date());
      setDueDate(new Date());
      setPaymentTerm("");
      setTermsConditions("");
      setNotes("");
      setShippingAddress("");
      setShippingInstructions("");
    } else {
      // Navigate back to dashboard if editing
      navigate('/sales-invoice-dashboard');
    }
    
    setEditingInvoiceId(null);
    setSavedInvoiceData(null);
  };

  // Calculate totals
  const grossAmount = lineItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
  const totalDiscount = lineItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const amountAfterDiscount = grossAmount - totalDiscount;
  
  const totalGST = lineItems.reduce((sum, item) => {
    const baseAmount = item.salePrice * item.quantity - item.discountAmount;
    if (taxType === "inclusive") {
      // Extract GST from inclusive price
      return sum + (baseAmount - (baseAmount / (1 + item.gstPercent / 100)));
    } else {
      // Calculate GST on exclusive price
      return sum + (baseAmount * item.gstPercent) / 100;
    }
  }, 0);
  
  const netAmount = taxType === "inclusive" ? amountAfterDiscount : amountAfterDiscount + totalGST;

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Scroll to Top Button with Item Count Badge */}
      {showScrollTop && (
        <Button
          size="icon"
          variant="secondary"
          className="fixed bottom-8 right-8 z-30 rounded-full shadow-lg h-12 w-12 relative"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <ArrowUp className="h-5 w-5" />
          {lineItems.filter(item => item.productId).length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {lineItems.filter(item => item.productId).length}
            </span>
          )}
        </Button>
      )}
      <BackToDashboard label="Back to Sales Invoice Dashboard" to="/sales-invoice-dashboard" />
      
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Home className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground">- Invoice</span>
          <h1 className="text-2xl font-semibold">
            {editingInvoiceId ? 'Edit Invoice' : 'New Invoice'}
          </h1>
        </div>

        {/* Main Form */}
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {/* Select Customer */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-foreground">
                  Select Customer<span className="text-destructive">*</span>
                </Label>
                {/* Customer Balance Display - on top of label */}
                {selectedCustomerId && (
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                    customerBalance > 0 
                      ? 'bg-destructive/10 text-destructive border border-destructive/30' 
                      : customerBalance < 0 
                        ? 'bg-green-500/10 text-green-600 border border-green-500/30' 
                        : 'bg-muted text-muted-foreground border border-border'
                  }`}>
                    <IndianRupee className="h-3 w-3" />
                    <span>
                      {isBalanceLoading ? '...' : `₹${Math.abs(customerBalance).toLocaleString('en-IN')}`}
                    </span>
                    <span className="text-[10px]">
                      {customerBalance > 0 ? 'Due' : customerBalance < 0 ? 'Credit' : ''}
                      {customerOpeningBalance > 0 && ` (Op: ₹${customerOpeningBalance.toLocaleString('en-IN')})`}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Popover open={openCustomerSearch} onOpenChange={setOpenCustomerSearch}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {selectedCustomer 
                        ? `${selectedCustomer.customer_name}${selectedCustomer.phone ? ` - ${selectedCustomer.phone}` : ''}`
                        : "Search Customer by Name or Mobile..."
                      }
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Search by name or mobile number..." 
                        value={customerSearchInput}
                        onValueChange={setCustomerSearchInput}
                      />
                      <CommandList>
                        <CommandEmpty>No customers found.</CommandEmpty>
                        <CommandGroup heading="Customers">
                          {customersData
                            ?.filter(c => 
                              c.customer_name?.toLowerCase().includes(customerSearchInput.toLowerCase()) ||
                              c.phone?.toLowerCase().includes(customerSearchInput.toLowerCase())
                            )
                            .slice(0, 10)
                            .map((customer) => {
                              const balance = getCustomerBalance(customer);
                              return (
                                <CommandItem
                                  key={customer.id}
                                  value={`${customer.customer_name} ${customer.phone || ''}`}
                                  onSelect={() => {
                                    setSelectedCustomerId(customer.id);
                                    setSelectedCustomer(customer);
                                    setCustomerSearchInput("");
                                    setOpenCustomerSearch(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <div className="flex flex-col flex-1">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">{customer.customer_name}</span>
                                      {balance !== 0 && (
                                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                          balance > 0 
                                            ? 'bg-destructive/10 text-destructive' 
                                            : 'bg-green-500/10 text-green-600'
                                        }`}>
                                          ₹{Math.abs(balance).toLocaleString('en-IN')} {balance > 0 ? 'Due' : 'Cr'}
                                        </span>
                                      )}
                                    </div>
                                    {customer.phone && (
                                      <span className="text-sm text-muted-foreground">
                                        Mobile: {customer.phone}
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
              <Label className="text-foreground">
                Tax Type<span className="text-destructive">*</span>
              </Label>
              <Select value={taxType} onValueChange={(value: "exclusive" | "inclusive") => setTaxType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclusive">Exclusive GST</SelectItem>
                  <SelectItem value="inclusive">Inclusive GST</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {taxType === "exclusive" 
                  ? "GST will be added on top of the price (e.g., ₹1500 + GST)" 
                  : "Price already includes GST (e.g., ₹1500 with GST)"}
              </p>
            </div>

            {/* Invoice Template */}
            <div className="space-y-2">
              <Label className="text-foreground">
                Invoice Template<span className="text-destructive">*</span>
              </Label>
              <Select value={selectedTemplate} onValueChange={(value: "classic" | "modern" | "minimal") => setSelectedTemplate(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="classic">Classic - Traditional business style</SelectItem>
                  <SelectItem value="modern">Modern - Gradient & contemporary</SelectItem>
                  <SelectItem value="minimal">Minimal - Clean & simple</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => lineItems.length > 0 && setShowPreview(true)}
                disabled={lineItems.length === 0}
                className="w-full mt-2"
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview Template
              </Button>
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
                            product.product_variants
                              ?.filter((variant: any) => variant.stock_qty > 0)
                              ?.map((variant: any) => (
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

              {/* Line Items Table - Always show 5 rows */}
              <div ref={tableContainerRef} className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="w-[100px]">Qty</TableHead>
                      <TableHead className="w-[100px]">MRP</TableHead>
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
                        <TableCell className="font-medium">{item.productName || '-'}</TableCell>
                        <TableCell>{item.size || '-'}</TableCell>
                        <TableCell>
                          {item.productId ? (
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                              className="w-full"
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.productId ? (
                            item.mrp > item.salePrice ? (
                              <span className="line-through text-muted-foreground">₹{item.mrp.toFixed(2)}</span>
                            ) : (
                              <span>₹{item.mrp.toFixed(2)}</span>
                            )
                          ) : '-'}
                        </TableCell>
                        <TableCell>{item.productId ? `₹${item.salePrice.toFixed(2)}` : '-'}</TableCell>
                        <TableCell>
                          {item.productId ? (
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discountPercent}
                              onChange={(e) => updateDiscountPercent(item.id, parseFloat(e.target.value) || 0)}
                              className="w-full"
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.productId ? (
                            <Input
                              type="number"
                              min="0"
                              value={item.discountAmount}
                              onChange={(e) => updateDiscountAmount(item.id, parseFloat(e.target.value) || 0)}
                              className="w-full"
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{item.productId ? `${item.gstPercent}%` : '-'}</TableCell>
                        <TableCell className="text-right">
                          {item.productId ? `₹${item.lineTotal.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell>
                          {item.productId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(item.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
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
            <Button 
              variant="outline" 
              type="button"
              onClick={() => navigate('/sales-invoice-dashboard')}
            >
              Cancel
            </Button>
            <Button variant="outline" type="button">Save as Draft</Button>
            <Button 
              onClick={() => {
                if (lineItems.filter(item => item.productId).length === 0) {
                  toast({
                    title: "No Items",
                    description: "Please add items to the invoice before printing",
                    variant: "destructive",
                  });
                  return;
                }
                if (!selectedCustomerId) {
                  toast({
                    title: "No Customer",
                    description: "Please select a customer before printing",
                    variant: "destructive",
                  });
                  return;
                }
                handlePrint();
              }}
              variant="outline"
              type="button"
              disabled={isSaving}
            >
              Print Invoice
            </Button>
            <Button 
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
              onClick={handleSaveInvoice}
              disabled={isSaving}
              type="button"
            >
              {isSaving ? "Saving..." : editingInvoiceId ? "Update Invoice" : "Save Invoice"}
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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile Number<span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter mobile number" autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={customerForm.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter customer name (optional)" />
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

      {/* Invoice Template Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center justify-between">
              <span>Invoice Preview</span>
              <Button variant="outline" size="sm" onClick={() => setShowPreview(false)}>
                Close Preview
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="p-6">
            <InvoiceWrapper
              billNo="PREVIEW-001"
              date={invoiceDate}
              customerName={selectedCustomer?.customer_name || "Customer Name"}
              customerAddress={selectedCustomer?.address || ""}
              customerMobile={selectedCustomer?.phone || ""}
              customerGSTIN={selectedCustomer?.gst_number || ""}
              items={lineItems
                .filter(item => item.productId)
                .map((item, index) => ({
                  sr: index + 1,
                  particulars: item.productName,
                  size: item.size,
                  barcode: item.barcode,
                  hsn: "",
                  sp: item.mrp,
                  qty: item.quantity,
                  rate: item.salePrice,
                  total: item.lineTotal,
                }))}
              subTotal={grossAmount}
              discount={totalDiscount}
              grandTotal={netAmount}
              paymentMethod="Cash"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Confirmation Dialog */}
      <AlertDialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Print Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Invoice {savedInvoiceData?.invoiceNumber} has been saved successfully.
              Would you like to print it now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleClosePrintDialog}>
              Skip
            </AlertDialogCancel>
            <AlertDialogAction onClick={handlePrintInvoice}>
              Print Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden Invoice for Printing */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <InvoiceWrapper
          ref={printRef}
          billNo={savedInvoiceData?.invoiceNumber || `DRAFT-${Date.now()}`}
          date={invoiceDate}
          customerName={savedInvoiceData?.customer.customer_name || selectedCustomer?.customer_name || ""}
          customerAddress={savedInvoiceData?.customer.address || selectedCustomer?.address || ""}
          customerMobile={savedInvoiceData?.customer.phone || selectedCustomer?.phone || ""}
          customerGSTIN={savedInvoiceData?.customer.gst_number || selectedCustomer?.gst_number || ""}
          items={(savedInvoiceData?.filledItems || lineItems.filter(item => item.productId)).map((item: any, index: number) => ({
              sr: index + 1,
              particulars: item.productName,
              size: item.size,
              barcode: item.barcode || "",
              hsn: "",
              sp: item.mrp,
              qty: item.quantity,
              rate: item.salePrice,
              total: item.lineTotal,
            }))}
            subTotal={grossAmount}
            discount={totalDiscount}
            grandTotal={netAmount}
            paymentMethod="Cash"
          />
        </div>
    </div>
  );
}
