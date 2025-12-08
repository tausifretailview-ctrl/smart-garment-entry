import { Bell, Menu, Search, ShoppingCart, Package, TrendingUp, Download } from "lucide-react";
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
  const { isInstallable, promptInstall } = useInstallPrompt();

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
    { icon: TrendingUp, label: "Reports", path: "/stock-report" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-primary/10 hover:text-primary">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] bg-sidebar text-sidebar-foreground border-sidebar-border">
              <nav className="flex flex-col gap-4 mt-8">
                {quickActions.map((action) => (
                  <Button
                    key={action.path}
                    variant="ghost"
                    className="justify-start text-sidebar-foreground hover:bg-primary/10 hover:text-primary"
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

          <button
            onClick={() => orgNavigate("/")}
            className="flex items-center gap-2 group"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary rounded-lg blur-md opacity-60 group-hover:opacity-80 transition-opacity" />
              <div className="relative bg-primary p-2 rounded-lg shadow-lg">
                <Package className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="font-display text-lg font-bold text-primary leading-tight">
                Smart Inventory
              </span>
              <span className="text-[10px] text-muted-foreground -mt-0.5">Business Management</span>
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
              className="text-sidebar-foreground hover:bg-primary/10 hover:text-primary transition-all"
            >
              <action.icon className="h-4 w-4 mr-2 text-primary" />
              {action.label}
            </Button>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <Button variant="ghost" size="icon" className="hidden md:flex text-sidebar-foreground hover:bg-primary/10 hover:text-primary">
            <Search className="h-5 w-5" />
          </Button>

          {/* Install App Button */}
          {isInstallable && (
            <Button
              variant="ghost"
              size="icon"
              onClick={promptInstall}
              className="relative text-sidebar-foreground hover:bg-primary/10 hover:text-primary"
              title="Install App"
            >
              <Download className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse" />
            </Button>
          )}

          {/* Organization Context Display */}
          {orgSlug && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg border border-primary/20">
              <span className="text-xs text-muted-foreground">Org:</span>
              <span className="text-sm font-medium text-primary">{orgSlug}</span>
            </div>
          )}

          {/* Organization Selector */}
          <OrganizationSelector />

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative text-sidebar-foreground hover:bg-primary/10 hover:text-primary">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full animate-pulse" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 ring-2 ring-transparent hover:ring-primary/30 transition-all">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
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
