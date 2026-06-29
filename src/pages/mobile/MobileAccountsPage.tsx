import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/mobile/PullToRefreshIndicator";
import { invalidateMobileAccountsHubQueries } from "@/lib/mobileHubRefresh";
import { MobileAccountsSummary } from "@/components/mobile/MobileAccountsSummary";
import { CustomerStatementFloatingDialog } from "@/components/CustomerStatementFloatingDialog";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { ChevronRight, BookOpen, Building2, ShieldCheck, FileText, Receipt, BarChart3 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { DesktopViewToggle } from "@/components/mobile/DesktopViewToggle";
import { MOBILE_REPORTS_PATH } from "@/lib/mobileShell";

export default function MobileAccountsPage() {
  const { orgNavigate } = useOrgNavigation();
  const queryClient = useQueryClient();
  const [statementOpen, setStatementOpen] = useState(false);
  const { scrollRef, isRefreshing, pullHandlers } = usePullToRefresh(
    useCallback(() => invalidateMobileAccountsHubQueries(queryClient), [queryClient]),
  );

  const reportLinks = [
    { icon: BookOpen, label: "Customer Ledger", nav: "/customer-ledger-report", color: "text-purple-500", bg: "bg-purple-50", desc: "Full customer transaction log" },
    { icon: FileText, label: "Account Statement", action: "statement" as const, color: "text-indigo-500", bg: "bg-indigo-50", desc: "Quick customer balance lookup" },
    { icon: ShieldCheck, label: "Customer Audit", nav: "/customer-audit-report", color: "text-violet-500", bg: "bg-violet-50", desc: "Verified outstanding balance" },
    { icon: Building2, label: "Supplier Ledger", nav: "/accounts", color: "text-orange-500", bg: "bg-orange-50", desc: "Payables & payment history" },
    { icon: Receipt, label: "Payment History", nav: "/payments-dashboard", color: "text-teal-500", bg: "bg-teal-50", desc: "All receipt & payment vouchers" },
    { icon: BarChart3, label: "All Reports", nav: MOBILE_REPORTS_PATH, color: "text-emerald-500", bg: "bg-emerald-50", desc: "Sales, purchase, GST & more" },
  ];

  return (
    <div
      ref={scrollRef}
      className="min-h-screen bg-slate-50 dark:bg-background pb-24"
      {...pullHandlers}
    >
      <PullToRefreshIndicator visible={isRefreshing} />
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <h1 className="text-xl font-semibold text-foreground">Accounts Summary</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Receivables, payables & collection overview</p>
      </div>

      <div className="px-4 py-4 space-y-5">
        <div className="bg-white dark:bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
          <DesktopViewToggle variant="menu-row" />
        </div>

        <MobileAccountsSummary />

        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">Reports & Ledgers</h2>
          <div className="bg-white dark:bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
            {reportLinks.map((link, i) => {
              const Icon = link.icon;
              return (
                <div key={link.label}>
                  <button
                    onClick={() => {
                      if ("action" in link && link.action === "statement") {
                        setStatementOpen(true);
                      } else {
                        orgNavigate((link as { nav: string }).nav);
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3.5 active:bg-muted/40 transition-colors touch-manipulation"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", link.bg)}>
                        <Icon className={cn("h-4 w-4", link.color)} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground">{link.label}</p>
                        <p className="text-[11px] text-muted-foreground">{link.desc}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {i < reportLinks.length - 1 && <Separator className="ml-16" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <CustomerStatementFloatingDialog open={statementOpen} onOpenChange={setStatementOpen} />
    </div>
  );
}
