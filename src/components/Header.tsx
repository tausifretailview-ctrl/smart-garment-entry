import { Bell, Menu, Search, ShoppingCart, Package, TrendingUp, Download, Grid3X3 } from "lucide-react";
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
import { useState, useEffect } from "react";
import { SizeStockDialog } from "@/components/SizeStockDialog";

export const Header = () => {
  const { user, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const { orgNavigate, getOrgPath, orgSlug } = useOrgNavigation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sizeStockOpen, setSizeStockOpen] = useState(false);
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();

  // Ctrl+G keyboard shortcut to open Size Stock dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "g") {
        e.preventDefault();
        setSizeStockOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const quickActions = [
    { icon: ShoppingCart, label: "New Sale", path: "/pos-sales", isDialog: false },
    { icon: Package, label: "New Purchase", path: "/purchase-entry", isDialog: false },
    { icon: Grid3X3, label: "Size Stock", path: "", isDialog: true, shortcut: "Ctrl+G" },
    { icon: TrendingUp, label: "Reports", path: "/stock-report", isDialog: false },
  ];

  const handleQuickAction = (action: typeof quickActions[0]) => {
    if (action.isDialog) {
      setSizeStockOpen(true);
    } else {
      orgNavigate(action.path);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-12 items-center justify-between px-3 max-w-full">
        {/* Left Side - Logo and Mobile Menu */}
        <div className="flex items-center gap-2">
          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] bg-sidebar text-sidebar-foreground border-sidebar-border">
              <nav className="flex flex-col gap-4 mt-8">
                {quickActions.map((action) => (
                  <Button
                    key={action.label}
                    variant="ghost"
                    className="justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
                    onClick={() => {
                      handleQuickAction(action);
                      setMobileMenuOpen(false);
                    }}
                  >
                    <action.icon className="h-4 w-4 mr-2" />
                    {action.label}
                  </Button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo - Compact */}
          <button
            onClick={() => orgNavigate("/")}
            className="flex items-center gap-1.5"
          >
            <div className="bg-sidebar-primary p-1 rounded">
              <Package className="h-3.5 w-3.5 text-sidebar-primary-foreground" />
            </div>
            <span className="hidden sm:block text-xs font-semibold text-sidebar-primary">
              Ezzy ERP
            </span>
          </button>
        </div>

        {/* Quick Actions - Desktop - Icons only for compact toolbar */}
        <div className="hidden lg:flex items-center gap-0.5">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              variant="ghost"
              size="icon"
              onClick={() => handleQuickAction(action)}
              className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
              title={action.label}
            >
              <action.icon className="h-4 w-4 text-sidebar-primary" />
            </Button>
          ))}
        </div>

        {/* Right Side - Compact icons */}
        <div className="flex items-center gap-1">
          {/* Search */}
          <Button variant="ghost" size="icon" className="hidden md:flex h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary">
            <Search className="h-4 w-4" />
          </Button>

          {/* Install App Button - Always visible on mobile, shows install prompt or instructions */}
          {!isInstalled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isInstallable) {
                  promptInstall();
                } else {
                  // Show manual install instructions for browsers that don't support beforeinstallprompt
                  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                  const message = isIOS 
                    ? "Tap the Share button, then 'Add to Home Screen'" 
                    : "Open browser menu (⋮) and tap 'Install App' or 'Add to Home Screen'";
                  alert(message);
                }
              }}
              className="relative text-sidebar-primary border-sidebar-primary/30 hover:bg-sidebar-accent hover:text-sidebar-primary gap-1"
              title="Install App"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Install App</span>
              {isInstallable && (
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-success rounded-full animate-pulse" />
              )}
            </Button>
          )}

          {/* Organization Selector */}
          <OrganizationSelector />

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-sidebar-primary rounded-full" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-sidebar-accent h-8 w-8">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-[10px] font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-2">
                <p className="text-sm font-medium">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => orgNavigate("/profile")} className="cursor-pointer hover:bg-accent/10 hover:text-primary">
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => orgNavigate("/settings")} className="cursor-pointer hover:bg-accent/10 hover:text-primary">
                App Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* Size Stock Floating Dialog */}
      <SizeStockDialog open={sizeStockOpen} onOpenChange={setSizeStockOpen} />
    </header>
  );
};
