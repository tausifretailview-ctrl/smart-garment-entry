import React from "react";
import { X, Plus, ChevronUp, ChevronDown, Home } from "lucide-react";
import { useWindowTabs, getTabIcon } from "@/contexts/WindowTabsContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const QUICK_OPEN_PAGES = [
  { path: "dashboard", label: "Dashboard", icon: "Home", category: "Main" },
  { path: "pos-sales", label: "POS Sales", icon: "ShoppingCart", category: "Sales" },
  { path: "sales-invoice", label: "Sales Invoice", icon: "FileText", category: "Sales" },
  { path: "sales-invoice-dashboard", label: "Sales Dashboard", icon: "FileText", category: "Sales" },
  { path: "quotation-dashboard", label: "Quotations", icon: "ClipboardList", category: "Sales" },
  { path: "sale-order-dashboard", label: "Sale Orders", icon: "ClipboardList", category: "Sales" },
  { path: "purchase-entry", label: "Purchase Entry", icon: "Package", category: "Purchase" },
  { path: "purchase-bill-dashboard", label: "Purchase Bills", icon: "Package", category: "Purchase" },
  { path: "product-dashboard", label: "Products", icon: "Layers", category: "Masters" },
  { path: "customers", label: "Customers", icon: "Users", category: "Masters" },
  { path: "suppliers", label: "Suppliers", icon: "Building2", category: "Masters" },
  { path: "stock-report", label: "Stock Report", icon: "BarChart3", category: "Reports" },
  { path: "daily-cashier-report", label: "Daily Cashier", icon: "CalendarDays", category: "Reports" },
  { path: "payments-dashboard", label: "Payments", icon: "Wallet", category: "Accounts" },
  { path: "accounts", label: "Accounts", icon: "BookOpen", category: "Accounts" },
  { path: "delivery-dashboard", label: "Delivery", icon: "Truck", category: "Delivery" },
  { path: "settings", label: "Settings", icon: "Settings", category: "System" },
];

export function WindowTabsBar() {
  const { 
    openWindows, 
    activeWindow, 
    closeWindow, 
    switchWindow, 
    openWindow, 
    isWindowOpen,
    isTabsBarVisible,
    toggleTabsBarVisibility 
  } = useWindowTabs();
  const { orgNavigate } = useOrgNavigation();

  if (openWindows.length === 0) return null;

  const groupedPages = QUICK_OPEN_PAGES.reduce((acc, page) => {
    if (!acc[page.category]) acc[page.category] = [];
    acc[page.category].push(page);
    return acc;
  }, {} as Record<string, typeof QUICK_OPEN_PAGES>);

  // Collapsed state - just show toggle button
  if (!isTabsBarVisible) {
    return (
      <div className="bg-muted/30 border-b px-2 py-0.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{openWindows.length} window{openWindows.length > 1 ? 's' : ''} open</span>
          <span className="hidden md:inline">•</span>
          <span className="hidden md:inline">
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl</kbd>+
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Tab</kbd> to switch
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0" 
              onClick={toggleTabsBarVisibility}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Show window tabs</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="bg-muted/30 border-b px-2 py-0.5">
      <div className="flex items-center gap-0.5">
        {/* Dashboard Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 gap-1 px-1.5 shrink-0"
              onClick={() => orgNavigate("/")}
            >
              <Home className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-[11px]">Dashboard</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Go to Dashboard</p>
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-1" />

        <ScrollArea className="flex-1">
          <div className="flex items-center gap-1">
            {openWindows.map((window) => {
              const IconComponent = getTabIcon(window.icon);
              const isActive = window.path === activeWindow;
              
              return (
                <div
                  key={window.path}
                  className={cn(
                    "group flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-all",
                    "hover:bg-background/80",
                    isActive 
                      ? "bg-background text-primary shadow-sm border" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => switchWindow(window.path)}
                >
                  <IconComponent className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[100px]">{window.label}</span>
                  {openWindows.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeWindow(window.path);
                      }}
                      className={cn(
                        "ml-1 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity",
                        "hover:bg-destructive/20 hover:text-destructive p-0.5"
                      )}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" className="h-1" />
        </ScrollArea>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="h-6 w-6 p-0 shrink-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
            {Object.entries(groupedPages).map(([category, pages], idx) => (
              <React.Fragment key={category}>
                {idx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {category}
                </DropdownMenuLabel>
                {pages.map((page) => {
                  const IconComponent = getTabIcon(page.icon);
                  const isOpen = isWindowOpen(page.path);
                  return (
                    <DropdownMenuItem
                      key={page.path}
                      onClick={() => openWindow(page.path)}
                      className={cn(isOpen && "bg-muted")}
                    >
                      <IconComponent className="h-4 w-4 mr-2" />
                      {page.label}
                      {isOpen && <span className="ml-auto text-xs text-muted-foreground">Open</span>}
                    </DropdownMenuItem>
                  );
                })}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="text-xs text-muted-foreground hidden md:block pl-2 border-l">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl</kbd>+
          <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Tab</kbd>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="xs" 
              className="h-6 w-6 p-0 shrink-0" 
              onClick={toggleTabsBarVisibility}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Collapse tabs bar</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
