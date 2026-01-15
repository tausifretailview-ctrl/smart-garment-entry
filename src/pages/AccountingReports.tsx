import { useState, useEffect } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { 
  Loader2, Download, Printer, TrendingUp, TrendingDown, Wallet, PieChart, 
  FileSpreadsheet, Scale, Calculator, AlertTriangle, Calendar, Building2, Clock
} from "lucide-react";
import { format, startOfYear } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  calculateTrialBalance,
  calculateProfitLoss,
  calculateBalanceSheet,
  calculateNetProfitSummary,
  getIndiaFinancialYear,
  getCurrentQuarter,
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

// Report Header Component
const ReportHeader = ({ 
  title, 
  subtitle, 
  organization, 
  generatedAt 
}: { 
  title: string; 
  subtitle: string; 
  organization?: { name: string }; 
  generatedAt?: string;
}) => (
  <div className="text-center mb-6 print:mb-4 border-b pb-4">
    <div className="flex items-center justify-center gap-2 mb-2">
      <Building2 className="h-8 w-8 text-primary print:text-black" />
    </div>
    <h1 className="text-2xl font-bold print:text-xl">{organization?.name || "Organization"}</h1>
    <h2 className="text-xl font-semibold text-primary print:text-black mt-1">{title}</h2>
    <p className="text-muted-foreground print:text-gray-600">{subtitle}</p>
    {generatedAt && (
      <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
        <Clock className="h-3 w-3" />
        Generated: {generatedAt}
      </p>
    )}
  </div>
);

// Financial Year Presets Component
const FYPresets = ({ 
  onSelect, 
  currentSelection 
}: { 
  onSelect: (from: string, to: string) => void; 
  currentSelection?: string;
}) => {
  const currentFY = getIndiaFinancialYear(0);
  const previousFY = getIndiaFinancialYear(-1);
  const currentQ = getCurrentQuarter();
  
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button
        variant={currentSelection === "currentFY" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(currentFY.fromDate, currentFY.toDate)}
      >
        <Calendar className="h-3 w-3 mr-1" />
        {currentFY.label}
      </Button>
      <Button
        variant={currentSelection === "previousFY" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(previousFY.fromDate, previousFY.toDate)}
      >
        {previousFY.label}
      </Button>
      <Button
        variant={currentSelection === "currentQ" ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(currentQ.fromDate, currentQ.toDate)}
      >
        {currentQ.label}
      </Button>
    </div>
  );
};

export default function AccountingReports() {
  const { currentOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState("trial-balance");
  const [loading, setLoading] = useState(false);

  // Date filters - default to India FY
  const currentFY = getIndiaFinancialYear(0);
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [fromDate, setFromDate] = useState(currentFY.fromDate);
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

  const handleFYSelect = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
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
        { Particulars: "Gross Sales (Excl. GST)", Amount: profitLoss.grossSales },
        { Particulars: "Less: Sales Returns", Amount: -profitLoss.salesReturns },
        { Particulars: "NET SALES", Amount: profitLoss.netSales },
        { Particulars: "", Amount: "" },
        { Particulars: "COST OF GOODS SOLD", Amount: "" },
        { Particulars: "Opening Stock", Amount: profitLoss.openingStock },
        { Particulars: "Add: Purchases (Excl. GST)", Amount: profitLoss.purchases },
        { Particulars: "Less: Purchase Returns", Amount: -profitLoss.purchaseReturns },
        { Particulars: "Less: Closing Stock", Amount: -profitLoss.closingStock },
        { Particulars: "TOTAL COGS", Amount: profitLoss.cogs },
        { Particulars: "", Amount: "" },
        { Particulars: profitLoss.isGrossLoss ? "GROSS LOSS" : "GROSS PROFIT", Amount: Math.abs(profitLoss.grossProfit) },
        { Particulars: "", Amount: "" },
        { Particulars: "OPERATING EXPENSES", Amount: "" },
        ...profitLoss.expensesByCategory.map(e => ({ Particulars: `  ${e.category}`, Amount: e.amount })),
        { Particulars: "TOTAL EXPENSES", Amount: profitLoss.totalExpenses },
        { Particulars: "", Amount: "" },
        { Particulars: profitLoss.isNetLoss ? "NET LOSS" : "NET PROFIT", Amount: Math.abs(profitLoss.netProfit) },
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
            GST-Compliant Financial Statements for Indian SMEs
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
                <CardTitle className="flex items-center gap-2 print:hidden">
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
              <div className="hidden print:block">
                <ReportHeader 
                  title="Trial Balance" 
                  subtitle={`As of: ${format(new Date(asOfDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={format(new Date(), "dd MMM yyyy, hh:mm a")}
                />
              </div>
              <p className="text-sm text-muted-foreground print:hidden">
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

        {/* Profit & Loss - Enhanced GST-Compliant */}
        <TabsContent value="profit-loss" className="space-y-4">
          <Card className="print:shadow-none print:border-0">
            <CardHeader className="print:pb-2">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2 print:hidden">
                    <TrendingUp className="h-5 w-5" />
                    Profit & Loss Statement
                    <Badge variant="outline" className="ml-2">GST Compliant</Badge>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-4 print:hidden">
                    <FYPresets onSelect={handleFYSelect} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 print:hidden">
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
              
              {/* Print Header */}
              <div className="hidden print:block">
                <ReportHeader 
                  title="Profit & Loss Statement" 
                  subtitle={profitLoss?.periodLabel || `${format(new Date(fromDate), "dd MMM yyyy")} - ${format(new Date(toDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={profitLoss?.generatedAt}
                />
              </div>
              
              <p className="text-sm text-muted-foreground print:hidden">
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
                  {/* Warnings */}
                  {profitLoss.warnings.length > 0 && (
                    <div className="space-y-2 print:hidden">
                      {profitLoss.warnings.map((warning, idx) => (
                        <Alert key={idx} variant="destructive" className="bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-amber-800 dark:text-amber-200">
                            {warning}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  )}

                  {/* GST Notice */}
                  <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800 print:hidden">
                    <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                      ℹ️ All amounts are GST-exclusive. GST data is reported separately in GST Reports.
                    </AlertDescription>
                  </Alert>

                  {/* Revenue Section */}
                  <div className="border rounded-lg p-4 print:border-black">
                    <h3 className="font-semibold text-lg mb-3 text-primary print:text-black flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      REVENUE
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Gross Sales (Excl. GST)</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.grossSales)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground print:text-gray-600">
                        <span>Less: Sales Returns</span>
                        <span className="text-right font-mono text-destructive">({formatCurrency(profitLoss.salesReturns)})</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-semibold text-lg">
                        <span>NET SALES</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.netSales)}</span>
                      </div>
                    </div>
                  </div>

                  {/* COGS Section */}
                  <div className="border rounded-lg p-4 print:border-black">
                    <h3 className="font-semibold text-lg mb-3 text-primary print:text-black flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5" />
                      COST OF GOODS SOLD
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Opening Stock</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.openingStock)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Add: Purchases (Excl. GST)</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.purchases)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground print:text-gray-600">
                        <span>Less: Purchase Returns</span>
                        <span className="text-right font-mono text-destructive">({formatCurrency(profitLoss.purchaseReturns)})</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground print:text-gray-600">
                        <span>Less: Closing Stock</span>
                        <span className="text-right font-mono text-destructive">({formatCurrency(profitLoss.closingStock)})</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-semibold text-lg">
                        <span>TOTAL COGS</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.cogs)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Gross Profit */}
                  <div className={`border-2 rounded-lg p-4 ${
                    profitLoss.isGrossLoss 
                      ? 'border-destructive bg-destructive/10 dark:bg-destructive/20' 
                      : 'border-green-500 bg-green-50 dark:bg-green-950'
                  }`}>
                    <div className="flex justify-between font-bold text-xl">
                      <span className="flex items-center gap-2">
                        {profitLoss.isGrossLoss ? (
                          <TrendingDown className="h-6 w-6 text-destructive" />
                        ) : (
                          <TrendingUp className="h-6 w-6 text-green-600" />
                        )}
                        {profitLoss.isGrossLoss ? 'GROSS LOSS' : 'GROSS PROFIT'}
                      </span>
                      <span className={`font-mono ${profitLoss.isGrossLoss ? 'text-destructive' : 'text-green-600'}`}>
                        {profitLoss.isGrossLoss && '-'}{formatCurrency(Math.abs(profitLoss.grossProfit))}
                      </span>
                    </div>
                  </div>

                  {/* Expenses Section */}
                  <div className="border rounded-lg p-4 print:border-black">
                    <h3 className="font-semibold text-lg mb-3 text-primary print:text-black flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      OPERATING EXPENSES
                    </h3>
                    <div className="space-y-2">
                      {profitLoss.expensesByCategory.length > 0 ? (
                        profitLoss.expensesByCategory.map((expense, idx) => (
                          <div key={idx} className="flex justify-between pl-4">
                            <span>{expense.category}</span>
                            <span className="text-right font-mono">{formatCurrency(expense.amount)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex justify-between text-muted-foreground pl-4">
                          <span>No expenses recorded</span>
                          <span className="text-right font-mono">{formatCurrency(0)}</span>
                        </div>
                      )}
                      <Separator className="my-2" />
                      <div className="flex justify-between font-semibold text-lg">
                        <span>TOTAL EXPENSES</span>
                        <span className="text-right font-mono">{formatCurrency(profitLoss.totalExpenses)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Profit */}
                  <div className={`border-4 rounded-lg p-6 ${
                    profitLoss.isNetLoss 
                      ? 'border-destructive bg-destructive/10 dark:bg-destructive/20' 
                      : 'border-green-500 bg-green-50 dark:bg-green-950'
                  }`}>
                    <div className="flex justify-between font-bold text-2xl">
                      <span className="flex items-center gap-3">
                        {profitLoss.isNetLoss ? (
                          <TrendingDown className="h-8 w-8 text-destructive" />
                        ) : (
                          <TrendingUp className="h-8 w-8 text-green-600" />
                        )}
                        {profitLoss.isNetLoss ? 'NET LOSS' : 'NET PROFIT'}
                      </span>
                      <span className={`font-mono ${profitLoss.isNetLoss ? 'text-destructive' : 'text-green-600'}`}>
                        {profitLoss.isNetLoss && '-'}{formatCurrency(Math.abs(profitLoss.netProfit))}
                      </span>
                    </div>
                    <Separator className="my-3" />
                    <div className="flex justify-between text-lg">
                      <span className="text-muted-foreground">Profit Margin</span>
                      <span className={`font-mono font-semibold ${
                        profitLoss.profitMargin < 0 ? 'text-destructive' : 'text-green-600'
                      }`}>
                        {profitLoss.profitMargin.toFixed(2)}%
                      </span>
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
                <CardTitle className="flex items-center gap-2 print:hidden">
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
              <div className="hidden print:block">
                <ReportHeader 
                  title="Balance Sheet" 
                  subtitle={`As of: ${format(new Date(asOfDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={format(new Date(), "dd MMM yyyy, hh:mm a")}
                />
              </div>
              <p className="text-sm text-muted-foreground print:hidden">
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
                          <span className="font-mono">{formatCurrency(balanceSheet.assets.cashBank)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>Accounts Receivable</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.assets.accountsReceivable)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>Inventory</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.assets.inventory)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t pt-2 text-lg">
                          <span>Total Assets</span>
                          <span className="text-primary font-mono">{formatCurrency(balanceSheet.assets.totalAssets)}</span>
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
                          <span className="font-mono">{formatCurrency(balanceSheet.liabilities.accountsPayable)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>GST Payable</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.liabilities.gstPayable)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t pt-2">
                          <span>Total Liabilities</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.liabilities.totalLiabilities)}</span>
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
                          <span className="text-green-600 font-mono">{formatCurrency(balanceSheet.equity.closingCapital)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-2 border-primary rounded-lg p-4 bg-primary/5">
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total Liabilities + Equity</span>
                        <span className="text-primary font-mono">
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
              <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2 print:hidden">
                    <PieChart className="h-5 w-5" />
                    Net Profit Summary
                  </CardTitle>
                  <FYPresets onSelect={handleFYSelect} />
                </div>
                <div className="flex flex-wrap items-center gap-4 print:hidden">
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
              <div className="hidden print:block">
                <ReportHeader 
                  title="Net Profit Summary" 
                  subtitle={`Period: ${format(new Date(fromDate), "dd MMM yyyy")} - ${format(new Date(toDate), "dd MMM yyyy")}`}
                  organization={currentOrganization || undefined}
                  generatedAt={format(new Date(), "dd MMM yyyy, hh:mm a")}
                />
              </div>
              <p className="text-sm text-muted-foreground print:hidden">
                Period: {format(new Date(fromDate), "dd MMM yyyy")} - {format(new Date(toDate), "dd MMM yyyy")}
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : netProfitSummary ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Revenue</p>
                          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 font-mono">
                            {formatCurrency(netProfitSummary.totalRevenue)}
                          </p>
                        </div>
                        <TrendingUp className="h-10 w-10 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">Cost of Goods</p>
                          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 font-mono">
                            {formatCurrency(netProfitSummary.cogs)}
                          </p>
                        </div>
                        <FileSpreadsheet className="h-10 w-10 text-amber-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-orange-50 dark:bg-orange-950 border-orange-200">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Total Expenses</p>
                          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300 font-mono">
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
                          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300 font-mono">
                            {formatCurrency(netProfitSummary.grossProfit)}
                          </p>
                        </div>
                        <Wallet className="h-10 w-10 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={`border-2 ${netProfitSummary.isNetLoss ? 'bg-red-50 dark:bg-red-950 border-red-500' : 'bg-green-50 dark:bg-green-950 border-green-500'}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-medium ${netProfitSummary.isNetLoss ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {netProfitSummary.isNetLoss ? 'Net Loss' : 'Net Profit'}
                          </p>
                          <p className={`text-2xl font-bold font-mono ${netProfitSummary.isNetLoss ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                            {netProfitSummary.isNetLoss && '-'}{formatCurrency(Math.abs(netProfitSummary.netProfit))}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Margin: {netProfitSummary.profitMarginPercent.toFixed(2)}%
                          </p>
                        </div>
                        <PieChart className={`h-10 w-10 ${netProfitSummary.isNetLoss ? 'text-red-500' : 'text-green-500'}`} />
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
