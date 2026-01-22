import { useState, useEffect } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, Download, Printer, TrendingUp, TrendingDown, 
  Users, Package, Search, Calendar, ArrowLeft, Building2, Clock
} from "lucide-react";
import { format, startOfYear, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { getIndiaFinancialYear, getCurrentQuarter } from "@/utils/accountingReportUtils";
import { useNavigate, useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { fetchAllSaleItems, fetchAllPurchaseItems } from "@/utils/fetchAllRows";

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

// Financial Year Presets
const FYPresets = ({ 
  onSelect, 
  currentSelection 
}: { 
  onSelect: (from: string, to: string, key: string) => void; 
  currentSelection?: string;
}) => {
  const currentFY = getIndiaFinancialYear(0);
  const previousFY = getIndiaFinancialYear(-1);
  const currentQ = getCurrentQuarter();
  const now = new Date();
  
  const todayStart = format(now, "yyyy-MM-dd");
  const todayEnd = format(now, "yyyy-MM-dd");
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
  
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={currentSelection === "today" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(todayStart, todayEnd, "today")}
      >
        Today
      </Button>
      <Button
        variant={currentSelection === "week" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(weekStart, weekEnd, "week")}
      >
        This Week
      </Button>
      <Button
        variant={currentSelection === "month" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(monthStart, monthEnd, "month")}
      >
        This Month
      </Button>
      <Button
        variant={currentSelection === "currentQ" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(currentQ.fromDate, currentQ.toDate, "currentQ")}
      >
        {currentQ.label}
      </Button>
      <Button
        variant={currentSelection === "currentFY" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(currentFY.fromDate, currentFY.toDate, "currentFY")}
      >
        <Calendar className="h-3 w-3 mr-1" />
        {currentFY.label}
      </Button>
      <Button
        variant={currentSelection === "previousFY" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(previousFY.fromDate, previousFY.toDate, "previousFY")}
      >
        {previousFY.label}
      </Button>
    </div>
  );
};

export default function NetProfitAnalysis() {
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const location = useLocation();
  const { orgNavigate } = useOrgNavigation();
  
  // Parse URL query parameters for date range
  const searchParams = new URLSearchParams(location.search);
  const urlFromDate = searchParams.get('from');
  const urlToDate = searchParams.get('to');
  
  const currentFY = getIndiaFinancialYear(0);
  const [fromDate, setFromDate] = useState(urlFromDate || currentFY.fromDate);
  const [toDate, setToDate] = useState(urlToDate || format(new Date(), "yyyy-MM-dd"));
  const [fyPreset, setFyPreset] = useState<string>(urlFromDate ? "" : "");
  
  const [activeTab, setActiveTab] = useState("supplier-wise");
  const [loading, setLoading] = useState(false);
  const [supplierData, setSupplierData] = useState<SupplierProfitData[]>([]);
  const [productData, setProductData] = useState<ProductProfitData[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);

  const fetchSupplierWiseProfit = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      const { data: sales } = await supabase
        .from("sales")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", fromDate)
        .lte("sale_date", toDate)
        .is("deleted_at", null);

      if (!sales || sales.length === 0) {
        setSupplierData([]);
        setLoading(false);
        return;
      }

      const saleIds = sales.map(s => s.id);

      // Use paginated fetch to get ALL sale items (bypasses 1000 row limit)
      const saleItems = await fetchAllSaleItems(saleIds);

      if (!saleItems || saleItems.length === 0) {
        setSupplierData([]);
        setLoading(false);
        return;
      }

      const variantIds = [...new Set(saleItems.map(si => si.variant_id))];

      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, pur_price, product_id")
        .in("id", variantIds);

      const variantMap = new Map(variants?.map(v => [v.id, v]) || []);

      // Use paginated fetch for purchase items
      const purchaseItems = await fetchAllPurchaseItems(variantIds);

      const billIds = [...new Set(purchaseItems?.map(pi => pi.bill_id) || [])];

      const { data: purchaseBills } = await supabase
        .from("purchase_bills")
        .select("id, supplier_id, supplier_name")
        .in("id", billIds);

      const variantToSupplier = new Map<string, { id: string | null; name: string }>();
      purchaseItems?.forEach(pi => {
        if (!variantToSupplier.has(pi.sku_id)) {
          const bill = purchaseBills?.find(pb => pb.id === pi.bill_id);
          if (bill) {
            variantToSupplier.set(pi.sku_id, { id: bill.supplier_id, name: bill.supplier_name });
          }
        }
      });

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

      const result: SupplierProfitData[] = [];
      supplierProfitMap.forEach(data => {
        data.grossProfit = data.totalSales - data.totalCOGS;
        data.marginPercent = data.totalSales > 0 ? (data.grossProfit / data.totalSales) * 100 : 0;
        result.push(data);
      });

      result.sort((a, b) => b.grossProfit - a.grossProfit);
      setSupplierData(result);
    } catch (error) {
      console.error("Error fetching supplier-wise profit:", error);
      toast.error("Failed to load supplier-wise data");
    }
    setLoading(false);
  };

  const fetchProductWiseProfit = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      const { data: sales } = await supabase
        .from("sales")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", fromDate)
        .lte("sale_date", toDate)
        .is("deleted_at", null);

      if (!sales || sales.length === 0) {
        setProductData([]);
        setLoading(false);
        return;
      }

      const saleIds = sales.map(s => s.id);

      // Use paginated fetch to get ALL sale items (bypasses 1000 row limit)
      const saleItems = await fetchAllSaleItems(saleIds);

      if (!saleItems || saleItems.length === 0) {
        setProductData([]);
        setLoading(false);
        return;
      }

      const variantIds = [...new Set(saleItems.map(si => si.variant_id))];

      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, pur_price, product_id")
        .in("id", variantIds);

      const variantMap = new Map(variants?.map(v => [v.id, v]) || []);

      const productIds = [...new Set(saleItems.map(si => si.product_id).filter(Boolean))];

      const { data: products } = await supabase
        .from("products")
        .select("id, product_name, brand, category")
        .in("id", productIds);

      const productMap = new Map(products?.map(p => [p.id, p]) || []);

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

      const result: ProductProfitData[] = [];
      productProfitMap.forEach(data => {
        data.grossProfit = data.totalSales - data.totalCOGS;
        data.marginPercent = data.totalSales > 0 ? (data.grossProfit / data.totalSales) * 100 : 0;
        result.push(data);
      });

      result.sort((a, b) => b.grossProfit - a.grossProfit);
      setProductData(result);
    } catch (error) {
      console.error("Error fetching product-wise profit:", error);
      toast.error("Failed to load product-wise data");
    }
    setLoading(false);
  };

  const handleGenerate = () => {
    setHasGenerated(true);
    if (activeTab === "supplier-wise") {
      fetchSupplierWiseProfit();
    } else {
      fetchProductWiseProfit();
    }
  };

  // Refetch when tab changes (after initial generation)
  useEffect(() => {
    if (hasGenerated) {
      if (activeTab === "supplier-wise" && supplierData.length === 0) {
        fetchSupplierWiseProfit();
      } else if (activeTab === "product-wise" && productData.length === 0) {
        fetchProductWiseProfit();
      }
    }
  }, [activeTab, hasGenerated]);

  const handleFYPresetSelect = (from: string, to: string, key: string) => {
    setFromDate(from);
    setToDate(to);
    setFyPreset(key);
  };

  const handleExportExcel = () => {
    if (activeTab === "supplier-wise") {
      if (filteredSupplierData.length === 0) {
        toast.error("No data to export");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        filteredSupplierData.map((s) => ({
          "Supplier": s.supplierName,
          "Items Sold": s.itemsSold,
          "Total Sales": s.totalSales,
          "COGS": s.totalCOGS,
          "Gross Profit": s.grossProfit,
          "Margin %": `${s.marginPercent.toFixed(1)}%`,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Supplier Profit");
      XLSX.writeFile(wb, `supplier-profit-analysis-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } else {
      if (filteredProductData.length === 0) {
        toast.error("No data to export");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        filteredProductData.map((p) => ({
          "Product": p.productName,
          "Brand": p.brand || "-",
          "Category": p.category || "-",
          "Qty Sold": p.quantitySold,
          "Total Sales": p.totalSales,
          "COGS": p.totalCOGS,
          "Gross Profit": p.grossProfit,
          "Margin %": `${p.marginPercent.toFixed(1)}%`,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Product Profit");
      XLSX.writeFile(wb, `product-profit-analysis-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    }
    toast.success("Excel exported successfully");
  };

  const filteredSupplierData = supplierData.filter(s =>
    s.supplierName.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredProductData = productData.filter(p =>
    p.productName.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.brand && p.brand.toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.category && p.category.toLowerCase().includes(productSearch.toLowerCase()))
  );

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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => orgNavigate("/accounting-reports")}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Net Profit Analysis
            </h1>
            <p className="text-xs text-muted-foreground">
              {currentOrganization?.name || "Organization"} • Supplier & Product-wise Profit Breakdown
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-1" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-3 border-b bg-muted/30 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 w-36"
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 w-36"
              />
            </div>
            <div className="self-end">
              <Button onClick={handleGenerate} disabled={loading} size="sm">
                {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Generate
              </Button>
            </div>
          </div>
          
          <FYPresets onSelect={handleFYPresetSelect} currentSelection={fyPreset} />
        </div>
        
        <p className="text-xs text-muted-foreground mt-2">
          Period: {format(new Date(fromDate), "dd MMM yyyy")} - {format(new Date(toDate), "dd MMM yyyy")}
        </p>
      </div>

      {/* Print Header */}
      <div className="hidden print:block p-4 border-b">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">{currentOrganization?.name || "Organization"}</h1>
          <h2 className="text-lg font-semibold mt-1">Net Profit Analysis - {activeTab === "supplier-wise" ? "Supplier-wise" : "Product-wise"}</h2>
          <p className="text-sm text-gray-600">
            Period: {format(new Date(fromDate), "dd MMM yyyy")} - {format(new Date(toDate), "dd MMM yyyy")}
          </p>
          <p className="text-xs text-gray-500 mt-1 flex items-center justify-center gap-1">
            <Clock className="h-3 w-3" />
            Generated: {format(new Date(), "dd MMM yyyy, hh:mm a")}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-4 print:hidden">
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
          <TabsContent value="supplier-wise" className="flex-1 flex flex-col mt-0">
            <div className="flex items-center gap-2 mb-3 print:hidden">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search supplier..."
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                className="max-w-sm h-8"
              />
              <span className="text-xs text-muted-foreground ml-auto">
                {filteredSupplierData.length} suppliers
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !hasGenerated ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p>Click Generate to load supplier-wise profit data</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur">
                    <TableRow>
                      <TableHead className="w-[200px] text-foreground font-semibold">Supplier</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Items Sold</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Total Sales</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">COGS</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Gross Profit</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Margin %</TableHead>
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
                    <TableFooter className="sticky bottom-0 bg-muted font-bold">
                      <TableRow>
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
              </ScrollArea>
            )}
          </TabsContent>

          {/* Product-wise Tab */}
          <TabsContent value="product-wise" className="flex-1 flex flex-col mt-0">
            <div className="flex items-center gap-2 mb-3 print:hidden">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search product, brand, or category..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="max-w-sm h-8"
              />
              <span className="text-xs text-muted-foreground ml-auto">
                {filteredProductData.length} products
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !hasGenerated ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p>Click Generate to load product-wise profit data</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur">
                    <TableRow>
                      <TableHead className="w-[200px] text-foreground font-semibold">Product</TableHead>
                      <TableHead className="text-foreground font-semibold">Brand</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Qty Sold</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Total Sales</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">COGS</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Gross Profit</TableHead>
                      <TableHead className="text-right text-foreground font-semibold">Margin %</TableHead>
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
                          <TableCell>
                            {product.brand ? (
                              <Badge variant="outline">{product.brand}</Badge>
                            ) : "-"}
                          </TableCell>
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
                    <TableFooter className="sticky bottom-0 bg-muted font-bold">
                      <TableRow>
                        <TableCell>TOTAL</TableCell>
                        <TableCell>-</TableCell>
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
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
