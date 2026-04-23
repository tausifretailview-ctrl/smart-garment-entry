import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import * as XLSX from "xlsx";
import { ColumnDef } from "@tanstack/react-table";
import { ERPTable } from "@/components/erp-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Package, Search, Download, Upload, Filter, Plus, MoreHorizontal, Home, ChevronDown, ChevronRight, X, Trash2, Settings2, Barcode, RefreshCw, Eye, Edit, ShoppingCart, History, Ban, Merge, Boxes, Tags, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
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
import { ProductHistoryDialog } from "@/components/ProductHistoryDialog";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { useProductProtection } from "@/hooks/useProductProtection";
import { ProductRelationDialog } from "@/components/ProductRelationDialog";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, PageContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { ProductImageGallery, ProductImage } from "@/components/ProductImageGallery";
import { ProductImageViewer } from "@/components/ProductImageViewer";
import { ProductImageUploader } from "@/components/ProductImageUploader";
import { MergeProductsDialog } from "@/components/MergeProductsDialog";
import { useSettings } from "@/hooks/useSettings";

interface ProductVariant {
  variant_id: string;
  size: string;
  color: string;
  barcode: string;
  pur_price: number;
  sale_price: number;
  mrp: number;
  stock_qty: number;
}

interface ProductRow {
  product_id: string;
  product_name: string;
  product_type: string;
  category: string;
  brand: string;
  style: string;
  color: string;
  image_url?: string;
  hsn_code: string;
  gst_per: number;
  default_pur_price: number;
  default_sale_price: number;
  status: string;
  variants: ProductVariant[];
  total_stock: number;
  variant_count: number;
  user_cancelled_at?: string | null;
}

interface DashboardStats {
  total_items: number;
  total_stock_qty: number;
  purchase_value: number;
  sale_value: number;
}

const ProductDashboard = () => {
  const { toast } = useToast();
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const { hasSpecialPermission } = useUserPermissions();
  const canDelete = hasSpecialPermission('delete_records');
  const { data: orgSettings } = useSettings();
  const lowStockThreshold = Number((orgSettings as any)?.product_settings?.low_stock_threshold) || 10;
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({ total_items: 0, total_stock_qty: 0, purchase_value: 0, sale_value: 0 });
  const [totalCount, setTotalCount] = useState(0);
  const [isRefetching, setIsRefetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedProductType, setSelectedProductType] = useState<string>("all");
  const [selectedSizeGroup, setSelectedSizeGroup] = useState<string>("all");
  const [selectedStockLevel, setSelectedStockLevel] = useState<string>("all");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  
  // Data for filter options
  const [sizeGroups, setSizeGroups] = useState<Array<{ id: string; group_name: string }>>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [productTypes, setProductTypes] = useState<string[]>([]);

  // Selection and pagination states
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Product relation dialog state (for blocked deletion)
  const [relationDialog, setRelationDialog] = useState<{
    open: boolean;
    productName: string;
    productId: string;
    relations: Array<{ type: string; count: number; samples: string[] }>;
  }>({ open: false, productName: "", productId: "", relations: [] });
  const [isMarkingInactive, setIsMarkingInactive] = useState(false);

  // Product history dialog states
  const [showProductHistory, setShowProductHistory] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<{id: string; name: string} | null>(null);
  const [showMrp, setShowMrp] = useState(false);

  // Product image gallery states
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageUploaderOpen, setImageUploaderOpen] = useState(false);
  const [selectedProductImages, setSelectedProductImages] = useState<{
    productId: string;
    productName: string;
    images: ProductImage[];
  }>({ productId: "", productName: "", images: [] });
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // Stock import states
  const [showStockImportDialog, setShowStockImportDialog] = useState(false);
  const [stockImportFile, setStockImportFile] = useState<File | null>(null);
  const [stockImportPreview, setStockImportPreview] = useState<Array<{barcode: string; product_name: string; size: string; current_qty: number; new_qty: number; variant_id: string}>>([]);
  const [stockImporting, setStockImporting] = useState(false);
  const [stockImportProgress, setStockImportProgress] = useState({ done: 0, total: 0 });
  const stockImportFileRef = useRef<HTMLInputElement>(null);

  // Context menu for desktop right-click
  const isDesktop = useIsDesktop();
  const rowContextMenu = useContextMenu<ProductRow>();
  const pageContextMenu = useContextMenu<void>();

  // Get context menu items for product row
  const getProductContextMenuItems = (product: ProductRow): ContextMenuItem[] => {
    return [
      {
        label: "View Details",
        icon: Eye,
        onClick: () => toggleExpanded(product.product_id),
      },
      {
        label: "Edit Product",
        icon: Edit,
        onClick: () => navigate(`/product-entry/${product.product_id}`),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Stock Report",
        icon: Package,
        onClick: () => navigate(`/stock-report?search=${encodeURIComponent(product.product_name)}`),
      },
      {
        label: "Stock History",
        icon: History,
        onClick: () => {
          setSelectedProductForHistory({
            id: product.product_id,
            name: product.product_name
          });
          setShowProductHistory(true);
        },
      },
      {
        label: "Adjust Stock",
        icon: Filter,
        onClick: () => navigate(`/stock-adjustment?productId=${product.product_id}`),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Print Barcodes",
        icon: Barcode,
        onClick: async () => {
          const variants = product.variants.length > 0 ? product.variants : await fetchVariantsForProduct(product.product_id);
          const barcodeItems = variants.map(variant => ({
            sku_id: variant.variant_id,
            product_name: product.product_name,
            brand: product.brand || "",
            category: product.category || "",
            color: variant.color || product.color || "",
            style: product.style || "",
            size: variant.size,
            sale_price: variant.sale_price,
            mrp: variant.mrp,
            pur_price: variant.pur_price,
            barcode: variant.barcode,
            qty: variant.stock_qty,
            bill_number: "",
            supplier_code: "",
          }));
          navigate("/barcode-printing", { state: { purchaseItems: barcodeItems } });
        },
      },
      {
        label: "Add Purchase",
        icon: ShoppingCart,
        onClick: () => navigate(`/purchase-entry?productId=${product.product_id}`),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: product.status === 'active' ? "Mark Inactive" : "Mark Active",
        icon: Ban,
        onClick: async () => {
          const newStatus = product.status === 'active' ? 'inactive' : 'active';
          const { error } = await supabase
            .from("products")
            .update({ status: newStatus })
            .eq("id", product.product_id);
          
          if (!error) {
            toast({
              title: "Success",
              description: `Product marked as ${newStatus}`,
            });
            fetchProductVariants();
          }
        },
      },
      ...(canDelete ? [{
        label: "Delete Product",
        icon: Trash2,
        onClick: () => {
          setSelectedProducts(new Set([product.product_id]));
          setShowBulkDeleteDialog(true);
        },
        destructive: true,
      }] : []),
    ];
  };

  // Get page-level context menu items
  const getPageContextMenuItems = (): ContextMenuItem[] => [
    {
      label: "POS Billing",
      icon: Home,
      onClick: () => navigate("/pos-sales"),
    },
    {
      label: "Stock Report",
      icon: Package,
      onClick: () => navigate("/stock-report"),
    },
    {
      label: "Size-wise Stock",
      icon: Filter,
      onClick: () => navigate("/item-wise-stock-report"),
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Add New Product",
      icon: Plus,
      onClick: () => navigate("/product-entry"),
    },
    {
      label: "Add Purchase",
      icon: ShoppingCart,
      onClick: () => navigate("/purchase-entry"),
    },
    {
      label: "Refresh List",
      icon: RefreshCw,
      onClick: () => fetchProductVariants(),
    },
  ];

  // Handle row right-click
  const handleRowContextMenu = (e: React.MouseEvent, product: ProductRow) => {
    if (!isDesktop) return;
    rowContextMenu.openMenu(e, product);
  };

  // Handle page right-click (empty area)
  const handlePageContextMenu = (e: React.MouseEvent) => {
    if (!isDesktop) return;
    const target = e.target as HTMLElement;
    if (target.closest('tr') || target.closest('button') || target.closest('a')) return;
    pageContextMenu.openMenu(e, undefined);
  };

  // Handle image gallery click to open viewer
  const handleImageClick = useCallback((images: ProductImage[], productId: string, productName: string) => {
    setSelectedProductImages({ productId, productName, images });
    setImageViewerOpen(true);
  }, []);

  // Handle add image click to open uploader
  const handleAddImageClick = useCallback((productId: string, productName: string, existingImages: ProductImage[]) => {
    setSelectedProductImages({ productId, productName, images: existingImages });
    setImageUploaderOpen(true);
  }, []);

  // Handle images updated - refresh gallery
  const handleImagesUpdated = useCallback(() => {
    setGalleryRefreshKey(prev => prev + 1);
  }, []);

  const defaultColumnSettings = {
    image: true,
    productName: true,
    category: true,
    brand: true,
    style: true,
    color: true,
    hsn: true,
    gst: true,
    purPrice: true,
    salePrice: true,
    status: true,
    totalQty: true,
    variants: true,
  };

  const { columnSettings: columnVisibility, updateColumnSetting, isLoading: settingsLoading } = 
    useDashboardColumnSettings("product_dashboard", defaultColumnSettings);

  const toggleColumnVisibility = (column: string) => {
    updateColumnSetting(column, !columnVisibility[column]);
  };

  const visibleColumnCount = Object.values(columnVisibility).filter(Boolean).length + 4; // +4 for expand, checkbox, sr.no, actions

  // Debounced search with proper useRef
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  useEffect(() => {
    fetchSizeGroups();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      if (!currentOrganization?.id) return;
      const { data, error } = await supabase
        .from("settings")
        .select("purchase_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) throw error;
      if (data?.purchase_settings && typeof data.purchase_settings === 'object') {
        const purchaseSettings = data.purchase_settings as any;
        setShowMrp(purchaseSettings.show_mrp || false);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedProductType, selectedSizeGroup, selectedStockLevel, minPrice, maxPrice, itemsPerPage]);

  // Variant cache for lazy loading
  const [variantCache, setVariantCache] = useState<Record<string, ProductVariant[]>>({});

  const fetchVariantsForProduct = useCallback(async (productId: string) => {
    if (variantCache[productId]) return variantCache[productId];
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, size, color, barcode, pur_price, sale_price, mrp, stock_qty")
      .eq("product_id", productId)
      .is("deleted_at", null)
      .order("size");
    if (error) { console.error("Variant fetch error:", error); return []; }
    const variants: ProductVariant[] = (data || []).map((v: any) => ({
      variant_id: v.id, size: v.size, color: v.color || "", barcode: v.barcode || "",
      pur_price: v.pur_price, sale_price: v.sale_price, mrp: v.mrp || 0, stock_qty: v.stock_qty,
    }));
    setVariantCache(prev => ({ ...prev, [productId]: variants }));
    return variants;
  }, [variantCache]);

  // Request sequencing to prevent stale responses
  const fetchSeqRef = useRef(0);

  // Fetch only current page of products with server-side filters via RPC
  useEffect(() => {
    fetchProducts();
  }, [currentOrganization?.id, currentPage, itemsPerPage, debouncedSearch, selectedCategory, selectedProductType, selectedSizeGroup, selectedStockLevel, minPrice, maxPrice]);

  // Fetch stats separately (lightweight)
  useEffect(() => {
    fetchStats();
  }, [currentOrganization?.id, debouncedSearch, selectedCategory, selectedProductType, selectedSizeGroup, selectedStockLevel, minPrice, maxPrice]);

  const getRpcParams = () => {
    const term = debouncedSearch.trim() || undefined;
    return {
      p_org_id: currentOrganization!.id,
      p_search: term || null,
      p_category: selectedCategory !== "all" ? selectedCategory : null,
      p_product_type: selectedProductType !== "all" ? selectedProductType : null,
      p_size_group_id: selectedSizeGroup !== "all" ? selectedSizeGroup : null,
      p_stock_level: selectedStockLevel !== "all" ? selectedStockLevel : null,
      p_min_price: minPrice ? parseFloat(minPrice) : null,
      p_max_price: maxPrice ? parseFloat(maxPrice) : null,
    };
  };

  const fetchStats = async () => {
    if (!currentOrganization?.id) return;
    setStatsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_product_dashboard_stats", getRpcParams());
      if (error) throw error;
      if (data) {
        const s = data as any;
        setDashboardStats({
          total_items: s.total_items || 0,
          total_stock_qty: s.total_stock_qty || 0,
          purchase_value: s.purchase_value || 0,
          sale_value: s.sale_value || 0,
        });
      }
    } catch (error) {
      console.error("Stats fetch error:", error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchProducts = async (retryCount = 0) => {
    if (!currentOrganization?.id) return;
    const seq = ++fetchSeqRef.current;
    if (productRows.length === 0) {
      setLoading(true);
    } else {
      setIsRefetching(true);
    }
    try {
      const params = { ...getRpcParams(), p_page: currentPage, p_page_size: itemsPerPage };
      const { data, error } = await supabase.rpc("get_product_catalog_page", params);
      if (error) throw error;
      // Stale response guard — ignore if a newer request was fired
      if (seq !== fetchSeqRef.current) return;

      const rows: ProductRow[] = (data || []).map((p: any) => ({
        product_id: p.product_id,
        product_name: p.product_name || "",
        product_type: p.product_type || "",
        category: p.category || "",
        brand: p.brand || "",
        style: p.style || "",
        color: p.color || "",
        image_url: p.image_url,
        hsn_code: p.hsn_code || "",
        gst_per: p.gst_per || 0,
        default_pur_price: Number(p.default_pur_price) || 0,
        default_sale_price: Number(p.default_sale_price) || 0,
        status: p.status || "active",
        variants: variantCache[p.product_id] || [],
        total_stock: Number(p.total_stock) || 0,
        variant_count: Number(p.variant_count) || 0,
      }));

      // Get total_count from first row (all rows carry same total_count)
      if (data && data.length > 0) {
        setTotalCount(Number((data as any)[0].total_count) || 0);
      } else if (currentPage === 1) {
        setTotalCount(0);
      }

      // Fetch user_cancelled_at flags for the visible page's products
      if (rows.length > 0) {
        const ids = rows.map(r => r.product_id);
        const { data: cancelledData } = await supabase
          .from("products")
          .select("id, user_cancelled_at")
          .in("id", ids)
          .not("user_cancelled_at", "is", null);
        const cancelledMap = new Map<string, string>(
          (cancelledData || []).map((p: any) => [p.id, p.user_cancelled_at])
        );
        rows.forEach(r => { r.user_cancelled_at = cancelledMap.get(r.product_id) || null; });
      }

      setProductRows(rows);
      setFetchError(null);
      
      // Extract unique categories/types for filters (only once)
      if (categories.length === 0) {
        const { data: catData } = await supabase
          .from("products")
          .select("category")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .not("category", "is", null);
        const uniqueCategories = Array.from(new Set((catData || []).map((p: any) => p.category).filter(Boolean))).sort();
        if (seq === fetchSeqRef.current) setCategories(uniqueCategories as string[]);
      }

      if (productTypes.length === 0) {
        const { data: typeData } = await supabase
          .from("products")
          .select("product_type")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .not("product_type", "is", null);
        const uniqueTypes = Array.from(new Set((typeData || []).map((p: any) => p.product_type).filter(Boolean))).sort();
        if (seq === fetchSeqRef.current) setProductTypes(uniqueTypes as string[]);
      }
    } catch (error: any) {
      // Ignore errors from stale requests
      if (seq !== fetchSeqRef.current) return;
      console.error("ProductDashboard fetch error:", error);
      if (retryCount < 1) {
        setTimeout(() => fetchProducts(retryCount + 1), 1000);
        return;
      }
      setFetchError(error.message || "Failed to load products");
      toast({
        title: "Error",
        description: error.message || "Failed to load products",
        variant: "destructive",
      });
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
        setIsRefetching(false);
      }
    }
  };

  // Alias for backward compatibility with context menu etc.
  const fetchProductVariants = fetchProducts;

  const fetchSizeGroups = async () => {
    try {
      const { data, error } = await supabase
        .from("size_groups")
        .select("id, group_name")
        .order("group_name");

      if (error) throw error;
      setSizeGroups(data || []);
    } catch (error: any) {
      console.error("Failed to load size groups:", error);
    }
  };

  const toggleExpanded = async (productId: string) => {
    const shouldExpand = !expandedRows.has(productId);
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
    if (shouldExpand && !variantCache[productId]) {
      const variants = await fetchVariantsForProduct(productId);
      // Update the product row with loaded variants
      setProductRows(prev => prev.map(p => 
        p.product_id === productId ? { ...p, variants } : p
      ));
    }
  };

  const clearAllFilters = () => {
    setSelectedCategory("all");
    setSelectedProductType("all");
    setSelectedSizeGroup("all");
    setSelectedStockLevel("all");
    setMinPrice("");
    setMaxPrice("");
    setSearchQuery("");
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === paginatedRows.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(paginatedRows.map(p => p.product_id)));
    }
  };

  const toggleSelectProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  // Check if product has any transaction history (sales, purchases, returns, etc.)
  const checkProductHasTransactions = async (productId: string): Promise<{ hasTransactions: boolean; productName: string }> => {
    const product = productRows.find(p => p.product_id === productId);
    const productName = product?.product_name || 'Unknown Product';

    // Check all transaction tables in parallel (including delivery challans)
    const [saleItems, purchaseItems, saleReturns, purchaseReturns, quotations, saleOrders, challans] = await Promise.all([
      supabase.from("sale_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("purchase_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("sale_return_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("purchase_return_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("quotation_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("sale_order_items").select("id").eq("product_id", productId).limit(1),
      supabase.from("delivery_challan_items").select("id").eq("product_id", productId).limit(1),
    ]);

    const hasTransactions = 
      (saleItems.data?.length ?? 0) > 0 ||
      (purchaseItems.data?.length ?? 0) > 0 ||
      (saleReturns.data?.length ?? 0) > 0 ||
      (purchaseReturns.data?.length ?? 0) > 0 ||
      (quotations.data?.length ?? 0) > 0 ||
      (saleOrders.data?.length ?? 0) > 0 ||
      (challans.data?.length ?? 0) > 0;

    return { hasTransactions, productName };
  };

  const { softDelete, bulkSoftDelete } = useSoftDelete();
  const { getProductRelationDetails } = useProductProtection();

  const handleBulkDelete = async () => {
    if (!canDelete) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to delete products. Ask admin to enable 'Delete Records' in User Rights.",
        variant: "destructive",
      });
      setShowBulkDeleteDialog(false);
      return;
    }
    setIsDeleting(true);
    try {
      const productsToDelete = Array.from(selectedProducts);
      
      // For single product, show detailed relation dialog
      if (productsToDelete.length === 1) {
        const productId = productsToDelete[0];
        const product = productRows.find(p => p.product_id === productId);
        const productName = product?.product_name || 'Unknown Product';
        
        const result = await getProductRelationDetails(productId);
        
        if (result.hasTransactions) {
          setRelationDialog({
            open: true,
            productName,
            productId,
            relations: result.relations,
          });
          setIsDeleting(false);
          setShowBulkDeleteDialog(false);
          return;
        }
      } else {
        // For multiple products, check all for transaction history
        const productsWithTransactions: Array<{ id: string; name: string; relations: Array<{ type: string; count: number; samples: string[] }> }> = [];
        
        for (const productId of productsToDelete) {
          const product = productRows.find(p => p.product_id === productId);
          const result = await getProductRelationDetails(productId);
          if (result.hasTransactions) {
            productsWithTransactions.push({
              id: productId,
              name: product?.product_name || 'Unknown',
              relations: result.relations,
            });
          }
        }

        // If any product has transactions, show first one's relation dialog
        if (productsWithTransactions.length > 0) {
          const first = productsWithTransactions[0];
          setRelationDialog({
            open: true,
            productName: first.name + (productsWithTransactions.length > 1 ? ` (and ${productsWithTransactions.length - 1} more)` : ''),
            productId: first.id,
            relations: first.relations,
          });
          setIsDeleting(false);
          setShowBulkDeleteDialog(false);
          return;
        }
      }

      // Soft delete products without transaction history
      const count = await bulkSoftDelete("products", productsToDelete);

      toast({
        title: "Success",
        description: `${count} product(s) moved to recycle bin`,
      });

      setSelectedProducts(new Set());
      setShowBulkDeleteDialog(false);
      await fetchProductVariants();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete products",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMarkProductInactive = async () => {
    if (!relationDialog.productId) return;
    
    setIsMarkingInactive(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ status: "inactive" })
        .eq("id", relationDialog.productId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `"${relationDialog.productName}" has been marked as inactive`,
      });

      setRelationDialog({ open: false, productName: "", productId: "", relations: [] });
      setSelectedProducts(new Set());
      await fetchProductVariants();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to mark product as inactive",
        variant: "destructive",
      });
    } finally {
      setIsMarkingInactive(false);
    }
  };

  const handlePageSizeChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
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

  const handleExportToExcel = () => {
    try {
      // Prepare data for export - flatten products with variants
      const exportData = productRows.flatMap((product) => 
        product.variants.map((variant) => ({
          "Product Name": product.product_name,
          "Category": product.category,
          "Brand": product.brand,
          "Style": product.style,
          "Color": product.color,
          "HSN Code": product.hsn_code,
          "GST %": product.gst_per,
          "Default Pur Price": product.default_pur_price,
          "Default Sale Price": product.default_sale_price,
          "Status": product.status,
          "Size": variant.size,
          "Barcode": variant.barcode,
          "Purchase Price": variant.pur_price,
          "Sale Price": variant.sale_price,
          "Stock Qty": variant.stock_qty,
        }))
      );

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Set column widths for better readability
      ws['!cols'] = [
        { wch: 30 }, // Product Name
        { wch: 15 }, // Category
        { wch: 15 }, // Brand
        { wch: 12 }, // Style
        { wch: 12 }, // Color
        { wch: 12 }, // HSN Code
        { wch: 8 },  // GST %
        { wch: 15 }, // Default Pur Price
        { wch: 15 }, // Default Sale Price
        { wch: 10 }, // Status
        { wch: 10 }, // Size
        { wch: 15 }, // Barcode
        { wch: 15 }, // Purchase Price
        { wch: 12 }, // Sale Price
        { wch: 10 }, // Stock Qty
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");

      // Generate file name with current date
      const fileName = `Products_Export_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Save file
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Success",
        description: `Exported ${exportData.length} product variants to Excel`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to export data",
        variant: "destructive",
      });
    }
  };

  // === Stock Import Functions ===
  const handleExportStockTemplate = () => {
    const exportData = productRows.flatMap(product =>
      product.variants.map(variant => ({
        "Barcode": variant.barcode,
        "Product Name": product.product_name,
        "Size": variant.size,
        "Color": product.color || "",
        "Current Stock Qty": variant.stock_qty,
        "New Stock Qty": variant.stock_qty,
      }))
    );
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Update");
    XLSX.writeFile(wb, `Stock_Update_Template_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Template exported", description: "Fill 'New Stock Qty' column and import back." });
  };

  const handleStockImportFile = async (file: File) => {
    setStockImportFile(file);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const barcodeMap = new Map<string, { variant_id: string; product_name: string; size: string; current_qty: number }>();
      productRows.forEach(p => {
        p.variants.forEach(v => {
          if (v.barcode) {
            barcodeMap.set(v.barcode.toString().trim(), {
              variant_id: v.variant_id,
              product_name: p.product_name,
              size: v.size,
              current_qty: v.stock_qty,
            });
          }
        });
      });

      const preview: typeof stockImportPreview = [];
      for (const row of rows) {
        const barcode = row["Barcode"]?.toString().trim();
        const newQty = Number(row["New Stock Qty"]);
        if (!barcode || isNaN(newQty) || newQty < 0) continue;
        const info = barcodeMap.get(barcode);
        if (!info) continue;
        if (newQty === info.current_qty) continue;
        preview.push({
          barcode,
          product_name: info.product_name,
          size: info.size,
          current_qty: info.current_qty,
          new_qty: Math.round(newQty),
          variant_id: info.variant_id,
        });
      }

      setStockImportPreview(preview);
      if (preview.length === 0) {
        toast({ title: "No changes found", description: "All stock quantities match current values or barcodes not found." });
      }
    } catch (err: any) {
      toast({ title: "Parse error", description: err.message, variant: "destructive" });
    }
  };

  const handleApplyStockImport = async () => {
    if (stockImportPreview.length === 0 || !currentOrganization?.id) return;
    setStockImporting(true);
    setStockImportProgress({ done: 0, total: stockImportPreview.length });

    const CHUNK = 50;
    let done = 0;
    let errors = 0;

    try {
      for (let i = 0; i < stockImportPreview.length; i += CHUNK) {
        const chunk = stockImportPreview.slice(i, i + CHUNK);
        await Promise.all(chunk.map(async item => {
          const { error } = await supabase
            .from("product_variants")
            .update({ stock_qty: item.new_qty, opening_qty: item.new_qty })
            .eq("id", item.variant_id)
            .eq("organization_id", currentOrganization.id);
          if (error) { errors++; return; }
          await supabase.from("stock_movements").insert({
            variant_id: item.variant_id,
            quantity: item.new_qty - item.current_qty,
            movement_type: "reconciliation",
            notes: `Closing stock import — set to ${item.new_qty} (was ${item.current_qty})`,
            organization_id: currentOrganization.id,
          });
          done++;
        }));
        setStockImportProgress({ done: Math.min(i + CHUNK, stockImportPreview.length), total: stockImportPreview.length });
      }

      toast({
        title: "Stock updated",
        description: `${done} variants updated${errors > 0 ? `, ${errors} errors` : ""}.`,
      });

      setShowStockImportDialog(false);
      setStockImportPreview([]);
      setStockImportFile(null);
      window.location.reload();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setStockImporting(false);
    }
  };

  const hasActiveFilters =
    selectedCategory !== "all" || 
    selectedProductType !== "all" ||
    selectedSizeGroup !== "all" || 
    selectedStockLevel !== "all" || 
    minPrice !== "" || 
    maxPrice !== "" ||
    searchQuery !== "";

  // Server-side handles all filtering now; just use productRows directly
  const filteredRows = productRows;

  // Pagination is server-side; totalCount from RPC
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRows = filteredRows;

  // ---- ERPTable columns ----
  const productColumns = useMemo<ColumnDef<ProductRow, any>[]>(() => {
    const cols: ColumnDef<ProductRow, any>[] = [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={selectedProducts.size === paginatedRows.length && paginatedRows.length > 0}
            onCheckedChange={toggleSelectAll}
          />
        ),
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedProducts.has(row.original.product_id)}
              onCheckedChange={() => toggleSelectProduct(row.original.product_id)}
            />
          </div>
        ),
        size: 40,
      },
      {
        id: "srno",
        header: "Sr.",
        cell: ({ row }) => <span className="font-medium">{startIndex + row.index + 1}</span>,
        size: 50,
      },
    ];

    if (columnVisibility.image) {
      cols.push({
        id: "image",
        header: "Image",
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ProductImageGallery
              key={`${row.original.product_id}-${galleryRefreshKey}`}
              productId={row.original.product_id}
              productName={row.original.product_name}
              fallbackImageUrl={row.original.image_url}
              onImageClick={handleImageClick}
              onAddClick={handleAddImageClick}
            />
          </div>
        ),
        size: 80,
      });
    }

    if (columnVisibility.productName) {
      cols.push({
        accessorKey: "product_name",
        header: "Product Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span
              className="cursor-pointer text-primary hover:underline font-medium"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProductForHistory({ id: row.original.product_id, name: row.original.product_name });
                setShowProductHistory(true);
              }}
            >
              {row.original.product_name?.toUpperCase()}
            </span>
            {row.original.user_cancelled_at && (
              <Badge
                className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300 text-[10px] px-1.5 py-0 h-4"
                title="Added in Purchase Entry but removed before saving the bill"
              >
                User Cancelled
              </Badge>
            )}
          </div>
        ),
        size: 200,
      });
    }

    if (columnVisibility.category) cols.push({ accessorKey: "category", header: "Category", cell: ({ getValue }) => getValue() || "—", size: 120 });
    if (columnVisibility.brand) cols.push({ accessorKey: "brand", header: "Brand", cell: ({ getValue }) => getValue() || "—", size: 120 });
    if (columnVisibility.style) cols.push({ accessorKey: "style", header: "Style", cell: ({ getValue }) => getValue() || "—", size: 100 });
    if (columnVisibility.color) cols.push({ accessorKey: "color", header: "Color", cell: ({ getValue }) => getValue() || "—", size: 100 });
    if (columnVisibility.hsn) cols.push({ accessorKey: "hsn_code", header: "HSN", cell: ({ getValue }) => <span className="text-xs">{getValue() || "—"}</span>, size: 90 });
    if (columnVisibility.gst) cols.push({ accessorKey: "gst_per", header: "GST%", cell: ({ getValue }) => <span className="text-right block">{getValue()}%</span>, size: 70 });
    if (columnVisibility.purPrice) cols.push({ accessorKey: "default_pur_price", header: "Pur Price", cell: ({ getValue }) => <span className="text-right block text-orange-700 dark:text-orange-400 font-medium">₹{(getValue() as number).toFixed(2)}</span>, size: 110 });
    if (columnVisibility.salePrice) cols.push({ accessorKey: "default_sale_price", header: "Sale Price", cell: ({ getValue }) => <span className="text-right block text-emerald-700 dark:text-emerald-400 font-medium">₹{(getValue() as number).toFixed(2)}</span>, size: 110 });
    if (columnVisibility.status) cols.push({ accessorKey: "status", header: "Status", cell: ({ getValue }) => { const status = getValue() as string; return (<Badge className={status === "active" ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300" : "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400"}>{status}</Badge>); }, size: 90 });
    if (columnVisibility.totalQty) cols.push({ accessorKey: "total_stock", header: "Total Qty", cell: ({ getValue }) => { const qty = getValue() as number; return (<span className={`text-right block font-bold tabular-nums ${qty === 0 ? 'text-red-500' : qty <= 5 ? 'text-orange-500' : 'text-foreground'}`}>{qty}</span>); }, size: 90 });
    if (columnVisibility.variants) cols.push({ id: "variants", header: "Variants", cell: ({ row }) => (<Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 font-semibold tabular-nums">{row.original.variant_count || row.original.variants.length}</Badge>), size: 80 });

    cols.push({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/product-entry?id=${row.original.product_id}`)}>
                Edit Product
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={async () => {
                  const result = await getProductRelationDetails(row.original.product_id);
                  if (result.hasTransactions) {
                    setRelationDialog({ open: true, productName: row.original.product_name, productId: row.original.product_id, relations: result.relations });
                  } else {
                    setSelectedProducts(new Set([row.original.product_id]));
                    setShowBulkDeleteDialog(true);
                  }
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      size: 60,
    });

    return cols;
  }, [columnVisibility, selectedProducts, paginatedRows, startIndex, galleryRefreshKey, showMrp]);

  const renderProductSubRow = useCallback((row: ProductRow) => {
    if (row.variants.length === 0) {
      return (
        <div className="p-4 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading variants...</span>
        </div>
      );
    }
    
    // Compute duplicate barcodes within all productRows
    const barcodeCount = new Map<string, number>();
    filteredRows.forEach(pr => {
      pr.variants.forEach(v => {
        if (v.barcode && v.barcode.length > 6) {
          barcodeCount.set(v.barcode, (barcodeCount.get(v.barcode) || 0) + 1);
        }
      });
    });

    return (
      <div className="p-4">
        <h4 className="font-semibold text-sm mb-3">Product Variants Details</h4>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Size</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Purchase Price</TableHead>
                <TableHead className="text-right">Sale Price</TableHead>
                {showMrp && <TableHead className="text-right">MRP</TableHead>}
                <TableHead className="text-right">Stock Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.variants.map((variant) => (
                <TableRow key={variant.variant_id}>
                  <TableCell className="font-medium">{variant.size}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{variant.barcode || "—"}</span>
                    {variant.barcode && variant.barcode.length > 6 && (barcodeCount.get(variant.barcode) || 0) > 1 && (
                      <div className="flex items-start gap-1.5 mt-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>Duplicate barcode — used by {barcodeCount.get(variant.barcode)! - 1} other variant(s)</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{variant.color || "—"}</TableCell>
                  <TableCell className="text-right">₹{variant.pur_price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">₹{variant.sale_price.toFixed(2)}</TableCell>
                  {showMrp && <TableCell className="text-right">₹{variant.mrp.toFixed(2)}</TableCell>}
                  <TableCell className="text-right font-medium">{variant.stock_qty}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }, [showMrp, filteredRows]);

  if (loading && productRows.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Use server-side stats from RPC
  const totalStockQty = dashboardStats.total_stock_qty;
  const totalItems = dashboardStats.total_items;
  const totalPurchaseValue = dashboardStats.purchase_value;
  const totalSaleValue = dashboardStats.sale_value;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="h-8 w-8"
            >
              <Home className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Product Catalog</h1>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-l-4 border-l-blue-500 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Stock Qty</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">{totalStockQty.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                  <Boxes className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-violet-500 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Items</p>
                  <p className="text-2xl font-bold text-violet-700 dark:text-violet-300 tabular-nums">{totalItems.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
                  <Tags className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Purchase Value</p>
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-300 tabular-nums">₹{totalPurchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-orange-50 dark:bg-orange-950 flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-1">Sale Value</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">₹{totalSaleValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <Card className="mb-4 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Button 
                  variant={showFilters ? "default" : "outline"} 
                  size="sm" 
                  className="gap-2"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4" />
                  Filter
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                      {[selectedCategory !== "all", selectedProductType !== "all", selectedSizeGroup !== "all", selectedStockLevel !== "all", minPrice !== "", maxPrice !== ""].filter(Boolean).length}
                    </Badge>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={handleExportToExcel}
                  disabled={productRows.length === 0}
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => setShowStockImportDialog(true)}
                  disabled={productRows.length === 0}
                >
                  <Upload className="h-4 w-4" />
                  Import Stock
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name, brand, barcode, HSN... (multi-word AND)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8 no-uppercase"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Showing {totalCount.toLocaleString('en-IN')} results
                  </span>
                )}
                <div id="erp-toolbar-portal-product" className="flex items-center gap-2" />
                <div className="ml-auto">
                  <Button
                    size="sm"
                    className="gap-2 bg-primary hover:bg-primary/90 shadow-sm font-semibold"
                    onClick={() => navigate("/product-entry")}
                  >
                    <Plus className="h-4 w-4" />
                    Create New
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Filter Products</h3>
                {hasActiveFilters && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearAllFilters}
                    className="h-8 text-xs"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear All
                  </Button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                {/* Product Type Filter */}
                <div className="space-y-2">
                  <Label htmlFor="product-type-filter" className="text-xs font-medium">Product Type</Label>
                  <Select value={selectedProductType} onValueChange={setSelectedProductType}>
                    <SelectTrigger id="product-type-filter" className="h-9">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="all">All Types</SelectItem>
                      {productTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Category Filter */}
                <div className="space-y-2">
                  <Label htmlFor="category-filter" className="text-xs font-medium">Category</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger id="category-filter" className="h-9">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Size Group Filter */}
                <div className="space-y-2">
                  <Label htmlFor="size-group-filter" className="text-xs font-medium">Size Group</Label>
                  <Select value={selectedSizeGroup} onValueChange={setSelectedSizeGroup}>
                    <SelectTrigger id="size-group-filter" className="h-9">
                      <SelectValue placeholder="All Size Groups" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="all">All Size Groups</SelectItem>
                      {sizeGroups.map((sg) => (
                        <SelectItem key={sg.id} value={sg.id}>{sg.group_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Stock Level Filter */}
                <div className="space-y-2">
                  <Label htmlFor="stock-level-filter" className="text-xs font-medium">Stock Level</Label>
                  <Select value={selectedStockLevel} onValueChange={setSelectedStockLevel}>
                    <SelectTrigger id="stock-level-filter" className="h-9">
                      <SelectValue placeholder="All Stock Levels" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="all">All Stock Levels</SelectItem>
                      <SelectItem value="in_stock">In Stock</SelectItem>
                      <SelectItem value="low_stock">Low Stock (≤{lowStockThreshold})</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Min Price Filter */}
                <div className="space-y-2">
                  <Label htmlFor="min-price-filter" className="text-xs font-medium">Min Price</Label>
                  <Input
                    id="min-price-filter"
                    type="number"
                    placeholder="0"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="h-9"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* Max Price Filter */}
                <div className="space-y-2">
                  <Label htmlFor="max-price-filter" className="text-xs font-medium">Max Price</Label>
                  <Input
                    id="max-price-filter"
                    type="number"
                    placeholder="∞"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="h-9"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Active Filters Summary */}
              {hasActiveFilters && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex flex-wrap gap-2">
                    {searchQuery && (
                      <Badge variant="secondary" className="gap-1">
                        Search: {searchQuery}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => setSearchQuery("")}
                        />
                      </Badge>
                    )}
                    {selectedProductType !== "all" && (
                      <Badge variant="secondary" className="gap-1">
                        Type: {selectedProductType}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => setSelectedProductType("all")}
                        />
                      </Badge>
                    )}
                    {selectedCategory !== "all" && (
                      <Badge variant="secondary" className="gap-1">
                        Category: {selectedCategory}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => setSelectedCategory("all")}
                        />
                      </Badge>
                    )}
                    {selectedSizeGroup !== "all" && (
                      <Badge variant="secondary" className="gap-1">
                        Size Group: {sizeGroups.find(sg => sg.id === selectedSizeGroup)?.group_name}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => setSelectedSizeGroup("all")}
                        />
                      </Badge>
                    )}
                    {selectedStockLevel !== "all" && (
                      <Badge variant="secondary" className="gap-1">
                        Stock: {selectedStockLevel.replace("_", " ")}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => setSelectedStockLevel("all")}
                        />
                      </Badge>
                    )}
                    {minPrice && (
                      <Badge variant="secondary" className="gap-1">
                        Min: ₹{minPrice}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => setMinPrice("")}
                        />
                      </Badge>
                    )}
                    {maxPrice && (
                      <Badge variant="secondary" className="gap-1">
                        Max: ₹{maxPrice}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => setMaxPrice("")}
                        />
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bulk Actions */}
        {selectedProducts.size > 0 && (
          <Card className="mb-4 border-primary bg-primary/5 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    {selectedProducts.size} product(s) selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Get all variants from selected products, fetching if not loaded
                      const selectedProductData = productRows.filter(p => selectedProducts.has(p.product_id));
                      const allVariants = await Promise.all(
                        selectedProductData.map(async (product) => {
                          const variants = product.variants.length > 0 
                            ? product.variants 
                            : await fetchVariantsForProduct(product.product_id);
                          return variants.map(variant => ({
                            sku_id: variant.variant_id,
                            product_name: product.product_name,
                            brand: product.brand || "",
                            category: product.category || "",
                            color: variant.color || product.color || "",
                            style: product.style || "",
                            size: variant.size,
                            sale_price: variant.sale_price,
                            mrp: variant.mrp,
                            pur_price: variant.pur_price,
                            barcode: variant.barcode,
                            qty: variant.stock_qty,
                            bill_number: "",
                            supplier_code: "",
                          }));
                        })
                      );
                      const barcodeItems = allVariants.flat();
                      if (barcodeItems.length === 0) {
                        toast({ title: "No variants found for selected products", variant: "destructive" });
                        return;
                      }
                      navigate("/barcode-printing", { state: { purchaseItems: barcodeItems } });
                    }}
                    className="gap-2"
                  >
                    <Barcode className="h-4 w-4" />
                    Generate Barcode
                  </Button>
                  {selectedProducts.size === 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowMergeDialog(true)}
                      className="gap-2"
                    >
                      <Merge className="h-4 w-4" />
                      Merge Selected
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowBulkDeleteDialog(true)}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Selected
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card className="shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {filteredRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                {fetchError ? (
                  <>
                    <p className="text-lg text-destructive">Failed to load products</p>
                    <p className="text-sm mb-3">{fetchError}</p>
                    <Button variant="outline" size="sm" onClick={() => fetchProductVariants()}>
                      <RefreshCw className="h-4 w-4 mr-2" /> Retry
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-lg">No products found</p>
                    <p className="text-sm">Add your first product to get started</p>
                  </>
                )}
              </div>
            ) : (
               <ERPTable<ProductRow>
                tableId="product_list"
                columns={productColumns}
                data={paginatedRows}
                isLoading={loading && productRows.length === 0}
                emptyMessage="No products found"
                renderSubRow={renderProductSubRow}
                expandedRows={expandedRows}
                onToggleExpand={toggleExpanded}
                getRowId={(row) => row.product_id}
                onRowContextMenu={handleRowContextMenu}
                showToolbar={false}
                renderToolbar={(toolbar) => {
                  const el = document.getElementById('erp-toolbar-portal-product');
                  return el ? createPortal(toolbar, el) : toolbar;
                }}
              />
            )}
          </CardContent>
        </Card>

        {/* Pagination Controls */}
        {filteredRows.length > 0 && (
          <Card className="mt-4 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rows per page:</span>
                    <Select value={itemsPerPage.toString()} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="w-20 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} products (Page {currentPage} of {totalPages})
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk Delete Confirmation Dialog */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently Delete Selected Products</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete {selectedProducts.size} product(s)? This will remove all associated variants, stock records, and transaction history. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Product History Dialog */}
      {selectedProductForHistory && currentOrganization && (
        <ProductHistoryDialog
          isOpen={showProductHistory}
          onClose={() => setShowProductHistory(false)}
          productId={selectedProductForHistory.id}
          productName={selectedProductForHistory.name}
          organizationId={currentOrganization.id}
        />
      )}

      {/* Product Relation Dialog (blocked deletion) */}
      <ProductRelationDialog
        open={relationDialog.open}
        onOpenChange={(open) => setRelationDialog(prev => ({ ...prev, open }))}
        productName={relationDialog.productName}
        relations={relationDialog.relations}
        onMarkInactive={handleMarkProductInactive}
        isMarkingInactive={isMarkingInactive}
      />

      {/* Desktop Context Menus */}
      {isDesktop && (
        <>
          <DesktopContextMenu
            isOpen={rowContextMenu.isOpen}
            position={rowContextMenu.position}
            items={rowContextMenu.contextData ? getProductContextMenuItems(rowContextMenu.contextData) : []}
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

      {/* Product Image Viewer */}
      <ProductImageViewer
        open={imageViewerOpen}
        onOpenChange={setImageViewerOpen}
        images={selectedProductImages.images}
        productName={selectedProductImages.productName}
      />

      {/* Product Image Uploader */}
      <ProductImageUploader
        open={imageUploaderOpen}
        onOpenChange={setImageUploaderOpen}
        productId={selectedProductImages.productId}
        productName={selectedProductImages.productName}
        existingImages={selectedProductImages.images}
        onImagesUpdated={handleImagesUpdated}
      />

      {/* Merge Products Dialog */}
      <MergeProductsDialog
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
        products={productRows
          .filter((p) => selectedProducts.has(p.product_id))
          .map((p) => ({
            product_id: p.product_id,
            product_name: p.product_name,
            category: p.category,
            brand: p.brand,
            style: p.style,
            color: p.color,
            total_stock: p.total_stock,
            variants: p.variants,
          }))}
        onMergeComplete={() => {
          setSelectedProducts(new Set());
          fetchProductVariants();
        }}
      />

      {/* Stock Import Dialog */}
      <Dialog open={showStockImportDialog} onOpenChange={(o) => {
        setShowStockImportDialog(o);
        if (!o) { setStockImportPreview([]); setStockImportFile(null); }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-emerald-600" />
              Import Closing Stock
            </DialogTitle>
            <DialogDescription>
              Export the stock template, fill in the "New Stock Qty" column, then import.
              Only rows with changed quantities will be updated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto py-2">
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">1</div>
              <div className="flex-1">
                <p className="text-sm font-medium">Download Stock Template</p>
                <p className="text-xs text-muted-foreground">Get Excel with all products. Edit "New Stock Qty" column only.</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={handleExportStockTemplate}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </div>

            <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200">
              <div className="w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-bold shrink-0">2</div>
              <div className="flex-1">
                <p className="text-sm font-medium">Upload Filled Template</p>
                <p className="text-xs text-muted-foreground">
                  {stockImportFile ? `📄 ${stockImportFile.name}` : "Upload the Excel file after filling stock quantities."}
                </p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => stockImportFileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Choose File
              </Button>
              <input
                ref={stockImportFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleStockImportFile(f); e.target.value = ''; }}
              />
            </div>

            {stockImportPreview.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-emerald-700">{stockImportPreview.length} variants to update</p>
                  <p className="text-xs text-muted-foreground">Only changed quantities shown</p>
                </div>
                <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="text-xs">Barcode</TableHead>
                        <TableHead className="text-xs">Product</TableHead>
                        <TableHead className="text-xs text-center">Size</TableHead>
                        <TableHead className="text-xs text-right">Current</TableHead>
                        <TableHead className="text-xs text-right text-emerald-700">New Qty</TableHead>
                        <TableHead className="text-xs text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockImportPreview.slice(0, 200).map((item, i) => {
                        const diff = item.new_qty - item.current_qty;
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-mono">{item.barcode}</TableCell>
                            <TableCell className="text-xs font-medium truncate max-w-[150px]">{item.product_name}</TableCell>
                            <TableCell className="text-xs text-center">{item.size}</TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground">{item.current_qty}</TableCell>
                            <TableCell className="text-xs text-right font-bold text-emerald-700">{item.new_qty}</TableCell>
                            <TableCell className={`text-xs text-right font-semibold ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {diff > 0 ? '+' : ''}{diff}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {stockImportPreview.length > 200 && (
                  <p className="text-xs text-muted-foreground text-center">Showing first 200 of {stockImportPreview.length}</p>
                )}
              </div>
            )}

            {stockImporting && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Updating stock...</span>
                  <span>{stockImportProgress.done} / {stockImportProgress.total}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-emerald-600 h-2 rounded-full transition-all"
                    style={{ width: `${stockImportProgress.total > 0 ? (stockImportProgress.done / stockImportProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              ⚠️ This sets closing/opening stock. Stock movements will be recorded for audit.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowStockImportDialog(false)}>Cancel</Button>
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={stockImportPreview.length === 0 || stockImporting}
                onClick={handleApplyStockImport}
              >
                {stockImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Apply {stockImportPreview.length > 0 ? `(${stockImportPreview.length})` : ''} Updates
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductDashboard;
