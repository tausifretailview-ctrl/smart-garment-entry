import { Bell, Menu, Search, ShoppingCart, Package, TrendingUp, Download, LayoutGrid, BoxIcon, ChevronDown, Plus, ShieldCheck, FileText, Scale, Banknote, RefreshCw } from "lucide-react";
import { UIScaleSelector } from "@/components/UIScaleSelector";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState, useEffect, useMemo } from "react";
import { SizeStockDialog } from "@/components/SizeStockDialog";
import { CustomerStatementFloatingDialog } from "@/components/CustomerStatementFloatingDialog";
import { FloatingAccountsPaymentsDialog } from "@/components/FloatingAccountsPaymentsDialog";
import { FloatingStockReport } from "@/components/FloatingPOSReports";
import { useDashboardToolbarOptional } from "@/contexts/DashboardToolbarContext";
import { useSchoolFeatures } from "@/hooks/useSchoolFeatures";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { resolveFirstAllowedPath } from "@/lib/menuPermissions";
import { isElectronShell, reloadElectronApp } from "@/lib/electronShell";

/** Row-2 shortcut buttons — solid fills, white label/icons */
const shortcutBtn = (colorClass: string, extra?: string) =>
  cn(
    "h-7 text-xs font-semibold text-white border-0 shadow-sm gap-1.5",
    "hover:brightness-110 active:scale-[0.98] transition-all",
    colorClass,
    extra,
  );

export const Header = () => {
  const { user, signOut } = useAuth();
  const { currentOrganization, organizationRole } = useOrganization();
  const navigate = useNavigate();
  const { orgNavigate, getOrgPath, orgSlug } = useOrgNavigation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sizeStockOpen, setSizeStockOpen] = useState(false);
  const [quickStockOpen, setQuickStockOpen] = useState(false);
  const [customerStatementOpen, setCustomerStatementOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const isDesktopApp = isElectronShell();
  const dashboardToolbar = useDashboardToolbarOptional();
  const { isSchool } = useSchoolFeatures();
  const { hasMenuAccess, hasSpecialPermission, permissions, loading: permissionsLoading } = useUserPermissions();
  const can = (menuId: string) =>
    !permissionsLoading && (permissions === null || hasMenuAccess(menuId));
  const goHome = () => {
    const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
    orgNavigate(fallback ? `/${fallback}` : "/");
  };
  const canQuickCustomerStatement =
    !isSchool &&
    !permissionsLoading &&
    (permissions === null ||
      hasMenuAccess("customer_account_statement") ||
      hasMenuAccess("customer_ledger"));
  const canQuickPayments =
    !permissionsLoading &&
    (permissions === null ||
      hasMenuAccess("payment_recording") ||
      hasMenuAccess("payments_dashboard"));

  // Ctrl+G keyboard shortcut to open Size Stock dialog (only when stock report is allowed)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "g" && can("stock_report")) {
        e.preventDefault();
        setSizeStockOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [permissions, permissionsLoading, hasMenuAccess]);

  const handleSignOut = async () => {
    // Get the organization slug (prefer current, fallback to localStorage)
    const slug = currentOrganization?.slug || orgSlug || localStorage.getItem("selectedOrgSlug");
    
    // Ensure slug is preserved in localStorage for PWA support before signing out
    if (slug) {
      localStorage.setItem("selectedOrgSlug", slug);
    }
    
    await signOut();
    
    // Redirect to organization login URL if available, otherwise default auth
    if (slug) {
      navigate(`/${slug}`);
    } else {
      navigate('/auth');
    }
  };

  const initials = user?.email?.substring(0, 2).toUpperCase() || "U";

  const quickActions = useMemo(() => {
    const base: {
      icon: typeof ShoppingCart;
      label: string;
      path: string;
      isDialog: boolean;
      shortcut?: string;
      dialogKey: string;
      permission?: string;
    }[] = [
      { icon: ShoppingCart, label: "New Sale", path: "/pos-sales", isDialog: false, dialogKey: "", permission: "pos_sales" },
      { icon: Package, label: "New Purchase", path: "/purchase-entry", isDialog: false, dialogKey: "", permission: "purchase_bill" },
      { icon: LayoutGrid, label: "Size Stock", path: "", isDialog: true, shortcut: "Ctrl+G", dialogKey: "sizeStock", permission: "stock_report" },
      { icon: BoxIcon, label: "Quick Stock", path: "", isDialog: true, dialogKey: "quickStock", permission: "stock_report" },
    ];
    if (canQuickCustomerStatement) {
      base.push({
        icon: Scale,
        label: "Account statement (audit)",
        path: "",
        isDialog: true,
        dialogKey: "customerStatement",
      });
    }
    base.push({ icon: TrendingUp, label: "Reports", path: "/stock-report", isDialog: false, dialogKey: "", permission: "stock_report" });
    return base.filter(
      (a) =>
        !a.permission ||
        (!permissionsLoading && (permissions === null || hasMenuAccess(a.permission)))
    );
  }, [canQuickCustomerStatement, permissions, permissionsLoading, hasMenuAccess]);

  const handleQuickAction = (action: (typeof quickActions)[0]) => {
    if (action.dialogKey === "sizeStock") {
      setSizeStockOpen(true);
    } else if (action.dialogKey === "quickStock") {
      setQuickStockOpen(true);
    } else if (action.dialogKey === "customerStatement") {
      setCustomerStatementOpen(true);
    } else {
      orgNavigate(action.path);
    }
  };

  return (
    <>
      {/* ROW 1: Title bar */}
      <div className="sticky top-0 z-50 flex h-9 items-center px-3 gap-3 bg-[#1e40af] text-white border-t border-white border-b border-[#1b3a97] shadow-sm">
        {/* Mobile menu trigger */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:text-white hover:bg-white/10">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] bg-sidebar text-sidebar-foreground border-sidebar-border">
            <nav className="flex flex-col gap-2 mt-8">
              {quickActions.map((action) => (
                <Button key={action.label} variant="ghost"
                  className="justify-start text-sidebar-foreground hover:bg-sidebar-accent"
                  onClick={() => { handleQuickAction(action); setMobileMenuOpen(false); }}>
                  <action.icon className="h-4 w-4 mr-2" />{action.label}
                </Button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Logo + App name */}
        <button onClick={goHome} className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 bg-primary rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-[11px]">E</span>
          </div>
            <span className="hidden sm:flex items-center gap-1.5">
            <span className="text-sm font-bold text-white">EzzyERP</span>
            <span className="text-white/45 text-sm">—</span>
            <span className="text-xs text-white/85 hidden md:block">Smart Inventory & Billing</span>
          </span>
        </button>

        {/* Classic menu bar — desktop only; hide each menu when user has no rights for any item */}
        <nav className="hidden lg:flex items-center gap-0 ml-1">
          {(can("pos_sales") || can("sales_invoice") || can("purchase_bill") || can("quotation_entry") || can("product_entry") || can("settings_view")) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-[14px] font-semibold text-white hover:bg-white/10 px-2.5 py-1.5 rounded transition-colors focus:outline-none">
                  File
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 text-sm">
                {can("pos_sales") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/pos-sales")} className="cursor-pointer">
                    <ShoppingCart className="h-3.5 w-3.5 mr-2 opacity-60" /> New POS Sale
                  </DropdownMenuItem>
                )}
                {can("sales_invoice") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/sales-invoice")} className="cursor-pointer">
                    <Plus className="h-3.5 w-3.5 mr-2 opacity-60" /> New Invoice
                  </DropdownMenuItem>
                )}
                {can("purchase_bill") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/purchase-entry")} className="cursor-pointer">
                    <Package className="h-3.5 w-3.5 mr-2 opacity-60" /> New Purchase
                  </DropdownMenuItem>
                )}
                {can("quotation_entry") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/quotation-entry")} className="cursor-pointer">
                    <TrendingUp className="h-3.5 w-3.5 mr-2 opacity-60" /> New Quotation
                  </DropdownMenuItem>
                )}
                {can("product_entry") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/product-entry")} className="cursor-pointer">
                    <BoxIcon className="h-3.5 w-3.5 mr-2 opacity-60" /> New Product
                  </DropdownMenuItem>
                )}
                {can("settings_view") && (
                  <>
                    {(can("pos_sales") || can("sales_invoice") || can("purchase_bill") || can("quotation_entry") || can("product_entry")) && (
                      <DropdownMenuSeparator />
                    )}
                    <DropdownMenuItem onClick={() => orgNavigate("/settings")} className="cursor-pointer">
                      Settings
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {(can("main_dashboard") || can("pos_dashboard") || can("sales_invoice_dashboard") || can("purchase_dashboard") || can("delivery_dashboard") || can("payments_dashboard") || can("accounts_dashboard") || can("customer_ledger")) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-[14px] font-semibold text-white hover:bg-white/10 px-2.5 py-1.5 rounded transition-colors focus:outline-none">
                  View
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 text-sm">
                {can("main_dashboard") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/")} className="cursor-pointer">
                    <LayoutGrid className="h-3.5 w-3.5 mr-2 opacity-60" /> Dashboard
                  </DropdownMenuItem>
                )}
                {can("pos_dashboard") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/pos-dashboard")} className="cursor-pointer">
                    <ShoppingCart className="h-3.5 w-3.5 mr-2 opacity-60" /> POS Dashboard
                  </DropdownMenuItem>
                )}
                {can("sales_invoice_dashboard") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/sales-invoice-dashboard")} className="cursor-pointer">
                    <TrendingUp className="h-3.5 w-3.5 mr-2 opacity-60" /> Invoice Dashboard
                  </DropdownMenuItem>
                )}
                {can("purchase_dashboard") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/purchase-bills")} className="cursor-pointer">
                    <Package className="h-3.5 w-3.5 mr-2 opacity-60" /> Purchase Dashboard
                  </DropdownMenuItem>
                )}
                {(can("delivery_dashboard") || can("payments_dashboard")) && (
                  <>
                    <DropdownMenuSeparator />
                    {can("delivery_dashboard") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/delivery-dashboard")} className="cursor-pointer">
                        Delivery Dashboard
                      </DropdownMenuItem>
                    )}
                    {can("payments_dashboard") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/payments-dashboard")} className="cursor-pointer">
                        Payments Dashboard
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {(can("accounts_dashboard") || can("customer_ledger")) && (
                  <>
                    <DropdownMenuSeparator />
                    {can("accounts_dashboard") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/accounts")} className="cursor-pointer">
                        Accounts & Ledger
                      </DropdownMenuItem>
                    )}
                    {can("customer_ledger") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/customer-ledger-report")} className="cursor-pointer">
                        Customer Ledger
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {(can("barcode_printing") || can("stock_adjustment") || can("stock_settlement") || can("bulk_product_update") || can("tally_export") || can("recycle_bin") || can("user_rights") || hasSpecialPermission("audit_logs") || can("whatsapp_inbox")) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-[14px] font-semibold text-white hover:bg-white/10 px-2.5 py-1.5 rounded transition-colors focus:outline-none">
                  Tools
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 text-sm">
                {can("barcode_printing") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/barcode-printing")} className="cursor-pointer">
                    <BoxIcon className="h-3.5 w-3.5 mr-2 opacity-60" /> Barcode Printing
                  </DropdownMenuItem>
                )}
                {can("stock_adjustment") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/stock-adjustment")} className="cursor-pointer">
                    <Package className="h-3.5 w-3.5 mr-2 opacity-60" /> Stock Adjustment
                  </DropdownMenuItem>
                )}
                {can("stock_settlement") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/stock-settlement")} className="cursor-pointer">
                    Stock Settlement
                  </DropdownMenuItem>
                )}
                {(can("bulk_product_update") || can("tally_export")) && (
                  <>
                    <DropdownMenuSeparator />
                    {can("bulk_product_update") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/bulk-product-update")} className="cursor-pointer">
                        Bulk Product Update
                      </DropdownMenuItem>
                    )}
                    {can("tally_export") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/tally-export")} className="cursor-pointer">
                        Tally Export
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {(can("recycle_bin") || can("user_rights") || hasSpecialPermission("audit_logs")) && (
                  <>
                    <DropdownMenuSeparator />
                    {can("recycle_bin") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/recycle-bin")} className="cursor-pointer">
                        Recycle Bin
                      </DropdownMenuItem>
                    )}
                    {can("user_rights") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/user-rights")} className="cursor-pointer">
                        User Rights
                      </DropdownMenuItem>
                    )}
                    {hasSpecialPermission("audit_logs") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/audit-log")} className="cursor-pointer">
                        Audit Log
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {can("whatsapp_inbox") && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => orgNavigate("/whatsapp-inbox")} className="cursor-pointer">
                      WhatsApp Inbox
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {(can("stock_report") || can("item_wise_sales") || can("item_wise_stock") || can("stock_ageing") || can("daily_tally") || can("daily_cashier_report") || can("sale_analysis") || can("hourly_sales_analysis") || can("accounting_reports_view") || can("net_profit_analysis") || can("sales_analytics") || can("gst_reports") || can("gst_register") || can("einvoice_report") || canQuickCustomerStatement || can("customer_audit_report")) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-[14px] font-semibold text-white hover:bg-white/10 px-2.5 py-1.5 rounded transition-colors focus:outline-none">
                  Reports
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 text-sm">
                {can("stock_report") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/stock-report")} className="cursor-pointer">
                    <BoxIcon className="h-3.5 w-3.5 mr-2 opacity-60" /> Stock Report
                  </DropdownMenuItem>
                )}
                {can("item_wise_sales") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/item-wise-sales")} className="cursor-pointer">
                    Item-wise Sales
                  </DropdownMenuItem>
                )}
                {can("item_wise_stock") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/item-wise-stock")} className="cursor-pointer">
                    Item-wise Stock
                  </DropdownMenuItem>
                )}
                {can("stock_ageing") && (
                  <DropdownMenuItem onClick={() => orgNavigate("/stock-ageing")} className="cursor-pointer">
                    Stock Ageing
                  </DropdownMenuItem>
                )}
                {(can("daily_tally") || can("daily_cashier_report") || can("sale_analysis") || can("hourly_sales_analysis")) && (
                  <>
                    <DropdownMenuSeparator />
                    {can("daily_tally") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/daily-tally")} className="cursor-pointer">
                        <TrendingUp className="h-3.5 w-3.5 mr-2 opacity-60" /> Daily Tally
                      </DropdownMenuItem>
                    )}
                    {can("daily_cashier_report") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/daily-cashier-report")} className="cursor-pointer">
                        Daily Cashier
                      </DropdownMenuItem>
                    )}
                    {can("sale_analysis") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/daily-sale-analysis")} className="cursor-pointer">
                        Daily Sale Analysis
                      </DropdownMenuItem>
                    )}
                    {can("hourly_sales_analysis") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/hourly-sales-analysis")} className="cursor-pointer">
                        Hourly Sales
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {(can("accounting_reports_view") || can("net_profit_analysis") || can("sales_analytics")) && (
                  <>
                    <DropdownMenuSeparator />
                    {can("accounting_reports_view") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/accounting-reports")} className="cursor-pointer">
                        P&L / Balance Sheet
                      </DropdownMenuItem>
                    )}
                    {can("net_profit_analysis") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/net-profit-analysis")} className="cursor-pointer">
                        Net Profit Analysis
                      </DropdownMenuItem>
                    )}
                    {can("sales_analytics") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/sales-analytics")} className="cursor-pointer">
                        Sales Analytics
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {(can("gst_reports") || can("gst_register") || can("einvoice_report")) && (
                  <>
                    <DropdownMenuSeparator />
                    {can("gst_reports") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/gst-reports")} className="cursor-pointer">
                        GST Reports
                      </DropdownMenuItem>
                    )}
                    {can("gst_register") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/gst-register")} className="cursor-pointer">
                        GST Register
                      </DropdownMenuItem>
                    )}
                    {can("einvoice_report") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/einvoice-report")} className="cursor-pointer">
                        E-Invoice Report
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {(canQuickCustomerStatement || can("customer_audit_report")) && (
                  <>
                    <DropdownMenuSeparator />
                    {canQuickCustomerStatement && (
                      <DropdownMenuItem
                        onClick={() => setCustomerStatementOpen(true)}
                        className="cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5 mr-2 opacity-60" />
                        Account statement (audit)
                      </DropdownMenuItem>
                    )}
                    {can("customer_audit_report") && (
                      <DropdownMenuItem onClick={() => orgNavigate("/customer-audit-report")} className="cursor-pointer">
                        <ShieldCheck className="h-3.5 w-3.5 mr-2 opacity-60" />
                        Customer Audit Report
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {can("settings_view") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-[14px] font-semibold text-white hover:bg-white/10 px-2.5 py-1.5 rounded transition-colors focus:outline-none">
                  Help
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 text-sm">
                <DropdownMenuItem onClick={() => orgNavigate("/settings")} className="cursor-pointer">
                  App Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => window.open("https://wa.me/your-support-number", "_blank")}
                  className="cursor-pointer"
                >
                  WhatsApp Support
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    toast("About EzzyERP", { description: "EzzyERP v2.0 · Smart Inventory & Billing" });
                  }}
                  className="cursor-pointer"
                >
                  About EzzyERP
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>

        {/* Search bar — grows to fill space */}
        <div className="hidden md:flex flex-1 max-w-xs mx-auto">
          <div className="flex items-center w-full h-7 rounded border border-slate-200/95 bg-white px-2.5 gap-2 shadow-sm cursor-pointer hover:border-slate-300 transition-colors">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
            <span className="flex-1 text-[12px] text-slate-600">Search... (Ctrl+K)</span>
            <ChevronDown className="h-3 w-3 flex-shrink-0 text-slate-500" />
          </div>
        </div>

        <div className="flex-1 hidden md:block" />

        {/* Right icons */}
        <div className="flex items-center gap-1">
          {!isInstalled && (isInstallable || /iPad|iPhone|iPod/.test(navigator.userAgent)) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (isInstallable) {
                  const ok = await promptInstall();
                  if (ok) toast.success("App installed");
                } else {
                  toast("Install on iOS", {
                    description: 'Tap the Share icon, then "Add to Home Screen".',
                  });
                }
              }}
              className="h-7 px-2 gap-1.5 text-white/90 hover:text-white hover:bg-white/10"
              title="Install EzzyERP App"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-[11px] font-medium">Install App</span>
            </Button>
          )}
          {isDesktopApp && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/90 hover:text-white hover:bg-white/10 hidden md:flex"
              title="Refresh app (F5)"
              onClick={() => reloadElectronApp()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          <UIScaleSelector triggerClassName="h-7 w-7 text-white/90 hover:text-white hover:bg-white/10 hidden md:flex" />
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/90 hover:text-white hover:bg-white/10 hidden md:flex">
            <Bell className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/90 hover:text-white hover:bg-white/10 hidden md:flex">
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10 h-7 w-7 text-white/90 hover:text-white">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-2 py-1.5"><p className="text-xs text-muted-foreground">{user?.email}</p></div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => orgNavigate("/settings")} className="cursor-pointer text-sm">App Settings</DropdownMenuItem>
              {isDesktopApp && (
                <DropdownMenuItem
                  onClick={() => reloadElectronApp()}
                  className="cursor-pointer text-sm"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-2 opacity-60" />
                  Refresh App
                  <span className="ml-auto text-[10px] text-muted-foreground">F5</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer text-sm">Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ROW 2: Action toolbar — each shortcut hidden without the matching User Rights permission */}
      <div className="sticky top-9 z-50 hidden lg:flex min-h-10 items-center flex-wrap px-3 py-1.5 gap-x-2 gap-y-1.5 bg-slate-100 dark:bg-slate-900/90 border-b border-border/80 shadow-sm">
        {can("pos_sales") && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => orgNavigate("/pos-sales")}
              className={shortcutBtn("bg-blue-600 hover:bg-blue-700", "px-3 rounded-r-none border-r border-white/25")}
            >
              <Plus className="h-3.5 w-3.5" />
              New Sale
            </Button>
            <Button variant="ghost" className={shortcutBtn("bg-blue-600 hover:bg-blue-700", "px-1.5 rounded-l-none")}>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {can("purchase_bill") && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => orgNavigate("/purchase-entry")}
              className={shortcutBtn("bg-emerald-600 hover:bg-emerald-700", "px-2.5")}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Purchase
            </Button>
          </div>
        )}

        {can("stock_report") && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => orgNavigate("/stock-report")}
              className={shortcutBtn("bg-cyan-600 hover:bg-cyan-700", "px-2.5 rounded-r-none border-r border-white/25")}
            >
              <Package className="h-3.5 w-3.5" />
              Stock
            </Button>
            <Button variant="ghost" className={shortcutBtn("bg-cyan-600 hover:bg-cyan-700", "px-1 rounded-l-none")}>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        )}

        {can("daily_cashier_report") && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => orgNavigate("/daily-cashier-report")}
              className={shortcutBtn("bg-amber-600 hover:bg-amber-700", "px-2.5")}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Cashier
            </Button>
          </div>
        )}

        {(can("stock_report") || canQuickCustomerStatement) && (
          <div className="w-px h-5 bg-border/60 mx-0.5" />
        )}
        {can("stock_report") && (
          <>
            <Button
              variant="ghost"
              onClick={() => setQuickStockOpen(true)}
              className={shortcutBtn("bg-violet-600 hover:bg-violet-700", "px-2.5")}
            >
              <BoxIcon className="h-3.5 w-3.5" />
              Quick Stock
            </Button>
            <Button
              variant="ghost"
              onClick={() => setSizeStockOpen(true)}
              className={shortcutBtn("bg-indigo-600 hover:bg-indigo-700", "px-2.5")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Size Stock
            </Button>
          </>
        )}
        {canQuickCustomerStatement && (
          <Button
            variant="ghost"
            onClick={() => setCustomerStatementOpen(true)}
            className={shortcutBtn("bg-rose-600 hover:bg-rose-700", "px-2.5")}
            title="Search customers, balances, open audit statement"
          >
            <Scale className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Account statement (audit)</span>
            <span className="xl:hidden">Stmt (audit)</span>
          </Button>
        )}
        {canQuickPayments && (
          <Button
            variant="ghost"
            onClick={() => setPaymentsOpen(true)}
            className={shortcutBtn("bg-teal-600 hover:bg-teal-700", "px-2.5")}
            title="Customer & supplier payments, expenses, salaries"
          >
            <Banknote className="h-3.5 w-3.5" />
            Payment
          </Button>
        )}

        {dashboardToolbar?.toolbar ? (
          <>
            <div className="w-px h-4 bg-sidebar-border shrink-0" />
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {dashboardToolbar.toolbar}
            </div>
          </>
        ) : null}

        <div className="flex-1 min-w-[4rem]" />

        {/* Organization name */}
        <span className="text-xs font-semibold text-sidebar-foreground/80 truncate max-w-[150px]" title={currentOrganization?.name || ""}>
          {currentOrganization?.name || ""}
        </span>
        <div className="w-px h-4 bg-sidebar-border mx-1" />

        <span className="text-xs text-sidebar-foreground/50 tabular-nums">
          {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </span>
      </div>

      {/* Dialogs */}
      <SizeStockDialog open={sizeStockOpen} onOpenChange={setSizeStockOpen} />
      <FloatingStockReport open={quickStockOpen} onOpenChange={setQuickStockOpen} />
      <CustomerStatementFloatingDialog open={customerStatementOpen} onOpenChange={setCustomerStatementOpen} />
      <FloatingAccountsPaymentsDialog open={paymentsOpen} onOpenChange={setPaymentsOpen} />
    </>
  );
};
