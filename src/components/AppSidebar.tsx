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
  Archive,
  Pencil,
  MessageSquare,
  Inbox,
  ClipboardList,
  GraduationCap,
  BookOpen,
  Calendar,
  CreditCard,
  Bot,
  Coins,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useChat } from "@/contexts/ChatContext";
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
  const { canAccessSettings, canAccessPurchases, isPlatformAdmin, isAdmin } = useUserRoles();
  const { hasMenuAccess, hasMainMenuAccess, isAdmin: isAdminPermissions, loading: permissionsLoading } = useUserPermissions();
  const { currentOrganization } = useOrganization();
  
  const isSchool = currentOrganization?.organization_type === "school";

  // Check if path matches accounting for org-scoped URLs
  // URL format: /:orgSlug/path or /path
  const isActive = (path: string) => {
    const pathname = location.pathname;
    const parts = pathname.split("/").filter(Boolean);
    
    // Handle root path (dashboard)
    if (path === "/") {
      // Match /:orgSlug exactly (no trailing path after org slug)
      return parts.length === 1;
    }
    
    // For other paths, we need to check the path AFTER the org slug
    // If we only have org slug (parts.length === 1), no other path is active
    if (parts.length === 1) {
      return false;
    }
    
    // Get the path after org slug (e.g., "/accounts" from "/orgSlug/accounts")
    const pathAfterOrgSlug = "/" + parts.slice(1).join("/");
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    
    return pathAfterOrgSlug === cleanPath;
  };
  
  const isGroupActive = (paths: string[]) => paths.some(path => isActive(path));

  // Menu structure
  const masterPaths = ["/customers", "/suppliers", "/employees"];
  const inventoryPaths = ["/purchase-bills", "/purchase-returns", "/purchase-entry", "/purchase-orders", "/purchase-order-entry", "/product-entry", "/products", "/bulk-product-update"];
  const salesPaths = ["/quotation-entry", "/quotation-dashboard", "/sale-order-entry", "/sale-order-dashboard", "/pos-sales", "/pos-dashboard", "/sales-invoice", "/sales-invoice-dashboard", "/sale-return-entry", "/sale-returns", "/delivery-challan-entry", "/delivery-challan-dashboard", "/advance-booking-dashboard"];
  const reportsPaths = ["/stock-report", "/stock-analysis", "/sales-report", "/purchase-report", "/product-tracking", "/daily-cashier-report", "/item-wise-sales", "/item-wise-stock", "/price-history", "/gst-reports", "/gst-register", "/tally-export", "/sales-analytics", "/accounting-reports"];
  const accountsPaths = ["/accounts", "/payments-dashboard"];
  const settingsPaths = ["/profile", "/settings", "/organization-management", "/barcode-printing"];
  const schoolPaths = ["/students", "/student-entry", "/teachers", "/fee-collection", "/fee-heads", "/fee-structures", "/academic-years", "/classes"];

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border dark:bg-[hsl(213,32%,17%)] pt-0" style={{ width: '280px' }}>
      <SidebarContent className="font-sans text-[16px] text-white pt-0 mt-0">
        {/* Platform Admin - Only visible to platform admins */}
        {isPlatformAdmin && (
          <SidebarGroup className="pt-0 first:pt-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/platform-admin")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                  <NavLink to="/platform-admin" className="flex items-center gap-3 group">
                    <Shield className="h-5 w-5 text-primary dark:text-[hsl(187,100%,42%)] sidebar-icon group-hover:animate-icon-pulse" />
                    {open && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold dark:text-white">Platform Admin</span>
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
        {(isAdminPermissions || hasMenuAccess("main_dashboard")) && (
          <SidebarGroup className="pt-0 first:pt-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                  <NavLink to="/" className="flex items-center gap-3 group">
                    <LayoutDashboard className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-medium dark:text-white">Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* School Module - Only for school organizations */}
        {isSchool && (
          <SidebarGroup>
            <Collapsible defaultOpen={isGroupActive(schoolPaths)} className="group/collapsible">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md p-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-semibold text-[15px] dark:text-white">School</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary dark:text-white" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/students")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/students" className="flex items-center gap-3 group">
                              <GraduationCap className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">Students</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/teachers")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/teachers" className="flex items-center gap-3 group">
                              <Users className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">Teachers</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/classes")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/classes" className="flex items-center gap-3 group">
                              <BookOpen className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">Classes</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/academic-years")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/academic-years" className="flex items-center gap-3 group">
                              <Calendar className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">Academic Years</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/fee-heads")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/fee-heads" className="flex items-center gap-3 group">
                              <CreditCard className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">Fee Heads</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/fee-structures")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/fee-structures" className="flex items-center gap-3 group">
                              <BookOpen className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">Fee Structures</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/fee-collection")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/fee-collection" className="flex items-center gap-3 group">
                              <DollarSign className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">Fee Collection</span>
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

        {/* Master */}
        {(isAdminPermissions || hasMainMenuAccess("master")) && (
          <SidebarGroup>
            <Collapsible defaultOpen={isGroupActive(masterPaths)} className="group/collapsible">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md p-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-semibold text-[15px] dark:text-white">Master</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary dark:text-white" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("customer_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customers")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/customers" className="flex items-center gap-3 group">
                                <UserCircle className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Customer</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("supplier_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/suppliers")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/suppliers" className="flex items-center gap-3 group">
                                <Truck className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Supplier</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("employee_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/employees")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/employees" className="flex items-center gap-3 group">
                                <Users className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Employee Master</span>
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
        )}

        {/* Inventory */}
        {(isAdminPermissions || hasMainMenuAccess("inventory")) && (
          <SidebarGroup>
            <Collapsible defaultOpen={isGroupActive(inventoryPaths)} className="group/collapsible">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md p-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-semibold text-[15px] dark:text-white">Inventory</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary dark:text-white" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("purchase_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-orders")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/purchase-orders" className="flex items-center gap-3 group">
                                <ClipboardList className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Purchase Orders</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-bills")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/purchase-bills" className="flex items-center gap-3 group">
                                <FileText className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Purchase Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_return_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-returns")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/purchase-returns" className="flex items-center gap-3 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Purchase Returns</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_return")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-return-entry")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/purchase-return-entry" className="flex items-center gap-3 group">
                                <Plus className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Purchase Return</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_bill")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-entry")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/purchase-entry" className="flex items-center gap-3 group">
                                <ShoppingBag className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Purchase Bill</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_entry")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/product-entry")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/product-entry" className="flex items-center gap-3 group">
                                <Package className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Product Entry</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/products")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/products" className="flex items-center gap-3 group">
                                <Package className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Product Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/bulk-product-update")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/bulk-product-update" className="flex items-center gap-3 group">
                                <Pencil className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Bulk Update</span>
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
        )}

        {/* Sales */}
        {(isAdminPermissions || hasMainMenuAccess("sales")) && (
          <SidebarGroup>
            <Collapsible defaultOpen={isGroupActive(salesPaths)} className="group/collapsible">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md p-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-semibold text-[15px] dark:text-white">Sales</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary dark:text-white" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("quotation_entry")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/quotation-entry")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/quotation-entry" className="flex items-center gap-3 group">
                                <FileText className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Quotation Entry</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("quotation_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/quotation-dashboard")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/quotation-dashboard" className="flex items-center gap-3 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Quotation Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_order_entry")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-order-entry")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/sale-order-entry" className="flex items-center gap-3 group">
                                <PackageCheck className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Sale Order Entry</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_order_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-order-dashboard")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/sale-order-dashboard" className="flex items-center gap-3 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Sale Order Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("pos_sales")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/pos-sales")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/pos-sales" className="flex items-center gap-3 group">
                                <ShoppingCart className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">POS</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("pos_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/pos-dashboard")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/pos-dashboard" className="flex items-center gap-3 group">
                                <ShoppingBag className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">POS Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_invoice")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-invoice")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/sales-invoice" className="flex items-center gap-3 group">
                                <FileText className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Sales Bill</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_invoice_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-invoice-dashboard")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/sales-invoice-dashboard" className="flex items-center gap-3 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Invoice Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_return")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-return-entry")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/sale-return-entry" className="flex items-center gap-3 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Sale Return</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_return_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-returns")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/sale-returns" className="flex items-center gap-3 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Return Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_invoice")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/delivery-challan-entry")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/delivery-challan-entry" className="flex items-center gap-3 group">
                                <Truck className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Delivery Challan</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_invoice_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/delivery-challan-dashboard")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/delivery-challan-dashboard" className="flex items-center gap-3 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Challan Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/advance-booking-dashboard")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/advance-booking-dashboard" className="flex items-center gap-3 group">
                              <Coins className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">Advance Booking</span>
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

        {/* Reports */}
        {(isAdminPermissions || hasMainMenuAccess("reports")) && (
          <SidebarGroup>
            <Collapsible defaultOpen={isGroupActive(reportsPaths)} className="group/collapsible">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md p-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-semibold text-[15px] dark:text-white">Reports</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary dark:text-white" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("stock_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-report")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/stock-report" className="flex items-center gap-3 group">
                                <Package className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Stock Report</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("stock_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-analysis")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/stock-analysis" className="flex items-center gap-3 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Stock Analysis</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_report_customer")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-report")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/sales-report" className="flex items-center gap-3 group">
                                <TrendingUp className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Sales</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_report_supplier")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-report")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/purchase-report" className="flex items-center gap-3 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Purchase</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_tracking")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/product-tracking")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/product-tracking" className="flex items-center gap-3 group">
                                <Barcode className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Product Tracking</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("daily_cashier_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/daily-cashier-report")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/daily-cashier-report" className="flex items-center gap-3 group">
                                <Wallet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Daily Cashier</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("item_wise_sales")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/item-wise-sales")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/item-wise-sales" className="flex items-center gap-3 group">
                                <Barcode className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Item-wise Sales</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("item_wise_stock")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/item-wise-stock")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/item-wise-stock" className="flex items-center gap-3 group">
                                <Package className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Item-wise Stock</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("price_history")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/price-history")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/price-history" className="flex items-center gap-3 group">
                                <DollarSign className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Price History</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("gst_reports")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/gst-reports")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/gst-reports" className="flex items-center gap-3 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">GST Reports</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("gst_register")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/gst-register")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/gst-register" className="flex items-center gap-3 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">GST Register</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("tally_export")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/tally-export")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/tally-export" className="flex items-center gap-3 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Tally Export</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_analytics")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-analytics")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/sales-analytics" className="flex items-center gap-3 group">
                                <TrendingUp className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Sales Analytics</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounting_reports")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/accounting-reports")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/accounting-reports" className="flex items-center gap-3 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Accounting Reports</span>
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
        )}

        {/* Delivery Status */}
        {(isAdminPermissions || hasMainMenuAccess("delivery")) && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/delivery-dashboard")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                  <NavLink to="/delivery-dashboard" className="flex items-center gap-3 group">
                    <PackageCheck className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-medium dark:text-white">Delivery Status</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Accounts */}
        {(isAdminPermissions || hasMainMenuAccess("accounts")) && (
          <SidebarGroup>
            <Collapsible defaultOpen={isGroupActive(accountsPaths)} className="group/collapsible">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md p-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-semibold text-[15px] dark:text-white">Accounts</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary dark:text-white" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("accounts_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/accounts")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/accounts" className="flex items-center gap-3 group">
                                <Wallet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Account Ledgers</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("payments_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/payments-dashboard")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/payments-dashboard" className="flex items-center gap-3 group">
                                <DollarSign className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Payments</span>
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
        )}

        {/* Settings */}
        <SidebarGroup>
          <Collapsible defaultOpen={isGroupActive(settingsPaths)} className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md p-2 transition-all duration-200 group">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)] group-hover:animate-icon-spin-slow" />
                  {open && <span className="font-semibold text-[15px] dark:text-white">Settings</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary dark:text-white" />}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/profile")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                          <NavLink to="/profile" className="flex items-center gap-3 group">
                            <User className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                            <span className="dark:text-white">Profile</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {canAccessSettings && (
                        <>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/settings")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/settings" className="flex items-center gap-3 group">
                                <Settings className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Settings</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/organization-management")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/organization-management" className="flex items-center gap-3 group">
                                <Building2 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Organization</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/barcode-printing")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                              <NavLink to="/barcode-printing" className="flex items-center gap-3 group">
                                <Barcode className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="dark:text-white">Barcode Printing</span>
                              </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/whatsapp-logs")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/whatsapp-logs" className="flex items-center gap-3 group">
                              <MessageSquare className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">WhatsApp Logs</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/whatsapp-inbox")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                            <NavLink to="/whatsapp-inbox" className="flex items-center gap-3 group">
                              <Inbox className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="dark:text-white">WhatsApp Inbox</span>
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

        {/* Recycle Bin - Admin Only */}
        {canAccessSettings && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/recycle-bin")} className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] dark:data-[active=true]:bg-[hsl(213,32%,22%)] dark:data-[active=true]:border-l-2 dark:data-[active=true]:border-l-[hsl(187,100%,42%)]">
                  <NavLink to="/recycle-bin" className="flex items-center gap-3 group">
                    <Archive className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-medium dark:text-white">Recycle Bin</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* AI Assistant - Check permission */}
        <AIAssistantMenuItem open={open} />
      </SidebarContent>
    </Sidebar>
  );
}

// Separate component to use the useChat hook (needs ChatProvider)
function AIAssistantMenuItem({ open }: { open: boolean }) {
  const { setIsOpen } = useChat();
  const { hasSpecialPermission, loading } = useUserPermissions();
  
  // Don't show if user doesn't have permission
  if (loading || !hasSpecialPermission("ai_chatbot")) {
    return null;
  }

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton 
            onClick={() => setIsOpen(true)} 
            className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] cursor-pointer"
          >
            <div className="flex items-center gap-3 group">
              <Bot className="h-5 w-5 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
              {open && <span className="font-medium dark:text-white">AI Assistant</span>}
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
