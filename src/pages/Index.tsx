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
import { MobileDashboard } from "@/components/mobile/MobileDashboard";
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

// Dashboard Metric Card using design system tokens
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

  // Map accent colors to semantic status classes for dark mode compatibility
  const getAccentClasses = (color: string) => {
    const colorMap: Record<string, { border: string; bg: string; text: string }> = {
      'bg-blue-500': { border: 'border-l-primary', bg: 'bg-primary/10', text: 'text-primary' },
      'bg-blue-600': { border: 'border-l-primary', bg: 'bg-primary/10', text: 'text-primary' },
      'bg-green-500': { border: 'border-l-success', bg: 'bg-success/10', text: 'text-success' },
      'bg-green-600': { border: 'border-l-success', bg: 'bg-success/10', text: 'text-success' },
      'bg-emerald-500': { border: 'border-l-success', bg: 'bg-success/10', text: 'text-success' },
      'bg-orange-500': { border: 'border-l-warning', bg: 'bg-warning/10', text: 'text-warning' },
      'bg-amber-500': { border: 'border-l-warning', bg: 'bg-warning/10', text: 'text-warning' },
      'bg-red-500': { border: 'border-l-destructive', bg: 'bg-destructive/10', text: 'text-destructive' },
      'bg-pink-500': { border: 'border-l-accent', bg: 'bg-accent/10', text: 'text-accent' },
      'bg-purple-500': { border: 'border-l-accent', bg: 'bg-accent/10', text: 'text-accent' },
      'bg-violet-500': { border: 'border-l-accent', bg: 'bg-accent/10', text: 'text-accent' },
      'bg-indigo-500': { border: 'border-l-primary', bg: 'bg-primary/10', text: 'text-primary' },
      'bg-cyan-500': { border: 'border-l-primary', bg: 'bg-primary/10', text: 'text-primary' },
      'bg-teal-500': { border: 'border-l-success', bg: 'bg-success/10', text: 'text-success' },
      'bg-slate-500': { border: 'border-l-muted-foreground', bg: 'bg-muted', text: 'text-muted-foreground' },
    };
    return colorMap[color] || { border: 'border-l-primary', bg: 'bg-primary/10', text: 'text-primary' };
  };

  const accentClasses = getAccentClasses(accentColor);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group relative animate-in fade-in-0 slide-in-from-bottom-2 duration-300" onClick={onClick}>
          <Card 
            className={cn(
              "bg-card relative overflow-hidden border border-border shadow-elevated cursor-pointer",
              "transition-all duration-150 ease-out",
              "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5",
              "active:translate-y-0 active:shadow-sm",
              "border-l-4",
              accentClasses.border
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1 pl-4">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {title}
              </CardTitle>
              <div className={cn("p-1.5 rounded-md transition-transform duration-150 group-hover:scale-110", accentClasses.bg)}>
                <Icon className={cn("h-4 w-4", accentClasses.text)} />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 pl-4">
              <div className="text-2xl font-bold text-card-foreground tracking-tight">
                {displayValue}
              </div>
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
      <MobileDashboard />
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
      onClick: () => navigate("/pos-sales"),
    },
    {
      label: "Stock Report",
      icon: Package,
      onClick: () => navigate("/stock-report"),
    },
    {
      label: "Daily Cash Report",
      icon: Calculator,
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
    await queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    await queryClient.invalidateQueries({ queryKey: ["sales-trend"] });
    await queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
    await queryClient.invalidateQueries({ queryKey: ["top-products"] });
    setLastUpdated(new Date());
    setTimeout(() => setIsRefreshing(false), 500);
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
    enabled: !!currentOrganization,
    staleTime: 60000,
    refetchInterval: getRefreshInterval('fast'),
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
      className="space-y-6 bg-background min-h-full"
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
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="h-9 text-sm border-border bg-card hover:bg-muted"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isRefreshing && "animate-spin")} />
            Refresh
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
      
      {/* Last Updated Indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
        <span>Live • Last updated: {format(lastUpdated, "HH:mm:ss")}</span>
      </div>

      {/* Main Content Grid with New Updates Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">

        {/* Left side - Metric cards */}
        <div className="space-y-3">
          {/* Row 1 - Sales Metrics */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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

          {/* Row 3 - Inventory & Financial Metrics */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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

          {/* Field Sales App Section - Only visible for users with field sales access */}
          {hasFieldSalesAccess && (
            <div>
              <h2 className="text-base font-semibold mb-3 text-foreground flex items-center gap-2">
                <div className="h-1 w-8 bg-primary rounded-full" />
                Field Sales App
              </h2>
              <Card className="border border-border bg-card shadow-elevated border-l-[3px] border-l-warning">
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
          <StatsChartsSection />
        </div>

        {/* Right side - New Updates panel + Customer Cards */}
        <div className="self-start space-y-3">
          <NewUpdatesPanel />
          
          {/* Customer Category Cards */}
          <div className="grid grid-cols-2 gap-2">
            <Card 
              className="border border-border bg-card shadow-elevated border-l-[3px] border-l-warning cursor-pointer hover:bg-muted/50 transition-colors active:scale-[0.98]"
              onClick={() => navigate("/sales-analytics?tab=customers")}
            >
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-warning">5</div>
                <div className="text-xs text-muted-foreground font-medium">VIP Customer</div>
              </CardContent>
            </Card>
            <Card 
              className="border border-border bg-card shadow-elevated border-l-[3px] border-l-success cursor-pointer hover:bg-muted/50 transition-colors active:scale-[0.98]"
              onClick={() => navigate("/sales-analytics?tab=customers")}
            >
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-success">22</div>
                <div className="text-xs text-muted-foreground font-medium">Regular Customer</div>
              </CardContent>
            </Card>
            <Card 
              className="border border-border bg-card shadow-elevated border-l-[3px] border-l-warning cursor-pointer hover:bg-muted/50 transition-colors active:scale-[0.98]"
              onClick={() => navigate("/sales-analytics?tab=customers")}
            >
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-warning">410</div>
                <div className="text-xs text-muted-foreground font-medium">Risk Customer</div>
              </CardContent>
            </Card>
            <Card 
              className="border border-border bg-card shadow-elevated border-l-[3px] border-l-destructive cursor-pointer hover:bg-muted/50 transition-colors active:scale-[0.98]"
              onClick={() => navigate("/sales-analytics?tab=customers")}
            >
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-destructive">6221</div>
                <div className="text-xs text-muted-foreground font-medium">Lost Customer</div>
              </CardContent>
            </Card>
          </div>
        </div>
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
