import { Bell, Menu, Search, ShoppingCart, Package, TrendingUp, Download, LayoutGrid, BoxIcon } from "lucide-react";
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
import { useState, useEffect } from "react";
import { SizeStockDialog } from "@/components/SizeStockDialog";
import { FloatingStockReport } from "@/components/FloatingPOSReports";

export const Header = () => {
  const { user, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const { orgNavigate, getOrgPath, orgSlug } = useOrgNavigation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sizeStockOpen, setSizeStockOpen] = useState(false);
  const [quickStockOpen, setQuickStockOpen] = useState(false);
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
    { icon: ShoppingCart, label: "New Sale", path: "/pos-sales", isDialog: false, dialogKey: "" },
    { icon: Package, label: "New Purchase", path: "/purchase-entry", isDialog: false, dialogKey: "" },
    { icon: LayoutGrid, label: "Size Stock", path: "", isDialog: true, shortcut: "Ctrl+G", dialogKey: "sizeStock" },
    { icon: BoxIcon, label: "Quick Stock", path: "", isDialog: true, dialogKey: "quickStock" },
    { icon: TrendingUp, label: "Reports", path: "/stock-report", isDialog: false, dialogKey: "" },
  ];

  const handleQuickAction = (action: typeof quickActions[0]) => {
    if (action.dialogKey === "sizeStock") {
      setSizeStockOpen(true);
    } else if (action.dialogKey === "quickStock") {
      setQuickStockOpen(true);
    } else {
      orgNavigate(action.path);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border backdrop-blur-md bg-card/95 text-foreground shadow-sm">
      <div className="flex h-14 items-center justify-between px-4 max-w-full">
        {/* Left Side - Logo and Mobile Menu */}
        <div className="flex items-center gap-2">
          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted hover:text-primary">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] bg-card text-foreground border-border">
              <nav className="flex flex-col gap-4 mt-8">
                {quickActions.map((action) => (
                  <Button
                    key={action.label}
                    variant="ghost"
                    className="justify-start text-foreground hover:bg-muted hover:text-primary"
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
            <div className="bg-primary p-1 rounded">
              <Package className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="hidden sm:block text-sm font-semibold text-foreground">
              Ezzy ERP
            </span>
          </button>
        </div>

        {/* Quick Actions - Desktop */}
        <div className="hidden lg:flex items-center gap-0.5">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              variant="ghost"
              size="sm"
              onClick={() => handleQuickAction(action)}
              className={cn(
                "h-8 gap-1.5 text-foreground hover:bg-muted hover:text-primary",
                action.isDialog && "text-primary font-medium"
              )}
              title={action.shortcut || action.label}
            >
              <action.icon className="h-4 w-4" />
              <span className="text-xs">{action.label}</span>
            </Button>
          ))}
        </div>

        {/* Right Side - Compact icons */}
        <div className="flex items-center gap-1">
          {/* Search */}
          <Button variant="ghost" size="icon" className="hidden md:flex h-8 w-8 text-foreground hover:bg-muted hover:text-primary">
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
                  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                  if (isIOS) {
                    toast.info("Tap the Share button, then 'Add to Home Screen'");
                  } else {
                    toast.info("Click the app icon (🔲) in the address bar, or go to Settings → Apps → Install this site as an app");
                  }
                }
              }}
              className="relative text-primary border-primary/30 hover:bg-muted hover:text-primary gap-1"
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
          <Button variant="ghost" size="icon" className="relative h-8 w-8 text-foreground hover:bg-muted hover:text-primary">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-primary rounded-full" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-sidebar-accent h-8 w-8">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-medium">
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
