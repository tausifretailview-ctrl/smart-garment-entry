import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Package, TrendingUp, TrendingDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface SupplierProfitData {
  supplierId: string | null;
  supplierName: string;
  totalSales: number;
  totalCOGS: number;
  grossProfit: number;
  marginPercent: number;
  itemsSold: number;
}

interface ProductProfitData {
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  totalSales: number;
  totalCOGS: number;
  grossProfit: number;
  marginPercent: number;
  quantitySold: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
};

interface NetProfitBreakdownProps {
  organizationId: string;
  fromDate: string;
  toDate: string;
}

export function NetProfitBreakdown({ organizationId, fromDate, toDate }: NetProfitBreakdownProps) {
  const [activeTab, setActiveTab] = useState("supplier-wise");
  const [loading, setLoading] = useState(false);
  const [supplierData, setSupplierData] = useState<SupplierProfitData[]>([]);
  const [productData, setProductData] = useState<ProductProfitData[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const fetchSupplierWiseProfit = async () => {
    setLoading(true);
    try {
      // Get all sales in the period
      const { data: sales } = await supabase
        .from("sales")
        .select("id")
        .eq("organization_id", organizationId)
        .gte("sale_date", fromDate)
        .lte("sale_date", toDate)
        .is("deleted_at", null);

      if (!sales || sales.length === 0) {
        setSupplierData([]);
        setLoading(false);
        return;
      }

      const saleIds = sales.map(s => s.id);

      // Get all sale items with variant info
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("variant_id, quantity, line_total, gst_percent")
        .in("sale_id", saleIds)
        .is("deleted_at", null);

      if (!saleItems || saleItems.length === 0) {
        setSupplierData([]);
        setLoading(false);
        return;
      }

      // Get variant IDs
      const variantIds = [...new Set(saleItems.map(si => si.variant_id))];

      // Get variant details with pur_price
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, pur_price, product_id")
        .in("id", variantIds);

      const variantMap = new Map(variants?.map(v => [v.id, v]) || []);

      // Get product IDs
      const productIds = [...new Set(variants?.map(v => v.product_id) || [])];

      // Get supplier info from purchase_items (last purchase for each variant)
      const { data: purchaseItems } = await supabase
        .from("purchase_items")
        .select("sku_id, bill_id")
        .in("sku_id", variantIds)
        .is("deleted_at", null);

      const billIds = [...new Set(purchaseItems?.map(pi => pi.bill_id) || [])];

      // Get purchase bills with supplier info
      const { data: purchaseBills } = await supabase
        .from("purchase_bills")
        .select("id, supplier_id, supplier_name")
        .in("id", billIds);

      // Create variant to supplier mapping (use first found)
      const variantToSupplier = new Map<string, { id: string | null; name: string }>();
      purchaseItems?.forEach(pi => {
        if (!variantToSupplier.has(pi.sku_id)) {
          const bill = purchaseBills?.find(pb => pb.id === pi.bill_id);
          if (bill) {
            variantToSupplier.set(pi.sku_id, { id: bill.supplier_id, name: bill.supplier_name });
          }
        }
      });

      // Calculate profit by supplier
      const supplierProfitMap = new Map<string, SupplierProfitData>();

      saleItems.forEach(item => {
        const variant = variantMap.get(item.variant_id);
        const supplierInfo = variantToSupplier.get(item.variant_id) || { id: null, name: "Unknown Supplier" };
        const supplierKey = supplierInfo.id || supplierInfo.name;

        const qty = item.quantity || 0;
        const lineTotal = item.line_total || 0;
        const purPrice = variant?.pur_price || 0;
        const cogs = qty * purPrice;

        if (!supplierProfitMap.has(supplierKey)) {
          supplierProfitMap.set(supplierKey, {
            supplierId: supplierInfo.id,
            supplierName: supplierInfo.name,
            totalSales: 0,
            totalCOGS: 0,
            grossProfit: 0,
            marginPercent: 0,
            itemsSold: 0,
          });
        }

        const data = supplierProfitMap.get(supplierKey)!;
        data.totalSales += lineTotal;
        data.totalCOGS += cogs;
        data.itemsSold += qty;
      });

      // Calculate gross profit and margin for each supplier
      const result: SupplierProfitData[] = [];
      supplierProfitMap.forEach(data => {
        data.grossProfit = data.totalSales - data.totalCOGS;
        data.marginPercent = data.totalSales > 0 ? (data.grossProfit / data.totalSales) * 100 : 0;
        result.push(data);
      });

      // Sort by gross profit descending
      result.sort((a, b) => b.grossProfit - a.grossProfit);
      setSupplierData(result);
    } catch (error) {
      console.error("Error fetching supplier-wise profit:", error);
    }
    setLoading(false);
  };

  const fetchProductWiseProfit = async () => {
    setLoading(true);
    try {
      // Get all sales in the period
      const { data: sales } = await supabase
        .from("sales")
        .select("id")
        .eq("organization_id", organizationId)
        .gte("sale_date", fromDate)
        .lte("sale_date", toDate)
        .is("deleted_at", null);

      if (!sales || sales.length === 0) {
        setProductData([]);
        setLoading(false);
        return;
      }

      const saleIds = sales.map(s => s.id);

      // Get all sale items
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("variant_id, quantity, line_total, product_name, product_id")
        .in("sale_id", saleIds)
        .is("deleted_at", null);

      if (!saleItems || saleItems.length === 0) {
        setProductData([]);
        setLoading(false);
        return;
      }

      // Get variant IDs
      const variantIds = [...new Set(saleItems.map(si => si.variant_id))];

      // Get variant details with pur_price
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, pur_price, product_id")
        .in("id", variantIds);

      const variantMap = new Map(variants?.map(v => [v.id, v]) || []);

      // Get product IDs from sale_items
      const productIds = [...new Set(saleItems.map(si => si.product_id).filter(Boolean))];

      // Get product details
      const { data: products } = await supabase
        .from("products")
        .select("id, product_name, brand, category")
        .in("id", productIds);

      const productMap = new Map(products?.map(p => [p.id, p]) || []);

      // Calculate profit by product
      const productProfitMap = new Map<string, ProductProfitData>();

      saleItems.forEach(item => {
        const variant = variantMap.get(item.variant_id);
        const productId = item.product_id || variant?.product_id || "";
        const product = productMap.get(productId);

        const qty = item.quantity || 0;
        const lineTotal = item.line_total || 0;
        const purPrice = variant?.pur_price || 0;
        const cogs = qty * purPrice;

        if (!productProfitMap.has(productId)) {
          productProfitMap.set(productId, {
            productId,
            productName: item.product_name || product?.product_name || "Unknown Product",
            brand: product?.brand || null,
            category: product?.category || null,
            totalSales: 0,
            totalCOGS: 0,
            grossProfit: 0,
            marginPercent: 0,
            quantitySold: 0,
          });
        }

        const data = productProfitMap.get(productId)!;
        data.totalSales += lineTotal;
        data.totalCOGS += cogs;
        data.quantitySold += qty;
      });

      // Calculate gross profit and margin for each product
      const result: ProductProfitData[] = [];
      productProfitMap.forEach(data => {
        data.grossProfit = data.totalSales - data.totalCOGS;
        data.marginPercent = data.totalSales > 0 ? (data.grossProfit / data.totalSales) * 100 : 0;
        result.push(data);
      });

      // Sort by gross profit descending
      result.sort((a, b) => b.grossProfit - a.grossProfit);
      setProductData(result);
    } catch (error) {
      console.error("Error fetching product-wise profit:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === "supplier-wise") {
      fetchSupplierWiseProfit();
    } else {
      fetchProductWiseProfit();
    }
  }, [activeTab, organizationId, fromDate, toDate]);

  // Filter functions
  const filteredSupplierData = supplierData.filter(s =>
    s.supplierName.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredProductData = productData.filter(p =>
    p.productName.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.brand && p.brand.toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.category && p.category.toLowerCase().includes(productSearch.toLowerCase()))
  );

  // Totals
  const supplierTotals = filteredSupplierData.reduce(
    (acc, s) => ({
      sales: acc.sales + s.totalSales,
      cogs: acc.cogs + s.totalCOGS,
      profit: acc.profit + s.grossProfit,
      items: acc.items + s.itemsSold,
    }),
    { sales: 0, cogs: 0, profit: 0, items: 0 }
  );

  const productTotals = filteredProductData.reduce(
    (acc, p) => ({
      sales: acc.sales + p.totalSales,
      cogs: acc.cogs + p.totalCOGS,
      profit: acc.profit + p.grossProfit,
      qty: acc.qty + p.quantitySold,
    }),
    { sales: 0, cogs: 0, profit: 0, qty: 0 }
  );

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Detailed Profit Analysis</CardTitle>
        <p className="text-sm text-muted-foreground">
          Period: {format(new Date(fromDate), "dd MMM yyyy")} - {format(new Date(toDate), "dd MMM yyyy")}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="supplier-wise" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Supplier-wise
            </TabsTrigger>
            <TabsTrigger value="product-wise" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Product-wise
            </TabsTrigger>
          </TabsList>

          {/* Supplier-wise Tab */}
          <TabsContent value="supplier-wise" className="space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search supplier..."
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                className="max-w-sm"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Items Sold</TableHead>
                      <TableHead className="text-right">Total Sales</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Gross Profit</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSupplierData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No data available for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSupplierData.map((supplier, idx) => (
                        <TableRow key={supplier.supplierId || idx}>
                          <TableCell className="font-medium">{supplier.supplierName}</TableCell>
                          <TableCell className="text-right">{supplier.itemsSold}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(supplier.totalSales)}</TableCell>
                          <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                            {formatCurrency(supplier.totalCOGS)}
                          </TableCell>
                          <TableCell className={`text-right font-mono font-semibold ${supplier.grossProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(supplier.grossProfit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={supplier.marginPercent >= 20 ? "default" : supplier.marginPercent >= 0 ? "secondary" : "destructive"}>
                              {supplier.grossProfit >= 0 ? (
                                <TrendingUp className="h-3 w-3 mr-1" />
                              ) : (
                                <TrendingDown className="h-3 w-3 mr-1" />
                              )}
                              {supplier.marginPercent.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {filteredSupplierData.length > 0 && (
                    <TableFooter>
                      <TableRow className="bg-muted font-bold">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-right">{supplierTotals.items}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(supplierTotals.sales)}</TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                          {formatCurrency(supplierTotals.cogs)}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${supplierTotals.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrency(supplierTotals.profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={supplierTotals.profit >= 0 ? "default" : "destructive"}>
                            {supplierTotals.sales > 0 ? ((supplierTotals.profit / supplierTotals.sales) * 100).toFixed(1) : 0}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Product-wise Tab */}
          <TabsContent value="product-wise" className="space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search product, brand, or category..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="max-w-sm"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Total Sales</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Gross Profit</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProductData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No data available for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProductData.map((product, idx) => (
                        <TableRow key={product.productId || idx}>
                          <TableCell className="font-medium max-w-[200px] truncate" title={product.productName}>
                            {product.productName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{product.brand || "-"}</TableCell>
                          <TableCell className="text-right">{product.quantitySold}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(product.totalSales)}</TableCell>
                          <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                            {formatCurrency(product.totalCOGS)}
                          </TableCell>
                          <TableCell className={`text-right font-mono font-semibold ${product.grossProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(product.grossProfit)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={product.marginPercent >= 20 ? "default" : product.marginPercent >= 0 ? "secondary" : "destructive"}>
                              {product.grossProfit >= 0 ? (
                                <TrendingUp className="h-3 w-3 mr-1" />
                              ) : (
                                <TrendingDown className="h-3 w-3 mr-1" />
                              )}
                              {product.marginPercent.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {filteredProductData.length > 0 && (
                    <TableFooter>
                      <TableRow className="bg-muted font-bold">
                        <TableCell colSpan={2}>TOTAL</TableCell>
                        <TableCell className="text-right">{productTotals.qty}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(productTotals.sales)}</TableCell>
                        <TableCell className="text-right font-mono text-amber-600 dark:text-amber-400">
                          {formatCurrency(productTotals.cogs)}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${productTotals.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrency(productTotals.profit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={productTotals.profit >= 0 ? "default" : "destructive"}>
                            {productTotals.sales > 0 ? ((productTotals.profit / productTotals.sales) * 100).toFixed(1) : 0}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
