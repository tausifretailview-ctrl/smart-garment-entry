import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, Pie, PieChart, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";

interface Sale {
  id: string;
  sale_date: string;
  sale_number: string;
  customer_name: string;
  gross_amount: number;
  discount_amount: number;
  net_amount: number;
  payment_method: string;
  payment_status: string;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#8884d8', '#82ca9d', '#ffc658'];

const REPORT_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false as const,
};

const ITEMS_PER_PAGE = 100;

/**
 * Lightweight sales fetch for report - only 9 columns instead of 19
 */
async function fetchSalesForReport(
  organizationId: string,
  filters: { startDate?: string; endDate?: string; customerId?: string }
) {
  const allRows: Sale[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("sales")
      .select("id, sale_date, sale_number, customer_name, gross_amount, discount_amount, net_amount, payment_method, payment_status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("sale_date", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (filters.startDate) query = query.gte("sale_date", filters.startDate);
    if (filters.endDate) query = query.lte("sale_date", filters.endDate);
    if (filters.customerId) query = query.eq("customer_id", filters.customerId);

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      allRows.push(...(data as Sale[]));
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }
  return allRows;
}

const SalesReportByCustomer = () => {
  const { currentOrganization } = useOrganization();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  // Default to current month start
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch customers with caching
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-all", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      return await fetchAllCustomers(currentOrganization.id);
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_QUERY_OPTIONS,
  });

  // Fetch sales with lightweight query + caching
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales-report", currentOrganization?.id, selectedCustomerId, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const filters: any = {};
      if (startDate) filters.startDate = format(startDate, "yyyy-MM-dd");
      if (endDate) filters.endDate = format(endDate, "yyyy-MM-dd");
      if (selectedCustomerId !== "all") filters.customerId = selectedCustomerId;
      
      return await fetchSalesForReport(currentOrganization.id, filters);
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_QUERY_OPTIONS,
  });

  // Reset page when filters change
  const resetPage = () => setCurrentPage(1);

  // Calculate totals
  const totals = useMemo(() => ({
    grossAmount: sales.reduce((sum, sale) => sum + (sale.gross_amount || 0), 0),
    discountAmount: sales.reduce((sum, sale) => sum + (sale.discount_amount || 0), 0),
    netAmount: sales.reduce((sum, sale) => sum + (sale.net_amount || 0), 0),
    saleCount: sales.length,
  }), [sales]);

  // Group by customer for chart
  const chartData = useMemo(() => {
    const customerData = sales.reduce((acc: any, sale) => {
      const customerName = sale.customer_name || "Walk in Customer";
      if (!acc[customerName]) {
        acc[customerName] = { name: customerName, amount: 0, count: 0 };
      }
      acc[customerName].amount += sale.net_amount || 0;
      acc[customerName].count += 1;
      return acc;
    }, {});
    return Object.values(customerData).sort((a: any, b: any) => b.amount - a.amount).slice(0, 10);
  }, [sales]);

  // Payment method breakdown
  const pieChartData = useMemo(() => {
    const paymentMethodData = sales.reduce((acc: any, sale) => {
      const method = sale.payment_method || "Unknown";
      if (!acc[method]) acc[method] = { name: method, value: 0 };
      acc[method].value += sale.net_amount || 0;
      return acc;
    }, {});
    return Object.values(paymentMethodData);
  }, [sales]);

  // Pagination
  const totalPages = Math.ceil(sales.length / ITEMS_PER_PAGE);
  const paginatedSales = useMemo(() => 
    sales.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [sales, currentPage]
  );

  return (
    <div className="w-full px-6 py-6 space-y-6">
      <BackToDashboard />

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sales Report by Customer</h1>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={selectedCustomerId} onValueChange={(v) => { setSelectedCustomerId(v); resetPage(); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background z-50" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d!); resetPage(); }} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background z-50" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d!); resetPage(); }} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.saleCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Amount</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totals.grossAmount.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Discount Amount</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totals.discountAmount.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Amount</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totals.netAmount.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Customers by Sales Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" name="Sales Amount (₹)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {pieChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Payment Method Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sales Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Transactions ({sales.length} total)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale Date</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Gross Amount</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
                      No sales found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{format(new Date(sale.sale_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{sale.sale_number}</TableCell>
                      <TableCell>{sale.customer_name}</TableCell>
                      <TableCell className="text-right">₹{sale.gross_amount?.toFixed(2)}</TableCell>
                      <TableCell className="text-right">₹{sale.discount_amount?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">₹{sale.net_amount?.toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{sale.payment_method}</TableCell>
                      <TableCell>
                        <Badge variant={sale.payment_status === "completed" ? "default" : "secondary"}>
                          {sale.payment_status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sales.length)} of {sales.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesReportByCustomer;
