import { useEffect, useState } from "react";
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
  sales_qty: number;
  sale_price: number;
  barcode: string;
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
      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          size,
          stock_qty,
          opening_qty,
          sale_price,
          barcode,
          products (
            product_name,
            brand,
            color
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("active", true)
        .order("stock_qty", { ascending: true });

      if (error) throw error;

      // Fetch stock movements to calculate purchase and sales quantities
      const { data: movementsData, error: movementsError } = await supabase
        .from("stock_movements")
        .select("variant_id, movement_type, quantity");

      if (movementsError) throw movementsError;

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
        
        return {
          id: item.id,
          product_name: item.products?.product_name || "",
          brand: item.products?.brand || "",
          color: item.products?.color || "",
          size: item.size,
          stock_qty: item.stock_qty,
          opening_qty: item.opening_qty || 0,
          purchase_qty: movements.purchase,
          sales_qty: movements.sales,
          sale_price: item.sale_price,
          barcode: item.barcode || "",
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
      const { data, error } = await supabase
        .from("stock_movements")
        .select(`
          id,
          movement_type,
          quantity,
          notes,
          created_at,
          variant_id,
          product_variants (
            size,
            products (
              product_name
            )
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

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
      const { data, error } = await supabase
        .from('batch_stock')
        .select(`
          *,
          product_variants (
            size,
            barcode,
            products (
              product_name,
              brand
            )
          )
        `)
        .eq('organization_id', currentOrganization.id)
        .gt('quantity', 0)
        .order('purchase_date', { ascending: true });
      
      if (error) throw error;

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
      }));

      setBatchStock(formattedData);
    } catch (error) {
      console.error('Error fetching batch stock:', error);
    }
  };

  // Filter data based on search term
  const filteredStockItems = stockItems.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.product_name.toLowerCase().includes(search) ||
      item.brand.toLowerCase().includes(search) ||
      item.color.toLowerCase().includes(search) ||
      item.size.toLowerCase().includes(search) ||
      item.barcode.toLowerCase().includes(search)
    );
  });

  const filteredBatchStock = batchStock.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.product_name.toLowerCase().includes(search) ||
      item.brand.toLowerCase().includes(search) ||
      item.size.toLowerCase().includes(search) ||
      item.barcode.toLowerCase().includes(search) ||
      item.bill_number.toLowerCase().includes(search)
    );
  });

  const filteredMovements = movements.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.product_name.toLowerCase().includes(search) ||
      item.size.toLowerCase().includes(search) ||
      item.movement_type.toLowerCase().includes(search) ||
      item.notes?.toLowerCase().includes(search)
    );
  });

  const lowStockItems = filteredStockItems.filter(item => item.stock_qty <= lowStockThreshold);
  const totalStock = filteredStockItems.reduce((sum, item) => sum + item.stock_qty, 0);

  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
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

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by product name, barcode, brand, color, size, bill number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-11"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary"
          onClick={() => setActiveTab("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStock}</div>
            <p className="text-xs text-muted-foreground">{stockItems.length} variants</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-destructive"
          onClick={() => setActiveTab("low")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{lowStockItems.length}</div>
            <p className="text-xs text-muted-foreground">Below {lowStockThreshold} units</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary"
          onClick={() => setActiveTab("batch")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Batches</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batchStock.length}</div>
            <p className="text-xs text-muted-foreground">Purchase bills in stock</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary"
          onClick={() => setActiveTab("movements")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Movements</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{movements.length}</div>
            <p className="text-xs text-muted-foreground">Last 50 transactions</p>
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
        <TabsList>
          <TabsTrigger value="all">All Stock</TabsTrigger>
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
                      <TableHead>Product</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead className="text-right bg-blue-50 dark:bg-blue-950">Opening Qty</TableHead>
                      <TableHead className="text-right bg-green-50 dark:bg-green-950">Purchase Qty</TableHead>
                      <TableHead className="text-right bg-red-50 dark:bg-red-950">Sales Qty</TableHead>
                      <TableHead className="text-right bg-primary/10 font-semibold">Current Stock</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStockItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No products found matching your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredStockItems.map((item) => (
                        <TableRow key={item.id}>
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
                          <TableCell className="text-right">₹{item.sale_price}</TableCell>
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
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            {searchTerm ? "No low stock products found matching your search" : "No low stock items"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        lowStockItems.map((item) => (
                          <TableRow key={item.id}>
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
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
