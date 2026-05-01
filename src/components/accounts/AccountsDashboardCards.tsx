import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Wallet, Receipt, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface DashboardMetrics {
  totalReceivables: number;
  totalPayables: number;
  monthlyExpenses: number;
  currentMonthPL: number;
}

interface PaymentStats {
  totalInvoices: number;
  totalAmount: number;
  paidAmount: number;
  pendingCount: number;
  pendingAmount: number;
  partialCount: number;
  partialAmount: number;
  completedCount: number;
  completedAmount: number;
}

interface AccountsDashboardCardsProps {
  dashboardMetrics: DashboardMetrics;
  paymentStats: PaymentStats;
  paymentCardFilter: string | null;
  onCardClick: (filter: string | null) => void;
  failedJournalCount?: number;
}

export function AccountsDashboardCards({
  dashboardMetrics,
  paymentStats,
  paymentCardFilter,
  onCardClick,
  failedJournalCount = 0,
}: AccountsDashboardCardsProps) {
  return (
    <div className="space-y-4">
      {failedJournalCount > 0 && (
        <Card className="border-l-4 border-l-red-600 bg-red-50/80 dark:bg-red-950/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  {failedJournalCount} transactions failed to post to ledger
                </p>
                <p className="text-xs text-red-600/90 dark:text-red-300/90 mt-1">
                  Please review failed auto-journals in sales and purchase bills.
                </p>
              </div>
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-300" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Stats Cards - Clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Invoices */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:shadow-md border-l-4 border-l-blue-500 overflow-hidden",
            paymentCardFilter === null && "ring-2 ring-blue-400 shadow-md"
          )}
          onClick={() => onCardClick(null)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Invoices</p>
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums mt-1">
                  ₹{Math.round(paymentStats.totalAmount).toLocaleString('en-IN')}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{paymentStats.totalInvoices} invoices</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Paid */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:shadow-md border-l-4 border-l-emerald-500 overflow-hidden",
            paymentCardFilter === "completed" && "ring-2 ring-emerald-400 shadow-md"
          )}
          onClick={() => onCardClick("completed")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Paid</p>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-1">
                  ₹{Math.round(paymentStats.completedAmount).toLocaleString('en-IN')}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{paymentStats.completedCount} completed</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Partial */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:shadow-md border-l-4 border-l-amber-500 overflow-hidden",
            paymentCardFilter === "partial" && "ring-2 ring-amber-400 shadow-md"
          )}
          onClick={() => onCardClick("partial")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Partial</p>
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums mt-1">
                  ₹{Math.round(paymentStats.partialAmount).toLocaleString('en-IN')}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{paymentStats.partialCount} partial</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-amber-50 dark:bg-amber-950 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:shadow-md border-l-4 border-l-red-500 overflow-hidden",
            paymentCardFilter === "pending" && "ring-2 ring-red-400 shadow-md"
          )}
          onClick={() => onCardClick("pending")}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pending</p>
                <div className="text-2xl font-bold text-red-700 dark:text-red-300 tabular-nums mt-1">
                  ₹{Math.round(paymentStats.pendingAmount).toLocaleString('en-IN')}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{paymentStats.pendingCount} pending</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-red-50 dark:bg-red-950 flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dashboard Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Receivables */}
        <Card className="border-l-4 border-l-emerald-500 overflow-hidden shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Receivables</p>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-1">
                  ₹{Math.round(dashboardMetrics.totalReceivables).toLocaleString('en-IN')}
                </div>
                <p className="text-sm text-muted-foreground mt-1">Customer payments received</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Payables */}
        <Card className="border-l-4 border-l-red-500 overflow-hidden shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Payables</p>
                <div className="text-2xl font-bold text-red-700 dark:text-red-300 tabular-nums mt-1">
                  ₹{Math.round(dashboardMetrics.totalPayables).toLocaleString('en-IN')}
                </div>
                <p className="text-sm text-muted-foreground mt-1">Supplier & employee payments</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-red-50 dark:bg-red-950 flex items-center justify-center shrink-0">
                <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Expenses */}
        <Card className="border-l-4 border-l-orange-500 overflow-hidden shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Monthly Expenses</p>
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300 tabular-nums mt-1">
                  ₹{Math.round(dashboardMetrics.monthlyExpenses).toLocaleString('en-IN')}
                </div>
                <p className="text-sm text-muted-foreground mt-1">Current month expenses</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-orange-50 dark:bg-orange-950 flex items-center justify-center shrink-0">
                <DollarSign className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Month P/L */}
        <Card className={cn(
          "border-l-4 overflow-hidden shadow-sm",
          dashboardMetrics.currentMonthPL >= 0
            ? "border-l-green-500"
            : "border-l-purple-500"
        )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Current Month P/L</p>
                <div className={cn(
                  "text-2xl font-bold tabular-nums mt-1",
                  dashboardMetrics.currentMonthPL >= 0
                    ? "text-green-700 dark:text-green-300"
                    : "text-purple-700 dark:text-purple-300"
                )}>
                  ₹{Math.round(Math.abs(dashboardMetrics.currentMonthPL)).toLocaleString('en-IN')}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {dashboardMetrics.currentMonthPL >= 0 ? "🟢 Profit" : "🔴 Loss"} for {format(new Date(), "MMMM yyyy")}
                </p>
              </div>
              <div className={cn(
                "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                dashboardMetrics.currentMonthPL >= 0
                  ? "bg-green-50 dark:bg-green-950"
                  : "bg-purple-50 dark:bg-purple-950"
              )}>
                <Wallet className={cn(
                  "h-5 w-5",
                  dashboardMetrics.currentMonthPL >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-purple-600 dark:text-purple-400"
                )} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
