import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Package, TrendingDown, History, Search, Filter, ChevronDown, ChevronUp, Grid3X3, IndianRupee } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface StockItem {
  id: string;
  product_name: string;
  brand: string;
  color: string;
  size: string;
  stock_qty: number;
  opening_qty: number;
  purchase_qty: number;
  sales_qty: number;
  sale_price: number;
  pur_price: number | null;
  barcode: string;
  supplier_name: string;
  supplier_invoice_no: string;
}

interface StockMovement {
  id: string;
  movement_type: string;
  quantity: number;
  notes: string;
  created_at: string;
  variant_id: string;
  product_name: string;
  size: string;
}

interface BatchStock {
  id: string;
  bill_number: string;
  quantity: number;
  purchase_date: string;
  variant_id: string;
  product_name: string;
  brand: string;
  size: string;
  barcode: string;
  supplier_name: string;
  supplier_invoice_no: string;
}

interface SizeWiseRow {
  productKey: string;
  productName: string;
  brand: string;
  color: string;
  sizeStocks: Record<string, number>;
  totalStock: number;
}

export default function StockReport() {
  const { currentOrganization } = useOrganization();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [batchStock, setBatchStock] = useState<BatchStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [colorFilter, setColorFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [supplierInvoiceFilter, setSupplierInvoiceFilter] = useState<string>("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchSettings();
      fetchStockData();
      fetchMovements();
      fetchBatchStock();
    }
  }, [currentOrganization?.id]);

  const fetchSettings = async () => {
    if (!currentOrganization?.id) return;
    try {
      const { data } = await supabase
        .from("settings" as any)
        .select("product_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();
      
      const settingsData = data as any;
      if (settingsData?.product_settings?.low_stock_threshold) {
        setLowStockThreshold(settingsData.product_settings.low_stock_threshold);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const fetchStockData = async () => {
    if (!currentOrganization?.id) return;
    
    try {
      // Fetch ALL product variants using pagination to bypass 1000 row limit
      const allVariants: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("product_variants")
          .select(`
            id,
            size,
            color,
            stock_qty,
            opening_qty,
            sale_price,
            pur_price,
            barcode,
            products!inner (
              product_name,
              brand,
              color,
              product_type
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .neq("products.product_type", "service")
          .order("stock_qty", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allVariants.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      const data = allVariants;

      // Fetch ALL stock movements using pagination
      const allMovements: any[] = [];
      offset = 0;
      hasMore = true;
      
      while (hasMore) {
        const { data: movementsData, error: movementsError } = await supabase
          .from("stock_movements")
          .select("variant_id, movement_type, quantity")
          .range(offset, offset + PAGE_SIZE - 1);

        if (movementsError) throw movementsError;
        
        if (movementsData && movementsData.length > 0) {
          allMovements.push(...movementsData);
          offset += PAGE_SIZE;
          hasMore = movementsData.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      const movementsData = allMovements;

      // Fetch ALL batch stock with supplier info using pagination
      const allBatchData: any[] = [];
      offset = 0;
      hasMore = true;
      
      while (hasMore) {
        const { data: batchData, error: batchError } = await supabase
          .from("batch_stock")
          .select(`
            variant_id,
            purchase_bills (
              supplier_name,
              supplier_invoice_no
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .range(offset, offset + PAGE_SIZE - 1);

        if (batchError) throw batchError;
        
        if (batchData && batchData.length > 0) {
          allBatchData.push(...batchData);
          offset += PAGE_SIZE;
          hasMore = batchData.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      const batchData = allBatchData;

      // Map variant_id to supplier names and invoice numbers (take the first/most recent supplier)
      const variantSuppliers = (batchData || []).reduce((acc: any, batch: any) => {
        if (!acc[batch.variant_id] && batch.purchase_bills?.supplier_name) {
          acc[batch.variant_id] = {
            supplier_name: batch.purchase_bills.supplier_name,
            supplier_invoice_no: batch.purchase_bills.supplier_invoice_no || ''
          };
        }
        return acc;
      }, {});

      // Calculate purchase and sales quantities per variant
      const variantMovements = (movementsData || []).reduce((acc: any, movement: any) => {
        if (!acc[movement.variant_id]) {
          acc[movement.variant_id] = { purchase: 0, sales: 0 };
        }
        
        if (movement.movement_type === 'purchase') {
          acc[movement.variant_id].purchase += movement.quantity;
        } else if (movement.movement_type === 'sale') {
          // Sales are stored as negative in stock_movements
          acc[movement.variant_id].sales += Math.abs(movement.quantity);
        }
        
        return acc;
      }, {});

      const formattedData = data?.map((item: any) => {
        const movements = variantMovements[item.id] || { purchase: 0, sales: 0 };
        const supplierInfo = variantSuppliers[item.id] || { supplier_name: '', supplier_invoice_no: '' };
        
        return {
          id: item.id,
          product_name: item.products?.product_name || "",
          brand: item.products?.brand || "",
          color: item.color || item.products?.color || "",
          size: item.size,
          stock_qty: item.stock_qty,
          opening_qty: item.opening_qty || 0,
          purchase_qty: movements.purchase,
          sales_qty: movements.sales,
          sale_price: item.sale_price,
          pur_price: item.pur_price || null,
          barcode: item.barcode || "",
          supplier_name: supplierInfo.supplier_name || "",
          supplier_invoice_no: supplierInfo.supplier_invoice_no || "",
        };
      }) || [];

      setStockItems(formattedData);
    } catch (error) {
      console.error("Error fetching stock data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async () => {
    if (!currentOrganization?.id) return;
    
    try {
      // Fetch ALL stock movements using pagination to bypass 1000 row limit
      const allMovements: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("stock_movements")
          .select(`
            id,
            movement_type,
            quantity,
            notes,
            created_at,
            variant_id,
            product_variants!inner (
              size,
              products!inner (
                product_name,
                product_type
              )
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .neq("product_variants.products.product_type", "service")
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        
        if (data && data.length > 0) {
          allMovements.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      const data = allMovements;

      const formattedData = data?.map((item: any) => ({
        id: item.id,
        movement_type: item.movement_type,
        quantity: item.quantity,
        notes: item.notes || "",
        created_at: item.created_at,
        variant_id: item.variant_id,
        product_name: item.product_variants?.products?.product_name || "",
        size: item.product_variants?.size || "",
      })) || [];

      setMovements(formattedData);
    } catch (error) {
      console.error("Error fetching movements:", error);
    }
  };

  const fetchBatchStock = async () => {
    if (!currentOrganization?.id) return;
    
    try {
      // Fetch ALL batch stock using pagination to bypass 1000 row limit
      const allBatchStock: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('batch_stock')
          .select(`
            *,
            product_variants!inner (
              size,
              barcode,
              products!inner (
                product_name,
                brand,
                product_type
              )
            ),
            purchase_bills (
              supplier_name,
              supplier_invoice_no
            )
          `)
          .eq('organization_id', currentOrganization.id)
          .gt('quantity', 0)
          .neq('product_variants.products.product_type', 'service')
          .order('purchase_date', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allBatchStock.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      const data = allBatchStock;

      const formattedData: BatchStock[] = (data || []).map((item: any) => ({
        id: item.id,
        bill_number: item.bill_number,
        quantity: item.quantity,
        purchase_date: item.purchase_date,
        variant_id: item.variant_id,
        product_name: item.product_variants?.products?.product_name || '',
        brand: item.product_variants?.products?.brand || '',
        size: item.product_variants?.size || '',
        barcode: item.product_variants?.barcode || '',
        supplier_name: item.purchase_bills?.supplier_name || '',
        supplier_invoice_no: item.purchase_bills?.supplier_invoice_no || '',
      }));

      setBatchStock(formattedData);
    } catch (error) {
      console.error('Error fetching batch stock:', error);
    }
  };

  // Get unique values for filters
  const uniqueBrands = useMemo(() => [...new Set(stockItems.map(i => i.brand).filter(Boolean))].sort(), [stockItems]);
  const uniqueColors = useMemo(() => [...new Set(stockItems.map(i => i.color).filter(Boolean))].sort(), [stockItems]);
  const uniqueSuppliers = useMemo(() => [...new Set(stockItems.map(i => i.supplier_name).filter(Boolean))].sort(), [stockItems]);
  const uniqueSupplierInvoices = useMemo(() => [...new Set(stockItems.map(i => i.supplier_invoice_no).filter(Boolean))].sort(), [stockItems]);

  // Filter data based on search term and filters
  const filteredStockItems = useMemo(() => {
    return stockItems.filter(item => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = (
          item.product_name.toLowerCase().includes(search) ||
          item.brand.toLowerCase().includes(search) ||
          item.color.toLowerCase().includes(search) ||
          item.size.toLowerCase().includes(search) ||
          item.barcode.toLowerCase().includes(search) ||
          item.supplier_name.toLowerCase().includes(search) ||
          item.supplier_invoice_no.toLowerCase().includes(search)
        );
        if (!matchesSearch) return false;
      }
      
      // Brand filter
      if (brandFilter !== "all" && item.brand !== brandFilter) return false;
      
      // Color filter
      if (colorFilter !== "all" && item.color !== colorFilter) return false;
      
      // Supplier filter
      if (supplierFilter !== "all" && item.supplier_name !== supplierFilter) return false;
      
      // Supplier Invoice filter
      if (supplierInvoiceFilter !== "all" && item.supplier_invoice_no !== supplierInvoiceFilter) return false;
      
      // Stock status filter
      if (stockStatusFilter === "out" && item.stock_qty !== 0) return false;
      if (stockStatusFilter === "low" && (item.stock_qty === 0 || item.stock_qty > lowStockThreshold)) return false;
      if (stockStatusFilter === "in" && item.stock_qty <= lowStockThreshold) return false;
      
      return true;
    });
  }, [stockItems, searchTerm, brandFilter, colorFilter, supplierFilter, supplierInvoiceFilter, stockStatusFilter, lowStockThreshold]);

  const filteredBatchStock = useMemo(() => {
    return batchStock.filter(item => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = (
          item.product_name.toLowerCase().includes(search) ||
          item.brand.toLowerCase().includes(search) ||
          item.size.toLowerCase().includes(search) ||
          item.barcode.toLowerCase().includes(search) ||
          item.bill_number.toLowerCase().includes(search) ||
          item.supplier_name.toLowerCase().includes(search) ||
          item.supplier_invoice_no.toLowerCase().includes(search)
        );
        if (!matchesSearch) return false;
      }
      
      // Supplier Invoice filter
      if (supplierInvoiceFilter !== "all" && item.supplier_invoice_no !== supplierInvoiceFilter) return false;
      
      return true;
    });
  }, [batchStock, searchTerm, supplierInvoiceFilter]);

  const filteredMovements = useMemo(() => {
    return movements.filter(item => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        item.product_name.toLowerCase().includes(search) ||
        item.size.toLowerCase().includes(search) ||
        item.movement_type.toLowerCase().includes(search) ||
        item.notes?.toLowerCase().includes(search)
      );
    });
  }, [movements, searchTerm]);

  // Size-wise stock report data
  const sizeWiseData = useMemo(() => {
    // Get all unique sizes across all products
    const allSizes = [...new Set(filteredStockItems.map(i => i.size))].sort();
    
    // Group by product key (name + brand + color)
    const productMap = new Map<string, SizeWiseRow>();
    
    filteredStockItems.forEach(item => {
      const productKey = `${item.product_name}-${item.brand}-${item.color}`;
      
      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          productKey,
          productName: item.product_name,
          brand: item.brand,
          color: item.color,
          sizeStocks: {},
          totalStock: 0
        });
      }
      
      const row = productMap.get(productKey)!;
      row.sizeStocks[item.size] = (row.sizeStocks[item.size] || 0) + item.stock_qty;
      row.totalStock += item.stock_qty;
    });
    
    return {
      sizes: allSizes,
      rows: Array.from(productMap.values()).sort((a, b) => a.productName.localeCompare(b.productName))
    };
  }, [filteredStockItems]);

  // Calculate totals for size-wise report
  const sizeWiseTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    
    sizeWiseData.rows.forEach(row => {
      sizeWiseData.sizes.forEach(size => {
        totals[size] = (totals[size] || 0) + (row.sizeStocks[size] || 0);
      });
      grandTotal += row.totalStock;
    });
    
    return { sizeTotals: totals, grandTotal };
  }, [sizeWiseData]);

  const lowStockItems = filteredStockItems.filter(item => item.stock_qty <= lowStockThreshold);
  const totalStock = filteredStockItems.reduce((sum, item) => sum + item.stock_qty, 0);
  const totalStockValue = filteredStockItems.reduce((sum, item) => sum + (item.pur_price || 0) * item.stock_qty, 0);

  const clearFilters = () => {
    setSearchTerm("");
    setBrandFilter("all");
    setColorFilter("all");
    setSupplierFilter("all");
    setSupplierInvoiceFilter("all");
    setStockStatusFilter("all");
  };

  const hasActiveFilters = brandFilter !== "all" || colorFilter !== "all" || supplierFilter !== "all" || supplierInvoiceFilter !== "all" || stockStatusFilter !== "all";

  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="text-lg font-medium">Loading Stock Report...</span>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <BackToDashboard />
      <div>
        <h1 className="text-3xl font-bold">Stock Report</h1>
        <p className="text-muted-foreground">Monitor inventory levels and stock movements</p>
      </div>

      {/* Search Bar with Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by supplier, product name, barcode, brand, color, size, bill number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="h-11 gap-2">
                <Filter className="h-4 w-4" />
                Filters
                {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">!</Badge>}
                {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="h-11">
              Clear
            </Button>
          )}
        </div>
        
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleContent>
            <Card className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Brand</label>
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Brands" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Brands</SelectItem>
                      {uniqueBrands.map(brand => (
                        <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Color</label>
                  <Select value={colorFilter} onValueChange={setColorFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Colors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Colors</SelectItem>
                      {uniqueColors.map(color => (
                        <SelectItem key={color} value={color}>{color}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Supplier</label>
                  <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Suppliers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Suppliers</SelectItem>
                      {uniqueSuppliers.map(supplier => (
                        <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Supplier Invoice</label>
                  <Select value={supplierInvoiceFilter} onValueChange={setSupplierInvoiceFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Invoices" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Invoices</SelectItem>
                      {uniqueSupplierInvoices.map(invoice => (
                        <SelectItem key={invoice} value={invoice}>{invoice}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Stock Status</label>
                  <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="in">In Stock</SelectItem>
                      <SelectItem value="low">Low Stock</SelectItem>
                      <SelectItem value="out">Out of Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="grid gap-4 md:grid-cols-5 mb-6">
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-violet-500 to-violet-600 border-0 shadow-lg"
          onClick={() => setActiveTab("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Total Stock</CardTitle>
            <Package className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{totalStock.toLocaleString('en-IN')}</div>
            <p className="text-xs text-white/70">{stockItems.length} variants</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Stock Value</CardTitle>
            <IndianRupee className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">₹{totalStockValue.toLocaleString('en-IN')}</div>
            <p className="text-xs text-white/70">Inventory valuation</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg"
          onClick={() => setActiveTab("low")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Low Stock Alerts</CardTitle>
            <AlertCircle className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{lowStockItems.length}</div>
            <p className="text-xs text-white/70">Below {lowStockThreshold} units</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-teal-500 to-teal-600 border-0 shadow-lg"
          onClick={() => setActiveTab("batch")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Active Batches</CardTitle>
            <TrendingDown className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{batchStock.length}</div>
            <p className="text-xs text-white/70">Purchase bills in stock</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-sky-500 to-sky-600 border-0 shadow-lg"
          onClick={() => setActiveTab("movements")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Recent Movements</CardTitle>
            <History className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{movements.length}</div>
            <p className="text-xs text-white/70">Last 50 transactions</p>
          </CardContent>
        </Card>
      </div>

      {lowStockItems.length > 0 && (
        <Alert variant="destructive" className="cursor-pointer" onClick={() => setActiveTab("low")}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Low Stock Alert</AlertTitle>
          <AlertDescription>
            {lowStockItems.length} product variant{lowStockItems.length > 1 ? 's' : ''} {lowStockItems.length > 1 ? 'are' : 'is'} running low on stock. Click to view details.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All Stock</TabsTrigger>
          <TabsTrigger value="sizewise" className="gap-1">
            <Grid3X3 className="h-4 w-4" />
            Size-wise
          </TabsTrigger>
          <TabsTrigger value="low">Low Stock</TabsTrigger>
          <TabsTrigger value="batch">Batch Stock</TabsTrigger>
          <TabsTrigger value="movements">Movement History</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Stock Levels</CardTitle>
              <CardDescription>
                Stock breakdown: Opening Qty + Purchase Qty - Sales Qty = Current Stock Qty
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Supplier Invoice</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead className="text-right bg-blue-50 dark:bg-blue-950">Opening Qty</TableHead>
                      <TableHead className="text-right bg-green-50 dark:bg-green-950">Purchase Qty</TableHead>
                      <TableHead className="text-right bg-red-50 dark:bg-red-950">Sales Qty</TableHead>
                      <TableHead className="text-right bg-primary/10 font-semibold">Current Stock</TableHead>
                      <TableHead className="text-right">Pur Price</TableHead>
                      <TableHead className="text-right">Stock Value</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStockItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                          No products found matching your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredStockItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-muted-foreground">{item.supplier_name || '—'}</TableCell>
                          <TableCell className="font-mono text-sm">{item.supplier_invoice_no || '—'}</TableCell>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell>{item.brand}</TableCell>
                          <TableCell>{item.size}</TableCell>
                          <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                          <TableCell className="text-right bg-blue-50 dark:bg-blue-950 font-medium">
                            {item.opening_qty}
                          </TableCell>
                          <TableCell className="text-right bg-green-50 dark:bg-green-950 font-medium text-green-700 dark:text-green-400">
                            +{item.purchase_qty}
                          </TableCell>
                          <TableCell className="text-right bg-red-50 dark:bg-red-950 font-medium text-red-700 dark:text-red-400">
                            -{item.sales_qty}
                          </TableCell>
                          <TableCell className="text-right bg-primary/10 font-bold text-primary">
                            {item.stock_qty}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.pur_price ? (
                              <span>₹{item.pur_price}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium text-primary">
                            {item.pur_price ? (
                              <span>₹{(item.pur_price * item.stock_qty).toLocaleString('en-IN')}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span>₹{item.sale_price}</span>
                          </TableCell>
                          <TableCell>
                            {item.stock_qty === 0 ? (
                              <Badge variant="destructive">Out of Stock</Badge>
                            ) : item.stock_qty <= lowStockThreshold ? (
                              <Badge variant="secondary">Low Stock</Badge>
                            ) : (
                              <Badge variant="outline">In Stock</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sizewise" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Grid3X3 className="h-5 w-5" />
                Size-wise Item Stock Report
              </CardTitle>
              <CardDescription>
                Product stock grouped by sizes - shows quantity per size with total
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sizeWiseData.rows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No products found matching your filters</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold min-w-[250px]">Product</TableHead>
                        {sizeWiseData.sizes.map(size => (
                          <TableHead key={size} className="text-center font-semibold min-w-[60px] bg-primary/10">
                            {size}
                          </TableHead>
                        ))}
                        <TableHead className="text-center font-bold min-w-[80px] bg-primary/20 text-primary">
                          Stock
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sizeWiseData.rows.map((row, index) => (
                        <TableRow key={row.productKey} className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{row.productName}</span>
                              {(row.brand || row.color) && (
                                <span className="text-xs text-muted-foreground">
                                  {[row.brand, row.color].filter(Boolean).join(' - ')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          {sizeWiseData.sizes.map(size => {
                            const qty = row.sizeStocks[size] || 0;
                            return (
                              <TableCell 
                                key={size} 
                                className={`text-center ${
                                  qty === 0 ? 'text-muted-foreground/50' : 
                                  'font-bold text-foreground bg-green-100 dark:bg-green-900/40'
                                }`}
                              >
                                {qty}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center font-bold text-primary bg-primary/10">
                            {row.totalStock}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Total Row */}
                      <TableRow className="bg-destructive/10 font-bold border-t-2">
                        <TableCell className="text-destructive font-bold">Total Stock</TableCell>
                        {sizeWiseData.sizes.map(size => (
                          <TableCell key={size} className="text-center text-destructive font-bold">
                            {sizeWiseTotals.sizeTotals[size] || 0}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-bold text-destructive bg-destructive/20">
                          {sizeWiseTotals.grandTotal}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="low" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-destructive" />
                Low Stock Items
              </CardTitle>
              <CardDescription>Products below {lowStockThreshold} units with stock breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {lowStockItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No low stock items</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Supplier Invoice</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead className="text-right bg-blue-50 dark:bg-blue-950">Opening Qty</TableHead>
                        <TableHead className="text-right bg-green-50 dark:bg-green-950">Purchase Qty</TableHead>
                        <TableHead className="text-right bg-red-50 dark:bg-red-950">Sales Qty</TableHead>
                        <TableHead className="text-right bg-primary/10 font-semibold">Current Stock</TableHead>
                        <TableHead className="text-right">Sale Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStockItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            {searchTerm ? "No low stock products found matching your search" : "No low stock items"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        lowStockItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-muted-foreground">{item.supplier_name || '—'}</TableCell>
                            <TableCell className="font-mono text-sm">{item.supplier_invoice_no || '—'}</TableCell>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell>{item.brand}</TableCell>
                            <TableCell>{item.size}</TableCell>
                            <TableCell className="text-right bg-blue-50 dark:bg-blue-950 font-medium">
                              {item.opening_qty}
                            </TableCell>
                            <TableCell className="text-right bg-green-50 dark:bg-green-950 font-medium text-green-700 dark:text-green-400">
                              +{item.purchase_qty}
                            </TableCell>
                            <TableCell className="text-right bg-red-50 dark:bg-red-950 font-medium text-red-700 dark:text-red-400">
                              -{item.sales_qty}
                            </TableCell>
                            <TableCell className="text-right bg-primary/10 font-bold text-destructive">
                              {item.stock_qty}
                            </TableCell>
                            <TableCell className="text-right">₹{item.sale_price}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Batch-wise Stock Details (By Purchase Bill)
              </CardTitle>
              <CardDescription>
                Stock grouped by purchase bills - FIFO order (oldest first)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {batchStock.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No batch stock data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Supplier Invoice</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Bill Number</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Purchase Date</TableHead>
                      <TableHead>Age (Days)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBatchStock.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No batch stock found matching your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredBatchStock.map((batch) => {
                      const ageInDays = Math.floor(
                        (Date.now() - new Date(batch.purchase_date).getTime()) / (1000 * 60 * 60 * 24)
                      );
                      
                      return (
                        <TableRow key={batch.id}>
                          <TableCell className="text-muted-foreground">{batch.supplier_name || '—'}</TableCell>
                          <TableCell className="font-mono text-sm">{batch.supplier_invoice_no || '—'}</TableCell>
                          <TableCell className="font-medium">
                            {batch.product_name}
                          </TableCell>
                          <TableCell>{batch.brand || '—'}</TableCell>
                          <TableCell>{batch.size}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {batch.barcode || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">
                              {batch.bill_number}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{batch.quantity}</TableCell>
                          <TableCell>
                            {new Date(batch.purchase_date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={ageInDays > 90 ? "destructive" : ageInDays > 60 ? "secondary" : "default"}
                            >
                              {ageInDays} days
                            </Badge>
                            </TableCell>
                         </TableRow>
                       );
                      })
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stock Movement History</CardTitle>
              <CardDescription>Last 50 stock transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No stock movements found matching your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        {new Date(movement.created_at).toLocaleDateString()} {new Date(movement.created_at).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="font-medium">{movement.product_name}</TableCell>
                      <TableCell>{movement.size}</TableCell>
                      <TableCell>
                        <Badge variant={movement.movement_type === 'purchase' ? 'default' : 'secondary'}>
                          {movement.movement_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {movement.movement_type === 'purchase' ? '+' : '-'}{movement.quantity}
                      </TableCell>
                       <TableCell className="text-muted-foreground">{movement.notes}</TableCell>
                    </TableRow>
                      ))
                    )}
                 </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
