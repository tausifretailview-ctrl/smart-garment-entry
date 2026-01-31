import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Search, Printer, FileSpreadsheet, Package, IndianRupee, TrendingUp, X } from "lucide-react";
import * as XLSX from "xlsx";

interface StockByProduct {
  product_name: string;
  total_qty: number;
  purchase_value: number;
  sale_value: number;
  brand?: string;
  category?: string;
  department?: string;
  supplier_name?: string;
}

export default function ItemWiseStockReport() {
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");

  // Fetch all product variants with stock
  const { data: stockData = [], isLoading } = useQuery({
    queryKey: ["item-wise-stock", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          stock_qty,
          pur_price,
          sale_price,
          products!inner (
            id,
            product_name,
            product_type,
            brand,
            category,
            style,
            deleted_at,
            suppliers (
              supplier_name
            )
          )
        `)
        .eq("products.organization_id", currentOrganization.id)
        .eq("active", true)
        .is("deleted_at", null)
        .is("products.deleted_at", null)
        .neq("products.product_type", "service");

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Extract unique filter values
  const filterOptions = useMemo(() => {
    const brands = new Set<string>();
    const categories = new Set<string>();
    const departments = new Set<string>();
    const suppliers = new Set<string>();

    stockData.forEach((item: any) => {
      if (item.products?.brand) brands.add(item.products.brand);
      if (item.products?.category) categories.add(item.products.category);
      if (item.products?.style) departments.add(item.products.style);
      if (item.products?.suppliers?.supplier_name) suppliers.add(item.products.suppliers.supplier_name);
    });

    return {
      brands: Array.from(brands).sort(),
      categories: Array.from(categories).sort(),
      departments: Array.from(departments).sort(),
      suppliers: Array.from(suppliers).sort(),
    };
  }, [stockData]);

  // Aggregate data by product name with filter support
  const aggregatedData: StockByProduct[] = useMemo(() => {
    const productMap = new Map<string, StockByProduct>();

    stockData.forEach((item: any) => {
      const productName = item.products?.product_name || "Unknown";
      const brand = item.products?.brand || "";
      const category = item.products?.category || "";
      const department = item.products?.style || "";
      const supplier = item.products?.suppliers?.supplier_name || "";

      // Apply filters (skip __all__ placeholder)
      if (brandFilter && brandFilter !== "__all__" && brand !== brandFilter) return;
      if (categoryFilter && categoryFilter !== "__all__" && category !== categoryFilter) return;
      if (departmentFilter && departmentFilter !== "__all__" && department !== departmentFilter) return;
      if (supplierFilter && supplierFilter !== "__all__" && supplier !== supplierFilter) return;

      const existing = productMap.get(productName);
      const qty = item.stock_qty || 0;
      const purPrice = item.pur_price || 0;
      const salePrice = item.sale_price || 0;

      if (existing) {
        existing.total_qty += qty;
        existing.purchase_value += purPrice * qty;
        existing.sale_value += salePrice * qty;
      } else {
        productMap.set(productName, {
          product_name: productName,
          total_qty: qty,
          purchase_value: purPrice * qty,
          sale_value: salePrice * qty,
          brand,
          category,
          department,
          supplier_name: supplier,
        });
      }
    });

    return Array.from(productMap.values()).sort((a, b) => 
      a.product_name.localeCompare(b.product_name)
    );
  }, [stockData, brandFilter, categoryFilter, departmentFilter, supplierFilter]);

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return aggregatedData;

    const query = searchQuery.toLowerCase();
    return aggregatedData.filter((item) =>
      item.product_name?.toLowerCase().includes(query)
    );
  }, [aggregatedData, searchQuery]);

  // Clear all filters
  const clearFilters = () => {
    setBrandFilter("");
    setCategoryFilter("");
    setDepartmentFilter("");
    setSupplierFilter("");
    setSearchQuery("");
  };

  const hasActiveFilters = (brandFilter && brandFilter !== "__all__") || (categoryFilter && categoryFilter !== "__all__") || (departmentFilter && departmentFilter !== "__all__") || (supplierFilter && supplierFilter !== "__all__") || searchQuery;

  // Grand totals
  const grandTotals = useMemo(() => {
    return filteredData.reduce(
      (acc, item) => ({
        total_qty: acc.total_qty + item.total_qty,
        purchase_value: acc.purchase_value + item.purchase_value,
        sale_value: acc.sale_value + item.sale_value,
      }),
      { total_qty: 0, purchase_value: 0, sale_value: 0 }
    );
  }, [filteredData]);

  // Export to Excel
  const exportToExcel = () => {
    const exportData = filteredData.map((item, idx) => ({
      "Sr.No": idx + 1,
      "Particulars": item.product_name,
      "Stock": item.total_qty,
      "Purchase Value": item.purchase_value.toFixed(2),
      "Sales Value": item.sale_value.toFixed(2),
    }));

    // Add grand total row
    exportData.push({
      "Sr.No": "" as any,
      "Particulars": "Grand Totals:",
      "Stock": grandTotals.total_qty,
      "Purchase Value": grandTotals.purchase_value.toFixed(2),
      "Sales Value": grandTotals.sale_value.toFixed(2),
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Wise Stock");
    XLSX.writeFile(wb, `item-wise-stock-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // Print report
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6 print:p-2 print:space-y-2">
      <div className="print:hidden">
        <BackToDashboard />
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground print:text-lg">
            ITEM NAME Wise Stock Report ({currentOrganization?.name || ""})
          </h1>
          <p className="text-sm text-muted-foreground print:text-xs">
            {format(new Date(), "dd-MM-yyyy    hh:mm:ss a")}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 print:hidden">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-lg">
                <Package className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Stock</p>
                <p className="text-2xl font-bold">{grandTotals.total_qty.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <IndianRupee className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Purchase Value</p>
                <p className="text-2xl font-bold">₹{Math.round(grandTotals.purchase_value).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sale Value</p>
                <p className="text-2xl font-bold">₹{Math.round(grandTotals.sale_value).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <div className="flex-1 min-w-[200px] max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search product name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Brands</SelectItem>
            {filterOptions.brands.map((brand) => (
              <SelectItem key={brand} value={brand}>{brand}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {filterOptions.categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Departments</SelectItem>
            {filterOptions.departments.map((dept) => (
              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Suppliers</SelectItem>
            {filterOptions.suppliers.map((sup) => (
              <SelectItem key={sup} value={sup}>{sup}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Data Table */}
      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-0">
          <div className="border rounded-lg overflow-hidden print:border-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 print:bg-transparent">
                  <TableHead className="w-[80px] print:text-xs print:py-1">Sr.No</TableHead>
                  <TableHead className="print:text-xs print:py-1">Particulars</TableHead>
                  <TableHead className="text-right print:text-xs print:py-1">Stock</TableHead>
                  <TableHead className="text-right print:text-xs print:py-1">Purchase Value</TableHead>
                  <TableHead className="text-right print:text-xs print:py-1">Sales Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No stock data found
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filteredData.map((item, idx) => (
                      <TableRow key={item.product_name} className="hover:bg-muted/30 print:hover:bg-transparent">
                        <TableCell className="print:text-xs print:py-1">{idx + 1}</TableCell>
                        <TableCell className="font-medium print:text-xs print:py-1">{item.product_name}</TableCell>
                        <TableCell className="text-right print:text-xs print:py-1">{item.total_qty}</TableCell>
                        <TableCell className="text-right print:text-xs print:py-1">{item.purchase_value.toFixed(2)}</TableCell>
                        <TableCell className="text-right print:text-xs print:py-1">{item.sale_value.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {/* Grand Total Row */}
                    <TableRow className="bg-muted/70 font-bold print:bg-transparent border-t-2">
                      <TableCell className="print:text-xs print:py-1"></TableCell>
                      <TableCell className="text-primary print:text-xs print:py-1">Grand Totals:</TableCell>
                      <TableCell className="text-right print:text-xs print:py-1">{grandTotals.total_qty}</TableCell>
                      <TableCell className="text-right print:text-xs print:py-1">{grandTotals.purchase_value.toFixed(2)}</TableCell>
                      <TableCell className="text-right print:text-xs print:py-1">{grandTotals.sale_value.toFixed(2)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
