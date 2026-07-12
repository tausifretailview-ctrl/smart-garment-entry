import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { STALE_SETTINGS } from "@/lib/queryStaleTimes";
import { DASHBOARD_KPI_QUERY_OPTIONS, DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { useOrgQuery } from "@/hooks/useOrgQuery";
import { supabase } from "@/integrations/supabase/client";
import { deleteLedgerEntries } from "@/lib/customerLedger";
import {
  deleteJournalEntryByReference,
  recordCustomerAdvanceApplicationJournalEntry,
  recordCustomerCreditNoteApplicationJournalEntry,
  recordCustomerReceiptJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { reverseCustomerAdvanceFifo } from "@/utils/reverseCustomerAdvanceFifo";
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
import { SkeletonKpiCards } from "@/components/skeletons/SkeletonKpiCards";
import { SkeletonMobileListRows, SkeletonTableRows } from "@/components/skeletons/SkeletonTableRows";
import { SALES_INVOICE_TABLE_SKELETON_COLUMNS } from "@/components/skeletons/dashboardSkeletonPresets";

import { Search, Printer, Edit, ChevronDown, ChevronUp, Trash2, Loader2, MessageCircle, Link2, Settings2, Package, IndianRupee, Send, FileText, TrendingUp, CheckCircle2, Clock, CalendarIcon, Download, Percent, Zap, FileDown, Lock, X, Plus, RefreshCw, Copy, Ban, Eye, MoreHorizontal, FileSpreadsheet, User, Phone, AlertTriangle, Receipt } from "lucide-react";
import * as XLSX from "xlsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { captureElementToPdfBase64 } from "@/utils/captureInvoicePdf";
import { captureElementToPdfBlob } from "@/utils/invoiceElementToPdf";
import { resendSaleInvoiceWhatsApp } from "@/utils/resendSaleInvoiceWhatsApp";
import { deliverPdfBlob, shouldUseMobileDocumentDelivery } from "@/utils/mobileDocumentDelivery";
import { useIsNativeApp } from "@/hooks/useNativeApp";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, subDays } from "date-fns";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useSearchParams, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { EInvoicePrint } from "@/components/EInvoicePrint";
import { useReactToPrint } from "react-to-print";
import {
  resolveSaleBillFormat,
  toInvoiceWrapperFormat,
  resolvePosThermalPaper,
  posThermalPageCss,
  type PosBillFormat,
} from "@/utils/invoicePrintFormat";
import {
  getThermalReceiptPageStyleFragment,
  INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS,
} from "@/utils/thermalReceiptPrintDocument";
import { buildPublicInvoiceViewUrl } from "@/utils/publicInvoiceLink";
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
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import { InvoiceHistoryDialog } from "@/components/InvoiceHistoryDialog";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useCustomerAdvances } from "@/hooks/useCustomerAdvances";
import { BulkAdvanceAdjustDialog } from "@/components/BulkAdvanceAdjustDialog";
import { SettleCustomerAccountDialog } from "@/components/SettleCustomerAccountDialog";
import { InvoiceDashboardBulkBar } from "@/components/sales-invoice-dashboard/InvoiceDashboardBulkBar";
import {
  invoiceOutstandingAmount,
  recordInvoiceFullCashPayment,
} from "@/utils/recordInvoiceDashboardCashPayment";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useEntryOwnership } from "@/hooks/useEntryOwnership";
import { formatDistanceToNow } from "date-fns";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, PageContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileStatStrip } from "@/components/mobile/MobileStatStrip";
import { MobilePeriodChips } from "@/components/mobile/MobilePeriodChips";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { cn } from "@/lib/utils";
import { useTabCacheLayout } from "@/contexts/TabCacheLayoutContext";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { mergeActivityNavigationState } from "@/lib/activityCenterNavigation";
import { onWheelScrollContainer } from "@/lib/scrollWheel";
import { waitForPrintReady } from "@/utils/printReady";
import { whatsappPaymentReceiptDiscountLines } from "@/utils/paymentReceiptWhatsApp";
import {
  applyCreditNoteFifoToSale,
  createReceiptVoucher,
  consumeAdvanceFIFO,
  derivePaidAndStatus,
  getAvailableCN,
  warnSettlementPathMismatch,
  type CnFifoVoucherChunk,
} from "@/utils/saleSettlement";
import { fetchCustomerBalanceSnapshot } from "@/utils/customerBalanceUtils";
import { confirmInvoiceOverpaymentIfNeeded } from "@/utils/invoiceOverpaymentGuard";
import {
  fetchInvoiceDashboardPage,
  fetchInvoiceDashboardStats,
  getInvoiceDashboardDisplayStatus,
  patchInvoiceDashboardDeliveryStatus,
  patchInvoiceDashboardPaymentFields,
  reconcileInvoiceDashboardRows,
  refetchInvoiceDashboardQueries,
  syncVisibleInvoiceStaleFields,
} from "@/utils/invoiceDashboardData";
import { isSaleInvoiceCancelled } from "@/utils/saleInvoiceStatus";
import { invalidateSalesQueriesNow } from "@/utils/deferredSalesInvalidation";
import { formatCnApplyError } from "@/utils/saleReturnCnBalance";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { isDashboardFilterRestoring, restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";
import { ReceivingBankAccountPicker } from "@/components/accounts/ReceivingBankAccountPicker";
import { useOrganizationBankAccounts } from "@/hooks/useOrganizationBankAccounts";
import {
  appendReceivingBankToDescription,
  paymentMethodNeedsReceivingBank,
  validateReceivingBankForSave,
} from "@/utils/organizationBankAccounts";

const safeErrorString = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    return val.ErrorMessage || val.message || val.error || JSON.stringify(val);
  }
  return String(val);
};

/** Header amount but no qty on file — usually missing or soft-deleted sale_items. */
const invoiceLikelyMissingLines = (inv: { net_amount?: number; total_qty?: number }) =>
  Number(inv.net_amount || 0) > 0 && Number(inv.total_qty || 0) === 0;

/**
 * Payment status filter for sales: cancelled is stored as payment_status and/or is_cancelled.
 * When non-cancelled statuses are selected, exclude rows flagged is_cancelled so legacy bad rows
 * do not appear under Pending/Paid.
 */
function applyPaymentStatusFilterToSalesQuery(query: any, paymentStatusFilter: string[]) {
  if (paymentStatusFilter.length === 0) return query;
  const hasCancelled = paymentStatusFilter.includes("cancelled");
  const rest = paymentStatusFilter.filter((s) => s !== "cancelled");
  if (hasCancelled && rest.length === 0) {
    return query.or("payment_status.eq.cancelled,is_cancelled.eq.true");
  }
  if (hasCancelled && rest.length > 0) {
    const inList = rest.join(",");
    return query.or(
      `and(payment_status.in.(${inList}),is_cancelled.eq.false),is_cancelled.eq.true,payment_status.eq.cancelled`,
    );
  }
  return query.in("payment_status", rest).eq("is_cancelled", false);
}

/** Inclusive calendar-day bounds for sale_date (avoids UTC midnight cutting off same-day invoices). */
function salesDashboardSaleDateFilterBounds(startYmd: string | null, endYmd: string | null) {
  if (!startYmd && !endYmd) return { start: null as string | null, end: null as string | null };
  return {
    start: startYmd ? `${startYmd}T00:00:00` : null,
    end: endYmd ? `${endYmd}T23:59:59.999` : null,
  };
}

interface ColumnSettings {
  [key: string]: boolean;
  phone: boolean;
  status: boolean;
  delivery: boolean;
  whatsappActions: boolean;
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
  whatsappActions: false,
  copyLink: true,
  print: true,
  download: true,
  modify: true,
  delete: true,
};

export default function SalesInvoiceDashboard() {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { user, session } = useAuth();
  const { currentOrganization, organizationRole } = useOrganization();
  const { accounts: bankAccounts } = useOrganizationBankAccounts(currentOrganization?.id ?? "");
  const { hasSpecialPermission } = useUserPermissions();
  const { formatMessage } = useWhatsAppTemplates();
  const { sendWhatsApp, copyInvoiceLink } = useWhatsAppSend();
  const { settings: whatsAppAPISettings, sendMessageAsync, isSending: isSendingWhatsAppAPI } = useWhatsAppAPI();
  const queryClient = useQueryClient();
  const refreshInvoiceDashboard = useCallback(() => {
    if (!currentOrganization?.id) return;
    void refetchInvoiceDashboardQueries(queryClient, currentOrganization.id);
  }, [queryClient, currentOrganization?.id]);
  const isMobile = useIsMobile();
  const isNativeApp = useIsNativeApp();
  const inTabCache = useTabCacheLayout();
  const sharedShell = useSharedAppShell();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadedItems, setLoadedItems] = useState<Record<string, any[]>>({});
  const loadedItemsRef = useRef<Record<string, any[]>>({});
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("weekly");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);
  const [shopFilter, setShopFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("__pending__");

  // Fetch org users for billing user filter
  const { data: orgUsers = [], isFetched: orgUsersFetched } = useQuery({
    queryKey: ["org-users-filter", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", currentOrganization.id);
      if (!members?.length) return [];
      if (!session?.access_token) return [];
      const { data: result } = await supabase.functions.invoke("get-users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const allUsers = result?.users || [];
      const memberIds = new Set(members.map((m: any) => m.user_id));
      return allUsers
        .filter((u: any) => memberIds.has(u.id))
        .map((u: any) => ({ id: u.id, email: u.email }));
    },
    enabled: !!currentOrganization?.id && !!session?.access_token,
    staleTime: STALE_SETTINGS,
    refetchOnWindowFocus: false,
  });

  // Creator-scoped Modify/Delete (multi-user invoice protection)
  const { canModify: canModifyEntry } = useEntryOwnership();
  const invoiceCreatorLabel = useCallback(
    (createdBy?: string | null) => {
      if (!createdBy) return undefined;
      const u: any = (orgUsers || []).find((x: any) => x?.id === createdBy);
      const email = u?.email as string | undefined;
      if (!email) return undefined;
      return email.split("@")[0] || email;
    },
    [orgUsers],
  );

  // Default userFilter: admins (and mobile) see all users; non-admins default to themselves
  useEffect(() => {
    const pending = !userFilter || userFilter === "__pending__";
    if (!pending) return;
    if (orgUsers.length > 0 && user?.id) {
      if (orgUsers.length === 1 || isMobile || organizationRole === "admin") {
        setUserFilter("all");
      } else {
        const isOrgMember = orgUsers.some((u: any) => u.id === user.id);
        setUserFilter(isOrgMember ? user.id : "all");
      }
    } else if (orgUsersFetched) {
      setUserFilter("all");
    }
  }, [userFilter, orgUsers, orgUsersFetched, user?.id, isMobile, organizationRole]);

  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [bulkBusyAction, setBulkBusyAction] = useState<string | null>(null);
  const [bulkProgressLabel, setBulkProgressLabel] = useState<string | null>(null);
  const [showBulkMarkPaidDialog, setShowBulkMarkPaidDialog] = useState(false);
  const [isBulkMarkingPaid, setIsBulkMarkingPaid] = useState(false);
  const bulkPrintQueueRef = useRef<any[]>([]);
  const bulkPrintResolveRef = useRef<(() => void) | null>(null);
  const bulkPrintProgressRef = useRef({ current: 0, total: 0, ok: 0, fail: 0 });
  const processBulkPrintNextRef = useRef<(() => Promise<void>) | null>(null);
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
  const [itemsPerPage, setItemsPerPage] = useState(100);

  const invoiceFilterSnapshot = useMemo(
    () => ({
      searchQuery,
      periodFilter,
      paymentStatusFilter,
      deliveryFilter,
      shopFilter,
      userFilter: userFilter === "__pending__" ? undefined : userFilter,
      startDate,
      endDate,
      currentPage,
      itemsPerPage,
    }),
    [
      searchQuery,
      periodFilter,
      paymentStatusFilter,
      deliveryFilter,
      shopFilter,
      userFilter,
      startDate,
      endDate,
      currentPage,
      itemsPerPage,
    ],
  );

  useDashboardFilterPersistence(
    "sales-invoice-dashboard",
    currentOrganization?.id,
    invoiceFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", setSearchQuery],
          ["periodFilter", setPeriodFilter],
          ["deliveryFilter", setDeliveryFilter],
          ["shopFilter", setShopFilter],
          ["userFilter", setUserFilter],
        ],
        stringArrays: [["paymentStatusFilter", setPaymentStatusFilter]],
        optionalDates: [
          ["startDate", setStartDate],
          ["endDate", setEndDate],
        ],
        numbers: [
          ["currentPage", setCurrentPage],
          ["itemsPerPage", setItemsPerPage],
        ],
      });
    },
  );

  const [invoiceToPrint, setInvoiceToPrint] = useState<any>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [billFormat, setBillFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal' | null>(null);
  const [invoiceTemplate, setInvoiceTemplate] = useState<string>('professional');
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

  /** Full column count must match header/body rows or colspan breaks table alignment (incl. optional phone). */
  const invoiceTableColumnCount = useMemo(
    () =>
      9 +
      (columnSettings.phone ? 1 : 0) +
      (columnSettings.status ? 2 : 0) +
      (columnSettings.delivery ? 1 : 0),
    [columnSettings.phone, columnSettings.status, columnSettings.delivery]
  );

  /** Columns from checkbox through date (inclusive), before qty — for "Page total" label cell. */
  const invoiceTableColSpanBeforeQty = useMemo(
    () => 5 + (columnSettings.phone ? 1 : 0),
    [columnSettings.phone]
  );

  /** Scale column % widths to 100% so the grid fits one page without horizontal scroll. */
  const invoiceTableColWidths = useMemo(() => {
    const slots: { pct: number }[] = [
      { pct: 2 },
      { pct: 2 },
      { pct: 9 },
      { pct: 18 },
    ];
    if (columnSettings.phone) slots.push({ pct: 7 });
    slots.push({ pct: 6 }, { pct: 3.5 }, { pct: 5.5 }, { pct: 7 });
    if (columnSettings.status) slots.push({ pct: 6.5 }, { pct: 6.5 });
    if (columnSettings.delivery) slots.push({ pct: 5.5 });
    slots.push({ pct: columnSettings.whatsappActions ? 14 : 11 });
    const total = slots.reduce((sum, slot) => sum + slot.pct, 0);
    const scale = 100 / total;
    return slots.map((slot) => `${(slot.pct * scale).toFixed(2)}%`);
  }, [
    columnSettings.phone,
    columnSettings.status,
    columnSettings.delivery,
    columnSettings.whatsappActions,
  ]);

  // Sale returns state
  const [saleReturns, setSaleReturns] = useState<Record<string, any[]>>({});

  // Payment recording state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentMode, setPaymentMode] = useState("cash");
  const [receivingBankAccountId, setReceivingBankAccountId] = useState<string | null>(null);
  const [paymentNarration, setPaymentNarration] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [advanceBalance, setAdvanceBalance] = useState<number>(0);
  const [advanceFromBookings, setAdvanceFromBookings] = useState<number>(0);
  const [isFetchingAdvance, setIsFetchingAdvance] = useState(false);
  const [availableCNBalance, setAvailableCNBalance] = useState<number>(0);
  const [isFetchingCN, setIsFetchingCN] = useState(false);
  // Receipt state
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const openCustomerAccount = useOpenCustomerAccount();

  // Invoice history dialog state
  const [showInvoiceHistory, setShowInvoiceHistory] = useState(false);
  const [selectedInvoiceForHistory, setSelectedInvoiceForHistory] = useState<{ id: string } | null>(null);
  
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
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [settleCustomerId, setSettleCustomerId] = useState<string | null>(null);
  const [settleCustomerName, setSettleCustomerName] = useState("");

  // Context menu for desktop right-click
  const isDesktop = useIsDesktop();
  const rowContextMenu = useContextMenu<any>();
  const pageContextMenu = useContextMenu<void>();

  // Get context menu items for invoice row
  const getInvoiceContextMenuItems = (invoice: any): ContextMenuItem[] => {
    const cancelled = isSaleInvoiceCancelled(invoice);
    const isLocked = invoice.payment_status === 'completed';
    const ownership = canModifyEntry((invoice as any).created_by, invoiceCreatorLabel((invoice as any).created_by));
    const canModify = (hasSpecialPermission('modify_records') || !isLocked) && ownership.allowed;
    const canDelete = hasSpecialPermission('delete_records') && ownership.allowed;
    const canCancelInvoice = hasSpecialPermission('cancel_invoice');
    
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
        disabled: !canModify || cancelled,
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
      ...(columnSettings.whatsappActions
        ? [{
            label: "Send on WhatsApp",
            icon: MessageCircle,
            onClick: () => {
              if (invoice.customer_phone) {
                const invoiceUrl = buildSaleInvoiceViewUrl(invoice.id);
                const message = formatMessage("sales_invoice", invoice, undefined, 0, {
                  invoiceLink: invoiceUrl,
                  organizationName: currentOrganization?.name || '',
                }) || `Invoice ${invoice.sale_number} - ₹${invoice.net_amount}`;
                sendWhatsApp(invoice.customer_phone, message);
              }
            },
            disabled: !invoice.customer_phone,
          } satisfies ContextMenuItem]
        : []),
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
          if (isSaleInvoiceCancelled(invoice)) return;
          setCancelReason('');
          setInvoiceToCancel(invoice);
        },
        disabled: !canCancelInvoice || cancelled,
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
      onClick: () => refreshInvoiceDashboard(),
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

  const saleSettings = (settings as any)?.sale_settings;

  const buildSaleInvoiceViewUrl = useCallback(
    (saleId: string) =>
      buildPublicInvoiceViewUrl({
        orgSlug: currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || "",
        saleId,
        billContext: "sale",
        saleSettings,
        baseUrl: window.location.origin,
      }),
    [currentOrganization?.slug, saleSettings],
  );

  const effectiveSaleBillFormat = useMemo((): PosBillFormat => {
    const raw = (billFormat || saleSettings?.sales_bill_format || "a4") as PosBillFormat;
    return resolveSaleBillFormat(
      invoiceTemplate,
      raw,
      saleSettings?.invoice_paper_format,
    );
  }, [billFormat, invoiceTemplate, saleSettings?.sales_bill_format, saleSettings?.invoice_paper_format]);

  const saleInvoiceWrapperFormat = useMemo(
    () => toInvoiceWrapperFormat(effectiveSaleBillFormat),
    [effectiveSaleBillFormat],
  );

  const saleThermalPaper = resolvePosThermalPaper(
    (settings as any)?.bill_barcode_settings?.direct_print_sale_paper,
  );

  const salePrintSourceStyle = useMemo(
    (): React.CSSProperties => ({
      width:
        effectiveSaleBillFormat === "a4"
          ? "210mm"
          : effectiveSaleBillFormat === "thermal"
            ? "80mm"
            : effectiveSaleBillFormat === "a5-horizontal"
              ? "210mm"
              : "148mm",
      minHeight:
        effectiveSaleBillFormat === "a4"
          ? "297mm"
          : effectiveSaleBillFormat === "thermal"
            ? "auto"
            : effectiveSaleBillFormat === "a5-horizontal"
              ? "148mm"
              : "210mm",
      maxHeight:
        effectiveSaleBillFormat === "a4"
          ? "297mm"
          : effectiveSaleBillFormat === "thermal"
            ? "none"
            : effectiveSaleBillFormat === "a5-horizontal"
              ? "148mm"
              : "210mm",
    }),
    [effectiveSaleBillFormat],
  );

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
        return { start: format(today, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
      case 'weekly':
        return {
          // Rolling last 7 days (including today) — avoids empty result on
          // Monday mornings when ISO week has only the current day.
          start: format(subDays(today, 6), 'yyyy-MM-dd'),
          end: format(today, 'yyyy-MM-dd'),
        };
      case 'monthly':
        return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
      case 'yearly':
        return { start: format(startOfYear(today), 'yyyy-MM-dd'), end: format(endOfYear(today), 'yyyy-MM-dd') };
      case 'all':
        return { start: null, end: null };
      case 'custom':
        return { 
          start: startDate ? format(startOfDay(startDate), 'yyyy-MM-dd') : null, 
          end: endDate ? format(endDate, 'yyyy-MM-dd') : null 
        };
      default:
        return { start: null, end: null };
    }
  }, [periodFilter, startDate, endDate]);

  const saleDateFilter = useMemo(
    () => salesDashboardSaleDateFilterBounds(queryDateRange.start, queryDateRange.end),
    [queryDateRange.start, queryDateRange.end],
  );

  const dashboardFilters = useMemo(
    () => ({
      organizationId: currentOrganization?.id ?? "",
      debouncedSearch,
      deliveryFilter,
      paymentStatusFilter,
      shopFilter,
      userFilter: userFilter && userFilter !== "__pending__" ? userFilter : "all",
      saleDateFilter,
      voucherDateFrom: queryDateRange.start,
      voucherDateTo: queryDateRange.end,
    }),
    [
      currentOrganization?.id,
      debouncedSearch,
      deliveryFilter,
      paymentStatusFilter,
      shopFilter,
      userFilter,
      saleDateFilter,
      queryDateRange.start,
      queryDateRange.end,
    ],
  );

  const dashboardQueryEnabled = !!currentOrganization?.id;

  const dashboardQueryKey = [
    "invoice-dashboard-unified",
    currentOrganization?.id,
    debouncedSearch,
    deliveryFilter,
    paymentStatusFilter,
    shopFilter,
    userFilter && userFilter !== "__pending__" ? userFilter : "all",
    queryDateRange.start,
    queryDateRange.end,
    currentPage,
    itemsPerPage,
  ] as const;

  // Fast server-side summary tiles (parallel with table fetch).
  const {
    data: dashboardStats,
    isLoading: isStatsLoading,
  } = useQuery({
    queryKey: [...dashboardQueryKey, "stats"],
    queryFn: async () => {
      if (!currentOrganization?.id) {
        return {
          totalInvoices: 0,
          totalAmount: 0,
          totalDiscount: 0,
          totalQty: 0,
          pendingAmount: 0,
          deliveredCount: 0,
          deliveredAmount: 0,
          undeliveredCount: 0,
          undeliveredAmount: 0,
        };
      }
      return fetchInvoiceDashboardStats(supabase, dashboardFilters);
    },
    enabled: dashboardQueryEnabled,
    ...DASHBOARD_KPI_QUERY_OPTIONS,
  });

  // Table rows: server-side page + per-page reconcile (stats come from RPC above).
  const {
    data: dashboardPage,
    isLoading,
    isFetching,
    refetch,
    error: invoicesError,
    dataUpdatedAt: invoicesUpdatedAt,
  } = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: async () => {
      if (!currentOrganization?.id) {
        return { invoices: [] as any[], totalCount: 0 };
      }
      return fetchInvoiceDashboardPage(supabase, dashboardFilters, {
        page: currentPage,
        pageSize: itemsPerPage,
        reconcile: false,
      });
    },
    enabled: dashboardQueryEnabled,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  const reconcileSourceKey = useMemo(
    () => dashboardPage?.sourceRows?.map((row: any) => row.id).join(",") ?? "",
    [dashboardPage?.sourceRows],
  );

  const { data: reconciledPageInvoices } = useQuery({
    queryKey: [...dashboardQueryKey, "reconcile", reconcileSourceKey],
    queryFn: async () => {
      const sourceRows = dashboardPage?.sourceRows;
      if (!sourceRows?.length || !currentOrganization?.id) return [];
      const normalized = await reconcileInvoiceDashboardRows(
        supabase,
        dashboardFilters,
        sourceRows,
      );
      return dashboardFilters.paymentStatusFilter.length > 0
        ? normalized.filter((inv: any) =>
            dashboardFilters.paymentStatusFilter.includes(inv.payment_status),
          )
        : normalized;
    },
    enabled: dashboardQueryEnabled && reconcileSourceKey.length > 0,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  const isDashboardInitialLoad = isLoading && dashboardPage === undefined;
  const isDashboardBackgroundRefresh = isFetching && !isDashboardInitialLoad;

  useEffect(() => {
    if (!invoicesError) return;
    const message =
      invoicesError instanceof Error
        ? invoicesError.message
        : typeof invoicesError === "object" &&
            invoicesError !== null &&
            "message" in invoicesError
          ? String((invoicesError as { message?: string }).message)
          : "Failed to load sales invoices";
    toast({
      title: "Sales dashboard load failed",
      description: message || "Failed to load sales invoices",
      variant: "destructive",
    });
  }, [invoicesError, toast]);

  const paginatedInvoices =
    reconciledPageInvoices ?? dashboardPage?.invoices ?? [];
  const reconciledStats = dashboardStats;
  const totalCount =
    paymentStatusFilter.length > 0 &&
    dashboardStats &&
    dashboardStats.totalInvoices > 0
      ? dashboardStats.totalInvoices
      : (dashboardPage?.totalCount ?? 0);

  // Repair stale paid_amount / payment_status for visible rows only (not on every dashboard load).
  const visiblePageSyncKey = useMemo(
    () => paginatedInvoices.map((inv: any) => inv.id).join(","),
    [paginatedInvoices],
  );
  useEffect(() => {
    if (!currentOrganization?.id || !visiblePageSyncKey || !reconciledPageInvoices) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const didUpdate = await syncVisibleInvoiceStaleFields(
            supabase,
            currentOrganization.id,
            paginatedInvoices,
            queryDateRange.start,
            queryDateRange.end,
          );
          if (!cancelled && didUpdate) {
            refreshInvoiceDashboard();
          }
        } catch {
          // Non-blocking background repair; table already shows reconciled display values.
        }
      })();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    currentOrganization?.id,
    visiblePageSyncKey,
    reconciledPageInvoices,
    paginatedInvoices,
    queryDateRange.start,
    queryDateRange.end,
    refreshInvoiceDashboard,
  ]);

  // Auto-download PDF when navigated from mobile with downloadPdf param
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const downloadPdfId = searchParams.get('downloadPdf');
  const downloadTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!downloadPdfId || isDashboardInitialLoad || downloadTriggeredRef.current === downloadPdfId) return;
    downloadTriggeredRef.current = downloadPdfId;
    // Find the invoice in loaded data or fetch it directly
    const found = paginatedInvoices.find((inv: any) => inv.id === downloadPdfId);
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
  }, [downloadPdfId, isDashboardInitialLoad, paginatedInvoices]);

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
    staleTime: STALE_SETTINGS,
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

  // Get item display settings from settings (saleSettings declared above with bill-format helpers)
  const showItemBrand = saleSettings?.show_item_brand ?? false;
  const showItemColor = saleSettings?.show_item_color ?? false;
  const showItemStyle = saleSettings?.show_item_style ?? false;
  const showItemBarcode = saleSettings?.show_item_barcode ?? true;
  const showItemHsn = saleSettings?.show_item_hsn ?? false;
  const showItemMrp = saleSettings?.show_item_mrp ?? saleSettings?.show_mrp_column ?? false;

  // Detect single filtered customer for bulk advance button
  const filteredCustomer = useMemo(() => {
    if (!debouncedSearch || !paginatedInvoices.length) return null;
    const customerIds = new Set(
      paginatedInvoices.map((inv: any) => inv.customer_id).filter(Boolean),
    );
    if (customerIds.size === 1) {
      const inv = paginatedInvoices.find((i: any) => i.customer_id);
      return inv ? { id: inv.customer_id, name: inv.customer_name } : null;
    }
    return null;
  }, [debouncedSearch, paginatedInvoices]);

  // Fetch combined advance + credit balance for filtered customer
  useEffect(() => {
    if (filteredCustomer?.id && currentOrganization?.id) {
      const fetchCombinedBalance = async () => {
        try {
          const customerId = filteredCustomer.id;
          const bookingBalance = await getAvailableAdvanceBalance(customerId);
          // Only true unused advance bookings are spendable. Customer overpayments / refund liabilities
          // must be returned via Refund or converted into an explicit Advance booking — not silently re-spent.
          setBulkAdvanceBalance(bookingBalance);
        } catch {
          setBulkAdvanceBalance(0);
        }
      };
      fetchCombinedBalance();
    } else {
      setBulkAdvanceBalance(0);
    }
  }, [filteredCustomer?.id, currentOrganization?.id, invoicesUpdatedAt]);

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

      refreshInvoiceDashboard();
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
      refreshInvoiceDashboard();
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
      const invoiceIds = Array.from(selectedInvoices).filter((id) => {
        const inv = (paginatedInvoices as any[])?.find?.((x: any) => x.id === id);
        return inv && !isSaleInvoiceCancelled(inv);
      });
      const skipped = selectedInvoices.size - invoiceIds.length;
      if (invoiceIds.length === 0) {
        toast({
          title: "Nothing to cancel",
          description: "All selected invoices are already cancelled.",
          variant: "destructive",
        });
        return;
      }
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
        description: `${successCount} invoice(s) cancelled successfully${failCount > 0 ? `, ${failCount} failed` : ''}${skipped > 0 ? `, ${skipped} already cancelled (skipped)` : ''}. Stock has been restored.`,
      });
      setSelectedInvoices(new Set());
      setShowBulkCancelDialog(false);
      setBulkCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['invoice-dashboard-unified'] });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsBulkCancelling(false);
    }
  };

  const handleCancelInvoice = async () => {
    if (!invoiceToCancel) return;
    if (isSaleInvoiceCancelled(invoiceToCancel)) {
      toast({
        title: "Already cancelled",
        description: `Invoice ${invoiceToCancel.sale_number} is already cancelled.`,
        variant: "destructive",
      });
      setInvoiceToCancel(null);
      setCancelReason('');
      return;
    }
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
      queryClient.invalidateQueries({ queryKey: ['invoice-dashboard-unified'] });
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
      queryClient.invalidateQueries({ queryKey: ['invoice-dashboard-unified'] });
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

  // Server-side handles all filtering — paginatedInvoices is the current page
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  // Page totals — balance column matches reconciled `outstanding` per row
  const pageTotals = useMemo(() => {
    const activeInvoices = paginatedInvoices.filter((inv: any) => !isSaleInvoiceCancelled(inv));
    const balanceDue = (inv: any) =>
      isSaleInvoiceCancelled(inv)
        ? 0
        : Math.round(
            Number(
              inv.outstanding ??
                Math.max(
                  0,
                  (inv.net_amount || 0) -
                    (inv.paid_amount || 0) -
                    Math.max(inv.sale_return_adjust || 0, inv.credit_applied || 0),
                ),
            ),
          );
    return {
      qty: activeInvoices.reduce((sum: number, inv: any) => sum + (inv.total_qty || 0), 0),
      discount: activeInvoices.reduce((sum: number, inv: any) => sum + (inv.discount_amount || 0) + (inv.flat_discount_amount || 0), 0),
      amount: activeInvoices.reduce((sum: number, inv: any) => sum + (inv.net_amount || 0), 0),
      balance: activeInvoices.reduce((sum: number, inv: any) => sum + balanceDue(inv), 0),
    };
  }, [paginatedInvoices]);

  // Summary tiles prefer RPC stats (client fallback when RPC missing); ignore empty RPC while table has rows.
  const statsLookValid =
    reconciledStats &&
    !isStatsLoading &&
    (reconciledStats.totalInvoices > 0 || totalCount === 0);
  const baseStats = statsLookValid
    ? reconciledStats
    : {
        totalInvoices: isStatsLoading ? 0 : totalCount,
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
          .select('sale_number, sale_date, customer_name, customer_phone, total_qty, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, sale_return_adjust, credit_applied, payment_status, delivery_status, salesman')
          .eq('organization_id', currentOrganization!.id)
          .eq('sale_type', 'invoice')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (deliveryFilter !== 'all') query = query.eq('delivery_status', deliveryFilter);
        if (paymentStatusFilter.length > 0) {
          query = applyPaymentStatusFilterToSalesQuery(query, paymentStatusFilter);
        }
        if (userFilter !== 'all' && userFilter !== '__pending__') query = query.eq('created_by', userFilter);
        if (saleDateFilter.start) query = query.gte('sale_date', saleDateFilter.start);
        if (saleDateFilter.end) query = query.lte('sale_date', saleDateFilter.end);
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
        'Balance': Math.max(
          0,
          (inv.net_amount || 0) -
            (inv.paid_amount || 0) -
            Math.max(inv.sale_return_adjust || 0, inv.credit_applied || 0),
        ),
        'Credit Note Adj.': Math.max(inv.sale_return_adjust || 0, inv.credit_applied || 0),
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
  }, [currentOrganization?.id, deliveryFilter, paymentStatusFilter, saleDateFilter, debouncedSearch, toast]);

  // Memoized event handlers
  const selectableInvoices = useMemo(
    () => paginatedInvoices.filter((inv: any) => !isSaleInvoiceCancelled(inv)),
    [paginatedInvoices],
  );

  const toggleSelectAll = useCallback(() => {
    if (
      selectableInvoices.length > 0 &&
      selectedInvoices.size === selectableInvoices.length
    ) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(selectableInvoices.map((i: any) => i.id)));
    }
  }, [selectedInvoices.size, selectableInvoices]);

  const toggleSelectInvoice = useCallback((invoiceId: string) => {
    const inv = paginatedInvoices.find((i: any) => i.id === invoiceId);
    if (inv && isSaleInvoiceCancelled(inv)) return;
    setSelectedInvoices(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(invoiceId)) {
        newSelected.delete(invoiceId);
      } else {
        newSelected.add(invoiceId);
      }
      return newSelected;
    });
  }, [paginatedInvoices]);

  const selectedInvoiceIds = useMemo(
    () => Array.from(selectedInvoices).sort(),
    [selectedInvoices],
  );

  const { data: bulkSelectedRows = [] } = useQuery({
    queryKey: ["invoice-dashboard-bulk-selection", currentOrganization?.id, selectedInvoiceIds],
    enabled: selectedInvoiceIds.length > 0 && !!currentOrganization?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const orgId = currentOrganization!.id;
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, sale_number, sale_date, customer_id, customer_name, customer_phone, customer_address, total_qty, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, sale_return_adjust, credit_applied, payment_status, payment_method, delivery_status, salesman, due_date, is_cancelled, cash_amount, card_amount, upi_amount, notes, other_charges, round_off",
        )
        .eq("organization_id", orgId)
        .eq("sale_type", "invoice")
        .is("deleted_at", null)
        .in("id", selectedInvoiceIds);
      if (error) throw error;
      return data || [];
    },
  });

  const invoiceBalanceDue = useCallback((inv: any) => {
    if (isSaleInvoiceCancelled(inv)) return 0;
    return invoiceOutstandingAmount(inv);
  }, []);

  const bulkSelectionSummary = useMemo(
    () => ({
      count: selectedInvoiceIds.length,
      total: bulkSelectedRows.reduce((sum, inv) => sum + invoiceBalanceDue(inv), 0),
    }),
    [selectedInvoiceIds.length, bulkSelectedRows, invoiceBalanceDue],
  );

  const bulkMarkPaidSummary = useMemo(() => {
    const eligible = bulkSelectedRows.filter(
      (inv) =>
        !isSaleInvoiceCancelled(inv) &&
        inv.payment_status !== "completed" &&
        invoiceBalanceDue(inv) > 0.5,
    );
    return {
      count: eligible.length,
      total: eligible.reduce((sum, inv) => sum + invoiceBalanceDue(inv), 0),
    };
  }, [bulkSelectedRows, invoiceBalanceDue]);

  const describeBulkOutcome = useCallback(
    (succeeded: number, skipped: number, failed: number, verb: string) => {
      const parts = [`${succeeded} ${verb}`];
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (failed > 0) parts.push(`${failed} failed`);
      return parts.join(", ");
    },
    [],
  );

  const handleBulkClearSelection = useCallback(() => {
    setSelectedInvoices(new Set());
  }, []);

  const handleBulkSendReminder = useCallback(async () => {
    if (!bulkSelectedRows.length || !currentOrganization?.id) return;
    setBulkBusyAction("reminder");
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    const eligible = bulkSelectedRows.filter(
      (inv) => inv.customer_phone && invoiceBalanceDue(inv) > 0.5,
    );
    skipped = bulkSelectedRows.length - eligible.length;

    for (let i = 0; i < eligible.length; i++) {
      const invoice = eligible[i];
      setBulkProgressLabel(`Sending ${i + 1}/${eligible.length}…`);
      try {
        const invoiceUrl = buildSaleInvoiceViewUrl(invoice.id);
        let customerBalance = invoiceBalanceDue(invoice);
        if (invoice.customer_id) {
          try {
            const snap = await fetchCustomerBalanceSnapshot(
              supabase,
              currentOrganization.id,
              invoice.customer_id,
            );
            customerBalance = snap.balance;
          } catch {
            /* keep invoice balance */
          }
        }
        const reminderMessage = formatMessage(
          "payment_reminder",
          {
            sale_number: invoice.sale_number,
            customer_name: invoice.customer_name,
            customer_phone: invoice.customer_phone,
            sale_date: invoice.sale_date,
            net_amount: invoice.net_amount,
            payment_status: invoice.payment_status,
            paid_amount: invoice.paid_amount || 0,
            due_date: invoice.due_date,
          },
          undefined,
          customerBalance,
          {
            invoiceLink: invoiceUrl,
            organizationName: currentOrganization.name || "",
          },
        );
        await sendWhatsApp(invoice.customer_phone!, reminderMessage);
        succeeded++;
        if (i < eligible.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      } catch {
        failed++;
      }
    }

    setBulkBusyAction(null);
    setBulkProgressLabel(null);
    toast({
      title: "Reminders sent",
      description: describeBulkOutcome(succeeded, skipped, failed, "sent"),
    });
  }, [
    bulkSelectedRows,
    buildSaleInvoiceViewUrl,
    currentOrganization?.id,
    currentOrganization?.name,
    describeBulkOutcome,
    formatMessage,
    invoiceBalanceDue,
    sendWhatsApp,
    toast,
  ]);

  const mapInvoiceExportRow = useCallback((inv: any) => ({
    "Invoice No": inv.sale_number || "",
    Date: inv.sale_date ? format(new Date(inv.sale_date), "dd/MM/yyyy") : "",
    Customer: inv.customer_name || "",
    Phone: inv.customer_phone || "",
    Qty: inv.total_qty || 0,
    "Gross Amount": inv.gross_amount || 0,
    Discount: (inv.discount_amount || 0) + (inv.flat_discount_amount || 0),
    "Net Amount": inv.net_amount || 0,
    "Paid Amount": inv.paid_amount || 0,
    Balance: invoiceBalanceDue(inv),
    "Credit Note Adj.": Math.max(inv.sale_return_adjust || 0, inv.credit_applied || 0),
    "Payment Status": inv.payment_status || "",
    "Delivery Status": inv.delivery_status || "",
    Salesman: inv.salesman || "",
  }), [invoiceBalanceDue]);

  const handleBulkExport = useCallback(async () => {
    if (!bulkSelectedRows.length) return;
    setBulkBusyAction("export");
    try {
      const exportData = bulkSelectedRows.map(mapInvoiceExportRow);
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales Invoices");
      XLSX.writeFile(
        wb,
        `Sales_Invoices_Selected_${format(new Date(), "dd-MM-yyyy")}.xlsx`,
      );
      toast({
        title: "Exported",
        description: `${exportData.length} selected invoice(s) exported to Excel`,
      });
    } catch (err: any) {
      toast({
        title: "Export Failed",
        description: err.message || "Could not export selection",
        variant: "destructive",
      });
    } finally {
      setBulkBusyAction(null);
    }
  }, [bulkSelectedRows, mapInvoiceExportRow, toast]);

  const handleBulkMarkPaidConfirm = useCallback(async () => {
    if (!currentOrganization?.id || !bulkSelectedRows.length) return;
    setIsBulkMarkingPaid(true);
    setBulkBusyAction("markPaid");
    const orgId = currentOrganization.id;
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;

    const eligible = bulkSelectedRows.filter(
      (inv) =>
        !isSaleInvoiceCancelled(inv) &&
        inv.payment_status !== "completed" &&
        invoiceBalanceDue(inv) > 0.5,
    );
    skipped = bulkSelectedRows.length - eligible.length;

    for (let i = 0; i < eligible.length; i++) {
      const inv = eligible[i];
      setBulkProgressLabel(`Marking paid ${i + 1}/${eligible.length}…`);
      const result = await recordInvoiceFullCashPayment(supabase, {
        organizationId: orgId,
        invoice: inv,
        createdBy: user?.id ?? null,
        narrationSuffix: "(bulk)",
      });
      if (result.ok) {
        succeeded++;
        patchInvoiceDashboardPaymentFields(queryClient, orgId, inv.id, {
          paid_amount: result.paidAmount,
          payment_status: result.paymentStatus,
          outstanding: result.outstanding,
          sale_return_adjust: inv.sale_return_adjust || 0,
        });
      } else {
        const reason = (result as { reason?: string }).reason;
        if (reason === "no_balance" || reason === "already_paid") {
          skipped++;
        } else {
          failed++;
        }
      }
    }

    refreshInvoiceDashboard();
    setShowBulkMarkPaidDialog(false);
    setIsBulkMarkingPaid(false);
    setBulkBusyAction(null);
    setBulkProgressLabel(null);
    setSelectedInvoices(new Set());
    toast({
      title: "Mark paid complete",
      description: describeBulkOutcome(succeeded, skipped, failed, "settled"),
    });
  }, [
    bulkSelectedRows,
    currentOrganization?.id,
    describeBulkOutcome,
    invoiceBalanceDue,
    queryClient,
    refreshInvoiceDashboard,
    toast,
    user?.id,
  ]);

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
    if (isDashboardFilterRestoring()) return;
    setCurrentPage(1);
  }, [debouncedSearch, itemsPerPage, periodFilter, paymentStatusFilter, deliveryFilter, userFilter, startDate, endDate]);

  useEffect(() => {
    const merged = mergeActivityNavigationState(
      location.state as { refreshSalesList?: boolean; paymentStatusFilter?: string[] } | null,
      currentOrganization?.id,
      "sales-invoice-dashboard",
    );
    if (merged?.paymentStatusFilter && Array.isArray(merged.paymentStatusFilter) && merged.paymentStatusFilter.length > 0) {
      setPaymentStatusFilter(merged.paymentStatusFilter);
      setCurrentPage(1);
      window.history.replaceState({}, document.title);
      return;
    }
    if (!merged?.refreshSalesList) return;
    setCurrentPage(1);
    void queryClient.invalidateQueries({ queryKey: ["invoice-dashboard-unified"] });
    void queryClient.invalidateQueries({ queryKey: ["sales-invoice-dashboard"] });
    window.history.replaceState({}, document.title);
  }, [location.key, location.state, currentOrganization?.id, queryClient]);

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const getPageStyle = () => {
    if (invoiceTemplate === 'retail-tax-ezzy' || invoiceTemplate === 'wholesale-a5' || invoiceTemplate === 'retail-erp') {
      return `
      @page {
        size: A5 portrait;
        margin: 4mm;
      }
      @media print {
        html, body {
          width: 100%;
          margin: 0;
          padding: 0;
        }
        .retail-tax-ezzy-page,
        .retail-erp-invoice-template {
          width: 100% !important;
          max-width: none !important;
          overflow: visible !important;
        }
      }
    `;
    }

    const format = effectiveSaleBillFormat;
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
      case 'thermal': {
        const thermalPage = posThermalPageCss(saleThermalPaper);
        return `
      @page {
        size: ${thermalPage.pageSize};
        margin: 0;
      }
      ${getThermalReceiptPageStyleFragment(saleThermalPaper)}
      @media print {
        html, body {
          width: ${thermalPage.sourceWidth} !important;
          max-width: ${thermalPage.sourceWidth} !important;
          margin: 0 !important;
          padding: 0 !important;
          height: auto !important;
        }
        .invoice-print-source-screen,
        .invoice-print-source,
        .invoice-print-root {
          width: ${thermalPage.sourceWidth} !important;
          max-width: ${thermalPage.sourceWidth} !important;
          margin: 0 !important;
          transform: none !important;
          zoom: 1 !important;
        }
      }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
    `;
      }
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
      if (bulkPrintResolveRef.current) {
        bulkPrintProgressRef.current.ok++;
        bulkPrintResolveRef.current();
        bulkPrintResolveRef.current = null;
        void processBulkPrintNextRef.current?.();
        return;
      }
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

  const processBulkPrintNext = useCallback(async () => {
    const queue = bulkPrintQueueRef.current;
    const prog = bulkPrintProgressRef.current;
    if (queue.length === 0) {
      setBulkBusyAction(null);
      setBulkProgressLabel(null);
      toast({
        title: "Print complete",
        description: describeBulkOutcome(prog.ok, 0, prog.fail, "printed"),
      });
      bulkPrintProgressRef.current = { current: 0, total: 0, ok: 0, fail: 0 };
      return;
    }

    prog.current++;
    setBulkProgressLabel(`Printing ${prog.current}/${prog.total}…`);
    const invoice = queue.shift()!;
    try {
      const withItems = await ensureSaleItems(invoice);
      setInvoiceToPrint(withItems);
      await new Promise<void>((resolve) => {
        bulkPrintResolveRef.current = resolve;
        waitForPrintReady(printRef, () => {
          handlePrint();
        });
      });
    } catch {
      prog.fail++;
      await processBulkPrintNext();
    }
  }, [describeBulkOutcome, handlePrint, toast]);
  processBulkPrintNextRef.current = processBulkPrintNext;

  const handleBulkPrint = useCallback(async () => {
    if (!bulkSelectedRows.length) return;
    setBulkBusyAction("print");
    bulkPrintQueueRef.current = [...bulkSelectedRows];
    bulkPrintProgressRef.current = {
      current: 0,
      total: bulkSelectedRows.length,
      ok: 0,
      fail: 0,
    };
    await processBulkPrintNext();
  }, [bulkSelectedRows, processBulkPrintNext]);

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

  const getInvoicePreviewItems = useCallback(
    (invoice: any) =>
      (loadedItems[invoice.id] || invoice.sale_items || []).map((item: any, index: number) => ({
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
        itemNotes: item.item_notes || "",
      })),
    [loadedItems],
  );

  const renderInvoiceForPreview = useCallback(
    (format: string) => {
      if (!invoiceToPrint) return null;
      return (
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
          items={getInvoicePreviewItems(invoiceToPrint)}
          subTotal={invoiceToPrint.gross_amount}
          discount={(invoiceToPrint.discount_amount || 0) + (invoiceToPrint.flat_discount_amount || 0)}
          saleReturnAdjust={invoiceToPrint.sale_return_adjust || 0}
          grandTotal={invoiceToPrint.net_amount}
          cashPaid={invoiceToPrint.payment_method === "cash" ? invoiceToPrint.net_amount : 0}
          upiPaid={invoiceToPrint.payment_method === "upi" ? invoiceToPrint.net_amount : 0}
          paymentMethod={invoiceToPrint.payment_method}
          cashAmount={invoiceToPrint.cash_amount || 0}
          upiAmount={invoiceToPrint.upi_amount || 0}
          cardAmount={invoiceToPrint.card_amount || 0}
          paidAmount={invoiceToPrint.paid_amount || 0}
          salesman={invoiceToPrint.salesman || ""}
          notes={invoiceToPrint.notes || ""}
          otherCharges={invoiceToPrint.other_charges || 0}
          roundOff={invoiceToPrint.round_off || 0}
          financerDetails={invoiceToPrint.financerDetails || null}
        />
      );
    },
    [getInvoicePreviewItems, invoiceTemplate, invoiceToPrint, settings?.sale_settings],
  );

  const handleViewInvoicePreview = async (invoice: any) => {
    const invoiceWithItems = await ensureSaleItems(invoice);
    setInvoiceToPrint(invoiceWithItems);
    setShowPrintPreview(true);
  };

  const waitForInvoicePrintDom = useCallback((): Promise<HTMLElement | null> => {
    const MAX_WAIT = 10000;
    const startTime = Date.now();
    return new Promise((resolve) => {
      const poll = () => {
        const el = printRef.current;
        const text = (el?.textContent || "").trim();
        const hasLoadingAttr = el?.querySelector("[data-invoice-loading]") !== null;
        const isReady =
          !!el &&
          el.childElementCount > 0 &&
          !hasLoadingAttr &&
          text.length > 32 &&
          !/^loading\.?\.?\.?$/i.test(text);
        if (isReady) return resolve(el);
        if (Date.now() - startTime > MAX_WAIT) return resolve(null);
        setTimeout(poll, 250);
      };
      poll();
    });
  }, []);

  const captureInvoicePdfForWhatsApp = useCallback(
    async (invoice: any): Promise<string | null> => {
      const invoiceWithItems = await ensureSaleItems(invoice);
      setInvoiceToPrint(invoiceWithItems);
      await new Promise((resolve) => setTimeout(resolve, isMobile ? 600 : 200));
      const el = await waitForInvoicePrintDom();
      if (!el) return null;
      return (await captureElementToPdfBase64(el, { extraSettleMs: 300 })) || null;
    },
    [ensureSaleItems, isMobile, waitForInvoicePrintDom],
  );

  const handleDownloadPDF = async (invoice: any) => {
    const invoiceWithItems = await ensureSaleItems(invoice);
    setInvoiceToPrint(invoiceWithItems);
    toast({
      title: "Generating PDF",
      description: "Please wait while PDF is being generated...",
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, isMobile ? 600 : 200));

      const ready = await waitForInvoicePrintDom();
      if (!ready) {
        throw new Error('Invoice template failed to render');
      }

      const pageFormat =
        effectiveSaleBillFormat === 'thermal'
          ? 'thermal'
          : effectiveSaleBillFormat === 'a5' || effectiveSaleBillFormat === 'a5-horizontal'
            ? 'a5'
            : 'a4';

      const blob = await captureElementToPdfBlob(ready, {
        pageFormat,
        thermalPaper: saleThermalPaper,
        mobileOptimized: isNativeApp || shouldUseMobileDocumentDelivery(),
      });

      const fileName = `Invoice_${invoice.sale_number}_${format(new Date(invoice.sale_date), 'ddMMyyyy')}.pdf`;
      const result = await deliverPdfBlob(blob, fileName);

      toast({
        title: 'Success',
        description:
          result === 'shared'
            ? 'Invoice shared — choose Save to Files or a printer app'
            : result === 'opened'
              ? 'Invoice PDF opened — use Save or Print from the viewer'
              : 'PDF downloaded successfully',
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

    const invoiceUrl = buildSaleInvoiceViewUrl(invoice.id);
    
    let customerBalance = 0;
    if (invoice.customer_id && currentOrganization?.id) {
      try {
        const snap = await fetchCustomerBalanceSnapshot(
          supabase,
          currentOrganization.id,
          invoice.customer_id
        );
        customerBalance = snap.balance;
      } catch {
        customerBalance = 0;
      }
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

    if (!whatsAppAPISettings?.is_active || !currentOrganization?.id) {
      toast({
        title: "WhatsApp API Inactive",
        description: "Enable WhatsApp API integration before resending",
        variant: "destructive",
      });
      return;
    }

    try {
      const totalQty = invoice.total_qty || 0;
      const saleData = {
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
        bill_context: "sale",
        invoice_paper_format: saleSettings?.invoice_paper_format || "",
        sales_bill_format: saleSettings?.sales_bill_format || "",
        pos_bill_format: saleSettings?.pos_bill_format || "",
        invoice_template: saleSettings?.invoice_template || "",
      };

      await resendSaleInvoiceWhatsApp({
        phone: invoice.customer_phone,
        saleId: invoice.id,
        saleNumber: invoice.sale_number,
        customerName: invoice.customer_name,
        netAmount: Number(invoice.net_amount || 0),
        saleData,
        waSettings: whatsAppAPISettings,
        organizationId: currentOrganization.id,
        organizationName: currentOrganization.name || "",
        sendMessageAsync,
        capturePdfBase64: () => captureInvoicePdfForWhatsApp(invoice),
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
    } finally {
      setInvoiceToPrint(null);
    }
  };

  const handleCopyLink = async (invoice: any) => {
    copyInvoiceLink(buildSaleInvoiceViewUrl(invoice.id));
  };

  const openPaymentDialog = (invoice: any) => {
    setSelectedInvoiceForPayment(invoice);
    const pendingAmount = Math.round(
      invoice.net_amount -
        (invoice.paid_amount || 0) -
        Math.max(invoice.sale_return_adjust || 0, invoice.credit_applied || 0),
    );
    setPaidAmount(Math.max(0, pendingAmount).toString());
    setPaymentDate(new Date());
    setPaymentMode("cash");
    setReceivingBankAccountId(null);
    setPaymentNarration("");
    setAdvanceBalance(0);
    setAdvanceFromBookings(0);
    setIsFetchingAdvance(false);
    setAvailableCNBalance(0);
    setIsFetchingCN(false);
    setShowPaymentDialog(true);
  };

  const handlePaymentModeChange = async (mode: string) => {
    setPaymentMode(mode);
    if (!paymentMethodNeedsReceivingBank(mode)) {
      setReceivingBankAccountId(null);
    }
    if (mode === "advance" && selectedInvoiceForPayment?.customer_id) {
      setIsFetchingAdvance(true);
      try {
        const customerId = selectedInvoiceForPayment.customer_id;
        // Fetch advance booking balance
        const bookingBalance = await getAvailableAdvanceBalance(customerId);
        setAdvanceFromBookings(bookingBalance);

        // Only true unused advance bookings (customer_advances where amount > used_amount) are spendable.
        // Customer overpayments / refund liabilities must be returned via Refund or converted into a new
        // Advance booking — they cannot be re-spent here as advance.
        setAdvanceBalance(bookingBalance);
        const pendingAmount = Math.max(
          0,
          selectedInvoiceForPayment.net_amount -
            (selectedInvoiceForPayment.paid_amount || 0) -
            Math.max(
              selectedInvoiceForPayment.sale_return_adjust || 0,
              selectedInvoiceForPayment.credit_applied || 0,
            ),
        );
        setPaidAmount(Math.min(bookingBalance, pendingAmount).toString());
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
        const { total: totalAvailable } = await getAvailableCN(
          supabase,
          selectedInvoiceForPayment.customer_id,
          currentOrganization!.id,
          { includeUnlinkedAdjusted: true },
        );

        setAvailableCNBalance(totalAvailable);
        const pendingAmount = Math.max(
          0,
          selectedInvoiceForPayment.net_amount -
            (selectedInvoiceForPayment.paid_amount || 0) -
            Math.max(
              selectedInvoiceForPayment.sale_return_adjust || 0,
              selectedInvoiceForPayment.credit_applied || 0,
            ),
        );
        setPaidAmount(Math.min(totalAvailable, pendingAmount).toString());
      } catch (error) {
        console.error("Failed to fetch CN balance:", error);
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

    const overpayConfirmed = await confirmInvoiceOverpaymentIfNeeded(supabase, {
      organizationId: currentOrganization!.id,
      saleId: selectedInvoiceForPayment.id,
      saleNumber: selectedInvoiceForPayment.sale_number,
      proposedSettlement: amount,
    });
    if (!overpayConfirmed) {
      return;
    }

    // Hard guard: re-verify available advance balance from customer_advances at write time.
    if (paymentMode === "advance" && selectedInvoiceForPayment.customer_id) {
      try {
        const liveAdvanceBalance = await getAvailableAdvanceBalance(selectedInvoiceForPayment.customer_id);
        if (amount > liveAdvanceBalance + 0.01) {
          toast({
            title: "Insufficient Advance Balance",
            description: `Customer has only ₹${liveAdvanceBalance.toFixed(2)} unused advance. Cannot adjust ₹${amount.toFixed(2)}.`,
            variant: "destructive",
          });
          return;
        }
      } catch (advErr) {
        console.error("Advance balance check failed:", advErr);
        toast({
          title: "Error",
          description: "Could not verify advance balance. Please retry.",
          variant: "destructive",
        });
        return;
      }
    }

    const bankValidation = validateReceivingBankForSave(
      paymentMode,
      bankAccounts,
      receivingBankAccountId,
    );
    if (!bankValidation.ok) {
      toast({
        title: "Bank Account Required",
        description: "message" in bankValidation ? bankValidation.message : "Select a bank account.",
        variant: "destructive",
      });
      return;
    }
    const resolvedReceivingBankAccountId = bankValidation.bankAccountId;

    if (paymentMode === "credit_note") {
      if (!selectedInvoiceForPayment.customer_id) {
        toast({
          title: "Customer Required",
          description: "Credit note payment requires a customer on this invoice.",
          variant: "destructive",
        });
        return;
      }
      try {
        const { total: liveCn } = await getAvailableCN(
          supabase,
          selectedInvoiceForPayment.customer_id,
          currentOrganization!.id,
          { includeUnlinkedAdjusted: true },
        );
        if (amount > liveCn + 0.01) {
          toast({
            title: "Insufficient CN Balance",
            description: `Customer has only ₹${liveCn.toFixed(2)} unused credit note balance. Cannot apply ₹${amount.toFixed(2)}.`,
            variant: "destructive",
          });
          return;
        }
      } catch (cnErr) {
        console.error("CN balance check failed:", cnErr);
        toast({
          title: "Error",
          description: "Could not verify credit note balance. Please retry.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsRecordingPayment(true);
    try {
      const saleSnapshot = {
        paid_amount: Number(selectedInvoiceForPayment.paid_amount || 0),
        payment_status: selectedInvoiceForPayment.payment_status,
        payment_method: selectedInvoiceForPayment.payment_method,
        payment_date: (selectedInvoiceForPayment as { payment_date?: string | null }).payment_date ?? null,
        sale_return_adjust: Number(selectedInvoiceForPayment.sale_return_adjust || 0),
      };

      const { data: acctGlRow } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", currentOrganization!.id)
        .maybeSingle();
      const postLedgerSi = isAccountingEngineEnabled(
        acctGlRow as { accounting_engine_enabled?: boolean } | null
      );

      const isCreditNoteMode = paymentMode === "credit_note";
      const bookingDeductionForRollback =
        !isCreditNoteMode && paymentMode === "advance" && selectedInvoiceForPayment.customer_id
          ? amount
          : 0;

      let saleReturnRollbackRows: Array<{
        id: string;
        credit_status: string;
        linked_sale_id: string | null;
        credit_available_balance: number | null;
      }> = [];
      let cnFifoChunks: CnFifoVoucherChunk[] = [];

      let effectivePaidAmount = currentPaid;
      let effectiveCNAdjust = currentCNAdjust;

      if (isCreditNoteMode) {
        const { returns: cnReturns } = await getAvailableCN(
          supabase,
          selectedInvoiceForPayment.customer_id!,
          currentOrganization!.id,
          { includeUnlinkedAdjusted: true },
        );
        const cnPool = cnReturns
          .filter((r) => r.available > 0.005)
          .map((r) => ({ ...r }));

        const poolIds = cnPool.map((r) => r.id);
        if (poolIds.length > 0) {
          const { data: srPreRows } = await supabase
            .from("sale_returns")
            .select("id, credit_status, linked_sale_id, credit_available_balance")
            .in("id", poolIds);
          saleReturnRollbackRows = (srPreRows || []).map((sr) => {
            const cab = (sr as { credit_available_balance?: number | null }).credit_available_balance;
            return {
              id: sr.id as string,
              credit_status: String((sr as { credit_status?: string }).credit_status || "pending"),
              linked_sale_id: (sr as { linked_sale_id?: string | null }).linked_sale_id ?? null,
              credit_available_balance:
                cab != null && !Number.isNaN(Number(cab)) ? Number(cab) : null,
            };
          });
        }

        const fifo = await applyCreditNoteFifoToSale(supabase, {
          organizationId: currentOrganization!.id,
          saleId: selectedInvoiceForPayment.id,
          amount,
          cnPool,
          customerNameFallback: selectedInvoiceForPayment.customer_name,
          adjustedBy: user?.id ?? null,
          notes: paymentNarration.trim() || null,
        });
        cnFifoChunks = fifo.chunks;

        const { data: saleAfterCn, error: saleAfterCnErr } = await supabase
          .from("sales")
          .select("paid_amount, sale_return_adjust, payment_status")
          .eq("id", selectedInvoiceForPayment.id)
          .maybeSingle();
        if (saleAfterCnErr) throw saleAfterCnErr;
        effectivePaidAmount = Number(saleAfterCn?.paid_amount || currentPaid);
        effectiveCNAdjust = Number(saleAfterCn?.sale_return_adjust || currentCNAdjust);
      } else {
        const newPaidAmount = Math.round((currentPaid + amount) * 100) / 100;
        const newCNAdjust = currentCNAdjust;
        const legacyStatus =
          newPaidAmount + newCNAdjust >= selectedInvoiceForPayment.net_amount - 1
            ? "completed"
            : newPaidAmount > 0 || newCNAdjust > 0
              ? "partial"
              : "pending";
        const { paymentStatus: newStatus } = derivePaidAndStatus({
          netAmount: Number(selectedInvoiceForPayment.net_amount || 0),
          saleReturnAdjust: newCNAdjust,
          cashReceived: paymentMode === "advance" ? currentPaid : newPaidAmount,
          advanceApplied: paymentMode === "advance" ? amount : 0,
          cnApplied: 0,
          discountGiven: 0,
          paymentMethod: paymentMode,
        });
        warnSettlementPathMismatch("SalesInvoiceDashboard.recordPayment", legacyStatus, newStatus);

        const { error: updateError } = await supabase
          .from("sales")
          .update({
            paid_amount: newPaidAmount,
            payment_status: newStatus,
            payment_date: format(paymentDate, "yyyy-MM-dd"),
            payment_method: paymentMode,
          })
          .eq("id", selectedInvoiceForPayment.id);

        if (updateError) throw updateError;
        effectivePaidAmount = newPaidAmount;
      }

      const payYmd = format(paymentDate, "yyyy-MM-dd");
      const baseVoucherDescription =
        paymentMode === "advance"
          ? `Adjusted from advance balance for invoice ${selectedInvoiceForPayment.sale_number}${paymentNarration ? " - " + paymentNarration : ""}`
          : paymentMode === "credit_note"
            ? `Credit note adjusted against invoice ${selectedInvoiceForPayment.sale_number}${paymentNarration ? " - " + paymentNarration : ""}`
            : `Payment received for invoice ${selectedInvoiceForPayment.sale_number}${paymentNarration ? " - " + paymentNarration : ""}`;
      const receivingBankAccount = resolvedReceivingBankAccountId
        ? bankAccounts.find((a) => a.id === resolvedReceivingBankAccountId) ?? null
        : null;
      const voucherDescription = receivingBankAccount
        ? appendReceivingBankToDescription(baseVoucherDescription, receivingBankAccount)
        : baseVoucherDescription;

      let voucherRowId: string | undefined;
      let receiptVoucherNumber = "";
      if (paymentMode === "advance" && selectedInvoiceForPayment.customer_id) {
        const { vouchers } = await consumeAdvanceFIFO(supabase, {
          customerId: selectedInvoiceForPayment.customer_id,
          organizationId: currentOrganization!.id,
          saleId: selectedInvoiceForPayment.id,
          requestedAmount: amount,
          voucherDate: payYmd,
          createdBy: user?.id ?? null,
        });
        voucherRowId = vouchers[vouchers.length - 1];
        if (voucherRowId) {
          const { data: vrow } = await supabase
            .from("voucher_entries")
            .select("voucher_number")
            .eq("id", voucherRowId)
            .maybeSingle();
          receiptVoucherNumber = String(vrow?.voucher_number || "");
        }
      } else if (!isCreditNoteMode) {
        const created = await createReceiptVoucher(supabase, {
          organizationId: currentOrganization!.id,
          referenceId: selectedInvoiceForPayment.id,
          amount,
          paymentMethod: paymentMode,
          description: voucherDescription,
          receivingBankAccountId: resolvedReceivingBankAccountId,
          voucherDate: payYmd,
          createdBy: user?.id ?? null,
        });
        voucherRowId = created.id;
        receiptVoucherNumber = created.voucher_number;
      } else if (cnFifoChunks.length > 0) {
        voucherRowId = cnFifoChunks[cnFifoChunks.length - 1].voucherEntryId;
        receiptVoucherNumber = cnFifoChunks
          .map((c) => c.voucherNumber)
          .filter(Boolean)
          .join(", ");
      }

      if (postLedgerSi && (voucherRowId || cnFifoChunks.length > 0)) {
        try {
          if (isCreditNoteMode) {
            for (const chunk of cnFifoChunks) {
              await recordCustomerCreditNoteApplicationJournalEntry(
                chunk.voucherEntryId,
                currentOrganization!.id,
                chunk.amount,
                payYmd,
                voucherDescription,
                supabase,
              );
            }
          } else if (paymentMode === "advance") {
            await recordCustomerAdvanceApplicationJournalEntry(
              voucherRowId,
              currentOrganization!.id,
              amount,
              payYmd,
              voucherDescription,
              supabase
            );
          } else {
            await recordCustomerReceiptJournalEntry(
              voucherRowId,
              currentOrganization!.id,
              amount,
              0,
              paymentMode,
              payYmd,
              voucherDescription,
              supabase
            );
          }
        } catch (glErr) {
          const glRefType =
            isCreditNoteMode
              ? "CustomerCreditNoteApplication"
              : paymentMode === "advance"
                ? "CustomerAdvanceApplication"
                : "CustomerReceipt";
          const voucherIdsToRevert = isCreditNoteMode
            ? cnFifoChunks.map((c) => c.voucherEntryId)
            : voucherRowId
              ? [voucherRowId]
              : [];
          for (const vid of voucherIdsToRevert) {
            await deleteJournalEntryByReference(
              currentOrganization!.id,
              glRefType,
              vid,
              supabase,
            );
            await supabase.from("voucher_entries").delete().eq("id", vid);
          }
          if (bookingDeductionForRollback > 0 && selectedInvoiceForPayment.customer_id) {
            await reverseCustomerAdvanceFifo(
              supabase,
              currentOrganization!.id,
              selectedInvoiceForPayment.customer_id,
              bookingDeductionForRollback,
            );
          }
          await supabase
            .from("sales")
            .update({
              paid_amount: saleSnapshot.paid_amount,
              payment_status: saleSnapshot.payment_status,
              payment_method: saleSnapshot.payment_method,
              payment_date: saleSnapshot.payment_date,
              sale_return_adjust: saleSnapshot.sale_return_adjust,
            })
            .eq("id", selectedInvoiceForPayment.id);
          for (const sr of saleReturnRollbackRows) {
            await supabase
              .from("sale_returns")
              .update({
                credit_status: sr.credit_status,
                linked_sale_id: sr.linked_sale_id,
                credit_available_balance: sr.credit_available_balance,
              })
              .eq("id", sr.id);
          }
          throw glErr;
        }
      }

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
        .select('total_amount, payment_method')
        .eq('organization_id', currentOrganization?.id)
        .eq('voucher_type', 'receipt')
        // Phase 1.2: include mis-tagged customer rows for this exact sale id.
        .in('reference_type', ['sale', 'customer'])
        .eq('reference_id', selectedInvoiceForPayment.id)
        .is('deleted_at', null);
      if (saleReceiptsError) throw saleReceiptsError;

      // Only true cash-like receipts should be compared against paid_amount.
      // credit_note_adjustment and advance_adjustment vouchers represent CN/advance
      // settlement (already reflected via sale_return_adjust or applied advance),
      // and including them here double-counts the same settlement and flips
      // partial invoices to completed.
      const receiptTotal = (saleReceipts || [])
        .filter((row: any) => {
          const pm = String(row.payment_method || '').toLowerCase();
          return pm !== 'credit_note_adjustment' && pm !== 'advance_adjustment';
        })
        .reduce((sum: number, row: any) => sum + Number(row.total_amount || 0), 0);
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

      const orgId = currentOrganization!.id;
      const saleId = selectedInvoiceForPayment.id;
      const paymentOutstanding = Math.max(0, Math.round(payableCap - reconciledPaid));
      patchInvoiceDashboardPaymentFields(queryClient, orgId, saleId, {
        paid_amount: reconciledPaid,
        payment_status: reconciledStatus,
        outstanding: paymentOutstanding,
        sale_return_adjust: latestSRAdjust,
      });

      toast({
        title: "Payment Recorded",
        description: `Payment of ₹${amount.toFixed(2)} recorded successfully`,
      });

      // Prepare receipt data
      const newReceiptData = {
        voucherNumber: receiptVoucherNumber,
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
      invalidateSalesQueriesNow(queryClient, orgId);
      await refetchInvoiceDashboardQueries(queryClient, orgId);
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description:
          paymentMode === "credit_note"
            ? formatCnApplyError(error)
            : String((error as { message?: string })?.message || error || "Failed to record payment"),
        variant: "destructive",
      });
    } finally {
      setIsRecordingPayment(false);
      if (paymentMode === "credit_note" && selectedInvoiceForPayment?.customer_id) {
        queryClient.invalidateQueries({ queryKey: ["sale-returns"] });
        queryClient.invalidateQueries({ queryKey: ["sale-returns-summary"] });
        queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      }
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

    const payMode = String(receiptData.paymentMethod ?? receiptData.paymentMode ?? "").toUpperCase();
    const disc = whatsappPaymentReceiptDiscountLines(
      receiptData.discountAmount,
      receiptData.discountReason,
      (n) => n.toFixed(2)
    );
    const message = `*PAYMENT RECEIPT*\n\nReceipt No: ${receiptData.voucherNumber}\nDate: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), 'dd/MM/yyyy') : '-'}\n\nCustomer: ${receiptData.customerName}\nInvoice: ${receiptData.invoiceNumber}\n\nInvoice Amount: ₹${receiptData.invoiceAmount.toFixed(2)}\nPaid Amount: ₹${receiptData.paidAmount.toFixed(2)}${disc}\nBalance: ₹${receiptData.currentBalance.toFixed(2)}\n\nPayment Mode: ${payMode}\n${receiptData.narration ? `\nNotes: ${receiptData.narration}` : ''}\n\nThank you for your payment!`;

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
    if (!selectedInvoiceForStatus || !newDeliveryStatus || !currentOrganization?.id) return;

    const saleId = selectedInvoiceForStatus.id;
    const orgId = currentOrganization.id;
    const previousStatus = selectedInvoiceForStatus.delivery_status || "undelivered";

    setIsUpdatingStatus(true);
    if (orgId) {
      patchInvoiceDashboardDeliveryStatus(queryClient, orgId, saleId, newDeliveryStatus);
    }

    try {
      const { error: updateError } = await supabase
        .from("sales")
        .update({ delivery_status: newDeliveryStatus })
        .eq("id", saleId)
        .eq("organization_id", orgId);

      if (updateError) throw updateError;

      const { error: trackingError } = await supabase
        .from("delivery_tracking")
        .insert({
          sale_id: saleId,
          organization_id: orgId,
          status: newDeliveryStatus,
          status_date: format(statusDate, "yyyy-MM-dd"),
          narration: statusNarration || null,
          created_by: user?.id,
        });

      if (trackingError) throw trackingError;

      setDeliveryHistory((prev) => ({
        ...prev,
        [saleId]: [
          {
            status: newDeliveryStatus,
            status_date: format(statusDate, "yyyy-MM-dd"),
            narration: statusNarration || null,
            created_at: new Date().toISOString(),
          },
          ...(prev[saleId] || []),
        ],
      }));

      if (orgId) {
        await refetchInvoiceDashboardQueries(queryClient, orgId);
      }

      toast({
        title: "Status Updated",
        description: `Delivery status updated to ${getDeliveryLabel(newDeliveryStatus)}`,
      });

      setShowStatusDialog(false);
    } catch (error: any) {
      if (orgId) {
        patchInvoiceDashboardDeliveryStatus(queryClient, orgId, saleId, previousStatus);
      }
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
        refreshInvoiceDashboard();
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
        refreshInvoiceDashboard();
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

        <MobilePeriodChips
          value={periodFilter}
          onChange={(v) => { setPeriodFilter(v); setCurrentPage(1); }}
          periods={[
            { value: "daily", label: "Today" },
            { value: "weekly", label: "Week" },
            { value: "monthly", label: "Month" },
            { value: "yearly", label: "Year" },
            { value: "all", label: "All" },
          ]}
        />

        <MobileStatStrip stats={[
          { label: "Total", value: fmt(effectiveStats.totalAmount), color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Pending", value: fmt(effectiveStats.pendingAmount), color: "text-amber-600", bg: "bg-amber-50", onClick: () => setPaymentStatusFilter(["pending"]) },
          { label: "Invoices", value: String(effectiveStats.totalInvoices), color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Qty", value: String(effectiveStats.totalQty), color: "text-emerald-600", bg: "bg-emerald-50" },
        ]} />
        {filteredCustomer && (
          <p className="px-4 pt-1 text-[10px] text-muted-foreground leading-snug">
            Pending is the sum of invoice dues. Unused advance (Adjust Advance) reduces this total only after you apply it per invoice.
          </p>
        )}

        <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
          {[{v:"all",l:"All"},{v:"pending",l:"Pending"},{v:"partial",l:"Partial"},{v:"completed",l:"Paid"},{v:"cancelled",l:"Cancelled"}].map((s) => (
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
          {isDashboardInitialLoad ? (
            <SkeletonMobileListRows count={6} />
          ) : invoicesError ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <AlertTriangle className="h-12 w-12 text-destructive/70" />
              <p className="text-sm font-medium text-foreground">Could not load invoices</p>
              <Button variant="outline" size="sm" onClick={() => refreshInvoiceDashboard()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : paginatedInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No invoices found</p>
            </div>
          ) : paginatedInvoices.map((inv: any) => {
            const pending = Number(
              inv.outstanding ??
                Math.max(
                  0,
                  (inv.net_amount || 0) -
                    (inv.paid_amount || 0) -
                    Math.max(inv.sale_return_adjust || 0, inv.credit_applied || 0),
                )
            );
            const effectiveStatus = getInvoiceDashboardDisplayStatus(inv);
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
                        <span
                          className={cn(
                            "font-mono text-xs font-bold text-primary cursor-pointer hover:underline",
                            inv.is_cancelled && "line-through decoration-red-500/70"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedInvoiceForHistory({ id: inv.id });
                            setShowInvoiceHistory(true);
                          }}
                        >
                          {inv.sale_number}
                        </span>
                        {invoiceLikelyMissingLines(inv) && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0">
                            <title>Qty 0 but amount on file — open to fix lines</title>
                          </AlertTriangle>
                        )}
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
                            openCustomerAccount(inv.customer_id, inv.customer_name);
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
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleViewInvoicePreview(inv);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary active:bg-primary/5 transition-colors touch-manipulation"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>View</span>
                  </button>
                  {columnSettings.whatsappActions && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const invoiceUrl = buildSaleInvoiceViewUrl(inv.id);
                        const message = `Invoice ${inv.sale_number}%0AAmount: ₹${(inv.net_amount || 0).toLocaleString("en-IN")}%0ACustomer: ${inv.customer_name || 'Walk-in'}%0A%0AView: ${invoiceUrl}`;
                        window.open(`https://wa.me/?text=${message}`, '_blank');
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-emerald-600 active:bg-emerald-50 transition-colors touch-manipulation"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>WhatsApp</span>
                    </button>
                  )}
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
                  ₹{Math.max(0, Math.round((selectedInvoiceForPayment?.net_amount || 0) - (selectedInvoiceForPayment?.paid_amount || 0) - Math.max(selectedInvoiceForPayment?.sale_return_adjust || 0, selectedInvoiceForPayment?.credit_applied || 0))).toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <Label>Payment Amount *</Label>
                <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="Enter amount" step="0.01" />
              </div>
              <div>
                <Label>Payment Mode</Label>
                <Select value={paymentMode} onValueChange={handlePaymentModeChange}>
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
              {currentOrganization?.id && (
                <ReceivingBankAccountPicker
                  organizationId={currentOrganization.id}
                  paymentMethod={paymentMode}
                  value={receivingBankAccountId}
                  onChange={setReceivingBankAccountId}
                />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
              <Button onClick={handleRecordPayment} disabled={isRecordingPayment}>
                {isRecordingPayment ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invoice preview (same as PDF layout) */}
        {invoiceToPrint && (
          <PrintPreviewDialog
            open={showPrintPreview}
            onOpenChange={setShowPrintPreview}
            defaultFormat={effectiveSaleBillFormat || "a4"}
            thermalPaper={saleThermalPaper}
            renderInvoice={renderInvoiceForPreview}
          />
        )}

        <InvoiceHistoryDialog
          open={showInvoiceHistory}
          onOpenChange={setShowInvoiceHistory}
          saleId={selectedInvoiceForHistory?.id}
          organizationId={currentOrganization?.id}
        />

        {/* Hidden invoice for mobile PDF / direct print */}
        {invoiceToPrint && (
          <div
            className={`invoice-print-source-screen invoice-print-source${effectiveSaleBillFormat === "thermal" ? " thermal-print-page" : ""}${effectiveSaleBillFormat === "thermal" && saleThermalPaper === "58mm" ? " thermal-paper-58" : ""}`}
            data-print-format={effectiveSaleBillFormat === "thermal" ? "thermal" : undefined}
            style={salePrintSourceStyle}
          >
            <InvoiceWrapper
              ref={printRef}
              format={saleInvoiceWrapperFormat}
              billNo={invoiceToPrint.sale_number}
              date={new Date(invoiceToPrint.sale_date)}
              customerName={invoiceToPrint.customer_name}
              customerAddress={invoiceToPrint.customer_address || ""}
              customerMobile={invoiceToPrint.customer_phone || ""}
              customerGSTIN={invoiceToPrint.customers?.gst_number || ""}
              template={invoiceTemplate}
              showMRP={(settings?.sale_settings as any)?.show_mrp_column ?? false}
              showHSN={(settings?.sale_settings as any)?.show_hsn_column ?? true}
              items={(loadedItems[invoiceToPrint.id] || invoiceToPrint.sale_items || []).map((item: any, index: number) => ({
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
                itemNotes: item.item_notes || "",
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
              otherCharges={invoiceToPrint.other_charges || 0}
              roundOff={invoiceToPrint.round_off || 0}
              financerDetails={invoiceToPrint.financerDetails || null}
            />
          </div>
        )}

        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "sales-dashboard-workspace sales-invoice-dashboard flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3",
        !inTabCache && !sharedShell && "h-[calc(100vh-3.5rem)]",
      )}
    >
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold leading-none tracking-tight text-teal-700">
              <Receipt className="h-4 w-4 shrink-0 opacity-70" />
              Sales Invoice Dashboard
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-base text-slate-500">
              {isDashboardBackgroundRefresh ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating…
                </>
              ) : (
                `${totalCount.toLocaleString("en-IN")} invoices`
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-slate-200 text-sm"
              onClick={() => void refetch()}
              disabled={isDashboardBackgroundRefresh}
            >
              {isDashboardBackgroundRefresh ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExportExcel} className="gap-1.5 h-9 text-sm border-slate-300 text-slate-600 hover:bg-slate-100 font-medium px-3">
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button onClick={() => navigate("/sales-invoice")} className="h-9 px-4 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm gap-1.5">
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
            {selectedInvoices.size > 0 && hasSpecialPermission('cancel_invoice') && (
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
          <Card className="border border-amber-400/60 bg-amber-50 rounded-lg shadow-sm shrink-0">
            <CardHeader className="py-1.5 px-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-amber-100 rounded-md flex items-center justify-center flex-shrink-0">
                    <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-800 leading-tight">
                      Unsaved Sales Invoice Found
                    </h3>
                    <CardDescription className="text-xs text-amber-700 font-medium mt-0 leading-tight">
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
                    className="gap-1.5 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    <X className="h-3.5 w-3.5" />
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      navigate("/sales-invoice", { state: { loadDraft: true } });
                    }}
                    className="gap-1.5 h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-sm"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Resume Draft
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Summary Statistics — compact ERP dashboard cards */}
        {isDashboardInitialLoad ? (
          <SkeletonKpiCards count={7} columnsClassName="grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 lg:gap-3" />
        ) : (
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 lg:gap-3">
          <button type="button" onClick={() => setDeliveryFilter("all")} className="min-h-[72px] rounded-xl border border-sky-200/70 bg-sky-50 px-2.5 py-2.5 text-center shadow-sm transition-colors hover:bg-sky-100/80">
            <p className="text-sm font-semibold leading-snug text-slate-600 truncate">Total Invoices</p>
            <p className="mt-1.5 text-2xl font-bold text-sky-800 tabular-nums leading-none">{effectiveStats.totalInvoices}</p>
          </button>
          <button type="button" onClick={() => setDeliveryFilter("all")} className="min-h-[72px] rounded-xl border border-indigo-200/70 bg-indigo-50 px-2.5 py-2.5 text-center shadow-sm transition-colors hover:bg-indigo-100/80">
            <p className="text-sm font-semibold leading-snug text-slate-600 truncate">Total Qty</p>
            <p className="mt-1.5 text-2xl font-bold text-indigo-800 tabular-nums leading-none">{effectiveStats.totalQty}</p>
          </button>
          <button type="button" onClick={() => setDeliveryFilter("all")} className="min-h-[72px] rounded-xl border border-emerald-200/70 bg-emerald-50 px-2.5 py-2.5 text-center shadow-sm transition-colors hover:bg-emerald-100/80">
            <p className="text-sm font-semibold leading-snug text-slate-600 truncate">Total Revenue</p>
            <p className="mt-1.5 text-2xl font-bold text-emerald-800 tabular-nums leading-none truncate">₹{effectiveStats.totalAmount.toFixed(0)}</p>
          </button>
          <button type="button" onClick={() => setDeliveryFilter("all")} className="min-h-[72px] rounded-xl border border-fuchsia-200/70 bg-fuchsia-50 px-2.5 py-2.5 text-center shadow-sm transition-colors hover:bg-fuchsia-100/80">
            <p className="text-sm font-semibold leading-snug text-slate-600 truncate">Total Discount</p>
            <p className="mt-1.5 text-2xl font-bold text-fuchsia-800 tabular-nums leading-none truncate">₹{effectiveStats.totalDiscount.toFixed(0)}</p>
          </button>
          <button
            type="button"
            onClick={() => setDeliveryFilter("all")}
            title={filteredCustomer ? "Matches invoice Balance after CN & advance. Unused advance is not included until applied per invoice." : undefined}
            className="min-h-[72px] rounded-xl border border-amber-200/70 bg-amber-50 px-2.5 py-2.5 text-center shadow-sm transition-colors hover:bg-amber-100/80"
          >
            <p className="text-sm font-semibold leading-snug text-slate-600 truncate">Pending Amount</p>
            <p className="mt-1.5 text-2xl font-bold text-amber-800 tabular-nums leading-none truncate">₹{effectiveStats.pendingAmount.toFixed(0)}</p>
          </button>
          <button type="button" onClick={() => setDeliveryFilter("delivered")} className="min-h-[72px] rounded-xl border border-teal-200/70 bg-teal-50 px-2.5 py-2.5 text-center shadow-sm transition-colors hover:bg-teal-100/80">
            <p className="text-sm font-semibold leading-snug text-slate-600 truncate">Delivered</p>
            <p className="mt-1.5 text-2xl font-bold text-teal-800 tabular-nums leading-none">{effectiveStats.deliveredCount}</p>
          </button>
          <button type="button" onClick={() => setDeliveryFilter("undelivered")} className="min-h-[72px] rounded-xl border border-rose-200/70 bg-rose-50 px-2.5 py-2.5 text-center shadow-sm transition-colors hover:bg-rose-100/80">
            <p className="text-sm font-semibold leading-snug text-slate-600 truncate">Undelivered</p>
            <p className="mt-1.5 text-2xl font-bold text-rose-800 tabular-nums leading-none">{effectiveStats.undeliveredCount}</p>
          </button>
        </div>
        )}

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm p-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5 overflow-x-auto">
              <div className="relative flex-1 min-w-[160px] max-w-full sm:max-w-sm md:max-w-md">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice, customer, barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-[130px] h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Last 7 Days</SelectItem>
                  <SelectItem value="daily">Today</SelectItem>
                  <SelectItem value="monthly">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="yearly">This Year</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {periodFilter === 'custom' && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[130px] h-9 justify-start text-left font-normal text-sm border-slate-200 bg-slate-50 hover:bg-white">
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
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
                      <Button variant="outline" className="w-[130px] h-9 justify-start text-left font-normal text-sm border-slate-200 bg-slate-50 hover:bg-white">
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
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
                  <Button variant="outline" className="w-[150px] h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white justify-between">
                    {paymentStatusFilter.length === 0 ? 'All Payments' : paymentStatusFilter.length === 1 ? paymentStatusFilter[0].charAt(0).toUpperCase() + paymentStatusFilter[0].slice(1) : `${paymentStatusFilter.length} Selected`}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[180px] p-2" align="start">
                  <div className="space-y-1">
                    {[{v:"pending",l:"Pending"},{v:"partial",l:"Partial"},{v:"completed",l:"Completed"},{v:"cancelled",l:"Cancelled"}].map((s) => (
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
                      <Button variant="ghost" size="sm" className="w-full text-sm mt-1" onClick={() => { setPaymentStatusFilter([]); setCurrentPage(1); }}>
                        Clear All
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
                <SelectTrigger className="w-[130px] h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white">
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
                <SelectTrigger className="w-[115px] h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white">
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
                <SelectTrigger className="w-[130px] h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white">
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0 border-slate-200 bg-slate-50 hover:bg-white"
                    title="Column Settings"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 bg-popover z-50 max-h-[min(70vh,28rem)] overflow-y-auto" align="end">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Show/Hide Columns</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="inv-col-phone" className="text-sm">Phone</Label>
                        <Checkbox
                          id="inv-col-phone"
                          checked={columnSettings.phone}
                          onCheckedChange={(checked) => updateColumnSetting("phone", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="inv-col-status" className="text-sm">Status / Balance</Label>
                        <Checkbox
                          id="inv-col-status"
                          checked={columnSettings.status}
                          onCheckedChange={(checked) => updateColumnSetting("status", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="inv-col-delivery" className="text-sm">Delivery</Label>
                        <Checkbox
                          id="inv-col-delivery"
                          checked={columnSettings.delivery}
                          onCheckedChange={(checked) => updateColumnSetting("delivery", !!checked)}
                        />
                      </div>
                    </div>
                    <div className="border-t pt-2 space-y-2">
                      <h4 className="font-medium text-sm">Show/Hide Actions</h4>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="inv-col-whatsapp" className="text-sm">WhatsApp Share / Resend</Label>
                        <Checkbox
                          id="inv-col-whatsapp"
                          checked={columnSettings.whatsappActions}
                          onCheckedChange={(checked) => updateColumnSetting("whatsappActions", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="inv-col-copy-link" className="text-sm">Copy Link</Label>
                        <Checkbox
                          id="inv-col-copy-link"
                          checked={columnSettings.copyLink}
                          onCheckedChange={(checked) => updateColumnSetting("copyLink", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="inv-col-print" className="text-sm">Print</Label>
                        <Checkbox
                          id="inv-col-print"
                          checked={columnSettings.print}
                          onCheckedChange={(checked) => updateColumnSetting("print", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="inv-col-download" className="text-sm">Download</Label>
                        <Checkbox
                          id="inv-col-download"
                          checked={columnSettings.download}
                          onCheckedChange={(checked) => updateColumnSetting("download", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="inv-col-modify" className="text-sm">Edit</Label>
                        <Checkbox
                          id="inv-col-modify"
                          checked={columnSettings.modify}
                          onCheckedChange={(checked) => updateColumnSetting("modify", !!checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="inv-col-delete" className="text-sm">Delete</Label>
                        <Checkbox
                          id="inv-col-delete"
                          checked={columnSettings.delete}
                          onCheckedChange={(checked) => updateColumnSetting("delete", !!checked)}
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {filteredCustomer && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-sm border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium gap-1.5 flex-shrink-0"
                    onClick={() => {
                      setSettleCustomerId(filteredCustomer.id);
                      setSettleCustomerName(filteredCustomer.name || "");
                      setShowSettleDialog(true);
                    }}
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    Settle Account
                  </Button>
                  {bulkAdvanceBalance > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-medium gap-1.5 flex-shrink-0"
                      onClick={() => {
                        setBulkAdvanceCustomer(filteredCustomer);
                        setShowBulkAdvanceDialog(true);
                      }}
                    >
                      <IndianRupee className="h-3.5 w-3.5" />
                      Adjust Advance ₹{bulkAdvanceBalance.toLocaleString("en-IN")}
                    </Button>
                  )}
                </>
              )}
              <div id="erp-toolbar-portal" className="flex items-center gap-1.5 ml-auto flex-shrink-0" />
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
                <div
                  ref={tableContainerRef}
                  data-tab-scroll
                  onWheel={onWheelScrollContainer}
                  className="sales-dashboard-table-panel relative flex-1 min-h-0 overflow-y-auto overflow-x-auto tab-scroll-stable overscroll-y-contain"
                >
                <Table className="w-full table-fixed border-collapse sales-invoice-grid [&_thead_th]:!px-2 [&_tbody_td]:!px-2 [&_thead_th]:!py-2.5 [&_tbody_td]:!py-2 [&_thead_th]:text-sm [&_thead_th]:font-semibold [&_thead_th]:uppercase [&_thead_th]:tracking-wide [&_tbody_td]:text-base [&_tbody_td]:align-middle [&_tbody_td]:leading-snug [&_tbody_tr:nth-child(even)]:bg-slate-50/80 [&_tbody_tr:hover]:bg-sky-50/70">
                  <colgroup>
                    {invoiceTableColWidths.map((width, index) => (
                      <col key={`inv-col-${index}`} style={{ width }} />
                    ))}
                  </colgroup>
                  <TableHeader className="sticky top-0 z-10 bg-slate-950 text-white [&_tr]:border-slate-800">
                    <TableRow className="border-slate-800 hover:bg-slate-950">
                      <TableHead className="px-1">
                        <Checkbox
                          checked={
                            selectableInvoices.length > 0 &&
                            selectedInvoices.size === selectableInvoices.length
                          }
                          onCheckedChange={toggleSelectAll}
                          disabled={selectableInvoices.length === 0}
                        />
                      </TableHead>
                      <TableHead className="px-1 text-white"></TableHead>
                      <TableHead className="text-white">Invoice No</TableHead>
                      <TableHead className="text-white">Customer</TableHead>
                      {columnSettings.phone && <TableHead className="text-white">Phone</TableHead>}
                      <TableHead className="text-white">Date</TableHead>
                      <TableHead className="text-center px-0.5 text-white">Qty</TableHead>
                      <TableHead className="text-right px-1 text-white">DIS</TableHead>
                      <TableHead className="text-right text-white">Amount</TableHead>
                      {columnSettings.status && <TableHead className="px-1 text-white">Status</TableHead>}
                      {columnSettings.status && <TableHead className="text-right px-1 text-white">Balance</TableHead>}
                      {columnSettings.delivery && <TableHead className="px-1 text-white">Delivery</TableHead>}
                      <TableHead className="text-right px-1 text-white">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isDashboardInitialLoad ? (
                      <SkeletonTableRows
                        count={8}
                        columns={SALES_INVOICE_TABLE_SKELETON_COLUMNS}
                      />
                    ) : invoicesError ? (
                      <TableRow>
                        <TableCell colSpan={invoiceTableColumnCount} className="text-center py-10">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <AlertTriangle className="h-8 w-8 text-destructive/70" />
                            <p className="text-base font-medium text-foreground">
                              Could not load invoices
                            </p>
                            <Button variant="outline" size="sm" onClick={() => refreshInvoiceDashboard()}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Retry
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : paginatedInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={invoiceTableColumnCount} className="text-center py-8 text-muted-foreground text-base">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedInvoices.map((invoice: any) => (
                        <>
                          <TableRow 
                            key={invoice.id} 
                            className="min-h-11 cursor-pointer border-b border-slate-100"
                            onContextMenu={(e) => handleRowContextMenu(e, invoice)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedInvoices.has(invoice.id)}
                                onCheckedChange={() => toggleSelectInvoice(invoice.id)}
                                disabled={isSaleInvoiceCancelled(invoice)}
                              />
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                              {expandedRows.has(invoice.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </TableCell>
                            <TableCell
                              className="font-medium align-top"
                              onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}
                            >
                              <div className="flex flex-col gap-0.5 min-w-0 max-w-full">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span
                                    className="break-words font-mono text-base font-bold text-blue-700 cursor-pointer hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedInvoiceForHistory({ id: invoice.id });
                                      setShowInvoiceHistory(true);
                                    }}
                                  >
                                    {invoice.sale_number}
                                  </span>
                                  {invoiceLikelyMissingLines(invoice) && (
                                    <span title="Bill amount on file but quantity is 0 — line items may be missing or deleted. Open invoice to fix.">
                                      <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
                                    </span>
                                  )}
                                  {invoice.payment_status === 'completed' && (
                                    <span title="Invoice is locked (Fully Paid)">
                                      <Lock className="h-3 w-3 shrink-0 text-green-600" />
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-slate-500 tabular-nums leading-none">
                                  {invoice.sale_date ? format(new Date(invoice.sale_date), 'hh:mm a') : ''}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell
                              className="cursor-pointer text-blue-700 hover:underline align-top max-w-0 text-base font-semibold leading-snug"
                              title={invoice.customer_name?.toUpperCase()}
                              onClick={(e) => {
                                e.stopPropagation();
                                openCustomerAccount(invoice.customer_id, invoice.customer_name);
                              }}
                            >
                              <span className="line-clamp-2 break-words">{invoice.customer_name?.toUpperCase()}</span>
                            </TableCell>
                            {columnSettings.phone && (
                              <TableCell className="text-base font-medium tabular-nums" onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                                {invoice.customer_phone || '-'}
                              </TableCell>
                            )}
                            <TableCell className="text-base font-medium tabular-nums" onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                              {invoice.sale_date ? format(new Date(invoice.sale_date), 'dd/MM/yyyy') : '-'}
                            </TableCell>
                            <TableCell className="text-center px-0.5 tabular-nums text-base font-medium" onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                              {invoice.total_qty || 0}
                            </TableCell>
                            <TableCell className="text-right px-1" onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="tabular-nums">
                                  ₹{Math.round((invoice.discount_amount || 0) + (invoice.flat_discount_amount || 0)).toLocaleString("en-IN")}
                                </span>
                                {(invoice.sale_return_adjust || 0) > 0 && (
                                  <span className="text-sm text-amber-600 whitespace-nowrap tabular-nums leading-none">
                                    +S/R: ₹{Math.round(invoice.sale_return_adjust).toLocaleString("en-IN")}
                                    {invoice.cn_adjust_date
                                      ? ` · adj. ${format(new Date(invoice.cn_adjust_date + "T12:00:00"), "dd/MM/yyyy")}`
                                      : ""}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell onClick={() => toggleExpanded(invoice.id, invoice.sale_number)} className={cn("text-base font-bold text-blue-700 tabular-nums text-right", isSaleInvoiceCancelled(invoice) && "line-through text-muted-foreground")}>₹{Math.round(invoice.net_amount).toLocaleString('en-IN')}</TableCell>
                            {columnSettings.status && (
                              <TableCell className="text-center" onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                                {isSaleInvoiceCancelled(invoice) ? (
                                  <Badge className="min-w-0 max-w-full justify-center whitespace-normal text-center bg-red-500 hover:bg-red-600 text-white text-xs px-1.5 py-0.5 leading-tight">
                                    Cancelled
                                  </Badge>
                                ) : (
                                  (() => {
                                    const displayStatus = getInvoiceDashboardDisplayStatus(invoice);
                                    return (
                                  <Badge
                                    className={`min-w-0 max-w-full justify-center whitespace-normal text-center text-xs px-1.5 py-0.5 leading-tight ${
                                      displayStatus === 'completed'
                                        ? 'bg-green-500 hover:bg-green-600 text-white'
                                        : displayStatus === 'partial'
                                          ? 'bg-orange-400 hover:bg-orange-500 text-white'
                                          : 'bg-red-500 hover:bg-red-600 text-white'
                                    }`}
                                  >
                                    {displayStatus === 'completed'
                                      ? 'Paid'
                                      : displayStatus === 'partial'
                                        ? 'Partial'
                                        : 'Not Paid'}
                                  </Badge>
                                    );
                                  })()
                                )}
                              </TableCell>
                            )}
                            {columnSettings.status && (
                              <TableCell className="text-right text-base font-medium tabular-nums" onClick={() => toggleExpanded(invoice.id, invoice.sale_number)}>
                                 ₹{isSaleInvoiceCancelled(invoice) ? 0 : Math.round(Number(invoice.outstanding ?? Math.max(0, (invoice.net_amount || 0) - (invoice.paid_amount || 0) - Math.max(invoice.sale_return_adjust || 0, invoice.credit_applied || 0)))).toLocaleString('en-IN')}
                              </TableCell>
                            )}
                            {columnSettings.delivery && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Badge 
                                  className={`cursor-pointer text-xs px-1.5 py-0.5 leading-tight ${getDeliveryBadgeClass(invoice.delivery_status || 'undelivered')}`}
                                  onClick={() => openStatusDialog(invoice)}
                                >
                                  {getDeliveryLabel(invoice.delivery_status || 'undelivered')}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell className="text-right align-middle whitespace-nowrap py-1 max-w-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                              {/* Desktop: compact single-line action icons */}
                              <div className="hidden lg:flex justify-end items-center gap-0.5 flex-nowrap [&_button]:h-7 [&_button]:w-7 [&_button]:shrink-0 min-w-0">
                                {isEInvoiceEnabled && invoice.customers?.gst_number && (
                                  <>
                                    <Button variant="ghost" size="icon" onClick={() => handleGenerateEInvoice(invoice)} title={invoice.irn ? `IRN: ${invoice.irn.substring(0, 20)}...` : "Generate E-Invoice"} disabled={isGeneratingEInvoice === invoice.id} className={invoice.irn ? "text-green-600" : "text-orange-600"}>
                                      {isGeneratingEInvoice === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : invoice.irn ? <CheckCircle2 className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                                    </Button>
                                    {invoice.irn && (
                                      <Button variant="ghost" size="icon" onClick={() => handleDownloadEInvoicePDF(invoice)} title="Download E-Invoice PDF" disabled={isDownloadingEInvoice === invoice.id} className="text-teal-600">
                                        {isDownloadingEInvoice === invoice.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                                      </Button>
                                    )}
                                  </>
                                )}
                                {invoice.payment_status !== 'completed' && (
                                  <Button variant="ghost" size="icon" onClick={() => openPaymentDialog(invoice)} title="Record Payment">
                                    <IndianRupee className="h-4 w-4 text-purple-600" />
                                  </Button>
                                )}
                                {columnSettings.copyLink && (
                                  <Button variant="ghost" size="icon" onClick={() => handleCopyLink(invoice)} title="Copy Invoice Link">
                                    <Link2 className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}
                                {columnSettings.whatsappActions && (
                                  <Button variant="ghost" size="icon" onClick={() => handleWhatsAppShare(invoice)} title="Share on WhatsApp" disabled={!invoice.customer_phone}>
                                    <MessageCircle className="h-4 w-4 text-green-600" />
                                  </Button>
                                )}
                                {columnSettings.whatsappActions && whatsAppAPISettings?.is_active && (
                                  <Button variant="ghost" size="icon" onClick={() => handleResendWhatsAppAPI(invoice)} title="Resend via WhatsApp API" disabled={!invoice.customer_phone || isSendingWhatsAppAPI}>
                                    <Send className="h-3.5 w-3.5 text-teal-600" />
                                  </Button>
                                )}
                                {columnSettings.print && (
                                  <Button variant="ghost" size="icon" onClick={() => handlePrintInvoice(invoice)} title="Print Invoice">
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                )}
                                {columnSettings.download && (
                                  <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(invoice)} title="Download PDF">
                                    <Download className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}
                                {columnSettings.modify && (() => {
                                  const own = canModifyEntry((invoice as any).created_by, invoiceCreatorLabel((invoice as any).created_by));
                                  if (invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices')) {
                                    return (
                                      <Button variant="ghost" size="icon" disabled title="Invoice is locked (Fully Paid)">
                                        <Lock className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                    );
                                  }
                                  return (
                                    <Button variant="ghost" size="icon" disabled={!own.allowed} title={own.allowed ? "Edit" : own.reason} onClick={() => own.allowed && navigate('/sales-invoice', { state: { editInvoiceId: invoice.id } })}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  );
                                })()}
                                {columnSettings.delete && (() => {
                                  const own = canModifyEntry((invoice as any).created_by, invoiceCreatorLabel((invoice as any).created_by));
                                  if (invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices')) {
                                    return (
                                      <Button variant="ghost" size="icon" disabled title="Invoice is locked (Fully Paid)">
                                        <Lock className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                    );
                                  }
                                  return (
                                    <Button variant="ghost" size="icon" disabled={!own.allowed} title={own.allowed ? "Delete" : own.reason} onClick={() => own.allowed && setInvoiceToDelete(invoice)}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  );
                                })()}
                              </div>

                              {/* Mobile: primary actions + more menu */}
                              <div className="flex lg:hidden justify-end items-center gap-1">
                                {columnSettings.print && (
                                  <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation" onClick={(e) => { e.stopPropagation(); handlePrintInvoice(invoice); }} title="Print">
                                    <Printer className="h-5 w-5" />
                                  </Button>
                                )}
                                {columnSettings.download && (
                                  <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation" onClick={(e) => { e.stopPropagation(); handleDownloadPDF(invoice); }} title="Download">
                                    <Download className="h-5 w-5 text-blue-600" />
                                  </Button>
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation">
                                      <MoreHorizontal className="h-5 w-5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-popover z-[60] min-w-[200px]">
                                    {invoice.payment_status !== 'completed' && (
                                      <DropdownMenuItem onClick={() => openPaymentDialog(invoice)}>
                                        <IndianRupee className="h-4 w-4 mr-2 text-purple-600" /> Record Payment
                                      </DropdownMenuItem>
                                    )}
                                    {columnSettings.whatsappActions && (
                                      <DropdownMenuItem onClick={() => handleWhatsAppShare(invoice)} disabled={!invoice.customer_phone}>
                                        <MessageCircle className="h-4 w-4 mr-2 text-green-600" /> Share on WhatsApp
                                      </DropdownMenuItem>
                                    )}
                                    {columnSettings.whatsappActions && whatsAppAPISettings?.is_active && (
                                      <DropdownMenuItem onClick={() => handleResendWhatsAppAPI(invoice)} disabled={!invoice.customer_phone || isSendingWhatsAppAPI}>
                                        <Send className="h-4 w-4 mr-2 text-teal-600" /> Resend WhatsApp API
                                      </DropdownMenuItem>
                                    )}
                                    {columnSettings.copyLink && (
                                      <DropdownMenuItem onClick={() => handleCopyLink(invoice)}>
                                        <Link2 className="h-4 w-4 mr-2 text-blue-600" /> Copy Invoice Link
                                      </DropdownMenuItem>
                                    )}
                                    {isEInvoiceEnabled && invoice.customers?.gst_number && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => handleGenerateEInvoice(invoice)} disabled={isGeneratingEInvoice === invoice.id}>
                                          <Zap className="h-4 w-4 mr-2" /> {invoice.irn ? "E-Invoice Generated" : "Generate E-Invoice"}
                                        </DropdownMenuItem>
                                        {invoice.irn && (
                                          <DropdownMenuItem onClick={() => handleDownloadEInvoicePDF(invoice)} disabled={isDownloadingEInvoice === invoice.id}>
                                            <FileDown className="h-4 w-4 mr-2 text-teal-600" /> Download E-Invoice
                                          </DropdownMenuItem>
                                        )}
                                      </>
                                    )}
                                    <DropdownMenuSeparator />
                                    {columnSettings.modify && (() => {
                                      const own = canModifyEntry((invoice as any).created_by, invoiceCreatorLabel((invoice as any).created_by));
                                      if (invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices')) {
                                        return (
                                          <DropdownMenuItem disabled>
                                            <Lock className="h-4 w-4 mr-2 text-muted-foreground" /> Edit (Locked)
                                          </DropdownMenuItem>
                                        );
                                      }
                                      return (
                                        <DropdownMenuItem disabled={!own.allowed} onClick={() => navigate('/sales-invoice', { state: { editInvoiceId: invoice.id } })}>
                                          <Edit className="h-4 w-4 mr-2" /> {own.allowed ? "Edit Invoice" : "Edit (Other user's bill)"}
                                        </DropdownMenuItem>
                                      );
                                    })()}
                                    {columnSettings.delete && (() => {
                                      const own = canModifyEntry((invoice as any).created_by, invoiceCreatorLabel((invoice as any).created_by));
                                      if (invoice.payment_status === 'completed' && !hasSpecialPermission('edit_paid_invoices')) {
                                        return (
                                          <DropdownMenuItem disabled>
                                            <Lock className="h-4 w-4 mr-2 text-muted-foreground" /> Delete (Locked)
                                          </DropdownMenuItem>
                                        );
                                      }
                                      return (
                                        <DropdownMenuItem disabled={!own.allowed} onClick={() => setInvoiceToDelete(invoice)} className="text-destructive">
                                          <Trash2 className="h-4 w-4 mr-2" /> {own.allowed ? "Delete Invoice" : "Delete (Other user's bill)"}
                                        </DropdownMenuItem>
                                      );
                                    })()}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedRows.has(invoice.id) && (
                            <TableRow>
                              <TableCell colSpan={invoiceTableColumnCount} className="bg-muted/50 p-4 text-base">
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="font-semibold mb-2 text-base">Items:</h4>
                                    {(() => {
                                      const lineRows = loadedItems[invoice.id] ?? invoice.sale_items ?? [];
                                      const showMissingHint =
                                        lineRows.length === 0 && Number(invoice.net_amount || 0) > 0;
                                      return (
                                    <>
                                    {showMissingHint && (
                                      invoice.is_cancelled ? (
                                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-3 py-2 text-base text-red-900 dark:text-red-100 flex gap-2 items-start">
                                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                          <span>
                                            Invoice cancelled{invoice.cancelled_at ? ` on ${format(new Date(invoice.cancelled_at), 'dd/MM/yyyy')}` : ''}. Items and stock have been reversed{invoice.cancelled_reason ? ` — reason: ${invoice.cancelled_reason}` : ''}.
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-base text-amber-900 dark:text-amber-100 flex gap-2 items-start">
                                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                          <span>
                                            No line items loaded for this invoice (inactive or never saved). Open <strong>Sales Invoice</strong> and edit this bill to re-enter products, or restore lines in the database.
                                          </span>
                                        </div>
                                      )
                                    )}
                                    <Table className="[&_thead_th]:!px-2 [&_tbody_td]:!px-2 [&_thead_th]:!py-2 [&_tbody_td]:!py-2 [&_thead_th]:text-sm [&_tbody_td]:text-base">
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="font-semibold">Product</TableHead>
                                          {showItemBrand && <TableHead className="font-semibold">Brand</TableHead>}
                                          {showItemColor && <TableHead className="font-semibold">Color</TableHead>}
                                          {showItemStyle && <TableHead className="font-semibold">Style</TableHead>}
                                          <TableHead className="font-semibold">Size</TableHead>
                                          {showItemBarcode && <TableHead className="font-semibold">Barcode</TableHead>}
                                          {showItemHsn && <TableHead className="font-semibold">HSN</TableHead>}
                                          <TableHead className="font-semibold">Qty</TableHead>
                                          {showItemMrp && <TableHead className="font-semibold">MRP</TableHead>}
                                          <TableHead className="font-semibold">Price</TableHead>
                                          <TableHead className="text-right font-semibold">DIS</TableHead>
                                          <TableHead className="text-right font-semibold">Total</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {lineRows.map((item: any) => {
                                          const itemGrossTotal = item.unit_price * item.quantity;
                                          const itemDiscount = item.discount_percent > 0 ? (itemGrossTotal * item.discount_percent / 100) : 0;
                                          const itemAfterDiscount = itemGrossTotal - itemDiscount;
                                          return (
                                            <TableRow key={item.id}>
                                              <TableCell>{item.product_name}</TableCell>
                                              {showItemBrand && <TableCell>{productsById?.[item.product_id]?.brand || '-'}</TableCell>}
                                              {showItemColor && <TableCell>{item.color || productsById?.[item.product_id]?.color || '-'}</TableCell>}
                                              {showItemStyle && <TableCell>{productsById?.[item.product_id]?.style || '-'}</TableCell>}
                                              <TableCell>{item.size}</TableCell>
                                              {showItemBarcode && <TableCell className="text-base font-mono">{item.barcode || '-'}</TableCell>}
                                              {showItemHsn && <TableCell className="text-base">{item.hsn_code || '-'}</TableCell>}
                                              <TableCell>{item.quantity}</TableCell>
                                              {showItemMrp && <TableCell>₹{item.mrp ? Math.round(item.mrp).toLocaleString('en-IN') : '-'}</TableCell>}
                                              <TableCell>₹{Math.round(itemGrossTotal).toLocaleString('en-IN')}</TableCell>
                                              <TableCell className="text-right text-destructive">
                                                {itemDiscount > 0 ? `₹${Math.round(itemDiscount).toLocaleString('en-IN')}` : '-'}
                                              </TableCell>
                                              <TableCell className="text-right font-medium">₹{Math.round(itemAfterDiscount).toLocaleString('en-IN')}</TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                    </>
                                      );
                                    })()}

                                  </div>

                                  {deliveryHistory[invoice.id] && deliveryHistory[invoice.id].length > 0 && (
                                    <div className="border-t pt-3">
                                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-base">
                                        <Package className="h-4 w-4" />
                                        Delivery History:
                                      </h4>
                                      <div className="space-y-1">
                                        {deliveryHistory[invoice.id].map((history: any, idx: number) => (
                                          <div key={idx} className="text-base flex gap-3 p-2 bg-background rounded">
                                            <span className="font-medium text-muted-foreground min-w-[90px]">
                                              {history.status_date ? format(new Date(history.status_date), 'dd/MM/yyyy') : '-'}
                                            </span>
                                            <Badge className={`${getDeliveryBadgeClass(history.status)} text-sm px-2.5 py-0.5`}>
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
                                      <h4 className="font-semibold mb-2 text-orange-600 text-base">Linked Sale Returns:</h4>
                                      <Table className="[&_thead_th]:!px-2 [&_tbody_td]:!px-2 [&_thead_th]:!py-2 [&_tbody_td]:!py-2 [&_thead_th]:text-sm [&_tbody_td]:text-base">
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="font-semibold">Return No</TableHead>
                                            <TableHead className="font-semibold">Return Date</TableHead>
                                            <TableHead className="font-semibold">Customer</TableHead>
                                            <TableHead className="text-right font-semibold">Amount</TableHead>
                                            <TableHead className="font-semibold">Notes</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {saleReturns[invoice.id].map((saleReturn: any) => (
                                            <TableRow key={saleReturn.id}>
                                              <TableCell>
                                                <Badge variant="outline" className="text-orange-600 text-base px-2.5 py-0.5">
                                                  {saleReturn.return_number || '-'}
                                                </Badge>
                                              </TableCell>
                                              <TableCell>
                                                {saleReturn.return_date ? format(new Date(saleReturn.return_date), 'dd/MM/yyyy') : '-'}
                                              </TableCell>
                                              <TableCell>{saleReturn.customer_name?.toUpperCase()}</TableCell>
                                              <TableCell className="text-right text-orange-600">
                                                -₹{Math.round(saleReturn.net_amount).toLocaleString('en-IN')}
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
                    {/* Page Totals Row */}
                    {paginatedInvoices.length > 0 && (
                      <TableRow className="bg-muted/70 font-semibold border-t-2 text-base">
                        <TableCell colSpan={invoiceTableColSpanBeforeQty} className="text-right">Page Total:</TableCell>
                        <TableCell className="text-center">{pageTotals.qty}</TableCell>
                        <TableCell className="text-right">₹{Math.round(pageTotals.discount).toLocaleString('en-IN')}</TableCell>
                        <TableCell>₹{Math.round(pageTotals.amount).toLocaleString('en-IN')}</TableCell>
                        {columnSettings.status && <TableCell></TableCell>}
                        {columnSettings.status && <TableCell className="text-right">₹{Math.round(pageTotals.balance).toLocaleString('en-IN')}</TableCell>}
                        {columnSettings.delivery && <TableCell></TableCell>}
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <InvoiceDashboardBulkBar
                  selectedCount={bulkSelectionSummary.count}
                  selectedTotal={bulkSelectionSummary.total}
                  busyAction={bulkBusyAction}
                  progressLabel={bulkProgressLabel}
                  onSendReminder={() => void handleBulkSendReminder()}
                  onPrint={() => void handleBulkPrint()}
                  onExport={() => void handleBulkExport()}
                  onMarkPaid={() => setShowBulkMarkPaidDialog(true)}
                  onClear={handleBulkClearSelection}
                />
                </div>
            {totalCount > 0 && (
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-base text-slate-500 tabular-nums">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} invoices
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Show:</span>
                    <Select value={itemsPerPage.toString()} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="w-20 h-9 text-sm border-slate-200">
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="h-9 text-sm px-3 border-slate-200"
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-sm text-slate-600 font-medium tabular-nums">
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="h-9 text-sm px-3 border-slate-200"
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
              disabled={isCancelling || isSaleInvoiceCancelled(invoiceToCancel)}
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

      <AlertDialog
        open={showBulkMarkPaidDialog}
        onOpenChange={(open) => {
          if (!isBulkMarkingPaid) setShowBulkMarkPaidDialog(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {bulkMarkPaidSummary.count} invoice(s) as paid?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This will record a <strong>cash receipt</strong> for each invoice&apos;s
                  outstanding balance (total{" "}
                  <strong>
                    ₹{Math.round(bulkMarkPaidSummary.total).toLocaleString("en-IN")}
                  </strong>
                  ) and update payment status via the normal settlement path.
                </p>
                <p className="text-muted-foreground text-sm">
                  Already paid or zero-balance invoices in your selection will be skipped.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkMarkingPaid}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleBulkMarkPaidConfirm();
              }}
              disabled={isBulkMarkingPaid || bulkMarkPaidSummary.count === 0}
            >
              {isBulkMarkingPaid ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Settling…
                </>
              ) : (
                "Mark as Paid"
              )}
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
                  ₹{Math.max(0, Math.round((selectedInvoiceForPayment?.net_amount || 0) - (selectedInvoiceForPayment?.paid_amount || 0) - Math.max(selectedInvoiceForPayment?.sale_return_adjust || 0, selectedInvoiceForPayment?.credit_applied || 0))).toLocaleString('en-IN')}
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
                      <Badge variant="destructive" className="gap-1 max-w-full whitespace-normal h-auto py-1.5 text-left font-normal">
                        No usable sale-return CN balance for this customer. Use Sale Returns → Adjust Credit Note, or Accounts → Customer Payment, then try again.
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {currentOrganization?.id && (
                <ReceivingBankAccountPicker
                  organizationId={currentOrganization.id}
                  paymentMethod={paymentMode}
                  value={receivingBankAccountId}
                  onChange={setReceivingBankAccountId}
                />
              )}
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
            defaultFormat={effectiveSaleBillFormat || 'a4'}
            thermalPaper={saleThermalPaper}
            renderInvoice={renderInvoiceForPreview}
          />
        )}

        {/* Hidden invoice for direct print — must not use no-print or opacity:0 */}
        {invoiceToPrint && (
          <div
            className={`invoice-print-source-screen invoice-print-source${effectiveSaleBillFormat === "thermal" ? " thermal-print-page" : ""}${effectiveSaleBillFormat === "thermal" && saleThermalPaper === "58mm" ? " thermal-paper-58" : ""}`}
            data-print-format={effectiveSaleBillFormat === "thermal" ? "thermal" : undefined}
            style={salePrintSourceStyle}
          >
            <InvoiceWrapper
              ref={printRef}
              format={saleInvoiceWrapperFormat}
              billNo={invoiceToPrint.sale_number}
              date={new Date(invoiceToPrint.sale_date)}
              customerName={invoiceToPrint.customer_name}
              customerAddress={invoiceToPrint.customer_address || ""}
              customerMobile={invoiceToPrint.customer_phone || ""}
              customerGSTIN={invoiceToPrint.customers?.gst_number || ""}
              template={invoiceTemplate}
              showMRP={(settings?.sale_settings as any)?.show_mrp_column ?? false}
              showHSN={(settings?.sale_settings as any)?.show_hsn_column ?? true}
              items={(loadedItems[invoiceToPrint.id] || invoiceToPrint.sale_items || []).map((item: any, index: number) => ({
                sr: index + 1,
                particulars: item.product_name,
                itemNotes: item.item_notes || "",
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
              otherCharges={invoiceToPrint.other_charges || 0}
              roundOff={invoiceToPrint.round_off || 0}
              financerDetails={invoiceToPrint.financerDetails || null}
            />
          </div>
        )}

        {/* Customer History Dialog */}

        <InvoiceHistoryDialog
          open={showInvoiceHistory}
          onOpenChange={setShowInvoiceHistory}
          saleId={selectedInvoiceForHistory?.id}
          organizationId={currentOrganization?.id}
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
              invalidateSalesQueriesNow(queryClient, currentOrganization?.id);
              // Re-fetch advance balance
              if (filteredCustomer?.id) {
                getAvailableAdvanceBalance(filteredCustomer.id).then(setBulkAdvanceBalance).catch(() => setBulkAdvanceBalance(0));
              }
            }}
          />
        )}

        <SettleCustomerAccountDialog
          open={showSettleDialog}
          onOpenChange={setShowSettleDialog}
          customerId={settleCustomerId}
          customerName={settleCustomerName}
          organizationId={currentOrganization?.id || ""}
          onSuccess={() => {
            setShowSettleDialog(false);
            invalidateSalesQueriesNow(queryClient, currentOrganization?.id);
            void queryClient.invalidateQueries({ queryKey: ["sales-invoice-dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
          }}
        />
      </div>
  );
}
