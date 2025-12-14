import { Outlet, useLocation, Navigate } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Home, Users, ShoppingCart, ListOrdered, LogOut, Download, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useFieldSalesAccess } from "@/hooks/useFieldSalesAccess";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SalesmanLayout = () => {
  const { getOrgPath } = useOrgNavigation();
  const location = useLocation();
  const { signOut } = useAuth();
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const { hasAccess, employeeName, isLoading } = useFieldSalesAccess();

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
      toast.info("App is already installed!");
      return;
    }
    
    if (isInstallable) {
      const installed = await promptInstall();
      if (installed) {
        toast.success("App installed successfully!");
      }
    } else {
      // Show manual installation instructions
      toast.info(
        "To install: Open browser menu → 'Add to Home Screen' or 'Install App'",
        { duration: 5000 }
      );
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Checking access...</p>
        </div>
      </div>
    );
  }

  // Show access denied if user doesn't have field sales access
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-xl">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You don't have access to the Field Sales app. Please contact your administrator to enable Field Sales access for your employee account.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => signOut()}>
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
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" />
          <div>
            <span className="font-semibold text-lg">Field Sales</span>
            {employeeName && (
              <p className="text-xs text-primary-foreground/70">{employeeName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isInstalled && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleInstall}
              className="text-primary-foreground hover:bg-primary-foreground/20"
              title="Install App"
            >
              <Download className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut()}
            className="text-primary-foreground hover:bg-primary-foreground/20"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
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
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-6 w-6", active && "fill-primary/20")} />
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
