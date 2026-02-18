import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

export function AccountsDashboardCards({
  dashboardMetrics,
  paymentStats,
  paymentCardFilter,
  onCardClick,
}: AccountsDashboardCardsProps) {
  return (
    <>
      {/* Payment Stats Cards - Clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className={cn(
            "cursor-pointer transition-all hover:shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg",
            paymentCardFilter === null && "ring-2 ring-white"
          )}
          onClick={() => onCardClick(null)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Total Invoices</CardTitle>
            <Receipt className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ₹{Math.round(paymentStats.totalAmount).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-white/70 mt-1">{paymentStats.totalInvoices} invoices</p>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all hover:shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg",
            paymentCardFilter === "completed" && "ring-2 ring-white"
          )}
          onClick={() => onCardClick("completed")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Paid</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ₹{Math.round(paymentStats.completedAmount).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-white/70 mt-1">{paymentStats.completedCount} completed</p>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all hover:shadow-lg bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg",
            paymentCardFilter === "partial" && "ring-2 ring-white"
          )}
          onClick={() => onCardClick("partial")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Partial</CardTitle>
            <Clock className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ₹{Math.round(paymentStats.partialAmount).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-white/70 mt-1">{paymentStats.partialCount} partial</p>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all hover:shadow-lg bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg",
            paymentCardFilter === "pending" && "ring-2 ring-white"
          )}
          onClick={() => onCardClick("pending")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Pending</CardTitle>
            <AlertCircle className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ₹{Math.round(paymentStats.pendingAmount).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-white/70 mt-1">{paymentStats.pendingCount} pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Dashboard Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Total Receivables</CardTitle>
            <TrendingUp className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ₹{Math.round(dashboardMetrics.totalReceivables).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-white/70 mt-1">Customer payments received</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Total Payables</CardTitle>
            <TrendingDown className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ₹{Math.round(dashboardMetrics.totalPayables).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-white/70 mt-1">Supplier & employee payments</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Monthly Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ₹{Math.round(dashboardMetrics.monthlyExpenses).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-white/70 mt-1">Current month expenses</p>
          </CardContent>
        </Card>

        <Card className={cn(
          "border-0 shadow-lg",
          dashboardMetrics.currentMonthPL >= 0
            ? "bg-gradient-to-br from-green-500 to-green-600"
            : "bg-gradient-to-br from-purple-500 to-purple-600"
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">Current Month P/L</CardTitle>
            <Wallet className="h-4 w-4 text-white" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ₹{Math.round(dashboardMetrics.currentMonthPL).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-white/70 mt-1">
              {dashboardMetrics.currentMonthPL >= 0 ? "Profit" : "Loss"} for {format(new Date(), "MMMM yyyy")}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
