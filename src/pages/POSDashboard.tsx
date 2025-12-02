import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Receipt, Search, ChevronDown, ChevronRight, Printer, Plus, Edit, Trash2, MessageCircle, Eye, Link2, Settings2, IndianRupee, Send } from "lucide-react";
import { format } from "date-fns";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useReactToPrint } from "react-to-print";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useQuery } from "@tanstack/react-query";

interface SaleItem {
  id: string;
  product_id: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  mrp: number;
  discount_percent: number;
  gst_percent: number;
  line_total: number;
  barcode: string;
  variant_id: string;
}

interface Sale {
  id: string;
  sale_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  sale_date: string;
  gross_amount: number;
  discount_amount: number;
  flat_discount_amount: number;
  round_off: number;
  net_amount: number;
  payment_method: string;
  payment_status: string;
  paid_amount?: number;
  created_at: string;
}

const POSDashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const { formatMessage } = useWhatsAppTemplates();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [saleItems, setSaleItems] = useState<Record<string, SaleItem[]>>({});
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [printData, setPrintData] = useState<any>(null);
  const invoicePrintRef = useRef<HTMLDivElement>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [posBillFormat, setPosBillFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal'>('thermal');
  const [posInvoiceTemplate, setPosInvoiceTemplate] = useState<'professional' | 'modern' | 'classic' | 'compact'>('professional');
  
  // Column visibility state with localStorage persistence
  const [columnSettings, setColumnSettings] = useState(() => {
    const saved = localStorage.getItem('pos-dashboard-columns');
    return saved ? JSON.parse(saved) : {
      status: true,
      whatsapp: true,
      copyLink: true,
      preview: true,
      print: true,
      modify: true,
    };
  });

  const updateColumnSetting = (key: string, value: boolean) => {
    const newSettings = { ...columnSettings, [key]: value };
    setColumnSettings(newSettings);
    localStorage.setItem('pos-dashboard-columns', JSON.stringify(newSettings));
  };

  // Payment recording state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedSaleForPayment, setSelectedSaleForPayment] = useState<any>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paymentNarration, setPaymentNarration] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  
  // Receipt state
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Fetch company settings for receipt branding
  const { data: settings } = useQuery({
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

  useEffect(() => {
    const loadData = async () => {
      await fetchSales();
      fetchPosBillFormat();
    };
    loadData();
  }, [currentOrganization]);

  const fetchPosBillFormat = async () => {
    if (!currentOrganization?.id) return;
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('sale_settings')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();

      if (!error && data?.sale_settings) {
        const settings = data.sale_settings as any;
        if (settings.pos_bill_format) {
          setPosBillFormat(settings.pos_bill_format);
        }
        if (settings.invoice_template) {
          setPosInvoiceTemplate(settings.invoice_template);
        }
      }
    } catch (error) {
      console.error('Error fetching POS bill format:', error);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        if (expandedSale && sales.length > 0) {
          const sale = sales.find(s => s.id === expandedSale);
          if (sale) {
            handlePrintClick(sale, { stopPropagation: () => {} } as React.MouseEvent);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [expandedSale, sales]);

  const fetchSales = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("sale_type", "pos")
        .order("sale_date", { ascending: false });

      if (error) throw error;
      setSales(data || []);
      
      // Fetch all sale items upfront for quantity calculation
      if (data && data.length > 0) {
        const saleIds = data.map(sale => sale.id);
        const { data: itemsData, error: itemsError } = await supabase
          .from("sale_items")
          .select("*")
          .in("sale_id", saleIds);
        
        if (!itemsError && itemsData) {
          const itemsBySale: Record<string, SaleItem[]> = {};
          itemsData.forEach(item => {
            if (!itemsBySale[item.sale_id]) {
              itemsBySale[item.sale_id] = [];
            }
            itemsBySale[item.sale_id].push(item);
          });
          setSaleItems(itemsBySale);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load sales",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSaleItems = async (saleId: string): Promise<SaleItem[]> => {
    if (saleItems[saleId]) return saleItems[saleId];

    try {
      const { data, error } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", saleId);

      if (error) throw error;

      const items = data || [];
      setSaleItems((prev) => ({ ...prev, [saleId]: items }));
      return items;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load sale items",
        variant: "destructive",
      });
      return [];
    }
  };

  const toggleExpanded = async (saleId: string) => {
    if (expandedSale === saleId) {
      setExpandedSale(null);
    } else {
      setExpandedSale(saleId);
      await fetchSaleItems(saleId);
    }
  };

  // Stock restoration is now handled automatically by database triggers
  // No need for manual stock restoration code

  const handleDeleteSale = async () => {
    if (!saleToDelete) return;

    setIsDeleting(true);
    try {
      // Delete sale_items first - trigger will automatically restore stock
      const { error: itemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", saleToDelete.id);

      if (itemsError) throw itemsError;

      // Then delete the sale record
      const { error: saleError } = await supabase
        .from("sales")
        .delete()
        .eq("id", saleToDelete.id);

      if (saleError) throw saleError;

      toast({
        title: "Success",
        description: `Sale ${saleToDelete.sale_number} deleted and stock restored`,
      });

      await fetchSales();
    } catch (error: any) {
      console.error("Error deleting sale:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete sale",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setSaleToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSales.size === 0) return;

    setIsDeleting(true);
    try {
      const salesToDelete = Array.from(selectedSales);
      
      // Delete sale_items for all sales - triggers will automatically restore stock
      for (const saleId of salesToDelete) {
        const { error: itemsError } = await supabase
          .from("sale_items")
          .delete()
          .eq("sale_id", saleId);

        if (itemsError) throw itemsError;

        const { error: saleError } = await supabase
          .from("sales")
          .delete()
          .eq("id", saleId);

        if (saleError) throw saleError;
      }

      toast({
        title: "Success",
        description: `${salesToDelete.length} sale(s) deleted and stock restored`,
      });

      setSelectedSales(new Set());
      setShowBulkDeleteDialog(false);
      await fetchSales();
    } catch (error: any) {
      console.error("Error deleting sales:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete sales",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedSales.size === filteredSales.length && filteredSales.length > 0) {
      setSelectedSales(new Set());
    } else {
      setSelectedSales(new Set(filteredSales.map(s => s.id)));
    }
  };

  const toggleSelectSale = (saleId: string) => {
    const newSelected = new Set(selectedSales);
    if (newSelected.has(saleId)) {
      newSelected.delete(saleId);
    } else {
      newSelected.add(saleId);
    }
    setSelectedSales(newSelected);
  };

  const handleEditSale = (saleId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    navigate(`/pos-sales?saleId=${saleId}`);
  };

  const getPageStyle = () => {
    const format = posBillFormat;
    let size = 'A5 portrait';
    let margin = '5mm';
    
    switch (format) {
      case 'a5-horizontal':
        size = 'A5 landscape';
        break;
      case 'a4':
        size = 'A4 portrait';
        margin = '10mm';
        break;
      case 'thermal':
        size = '80mm auto';
        margin = '3mm';
        break;
      default: // a5-vertical
        size = 'A5 portrait';
        break;
    }
    
    return `
      @page {
        size: ${size};
        margin: ${margin};
      }
      @media print {
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        * {
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
        }
      }
    `;
  };

  const handlePrint = useReactToPrint({
    contentRef: invoicePrintRef,
    documentTitle: printData?.billNo || "Invoice",
    pageStyle: getPageStyle(),
    onAfterPrint: () => {
      toast({
        title: "Success",
        description: "Invoice printed successfully",
      });
    },
  });

  const handlePrintClick = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const items = await fetchSaleItems(sale.id);
    
    try {
      const saleDate = new Date(sale.sale_date);

      const invoiceData = {
        billNo: sale.sale_number,
        date: saleDate,
        customerName: sale.customer_name,
        customerAddress: sale.customer_address || '',
        customerMobile: sale.customer_phone || '',
        items: items.map((item, index) => ({
          sr: index + 1,
          particulars: item.product_name,
          size: item.size,
          barcode: item.barcode || '',
          hsn: '',
          sp: item.mrp,
          qty: item.quantity,
          rate: item.unit_price,
          total: item.line_total,
        })),
        subTotal: sale.gross_amount,
        discount: sale.discount_amount + sale.flat_discount_amount,
        grandTotal: sale.net_amount,
        cashPaid: sale.payment_method === 'cash' ? sale.net_amount : 0,
        upiPaid: sale.payment_method === 'upi' ? sale.net_amount : 0,
        paymentMethod: sale.payment_method,
      };

      setPrintData(invoiceData);
      
      // Small delay to ensure InvoiceWrapper is fully rendered
      await new Promise(resolve => setTimeout(resolve, 300));
      handlePrint();
      
      toast({
        title: "Printing Invoice",
        description: `Invoice ${sale.sale_number} sent to printer`,
      });
    } catch (error: any) {
      console.error('Error printing invoice:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to print invoice",
      });
    }
  };

  const handleWhatsAppShare = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!sale.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send WhatsApp message",
        variant: "destructive",
      });
      return;
    }

    const items = await fetchSaleItems(sale.id);
    
    const itemsList = items.map((item, index) => 
      `${index + 1}. ${item.product_name} (${item.size}) - Qty: ${item.quantity} - ₹${item.line_total.toFixed(2)}`
    ).join('\n');

    // Generate invoice URL
    const invoiceUrl = `${window.location.origin}/invoice/view/${sale.id}`;
    
    // Use template for message
    const templateMessage = formatMessage('sales_invoice', {
      sale_number: sale.sale_number,
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      sale_date: sale.sale_date,
      net_amount: sale.net_amount,
      payment_status: sale.payment_status,
    }, `${itemsList}\n\n📄 View Invoice Online:\n${invoiceUrl}`);

    const phoneNumber = sale.customer_phone.replace(/\D/g, '');
    // Add country code 91 for India if not present
    let formattedPhone = phoneNumber;
    if (phoneNumber.length === 10) {
      formattedPhone = `91${phoneNumber}`;
    } else if (phoneNumber.length === 12 && phoneNumber.startsWith('91')) {
      formattedPhone = phoneNumber;
    } else if (!phoneNumber.startsWith('91')) {
      formattedPhone = `91${phoneNumber}`;
    }
    
    const encodedMessage = encodeURIComponent(templateMessage).replace(/%20/g, '+');
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
    
    // Copy message to clipboard
    navigator.clipboard.writeText(templateMessage);
    
    // Open WhatsApp
    window.location.href = whatsappUrl;
    
    toast({
      title: "WhatsApp Opened",
      description: "Message copied to clipboard! Paste with Ctrl+V if it doesn't auto-fill",
    });
  };

  const handleCopyLink = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    const invoiceUrl = `${window.location.origin}/invoice/view/${sale.id}`;
    
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      toast({
        title: "Link Copied",
        description: "Invoice link copied to clipboard",
      });
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Please copy manually: " + invoiceUrl,
        variant: "destructive",
      });
    }
  };

  const handlePreviewClick = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    await fetchSaleItems(sale.id);
    setPreviewSale(sale);
    setShowPreviewDialog(true);
  };

  const openPaymentDialog = (sale: Sale) => {
    setSelectedSaleForPayment(sale);
    const pendingAmount = sale.net_amount - (sale.paid_amount || 0);
    setPaidAmount(pendingAmount.toString());
    setPaymentDate(new Date());
    setPaymentMode("cash");
    setPaymentNarration("");
    setShowPaymentDialog(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedSaleForPayment || !paidAmount) return;

    const amount = parseFloat(paidAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    const currentPaid = (selectedSaleForPayment as any).paid_amount || 0;
    const pendingAmount = selectedSaleForPayment.net_amount - currentPaid;

    if (amount > pendingAmount) {
      toast({
        title: "Amount Exceeds Pending",
        description: `Payment amount cannot exceed pending amount of ₹${pendingAmount.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }

    setIsRecordingPayment(true);
    try {
      const newPaidAmount = currentPaid + amount;
      const newStatus = newPaidAmount >= selectedSaleForPayment.net_amount ? 'completed' : 
                       newPaidAmount > 0 ? 'partial' : 'pending';

      const { error: updateError } = await supabase
        .from('sales')
        .update({
          paid_amount: newPaidAmount,
          payment_status: newStatus,
          payment_date: format(paymentDate, 'yyyy-MM-dd'),
          payment_method: paymentMode,
        })
        .eq('id', selectedSaleForPayment.id);

      if (updateError) throw updateError;

      const { data: voucherData, error: voucherError } = await supabase.rpc(
        'generate_voucher_number',
        { p_type: 'RECEIPT', p_date: format(paymentDate, 'yyyy-MM-dd') }
      );

      if (voucherError) throw voucherError;

      const { error: voucherEntryError } = await supabase
        .from('voucher_entries')
        .insert({
          organization_id: currentOrganization?.id,
          voucher_number: voucherData,
          voucher_type: 'RECEIPT',
          voucher_date: format(paymentDate, 'yyyy-MM-dd'),
          reference_type: 'SALE',
          reference_id: selectedSaleForPayment.id,
          total_amount: amount,
          description: `Payment received for POS sale ${selectedSaleForPayment.sale_number} - ${paymentNarration}`,
        });

      if (voucherEntryError) throw voucherEntryError;

      toast({
        title: "Payment Recorded",
        description: `Payment of ₹${amount.toFixed(2)} recorded successfully`,
      });

      const newReceiptData = {
        voucherNumber: voucherData,
        date: format(paymentDate, 'yyyy-MM-dd'),
        customerName: selectedSaleForPayment.customer_name,
        customerPhone: selectedSaleForPayment.customer_phone || '',
        customerAddress: selectedSaleForPayment.customer_address || '',
        invoiceNumber: selectedSaleForPayment.sale_number,
        invoiceDate: selectedSaleForPayment.sale_date,
        invoiceAmount: selectedSaleForPayment.net_amount,
        paidAmount: amount,
        previousBalance: currentPaid,
        currentBalance: newPaidAmount,
        paymentMode: paymentMode,
        narration: paymentNarration,
      };

      setReceiptData(newReceiptData);
      setShowPaymentDialog(false);
      setShowReceiptDialog(true);
      await fetchSales();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handlePrintReceipt = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Receipt_${receiptData?.voucherNumber || 'receipt'}`,
    onAfterPrint: () => {
      toast({
        title: "Receipt Printed",
        description: "Payment receipt printed successfully",
      });
    },
  });

  const handleSendReceiptWhatsApp = () => {
    if (!receiptData || !receiptData.customerPhone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required",
        variant: "destructive",
      });
      return;
    }

    const message = `*PAYMENT RECEIPT*\n\nReceipt No: ${receiptData.voucherNumber}\nDate: ${receiptData.date ? format(new Date(receiptData.date), 'dd/MM/yyyy') : '-'}\n\nCustomer: ${receiptData.customerName}\nInvoice: ${receiptData.invoiceNumber}\n\nInvoice Amount: ₹${receiptData.invoiceAmount.toFixed(2)}\nPaid Amount: ₹${receiptData.paidAmount.toFixed(2)}\nBalance: ₹${receiptData.currentBalance.toFixed(2)}\n\nPayment Mode: ${receiptData.paymentMode.toUpperCase()}\n${receiptData.narration ? `\nNotes: ${receiptData.narration}` : ''}\n\nThank you for your payment!`;

    const phoneNumber = receiptData.customerPhone.replace(/\D/g, '');
    let formattedPhone = phoneNumber.length === 10 ? `91${phoneNumber}` : phoneNumber;
    
    const encodedMessage = encodeURIComponent(message).replace(/%20/g, '+');
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
    
    navigator.clipboard.writeText(message);
    window.location.href = whatsappUrl;
    
    toast({
      title: "WhatsApp Opened",
      description: "Receipt message copied! Paste with Ctrl+V if needed",
    });
  };

  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      sale.sale_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customer_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDateRange =
      (!startDate || new Date(sale.sale_date) >= new Date(startDate)) &&
      (!endDate || new Date(sale.sale_date) <= new Date(endDate));

    const matchesPaymentMethod =
      paymentMethodFilter === "all" || sale.payment_method === paymentMethodFilter;

    return matchesSearch && matchesDateRange && matchesPaymentMethod;
  });

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSales = filteredSales.slice(startIndex, endIndex);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate, itemsPerPage, paymentMethodFilter]);

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-background p-6">
      <BackToDashboard />
      
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              POS Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">View and manage all POS sales</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/pos-sales")} className="gap-2">
              <Plus className="h-4 w-4" />
              New Sale
            </Button>
            {selectedSales.size > 0 && (
              <Button
                onClick={() => setShowBulkDeleteDialog(true)}
                disabled={isDeleting}
                variant="destructive"
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedSales.size})
              </Button>
            )}
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/50 shadow-lg">
            <CardHeader className="pb-3">
              <CardDescription>Total Bills</CardDescription>
              <CardTitle className="text-3xl font-bold text-primary">
                {filteredSales.length}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-border/50 shadow-lg">
            <CardHeader className="pb-3">
              <CardDescription>Sale Quantity</CardDescription>
              <CardTitle className="text-3xl font-bold text-primary">
                {filteredSales.reduce((sum, sale) => {
                  const items = saleItems[sale.id] || [];
                  return sum + items.reduce((itemSum, item) => itemSum + item.quantity, 0);
                }, 0)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-border/50 shadow-lg">
            <CardHeader className="pb-3">
              <CardDescription>Sale Amount</CardDescription>
              <CardTitle className="text-3xl font-bold text-primary">
                ₹{filteredSales.reduce((sum, sale) => sum + sale.gross_amount, 0).toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-border/50 shadow-lg">
            <CardHeader className="pb-3">
              <CardDescription>Discount Amount</CardDescription>
              <CardTitle className="text-3xl font-bold text-primary">
                ₹{filteredSales.reduce((sum, sale) => sum + sale.discount_amount + sale.flat_discount_amount, 0).toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Sales Records
            </CardTitle>
            <CardDescription>Search and filter your sales history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by sale number or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
                placeholder="Start Date"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
                placeholder="End Date"
              />
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Payment Method" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Column Settings Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" title="Column Settings">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 bg-popover z-50" align="end">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Show/Hide Columns</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="col-status" className="text-sm">Status</Label>
                        <Checkbox
                          id="col-status"
                          checked={columnSettings.status}
                          onCheckedChange={(checked) => updateColumnSetting('status', !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="col-whatsapp" className="text-sm">WhatsApp</Label>
                        <Checkbox
                          id="col-whatsapp"
                          checked={columnSettings.whatsapp}
                          onCheckedChange={(checked) => updateColumnSetting('whatsapp', !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="col-link" className="text-sm">Copy Link</Label>
                        <Checkbox
                          id="col-link"
                          checked={columnSettings.copyLink}
                          onCheckedChange={(checked) => updateColumnSetting('copyLink', !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="col-preview" className="text-sm">Preview</Label>
                        <Checkbox
                          id="col-preview"
                          checked={columnSettings.preview}
                          onCheckedChange={(checked) => updateColumnSetting('preview', !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="col-print" className="text-sm">Print</Label>
                        <Checkbox
                          id="col-print"
                          checked={columnSettings.print}
                          onCheckedChange={(checked) => updateColumnSetting('print', !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="col-modify" className="text-sm">Modify</Label>
                        <Checkbox
                          id="col-modify"
                          checked={columnSettings.modify}
                          onCheckedChange={(checked) => updateColumnSetting('modify', !!checked)}
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedSales.size === filteredSales.length && filteredSales.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Sale Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment</TableHead>
                      {columnSettings.status && <TableHead>Status</TableHead>}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={columnSettings.status ? 11 : 10} className="text-center text-muted-foreground py-8">
                          No sales found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedSales.map((sale) => (
                        <>
                          <TableRow
                            key={sale.id}
                            className="cursor-pointer hover:bg-accent/50"
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedSales.has(sale.id)}
                                onCheckedChange={() => toggleSelectSale(sale.id)}
                              />
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {expandedSale === sale.id ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium" onClick={() => toggleExpanded(sale.id)}>
                              {sale.sale_number}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>{sale.customer_name}</TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {sale.customer_phone || '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {sale.sale_date ? format(new Date(sale.sale_date), "dd/MM/yyyy") : '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {saleItems[sale.id]?.reduce((sum, item) => sum + item.quantity, 0) || '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>₹{sale.net_amount.toFixed(2)}</TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              <Badge variant={sale.payment_method === "cash" ? "default" : "secondary"}>
                                {sale.payment_method}
                              </Badge>
                            </TableCell>
                            {columnSettings.status && (
                              <TableCell onClick={() => toggleExpanded(sale.id)}>
                                <Badge variant={sale.payment_status === "completed" ? "default" : "destructive"}>
                                  {sale.payment_status}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                {sale.payment_status !== 'completed' && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPaymentDialog(sale);
                                    }}
                                    title="Record Payment"
                                  >
                                    <IndianRupee className="h-4 w-4 text-purple-600" />
                                  </Button>
                                )}
                                {columnSettings.copyLink && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => handleCopyLink(sale, e)}
                                    title="Copy Invoice Link"
                                  >
                                    <Link2 className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}
                                {columnSettings.preview && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => handlePreviewClick(sale, e)}
                                    title="Preview Invoice"
                                  >
                                    <Eye className="h-4 w-4 text-primary" />
                                  </Button>
                                )}
                                {columnSettings.whatsapp && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => handleWhatsAppShare(sale, e)}
                                    title="Share on WhatsApp"
                                    disabled={!sale.customer_phone}
                                  >
                                    <MessageCircle className="h-4 w-4 text-green-600" />
                                  </Button>
                                )}
                                {columnSettings.print && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => handlePrintClick(sale, e)}
                                    title="Print Invoice (Ctrl+P)"
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                )}
                                {columnSettings.modify && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => handleEditSale(sale.id, e)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedSale === sale.id && saleItems[sale.id] && (
                            <TableRow>
                              <TableCell colSpan={columnSettings.status ? 11 : 10} className="bg-muted/50 p-4">
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm">Sale Items:</h4>
                                  <div className="rounded-md border">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Product</TableHead>
                                          <TableHead>Size</TableHead>
                                          <TableHead>Quantity</TableHead>
                                          <TableHead>MRP</TableHead>
                                          <TableHead>Unit Price</TableHead>
                                          <TableHead>Discount</TableHead>
                                          <TableHead>GST</TableHead>
                                          <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {saleItems[sale.id].map((item) => (
                                          <TableRow key={item.id}>
                                            <TableCell>{item.product_name}</TableCell>
                                            <TableCell>{item.size}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>₹{item.mrp.toFixed(2)}</TableCell>
                                            <TableCell>₹{item.unit_price.toFixed(2)}</TableCell>
                                            <TableCell>{item.discount_percent}%</TableCell>
                                            <TableCell>{item.gst_percent}%</TableCell>
                                            <TableCell className="text-right">₹{item.line_total.toFixed(2)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredSales.length > 0 && (
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredSales.length)} of {filteredSales.length} sales
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show:</span>
                    <Select value={itemsPerPage.toString()} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-2 px-3">
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Print Preview Dialog */}
      {previewSale && (
        <PrintPreviewDialog
          open={showPreviewDialog}
          onOpenChange={setShowPreviewDialog}
          defaultFormat={posBillFormat}
          renderInvoice={(format) => (
            <InvoiceWrapper
              format={format}
              billNo={previewSale.sale_number}
              date={new Date(previewSale.sale_date)}
              customerName={previewSale.customer_name}
              customerAddress={previewSale.customer_address || ''}
              customerMobile={previewSale.customer_phone || ''}
              template={posInvoiceTemplate}
              items={(saleItems[previewSale.id] || []).map((item, index) => ({
                sr: index + 1,
                particulars: item.product_name,
                size: item.size,
                barcode: item.barcode || '',
                hsn: '',
                sp: item.mrp,
                qty: item.quantity,
                rate: item.unit_price,
                total: item.line_total,
              }))}
              subTotal={previewSale.gross_amount}
              discount={previewSale.discount_amount + previewSale.flat_discount_amount}
              grandTotal={previewSale.net_amount}
              cashPaid={previewSale.payment_method === 'cash' ? previewSale.net_amount : 0}
              upiPaid={previewSale.payment_method === 'upi' ? previewSale.net_amount : 0}
              paymentMethod={previewSale.payment_method}
            />
          )}
        />
      )}

      <AlertDialog open={!!saleToDelete} onOpenChange={() => setSaleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sale</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete sale {saleToDelete?.sale_number}? Stock quantities will be restored. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSale} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedSales.size} Sale(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedSales.size} selected sale(s)? Stock quantities will be restored for all items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete} 
              className="bg-destructive hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete All'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden invoice for printing */}
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0,
        width: posBillFormat === 'a4' ? '210mm' : 
               posBillFormat === 'a5-horizontal' ? '210mm' : 
               posBillFormat === 'thermal' ? '80mm' : '148mm',
        minHeight: posBillFormat === 'a4' ? '297mm' : 
                   posBillFormat === 'a5-horizontal' ? '148mm' : 
                   posBillFormat === 'thermal' ? 'auto' : '210mm',
        maxHeight: posBillFormat === 'thermal' ? 'none' : 
                   posBillFormat === 'a4' ? '297mm' : 
                   posBillFormat === 'a5-horizontal' ? '148mm' : '210mm',
        opacity: 0, 
        pointerEvents: 'none',
        zIndex: -1,
        overflow: 'hidden'
      }}>
        {printData && (
          <InvoiceWrapper
            ref={invoicePrintRef}
            billNo={printData.billNo}
            date={printData.date}
            customerName={printData.customerName}
            customerAddress={printData.customerAddress}
            customerMobile={printData.customerMobile}
            items={printData.items}
            subTotal={printData.subTotal}
            discount={printData.discount}
            grandTotal={printData.grandTotal}
            cashPaid={printData.cashPaid}
            upiPaid={printData.upiPaid}
            paymentMethod={printData.paymentMethod}
            format={posBillFormat}
            template={posInvoiceTemplate}
          />
        )}
      </div>

      {/* Payment Recording Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record payment for POS Sale {selectedSaleForPayment?.sale_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Customer:</span>
              <span className="font-medium">{selectedSaleForPayment?.customer_name}</span>
              <span className="text-muted-foreground">Sale Amount:</span>
              <span className="font-medium">₹{selectedSaleForPayment?.net_amount.toFixed(2)}</span>
              <span className="text-muted-foreground">Paid Amount:</span>
              <span className="font-medium">₹{(selectedSaleForPayment?.paid_amount || 0).toFixed(2)}</span>
              <span className="text-muted-foreground">Pending Amount:</span>
              <span className="font-semibold text-orange-600">
                ₹{((selectedSaleForPayment?.net_amount || 0) - (selectedSaleForPayment?.paid_amount || 0)).toFixed(2)}
              </span>
            </div>
            <div>
              <Label>Payment Amount *</Label>
              <Input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="Enter amount"
                step="0.01"
              />
            </div>
            <div>
              <Label>Payment Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    {format(paymentDate, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={paymentDate}
                    onSelect={(date) => date && setPaymentDate(date)}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Payment Mode *</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Narration</Label>
              <Textarea
                value={paymentNarration}
                onChange={(e) => setPaymentNarration(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={isRecordingPayment}>
              {isRecordingPayment && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
            <DialogDescription>
              Payment recorded successfully. Print or send via WhatsApp
            </DialogDescription>
          </DialogHeader>
          
          <div className="hidden">
            <PaymentReceipt
              ref={receiptRef}
              receiptData={receiptData}
              companyDetails={{
                businessName: settings?.business_name,
                address: settings?.address,
                mobileNumber: settings?.mobile_number,
                emailId: settings?.email_id,
                gstNumber: settings?.gst_number,
                logoUrl: (settings?.sale_settings as any)?.logoUrl,
                upiId: (settings?.sale_settings as any)?.upiId,
              }}
              receiptSettings={{
                showCompanyLogo: true,
                showQrCode: !!(settings?.sale_settings as any)?.upiId,
                showSignature: true,
                signatureLabel: "Authorized Signature"
              }}
            />
          </div>
          
          <div className="border rounded-lg p-4 bg-gray-50">
            <PaymentReceipt
              receiptData={receiptData}
              companyDetails={{
                businessName: settings?.business_name,
                address: settings?.address,
                mobileNumber: settings?.mobile_number,
                emailId: settings?.email_id,
                gstNumber: settings?.gst_number,
                logoUrl: (settings?.sale_settings as any)?.logoUrl,
                upiId: (settings?.sale_settings as any)?.upiId,
              }}
              receiptSettings={{
                showCompanyLogo: true,
                showQrCode: !!(settings?.sale_settings as any)?.upiId,
                showSignature: true,
                signatureLabel: "Authorized Signature"
              }}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReceiptDialog(false)}>
              Close
            </Button>
            <Button variant="outline" onClick={handlePrintReceipt}>
              <Printer className="h-4 w-4 mr-2" />
              Print Receipt
            </Button>
            <Button onClick={handleSendReceiptWhatsApp}>
              <Send className="h-4 w-4 mr-2" />
              Send via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSDashboard;
