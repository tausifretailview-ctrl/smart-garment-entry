import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

import { Search, Edit, ChevronDown, ChevronUp, Trash2, Loader2, ClipboardList, ArrowRight, Plus, CheckCircle, AlertTriangle, Printer, Clock, Package, IndianRupee, MessageCircle, CalendarIcon } from "lucide-react";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { ListTableSkeleton } from "@/components/skeletons/ListPageSkeleton";
import { useQuietRefreshActive } from "@/components/QuietRefreshBar";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { format } from "date-fns";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useReactToPrint } from "@/hooks/useGuardedReactToPrint";
import { SaleOrderPrint } from "@/components/SaleOrderPrint";
import { ThermalPrint80mm } from "@/components/ThermalPrint80mm";
import { INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS } from "@/utils/thermalReceiptPrintDocument";
import { waitForPrintReady } from "@/utils/printReady";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { Check, FileText, X } from "lucide-react";
import { useDraftSave } from "@/hooks/useDraftSave";
import { formatDistanceToNow } from "date-fns";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import { isDashboardFilterRestoring, useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";
import {
  fetchSaleOrderCustomerOptions,
  fetchSaleOrderDashboardStats,
  fetchSaleOrderLineItems,
  fetchSaleOrderListPage,
  fetchSaleOrderWithItems,
  SALE_ORDER_LIST_PAGE_SIZE,
  sumSaleOrderItemQtys,
  type SaleOrderListFilters,
} from "@/utils/saleOrderListQueries";
import {
  isSaleOrderDashboardThisMonthRange,
  resolveSaleOrderDashboardDates,
  SALE_ORDER_DASHBOARD_PERIOD_CUSTOM,
  SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH,
  saleOrderDashboardThisMonthRange,
  type SaleOrderDashboardPeriodFilter,
} from "@/utils/saleOrderDashboardDates";
import { sizeMatrixKey } from "@/utils/sizeSort";
import {
  aggregateArticleStock,
  articleCodeKey,
  articleSizeStockList,
} from "@/utils/sizeWiseStockLookup";

interface ConversionItem {
  id: string;
  product_name: string;
  size: string;
  order_qty: number;
  pending_qty: number;
  stock_qty: number;
  /** Total on-hand across all variant rows of same product+colour+size (multiple barcodes/batches). */
  total_stock_qty?: number;
  size_stock?: { size: string; qty: number }[];
  convert_qty: number;
  selected: boolean;
  variant_id: string;
  product_id: string;
  unit_price: number;
  mrp: number;
  discount_percent: number;
  gst_percent: number;
  barcode: string;
  color?: string;
  brand?: string | null;
  style?: string | null;
  uom?: string;
  hsn_code?: string;
}

export default function SaleOrderDashboard() {
  const { toast } = useToast();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();

  const isDesktop = useIsDesktop();
  const rowContextMenu = useContextMenu<any>();

  const getOrderContextMenuItems = (order: any): ContextMenuItem[] => [
    {
      label: "Print",
      icon: Printer,
      onClick: () => {
        void handlePrintOrder(order);
      },
    },
    {
      label: "Print Available Stock",
      icon: Package,
      onClick: () => {
        void handlePrintAvailableStock(order);
      },
      hidden: order.status === "confirmed",
    },
    {
      label: "Edit",
      icon: Edit,
      onClick: () => {
        void handleEditOrder(order);
      },
    },
    {
      label: "Convert to Sale Bill",
      icon: ArrowRight,
      onClick: () => handleOpenConversion(order),
      hidden: order.status === "confirmed",
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Delete",
      icon: Trash2,
      onClick: () => setOrderToDelete(order),
      destructive: true,
    },
  ];

  const handleRowContextMenu = (e: React.MouseEvent, order: any) => {
    if (!isDesktop) return;
    rowContextMenu.openMenu(e, order);
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [orderToDelete, setOrderToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const queryClient = useQueryClient();
  const [expandedLineItems, setExpandedLineItems] = useState<Record<string, any[]>>({});
  const [expandedLoadingIds, setExpandedLoadingIds] = useState<Set<string>>(new Set());
  const [rowActionLoadingId, setRowActionLoadingId] = useState<string | null>(null);
  
  // Conversion dialog state
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [conversionLoading, setConversionLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [conversionItems, setConversionItems] = useState<ConversionItem[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [orderToPrint, setOrderToPrint] = useState<{
    order: any;
    mode: "order" | "available-stock";
    conversionItems?: ConversionItem[];
    printedAt?: Date;
  } | null>(null);
  const { formatSaleOrderMessage } = useWhatsAppTemplates();
  const [fromDate, setFromDate] = useState<Date>(() => saleOrderDashboardThisMonthRange().fromDate);
  const [toDate, setToDate] = useState<Date>(() => saleOrderDashboardThisMonthRange().toDate);
  const [periodFilter, setPeriodFilter] = useState<SaleOrderDashboardPeriodFilter>(
    SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH,
  );

  const saleOrderFilterSnapshot = useMemo(
    () => ({
      searchQuery,
      statusFilter,
      customerFilter,
      fromDate,
      toDate,
      periodFilter,
      currentPage,
    }),
    [searchQuery, statusFilter, customerFilter, fromDate, toDate, periodFilter, currentPage],
  );

  const { filtersReady } = useDashboardFilterPersistence(
    "sale-order-dashboard",
    currentOrganization?.id,
    saleOrderFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", setSearchQuery],
          ["statusFilter", setStatusFilter],
          ["customerFilter", setCustomerFilter],
        ],
        numbers: [["currentPage", setCurrentPage]],
      });
      const restoredDates = resolveSaleOrderDashboardDates(saved);
      setFromDate(restoredDates.fromDate);
      setToDate(restoredDates.toDate);
      setPeriodFilter(restoredDates.periodFilter);
    },
  );

  const applyThisMonthFilter = useCallback(() => {
    const { fromDate: from, toDate: to } = saleOrderDashboardThisMonthRange();
    setFromDate(from);
    setToDate(to);
    setPeriodFilter(SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH);
  }, []);

  const onFromDateSelect = useCallback((next: Date | undefined) => {
    if (!next) return;
    setFromDate(next);
    setPeriodFilter(
      isSaleOrderDashboardThisMonthRange(next, toDate)
        ? SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH
        : SALE_ORDER_DASHBOARD_PERIOD_CUSTOM,
    );
  }, [toDate]);

  const onToDateSelect = useCallback((next: Date | undefined) => {
    if (!next) return;
    setToDate(next);
    setPeriodFilter(
      isSaleOrderDashboardThisMonthRange(fromDate, next)
        ? SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH
        : SALE_ORDER_DASHBOARD_PERIOD_CUSTOM,
    );
  }, [fromDate]);

  const [orderToAccept, setOrderToAccept] = useState<any>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  
  // Draft save hook
  const { hasDraft, draftData, deleteDraft, lastSaved } = useDraftSave('sale_order');
  const openCustomerAccount = useOpenCustomerAccount();

  const calculateLineTotal = (item: ConversionItem, taxType: string) => {
    const gross = (item.unit_price || 0) * (item.convert_qty || 0);
    const discountPercent = item.discount_percent || 0;
    const discAmount = discountPercent > 0
      ? (gross * discountPercent) / 100
      : 0;
    const afterDisc = gross - discAmount;

    if (taxType === "exclusive") {
      return afterDisc + (afterDisc * (item.gst_percent || 0) / 100);
    }
    return afterDisc;
  };

  // Fetch settings for print (centralized, cached 5min)
  const { data: settings } = useSettings();

  const listFilters = useMemo<SaleOrderListFilters>(
    () => ({
      searchQuery,
      statusFilter,
      customerFilter,
      fromDate,
      toDate,
    }),
    [searchQuery, statusFilter, customerFilter, fromDate, toDate],
  );

  useEffect(() => {
    if (isDashboardFilterRestoring()) return;
    setCurrentPage(1);
  }, [searchQuery, statusFilter, customerFilter, fromDate, toDate]);

  const invalidateSaleOrderQueries = useCallback(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    void queryClient.invalidateQueries({ queryKey: ["sale-orders-list", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["sale-orders-stats", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["sale-order-customers", orgId] });
  }, [currentOrganization?.id, queryClient]);

  const {
    data: listPageData,
    isLoading,
  } = useQuery({
    queryKey: ["sale-orders-list", currentOrganization?.id, listFilters, currentPage],
    queryFn: () =>
      fetchSaleOrderListPage(
        currentOrganization!.id,
        listFilters,
        currentPage,
        SALE_ORDER_LIST_PAGE_SIZE,
      ),
    enabled: !!currentOrganization?.id && filtersReady,
    placeholderData: (previous) => previous,
  });

  const listQuietRefreshing = useQuietRefreshActive([
    "sale-orders-list",
    currentOrganization?.id,
    listFilters,
    currentPage,
  ]);

  const {
    data: statsData,
    isLoading: statsLoading,
    isError: statsError,
    error: statsQueryError,
  } = useQuery({
    queryKey: ["sale-orders-stats", currentOrganization?.id],
    queryFn: () => fetchSaleOrderDashboardStats(currentOrganization!.id),
    enabled: !!currentOrganization?.id,
    staleTime: 60_000,
    retry: (failureCount, error) => {
      const code = (error as { code?: string })?.code;
      if (code === "PGRST202" || code === "42883") return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (!statsError || !statsQueryError) return;
    const code = (statsQueryError as { code?: string })?.code;
    const missingRpc = code === "PGRST202" || code === "42883";
    toast({
      title: "Dashboard stats unavailable",
      description: missingRpc
        ? "Run docs/deploy-get_sale_order_dashboard_stats.sql in Supabase SQL Editor, then refresh."
        : statsQueryError instanceof Error
          ? statsQueryError.message
          : "Could not load sale order summary.",
      variant: "destructive",
    });
  }, [statsError, statsQueryError, toast]);

  const { data: uniqueCustomers = [] } = useQuery({
    queryKey: ["sale-order-customers", currentOrganization?.id],
    queryFn: () => fetchSaleOrderCustomerOptions(currentOrganization!.id),
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60_000,
  });

  const paginatedOrders = listPageData?.rows ?? [];
  const totalCount = listPageData?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / SALE_ORDER_LIST_PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleWhatsAppShare = async (order: any) => {
    if (!order.customer_phone) {
      toast({ title: "Error", description: "Customer phone number not available", variant: "destructive" });
      return;
    }

    setRowActionLoadingId(order.id);
    try {
      const fullOrder = await fetchSaleOrderWithItems(order.id);
      if (!fullOrder) throw new Error("Order not found");

    // Build itemized list with color
    const itemLines = (fullOrder.sale_order_items || [])
      .filter((item: any) => !item.deleted_at)
      .map((item: any) => {
        const colorPart = item.color ? ` - ${item.color}` : '';
        return `• ${item.product_name}${colorPart} (${item.size}) x ${item.order_qty} = ₹${Number(item.line_total).toLocaleString('en-IN')}`;
      })
      .join('\n');

    const message = formatSaleOrderMessage({
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      order_date: order.order_date,
      net_amount: order.net_amount,
      status: order.status,
      expected_delivery_date: order.expected_delivery_date,
    }, itemLines);

    // Copy to clipboard with improved UX
    const isMac = navigator.platform?.toUpperCase().indexOf("MAC") >= 0;
    const shortcut = isMac ? "Cmd+V" : "Ctrl+V";
    
    navigator.clipboard.writeText(message).then(() => {
      toast({ title: "WhatsApp", description: `✓ Message copied! Paste with ${shortcut} if it doesn't auto-fill` });
    });

    // Open WhatsApp
    const phone = order.customer_phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
    
    setTimeout(() => {
      window.open(whatsappUrl, '_blank');
    }, 300);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not load order items", variant: "destructive" });
    } finally {
      setRowActionLoadingId(null);
    }
  };

  // Fetch current stock for conversion
  const fetchStockForConversion = async (order: any) => {
    const lineItems = (order.sale_order_items || []).filter(
      (item: any) => !item.deleted_at,
    );
    const variantIds: string[] = [
      ...new Set(
        (lineItems as any[])
          .map((item: any) => item.variant_id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
      ),
    ];

    let variantMap = new Map<string, { id: string; color?: string | null; stock_qty?: number | null }>();
    if (variantIds.length > 0 && currentOrganization?.id) {
      const { data: variants, error } = await supabase
        .from("product_variants")
        .select("id, color, stock_qty")
        .eq("organization_id", currentOrganization.id)
        .in("id", variantIds);
      if (error) throw error;
      variantMap = new Map(variants?.map((v) => [v.id, v]) || []);
    }

    // Same product+colour+size can exist as several variant rows (separate barcodes /
    // purchase batches). The printed "stock" must be the total on hand, not just the
    // one row the order line happens to be bound to.
    const productIds: string[] = [
      ...new Set(
        (lineItems as any[])
          .map((item: any) => item.product_id)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    // Size-wise Stock Report groups name + brand + colour + style and sums stock_qty
    // across barcodes / re-created product rows. The pick list must use that same map.
    type ProductMeta = { product_name: string; brand: string; style: string };
    const productMeta = new Map<string, ProductMeta>();
    let sizeWiseByGroup = new Map<string, Map<string, number>>();
    if (productIds.length > 0 && currentOrganization?.id) {
      const { data: baseProducts, error: baseErr } = await supabase
        .from("products")
        .select("id, product_name, brand, style")
        .in("id", productIds);
      if (baseErr) throw baseErr;
      for (const p of baseProducts ?? []) {
        productMeta.set(p.id, {
          product_name: p.product_name || "",
          brand: p.brand || "",
          style: p.style || "",
        });
      }
      const names = [...new Set((baseProducts ?? []).map((p) => p.product_name).filter(Boolean))] as string[];

      // Same article can live on several product rows with different styles or a
      // suffixed name (PUL228 / PUL228-PUL-RLX-LD). Match on article code + brand only.
      const familyKey = (p: { product_name?: string | null; brand?: string | null }) =>
        `${articleCodeKey(p.product_name)}|${(p.brand || "").trim().toUpperCase()}`;
      const orderedFamilies = new Set((baseProducts ?? []).map(familyKey));

      let expandedIds = productIds;
      const codes = [...new Set(names.map((n) => articleCodeKey(n)).filter(Boolean))];
      if (codes.length > 0) {
        const { data: sameName, error: nameErr } = await supabase
          .from("products")
          .select("id, product_name, brand, style")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .or(codes.map((c) => `product_name.ilike.${c}%`).join(","));
        if (nameErr) throw nameErr;
        const siblingsOfFamily = (sameName ?? []).filter((p) => orderedFamilies.has(familyKey(p)));
        for (const p of siblingsOfFamily) {
          productMeta.set(p.id, {
            product_name: p.product_name || "",
            brand: p.brand || "",
            style: p.style || "",
          });
        }
        expandedIds = [...new Set([...productIds, ...siblingsOfFamily.map((p) => p.id)])];
      }

      const { data: siblings, error: sibErr } = await supabase
        .from("product_variants")
        .select("product_id, color, size, stock_qty")
        .eq("organization_id", currentOrganization.id)
        .in("product_id", expandedIds)
        .is("deleted_at", null)
        .eq("active", true);
      if (sibErr) throw sibErr;
      sizeWiseByGroup = aggregateArticleStock(
        (siblings ?? []).map((v) => {
          const meta = productMeta.get(v.product_id);
          return {
            product_name: meta?.product_name,
            brand: meta?.brand,
            color: v.color,
            style: meta?.style,
            size: v.size,
            stock_qty: v.stock_qty,
          };
        }),
      );
    }

    const items: ConversionItem[] = lineItems
      .filter((item: any) => Number(item.pending_qty) > 0)
      .map((item: any) => {
        const variantMeta = item.variant_id ? variantMap.get(item.variant_id) : undefined;
        const meta = productMeta.get(item.product_id);
        const article = meta?.product_name || item.product_name || "";
        const brand = meta?.brand || "";
        const style = meta?.style || "";
        const color = item.color || variantMeta?.color || "";
        const sizeStock = articleSizeStockList(sizeWiseByGroup, article, brand, color);
        const sizeKey = sizeMatrixKey(item.size);
        const groupOnHand =
          sizeStock.find((s) => s.size === sizeKey)?.qty ?? 0;
        // Prefer family on-hand (same article/brand/colour across duplicate masters
        // and barcodes). Bound variant alone is often 0 when stock was received on
        // a sibling product row — that produced blank pick-list dashes.
        const boundStockQty = Number(variantMeta?.stock_qty) || 0;
        const totalStockQty = Math.max(boundStockQty, groupOnHand);
        const pendingQty = Number(item.pending_qty) || 0;
        const maxConvert = Math.min(pendingQty, totalStockQty);
        return {
          id: item.id,
          product_name: item.product_name,
          size: item.size,
          order_qty: Number(item.order_qty) || 0,
          pending_qty: pendingQty,
          stock_qty: totalStockQty,
          total_stock_qty: totalStockQty,
          size_stock: sizeStock,
          convert_qty: maxConvert,
          selected: maxConvert > 0,
          variant_id: item.variant_id,
          product_id: item.product_id,
          unit_price: item.unit_price,
          mrp: item.mrp,
          discount_percent: item.discount_percent,
          gst_percent: item.gst_percent,
          barcode: item.barcode,
          color: color || null,
          brand,
          style,
          uom: item.uom || "NOS",
          hsn_code: item.hsn_code,
        };
      });

    return items;
  };

  const handleOpenConversion = async (order: any) => {
    setRowActionLoadingId(order.id);
    setSelectedOrder(order);
    setConversionItems([]);
    setConversionLoading(true);
    setShowConversionDialog(true);
    try {
      const fullOrder = await fetchSaleOrderWithItems(order.id);
      if (!fullOrder) throw new Error("Order not found");
      const items = await fetchStockForConversion(fullOrder);
      setConversionItems(items);
      setSelectedOrder(fullOrder);
    } catch (error: any) {
      setShowConversionDialog(false);
      toast({ title: "Error", description: error.message || "Could not load order", variant: "destructive" });
    } finally {
      setConversionLoading(false);
      setRowActionLoadingId(null);
    }
  };

  const handleConvertToSaleBill = async () => {
    if (!selectedOrder) return;

    const itemsToConvert = conversionItems.filter(item => item.selected && item.convert_qty > 0);
    if (itemsToConvert.length === 0) {
      toast({ title: "Error", description: "No items selected for conversion", variant: "destructive" });
      return;
    }

    setIsConverting(true);
    try {
      // Generate sale number
      const { data: saleNumber } = await supabase.rpc('generate_sale_number_atomic', {
        p_organization_id: currentOrganization?.id
      });

      // Calculate totals
      const grossAmount = itemsToConvert.reduce((sum, item) => sum + (item.unit_price * item.convert_qty), 0);
      const discountAmount = itemsToConvert.reduce((sum, item) => {
        const lineAmount = item.unit_price * item.convert_qty;
        return sum + (lineAmount * item.discount_percent / 100);
      }, 0);
      const gstAmount = selectedOrder.tax_type === "exclusive" 
        ? itemsToConvert.reduce((sum, item) => {
            const lineAmount = item.unit_price * item.convert_qty;
            const lineDiscount = lineAmount * item.discount_percent / 100;
            return sum + ((lineAmount - lineDiscount) * item.gst_percent / 100);
          }, 0)
        : 0;
      const netAmount = grossAmount - discountAmount + gstAmount;

      // Create sale record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert([{
          organization_id: currentOrganization?.id,
          sale_number: saleNumber,
          sale_date: new Date().toISOString(),
          sale_type: 'invoice',
          customer_id: selectedOrder.customer_id,
          customer_name: selectedOrder.customer_name,
          customer_phone: selectedOrder.customer_phone,
          customer_email: selectedOrder.customer_email,
          customer_address: selectedOrder.customer_address,
          gross_amount: grossAmount,
          discount_amount: discountAmount,
          net_amount: netAmount,
          payment_method: 'pay_later',
          payment_status: 'pending',
          notes: `Converted from Sale Order ${selectedOrder.order_number}`,
          terms_conditions: selectedOrder.terms_conditions,
          shipping_address: selectedOrder.shipping_address,
        }])
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItems = itemsToConvert.map(item => ({
        sale_id: sale.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        size: item.size,
        color: item.color || null,
        barcode: item.barcode || null,
        quantity: item.convert_qty,
        unit_price: item.unit_price,
        mrp: item.mrp || 0,
        discount_percent: item.discount_percent || 0,
        gst_percent: item.gst_percent || 0,
        line_total: calculateLineTotal(item, selectedOrder.tax_type),
        hsn_code: item.hsn_code || null,
      }));

      const validItems = saleItems.filter(item => (item.quantity || 0) > 0);
      if (validItems.length === 0) {
        toast({ title: "Error", description: "No items with quantity > 0 to convert.", variant: "destructive" });
        return;
      }

      const { error: itemsError } = await supabase.from('sale_items').insert(validItems);
      if (itemsError) throw itemsError;

      // Update sale order items fulfilled/pending qty
      for (const item of itemsToConvert) {
        const { error: updateError } = await supabase
          .from('sale_order_items')
          .update({
            fulfilled_qty: item.order_qty - item.pending_qty + item.convert_qty,
            pending_qty: item.pending_qty - item.convert_qty,
          })
          .eq('id', item.id);
        if (updateError) throw updateError;
      }

      // Update sale order status
      const allFulfilled = conversionItems.every(item => 
        item.selected ? item.pending_qty - item.convert_qty === 0 : item.pending_qty === 0
      );
      const newStatus = allFulfilled ? 'confirmed' : 'partial';
      
      await supabase
        .from('sale_orders')
        .update({ status: newStatus })
        .eq('id', selectedOrder.id);

      toast({ title: "Success", description: `Sale Bill ${saleNumber} created from order` });
      setShowConversionDialog(false);
      invalidateSaleOrderQueries();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsConverting(false);
    }
  };

  const { softDelete } = useSoftDelete();

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;

    setIsDeleting(true);
    try {
      const success = await softDelete("sale_orders", orderToDelete.id);
      if (!success) throw new Error("Failed to delete sale order");

      toast({ title: "Success", description: `Sale Order ${orderToDelete.order_number} moved to recycle bin` });
      invalidateSaleOrderQueries();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setOrderToDelete(null);
    }
  };

  const handleAcceptOrder = async () => {
    if (!orderToAccept) return;

    setIsAccepting(true);
    try {
      const { error } = await supabase
        .from('sale_orders')
        .update({ customer_accepted: true })
        .eq('id', orderToAccept.id);

      if (error) throw error;

      toast({ title: "Success", description: `Sale Order ${orderToAccept.order_number} accepted` });
      invalidateSaleOrderQueries();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAccepting(false);
      setOrderToAccept(null);
    }
  };

  const toggleExpanded = async (id: string) => {
    if (expandedRows.has(id)) {
      const next = new Set(expandedRows);
      next.delete(id);
      setExpandedRows(next);
      return;
    }

    const next = new Set(expandedRows);
    next.add(id);
    setExpandedRows(next);

    if (expandedLineItems[id]) return;

    setExpandedLoadingIds((prev) => new Set(prev).add(id));
    try {
      const items = await fetchSaleOrderLineItems(id);
      setExpandedLineItems((prev) => ({ ...prev, [id]: items }));
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not load line items", variant: "destructive" });
      const rolledBack = new Set(expandedRows);
      rolledBack.delete(id);
      setExpandedRows(rolledBack);
    } finally {
      setExpandedLoadingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(id);
        return copy;
      });
    }
  };

  const handleEditOrder = async (order: any) => {
    setRowActionLoadingId(order.id);
    try {
      const fullOrder = await fetchSaleOrderWithItems(order.id);
      if (!fullOrder) throw new Error("Order not found");
      navigate("/sale-order-entry", { state: { orderData: fullOrder } });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not load order", variant: "destructive" });
    } finally {
      setRowActionLoadingId(null);
    }
  };

  const handlePrintOrder = async (order: any) => {
    setRowActionLoadingId(order.id);
    try {
      const fullOrder = await fetchSaleOrderWithItems(order.id);
      if (!fullOrder) throw new Error("Order not found");
      setOrderToPrint({ order: fullOrder, mode: "order" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not load order", variant: "destructive" });
    } finally {
      setRowActionLoadingId(null);
    }
  };

  const handlePrintAvailableStock = async (order: any) => {
    if (order.status === "confirmed") {
      toast({
        title: "Fully fulfilled",
        description: "This order has no pending lines to pick.",
        variant: "destructive",
      });
      return;
    }
    setRowActionLoadingId(order.id);
    try {
      const fullOrder = await fetchSaleOrderWithItems(order.id);
      if (!fullOrder) throw new Error("Order not found");
      // Same stock source as Convert to Sale Bill — do not query stock separately.
      const conversionItems = await fetchStockForConversion(fullOrder);
      if (conversionItems.length === 0) {
        toast({
          title: "Nothing to pick",
          description: "This order has no pending line items.",
          variant: "destructive",
        });
        return;
      }
      // Always open the pick list when pending lines exist — including Available=0
      // shortfall rows (booking list). Blocking on convert_qty>0 hid the document.
      setOrderToPrint({
        order: fullOrder,
        mode: "available-stock",
        conversionItems,
        printedAt: new Date(),
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not load available stock",
        variant: "destructive",
      });
    } finally {
      setRowActionLoadingId(null);
    }
  };

  const stats = statsData ?? {
    total: 0,
    totalValue: 0,
    pending: 0,
    partial: 0,
    confirmed: 0,
    pendingItems: 0,
    pendingValue: 0,
    conversionRate: "0",
  };

  const formatKpiValue = (value: number | string) => {
    if (statsLoading) return "…";
    return value;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string, label: string }> = {
      pending: { className: "min-w-[80px] justify-center bg-pink-400 hover:bg-pink-500 text-white", label: "Pending" },
      partial: { className: "min-w-[80px] justify-center bg-amber-500 hover:bg-amber-600 text-white", label: "Partial" },
      confirmed: { className: "min-w-[80px] justify-center bg-green-500 hover:bg-green-600 text-white", label: "Confirmed" },
      cancelled: { className: "min-w-[80px] justify-center bg-red-500 hover:bg-red-600 text-white", label: "Cancelled" },
    };
    const config = variants[status] || { className: "min-w-[80px] justify-center bg-gray-400 text-white", label: status };
    return <Badge className={config.className}>{config.label}</Badge>;
  };


  const handleCardClick = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-2 sm:px-3 md:px-4 lg:px-5 py-6 pb-24 lg:pb-6">
      <div className="w-full min-w-0 max-w-none space-y-5">

      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight leading-tight">
            Sale Order Dashboard
          </h1>
          <p className="text-slate-400 text-base mt-0.5">Manage customer orders and fulfillment</p>
        </div>
        <Button
          onClick={() => navigate('/sale-order-entry')}
          className="h-10 px-5 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all gap-2"
        >
          <Plus className="h-4 w-4" />
          New Sale Order
        </Button>
      </div>

      {hasDraft && draftData && (
        <Card className="border border-amber-400/60 bg-amber-50 rounded-lg shadow-sm">
          <CardHeader className="py-1.5 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-amber-100 dark:bg-amber-900/30 rounded-md flex items-center justify-center flex-shrink-0">
                  <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 leading-tight">
                    Unsaved Sale Order Found
                  </h3>
                  <CardDescription className="text-xs text-black dark:text-black font-bold leading-tight">
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
                      description: "The unsaved sale order has been removed",
                    });
                  }}
                  className="gap-1.5 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                >
                  <X className="h-3.5 w-3.5" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    navigate("/sale-order-entry", { state: { loadDraft: true } });
                  }}
                  className="gap-1.5 h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Edit className="h-3.5 w-3.5" />
                  Resume Draft
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 w-full">
        <Card 
          className={`cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-md rounded-xl min-w-0 ${statusFilter === 'all' ? 'ring-4 ring-white ring-offset-2 ring-offset-slate-100' : ''}`}
          onClick={() => handleCardClick('all')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardDescription className="text-base font-medium text-white/80">Total Orders</CardDescription>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-2xl font-black text-white tabular-nums">{formatKpiValue(stats.total)}</div>
            <p className="text-sm text-white/65 mt-0.5">All orders</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-md rounded-xl min-w-0 ${statusFilter === 'pending' ? 'ring-4 ring-white ring-offset-2 ring-offset-slate-100' : ''}`}
          onClick={() => handleCardClick('pending')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardDescription className="text-base font-medium text-white/80">Pending</CardDescription>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Clock className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-2xl font-black text-white tabular-nums">{formatKpiValue(stats.pending)}</div>
            <p className="text-sm text-white/65 mt-0.5">Awaiting action</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-md rounded-xl min-w-0 ${statusFilter === 'partial' ? 'ring-4 ring-white ring-offset-2 ring-offset-slate-100' : ''}`}
          onClick={() => handleCardClick('partial')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardDescription className="text-base font-medium text-white/80">Partial</CardDescription>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Package className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-2xl font-black text-white tabular-nums">{formatKpiValue(stats.partial)}</div>
            <p className="text-sm text-white/65 mt-0.5">Partially fulfilled</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-md rounded-xl min-w-0 ${statusFilter === 'confirmed' ? 'ring-4 ring-white ring-offset-2 ring-offset-slate-100' : ''}`}
          onClick={() => handleCardClick('confirmed')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardDescription className="text-base font-medium text-white/80">Confirmed</CardDescription>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-2xl font-black text-white tabular-nums">{formatKpiValue(stats.confirmed)}</div>
            <p className="text-sm text-white/65 mt-0.5">Completed</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-md rounded-xl min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardDescription className="text-base font-medium text-white/80">Pending Items</CardDescription>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-2xl font-black text-white tabular-nums">{formatKpiValue(stats.pendingItems)}</div>
            <p className="text-sm text-white/65 mt-0.5">To be fulfilled</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-[1.02] bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-md rounded-xl min-w-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardDescription className="text-base font-medium text-white/80">Pending Value</CardDescription>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <IndianRupee className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-2xl font-black text-white tabular-nums">
              {statsLoading ? "…" : `₹${stats.pendingValue.toLocaleString("en-IN")}`}
            </div>
            <p className="text-sm text-white/65 mt-0.5">Outstanding</p>
          </CardContent>
        </Card>
      </div>
      
      <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-white">
          <div className="relative flex-1 min-w-[200px] max-w-full sm:max-w-md md:max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by order no, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-10 text-base border-slate-200 bg-slate-50 focus:bg-white"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[140px] h-10 justify-start text-left font-normal text-base border-slate-200 bg-slate-50 hover:bg-white">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(fromDate, "dd/MM/yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromDate} onSelect={onFromDateSelect} initialFocus className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[140px] h-10 justify-start text-left font-normal text-base border-slate-200 bg-slate-50 hover:bg-white">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(toDate, "dd/MM/yy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={toDate} onSelect={onToDateSelect} initialFocus className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
          {periodFilter !== SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH && (
            <Button variant="ghost" size="sm" onClick={applyThisMonthFilter}>
              This Month
            </Button>
          )}
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-48 h-10 text-base border-slate-200 bg-slate-50 hover:bg-white">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {uniqueCustomers.map((customer: any) => (
                <SelectItem key={customer.id || customer.name} value={customer.id || customer.name}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-10 text-base border-slate-200 bg-slate-50 hover:bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="p-0">
        {isLoading ? (
          <ListTableSkeleton rows={8} columns={7} className="py-2" />
        ) : paginatedOrders.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            No sale orders found
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-320px)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-black hover:bg-black">
                  <TableHead className="w-10 text-white"></TableHead>
                  <TableHead className="text-white font-bold uppercase text-[13px]">Order No</TableHead>
                  <TableHead className="text-white font-bold uppercase text-[13px]">Date</TableHead>
                  <TableHead className="text-white font-bold uppercase text-[13px]">Customer</TableHead>
                  <TableHead className="text-white font-bold uppercase text-[13px]">Amount</TableHead>
                  <TableHead className="text-white font-bold uppercase text-[13px]">Status</TableHead>
                  <TableHead className="text-white font-bold uppercase text-[13px]">Accept</TableHead>
                  <TableHead className="text-white font-bold uppercase text-[13px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.map((order: any) => {
                  const { totalItems, fulfilledItems } = sumSaleOrderItemQtys(order.sale_order_items);
                  const expandedItems = expandedLineItems[order.id];
                  const isRowBusy = rowActionLoadingId === order.id;
                  
                  return (
                    <>
                      <TableRow
                        key={order.id}
                        onContextMenu={(e) => handleRowContextMenu(e, order)}
                      >
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => void toggleExpanded(order.id)}>
                            {expandedRows.has(order.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium text-[15px]">{order.order_number}</TableCell>
                        <TableCell className="text-[15px]">{format(new Date(order.order_date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-[15px]">
                          <div>
                            <button
                              className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-left"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCustomerAccount(order.customer_id, order.customer_name);
                              }}
                            >
                              {order.customer_name}
                            </button>
                          </div>
                          <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">₹{order.net_amount?.toFixed(2)}</div>
                          <div className="text-sm text-muted-foreground">{fulfilledItems}/{totalItems} items</div>
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          {order.customer_accepted ? (
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              disabled 
                              className="!bg-gray-500 hover:!bg-gray-500 !text-white !opacity-100 cursor-not-allowed"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Accepted
                            </Button>
                          ) : (
                            <Button 
                              variant="default" 
                              size="sm"
                              className="bg-blue-800 hover:bg-blue-900 text-white"
                              onClick={() => setOrderToAccept(order)}
                            >
                              Accept
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" disabled={isRowBusy} onClick={() => void handleWhatsAppShare(order)} title="WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" disabled={isRowBusy} onClick={() => void handlePrintOrder(order)} title="Print">
                              <Printer className="h-4 w-4" />
                            </Button>
                            {order.status !== "confirmed" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isRowBusy}
                                onClick={() => void handlePrintAvailableStock(order)}
                                title="Print Available Stock"
                              >
                                <Package className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" disabled={isRowBusy} onClick={() => void handleEditOrder(order)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            {order.status !== 'confirmed' && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenConversion(order)}
                                title="Convert to Sale Bill"
                              >
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => setOrderToDelete(order)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(order.id) && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/50">
                            <div className="p-4">
                              <h4 className="font-medium mb-2">Order Items</h4>
                              {expandedLoadingIds.has(order.id) ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Loading line items…
                                </div>
                              ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Color</TableHead>
                                    <TableHead>Order Qty</TableHead>
                                    <TableHead>Fulfilled</TableHead>
                                    <TableHead>Pending</TableHead>
                                    <TableHead>Price</TableHead>
                                    <TableHead>Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(expandedItems ?? []).map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell>{item.product_name}</TableCell>
                                      <TableCell>{item.size}</TableCell>
                                      <TableCell>{item.color || "—"}</TableCell>
                                      <TableCell>{item.order_qty}</TableCell>
                                      <TableCell className="text-green-600">{item.fulfilled_qty}</TableCell>
                                      <TableCell className={item.pending_qty > 0 ? "text-orange-600" : ""}>{item.pending_qty}</TableCell>
                                      <TableCell>₹{item.unit_price?.toFixed(2)}</TableCell>
                                      <TableCell>₹{item.line_total?.toFixed(2)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
            <ScrollBar orientation="vertical" className="w-3 bg-slate-200" forceMount />
          </ScrollArea>
        )}

        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white">
            <div className="text-sm text-slate-500">
              Showing {totalCount === 0 ? 0 : (currentPage - 1) * SALE_ORDER_LIST_PAGE_SIZE + 1} to {Math.min(currentPage * SALE_ORDER_LIST_PAGE_SIZE, totalCount)} of {totalCount}
              {listQuietRefreshing ? " · refreshing…" : ""}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-9 text-sm border-slate-200" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>Previous</Button>
              <span className="text-sm text-slate-600 font-medium self-center tabular-nums">Page {currentPage} of {totalPages}</span>
              <Button variant="outline" className="h-9 text-sm border-slate-200" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>Next</Button>
            </div>
          </div>
        )}
        </div>
      </Card>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!orderToDelete} onOpenChange={() => setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sale Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete sale order {orderToDelete?.order_number}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Accept Dialog */}
      <AlertDialog open={!!orderToAccept} onOpenChange={() => setOrderToAccept(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept Sale Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to accept this order ({orderToAccept?.order_number})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAcceptOrder} disabled={isAccepting}>
              {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conversion Dialog */}
      <Dialog
        open={showConversionDialog}
        onOpenChange={(open) => {
          if (conversionLoading && !open) return;
          setShowConversionDialog(open);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Convert to Sale Bill</DialogTitle>
            <DialogDescription>
              Select items and quantities to convert to a sale bill. Only items with available stock can be converted.
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-96 overflow-auto">
            {conversionLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground" aria-busy="true">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Loading order items…</p>
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Convert Qty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversionItems.map((item, index) => {
                  const canConvert = item.stock_qty > 0;
                  return (
                    <TableRow key={item.id} className={!canConvert ? "opacity-50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={item.selected}
                          disabled={!canConvert}
                          onCheckedChange={(checked) => {
                            const newItems = [...conversionItems];
                            newItems[index].selected = !!checked;
                            setConversionItems(newItems);
                          }}
                        />
                      </TableCell>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>{item.pending_qty}</TableCell>
                      <TableCell>
                        <Badge variant={item.stock_qty > 0 ? "default" : "destructive"}>
                          {item.stock_qty}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={Math.min(item.pending_qty, item.stock_qty)}
                          value={item.convert_qty}
                          disabled={!canConvert}
                          onChange={(e) => {
                            const newItems = [...conversionItems];
                            newItems[index].convert_qty = Math.min(
                              parseInt(e.target.value) || 0,
                              item.pending_qty,
                              item.stock_qty
                            );
                            setConversionItems(newItems);
                          }}
                          className="w-20 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        {item.stock_qty >= item.pending_qty ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            Full
                          </div>
                        ) : item.stock_qty > 0 ? (
                          <div className="flex items-center gap-1 text-orange-600">
                            <AlertTriangle className="h-4 w-4" />
                            Partial
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                            No Stock
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConversionDialog(false)} disabled={conversionLoading || isConverting}>Cancel</Button>
            <Button onClick={handleConvertToSaleBill} disabled={isConverting || conversionLoading || conversionItems.length === 0}>
              {isConverting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              Create Sale Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
      {orderToPrint && (
        <PrintSaleOrderDialog 
          order={orderToPrint.order}
          settings={settings}
          mode={orderToPrint.mode}
          conversionItems={orderToPrint.conversionItems}
          printedAt={orderToPrint.printedAt}
          onClose={() => setOrderToPrint(null)}
        />
      )}

      {isDesktop && (
        <DesktopContextMenu
          isOpen={rowContextMenu.isOpen}
          position={rowContextMenu.position}
          items={rowContextMenu.contextData ? getOrderContextMenuItems(rowContextMenu.contextData) : []}
          onClose={rowContextMenu.closeMenu}
        />
      )}
    </div>
  );
}

// Print Dialog Component
function PrintSaleOrderDialog({
  order,
  settings,
  onClose,
  mode = "order",
  conversionItems,
  printedAt,
}: {
  order: any;
  settings: any;
  onClose: () => void;
  mode?: "order" | "available-stock";
  conversionItems?: ConversionItem[];
  printedAt?: Date;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [printItems, setPrintItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isAvailableStock = mode === "available-stock";
  const [selectedFormat, setSelectedFormat] = useState<'a4' | 'a5' | 'a5-horizontal' | 'thermal'>(() => {
    if (mode === "available-stock") return "a4";
    return settings?.sale_settings?.bill_format || "a4";
  });
  const [invoiceStyle, setInvoiceStyle] = useState<"standard" | "wholesale-size-grouping">(
    isAvailableStock ? "standard" : (order.invoice_format || "standard")
  );
  
  const getPageStyle = () => {
    if (isAvailableStock) {
      return '@page { size: A4 landscape; margin: 6mm; }';
    }
    switch (selectedFormat) {
      case 'a5':
        return '@page { size: 148mm 210mm; margin: 4mm; }';
      case 'a5-horizontal':
        return '@page { size: 210mm 148mm; margin: 4mm; }';
      case 'thermal':
        return '@page { size: 80mm auto; margin: 2mm 4mm; }';
      default:
        return '@page { size: A4 portrait; margin: 10mm; }';
    }
  };
  
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: isAvailableStock
      ? `AvailableStock-${order.order_number}`
      : `SaleOrder-${order.order_number}`,
    pageStyle: `${getPageStyle()}
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
      @media print {
        body .sale-order-print-container,
        body .sale-order-print-container * {
          visibility: visible !important;
          opacity: 1 !important;
        }
      }`,
    onBeforePrint: () =>
      new Promise<void>((resolve) => {
        waitForPrintReady(printRef, resolve, { maxWait: 8000 });
      }),
  });

  // Fetch brand/style from products (and map available-stock rows from conversion)
  useEffect(() => {
    const fetchProductDetails = async () => {
      const sourceRows = isAvailableStock
        ? (conversionItems || [])
        : (order.sale_order_items || []).filter((item: any) => !item.deleted_at);

      const productIds = [
        ...new Set(
          sourceRows
            .map((item: any) => item.product_id)
            .filter(Boolean),
        ),
      ] as string[];
      let productDetails: Record<string, { brand: string | null; style: string | null }> = {};
      
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, brand, style")
          .in("id", productIds);
        
        if (products) {
          productDetails = products.reduce((acc, p) => {
            acc[p.id] = { brand: p.brand, style: p.style };
            return acc;
          }, {} as Record<string, { brand: string | null; style: string | null }>);
        }
      }

      const items = isAvailableStock
        ? (conversionItems || []).map((item, index) => ({
            sr: index + 1,
            particulars: item.product_name,
            size: item.size,
            barcode: item.barcode || "",
            hsn: "",
            orderQty: item.order_qty,
            fulfilledQty: Math.max(0, item.order_qty - item.pending_qty),
            pendingQty: item.pending_qty,
            availableQty: item.total_stock_qty ?? item.stock_qty,
            stockQty: item.total_stock_qty ?? item.stock_qty,
            sizeStock: item.size_stock ?? [],
            rate: item.unit_price,
            mrp: item.mrp,
            discountPercent: item.discount_percent,
            total: 0,
            color: item.color || "",
            brand: item.brand ?? (item.product_id ? productDetails[item.product_id]?.brand : null),
            style: item.style ?? (item.product_id ? productDetails[item.product_id]?.style : null),
          }))
        : (order.sale_order_items || [])
            .filter((item: any) => !item.deleted_at)
            .map((item: any, index: number) => ({
              sr: index + 1,
              particulars: item.product_name,
              size: item.size,
              barcode: item.barcode || "",
              hsn: "",
              orderQty: item.order_qty,
              fulfilledQty: item.fulfilled_qty,
              pendingQty: item.pending_qty,
              rate: item.unit_price,
              mrp: item.mrp,
              discountPercent: item.discount_percent,
              total: item.line_total,
              color: item.color || "",
              brand: item.product_id ? productDetails[item.product_id]?.brand : null,
              style: item.product_id ? productDetails[item.product_id]?.style : null,
            }));
      
      setPrintItems(items);
      setLoading(false);
    };

    fetchProductDetails();
  }, [order, conversionItems, isAvailableStock]);

  return (
    <AlertDialog open={true} onOpenChange={onClose}>
      <AlertDialogContent className={cn("print-dialog max-h-[90vh] overflow-auto", isAvailableStock ? "max-w-6xl" : "max-w-4xl")}>
          <AlertDialogHeader>
          <AlertDialogTitle>
            {isAvailableStock ? "Print Available Stock" : "Print Sale Order"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              {!isAvailableStock && (
              <div className="flex items-center gap-2">
                <Label className="text-foreground">Bill Format:</Label>
                <Select
                  value={selectedFormat}
                  onValueChange={(v: 'a4' | 'a5' | 'a5-horizontal' | 'thermal') => {
                    setSelectedFormat(v);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4">A4 (210mm × 297mm)</SelectItem>
                    <SelectItem value="a5">A5 Vertical (148mm × 210mm)</SelectItem>
                    <SelectItem value="a5-horizontal">A5 Horizontal (210mm × 148mm)</SelectItem>
                    <SelectItem value="thermal">Thermal (80mm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              )}
              {!isAvailableStock && selectedFormat !== 'thermal' && (
                <div className="flex items-center gap-2">
                  <Label className="text-foreground">Invoice Style:</Label>
                  <Select value={invoiceStyle} onValueChange={(v: "standard" | "wholesale-size-grouping") => setInvoiceStyle(v)}>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="wholesale-size-grouping">Modern Wholesale Size Grouping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isAvailableStock && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Picking list prints on A4 landscape. Size columns follow the order (Avl / Ord per size). Snapshot of on-hand stock, not a reservation. No prices.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="border rounded-lg overflow-auto max-h-[60vh] bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : printItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-destructive font-medium">No items found for this order</p>
              <p className="text-sm text-muted-foreground mt-2">
                This order may have been created without items. Please re-create the order.
              </p>
            </div>
          ) : selectedFormat === 'thermal' && !isAvailableStock ? (
            <ThermalPrint80mm
              ref={printRef}
              billNo={order.order_number}
              date={new Date(order.order_date)}
              customerName={order.customer_name}
              customerPhone={order.customer_phone}
              customerAddress={order.customer_address}
              items={printItems.map((item: any, idx: number) => ({
                sr: idx + 1,
                particulars: item.particulars,
                qty: item.orderQty,
                rate: item.rate,
                total: item.total,
              }))}
              subTotal={order.gross_amount}
              discount={order.discount_amount + order.flat_discount_amount}
              grandTotal={order.net_amount}
              gstBreakdown={{
                cgst: order.gst_amount / 2,
                sgst: order.gst_amount / 2,
              }}
              documentType="sale-order"
              termsConditions={order.terms_conditions}
            />
          ) : (
            <SaleOrderPrint
              ref={printRef}
              businessName={settings?.business_name || 'Business Name'}
              address={settings?.address || ''}
              mobile={settings?.mobile_number || ''}
              email={settings?.email_id}
              gstNumber={settings?.gst_number}
              logoUrl={settings?.bill_barcode_settings?.logo_url}
              orderNumber={order.order_number}
              orderDate={new Date(order.order_date)}
              expectedDeliveryDate={order.expected_delivery_date ? new Date(order.expected_delivery_date) : undefined}
              quotationNumber={order.quotation_id ? `Linked` : undefined}
              customerName={order.customer_name}
              customerAddress={order.customer_address}
              customerMobile={order.customer_phone}
              customerEmail={order.customer_email}
              items={printItems}
              grossAmount={isAvailableStock ? 0 : order.gross_amount}
              discountAmount={isAvailableStock ? 0 : order.discount_amount + order.flat_discount_amount}
              taxableAmount={isAvailableStock ? 0 : order.gross_amount - order.discount_amount - order.flat_discount_amount}
              gstAmount={isAvailableStock ? 0 : order.gst_amount}
              roundOff={isAvailableStock ? 0 : order.round_off}
              netAmount={isAvailableStock ? 0 : order.net_amount}
              status={order.status}
              termsConditions={order.terms_conditions}
              notes={order.notes}
              shippingAddress={order.shipping_address}
              taxType={order.tax_type}
              format={isAvailableStock ? 'a4' : selectedFormat === 'a5' ? 'a5-vertical' : selectedFormat === 'a5-horizontal' ? 'a5-horizontal' : 'a4'}
              colorScheme={settings?.sale_settings?.invoice_color_scheme || 'blue'}
              invoiceFormat={isAvailableStock ? "standard" : invoiceStyle}
              documentMode={isAvailableStock ? "available-stock" : "order"}
              printedAt={isAvailableStock ? (printedAt || new Date()) : undefined}
            />
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
          <Button onClick={() => handlePrint()} disabled={loading}>
            <Printer className="h-4 w-4 mr-2" />
            {loading ? 'Loading...' : 'Print'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
