import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { Search, Printer, Edit, ChevronDown, ChevronUp, Trash2, Loader2, MessageCircle, Link2, Settings2, Package, IndianRupee, Send, FileText, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { useReactToPrint } from "react-to-print";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { PaymentReceipt } from "@/components/PaymentReceipt";
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
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";

interface ColumnSettings {
  [key: string]: boolean;
  status: boolean;
  delivery: boolean;
  whatsapp: boolean;
  copyLink: boolean;
  print: boolean;
  modify: boolean;
  delete: boolean;
}

const defaultColumnSettings: ColumnSettings = {
  status: true,
  delivery: true,
  whatsapp: true,
  copyLink: true,
  print: true,
  modify: true,
  delete: true,
};

export default function SalesInvoiceDashboard() {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { formatMessage } = useWhatsAppTemplates();
  const { sendWhatsApp, copyInvoiceLink } = useWhatsAppSend();
  const [searchQuery, setSearchQuery] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [invoiceToPrint, setInvoiceToPrint] = useState<any>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [billFormat, setBillFormat] = useState<'a4' | 'a5' | 'thermal'>('a4');
  const [invoiceTemplate, setInvoiceTemplate] = useState<'professional' | 'modern' | 'classic' | 'compact'>('professional');
  const [showInvoicePreviewSetting, setShowInvoicePreviewSetting] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);
  
  // Delivery status update dialog state
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedInvoiceForStatus, setSelectedInvoiceForStatus] = useState<any>(null);
  const [newDeliveryStatus, setNewDeliveryStatus] = useState<string>("");
  const [statusDate, setStatusDate] = useState<Date>(new Date());
  const [statusNarration, setStatusNarration] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [deliveryHistory, setDeliveryHistory] = useState<Record<string, any[]>>({});
  
  const { columnSettings, updateColumnSetting } = useDashboardColumnSettings(
    "sales_invoice_dashboard",
    defaultColumnSettings
  );
  
  // Sale returns state
  const [saleReturns, setSaleReturns] = useState<Record<string, any[]>>({});

  // Payment recording state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paymentNarration, setPaymentNarration] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  
  // Receipt state
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  
  // Virtual scrolling ref
  const tableContainerRef = useRef<HTMLDivElement>(null);

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
    if (currentOrganization?.id) {
      fetchBillFormat();
    }
  }, [currentOrganization?.id]);

  const fetchBillFormat = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('sale_settings')
        .eq('organization_id', currentOrganization?.id)
        .maybeSingle();

      if (error) throw error;
      if (data?.sale_settings) {
        const settings = data.sale_settings as any;
        setBillFormat(settings.sales_bill_format || 'a4');
        setInvoiceTemplate(settings.invoice_template || 'professional');
        setShowInvoicePreviewSetting(settings.show_invoice_preview ?? true);
      }
    } catch (error) {
      console.error('Error fetching bill format:', error);
    }
  };

  const { data: invoicesData, isLoading, refetch } = useQuery({
    queryKey: ['invoices', currentOrganization?.id, searchQuery, deliveryFilter],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      let query = supabase
        .from('sales')
        .select(`*, sale_items (*)`)
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'invoice')
        .order('created_at', { ascending: false });

      // Note: Basic search query for sale-level fields
      // Barcode search will be done client-side after fetching sale_items

      if (deliveryFilter !== 'all') {
        query = query.eq('delivery_status', deliveryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Stock restoration is now handled automatically by database triggers
  // No need for manual stock restoration code
  
  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    setIsDeleting(true);
    try {
      // Delete sale_items first - trigger will automatically restore stock
      const { error: itemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", invoiceToDelete.id);

      if (itemsError) throw itemsError;

      // Then delete the sale record
      const { error: saleError } = await supabase
        .from("sales")
        .delete()
        .eq("id", invoiceToDelete.id);

      if (saleError) throw saleError;

      toast({
        title: "Success",
        description: `Invoice ${invoiceToDelete.sale_number} deleted and stock restored`,
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoice",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setInvoiceToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedInvoices.size === 0) return;

    setIsDeleting(true);
    try {
      const invoicesToDelete = Array.from(selectedInvoices);
      
      // Delete sale_items for all invoices - triggers will automatically restore stock
      for (const invoiceId of invoicesToDelete) {
        const { error: itemsError } = await supabase
          .from("sale_items")
          .delete()
          .eq("sale_id", invoiceId);

        if (itemsError) throw itemsError;

        const { error: saleError } = await supabase
          .from("sales")
          .delete()
          .eq("id", invoiceId);

        if (saleError) throw saleError;
      }

      toast({
        title: "Success",
        description: `${invoicesToDelete.length} invoice(s) deleted and stock restored`,
      });

      setSelectedInvoices(new Set());
      setShowBulkDeleteDialog(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoices",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Note: toggleSelectAll moved after filteredInvoices is defined

  const fetchSaleReturns = async (saleNumber: string, saleId: string) => {
    try {
      const { data, error } = await supabase
        .from('sale_returns')
        .select('*')
        .eq('organization_id', currentOrganization?.id)
        .eq('original_sale_number', saleNumber)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setSaleReturns(prev => ({
        ...prev,
        [saleId]: data || []
      }));
    } catch (error) {
      console.error('Error fetching sale returns:', error);
    }
  };

  const toggleExpanded = useCallback((id: string, saleNumber?: string) => {
    setExpandedRows(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
        if (saleNumber) {
          fetchSaleReturns(saleNumber, id);
        }
      }
      return newExpanded;
    });
  }, [currentOrganization?.id]);

  // Memoize filtered invoices to avoid recomputing on every render
  const filteredInvoices = useMemo(() => {
    return (invoicesData || []).filter((invoice: any) => {
      if (!searchQuery) return true;
      
      const searchLower = searchQuery.toLowerCase();
      
      // Check basic invoice fields
      const matchesBasicSearch = 
        invoice.sale_number?.toLowerCase().includes(searchLower) ||
        invoice.customer_name?.toLowerCase().includes(searchLower) ||
        invoice.customer_phone?.toLowerCase().includes(searchLower);
      
      // Check barcode in sale items
      const matchesBarcodeSearch = invoice.sale_items?.some((item: any) => 
        item.barcode?.toLowerCase().includes(searchLower) ||
        item.product_name?.toLowerCase().includes(searchLower)
      );
      
      return matchesBasicSearch || matchesBarcodeSearch;
    });
  }, [invoicesData, searchQuery]);

  // Memoize summary statistics
  const summaryStats = useMemo(() => ({
    totalInvoices: filteredInvoices.length,
    totalAmount: filteredInvoices.reduce((sum: number, inv: any) => sum + (inv.net_amount || 0), 0),
    pendingAmount: filteredInvoices
      .filter((inv: any) => inv.payment_status !== 'completed')
      .reduce((sum: number, inv: any) => sum + (inv.net_amount - (inv.paid_amount || 0)), 0),
    deliveredCount: filteredInvoices.filter((inv: any) => inv.delivery_status === 'delivered').length,
    deliveredAmount: filteredInvoices.filter((inv: any) => inv.delivery_status === 'delivered').reduce((sum: number, inv: any) => sum + (inv.net_amount || 0), 0),
    undeliveredCount: filteredInvoices.filter((inv: any) => inv.delivery_status !== 'delivered').length,
    undeliveredAmount: filteredInvoices.filter((inv: any) => inv.delivery_status !== 'delivered').reduce((sum: number, inv: any) => sum + (inv.net_amount || 0), 0),
  }), [filteredInvoices]);

  // Memoize pagination calculations
  const totalPages = useMemo(() => Math.ceil(filteredInvoices.length / itemsPerPage), [filteredInvoices.length, itemsPerPage]);
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredInvoices.slice(startIndex, endIndex);
  }, [filteredInvoices, currentPage, itemsPerPage]);

  // Memoized event handlers (defined after filteredInvoices/paginatedInvoices)
  const toggleSelectAll = useCallback(() => {
    if (selectedInvoices.size === filteredInvoices.length && filteredInvoices.length > 0) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(filteredInvoices.map((i: any) => i.id)));
    }
  }, [selectedInvoices.size, filteredInvoices]);

  const toggleSelectInvoice = useCallback((invoiceId: string) => {
    setSelectedInvoices(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(invoiceId)) {
        newSelected.delete(invoiceId);
      } else {
        newSelected.add(invoiceId);
      }
      return newSelected;
    });
  }, []);

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
  }, [searchQuery, itemsPerPage]);

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const getPageStyle = () => {
    const format = billFormat;
    let size = 'A4 portrait';
    let margin = '10mm';
    
    switch (format) {
      case 'a5':
        size = 'A5 portrait';
        margin = '5mm';
        break;
      case 'thermal':
        size = '80mm auto';
        margin = '3mm';
        break;
      default: // a4
        size = 'A4 portrait';
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
    contentRef: printRef,
    pageStyle: getPageStyle(),
    onAfterPrint: () => {
      setInvoiceToPrint(null);
      toast({
        title: "Success",
        description: "Invoice printed successfully",
      });
    },
  });

  const handlePrintInvoice = (invoice: any) => {
    setInvoiceToPrint(invoice);
    if (showInvoicePreviewSetting) {
      setShowPrintPreview(true);
    } else {
      // Direct print without preview
      setTimeout(() => {
        handlePrint();
      }, 100);
    }
  };

  const handleWhatsAppShare = (invoice: any) => {
    if (!invoice.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send WhatsApp message",
        variant: "destructive",
      });
      return;
    }

    const itemsList = invoice.sale_items?.map((item: any, index: number) => 
      `${index + 1}. ${item.product_name} (${item.size}) - Qty: ${item.quantity} - ₹${item.line_total.toFixed(2)}`
    ).join('\n') || '';

    // Generate invoice URL
    const invoiceUrl = `${window.location.origin}/invoice/view/${invoice.id}`;
    
    // Use template for message
    const templateMessage = formatMessage('sales_invoice', {
      sale_number: invoice.sale_number,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      sale_date: invoice.sale_date,
      net_amount: invoice.net_amount,
      payment_status: invoice.payment_status,
    }, `${itemsList}\n\n📄 View Invoice Online:\n${invoiceUrl}${invoice.terms_conditions ? `\n\n*Terms & Conditions:*\n${invoice.terms_conditions}` : ''}`);

    sendWhatsApp(invoice.customer_phone, templateMessage);
  };

  const handleCopyLink = async (invoice: any) => {
    const invoiceUrl = `${window.location.origin}/invoice/view/${invoice.id}`;
    copyInvoiceLink(invoiceUrl);
  };

  const handlePaymentReminder = (invoice: any) => {
    if (!invoice.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send payment reminder",
        variant: "destructive",
      });
      return;
    }

    // Use payment_reminder template
    const reminderMessage = formatMessage('payment_reminder', {
      sale_number: invoice.sale_number,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      sale_date: invoice.sale_date,
      net_amount: invoice.net_amount,
      payment_status: invoice.payment_status,
      paid_amount: invoice.paid_amount || 0,
      due_date: invoice.due_date,
    });

    sendWhatsApp(invoice.customer_phone, reminderMessage);
  };

  const openPaymentDialog = (invoice: any) => {
    setSelectedInvoiceForPayment(invoice);
    const pendingAmount = invoice.net_amount - (invoice.paid_amount || 0);
    setPaidAmount(pendingAmount.toString());
    setPaymentDate(new Date());
    setPaymentMode("cash");
    setPaymentNarration("");
    setShowPaymentDialog(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoiceForPayment || !paidAmount) return;

    const amount = parseFloat(paidAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    const currentPaid = selectedInvoiceForPayment.paid_amount || 0;
    const pendingAmount = selectedInvoiceForPayment.net_amount - currentPaid;

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
      const newStatus = newPaidAmount >= selectedInvoiceForPayment.net_amount ? 'completed' : 
                       newPaidAmount > 0 ? 'partial' : 'pending';

      // Update sales table
      const { error: updateError } = await supabase
        .from('sales')
        .update({
          paid_amount: newPaidAmount,
          payment_status: newStatus,
          payment_date: format(paymentDate, 'yyyy-MM-dd'),
          payment_method: paymentMode,
        })
        .eq('id', selectedInvoiceForPayment.id);

      if (updateError) throw updateError;

      // Generate voucher number
      const { data: voucherData, error: voucherError } = await supabase.rpc(
        'generate_voucher_number',
        { p_type: 'RECEIPT', p_date: format(paymentDate, 'yyyy-MM-dd') }
      );

      if (voucherError) throw voucherError;

      // Create voucher entry
      const { data: voucherEntry, error: voucherEntryError } = await supabase
        .from('voucher_entries')
        .insert({
          organization_id: currentOrganization?.id,
          voucher_number: voucherData,
          voucher_type: 'RECEIPT',
          voucher_date: format(paymentDate, 'yyyy-MM-dd'),
          reference_type: 'SALE',
          reference_id: selectedInvoiceForPayment.id,
          total_amount: amount,
          description: `Payment received for invoice ${selectedInvoiceForPayment.sale_number} - ${paymentNarration}`,
          created_by: user?.id,
        })
        .select()
        .single();

      if (voucherEntryError) throw voucherEntryError;

      toast({
        title: "Payment Recorded",
        description: `Payment of ₹${amount.toFixed(2)} recorded successfully`,
      });

      // Prepare receipt data
      const newReceiptData = {
        voucherNumber: voucherData,
        voucherDate: format(paymentDate, 'yyyy-MM-dd'),
        customerName: selectedInvoiceForPayment.customer_name,
        customerPhone: selectedInvoiceForPayment.customer_phone || '',
        customerAddress: selectedInvoiceForPayment.customer_address || '',
        invoiceNumber: selectedInvoiceForPayment.sale_number,
        invoiceDate: selectedInvoiceForPayment.sale_date,
        invoiceAmount: selectedInvoiceForPayment.net_amount,
        paidAmount: amount,
        previousBalance: selectedInvoiceForPayment.net_amount - currentPaid,
        currentBalance: selectedInvoiceForPayment.net_amount - newPaidAmount,
        paymentMethod: paymentMode,
        narration: paymentNarration,
      };

      setReceiptData(newReceiptData);
      setShowPaymentDialog(false);
      setShowReceiptDialog(true);
      refetch();
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

    const message = `*PAYMENT RECEIPT*\n\nReceipt No: ${receiptData.voucherNumber}\nDate: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), 'dd/MM/yyyy') : '-'}\n\nCustomer: ${receiptData.customerName}\nInvoice: ${receiptData.invoiceNumber}\n\nInvoice Amount: ₹${receiptData.invoiceAmount.toFixed(2)}\nPaid Amount: ₹${receiptData.paidAmount.toFixed(2)}\nBalance: ₹${receiptData.currentBalance.toFixed(2)}\n\nPayment Mode: ${receiptData.paymentMode.toUpperCase()}\n${receiptData.narration ? `\nNotes: ${receiptData.narration}` : ''}\n\nThank you for your payment!`;

    sendWhatsApp(receiptData.customerPhone, message);
  };

  const openStatusDialog = async (invoice: any) => {
    setSelectedInvoiceForStatus(invoice);
    setNewDeliveryStatus(invoice.delivery_status || 'undelivered');
    setStatusDate(new Date());
    setStatusNarration("");
    setShowStatusDialog(true);

    // Fetch delivery history
    const { data, error } = await supabase
      .from('delivery_tracking')
      .select('*')
      .eq('sale_id', invoice.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setDeliveryHistory(prev => ({ ...prev, [invoice.id]: data }));
    }
  };

  const handleUpdateDeliveryStatus = async () => {
    if (!selectedInvoiceForStatus || !newDeliveryStatus) return;

    setIsUpdatingStatus(true);
    try {
      // Update sales table
      const { error: updateError } = await supabase
        .from('sales')
        .update({ delivery_status: newDeliveryStatus })
        .eq('id', selectedInvoiceForStatus.id);

      if (updateError) throw updateError;

      // Insert delivery tracking record
      const { error: trackingError } = await supabase
        .from('delivery_tracking')
        .insert({
          sale_id: selectedInvoiceForStatus.id,
          organization_id: currentOrganization?.id,
          status: newDeliveryStatus,
          status_date: format(statusDate, 'yyyy-MM-dd'),
          narration: statusNarration || null,
          created_by: user?.id,
        });

      if (trackingError) throw trackingError;

      toast({
        title: "Status Updated",
        description: `Delivery status updated to ${newDeliveryStatus}`,
      });

      setShowStatusDialog(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update delivery status",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getDeliveryBadgeVariant = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'default'; // Green
      case 'in_process':
        return 'secondary'; // Yellow/Orange
      case 'undelivered':
      default:
        return 'outline'; // Red/Gray
    }
  };

  const getDeliveryBadgeClass = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in_process':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'undelivered':
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getDeliveryLabel = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'Delivered';
      case 'in_process':
        return 'In Process';
      case 'undelivered':
      default:
        return 'Undelivered';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-background p-6">
      
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Sales Invoice Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">View and manage all sales invoices</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate("/sales-invoice")}>
              New Invoice
            </Button>
            {selectedInvoices.size > 0 && (
              <Button
                onClick={() => setShowBulkDeleteDialog(true)}
                disabled={isDeleting}
                variant="destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedInvoices.size})
              </Button>
            )}
          </div>
        </div>

        {/* Summary Statistics - Colorful Clickable Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-blue-500 hover:scale-[1.02]"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Total Invoices</CardDescription>
              <FileText className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{summaryStats.totalInvoices}</div>
              <p className="text-xs text-muted-foreground">All invoices</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-green-500 hover:scale-[1.02]"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Total Revenue</CardDescription>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">₹{summaryStats.totalAmount.toFixed(0)}</div>
              <p className="text-xs text-muted-foreground">Net amount</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-orange-500 hover:scale-[1.02]"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Pending Amount</CardDescription>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">₹{summaryStats.pendingAmount.toFixed(0)}</div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-emerald-500 hover:scale-[1.02]"
            onClick={() => setDeliveryFilter("delivered")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Delivered</CardDescription>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{summaryStats.deliveredCount}</div>
              <p className="text-xs text-muted-foreground">₹{summaryStats.deliveredAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all border-l-4 border-l-red-500 hover:scale-[1.02]"
            onClick={() => setDeliveryFilter("undelivered")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Undelivered</CardDescription>
              <Package className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summaryStats.undeliveredCount}</div>
              <p className="text-xs text-muted-foreground">₹{summaryStats.undeliveredAmount.toFixed(0)}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice, customer, barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="in_process">In Process</SelectItem>
                  <SelectItem value="undelivered">Undelivered</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" title="Column Settings">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56" align="end">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Show Columns</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="col-status"
                          checked={columnSettings.status}
                          onCheckedChange={(checked) => updateColumnSetting('status', !!checked)}
                        />
                        <Label htmlFor="col-status" className="text-sm">Payment Status</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="col-delivery"
                          checked={columnSettings.delivery}
                          onCheckedChange={(checked) => updateColumnSetting('delivery', !!checked)}
                        />
                        <Label htmlFor="col-delivery" className="text-sm">Delivery Status</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="col-whatsapp"
                          checked={columnSettings.whatsapp}
                          onCheckedChange={(checked) => updateColumnSetting('whatsapp', !!checked)}
                        />
                        <Label htmlFor="col-whatsapp" className="text-sm">WhatsApp</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="col-copyLink"
                          checked={columnSettings.copyLink}
                          onCheckedChange={(checked) => updateColumnSetting('copyLink', !!checked)}
                        />
                        <Label htmlFor="col-copyLink" className="text-sm">Copy Link</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="col-print"
                          checked={columnSettings.print}
                          onCheckedChange={(checked) => updateColumnSetting('print', !!checked)}
                        />
                        <Label htmlFor="col-print" className="text-sm">Print</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="col-modify"
                          checked={columnSettings.modify}
                          onCheckedChange={(checked) => updateColumnSetting('modify', !!checked)}
                        />
                        <Label htmlFor="col-modify" className="text-sm">Modify</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="col-delete"
                          checked={columnSettings.delete}
                          onCheckedChange={(checked) => updateColumnSetting('delete', !!checked)}
                        />
                        <Label htmlFor="col-delete" className="text-sm">Delete</Label>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div 
                ref={tableContainerRef}
                className="rounded-md border max-h-[600px] overflow-auto"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedInvoices.size === (invoicesData?.length || 0) && invoicesData && invoicesData.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      {columnSettings.status && <TableHead>Pay Status</TableHead>}
                      {columnSettings.delivery && <TableHead>Delivery</TableHead>}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9 + (columnSettings.status ? 1 : 0) + (columnSettings.delivery ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedInvoices.map((invoice: any) => (
                        <>
                          <TableRow key={invoice.id} className="cursor-pointer hover:bg-accent/50">
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedInvoices.has(invoice.id)}
                                onCheckedChange={() => toggleSelectInvoice(invoice.id)}
                              />
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                              {expandedRows.has(invoice.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium" onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                              {invoice.sale_number}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>{invoice.customer_name}</TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                              {invoice.customer_phone || '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                              {invoice.sale_date ? format(new Date(invoice.sale_date), 'dd/MM/yyyy') : '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>₹{invoice.net_amount.toFixed(2)}</TableCell>
                            {columnSettings.status && (
                              <TableCell onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                                <Badge variant={invoice.payment_status === 'completed' ? 'default' : 'secondary'}>
                                  {invoice.payment_status}
                                </Badge>
                              </TableCell>
                            )}
                            {columnSettings.delivery && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Badge 
                                  className={`cursor-pointer ${getDeliveryBadgeClass(invoice.delivery_status || 'undelivered')}`}
                                  onClick={() => openStatusDialog(invoice)}
                                >
                                  {getDeliveryLabel(invoice.delivery_status || 'undelivered')}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-2">
                                {invoice.payment_status !== 'completed' && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => openPaymentDialog(invoice)}
                                    title="Record Payment"
                                  >
                                    <IndianRupee className="h-4 w-4 text-purple-600" />
                                  </Button>
                                )}
                                {columnSettings.copyLink && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => handleCopyLink(invoice)}
                                    title="Copy Invoice Link"
                                  >
                                    <Link2 className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}
                                {columnSettings.whatsapp && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => handleWhatsAppShare(invoice)}
                                    title="Share on WhatsApp"
                                    disabled={!invoice.customer_phone}
                                  >
                                    <MessageCircle className="h-4 w-4 text-green-600" />
                                  </Button>
                                )}
                                {invoice.payment_status !== 'completed' && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => handlePaymentReminder(invoice)}
                                    title="Send Payment Reminder"
                                    disabled={!invoice.customer_phone}
                                  >
                                    <MessageCircle className="h-4 w-4 text-orange-600" />
                                  </Button>
                                )}
                                {columnSettings.print && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => handlePrintInvoice(invoice)}
                                    title="Print Invoice"
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                )}
                                {columnSettings.modify && (
                                  <Button variant="ghost" size="icon" onClick={() => navigate('/sales-invoice', { state: { invoiceData: invoice } })}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                                {columnSettings.delete && (
                                  <Button variant="ghost" size="icon" onClick={() => setInvoiceToDelete(invoice)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(invoice.id) && (
                            <TableRow>
                              <TableCell colSpan={9 + (columnSettings.status ? 1 : 0) + (columnSettings.delivery ? 1 : 0)} className="bg-muted/50 p-4">
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="font-semibold mb-2">Items:</h4>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Product</TableHead>
                                          <TableHead>Size</TableHead>
                                          <TableHead>Qty</TableHead>
                                          <TableHead>Price</TableHead>
                                          <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {invoice.sale_items?.map((item: any) => (
                                          <TableRow key={item.id}>
                                            <TableCell>{item.product_name}</TableCell>
                                            <TableCell>{item.size}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>₹{item.unit_price.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">₹{item.line_total.toFixed(2)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>

                                  {deliveryHistory[invoice.id] && deliveryHistory[invoice.id].length > 0 && (
                                    <div className="border-t pt-3">
                                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                                        <Package className="h-4 w-4" />
                                        Delivery History:
                                      </h4>
                                      <div className="space-y-1">
                                        {deliveryHistory[invoice.id].map((history: any, idx: number) => (
                                          <div key={idx} className="text-sm flex gap-3 p-2 bg-background rounded">
                                            <span className="font-medium text-muted-foreground min-w-[90px]">
                                              {history.status_date ? format(new Date(history.status_date), 'dd/MM/yyyy') : '-'}
                                            </span>
                                            <Badge className={`${getDeliveryBadgeClass(history.status)} text-xs`}>
                                              {getDeliveryLabel(history.status)}
                                            </Badge>
                                            {history.narration && (
                                              <span className="text-muted-foreground">- {history.narration}</span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {saleReturns[invoice.id] && saleReturns[invoice.id].length > 0 && (
                                    <div className="border-t pt-3">
                                      <h4 className="font-semibold mb-2 text-orange-600">Linked Sale Returns:</h4>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Return No</TableHead>
                                            <TableHead>Return Date</TableHead>
                                            <TableHead>Customer</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead>Notes</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {saleReturns[invoice.id].map((saleReturn: any) => (
                                            <TableRow key={saleReturn.id}>
                                              <TableCell>
                                                <Badge variant="outline" className="text-orange-600">
                                                  {saleReturn.return_number || '-'}
                                                </Badge>
                                              </TableCell>
                                              <TableCell>
                                                {saleReturn.return_date ? format(new Date(saleReturn.return_date), 'dd/MM/yyyy') : '-'}
                                              </TableCell>
                                              <TableCell>{saleReturn.customer_name}</TableCell>
                                              <TableCell className="text-right text-orange-600">
                                                -₹{saleReturn.net_amount.toFixed(2)}
                                              </TableCell>
                                              <TableCell className="text-muted-foreground">
                                                {saleReturn.notes || '-'}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}
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

            {invoicesData && invoicesData.length > 0 && (
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredInvoices.length)} of {filteredInvoices.length} invoices
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
                        <SelectItem value="200">200</SelectItem>
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
          </div>
        </Card>
      </div>

      <AlertDialog open={!!invoiceToDelete} onOpenChange={() => setInvoiceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invoice {invoiceToDelete?.sale_number}? Stock quantities will be restored. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInvoice} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedInvoices.size} Invoice(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedInvoices.size} selected invoice(s)? Stock quantities will be restored for all items. This action cannot be undone.
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

        {/* Delivery Status Update Dialog */}
        <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Update Delivery Status</DialogTitle>
              <DialogDescription>
                Update the delivery status for invoice {selectedInvoiceForStatus?.sale_number}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={newDeliveryStatus} onValueChange={setNewDeliveryStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="in_process">In Process</SelectItem>
                    <SelectItem value="undelivered">Undelivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Date</Label>
                <Calendar
                  mode="single"
                  selected={statusDate}
                  onSelect={(date) => date && setStatusDate(date)}
                  className="rounded-md border"
                />
              </div>

              <div className="space-y-2">
                <Label>Narration (Optional)</Label>
                <Textarea
                  placeholder="Add notes about delivery status..."
                  value={statusNarration}
                  onChange={(e) => setStatusNarration(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowStatusDialog(false)} disabled={isUpdatingStatus}>
                Cancel
              </Button>
              <Button onClick={handleUpdateDeliveryStatus} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  'Update Status'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment Recording Dialog */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>
                Record payment for Invoice {selectedInvoiceForPayment?.sale_number}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium">{selectedInvoiceForPayment?.customer_name}</span>
                <span className="text-muted-foreground">Invoice Amount:</span>
                <span className="font-medium">₹{selectedInvoiceForPayment?.net_amount.toFixed(2)}</span>
                <span className="text-muted-foreground">Paid Amount:</span>
                <span className="font-medium">₹{(selectedInvoiceForPayment?.paid_amount || 0).toFixed(2)}</span>
                <span className="text-muted-foreground">Pending Amount:</span>
                <span className="font-semibold text-orange-600">
                  ₹{((selectedInvoiceForPayment?.net_amount || 0) - (selectedInvoiceForPayment?.paid_amount || 0)).toFixed(2)}
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
        
        {/* Print Preview Dialog */}
        {invoiceToPrint && (
          <PrintPreviewDialog
            open={showPrintPreview}
            onOpenChange={setShowPrintPreview}
            defaultFormat={billFormat}
            renderInvoice={(format) => 
              invoiceToPrint ? (
                <InvoiceWrapper
                format={format}
                billNo={invoiceToPrint.sale_number}
                date={new Date(invoiceToPrint.sale_date)}
                customerName={invoiceToPrint.customer_name}
                customerAddress={invoiceToPrint.customer_address || ""}
                customerMobile={invoiceToPrint.customer_phone || ""}
                template={invoiceTemplate}
                items={invoiceToPrint.sale_items?.map((item: any, index: number) => ({
                  sr: index + 1,
                  particulars: item.product_name,
                  size: item.size,
                  barcode: item.barcode || "",
                  hsn: "",
                  sp: item.mrp,
                  qty: item.quantity,
                  rate: item.unit_price,
                  total: item.line_total,
                })) || []}
                subTotal={invoiceToPrint.gross_amount}
                discount={invoiceToPrint.discount_amount}
                grandTotal={invoiceToPrint.net_amount}
                cashPaid={invoiceToPrint.payment_method === 'cash' ? invoiceToPrint.net_amount : 0}
                upiPaid={invoiceToPrint.payment_method === 'upi' ? invoiceToPrint.net_amount : 0}
                paymentMethod={invoiceToPrint.payment_method}
              />
              ) : null
            }
          />
        )}

        {/* Hidden Invoice for Printing */}
        {invoiceToPrint && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: billFormat === 'a4' ? '210mm' : 
                   billFormat === 'thermal' ? '80mm' : '148mm',
            minHeight: billFormat === 'a4' ? '297mm' : 
                       billFormat === 'thermal' ? 'auto' : '210mm',
            maxHeight: billFormat === 'thermal' ? 'none' : 
                       billFormat === 'a4' ? '297mm' : '210mm',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -9999,
            overflow: 'hidden'
          }}>
            <InvoiceWrapper
              ref={printRef}
              format={billFormat}
              billNo={invoiceToPrint.sale_number}
              date={new Date(invoiceToPrint.sale_date)}
              customerName={invoiceToPrint.customer_name}
              customerAddress={invoiceToPrint.customer_address || ""}
              customerMobile={invoiceToPrint.customer_phone || ""}
              customerGSTIN=""
              template={invoiceTemplate}
              items={invoiceToPrint.sale_items?.map((item: any, index: number) => ({
                sr: index + 1,
                particulars: item.product_name,
                size: item.size,
                barcode: item.barcode || "",
                hsn: "",
                sp: item.mrp,
                qty: item.quantity,
                rate: item.unit_price,
                total: item.line_total,
              })) || []}
              subTotal={invoiceToPrint.gross_amount}
              discount={invoiceToPrint.discount_amount}
              grandTotal={invoiceToPrint.net_amount}
              paymentMethod={invoiceToPrint.payment_method}
            />
          </div>
        )}
      </div>
  );
}
