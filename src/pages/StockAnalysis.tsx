import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, TrendingDown, History, Search, AlertCircle, CheckCircle2 } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useOrganization } from "@/contexts/OrganizationContext";
import { StockAnalysisSearch, StockAnalysisLoadingSkeleton } from "@/components/StockAnalysisSearch";

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
  department: string;
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

interface SelectedProduct {
  id: string;
  product_name: string;
  brand: string;
  barcode: string;
  size: string;
  color: string;
  stock_qty: number;
}

export default function StockAnalysis() {
  const { currentOrganization } = useOrganization();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [batchStock, setBatchStock] = useState<BatchStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  const [activeTab, setActiveTab] = useState("low");

  const loadStockAnalysis = useCallback(async (product: SelectedProduct) => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    setSelectedProduct(product);
    
    try {
      // Fetch settings first
      const { data: settingsData } = await supabase
        .from("settings" as any)
        .select("product_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();
      
      if ((settingsData as any)?.product_settings?.low_stock_threshold) {
        setLowStockThreshold((settingsData as any).product_settings.low_stock_threshold);
      }

      // Search for all variants of this product by name
      const { data: variantsData, error: variantsError } = await supabase
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
            style,
            product_type,
            deleted_at
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .eq("active", true)
        .is("deleted_at", null)
        .is("products.deleted_at", null)
        .neq("products.product_type", "service")
        .ilike("products.product_name", `%${product.product_name}%`)
        .order("stock_qty", { ascending: true })
        .limit(500);

      if (variantsError) throw variantsError;

      const filteredVariants = variantsData || [];
      const variantIds = filteredVariants.map((v: any) => v.id);

      // Only fetch movements and batch if we have variants
      if (variantIds.length > 0) {
        // Fetch movements for matched variants
        const { data: movementsData } = await supabase
          .from("stock_movements")
          .select("variant_id, movement_type, quantity")
          .in("variant_id", variantIds);

        // Fetch batch stock for matched variants
        const { data: batchData } = await supabase
          .from("batch_stock")
          .select(`
            variant_id,
            purchase_bills (
              supplier_name,
              supplier_invoice_no
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .in("variant_id", variantIds);

        const variantSuppliers = (batchData || []).reduce((acc: any, batch: any) => {
          if (!acc[batch.variant_id] && batch.purchase_bills?.supplier_name) {
            acc[batch.variant_id] = {
              supplier_name: batch.purchase_bills.supplier_name,
              supplier_invoice_no: batch.purchase_bills.supplier_invoice_no || ''
            };
          }
          return acc;
        }, {});

        const variantMovements = (movementsData || []).reduce((acc: any, movement: any) => {
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

        const formattedData = filteredVariants.map((item: any) => {
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
            department: item.products?.style || "",
          };
        });

        setStockItems(formattedData);
      } else {
        setStockItems([]);
      }

      // Fetch movements with search
      let formattedMovements: StockMovement[] = [];
      if (variantIds.length > 0) {
        const { data: movementHistory } = await supabase
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
          .in("variant_id", variantIds)
          .neq("product_variants.products.product_type", "service")
          .order("created_at", { ascending: false })
          .limit(100);

        formattedMovements = movementHistory?.map((item: any) => ({
          id: item.id,
          movement_type: item.movement_type,
          quantity: item.quantity,
          notes: item.notes || "",
          created_at: item.created_at,
          variant_id: item.variant_id,
          product_name: item.product_variants?.products?.product_name || "",
          size: item.product_variants?.size || "",
        })) || [];
      }

      setMovements(formattedMovements);

      // Fetch batch stock
      let formattedBatch: BatchStock[] = [];
      if (variantIds.length > 0) {
        const { data: batchStockData } = await supabase
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
          .in('variant_id', variantIds)
          .gt('quantity', 0)
          .is('product_variants.deleted_at', null)
          .is('product_variants.products.deleted_at', null)
          .neq('product_variants.products.product_type', 'service')
          .order('purchase_date', { ascending: true })
          .limit(500);

        formattedBatch = (batchStockData || []).map((item: any) => ({
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
      }

      setBatchStock(formattedBatch);

    } catch (error) {
      console.error("Error fetching stock data:", error);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id]);

  const handleClear = useCallback(() => {
    setSelectedProduct(null);
    setStockItems([]);
    setMovements([]);
    setBatchStock([]);
  }, []);

  const lowStockItems = useMemo(() => 
    stockItems.filter(item => item.stock_qty <= lowStockThreshold), 
    [stockItems, lowStockThreshold]
  );

  const totalStock = useMemo(() => 
    stockItems.reduce((sum, item) => sum + item.stock_qty, 0),
    [stockItems]
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackToDashboard />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Analysis</h1>
          <p className="text-muted-foreground">Search products to view low stock, batch tracking, and movement history</p>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-lg">
        <StockAnalysisSearch
          onProductSelect={loadStockAnalysis}
          onClear={handleClear}
          disabled={loading}
        />
      </div>

      {!selectedProduct ? (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Search to View Stock Analysis</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Enter a product name or scan a barcode to view low stock alerts, batch details, and movement history.
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <StockAnalysisLoadingSkeleton />
      ) : (
        <>
          {/* Selected Product Info */}
          {stockItems.length === 0 && totalStock === 0 ? (
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Product found – Stock is 0
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {selectedProduct.product_name} has no stock records.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
              <CardContent className="flex items-center gap-3 py-4">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800 dark:text-green-200">
                    {selectedProduct.product_name}
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {stockItems.length} variant(s) found • Total Stock: {totalStock} units
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg"
              onClick={() => setActiveTab("low")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white/90">Low Stock</CardTitle>
                <TrendingDown className="h-4 w-4 text-white" />
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
                <CardTitle className="text-sm font-medium text-white/90">Batch Records</CardTitle>
                <Package className="h-4 w-4 text-white" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{batchStock.length}</div>
                <p className="text-xs text-white/70">Active batches</p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-sky-500 to-sky-600 border-0 shadow-lg"
              onClick={() => setActiveTab("movements")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white/90">Movements</CardTitle>
                <History className="h-4 w-4 text-white" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{movements.length}</div>
                <p className="text-xs text-white/70">Recent transactions</p>
              </CardContent>
            </Card>
          </div>

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
                  {lowStockItems.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
                      <p className="text-muted-foreground">No low stock items for this product</p>
                    </div>
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
                          {lowStockItems.map((item) => (
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
                          {lowStockItems.length > 0 && (
                            <TableRow className="bg-muted/70 font-bold border-t-2">
                              <TableCell colSpan={5} className="text-primary">Total</TableCell>
                              <TableCell className="text-right bg-blue-50 dark:bg-blue-950 font-bold">
                                {lowStockItems.reduce((sum, i) => sum + i.opening_qty, 0)}
                              </TableCell>
                              <TableCell className="text-right bg-green-50 dark:bg-green-950 font-bold text-green-700 dark:text-green-400">
                                +{lowStockItems.reduce((sum, i) => sum + i.purchase_qty, 0)}
                              </TableCell>
                              <TableCell className="text-right bg-red-50 dark:bg-red-950 font-bold text-red-700 dark:text-red-400">
                                -{lowStockItems.reduce((sum, i) => sum + i.sales_qty, 0)}
                              </TableCell>
                              <TableCell className="text-right bg-primary/10 font-bold text-destructive">
                                {lowStockItems.reduce((sum, i) => sum + i.stock_qty, 0)}
                              </TableCell>
                              <TableCell className="text-right font-bold">
                                ₹{lowStockItems.reduce((sum, i) => sum + i.sale_price, 0).toFixed(2)}
                              </TableCell>
                            </TableRow>
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
                    Batch-wise Stock Details
                  </CardTitle>
                  <CardDescription>Stock grouped by purchase bills - FIFO order (oldest first)</CardDescription>
                </CardHeader>
                <CardContent>
                  {batchStock.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-muted-foreground">No batch records found for this product</p>
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
                        {batchStock.map((batch) => {
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
                        {batchStock.length > 0 && (
                          <TableRow className="bg-muted/70 font-bold border-t-2">
                            <TableCell colSpan={7} className="text-primary">Total</TableCell>
                            <TableCell className="text-right font-bold">
                              {batchStock.reduce((sum, b) => sum + b.quantity, 0)}
                            </TableCell>
                            <TableCell colSpan={2}></TableCell>
                          </TableRow>
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
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Stock Movement History
                  </CardTitle>
                  <CardDescription>Recent stock transactions (max 100)</CardDescription>
                </CardHeader>
                <CardContent>
                  {movements.length === 0 ? (
                    <div className="text-center py-8">
                      <History className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-muted-foreground">No movements found for this product</p>
                    </div>
                  ) : (
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
                        {movements.length > 0 && (
                          <TableRow className="bg-muted/70 font-bold border-t-2">
                            <TableCell colSpan={4} className="text-primary">Total</TableCell>
                            <TableCell className="text-right font-bold">
                              {movements.reduce((sum, m) => sum + m.quantity, 0)}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
