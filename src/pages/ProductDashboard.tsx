import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Package, Search, Download, Upload, Filter, Plus, MoreHorizontal, Home, ChevronDown, ChevronRight, X, Trash2, Settings2, Barcode, RefreshCw, Eye, Edit, ShoppingCart, History, Ban } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
}

const ProductDashboard = () => {
  const { toast } = useToast();
  const { navigate } = useOrgNavigation();
  const { currentOrganization } = useOrganization();
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
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
        onClick: () => {
          const barcodeItems = product.variants.map(variant => ({
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
      {
        label: "Delete Product",
        icon: Trash2,
        onClick: () => {
          setSelectedProducts(new Set([product.product_id]));
          setShowBulkDeleteDialog(true);
        },
        destructive: true,
      },
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

  useEffect(() => {
    fetchProductVariants();
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

  const fetchProductVariants = async () => {
    setLoading(true);
    try {
      // Fetch ALL products using pagination to bypass 1000 row limit
      const allProducts: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("products")
          .select(`
            id,
            product_name,
            product_type,
            category,
            brand,
            style,
            color,
            hsn_code,
            image_url,
            gst_per,
            default_pur_price,
            default_sale_price,
            status,
            product_variants (
              id,
              size,
              color,
              barcode,
              pur_price,
              sale_price,
              mrp,
              stock_qty
            )
          `)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allProducts.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      const data = allProducts;

      const rows: ProductRow[] = (data || []).map((product: any) => {
        // Filter out deleted variants
        const activeVariants = (product.product_variants || []).filter((v: any) => !v.deleted_at);
        const variants: ProductVariant[] = activeVariants.map((v: any) => ({
          variant_id: v.id,
          size: v.size,
          color: v.color || "",
          barcode: v.barcode || "",
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          mrp: v.mrp || 0,
          stock_qty: v.stock_qty,
        }));

        const total_stock = variants.reduce((sum, v) => sum + v.stock_qty, 0);
        
        // Get unique colors from variants, or fallback to product color
        const variantColors = [...new Set(variants.map(v => v.color).filter(Boolean))];
        const displayColor = variantColors.length > 0 ? variantColors.join(', ') : (product.color || "");

        return {
          product_id: product.id,
          product_name: product.product_name,
          product_type: product.product_type || "",
          category: product.category || "",
          brand: product.brand || "",
          style: product.style || "",
          color: displayColor,
          image_url: product.image_url,
          hsn_code: product.hsn_code || "",
          gst_per: product.gst_per || 0,
          default_pur_price: product.default_pur_price || 0,
          default_sale_price: product.default_sale_price || 0,
          status: product.status || "active",
          variants,
          total_stock,
        };
      });

      setProductRows(rows);
      
      // Extract unique categories
      const uniqueCategories = Array.from(
        new Set(rows.map(r => r.category).filter(c => c && c.trim() !== ""))
      ).sort();
      setCategories(uniqueCategories);

      // Extract unique product types
      const uniqueProductTypes = Array.from(
        new Set((data || []).map((p: any) => p.product_type).filter((t: string) => t && t.trim() !== ""))
      ).sort();
      setProductTypes(uniqueProductTypes);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load products",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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

  const toggleExpanded = (productId: string) => {
    setExpandedProduct(expandedProduct === productId ? null : productId);
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

  const hasActiveFilters =
    selectedCategory !== "all" || 
    selectedProductType !== "all" ||
    selectedSizeGroup !== "all" || 
    selectedStockLevel !== "all" || 
    minPrice !== "" || 
    maxPrice !== "" ||
    searchQuery !== "";

  const filteredRows = productRows.filter((row) => {
    const searchLower = searchQuery.toLowerCase();
    
    // Search filter - includes barcode search in variants
    const matchesBasicSearch = 
      row.product_name.toLowerCase().includes(searchLower) ||
      row.brand?.toLowerCase().includes(searchLower) ||
      row.category?.toLowerCase().includes(searchLower) ||
      row.color?.toLowerCase().includes(searchLower) ||
      row.style?.toLowerCase().includes(searchLower);
    
    // Check barcode in variants
    const matchesBarcodeSearch = row.variants.some(variant => 
      variant.barcode?.toLowerCase().includes(searchLower)
    );
    
    const matchesSearch = matchesBasicSearch || matchesBarcodeSearch;
    
    if (!matchesSearch) return false;

    // Category filter
    if (selectedCategory !== "all" && row.category !== selectedCategory) {
      return false;
    }

    // Product Type filter
    if (selectedProductType !== "all" && row.product_type !== selectedProductType) {
      return false;
    }

    // Stock level filter
    if (selectedStockLevel !== "all") {
      if (selectedStockLevel === "out_of_stock" && row.total_stock > 0) return false;
      if (selectedStockLevel === "low_stock" && (row.total_stock === 0 || row.total_stock > 10)) return false;
      if (selectedStockLevel === "in_stock" && row.total_stock <= 0) return false;
    }

    // Price range filter (checking sale_price of variants)
    const min = minPrice ? parseFloat(minPrice) : null;
    const max = maxPrice ? parseFloat(maxPrice) : null;
    
    if (min !== null || max !== null) {
      const hasVariantInRange = row.variants.some(v => {
        const price = v.sale_price;
        if (min !== null && price < min) return false;
        if (max !== null && price > max) return false;
        return true;
      });
      
      if (!hasVariantInRange) return false;
    }

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRows = filteredRows.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate totals from filtered products
  const totalStockQty = filteredRows.reduce((sum, product) => 
    sum + product.variants.reduce((vSum, variant) => vSum + variant.stock_qty, 0), 0
  );
  
  const totalItems = filteredRows.reduce((sum, product) => sum + product.variants.length, 0);
  
  const totalPurchaseValue = filteredRows.reduce((sum, product) => 
    sum + product.variants.reduce((vSum, variant) => 
      vSum + (variant.stock_qty * variant.pur_price), 0
    ), 0
  );
  
  const totalSaleValue = filteredRows.reduce((sum, product) => 
    sum + product.variants.reduce((vSum, variant) => 
      vSum + (variant.stock_qty * variant.sale_price), 0
    ), 0
  );

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
            <h1 className="text-2xl font-bold text-foreground">Product</h1>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Stock Qty</p>
                  <p className="text-2xl font-bold text-foreground">{totalStockQty.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="text-2xl font-bold text-foreground">{totalItems.toLocaleString()}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Purchase Value</p>
                  <p className="text-2xl font-bold text-foreground">₹{totalPurchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Sale Value</p>
                  <p className="text-2xl font-bold text-foreground">₹{totalSaleValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Package className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <Card className="mb-4">
          <CardContent className="p-4">
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Settings2 className="h-4 w-4" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48 bg-popover z-50">
                    <div className="p-2 space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">Toggle Columns</Label>
                      {[
                        { key: 'image', label: 'Image' },
                        { key: 'productName', label: 'Product Name' },
                        { key: 'category', label: 'Category' },
                        { key: 'brand', label: 'Brand' },
                        { key: 'style', label: 'Style' },
                        { key: 'color', label: 'Color' },
                        { key: 'hsn', label: 'HSN Code' },
                        { key: 'gst', label: 'GST %' },
                        { key: 'purPrice', label: 'Def. Pur Price' },
                        { key: 'salePrice', label: 'Def. Sale Price' },
                        { key: 'status', label: 'Status' },
                        { key: 'totalQty', label: 'Total Qty' },
                        { key: 'variants', label: 'Variants' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-2">
                          <Checkbox
                            id={`col-${key}`}
                            checked={columnVisibility[key as keyof typeof columnVisibility]}
                            onCheckedChange={() => toggleColumnVisibility(key as keyof typeof columnVisibility)}
                          />
                          <Label htmlFor={`col-${key}`} className="text-sm cursor-pointer">{label}</Label>
                        </div>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, brand, barcode..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate("/product-entry")}
                >
                  <Plus className="h-4 w-4" />
                  Create New
                </Button>
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
                      <SelectItem value="low_stock">Low Stock (≤10)</SelectItem>
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
          <Card className="mb-4 border-primary/50">
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
                    onClick={() => {
                      // Get all variants from selected products
                      const selectedProductData = productRows.filter(p => selectedProducts.has(p.product_id));
                      const barcodeItems = selectedProductData.flatMap(product => 
                        product.variants.map(variant => ({
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
                        }))
                      );
                      navigate("/barcode-printing", { state: { purchaseItems: barcodeItems } });
                    }}
                    className="gap-2"
                  >
                    <Barcode className="h-4 w-4" />
                    Generate Barcode
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowBulkDeleteDialog(true)}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Selected
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {filteredRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No products found</p>
                <p className="text-sm">Add your first product to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedProducts.size === paginatedRows.length && paginatedRows.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-16 text-center">Sr. No.</TableHead>
                      {columnVisibility.image && <TableHead className="w-20">Image</TableHead>}
                      {columnVisibility.productName && <TableHead>Product Name</TableHead>}
                      {columnVisibility.category && <TableHead>Category</TableHead>}
                      {columnVisibility.brand && <TableHead>Brand</TableHead>}
                      {columnVisibility.style && <TableHead>Style</TableHead>}
                      {columnVisibility.color && <TableHead>Color</TableHead>}
                      {columnVisibility.hsn && <TableHead>HSN</TableHead>}
                      {columnVisibility.gst && <TableHead className="text-right">GST%</TableHead>}
                      {columnVisibility.purPrice && <TableHead className="text-right">Def. Pur Price</TableHead>}
                      {columnVisibility.salePrice && <TableHead className="text-right">Def. Sale Price</TableHead>}
                      {columnVisibility.status && <TableHead>Status</TableHead>}
                      {columnVisibility.totalQty && <TableHead className="text-right">Total Qty</TableHead>}
                      {columnVisibility.variants && <TableHead className="text-center">Variants</TableHead>}
                      <TableHead className="w-16">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
              <TableBody>
                {paginatedRows.map((row, index) => (
                      <>
                        <TableRow
                          key={row.product_id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleExpanded(row.product_id)}
                          onContextMenu={(e) => handleRowContextMenu(e, row)}
                        >
                          <TableCell>
                            {expandedProduct === row.product_id ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedProducts.has(row.product_id)}
                              onCheckedChange={() => toggleSelectProduct(row.product_id)}
                            />
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {startIndex + index + 1}
                          </TableCell>
                          {columnVisibility.image && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <ProductImageGallery
                              key={`${row.product_id}-${galleryRefreshKey}`}
                              productId={row.product_id}
                              productName={row.product_name}
                              fallbackImageUrl={row.image_url}
                              onImageClick={handleImageClick}
                              onAddClick={handleAddImageClick}
                            />
                          </TableCell>
                          )}
                          {columnVisibility.productName && (
                            <TableCell className="font-medium">
                              <span 
                                className="cursor-pointer text-primary hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProductForHistory({ id: row.product_id, name: row.product_name });
                                  setShowProductHistory(true);
                                }}
                              >
                                {row.product_name}
                              </span>
                            </TableCell>
                          )}
                          {columnVisibility.category && <TableCell>{row.category || "—"}</TableCell>}
                          {columnVisibility.brand && <TableCell>{row.brand || "—"}</TableCell>}
                          {columnVisibility.style && <TableCell>{row.style || "—"}</TableCell>}
                          {columnVisibility.color && <TableCell>{row.color || "—"}</TableCell>}
                          {columnVisibility.hsn && <TableCell className="text-xs">{row.hsn_code || "—"}</TableCell>}
                          {columnVisibility.gst && <TableCell className="text-right">{row.gst_per}%</TableCell>}
                          {columnVisibility.purPrice && <TableCell className="text-right">₹{row.default_pur_price.toFixed(2)}</TableCell>}
                          {columnVisibility.salePrice && <TableCell className="text-right">₹{row.default_sale_price.toFixed(2)}</TableCell>}
                          {columnVisibility.status && (
                          <TableCell>
                            <Badge variant={row.status === "active" ? "default" : "secondary"}>
                              {row.status}
                            </Badge>
                          </TableCell>
                          )}
                          {columnVisibility.totalQty && (
                          <TableCell className="text-right font-medium">
                            {row.total_stock}
                          </TableCell>
                          )}
                          {columnVisibility.variants && (
                          <TableCell className="text-center">
                            <Badge variant="secondary">{row.variants.length}</Badge>
                          </TableCell>
                          )}
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/product-entry?id=${row.product_id}`);
                                  }}
                                >
                                  Edit Product
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const result = await getProductRelationDetails(row.product_id);
                                    if (result.hasTransactions) {
                                      setRelationDialog({
                                        open: true,
                                        productName: row.product_name,
                                        productId: row.product_id,
                                        relations: result.relations,
                                      });
                                    } else {
                                      setSelectedProducts(new Set([row.product_id]));
                                      setShowBulkDeleteDialog(true);
                                    }
                                  }}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Variants Row */}
                        {expandedProduct === row.product_id && row.variants.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={visibleColumnCount} className="bg-muted/20 p-0">
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
                                          <TableCell className="font-mono text-xs">
                                            {variant.barcode || "—"}
                                          </TableCell>
                                          <TableCell>{variant.color || "—"}</TableCell>
                                          <TableCell className="text-right">
                                            ₹{variant.pur_price.toFixed(2)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            ₹{variant.sale_price.toFixed(2)}
                                          </TableCell>
                                          {showMrp && (
                                            <TableCell className="text-right">
                                              ₹{variant.mrp.toFixed(2)}
                                            </TableCell>
                                          )}
                                          <TableCell className="text-right font-medium">
                                            {variant.stock_qty}
                                          </TableCell>
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination Controls */}
        {filteredRows.length > 0 && (
          <Card className="mt-4">
            <CardContent className="p-4">
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
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredRows.length)} of {filteredRows.length} products
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
                    disabled={currentPage === totalPages}
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
    </div>
  );
};

export default ProductDashboard;
