import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllSuppliers, fetchAllPurchaseBillsWithFilters } from "@/utils/fetchAllRows";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, TrendingUp, Receipt, IndianRupee, Percent } from "lucide-react";
import { ReportKpiCards, type ReportKpiItem } from "@/components/reports/ReportKpiCards";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";

interface PurchaseBill {
  id: string;
  bill_date: string;
  supplier_name: string;
  supplier_invoice_no: string;
  gross_amount: number;
  gst_amount: number;
  net_amount: number;
}

const PurchaseReportBySupplier = () => {
  const { currentOrganization } = useOrganization();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  const REPORT_CACHE = { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false as const };

  // Fetch suppliers using paginated fetch to bypass 1000 limit
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-all", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      return await fetchAllSuppliers(currentOrganization.id);
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Fetch purchase bills using paginated fetch to bypass 1000 limit
  const { data: purchaseBills = [], isLoading } = useQuery({
    queryKey: ["purchase-bills-report", currentOrganization?.id, selectedSupplierId, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const filters: any = {};
      if (startDate) filters.startDate = format(startDate, "yyyy-MM-dd");
      if (endDate) filters.endDate = format(endDate, "yyyy-MM-dd");
      if (selectedSupplierId !== "all") filters.supplierId = selectedSupplierId;
      
      const allBills = await fetchAllPurchaseBillsWithFilters(currentOrganization.id, filters);
      return allBills as PurchaseBill[];
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Calculate totals
  const totals = {
    grossAmount: purchaseBills.reduce((sum, bill) => sum + (bill.gross_amount || 0), 0),
    gstAmount: purchaseBills.reduce((sum, bill) => sum + (bill.gst_amount || 0), 0),
    netAmount: purchaseBills.reduce((sum, bill) => sum + (bill.net_amount || 0), 0),
    billCount: purchaseBills.length,
  };

  // Group by supplier for chart
  const supplierData = purchaseBills.reduce((acc: any, bill) => {
    const supplierName = bill.supplier_name || "Unknown";
    if (!acc[supplierName]) {
      acc[supplierName] = {
        name: supplierName,
        amount: 0,
        count: 0,
      };
    }
    acc[supplierName].amount += bill.net_amount || 0;
    acc[supplierName].count += 1;
    return acc;
  }, {});

  const chartData = Object.values(supplierData).sort((a: any, b: any) => b.amount - a.amount).slice(0, 10);

  const purchaseKpiItems = useMemo((): ReportKpiItem[] => [
    {
      label: "Total Bills",
      value: totals.billCount.toLocaleString("en-IN"),
      gradient: "bg-gradient-to-br from-blue-500 to-blue-600",
      icon: Receipt,
    },
    {
      label: "Gross Amount",
      value: `₹${totals.grossAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      gradient: "bg-gradient-to-br from-violet-500 to-violet-600",
      icon: TrendingUp,
    },
    {
      label: "GST Amount",
      value: `₹${totals.gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      gradient: "bg-gradient-to-br from-amber-500 to-amber-600",
      icon: Percent,
    },
    {
      label: "Net Amount",
      value: `₹${totals.netAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      gradient: "bg-gradient-to-br from-emerald-500 to-emerald-600",
      icon: IndianRupee,
    },
  ], [totals]);

  return (
    <div className="min-h-screen bg-slate-50 px-2 sm:px-4 lg:px-5 py-6 space-y-5">
      <BackToDashboard />

      <div>
        <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight">Purchase Report by Supplier</h1>
        <p className="text-slate-400 text-base mt-0.5">Filter by supplier and date range</p>
      </div>

      <ReportKpiCards items={purchaseKpiItems} />

      <Card className="rounded-xl border border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-700">Filters</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.supplier_name}
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
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
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
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Suppliers by Purchase Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="amount" fill="hsl(var(--primary))" name="Purchase Amount (₹)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Purchase Bills Table */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Bills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead className="text-right">Gross Amount</TableHead>
                  <TableHead className="text-right">GST Amount</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : purchaseBills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      No purchase bills found
                    </TableCell>
                  </TableRow>
                ) : (
                  purchaseBills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell>{format(new Date(bill.bill_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{bill.supplier_name}</TableCell>
                      <TableCell>{bill.supplier_invoice_no}</TableCell>
                      <TableCell className="text-right">₹{bill.gross_amount?.toFixed(2)}</TableCell>
                      <TableCell className="text-right">₹{bill.gst_amount?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">₹{bill.net_amount?.toFixed(2)}</TableCell>
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
};

export default PurchaseReportBySupplier;
