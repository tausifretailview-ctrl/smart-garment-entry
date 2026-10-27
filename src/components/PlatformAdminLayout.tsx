import { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Shield, LayoutDashboard, Database, Store, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getStoredOrgSlug } from "@/lib/orgSlug";
import { cn } from "@/lib/utils";

interface PlatformAdminLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: "/platform-admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/platform-admin/data-integrity", label: "Data Integrity", icon: Database, end: false },
];

/**
 * Admin-only shell for /platform-admin pages: no shop menu bar, quick buttons,
 * window tabs, sidebar or shop notifiers — just platform admin navigation.
 */
export const PlatformAdminLayout = ({ children }: PlatformAdminLayoutProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const shopSlug = getStoredOrgSlug();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth?platform=1");
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-4 py-2 shadow-sm sm:px-6">
        <Link to="/platform-admin" className="flex items-center gap-2 font-bold text-foreground">
          <Shield className="h-5 w-5 text-primary" />
          <span>Ezzy ERP</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Platform Admin</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {shopSlug && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/${shopSlug}`}>
                <Store className="mr-1.5 h-4 w-4" />
                Open shop
              </Link>
            </Button>
          )}
          {user?.email && (
            <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground md:inline">{user.email}</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
            <LogOut className="mr-1.5 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
};
