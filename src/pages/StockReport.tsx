import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Package, TrendingDown, History } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { BackToDashboard } from "@/components/BackToDashboard";

interface StockItem {
  id: string;
  product_name: string;
  brand: string;
  color: string;
  size: string;
  stock_qty: number;
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

export default function StockReport() {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const LOW_STOCK_THRESHOLD = 10;

  useEffect(() => {
    fetchStockData();
    fetchMovements();
  }, []);

  const fetchStockData = async () => {
    try {
      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          size,
          stock_qty,
          sale_price,
          barcode,
          products (
            product_name,
            brand,
            color
          )
        `)
        .eq("active", true)
        .order("stock_qty", { ascending: true });

      if (error) throw error;

      const formattedData = data?.map((item: any) => ({
        id: item.id,
        product_name: item.products?.product_name || "",
        brand: item.products?.brand || "",
        color: item.products?.color || "",
        size: item.size,
        stock_qty: item.stock_qty,
        sale_price: item.sale_price,
        barcode: item.barcode || "",
      })) || [];

      setStockItems(formattedData);
    } catch (error) {
      console.error("Error fetching stock data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async () => {
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

  const lowStockItems = stockItems.filter(item => item.stock_qty <= LOW_STOCK_THRESHOLD);
  const totalStock = stockItems.reduce((sum, item) => sum + item.stock_qty, 0);

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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStock}</div>
            <p className="text-xs text-muted-foreground">{stockItems.length} variants</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockItems.length}</div>
            <p className="text-xs text-muted-foreground">Below {LOW_STOCK_THRESHOLD} units</p>
          </CardContent>
        </Card>

        <Card>
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
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Low Stock Alert</AlertTitle>
          <AlertDescription>
            {lowStockItems.length} product variant{lowStockItems.length > 1 ? 's' : ''} {lowStockItems.length > 1 ? 'are' : 'is'} running low on stock
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Stock</TabsTrigger>
          <TabsTrigger value="low">Low Stock</TabsTrigger>
          <TabsTrigger value="movements">Movement History</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Stock Levels</CardTitle>
              <CardDescription>All active product variants</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Stock Qty</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell>{item.brand}</TableCell>
                      <TableCell>{item.color}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                      <TableCell className="text-right">{item.stock_qty}</TableCell>
                      <TableCell className="text-right">₹{item.sale_price}</TableCell>
                      <TableCell>
                        {item.stock_qty === 0 ? (
                          <Badge variant="destructive">Out of Stock</Badge>
                        ) : item.stock_qty <= LOW_STOCK_THRESHOLD ? (
                          <Badge variant="secondary">Low Stock</Badge>
                        ) : (
                          <Badge variant="outline">In Stock</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
              <CardDescription>Products below {LOW_STOCK_THRESHOLD} units</CardDescription>
            </CardHeader>
            <CardContent>
              {lowStockItems.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No low stock items</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Stock Qty</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStockItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell>{item.brand}</TableCell>
                        <TableCell>{item.color}</TableCell>
                        <TableCell>{item.size}</TableCell>
                        <TableCell className="text-right font-bold text-destructive">
                          {item.stock_qty}
                        </TableCell>
                        <TableCell className="text-right">₹{item.sale_price}</TableCell>
                      </TableRow>
                    ))}
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
                  {movements.map((movement) => (
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
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
