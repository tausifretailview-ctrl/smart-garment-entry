import { ReactNode, useState } from "react";
import {
  Menu,
  Home,
  Package,
  ShoppingCart,
  Settings,
  LogOut,
  PlusCircle,
  Trash2,
  Keyboard,
  LayoutGrid,
  BarChart3,
  RotateCcw,
  Wallet,
  Banknote,
  Printer,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useNavigate } from "react-router-dom";
import { resolveOrgLoginPath } from "@/lib/orgLoginRedirect";
import { PosDCProvider, usePosDC } from "@/contexts/PosDCContext";
import { KeyboardShortcutsModal, useKeyboardShortcuts } from "@/components/KeyboardShortcutsModal";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
import { WhatsAppMessageNotifier } from "@/components/WhatsAppMessageNotifier";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { SizeStockDialog } from "@/components/SizeStockDialog";
import { FloatingCashTally } from "@/components/FloatingCashTally";
import { FloatingPayments } from "@/components/FloatingPayments";
import { PwaInstallBanner } from "@/components/mobile/PwaInstallBanner";
import { IdleMount } from "@/components/IdleMount";
import { mobileMainPaddingClass } from "@/lib/mobileShell";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useSharedAppShell } from "@/contexts/SharedAppShellContext";
import { cn } from "@/lib/utils";

function PosDeliveryChallanLayoutContent({ children }: { children: ReactNode }) {
  const sharedShell = useSharedAppShell();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const { orgNavigate, orgSlug } = useOrgNavigation();
  const {
    onNewChallan,
    onClearCart,
    onOpenCashierReport,
    onOpenStockReport,
    onOpenSaleReturn,
    onReprintLast,
    hasItems,
    canReprint,
    isSaving,
  } = usePosDC();
  const { isOpen, setIsOpen } = useKeyboardShortcuts("pos");
  const [showSizeStock, setShowSizeStock] = useState(false);
  const [showCashTally, setShowCashTally] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const { hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();
  const can = (id: string) => !permissionsLoading && (permissions === null || hasMenuAccess(id));

  const handleSignOut = async () => {
    await signOut();
    navigate(resolveOrgLoginPath());
  };

  const header = (
    <header className="h-12 shrink-0 bg-orange-600 text-white flex items-center justify-between px-4 shadow-md z-50">
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-orange-500">
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 bg-popover z-50">
            {can("main_dashboard") && (
              <DropdownMenuItem onClick={() => orgNavigate("/")}>
                <Home className="mr-2 h-4 w-4" />
                Dashboard
              </DropdownMenuItem>
            )}
            {can("pos_sales") && (
              <DropdownMenuItem onClick={() => orgNavigate("/pos-sales")}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                POS Sales
              </DropdownMenuItem>
            )}
            {can("pos_dashboard") && (
              <DropdownMenuItem onClick={() => orgNavigate("/pos-dashboard")}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                POS Dashboard
              </DropdownMenuItem>
            )}
            {can("product_dashboard") && (
              <DropdownMenuItem onClick={() => orgNavigate("/products")}>
                <Package className="mr-2 h-4 w-4" />
                Products
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {can("settings_view") && (
              <DropdownMenuItem onClick={() => orgNavigate("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setIsOpen(true)}>
              <Keyboard className="mr-2 h-4 w-4" />
              Keyboard Shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <span className="font-semibold text-sm md:text-base truncate max-w-[220px]">
            {currentOrganization?.name || "POS DC"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <TooltipProvider>
          {onNewChallan && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onNewChallan}
                  className="text-white hover:bg-orange-500 gap-1"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">New DC</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>New delivery challan</TooltipContent>
            </Tooltip>
          )}
          {onClearCart && hasItems && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearCart}
                  className="text-white hover:bg-red-600/80 gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear cart (Esc)</TooltipContent>
            </Tooltip>
          )}
          {onReprintLast && canReprint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReprintLast}
                  className="text-white hover:bg-orange-500 gap-1"
                >
                  <Printer className="h-4 w-4" />
                  <span className="hidden sm:inline">Reprint</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reprint last saved DC</TooltipContent>
            </Tooltip>
          )}
          {onOpenCashierReport && can("daily_cashier_report") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenCashierReport}
                  className="text-white hover:bg-orange-500 gap-1"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Cashier</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Daily Cashier Report (F8)</TooltipContent>
            </Tooltip>
          )}
          {onOpenStockReport && can("stock_report") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenStockReport}
                  className="text-white hover:bg-orange-500 gap-1"
                >
                  <Package className="h-4 w-4" />
                  <span className="hidden sm:inline">Stock</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Quick stock check</TooltipContent>
            </Tooltip>
          )}
          {onOpenSaleReturn && can("sale_return") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenSaleReturn}
                  className="text-white hover:bg-orange-500 gap-1"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span className="hidden sm:inline">S/R</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sale Return (F5)</TooltipContent>
            </Tooltip>
          )}
          {can("stock_report") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSizeStock(true)}
                  className="text-white hover:bg-orange-500 gap-1"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Size Stock</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Size-wise stock (F11)</TooltipContent>
            </Tooltip>
          )}
          {can("daily_tally") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCashTally(true)}
                  className="text-white hover:bg-orange-500 gap-1"
                >
                  <Wallet className="h-4 w-4" />
                  <span className="hidden sm:inline">Cash Tally</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Daily Cash Tally</TooltipContent>
            </Tooltip>
          )}
          {(can("payment_recording") || can("payments_dashboard")) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPayments(true)}
                  className="text-white hover:bg-orange-500 gap-1"
                >
                  <Banknote className="h-4 w-4" />
                  <span className="hidden sm:inline">Payments</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Quick payments</TooltipContent>
            </Tooltip>
          )}
          {can("pos_sales") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => orgNavigate("/pos-sales")}
                  className="text-white hover:bg-orange-500 gap-1 bg-orange-700/40"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span className="hidden sm:inline">POS</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to POS Sales</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(true)}
                className="text-white hover:bg-orange-500 h-8 w-8"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-xs md:text-sm opacity-90 ml-1 hidden md:inline">POS Delivery Challan</span>
      </div>
    </header>
  );

  const dialogs = (
    <>
      <KeyboardShortcutsModal open={isOpen} onOpenChange={setIsOpen} context="pos" />
      <SizeStockDialog open={showSizeStock} onOpenChange={setShowSizeStock} />
      <FloatingCashTally open={showCashTally} onOpenChange={setShowCashTally} />
      <FloatingPayments open={showPayments} onOpenChange={setShowPayments} />
    </>
  );

  const main = (
    <main
      className={cn(
        "flex flex-1 flex-col min-h-0 h-0 overflow-hidden p-0",
        mobileMainPaddingClass,
        "lg:pb-0",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col h-full w-full overflow-hidden">{children}</div>
    </main>
  );

  if (sharedShell) {
    return (
      <div className="flex min-h-0 flex-1 flex-col w-full bg-background overflow-hidden">
        {header}
        {main}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      {header}
      <div className="hidden lg:block shrink-0">
        <WindowTabsBar />
      </div>
      <OfflineIndicator />
      {main}
      <MobileBottomNav />
      {dialogs}
      <WhatsAppMessageNotifier />
      <IdleMount>
        <PwaInstallBanner />
        <div className="hidden lg:contents">
          <FloatingWhatsAppInbox />
        </div>
      </IdleMount>
    </div>
  );
}

export function PosDeliveryChallanLayout({ children }: { children: ReactNode }) {
  const sharedShell = useSharedAppShell();
  const inner = (
    <PosDCProvider>
      <PosDeliveryChallanLayoutContent>{children}</PosDeliveryChallanLayoutContent>
    </PosDCProvider>
  );
  if (sharedShell) return inner;
  return <ChatProvider>{inner}</ChatProvider>;
}
