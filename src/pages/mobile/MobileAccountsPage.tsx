import { MobileAccountsSummary } from "@/components/mobile/MobileAccountsSummary";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { ChevronRight, ArrowDownLeft, ArrowUpRight, BookOpen, Building2, Users, Receipt, ShieldCheck } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default function MobileAccountsPage() {
  const { orgNavigate } = useOrgNavigation();

  const quickLinks = [
    { icon: ArrowDownLeft, label: "Receive Payment", nav: "/accounts", color: "text-emerald-500", bg: "bg-emerald-50", desc: "Record customer receipt" },
    { icon: ArrowUpRight, label: "Make Payment", nav: "/accounts", color: "text-rose-500", bg: "bg-rose-50", desc: "Record supplier payment" },
    { icon: BookOpen, label: "Customer Ledger", nav: "/customer-ledger-report", color: "text-purple-500", bg: "bg-purple-50", desc: "Full transaction log" },
    { icon: ShieldCheck, label: "Customer Audit", nav: "/customer-audit-report", color: "text-violet-500", bg: "bg-violet-50", desc: "Verified outstanding balance" },
    { icon: Building2, label: "Supplier Ledger", nav: "/accounts", color: "text-orange-500", bg: "bg-orange-50", desc: "Payables & payments" },
    { icon: Users, label: "Customers", nav: "/customers", color: "text-blue-500", bg: "bg-blue-50", desc: "Customer master" },
    { icon: Receipt, label: "Payment History", nav: "/payments-dashboard", color: "text-teal-500", bg: "bg-teal-50", desc: "All voucher entries" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <h1 className="text-xl font-semibold text-foreground">Accounts</h1>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Summary Cards (receivables, payables, collection, net) */}
        <MobileAccountsSummary />

        {/* Quick Links */}
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">Quick Access</h2>
          <div className="bg-white dark:bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
            {quickLinks.map((link, i) => {
              const Icon = link.icon;
              return (
                <div key={link.label}>
                  <button
                    onClick={() => orgNavigate(link.nav)}
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
                  {i < quickLinks.length - 1 && <Separator className="ml-16" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
}
