import { Outlet, useLocation } from "react-router-dom";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Home, Users, ShoppingCart, ListOrdered, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const SalesmanLayout = () => {
  const { getOrgPath } = useOrgNavigation();
  const location = useLocation();
  const { signOut } = useAuth();

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" />
          <span className="font-semibold text-lg">Field Sales</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut()}
          className="text-primary-foreground hover:bg-primary-foreground/20"
        >
          <LogOut className="h-5 w-5" />
        </Button>
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
