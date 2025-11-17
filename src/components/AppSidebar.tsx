import {
  LayoutDashboard,
  Users,
  Truck,
  UserCircle,
  Package,
  ShoppingCart,
  FileText,
  TrendingUp,
  BarChart3,
  Settings,
  User,
  Building2,
  Barcode,
  ChevronDown,
  ShoppingBag,
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
  const { canAccessSettings, canAccessPurchases } = useUserRoles();

  const isActive = (path: string) => location.pathname === path;
  const isGroupActive = (paths: string[]) => paths.some(path => location.pathname === path);

  // Menu structure
  const masterPaths = ["/customers", "/suppliers", "/employees"];
  const inventoryPaths = ["/purchase-bills", "/purchase-entry", "/product-entry", "/products"];
  const salesPaths = ["/pos-sales", "/pos-dashboard", "/sales-invoice"];
  const reportsPaths = ["/stock-report", "/sales-report", "/purchase-report"];
  const settingsPaths = ["/profile", "/settings", "/organization-management", "/barcode-printing"];

  return (
    <Sidebar collapsible="icon" className="border-r bg-card/50">
      <SidebarContent>
        {/* Dashboard */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/")}>
                <NavLink to="/" className="flex items-center gap-3">
                  <LayoutDashboard className="h-5 w-5" />
                  {open && <span>Dashboard</span>}
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {open && <span>Master</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/customers")}>
                            <NavLink to="/customers" className="flex items-center gap-3">
                              <UserCircle className="h-4 w-4" />
                              <span>Customer</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/suppliers")}>
                            <NavLink to="/suppliers" className="flex items-center gap-3">
                              <Truck className="h-4 w-4" />
                              <span>Supplier</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/employees")}>
                            <NavLink to="/employees" className="flex items-center gap-3">
                              <Users className="h-4 w-4" />
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
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {open && <span>Inventory</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />}
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
                              <NavLink to="/purchase-bills" className="flex items-center gap-3">
                                <FileText className="h-4 w-4" />
                                <span>Purchase Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-entry")}>
                              <NavLink to="/purchase-entry" className="flex items-center gap-3">
                                <ShoppingBag className="h-4 w-4" />
                                <span>Purchase Bill</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </>
                      )}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/product-entry")}>
                          <NavLink to="/product-entry" className="flex items-center gap-3">
                            <Package className="h-4 w-4" />
                            <span>Product Entry</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/products")}>
                          <NavLink to="/products" className="flex items-center gap-3">
                            <Package className="h-4 w-4" />
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
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  {open && <span>Sales</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/pos-sales")}>
                          <NavLink to="/pos-sales" className="flex items-center gap-3">
                            <ShoppingCart className="h-4 w-4" />
                            <span>POS</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/pos-dashboard")}>
                          <NavLink to="/pos-dashboard" className="flex items-center gap-3">
                            <ShoppingBag className="h-4 w-4" />
                            <span>POS Dashboard</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/sales-invoice")}>
                          <NavLink to="/sales-invoice" className="flex items-center gap-3">
                            <FileText className="h-4 w-4" />
                            <span>Sales Bill</span>
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
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {open && <span>Reports</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/stock-report")}>
                          <NavLink to="/stock-report" className="flex items-center gap-3">
                            <Package className="h-4 w-4" />
                            <span>Stock Report</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/sales-report")}>
                          <NavLink to="/sales-report" className="flex items-center gap-3">
                            <TrendingUp className="h-4 w-4" />
                            <span>Sales</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {canAccessPurchases && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/purchase-report")}>
                            <NavLink to="/purchase-report" className="flex items-center gap-3">
                              <BarChart3 className="h-4 w-4" />
                              <span>Purchase Report</span>
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

        {/* Settings */}
        <SidebarGroup>
          <Collapsible defaultOpen={isGroupActive(settingsPaths)} className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 rounded-md p-2">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  {open && <span>Settings</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/profile")}>
                          <NavLink to="/profile" className="flex items-center gap-3">
                            <User className="h-4 w-4" />
                            <span>Profile</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {canAccessSettings && (
                        <>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/settings")}>
                              <NavLink to="/settings" className="flex items-center gap-3">
                                <Settings className="h-4 w-4" />
                                <span>Setting Page</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/organization-management")}>
                              <NavLink to="/organization-management" className="flex items-center gap-3">
                                <Building2 className="h-4 w-4" />
                                <span>Organizations</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </>
                      )}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/barcode-printing")}>
                          <NavLink to="/barcode-printing" className="flex items-center gap-3">
                            <Barcode className="h-4 w-4" />
                            <span>Barcode Printing</span>
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
      </SidebarContent>
    </Sidebar>
  );
}
