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
import { useState } from "react";

export const Header = () => {
  const { user, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const { orgNavigate, getOrgPath, orgSlug } = useOrgNavigation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();

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
    { icon: ShoppingCart, label: "New Sale", path: "/pos-sales" },
    { icon: Package, label: "New Purchase", path: "/purchase-entry" },
    { icon: Grid3X3, label: "Size Stock", path: "/stock-report?tab=sizewise", shortcut: "Ctrl+G" },
    { icon: TrendingUp, label: "Reports", path: "/stock-report" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-sidebar-border bg-sidebar text-sidebar-foreground dark:bg-[hsl(213,32%,17%)] dark:text-white dark:border-[hsl(213,32%,25%)]">
      <div className="container flex h-10 items-center justify-between px-3">
        {/* Left Side - Logo and Mobile Menu */}
        <div className="flex items-center gap-2">
          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className="text-sidebar-foreground dark:text-white hover:bg-primary/10 hover:text-primary">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] bg-sidebar text-sidebar-foreground dark:bg-[hsl(213,32%,17%)] dark:text-white border-sidebar-border">
              <nav className="flex flex-col gap-4 mt-8">
                {quickActions.map((action) => (
                  <Button
                    key={action.path}
                    variant="ghost"
                    className="justify-start text-sidebar-foreground dark:text-white hover:bg-primary/10 hover:text-primary"
                    onClick={() => {
                      orgNavigate(action.path);
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

          {/* Logo */}
          <button
            onClick={() => orgNavigate("/")}
            className="flex items-center gap-2 group"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary rounded blur-sm opacity-60 group-hover:opacity-80 transition-opacity" />
              <div className="relative bg-primary p-1.5 rounded shadow-lg">
                <Package className="h-4 w-4 text-primary-foreground" />
              </div>
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="font-display text-sm font-bold text-primary dark:text-[hsl(187,100%,42%)] leading-tight">
                Smart Inventory
              </span>
            </div>
          </button>
        </div>

        {/* Quick Actions - Desktop */}
        <div className="hidden lg:flex items-center gap-1">
          {quickActions.map((action) => (
            <Button
              key={action.path}
              variant="ghost"
              size="sm"
              onClick={() => orgNavigate(action.path)}
              className="text-sidebar-foreground dark:text-white hover:bg-primary/10 hover:text-primary transition-all"
            >
              <action.icon className="h-4 w-4 mr-2 text-primary dark:text-[hsl(187,100%,42%)]" />
              {action.label}
            </Button>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <Button variant="ghost" size="icon" className="hidden md:flex text-sidebar-foreground dark:text-white hover:bg-primary/10 hover:text-primary">
            <Search className="h-5 w-5" />
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
              className="relative text-primary border-primary/30 hover:bg-primary/10 hover:text-primary gap-1"
              title="Install App"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Install App</span>
              {isInstallable && (
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse" />
              )}
            </Button>
          )}

          {/* Organization Selector */}
          <OrganizationSelector />

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative text-sidebar-foreground dark:text-white hover:bg-primary/10 hover:text-primary">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full animate-pulse" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 ring-2 ring-transparent hover:ring-primary/30 transition-all h-7 w-7">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold">
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
              <DropdownMenuItem onClick={() => orgNavigate("/profile")} className="cursor-pointer hover:bg-primary/10 hover:text-primary">
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => orgNavigate("/settings")} className="cursor-pointer hover:bg-primary/10 hover:text-primary">
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
    </header>
  );
};
