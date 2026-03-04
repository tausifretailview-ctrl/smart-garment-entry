import { ReactNode, useState } from "react";
import { Menu, Home, Package, ShoppingCart, FileText, Settings, LogOut, Store, PlusCircle, Trash2, Keyboard, LayoutGrid, BarChart3, Package as PackageIcon, RotateCcw, Wallet, Banknote, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useNavigate } from "react-router-dom";
import { usePOS, POSProvider } from "@/contexts/POSContext";
import { KeyboardShortcutsModal, useKeyboardShortcuts } from "@/components/KeyboardShortcutsModal";
import { WindowTabsBar } from "@/components/WindowTabsBar";
import { ChatProvider } from "@/contexts/ChatContext";
import { FloatingChatButton } from "@/components/AIChatbot/FloatingChatButton";
import { FloatingWhatsAppInbox } from "@/components/FloatingWhatsAppInbox";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { SizeStockDialog } from "@/components/SizeStockDialog";
import { FloatingCashTally } from "@/components/FloatingCashTally";
import { FloatingPayments } from "@/components/FloatingPayments";

interface POSLayoutProps {
  children: ReactNode;
}

const POSLayoutContent = ({ children }: POSLayoutProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const { orgNavigate, orgSlug } = useOrgNavigation();
  const { onNewSale, onClearCart, onOpenCashierReport, onOpenStockReport, onOpenSaleReturn, onSaveChanges, hasItems, isEditing, isSavingChanges } = usePOS();
  const { isOpen, setIsOpen } = useKeyboardShortcuts("pos");
  const [showSizeStock, setShowSizeStock] = useState(false);
  const [showCashTally, setShowCashTally] = useState(false);
  const [showPayments, setShowPayments] = useState(false);

  const handleSignOut = async () => {
    const slug = currentOrganization?.slug || orgSlug;
    await signOut();
    if (slug) {
      navigate(`/${slug}`);
    } else {
      navigate("/auth");
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      {/* Top Header Bar */}
      <header className="h-12 bg-primary text-primary-foreground flex items-center justify-between px-4 shadow-md z-50">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary/80">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 bg-popover z-50">
              <DropdownMenuItem onClick={() => orgNavigate("/")}>
                <Home className="mr-2 h-4 w-4" />
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => orgNavigate("/pos-dashboard")}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                POS Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => orgNavigate("/products")}>
                <Package className="mr-2 h-4 w-4" />
                Products
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => orgNavigate("/sales-invoice-dashboard")}>
                <FileText className="mr-2 h-4 w-4" />
                Sales Dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => orgNavigate("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
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
            <Store className="h-5 w-5" />
            <span className="font-semibold text-sm md:text-base truncate max-w-[200px]">
              {currentOrganization?.name || "POS"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            {onNewSale && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onNewSale}
                    className="text-primary-foreground hover:bg-primary/80 gap-1"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">New Sale</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                  <p>Start a new sale <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-xs">F1</kbd></p>
                </TooltipContent>
              </Tooltip>
            )}
            {onClearCart && hasItems && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onClearCart}
                    className="text-primary-foreground hover:bg-destructive/80 gap-1"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Clear</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                  <p>Clear cart <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-xs">Esc</kbd></p>
                </TooltipContent>
              </Tooltip>
            )}
            {isEditing && onSaveChanges && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onSaveChanges}
                    disabled={isSavingChanges}
                    className="text-primary-foreground hover:bg-green-600/80 gap-1 bg-green-600/40"
                  >
                    {isSavingChanges ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="hidden sm:inline">{isSavingChanges ? 'Saving...' : 'Save Changes'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                  <p>Save customer, salesman & notes changes</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onOpenCashierReport && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onOpenCashierReport}
                    className="text-primary-foreground hover:bg-primary/80 gap-1"
                  >
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Cashier</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                  <p>Daily Cashier Report</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onOpenStockReport && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onOpenStockReport}
                    className="text-primary-foreground hover:bg-primary/80 gap-1"
                  >
                    <PackageIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Stock</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                  <p>Quick Stock Check</p>
                </TooltipContent>
              </Tooltip>
            )}
            {onOpenSaleReturn && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onOpenSaleReturn}
                    className="text-primary-foreground hover:bg-primary/80 gap-1"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span className="hidden sm:inline">S/R</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                  <p>Sale Return</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowSizeStock(true)}
                  className="text-primary-foreground hover:bg-primary/80 gap-1"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Size Stock</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                <p>Size-wise Stock Report</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowCashTally(true)}
                  className="text-primary-foreground hover:bg-primary/80 gap-1"
                >
                  <Wallet className="h-4 w-4" />
                  <span className="hidden sm:inline">Cash Tally</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                <p>Daily Cash Tally</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowPayments(true)}
                  className="text-primary-foreground hover:bg-primary/80 gap-1"
                >
                  <Banknote className="h-4 w-4" />
                  <span className="hidden sm:inline">Payments</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                <p>Quick Payments (Receipt / Supplier / Expense)</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsOpen(true)}
                  className="text-primary-foreground hover:bg-primary/80 h-8 w-8"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-popover text-popover-foreground">
                <p>Keyboard shortcuts <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-xs">?</kbd></p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-xs md:text-sm opacity-90 ml-2">Point of Sale</span>
        </div>
      </header>
      
      <WindowTabsBar />
      
      {/* Mobile offline indicator */}
      <OfflineIndicator />
      
      {/* Add bottom padding on mobile for bottom nav */}
      <main className="flex-1 animate-fade-in p-4 pb-20 lg:pb-4">{children}</main>
      
      {/* Mobile navigation */}
      <MobileBottomNav />
      
      <KeyboardShortcutsModal open={isOpen} onOpenChange={setIsOpen} context="pos" />
      <SizeStockDialog open={showSizeStock} onOpenChange={setShowSizeStock} />
      <FloatingCashTally open={showCashTally} onOpenChange={setShowCashTally} />
      <FloatingPayments open={showPayments} onOpenChange={setShowPayments} />
    </div>
  );
};

export const POSLayout = ({ children }: POSLayoutProps) => {
  return (
    <ChatProvider>
      <POSProvider>
        <POSLayoutContent>{children}</POSLayoutContent>
      </POSProvider>
    </ChatProvider>
  );
};
