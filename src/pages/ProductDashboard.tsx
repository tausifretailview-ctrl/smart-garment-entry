import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, Package, Search, Download, Upload, Filter, Plus, MoreHorizontal, Home, ChevronDown, ChevronRight, X, Trash2 } from "lucide-react";
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

interface ProductVariant {
  variant_id: string;
  size: string;
  barcode: string;
  pur_price: number;
  sale_price: number;
  stock_qty: number;
}

interface ProductRow {
  product_id: string;
  product_name: string;
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
  const navigate = useNavigate();
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSizeGroup, setSelectedSizeGroup] = useState<string>("all");
  const [selectedStockLevel, setSelectedStockLevel] = useState<string>("all");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  
  // Data for filter options
  const [sizeGroups, setSizeGroups] = useState<Array<{ id: string; group_name: string }>>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Selection and pagination states
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  useEffect(() => {
    fetchProductVariants();
    fetchSizeGroups();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedSizeGroup, selectedStockLevel, minPrice, maxPrice, itemsPerPage]);

  const fetchProductVariants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id,
          product_name,
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
            barcode,
            pur_price,
            sale_price,
            stock_qty
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows: ProductRow[] = (data || []).map((product: any) => {
        const variants: ProductVariant[] = (product.product_variants || []).map((v: any) => ({
          variant_id: v.id,
          size: v.size,
          barcode: v.barcode || "",
          pur_price: v.pur_price,
          sale_price: v.sale_price,
          stock_qty: v.stock_qty,
        }));

        const total_stock = variants.reduce((sum, v) => sum + v.stock_qty, 0);

        return {
          product_id: product.id,
          product_name: product.product_name,
          category: product.category || "",
          brand: product.brand || "",
          style: product.style || "",
          color: product.color || "",
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

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    try {
      const productsToDelete = Array.from(selectedProducts);
      
      for (const productId of productsToDelete) {
        // Delete related records first
        
        // 1. Delete batch_stock records
        const { data: variants } = await supabase
          .from("product_variants")
          .select("id")
          .eq("product_id", productId);

        if (variants && variants.length > 0) {
          const variantIds = variants.map(v => v.id);
          
          // Delete batch stock for these variants
          await supabase
            .from("batch_stock")
            .delete()
            .in("variant_id", variantIds);

          // Delete stock movements for these variants
          await supabase
            .from("stock_movements")
            .delete()
            .in("variant_id", variantIds);
        }

        // 2. Delete purchase items
        await supabase
          .from("purchase_items")
          .delete()
          .eq("product_id", productId);

        // 3. Delete sale items
        await supabase
          .from("sale_items")
          .delete()
          .eq("product_id", productId);

        // 4. Delete variants
        const { error: variantsError } = await supabase
          .from("product_variants")
          .delete()
          .eq("product_id", productId);

        if (variantsError) throw variantsError;

        // 5. Finally delete product
        const { error: productError } = await supabase
          .from("products")
          .delete()
          .eq("id", productId);

        if (productError) throw productError;
      }

      toast({
        title: "Success",
        description: `${productsToDelete.length} product(s) permanently deleted`,
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

  // Calculate totals
  const totalStockQty = productRows.reduce((sum, product) => 
    sum + product.variants.reduce((vSum, variant) => vSum + variant.stock_qty, 0), 0
  );
  
  const totalItems = productRows.reduce((sum, product) => sum + product.variants.length, 0);
  
  const totalPurchaseValue = productRows.reduce((sum, product) => 
    sum + product.variants.reduce((vSum, variant) => 
      vSum + (variant.stock_qty * variant.pur_price), 0
    ), 0
  );
  
  const totalSaleValue = productRows.reduce((sum, product) => 
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
                      {[selectedCategory !== "all", selectedSizeGroup !== "all", selectedStockLevel !== "all", minPrice !== "", maxPrice !== ""].filter(Boolean).length}
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                      <TableHead className="w-20">Image</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Style</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>HSN</TableHead>
                      <TableHead className="text-right">GST%</TableHead>
                      <TableHead className="text-right">Def. Pur Price</TableHead>
                      <TableHead className="text-right">Def. Sale Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-center">Variants</TableHead>
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
                          <TableCell>
                            <Avatar className="h-12 w-12 rounded">
                              <AvatarImage
                                src={row.image_url}
                                alt={row.product_name}
                                className="object-cover"
                              />
                              <AvatarFallback className="rounded bg-muted">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell className="font-medium">{row.product_name}</TableCell>
                          <TableCell>{row.category || "—"}</TableCell>
                          <TableCell>{row.brand || "—"}</TableCell>
                          <TableCell>{row.style || "—"}</TableCell>
                          <TableCell>{row.color || "—"}</TableCell>
                          <TableCell className="text-xs">{row.hsn_code || "—"}</TableCell>
                          <TableCell className="text-right">{row.gst_per}%</TableCell>
                          <TableCell className="text-right">₹{row.default_pur_price.toFixed(2)}</TableCell>
                          <TableCell className="text-right">₹{row.default_sale_price.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={row.status === "active" ? "default" : "secondary"}>
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {row.total_stock}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{row.variants.length}</Badge>
                          </TableCell>
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
                                <DropdownMenuItem className="text-destructive">
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Variants Row */}
                        {expandedProduct === row.product_id && row.variants.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={17} className="bg-muted/20 p-0">
                              <div className="p-4">
                                <h4 className="font-semibold text-sm mb-3">Product Variants Details</h4>
                                <div className="border rounded-lg overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/30">
                                        <TableHead>Size</TableHead>
                                        <TableHead>Barcode</TableHead>
                                        <TableHead className="text-right">Purchase Price</TableHead>
                                        <TableHead className="text-right">Sale Price</TableHead>
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
                                          <TableCell className="text-right">
                                            ₹{variant.pur_price.toFixed(2)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            ₹{variant.sale_price.toFixed(2)}
                                          </TableCell>
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
    </div>
  );
};

export default ProductDashboard;
