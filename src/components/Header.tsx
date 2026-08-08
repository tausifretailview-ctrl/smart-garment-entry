import { DesktopWindowControls } from "@/components/desktop/DesktopWindowControls";
import { HeaderMenubar } from "@/components/desktop/HeaderMenubar";
import { Menu, ShoppingCart, Package, Download, LayoutGrid, BoxIcon, Plus, FileText, Banknote, RefreshCw, BarChart3, Settings, Users, Building2, Wallet } from "lucide-react";
import { UIScaleSelector } from "@/components/UIScaleSelector";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useInstallPrompt, isIOSDevice, triggerPwaInstall } from "@/hooks/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useState, useEffect, useMemo } from "react";
import { SizeStockDialog } from "@/components/SizeStockDialog";
import { FloatingStockReport, FloatingSaleReport } from "@/components/FloatingPOSReports";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { resolveFirstAllowedPath } from "@/lib/menuPermissions";
import { confirmReloadIfPosCartBusy, reloadAppWithUpdateCheck } from "@/lib/appReload";
import { isElectronShell } from "@/lib/electronShell";
import { requestPosBarcodeFocus } from "@/utils/posSalesRefresh";
import { useForceDesktopView } from "@/hooks/useDesktopViewPreference";
import { useIsNarrowViewport } from "@/hooks/use-mobile";
import { ActivityCenterBell } from "@/components/activity-center/ActivityCenterBell";
import {
  ContactSupportSheet,
  HelpToolbarButton,
  SupportToolbarButton,
} from "@/components/support/ContactSupportSheet";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { storeOrgSlug, getStoredOrgSlug } from "@/lib/orgSlug";
import { resolveOrgLoginPath } from "@/lib/orgLoginRedirect";
import { prefetchTabPage } from "@/lib/tabPageRegistry";

export const Header = () => {
  const { user, signOut } = useAuth();
  const { open: sidebarOpen, openMobile, useSheetSidebar } = useSidebar();
  const { currentOrganization, organizationRole } = useOrganization();
  const navigate = useNavigate();
  const location = useLocation();
  const { orgNavigate, getOrgPath, orgSlug } = useOrgNavigation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sizeStockOpen, setSizeStockOpen] = useState(false);
  const [quickStockOpen, setQuickStockOpen] = useState(false);
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);

  /** Visual-only active pill for shortcut bar (enables 140ms color crossfade). */
  const isShortcutPath = (segment: string) =>
    new RegExp(`/${segment}(/|$)`).test(location.pathname);
  const [supportOpen, setSupportOpen] = useState(false);
  const [helpShortcutsOpen, setHelpShortcutsOpen] = useState(false);
  const { canOfferInstall } = useInstallPrompt();
  const isDesktopApp = isElectronShell();

  const handleInstallApp = async () => {
    // Chrome/Edge: native PWA install dialog (Start Menu + desktop icon on Windows).
    const outcome = await triggerPwaInstall();
    if (outcome === "accepted") {
      toast.success("EzzyERP installed — open it from your Start menu or desktop shortcut.");
      return;
    }
    if (outcome === "dismissed") {
      toast.message("Install cancelled — tap Install App again anytime.");
      return;
    }
    if (isIOSDevice()) {
      toast("Install on iPhone / iPad", {
        description: 'Tap Share → "Add to Home Screen" to get the EzzyERP app icon.',
        duration: 10_000,
      });
      orgNavigate("/install");
      return;
    }
    // Prompt not available yet — install page has the one-click PC button + APK / EXE options.
    toast("Opening install page…", {
      description: "Tap “Install EzzyERP on this PC”, or use the Chrome install icon in the address bar.",
      duration: 6000,
    });
    orgNavigate("/install");
  };
  const { hasMenuAccess, hasMainMenuAccess, hasSpecialPermission, permissions, loading: permissionsLoading } = useUserPermissions();
  const can = (menuId: string) =>
    !permissionsLoading && (permissions === null || hasMenuAccess(menuId));
  const goHome = () => {
    const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
    orgNavigate(fallback ? `/${fallback}` : "/");
  };
  const canQuickPayments =
    !permissionsLoading &&
    (permissions === null ||
      hasMenuAccess("payment_recording") ||
      hasMenuAccess("payments_dashboard"));
  const canCustomerBalance =
    !permissionsLoading &&
    (permissions === null ||
      hasMenuAccess("customer_party_balances") ||
      hasMenuAccess("customer_ledger"));
  const canSupplierBalance =
    !permissionsLoading &&
    (permissions === null || hasMenuAccess("supplier_party_balances"));
  const canQuickSaleLookup =
    !permissionsLoading &&
    (permissions === null ||
      hasMenuAccess("sales_report_customer") ||
      hasMenuAccess("sales_invoice_dashboard") ||
      hasMenuAccess("pos_sales") ||
      hasMenuAccess("sales_invoice"));
  const canAccessReportsHub = useMemo(() => {
    if (permissionsLoading) return false;
    if (permissions === null) return true;
    if (hasMainMenuAccess("reports")) return true;
    const reportPermissions = [
      "stock_report",
      "item_wise_sales",
      "item_wise_stock",
      "stock_ageing",
      "daily_tally",
      "daily_cashier_report",
      "sale_analysis",
      "hourly_sales_analysis",
      "accounting_reports_view",
      "net_profit_analysis",
      "sales_analytics",
      "gst_reports",
      "gst_register",
      "einvoice_report",
      "customer_audit_report",
      "customer_points_report",
      "customer_ledger",
      "customer_account_statement",
      "sales_invoice_dashboard",
      "sales_report_customer",
      "purchase_dashboard",
      "purchase_report_supplier",
      "purchase_return_dashboard",
      "purchase_return",
      "payments_dashboard",
      "tally_export",
    ];
    return reportPermissions.some((id) => hasMenuAccess(id));
  }, [permissions, permissionsLoading, hasMenuAccess, hasMainMenuAccess]);
  const forceDesktopView = useForceDesktopView();
  const isNarrowViewport = useIsNarrowViewport();

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

  const handleManualReload = () => {
    if (!confirmReloadIfPosCartBusy(currentOrganization?.id)) return;
    void reloadAppWithUpdateCheck();
  };

  const handleSignOut = async () => {
    // Get the organization slug (prefer current, fallback to localStorage)
    const slug = currentOrganization?.slug || orgSlug || getStoredOrgSlug();
    
    // Ensure slug is preserved in localStorage for PWA support before signing out
    if (slug) {
      storeOrgSlug(slug);
    }
    
    await signOut();
    
    // Redirect to organization login — never the platform-admin /auth page
    navigate(resolveOrgLoginPath());
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
      { icon: FileText, label: "Quick Sale", path: "", isDialog: true, dialogKey: "quickSale" },
    ];
    return base.filter(
      (a) =>
        (a.dialogKey === "quickSale"
          ? canQuickSaleLookup
          : !a.permission ||
            (!permissionsLoading && (permissions === null || hasMenuAccess(a.permission))))
    );
  }, [canQuickSaleLookup, permissions, permissionsLoading, hasMenuAccess]);

  const openPosSales = () => {
    orgNavigate("/pos-sales");
    requestPosBarcodeFocus();
  };

  const openPrimarySale = () => {
    if (can("pos_sales")) {
      openPosSales();
    } else {
      orgNavigate("/sales-invoice");
    }
  };

  const showPrimarySaleButton = can("pos_sales") || can("sales_invoice");

  const handleQuickAction = (action: (typeof quickActions)[0]) => {
    if (action.dialogKey === "sizeStock") {
      setSizeStockOpen(true);
    } else if (action.dialogKey === "quickStock") {
      setQuickStockOpen(true);
    } else if (action.dialogKey === "quickSale") {
      setQuickSaleOpen(true);
    } else if (action.path === "/pos-sales") {
      openPosSales();
    } else if (action.path === "/purchase-entry") {
      orgNavigate("/purchase-entry", { state: { newBill: true } });
    } else {
      orgNavigate(action.path);
    }
  };

  const fyStart = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const fyLabel = `FY ${fyStart}-${String(fyStart + 1).slice(-2)}`;

  return (
    <>
      {/* ROW 1: Title bar + menu (navy chrome) */}
      <div
        className={cn(
          "erp-titlebar",
          forceDesktopView && isNarrowViewport && "safe-area-pt",
        )}
      >
        {(useSheetSidebar ? !openMobile : !sidebarOpen) && (
          <SidebarTrigger
            className={cn(
              "erp-no-drag h-8 w-8 text-[var(--erp-chrome-ink)] hover:text-white hover:bg-white/10 shrink-0",
              useSheetSidebar || forceDesktopView ? "flex" : "hidden lg:flex",
            )}
          />
        )}

        <button type="button" onClick={goHome} className="erp-brand erp-no-drag">
          <span className="erp-brand__logo">E</span>
          <span className="hidden sm:inline text-white">Ezzy ERP</span>
        </button>

        {/* Desktop menu bar — always show in force-desktop (phone PWA); don't rely on lg: alone */}
        <div
          className={cn(
            "erp-no-drag min-w-0",
            forceDesktopView ? "flex overflow-x-auto" : "hidden lg:flex",
          )}
        >
          <HeaderMenubar
            can={can}
            canAccessReportsHub={canAccessReportsHub}
            canQuickSaleLookup={canQuickSaleLookup}
            hasSpecialPermission={hasSpecialPermission}
            orgNavigate={orgNavigate}
            openPosSales={openPosSales}
            onRefresh={handleManualReload}
          />
        </div>

        {/* Mobile / narrow: collapsed menu (not used in Desktop view) */}
        {!forceDesktopView && (
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="erp-no-drag lg:hidden h-7 px-2.5 text-[var(--erp-chrome-ink)] hover:text-white hover:bg-white/10 text-sm"
              >
                <Menu className="h-4 w-4 mr-1" />
                Menu
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] bg-sidebar text-sidebar-foreground border-sidebar-border">
              <nav className="flex flex-col gap-2 mt-8">
                {quickActions.map((action) => (
                  <Button
                    key={action.label}
                    variant="ghost"
                    className="justify-start text-sidebar-foreground hover:bg-sidebar-accent"
                    onPointerEnter={() => {
                      if (action.path) void prefetchTabPage(action.path);
                    }}
                    onFocus={() => {
                      if (action.path) void prefetchTabPage(action.path);
                    }}
                    onPointerDown={() => {
                      if (action.path) prefetchTabPage(action.path, { intent: true });
                    }}
                    onClick={() => {
                      handleQuickAction(action);
                      setMobileMenuOpen(false);
                    }}
                  >
                    <action.icon className="h-4 w-4 mr-2" />
                    {action.label}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="justify-start"
                  onPointerDown={() => prefetchTabPage("settings", { intent: true })}
                  onClick={() => {
                    orgNavigate("/settings");
                    setMobileMenuOpen(false);
                  }}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        )}

        <div className="flex-1 min-w-2" />

        <span className="erp-titlebar-meta hidden md:inline truncate max-w-[240px]">
          {currentOrganization?.name ? (
            <>
              <span className="font-semibold text-white">{currentOrganization.name}</span>
              <span className="text-[var(--erp-chrome-ink-dim)]"> · {fyLabel}</span>
            </>
          ) : (
            fyLabel
          )}
        </span>

        <div className="erp-no-drag flex items-center gap-0.5">
          {canOfferInstall && (
            <button
              type="button"
              onClick={() => void handleInstallApp()}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-md border border-emerald-300/80 bg-emerald-50",
                "text-xs sm:text-sm font-semibold text-emerald-800 shadow-sm",
                "hover:bg-emerald-100 hover:border-emerald-400 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                "mr-0.5",
              )}
              title="Install EzzyERP as an app on Windows or mobile"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Install App</span>
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[var(--erp-chrome-ink-dim)] hover:text-white hover:bg-white/10"
            title={isDesktopApp ? "Refresh app (Ctrl+R)" : "Refresh app"}
            onClick={handleManualReload}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <div className="hidden md:flex items-center gap-1.5 mr-0.5">
            <HelpToolbarButton onClick={() => setHelpShortcutsOpen(true)} />
            <SupportToolbarButton onClick={() => setSupportOpen(true)} />
          </div>
          <ActivityCenterBell />
          <UIScaleSelector triggerClassName="h-8 w-8 text-[var(--erp-chrome-ink-dim)] hover:text-white hover:bg-white/10 hidden md:flex" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="erp-no-drag rounded-full hover:bg-white/10 h-8 w-8 text-[var(--erp-chrome-ink-dim)] hover:text-white"
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-[var(--erp-accent)] text-white text-[10px] font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-2 py-1.5">
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onPointerDown={() => prefetchTabPage("settings", { intent: true })}
                onClick={() => orgNavigate("/settings")}
                className="cursor-pointer text-sm"
              >
                App Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleManualReload} className="cursor-pointer text-sm">
                <RefreshCw className="h-3.5 w-3.5 mr-2 opacity-60" />
                Refresh App
                {isDesktopApp && <span className="ml-auto text-[10px] text-muted-foreground">F5</span>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer text-sm">
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DesktopWindowControls />
        </div>
      </div>

      {/* ROW 2: Quick-action toolbar — show in force-desktop phone view too */}
      <div
        className={cn(
          "erp-toolbar overflow-x-auto",
          forceDesktopView ? "flex" : "hidden lg:flex",
        )}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-nowrap">
          {showPrimarySaleButton && (
            <button
              type="button"
              className={cn(
                "erp-tbtn",
                (can("pos_sales")
                  ? isShortcutPath("pos-sales")
                  : isShortcutPath("sales-invoice")) && "erp-tbtn--primary",
              )}
              onPointerEnter={() =>
                void prefetchTabPage(can("pos_sales") ? "pos-sales" : "sales-invoice")
              }
              onFocus={() =>
                void prefetchTabPage(can("pos_sales") ? "pos-sales" : "sales-invoice")
              }
              onPointerDown={() =>
                prefetchTabPage(can("pos_sales") ? "pos-sales" : "sales-invoice", { intent: true })
              }
              onClick={openPrimarySale}
            >
              {can("pos_sales") ? (
                <>
                  <ShoppingCart className="erp-tbtn__icon" />
                  POS
                </>
              ) : (
                <>
                  <Plus className="erp-tbtn__icon" />
                  New Invoice
                </>
              )}
            </button>
          )}
          {can("purchase_bill") && (
            <button
              type="button"
              className={cn("erp-tbtn", isShortcutPath("purchase-entry") && "erp-tbtn--primary")}
              onPointerEnter={() => void prefetchTabPage("purchase-entry")}
              onFocus={() => void prefetchTabPage("purchase-entry")}
              onPointerDown={() => prefetchTabPage("purchase-entry", { intent: true })}
              onClick={() => orgNavigate("/purchase-entry", { state: { newBill: true } })}
            >
              <Package className="erp-tbtn__icon" />
              Purchase
            </button>
          )}
          {can("stock_report") && (
            <button
              type="button"
              className={cn("erp-tbtn", isShortcutPath("stock-report") && "erp-tbtn--primary")}
              onPointerEnter={() => void prefetchTabPage("stock-report")}
              onFocus={() => void prefetchTabPage("stock-report")}
              onPointerDown={() => prefetchTabPage("stock-report", { intent: true })}
              onClick={() => orgNavigate("/stock-report")}
            >
              <LayoutGrid className="erp-tbtn__icon" />
              Stock
            </button>
          )}
          {(showPrimarySaleButton || can("purchase_bill") || can("stock_report")) && canAccessReportsHub && (
            <div className="erp-toolbar-sep" />
          )}
          {canAccessReportsHub && (
            <button
              type="button"
              className={cn("erp-tbtn", isShortcutPath("reports") && "erp-tbtn--primary")}
              onPointerEnter={() => void prefetchTabPage("reports")}
              onFocus={() => void prefetchTabPage("reports")}
              onPointerDown={() => prefetchTabPage("reports", { intent: true })}
              onClick={() => orgNavigate("/reports")}
            >
              <BarChart3 className="erp-tbtn__icon" />
              Reports
            </button>
          )}
          {can("daily_cashier_report") && (
            <button
              type="button"
              className={cn("erp-tbtn", isShortcutPath("daily-cashier-report") && "erp-tbtn--primary")}
              onPointerEnter={() => void prefetchTabPage("daily-cashier-report")}
              onFocus={() => void prefetchTabPage("daily-cashier-report")}
              onPointerDown={() => prefetchTabPage("daily-cashier-report", { intent: true })}
              onClick={() => orgNavigate("/daily-cashier-report")}
            >
              <Wallet className="erp-tbtn__icon" />
              Cashier Report
            </button>
          )}
          {/* Secondary quick actions — compact, after primary mockup row */}
          {can("stock_report") && (
            <>
              <button
                type="button"
                className={cn("erp-tbtn", quickStockOpen && "erp-tbtn--primary")}
                onClick={() => setQuickStockOpen(true)}
              >
                <BoxIcon className="erp-tbtn__icon" />
                Quick Stock
              </button>
              <button
                type="button"
                className={cn("erp-tbtn", sizeStockOpen && "erp-tbtn--primary")}
                onClick={() => setSizeStockOpen(true)}
              >
                <LayoutGrid className="erp-tbtn__icon" />
                Size Stock
              </button>
            </>
          )}
          {canQuickPayments && (
            <button
              type="button"
              className={cn("erp-tbtn", isShortcutPath("accounts-payments") && "erp-tbtn--primary")}
              onPointerEnter={() => void prefetchTabPage("accounts-payments")}
              onFocus={() => void prefetchTabPage("accounts-payments")}
              onPointerDown={() => prefetchTabPage("accounts-payments", { intent: true })}
              onClick={() => orgNavigate("/accounts-payments")}
            >
              <Banknote className="erp-tbtn__icon" />
              Payment
            </button>
          )}
          {canQuickSaleLookup && (
            <button
              type="button"
              className={cn("erp-tbtn", quickSaleOpen && "erp-tbtn--primary")}
              onClick={() => setQuickSaleOpen(true)}
            >
              <FileText className="erp-tbtn__icon" />
              Quick Sale
            </button>
          )}
          {canSupplierBalance && (
            <button
              type="button"
              className={cn("erp-tbtn", isShortcutPath("supplier-party-balances") && "erp-tbtn--primary")}
              onPointerEnter={() => void prefetchTabPage("supplier-party-balances")}
              onFocus={() => void prefetchTabPage("supplier-party-balances")}
              onPointerDown={() => prefetchTabPage("supplier-party-balances", { intent: true })}
              onClick={() => orgNavigate("/supplier-party-balances")}
            >
              <Building2 className="erp-tbtn__icon" />
              Supplier Balance
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {canCustomerBalance && (
            <button
              type="button"
              className={cn("erp-tbtn", isShortcutPath("customer-party-balances") && "erp-tbtn--primary")}
              onClick={() => orgNavigate("/customer-party-balances")}
            >
              <Users className="erp-tbtn__icon" />
              Customer Balance
            </button>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <SizeStockDialog open={sizeStockOpen} onOpenChange={setSizeStockOpen} />
      <FloatingStockReport open={quickStockOpen} onOpenChange={setQuickStockOpen} />
      <FloatingSaleReport open={quickSaleOpen} onOpenChange={setQuickSaleOpen} />
      <ContactSupportSheet open={supportOpen} onOpenChange={setSupportOpen} />
      <KeyboardShortcutsModal open={helpShortcutsOpen} onOpenChange={setHelpShortcutsOpen} context="general" />
    </>
  );
};
