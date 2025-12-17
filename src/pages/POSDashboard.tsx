import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
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
import { Loader2, Receipt, Search, ChevronDown, ChevronRight, Printer, Plus, Edit, Trash2, MessageCircle, Eye, Link2, Settings2, IndianRupee, Send, CheckCircle2, Clock, RefreshCcw, ShoppingCart, Pause, FileText } from "lucide-react";
import { format } from "date-fns";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useReactToPrint } from "react-to-print";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useQuery } from "@tanstack/react-query";
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { useSoftDelete } from "@/hooks/useSoftDelete";

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
  hsn_code?: string;
  brand?: string;
  color?: string;
  style?: string;
}

interface Sale {
  id: string;
  sale_number: string;
  customer_id?: string | null;
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
  cash_amount?: number;
  card_amount?: number;
  upi_amount?: number;
  refund_amount?: number;
  credit_note_id?: string | null;
  credit_note_amount?: number;
  created_at: string;
}

const POSDashboard = () => {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { formatMessage } = useWhatsAppTemplates();
  const { sendWhatsApp, copyInvoiceLink } = useWhatsAppSend();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // Default to today's date
  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [periodFilter, setPeriodFilter] = useState<string>("daily");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [refundFilter, setRefundFilter] = useState<string>("all");
  const [creditNoteFilter, setCreditNoteFilter] = useState<string>("all");
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [saleItems, setSaleItems] = useState<Record<string, SaleItem[]>>({});
  const [saleReturns, setSaleReturns] = useState<Record<string, any[]>>({});
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [printData, setPrintData] = useState<any>(null);
  const invoicePrintRef = useRef<HTMLDivElement>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [posBillFormat, setPosBillFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal' | null>(null);
  const [posInvoiceTemplate, setPosInvoiceTemplate] = useState<'professional' | 'modern' | 'classic' | 'compact'>('professional');
  
  // Column visibility state with database persistence
  const defaultPosColumns = {
    status: true,
    refund: true,
    refundStatus: true,
    creditNoteStatus: true,
    whatsapp: true,
    copyLink: true,
    preview: true,
    print: true,
    modify: true,
  };

  // Handle period filter changes
  const handlePeriodChange = (period: string) => {
    setPeriodFilter(period);
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    
    switch (period) {
      case 'daily':
        setStartDate(todayStr);
        setEndDate(todayStr);
        break;
      case 'monthly':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        setStartDate(format(monthStart, 'yyyy-MM-dd'));
        setEndDate(todayStr);
        break;
      case 'quarterly':
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
        setStartDate(format(quarterStart, 'yyyy-MM-dd'));
        setEndDate(todayStr);
        break;
      case 'all':
        setStartDate('');
        setEndDate('');
        break;
    }
  };
  
  const { columnSettings, updateColumnSetting } = useDashboardColumnSettings(
    "pos_dashboard",
    defaultPosColumns
  );

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
  
  // Customer history dialog state
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);
  
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

  // Get item display settings from settings
  const saleSettings = settings?.sale_settings as any;
  const showItemBrand = saleSettings?.show_item_brand ?? false;
  const showItemColor = saleSettings?.show_item_color ?? false;
  const showItemStyle = saleSettings?.show_item_style ?? false;
  const showItemBarcode = saleSettings?.show_item_barcode ?? false;
  const showItemHsn = saleSettings?.show_item_hsn ?? false;
  const showItemMrp = saleSettings?.show_item_mrp ?? saleSettings?.show_mrp_column ?? false;
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
        .is("deleted_at", null)
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
          itemsData.forEach((item: any) => {
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

      setSaleItems((prev) => ({ ...prev, [saleId]: data || [] }));
      return data || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load sale items",
        variant: "destructive",
      });
      return [];
    }
  };

  const fetchSaleReturns = async (saleNumber: string): Promise<any[]> => {
    if (saleReturns[saleNumber]) return saleReturns[saleNumber];

    try {
      const { data, error } = await supabase
        .from("sale_returns")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .eq("original_sale_number", saleNumber);

      if (error) throw error;

      const returns = data || [];
      setSaleReturns((prev) => ({ ...prev, [saleNumber]: returns }));
      return returns;
    } catch (error: any) {
      console.error("Failed to load sale returns:", error);
      return [];
    }
  };

  const toggleExpanded = useCallback(async (saleId: string) => {
    if (expandedSale === saleId) {
      setExpandedSale(null);
    } else {
      setExpandedSale(saleId);
      const sale = sales.find(s => s.id === saleId);
      if (sale) {
        await Promise.all([
          fetchSaleItems(saleId),
          fetchSaleReturns(sale.sale_number)
        ]);
      }
    }
  }, [expandedSale, sales]);


  // Stock restoration is now handled automatically by database triggers
  // No need for manual stock restoration code
  const { softDelete, bulkSoftDelete } = useSoftDelete();

  const handleDeleteSale = async () => {
    if (!saleToDelete) return;

    setIsDeleting(true);
    try {
      const success = await softDelete("sales", saleToDelete.id);
      if (!success) throw new Error("Failed to delete sale");

      toast({
        title: "Success",
        description: `Sale ${saleToDelete.sale_number} moved to recycle bin`,
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
      const count = await bulkSoftDelete("sales", salesToDelete);

      toast({
        title: "Success",
        description: `${count} sale(s) moved to recycle bin`,
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

  // Note: toggleSelectAll moved after filteredSales is defined

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
          mrp: item.mrp,
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
        cashAmount: sale.cash_amount,
        cardAmount: sale.card_amount,
        upiAmount: sale.upi_amount,
        paidAmount: sale.paid_amount,
      };

      // Set print data first
      setPrintData(invoiceData);
      
      // Wait for React to render the InvoiceWrapper with new data
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Request animation frame to ensure DOM is painted
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      // Additional delay for complex rendering
      await new Promise(resolve => setTimeout(resolve, 200));
      
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

    sendWhatsApp(sale.customer_phone, templateMessage);
  };

  const handleCopyLink = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    const invoiceUrl = `${window.location.origin}/invoice/view/${sale.id}`;
    copyInvoiceLink(invoiceUrl);
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
          voucher_type: 'receipt',
          voucher_date: format(paymentDate, 'yyyy-MM-dd'),
          reference_type: 'customer',
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
        voucherDate: format(paymentDate, 'yyyy-MM-dd'),
        customerName: selectedSaleForPayment.customer_name,
        customerPhone: selectedSaleForPayment.customer_phone || '',
        customerAddress: selectedSaleForPayment.customer_address || '',
        invoiceNumber: selectedSaleForPayment.sale_number,
        invoiceDate: selectedSaleForPayment.sale_date,
        invoiceAmount: selectedSaleForPayment.net_amount,
        paidAmount: amount,
        previousBalance: selectedSaleForPayment.net_amount - currentPaid,
        currentBalance: selectedSaleForPayment.net_amount - newPaidAmount,
        paymentMethod: paymentMode,
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

    const message = `*PAYMENT RECEIPT*\n\nReceipt No: ${receiptData.voucherNumber}\nDate: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), 'dd/MM/yyyy') : '-'}\n\nCustomer: ${receiptData.customerName}\nInvoice: ${receiptData.invoiceNumber}\n\nInvoice Amount: ₹${receiptData.invoiceAmount.toFixed(2)}\nPaid Amount: ₹${receiptData.paidAmount.toFixed(2)}\nBalance: ₹${receiptData.currentBalance.toFixed(2)}\n\nPayment Mode: ${receiptData.paymentMethod.toUpperCase()}\n${receiptData.narration ? `\nNotes: ${receiptData.narration}` : ''}\n\nThank you for your payment!`;

    sendWhatsApp(receiptData.customerPhone, message);
  };

  // Memoize filtered sales to avoid recomputing on every render
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const searchLower = searchQuery.toLowerCase();
      
      // Check basic sale fields
      const matchesBasicSearch =
        sale.sale_number.toLowerCase().includes(searchLower) ||
        sale.customer_name.toLowerCase().includes(searchLower);
      
      // Check barcode in sale items
      const items = saleItems[sale.id] || [];
      const matchesBarcodeSearch = items.some(item => 
        item.barcode?.toLowerCase().includes(searchLower) ||
        item.product_name?.toLowerCase().includes(searchLower)
      );
      
      const matchesSearch = matchesBasicSearch || matchesBarcodeSearch;

      // Convert sale_date to local date for comparison
      const saleLocalDate = new Date(sale.sale_date);
      const saleDateStr = format(saleLocalDate, 'yyyy-MM-dd');
      const startDateStr = startDate ? startDate : null;
      const endDateStr = endDate ? endDate : null;

      const matchesDateRange =
        (!startDateStr || saleDateStr >= startDateStr) &&
        (!endDateStr || saleDateStr <= endDateStr);

      const matchesPaymentMethod =
        paymentMethodFilter === "all" || sale.payment_method === paymentMethodFilter;

      const matchesPaymentStatus =
        paymentStatusFilter === "all" || sale.payment_status === paymentStatusFilter;

      const matchesRefund =
        refundFilter === "all" ||
        (refundFilter === "with_refund" && (sale.refund_amount || 0) > 0) ||
        (refundFilter === "without_refund" && (sale.refund_amount || 0) === 0);

      const matchesCreditNote =
        creditNoteFilter === "all" ||
        (creditNoteFilter === "with_credit_note" && sale.credit_note_id) ||
        (creditNoteFilter === "without_credit_note" && !sale.credit_note_id);

      return matchesSearch && matchesDateRange && matchesPaymentMethod && matchesPaymentStatus && matchesRefund && matchesCreditNote;
    });
  }, [sales, saleItems, searchQuery, startDate, endDate, paymentMethodFilter, paymentStatusFilter, refundFilter, creditNoteFilter]);

  // Memoize summary statistics to avoid recalculating on every render
  const summaryStats = useMemo(() => ({
    totalBills: filteredSales.length,
    totalQty: filteredSales.reduce((sum, sale) => {
      const items = saleItems[sale.id] || [];
      return sum + items.reduce((itemSum, item) => itemSum + item.quantity, 0);
    }, 0),
    totalAmount: filteredSales.reduce((sum, sale) => sum + sale.gross_amount, 0),
    totalDiscount: filteredSales.reduce((sum, sale) => sum + sale.discount_amount + sale.flat_discount_amount, 0),
    completedCount: filteredSales.filter(sale => sale.payment_status === 'completed').length,
    completedAmount: filteredSales.filter(sale => sale.payment_status === 'completed').reduce((sum, sale) => sum + sale.net_amount, 0),
    pendingCount: filteredSales.filter(sale => sale.payment_status === 'pending' || sale.payment_status === 'partial').length,
    pendingAmount: filteredSales.filter(sale => sale.payment_status === 'pending' || sale.payment_status === 'partial').reduce((sum, sale) => sum + (sale.net_amount - (sale.paid_amount || 0)), 0),
    holdCount: filteredSales.filter(sale => sale.payment_status === 'hold').length,
    holdAmount: filteredSales.filter(sale => sale.payment_status === 'hold').reduce((sum, sale) => sum + sale.net_amount, 0),
    refundCount: filteredSales.filter(sale => (sale.refund_amount || 0) > 0).length,
    refundAmount: filteredSales.reduce((sum, sale) => sum + (sale.refund_amount || 0), 0),
    creditNoteCount: filteredSales.filter(sale => sale.credit_note_id).length,
    creditNoteAmount: filteredSales.reduce((sum, sale) => sum + (sale.credit_note_amount || 0), 0),
    // Payment method totals
    totalCash: filteredSales.reduce((sum, sale) => sum + (sale.cash_amount || 0), 0),
    totalCard: filteredSales.reduce((sum, sale) => sum + (sale.card_amount || 0), 0),
    totalUpi: filteredSales.reduce((sum, sale) => sum + (sale.upi_amount || 0), 0),
    totalBalance: filteredSales.reduce((sum, sale) => sum + (sale.net_amount - (sale.paid_amount || 0)), 0),
  }), [filteredSales, saleItems]);

  // Memoize pagination calculations
  const totalPages = useMemo(() => Math.ceil(filteredSales.length / itemsPerPage), [filteredSales.length, itemsPerPage]);
  const paginatedSales = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredSales.slice(startIndex, endIndex);
  }, [filteredSales, currentPage, itemsPerPage]);

  // Memoized event handlers (defined after filteredSales/paginatedSales)
  const toggleSelectAll = useCallback(() => {
    if (selectedSales.size === filteredSales.length && filteredSales.length > 0) {
      setSelectedSales(new Set());
    } else {
      setSelectedSales(new Set(filteredSales.map(s => s.id)));
    }
  }, [selectedSales.size, filteredSales]);

  const toggleSelectSale = useCallback((saleId: string) => {
    setSelectedSales(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(saleId)) {
        newSelected.delete(saleId);
      } else {
        newSelected.add(saleId);
      }
      return newSelected;
    });
  }, []);

  const handleEditSale = useCallback((saleId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    navigate(`/pos-sales?saleId=${saleId}`);
  }, [navigate]);

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
  }, [searchQuery, startDate, endDate, itemsPerPage, paymentMethodFilter, paymentStatusFilter, refundFilter, creditNoteFilter]);

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-background p-4 md:p-6">
      
      <div className="w-full space-y-6">
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

        {/* Summary Statistics - Modern Gradient Style Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-blue-500 hover:scale-[1.02] bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20"
            onClick={() => setPaymentStatusFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Total Bills</CardDescription>
              <Receipt className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{summaryStats.totalBills}</div>
              <p className="text-xs text-muted-foreground">Qty: {summaryStats.totalQty}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-yellow-500 hover:scale-[1.02] bg-gradient-to-br from-yellow-50 to-yellow-100/50 dark:from-yellow-950/30 dark:to-yellow-900/20"
            onClick={() => setPaymentStatusFilter("hold")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">On Hold</CardDescription>
              <Pause className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{summaryStats.holdCount}</div>
              <p className="text-xs text-muted-foreground">₹{summaryStats.holdAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-green-500 hover:scale-[1.02] bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20"
            onClick={() => setPaymentStatusFilter("completed")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Completed</CardDescription>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summaryStats.completedCount}</div>
              <p className="text-xs text-muted-foreground">₹{summaryStats.completedAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-orange-500 hover:scale-[1.02] bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20"
            onClick={() => setPaymentStatusFilter("pending")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Pending/Partial</CardDescription>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{summaryStats.pendingCount}</div>
              <p className="text-xs text-muted-foreground">₹{summaryStats.pendingAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-purple-500 hover:scale-[1.02] bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20"
            onClick={() => setPaymentStatusFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Sale Amount</CardDescription>
              <IndianRupee className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">₹{summaryStats.totalAmount.toFixed(0)}</div>
              <p className="text-xs text-muted-foreground">Disc: ₹{summaryStats.totalDiscount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-amber-500 hover:scale-[1.02] bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20"
            onClick={() => setRefundFilter("with_refund")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">With Refunds</CardDescription>
              <RefreshCcw className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{summaryStats.refundCount}</div>
              <p className="text-xs text-muted-foreground">₹{summaryStats.refundAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-violet-500 hover:scale-[1.02] bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/30 dark:to-violet-900/20"
            onClick={() => setCreditNoteFilter("with_credit_note")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Credit Notes</CardDescription>
              <FileText className="h-4 w-4 text-violet-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-violet-600">{summaryStats.creditNoteCount}</div>
              <p className="text-xs text-muted-foreground">₹{summaryStats.creditNoteAmount.toFixed(0)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Payment Method Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-emerald-500 hover:scale-[1.02] bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20"
            onClick={() => setPaymentMethodFilter("cash")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Total Cash</CardDescription>
              <IndianRupee className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">₹{summaryStats.totalCash.toFixed(0)}</div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-cyan-500 hover:scale-[1.02] bg-gradient-to-br from-cyan-50 to-cyan-100/50 dark:from-cyan-950/30 dark:to-cyan-900/20"
            onClick={() => setPaymentMethodFilter("card")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Total Card</CardDescription>
              <IndianRupee className="h-4 w-4 text-cyan-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-cyan-600">₹{summaryStats.totalCard.toFixed(0)}</div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-indigo-500 hover:scale-[1.02] bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-950/30 dark:to-indigo-900/20"
            onClick={() => setPaymentMethodFilter("upi")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Total UPI</CardDescription>
              <IndianRupee className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600">₹{summaryStats.totalUpi.toFixed(0)}</div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-red-500 hover:scale-[1.02] bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20"
            onClick={() => setPaymentStatusFilter("pending")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium">Total Balance</CardDescription>
              <IndianRupee className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">₹{summaryStats.totalBalance.toFixed(0)}</div>
            </CardContent>
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
                  placeholder="Search by sale number, customer, barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={periodFilter} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPeriodFilter('custom');
                }}
                className="w-40"
                placeholder="Start Date"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPeriodFilter('custom');
                }}
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
                  <SelectItem value="multiple">Mix Payment</SelectItem>
                  <SelectItem value="pay_later">Pay Later</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Payment Status" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={creditNoteFilter} onValueChange={setCreditNoteFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Credit Note" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="with_credit_note">With C/Note</SelectItem>
                  <SelectItem value="without_credit_note">Without C/Note</SelectItem>
                </SelectContent>
              </Select>
              <Select value={refundFilter} onValueChange={setRefundFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Refund" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="with_refund">With Refund</SelectItem>
                  <SelectItem value="without_refund">Without Refund</SelectItem>
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
                        <Label htmlFor="col-refund" className="text-sm">Refund Amount</Label>
                        <Checkbox
                          id="col-refund"
                          checked={columnSettings.refund}
                          onCheckedChange={(checked) => updateColumnSetting('refund', !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="col-refundStatus" className="text-sm">Refund Status</Label>
                        <Checkbox
                          id="col-refundStatus"
                          checked={columnSettings.refundStatus}
                          onCheckedChange={(checked) => updateColumnSetting('refundStatus', !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="col-creditNoteStatus" className="text-sm">C/Note Status</Label>
                        <Checkbox
                          id="col-creditNoteStatus"
                          checked={columnSettings.creditNoteStatus}
                          onCheckedChange={(checked) => updateColumnSetting('creditNoteStatus', !!checked)}
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
              <div 
                ref={tableContainerRef}
                className="rounded-md border max-h-[600px] overflow-auto"
              >
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
                      <TableHead>Cash</TableHead>
                      <TableHead>Card</TableHead>
                      <TableHead>UPI</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Balance</TableHead>
                      {columnSettings.refund && <TableHead>Refund Amt</TableHead>}
                      {columnSettings.refundStatus && <TableHead>Refund Status</TableHead>}
                      <TableHead>C/Note Amt</TableHead>
                      {columnSettings.creditNoteStatus && <TableHead>C/Note Status</TableHead>}
                      {columnSettings.status && <TableHead>Pay Status</TableHead>}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={(columnSettings.status ? 1 : 0) + (columnSettings.refund ? 1 : 0) + (columnSettings.refundStatus ? 1 : 0) + (columnSettings.creditNoteStatus ? 1 : 0) + 16} className="text-center text-muted-foreground py-8">
                          No sales found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedSales.map((sale) => (
                        <React.Fragment key={sale.id}>
                          <TableRow
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
                            <TableCell 
                              className="cursor-pointer text-blue-600 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCustomerForHistory({
                                  id: sale.customer_id || null,
                                  name: sale.customer_name
                                });
                                setShowCustomerHistory(true);
                              }}
                            >
                              {sale.customer_name}
                            </TableCell>
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
                              {sale.cash_amount ? `₹${sale.cash_amount.toFixed(2)}` : '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {sale.card_amount ? `₹${sale.card_amount.toFixed(2)}` : '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {sale.upi_amount ? `₹${sale.upi_amount.toFixed(2)}` : '-'}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              ₹{(sale.paid_amount || 0).toFixed(2)}
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {sale.payment_status !== 'completed' ? (
                                <span className="font-semibold text-orange-600">
                                  ₹{(sale.net_amount - (sale.paid_amount || 0)).toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            {columnSettings.refund && (
                              <TableCell onClick={() => toggleExpanded(sale.id)}>
                                {(sale.refund_amount || 0) > 0 ? (
                                  <span className="font-semibold text-red-600">
                                    ₹{(sale.refund_amount || 0).toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            )}
                            {columnSettings.refundStatus && (
                              <TableCell onClick={() => toggleExpanded(sale.id)}>
                                {(sale.refund_amount || 0) > 0 ? (
                                  <Badge variant="destructive" className="bg-red-500 text-white">
                                    Refunded
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    No Refund
                                  </Badge>
                                )}
                              </TableCell>
                            )}
                            <TableCell onClick={() => toggleExpanded(sale.id)}>
                              {sale.credit_note_id ? (
                                <span className="font-semibold text-violet-600">
                                  ₹{(sale.credit_note_amount || 0).toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            {columnSettings.creditNoteStatus && (
                              <TableCell onClick={() => toggleExpanded(sale.id)}>
                                {sale.credit_note_id ? (
                                  <Badge className="bg-violet-500 hover:bg-violet-600 text-white">
                                    Issued
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    None
                                  </Badge>
                                )}
                              </TableCell>
                            )}
                            {columnSettings.status && (
                              <TableCell onClick={() => toggleExpanded(sale.id)}>
                                <Badge 
                                  variant={sale.payment_status === "completed" ? "default" : sale.payment_status === "hold" ? "secondary" : "destructive"}
                                  className={sale.payment_status === "hold" ? "bg-yellow-500 hover:bg-yellow-600 text-white" : ""}
                                >
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
                              <TableCell colSpan={(columnSettings.status ? 1 : 0) + (columnSettings.refund ? 1 : 0) + 16} className="bg-muted/50 p-4">
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="font-semibold text-sm mb-2">Sale Items:</h4>
                                    <div className="rounded-md border">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Product</TableHead>
                                            {showItemBrand && <TableHead>Brand</TableHead>}
                                            {showItemColor && <TableHead>Color</TableHead>}
                                            {showItemStyle && <TableHead>Style</TableHead>}
                                            <TableHead>Size</TableHead>
                                            {showItemBarcode && <TableHead>Barcode</TableHead>}
                                            {showItemHsn && <TableHead>HSN</TableHead>}
                                            <TableHead>Quantity</TableHead>
                                            {showItemMrp && <TableHead>MRP</TableHead>}
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
                                              {showItemBrand && <TableCell>{item.brand || '-'}</TableCell>}
                                              {showItemColor && <TableCell>{item.color || '-'}</TableCell>}
                                              {showItemStyle && <TableCell>{item.style || '-'}</TableCell>}
                                              <TableCell>{item.size}</TableCell>
                                              {showItemBarcode && <TableCell className="text-xs font-mono">{item.barcode || '-'}</TableCell>}
                                              {showItemHsn && <TableCell className="text-xs">{item.hsn_code || '-'}</TableCell>}
                                              <TableCell>{item.quantity}</TableCell>
                                              {showItemMrp && <TableCell>₹{item.mrp.toFixed(2)}</TableCell>}
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

                                  {saleReturns[sale.sale_number] && saleReturns[sale.sale_number].length > 0 && (
                                    <div>
                                      <h4 className="font-semibold text-sm mb-2 text-red-600">Linked Sale Returns:</h4>
                                      <div className="rounded-md border border-red-200 bg-red-50/50">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Return No</TableHead>
                                              <TableHead>Return Date</TableHead>
                                              <TableHead>Customer</TableHead>
                                              <TableHead className="text-right">Return Amount</TableHead>
                                              <TableHead>Notes</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {saleReturns[sale.sale_number].map((ret: any) => (
                                              <TableRow key={ret.id}>
                                                <TableCell>
                                                  <Badge variant="destructive">{ret.return_number || "-"}</Badge>
                                                </TableCell>
                                                <TableCell>{new Date(ret.return_date).toLocaleDateString()}</TableCell>
                                                <TableCell>{ret.customer_name}</TableCell>
                                                <TableCell className="text-right font-medium text-red-600">
                                                  ₹{ret.net_amount.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                  {ret.notes || "-"}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
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
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredSales.length)} of {filteredSales.length} sales
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
          </CardContent>
        </Card>
      </div>

      {/* Print Preview Dialog */}
      {previewSale && (
        <PrintPreviewDialog
          open={showPreviewDialog}
          onOpenChange={setShowPreviewDialog}
          defaultFormat={posBillFormat || 'thermal'}
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
                mrp: item.mrp,
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
              cashAmount={previewSale.cash_amount}
              cardAmount={previewSale.card_amount}
              upiAmount={previewSale.upi_amount}
              paidAmount={previewSale.paid_amount}
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
            cashAmount={printData.cashAmount}
            cardAmount={printData.cardAmount}
            upiAmount={printData.upiAmount}
            paidAmount={printData.paidAmount}
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

      {/* Customer History Dialog */}
      <CustomerHistoryDialog
        open={showCustomerHistory}
        onOpenChange={setShowCustomerHistory}
        customerId={selectedCustomerForHistory?.id || null}
        customerName={selectedCustomerForHistory?.name || ''}
        organizationId={currentOrganization?.id || ''}
      />
    </div>
  );
};

export default POSDashboard;
