import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useFieldSalesAccess } from "@/hooks/useFieldSalesAccess";
import { useUserPermissions } from "@/hooks/useUserPermissions";

import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { useTierBasedRefresh } from "@/hooks/useTierBasedRefresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { DashboardSkeleton, MetricCardSkeleton } from "@/components/ui/skeletons";
import { OwnerDashboard } from "@/components/mobile/OwnerDashboard";
import { MobileErrorBoundary } from "@/components/mobile/MobileErrorBoundary";
import {
  Package,
  ShoppingCart,
  FileText,
  TrendingUp,
  Users,
  Store,
  DollarSign,
  Calendar,
  RotateCcw,
  AlertCircle,
  Smartphone,
  MapPin,
  ClipboardList,
  IndianRupee,
  Loader2,
  RefreshCw,
  TrendingDown,
  Minus,
  Megaphone,
  Plus,
  BarChart3,
  Calculator,
  Layers,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/contexts/OrganizationContext";
import { StatsChartsSection } from "@/components/dashboard/StatsChartsSection";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear } from "date-fns";
import { cn } from "@/lib/utils";
import { SizeStockDialog } from "@/components/SizeStockDialog";

// Currency formatter helper
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

// Odoo-style Dashboard Metric Card — clean, professional, left-accent
const AnimatedMetricCard = ({
  title,
  value,
  icon: Icon,
  accentColor,
  onClick,
  tooltip,
  isCurrency = false,
}: {
  title: string;
  value: number;
  icon: any;
  accentColor: string;
  onClick?: () => void;
  tooltip?: string;
  isCurrency?: boolean;
}) => {
  const displayValue = isCurrency ? formatCurrency(value) : value.toLocaleString("en-IN");

  // Map accent colors to semantic left-border classes
  const getAccentBorder = (color: string) => {
    const colorMap: Record<string, string> = {
      'bg-blue-500': 'border-l-primary',
      'bg-blue-600': 'border-l-primary',
      'bg-green-500': 'border-l-success',
      'bg-green-600': 'border-l-success',
      'bg-emerald-500': 'border-l-success',
      'bg-orange-500': 'border-l-warning',
      'bg-amber-500': 'border-l-warning',
      'bg-red-500': 'border-l-destructive',
      'bg-pink-500': 'border-l-accent',
      'bg-purple-500': 'border-l-accent',
      'bg-violet-500': 'border-l-accent',
      'bg-indigo-500': 'border-l-primary',
      'bg-cyan-500': 'border-l-primary',
      'bg-teal-500': 'border-l-success',
      'bg-slate-500': 'border-l-muted-foreground',
    };
    return colorMap[color] || 'border-l-primary';
  };

  const accentBorder = getAccentBorder(accentColor);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group" onClick={onClick}>
          <Card
            className={cn(
              "bg-card relative overflow-hidden border border-border cursor-pointer",
              "shadow-sm hover:shadow-md transition-shadow duration-150",
              "border-l-[3px]",
              accentBorder
            )}
          >
            <CardContent className="p-4 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">
                  {title}
                </p>
                <p className="text-xl font-semibold text-foreground tabular-nums font-mono mt-1 truncate">
                  {displayValue}
                </p>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  {isCurrency ? "Amount" : "Count"}
                </span>
              </div>
              <Icon className="h-4 w-4 text-muted-foreground/60 flex-shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
            </CardContent>
          </Card>
        </div>
      </TooltipTrigger>
      {tooltip && (
        <TooltipContent side="bottom" className="bg-popover text-popover-foreground border-border max-w-[200px]">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
};

type DateRangeType = "monthly" | "quarterly" | "yearly" | "all";

const getDateRange = (type: DateRangeType) => {
  const now = new Date();
  switch (type) {
    case "monthly":
      return {
        start: format(startOfMonth(now), "yyyy-MM-dd"),
        end: format(endOfMonth(now), "yyyy-MM-dd"),
        label: format(now, "MMMM yyyy"),
      };
    case "quarterly":
      return {
        start: format(startOfQuarter(now), "yyyy-MM-dd"),
        end: format(endOfQuarter(now), "yyyy-MM-dd"),
        label: `Q${Math.ceil((now.getMonth() + 1) / 3)} ${format(now, "yyyy")}`,
      };
    case "yearly":
      return {
        start: format(startOfYear(now), "yyyy-MM-dd"),
        end: format(endOfYear(now), "yyyy-MM-dd"),
        label: format(now, "yyyy"),
      };
    case "all":
      return {
        start: "2000-01-01",
        end: format(endOfYear(now), "yyyy-MM-dd"),
        label: "All Time",
      };
  }
};

// Note: Refresh intervals are now tier-based via useTierBasedRefresh hook
// Free: Manual only | Basic: 5min | Professional: 2min | Enterprise: 1min

// Mobile-specific dashboard wrapper - separate component to avoid hook order issues
const MobileDashboardWrapper = () => {
  return (
    <MobileErrorBoundary>
      <OwnerDashboard />
    </MobileErrorBoundary>
  );
};

// Desktop dashboard with all hooks
const DesktopDashboard = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { hasAccess: hasFieldSalesAccess, employeeName } = useFieldSalesAccess();
  const { isAdmin, hasSpecialPermission } = useUserPermissions();
  const [dateRange, setDateRange] = useState<DateRangeType>("monthly");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [hasLoaded, setHasLoaded] = useState(false);
  const queryClient = useQueryClient();
  const [showSizeStock, setShowSizeStock] = useState(false);
  
  // Tier-based polling - reduces cloud usage based on subscription tier
  // Free: Manual only | Basic: 5min | Professional: 2min | Enterprise: 1min
  const { getRefreshInterval, isManualRefreshOnly } = useTierBasedRefresh();

  // Context menu for desktop right-click
  const isDesktop = useIsDesktop();
  const pageContextMenu = useContextMenu<void>();

  // Dashboard context menu items
  const getDashboardContextMenuItems = (): ContextMenuItem[] => [
    {
      label: "POS Billing",
      icon: ShoppingCart,
      shortcut: "Ctrl+N",
      onClick: () => navigate("/pos-sales"),
    },
    {
      label: "Stock Report",
      icon: Package,
      shortcut: "Ctrl+G",
      onClick: () => navigate("/stock-report"),
    },
    {
      label: "Daily Cash Report",
      icon: Calculator,
      shortcut: "Ctrl+T",
      onClick: () => navigate("/daily-cashier-report"),
    },
    {
      label: "Size-wise Stock",
      icon: Layers,
      onClick: () => setShowSizeStock(true),
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Today Sales",
      icon: TrendingUp,
      onClick: () => navigate("/sales-invoice-dashboard"),
    },
    {
      label: "Refresh Dashboard",
      icon: RefreshCw,
      shortcut: "F5",
      onClick: () => handleRefreshAll(),
    },
  ];

  // Handle page right-click (empty area)
  const handlePageContextMenu = (e: React.MouseEvent) => {
    if (!isDesktop) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) return;
    pageContextMenu.openMenu(e, undefined);
  };
  
  const canViewGrossProfit = isAdmin || hasSpecialPermission("view_gross_profit");
  
  const { start: startDate, end: endDate, label: dateLabel } = getDateRange(dateRange);

  // Manual refresh all - single RPC query key
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    if (!hasLoaded) {
      setHasLoaded(true);
      setTimeout(() => setIsRefreshing(false), 1000);
    } else {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["sales-trend"] });
      await queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
      await queryClient.invalidateQueries({ queryKey: ["top-products"] });
      setTimeout(() => setIsRefreshing(false), 500);
    }
    setLastUpdated(new Date());
  };

  // Single RPC call replaces 8-10 separate queries
  const { data: dashStats, isFetching: isLoading } = useQuery({
    queryKey: ["dashboard-stats", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return null;
      
      const { data, error } = await supabase.rpc('get_erp_dashboard_stats', {
        p_org_id: currentOrganization.id,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      setLastUpdated(new Date());
      setHasLoaded(true);
      return data as {
        total_sales: number;
        invoice_count: number;
        sold_qty: number;
        total_purchase: number;
        purchase_count: number;
        purchase_qty: number;
        customer_count: number;
        supplier_count: number;
        product_count: number;
        total_stock_qty: number;
        total_stock_value: number;
        total_receivables: number;
        pending_count: number;
        gross_profit: number;
        cash_collection: number;
        sale_return_total: number;
        sale_return_count: number;
        sale_return_qty: number;
        purchase_return_total: number;
        purchase_return_count: number;
        purchase_return_qty: number;
      };
    },
    enabled: !!currentOrganization && hasLoaded,
    staleTime: 10 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  // Extract metrics from single RPC result
  const salesData = { total: dashStats?.total_sales || 0, count: dashStats?.invoice_count || 0, soldQty: dashStats?.sold_qty || 0 };
  const purchaseData = { total: dashStats?.total_purchase || 0, count: dashStats?.purchase_count || 0, purchaseQty: dashStats?.purchase_qty || 0 };
  const customersCount = dashStats?.customer_count || 0;
  const productsCount = dashStats?.product_count || 0;
  const suppliersCount = dashStats?.supplier_count || 0;
  const stockData = dashStats?.total_stock_qty || 0;
  const stockValue = dashStats?.total_stock_value || 0;
  const profitData = dashStats?.gross_profit || 0;
  const cashCollection = dashStats?.cash_collection || 0;
  const receivablesData = { total: dashStats?.total_receivables || 0, count: dashStats?.pending_count || 0 };
  const saleReturnData = { total: dashStats?.sale_return_total || 0, count: dashStats?.sale_return_count || 0, returnQty: dashStats?.sale_return_qty || 0 };
  const purchaseReturnData = { total: dashStats?.purchase_return_total || 0, count: dashStats?.purchase_return_count || 0, returnQty: dashStats?.purchase_return_qty || 0 };

  // New Updates Panel Component - Maximized height to show all updates
  const NewUpdatesPanel = () => {
    const updates = [
      {
        version: "v1.4.5",
        date: "27/03/2026",
        changes: [
          "Sales Dashboard: actions column sticky to right edge",
          "Customer name single-line display in invoice table",
          "Action icon buttons compact size (h-7 w-7)",
          "Toolbar buttons (Comfortable/Columns/Reset) polished"
        ]
      },
      {
        version: "v1.4.4",
        date: "27/03/2026",
        changes: [
          "Sales Dashboard filter bar right-side blank gap fixed",
          "Stat cards stretch full width with truncation",
          "Filter bar stays in single row with overflow scroll"
        ]
      },
      {
        version: "v1.4.3",
        date: "27/03/2026",
        changes: [
          "Sidebar auto-hide: icon-only mode by default (44px)",
          "Hover to expand sidebar with smooth 0.22s transition",
          "Lock/unlock toggle button at sidebar bottom",
          "Sidebar preference saved to localStorage"
        ]
      },
      {
        version: "v1.4.2",
        date: "26/03/2026",
        changes: [
          "Purchase Bill: Auto-Focus Search Bar setting added",
          "Size Grid Review Mode setting — check prices before adding to bill",
          "Ctrl+A shortcut to add product to purchase bill",
          "Both settings under Settings → Purchase tab"
        ]
      },
      {
        version: "v1.4.1",
        date: "25/03/2026",
        changes: [
          "Purchase Bill: size grid review mode with editable Pur/Sale/MRP per size",
          "Cursor position setting — auto-focus search bar on product add",
          "After size qty entry: direct add to bill or review variant details"
        ]
      },
      {
        version: "v1.4.0",
        date: "20/03/2026",
        changes: [
          "Stock Settlement module with file import support",
          "Product Modify feature inside Purchase Bill screen",
          "DC Purchase feature for non-GST supplier purchases"
        ]
      },
      {
        version: "v1.3.9",
        date: "15/03/2026",
        changes: [
          "Barcode label printing fixes: 38×25mm and 40×25mm 2-up thermal",
          "TSC 80mm roll label layout improvements",
          "Label Designer settings sync via localStorage"
        ]
      },
      {
        version: "v1.3.8",
        date: "10/03/2026",
        changes: [
          "Brand-wise sale report bug fixes",
          "Size-group-based quantity entry with per-org feature flag",
          "Org-level barcode mode: Auto Generate vs Scan/Manual"
        ]
      },
      {
        version: "v1.3.7",
        date: "08/03/2026",
        changes: [
          "IST-aware Supabase date queries for accurate daily reports",
          "Inline calculator for price fields in purchase entry",
          "SIZE_ORDER constant for consistent size sorting"
        ]
      },
      {
        version: "v1.3.6",
        date: "05/03/2026",
        changes: [
          "KS Footwear: PDF download fix on mobile devices",
          "Customer account statement WhatsApp message fix",
          "Payment allocation mismatch fix (Tally bill-by-bill model)"
        ]
      },
      {
        version: "v1.3.5",
        date: "01/03/2026",
        changes: [
          "Purchase Discount and Sale Discount feature with Settings toggle",
          "Discounts auto-apply in Purchase Bills, Sales, and POS",
          "UI color system polish across all dashboards"
        ]
      },
      {
        version: "v1.3.4",
        date: "24/02/2026",
        changes: [
          "Five-phase mobile app redesign — read-only owner dashboard",
          "Mobile POS improvements and bottom navigation polish",
          "Offline indicator for mobile ERP mode"
        ]
      },
      {
        version: "v1.3.3",
        date: "18/02/2026",
        changes: [
          "A4 invoice print footer section fixed",
          "Size selection checkboxes in Add Product",
          "Auto-focus on Product Name in new product dialog"
        ]
      },
      {
        version: "v1.3.2",
        date: "16/02/2026",
        changes: [
          "Improved A4 print layout with proper page sizing",
          "Enhanced print font scaling for all formats"
        ]
      },
      {
        version: "v1.3.1",
        date: "10/02/2026",
        changes: [
          "Purchase entry product cursor position fix",
          "Size group partial selection feature"
        ]
      },
      {
        version: "v1.3.0",
        date: "05/02/2026",
        changes: [
          "Purple theme with improved contrast",
          "White text on sidebar for better visibility",
          "Header & footer styling improvements"
        ]
      },
      {
        version: "v1.2.9",
        date: "04/02/2026",
        changes: [
          "Sidebar font size increased for readability",
          "Menu alignment improvements"
        ]
      },
      {
        version: "v1.2.8",
        date: "02/02/2026",
        changes: [
          "WhatsApp duplicate prevention for invoices",
          "Improved message delivery tracking"
        ]
      },
      {
        version: "v1.2.7",
        date: "31/01/2026",
        changes: [
          "Windows Native UI redesign - WinUI/Fluent style",
          "Clean white dashboard cards with accent borders",
          "Professional enterprise color system"
        ]
      },
      {
        version: "v1.2.6",
        date: "29/01/2026",
        changes: [
          "Draft resume fix for Sale Order Dashboard",
          "Removed total qty box from sales invoice"
        ]
      },
      {
        version: "v1.2.5",
        date: "28/01/2026",
        changes: [
          "Stock validation improvements during invoice edit",
          "Fixed aggregation for same variant multiple entries"
        ]
      },
      {
        version: "v1.2.4",
        date: "27/01/2026",
        changes: [
          "Draft management moved to dashboard banners",
          "Improved draft resume functionality"
        ]
      },
      {
        version: "v1.2.3",
        date: "25/01/2026",
        changes: [
          "Dashboard resolution enhanced to match ERP style",
          "Larger metric cards with better readability"
        ]
      },
      {
        version: "v1.2.2",
        date: "22/01/2026",
        changes: [
          "Bold black font for draft notifications",
          "Enhanced visual hierarchy"
        ]
      },
      {
        version: "v1.2.1",
        date: "20/01/2026",
        changes: [
          "Fixed bugs for better user experience",
          "Performance optimizations"
        ]
      },
      {
        version: "v1.2.0",
        date: "18/01/2026",
        changes: [
          "New dark theme with VASY ERP styling",
          "Vibrant gradient card backgrounds"
        ]
      }
    ];

    return (
      <Card className="border border-border bg-card shadow-elevated h-fit">
        <CardHeader className="bg-muted/30 border-b border-border p-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-card-foreground">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Megaphone className="h-4 w-4 text-primary" />
            </div>
            New Updates
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[520px]" showScrollbar>
            <div className="p-3 space-y-3">
              {updates.map((update, index) => (
                <div key={index} className="border-b border-border pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-card-foreground">{update.version}</span>
                    <span className="text-xs text-muted-foreground">{update.date}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {update.changes.map((change, changeIndex) => (
                      <li key={changeIndex} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
    <TooltipProvider>
    <div 
      className="w-full px-6 py-4 space-y-4 bg-background min-h-full"
      onContextMenu={handlePageContextMenu}
    >
      {/* Desktop Context Menu */}
      <PageContextMenu
        isOpen={pageContextMenu.isOpen}
        position={pageContextMenu.position}
        items={getDashboardContextMenuItems()}
        onClose={pageContextMenu.closeMenu}
        title="Quick Actions"
      />

      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Smart Inventory Management System
          </p>
        </div>
        
        {/* Date Range Selector & Theme Toggle */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          
          {/* Refresh Button */}
           <Button
            variant={hasLoaded ? "outline" : "default"}
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshing || isLoading}
            className={cn(
              "h-9 text-sm",
              hasLoaded
                ? "border-border bg-card hover:bg-muted"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", (isRefreshing || isLoading) && "animate-spin")} />
            {hasLoaded ? "Refresh" : "Load Data"}
          </Button>
          
          <div className="flex items-center gap-2 bg-card border border-border rounded-md px-2 py-1 shadow-elevated">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={dateRange} onValueChange={(v: DateRangeType) => setDateRange(v)}>
              <SelectTrigger className="w-[100px] h-9 border-0 shadow-none text-sm bg-transparent text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <span className="text-xs font-medium text-primary">{dateLabel}</span>
            )}
          </div>
          <Button 
            variant="default" 
            size="sm" 
            onClick={() => navigate(`/net-profit-analysis?from=${startDate}&to=${endDate}`)}
            className="h-9 text-sm"
          >
            <TrendingUp className="h-3.5 w-3.5 mr-1" />
            Net Profit
          </Button>
        </div>
      </div>
      
      {/* Command Toolbar */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <button
          onClick={() => navigate("/pos-sales")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New Sale
        </button>
        <button
          onClick={() => navigate("/purchase-entry")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border bg-background hover:bg-muted transition-colors text-foreground"
        >
          <Package className="h-3.5 w-3.5" /> Purchase
        </button>
        <button
          onClick={() => navigate("/stock-report")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border bg-background hover:bg-muted transition-colors text-foreground"
        >
          <BarChart3 className="h-3.5 w-3.5" /> Stock
        </button>
        <button
          onClick={() => navigate("/accounts")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border bg-background hover:bg-muted transition-colors text-foreground"
        >
          <Calculator className="h-3.5 w-3.5" /> Accounts
        </button>
        <button
          onClick={() => navigate("/daily-cashier-report")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border bg-background hover:bg-muted transition-colors text-foreground"
        >
          <DollarSign className="h-3.5 w-3.5" /> Cashier
        </button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground hidden lg:block">
          Quick actions — Ctrl+K to search
        </span>
      </div>

      {/* Last Updated Indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {hasLoaded ? (
          <>
            <div className={cn("h-2 w-2 rounded-full", isLoading ? "bg-amber-400 animate-pulse" : "bg-success")} />
            <span>
              {isLoading ? "Loading..." : `Last updated: ${format(lastUpdated, "HH:mm:ss")}`}
            </span>
          </>
        ) : (
          <>
            <div className="h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">
              Click <strong>Load Data</strong> to view dashboard
            </span>
          </>
        )}
      </div>

      {/* Main Content — Full Width */}
      <div className="space-y-4">

        {/* Left side - Metric cards */}
        {!hasLoaded ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="p-4 rounded-full bg-muted">
              <BarChart3 className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">Dashboard data not loaded</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click <strong>Load Data</strong> above to fetch your business analytics
              </p>
            </div>
            <Button onClick={handleRefreshAll} disabled={isRefreshing}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              Load Data
            </Button>
          </div>
        ) : (
        <div className="space-y-3">
          {/* Row 1 - Sales Metrics */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <AnimatedMetricCard
              title="Total Sales"
              value={salesData?.total || 0}
              icon={DollarSign}
              accentColor="bg-blue-500"
              onClick={() => navigate("/sales-invoice-dashboard")}
              tooltip="Total revenue from all sales invoices. Click to view Sales Dashboard."
              isCurrency
            />
            <AnimatedMetricCard
              title="Invoices"
              value={salesData?.count || 0}
              icon={FileText}
              accentColor="bg-orange-500"
              onClick={() => navigate("/sales-invoice-dashboard")}
              tooltip="Number of sales invoices generated. Click to view all invoices."
            />
            <AnimatedMetricCard
              title="Sold Qty"
              value={salesData?.soldQty || 0}
              icon={ShoppingCart}
              accentColor="bg-green-500"
              onClick={() => navigate("/stock-report")}
              tooltip="Total quantity of items sold. Click to view Stock Report."
            />
            <AnimatedMetricCard
              title="S/R Amount"
              value={saleReturnData?.total || 0}
              icon={RotateCcw}
              accentColor="bg-amber-500"
              onClick={() => navigate("/sale-return-dashboard")}
              tooltip="Total sale return amount. Click to view Sale Returns."
              isCurrency
            />
            <AnimatedMetricCard
              title="S/R Qty"
              value={saleReturnData?.returnQty || 0}
              icon={RotateCcw}
              accentColor="bg-slate-500"
              onClick={() => navigate("/sale-return-dashboard")}
              tooltip="Total sale return quantity. Click to view Sale Returns."
            />
            <AnimatedMetricCard
              title="Customers"
              value={customersCount || 0}
              icon={Users}
              accentColor="bg-pink-500"
              onClick={() => navigate("/customers")}
              tooltip="Total registered customers. Click to manage customers."
            />
          </div>

          {/* Row 2 - Purchase Metrics */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <AnimatedMetricCard
              title="Total Purchase"
              value={purchaseData?.total || 0}
              icon={ShoppingCart}
              accentColor="bg-emerald-500"
              onClick={() => navigate("/purchase-bills")}
              tooltip="Total amount spent on purchases. Click to view Purchase Dashboard."
              isCurrency
            />
            <AnimatedMetricCard
              title="Bills"
              value={purchaseData?.count || 0}
              icon={FileText}
              accentColor="bg-teal-500"
              onClick={() => navigate("/purchase-bills")}
              tooltip="Number of purchase bills recorded. Click to view all bills."
            />
            <AnimatedMetricCard
              title="Purchase Qty"
              value={purchaseData?.purchaseQty || 0}
              icon={Package}
              accentColor="bg-orange-500"
              onClick={() => navigate("/stock-report")}
              tooltip="Total quantity of items purchased. Click to view Stock Report."
            />
            <AnimatedMetricCard
              title="P/R Amount"
              value={purchaseReturnData?.total || 0}
              icon={RotateCcw}
              accentColor="bg-amber-500"
              onClick={() => navigate("/purchase-return-dashboard")}
              tooltip="Total purchase return amount. Click to view Purchase Returns."
              isCurrency
            />
            <AnimatedMetricCard
              title="P/R Qty"
              value={purchaseReturnData?.returnQty || 0}
              icon={RotateCcw}
              accentColor="bg-slate-500"
              onClick={() => navigate("/purchase-return-dashboard")}
              tooltip="Total purchase return quantity. Click to view Purchase Returns."
            />
            <AnimatedMetricCard
              title="Suppliers"
              value={suppliersCount || 0}
              icon={Store}
              accentColor="bg-violet-500"
              onClick={() => navigate("/suppliers")}
              tooltip="Total registered suppliers. Click to manage suppliers."
            />
          </div>

          {/* Row 3 - Inventory & Financial Metrics (Grouped Section) */}
          <div className="bg-muted/30 rounded-lg p-4 border border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" />
              Inventory &amp; Financial Overview
            </h3>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <AnimatedMetricCard
              title="Products"
              value={productsCount || 0}
              icon={Package}
              accentColor="bg-indigo-500"
              onClick={() => navigate("/products")}
              tooltip="Total unique products in inventory. Click to view Product Dashboard."
            />
            <AnimatedMetricCard
              title="Stock Qty"
              value={stockData || 0}
              icon={Package}
              accentColor="bg-cyan-500"
              onClick={() => navigate("/stock-report")}
              tooltip="Total items in stock across all variants. Click to view Stock Report."
            />
            <AnimatedMetricCard
              title="Stock Value"
              value={stockValue || 0}
              icon={DollarSign}
              accentColor="bg-purple-500"
              onClick={() => navigate("/stock-report")}
              tooltip="Total value of current inventory at purchase price. Click to view details."
              isCurrency
            />
            {canViewGrossProfit && (
              <AnimatedMetricCard
                title="Gross Profit"
                value={profitData || 0}
                icon={TrendingUp}
                accentColor="bg-green-600"
                onClick={() => navigate("/daily-cashier-report")}
                tooltip="Sales revenue minus purchase cost. Click to view Cashier Report."
                isCurrency
              />
            )}
            <AnimatedMetricCard
              title="Receivables"
              value={receivablesData?.total || 0}
              icon={AlertCircle}
              accentColor="bg-red-500"
              onClick={() => navigate("/payments-dashboard")}
              tooltip={`Outstanding from ${receivablesData?.count || 0} pending invoices. Click to view Payments Dashboard.`}
              isCurrency
            />
            <AnimatedMetricCard
              title="Cash Collection"
              value={cashCollection || 0}
              icon={DollarSign}
              accentColor="bg-blue-600"
              onClick={() => navigate("/daily-cashier-report")}
              tooltip="Total cash collected from sales. Click to view Cashier Report."
              isCurrency
            />
            </div>
          </div>

          {/* Field Sales App Section - Only visible for users with field sales access */}
          {hasFieldSalesAccess && (
            <div>
              <h2 className="text-base font-semibold mb-3 text-foreground flex items-center gap-2">
                <div className="h-1 w-8 bg-primary rounded-full" />
                Field Sales App
              </h2>
              <Card className="border border-border bg-card shadow-sm border-l-[3px] border-l-warning">
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-warning/10">
                      <Smartphone className="h-4 w-4 text-warning" />
                    </div>
                    <div>
                      <CardTitle className="text-sm text-card-foreground">Field Sales Mobile App</CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        Welcome, {employeeName || "Salesman"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      size="sm"
                      onClick={() => navigate("/salesman")}
                      className="h-9 text-sm"
                    >
                      <Smartphone className="mr-1 h-3.5 w-3.5" />
                      Open App
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline" 
                      onClick={() => navigate("/salesman/order/new")}
                      className="h-9 text-sm border-border"
                    >
                      <ClipboardList className="mr-1 h-3.5 w-3.5" />
                      New Order
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline" 
                      onClick={() => navigate("/salesman/customers")}
                      className="h-9 text-sm border-border"
                    >
                      <MapPin className="mr-1 h-3.5 w-3.5" />
                      Customers
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline" 
                      onClick={() => navigate("/salesman/outstanding")}
                      className="h-9 text-sm border-border"
                    >
                      <IndianRupee className="mr-1 h-3.5 w-3.5" />
                      Outstanding
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Charts Section */}
          <StatsChartsSection hasLoaded={hasLoaded} />
        </div>
        )}

        {/* Customer Category Cards — inline row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card 
            className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow border-l-[3px] border-l-warning cursor-pointer"
            onClick={() => navigate("/sales-analytics?tab=customers")}
          >
            <CardContent className="p-3 text-center">
              <div className="text-xl font-semibold tabular-nums text-warning">5</div>
              <div className="text-xs text-muted-foreground font-medium">VIP Customer</div>
            </CardContent>
          </Card>
          <Card 
            className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow border-l-[3px] border-l-success cursor-pointer"
            onClick={() => navigate("/sales-analytics?tab=customers")}
          >
            <CardContent className="p-3 text-center">
              <div className="text-xl font-semibold tabular-nums text-success">22</div>
              <div className="text-xs text-muted-foreground font-medium">Regular Customer</div>
            </CardContent>
          </Card>
          <Card 
            className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow border-l-[3px] border-l-warning cursor-pointer"
            onClick={() => navigate("/sales-analytics?tab=customers")}
          >
            <CardContent className="p-3 text-center">
              <div className="text-xl font-semibold tabular-nums text-warning">410</div>
              <div className="text-xs text-muted-foreground font-medium">Risk Customer</div>
            </CardContent>
          </Card>
          <Card 
            className="border border-border bg-card shadow-sm hover:shadow-md transition-shadow border-l-[3px] border-l-destructive cursor-pointer"
            onClick={() => navigate("/sales-analytics?tab=customers")}
          >
            <CardContent className="p-3 text-center">
              <div className="text-xl font-semibold tabular-nums text-destructive">6221</div>
              <div className="text-xs text-muted-foreground font-medium">Lost Customer</div>
            </CardContent>
          </Card>
        </div>

        {/* New Updates — Collapsible below main content */}
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2 py-2 select-none">
            <Megaphone className="h-3.5 w-3.5" />
            New Updates &amp; Changelog
            <span className="text-[10px] group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-2">
            <NewUpdatesPanel />
          </div>
        </details>
      </div>
    </div>
    </TooltipProvider>
    <SizeStockDialog open={showSizeStock} onOpenChange={setShowSizeStock} />
    </>
  );
};

// DashboardContent decides between mobile and desktop
// This keeps hook order consistent by NOT calling hooks before conditional
const DashboardContent = () => {
  const isMobile = useIsMobile();
  
  if (isMobile) {
    return <MobileDashboardWrapper />;
  }
  
  return <DesktopDashboard />;
};

const Index = () => {
  const { currentOrganization, organizations, loading } = useOrganization();

  // Only redirect if user genuinely has no organizations
  // If organizations exist, we're just waiting for currentOrganization to be set by OrgLayout
  if (!loading && organizations.length === 0) {
    window.location.href = "/organization-setup";
    return null;
  }

  // Show skeleton loader while waiting for currentOrganization to be set
  if (!currentOrganization) {
    return <DashboardSkeleton />;
  }

  return <DashboardContent />;
};

export default Index;
