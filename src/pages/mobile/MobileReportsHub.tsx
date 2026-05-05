import { useState } from "react";
import { 
  Package, 
  Grid3X3, 
  Layers, 
  TrendingDown,
  BarChart3, 
  Calendar,
  ShoppingBag,
  Users,
  FileText,
  Building2,
  Receipt,
  TrendingUp,
  ShieldCheck
} from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Card, CardContent } from "@/components/ui/card";
import { MobileReportCard } from "@/components/mobile/MobileReportCard";
import { MobileDateFilterChips } from "@/components/mobile/MobileDateFilterChips";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";

interface ReportItem {
  icon: React.ElementType;
  label: string;
  path: string;
  desc: string;
}

interface ReportCategory {
  title: string;
  color: string;
  reports: ReportItem[];
}

export default function MobileReportsHub() {
  const { orgNavigate } = useOrgNavigation();
  const [selectedPeriod, setSelectedPeriod] = useState<string>("today");

  // Build path with date filter params
  const getFilteredPath = (basePath: string) => {
    const separator = basePath.includes("?") ? "&" : "?";
    return `${basePath}${separator}period=${selectedPeriod}`;
  };

  const reportCategories: ReportCategory[] = [
    {
      title: "Stock Reports",
      color: "text-amber-500",
      reports: [
        { icon: Package, label: "Stock Report", path: "/stock-report", desc: "Current inventory levels" },
        { icon: Grid3X3, label: "Size-wise Stock", path: "/stock-report?tab=sizewise", desc: "Stock by product + size" },
        { icon: Layers, label: "Item-wise Stock", path: "/item-wise-stock", desc: "Aggregated by product" },
        { icon: TrendingDown, label: "Stock Analysis", path: "/stock-analysis", desc: "Low stock & movement" },
      ]
    },
    {
      title: "Sales Reports",
      color: "text-green-500",
      reports: [
        { icon: BarChart3, label: "Sales Report", path: "/sales-invoice-dashboard", desc: "All sales invoices" },
        { icon: Calendar, label: "Daily Cashier", path: "/daily-cashier-report", desc: "Cash summary for day" },
        { icon: ShoppingBag, label: "Item-wise Sales", path: "/item-wise-sales", desc: "Sales by product" },
        { icon: Users, label: "Customer Sales", path: "/sales-report-by-customer", desc: "Sales by customer" },
        { icon: TrendingUp, label: "Hourly Analysis", path: "/hourly-sales-analysis", desc: "Peak hours & trends" },
      ]
    },
    {
      title: "Purchase Reports",
      color: "text-blue-500",
      reports: [
        { icon: FileText, label: "Purchase Report", path: "/purchase-bills", desc: "All purchase bills" },
        { icon: Building2, label: "Supplier Report", path: "/purchase-report-by-supplier", desc: "Purchases by supplier" },
      ]
    },
    {
      title: "Financial Reports",
      color: "text-purple-500",
      reports: [
        { icon: TrendingUp, label: "Profit Analysis", path: "/net-profit-analysis", desc: "Gross/Net profit" },
        { icon: ShieldCheck, label: "Customer Audit", path: "/customer-audit-report", desc: "Verified customer outstanding" },
        { icon: Receipt, label: "GST Report", path: "/gst-reports", desc: "GST summaries" },
      ]
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <h1 className="text-xl font-semibold text-foreground">Reports</h1>
      </div>

      {/* Date Filter Chips */}
      <div className="px-4 py-3">
        <MobileDateFilterChips 
          selectedPeriod={selectedPeriod} 
          onPeriodChange={setSelectedPeriod} 
        />
      </div>

      {/* Report Categories */}
      <div className="px-4 space-y-6 pb-4">
        {reportCategories.map((category) => (
          <div key={category.title}>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
              {category.title}
            </h2>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {category.reports.map((report, index) => (
                  <MobileReportCard
                    key={report.path}
                    icon={report.icon}
                    label={report.label}
                    desc={report.desc}
                    categoryColor={category.color}
                    onClick={() => orgNavigate(getFilteredPath(report.path))}
                    showDivider={index < category.reports.length - 1}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Bottom Nav */}
      <MobileBottomNav />
    </div>
  );
}
