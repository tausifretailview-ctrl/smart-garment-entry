import { ReactNode } from "react";
import { Menu, Home, Package, ShoppingCart, FileText, Settings, LogOut, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useNavigate } from "react-router-dom";

interface POSLayoutProps {
  children: ReactNode;
}

export const POSLayout = ({ children }: POSLayoutProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const { orgNavigate, orgSlug } = useOrgNavigation();

  const handleSignOut = async () => {
    const slug = currentOrganization?.slug || orgSlug;
    await signOut();
    if (slug) {
      navigate(`/${slug}`);
    } else {
      navigate("/auth");
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      {/* Top Header Bar */}
      <header className="h-12 bg-primary text-primary-foreground flex items-center justify-between px-4 shadow-md z-50">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary/80">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 bg-popover z-50">
              <DropdownMenuItem onClick={() => orgNavigate("/")}>
                <Home className="mr-2 h-4 w-4" />
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => orgNavigate("/pos-dashboard")}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                POS Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => orgNavigate("/products")}>
                <Package className="mr-2 h-4 w-4" />
                Products
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => orgNavigate("/sales-invoice-dashboard")}>
                <FileText className="mr-2 h-4 w-4" />
                Sales Dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => orgNavigate("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            <span className="font-semibold text-sm md:text-base truncate max-w-[200px]">
              {currentOrganization?.name || "POS"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs md:text-sm opacity-90">Point of Sale</span>
        </div>
      </header>
      
      <main className="flex-1 animate-fade-in p-4">{children}</main>
    </div>
  );
};
