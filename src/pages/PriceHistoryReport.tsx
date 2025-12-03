import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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

interface Supplier {
  id: string;
  supplier_name: string;
}

const PriceHistoryReport = () => {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showPriceChangesOnly, setShowPriceChangesOnly] = useState(false);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchData();
    }
  }, [currentOrganization?.id]);

  const fetchData = async () => {
    if (!currentOrganization?.id) return;
    
    setLoading(true);
    try {
      // Fetch purchase items with bill info
      const { data: purchaseItems, error: purchaseError } = await supabase
        .from("purchase_items")
        .select(`
          id,
          barcode,
          product_name,
          brand,
          category,
          size,
          pur_price,
          sale_price,
          qty,
          bill_number,
          created_at,
          purchase_bills!inner (
            software_bill_no,
            supplier_name,
            bill_date,
            organization_id
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

      // Merge data
      const mergedData: PurchaseHistoryItem[] = (purchaseItems || []).map(item => {
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

      setPurchaseHistory(mergedData);

      // Fetch suppliers
      const { data: suppliersData } = await supabase
        .from("suppliers")
        .select("id, supplier_name")
        .eq("organization_id", currentOrganization.id)
        .order("supplier_name");
      
      setSuppliers(suppliersData || []);
    } catch (error) {
      console.error("Error fetching price history:", error);
      toast.error("Failed to load price history");
    } finally {
      setLoading(false);
    }
  };

  // Filter data
  const filteredData = useMemo(() => {
    return purchaseHistory.filter(item => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          item.barcode?.toLowerCase().includes(search) ||
          item.product_name?.toLowerCase().includes(search) ||
          item.brand?.toLowerCase().includes(search) ||
          item.category?.toLowerCase().includes(search) ||
          item.bill_number?.toLowerCase().includes(search) ||
          item.software_bill_no?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // Supplier filter
      if (selectedSupplier !== "all" && item.supplier_name !== selectedSupplier) {
        return false;
      }

      // Date filters
      if (startDate && item.bill_date < startDate) return false;
      if (endDate && item.bill_date > endDate) return false;

      // Price changes only
      if (showPriceChangesOnly) {
        if (item.current_sale_price === null) return false;
        if (item.sale_price === item.current_sale_price) return false;
      }

      return true;
    });
  }, [purchaseHistory, searchTerm, selectedSupplier, startDate, endDate, showPriceChangesOnly]);

  // Summary statistics
  const stats = useMemo(() => {
    const uniqueProducts = new Set(filteredData.map(d => d.barcode)).size;
    const productsWithPriceChange = new Set(
      filteredData
        .filter(d => d.current_sale_price !== null && d.sale_price !== d.current_sale_price)
        .map(d => d.barcode)
    ).size;
    const totalEntries = filteredData.length;
    
    const dates = filteredData.map(d => d.bill_date).filter(Boolean).sort();
    const dateRange = dates.length > 0 
      ? `${format(new Date(dates[0]), "dd MMM")} - ${format(new Date(dates[dates.length - 1]), "dd MMM yyyy")}`
      : "No data";

    return { uniqueProducts, productsWithPriceChange, totalEntries, dateRange };
  }, [filteredData]);

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedSupplier("all");
    setStartDate("");
    setEndDate("");
    setShowPriceChangesOnly(false);
  };

  const getPriceChangeIndicator = (batchPrice: number, currentPrice: number | null) => {
    if (currentPrice === null) return { icon: <Minus className="h-4 w-4" />, color: "text-muted-foreground", label: "N/A" };
    if (currentPrice > batchPrice) return { icon: <TrendingUp className="h-4 w-4" />, color: "text-green-600", label: "↑" };
    if (currentPrice < batchPrice) return { icon: <TrendingDown className="h-4 w-4" />, color: "text-red-600", label: "↓" };
    return { icon: <Minus className="h-4 w-4" />, color: "text-muted-foreground", label: "=" };
  };

  const exportToExcel = () => {
    const exportData = filteredData.map(item => ({
      "Date": item.bill_date ? format(new Date(item.bill_date), "dd/MM/yyyy") : "",
      "Bill No": item.software_bill_no || item.bill_number,
      "Barcode": item.barcode,
      "Product Name": item.product_name,
      "Brand": item.brand,
      "Category": item.category,
      "Size": item.size,
      "Supplier": item.supplier_name,
      "Qty": item.qty,
      "Purchase Price": item.pur_price,
      "Batch Sale Price": item.sale_price,
      "Current Price": item.current_sale_price ?? "",
      "Price Change": item.current_sale_price !== null
        ? item.current_sale_price > item.sale_price ? "Increased"
          : item.current_sale_price < item.sale_price ? "Decreased" : "Same"
        : "N/A",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Price History");
    XLSX.writeFile(wb, `Price_History_Report_${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast.success("Exported to Excel");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Price History Report</h1>
            <p className="text-muted-foreground text-sm">
              Track purchase prices across different bills/batches
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
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
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-orange-500" />
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
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Entries</p>
                <p className="text-2xl font-bold">{stats.totalEntries}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-green-500" />
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
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs mb-1">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Barcode, product, brand, bill no..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
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

            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
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
                      <p className="text-muted-foreground mt-2">Loading...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8">
                      <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No purchase history found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item) => {
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
                        <TableCell>
                          <div>
                            <p className="font-medium truncate max-w-[200px]">{item.product_name}</p>
                            {item.brand && (
                              <p className="text-xs text-muted-foreground">{item.brand}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {item.size}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-[120px]">
                          {item.supplier_name}
                        </TableCell>
                        <TableCell className="text-right font-mono">{item.qty}</TableCell>
                        <TableCell className="text-right font-mono">
                          ₹{item.pur_price.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          ₹{item.sale_price.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.current_sale_price !== null
                            ? `₹${item.current_sale_price.toLocaleString()}`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${change.color}`}>
                            {change.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Footer */}
          <div className="border-t p-4 flex justify-between items-center text-sm text-muted-foreground">
            <p>Showing {filteredData.length} of {purchaseHistory.length} entries</p>
            <p>
              Products with price changes: <span className="font-semibold text-foreground">{stats.productsWithPriceChange}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .min-h-screen, .min-h-screen * {
            visibility: visible;
          }
          .min-h-screen {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          button, .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default PriceHistoryReport;
