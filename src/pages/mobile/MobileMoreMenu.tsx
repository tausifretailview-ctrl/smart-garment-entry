import { 
  Users, 
  Building2, 
  ShoppingBag, 
  RotateCcw, 
  Undo2,
  BarChart3, 
  FileText, 
  Receipt, 
  TrendingUp,
  Settings, 
  User, 
  HelpCircle, 
  LogOut,
  ChevronRight,
  Package,
  Wallet,
  FileSpreadsheet
} from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path?: string;
  action?: () => void;
  color?: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

export default function MobileMoreMenu() {
  const { orgNavigate } = useOrgNavigation();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  const menuSections: MenuSection[] = [
    {
      title: "Transactions",
      items: [
        { icon: Users, label: "Customers", path: "/customers", color: "text-purple-500" },
        { icon: Building2, label: "Suppliers", path: "/suppliers", color: "text-orange-500" },
        { icon: ShoppingBag, label: "Purchase Entry", path: "/purchase-entry", color: "text-amber-500" },
        { icon: RotateCcw, label: "Purchase Return", path: "/purchase-return-entry", color: "text-rose-500" },
        { icon: Undo2, label: "Sale Return", path: "/sale-return-entry", color: "text-red-500" },
        { icon: Wallet, label: "Payments", path: "/payments-dashboard", color: "text-blue-500" },
      ],
    },
    {
      title: "Inventory",
      items: [
        { icon: Package, label: "Products", path: "/products", color: "text-amber-500" },
        { icon: BarChart3, label: "Stock Report", path: "/stock-report", color: "text-green-500" },
        { icon: FileText, label: "Stock Adjustment", path: "/stock-adjustment", color: "text-blue-500" },
        { icon: FileSpreadsheet, label: "Barcode Printing", path: "/barcode-printing", color: "text-purple-500" },
      ],
    },
    {
      title: "Settings",
      items: [
        { icon: Settings, label: "App Settings", path: "/settings", color: "text-slate-500" },
        { icon: User, label: "Profile", path: "/profile", color: "text-blue-500" },
        { icon: HelpCircle, label: "Help & Support", path: "/settings", color: "text-teal-500" },
        { icon: LogOut, label: "Sign Out", action: handleSignOut, color: "text-red-500" },
      ],
    },
  ];

  const handleItemClick = (item: MenuItem) => {
    if (item.action) {
      item.action();
    } else if (item.path) {
      orgNavigate(item.path);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <h1 className="text-xl font-semibold text-foreground">More Options</h1>
      </div>

      {/* Menu Sections */}
      <div className="px-4 py-4 space-y-6">
        {menuSections.map((section, sectionIndex) => (
          <div key={section.title}>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
              {section.title}
            </h2>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {section.items.map((item, itemIndex) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label}>
                      <button
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-3.5",
                          "active:bg-muted/50 transition-colors duration-100",
                          "touch-manipulation"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center",
                            "bg-muted/50"
                          )}>
                            <Icon className={cn("h-5 w-5", item.color || "text-foreground")} />
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {item.label}
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                      {itemIndex < section.items.length - 1 && (
                        <Separator className="ml-16" />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* App Version */}
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">Ezzy ERP v2.0</p>
        <p className="text-xs text-muted-foreground mt-1">Made with ❤️ in India</p>
      </div>
    </div>
  );
}
