import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  Barcode,
  TrendingUp,
  Users,
  Store,
  DollarSign,
  Settings,
  LogOut,
  Menu,
  UserCircle,
  CreditCard,
  Receipt,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRoles } from "@/hooks/useUserRoles";

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "manager", "user"] },
  { title: "Product Dashboard", url: "/products", icon: Package, roles: ["admin", "manager", "user"] },
  { title: "Inventory", url: "/stock-report", icon: Package, roles: ["admin", "manager", "user"] },
  { title: "POS Sales", url: "/pos-sales", icon: CreditCard, roles: ["admin", "manager", "user"] },
  { title: "Sales Invoice", url: "/sales-invoice", icon: Receipt, roles: ["admin", "manager", "user"] },
  { title: "Purchase", url: "/purchase-entry", icon: ShoppingCart, roles: ["admin", "manager"] },
  { title: "Purchase Bills", url: "/purchase-bills", icon: FileText, roles: ["admin", "manager"] },
  { title: "Product Entry", url: "/product-entry", icon: Package, roles: ["admin", "manager", "user"] },
  { title: "Barcode Printing", url: "/barcode-printing", icon: Barcode, roles: ["admin", "manager", "user"] },
  { title: "Profile", url: "/profile", icon: UserCircle, roles: ["admin", "manager", "user"] },
  { title: "Settings", url: "/settings", icon: Settings, roles: ["admin"] },
];

const AppSidebar = () => {
  const { state } = useSidebar();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { roles } = useUserRoles();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const isCollapsed = state === "collapsed";
  
  const filteredMenuItems = menuItems.filter(item => 
    item.roles.some(role => roles.includes(role as any))
  );

  return (
    <Sidebar className={isCollapsed ? "w-14" : "w-60"} collapsible="icon">
      <SidebarContent className="bg-sidebar-background">
        <div className="p-4 border-b border-sidebar-border">
          {!isCollapsed && (
            <h2 className="text-lg font-bold text-sidebar-foreground">
              Smart Inventory
            </h2>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-auto p-4 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" />
            {!isCollapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
};

const MetricCard = ({
  title,
  value,
  icon: Icon,
  bgColor,
}: {
  title: string;
  value: string | number;
  icon: any;
  bgColor: string;
}) => (
  <Card className={bgColor}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

const DashboardContent = () => {
  // Fetch total stock quantity
  const { data: stockData } = useQuery({
    queryKey: ["total-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("stock_qty");
      if (error) throw error;
      return data?.reduce((sum, item) => sum + (item.stock_qty || 0), 0) || 0;
    },
  });

  // Fetch total products
  const { data: productsCount } = useQuery({
    queryKey: ["products-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch total purchase amount
  const { data: purchaseTotal } = useQuery({
    queryKey: ["purchase-total"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("net_amount");
      if (error) throw error;
      return data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
    },
  });

  // Fetch stock value
  const { data: stockValue } = useQuery({
    queryKey: ["stock-value"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("stock_qty, sale_price");
      if (error) throw error;
      return (
        data?.reduce(
          (sum, item) =>
            sum + (item.stock_qty || 0) * (Number(item.sale_price) || 0),
          0
        ) || 0
      );
    },
  });

  // Fetch total purchase bills count
  const { data: billsCount } = useQuery({
    queryKey: ["bills-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("purchase_bills")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to Smart Inventory Management System
          </p>
        </div>
      </div>

      {/* Sales Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Sales"
          value="₹0"
          icon={DollarSign}
          bgColor="bg-cyan-50"
        />
        <MetricCard
          title="Total Invoice"
          value="0"
          icon={FileText}
          bgColor="bg-blue-50"
        />
        <MetricCard
          title="Sold Qty"
          value="0"
          icon={ShoppingCart}
          bgColor="bg-cyan-50"
        />
        <MetricCard
          title="Total Customers"
          value="0"
          icon={Users}
          bgColor="bg-cyan-50"
        />
      </div>

      {/* Purchase Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Purchase"
          value={formatCurrency(purchaseTotal || 0)}
          icon={ShoppingCart}
          bgColor="bg-blue-50"
        />
        <MetricCard
          title="Total Bills"
          value={billsCount || 0}
          icon={FileText}
          bgColor="bg-blue-50"
        />
        <MetricCard
          title="Purchase Qty"
          value="0"
          icon={Package}
          bgColor="bg-blue-50"
        />
        <MetricCard
          title="Total Suppliers"
          value="0"
          icon={Store}
          bgColor="bg-blue-50"
        />
      </div>

      {/* Inventory & Financial Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Total Products"
          value={productsCount || 0}
          icon={Package}
          bgColor="bg-purple-50"
        />
        <MetricCard
          title="Stock Qty"
          value={stockData || 0}
          icon={Package}
          bgColor="bg-purple-50"
        />
        <MetricCard
          title="Stock Value"
          value={formatCurrency(stockValue || 0)}
          icon={DollarSign}
          bgColor="bg-purple-50"
        />
      </div>

      {/* Profit & Financial Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Gross Profit"
          value="₹0"
          icon={TrendingUp}
          bgColor="bg-pink-50"
        />
        <MetricCard
          title="Avg. Profit Margin"
          value="₹0"
          icon={TrendingUp}
          bgColor="bg-pink-50"
        />
        <MetricCard
          title="Cash in Hand"
          value="₹0"
          icon={DollarSign}
          bgColor="bg-purple-50"
        />
      </div>
    </div>
  );
};

const Index = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4">
            <SidebarTrigger>
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
          </div>
          <DashboardContent />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
