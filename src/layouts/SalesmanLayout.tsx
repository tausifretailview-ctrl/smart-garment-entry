import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Home, Users, ShoppingCart, ListOrdered, LogOut, Download, AlertCircle, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useFieldSalesAccess } from "@/hooks/useFieldSalesAccess";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SizeStockDialog } from "@/components/SizeStockDialog";

const LOADING_TIMEOUT = 8000; // 8 seconds max wait

const SalesmanLayout = () => {
  const { getOrgPath } = useOrgNavigation();
  const location = useLocation();
  const { signOut } = useAuth();
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const { hasAccess, employeeName, isLoading } = useFieldSalesAccess();
  const { isOnline, pendingActions, isSyncing } = useOfflineSync();
  const [sizeStockOpen, setSizeStockOpen] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  // Safety timeout to prevent infinite loading on slow mobile data
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      console.warn("Field Sales: Loading timed out after", LOADING_TIMEOUT, "ms");
      setLoadingTimedOut(true);
    }, LOADING_TIMEOUT);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Dynamic manifest and theme for Field Sales PWA
  useEffect(() => {
    // Update manifest link for Field Sales
    const manifestLink = document.querySelector('link[rel="manifest"]');
    const originalManifest = manifestLink?.getAttribute('href');
    if (manifestLink) {
      manifestLink.setAttribute('href', '/manifest-field-sales.webmanifest');
    }

    // Update theme-color meta tag to orange
    const themeColor = document.querySelector('meta[name="theme-color"]');
    const originalThemeColor = themeColor?.getAttribute('content');
    if (themeColor) {
      themeColor.setAttribute('content', '#F97316');
    }

    // Update apple-mobile-web-app-title
    let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!appleTitle) {
      appleTitle = document.createElement('meta');
      appleTitle.setAttribute('name', 'apple-mobile-web-app-title');
      document.head.appendChild(appleTitle);
    }
    appleTitle.setAttribute('content', 'Field Sales');

    return () => {
      // Restore original values when leaving Field Sales
      if (manifestLink && originalManifest) {
        manifestLink.setAttribute('href', originalManifest);
      }
      if (themeColor && originalThemeColor) {
        themeColor.setAttribute('content', originalThemeColor);
      }
      if (appleTitle) {
        appleTitle.setAttribute('content', 'EzzyERP');
      }
    };
  }, []);

  const navItems = [
    { icon: Home, label: "Home", path: "/salesman" },
    { icon: Users, label: "Customers", path: "/salesman/customers" },
    { icon: ShoppingCart, label: "New Order", path: "/salesman/order/new" },
    { icon: ListOrdered, label: "My Orders", path: "/salesman/orders" },
  ];

  const isActive = (path: string) => {
    const fullPath = getOrgPath(path);
    return location.pathname === fullPath || location.pathname.startsWith(fullPath + "/");
  };

  const handleInstall = async () => {
    if (isInstalled) {
      toast.info("Field Sales app is already installed!");
      return;
    }
    
    if (isInstallable) {
      const installed = await promptInstall();
      if (installed) {
        toast.success("Field Sales app installed successfully!");
      }
    } else {
      // Show manual installation instructions
      toast.info(
        "To install Field Sales: Open browser menu → 'Add to Home Screen'",
        { duration: 5000 }
      );
    }
  };

  // Show loading state with orange spinner (with timeout fallback)
  if (isLoading && !loadingTimedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Checking access...</p>
          {!isOnline && (
            <p className="mt-2 text-xs text-amber-500">You appear to be offline...</p>
          )}
        </div>
      </div>
    );
  }

  // If loading timed out, show retry option instead of infinite spinner
  if (isLoading && loadingTimedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-orange-500/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-orange-500" />
            </div>
            <CardTitle className="text-lg">Slow Connection</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Unable to verify access. Please check your internet connection and try again.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => window.location.reload()}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                Retry
              </Button>
              <Button variant="outline" onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show access denied if user doesn't have field sales access
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-orange-500/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-orange-500" />
            </div>
            <CardTitle className="text-xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You don't have access to the Field Sales app. Please contact your administrator to enable Field Sales access for your employee account.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => signOut()} className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
              <Button variant="ghost" onClick={() => window.history.back()}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Offline Status Banner */}
      {(!isOnline || pendingActions > 0) && (
        <div className={cn(
          "flex items-center justify-center gap-2 py-1.5 px-4 text-sm font-medium text-white",
          !isOnline ? "bg-amber-500" : isSyncing ? "bg-blue-500" : "bg-orange-500"
        )}>
          {!isOnline ? (
            <>
              <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
              <span>Offline Mode{pendingActions > 0 ? ` • ${pendingActions} pending` : ""}</span>
            </>
          ) : isSyncing ? (
            <>
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Syncing {pendingActions} action{pendingActions !== 1 ? "s" : ""}...</span>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-white" />
              <span>{pendingActions} pending sync</span>
            </>
          )}
        </div>
      )}
      
      {/* Header - Orange gradient theme */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" />
          <div>
            <span className="font-semibold text-lg">Field Sales</span>
            {employeeName && (
              <p className="text-xs text-white/80">{employeeName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSizeStockOpen(true)}
            className="text-white hover:bg-white/20"
            title="Size Stock"
          >
            <Package className="h-5 w-5" />
          </Button>
          {!isInstalled && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleInstall}
              className="text-white hover:bg-white/20"
              title="Install App"
            >
              <Download className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut()}
            className="text-white hover:bg-white/20"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Size Stock Dialog */}
      <SizeStockDialog open={sizeStockOpen} onOpenChange={setSizeStockOpen} />

      {/* Main Content */}
      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom Navigation - Orange active state */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <a
                key={item.path}
                href={getOrgPath(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full transition-colors",
                  active
                    ? "text-orange-500"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-6 w-6", active && "fill-orange-500/20")} />
                <span className="text-xs mt-1 font-medium">{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default SalesmanLayout;
