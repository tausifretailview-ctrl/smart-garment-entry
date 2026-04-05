import { Bell, Menu, Search, ShoppingCart, Package, TrendingUp, Download, LayoutGrid, BoxIcon, ChevronDown, Plus } from "lucide-react";
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
    <>
      {/* ROW 1: Title bar */}
      <div className="sticky top-0 z-50 flex h-9 items-center px-3 gap-3 bg-sidebar border-b border-sidebar-border/50 text-sidebar-foreground">
        {/* Mobile menu trigger */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground/70">
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
        <button onClick={() => orgNavigate("/")} className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 bg-primary rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-[11px]">E</span>
          </div>
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="text-sm font-bold text-sidebar-foreground">EzzyERP</span>
            <span className="text-sidebar-foreground/30 text-sm">—</span>
            <span className="text-xs text-sidebar-foreground/50 hidden md:block">Smart Inventory & Billing</span>
          </span>
        </button>

        {/* Classic menu bar — desktop only */}
        <nav className="hidden lg:flex items-center gap-0 ml-1">
          {["File", "View", "Tools", "Reports", "Help"].map((m) => (
            <span key={m} className="text-[12px] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent px-2.5 py-1 rounded cursor-pointer transition-colors underline-offset-2 hover:underline decoration-sidebar-foreground/30">
              {m}
            </span>
          ))}
        </nav>

        {/* Search bar — grows to fill space */}
        <div className="hidden md:flex flex-1 max-w-xs mx-auto">
          <div className="flex items-center w-full h-7 bg-sidebar-accent/60 border border-sidebar-border/60 rounded px-2.5 gap-2 cursor-pointer hover:border-sidebar-foreground/30 transition-colors">
            <Search className="h-3.5 w-3.5 text-sidebar-foreground/40 flex-shrink-0" />
            <span className="text-[12px] text-sidebar-foreground/35 flex-1">Search... (Ctrl+K)</span>
            <ChevronDown className="h-3 w-3 text-sidebar-foreground/30 flex-shrink-0" />
          </div>
        </div>

        <div className="flex-1 hidden md:block" />

        {/* Right icons */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent hidden md:flex">
            <Bell className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent hidden md:flex">
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-sidebar-accent h-7 w-7">
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer text-sm">Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ROW 2: Action toolbar */}
      <div className="sticky top-9 z-50 hidden lg:flex h-10 items-center px-3 gap-2 bg-sidebar/95 border-b border-sidebar-border text-sidebar-foreground">
        {/* Split button: New Sale */}
        <div className="flex items-center">
          <Button
            onClick={() => orgNavigate("/pos-sales")}
            className="h-7 px-3 text-xs font-semibold bg-primary hover:bg-primary/90 text-white rounded-r-none border-r border-primary-foreground/20 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New Sale
          </Button>
          <Button className="h-7 px-1.5 bg-primary hover:bg-primary/90 text-white rounded-l-none">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Outlined action buttons */}
        {[
          { label: "Purchase", icon: ShoppingCart, path: "/purchase-entry", chevron: false },
          { label: "Stock",    icon: Package,      path: "/stock-report",   chevron: true  },
          { label: "Cashier",  icon: TrendingUp,   path: "/daily-cashier-report", chevron: false },
        ].map((btn) => (
          <div key={btn.label} className="flex items-center">
            <Button
              onClick={() => orgNavigate(btn.path)}
              variant="outline"
              className={cn(
                "h-7 px-2.5 text-xs font-medium text-sidebar-foreground bg-sidebar-accent/40 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground gap-1.5",
                btn.chevron ? "rounded-r-none" : ""
              )}
            >
              <btn.icon className="h-3.5 w-3.5" />
              {btn.label}
            </Button>
            {btn.chevron && (
              <Button variant="outline" className="h-7 px-1 text-sidebar-foreground bg-sidebar-accent/40 border-l-0 border-sidebar-border hover:bg-sidebar-accent rounded-l-none">
                <ChevronDown className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}

        <div className="flex-1" />

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 text-sidebar-foreground/60">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-emerald-400">Live</span>
          <span className="text-xs text-sidebar-foreground/40">· {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
        </div>

        <div className="w-px h-4 bg-sidebar-border mx-1" />

        {/* Date range selector */}
        <Button variant="outline" className="h-7 px-2.5 text-xs font-medium text-sidebar-foreground bg-sidebar-accent/40 border-sidebar-border hover:bg-sidebar-accent gap-1.5">
          <span>📅</span>
          Monthly
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>

      {/* Dialogs */}
      <SizeStockDialog open={sizeStockOpen} onOpenChange={setSizeStockOpen} />
      <FloatingStockReport open={quickStockOpen} onOpenChange={setQuickStockOpen} />
    </>
  );
};
