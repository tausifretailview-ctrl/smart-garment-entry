import {
  LayoutDashboard,
  Users,
  Truck,
  UserCircle,
  Package,
  ShoppingCart,
  FileText,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Settings,
  User,
  Building2,
  Barcode,
  ChevronDown,
  ShoppingBag,
  Wallet,
  Shield,
  Plus,
  PackageCheck,
  DollarSign,
  FileSpreadsheet,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function AppSidebar() {
  const { open } = useSidebar();
  const location = useLocation();
  const { canAccessSettings, canAccessPurchases, isPlatformAdmin } = useUserRoles();

  const isActive = (path: string) => location.pathname === path;
  const isGroupActive = (paths: string[]) => paths.some(path => location.pathname === path);

  // Menu structure
  const masterPaths = ["/customers", "/suppliers", "/employees"];
  const inventoryPaths = ["/purchase-bills", "/purchase-returns", "/purchase-entry", "/product-entry", "/products"];
  const salesPaths = ["/quotation-entry", "/quotation-dashboard", "/sale-order-entry", "/sale-order-dashboard", "/pos-sales", "/pos-dashboard", "/sales-invoice", "/sales-invoice-dashboard", "/sale-return-entry", "/sale-returns"];
  const reportsPaths = ["/stock-report", "/sales-report", "/purchase-report", "/product-tracking", "/daily-cashier-report", "/item-wise-sales", "/price-history", "/gst-register"];
  const accountsPaths = ["/accounts", "/payments-dashboard"];
  const settingsPaths = ["/profile", "/settings", "/organization-management", "/barcode-printing"];

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="font-sans text-[15px]">
        {/* Platform Admin - Only visible to platform admins */}
        {isPlatformAdmin && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/platform-admin")}>
                  <NavLink to="/platform-admin" className="flex items-center gap-3 group">
                    <Shield className="h-5 w-5 text-primary sidebar-icon group-hover:animate-icon-pulse" />
                    {open && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Platform Admin</span>
                        <span className="text-xs bg-gradient-to-r from-primary to-secondary text-white px-2.5 py-0.5 rounded-full font-medium shadow-sm">Super</span>
                      </div>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Dashboard */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/")}>
                <NavLink to="/" className="flex items-center gap-3 group">
                  <LayoutDashboard className="h-5 w-5 sidebar-icon" />
                  {open && <span className="font-medium">Dashboard</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Master */}
        {canAccessPurchases && (
          <SidebarGroup>
            <Collapsible defaultOpen={isGroupActive(masterPaths)} className="group/collapsible">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 sidebar-icon" />
                    {open && <span className="font-semibold">Master</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/customers")}>
                            <NavLink to="/customers" className="flex items-center gap-3 group">
                              <UserCircle className="h-4 w-4 sidebar-icon" />
                              <span>Customer</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/suppliers")}>
                            <NavLink to="/suppliers" className="flex items-center gap-3 group">
                              <Truck className="h-4 w-4 sidebar-icon" />
                              <span>Supplier</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/employees")}>
                            <NavLink to="/employees" className="flex items-center gap-3 group">
                              <Users className="h-4 w-4 sidebar-icon" />
                              <span>Employee Master</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}

        {/* Inventory */}
        <SidebarGroup>
          <Collapsible defaultOpen={isGroupActive(inventoryPaths)} className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2 transition-all duration-200 group">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 sidebar-icon" />
                  {open && <span className="font-semibold">Inventory</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary" />}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      {canAccessPurchases && (
                        <>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-bills")}>
                              <NavLink to="/purchase-bills" className="flex items-center gap-3 group">
                                <FileText className="h-4 w-4 sidebar-icon" />
                                <span>Purchase Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-returns")}>
                              <NavLink to="/purchase-returns" className="flex items-center gap-3 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon" />
                                <span>Purchase Returns</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/purchase-return-entry")}>
                            <NavLink to="/purchase-return-entry" className="flex items-center gap-3 group">
                              <Plus className="h-4 w-4 sidebar-icon" />
                              <span>Purchase Return</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-entry")}>
                              <NavLink to="/purchase-entry" className="flex items-center gap-3 group">
                                <ShoppingBag className="h-4 w-4 sidebar-icon" />
                                <span>Purchase Bill</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </>
                      )}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/product-entry")}>
                          <NavLink to="/product-entry" className="flex items-center gap-3 group">
                            <Package className="h-4 w-4 sidebar-icon" />
                            <span>Product Entry</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/products")}>
                          <NavLink to="/products" className="flex items-center gap-3 group">
                            <Package className="h-4 w-4 sidebar-icon" />
                            <span>Product Dashboard</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Sales */}
        <SidebarGroup>
          <Collapsible defaultOpen={isGroupActive(salesPaths)} className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2 transition-all duration-200 group">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 sidebar-icon" />
                  {open && <span className="font-semibold">Sales</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary" />}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/quotation-entry")}>
                          <NavLink to="/quotation-entry" className="flex items-center gap-3 group">
                            <FileText className="h-4 w-4 sidebar-icon" />
                            <span>Quotation Entry</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/quotation-dashboard")}>
                          <NavLink to="/quotation-dashboard" className="flex items-center gap-3 group">
                            <BarChart3 className="h-4 w-4 sidebar-icon" />
                            <span>Quotation Dashboard</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/sale-order-entry")}>
                          <NavLink to="/sale-order-entry" className="flex items-center gap-3 group">
                            <PackageCheck className="h-4 w-4 sidebar-icon" />
                            <span>Sale Order Entry</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/sale-order-dashboard")}>
                          <NavLink to="/sale-order-dashboard" className="flex items-center gap-3 group">
                            <BarChart3 className="h-4 w-4 sidebar-icon" />
                            <span>Sale Order Dashboard</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/pos-sales")}>
                          <NavLink to="/pos-sales" className="flex items-center gap-3 group">
                            <ShoppingCart className="h-4 w-4 sidebar-icon" />
                            <span>POS</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/pos-dashboard")}>
                          <NavLink to="/pos-dashboard" className="flex items-center gap-3 group">
                            <ShoppingBag className="h-4 w-4 sidebar-icon" />
                            <span>POS Dashboard</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/sales-invoice")}>
                          <NavLink to="/sales-invoice" className="flex items-center gap-3 group">
                            <FileText className="h-4 w-4 sidebar-icon" />
                            <span>Sales Bill</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/sales-invoice-dashboard")}>
                          <NavLink to="/sales-invoice-dashboard" className="flex items-center gap-3 group">
                            <BarChart3 className="h-4 w-4 sidebar-icon" />
                            <span>Invoice Dashboard</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/sale-return-entry")}>
                          <NavLink to="/sale-return-entry" className="flex items-center gap-3 group">
                            <TrendingDown className="h-4 w-4 sidebar-icon" />
                            <span>Sale Return</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/sale-returns")}>
                          <NavLink to="/sale-returns" className="flex items-center gap-3 group">
                            <BarChart3 className="h-4 w-4 sidebar-icon" />
                            <span>Return Dashboard</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Reports */}
        <SidebarGroup>
          <Collapsible defaultOpen={isGroupActive(reportsPaths)} className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2 transition-all duration-200 group">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 sidebar-icon" />
                  {open && <span className="font-semibold">Reports</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary" />}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/stock-report")}>
                          <NavLink to="/stock-report" className="flex items-center gap-3 group">
                            <Package className="h-4 w-4 sidebar-icon" />
                            <span>Stock Report</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/sales-report")}>
                          <NavLink to="/sales-report" className="flex items-center gap-3 group">
                            <TrendingUp className="h-4 w-4 sidebar-icon" />
                            <span>Sales</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {canAccessPurchases && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/purchase-report")}>
                            <NavLink to="/purchase-report" className="flex items-center gap-3 group">
                              <BarChart3 className="h-4 w-4 sidebar-icon" />
                              <span>Purchase</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/product-tracking")}>
                          <NavLink to="/product-tracking" className="flex items-center gap-3 group">
                            <Barcode className="h-4 w-4 sidebar-icon" />
                            <span>Product Tracking</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/daily-cashier-report")}>
                          <NavLink to="/daily-cashier-report" className="flex items-center gap-3 group">
                            <Wallet className="h-4 w-4 sidebar-icon" />
                            <span>Daily Cashier</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/item-wise-sales")}>
                          <NavLink to="/item-wise-sales" className="flex items-center gap-3 group">
                            <Barcode className="h-4 w-4 sidebar-icon" />
                            <span>Item-wise Sales</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {canAccessPurchases && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/price-history")}>
                            <NavLink to="/price-history" className="flex items-center gap-3 group">
                              <DollarSign className="h-4 w-4 sidebar-icon" />
                              <span>Price History</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {canAccessPurchases && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/gst-register")}>
                            <NavLink to="/gst-register" className="flex items-center gap-3 group">
                              <FileSpreadsheet className="h-4 w-4 sidebar-icon" />
                              <span>GST Register</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Delivery Status */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/delivery-dashboard")}>
                <NavLink to="/delivery-dashboard" className="flex items-center gap-3 group">
                  <PackageCheck className="h-5 w-5 sidebar-icon" />
                  {open && <span className="font-medium">Delivery Status</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Accounts */}
        {canAccessPurchases && (
          <SidebarGroup>
            <Collapsible defaultOpen={isGroupActive(accountsPaths)} className="group/collapsible">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 sidebar-icon" />
                    {open && <span className="font-semibold">Accounts</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/accounts")}>
                            <NavLink to="/accounts" className="flex items-center gap-3 group">
                              <Wallet className="h-4 w-4 sidebar-icon" />
                              <span>Account Ledgers</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/payments-dashboard")}>
                            <NavLink to="/payments-dashboard" className="flex items-center gap-3 group">
                              <DollarSign className="h-4 w-4 sidebar-icon" />
                              <span>Payments</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}

        {/* Settings */}
        <SidebarGroup>
          <Collapsible defaultOpen={isGroupActive(settingsPaths)} className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2 transition-all duration-200 group">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 sidebar-icon group-hover:animate-icon-spin-slow" />
                  {open && <span className="font-semibold">Settings</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary" />}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/profile")}>
                          <NavLink to="/profile" className="flex items-center gap-3 group">
                            <User className="h-4 w-4 sidebar-icon" />
                            <span>Profile</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {canAccessSettings && (
                        <>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/settings")}>
                              <NavLink to="/settings" className="flex items-center gap-3 group">
                                <Settings className="h-4 w-4 sidebar-icon" />
                                <span>Settings</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/organization-management")}>
                              <NavLink to="/organization-management" className="flex items-center gap-3 group">
                                <Building2 className="h-4 w-4 sidebar-icon" />
                                <span>Organization</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/barcode-printing")}>
                              <NavLink to="/barcode-printing" className="flex items-center gap-3 group">
                                <Barcode className="h-4 w-4 sidebar-icon" />
                                <span>Barcode Printing</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </>
                      )}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
