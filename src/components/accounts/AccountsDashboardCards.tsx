import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";

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
  onFailedJournalClick?: () => void;
}

function MetricCard({
  label,
  value,
  sub,
  gradient,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  gradient: string;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-lg transition-all border-0 shadow-md rounded-xl min-w-0",
        gradient,
        active && "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-100",
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-2 px-2.5">
        <CardDescription className="text-xs font-medium text-white/80 leading-tight">{label}</CardDescription>
        <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
      </CardHeader>
      <CardContent className="px-2.5 pb-2 pt-0">
        <div className="text-lg xl:text-xl font-black text-white tabular-nums leading-tight truncate">{value}</div>
        <p className="text-xs text-white/65 mt-0.5 truncate">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function AccountsDashboardCards({
  dashboardMetrics,
  paymentStats,
  paymentCardFilter,
  onCardClick,
  failedJournalCount = 0,
  onFailedJournalClick,
}: AccountsDashboardCardsProps) {
  const plPositive = dashboardMetrics.currentMonthPL >= 0;

  return (
    <div className="space-y-3 shrink-0">
      {failedJournalCount > 0 && (
        <Card
          className="border border-red-200 bg-red-50 dark:bg-red-950/30 cursor-pointer hover:shadow-md transition-all rounded-xl"
          onClick={onFailedJournalClick}
        >
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                {failedJournalCount} transactions failed to post to ledger
              </p>
              <p className="text-xs text-red-600/90 dark:text-red-300/90 mt-0.5">
                Review failed auto-journals in sales and purchase bills.
              </p>
            </div>
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2 w-full">
        <MetricCard
          label="Total Invoices"
          value={`₹${Math.round(paymentStats.totalAmount).toLocaleString("en-IN")}`}
          sub={`${paymentStats.totalInvoices} invoices`}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          icon={Receipt}
          active={paymentCardFilter === null}
          onClick={() => onCardClick(null)}
        />
        <MetricCard
          label="Paid"
          value={`₹${Math.round(paymentStats.completedAmount).toLocaleString("en-IN")}`}
          sub={`${paymentStats.completedCount} completed`}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          icon={CheckCircle2}
          active={paymentCardFilter === "completed"}
          onClick={() => onCardClick("completed")}
        />
        <MetricCard
          label="Partial"
          value={`₹${Math.round(paymentStats.partialAmount).toLocaleString("en-IN")}`}
          sub={`${paymentStats.partialCount} partial`}
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
          icon={Clock}
          active={paymentCardFilter === "partial"}
          onClick={() => onCardClick("partial")}
        />
        <MetricCard
          label="Pending"
          value={`₹${Math.round(paymentStats.pendingAmount).toLocaleString("en-IN")}`}
          sub={`${paymentStats.pendingCount} pending`}
          gradient="bg-gradient-to-br from-red-500 to-red-600"
          icon={AlertCircle}
          active={paymentCardFilter === "pending"}
          onClick={() => onCardClick("pending")}
        />
        <MetricCard
          label="Receivables"
          value={`₹${Math.round(dashboardMetrics.totalReceivables).toLocaleString("en-IN")}`}
          sub="Customer payments"
          gradient="bg-gradient-to-br from-teal-500 to-teal-600"
          icon={TrendingUp}
          onClick={() => onCardClick(null)}
        />
        <MetricCard
          label="Payables"
          value={`₹${Math.round(dashboardMetrics.totalPayables).toLocaleString("en-IN")}`}
          sub="Supplier & salary"
          gradient="bg-gradient-to-br from-rose-500 to-rose-600"
          icon={TrendingDown}
          onClick={() => onCardClick(null)}
        />
        <MetricCard
          label="Expenses"
          value={`₹${Math.round(dashboardMetrics.monthlyExpenses).toLocaleString("en-IN")}`}
          sub="This month"
          gradient="bg-gradient-to-br from-orange-500 to-orange-600"
          icon={DollarSign}
          onClick={() => onCardClick(null)}
        />
        <MetricCard
          label="Month P/L"
          value={`₹${Math.round(Math.abs(dashboardMetrics.currentMonthPL)).toLocaleString("en-IN")}`}
          sub={`${plPositive ? "Profit" : "Loss"} · ${format(new Date(), "MMM yyyy")}`}
          gradient={cn(
            plPositive
              ? "bg-gradient-to-br from-green-500 to-green-600"
              : "bg-gradient-to-br from-violet-500 to-violet-600",
          )}
          icon={Wallet}
          onClick={() => onCardClick(null)}
        />
      </div>
    </div>
  );
}
