import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  Search,
  Download,
  Printer,
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Calendar,
  RefreshCw,
  X,
  ShoppingCart,
  Edit,
  History,
} from "lucide-react";

interface PurchaseHistoryItem {
  id: string;
  barcode: string;
  product_name: string;
  brand: string;
  category: string;
  size: string;
  pur_price: number;
  sale_price: number;
  qty: number;
  bill_number: string;
  software_bill_no: string;
  supplier_name: string;
  bill_date: string;
  created_at: string;
  current_sale_price: number | null;
  current_pur_price: number | null;
}

interface SalesHistoryItem {
  id: string;
  barcode: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  mrp: number;
  gst_percent: number;
  discount_percent: number;
  line_total: number;
  sale_number: string;
  sale_date: string;
  customer_name: string;
}

interface PriceEditItem {
  id: string;
  created_at: string;
  user_email: string;
  barcode: string;
  size: string;
  old_pur_price: number | null;
  new_pur_price: number | null;
  old_sale_price: number | null;
  new_sale_price: number | null;
}

interface Supplier {
  id: string;
  supplier_name: string;
}

interface Customer {
  id: string;
  customer_name: string;
}

const PriceHistoryReport = () => {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  
  const [activeTab, setActiveTab] = useState("all");
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<SalesHistoryItem[]>([]);
  const [priceEdits, setPriceEdits] = useState<PriceEditItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showPriceChangesOnly, setShowPriceChangesOnly] = useState(false);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchAllData();
    }
  }, [currentOrganization?.id]);

  const fetchAllData = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      // Fetch purchase items with bill info
      const { data: purchaseItems, error: purchaseError } = await supabase
        .from("purchase_items")
        .select(`
          id, barcode, product_name, brand, category, size,
          pur_price, sale_price, qty, bill_number, created_at,
          purchase_bills!inner (
            software_bill_no, supplier_name, bill_date, organization_id
          )
        `)
        .eq("purchase_bills.organization_id", currentOrganization.id)
        .order("created_at", { ascending: false });

      if (purchaseError) throw purchaseError;

      // Get unique barcodes
      const barcodes = [...new Set((purchaseItems || []).map(p => p.barcode).filter(Boolean))];
      
      // Fetch current prices from product_variants
      let currentPricesMap = new Map<string, { sale_price: number; pur_price: number }>();
      
      if (barcodes.length > 0) {
        const { data: currentPrices } = await supabase
          .from("product_variants")
          .select("barcode, sale_price, pur_price")
          .in("barcode", barcodes);
        
        currentPrices?.forEach(p => {
          if (p.barcode) {
            currentPricesMap.set(p.barcode, {
              sale_price: p.sale_price || 0,
              pur_price: p.pur_price || 0,
            });
          }
        });
      }

      // Merge purchase data
      const mergedPurchaseData: PurchaseHistoryItem[] = (purchaseItems || []).map(item => {
        const bills = item.purchase_bills as any;
        const currentPrice = currentPricesMap.get(item.barcode || "");
        
        return {
          id: item.id,
          barcode: item.barcode || "",
          product_name: item.product_name || "",
          brand: item.brand || "",
          category: item.category || "",
          size: item.size || "",
          pur_price: item.pur_price || 0,
          sale_price: item.sale_price || 0,
          qty: item.qty || 0,
          bill_number: item.bill_number || "",
          software_bill_no: bills?.software_bill_no || "",
          supplier_name: bills?.supplier_name || "",
          bill_date: bills?.bill_date || "",
          created_at: item.created_at,
          current_sale_price: currentPrice?.sale_price ?? null,
          current_pur_price: currentPrice?.pur_price ?? null,
        };
      });

      setPurchaseHistory(mergedPurchaseData);

      // Fetch sales history
      const { data: saleItems, error: salesError } = await supabase
        .from("sale_items")
        .select(`
          id, barcode, product_name, size, quantity,
          unit_price, mrp, gst_percent, discount_percent, line_total,
          sale_id
        `)
        .order("created_at", { ascending: false });

      if (salesError) throw salesError;

      // Fetch sales for organization filtering
      const { data: sales, error: salesMainError } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, customer_name, organization_id")
        .eq("organization_id", currentOrganization.id);

      if (salesMainError) throw salesMainError;

      const salesMap = new Map(sales?.map(s => [s.id, s]) || []);
      const orgSaleItems = saleItems?.filter(item => salesMap.has(item.sale_id)) || [];

      const mergedSalesData: SalesHistoryItem[] = orgSaleItems.map(item => {
        const sale = salesMap.get(item.sale_id);
        return {
          id: item.id,
          barcode: item.barcode || "",
          product_name: item.product_name || "",
          size: item.size || "",
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          mrp: item.mrp || 0,
          gst_percent: item.gst_percent || 0,
          discount_percent: item.discount_percent || 0,
          line_total: item.line_total || 0,
          sale_number: sale?.sale_number || "",
          sale_date: sale?.sale_date || "",
          customer_name: sale?.customer_name || "",
        };
      });

      setSalesHistory(mergedSalesData);

      // Fetch price edit history from audit_logs
      const { data: auditLogs, error: auditError } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_type", "product_variant")
        .eq("action", "PRICE_CHANGE")
        .order("created_at", { ascending: false });

      if (auditError) throw auditError;

      const priceEditData: PriceEditItem[] = (auditLogs || []).map(log => ({
        id: log.id,
        created_at: log.created_at || "",
        user_email: log.user_email || "System",
        barcode: (log.old_values as any)?.barcode || "",
        size: (log.old_values as any)?.size || "",
        old_pur_price: (log.old_values as any)?.pur_price ?? null,
        new_pur_price: (log.new_values as any)?.pur_price ?? null,
        old_sale_price: (log.old_values as any)?.sale_price ?? null,
        new_sale_price: (log.new_values as any)?.sale_price ?? null,
      }));

      setPriceEdits(priceEditData);

      // Fetch suppliers
      const { data: suppliersData } = await supabase
        .from("suppliers")
        .select("id, supplier_name")
        .eq("organization_id", currentOrganization.id)
        .order("supplier_name");
      
      setSuppliers(suppliersData || []);

      // Fetch customers
      const { data: customersData } = await supabase
        .from("customers")
        .select("id, customer_name")
        .eq("organization_id", currentOrganization.id)
        .order("customer_name");

      setCustomers(customersData || []);

    } catch (error) {
      console.error("Error fetching price history:", error);
      toast.error("Failed to load price history");
    } finally {
      setLoading(false);
    }
  };

  // Filter purchase data
  const filteredPurchaseData = useMemo(() => {
    return purchaseHistory.filter(item => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          item.barcode?.toLowerCase().includes(search) ||
          item.product_name?.toLowerCase().includes(search) ||
          item.brand?.toLowerCase().includes(search) ||
          item.bill_number?.toLowerCase().includes(search) ||
          item.software_bill_no?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      if (selectedSupplier !== "all" && item.supplier_name !== selectedSupplier) return false;
      if (startDate && item.bill_date < startDate) return false;
      if (endDate && item.bill_date > endDate) return false;

      if (showPriceChangesOnly) {
        if (item.current_sale_price === null) return false;
        if (item.sale_price === item.current_sale_price) return false;
      }

      return true;
    });
  }, [purchaseHistory, searchTerm, selectedSupplier, startDate, endDate, showPriceChangesOnly]);

  // Filter sales data
  const filteredSalesData = useMemo(() => {
    return salesHistory.filter(item => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          item.barcode?.toLowerCase().includes(search) ||
          item.product_name?.toLowerCase().includes(search) ||
          item.sale_number?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      if (selectedCustomer !== "all" && item.customer_name !== selectedCustomer) return false;
      
      const saleDate = item.sale_date?.split("T")[0] || "";
      if (startDate && saleDate < startDate) return false;
      if (endDate && saleDate > endDate) return false;

      return true;
    });
  }, [salesHistory, searchTerm, selectedCustomer, startDate, endDate]);

  // Filter price edit data
  const filteredPriceEdits = useMemo(() => {
    return priceEdits.filter(item => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!item.barcode?.toLowerCase().includes(search)) return false;
      }

      const editDate = item.created_at?.split("T")[0] || "";
      if (startDate && editDate < startDate) return false;
      if (endDate && editDate > endDate) return false;

      return true;
    });
  }, [priceEdits, searchTerm, startDate, endDate]);

  // Combined history for "All" tab
  const combinedHistory = useMemo(() => {
    const combined: Array<{
      type: "purchase" | "sale" | "edit";
      date: string;
      reference: string;
      barcode: string;
      product_name: string;
      size: string;
      qty: number | null;
      price: string;
      party: string;
    }> = [];

    filteredPurchaseData.forEach(item => {
      combined.push({
        type: "purchase",
        date: item.bill_date,
        reference: item.software_bill_no || item.bill_number,
        barcode: item.barcode,
        product_name: item.product_name,
        size: item.size,
        qty: item.qty,
        price: `₹${item.pur_price} / ₹${item.sale_price}`,
        party: item.supplier_name,
      });
    });

    filteredSalesData.forEach(item => {
      combined.push({
        type: "sale",
        date: item.sale_date?.split("T")[0] || "",
        reference: item.sale_number,
        barcode: item.barcode,
        product_name: item.product_name,
        size: item.size,
        qty: item.quantity,
        price: `₹${item.unit_price}`,
        party: item.customer_name,
      });
    });

    filteredPriceEdits.forEach(item => {
      combined.push({
        type: "edit",
        date: item.created_at?.split("T")[0] || "",
        reference: "-",
        barcode: item.barcode,
        product_name: "-",
        size: item.size,
        qty: null,
        price: `₹${item.old_sale_price || 0} → ₹${item.new_sale_price || 0}`,
        party: item.user_email,
      });
    });

    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredPurchaseData, filteredSalesData, filteredPriceEdits]);

  // Summary statistics
  const stats = useMemo(() => {
    const uniqueProducts = new Set(filteredPurchaseData.map(d => d.barcode)).size;
    const productsWithPriceChange = new Set(
      filteredPurchaseData
        .filter(d => d.current_sale_price !== null && d.sale_price !== d.current_sale_price)
        .map(d => d.barcode)
    ).size;
    
    const dates = filteredPurchaseData.map(d => d.bill_date).filter(Boolean).sort();
    const dateRange = dates.length > 0 
      ? `${format(new Date(dates[0]), "dd MMM")} - ${format(new Date(dates[dates.length - 1]), "dd MMM yyyy")}`
      : "No data";

    return { 
      uniqueProducts, 
      productsWithPriceChange, 
      totalPurchases: filteredPurchaseData.length,
      totalSales: filteredSalesData.length,
      totalEdits: filteredPriceEdits.length,
      dateRange 
    };
  }, [filteredPurchaseData, filteredSalesData, filteredPriceEdits]);

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedSupplier("all");
    setSelectedCustomer("all");
    setStartDate("");
    setEndDate("");
    setShowPriceChangesOnly(false);
  };

  const getPriceChangeIndicator = (batchPrice: number, currentPrice: number | null) => {
    if (currentPrice === null) return { icon: <Minus className="h-4 w-4" />, color: "text-muted-foreground" };
    if (currentPrice > batchPrice) return { icon: <TrendingUp className="h-4 w-4" />, color: "text-green-600" };
    if (currentPrice < batchPrice) return { icon: <TrendingDown className="h-4 w-4" />, color: "text-red-600" };
    return { icon: <Minus className="h-4 w-4" />, color: "text-muted-foreground" };
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Purchase Sheet
    const purchaseData = filteredPurchaseData.map(item => ({
      "Date": item.bill_date ? format(new Date(item.bill_date), "dd/MM/yyyy") : "",
      "Bill No": item.software_bill_no || item.bill_number,
      "Barcode": item.barcode,
      "Product Name": item.product_name,
      "Brand": item.brand,
      "Size": item.size,
      "Supplier": item.supplier_name,
      "Qty": item.qty,
      "Purchase Price": item.pur_price,
      "Batch Sale Price": item.sale_price,
      "Current Price": item.current_sale_price ?? "-",
    }));
    const purchaseWs = XLSX.utils.json_to_sheet(purchaseData);
    XLSX.utils.book_append_sheet(wb, purchaseWs, "Purchases");

    // Sales Sheet
    const salesData = filteredSalesData.map(item => ({
      "Date": item.sale_date ? format(new Date(item.sale_date), "dd/MM/yyyy") : "",
      "Sale No": item.sale_number,
      "Barcode": item.barcode,
      "Product Name": item.product_name,
      "Size": item.size,
      "Customer": item.customer_name,
      "Qty": item.quantity,
      "Unit Price": item.unit_price,
      "MRP": item.mrp,
      "Discount %": item.discount_percent,
      "Line Total": item.line_total,
    }));
    const salesWs = XLSX.utils.json_to_sheet(salesData);
    XLSX.utils.book_append_sheet(wb, salesWs, "Sales");

    // Price Edits Sheet
    const editsData = filteredPriceEdits.map(item => ({
      "Date": item.created_at ? format(new Date(item.created_at), "dd/MM/yyyy HH:mm") : "",
      "Barcode": item.barcode,
      "Size": item.size,
      "Old Pur Price": item.old_pur_price ?? "-",
      "New Pur Price": item.new_pur_price ?? "-",
      "Old Sale Price": item.old_sale_price ?? "-",
      "New Sale Price": item.new_sale_price ?? "-",
      "Changed By": item.user_email,
    }));
    const editsWs = XLSX.utils.json_to_sheet(editsData);
    XLSX.utils.book_append_sheet(wb, editsWs, "Price Edits");

    XLSX.writeFile(wb, `Price_History_Report_${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast.success("Exported to Excel");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 print:p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Price History Report</h1>
            <p className="text-muted-foreground text-sm">
              Track prices across purchases, sales & edits
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAllData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6 print:hidden">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Package className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Purchases</p>
                <p className="text-2xl font-bold">{stats.totalPurchases}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sales</p>
                <p className="text-2xl font-bold">{stats.totalSales}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Edit className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Price Edits</p>
                <p className="text-2xl font-bold">{stats.totalEdits}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Products</p>
                <p className="text-2xl font-bold">{stats.uniqueProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Price Changed</p>
                <p className="text-2xl font-bold">{stats.productsWithPriceChange}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date Range</p>
                <p className="text-sm font-semibold">{stats.dateRange}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 print:hidden">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs mb-1">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Barcode, product, bill no..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            {activeTab === "purchases" && (
              <div className="w-[180px]">
                <Label className="text-xs mb-1">Supplier</Label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.supplier_name}>
                        {s.supplier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeTab === "sales" && (
              <div className="w-[180px]">
                <Label className="text-xs mb-1">Customer</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.customer_name}>
                        {c.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="w-[140px]">
              <Label className="text-xs mb-1">From Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="w-[140px]">
              <Label className="text-xs mb-1">To Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {activeTab === "purchases" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="priceChangesOnly"
                  checked={showPriceChangesOnly}
                  onCheckedChange={(checked) => setShowPriceChangesOnly(checked as boolean)}
                />
                <Label htmlFor="priceChangesOnly" className="text-sm cursor-pointer">
                  Price changes only
                </Label>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="print:hidden">
          <TabsTrigger value="all" className="gap-2">
            <History className="h-4 w-4" />
            All History
          </TabsTrigger>
          <TabsTrigger value="purchases" className="gap-2">
            <Package className="h-4 w-4" />
            Purchases
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Sales
          </TabsTrigger>
          <TabsTrigger value="edits" className="gap-2">
            <Edit className="h-4 w-4" />
            Price Edits
          </TabsTrigger>
        </TabsList>

        {/* All History Tab */}
        <TabsContent value="all">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Party/User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : combinedHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No data found
                        </TableCell>
                      </TableRow>
                    ) : (
                      combinedHistory.slice(0, 200).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              item.type === "purchase" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                              item.type === "sale" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                              "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                            }`}>
                              {item.type === "purchase" ? "Purchase" :
                               item.type === "sale" ? "Sale" : "Edit"}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.date ? format(new Date(item.date), "dd/MM/yy") : "-"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.reference}</TableCell>
                          <TableCell className="font-mono">{item.barcode}</TableCell>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell>{item.size}</TableCell>
                          <TableCell className="text-right">{item.qty ?? "-"}</TableCell>
                          <TableCell className="font-medium">{item.price}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{item.party}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchases Tab */}
        <TabsContent value="purchases">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[90px]">Date</TableHead>
                      <TableHead className="w-[100px]">Bill No</TableHead>
                      <TableHead className="w-[100px]">Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-[80px]">Size</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="w-[60px] text-right">Qty</TableHead>
                      <TableHead className="w-[90px] text-right">Pur ₹</TableHead>
                      <TableHead className="w-[90px] text-right">Batch ₹</TableHead>
                      <TableHead className="w-[90px] text-right">Current ₹</TableHead>
                      <TableHead className="w-[60px] text-center">Chg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredPurchaseData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No purchase history found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPurchaseData.map((item) => {
                        const change = getPriceChangeIndicator(item.sale_price, item.current_sale_price);
                        return (
                          <TableRow key={item.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono text-sm">
                              {item.bill_date ? format(new Date(item.bill_date), "dd/MM/yy") : "-"}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.software_bill_no || item.bill_number}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{item.product_name}</TableCell>
                            <TableCell>{item.size}</TableCell>
                            <TableCell>{item.supplier_name}</TableCell>
                            <TableCell className="text-right">{item.qty}</TableCell>
                            <TableCell className="text-right">₹{item.pur_price}</TableCell>
                            <TableCell className="text-right">₹{item.sale_price}</TableCell>
                            <TableCell className="text-right">
                              {item.current_sale_price !== null ? `₹${item.current_sale_price}` : "-"}
                            </TableCell>
                            <TableCell className={`text-center ${change.color}`}>
                              {change.icon}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales Tab */}
        <TabsContent value="sales">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Sale No</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit ₹</TableHead>
                      <TableHead className="text-right">MRP</TableHead>
                      <TableHead className="text-right">Disc %</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredSalesData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No sales history found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSalesData.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-sm">
                            {item.sale_date ? format(new Date(item.sale_date), "dd/MM/yy") : "-"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.sale_number}</TableCell>
                          <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.product_name}</TableCell>
                          <TableCell>{item.size}</TableCell>
                          <TableCell>{item.customer_name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">₹{item.unit_price}</TableCell>
                          <TableCell className="text-right">₹{item.mrp}</TableCell>
                          <TableCell className="text-right">{item.discount_percent}%</TableCell>
                          <TableCell className="text-right font-medium">₹{item.line_total}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Price Edits Tab */}
        <TabsContent value="edits">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Old Pur ₹</TableHead>
                      <TableHead className="text-right">New Pur ₹</TableHead>
                      <TableHead className="text-right">Old Sale ₹</TableHead>
                      <TableHead className="text-right">New Sale ₹</TableHead>
                      <TableHead>Changed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredPriceEdits.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No price edit history found. Price changes will appear here when product prices are modified.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPriceEdits.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-sm">
                            {item.created_at ? format(new Date(item.created_at), "dd/MM/yy HH:mm") : "-"}
                          </TableCell>
                          <TableCell className="font-mono">{item.barcode}</TableCell>
                          <TableCell>{item.size}</TableCell>
                          <TableCell className="text-right">
                            {item.old_pur_price !== null ? `₹${item.old_pur_price}` : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.new_pur_price !== null ? `₹${item.new_pur_price}` : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.old_sale_price !== null ? `₹${item.old_sale_price}` : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.new_sale_price !== null ? `₹${item.new_sale_price}` : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{item.user_email}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Print Styles */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:p-2 { padding: 0.5rem !important; }
        }
      `}</style>
    </div>
  );
};

export default PriceHistoryReport;
