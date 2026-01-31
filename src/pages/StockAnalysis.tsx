import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Package, TrendingDown, History, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Input } from "@/components/ui/input";

interface StockItem {
  id: string;
  product_name: string;
  brand: string;
  color: string;
  size: string;
  stock_qty: number;
  opening_qty: number;
  purchase_qty: number;
  purchase_return_qty: number;
  sales_qty: number;
  sale_price: number;
  pur_price: number | null;
  barcode: string;
  supplier_name: string;
  supplier_invoice_no: string;
  category: string;
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

export default function StockAnalysis() {
  const { currentOrganization } = useOrganization();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [batchStock, setBatchStock] = useState<BatchStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("low");

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
              category,
              product_type,
              deleted_at
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
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

      // Fetch stock movements
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

      // Fetch batch stock with supplier info
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

      const variantSuppliers = (allBatchData || []).reduce((acc: any, batch: any) => {
        if (!acc[batch.variant_id] && batch.purchase_bills?.supplier_name) {
          acc[batch.variant_id] = {
            supplier_name: batch.purchase_bills.supplier_name,
            supplier_invoice_no: batch.purchase_bills.supplier_invoice_no || ''
          };
        }
        return acc;
      }, {});

      const variantMovements = (allMovements || []).reduce((acc: any, movement: any) => {
        if (!acc[movement.variant_id]) {
          acc[movement.variant_id] = { purchase: 0, purchaseReturn: 0, sales: 0 };
        }
        
        if (movement.movement_type === 'purchase' || movement.movement_type === 'purchase_increase') {
          acc[movement.variant_id].purchase += movement.quantity;
        } else if (movement.movement_type === 'purchase_delete' || 
                   movement.movement_type === 'soft_delete_purchase' ||
                   movement.movement_type === 'purchase_decrease') {
          acc[movement.variant_id].purchase += movement.quantity;
        } else if (movement.movement_type === 'purchase_return') {
          acc[movement.variant_id].purchaseReturn += Math.abs(movement.quantity);
        } else if (movement.movement_type === 'purchase_return_delete') {
          acc[movement.variant_id].purchaseReturn -= Math.abs(movement.quantity);
        } else if (movement.movement_type === 'sale') {
          acc[movement.variant_id].sales += Math.abs(movement.quantity);
        } else if (movement.movement_type === 'sale_delete' || movement.movement_type === 'soft_delete_sale') {
          acc[movement.variant_id].sales -= Math.abs(movement.quantity);
        }
        
        return acc;
      }, {});

      const formattedData = allVariants?.map((item: any) => {
        const movements = variantMovements[item.id] || { purchase: 0, purchaseReturn: 0, sales: 0 };
        const supplierInfo = variantSuppliers[item.id] || { supplier_name: '', supplier_invoice_no: '' };
        const netSalesQty = Math.max(0, movements.sales);
        
        return {
          id: item.id,
          product_name: item.products?.product_name || "",
          brand: item.products?.brand || "",
          color: item.color || item.products?.color || "",
          size: item.size,
          stock_qty: item.stock_qty,
          opening_qty: item.opening_qty || 0,
          purchase_qty: Math.max(0, movements.purchase),
          purchase_return_qty: Math.max(0, movements.purchaseReturn),
          sales_qty: netSalesQty,
          sale_price: item.sale_price,
          pur_price: item.pur_price || null,
          barcode: item.barcode || "",
          supplier_name: supplierInfo.supplier_name || "",
          supplier_invoice_no: supplierInfo.supplier_invoice_no || "",
          category: item.products?.category || "",
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

      const formattedData = allMovements?.map((item: any) => ({
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
              deleted_at,
              products!inner (
                product_name,
                brand,
                product_type,
                deleted_at
              )
            ),
            purchase_bills (
              supplier_name,
              supplier_invoice_no
            )
          `)
          .eq('organization_id', currentOrganization.id)
          .gt('quantity', 0)
          .is('product_variants.deleted_at', null)
          .is('product_variants.products.deleted_at', null)
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

      const formattedData: BatchStock[] = (allBatchStock || []).map((item: any) => ({
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

  const lowStockItems = useMemo(() => 
    stockItems.filter(item => item.stock_qty <= lowStockThreshold), 
    [stockItems, lowStockThreshold]
  );

  const filteredLowStockItems = useMemo(() => {
    if (!searchTerm) return lowStockItems;
    const search = searchTerm.toLowerCase();
    return lowStockItems.filter(item =>
      item.product_name.toLowerCase().includes(search) ||
      item.brand.toLowerCase().includes(search) ||
      item.size.toLowerCase().includes(search) ||
      item.barcode.toLowerCase().includes(search)
    );
  }, [lowStockItems, searchTerm]);

  const filteredBatchStock = useMemo(() => {
    if (!searchTerm) return batchStock;
    const search = searchTerm.toLowerCase();
    return batchStock.filter(item =>
      item.product_name.toLowerCase().includes(search) ||
      item.brand.toLowerCase().includes(search) ||
      item.size.toLowerCase().includes(search) ||
      item.barcode.toLowerCase().includes(search) ||
      item.bill_number.toLowerCase().includes(search)
    );
  }, [batchStock, searchTerm]);

  const filteredMovements = useMemo(() => {
    if (!searchTerm) return movements.slice(0, 50);
    const search = searchTerm.toLowerCase();
    return movements.filter(item =>
      item.product_name.toLowerCase().includes(search) ||
      item.size.toLowerCase().includes(search) ||
      item.movement_type.toLowerCase().includes(search) ||
      item.notes?.toLowerCase().includes(search)
    ).slice(0, 50);
  }, [movements, searchTerm]);

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackToDashboard />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Analysis</h1>
          <p className="text-muted-foreground">Low stock alerts, batch tracking, and movement history</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products, barcodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
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
            <Package className="h-4 w-4 text-white" />
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
            <p className="text-xs text-white/70">Stock transactions</p>
          </CardContent>
        </Card>
      </div>

      {lowStockItems.length > 0 && (
        <Alert variant="destructive" className="cursor-pointer" onClick={() => setActiveTab("low")}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Low Stock Alert</AlertTitle>
          <AlertDescription>
            {lowStockItems.length} product variant{lowStockItems.length > 1 ? 's' : ''} running low on stock.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="low" className="gap-1">
            <TrendingDown className="h-4 w-4" />
            Low Stock
          </TabsTrigger>
          <TabsTrigger value="batch" className="gap-1">
            <Package className="h-4 w-4" />
            Batch Stock
          </TabsTrigger>
          <TabsTrigger value="movements" className="gap-1">
            <History className="h-4 w-4" />
            Movement History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="low" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-destructive" />
                Low Stock Items
              </CardTitle>
              <CardDescription>Products below {lowStockThreshold} units</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredLowStockItems.length === 0 ? (
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
                        <TableHead className="text-right bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-white">Opening Qty</TableHead>
                        <TableHead className="text-right bg-green-50 dark:bg-green-950 text-green-800 dark:text-white">Purchase Qty</TableHead>
                        <TableHead className="text-right bg-red-50 dark:bg-red-950 text-red-800 dark:text-white">Sales Qty</TableHead>
                        <TableHead className="text-right bg-primary/10 font-semibold text-primary dark:text-white">Current Stock</TableHead>
                        <TableHead className="text-right">Sale Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLowStockItems.map((item) => (
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
                      ))}
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
              <CardDescription>Stock grouped by purchase bills - FIFO order (oldest first)</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredBatchStock.length === 0 ? (
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
                    {filteredBatchStock.map((batch) => {
                      const ageInDays = Math.floor(
                        (Date.now() - new Date(batch.purchase_date).getTime()) / (1000 * 60 * 60 * 24)
                      );
                      
                      return (
                        <TableRow key={batch.id}>
                          <TableCell className="text-muted-foreground">{batch.supplier_name || '—'}</TableCell>
                          <TableCell className="font-mono text-sm">{batch.supplier_invoice_no || '—'}</TableCell>
                          <TableCell className="font-medium">{batch.product_name}</TableCell>
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
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Stock Movement History
              </CardTitle>
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
                        No stock movements found
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
