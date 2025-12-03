import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { CalendarIcon, Search, Package, IndianRupee, TrendingUp, Printer, FileSpreadsheet, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

type PeriodType = "daily" | "monthly" | "quarterly" | "yearly" | "custom";

interface SaleItemData {
  barcode: string | null;
  product_name: string;
  size: string;
  brand: string | null;
  category: string | null;
  color: string | null;
  total_qty: number;
  avg_price: number;
  total_amount: number;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(210, 70%, 50%)",
  "hsl(150, 60%, 45%)",
  "hsl(45, 90%, 55%)",
  "hsl(280, 65%, 55%)",
  "hsl(0, 70%, 55%)",
  "hsl(180, 60%, 45%)",
];

export default function ItemWiseSalesReport() {
  const { currentOrganization } = useOrganization();
  const [periodType, setPeriodType] = useState<PeriodType>("daily");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(),
    to: new Date(),
  });
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate date range based on period type
  const dateRange = useMemo(() => {
    const today = selectedDate;
    switch (periodType) {
      case "daily":
        return { from: startOfDay(today), to: endOfDay(today) };
      case "monthly":
        return { from: startOfMonth(today), to: endOfMonth(today) };
      case "quarterly":
        return { from: startOfQuarter(today), to: endOfQuarter(today) };
      case "yearly":
        // Financial year (April - March)
        const month = today.getMonth();
        const year = today.getFullYear();
        const fyStart = month >= 3 ? new Date(year, 3, 1) : new Date(year - 1, 3, 1);
        const fyEnd = month >= 3 ? new Date(year + 1, 2, 31) : new Date(year, 2, 31);
        return { from: fyStart, to: fyEnd };
      case "custom":
        return { from: startOfDay(customDateRange.from), to: endOfDay(customDateRange.to) };
      default:
        return { from: startOfDay(today), to: endOfDay(today) };
    }
  }, [periodType, selectedDate, customDateRange]);

  // Fetch sale items with product details
  const { data: saleItems = [], isLoading } = useQuery({
    queryKey: ["item-wise-sales", currentOrganization?.id, dateRange.from, dateRange.to],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      // First get sales within date range for the organization
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", dateRange.from.toISOString())
        .lte("sale_date", dateRange.to.toISOString());

      if (salesError) throw salesError;
      if (!salesData || salesData.length === 0) return [];

      const saleIds = salesData.map((s) => s.id);

      // Then get sale items for those sales
      const { data, error } = await supabase
        .from("sale_items")
        .select(`
          barcode,
          product_name,
          size,
          quantity,
          unit_price,
          line_total,
          product_id,
          sale_id,
          products:product_id (
            brand,
            category,
            color
          )
        `)
        .in("sale_id", saleIds);

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Aggregate data by product
  const aggregatedData: SaleItemData[] = useMemo(() => {
    const productMap = new Map<string, SaleItemData>();

    saleItems.forEach((item: any) => {
      const key = `${item.barcode || ""}-${item.product_name}-${item.size}`;
      const existing = productMap.get(key);

      if (existing) {
        existing.total_qty += item.quantity;
        existing.total_amount += Number(item.line_total);
        existing.avg_price = existing.total_amount / existing.total_qty;
      } else {
        productMap.set(key, {
          barcode: item.barcode,
          product_name: item.product_name,
          size: item.size,
          brand: item.products?.brand || null,
          category: item.products?.category || null,
          color: item.products?.color || null,
          total_qty: item.quantity,
          avg_price: Number(item.unit_price),
          total_amount: Number(item.line_total),
        });
      }
    });

    return Array.from(productMap.values()).sort((a, b) => b.total_amount - a.total_amount);
  }, [saleItems]);

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return aggregatedData;

    const query = searchQuery.toLowerCase();
    return aggregatedData.filter(
      (item) =>
        item.product_name?.toLowerCase().includes(query) ||
        item.barcode?.toLowerCase().includes(query) ||
        item.brand?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        item.color?.toLowerCase().includes(query) ||
        item.size?.toLowerCase().includes(query)
    );
  }, [aggregatedData, searchQuery]);

  // Summary statistics
  const summary = useMemo(() => {
    const totalQty = filteredData.reduce((sum, item) => sum + item.total_qty, 0);
    const totalAmount = filteredData.reduce((sum, item) => sum + item.total_amount, 0);
    const uniqueProducts = filteredData.length;
    const avgPrice = totalQty > 0 ? totalAmount / totalQty : 0;
    return { totalQty, totalAmount, uniqueProducts, avgPrice };
  }, [filteredData]);

  // Chart data - Top 10 products
  const topProductsData = useMemo(() => {
    return filteredData.slice(0, 10).map((item) => ({
      name: item.product_name.length > 15 ? item.product_name.substring(0, 15) + "..." : item.product_name,
      qty: item.total_qty,
      amount: item.total_amount,
    }));
  }, [filteredData]);

  // Category distribution
  const categoryData = useMemo(() => {
    const categoryMap = new Map<string, number>();
    filteredData.forEach((item) => {
      const category = item.category || "Uncategorized";
      categoryMap.set(category, (categoryMap.get(category) || 0) + item.total_amount);
    });
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredData]);

  // Export to Excel
  const exportToExcel = () => {
    const exportData = filteredData.map((item) => ({
      Barcode: item.barcode || "-",
      "Product Name": item.product_name,
      Brand: item.brand || "-",
      Category: item.category || "-",
      Color: item.color || "-",
      Size: item.size,
      "Qty Sold": item.total_qty,
      "Avg Price": item.avg_price.toFixed(2),
      "Total Amount": item.total_amount.toFixed(2),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item-wise Sales");
    XLSX.writeFile(wb, `item-wise-sales-${format(dateRange.from, "yyyy-MM-dd")}.xlsx`);
  };

  // Print report
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      <BackToDashboard />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Item-wise Sales Report</h1>
        <div className="flex items-center gap-2">
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            {/* Period Type */}
            <div className="w-full md:w-40">
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Period</label>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly (FY)</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Picker */}
            {periodType !== "custom" && (
              <div className="w-full md:w-48">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Custom Date Range */}
            {periodType === "custom" && (
              <>
                <div className="w-full md:w-48">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">From</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(customDateRange.from, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={customDateRange.from}
                        onSelect={(date) => date && setCustomDateRange((prev) => ({ ...prev, from: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="w-full md:w-48">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">To</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(customDateRange.to, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={customDateRange.to}
                        onSelect={(date) => date && setCustomDateRange((prev) => ({ ...prev, to: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            {/* Search */}
            <div className="flex-1">
              <label className="text-sm font-medium text-muted-foreground mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product, barcode, brand, category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="mt-2 text-sm text-muted-foreground">
            Showing data from {format(dateRange.from, "dd MMM yyyy")} to {format(dateRange.to, "dd MMM yyyy")}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Qty Sold</p>
                <p className="text-2xl font-bold">{summary.totalQty.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <IndianRupee className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Sales</p>
                <p className="text-2xl font-bold">₹{summary.totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Products</p>
                <p className="text-2xl font-bold">{summary.uniqueProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Sale Price</p>
                <p className="text-2xl font-bold">₹{summary.avgPrice.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top 10 Products by Quantity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="name" type="category" width={120} className="text-xs" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [value.toLocaleString(), "Qty"]}
                  />
                  <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sales by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, "Amount"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Item-wise Details ({filteredData.length} items)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[100px]">Barcode</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Avg Price</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No sales data found for the selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-sm">{item.barcode || "-"}</TableCell>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell>{item.brand || "-"}</TableCell>
                      <TableCell>{item.category || "-"}</TableCell>
                      <TableCell>{item.color || "-"}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell className="text-right font-medium">{item.total_qty}</TableCell>
                      <TableCell className="text-right">₹{item.avg_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        ₹{item.total_amount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
