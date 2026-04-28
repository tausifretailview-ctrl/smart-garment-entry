import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { deleteLedgerEntries } from "@/lib/customerLedger";
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
import { Loader2, Receipt, Search, ChevronDown, ChevronRight, Printer, Plus, Edit, Trash2, MessageCircle, Eye, Link2, Settings2, IndianRupee, Send, CheckCircle2, Clock, RefreshCcw, ShoppingCart, Pause, FileText, Lock, FileSpreadsheet, FileCheck, XCircle, Download, FileDown, Ban } from "lucide-react";
import * as XLSX from "xlsx";
import { format } from "date-fns";

import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useReactToPrint } from "react-to-print";
import { InvoiceWrapper } from "@/components/InvoiceWrapper";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { EInvoicePrint } from "@/components/EInvoicePrint";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useWhatsAppAPI } from "@/hooks/useWhatsAppAPI";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { waitForPrintReady } from "@/utils/printReady";
import { useUserPermissions } from "@/hooks/useUserPermissions";

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
  credit_amount?: number;
  refund_amount?: number;
  credit_note_id?: string | null;
  credit_note_amount?: number;
  sale_return_adjust?: number | null;
  salesman?: string | null;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
  sale_type?: string;
  status?: string | null;
  is_cancelled?: boolean | null;
  // E-Invoice fields
  irn?: string | null;
  ack_no?: string | null;
  ack_date?: string | null;
  einvoice_status?: string | null;
  einvoice_error?: string | null;
  einvoice_qr_code?: string | null;
  customers?: { gst_number?: string | null } | null;
}

// Default columns - defined OUTSIDE component to prevent re-render loops
const DEFAULT_POS_COLUMNS = {
  phone: false,  // Hidden by default
  status: true,
  refund: true,
  refundStatus: true,
  creditNoteAmt: true,
  creditNoteStatus: true,
  whatsapp: true,
  copyLink: true,
  preview: true,
  print: true,
  modify: true,
};

const POSDashboard = () => {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization, organizationRole } = useOrganization();
  const { user } = useAuth();
  const { formatMessage } = useWhatsAppTemplates();
  const { sendWhatsApp, copyInvoiceLink } = useWhatsAppSend();
  const { settings: whatsAppAPISettings, sendMessageAsync, isSending: isSendingWhatsAppAPI } = useWhatsAppAPI();
  const { hasSpecialPermission } = useUserPermissions();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // Default to today's date
  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [periodFilter, setPeriodFilter] = useState<string>("daily");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string[]>([]);
  const [saleTypeFilter, setSaleTypeFilter] = useState<string>("all");
  const [refundFilter, setRefundFilter] = useState<string>("all");
  const [creditNoteFilter, setCreditNoteFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("__pending__");
  // Cancellation visibility filter — default hides cancelled invoices so reports stay accurate
  const [cancelFilter, setCancelFilter] = useState<string>("active"); // active | cancelled | all

  const isHoldLikeSale = (sale: Sale) => {
    if (sale.payment_status === "hold") return true;
    return (
      sale.payment_status === "pending" &&
      typeof sale.sale_number === "string" &&
      sale.sale_number.startsWith("Hold/") &&
      sale.payment_method === "pay_later"
    );
  };

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

  // Default userFilter: admins see all users; non-admins default to themselves
  useEffect(() => {
    if (userFilter === "__pending__" && orgUsers.length > 0 && user?.id) {
      if (orgUsers.length === 1 || organizationRole === "admin") {
        setUserFilter("all");
      } else {
        const isOrgMember = orgUsers.some((u: any) => u.id === user.id);
        setUserFilter(isOrgMember ? user.id : "all");
      }
    } else if (userFilter === "__pending__" && orgUsers.length > 0) {
      setUserFilter("all");
    }
  }, [orgUsers, user?.id, organizationRole]);

  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [saleItems, setSaleItems] = useState<Record<string, SaleItem[]>>({});
  const [saleReturns, setSaleReturns] = useState<Record<string, any[]>>({});
  const [creditNoteUsage, setCreditNoteUsage] = useState<Record<string, { credit_amount: number; used_amount: number; status: string }>>({});
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [itemCountToDelete, setItemCountToDelete] = useState<number | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkCancelDialog, setShowBulkCancelDialog] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState("");
  const [isBulkCancelling, setIsBulkCancelling] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [printData, setPrintData] = useState<any>(null);
  const invoicePrintRef = useRef<HTMLDivElement>(null);

  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [previewFinancerDetails, setPreviewFinancerDetails] = useState<any>(null);
  const [previewCustomerData, setPreviewCustomerData] = useState<{ gst_number?: string; transport_details?: string; address?: string } | null>(null);
  const [posBillFormat, setPosBillFormat] = useState<string | null>(null);
  const [posInvoiceTemplate, setPosInvoiceTemplate] = useState<string>('professional');

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
    DEFAULT_POS_COLUMNS
  );

  // Payment recording state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedSaleForPayment, setSelectedSaleForPayment] = useState<any>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paymentNarration, setPaymentNarration] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [advanceBalance, setAdvanceBalance] = useState(0);
  
  // Receipt state
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  
  // Customer history dialog state
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);
  
  // E-Invoice state
  const [isGeneratingEInvoice, setIsGeneratingEInvoice] = useState<string | null>(null);
  const [isCancellingIRN, setIsCancellingIRN] = useState<string | null>(null);
  const [isDownloadingEInvoice, setIsDownloadingEInvoice] = useState<string | null>(null);
  const [eInvoiceToPrint, setEInvoiceToPrint] = useState<any>(null);
  const eInvoicePrintRef = useRef<HTMLDivElement>(null);

  // Virtual scrolling ref
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Fetch company settings (centralized, cached 5min)
  const { data: settings } = useSettings();

  // Get item display settings from settings
  const saleSettings = settings?.sale_settings as any;
  const showItemBrand = saleSettings?.show_item_brand ?? false;
  const showItemColor = saleSettings?.show_item_color ?? false;
  const showItemStyle = saleSettings?.show_item_style ?? false;
  const showItemBarcode = saleSettings?.show_item_barcode ?? true;
  const showItemHsn = saleSettings?.show_item_hsn ?? false;
  const showItemMrp = saleSettings?.show_item_mrp ?? saleSettings?.show_mrp_column ?? false;
  const isEInvoiceEnabled = saleSettings?.einvoice_settings?.enabled ?? false;

  useEffect(() => {
    const loadData = async () => {
      await fetchSales();
    };
    loadData();
  }, [currentOrganization, startDate, endDate]);

  // Sync POS bill format / invoice template from cached settings
  useEffect(() => {
    const sale = (settings as any)?.sale_settings;
    if (!sale) return;
    if (sale.pos_bill_format) setPosBillFormat(sale.pos_bill_format);
    if (sale.invoice_template) setPosInvoiceTemplate(sale.invoice_template);
  }, [settings]);

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
      // Use range-based pagination to bypass 1000-row limit
      const allSales: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("sales")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .in("sale_type", ["pos", "delivery_challan"])
          .is("deleted_at", null);

        // Server-side date filter for performance — avoids loading entire history.
        // sale_date is timestamptz, so use full-day bounds to include sales saved
        // later in the day (otherwise lte("2026-04-25") excludes 2026-04-25 05:35:56).
        if (startDate) query = query.gte("sale_date", `${startDate}T00:00:00`);
        if (endDate) query = query.lte("sale_date", `${endDate}T23:59:59.999`);

        const { data, error } = await query
          .order("sale_date", { ascending: false })
          .order("id")
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allSales.push(...data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Fetch credit_notes by sale_id (reverse lookup) to populate CN columns
      // This handles cases where credit_note_id isn't directly stored on the sale
      const saleIdsForCN = allSales.map((s: any) => s.id);
      if (saleIdsForCN.length > 0) {
        const cnBatchSize = 500;
        const cnBySaleId: Record<string, any> = {};
        for (let i = 0; i < saleIdsForCN.length; i += cnBatchSize) {
          const batch = saleIdsForCN.slice(i, i + cnBatchSize);
          if (batch.length === 0) continue;
          const { data: cnData } = await supabase
            .from('credit_notes')
            .select('id, sale_id, credit_amount, used_amount, status')
            .in('sale_id', batch)
            .is('deleted_at', null);
          if (cnData) {
            cnData.forEach((c: any) => {
              if (c.sale_id) cnBySaleId[c.sale_id] = c;
            });
          }
        }
        // Patch sales with CN data and build usage map
        const usageMap: Record<string, { credit_amount: number; used_amount: number; status: string }> = {};
        allSales.forEach((s: any) => {
          const cn = cnBySaleId[s.id];
          if (cn) {
            s.credit_note_id = s.credit_note_id || cn.id;
            s.credit_note_amount = s.credit_note_amount || cn.credit_amount || 0;
            usageMap[cn.id] = {
              credit_amount: cn.credit_amount || 0,
              used_amount: cn.used_amount || 0,
              status: cn.status,
            };
          }
        });
        // Also include directly linked credit_note_ids
        const directCnIds = allSales.map((s: any) => s.credit_note_id).filter((id: any) => id && !usageMap[id]);
        if (directCnIds.length > 0) {
          const { data: directCN } = await supabase
            .from('credit_notes')
            .select('id, credit_amount, used_amount, status')
            .in('id', directCnIds);
          directCN?.forEach((c: any) => {
            usageMap[c.id] = { credit_amount: c.credit_amount || 0, used_amount: c.used_amount || 0, status: c.status };
          });
        }
        setCreditNoteUsage(usageMap);
      }

      setSales([...allSales]);
      // Phase 1 complete - show table immediately
      setLoading(false);
      
      // Phase 2: Fetch sale items in background (non-blocking, deferred to idle time)
      if (allSales.length > 0) {
        const runPhase2 = async () => {
          const saleIds = allSales.map(sale => sale.id);
          const batchSize = 500;
          const allItems: any[] = [];

          for (let i = 0; i < saleIds.length; i += batchSize) {
            const batchIds = saleIds.slice(i, i + batchSize);
            if (batchIds.length === 0) continue;
            const { data: itemsData, error: itemsError } = await supabase
              .from("sale_items")
              .select("*")
              .in("sale_id", batchIds);
            
            if (!itemsError && itemsData) {
              allItems.push(...itemsData);
            }
          }

        const itemsBySale: Record<string, SaleItem[]> = {};
        allItems.forEach((item: any) => {
          if (!itemsBySale[item.sale_id]) {
            itemsBySale[item.sale_id] = [];
          }
          itemsBySale[item.sale_id].push(item);
        });

        // Parse hold bill items from held_cart_data/notes fallback (hold bills have no sale_items rows)
        allSales.forEach((sale: any) => {
          if (isHoldLikeSale(sale) && !itemsBySale[sale.id]) {
            try {
              const holdData = sale.held_cart_data || JSON.parse(sale.notes || '{}');
              if (holdData.items && Array.isArray(holdData.items)) {
                itemsBySale[sale.id] = holdData.items.map((item: any, idx: number) => ({
                  id: `hold-${sale.id}-${idx}`,
                  sale_id: sale.id,
                  product_id: item.productId || item.product_id || '',
                  product_name: item.productName || item.product_name || '',
                  size: item.size || '',
                  barcode: item.barcode || '',
                  quantity: item.quantity || item.qty || 0,
                  unit_price: item.salePrice || item.unit_price || item.rate || 0,
                  mrp: item.mrp || 0,
                  line_total: item.lineTotal || item.line_total || item.total || 0,
                  discount_percent: item.discountPercent || item.discount_percent || 0,
                  gst_percent: item.gstPercent || item.gst_percent || 0,
                  hsn_code: item.hsnCode || item.hsn_code || '',
                  brand: item.brand || '',
                  color: item.color || '',
                  style: item.style || '',
                }));
              }
            } catch (e) { /* ignore parse errors */ }
          }
        });

          setSaleItems(itemsBySale);
        };

        // Defer to idle time so the table renders first
        const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
        if (typeof ric === 'function') {
          ric(() => { runPhase2(); }, { timeout: 1500 });
        } else {
          setTimeout(() => { runPhase2(); }, 0);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load sales",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const fetchSaleItems = async (saleId: string): Promise<SaleItem[]> => {
    if (saleItems[saleId]) return saleItems[saleId];

    // Check if this is a hold bill - items are stored in notes JSON, not in sale_items
    const sale = sales.find(s => s.id === saleId);
    if (sale?.payment_status === 'hold' && sale?.notes) {
      try {
        const holdData = JSON.parse(sale.notes);
        if (holdData.items && Array.isArray(holdData.items)) {
          const parsedItems: SaleItem[] = holdData.items.map((item: any, idx: number) => ({
            id: `hold-${saleId}-${idx}`,
            sale_id: saleId,
            product_id: item.productId || item.product_id || '',
            product_name: item.productName || item.product_name || '',
            size: item.size || '',
            barcode: item.barcode || '',
            quantity: item.quantity || item.qty || 0,
            unit_price: item.salePrice || item.unit_price || item.rate || 0,
            mrp: item.mrp || 0,
            line_total: item.lineTotal || item.line_total || item.total || 0,
            discount_percent: item.discountPercent || item.discount_percent || 0,
            gst_percent: item.gstPercent || item.gst_percent || 0,
            hsn_code: item.hsnCode || item.hsn_code || '',
            brand: item.brand || '',
            color: item.color || '',
            style: item.style || '',
          }));
          setSaleItems((prev) => ({ ...prev, [saleId]: parsedItems }));
          return parsedItems;
        }
      } catch (e) {
        console.error('Error parsing hold bill items:', e);
      }
    }

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
        .select("*, sale_return_items(id, product_name, size, color, barcode, hsn_code, quantity, unit_price, gst_percent, line_total)")
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

  const handleInitiateDelete = async (sale: Sale) => {
    setItemCountToDelete(null);
    setSaleToDelete(sale);
    // Fetch item count in background to show in dialog
    if (currentOrganization?.id) {
      try {
        const { count } = await supabase
          .from('sale_items')
          .select('id', { count: 'exact', head: true })
          .eq('sale_id', sale.id);
        setItemCountToDelete(count ?? null);
      } catch { /* non-blocking */ }
    }
  };

  const handleDeleteSale = async () => {
    if (!saleToDelete || !hasSpecialPermission('delete_records')) return;

    setIsDeleting(true);
    try {
      const success = await softDelete("sales", saleToDelete.id);
      if (!success) throw new Error("Failed to delete sale");

      if (saleToDelete?.sale_number && currentOrganization?.id) {
        await deleteLedgerEntries({ organizationId: currentOrganization.id, voucherNo: saleToDelete.sale_number, voucherTypes: ['SALE', 'RECEIPT'] });
      }

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
    if (selectedSales.size === 0 || !hasSpecialPermission('delete_records')) return;

    setIsDeleting(true);
    try {
      const salesToDelete = Array.from(selectedSales);
      const count = await bulkSoftDelete("sales", salesToDelete);

      if (currentOrganization?.id) {
        for (const sid of salesToDelete) {
          const s: any = sales.find((x: any) => x.id === sid);
          if (s?.sale_number) {
            await deleteLedgerEntries({ organizationId: currentOrganization.id, voucherNo: s.sale_number, voucherTypes: ['SALE', 'RECEIPT'] });
          }
        }
      }

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

  const handleBulkCancel = async () => {
    if (selectedSales.size === 0 || !hasSpecialPermission('cancel_invoice')) return;
    setIsBulkCancelling(true);
    try {
      const ids = Array.from(selectedSales);
      let successCount = 0;
      let failCount = 0;
      for (const id of ids) {
        try {
          const s: any = sales.find((x: any) => x.id === id);
          const { data, error } = await supabase.rpc('cancel_invoice', {
            p_sale_id: id,
            p_reason: bulkCancelReason.trim() || null,
          });
          if (error) { failCount++; continue; }
          const result = data as any;
          if (result && (result.success === true || result === true)) {
            successCount++;
            if (s?.sale_number && currentOrganization?.id) {
              await deleteLedgerEntries({ organizationId: currentOrganization.id, voucherNo: s.sale_number, voucherTypes: ['SALE', 'RECEIPT'] });
            }
          } else failCount++;
        } catch {
          failCount++;
        }
      }
      toast({
        title: 'Invoices Cancelled',
        description: `${successCount} sale(s) cancelled${failCount > 0 ? `, ${failCount} failed` : ''}. Stock restored.`,
      });
      setSelectedSales(new Set());
      setShowBulkCancelDialog(false);
      setBulkCancelReason('');
      await fetchSales();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to cancel sales', variant: 'destructive' });
    } finally {
      setIsBulkCancelling(false);
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

      // Fetch financer details, customer GST, and previous balance in parallel
      let financerDetails = null;
      const [{ data: finData }, { data: customerData }, previousBalance] = await Promise.all([
        supabase.from('sale_financer_details').select('*').eq('sale_id', sale.id).maybeSingle(),
        sale.customer_id
          ? supabase.from('customers').select('gst_number, transport_details').eq('id', sale.customer_id).maybeSingle()
          : Promise.resolve({ data: null }),
        (async () => {
          if (!sale.customer_id) return 0;
          const { data: allSales } = await supabase
            .from('sales')
            .select('id, net_amount, paid_amount')
            .eq('customer_id', sale.customer_id)
            .eq('organization_id', currentOrganization!.id)
            .is('deleted_at', null);
          if (!allSales) return 0;
          return allSales.reduce((sum, s) => sum + ((s.net_amount || 0) - (s.paid_amount || 0)), 0);
        })(),
      ]);
      if (finData) {
        financerDetails = {
          financer_name: finData.financer_name,
          loan_number: finData.loan_number || undefined,
          emi_amount: finData.emi_amount || undefined,
          tenure: finData.tenure || undefined,
          down_payment: finData.down_payment || undefined,
        };
      }

      const invoiceData = {
        billNo: sale.sale_number,
        date: saleDate,
        customerName: sale.customer_name,
        customerAddress: sale.customer_address || '',
        customerMobile: sale.customer_phone || '',
        customerGSTIN: customerData?.gst_number || '',
        customerTransportDetails: customerData?.transport_details || '',
        items: items.map((item, index) => ({
          sr: index + 1,
          particulars: item.product_name,
          size: item.size,
          barcode: item.barcode || '',
          hsn: item.hsn_code || '',
          sp: item.mrp,
          mrp: item.mrp,
          qty: item.quantity,
          rate: item.unit_price,
          total: item.line_total,
          gstPercent: item.gst_percent || 0,
        })),
        subTotal: sale.gross_amount,
        discount: sale.discount_amount + sale.flat_discount_amount,
        saleReturnAdjust: sale.sale_return_adjust || 0,
        grandTotal: sale.net_amount,
        roundOff: sale.round_off || 0,
        cashPaid: sale.payment_method === 'cash' ? sale.net_amount : 0,
        upiPaid: sale.payment_method === 'upi' ? sale.net_amount : 0,
        paymentMethod: sale.payment_method,
        cashAmount: sale.cash_amount,
        cardAmount: sale.card_amount,
        upiAmount: sale.upi_amount,
        creditAmount: sale.credit_amount,
        paidAmount: sale.paid_amount,
        previousBalance: previousBalance || 0,
        salesman: sale.salesman || '',
        notes: sale.notes || '',
        financerDetails,
      };

      // Set print data first
      setPrintData(invoiceData);
      
      // Wait for InvoiceWrapper to fully render (data + DOM + images) before printing
      waitForPrintReady(invoicePrintRef, () => {
        handlePrint();
      });
      
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

    // Generate invoice URL - include org slug for branding
    const orgSlug = currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || '';
    const thermalSuffix = saleSettings?.pos_bill_format === 'thermal' ? '?format=thermal' : '';
    const invoiceUrl = `${window.location.origin}/${orgSlug}/invoice/view/${sale.id}${thermalSuffix}`;
    
    // Fetch customer balance if customer_id exists
    let customerBalance = 0;
    if (sale.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('opening_balance')
        .eq('id', sale.customer_id)
        .single();
      
      const openingBalance = customer?.opening_balance || 0;
      
      const { data: sales } = await supabase
        .from('sales')
        .select('id, net_amount, paid_amount')
        .eq('customer_id', sale.customer_id)
        .eq('organization_id', currentOrganization?.id)
        .is('deleted_at', null);
      
      const saleIds = sales?.map(s => s.id) || [];
      
      // Fetch voucher payments for accurate balance
      const { data: allVouchers } = await supabase
        .from('voucher_entries')
        .select('reference_id, reference_type, total_amount')
        .eq('organization_id', currentOrganization?.id)
        .eq('voucher_type', 'receipt')
        .is('deleted_at', null);
      
      // Calculate using Math.max() logic to avoid double-counting
      let totalSales = 0;
      let totalPaidOnSales = 0;
      let openingBalancePayments = 0;
      
      // Build invoice voucher payments map
      const invoiceVoucherPayments = new Map<string, number>();
      allVouchers?.forEach(v => {
        if (!v.reference_id) return;
        if (saleIds.includes(v.reference_id)) {
          invoiceVoucherPayments.set(
            v.reference_id,
            (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0)
          );
        } else if (v.reference_type === 'customer' && v.reference_id === sale.customer_id) {
          openingBalancePayments += Number(v.total_amount) || 0;
        }
      });
      
      sales?.forEach(s => {
        totalSales += s.net_amount || 0;
        const salePaidAmount = s.paid_amount || 0;
        const voucherAmount = invoiceVoucherPayments.get(s.id) || 0;
        totalPaidOnSales += Math.max(salePaidAmount, voucherAmount);
      });
      
      const totalPaid = totalPaidOnSales + openingBalancePayments;
      customerBalance = Math.round(openingBalance + totalSales - totalPaid);
    }
    
    // Use template for message
    const templateMessage = formatMessage('sales_invoice', {
      sale_number: sale.sale_number,
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      sale_date: sale.sale_date,
      net_amount: sale.net_amount,
      payment_status: sale.payment_status,
      cash_amount: sale.cash_amount,
      card_amount: sale.card_amount,
      upi_amount: sale.upi_amount,
      paid_amount: sale.paid_amount,
      customer_id: sale.customer_id,
      organization_id: currentOrganization?.id,
    }, `${itemsList}\n\n📄 View Invoice Online:\n${invoiceUrl}`, customerBalance);

    sendWhatsApp(sale.customer_phone, templateMessage);
  };

  // Resend WhatsApp using API (for WhatsApp API enabled customers)
  const handleResendWhatsAppAPI = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!sale.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send WhatsApp message",
        variant: "destructive",
      });
      return;
    }

    try {
      const items = await fetchSaleItems(sale.id);
      const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
      
      await sendMessageAsync({
        phone: sale.customer_phone,
        message: '',
        templateType: 'sales_invoice',
        templateName: whatsAppAPISettings?.invoice_template_name || undefined,
        referenceId: sale.id,
        referenceType: 'sale',
        saleData: {
          sale_id: sale.id,
          org_slug: currentOrganization?.slug,
          sale_number: sale.sale_number,
          customer_name: sale.customer_name,
          customer_phone: sale.customer_phone,
          sale_date: sale.sale_date,
          net_amount: sale.net_amount,
          gross_amount: sale.gross_amount,
          discount_amount: sale.discount_amount,
          payment_status: sale.payment_status,
          items_count: totalQty,
          salesman: sale.salesman,
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

  const handleCopyLink = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    const orgSlug = currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || '';
    const thermalSuffix = saleSettings?.pos_bill_format === 'thermal' ? '?format=thermal' : '';
    const invoiceUrl = `${window.location.origin}/${orgSlug}/invoice/view/${sale.id}${thermalSuffix}`;
    copyInvoiceLink(invoiceUrl);
  };

  const handlePreviewClick = async (sale: Sale, event: React.MouseEvent) => {
    event.stopPropagation();
    await fetchSaleItems(sale.id);
    // Fetch financer details and customer GST for preview
    const [{ data: finData }, { data: custData }] = await Promise.all([
      supabase.from('sale_financer_details').select('*').eq('sale_id', sale.id).maybeSingle(),
      sale.customer_id
        ? supabase.from('customers').select('gst_number, transport_details, address').eq('id', sale.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setPreviewFinancerDetails(finData ? {
      financer_name: finData.financer_name,
      loan_number: finData.loan_number || undefined,
      emi_amount: finData.emi_amount || undefined,
      tenure: finData.tenure || undefined,
      down_payment: finData.down_payment || undefined,
    } : null);
    setPreviewCustomerData(custData);
    setPreviewSale(sale);
    setShowPreviewDialog(true);
  };

  const openPaymentDialog = (sale: Sale) => {
    setSelectedSaleForPayment(sale);
    const pending = Math.round(sale.net_amount - (sale.paid_amount || 0) - (sale.sale_return_adjust || 0));
    setPaidAmount(pending !== 0 ? pending.toString() : "");
    setPaymentDate(new Date());
    setPaymentMode("cash");
    setPaymentNarration("");
    setAdvanceBalance(0);
    setShowPaymentDialog(true);

    // Fetch advance balance if customer exists
    if (sale.customer_id && currentOrganization?.id) {
      supabase
        .from('customer_advances')
        .select('amount, used_amount')
        .eq('customer_id', sale.customer_id)
        .eq('organization_id', currentOrganization.id)
        .in('status', ['active', 'partially_used'])
        .then(({ data }) => {
          const unused = (data || []).reduce((sum, a) => sum + Math.max(0, (a.amount || 0) - (a.used_amount || 0)), 0);
          setAdvanceBalance(unused);
        });
    }
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

    const currentPaid = selectedSaleForPayment.paid_amount || 0;
    const currentCNAdjust = selectedSaleForPayment.sale_return_adjust || 0;
    const pendingAmount = Math.round(selectedSaleForPayment.net_amount - currentPaid - currentCNAdjust);

    if (amount > pendingAmount) {
      toast({
        title: "Amount Exceeds Pending",
        description: `Payment amount cannot exceed pending amount of ₹${Math.round(pendingAmount).toLocaleString('en-IN')}`,
        variant: "destructive",
      });
      return;
    }

    setIsRecordingPayment(true);
    try {
      const newPaidAmount = currentPaid + amount;
      const newStatus = (newPaidAmount + currentCNAdjust) >= selectedSaleForPayment.net_amount - 1
        ? 'completed'
        : newPaidAmount > 0 || currentCNAdjust > 0 ? 'partial' : 'pending';

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
        { p_type: 'receipt', p_date: format(paymentDate, 'yyyy-MM-dd') }
      );

      if (voucherError) throw voucherError;

      const { error: voucherEntryError } = await supabase
        .from('voucher_entries')
        .insert({
          organization_id: currentOrganization?.id,
          voucher_number: voucherData,
          voucher_type: 'receipt',
          voucher_date: format(paymentDate, 'yyyy-MM-dd'),
          reference_type: 'sale',
          reference_id: selectedSaleForPayment.id,
          total_amount: amount,
          description: `Payment received for POS sale ${selectedSaleForPayment.sale_number} - ${paymentNarration}`,
        });

      if (voucherEntryError) throw voucherEntryError;

      toast({
        title: "Payment Recorded",
        description: `Payment of ₹${Math.round(amount).toLocaleString('en-IN')} recorded successfully`,
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
        previousBalance: Math.round(selectedSaleForPayment.net_amount - currentPaid - currentCNAdjust),
        currentBalance: Math.round(selectedSaleForPayment.net_amount - newPaidAmount - currentCNAdjust),
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

    const message = `*PAYMENT RECEIPT*\n\nReceipt No: ${receiptData.voucherNumber}\nDate: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), 'dd/MM/yyyy') : '-'}\n\nCustomer: ${receiptData.customerName?.toUpperCase()}\nInvoice: ${receiptData.invoiceNumber}\n\nInvoice Amount: ₹${Math.round(receiptData.invoiceAmount).toLocaleString('en-IN')}\nPaid Amount: ₹${Math.round(receiptData.paidAmount).toLocaleString('en-IN')}\nBalance: ₹${Math.round(receiptData.currentBalance).toLocaleString('en-IN')}\n\nPayment Mode: ${receiptData.paymentMethod.toUpperCase()}\n${receiptData.narration ? `\nNotes: ${receiptData.narration}` : ''}\n\nThank you for your payment!`;

    sendWhatsApp(receiptData.customerPhone, message);
  };

  // Memoize filtered sales to avoid recomputing on every render
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const searchLower = searchQuery.toLowerCase();
      
      // Check basic sale fields
      const matchesBasicSearch =
        sale.sale_number.toLowerCase().includes(searchLower) ||
        sale.customer_name.toLowerCase().includes(searchLower) ||
        (sale.customer_phone && sale.customer_phone.includes(searchLower));
      
      // Check barcode in sale items
      const items = saleItems[sale.id] || [];
      const matchesBarcodeSearch = items.some(item => 
        item.barcode?.toLowerCase().includes(searchLower) ||
        item.product_name?.toLowerCase().includes(searchLower)
      );
      
      const matchesSearch = matchesBasicSearch || matchesBarcodeSearch;

      // When user is actively searching, bypass date range filter
      const hasSearchQuery = searchLower.length > 0;
      
      // Convert sale_date to local date for comparison
      const saleLocalDate = new Date(sale.sale_date);
      const saleDateStr = format(saleLocalDate, 'yyyy-MM-dd');
      const startDateStr = startDate ? startDate : null;
      const endDateStr = endDate ? endDate : null;

      const matchesDateRange = hasSearchQuery ? true :
        ((!startDateStr || saleDateStr >= startDateStr) &&
        (!endDateStr || saleDateStr <= endDateStr));

      const matchesPaymentMethod =
        paymentMethodFilter === "all" || sale.payment_method === paymentMethodFilter;

      const matchesPaymentStatus =
        paymentStatusFilter.length === 0 || paymentStatusFilter.includes(sale.payment_status);

      const matchesSaleType =
        saleTypeFilter === "all" ||
        (saleTypeFilter === "dc" && sale.sale_type === "delivery_challan") ||
        (saleTypeFilter === "pos" && sale.sale_type !== "delivery_challan") ||
        (saleTypeFilter === "cn" && !!sale.credit_note_id);

      const matchesRefund =
        refundFilter === "all" ||
        (refundFilter === "with_refund" && (sale.refund_amount || 0) > 0) ||
        (refundFilter === "without_refund" && (sale.refund_amount || 0) === 0);

      const matchesCreditNote =
        creditNoteFilter === "all" ||
        (creditNoteFilter === "with_credit_note" && sale.credit_note_id) ||
        (creditNoteFilter === "without_credit_note" && !sale.credit_note_id);

      const matchesUser = userFilter === "all" || userFilter === "__pending__" || sale.created_by === userFilter;

      const isCancelled = !!sale.is_cancelled;
      const matchesCancel =
        cancelFilter === "all" ||
        (cancelFilter === "active" && !isCancelled) ||
        (cancelFilter === "cancelled" && isCancelled);

      return matchesSearch && matchesDateRange && matchesPaymentMethod && matchesPaymentStatus && matchesRefund && matchesCreditNote && matchesSaleType && matchesUser && matchesCancel;
    });
  }, [sales, saleItems, searchQuery, startDate, endDate, paymentMethodFilter, paymentStatusFilter, refundFilter, creditNoteFilter, saleTypeFilter, userFilter, cancelFilter]);

  // Memoize summary statistics to avoid recalculating on every render
  const summaryStats = useMemo(() => {
    // Hold invoices are draft-like POS states; exclude them from sales KPIs.
    const nonHoldSales = filteredSales.filter((sale) => !isHoldLikeSale(sale));
    const holdSales = filteredSales.filter((sale) => isHoldLikeSale(sale));
    return {
      totalBills: filteredSales.length,
      totalQty: nonHoldSales.reduce((sum, sale) => {
        const items = saleItems[sale.id] || [];
        return sum + items.reduce((itemSum, item) => itemSum + item.quantity, 0);
      }, 0),
      totalAmount: nonHoldSales.reduce((sum, sale) => sum + sale.gross_amount, 0),
      totalDiscount: nonHoldSales.reduce((sum, sale) => sum + sale.discount_amount + sale.flat_discount_amount + ((sale as any).points_redeemed_amount || 0), 0),
      completedCount: nonHoldSales.filter(sale => sale.payment_status === 'completed').length,
      completedAmount: nonHoldSales.filter(sale => sale.payment_status === 'completed').reduce((sum, sale) => sum + sale.net_amount, 0),
      pendingCount: nonHoldSales.filter(sale => sale.payment_status === 'pending' || sale.payment_status === 'partial').length,
      pendingAmount: nonHoldSales.filter(sale => sale.payment_status === 'pending' || sale.payment_status === 'partial').reduce((sum, sale) => sum + (sale.net_amount - (sale.paid_amount || 0) - (sale.sale_return_adjust || 0)), 0),
      holdCount: holdSales.length,
      holdAmount: holdSales.reduce((sum, sale) => sum + sale.net_amount, 0),
      refundCount: nonHoldSales.filter(sale => (sale.refund_amount || 0) > 0).length,
      refundAmount: nonHoldSales.reduce((sum, sale) => sum + (sale.refund_amount || 0), 0),
      creditNoteCount: nonHoldSales.filter(sale => sale.credit_note_id).length,
      creditNoteAmount: nonHoldSales.reduce((sum, sale) => sum + (sale.credit_note_amount || 0), 0),
      // Payment method totals
      totalCash: nonHoldSales.reduce((sum, sale) => sum + (sale.cash_amount || 0), 0),
      totalCard: nonHoldSales.reduce((sum, sale) => sum + (sale.card_amount || 0), 0),
      totalUpi: nonHoldSales.reduce((sum, sale) => sum + (sale.upi_amount || 0), 0),
      totalBalance: nonHoldSales.reduce((sum, sale) => sum + (sale.net_amount - (sale.paid_amount || 0) - (sale.sale_return_adjust || 0)), 0),
      totalSaleReturnAdjust: nonHoldSales.reduce((sum, sale) => sum + (sale.sale_return_adjust || 0), 0),
      totalRoundOff: nonHoldSales.reduce((sum, sale) => sum + (sale.round_off || 0), 0),
      // Bill counts by payment method
      cashBillCount: nonHoldSales.filter(sale => (sale.cash_amount || 0) > 0).length,
      cardBillCount: nonHoldSales.filter(sale => (sale.card_amount || 0) > 0).length,
      upiBillCount: nonHoldSales.filter(sale => (sale.upi_amount || 0) > 0).length,
    };
  }, [filteredSales, saleItems]);

  // Memoize pagination calculations
  const totalPages = useMemo(() => Math.ceil(filteredSales.length / itemsPerPage), [filteredSales.length, itemsPerPage]);
  const paginatedSales = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredSales.slice(startIndex, endIndex);
  }, [filteredSales, currentPage, itemsPerPage]);

  const handleExportExcel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const exportData = filteredSales.map((sale: Sale) => ({
      'Bill No': sale.sale_number || '',
      'Date': sale.sale_date ? format(new Date(sale.sale_date), 'dd/MM/yyyy') : '',
      'Customer': sale.customer_name || '',
      'Phone': sale.customer_phone || '',
      'Qty': (saleItems[sale.id] || []).reduce((s, i) => s + i.quantity, 0),
      'Gross Amount': sale.gross_amount || 0,
      'Discount': (sale.discount_amount || 0) + (sale.flat_discount_amount || 0),
      'Net Amount': sale.net_amount || 0,
      'Paid Amount': sale.paid_amount || 0,
      'Balance': (sale.net_amount || 0) - (sale.paid_amount || 0),
      'Cash': sale.cash_amount || 0,
      'Card': sale.card_amount || 0,
      'UPI': sale.upi_amount || 0,
      'Payment Status': sale.payment_status || '',
      'Payment Method': sale.payment_method || '',
      'Salesman': sale.salesman || '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'POS Sales');
    XLSX.writeFile(wb, `POS_Sales_All_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    toast({ title: "Exported", description: `${exportData.length} records exported to Excel` });
  }, [filteredSales, saleItems, toast]);

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

  // ── E-Invoice handlers ──
  const handleGenerateEInvoice = async (sale: Sale) => {
    const customerGstin = sale.customers?.gst_number;
    if (!customerGstin) {
      toast({ title: "GSTIN Required", description: "Customer GSTIN is required for e-Invoice generation (B2B requirement).", variant: "destructive" });
      return;
    }
    if (sale.irn) {
      toast({ title: "Already Generated", description: `E-Invoice already exists. IRN: ${sale.irn.substring(0, 20)}...` });
      return;
    }
    const sellerGstin = (settings as any)?.gst_number;
    if (!sellerGstin) {
      toast({ title: "Seller GSTIN Missing", description: "Configure Business GSTIN in Settings → Business Details.", variant: "destructive" });
      return;
    }

    setIsGeneratingEInvoice(sale.id);
    try {
      const testMode = saleSettings?.einvoice_settings?.test_mode ?? true;
      const response = await supabase.functions.invoke('generate-einvoice', {
        body: { saleId: sale.id, organizationId: currentOrganization?.id, testMode },
      });
      if (response.error) throw new Error(response.error.message);
      const result = response.data;
      if (!result) throw new Error("No response received from e-Invoice service");
      if (result.success) {
        toast({ title: "✅ E-Invoice Generated Successfully!", description: `IRN: ${result.irn?.substring(0, 30)}...${result.ackNo ? ` | Ack No: ${result.ackNo}` : ''}` });
        fetchSales();
      } else {
        toast({ title: "E-Invoice Failed", description: result.error || result.message || "E-Invoice generation failed", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to generate e-Invoice", variant: "destructive" });
    } finally {
      setIsGeneratingEInvoice(null);
    }
  };

  const safeErrorString = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      return val.ErrorMessage || val.message || val.error || JSON.stringify(val);
    }
    return String(val);
  };

  const handleCancelIRN = async (sale: Sale) => {
    if (!sale.irn) return;
    if (sale.einvoice_status === 'cancelled') {
      toast({ title: "Already Cancelled", description: "This IRN has already been cancelled." });
      return;
    }
    if (sale.status === 'cancelled') {
      toast({ title: "Invoice Not Active", description: "This invoice has been cancelled. IRN cannot be cancelled for inactive invoices.", variant: "destructive" });
      return;
    }
    const ackDate = sale.ack_date ? new Date(sale.ack_date) : new Date(sale.created_at);
    const hoursSince = (Date.now() - ackDate.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) {
      toast({ title: "Cannot Cancel", description: "IRN can only be cancelled within 24 hours of generation.", variant: "destructive" });
      return;
    }
    const cancelReasonCode = window.prompt(
      `Cancel IRN for ${sale.sale_number}\n\nEnter reason:\n1 = Duplicate\n2 = Data Entry Mistake\n3 = Order Cancelled\n4 = Others\n\nType 1, 2, 3 or 4:`
    );
    if (!cancelReasonCode) return;

    const reasonMap: Record<string, string> = {
      '1': 'duplicate', '2': 'data_error', '3': 'cancelled', '4': 'others'
    };
    const reason = reasonMap[cancelReasonCode.trim()] || 'others';
    const remarks = window.prompt('Enter remarks (optional):') || reason;

    setIsCancellingIRN(sale.id);
    try {
      const testMode = saleSettings?.einvoice_settings?.test_mode ?? true;
      const response = await supabase.functions.invoke('cancel-einvoice', {
        body: { saleId: sale.id, organizationId: currentOrganization?.id, reason, remarks: remarks.substring(0, 100), testMode },
      });
      if (response.error) throw new Error(response.error.message);
      const result = response.data;
      if (!result) throw new Error("No response from cancel service");
      if (result.success) {
        toast({ title: "IRN Cancelled", description: "The e-Invoice IRN has been cancelled successfully." });
        fetchSales();
      } else {
        const errorMsg = safeErrorString(result.error) || "Cancellation failed";
        // If PeriOne says "not active" or already cancelled, sync local status
        if (errorMsg.toLowerCase().includes('not active') || errorMsg.toLowerCase().includes('already cancelled')) {
          await supabase.from('sales').update({ einvoice_status: 'cancelled' }).eq('id', sale.id);
          toast({ title: "IRN Already Cancelled", description: "This IRN was already cancelled. Status has been updated.", variant: "destructive" });
          fetchSales();
        } else {
          toast({ title: "Cancellation Failed", description: errorMsg, variant: "destructive" });
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to cancel IRN", variant: "destructive" });
    } finally {
      setIsCancellingIRN(null);
    }
  };

  // E-Invoice PDF Download handler
  const handleDownloadEInvoicePDF = async (sale: Sale) => {
    if (!sale.irn) {
      toast({ title: "E-Invoice Not Generated", description: "Please generate e-Invoice first.", variant: "destructive" });
      return;
    }
    setIsDownloadingEInvoice(sale.id);
    // Fetch sale_items so EInvoicePrint can render product details
    const items = await fetchSaleItems(sale.id);
    setEInvoiceToPrint({ ...sale, sale_items: items });
    setTimeout(async () => {
      try {
        if (!eInvoicePrintRef.current) throw new Error("Print component not ready");
        const canvas = await html2canvas(eInvoicePrintRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const scaledHeight = (canvas.height * pdfWidth) / canvas.width;
        if (scaledHeight <= pdfHeight * 1.05) {
          pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, Math.min(scaledHeight, pdfHeight));
        } else {
          const pixelsPerPage = (pdfHeight / scaledHeight) * canvas.height;
          const totalPages = Math.ceil(scaledHeight / pdfHeight);
          for (let page = 0; page < totalPages; page++) {
            if (page > 0) pdf.addPage();
            const sourceY = page * pixelsPerPage;
            const sourceH = Math.min(pixelsPerPage, canvas.height - sourceY);
            const sliceH = (sourceH * pdfWidth) / canvas.width;
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = Math.ceil(sourceH);
            const ctx = pageCanvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, Math.ceil(sourceH));
              pdf.addImage(pageCanvas.toDataURL('image/png'), "PNG", 0, 0, pdfWidth, sliceH);
            }
          }
        }
        pdf.save(`e-Invoice_${sale.sale_number}.pdf`);
        toast({ title: "Download Complete", description: `e-Invoice PDF saved as e-Invoice_${sale.sale_number}.pdf` });
      } catch (error: any) {
        toast({ title: "Download Failed", description: error.message, variant: "destructive" });
      } finally {
        setIsDownloadingEInvoice(null);
        setEInvoiceToPrint(null);
      }
    }, 500);
  };

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
    <div className="min-h-screen bg-background px-8 py-6">
      
      <div className="w-full space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-foreground">
              POS Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">View and manage all POS sales</p>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="outline" onClick={handleExportExcel} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button onClick={() => navigate("/pos-sales")} className="gap-2">
              <Plus className="h-4 w-4" />
              New Sale
            </Button>
            {selectedSales.size > 0 && hasSpecialPermission('delete_records') && (
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
            {selectedSales.size > 0 && hasSpecialPermission('cancel_invoice') && (
              <Button
                onClick={() => setShowBulkCancelDialog(true)}
                disabled={isBulkCancelling}
                variant="outline"
                className="gap-2 border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
              >
                {isBulkCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Cancel Selected ({selectedSales.size})
              </Button>
            )}
          </div>
        </div>

        {/* Summary Statistics - Flat Solid Color Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card 
            className="cursor-pointer hover:opacity-90 transition-opacity duration-200 bg-blue-500 border-0 shadow-none"
            onClick={() => setPaymentStatusFilter([])}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardDescription className="text-xs font-semibold text-white/90">Total Bills</CardDescription>
              <Receipt className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-2xl font-bold text-white">{summaryStats.totalBills}</div>
              <p className="text-xs text-white/80 mt-0.5">Qty: {summaryStats.totalQty}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:opacity-90 transition-opacity duration-200 bg-emerald-500 border-0 shadow-none"
            onClick={() => setPaymentStatusFilter(["completed"])}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardDescription className="text-xs font-semibold text-white/90">Completed</CardDescription>
              <CheckCircle2 className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-2xl font-bold text-white">{summaryStats.completedCount}</div>
              <p className="text-xs text-white/80 mt-0.5">₹{summaryStats.completedAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:opacity-90 transition-opacity duration-200 bg-orange-500 border-0 shadow-none"
            onClick={() => setPaymentStatusFilter(["pending"])}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardDescription className="text-xs font-semibold text-white/90">Pending/Partial</CardDescription>
              <Clock className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-2xl font-bold text-white">{summaryStats.pendingCount}</div>
              <p className="text-xs text-white/80 mt-0.5">₹{summaryStats.pendingAmount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:opacity-90 transition-opacity duration-200 bg-violet-500 border-0 shadow-none"
            onClick={() => setPaymentStatusFilter([])}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardDescription className="text-xs font-semibold text-white/90">Sale Amount</CardDescription>
              <IndianRupee className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-2xl font-bold text-white">₹{summaryStats.totalAmount.toFixed(0)}</div>
              <p className="text-xs text-white/80 mt-0.5">Disc: ₹{summaryStats.totalDiscount.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:opacity-90 transition-opacity duration-200 bg-teal-600 border-0 shadow-none"
            onClick={() => setPaymentStatusFilter([])}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardDescription className="text-xs font-semibold text-white/90">Net Sale</CardDescription>
              <IndianRupee className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-2xl font-bold text-white">
                ₹{(summaryStats.totalAmount - summaryStats.totalDiscount - summaryStats.totalSaleReturnAdjust - summaryStats.refundAmount - summaryStats.totalRoundOff).toFixed(0)}
              </div>
              <p className="text-[10px] text-white/80 mt-0.5 leading-tight">
                Sale ₹{summaryStats.totalAmount.toFixed(0)} − Disc ₹{summaryStats.totalDiscount.toFixed(0)} − S/R ₹{summaryStats.totalSaleReturnAdjust.toFixed(0)} − Refund ₹{summaryStats.refundAmount.toFixed(0)} − Round Off ₹{summaryStats.totalRoundOff.toFixed(0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Payment Method Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card 
            className="cursor-pointer hover:opacity-90 transition-opacity duration-200 bg-green-500 border-0 shadow-none"
            onClick={() => setPaymentMethodFilter("cash")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardDescription className="text-xs font-semibold text-white/90">Total Cash</CardDescription>
              <IndianRupee className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-2xl font-bold text-white">₹{summaryStats.totalCash.toFixed(0)}</div>
              <p className="text-xs text-white/80 mt-0.5">{summaryStats.cashBillCount} Bills</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:opacity-90 transition-opacity duration-200 bg-cyan-500 border-0 shadow-none"
            onClick={() => setPaymentMethodFilter("card")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardDescription className="text-xs font-semibold text-white/90">Total Card</CardDescription>
              <IndianRupee className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-2xl font-bold text-white">₹{summaryStats.totalCard.toFixed(0)}</div>
              <p className="text-xs text-white/80 mt-0.5">{summaryStats.cardBillCount} Bills</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:opacity-90 transition-opacity duration-200 bg-purple-500 border-0 shadow-none"
            onClick={() => setPaymentMethodFilter("upi")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardDescription className="text-xs font-semibold text-white/90">Total UPI</CardDescription>
              <IndianRupee className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-2xl font-bold text-white">₹{summaryStats.totalUpi.toFixed(0)}</div>
              <p className="text-xs text-white/80 mt-0.5">{summaryStats.upiBillCount} Bills</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:opacity-90 transition-opacity duration-200 bg-red-500 border-0 shadow-none"
            onClick={() => setPaymentStatusFilter(["pending"])}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardDescription className="text-xs font-semibold text-white/90">Total Balance</CardDescription>
              <IndianRupee className="h-4 w-4 text-white" />
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <div className="text-2xl font-bold text-white">₹{summaryStats.totalBalance.toFixed(0)}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="p-4 pb-3">
            <CardTitle className="flex items-center gap-2 text-[18px]">
              <Receipt className="h-4 w-4 text-primary" />
              Sales Records
            </CardTitle>
            <CardDescription className="text-[13px]">Search and filter your sales history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="flex gap-3 flex-wrap">
              <div className="flex-[2] min-w-[280px] relative">
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-40 justify-between">
                    {paymentStatusFilter.length === 0 ? 'All Status' : paymentStatusFilter.length === 1 ? paymentStatusFilter[0].charAt(0).toUpperCase() + paymentStatusFilter[0].slice(1) : `${paymentStatusFilter.length} Selected`}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[180px] p-2" align="start">
                  <div className="space-y-1">
                    {[{v:"hold",l:"On Hold"},{v:"completed",l:"Completed"},{v:"partial",l:"Partial"},{v:"pending",l:"Pending"}].map((s) => (
                      <label key={s.v} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                        <Checkbox
                          checked={paymentStatusFilter.includes(s.v)}
                          onCheckedChange={(checked) => {
                            setPaymentStatusFilter(prev =>
                              checked ? [...prev, s.v] : prev.filter(f => f !== s.v)
                            );
                          }}
                        />
                        {s.l}
                      </label>
                    ))}
                    {paymentStatusFilter.length > 0 && (
                      <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => setPaymentStatusFilter([])}>
                        Clear All
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={saleTypeFilter} onValueChange={setSaleTypeFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Bill Type" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Bills</SelectItem>
                  <SelectItem value="pos">POS Bills</SelectItem>
                  <SelectItem value="dc">DC Only</SelectItem>
                  <SelectItem value="cn">CN Only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={cancelFilter} onValueChange={setCancelFilter}>
                <SelectTrigger className="w-36" title="Cancellation status filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="cancelled">Cancelled Only</SelectItem>
                  <SelectItem value="all">All (Active + Cancelled)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Users</SelectItem>
                  {orgUsers.map((user: any) => (
                    <SelectItem key={user.id} value={user.id} title={user.email}>
                      {user.email.split("@")[0]}
                    </SelectItem>
                  ))}
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
                        <Label htmlFor="col-phone" className="text-sm">Phone Number</Label>
                        <Checkbox
                          id="col-phone"
                          checked={columnSettings.phone}
                          onCheckedChange={(checked) => updateColumnSetting('phone', !!checked)}
                        />
                      </div>
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
                        <Label htmlFor="col-creditNoteAmt" className="text-sm">C/Note Amt</Label>
                        <Checkbox
                          id="col-creditNoteAmt"
                          checked={columnSettings.creditNoteAmt}
                          onCheckedChange={(checked) => updateColumnSetting('creditNoteAmt', !!checked)}
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
              <div className="rounded-md border max-h-[600px] overflow-hidden">
                <div className="h-10 bg-muted/70 border-b" />
                <div className="divide-y">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                      <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                      <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                      <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                      <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                      <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                      <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div 
                ref={tableContainerRef}
                className="rounded-md border max-h-[600px] overflow-auto"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="h-10 bg-muted/70">
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold w-[40px]">
                        <Checkbox
                          checked={selectedSales.size === filteredSales.length && filteredSales.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] w-[30px]"></TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold">Sale Number</TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold">Customer</TableHead>
                      {columnSettings.phone && <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold">Phone</TableHead>}
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold">Salesman</TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold">Date</TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">Qty</TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">Amount</TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">Cash</TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">Card</TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">UPI</TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">Paid</TableHead>
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">Balance</TableHead>
                      {columnSettings.refund && <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">Refund</TableHead>}
                      {columnSettings.refundStatus && <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold">Ref. Status</TableHead>}
                      {columnSettings.creditNoteAmt && <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">C/Note Amt</TableHead>}
                      {columnSettings.creditNoteStatus && <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold">C/Note</TableHead>}
                      {columnSettings.status && <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold">Pay Status</TableHead>}
                      {isEInvoiceEnabled && <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold">E-Invoice</TableHead>}
                      <TableHead className="px-2 py-1.5 text-[13px] uppercase tracking-wider font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={(columnSettings.status ? 1 : 0) + (columnSettings.refund ? 1 : 0) + (columnSettings.refundStatus ? 1 : 0) + (columnSettings.creditNoteAmt ? 1 : 0) + (columnSettings.creditNoteStatus ? 1 : 0) + (isEInvoiceEnabled ? 1 : 0) + 15} className="text-center text-muted-foreground py-8">
                          No sales found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedSales.map((sale) => (
                        <React.Fragment key={sale.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-accent/50 h-10"
                          >
                            <TableCell className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedSales.has(sale.id)}
                                onCheckedChange={() => toggleSelectSale(sale.id)}
                              />
                            </TableCell>
                            <TableCell className="px-2 py-1.5" onClick={() => toggleExpanded(sale.id)}>
                              {expandedSale === sale.id ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-sm font-medium" onClick={() => toggleExpanded(sale.id)}>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1">
                                  <span>{sale.sale_number}</span>
                                  {sale.sale_type === 'delivery_challan' && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-700 border border-orange-300 leading-none">
                                      DC
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-foreground/70">
                                  {sale.sale_date ? format(new Date(sale.sale_date), "hh:mm a") : ''}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell 
                              className="px-2 py-1.5 text-sm cursor-pointer text-blue-600 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCustomerForHistory({
                                  id: sale.customer_id || null,
                                  name: sale.customer_name
                                });
                                setShowCustomerHistory(true);
                              }}
                            >
                              {sale.customer_name?.toUpperCase()}
                            </TableCell>
                            {columnSettings.phone && (
                              <TableCell className="px-2 py-1.5 text-sm" onClick={() => toggleExpanded(sale.id)}>
                                {sale.customer_phone || '-'}
                              </TableCell>
                            )}
                            <TableCell className="px-2 py-1.5 text-sm" onClick={() => toggleExpanded(sale.id)}>
                              {sale.salesman || '-'}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-sm" onClick={() => toggleExpanded(sale.id)}>
                              {sale.sale_date ? format(new Date(sale.sale_date), "dd/MM/yyyy") : '-'}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums" onClick={() => toggleExpanded(sale.id)}>
                              {saleItems[sale.id]?.reduce((sum, item) => sum + item.quantity, 0) || '-'}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums font-semibold text-primary" onClick={() => toggleExpanded(sale.id)}>
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center justify-end gap-1">
                                  {(sale.sale_return_adjust || 0) > 0 && (
                                    <Badge variant="outline" className="text-xs px-1 py-0 font-semibold border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-950 dark:border-orange-700 dark:text-orange-400 whitespace-nowrap">
                                      S/R Adj
                                    </Badge>
                                  )}
                                  <span className={sale.net_amount < 0 ? 'text-red-600' : ''}>
                                    ₹{Math.round(sale.net_amount).toLocaleString('en-IN')}
                                  </span>
                                </div>
                                {((sale.discount_amount || 0) + (sale.flat_discount_amount || 0)) > 0 && (
                                  <div
                                    className="text-xs font-medium text-muted-foreground whitespace-nowrap leading-tight"
                                    title={`Gross ₹${Math.round(sale.gross_amount || 0).toLocaleString('en-IN')} − Disc ₹${Math.round((sale.discount_amount || 0) + (sale.flat_discount_amount || 0)).toLocaleString('en-IN')} = ₹${Math.round(sale.net_amount).toLocaleString('en-IN')}`}
                                  >
                                    ₹{Math.round(sale.gross_amount || 0).toLocaleString('en-IN')}
                                    <span className="text-rose-600"> − ₹{Math.round((sale.discount_amount || 0) + (sale.flat_discount_amount || 0)).toLocaleString('en-IN')}</span>
                                  </div>
                                )}
                                {(sale.sale_return_adjust || 0) > 0 && (
                                  <div
                                    className="text-xs font-semibold text-foreground whitespace-nowrap leading-tight"
                                    title={`Bill ₹${Math.round(sale.net_amount + (sale.sale_return_adjust || 0)).toLocaleString('en-IN')} − S/R Adj ₹${Math.round(sale.sale_return_adjust || 0).toLocaleString('en-IN')} = Payable ₹${Math.round(sale.net_amount).toLocaleString('en-IN')}`}
                                  >
                                    ₹{Math.round(sale.net_amount + (sale.sale_return_adjust || 0)).toLocaleString('en-IN')}
                                    <span className="text-orange-600"> − ₹{Math.round(sale.sale_return_adjust || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums" onClick={() => toggleExpanded(sale.id)}>
                              {sale.cash_amount ? `₹${Math.round(sale.cash_amount).toLocaleString('en-IN')}` : '-'}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums" onClick={() => toggleExpanded(sale.id)}>
                              {sale.card_amount ? `₹${Math.round(sale.card_amount).toLocaleString('en-IN')}` : '-'}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums" onClick={() => toggleExpanded(sale.id)}>
                              {sale.upi_amount ? `₹${Math.round(sale.upi_amount).toLocaleString('en-IN')}` : '-'}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums" onClick={() => toggleExpanded(sale.id)}>
                              ₹{Math.round(sale.paid_amount || 0).toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums" onClick={() => toggleExpanded(sale.id)}>
                              {(() => {
                                const esb = isHoldLikeSale(sale) ? 'hold'
                                  : (sale.paid_amount || 0) >= sale.net_amount ? 'completed'
                                  : (sale.paid_amount || 0) > 0 ? 'partial' : 'pending';
                                return esb !== 'completed' ? (
                                  <span className="font-semibold text-orange-600">
                                    ₹{Math.round(sale.net_amount - (sale.paid_amount || 0)).toLocaleString('en-IN')}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                );
                              })()}
                            </TableCell>
                            {columnSettings.refund && (
                              <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums" onClick={() => toggleExpanded(sale.id)}>
                                {(sale.refund_amount || 0) > 0 ? (
                                  <span className="font-semibold text-red-600">
                                    ₹{Math.round(sale.refund_amount || 0).toLocaleString('en-IN')}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            )}
                            {columnSettings.refundStatus && (
                              <TableCell className="px-2 py-1.5" onClick={() => toggleExpanded(sale.id)}>
                                {(sale.refund_amount || 0) > 0 ? (
                                  <Badge variant="destructive" className="bg-red-500 text-white text-xs px-1.5 py-0">
                                    Refunded
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground text-xs px-1.5 py-0">
                                    No Refund
                                  </Badge>
                                )}
                              </TableCell>
                            )}
                            {columnSettings.creditNoteAmt && (
                              <TableCell className="px-2 py-1.5 text-sm text-right tabular-nums" onClick={() => toggleExpanded(sale.id)}>
                                {(() => {
                                  const cnAmt = sale.credit_note_amount || (sale.net_amount < 0 ? Math.abs(sale.net_amount) : 0);
                                  if (cnAmt > 0 || sale.credit_note_id) {
                                    return (
                                      <span className="font-semibold text-violet-600">
                                        ₹{Math.round(cnAmt).toLocaleString('en-IN')}
                                      </span>
                                    );
                                  }
                                  return <span className="text-muted-foreground">-</span>;
                                })()}
                              </TableCell>
                            )}
                            {columnSettings.creditNoteStatus && (
                              <TableCell className="px-2 py-1.5" onClick={() => toggleExpanded(sale.id)}>
                                {(sale.credit_note_id || sale.net_amount < 0) ? (() => {
                                  const cn = sale.credit_note_id ? creditNoteUsage[sale.credit_note_id] : null;
                                  const used = cn?.used_amount || 0;
                                  const total = cn?.credit_amount || (sale.net_amount < 0 ? Math.abs(sale.net_amount) : 0);
                                  if (used > 0 && used >= total) {
                                    return (
                                      <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs px-1.5 py-0 font-bold" title={`Adjusted ₹${Math.round(used).toLocaleString('en-IN')}`}>
                                        CN AD
                                      </Badge>
                                    );
                                  }
                                  if (used > 0) {
                                    return (
                                      <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs px-1.5 py-0 font-bold" title={`Partially adjusted ₹${Math.round(used).toLocaleString('en-IN')} of ₹${Math.round(total).toLocaleString('en-IN')}`}>
                                        CN AD
                                      </Badge>
                                    );
                                  }
                                  return (
                                    <Badge className="bg-violet-500 hover:bg-violet-600 text-white text-xs px-1.5 py-0 font-bold">
                                      CN
                                    </Badge>
                                  );
                                })() : (
                                  <Badge variant="outline" className="text-muted-foreground text-xs px-1.5 py-0">
                                    None
                                  </Badge>
                                )}
                              </TableCell>
                            )}
                            {columnSettings.status && (
                              <TableCell className="px-2 py-1.5" onClick={() => toggleExpanded(sale.id)}>
                                {(() => {
                                  const es = isHoldLikeSale(sale) ? 'hold'
                                    : (sale.paid_amount || 0) >= sale.net_amount ? 'completed'
                                    : (sale.paid_amount || 0) > 0 ? 'partial' : 'pending';
                                  return (
                                    <Badge 
                                      className={`min-w-[60px] justify-center whitespace-nowrap text-xs px-1.5 py-0 ${
                                        es === "completed" 
                                          ? "bg-green-500 hover:bg-green-600 text-white" 
                                          : es === "partial" 
                                            ? "bg-orange-400 hover:bg-orange-500 text-white" 
                                            : es === "hold"
                                              ? "bg-amber-500 hover:bg-amber-600 text-white" 
                                              : "bg-red-500 hover:bg-red-600 text-white"
                                      }`}
                                    >
                                      {es === "completed" ? "Paid" : es === "partial" ? "Partial" : es === "hold" ? "Hold" : "Not Paid"}
                                    </Badge>
                                  );
                                })()}
                              </TableCell>
                            )}
                            {isEInvoiceEnabled && (
                              <TableCell className="px-2 py-1.5" onClick={() => toggleExpanded(sale.id)}>
                                {sale.irn ? (
                                  sale.einvoice_status === 'cancelled' ? (
                                    <Badge variant="destructive" className="text-xs px-1.5 py-0">Cancelled</Badge>
                                  ) : (
                                    <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs px-1.5 py-0">
                                      <FileCheck className="h-3 w-3 mr-1" />
                                      Generated
                                    </Badge>
                                  )
                                ) : sale.customer_id && sale.customers?.gst_number ? (
                                  <Badge variant="outline" className="text-muted-foreground text-xs px-1.5 py-0">Pending</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">-</span>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-0.5">
                                {((sale.paid_amount || 0) < sale.net_amount && sale.payment_status !== 'hold') && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPaymentDialog(sale);
                                    }}
                                    title="Record Payment"
                                  >
                                    <IndianRupee className="h-3.5 w-3.5 text-purple-600" />
                                  </Button>
                                )}
                                {columnSettings.copyLink && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => handleCopyLink(sale, e)}
                                    title="Copy Invoice Link"
                                  >
                                    <Link2 className="h-3.5 w-3.5 text-blue-600" />
                                  </Button>
                                )}
                                {columnSettings.preview && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => handlePreviewClick(sale, e)}
                                    title="Preview Invoice"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-primary" />
                                  </Button>
                                )}
                                {columnSettings.whatsapp && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => handleWhatsAppShare(sale, e)}
                                    title="Share on WhatsApp"
                                    disabled={!sale.customer_phone}
                                  >
                                    <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                )}
                                {whatsAppAPISettings?.is_active && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => handleResendWhatsAppAPI(sale, e)}
                                    title="Resend via WhatsApp API"
                                    disabled={!sale.customer_phone || isSendingWhatsAppAPI}
                                  >
                                    <Send className="h-3.5 w-3.5 text-teal-600" />
                                  </Button>
                                )}
                                {columnSettings.print && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => handlePrintClick(sale, e)}
                                    title="Print Invoice (Ctrl+P)"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {isEInvoiceEnabled && sale.irn && sale.einvoice_status !== 'cancelled' && sale.status !== 'cancelled' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => { e.stopPropagation(); handleDownloadEInvoicePDF(sale); }}
                                    title="Print/Download E-Invoice"
                                    disabled={isDownloadingEInvoice === sale.id}
                                  >
                                    {isDownloadingEInvoice === sale.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5 text-green-600" />}
                                  </Button>
                                )}
                                {columnSettings.modify && hasSpecialPermission('modify_records') && (
                                   <Button
                                     variant="ghost"
                                     size="icon"
                                     className="h-7 w-7"
                                     onClick={(e) => handleEditSale(sale.id, e)}
                                   >
                                     <Edit className="h-3.5 w-3.5" />
                                   </Button>
                                 )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {expandedSale === sale.id && saleItems[sale.id] && (
                            <TableRow>
                              <TableCell colSpan={(columnSettings.status ? 1 : 0) + (columnSettings.refund ? 1 : 0) + (isEInvoiceEnabled ? 1 : 0) + 16} className="bg-muted/30 p-3">
                                <div className="space-y-3">
                                  <div>
                                    <h4 className="font-semibold text-[13px] mb-1.5">Sale Items:</h4>
                                    <div className="rounded-md border">
                                      <Table>
                                        <TableHeader>
                                          <TableRow className="h-9 bg-muted/50">
                                            <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Product</TableHead>
                                            {showItemBrand && <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Brand</TableHead>}
                                            {showItemColor && <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Color</TableHead>}
                                            {showItemStyle && <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Style</TableHead>}
                                            <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Size</TableHead>
                                            {showItemBarcode && <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Barcode</TableHead>}
                                            {showItemHsn && <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">HSN</TableHead>}
                                            <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold text-right">Qty</TableHead>
                                            {showItemMrp && <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold text-right">MRP</TableHead>}
                                            <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold text-right">Rate</TableHead>
                                            <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold text-right">Disc%</TableHead>
                                            <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold text-right">GST%</TableHead>
                                            <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold text-right">Total</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {saleItems[sale.id].map((item) => (
                                            <TableRow key={item.id} className="h-9">
                                              <TableCell className="px-2 py-1 text-sm">{item.product_name}</TableCell>
                                              {showItemBrand && <TableCell className="px-2 py-1 text-sm">{item.brand || '-'}</TableCell>}
                                              {showItemColor && <TableCell className="px-2 py-1 text-sm">{item.color || '-'}</TableCell>}
                                              {showItemStyle && <TableCell className="px-2 py-1 text-sm">{item.style || '-'}</TableCell>}
                                              <TableCell className="px-2 py-1 text-sm">{item.size}</TableCell>
                                              {showItemBarcode && <TableCell className="px-2 py-1 text-xs font-mono">{item.barcode || '-'}</TableCell>}
                                              {showItemHsn && <TableCell className="px-2 py-1 text-xs">{item.hsn_code || '-'}</TableCell>}
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums">{item.quantity}</TableCell>
                                              {showItemMrp && <TableCell className="px-2 py-1 text-sm text-right tabular-nums">₹{Math.round(item.mrp).toLocaleString('en-IN')}</TableCell>}
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums">₹{Math.round(item.unit_price).toLocaleString('en-IN')}</TableCell>
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums">{item.discount_percent}%</TableCell>
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums">{item.gst_percent}%</TableCell>
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums font-semibold">₹{Math.round(item.line_total).toLocaleString('en-IN')}</TableCell>
                                            </TableRow>
                                          ))}
                                          {(saleReturns[sale.sale_number] || []).flatMap((ret: any) =>
                                            Array.isArray(ret.sale_return_items)
                                              ? ret.sale_return_items.map((ri: any) => ({ ...ri, _retNum: ret.return_number }))
                                              : []
                                          ).map((ri: any, idx: number) => (
                                            <TableRow key={`sr-${ri.id || idx}`} className="h-9 bg-red-50/40 dark:bg-red-950/20">
                                              <TableCell className="px-2 py-1 text-sm">
                                                <div className="flex items-center gap-1.5">
                                                  <Badge variant="destructive" className="text-[10px] px-1 py-0 font-bold">SR</Badge>
                                                  <span className="text-red-700 dark:text-red-400">{ri.product_name}</span>
                                                </div>
                                              </TableCell>
                                              {showItemBrand && <TableCell className="px-2 py-1 text-sm text-red-700 dark:text-red-400">-</TableCell>}
                                              {showItemColor && <TableCell className="px-2 py-1 text-sm text-red-700 dark:text-red-400">{ri.color || '-'}</TableCell>}
                                              {showItemStyle && <TableCell className="px-2 py-1 text-sm text-red-700 dark:text-red-400">-</TableCell>}
                                              <TableCell className="px-2 py-1 text-sm text-red-700 dark:text-red-400">{ri.size || '-'}</TableCell>
                                              {showItemBarcode && <TableCell className="px-2 py-1 text-xs font-mono text-red-700 dark:text-red-400">{ri.barcode || '-'}</TableCell>}
                                              {showItemHsn && <TableCell className="px-2 py-1 text-xs text-red-700 dark:text-red-400">-</TableCell>}
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums text-red-700 dark:text-red-400">-{ri.quantity}</TableCell>
                                              {showItemMrp && <TableCell className="px-2 py-1 text-sm text-right tabular-nums text-red-700 dark:text-red-400">-</TableCell>}
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums text-red-700 dark:text-red-400">₹{Math.round(ri.unit_price).toLocaleString('en-IN')}</TableCell>
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums text-red-700 dark:text-red-400">-</TableCell>
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums text-red-700 dark:text-red-400">{ri.gst_percent || 0}%</TableCell>
                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums font-semibold text-red-600">-₹{Math.round(ri.line_total).toLocaleString('en-IN')}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>

                                  {saleReturns[sale.sale_number] && saleReturns[sale.sale_number].length > 0 && (
                                    <div>
                                      <h4 className="font-semibold text-[13px] mb-1.5 text-red-600">Linked Sale Returns:</h4>
                                      <div className="rounded-md border border-red-200 bg-red-50/50">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className="h-9 bg-muted/50">
                                              <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Return No</TableHead>
                                              <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Return Date</TableHead>
                                              <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Customer</TableHead>
                                              <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold text-right">Return Amt</TableHead>
                                              <TableHead className="px-2 py-1 text-[12px] uppercase tracking-wider font-semibold">Notes</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {saleReturns[sale.sale_number].map((ret: any) => (
                                              <React.Fragment key={ret.id}>
                                              <TableRow className="h-9">
                                                <TableCell className="px-2 py-1">
                                                  <Badge variant="destructive" className="text-xs px-1.5 py-0">{ret.return_number || "-"}</Badge>
                                                </TableCell>
                                                <TableCell className="px-2 py-1 text-sm">{new Date(ret.return_date).toLocaleDateString()}</TableCell>
                                                <TableCell className="px-2 py-1 text-sm">{ret.customer_name?.toUpperCase()}</TableCell>
                                                <TableCell className="px-2 py-1 text-sm text-right font-medium text-red-600 tabular-nums">
                                                  ₹{Math.round(ret.net_amount).toLocaleString('en-IN')}
                                                </TableCell>
                                                <TableCell className="px-2 py-1 text-sm text-muted-foreground">
                                                  {ret.notes || "-"}
                                                </TableCell>
                                              </TableRow>
                                              {Array.isArray(ret.sale_return_items) && ret.sale_return_items.length > 0 && (
                                                <TableRow>
                                                  <TableCell colSpan={5} className="p-2 bg-red-50/30">
                                                    <div className="rounded border border-red-200 bg-background">
                                                      <Table>
                                                        <TableHeader>
                                                          <TableRow className="h-8 bg-muted/40">
                                                            <TableHead className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold">Product</TableHead>
                                                            <TableHead className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold">Size</TableHead>
                                                            <TableHead className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold">Color</TableHead>
                                                            <TableHead className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold">Barcode</TableHead>
                                                            <TableHead className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold text-right">Qty</TableHead>
                                                            <TableHead className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold text-right">Rate</TableHead>
                                                            <TableHead className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold text-right">GST%</TableHead>
                                                            <TableHead className="px-2 py-1 text-[11px] uppercase tracking-wider font-semibold text-right">Total</TableHead>
                                                          </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                          {ret.sale_return_items.map((ri: any) => (
                                                            <TableRow key={ri.id} className="h-8">
                                                              <TableCell className="px-2 py-1 text-sm">{ri.product_name}</TableCell>
                                                              <TableCell className="px-2 py-1 text-sm">{ri.size || '-'}</TableCell>
                                                              <TableCell className="px-2 py-1 text-sm">{ri.color || '-'}</TableCell>
                                                              <TableCell className="px-2 py-1 text-xs font-mono">{ri.barcode || '-'}</TableCell>
                                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums">{ri.quantity}</TableCell>
                                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums">₹{Math.round(ri.unit_price).toLocaleString('en-IN')}</TableCell>
                                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums">{ri.gst_percent}%</TableCell>
                                                              <TableCell className="px-2 py-1 text-sm text-right tabular-nums font-semibold text-red-600">₹{Math.round(ri.line_total).toLocaleString('en-IN')}</TableCell>
                                                            </TableRow>
                                                          ))}
                                                        </TableBody>
                                                      </Table>
                                                    </div>
                                                  </TableCell>
                                                </TableRow>
                                              )}
                                              </React.Fragment>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  )}

                                  {/* E-Invoice Actions */}
                                  {isEInvoiceEnabled && sale.customer_id && (
                                    <div className="flex items-center gap-2 pt-2 border-t">
                                      <span className="text-xs font-semibold text-muted-foreground mr-1">E-Invoice:</span>
                                      {sale.irn ? (
                                        <>
                                          <Badge className="bg-green-500 text-white text-xs">
                                            <FileCheck className="h-3 w-3 mr-1" />
                                            IRN Generated
                                          </Badge>
                                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={sale.irn}>
                                            {sale.irn.substring(0, 25)}...
                                          </span>
                                          {sale.ack_no && (
                                            <span className="text-xs text-green-600 font-medium">Ack No: {sale.ack_no}</span>
                                          )}
                                          {sale.einvoice_status !== 'cancelled' && sale.status !== 'cancelled' && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-7 text-xs text-destructive border-destructive/30"
                                              onClick={() => handleCancelIRN(sale)}
                                              disabled={isCancellingIRN === sale.id}
                                            >
                                              {isCancellingIRN === sale.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                                              Cancel IRN
                                            </Button>
                                          )}
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => handleDownloadEInvoicePDF(sale)}
                                            disabled={isDownloadingEInvoice === sale.id}
                                          >
                                            {isDownloadingEInvoice === sale.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileDown className="h-3 w-3 mr-1" />}
                                            Download E-Invoice
                                          </Button>
                                          {sale.einvoice_status === 'cancelled' && (
                                            <Badge variant="destructive" className="text-xs">IRN Cancelled</Badge>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          {sale.customers?.gst_number ? (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-7 text-xs"
                                              onClick={() => handleGenerateEInvoice(sale)}
                                              disabled={isGeneratingEInvoice === sale.id}
                                            >
                                              {isGeneratingEInvoice === sale.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileCheck className="h-3 w-3 mr-1" />}
                                              Generate E-Invoice
                                            </Button>
                                          ) : (
                                            <span className="text-xs text-muted-foreground italic">Customer GSTIN required for E-Invoice</span>
                                          )}
                                          {sale.einvoice_error && (
                                            sale.einvoice_error.toLowerCase().includes('success') ? (
                                              <span className="text-xs text-green-600 font-medium">✓ {sale.einvoice_error}</span>
                                            ) : (
                                              <span className="text-xs text-destructive">Last error: {sale.einvoice_error}</span>
                                            )
                                          )}
                                        </>
                                      )}
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
              customerAddress={previewSale.customer_address || previewCustomerData?.address || ''}
              customerMobile={previewSale.customer_phone || ''}
              customerGSTIN={previewCustomerData?.gst_number || ''}
              customerTransportDetails={previewCustomerData?.transport_details || ''}
              template={posInvoiceTemplate}
              items={(saleItems[previewSale.id] || []).map((item, index) => ({
                sr: index + 1,
                particulars: item.product_name,
                size: item.size,
                barcode: item.barcode || '',
                hsn: item.hsn_code || '',
                sp: item.mrp,
                mrp: item.mrp,
                qty: item.quantity,
                rate: item.unit_price,
                total: item.line_total,
                gstPercent: item.gst_percent || 0,
              }))}
              subTotal={previewSale.gross_amount}
              discount={previewSale.discount_amount + previewSale.flat_discount_amount}
              saleReturnAdjust={previewSale.sale_return_adjust || 0}
              grandTotal={previewSale.net_amount}
              roundOff={previewSale.round_off || 0}
              cashPaid={previewSale.payment_method === 'cash' ? previewSale.net_amount : 0}
              upiPaid={previewSale.payment_method === 'upi' ? previewSale.net_amount : 0}
              paymentMethod={previewSale.payment_method}
              cashAmount={previewSale.cash_amount}
              cardAmount={previewSale.card_amount}
              upiAmount={previewSale.upi_amount}
              creditAmount={previewSale.credit_amount}
              paidAmount={previewSale.paid_amount}
              salesman={previewSale.salesman || ''}
              notes={previewSale.notes || ''}
              financerDetails={previewFinancerDetails}
            />
          )}
        />
      )}

      <AlertDialog open={!!saleToDelete} onOpenChange={() => { setSaleToDelete(null); setItemCountToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sale</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p>Are you sure you want to delete sale <strong>{saleToDelete?.sale_number}</strong>?</p>
                {itemCountToDelete !== null && (
                  <p>This will reverse <strong>{itemCountToDelete} stock movement{itemCountToDelete !== 1 ? 's' : ''}</strong> across {itemCountToDelete} line item{itemCountToDelete !== 1 ? 's' : ''}.</p>
                )}
                <p className="text-destructive font-medium">This action cannot be undone.</p>
              </div>
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
            <AlertDialogDescription asChild>
              <div className="space-y-1">
                <p>Are you sure you want to delete <strong>{selectedSales.size}</strong> selected sale(s)? Stock quantities will be restored for all items.</p>
                {selectedSales.size >= 5 && (
                  <p className="text-destructive font-medium">⚠️ High Impact: Deleting {selectedSales.size} sales will reverse stock for many products.</p>
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

      <AlertDialog open={showBulkCancelDialog} onOpenChange={setShowBulkCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {selectedSales.size} Sale(s)</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Are you sure you want to cancel <strong>{selectedSales.size}</strong> selected sale(s)? Stock quantities will be restored for all items.</p>
                <p className="text-orange-600 font-medium">Cancelled bills remain in records for audit but are excluded from sales totals.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="bulkCancelReason" className="text-sm font-medium">Reason (optional)</Label>
            <Textarea
              id="bulkCancelReason"
              value={bulkCancelReason}
              onChange={(e) => setBulkCancelReason(e.target.value)}
              placeholder="Enter reason for cancellation..."
              className="mt-1"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkCancelling}>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkCancel}
              className="bg-orange-600 hover:bg-orange-700"
              disabled={isBulkCancelling}
            >
              {isBulkCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Cancelling...
                </>
              ) : (
                'Cancel All'
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
        opacity: 0, 
        pointerEvents: 'none',
        zIndex: -1,
        overflow: 'visible'
      }}>
        {printData && (
          <InvoiceWrapper
            ref={invoicePrintRef}
            billNo={printData.billNo}
            date={printData.date}
            customerName={printData.customerName}
            customerAddress={printData.customerAddress}
            customerMobile={printData.customerMobile}
            customerGSTIN={printData.customerGSTIN || ''}
            customerTransportDetails={printData.customerTransportDetails || ''}
            items={printData.items}
            subTotal={printData.subTotal}
            discount={printData.discount}
            saleReturnAdjust={printData.saleReturnAdjust}
            grandTotal={printData.grandTotal}
            roundOff={printData.roundOff}
            cashPaid={printData.cashPaid}
            upiPaid={printData.upiPaid}
            paymentMethod={printData.paymentMethod}
            cashAmount={printData.cashAmount}
            cardAmount={printData.cardAmount}
            upiAmount={printData.upiAmount}
            creditAmount={printData.creditAmount}
            paidAmount={printData.paidAmount}
            previousBalance={printData.previousBalance}
            salesman={printData.salesman || ''}
            notes={printData.notes || ''}
            financerDetails={printData.financerDetails || null}
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
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-medium">{selectedSaleForPayment?.customer_name?.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice Amount:</span>
                <span className="font-medium">₹{Math.round(selectedSaleForPayment?.net_amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already Paid:</span>
                <span className="font-medium">₹{Math.round(selectedSaleForPayment?.paid_amount || 0).toLocaleString('en-IN')}</span>
              </div>
              {(selectedSaleForPayment?.sale_return_adjust || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CN Adjusted:</span>
                  <span className="font-medium">₹{Math.round(selectedSaleForPayment.sale_return_adjust).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Pending:</span>
                <span className={((selectedSaleForPayment?.net_amount || 0) - (selectedSaleForPayment?.paid_amount || 0) - (selectedSaleForPayment?.sale_return_adjust || 0)) < 0 ? "text-emerald-600" : "text-destructive"}>
                  ₹{Math.round((selectedSaleForPayment?.net_amount || 0) - (selectedSaleForPayment?.paid_amount || 0) - (selectedSaleForPayment?.sale_return_adjust || 0)).toLocaleString('en-IN')}
                </span>
              </div>
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
                  {advanceBalance > 0 && (
                    <SelectItem value="advance">
                      Advance (₹{Math.round(advanceBalance).toLocaleString('en-IN')})
                    </SelectItem>
                  )}
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

      {/* Hidden E-Invoice Print Component for PDF Generation */}
      {eInvoiceToPrint && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none', zIndex: -9999 }}>
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
    </div>
  );
};

export default POSDashboard;
