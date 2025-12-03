import { Bell, Menu, Search, ShoppingCart, Package, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { useAuth } from "@/contexts/AuthContext";
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
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent/20">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] bg-sidebar text-sidebar-foreground border-sidebar-border">
              <nav className="flex flex-col gap-4 mt-8">
                {quickActions.map((action) => (
                  <Button
                    key={action.path}
                    variant="ghost"
                    className="justify-start text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-primary"
                    onClick={() => {
                      navigate(action.path);
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
            onClick={() => navigate("/")}
            className="flex items-center gap-2 group"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-sidebar-primary rounded-lg blur-md opacity-50 group-hover:opacity-75 transition-opacity" />
              <div className="relative bg-sidebar-primary p-2 rounded-lg">
                <Package className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
            </div>
            <span className="font-display text-lg font-bold text-sidebar-primary hidden sm:block">
              Smart Inventory
            </span>
          </button>
        </div>

        {/* Quick Actions - Desktop */}
        <div className="hidden lg:flex items-center gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.path}
              variant="ghost"
              size="sm"
              onClick={() => navigate(action.path)}
              className="text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-primary"
            >
              <action.icon className="h-4 w-4 mr-2" />
              {action.label}
            </Button>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <Button variant="ghost" size="icon" className="hidden md:flex text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-primary">
            <Search className="h-5 w-5" />
          </Button>

          {/* Organization Selector */}
          <OrganizationSelector />

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative text-sidebar-foreground hover:bg-sidebar-accent/20 hover:text-sidebar-primary">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-destructive rounded-full animate-pulse" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-sidebar-accent/20">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
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
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                App Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
