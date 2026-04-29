import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { useOrgQuery } from "@/hooks/useOrgQuery";
import { supabase } from "@/integrations/supabase/client";
import { deleteLedgerEntries } from "@/lib/customerLedger";
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

import { Search, Printer, Edit, ChevronDown, ChevronUp, Trash2, Loader2, MessageCircle, Link2, Settings2, Package, IndianRupee, Send, FileText, TrendingUp, CheckCircle2, Clock, CalendarIcon, Download, Percent, Zap, FileDown, Lock, X, Plus, RefreshCw, Copy, Ban, Eye, MoreHorizontal, FileSpreadsheet, User, Phone, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from "date-fns";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useSearchParams } from "react-router-dom";
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
import { BulkAdvanceAdjustDialog } from "@/components/BulkAdvanceAdjustDialog";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { formatDistanceToNow } from "date-fns";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, PageContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { ERPTable } from "@/components/erp-table";
import { SalesInvoiceERPTable } from "@/components/SalesInvoiceERPTable";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileStatStrip } from "@/components/mobile/MobileStatStrip";
import { MobilePeriodChips } from "@/components/mobile/MobilePeriodChips";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { cn } from "@/lib/utils";
import { waitForPrintReady } from "@/utils/printReady";

const safeErrorString = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.ErrorMessage || val.message || val.error || JSON.stringify(val);
  }
  return String(val);
};

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
  const { currentOrganization, organizationRole } = useOrganization();
  const { hasSpecialPermission } = useUserPermissions();
  const { formatMessage } = useWhatsAppTemplates();
  const { sendWhatsApp, copyInvoiceLink } = useWhatsAppSend();
  const { settings: whatsAppAPISettings, sendMessageAsync, isSending: isSendingWhatsAppAPI } = useWhatsAppAPI();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadedItems, setLoadedItems] = useState<Record<string, any[]>>({});
  const loadedItemsRef = useRef<Record<string, any[]>>({});
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("monthly");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);
  const [shopFilter, setShopFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("__pending__");

  // Fetch org users for billing user filter
  const { data: orgUsers = [] } = useQuery({
    queryKey: ["org-users-filter", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", currentOrganization.id);
      if (!members?.length) return [];
      const { data: result } = await supabase.functions.invoke("get-users");
      const allUsers = result?.users || [];
      const memberIds = new Set(members.map((m: any) => m.user_id));
      return allUsers
        .filter((u: any) => memberIds.has(u.id))
        .map((u: any) => ({ id: u.id, email: u.email }));
    },
    enabled: !!currentOrganization?.id,
    staleTime: 300000,
  });

  // Default userFilter: admins (and mobile) see all users; non-admins default to themselves
  useEffect(() => {
    if (userFilter === "__pending__" && orgUsers.length > 0 && user?.id) {
      if (orgUsers.length === 1 || isMobile || organizationRole === "admin") {
        setUserFilter("all");
      } else {
        const isOrgMember = orgUsers.some((u: any) => u.id === user.id);
        setUserFilter(isOrgMember ? user.id : "all");
      }
    } else if (userFilter === "__pending__" && orgUsers.length > 0) {
      setUserFilter("all");
    }
  }, [orgUsers, user?.id, isMobile, organizationRole]);

  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null);
  const [itemCountToDelete, setItemCountToDelete] = useState<number | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
   // Cancel invoice state
   const [invoiceToCancel, setInvoiceToCancel] = useState<any>(null);
   const [cancelReason, setCancelReason] = useState('');
   const [isCancelling, setIsCancelling] = useState(false);
   // Bulk cancel state
   const [showBulkCancelDialog, setShowBulkCancelDialog] = useState(false);
   const [bulkCancelReason, setBulkCancelReason] = useState('');
   const [isBulkCancelling, setIsBulkCancelling] = useState(false);
   // Hard delete state
   const [invoiceToHardDelete, setInvoiceToHardDelete] = useState<any>(null);
   const [isHardDeleting, setIsHardDeleting] = useState(false);
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
  const [advanceFromBookings, setAdvanceFromBookings] = useState<number>(0);
  const [isFetchingAdvance, setIsFetchingAdvance] = useState(false);
  const [availableCNBalance, setAvailableCNBalance] = useState<number>(0);
  const [isFetchingCN, setIsFetchingCN] = useState(false);
  const [selectedCNReturnId, setSelectedCNReturnId] = useState<string | null>(null);
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
  const [isCancellingIRN, setIsCancellingIRN] = useState<string | null>(null);
  const [eInvoiceToPrint, setEInvoiceToPrint] = useState<any>(null);
  const eInvoicePrintRef = useRef<HTMLDivElement>(null);
  
  // Virtual scrolling ref
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Draft save hook
  const { hasDraft, draftData, deleteDraft, lastSaved } = useDraftSave('sale_invoice');
  const { getAvailableAdvanceBalance, applyAdvance } = useCustomerAdvances(currentOrganization?.id || null);
  
  // Bulk advance adjust state
  const [showBulkAdvanceDialog, setShowBulkAdvanceDialog] = useState(false);
  const [bulkAdvanceCustomer, setBulkAdvanceCustomer] = useState<{ id: string; name: string } | null>(null);
  const [bulkAdvanceBalance, setBulkAdvanceBalance] = useState<number>(0);

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
        onClick: async () => {
          const invoiceWithItems = await ensureSaleItems(invoice);
          setInvoiceToPrint(invoiceWithItems);
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
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Cancel Invoice",
        icon: Ban,
        onClick: () => {
          setCancelReason('');
          setInvoiceToCancel(invoice);
        },
        disabled: !canDelete || invoice.is_cancelled,
        destructive: true,
      },
      {
        label: "Permanently Delete",
        icon: Trash2,
        onClick: () => setInvoiceToHardDelete(invoice),
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

  // Fetch company settings (centralized, cached 5min)
  const { data: settings } = useSettings();

  // Sync bill format / template / preview flag from cached settings
  useEffect(() => {
    const sale = (settings as any)?.sale_settings;
    if (!sale) return;
    setBillFormat(sale.sales_bill_format || 'a4');
    setInvoiceTemplate(sale.invoice_template || 'professional');
    setShowInvoicePreviewSetting(sale.show_invoice_preview ?? true);
  }, [settings]);

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
    queryKey: ['invoices', currentOrganization?.id, debouncedSearch, deliveryFilter, paymentStatusFilter, shopFilter, userFilter, queryDateRange.start, queryDateRange.end, currentPage, itemsPerPage],
    queryFn: async () => {
      if (!currentOrganization?.id) return { data: [], count: 0 };
      
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('sales')
        .select('id, sale_number, sale_date, customer_id, customer_name, customer_phone, customer_email, customer_address, gross_amount, discount_amount, flat_discount_amount, flat_discount_percent, other_charges, round_off, net_amount, paid_amount, payment_method, payment_status, delivery_status, salesman, notes, total_qty, created_at, updated_at, irn, ack_no, einvoice_status, einvoice_error, einvoice_qr_code, sale_return_adjust, due_date, shipping_address, sale_type, is_cancelled, cancelled_at, cancelled_reason, shop_name, customers:customer_id (gst_number)', { count: 'exact' })
        .eq('organization_id', currentOrganization.id)
        .eq('sale_type', 'invoice')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (deliveryFilter !== 'all') {
        query = query.eq('delivery_status', deliveryFilter);
      }
      if (paymentStatusFilter.length > 0) {
        query = query.in('payment_status', paymentStatusFilter);
      }
      if (shopFilter !== 'all') {
        query = query.eq('shop_name', shopFilter);
      }
      if (userFilter !== 'all' && userFilter !== '__pending__') {
        query = query.eq('created_by', userFilter);
      }
      if (queryDateRange.start) {
        query = query.gte('sale_date', queryDateRange.start);
      }
      if (queryDateRange.end) {
        query = query.lte('sale_date', queryDateRange.end);
      }
      if (debouncedSearch) {
        const searchStr = debouncedSearch.trim();

        // Step 1: search sale_items for barcode / product name
        const { data: matchingItems } = await (supabase as any)
          .from('sale_items')
          .select('sale_id')
          .is('deleted_at', null)
          .or(
            `barcode.ilike.%${searchStr}%,` +
            `product_name.ilike.%${searchStr}%,` +
            `size.ilike.%${searchStr}%,` +
            `color.ilike.%${searchStr}%`
          )
          .limit(300);

        const matchingSaleIds = [
          ...new Set(
            (matchingItems || [])
              .map((i: any) => i.sale_id)
              .filter(Boolean)
          )
        ] as string[];

        const saleTextFilter =
          `sale_number.ilike.%${searchStr}%,` +
          `customer_name.ilike.%${searchStr}%,` +
          `customer_phone.ilike.%${searchStr}%,` +
          `salesman.ilike.%${searchStr}%`;

        if (matchingSaleIds.length > 0) {
          // Get sale IDs matching text search
          const { data: textMatches } = await supabase
            .from('sales')
            .select('id')
            .eq('organization_id', currentOrganization.id)
            .is('deleted_at', null)
            .or(saleTextFilter);

          const textMatchIds = (textMatches || []).map((s: any) => s.id);
          const allMatchIds = [...new Set([...textMatchIds, ...matchingSaleIds])];
          query = query.in('id', allMatchIds);
        } else {
          query = query.or(saleTextFilter);
        }
      }

      const { data, error, count } = await query;
      if (error) {
        console.error('Error fetching invoices:', error);
        throw error;
      }

      const invoices = data || [];
      const saleIds = invoices.map((s: any) => s.id).filter(Boolean);
      if (saleIds.length === 0) {
        return { data: invoices, count: count || 0 };
      }

      const { data: receiptRows, error: receiptErr } = await supabase
        .from('voucher_entries')
        .select('reference_id, total_amount')
        .eq('organization_id', currentOrganization.id)
        .eq('voucher_type', 'receipt')
        .eq('reference_type', 'sale')
        .is('deleted_at', null)
        .in('reference_id', saleIds);
      if (receiptErr) throw receiptErr;

      const receiptBySale = new Map<string, number>();
      (receiptRows || []).forEach((r: any) => {
        if (!r.reference_id) return;
        receiptBySale.set(r.reference_id, (receiptBySale.get(r.reference_id) || 0) + Number(r.total_amount || 0));
      });

      // KS Footwear payment-status reconciliation (Apr 2026):
      // if receipts exist but paid_amount/payment_status is stale, sync sales row.
      const staleUpdates = invoices
        .filter((inv: any) => !inv.is_cancelled && inv.payment_status !== 'hold')
        .map((inv: any) => {
          const net = Number(inv.net_amount || 0);
          const sr = Number(inv.sale_return_adjust || 0);
          const cap = Math.max(0, net - sr);
          const normalizedPaid = Math.min(cap, Math.max(Number(inv.paid_amount || 0), Number(receiptBySale.get(inv.id) || 0)));
          const normalizedStatus =
            normalizedPaid + sr >= net - 0.01
              ? 'completed'
              : normalizedPaid > 0 || sr > 0
                ? 'partial'
                : 'pending';
          return { inv, normalizedPaid, normalizedStatus };
        })
        .filter(({ inv, normalizedPaid, normalizedStatus }) =>
          Math.abs(Number(inv.paid_amount || 0) - normalizedPaid) > 0.009 ||
          (inv.payment_status || 'pending') !== normalizedStatus
        );

      if (staleUpdates.length > 0) {
        await Promise.all(
          staleUpdates.map(({ inv, normalizedPaid, normalizedStatus }) =>
            supabase
              .from('sales')
              .update({ paid_amount: normalizedPaid, payment_status: normalizedStatus })
              .eq('id', inv.id)
              .eq('organization_id', currentOrganization.id)
          )
        );
      }

      const normalizedInvoices = invoices.map((inv: any) => {
        const net = Number(inv.net_amount || 0);
        const sr = Number(inv.sale_return_adjust || 0);
        const cap = Math.max(0, net - sr);
        const normalizedPaid = Math.min(cap, Math.max(Number(inv.paid_amount || 0), Number(receiptBySale.get(inv.id) || 0)));
        const normalizedStatus =
          normalizedPaid + sr >= net - 0.01
            ? 'completed'
            : normalizedPaid > 0 || sr > 0
              ? 'partial'
              : 'pending';
        return { ...inv, paid_amount: normalizedPaid, payment_status: normalizedStatus };
      });

      const filteredNormalized = paymentStatusFilter.length > 0
        ? normalizedInvoices.filter((inv: any) => paymentStatusFilter.includes(inv.payment_status))
        : normalizedInvoices;

      return { data: filteredNormalized, count: count || 0 };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const invoicesData = invoicesResult?.data || [];
  const totalCount = invoicesResult?.count || 0;

  // Auto-download PDF when navigated from mobile with downloadPdf param
  const [searchParams, setSearchParams] = useSearchParams();
  const downloadPdfId = searchParams.get('downloadPdf');
  const downloadTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!downloadPdfId || isLoading || downloadTriggeredRef.current === downloadPdfId) return;
    downloadTriggeredRef.current = downloadPdfId;
    // Find the invoice in loaded data or fetch it directly
    const found = invoicesData.find((inv: any) => inv.id === downloadPdfId);
    if (found) {
      handleDownloadPDF(found);
    } else {
      // Fetch the specific invoice
      (async () => {
        const { data } = await supabase
          .from('sales')
          .select('*')
          .eq('id', downloadPdfId)
          .single();
        if (data) handleDownloadPDF(data);
      })();
    }
    // Clean up the URL param
    searchParams.delete('downloadPdf');
    setSearchParams(searchParams, { replace: true });
  }, [downloadPdfId, isLoading, invoicesData]);

  // Fetch distinct shop names for filter
  const { data: shopNames = [] } = useQuery({
    queryKey: ['shop-names', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data } = await supabase
        .from('organization_members')
        .select('shop_name')
        .eq('organization_id', currentOrganization.id)
        .not('shop_name', 'is', null);
      const names = [...new Set((data || []).map((m: any) => m.shop_name).filter(Boolean))];
      return names as string[];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // Sales dashboard card stats derived from the same filtered invoice universe as table.
  const { data: reconciledStats } = useQuery({
    queryKey: [
      'invoice-dashboard-reconciled-stats',
      currentOrganization?.id,
      debouncedSearch,
      deliveryFilter,
      paymentStatusFilter,
      shopFilter,
      userFilter,
      queryDateRange.start,
      queryDateRange.end,
    ],
    queryFn: async () => {
      if (!currentOrganization?.id) {
        return { totalInvoices: 0, totalAmount: 0, totalDiscount: 0, totalQty: 0, pendingAmount: 0, deliveredCount: 0, deliveredAmount: 0, undeliveredCount: 0, undeliveredAmount: 0 };
      }

      const PAGE_SIZE = 1000;
      const TOLERANCE = 0.01;
      let offset = 0;
      const allInvoices: any[] = [];

      const buildFilteredQuery = () => {
        let query = supabase
          .from('sales')
          .select('id, sale_number, customer_name, customer_phone, sale_date, salesman, net_amount, paid_amount, discount_amount, flat_discount_amount, total_qty, payment_status, sale_return_adjust, delivery_status, is_cancelled, shop_name')
          .eq('organization_id', currentOrganization.id)
          .eq('sale_type', 'invoice')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (deliveryFilter !== 'all') query = query.eq('delivery_status', deliveryFilter);
        if (shopFilter !== 'all') query = query.eq('shop_name', shopFilter);
        if (userFilter !== 'all' && userFilter !== '__pending__') query = query.eq('created_by', userFilter);
        if (queryDateRange.start) query = query.gte('sale_date', queryDateRange.start);
        if (queryDateRange.end) query = query.lte('sale_date', queryDateRange.end);

        return query;
      };

      while (true) {
        let query: any = buildFilteredQuery().range(offset, offset + PAGE_SIZE - 1);

        if (debouncedSearch) {
          const searchStr = debouncedSearch.trim();
          const { data: matchingItems } = await (supabase as any)
            .from('sale_items')
            .select('sale_id')
            .is('deleted_at', null)
            .or(
              `barcode.ilike.%${searchStr}%,` +
              `product_name.ilike.%${searchStr}%,` +
              `size.ilike.%${searchStr}%,` +
              `color.ilike.%${searchStr}%`
            )
            .limit(1000);

          const matchingSaleIds = [...new Set((matchingItems || []).map((i: any) => i.sale_id).filter(Boolean))] as string[];
          const saleTextFilter =
            `sale_number.ilike.%${searchStr}%,` +
            `customer_name.ilike.%${searchStr}%,` +
            `customer_phone.ilike.%${searchStr}%,` +
            `salesman.ilike.%${searchStr}%`;

          if (matchingSaleIds.length > 0) {
            const { data: textMatches } = await supabase
              .from('sales')
              .select('id')
              .eq('organization_id', currentOrganization.id)
              .is('deleted_at', null)
              .or(saleTextFilter);
            const textMatchIds = (textMatches || []).map((s: any) => s.id);
            const allMatchIds = [...new Set([...textMatchIds, ...matchingSaleIds])];
            query = query.in('id', allMatchIds);
          } else {
            query = query.or(saleTextFilter);
          }
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allInvoices.push(...data);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      const saleIds = allInvoices.map((s: any) => s.id).filter(Boolean);
      const receiptBySale = new Map<string, number>();
      for (let i = 0; i < saleIds.length; i += 400) {
        const batch = saleIds.slice(i, i + 400);
        const { data: receiptRows, error: receiptErr } = await supabase
          .from('voucher_entries')
          .select('reference_id, total_amount')
          .eq('organization_id', currentOrganization.id)
          .eq('voucher_type', 'receipt')
          .eq('reference_type', 'sale')
          .is('deleted_at', null)
          .in('reference_id', batch);
        if (receiptErr) throw receiptErr;
        (receiptRows || []).forEach((r: any) => {
          if (!r.reference_id) return;
          receiptBySale.set(r.reference_id, (receiptBySale.get(r.reference_id) || 0) + Number(r.total_amount || 0));
        });
      }

      const normalized = allInvoices
        .filter((inv: any) => !inv?.is_cancelled && inv?.payment_status !== 'hold')
        .map((inv: any) => {
          const net = Number(inv.net_amount || 0);
          const sr = Number(inv.sale_return_adjust || 0);
          const cap = Math.max(0, net - sr);
          const normalizedPaid = Math.min(cap, Math.max(Number(inv.paid_amount || 0), Number(receiptBySale.get(inv.id) || 0)));
          const outstanding = Math.max(0, net - normalizedPaid - sr);
          const normalizedStatus =
            outstanding <= TOLERANCE
              ? 'completed'
              : normalizedPaid > TOLERANCE || sr > TOLERANCE
                ? 'partial'
                : 'pending';
          return { ...inv, paid_amount: normalizedPaid, outstanding, payment_status: normalizedStatus };
        });

      const filteredByStatus = paymentStatusFilter.length > 0
        ? normalized.filter((inv: any) => paymentStatusFilter.includes(inv.payment_status))
        : normalized;

      return {
        totalInvoices: filteredByStatus.length,
        totalAmount: filteredByStatus.reduce((s: number, inv: any) => s + Number(inv.net_amount || 0), 0),
        totalDiscount: filteredByStatus.reduce((s: number, inv: any) => s + Number(inv.discount_amount || 0) + Number(inv.flat_discount_amount || 0), 0),
        totalQty: filteredByStatus.reduce((s: number, inv: any) => s + Number(inv.total_qty || 0), 0),
        pendingAmount: filteredByStatus.reduce((s: number, inv: any) => s + Number(inv.outstanding || 0), 0),
        deliveredCount: filteredByStatus.filter((inv: any) => inv.delivery_status === 'delivered').length,
        deliveredAmount: filteredByStatus
          .filter((inv: any) => inv.delivery_status === 'delivered')
          .reduce((s: number, inv: any) => s + Number(inv.net_amount || 0), 0),
        undeliveredCount: filteredByStatus.filter((inv: any) => inv.delivery_status === 'undelivered').length,
        undeliveredAmount: filteredByStatus
          .filter((inv: any) => inv.delivery_status === 'undelivered')
          .reduce((s: number, inv: any) => s + Number(inv.net_amount || 0), 0),
      };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const productIdsForLookup: string[] = [];

  const productsById: Record<string, any> = {};

  // Fetch sale returns with credit_status = 'adjusted' linked to invoices
  const { data: cnAdjustedMap } = useOrgQuery<Record<string, any[]>>({
    queryKey: ['cn-adjusted-returns'],
    queryFn: async (orgId) => {
      const { data, error } = await supabase
        .from('sale_returns')
        .select('id, return_number, net_amount, linked_sale_id, credit_status')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .in('credit_status', ['adjusted', 'refunded', 'adjusted_outstanding']);

      if (error) throw error;

      const map: Record<string, any[]> = {};
      (data || []).forEach((sr: any) => {
        if (sr.linked_sale_id) {
          if (!map[sr.linked_sale_id]) map[sr.linked_sale_id] = [];
          map[sr.linked_sale_id].push(sr);
        }
      });
      return map;
    },
    options: { staleTime: 2 * 60 * 1000 },
  });

  // Get item display settings from settings
  const saleSettings = settings?.sale_settings as any;
  const showItemBrand = saleSettings?.show_item_brand ?? false;
  const showItemColor = saleSettings?.show_item_color ?? false;
  const showItemStyle = saleSettings?.show_item_style ?? false;
  const showItemBarcode = saleSettings?.show_item_barcode ?? true;
  const showItemHsn = saleSettings?.show_item_hsn ?? false;
  const showItemMrp = saleSettings?.show_item_mrp ?? saleSettings?.show_mrp_column ?? false;

  // Detect single filtered customer for bulk advance button
  const filteredCustomer = useMemo(() => {
    if (!debouncedSearch || !invoicesData.length) return null;
    const customerIds = new Set(invoicesData.map((inv: any) => inv.customer_id).filter(Boolean));
    if (customerIds.size === 1) {
      const inv = invoicesData.find((i: any) => i.customer_id);
      return inv ? { id: inv.customer_id, name: inv.customer_name } : null;
    }
    return null;
  }, [debouncedSearch, invoicesData]);

  // Fetch combined advance + credit balance for filtered customer
  useEffect(() => {
    if (filteredCustomer?.id && currentOrganization?.id) {
      const fetchCombinedBalance = async () => {
        try {
          const customerId = filteredCustomer.id;
          const orgId = currentOrganization.id;
          const bookingBalance = await getAvailableAdvanceBalance(customerId);
          
          // Also compute credit/overpayment balance
          const [
            { data: customerData },
            { data: customerSales },
            { data: customerReturns },
            { data: customerAdjustments },
            { data: customerVouchers },
            { data: refundVouchers },
          ] = await Promise.all([
            supabase.from('customers').select('opening_balance').eq('id', customerId).single(),
            supabase.from('sales').select('id, net_amount, paid_amount, sale_return_adjust, payment_status')
              .eq('organization_id', orgId).eq('customer_id', customerId)
              .is('deleted_at', null).not('payment_status', 'in', '("cancelled","hold")'),
            supabase.from('sale_returns').select('net_amount')
              .eq('organization_id', orgId).eq('customer_id', customerId).is('deleted_at', null),
            supabase.from('customer_balance_adjustments').select('outstanding_difference')
              .eq('organization_id', orgId).eq('customer_id', customerId),
            supabase.from('voucher_entries').select('reference_id, total_amount, reference_type, voucher_type, description')
              .eq('organization_id', orgId).eq('voucher_type', 'receipt').is('deleted_at', null),
            supabase.from('voucher_entries').select('reference_id, total_amount')
              .eq('organization_id', orgId).eq('voucher_type', 'payment')
              .eq('reference_type', 'customer').eq('reference_id', customerId).is('deleted_at', null),
          ]);

          const openingBalance = customerData?.opening_balance || 0;
          const totalSales = (customerSales || []).reduce((s: number, sale: any) => s + (sale.net_amount || 0), 0);
          const saleIds = new Set((customerSales || []).map((s: any) => s.id));
          
          const invoiceVoucherMap = new Map<string, number>();
          let openingBalancePaymentTotal = 0;
          (customerVouchers || []).forEach((v: any) => {
            // Skip CN adjustment vouchers to avoid double-counting with creditNoteTotal
            const desc = (v.description || '').toLowerCase();
            if (desc.includes('credit note adjusted') || desc.includes('cn adjusted')) return;
            if (v.reference_id && saleIds.has(v.reference_id)) {
              invoiceVoucherMap.set(v.reference_id, (invoiceVoucherMap.get(v.reference_id) || 0) + (v.total_amount || 0));
            } else if (v.reference_type === 'customer' && v.reference_id === customerId && v.voucher_type === 'receipt') {
              openingBalancePaymentTotal += (v.total_amount || 0);
            }
          });
          
          let totalPaidOnSales = 0;
          (customerSales || []).forEach((sale: any) => {
            const salePaid = sale.paid_amount || 0;
            const srAdj = sale.sale_return_adjust || 0;
            const voucherAmt = invoiceVoucherMap.get(sale.id) || 0;
            totalPaidOnSales += Math.max(salePaid - srAdj, voucherAmt);
          });
          
          const totalPaid = totalPaidOnSales + openingBalancePaymentTotal;
          const adjustmentTotal = (customerAdjustments || []).reduce((s: number, a: any) => s + (a.outstanding_difference || 0), 0);
          const creditNoteTotal = (customerReturns || []).reduce((s: number, r: any) => s + (r.net_amount || 0), 0);
          const refundsPaidTotal = (refundVouchers || []).reduce((s: number, v: any) => s + (v.total_amount || 0), 0);
          
          const balance = Math.round(openingBalance + totalSales - totalPaid + adjustmentTotal - creditNoteTotal + refundsPaidTotal);
          
          let creditBalance = 0;
          if (balance < 0) {
            creditBalance = Math.max(0, Math.abs(balance) - bookingBalance);
          }
          
          setBulkAdvanceBalance(bookingBalance + creditBalance);
        } catch {
          setBulkAdvanceBalance(0);
        }
      };
      fetchCombinedBalance();
    } else {
      setBulkAdvanceBalance(0);
    }
  }, [filteredCustomer?.id, currentOrganization?.id]);

  // Stock restoration is now handled automatically by database triggers
  // No need for manual stock restoration code
  const { softDelete, bulkSoftDelete, hardDelete } = useSoftDelete();
  
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

  const handleBulkCancel = async () => {
    if (selectedInvoices.size === 0) return;
    setIsBulkCancelling(true);
    try {
      const invoiceIds = Array.from(selectedInvoices);
      let successCount = 0;
      let failCount = 0;
      for (const id of invoiceIds) {
        try {
          const inv: any = (paginatedInvoices as any[])?.find?.((x: any) => x.id === id);
          const { data, error } = await supabase.rpc('cancel_invoice', {
            p_sale_id: id,
            p_reason: bulkCancelReason.trim() || null,
          });
          
          if (error) {
            console.error('Cancel invoice error:', id, error);
            failCount++;
          } else if (data && typeof data === 'object' && (data as any).success) {
            successCount++;
            if (inv?.sale_number && currentOrganization?.id) {
              await deleteLedgerEntries({ organizationId: currentOrganization.id, voucherNo: inv.sale_number, voucherTypes: ['SALE', 'RECEIPT'] });
            }
          } else if (typeof data === 'boolean' && data === true) {
            successCount++;
            if (inv?.sale_number && currentOrganization?.id) {
              await deleteLedgerEntries({ organizationId: currentOrganization.id, voucherNo: inv.sale_number, voucherTypes: ['SALE', 'RECEIPT'] });
            }
          } else {
            console.error('Cancel invoice unexpected result:', id, data);
            failCount++;
          }
        } catch (e) {
          console.error('Cancel invoice exception:', id, e);
          failCount++;
        }
      }
      toast({
        title: 'Invoices Cancelled',
        description: `${successCount} invoice(s) cancelled successfully${failCount > 0 ? `, ${failCount} failed` : ''}. Stock has been restored.`,
      });
      setSelectedInvoices(new Set());
      setShowBulkCancelDialog(false);
      setBulkCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-dashboard-stats'] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsBulkCancelling(false);
    }
  };

  const handleCancelInvoice = async () => {
    if (!invoiceToCancel) return;
    setIsCancelling(true);
    try {
      const { data, error } = await supabase.rpc('cancel_invoice', {
        p_sale_id: invoiceToCancel.id,
        p_reason: cancelReason.trim() || null,
      });

      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error);

      toast({ title: 'Invoice Cancelled', description: result.message });
      if (invoiceToCancel?.sale_number && currentOrganization?.id) {
        await deleteLedgerEntries({ organizationId: currentOrganization.id, voucherNo: invoiceToCancel.sale_number, voucherTypes: ['SALE', 'RECEIPT'] });
      }
      setInvoiceToCancel(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-dashboard-stats'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleHardDeleteInvoice = async () => {
    if (!invoiceToHardDelete) return;
    setIsHardDeleting(true);
    try {
      const success = await hardDelete('sales', invoiceToHardDelete.id);
      if (!success) throw new Error('Failed to permanently delete invoice');

      toast({
        title: 'Invoice Permanently Deleted',
        description: `Invoice ${invoiceToHardDelete.sale_number} has been permanently deleted and stock restored.`,
      });
      if (invoiceToHardDelete?.sale_number && currentOrganization?.id) {
        await deleteLedgerEntries({ organizationId: currentOrganization.id, voucherNo: invoiceToHardDelete.sale_number, voucherTypes: ['SALE', 'RECEIPT'] });
      }
      setInvoiceToHardDelete(null);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-dashboard-stats'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsHardDeleting(false);
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

  const fetchSaleItems = useCallback(async (saleId: string) => {
    if (loadedItemsRef.current[saleId]) return;
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', saleId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      loadedItemsRef.current[saleId] = data || [];
      setLoadedItems(prev => ({ ...prev, [saleId]: data || [] }));
    } catch (error) {
      console.error('Error fetching sale items:', error);
    }
  }, []);

  const toggleExpanded = useCallback((id: string, saleNumber?: string) => {
    setExpandedRows(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
        fetchSaleItems(id);
        if (saleNumber) {
          fetchSaleReturns(saleNumber, id);
        }
      }
      return newExpanded;
    });
  }, [currentOrganization?.id, fetchSaleItems]);

  // Server-side handles all filtering — just use invoicesData directly
  const paginatedInvoices = invoicesData;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  // Page totals computed from current page data (no sale_items, use total_qty)
  const pageTotals = useMemo(() => {
    const activeInvoices = paginatedInvoices.filter((inv: any) => !inv.is_cancelled);
    return {
      qty: activeInvoices.reduce((sum: number, inv: any) => sum + (inv.total_qty || 0), 0),
      discount: activeInvoices.reduce((sum: number, inv: any) => sum + (inv.discount_amount || 0) + (inv.flat_discount_amount || 0), 0),
      amount: activeInvoices.reduce((sum: number, inv: any) => sum + (inv.net_amount || 0), 0),
      balance: activeInvoices.reduce((sum: number, inv: any) => sum + Math.max(0, (inv.net_amount || 0) - (inv.paid_amount || 0) - (inv.sale_return_adjust || 0)), 0),
    };
  }, [paginatedInvoices]);

  // Fallback summary stats if reconciled query hasn't loaded yet
  const baseStats = reconciledStats || {
    totalInvoices: totalCount,
    totalAmount: 0,
    totalDiscount: 0,
    totalQty: 0,
    pendingAmount: 0,
    deliveredCount: 0,
    deliveredAmount: 0,
    undeliveredCount: 0,
    undeliveredAmount: 0,
  };

  const effectiveStats = baseStats;

  const handleExportExcel = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      toast({ title: "Exporting...", description: "Fetching all records for export" });

      // Fetch ALL matching invoices (no pagination) with same filters
      const allRows: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('sales')
          .select('sale_number, sale_date, customer_name, customer_phone, total_qty, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, sale_return_adjust, payment_status, delivery_status, salesman')
          .eq('organization_id', currentOrganization!.id)
          .eq('sale_type', 'invoice')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (deliveryFilter !== 'all') query = query.eq('delivery_status', deliveryFilter);
        if (paymentStatusFilter.length > 0) query = query.in('payment_status', paymentStatusFilter);
        if (userFilter !== 'all' && userFilter !== '__pending__') query = query.eq('created_by', userFilter);
        if (queryDateRange.start) query = query.gte('sale_date', queryDateRange.start);
        if (queryDateRange.end) query = query.lte('sale_date', queryDateRange.end);
        if (debouncedSearch) {
          const s = debouncedSearch.trim();
          query = query.or(`sale_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
          allRows.push(...data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const exportData = allRows.map((inv: any) => ({
        'Invoice No': inv.sale_number || '',
        'Date': inv.sale_date ? format(new Date(inv.sale_date), 'dd/MM/yyyy') : '',
        'Customer': inv.customer_name || '',
        'Phone': inv.customer_phone || '',
        'Qty': inv.total_qty || 0,
        'Gross Amount': inv.gross_amount || 0,
        'Discount': (inv.discount_amount || 0) + (inv.flat_discount_amount || 0),
        'Net Amount': inv.net_amount || 0,
        'Paid Amount': inv.paid_amount || 0,
        'Balance': Math.max(0, (inv.net_amount || 0) - (inv.paid_amount || 0) - (inv.sale_return_adjust || 0)),
        'Credit Note Adj.': inv.sale_return_adjust || 0,
        'Payment Status': inv.payment_status || '',
        'Delivery Status': inv.delivery_status || '',
        'Salesman': inv.salesman || '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sales Invoices');
      XLSX.writeFile(wb, `Sales_Invoices_All_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
      toast({ title: "Exported", description: `${exportData.length} records exported to Excel` });
    } catch (err: any) {
      toast({ title: "Export Failed", description: err.message, variant: "destructive" });
    }
  }, [currentOrganization?.id, deliveryFilter, paymentStatusFilter, queryDateRange, debouncedSearch, toast]);

  // Memoized event handlers
  const toggleSelectAll = useCallback(() => {
    if (selectedInvoices.size === paginatedInvoices.length && paginatedInvoices.length > 0) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(paginatedInvoices.map((i: any) => i.id)));
    }
  }, [selectedInvoices.size, paginatedInvoices]);

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
  }, [debouncedSearch, itemsPerPage, periodFilter, paymentStatusFilter, deliveryFilter, userFilter, startDate, endDate]);

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
        margin = '6mm';
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

  const ensureSaleItems = async (invoice: any) => {
    const needsItems = !invoice.sale_items || invoice.sale_items.length === 0;
    const needsCustomerGst = invoice.customer_id && !invoice.customers?.gst_number;
    
    if (!needsItems && !needsCustomerGst) return invoice;
    
    try {
      let saleItems = invoice.sale_items || [];
      let updatedInvoice = { ...invoice };
      
      // Fetch sale items if needed
      if (needsItems) {
        const { data: items, error } = await supabase
          .from('sale_items')
          .select('*')
          .eq('sale_id', invoice.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });
        if (error) throw error;
        saleItems = items || [];
        
        // Fetch product details (brand, color, style) for the items
        if (saleItems.length > 0) {
          const productIds = [...new Set(saleItems.map((i: any) => i.product_id).filter(Boolean))] as string[];
          if (productIds.length > 0) {
            const { data: products } = await supabase
              .from('products')
              .select('id, brand, color, style')
              .in('id', productIds);
            
            if (products) {
              const productMap = Object.fromEntries(products.map(p => [p.id, p]));
              saleItems.forEach((item: any) => {
                item.products = productMap[item.product_id] || null;
              });
            }
          }
        }
        updatedInvoice.sale_items = saleItems;
      }
      
      // Fetch customer GST number if not already loaded via join
      if (needsCustomerGst) {
        const { data: customer } = await supabase
          .from('customers')
          .select('gst_number, transport_details')
          .eq('id', invoice.customer_id)
          .single();
        if (customer) {
          updatedInvoice.customers = { ...(invoice.customers || {}), gst_number: customer.gst_number, transport_details: customer.transport_details };
        }
      }
      
      // Fetch financer/EMI details if available
      if (!updatedInvoice.financerDetails) {
        const { data: financer } = await supabase
          .from('sale_financer_details')
          .select('*')
          .eq('sale_id', invoice.id)
          .maybeSingle();
        if (financer) {
          updatedInvoice.financerDetails = {
            financer_name: financer.financer_name,
            loan_number: financer.loan_number,
            emi_amount: financer.emi_amount,
            tenure: financer.tenure,
            down_payment: financer.down_payment,
          };
        }
      }
      
      return updatedInvoice;
    } catch (err) {
      console.error('Error fetching sale items for print:', err);
      return { ...invoice, sale_items: invoice.sale_items || [] };
    }
  };

  const handlePrintInvoice = async (invoice: any) => {
    const invoiceWithItems = await ensureSaleItems(invoice);
    setInvoiceToPrint(invoiceWithItems);
    if (showInvoicePreviewSetting) {
      setShowPrintPreview(true);
    } else {
      // Direct print without preview - wait for data + DOM + images
      waitForPrintReady(printRef, () => {
        handlePrint();
      });
    }
  };

  const handleDownloadPDF = async (invoice: any) => {
    const invoiceWithItems = await ensureSaleItems(invoice);
    setInvoiceToPrint(invoiceWithItems);
    toast({
      title: "Generating PDF",
      description: "Please wait while PDF is being generated...",
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, isMobile ? 600 : 200));

      const MAX_WAIT = 10000;
      const startTime = Date.now();
      const waitForReady = () => new Promise<boolean>((resolve) => {
        const poll = () => {
          const el = printRef.current;
          const text = (el?.textContent || '').trim();
          const hasLoadingAttr = el?.querySelector('[data-invoice-loading]') !== null;
          const isReady = !!el && el.childElementCount > 0 && !hasLoadingAttr && text.length > 32 && !/^loading\.?\.?\.?$/i.test(text);
          if (isReady) return resolve(true);
          if (Date.now() - startTime > MAX_WAIT) return resolve(false);
          setTimeout(poll, 250);
        };
        poll();
      });

      const ready = await waitForReady();
      if (!ready || !printRef.current) {
        throw new Error('Invoice template failed to render');
      }

      const canvas = await html2canvas(printRef.current, {
        scale: isMobile ? 1.5 : 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      const imgData = canvas.toDataURL(isMobile ? 'image/jpeg' : 'image/png', 0.92);
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
      const scaledHeight = (imgHeight * pdfWidth) / imgWidth;
      const singlePageThreshold = pdfHeight * 1.05;
      const imageType = isMobile ? 'JPEG' : 'PNG';

      if (scaledHeight <= singlePageThreshold) {
        pdf.addImage(imgData, imageType, 0, 0, pdfWidth, Math.min(scaledHeight, pdfHeight));
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
            const pageImgData = pageCanvas.toDataURL(isMobile ? 'image/jpeg' : 'image/png', 0.92);
            pdf.addImage(pageImgData, imageType, 0, 0, pdfWidth, sliceScaledHeight);
          }
        }
      }

      const blob = pdf.output('blob');
      const fileName = `Invoice_${invoice.sale_number}_${format(new Date(invoice.sale_date), 'ddMMyyyy')}.pdf`;
      const url = URL.createObjectURL(blob);

      if (isMobile) {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (opened) {
          toast({
            title: 'Success',
            description: 'Invoice PDF opened successfully',
          });
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          return;
        }
      }

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);

      toast({
        title: 'Success',
        description: 'PDF downloaded successfully',
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate PDF',
        variant: 'destructive',
      });
    } finally {
      setInvoiceToPrint(null);
    }
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
        .select('net_amount, paid_amount, sale_return_adjust')
        .eq('customer_id', invoice.customer_id)
        .eq('organization_id', currentOrganization?.id);
      
      const totalSales = sales?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;
      const totalPaid = sales?.reduce((sum, s) => sum + (s.paid_amount || 0) + (s.sale_return_adjust || 0), 0) || 0;
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
          .select('net_amount, paid_amount, sale_return_adjust')
          .eq('customer_id', invoice.customer_id)
          .eq('organization_id', currentOrganization?.id);
        const totalSales = sales?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;
        const totalPaid = sales?.reduce((sum, s) => sum + (s.paid_amount || 0) + (s.sale_return_adjust || 0), 0) || 0;
        customerBalance = openingBalance + totalSales - totalPaid;
      } catch (e) {
        customerBalance = Math.max(0, invoice.net_amount - (invoice.paid_amount || 0) - (invoice.sale_return_adjust || 0));
      }
    } else {
      customerBalance = Math.max(0, invoice.net_amount - (invoice.paid_amount || 0) - (invoice.sale_return_adjust || 0));
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
    const pendingAmount = Math.round(invoice.net_amount - (invoice.paid_amount || 0) - (invoice.sale_return_adjust || 0));
    setPaidAmount(Math.max(0, pendingAmount).toString());
    setPaymentDate(new Date());
    setPaymentMode("cash");
    setPaymentNarration("");
    setAdvanceBalance(0);
    setAdvanceFromBookings(0);
    setIsFetchingAdvance(false);
    setAvailableCNBalance(0);
    setIsFetchingCN(false);
    setSelectedCNReturnId(null);
    setShowPaymentDialog(true);
  };

  const handlePaymentModeChange = async (mode: string) => {
    setPaymentMode(mode);
    if (mode === "advance" && selectedInvoiceForPayment?.customer_id) {
      setIsFetchingAdvance(true);
      try {
        const customerId = selectedInvoiceForPayment.customer_id;
        const orgId = currentOrganization?.id;
        
        // Fetch advance booking balance
        const bookingBalance = await getAvailableAdvanceBalance(customerId);
        setAdvanceFromBookings(bookingBalance);
        
        // Also compute customer credit/overpayment balance from ledger
        let creditBalance = 0;
        try {
          const [
            { data: customerData },
            { data: customerSales },
            { data: customerReturns },
            { data: customerAdjustments },
            { data: customerVouchers },
            { data: refundVouchers },
          ] = await Promise.all([
            supabase.from('customers').select('opening_balance').eq('id', customerId).single(),
            supabase.from('sales').select('id, net_amount, paid_amount, sale_return_adjust, payment_status')
              .eq('organization_id', orgId!).eq('customer_id', customerId)
              .is('deleted_at', null).not('payment_status', 'in', '("cancelled","hold")'),
            supabase.from('sale_returns').select('net_amount')
              .eq('organization_id', orgId!).eq('customer_id', customerId).is('deleted_at', null),
            supabase.from('customer_balance_adjustments').select('outstanding_difference')
              .eq('organization_id', orgId!).eq('customer_id', customerId),
            supabase.from('voucher_entries').select('reference_id, total_amount, reference_type, voucher_type')
              .eq('organization_id', orgId!).eq('voucher_type', 'receipt').is('deleted_at', null),
            supabase.from('voucher_entries').select('reference_id, total_amount')
              .eq('organization_id', orgId!).eq('voucher_type', 'payment')
              .eq('reference_type', 'customer').eq('reference_id', customerId).is('deleted_at', null),
          ]);

          const openingBalance = customerData?.opening_balance || 0;
          const totalSales = (customerSales || []).reduce((s: number, sale: any) => s + (sale.net_amount || 0), 0);
          
          // Build sale ID set for this customer
          const saleIds = new Set((customerSales || []).map((s: any) => s.id));
          
          // Calculate totalPaid using same logic as CustomerLedger
          const invoiceVoucherMap = new Map<string, number>();
          (customerVouchers || []).forEach((v: any) => {
            if (v.reference_id && saleIds.has(v.reference_id)) {
              invoiceVoucherMap.set(v.reference_id, (invoiceVoucherMap.get(v.reference_id) || 0) + (v.total_amount || 0));
            }
          });
          
          // Opening balance payments (receipt vouchers referencing customer directly)
          let openingBalancePaymentTotal = 0;
          (customerVouchers || []).forEach((v: any) => {
            if (v.reference_type === 'customer' && v.reference_id === customerId && v.voucher_type === 'receipt') {
              openingBalancePaymentTotal += (v.total_amount || 0);
            }
          });
          
          let totalPaidOnSales = 0;
          (customerSales || []).forEach((sale: any) => {
            const salePaid = sale.paid_amount || 0;
            const srAdj = sale.sale_return_adjust || 0;
            const voucherAmt = invoiceVoucherMap.get(sale.id) || 0;
            totalPaidOnSales += Math.max(salePaid - srAdj, voucherAmt);
          });
          
          const totalPaid = totalPaidOnSales + openingBalancePaymentTotal;
          const adjustmentTotal = (customerAdjustments || []).reduce((s: number, a: any) => s + (a.outstanding_difference || 0), 0);
          const creditNoteTotal = (customerReturns || []).reduce((s: number, r: any) => s + (r.net_amount || 0), 0);
          const refundsPaidTotal = (refundVouchers || []).reduce((s: number, v: any) => s + (v.total_amount || 0), 0);
          
          // Unused advance total (already have bookingBalance)
          // effectiveUnusedAdvances is already subtracted - but we don't want to double count with bookingBalance
          
          const balance = Math.round(openingBalance + totalSales - totalPaid + adjustmentTotal - creditNoteTotal + refundsPaidTotal);
          
          // If balance is negative, customer has credit/overpayment
          if (balance < 0) {
            // Credit balance is the overpayment EXCLUDING the advance booking balance (to avoid double counting)
            creditBalance = Math.max(0, Math.abs(balance) - bookingBalance);
          }
        } catch (err) {
          console.error("Failed to compute credit balance:", err);
        }
        
        const totalAvailable = bookingBalance + creditBalance;
        setAdvanceBalance(totalAvailable);
        const pendingAmount = Math.max(0, selectedInvoiceForPayment.net_amount - (selectedInvoiceForPayment.paid_amount || 0) - (selectedInvoiceForPayment.sale_return_adjust || 0));
        setPaidAmount(Math.min(totalAvailable, pendingAmount).toString());
      } catch (error) {
        console.error("Failed to fetch advance balance:", error);
        setAdvanceBalance(0);
        setAdvanceFromBookings(0);
      } finally {
        setIsFetchingAdvance(false);
      }
    }

    // Fetch credit note balance when credit_note mode is selected
    if (mode === "credit_note" && selectedInvoiceForPayment?.customer_id) {
      setIsFetchingCN(true);
      try {
        const { data: returns } = await supabase
          .from('sale_returns')
          .select('id, return_number, net_amount, credit_status, linked_sale_id, return_date')
          .eq('organization_id', currentOrganization?.id)
          .eq('customer_id', selectedInvoiceForPayment.customer_id)
          .is('deleted_at', null)
          .in('credit_status', ['pending', 'adjusted'])
          .order('return_date', { ascending: true });

        // Total credit notional value from all pending/adjusted SRs for this customer.
        // We treat a sale return as a free-standing credit-note balance regardless of
        // whether it's already been linked to an invoice. Already-consumed amounts
        // are subtracted via the sum of credit_note_adjustment vouchers below.
        const totalCN = (returns || []).reduce(
          (sum: number, r: any) => sum + (Number(r.net_amount) || 0),
          0
        );

        // Sum of CN adjustments already applied for this customer's invoices.
        // We look up customer's sale ids first, then sum credit_note_adjustment
        // receipt vouchers against them.
        const { data: customerSales } = await supabase
          .from('sales')
          .select('id')
          .eq('organization_id', currentOrganization?.id)
          .eq('customer_id', selectedInvoiceForPayment.customer_id)
          .is('deleted_at', null);
        const saleIds = (customerSales || []).map((s: any) => s.id);

        let usedCN = 0;
        if (saleIds.length > 0) {
          const { data: cnVouchers } = await supabase
            .from('voucher_entries')
            .select('total_amount')
            .eq('organization_id', currentOrganization?.id)
            .eq('voucher_type', 'receipt')
            .eq('reference_type', 'sale')
            .eq('payment_method', 'credit_note_adjustment')
            .in('reference_id', saleIds)
            .is('deleted_at', null);
          usedCN = (cnVouchers || []).reduce(
            (sum: number, v: any) => sum + (Number(v.total_amount) || 0),
            0
          );
        }

        const totalAvailable = Math.max(0, totalCN - usedCN);

        // Pick the oldest SR that still has a notional remaining balance to
        // attach to this application (FIFO). Allocate usedCN against the
        // chronological list to find the first not-yet-fully-consumed SR.
        let remainingUsed = usedCN;
        let bestReturnId: string | null = null;
        for (const r of (returns || [])) {
          const amt = Number(r.net_amount) || 0;
          if (remainingUsed >= amt) {
            remainingUsed -= amt;
            continue;
          }
          bestReturnId = r.id;
          break;
        }

        setAvailableCNBalance(totalAvailable);
        setSelectedCNReturnId(bestReturnId);
        const pendingAmount = Math.max(0, selectedInvoiceForPayment.net_amount - (selectedInvoiceForPayment.paid_amount || 0) - (selectedInvoiceForPayment.sale_return_adjust || 0));
        setPaidAmount(Math.min(totalAvailable, pendingAmount).toString());
      } catch (error) {
        console.error('Failed to fetch CN balance:', error);
        setAvailableCNBalance(0);
      } finally {
        setIsFetchingCN(false);
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
    const currentCNAdjust = selectedInvoiceForPayment.sale_return_adjust || 0;
    const pendingAmount = Math.max(0, Math.round(selectedInvoiceForPayment.net_amount - currentPaid - currentCNAdjust));

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
      const isCreditNoteMode = paymentMode === "credit_note";
      let effectivePaidAmount = currentPaid;
      let effectiveCNAdjust = currentCNAdjust;

      // For credit note: don't touch paid_amount, only sale_return_adjust
      const newPaidAmount = isCreditNoteMode
        ? currentPaid
        : Math.round((currentPaid + amount) * 100) / 100;
      const newCNAdjust = isCreditNoteMode
        ? currentCNAdjust + amount
        : currentCNAdjust;
      const newStatus = (newPaidAmount + newCNAdjust) >= selectedInvoiceForPayment.net_amount - 1
        ? 'completed'
        : newPaidAmount > 0 || newCNAdjust > 0 ? 'partial' : 'pending';

      if (isCreditNoteMode) {
        // Credit note adjustment: update sale_return_adjust + status only (no payment_method change)
        if (selectedCNReturnId) {
          // Only set linked_sale_id if not already linked, to avoid clobbering
          // a prior link when the SR is being partially re-applied.
          const { data: existingSR } = await supabase
            .from('sale_returns')
            .select('linked_sale_id')
            .eq('id', selectedCNReturnId)
            .maybeSingle();
          const updatePayload: any = { credit_status: 'adjusted' };
          if (!existingSR?.linked_sale_id) {
            updatePayload.linked_sale_id = selectedInvoiceForPayment.id;
          }
          await supabase
            .from('sale_returns')
            .update(updatePayload)
            .eq('id', selectedCNReturnId);
        }

        const { error: updateError } = await supabase
          .from('sales')
          .update({
            sale_return_adjust: newCNAdjust,
            payment_status: newStatus,
          })
          .eq('id', selectedInvoiceForPayment.id);

        if (updateError) throw updateError;
        effectiveCNAdjust = newCNAdjust;
      } else {
        // Normal / advance payment: update paid_amount + payment_method
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
        effectivePaidAmount = newPaidAmount;

        // If payment mode is advance, apply advance deduction using FIFO (only for booking-based advances)
        if (paymentMode === "advance" && selectedInvoiceForPayment.customer_id) {
          const bookingDeduction = Math.min(amount, advanceFromBookings);
          if (bookingDeduction > 0) {
            await applyAdvance.mutateAsync({
              customerId: selectedInvoiceForPayment.customer_id,
              amountToApply: bookingDeduction,
            });
          }
        }
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
          reference_type: 'sale',
          reference_id: selectedInvoiceForPayment.id,
          total_amount: amount,
          payment_method: paymentMode === "advance" ? "advance_adjustment"
            : paymentMode === "credit_note" ? "credit_note_adjustment"
            : paymentMode,
          description: paymentMode === "advance" 
            ? `Adjusted from advance balance for invoice ${selectedInvoiceForPayment.sale_number}${paymentNarration ? ' - ' + paymentNarration : ''}`
            : paymentMode === "credit_note"
            ? `Credit note adjusted against invoice ${selectedInvoiceForPayment.sale_number}${paymentNarration ? ' - ' + paymentNarration : ''}`
            : `Payment received for invoice ${selectedInvoiceForPayment.sale_number}${paymentNarration ? ' - ' + paymentNarration : ''}`,
          created_by: user?.id,
        })
        .select()
        .single();

      if (voucherEntryError) throw voucherEntryError;

      // Critical sync guard: after voucher creation, re-sync sales paid/status from persisted values.
      // This guarantees advance_adjustment vouchers and sales table stay aligned.
      const { data: refreshedSale, error: refreshedSaleError } = await supabase
        .from('sales')
        .select('paid_amount, net_amount, sale_return_adjust')
        .eq('id', selectedInvoiceForPayment.id)
        .single();
      if (refreshedSaleError) throw refreshedSaleError;

      const { data: saleReceipts, error: saleReceiptsError } = await supabase
        .from('voucher_entries')
        .select('total_amount')
        .eq('organization_id', currentOrganization?.id)
        .eq('voucher_type', 'receipt')
        .eq('reference_type', 'sale')
        .eq('reference_id', selectedInvoiceForPayment.id)
        .is('deleted_at', null);
      if (saleReceiptsError) throw saleReceiptsError;

      const receiptTotal = (saleReceipts || []).reduce((sum: number, row: any) => sum + Number(row.total_amount || 0), 0);
      const latestNet = Number(refreshedSale?.net_amount || selectedInvoiceForPayment.net_amount || 0);
      const latestSRAdjust = Number(refreshedSale?.sale_return_adjust || 0);
      const payableCap = Math.max(0, latestNet - latestSRAdjust);
      const reconciledPaid = Math.min(
        payableCap,
        Math.max(Number(refreshedSale?.paid_amount || 0), receiptTotal)
      );
      const reconciledStatus =
        reconciledPaid + latestSRAdjust >= latestNet - 1
          ? 'completed'
          : reconciledPaid > 0 || latestSRAdjust > 0
            ? 'partial'
            : 'pending';

      const { error: finalSyncError } = await supabase
        .from('sales')
        .update({
          paid_amount: reconciledPaid,
          payment_status: reconciledStatus,
          payment_date: format(paymentDate, 'yyyy-MM-dd'),
        })
        .eq('id', selectedInvoiceForPayment.id);
      if (finalSyncError) throw finalSyncError;

      effectivePaidAmount = reconciledPaid;
      effectiveCNAdjust = latestSRAdjust;

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
        previousBalance: Math.max(0, selectedInvoiceForPayment.net_amount - currentPaid - currentCNAdjust),
        currentBalance: Math.max(0, selectedInvoiceForPayment.net_amount - effectivePaidAmount - effectiveCNAdjust),
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

  // E-Invoice validation before generation
  const validateForEInvoice = (invoice: any): string[] => {
    const errors: string[] = [];
    const gstin = invoice.customers?.gst_number;
    if (!gstin) errors.push('Customer GSTIN is required for B2B e-Invoice');
    else if (gstin.length !== 15) errors.push('Customer GSTIN must be 15 characters');
    if (!invoice.sale_number) errors.push('Invoice number is missing');
    if (invoice.net_amount <= 0) errors.push('Invoice total must be greater than 0');
    // Check seller GSTIN
    const sellerGstin = (settings as any)?.gst_number;
    if (!sellerGstin) errors.push('Business GSTIN not configured in Settings → Business Details');
    return errors;
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

    // Run validation
    const validationErrors = validateForEInvoice(invoice);
    if (validationErrors.length > 0) {
      toast({
        title: "Validation Failed",
        description: validationErrors.join('. '),
        variant: "destructive",
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
      
      if (!result) {
        throw new Error("No response received from e-Invoice service");
      }
      
      if (result.success) {
        toast({
          title: "E-Invoice Generated",
          description: `IRN: ${result.irn?.substring(0, 30)}...`,
        });
        refetch();
      } else {
        const errorDetail = safeErrorString(result.error || result.message) || "Failed to generate e-Invoice";
        toast({
          title: "E-Invoice Failed",
          description: errorDetail,
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

  // Cancel IRN handler
  const handleCancelIRN = async (invoice: any) => {
    if (!invoice.irn) return;
    if (invoice.einvoice_status === 'cancelled') {
      toast({ title: "Already Cancelled", description: "This IRN has already been cancelled." });
      return;
    }

    // Check 24-hour window client-side
    const ackDate = invoice.ack_date ? new Date(invoice.ack_date) : new Date(invoice.created_at);
    const hoursSince = (Date.now() - ackDate.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) {
      toast({
        title: "Cannot Cancel",
        description: "IRN can only be cancelled within 24 hours of generation.",
        variant: "destructive",
      });
      return;
    }

    const cancelReasonCode = window.prompt(
      `Cancel IRN for ${invoice.sale_number}\n\nEnter reason:\n1 = Duplicate\n2 = Data Entry Mistake\n3 = Order Cancelled\n4 = Others\n\nType 1, 2, 3 or 4:`
    );
    if (!cancelReasonCode) return;

    const reasonMap: Record<string, string> = {
      '1': 'duplicate', '2': 'data_error', '3': 'cancelled', '4': 'others'
    };
    const reason = reasonMap[cancelReasonCode.trim()] || 'others';
    const remarks = window.prompt('Enter remarks (optional):') || reason;

    setIsCancellingIRN(invoice.id);
    try {
      const testMode = (settings?.sale_settings as any)?.einvoice_settings?.test_mode ?? true;
      const response = await supabase.functions.invoke('cancel-einvoice', {
        body: {
          saleId: invoice.id,
          organizationId: currentOrganization?.id,
          reason,
          remarks: remarks.substring(0, 100),
          testMode,
        },
      });

      if (response.error) throw new Error(response.error.message);
      const result = response.data;
      if (!result) throw new Error("No response from cancel service");
      if (result.success) {
        toast({ title: "IRN Cancelled", description: "The e-Invoice IRN has been cancelled successfully." });
        refetch();
      } else {
        toast({ title: "Cancellation Failed", description: safeErrorString(result.error) || "Cancellation failed", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to cancel IRN", variant: "destructive" });
    } finally {
      setIsCancellingIRN(null);
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
    // Ensure sale_items are loaded for the print component
    const invoiceWithItems = await ensureSaleItems(invoice);
    setEInvoiceToPrint(invoiceWithItems);

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
        
        const singlePageThreshold2 = pdfHeight * 1.05;
        if (scaledHeight <= singlePageThreshold2) {
          pdf.addImage(imgData, "PNG", 0, 0, scaledWidth, Math.min(scaledHeight, pdfHeight));
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
  // isMobile already declared at top of component

  if (isMobile) {
    const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
    return (
      <div className="flex flex-col min-h-screen bg-muted/30 pb-24">
        <MobilePageHeader
          title="Sales Invoices"
          subtitle={`${effectiveStats.totalInvoices} invoices`}
          rightContent={
            <button onClick={() => navigate("/sales-invoice")}
              className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm active:scale-90 touch-manipulation">
              <Plus className="h-5 w-5 text-primary-foreground" />
            </button>
          }
        />

        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoice no, customer, phone, product, barcode..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-card border-border/60 rounded-xl text-sm" />
          </div>
        </div>

        <MobilePeriodChips value={periodFilter} onChange={(v) => { setPeriodFilter(v); setCurrentPage(1); }} />

        <MobileStatStrip stats={[
          { label: "Total", value: fmt(effectiveStats.totalAmount), color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Pending", value: fmt(effectiveStats.pendingAmount), color: "text-amber-600", bg: "bg-amber-50", onClick: () => setPaymentStatusFilter(["pending"]) },
          { label: "Invoices", value: String(effectiveStats.totalInvoices), color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Qty", value: String(effectiveStats.totalQty), color: "text-emerald-600", bg: "bg-emerald-50" },
        ]} />

        <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
          {[{v:"all",l:"All"},{v:"pending",l:"Pending"},{v:"partial",l:"Partial"},{v:"completed",l:"Paid"}].map((s) => (
            <button key={s.v} onClick={() => { setPaymentStatusFilter(s.v === 'all' ? [] : [s.v]); setCurrentPage(1); }}
              className={cn(
                "flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all touch-manipulation",
                (s.v === 'all' && paymentStatusFilter.length === 0) || (paymentStatusFilter.length === 1 && paymentStatusFilter[0] === s.v) ? "bg-foreground text-background border-transparent" : "bg-card text-muted-foreground border-border"
              )}>
              {s.l}
            </button>
          ))}
        </div>

        <div className="flex-1 px-4 space-y-2.5 pb-4">
          {isLoading ? (
            Array.from({length: 5}).map((_,i) => (
              <div key={i} className="h-20 bg-card rounded-2xl animate-pulse" />
            ))
          ) : paginatedInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No invoices found</p>
            </div>
          ) : paginatedInvoices.map((inv: any) => {
            const pending = Math.max(0, (inv.net_amount||0)-(inv.paid_amount||0)-(inv.sale_return_adjust||0));
            const totalSettled = (inv.paid_amount||0) + (inv.sale_return_adjust||0);
            const effectiveStatus = inv.payment_status === 'hold' ? 'hold'
              : (totalSettled >= (inv.net_amount||0) || Math.abs(totalSettled - (inv.net_amount||0)) < 1) ? 'completed'
              : totalSettled > 0 ? 'partial' : 'pending';
            const sc: Record<string, string> = {
              completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
              partial: "bg-amber-50 text-amber-700 border-amber-200",
              pending: "bg-rose-50 text-rose-700 border-rose-200",
            };
            return (
              <div key={inv.id}
                className="bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
                <div className={cn("p-3.5 active:bg-muted/30 transition-colors touch-manipulation", inv.is_cancelled && "opacity-60")}
                  onClick={() => !inv.is_cancelled && navigate('/sales-invoice', { state: { editInvoiceId: inv.id } })}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("font-mono text-xs font-bold text-primary", inv.is_cancelled && "line-through decoration-red-500/70")}>{inv.sale_number}</span>
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", sc[effectiveStatus] || sc.pending)}>
                          {effectiveStatus === 'completed' ? 'Paid' : effectiveStatus}
                        </span>
                        {inv.is_cancelled && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">Cancelled</span>}
                      </div>
                      <p
                        className={cn("text-sm font-medium text-foreground mt-1 truncate", inv.is_cancelled && "line-through decoration-red-500/50", inv.customer_name && inv.customer_name !== 'Walk-in' && "text-primary underline underline-offset-2 decoration-primary/30")}
                        onClick={(e) => {
                          if (inv.customer_name && inv.customer_name !== 'Walk-in') {
                            e.stopPropagation();
                            setSelectedCustomerForHistory({ id: inv.customer_id || null, name: inv.customer_name });
                            setShowCustomerHistory(true);
                          }
                        }}
                      >{inv.customer_name || 'Walk-in'}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(inv.created_at || inv.sale_date), "d MMM · hh:mm a")}
                        {inv.total_qty ? ` · ${inv.total_qty} pcs` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className={cn("text-sm font-bold tabular-nums", inv.is_cancelled && "line-through decoration-red-500/70")}>₹{(inv.net_amount||0).toLocaleString("en-IN")}</p>
                      {pending > 0 && (
                        <p className="text-xs text-amber-600 font-medium">Due ₹{pending.toLocaleString("en-IN")}</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center border-t border-border/40 divide-x divide-border/40">
                  <button
                    onClick={() => navigate('/sales-invoice', { state: { editInvoiceId: inv.id } })}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary active:bg-primary/5 transition-colors touch-manipulation"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>View</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const invoiceUrl = `${window.location.origin}/invoice/view/${inv.id}`;
                      const message = `Invoice ${inv.sale_number}%0AAmount: ₹${(inv.net_amount || 0).toLocaleString("en-IN")}%0ACustomer: ${inv.customer_name || 'Walk-in'}%0A%0AView: ${invoiceUrl}`;
                      window.open(`https://wa.me/?text=${message}`, '_blank');
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-emerald-600 active:bg-emerald-50 transition-colors touch-manipulation"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadPDF(inv);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-violet-600 active:bg-violet-50 transition-colors touch-manipulation"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>PDF</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {totalCount > itemsPerPage && (
          <div className="flex items-center justify-between px-4 py-3 bg-card border-t border-border">
            <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1}
              className="px-4 py-2 rounded-xl bg-muted text-sm font-medium disabled:opacity-40 touch-manipulation">← Prev</button>
            <span className="text-xs text-muted-foreground">Page {currentPage} of {Math.ceil(totalCount/itemsPerPage)}</span>
            <button onClick={() => setCurrentPage(p => p+1)} disabled={currentPage*itemsPerPage >= totalCount}
              className="px-4 py-2 rounded-xl bg-muted text-sm font-medium disabled:opacity-40 touch-manipulation">Next →</button>
          </div>
        )}

        {/* Dialogs — shared with desktop */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
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
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-medium">₹{Math.round(selectedInvoiceForPayment?.net_amount || 0).toLocaleString('en-IN')}</span>
                <span className="text-muted-foreground">Pending:</span>
                <span className="font-semibold text-amber-600">
                  ₹{Math.max(0, Math.round((selectedInvoiceForPayment?.net_amount || 0) - (selectedInvoiceForPayment?.paid_amount || 0) - (selectedInvoiceForPayment?.sale_return_adjust || 0))).toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <Label>Payment Amount *</Label>
                <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="Enter amount" step="0.01" />
              </div>
              <div>
                <Label>Payment Mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
              <Button onClick={() => {/* handled by existing handler */}} disabled={isRecordingPayment}>
                {isRecordingPayment ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Print preview is desktop-only */}

        <CustomerHistoryDialog
          open={showCustomerHistory}
          onOpenChange={setShowCustomerHistory}
          customerId={selectedCustomerForHistory?.id || null}
          customerName={selectedCustomerForHistory?.name || ''}
          organizationId={currentOrganization?.id || ''}
        />

        {/* Hidden Invoice Wrapper for PDF generation on mobile */}
        {invoiceToPrint && (
          <div style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
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
                discountPercent: item.discount_percent || 0,
              })) || []}
              subTotal={invoiceToPrint.gross_amount}
              discount={(invoiceToPrint.discount_amount || 0) + (invoiceToPrint.flat_discount_amount || 0)}
              saleReturnAdjust={invoiceToPrint.sale_return_adjust || 0}
              grandTotal={invoiceToPrint.net_amount}
              paymentMethod={invoiceToPrint.payment_method}
              cashAmount={invoiceToPrint.cash_amount || 0}
              upiAmount={invoiceToPrint.upi_amount || 0}
              cardAmount={invoiceToPrint.card_amount || 0}
              paidAmount={invoiceToPrint.paid_amount || 0}
              salesman={invoiceToPrint.salesman || ''}
              notes={invoiceToPrint.notes || ''}
              financerDetails={invoiceToPrint.financerDetails || null}
            />
          </div>
        )}

        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6 pb-24 lg:pb-6">
      
      <div className="w-full px-6 space-y-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-[26px] font-extrabold text-blue-600 tracking-tight leading-tight">
              Sales Invoice Dashboard
            </h1>
            <p className="text-slate-400 text-[13px] mt-0.5">View and manage all sales invoices</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportExcel} className="gap-2 h-9 text-[13px] border-slate-300 text-slate-600 hover:bg-slate-100 font-medium">
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button onClick={() => navigate("/sales-invoice")} className="h-9 px-5 text-[13px] font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all">
              New Invoice
            </Button>
            {selectedInvoices.size > 0 && (
              <div className="flex gap-2">
                <Button
                  onClick={() => { setBulkCancelReason(''); setShowBulkCancelDialog(true); }}
                  disabled={isBulkCancelling}
                  variant="outline"
                  className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Cancel Selected ({selectedInvoices.size})
                </Button>
                {hasSpecialPermission('delete_records') && (
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
            )}
          </div>
        </div>

        {/* Unsaved Draft Card */}
        {hasDraft && draftData && (
          <Card className="border border-amber-400/60 bg-amber-50 rounded-xl shadow-sm">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-amber-800">
                      Unsaved Sales Invoice Found
                    </h3>
                    <CardDescription className="text-[12px] text-amber-700 font-medium mt-0.5">
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
                    className="gap-1.5 h-8 text-[12px] border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    <X className="h-4 w-4" />
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      navigate("/sales-invoice", { state: { loadDraft: true } });
                    }}
                    className="gap-1.5 h-8 text-[12px] bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-sm"
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 w-full">
          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-md rounded-xl min-w-0"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-sm font-medium text-white/80">Total Invoices</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <FileText className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-[19px] font-black text-white tabular-nums leading-tight truncate">{effectiveStats.totalInvoices}</div>
              <p className="text-xs text-white/65 mt-0.5">All invoices</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-md rounded-xl min-w-0"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-sm font-medium text-white/80">Total Qty</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Package className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-[19px] font-black text-white tabular-nums leading-tight truncate">{effectiveStats.totalQty}</div>
              <p className="text-xs text-white/65 mt-0.5">Items sold</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-md rounded-xl min-w-0"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-sm font-medium text-white/80">Total Revenue</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-[19px] font-black text-white tabular-nums leading-tight truncate">₹{effectiveStats.totalAmount.toFixed(0)}</div>
              <p className="text-xs text-white/65 mt-0.5">Net amount</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-pink-500 to-pink-600 border-0 shadow-md rounded-xl min-w-0"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-sm font-medium text-white/80">Total Discount</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Percent className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-[19px] font-black text-white tabular-nums leading-tight truncate">₹{effectiveStats.totalDiscount.toFixed(0)}</div>
              <p className="text-xs text-white/65 mt-0.5">Given</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-md rounded-xl min-w-0"
            onClick={() => setDeliveryFilter("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-sm font-medium text-white/80">Pending Amount</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Clock className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-[19px] font-black text-white tabular-nums leading-tight truncate">₹{effectiveStats.pendingAmount.toFixed(0)}</div>
              <p className="text-xs text-white/65 mt-0.5">Outstanding</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-teal-500 to-teal-600 border-0 shadow-md rounded-xl min-w-0"
            onClick={() => setDeliveryFilter("delivered")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-sm font-medium text-white/80">Delivered</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-[19px] font-black text-white tabular-nums leading-tight truncate">{effectiveStats.deliveredCount}</div>
              <p className="text-xs text-white/65 mt-0.5">₹{effectiveStats.deliveredAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-md rounded-xl min-w-0"
            onClick={() => setDeliveryFilter("undelivered")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
              <CardDescription className="text-sm font-medium text-white/80">Undelivered</CardDescription>
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Package className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              <div className="text-[19px] font-black text-white tabular-nums leading-tight truncate">{effectiveStats.undeliveredCount}</div>
              <p className="text-xs text-white/65 mt-0.5">₹{effectiveStats.undeliveredAmount.toFixed(0)}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0">
          <div className="space-y-0">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white overflow-x-auto">
              <div className="relative flex-1 min-w-[200px] max-w-[280px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice, customer, barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 text-[13px] border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[120px] h-9 text-[13px] border-slate-200 bg-slate-50 hover:bg-white">
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[155px] h-9 text-[13px] border-slate-200 bg-slate-50 hover:bg-white justify-between">
                    {paymentStatusFilter.length === 0 ? 'All Payments' : paymentStatusFilter.length === 1 ? paymentStatusFilter[0].charAt(0).toUpperCase() + paymentStatusFilter[0].slice(1) : `${paymentStatusFilter.length} Selected`}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[180px] p-2" align="start">
                  <div className="space-y-1">
                    {[{v:"pending",l:"Pending"},{v:"partial",l:"Partial"},{v:"completed",l:"Completed"}].map((s) => (
                      <label key={s.v} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                        <Checkbox
                          checked={paymentStatusFilter.includes(s.v)}
                          onCheckedChange={(checked) => {
                            setPaymentStatusFilter(prev =>
                              checked ? [...prev, s.v] : prev.filter(f => f !== s.v)
                            );
                            setCurrentPage(1);
                          }}
                        />
                        {s.l}
                      </label>
                    ))}
                    {paymentStatusFilter.length > 0 && (
                      <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => { setPaymentStatusFilter([]); setCurrentPage(1); }}>
                        Clear All
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
                <SelectTrigger className="w-[145px] h-9 text-[13px] border-slate-200 bg-slate-50 hover:bg-white">
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
              <Select value={shopFilter} onValueChange={setShopFilter}>
                <SelectTrigger className="w-[130px] h-9 text-[13px] border-slate-200 bg-slate-50 hover:bg-white">
                  <SelectValue placeholder="Shop" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shops</SelectItem>
                  {shopNames.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-[145px] h-9 text-[13px] border-slate-200 bg-slate-50 hover:bg-white">
                  <SelectValue placeholder="Billing User" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {orgUsers.map((user: any) => (
                    <SelectItem key={user.id} value={user.id} title={user.email}>
                      {user.email.split("@")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredCustomer && bulkAdvanceBalance > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-[13px] border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-medium gap-1.5 flex-shrink-0"
                  onClick={() => {
                    setBulkAdvanceCustomer(filteredCustomer);
                    setShowBulkAdvanceDialog(true);
                  }}
                >
                  <IndianRupee className="h-3.5 w-3.5" />
                  Adjust Advance ₹{bulkAdvanceBalance.toLocaleString("en-IN")}
                </Button>
              )}
              <div id="erp-toolbar-portal" className="flex items-center gap-1.5 ml-auto flex-shrink-0" />
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
                handleCancelIRN={handleCancelIRN}
                isCancellingIRN={isCancellingIRN}
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
                setInvoiceToCancel={(inv: any) => { setCancelReason(''); setInvoiceToCancel(inv); }}
                setInvoiceToHardDelete={setInvoiceToHardDelete}
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
                loadedItems={loadedItems}
                renderToolbar={(toolbar) => {
                  const portalTarget = document.getElementById('erp-toolbar-portal');
                  if (portalTarget) {
                    return createPortal(toolbar, portalTarget);
                  }
                  return toolbar;
                }}
              />
            {totalCount > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
                <div className="flex items-center gap-4">
                  <div className="text-[12px] text-slate-500">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} invoices
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-slate-500">Show:</span>
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
                    className="h-8 text-[12px] px-3 border-slate-200"
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-2 px-3">
                    <span className="text-[12px] text-slate-600 font-medium">
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="h-8 text-[12px] px-3 border-slate-200"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* CANCEL INVOICE DIALOG */}
      <Dialog open={!!invoiceToCancel} onOpenChange={(open) => { if (!open) { setInvoiceToCancel(null); setCancelReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Ban className="h-5 w-5" />
              Cancel Invoice
            </DialogTitle>
            <DialogDescription>
              Invoice {invoiceToCancel?.sale_number} will be marked as CANCELLED.
              Stock will be automatically restored. The invoice number is preserved in the system — no gap in your series.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Cancellation Reason (optional)</Label>
            <Textarea
              placeholder="e.g. Customer requested cancellation, Wrong items billed..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="resize-none"
              rows={3}
            />
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Stock for all items in this invoice will be automatically returned to inventory.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInvoiceToCancel(null); setCancelReason(''); }}>
              Keep Invoice
            </Button>
            <Button
              variant="default"
              className="bg-orange-600 hover:bg-orange-700"
              onClick={handleCancelInvoice}
              disabled={isCancelling}
            >
              {isCancelling
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelling...</>
                : <><Ban className="h-4 w-4 mr-2" /> Cancel Invoice</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PERMANENTLY DELETE DIALOG */}
      <AlertDialog open={!!invoiceToHardDelete} onOpenChange={(open) => { if (!open) setInvoiceToHardDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Permanently Delete Invoice?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Invoice <strong>{invoiceToHardDelete?.sale_number}</strong> will be
                  <strong> permanently deleted</strong> from the database.
                </p>
                <p>Stock will be restored for all items in this invoice.</p>
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive font-medium">
                  ⚠️ This is irreversible. Use only for test or trial data cleanup.
                  For real business cancellations, use "Cancel Invoice" instead.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isHardDeleting}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleHardDeleteInvoice}
              className="bg-destructive hover:bg-destructive/90"
              disabled={isHardDeleting}
            >
              {isHardDeleting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Deleting...</>
                : <><Trash2 className="h-4 w-4 mr-2" /> Yes, Permanently Delete</>
              }
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

        {/* BULK CANCEL DIALOG */}
        <Dialog open={showBulkCancelDialog} onOpenChange={(open) => { if (!open) { setShowBulkCancelDialog(false); setBulkCancelReason(''); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-orange-600">
                <Ban className="h-5 w-5" />
                Cancel {selectedInvoices.size} Invoice(s)
              </DialogTitle>
              <DialogDescription>
                All selected invoices will be marked as CANCELLED. Stock will be automatically restored for all items.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Textarea
                placeholder="Cancellation reason (optional)"
                value={bulkCancelReason}
                onChange={(e) => setBulkCancelReason(e.target.value)}
                className="resize-none"
                rows={3}
              />
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Stock for all items in {selectedInvoices.size} invoice(s) will be returned to inventory.</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowBulkCancelDialog(false); setBulkCancelReason(''); }}>
                Keep Invoices
              </Button>
              <Button
                variant="default"
                className="bg-orange-600 hover:bg-orange-700"
                onClick={handleBulkCancel}
                disabled={isBulkCancelling}
              >
                {isBulkCancelling
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelling...</>
                  : <><Ban className="h-4 w-4 mr-2" /> Cancel All</>
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                  ₹{Math.max(0, Math.round((selectedInvoiceForPayment?.net_amount || 0) - (selectedInvoiceForPayment?.paid_amount || 0) - (selectedInvoiceForPayment?.sale_return_adjust || 0))).toLocaleString('en-IN')}
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
                    {selectedInvoiceForPayment?.customer_id && (
                      <SelectItem value="credit_note">From Credit Note (CN)</SelectItem>
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
                {paymentMode === "credit_note" && (
                  <div className="mt-2">
                    {isFetchingCN ? (
                      <Badge variant="info" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Fetching CN balance...
                      </Badge>
                    ) : availableCNBalance > 0 ? (
                      <Badge variant="success" className="gap-1">
                        <IndianRupee className="h-3 w-3" />
                        Available CN Balance: ₹{Math.round(availableCNBalance).toLocaleString('en-IN')}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        No credit note balance available for this customer
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
                disabled={isRecordingPayment || (paymentMode === "advance" && advanceBalance <= 0) || (paymentMode === "credit_note" && availableCNBalance <= 0)}
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
                discountPercent: item.discount_percent || 0,
              })) || []}
                subTotal={invoiceToPrint.gross_amount}
                discount={(invoiceToPrint.discount_amount || 0) + (invoiceToPrint.flat_discount_amount || 0)}
                saleReturnAdjust={invoiceToPrint.sale_return_adjust || 0}
                grandTotal={invoiceToPrint.net_amount}
                cashPaid={invoiceToPrint.payment_method === 'cash' ? invoiceToPrint.net_amount : 0}
                upiPaid={invoiceToPrint.payment_method === 'upi' ? invoiceToPrint.net_amount : 0}
                paymentMethod={invoiceToPrint.payment_method}
                cashAmount={invoiceToPrint.cash_amount || 0}
                upiAmount={invoiceToPrint.upi_amount || 0}
                cardAmount={invoiceToPrint.card_amount || 0}
                paidAmount={invoiceToPrint.paid_amount || 0}
                salesman={invoiceToPrint.salesman || ''}
                notes={invoiceToPrint.notes || ''}
                financerDetails={invoiceToPrint.financerDetails || null}
              />
              ) : null
            }
          />
        )}

        {/* Hidden Invoice for Printing */}
        {invoiceToPrint && (
          <div className="no-print" style={{
            position: 'fixed',
            top: 0,
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
                discountPercent: item.discount_percent || 0,
              })) || []}
              subTotal={invoiceToPrint.gross_amount}
              discount={(invoiceToPrint.discount_amount || 0) + (invoiceToPrint.flat_discount_amount || 0)}
              saleReturnAdjust={invoiceToPrint.sale_return_adjust || 0}
              grandTotal={invoiceToPrint.net_amount}
              paymentMethod={invoiceToPrint.payment_method}
              cashAmount={invoiceToPrint.cash_amount || 0}
              upiAmount={invoiceToPrint.upi_amount || 0}
              cardAmount={invoiceToPrint.card_amount || 0}
              paidAmount={invoiceToPrint.paid_amount || 0}
              salesman={invoiceToPrint.salesman || ''}
              notes={invoiceToPrint.notes || ''}
              financerDetails={invoiceToPrint.financerDetails || null}
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

        {/* Bulk Advance Adjust Dialog */}
        {bulkAdvanceCustomer && (
          <BulkAdvanceAdjustDialog
            open={showBulkAdvanceDialog}
            onOpenChange={setShowBulkAdvanceDialog}
            customerId={bulkAdvanceCustomer.id}
            customerName={bulkAdvanceCustomer.name}
            organizationId={currentOrganization?.id || ""}
            userId={user?.id}
            onComplete={() => {
              refetch();
              // Re-fetch advance balance
              if (filteredCustomer?.id) {
                getAvailableAdvanceBalance(filteredCustomer.id).then(setBulkAdvanceBalance).catch(() => setBulkAdvanceBalance(0));
              }
            }}
          />
        )}
      </div>
  );
}
