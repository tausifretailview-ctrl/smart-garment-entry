import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { ReportSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { LoadingButton } from "@/components/ui/loading-button";

import { Search, Printer, Edit, ChevronDown, ChevronUp, Trash2, Loader2, MessageCircle, Link2, Settings2, Package, IndianRupee, Send, FileText, TrendingUp, CheckCircle2, Clock, CalendarIcon, Download, Percent, Zap, FileDown, Lock, X, Plus, RefreshCw, Copy, Ban, Eye, MoreHorizontal, FileSpreadsheet, User, Phone } from "lucide-react";
import * as XLSX from "xlsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from "date-fns";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { EInvoicePrint } from "@/components/EInvoicePrint";
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
import { useWhatsAppAPI } from "@/hooks/useWhatsAppAPI";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useCustomerAdvances } from "@/hooks/useCustomerAdvances";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { formatDistanceToNow } from "date-fns";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, PageContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { ERPTable } from "@/components/erp-table";
import { SalesInvoiceERPTable } from "@/components/SalesInvoiceERPTable";

interface ColumnSettings {
  [key: string]: boolean;
  phone: boolean;
  status: boolean;
  delivery: boolean;
  whatsapp: boolean;
  copyLink: boolean;
  print: boolean;
  download: boolean;
  modify: boolean;
  delete: boolean;
}

const defaultColumnSettings: ColumnSettings = {
  phone: true,  // Visible by default
  status: true,
  delivery: true,
  whatsapp: true,
  copyLink: true,
  print: true,
  download: true,
  modify: true,
  delete: true,
};

export default function SalesInvoiceDashboard() {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const { hasSpecialPermission } = useUserPermissions();
  const { formatMessage } = useWhatsAppTemplates();
  const { sendWhatsApp, copyInvoiceLink } = useWhatsAppSend();
  const { settings: whatsAppAPISettings, sendMessageAsync, isSending: isSendingWhatsAppAPI } = useWhatsAppAPI();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadedItems, setLoadedItems] = useState<Record<string, any[]>>({});
  const loadedItemsRef = useRef<Record<string, any[]>>({});
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("monthly");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null);
  const [itemCountToDelete, setItemCountToDelete] = useState<number | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [invoiceToPrint, setInvoiceToPrint] = useState<any>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [billFormat, setBillFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal' | null>(null);
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
  const [advanceBalance, setAdvanceBalance] = useState<number>(0);
  const [isFetchingAdvance, setIsFetchingAdvance] = useState(false);
  // Receipt state
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  
  // Customer history dialog state
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);
  
  // E-Invoice state
  const [isGeneratingEInvoice, setIsGeneratingEInvoice] = useState<string | null>(null);
  const [isDownloadingEInvoice, setIsDownloadingEInvoice] = useState<string | null>(null);
  const [eInvoiceToPrint, setEInvoiceToPrint] = useState<any>(null);
  const eInvoicePrintRef = useRef<HTMLDivElement>(null);
  
  // Virtual scrolling ref
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Draft save hook
  const { hasDraft, draftData, deleteDraft, lastSaved } = useDraftSave('sale_invoice');
  const { getAvailableAdvanceBalance, applyAdvance } = useCustomerAdvances(currentOrganization?.id || null);
  // Context menu for desktop right-click
  const isDesktop = useIsDesktop();
  const rowContextMenu = useContextMenu<any>();
  const pageContextMenu = useContextMenu<void>();

  // Get context menu items for invoice row
  const getInvoiceContextMenuItems = (invoice: any): ContextMenuItem[] => {
    const isLocked = invoice.payment_status === 'completed';
    const canModify = hasSpecialPermission('modify_records') || !isLocked;
    const canDelete = hasSpecialPermission('delete_records');
    
    return [
      {
        label: "Open Invoice",
        icon: Eye,
        onClick: () => toggleExpanded(invoice.id, invoice.sale_number),
      },
      {
        label: "Edit Invoice",
        icon: Edit,
        onClick: () => navigate('/sales-invoice', { state: { editInvoiceId: invoice.id } }),
        disabled: !canModify,
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Print Invoice",
        icon: Printer,
        onClick: () => {
          setInvoiceToPrint(invoice);
          setShowPrintPreview(true);
        },
      },
      {
        label: "Download PDF",
        icon: Download,
        onClick: () => handleDownloadPDF(invoice),
      },
      {
        label: "Send on WhatsApp",
        icon: MessageCircle,
        onClick: () => {
          if (invoice.customer_phone) {
            const orgSlug = currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || '';
            const invoiceUrl = `${window.location.origin}/${orgSlug}/invoice/view/${invoice.id}`;
            const message = formatMessage("sales_invoice", invoice, undefined, 0, {
              invoiceLink: invoiceUrl,
              organizationName: currentOrganization?.name || '',
            }) || `Invoice ${invoice.sale_number} - ₹${invoice.net_amount}`;
            sendWhatsApp(invoice.customer_phone, message);
          }
        },
        disabled: !invoice.customer_phone,
      },
      {
        label: "Copy Invoice Link",
        icon: Link2,
        onClick: () => copyInvoiceLink(invoice),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Copy Customer Name",
        icon: User,
        onClick: () => {
          navigator.clipboard.writeText(invoice.customer_name || '');
          toast({ title: "Customer name copied" });
        },
        disabled: !invoice.customer_name,
      },
      {
        label: "Copy Mobile Number",
        icon: Phone,
        onClick: () => {
          navigator.clipboard.writeText(invoice.customer_phone || '');
          toast({ title: "Mobile number copied" });
        },
        disabled: !invoice.customer_phone,
      },
      {
        label: "Duplicate Invoice",
        icon: Copy,
        onClick: () => navigate('/sales-invoice', { state: { duplicateInvoiceId: invoice.id } }),
      },
      {
        label: "Delete Invoice",
        icon: Trash2,
        onClick: () => handleInitiateDelete(invoice),
        disabled: !canDelete,
        destructive: true,
      },
    ];
  };

  // Get page-level context menu items
  const getPageContextMenuItems = (): ContextMenuItem[] => [
    {
      label: "POS Billing",
      icon: Zap,
      onClick: () => navigate("/pos-sales"),
    },
    {
      label: "Stock Report",
      icon: Package,
      onClick: () => navigate("/stock-report"),
    },
    {
      label: "Daily Cash Report",
      icon: TrendingUp,
      onClick: () => navigate("/daily-cashier-report"),
    },
    {
      label: "Size-wise Stock",
      icon: Percent,
      onClick: () => navigate("/item-wise-stock-report"),
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "New Invoice",
      icon: Plus,
      onClick: () => navigate("/sales-invoice"),
    },
    {
      label: "Add New Party",
      icon: Send,
      onClick: () => navigate("/customers"),
    },
    {
      label: "Refresh List",
      icon: RefreshCw,
      onClick: () => refetch(),
    },
  ];

  // Handle row right-click
  const handleRowContextMenu = (e: React.MouseEvent, invoice: any) => {
    if (!isDesktop) return;
    rowContextMenu.openMenu(e, invoice);
  };

  // Handle page right-click (empty area)
  const handlePageContextMenu = (e: React.MouseEvent) => {
    if (!isDesktop) return;
    // Only trigger if clicking on empty area (not on rows)
    const target = e.target as HTMLElement;
    if (target.closest('tr') || target.closest('button') || target.closest('a')) return;
    pageContextMenu.openMenu(e, undefined);
  };

  // Fetch company settings for receipt branding
  const { data: settings } = useQuery({
    queryKey: ['settings', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      
      const { data, error } = await supabase
        .from('settings')
        .select('business_name, address, mobile_number, email_id, gst_number, sale_settings, bill_barcode_settings')
        .eq('organization_id', currentOrganization.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching settings:', error);
        return null;
      }
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

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Compute date range for query
  const queryDateRange = useMemo(() => {
    const today = new Date();
    switch (periodFilter) {
      case 'daily':
        return { start: format(startOfDay(today), 'yyyy-MM-dd'), end: format(endOfDay(today), 'yyyy-MM-dd\'T\'23:59:59') };
      case 'monthly':
        return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd\'T\'23:59:59') };
      case 'yearly':
        return { start: format(startOfYear(today), 'yyyy-MM-dd'), end: format(endOfYear(today), 'yyyy-MM-dd\'T\'23:59:59') };
      case 'custom':
        return { 
          start: startDate ? format(startOfDay(startDate), 'yyyy-MM-dd') : null, 
          end: endDate ? format(endOfDay(endDate), 'yyyy-MM-dd\'T\'23:59:59') : null 
        };
      default:
        return { start: null, end: null };
    }
  }, [periodFilter, startDate, endDate]);

  // Server-side paginated query — NO sale_items, explicit columns
  const { data: invoicesResult, isLoading, refetch, error: invoicesError } = useQuery({
    queryKey: ['invoices', currentOrganization?.id, debouncedSearch, deliveryFilter, paymentStatusFilter, queryDateRange.start, queryDateRange.end, currentPage, itemsPerPage],
    queryFn: async () => {
      if (!currentOrganization?.id) return { data: [], count: 0 };
      
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('sales')
        .select('id, sale_number, sale_date, customer_id, customer_name, customer_phone, customer_email, customer_address, gross_amount, discount_amount, flat_discount_amount, flat_discount_percent, other_charges, round_off, net_amount, paid_amount, payment_method, payment_status, delivery_status, salesman, notes, total_qty, created_at, updated_at, irn, ack_no, einvoice_status, einvoice_error, einvoice_qr_code, sale_return_adjust, due_date, shipping_address, sale_type, customers:customer_id (gst_number)', { count: 'exact' })
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'invoice')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (deliveryFilter !== 'all') {
        query = query.eq('delivery_status', deliveryFilter);
      }
      if (paymentStatusFilter !== 'all') {
        query = query.eq('payment_status', paymentStatusFilter);
      }
      if (queryDateRange.start) {
        query = query.gte('sale_date', queryDateRange.start);
      }
      if (queryDateRange.end) {
        query = query.lte('sale_date', queryDateRange.end);
      }
      if (debouncedSearch) {
        query = query.or(`sale_number.ilike.%${debouncedSearch}%,customer_name.ilike.%${debouncedSearch}%,customer_phone.ilike.%${debouncedSearch}%`);
      }

      const { data, error, count } = await query;
      if (error) {
        console.error('Error fetching invoices:', error);
        throw error;
      }
      
      return { data: data || [], count: count || 0 };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const invoicesData = invoicesResult?.data || [];
  const totalCount = invoicesResult?.count || 0;

  // Server-side summary stats via RPC
  const { data: summaryStats } = useQuery({
    queryKey: ['invoice-dashboard-stats', currentOrganization?.id, debouncedSearch, deliveryFilter, paymentStatusFilter, queryDateRange.start, queryDateRange.end],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data, error } = await supabase.rpc('get_sales_invoice_dashboard_stats', {
        p_org_id: currentOrganization.id,
        p_search: debouncedSearch || undefined,
        p_delivery_status: deliveryFilter !== 'all' ? deliveryFilter : undefined,
        p_payment_status: paymentStatusFilter !== 'all' ? paymentStatusFilter : undefined,
        p_date_start: queryDateRange.start || undefined,
        p_date_end: queryDateRange.end || undefined,
      });
      if (error) {
        console.error('Error fetching dashboard stats:', error);
        return { totalInvoices: 0, totalAmount: 0, totalDiscount: 0, totalQty: 0, pendingAmount: 0, deliveredCount: 0, deliveredAmount: 0, undeliveredCount: 0, undeliveredAmount: 0 };
      }
      const s = data as any;
      return {
        totalInvoices: Number(s?.total_invoices || 0),
        totalAmount: Number(s?.total_amount || 0),
        totalDiscount: Number(s?.total_discount || 0),
        totalQty: Number(s?.total_qty || 0),
        pendingAmount: Number(s?.pending_amount || 0),
        deliveredCount: Number(s?.delivered_count || 0),
        deliveredAmount: Number(s?.delivered_amount || 0),
        undeliveredCount: Number(s?.undelivered_count || 0),
        undeliveredAmount: Number(s?.undelivered_amount || 0),
      };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const productIdsForLookup: string[] = [];

  const { data: productsById } = useQuery({
    queryKey: ['products_by_id', currentOrganization?.id, productIdsForLookup.join(',')],
    queryFn: async () => {
      if (!currentOrganization?.id || productIdsForLookup.length === 0) return {} as Record<string, any>;

      const { data, error } = await supabase
        .from('products')
        .select('id, brand, style, color')
        .in('id', productIdsForLookup);

      if (error) throw error;

      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => {
        map[p.id] = p;
      });
      return map;
    },
    enabled: !!currentOrganization?.id && productIdsForLookup.length > 0,
  });

  // Fetch sale returns with credit_status = 'adjusted' linked to invoices
  const { data: cnAdjustedMap } = useQuery({
    queryKey: ['cn-adjusted-returns', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return {} as Record<string, any>;
      const { data, error } = await supabase
        .from('sale_returns')
        .select('id, return_number, net_amount, linked_sale_id, credit_status')
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .in('credit_status', ['adjusted', 'refunded', 'adjusted_outstanding']);

      if (error) throw error;

      // Map by linked_sale_id for quick lookup
      const map: Record<string, any[]> = {};
      (data || []).forEach((sr: any) => {
        if (sr.linked_sale_id) {
          if (!map[sr.linked_sale_id]) map[sr.linked_sale_id] = [];
          map[sr.linked_sale_id].push(sr);
        }
      });
      return map;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Get item display settings from settings
  const saleSettings = settings?.sale_settings as any;
  const showItemBrand = saleSettings?.show_item_brand ?? false;
  const showItemColor = saleSettings?.show_item_color ?? false;
  const showItemStyle = saleSettings?.show_item_style ?? false;
  const showItemBarcode = saleSettings?.show_item_barcode ?? true;
  const showItemHsn = saleSettings?.show_item_hsn ?? false;
  const showItemMrp = saleSettings?.show_item_mrp ?? saleSettings?.show_mrp_column ?? false;

  // Stock restoration is now handled automatically by database triggers
  // No need for manual stock restoration code
  const { softDelete, bulkSoftDelete } = useSoftDelete();
  
  const handleInitiateDelete = async (invoice: any) => {
    setItemCountToDelete(null);
    setInvoiceToDelete(invoice);
    // Fetch item count in background to show in dialog
    if (currentOrganization?.id) {
      try {
        const { count } = await supabase
          .from('sale_items')
          .select('id', { count: 'exact', head: true })
          .eq('sale_id', invoice.id);
        setItemCountToDelete(count ?? null);
      } catch { /* non-blocking */ }
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    setIsDeleting(true);
    try {
      const success = await softDelete("sales", invoiceToDelete.id);
      if (!success) throw new Error("Failed to delete invoice");

      toast({
        title: "Success",
        description: `Invoice ${invoiceToDelete.sale_number} moved to recycle bin`,
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
      const count = await bulkSoftDelete("sales", invoicesToDelete);

      toast({
        title: "Success",
        description: `${count} invoice(s) moved to recycle bin`,
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

  // Get date range based on period filter
  const getDateRange = useCallback(() => {
    const today = new Date();
    switch (periodFilter) {
      case 'daily':
        return { start: startOfDay(today), end: endOfDay(today) };
      case 'monthly':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'yearly':
        return { start: startOfYear(today), end: endOfYear(today) };
      case 'custom':
        return { 
          start: startDate ? startOfDay(startDate) : null, 
          end: endDate ? endOfDay(endDate) : null 
        };
      default:
        return { start: null, end: null };
    }
  }, [periodFilter, startDate, endDate]);

  // Memoize filtered invoices to avoid recomputing on every render
  const filteredInvoices = useMemo(() => {
    const dateRange = getDateRange();
    
    return (invoicesData || []).filter((invoice: any) => {
      // Date filtering
      if (dateRange.start || dateRange.end) {
        const invoiceDate = new Date(invoice.sale_date);
        if (dateRange.start && invoiceDate < dateRange.start) return false;
        if (dateRange.end && invoiceDate > dateRange.end) return false;
      }
      
      // Payment status filtering
      if (paymentStatusFilter !== 'all' && invoice.payment_status !== paymentStatusFilter) {
        return false;
      }
      
      // Search query filtering
      if (searchQuery) {
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
        
        if (!matchesBasicSearch && !matchesBarcodeSearch) return false;
      }
      
      return true;
    });
  }, [invoicesData, searchQuery, paymentStatusFilter, getDateRange]);

  // Memoize summary statistics
  const summaryStats = useMemo(() => ({
    totalInvoices: filteredInvoices.length,
    totalAmount: filteredInvoices.reduce((sum: number, inv: any) => sum + (inv.net_amount || 0), 0),
    totalDiscount: filteredInvoices.reduce((sum: number, inv: any) => sum + (inv.discount_amount || 0) + (inv.flat_discount_amount || 0), 0),
    totalQty: filteredInvoices.reduce((sum: number, inv: any) => 
      sum + (inv.sale_items?.reduce((itemSum: number, item: any) => itemSum + (item.quantity || 0), 0) || 0), 0),
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

  // Page totals for current page
  const pageTotals = useMemo(() => ({
    qty: paginatedInvoices.reduce((sum: number, inv: any) => 
      sum + (inv.sale_items?.reduce((itemSum: number, item: any) => itemSum + (item.quantity || 0), 0) || 0), 0),
    discount: paginatedInvoices.reduce((sum: number, inv: any) => sum + (inv.discount_amount || 0) + (inv.flat_discount_amount || 0), 0),
    amount: paginatedInvoices.reduce((sum: number, inv: any) => sum + (inv.net_amount || 0), 0),
    balance: paginatedInvoices.reduce((sum: number, inv: any) => sum + ((inv.net_amount || 0) - (inv.paid_amount || 0)), 0),
  }), [paginatedInvoices]);

  const handleExportExcel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const exportData = paginatedInvoices.map((inv: any) => ({
      'Invoice No': inv.sale_number || '',
      'Date': inv.sale_date ? format(new Date(inv.sale_date), 'dd/MM/yyyy') : '',
      'Customer': inv.customer_name || '',
      'Phone': inv.customer_phone || '',
      'Qty': inv.sale_items?.reduce((s: number, i: any) => s + (i.quantity || 0), 0) || 0,
      'Gross Amount': inv.gross_amount || 0,
      'Discount': (inv.discount_amount || 0) + (inv.flat_discount_amount || 0),
      'Net Amount': inv.net_amount || 0,
      'Paid Amount': inv.paid_amount || 0,
      'Balance': (inv.net_amount || 0) - (inv.paid_amount || 0),
      'Payment Status': inv.payment_status || '',
      'Delivery Status': inv.delivery_status || '',
      'Salesman': inv.salesman || '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Invoices');
    XLSX.writeFile(wb, `Sales_Invoices_Page${currentPage}_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    toast({ title: "Exported", description: `${exportData.length} records exported to Excel` });
  }, [paginatedInvoices, currentPage, toast]);

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
  }, [searchQuery, itemsPerPage, periodFilter, paymentStatusFilter, startDate, endDate]);

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const getPageStyle = () => {
    const format = billFormat;
    let size = 'A4 portrait';
    let margin = '5mm';
    
    switch (format) {
      case 'a5':
        size = 'A5 portrait';
        margin = '2mm';
        break;
      case 'a5-horizontal':
        size = 'A5 landscape';
        margin = '2mm';
        break;
      case 'thermal':
        size = '80mm auto';
        margin = '3mm';
        break;
      default: // a4
        size = 'A4 portrait';
        margin = '3mm';
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
      // Direct print without preview - poll until content is ready
      const startedAt = Date.now();
      const MAX_WAIT = 8000;
      const poll = () => {
        const el = printRef.current;
        const text = (el?.textContent || '').trim();
        const isReady = el && el.childElementCount > 0 && text.length > 32 && !/^loading\.?\.?\.?$/i.test(text) && !(text.toLowerCase().includes('loading') && text.length <= 32);
        if (isReady) {
          handlePrint();
        } else if (Date.now() - startedAt < MAX_WAIT) {
          setTimeout(poll, 150);
        } else {
          handlePrint(); // fallback
        }
      };
      setTimeout(poll, 200);
    }
  };

  const handleDownloadPDF = async (invoice: any) => {
    setInvoiceToPrint(invoice);
    toast({
      title: "Generating PDF",
      description: "Please wait while PDF is being generated...",
    });
    
    // Wait for invoice to render
    setTimeout(async () => {
      // On mobile, rendering may take longer
      if (!printRef.current) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (printRef.current) {
        try {
          const canvas = await html2canvas(printRef.current, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
          });
          
          const imgData = canvas.toDataURL('image/png');
          const pageFormat = billFormat === 'a5' || billFormat === 'a5-horizontal' ? 'a5' : 'a4';
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: pageFormat,
          });
          
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgWidth = canvas.width;
          const imgHeight = canvas.height;
          
          // Scale image width to fit PDF page width
          const scaledWidth = pdfWidth;
          const scaledHeight = (imgHeight * pdfWidth) / imgWidth;
          
          if (scaledHeight <= pdfHeight) {
            // Content fits on a single page
            pdf.addImage(imgData, 'PNG', 0, 0, scaledWidth, scaledHeight);
          } else {
            // Multi-page: slice the canvas into page-sized chunks
            // Calculate how many source pixels correspond to one PDF page height
            const pixelsPerPage = (pdfHeight / scaledHeight) * imgHeight;
            const totalPages = Math.ceil(scaledHeight / pdfHeight);
            
            for (let page = 0; page < totalPages; page++) {
              if (page > 0) pdf.addPage();
              
              const sourceY = page * pixelsPerPage;
              const sourceH = Math.min(pixelsPerPage, imgHeight - sourceY);
              const sliceScaledHeight = (sourceH * pdfWidth) / imgWidth;
              
              const pageCanvas = document.createElement('canvas');
              pageCanvas.width = imgWidth;
              pageCanvas.height = Math.ceil(sourceH);
              const ctx = pageCanvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(canvas, 0, sourceY, imgWidth, sourceH, 0, 0, imgWidth, Math.ceil(sourceH));
                const pageImgData = pageCanvas.toDataURL('image/png');
                pdf.addImage(pageImgData, 'PNG', 0, 0, pdfWidth, sliceScaledHeight);
              }
            }
          }
          
          pdf.save(`Invoice_${invoice.sale_number}_${format(new Date(invoice.sale_date), 'ddMMyyyy')}.pdf`);
          
          toast({
            title: "Success",
            description: "PDF downloaded successfully",
          });
        } catch (error) {
          console.error('Error generating PDF:', error);
          toast({
            title: "Error",
            description: "Failed to generate PDF",
            variant: "destructive",
          });
        }
      }
      setInvoiceToPrint(null);
    }, 500);
  };

  const handleWhatsAppShare = async (invoice: any) => {
    if (!invoice.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send WhatsApp message",
        variant: "destructive",
      });
      return;
    }

    // Generate invoice URL - include org slug for branding
    const orgSlug = currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || '';
    const invoiceUrl = `${window.location.origin}/${orgSlug}/invoice/view/${invoice.id}`;
    
    // Fetch customer balance if customer_id exists
    let customerBalance = 0;
    if (invoice.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('opening_balance')
        .eq('id', invoice.customer_id)
        .single();
      
      const openingBalance = customer?.opening_balance || 0;
      
      const { data: sales } = await supabase
        .from('sales')
        .select('net_amount, paid_amount')
        .eq('customer_id', invoice.customer_id)
        .eq('organization_id', currentOrganization?.id);
      
      const totalSales = sales?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;
      const totalPaid = sales?.reduce((sum, s) => sum + (s.paid_amount || 0), 0) || 0;
      customerBalance = openingBalance + totalSales - totalPaid;
    }
    
    // Use template for message - no product items, just invoice details + link
    const templateMessage = formatMessage('sales_invoice', {
      sale_number: invoice.sale_number,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      sale_date: invoice.sale_date,
      net_amount: invoice.net_amount,
      payment_status: invoice.payment_status,
      cash_amount: invoice.cash_amount,
      card_amount: invoice.card_amount,
      upi_amount: invoice.upi_amount,
      paid_amount: invoice.paid_amount,
      customer_id: invoice.customer_id,
      organization_id: currentOrganization?.id,
    }, undefined, customerBalance, {
      invoiceLink: invoiceUrl,
      organizationName: currentOrganization?.name || '',
    });

    sendWhatsApp(invoice.customer_phone, templateMessage);
  };

  // Resend WhatsApp using API (for WhatsApp API enabled customers)
  const handleResendWhatsAppAPI = async (invoice: any) => {
    if (!invoice.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send WhatsApp message",
        variant: "destructive",
      });
      return;
    }

    try {
      const totalQty = invoice.total_qty || 0;
      
      await sendMessageAsync({
        phone: invoice.customer_phone,
        message: '',
        templateType: 'sales_invoice',
        templateName: whatsAppAPISettings?.invoice_template_name || undefined,
        referenceId: invoice.id,
        referenceType: 'sale',
        saleData: {
          sale_id: invoice.id,
          org_slug: currentOrganization?.slug,
          sale_number: invoice.sale_number,
          customer_name: invoice.customer_name,
          customer_phone: invoice.customer_phone,
          sale_date: invoice.sale_date,
          net_amount: invoice.net_amount,
          gross_amount: invoice.gross_amount,
          discount_amount: invoice.discount_amount,
          payment_status: invoice.payment_status,
          items_count: totalQty,
          salesman: invoice.salesman,
          organization_name: currentOrganization?.name,
          organization_id: currentOrganization?.id,
        },
      });
      
      toast({
        title: "Message Sent",
        description: "WhatsApp message sent successfully via API",
      });
    } catch (error: any) {
      toast({
        title: "Failed to Send",
        description: error.message || "Failed to send WhatsApp message",
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = async (invoice: any) => {
    const orgSlug = currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || '';
    const invoiceUrl = `${window.location.origin}/${orgSlug}/invoice/view/${invoice.id}`;
    copyInvoiceLink(invoiceUrl);
  };

  const handlePaymentReminder = async (invoice: any) => {
    if (!invoice.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send payment reminder",
        variant: "destructive",
      });
      return;
    }

    // Build invoice URL for the reminder
    const orgSlug = currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || '';
    const invoiceUrl = `${window.location.origin}/${orgSlug}/invoice/view/${invoice.id}`;
    const organizationName = currentOrganization?.name || '';

    // Fetch customer balance for outstanding amount
    let customerBalance = 0;
    if (invoice.customer_id) {
      try {
        const { data: customer } = await supabase
          .from('customers')
          .select('opening_balance')
          .eq('id', invoice.customer_id)
          .single();
        const openingBalance = customer?.opening_balance || 0;
        const { data: sales } = await supabase
          .from('sales')
          .select('net_amount, paid_amount')
          .eq('customer_id', invoice.customer_id)
          .eq('organization_id', currentOrganization?.id);
        const totalSales = sales?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;
        const totalPaid = sales?.reduce((sum, s) => sum + (s.paid_amount || 0), 0) || 0;
        customerBalance = openingBalance + totalSales - totalPaid;
      } catch (e) {
        customerBalance = invoice.net_amount - (invoice.paid_amount || 0);
      }
    } else {
      customerBalance = invoice.net_amount - (invoice.paid_amount || 0);
    }

    const reminderMessage = formatMessage('payment_reminder', {
      sale_number: invoice.sale_number,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      sale_date: invoice.sale_date,
      net_amount: invoice.net_amount,
      payment_status: invoice.payment_status,
      paid_amount: invoice.paid_amount || 0,
      due_date: invoice.due_date,
    }, undefined, customerBalance, { invoiceLink: invoiceUrl, organizationName });

    sendWhatsApp(invoice.customer_phone, reminderMessage);
  };

  const openPaymentDialog = (invoice: any) => {
    setSelectedInvoiceForPayment(invoice);
    const pendingAmount = invoice.net_amount - (invoice.paid_amount || 0);
    setPaidAmount(pendingAmount.toString());
    setPaymentDate(new Date());
    setPaymentMode("cash");
    setPaymentNarration("");
    setAdvanceBalance(0);
    setIsFetchingAdvance(false);
    setShowPaymentDialog(true);
  };

  const handlePaymentModeChange = async (mode: string) => {
    setPaymentMode(mode);
    if (mode === "advance" && selectedInvoiceForPayment?.customer_id) {
      setIsFetchingAdvance(true);
      try {
        const balance = await getAvailableAdvanceBalance(selectedInvoiceForPayment.customer_id);
        setAdvanceBalance(balance);
        const pendingAmount = selectedInvoiceForPayment.net_amount - (selectedInvoiceForPayment.paid_amount || 0);
        setPaidAmount(Math.min(balance, pendingAmount).toString());
      } catch (error) {
        console.error("Failed to fetch advance balance:", error);
        setAdvanceBalance(0);
      } finally {
        setIsFetchingAdvance(false);
      }
    }
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

      // Update sales table FIRST (before advance deduction to avoid orphaned deductions on failure)
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

      // If payment mode is advance, apply advance deduction using FIFO (after sale update succeeds)
      if (paymentMode === "advance" && selectedInvoiceForPayment.customer_id) {
        await applyAdvance.mutateAsync({
          customerId: selectedInvoiceForPayment.customer_id,
          amountToApply: amount,
        });
      }

      // Generate voucher number
      const { data: voucherData, error: voucherError } = await supabase.rpc(
        'generate_voucher_number',
        { p_type: 'receipt', p_date: format(paymentDate, 'yyyy-MM-dd') }
      );

      if (voucherError) throw voucherError;

      // Create voucher entry
      const { data: voucherEntry, error: voucherEntryError } = await supabase
        .from('voucher_entries')
        .insert({
          organization_id: currentOrganization?.id,
          voucher_number: voucherData,
          voucher_type: 'receipt',
          voucher_date: format(paymentDate, 'yyyy-MM-dd'),
          reference_type: 'customer',
          reference_id: selectedInvoiceForPayment.id,
          total_amount: amount,
          description: paymentMode === "advance" 
            ? `Adjusted from advance balance for invoice ${selectedInvoiceForPayment.sale_number}${paymentNarration ? ' - ' + paymentNarration : ''}`
            : `Payment received for invoice ${selectedInvoiceForPayment.sale_number}${paymentNarration ? ' - ' + paymentNarration : ''}`,
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
        return 'default';
      case 'in_process':
        return 'secondary';
      case 'order_cancelled':
        return 'destructive';
      case 'undelivered':
      default:
        return 'outline';
    }
  };

  const getDeliveryBadgeClass = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in_process':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'order_cancelled':
        return 'bg-red-100 text-red-800 border-red-300';
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
      case 'order_cancelled':
        return 'Order Cancelled';
      case 'undelivered':
      default:
        return 'Undelivered';
    }
  };

  // E-Invoice generation handler
  const handleGenerateEInvoice = async (invoice: any) => {
    // Check if customer has GST number
    const customerGstin = invoice.customers?.gst_number;
    if (!customerGstin) {
      toast({
        title: "GSTIN Required",
        description: "Customer GSTIN is required for e-Invoice generation. This is a B2B invoice requirement.",
        variant: "destructive",
      });
      return;
    }

    // Check if e-invoice already generated
    if (invoice.irn) {
      toast({
        title: "Already Generated",
        description: `E-Invoice already exists. IRN: ${invoice.irn.substring(0, 20)}...`,
      });
      return;
    }

    setIsGeneratingEInvoice(invoice.id);

    try {
      const testMode = (settings?.sale_settings as any)?.einvoice_settings?.test_mode ?? true;
      
      const response = await supabase.functions.invoke('generate-einvoice', {
        body: {
          saleId: invoice.id,
          organizationId: currentOrganization?.id,
          testMode,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      
      if (result.success) {
        toast({
          title: "E-Invoice Generated",
          description: `IRN: ${result.irn?.substring(0, 30)}...`,
        });
        refetch();
      } else {
        toast({
          title: "E-Invoice Failed",
          description: result.error || "Failed to generate e-Invoice",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('E-Invoice generation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate e-Invoice",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingEInvoice(null);
    }
  };

  // E-Invoice PDF Download handler
  const handleDownloadEInvoicePDF = async (invoice: any) => {
    if (!invoice.irn) {
      toast({
        title: "E-Invoice Not Generated",
        description: "Please generate e-Invoice first before downloading PDF.",
        variant: "destructive",
      });
      return;
    }

    setIsDownloadingEInvoice(invoice.id);
    setEInvoiceToPrint(invoice);

    // Wait for the component to render
    setTimeout(async () => {
      try {
        if (!eInvoicePrintRef.current) {
          throw new Error("Print component not ready");
        }

        const canvas = await html2canvas(eInvoicePrintRef.current, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        
        const scaledWidth = pdfWidth;
        const scaledHeight = (imgHeight * pdfWidth) / imgWidth;
        
        if (scaledHeight <= pdfHeight) {
          pdf.addImage(imgData, "PNG", 0, 0, scaledWidth, scaledHeight);
        } else {
          const pixelsPerPage = (pdfHeight / scaledHeight) * imgHeight;
          const totalPages = Math.ceil(scaledHeight / pdfHeight);
          for (let page = 0; page < totalPages; page++) {
            if (page > 0) pdf.addPage();
            const sourceY = page * pixelsPerPage;
            const sourceH = Math.min(pixelsPerPage, imgHeight - sourceY);
            const sliceScaledHeight = (sourceH * pdfWidth) / imgWidth;
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = imgWidth;
            pageCanvas.height = Math.ceil(sourceH);
            const ctx = pageCanvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(canvas, 0, sourceY, imgWidth, sourceH, 0, 0, imgWidth, Math.ceil(sourceH));
              const pageImgData = pageCanvas.toDataURL('image/png');
              pdf.addImage(pageImgData, "PNG", 0, 0, pdfWidth, sliceScaledHeight);
            }
          }
        }
        
        pdf.save(`e-Invoice_${invoice.sale_number}.pdf`);

        toast({
          title: "Download Complete",
          description: `e-Invoice PDF saved as e-Invoice_${invoice.sale_number}.pdf`,
        });
      } catch (error: any) {
        console.error("E-Invoice PDF download error:", error);
        toast({
          title: "Download Failed",
          description: error.message || "Failed to download e-Invoice PDF",
          variant: "destructive",
        });
      } finally {
        setIsDownloadingEInvoice(null);
        setEInvoiceToPrint(null);
      }
    }, 100);
  };

  // Check if e-invoice is enabled
  const isEInvoiceEnabled = (settings?.sale_settings as any)?.einvoice_settings?.enabled ?? false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-background p-4 md:p-6">
      
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Sales Invoice Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">View and manage all sales invoices</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportExcel} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button onClick={() => navigate("/sales-invoice")}>
              New Invoice
            </Button>
            {selectedInvoices.size > 0 && hasSpecialPermission('delete_records') && (
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

        {/* Unsaved Draft Card */}
        {hasDraft && draftData && (
          <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-amber-800 dark:text-amber-200">
                      Unsaved Sales Invoice Found
                    </h3>
                    <CardDescription className="text-black dark:text-black font-bold">
                      {lastSaved ? `Draft available • Last saved ${formatDistanceToNow(lastSaved, { addSuffix: true })}` : 'Draft available'}
                      {draftData.lineItems?.length > 0 && ` • ${draftData.lineItems.length} item(s)`}
                      {draftData.billData?.customer_name && ` • ${draftData.billData.customer_name}`}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await deleteDraft();
                      toast({
                        title: "Draft Discarded",
                        description: "The unsaved sales invoice has been removed",
                      });
                    }}
                    className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                  >
                    <X className="h-4 w-4" />
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      navigate("/sales-invoice", { state: { loadDraft: true } });
                    }}
                    className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Edit className="h-4 w-4" />
                    Resume Draft
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Summary Statistics - Vasy ERP Style Vibrant Cards - 7 cards in 1 row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Total Invoices</CardDescription>
              <FileText className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summaryStats.totalInvoices}</div>
              <p className="text-xs text-white/70">All invoices</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-lg"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Total Qty</CardDescription>
              <Package className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summaryStats.totalQty}</div>
              <p className="text-xs text-white/70">Items sold</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Total Revenue</CardDescription>
              <TrendingUp className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">₹{summaryStats.totalAmount.toFixed(0)}</div>
              <p className="text-xs text-white/70">Net amount</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-pink-500 to-pink-600 border-0 shadow-lg"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Total Discount</CardDescription>
              <Percent className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">₹{summaryStats.totalDiscount.toFixed(0)}</div>
              <p className="text-xs text-white/70">Given</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Pending Amount</CardDescription>
              <Clock className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">₹{summaryStats.pendingAmount.toFixed(0)}</div>
              <p className="text-xs text-white/70">Outstanding</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-teal-500 to-teal-600 border-0 shadow-lg"
            onClick={() => setDeliveryFilter("delivered")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Delivered</CardDescription>
              <CheckCircle2 className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summaryStats.deliveredCount}</div>
              <p className="text-xs text-white/70">₹{summaryStats.deliveredAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg"
            onClick={() => setDeliveryFilter("undelivered")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-xs font-medium text-white/80">Undelivered</CardDescription>
              <Package className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{summaryStats.undeliveredCount}</div>
              <p className="text-xs text-white/70">₹{summaryStats.undeliveredAmount.toFixed(0)}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice, customer, barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="daily">Today</SelectItem>
                  <SelectItem value="monthly">This Month</SelectItem>
                  <SelectItem value="yearly">This Year</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {periodFilter === 'custom' && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[130px] justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, 'dd/MM/yyyy') : 'From'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[130px] justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, 'dd/MM/yyyy') : 'To'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </>
              )}
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Payment Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Delivery Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="in_process">In Process</SelectItem>
                  <SelectItem value="undelivered">Undelivered</SelectItem>
                  <SelectItem value="order_cancelled" className="text-destructive">Order Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <div id="erp-toolbar-portal" className="flex items-center gap-2 ml-auto" />
            </div>

            <SalesInvoiceERPTable
                paginatedInvoices={paginatedInvoices}
                expandedRows={expandedRows}
                toggleExpanded={toggleExpanded}
                selectedInvoices={selectedInvoices}
                toggleSelectAll={toggleSelectAll}
                toggleSelectInvoice={toggleSelectInvoice}
                columnSettings={columnSettings}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                invoicesData={paginatedInvoices}
                isLoading={isLoading}
                handleRowContextMenu={handleRowContextMenu}
                setSelectedCustomerForHistory={setSelectedCustomerForHistory}
                setShowCustomerHistory={setShowCustomerHistory}
                getDeliveryBadgeClass={getDeliveryBadgeClass}
                getDeliveryLabel={getDeliveryLabel}
                openStatusDialog={openStatusDialog}
                isEInvoiceEnabled={isEInvoiceEnabled}
                handleGenerateEInvoice={handleGenerateEInvoice}
                isGeneratingEInvoice={isGeneratingEInvoice}
                handleDownloadEInvoicePDF={handleDownloadEInvoicePDF}
                isDownloadingEInvoice={isDownloadingEInvoice}
                openPaymentDialog={openPaymentDialog}
                handleCopyLink={handleCopyLink}
                handleWhatsAppShare={handleWhatsAppShare}
                whatsAppAPISettings={whatsAppAPISettings}
                handleResendWhatsAppAPI={handleResendWhatsAppAPI}
                isSendingWhatsAppAPI={isSendingWhatsAppAPI}
                handlePaymentReminder={handlePaymentReminder}
                handlePrintInvoice={handlePrintInvoice}
                handleDownloadPDF={handleDownloadPDF}
                hasSpecialPermission={hasSpecialPermission}
                navigate={navigate}
                setInvoiceToDelete={handleInitiateDelete}
                pageTotals={pageTotals}
                showItemBrand={showItemBrand}
                showItemColor={showItemColor}
                showItemStyle={showItemStyle}
                showItemBarcode={showItemBarcode}
                showItemHsn={showItemHsn}
                showItemMrp={showItemMrp}
                deliveryHistory={deliveryHistory}
                saleReturns={saleReturns}
                cnAdjustedMap={cnAdjustedMap || {}}
                renderToolbar={(toolbar) => {
                  const portalTarget = document.getElementById('erp-toolbar-portal');
                  if (portalTarget) {
                    return createPortal(toolbar, portalTarget);
                  }
                  return toolbar;
                }}
              />
            {filteredInvoices.length > 0 && (
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

      <AlertDialog open={!!invoiceToDelete} onOpenChange={() => { setInvoiceToDelete(null); setItemCountToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p>Are you sure you want to delete invoice <strong>{invoiceToDelete?.sale_number}</strong>?</p>
                {itemCountToDelete !== null && (
                  <p>This will reverse <strong>{itemCountToDelete} stock movement{itemCountToDelete !== 1 ? 's' : ''}</strong> across {itemCountToDelete} line item{itemCountToDelete !== 1 ? 's' : ''}.</p>
                )}
                <p className="text-destructive font-medium">This action cannot be undone.</p>
              </div>
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
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p>Are you sure you want to delete <strong>{selectedInvoices.size}</strong> selected invoice(s)? Stock quantities will be restored for all items.</p>
                {selectedInvoices.size >= 5 && (
                  <p className="text-destructive font-medium">⚠️ High Impact: Deleting {selectedInvoices.size} invoices will reverse stock for many products.</p>
                )}
                <p className="text-destructive font-medium">This action cannot be undone.</p>
              </div>
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
                    <SelectItem value="order_cancelled" className="text-destructive">Order Cancelled</SelectItem>
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
                <span className="font-medium">{selectedInvoiceForPayment?.customer_name?.toUpperCase()}</span>
                <span className="text-muted-foreground">Invoice Amount:</span>
                <span className="font-medium">₹{Math.round(selectedInvoiceForPayment?.net_amount || 0).toLocaleString('en-IN')}</span>
                <span className="text-muted-foreground">Paid Amount:</span>
                <span className="font-medium">₹{Math.round(selectedInvoiceForPayment?.paid_amount || 0).toLocaleString('en-IN')}</span>
                <span className="text-muted-foreground">Pending Amount:</span>
                <span className="font-semibold text-orange-600">
                  ₹{Math.round((selectedInvoiceForPayment?.net_amount || 0) - (selectedInvoiceForPayment?.paid_amount || 0)).toLocaleString('en-IN')}
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
                <Select value={paymentMode} onValueChange={handlePaymentModeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    {selectedInvoiceForPayment?.customer_id && (
                      <SelectItem value="advance">From Advance</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {paymentMode === "advance" && (
                  <div className="mt-2">
                    {isFetchingAdvance ? (
                      <Badge variant="info" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Fetching advance balance...
                      </Badge>
                    ) : advanceBalance > 0 ? (
                      <Badge variant="success" className="gap-1">
                        <IndianRupee className="h-3 w-3" />
                        Available Advance: ₹{Math.round(advanceBalance).toLocaleString('en-IN')}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        No advance balance available
                      </Badge>
                    )}
                  </div>
                )}
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
              <Button 
                onClick={handleRecordPayment} 
                disabled={isRecordingPayment || (paymentMode === "advance" && advanceBalance <= 0)}
              >
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
            defaultFormat={billFormat || 'a4'}
            renderInvoice={(format) => 
              invoiceToPrint ? (
              <InvoiceWrapper
                format={format}
                billNo={invoiceToPrint.sale_number}
                date={new Date(invoiceToPrint.sale_date)}
                customerName={invoiceToPrint.customer_name}
                customerAddress={invoiceToPrint.customer_address || ""}
                customerMobile={invoiceToPrint.customer_phone || ""}
                customerGSTIN={invoiceToPrint.customers?.gst_number || ""}
                template={invoiceTemplate}
                showMRP={(settings?.sale_settings as any)?.show_mrp_column ?? false}
                showHSN={(settings?.sale_settings as any)?.show_hsn_column ?? true}
              items={invoiceToPrint.sale_items?.map((item: any, index: number) => ({
                sr: index + 1,
                particulars: item.product_name,
                size: item.size,
                barcode: item.barcode || "",
                hsn: item.hsn_code || "",
                sp: item.mrp,
                mrp: item.mrp,
                qty: item.quantity,
                rate: item.unit_price,
                total: item.line_total,
                color: item.color || item.products?.color || "",
                brand: item.products?.brand || "",
                style: item.products?.style || "",
                gstPercent: item.gst_percent || 0,
              })) || []}
                subTotal={invoiceToPrint.gross_amount}
                discount={(invoiceToPrint.discount_amount || 0) + (invoiceToPrint.flat_discount_amount || 0)}
                saleReturnAdjust={invoiceToPrint.sale_return_adjust || 0}
                grandTotal={invoiceToPrint.net_amount}
                cashPaid={invoiceToPrint.payment_method === 'cash' ? invoiceToPrint.net_amount : 0}
                upiPaid={invoiceToPrint.payment_method === 'upi' ? invoiceToPrint.net_amount : 0}
                paymentMethod={invoiceToPrint.payment_method}
                salesman={invoiceToPrint.salesman || ''}
                notes={invoiceToPrint.notes || ''}
              />
              ) : null
            }
          />
        )}

        {/* Hidden Invoice for Printing */}
        {invoiceToPrint && (
          <div className="no-print" style={{
            position: 'fixed',
            top: '-9999px',
            left: '-9999px',
            width: billFormat === 'a4' ? '210mm' : 
                   billFormat === 'thermal' ? '80mm' : 
                   billFormat === 'a5-horizontal' ? '210mm' : '148mm',
            minHeight: billFormat === 'a4' ? '297mm' : 
                       billFormat === 'thermal' ? 'auto' : 
                       billFormat === 'a5-horizontal' ? '148mm' : '210mm',
            maxHeight: billFormat === 'thermal' ? 'none' : 
                       billFormat === 'a4' ? '297mm' : 
                       billFormat === 'a5-horizontal' ? '148mm' : '210mm',
            pointerEvents: 'none',
            zIndex: -9999,
            overflow: 'visible'
          }}>
            <InvoiceWrapper
              ref={printRef}
              format={billFormat === 'a5' ? 'a5-vertical' : billFormat}
              billNo={invoiceToPrint.sale_number}
              date={new Date(invoiceToPrint.sale_date)}
              customerName={invoiceToPrint.customer_name}
              customerAddress={invoiceToPrint.customer_address || ""}
              customerMobile={invoiceToPrint.customer_phone || ""}
              customerGSTIN={invoiceToPrint.customers?.gst_number || ""}
              template={invoiceTemplate}
              showMRP={(settings?.sale_settings as any)?.show_mrp_column ?? false}
              showHSN={(settings?.sale_settings as any)?.show_hsn_column ?? true}
              items={invoiceToPrint.sale_items?.map((item: any, index: number) => ({
                sr: index + 1,
                particulars: item.product_name,
                size: item.size,
                barcode: item.barcode || "",
                hsn: item.hsn_code || "",
                sp: item.mrp,
                mrp: item.mrp,
                qty: item.quantity,
                rate: item.unit_price,
                total: item.line_total,
                color: item.color || item.products?.color || "",
                brand: item.products?.brand || "",
                style: item.products?.style || "",
                gstPercent: item.gst_percent || 0,
              })) || []}
              subTotal={invoiceToPrint.gross_amount}
              discount={(invoiceToPrint.discount_amount || 0) + (invoiceToPrint.flat_discount_amount || 0)}
              saleReturnAdjust={invoiceToPrint.sale_return_adjust || 0}
              grandTotal={invoiceToPrint.net_amount}
              paymentMethod={invoiceToPrint.payment_method}
              salesman={invoiceToPrint.salesman || ''}
              notes={invoiceToPrint.notes || ''}
            />
          </div>
        )}

        {/* Customer History Dialog */}
        <CustomerHistoryDialog
          open={showCustomerHistory}
          onOpenChange={setShowCustomerHistory}
          customerId={selectedCustomerForHistory?.id || null}
          customerName={selectedCustomerForHistory?.name || ''}
          organizationId={currentOrganization?.id || ''}
        />

        {/* Hidden E-Invoice Print Component for PDF Generation */}
        {eInvoiceToPrint && (
          <div style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -9999,
          }}>
            <EInvoicePrint
              ref={eInvoicePrintRef}
              invoice={eInvoiceToPrint}
              settings={{
                company_name: settings?.business_name || currentOrganization?.name || '',
                company_address: settings?.address || '',
                company_phone: settings?.mobile_number || '',
                company_email: settings?.email_id || '',
                gst_number: settings?.gst_number || '',
                logo_url: (settings as any)?.logo_url || '',
              }}
            />
          </div>
        )}

        {/* Desktop Context Menus */}
        {isDesktop && (
          <>
            <DesktopContextMenu
              isOpen={rowContextMenu.isOpen}
              position={rowContextMenu.position}
              items={rowContextMenu.contextData ? getInvoiceContextMenuItems(rowContextMenu.contextData) : []}
              onClose={rowContextMenu.closeMenu}
            />
            <PageContextMenu
              isOpen={pageContextMenu.isOpen}
              position={pageContextMenu.position}
              items={getPageContextMenuItems()}
              onClose={pageContextMenu.closeMenu}
              title="Quick Actions"
            />
          </>
        )}
      </div>
  );
}
