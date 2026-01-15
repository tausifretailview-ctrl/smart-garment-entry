import { useState, useEffect } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Loader2, Download, Printer, TrendingUp, TrendingDown, Wallet, PieChart, FileSpreadsheet, Scale, Calculator } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  calculateTrialBalance,
  calculateProfitLoss,
  calculateBalanceSheet,
  calculateNetProfitSummary,
  TrialBalanceEntry,
  ProfitLossData,
  BalanceSheetData,
  NetProfitSummary,
} from "@/utils/accountingReportUtils";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
};

export default function AccountingReports() {
  const { currentOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState("trial-balance");
  const [loading, setLoading] = useState(false);

  // Date filters
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [fromDate, setFromDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Report data
  const [trialBalance, setTrialBalance] = useState<TrialBalanceEntry[]>([]);
  const [profitLoss, setProfitLoss] = useState<ProfitLossData | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(null);
  const [netProfitSummary, setNetProfitSummary] = useState<NetProfitSummary | null>(null);

  const fetchTrialBalance = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      const data = await calculateTrialBalance(currentOrganization.id, asOfDate);
      setTrialBalance(data);
    } catch (error) {
      toast.error("Failed to load Trial Balance");
      console.error(error);
    }
    setLoading(false);
  };

  const fetchProfitLoss = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      const data = await calculateProfitLoss(currentOrganization.id, fromDate, toDate);
      setProfitLoss(data);
    } catch (error) {
      toast.error("Failed to load Profit & Loss");
      console.error(error);
    }
    setLoading(false);
  };

  const fetchBalanceSheet = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      const data = await calculateBalanceSheet(currentOrganization.id, asOfDate);
      setBalanceSheet(data);
    } catch (error) {
      toast.error("Failed to load Balance Sheet");
      console.error(error);
    }
    setLoading(false);
  };

  const fetchNetProfitSummary = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      const data = await calculateNetProfitSummary(currentOrganization.id, fromDate, toDate);
      setNetProfitSummary(data);
    } catch (error) {
      toast.error("Failed to load Net Profit Summary");
      console.error(error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === "trial-balance") fetchTrialBalance();
    else if (activeTab === "profit-loss") fetchProfitLoss();
    else if (activeTab === "balance-sheet") fetchBalanceSheet();
    else if (activeTab === "net-profit") fetchNetProfitSummary();
  }, [activeTab, currentOrganization?.id]);

  const handleGenerateReport = () => {
    if (activeTab === "trial-balance") fetchTrialBalance();
    else if (activeTab === "profit-loss") fetchProfitLoss();
    else if (activeTab === "balance-sheet") fetchBalanceSheet();
    else if (activeTab === "net-profit") fetchNetProfitSummary();
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    if (activeTab === "trial-balance" && trialBalance.length > 0) {
      const data = trialBalance.map((e) => ({
        "Account Name": e.accountName,
        "Account Type": e.accountType,
        "Debit (₹)": e.debit,
        "Credit (₹)": e.credit,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    } else if (activeTab === "profit-loss" && profitLoss) {
      const data = [
        { Particulars: "REVENUE", Amount: "" },
        { Particulars: "Gross Sales", Amount: profitLoss.grossSales },
        { Particulars: "Less: Sales Returns", Amount: -profitLoss.salesReturns },
        { Particulars: "Net Sales", Amount: profitLoss.netSales },
        { Particulars: "", Amount: "" },
        { Particulars: "COST OF GOODS SOLD", Amount: "" },
        { Particulars: "Opening Stock", Amount: profitLoss.openingStock },
        { Particulars: "Add: Purchases", Amount: profitLoss.purchases },
        { Particulars: "Less: Purchase Returns", Amount: -profitLoss.purchaseReturns },
        { Particulars: "Less: Closing Stock", Amount: -profitLoss.closingStock },
        { Particulars: "Total COGS", Amount: profitLoss.cogs },
        { Particulars: "", Amount: "" },
        { Particulars: "GROSS PROFIT", Amount: profitLoss.grossProfit },
        { Particulars: "", Amount: "" },
        { Particulars: "EXPENSES", Amount: "" },
        { Particulars: "Operating Expenses", Amount: profitLoss.expenses },
        { Particulars: "", Amount: "" },
        { Particulars: "NET PROFIT", Amount: profitLoss.netProfit },
        { Particulars: "Profit Margin %", Amount: `${profitLoss.profitMargin.toFixed(2)}%` },
      ];
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Profit & Loss");
    } else if (activeTab === "balance-sheet" && balanceSheet) {
      const data = [
        { Particulars: "ASSETS", Amount: "" },
        { Particulars: "Cash & Bank", Amount: balanceSheet.assets.cashBank },
        { Particulars: "Accounts Receivable", Amount: balanceSheet.assets.accountsReceivable },
        { Particulars: "Inventory", Amount: balanceSheet.assets.inventory },
        { Particulars: "Total Assets", Amount: balanceSheet.assets.totalAssets },
        { Particulars: "", Amount: "" },
        { Particulars: "LIABILITIES", Amount: "" },
        { Particulars: "Accounts Payable", Amount: balanceSheet.liabilities.accountsPayable },
        { Particulars: "GST Payable", Amount: balanceSheet.liabilities.gstPayable },
        { Particulars: "Total Liabilities", Amount: balanceSheet.liabilities.totalLiabilities },
        { Particulars: "", Amount: "" },
        { Particulars: "OWNER'S EQUITY", Amount: "" },
        { Particulars: "Closing Capital", Amount: balanceSheet.equity.closingCapital },
      ];
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet");
    }

    XLSX.writeFile(wb, `${activeTab}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Report exported successfully");
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculate totals for trial balance
  const tbTotals = trialBalance.reduce(
    (acc, e) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }),
    { debit: 0, credit: 0 }
  );

  return (
    <div className="space-y-6 p-6 print:p-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Accounting Reports
          </h1>
          <p className="text-muted-foreground">
            View Trial Balance, Profit & Loss, Balance Sheet, and Net Profit Summary
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 print:hidden">
          <TabsTrigger value="trial-balance" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            <span className="hidden sm:inline">Trial Balance</span>
          </TabsTrigger>
          <TabsTrigger value="profit-loss" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Profit & Loss</span>
          </TabsTrigger>
          <TabsTrigger value="balance-sheet" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Balance Sheet</span>
          </TabsTrigger>
          <TabsTrigger value="net-profit" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            <span className="hidden sm:inline">Net Profit</span>
          </TabsTrigger>
        </TabsList>

        {/* Trial Balance */}
        <TabsContent value="trial-balance" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Trial Balance
                </CardTitle>
                <div className="flex items-center gap-4 print:hidden">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="asOfDate">As of Date:</Label>
                    <Input
                      id="asOfDate"
                      type="date"
                      value={asOfDate}
                      onChange={(e) => setAsOfDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button onClick={handleGenerateReport} disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Generate
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground print:text-black">
                As of: {format(new Date(asOfDate), "dd MMM yyyy")}
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Debit (₹)</TableHead>
                      <TableHead className="text-right">Credit (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialBalance.map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{entry.accountName}</TableCell>
                        <TableCell>{entry.accountType}</TableCell>
                        <TableCell className="text-right">
                          {entry.debit > 0 ? formatCurrency(entry.debit) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.credit > 0 ? formatCurrency(entry.credit) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {trialBalance.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No data available. Click Generate to load the report.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {trialBalance.length > 0 && (
                    <TableFooter>
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right">{formatCurrency(tbTotals.debit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(tbTotals.credit)}</TableCell>
                      </TableRow>
                      {Math.abs(tbTotals.debit - tbTotals.credit) > 0.01 && (
                        <TableRow className="text-destructive">
                          <TableCell colSpan={4} className="text-center">
                            ⚠️ Trial Balance does not match. Difference: {formatCurrency(Math.abs(tbTotals.debit - tbTotals.credit))}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableFooter>
                  )}
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profit & Loss */}
        <TabsContent value="profit-loss" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Profit & Loss Statement
                </CardTitle>
                <div className="flex items-center gap-4 print:hidden">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="fromDate">From:</Label>
                    <Input
                      id="fromDate"
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="toDate">To:</Label>
                    <Input
                      id="toDate"
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button onClick={handleGenerateReport} disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Generate
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground print:text-black">
                Period: {format(new Date(fromDate), "dd MMM yyyy")} - {format(new Date(toDate), "dd MMM yyyy")}
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : profitLoss ? (
                <div className="space-y-6">
                  {/* Revenue Section */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3 text-primary">REVENUE</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Gross Sales</span>
                        <span>{formatCurrency(profitLoss.grossSales)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Less: Sales Returns</span>
                        <span>({formatCurrency(profitLoss.salesReturns)})</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-2">
                        <span>Net Sales</span>
                        <span>{formatCurrency(profitLoss.netSales)}</span>
                      </div>
                    </div>
                  </div>

                  {/* COGS Section */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3 text-primary">COST OF GOODS SOLD</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Opening Stock</span>
                        <span>{formatCurrency(profitLoss.openingStock)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Add: Purchases</span>
                        <span>{formatCurrency(profitLoss.purchases)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Less: Purchase Returns</span>
                        <span>({formatCurrency(profitLoss.purchaseReturns)})</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Less: Closing Stock</span>
                        <span>({formatCurrency(profitLoss.closingStock)})</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-2">
                        <span>Total COGS</span>
                        <span>{formatCurrency(profitLoss.cogs)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Gross Profit */}
                  <div className={`border rounded-lg p-4 ${profitLoss.grossProfit >= 0 ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950'}`}>
                    <div className="flex justify-between font-bold text-lg">
                      <span>GROSS PROFIT</span>
                      <span className={profitLoss.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(profitLoss.grossProfit)}
                      </span>
                    </div>
                  </div>

                  {/* Expenses Section */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3 text-primary">EXPENSES</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Operating Expenses</span>
                        <span>{formatCurrency(profitLoss.expenses)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Profit */}
                  <div className={`border-2 rounded-lg p-4 ${profitLoss.netProfit >= 0 ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-red-500 bg-red-50 dark:bg-red-950'}`}>
                    <div className="flex justify-between font-bold text-xl">
                      <span>NET PROFIT</span>
                      <span className={profitLoss.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(profitLoss.netProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mt-2 text-muted-foreground">
                      <span>Profit Margin</span>
                      <span>{profitLoss.profitMargin.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No data available. Click Generate to load the report.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Balance Sheet */}
        <TabsContent value="balance-sheet" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Balance Sheet
                </CardTitle>
                <div className="flex items-center gap-4 print:hidden">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="bsAsOfDate">As of Date:</Label>
                    <Input
                      id="bsAsOfDate"
                      type="date"
                      value={asOfDate}
                      onChange={(e) => setAsOfDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button onClick={handleGenerateReport} disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Generate
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground print:text-black">
                As of: {format(new Date(asOfDate), "dd MMM yyyy")}
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : balanceSheet ? (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Assets */}
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-3 text-primary flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        ASSETS
                      </h3>
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-muted-foreground">Current Assets</div>
                        <div className="flex justify-between pl-4">
                          <span>Cash & Bank</span>
                          <span>{formatCurrency(balanceSheet.assets.cashBank)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>Accounts Receivable</span>
                          <span>{formatCurrency(balanceSheet.assets.accountsReceivable)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>Inventory</span>
                          <span>{formatCurrency(balanceSheet.assets.inventory)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t pt-2 text-lg">
                          <span>Total Assets</span>
                          <span className="text-primary">{formatCurrency(balanceSheet.assets.totalAssets)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Liabilities & Equity */}
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-3 text-destructive flex items-center gap-2">
                        <TrendingDown className="h-5 w-5" />
                        LIABILITIES
                      </h3>
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-muted-foreground">Current Liabilities</div>
                        <div className="flex justify-between pl-4">
                          <span>Accounts Payable</span>
                          <span>{formatCurrency(balanceSheet.liabilities.accountsPayable)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>GST Payable</span>
                          <span>{formatCurrency(balanceSheet.liabilities.gstPayable)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t pt-2">
                          <span>Total Liabilities</span>
                          <span>{formatCurrency(balanceSheet.liabilities.totalLiabilities)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-3 text-green-600 flex items-center gap-2">
                        <Wallet className="h-5 w-5" />
                        OWNER'S EQUITY
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between font-bold border-t pt-2">
                          <span>Closing Capital</span>
                          <span className="text-green-600">{formatCurrency(balanceSheet.equity.closingCapital)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total Liabilities + Equity</span>
                        <span className="text-primary">
                          {formatCurrency(balanceSheet.liabilities.totalLiabilities + balanceSheet.equity.closingCapital)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No data available. Click Generate to load the report.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Net Profit Summary */}
        <TabsContent value="net-profit" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Net Profit Summary
                </CardTitle>
                <div className="flex items-center gap-4 print:hidden">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="npFromDate">From:</Label>
                    <Input
                      id="npFromDate"
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="npToDate">To:</Label>
                    <Input
                      id="npToDate"
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button onClick={handleGenerateReport} disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Generate
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground print:text-black">
                Period: {format(new Date(fromDate), "dd MMM yyyy")} - {format(new Date(toDate), "dd MMM yyyy")}
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : netProfitSummary ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Revenue</p>
                          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                            {formatCurrency(netProfitSummary.totalRevenue)}
                          </p>
                        </div>
                        <TrendingUp className="h-10 w-10 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-orange-50 dark:bg-orange-950 border-orange-200">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Total Expenses</p>
                          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                            {formatCurrency(netProfitSummary.totalExpenses)}
                          </p>
                        </div>
                        <TrendingDown className="h-10 w-10 text-orange-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-purple-50 dark:bg-purple-950 border-purple-200">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Gross Profit</p>
                          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                            {formatCurrency(netProfitSummary.grossProfit)}
                          </p>
                        </div>
                        <Wallet className="h-10 w-10 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`border-2 ${netProfitSummary.netProfit >= 0 ? 'bg-green-50 dark:bg-green-950 border-green-500' : 'bg-red-50 dark:bg-red-950 border-red-500'}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-medium ${netProfitSummary.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            Net Profit
                          </p>
                          <p className={`text-2xl font-bold ${netProfitSummary.netProfit >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                            {formatCurrency(netProfitSummary.netProfit)}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Margin: {netProfitSummary.profitMarginPercent.toFixed(2)}%
                          </p>
                        </div>
                        <PieChart className={`h-10 w-10 ${netProfitSummary.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No data available. Click Generate to load the report.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
