import {
  LayoutDashboard,
  Users,
  Truck,
  UserCircle,
  Package,
  PackageX,
  ShoppingCart,
  FileText,
  TrendingUp,
  TrendingDown,
  BarChart3,
  LineChart,
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
  Grid3X3,
  Clock,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
  Monitor,
  Lock,
  Unlock,
  AlertTriangle,
  Banknote,
  ShieldCheck,
  LayoutList,
  Scale,
} from "lucide-react";
import { useState, useEffect } from "react";
import { UIScaleSelector } from "@/components/UIScaleSelector";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useChat } from "@/contexts/ChatContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { readSidebarLockedOpen, writeSidebarLockedOpen, SIDEBAR_PREFERENCE_SYNC_EVENT } from "@/lib/sidebarPreference";
import { BrandSocialIcons } from "@/components/sidebar/BrandSocialIcons";

export function AppSidebar() {
  const { open, setOpen } = useSidebar();
  const [isLocked, setIsLocked] = useState<boolean>(() => readSidebarLockedOpen());

  useEffect(() => {
    setOpen(readSidebarLockedOpen());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once from saved preference
  }, []);

  useEffect(() => {
    const syncLockState = () => setIsLocked(readSidebarLockedOpen());
    window.addEventListener(SIDEBAR_PREFERENCE_SYNC_EVENT, syncLockState);
    return () => window.removeEventListener(SIDEBAR_PREFERENCE_SYNC_EVENT, syncLockState);
  }, []);

  const handleToggleLock = () => {
    const newLocked = !isLocked;
    setIsLocked(newLocked);
    setOpen(newLocked);
    writeSidebarLockedOpen(newLocked);
  };
  const location = useLocation();
  const { canAccessSettings, canAccessPurchases, isPlatformAdmin, isAdmin } = useUserRoles();
  const { hasMenuAccess, hasMainMenuAccess, hasSpecialPermission, isAdmin: isAdminPermissions, loading: permissionsLoading } = useUserPermissions();
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
  const masterPaths = ["/customers", "/suppliers", "/employees", "/salesman-commission"];
  const inventoryPaths = ["/purchase-bills", "/purchase-returns", "/purchase-entry", "/purchase-orders", "/purchase-order-entry", "/product-entry", "/products", "/orphaned-products", "/bulk-product-update", "/stock-settlement"];
  const salesPaths = ["/quotation-entry", "/quotation-dashboard", "/sale-order-entry", "/sale-order-dashboard", "/pos-sales", "/pos-dashboard", "/sales-invoice", "/sales-invoice-dashboard", "/sale-return-entry", "/sale-returns", "/delivery-challan-entry", "/delivery-challan-dashboard", "/advance-booking-dashboard"];
  const reportsPaths = ["/reports", "/insights", "/stock-report", "/stock-analysis", "/stock-ageing", "/sales-report", "/purchase-report", "/product-tracking", "/daily-cashier-report", "/daily-tally", "/item-wise-sales", "/item-wise-stock", "/price-history", "/gst-reports", "/gst-register", "/tally-export", "/sales-analytics", "/accounting-reports", "/expense-salary-report", "/customer-ledger-report", "/customer-party-balances", "/supplier-party-balances", "/customer-account-statement", "/customer-account-statement-audit", "/customer-balance-activity", "/customer-audit-report", "/daily-sale-analysis", "/einvoice-report"];
  const accountsPaths = [
    "/accounts",
    "/accounts-payments",
    "/chart-of-accounts",
    "/journal-vouchers",
    "/manual-journal",
    "/ledger-opening-balances",
    "/payments-dashboard",
  ];
  const settingsPaths = ["/profile", "/settings", "/organization-management", "/barcode-printing"];
  const schoolPaths = ["/students", "/student-entry", "/teachers", "/fee-collection", "/fee-heads", "/fee-structures", "/academic-years", "/classes", "/student-reports", "/student-promotion", "/student-ledger"];

  const orgInitials = (currentOrganization?.name || "OR")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "OR";

  const orgTypeLabel =
    currentOrganization?.organization_type === "school" ? "School" : "Business";
  const orgCityHint =
    typeof currentOrganization?.settings?.address === "string"
      ? currentOrganization.settings.address.split(",").pop()?.trim()
      : null;
  const orgSubtitle = orgCityHint ? `${orgTypeLabel} · ${orgCityHint}` : orgTypeLabel;

  return (
    <Sidebar collapsible="offcanvas" className="erp-desktop-sidebar border-r pt-0">
      <SidebarContent className="font-sans text-base font-semibold text-sidebar-foreground pt-0 mt-0 space-y-0.5">
        {/* Organization Context Badge */}
        {currentOrganization && (
          <div className={cn("erp-sidebar-org", !open && "justify-center px-2")}>
            <div className="erp-sidebar-org__avatar" aria-hidden>
              {orgInitials}
            </div>
            {open && (
              <div className="min-w-0">
                <div className="erp-sidebar-org__name truncate">{currentOrganization.name}</div>
                <div className="erp-sidebar-org__sub truncate">{orgSubtitle}</div>
              </div>
            )}
          </div>
        )}

        {/* System Health - hidden by default; enable per-user via User Rights → Special Rights → "System Health". Platform admins always see it. */}
        {(isPlatformAdmin || hasSpecialPermission('system_health')) && (
          <SidebarGroup className="pt-0 first:pt-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/admin/health")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                  <NavLink to="/admin/health" className="flex items-center gap-2 group">
                    <AlertTriangle className="h-5 w-5 text-amber-500 sidebar-icon group-hover:animate-icon-pulse" />
                    {open && <span className="font-bold text-sidebar-foreground group-hover:text-primary">System Health</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Platform Admin - Only visible to platform admins */}
        {isPlatformAdmin && (
          <SidebarGroup className="pt-0 first:pt-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/platform-admin")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                  <NavLink to="/platform-admin" className="flex items-center gap-2 group">
                    <Shield className="h-5 w-5 text-primary sidebar-icon group-hover:animate-icon-pulse" />
                    {open && (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sidebar-foreground group-hover:text-primary">Platform Admin</span>
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
        {(isAdminPermissions || (hasMainMenuAccess("dashboard") && hasMenuAccess("main_dashboard"))) && (
          <SidebarGroup className="pt-0 first:pt-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                  <NavLink to="/" className="flex items-center gap-2 group">
                    <LayoutDashboard className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-bold text-sidebar-foreground group-hover:text-primary">Dashboard</span>}
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-sidebar-accent rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-extrabold text-[0.9375rem] uppercase tracking-wider text-sidebar-foreground group-hover:text-primary">School</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 text-sidebar-foreground group-hover:text-primary" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/students")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/students" className="flex items-center gap-2 group">
                              <GraduationCap className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Students</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/teachers")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/teachers" className="flex items-center gap-2 group">
                              <Users className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Teachers</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/classes")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/classes" className="flex items-center gap-2 group">
                              <BookOpen className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Classes</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/academic-years")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/academic-years" className="flex items-center gap-2 group">
                              <Calendar className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Academic Years</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/fee-heads")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/fee-heads" className="flex items-center gap-2 group">
                              <CreditCard className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Fee Heads</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/fee-structures")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/fee-structures" className="flex items-center gap-2 group">
                              <BookOpen className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Fee Structures</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/fee-collection")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/fee-collection" className="flex items-center gap-2 group">
                              <DollarSign className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Fee Collection</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/student-reports")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/student-reports" className="flex items-center gap-2 group">
                              <BarChart3 className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Student Reports</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/student-ledger")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/student-ledger" className="flex items-center gap-2 group">
                              <FileText className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Student Ledger</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/student-promotion")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/student-promotion" className="flex items-center gap-2 group">
                              <ArrowRight className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Promote Students</span>
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-sidebar-accent rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-extrabold text-[0.9375rem] uppercase tracking-wider text-sidebar-foreground group-hover:text-primary">Master</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 text-sidebar-foreground group-hover:text-primary" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("customer_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customers")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/customers" className="flex items-center gap-2 group">
                                <UserCircle className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Customer</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("supplier_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/suppliers")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/suppliers" className="flex items-center gap-2 group">
                                <Truck className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Supplier</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("employee_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/employees")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/employees" className="flex items-center gap-2 group">
                                <Users className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Employee Master</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("employee_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/salesman-commission")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/salesman-commission" className="flex items-center gap-2 group">
                                <Coins className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Commission</span>
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-sidebar-accent rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-extrabold text-[0.9375rem] uppercase tracking-wider text-sidebar-foreground group-hover:text-primary">Inventory</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 text-sidebar-foreground group-hover:text-primary" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("purchase_order_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-orders")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/purchase-orders" className="flex items-center gap-2 group">
                                <ClipboardList className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Purchase Orders</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-bills")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/purchase-bills" className="flex items-center gap-2 group">
                                <FileText className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Purchase Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_return_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-returns")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/purchase-returns" className="flex items-center gap-2 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Purchase Returns</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_return")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-return-entry")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/purchase-return-entry" className="flex items-center gap-2 group">
                                <Plus className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Purchase Return</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_bill")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-entry")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/purchase-entry" state={{ newBill: true }} className="flex items-center gap-2 group">
                                <ShoppingBag className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Purchase Bill</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_entry")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/product-entry")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/product-entry" className="flex items-center gap-2 group">
                                <Package className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Product Entry</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/products")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/products" className="flex items-center gap-2 group">
                                <Package className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Product Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("orphaned_products")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/orphaned-products")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/orphaned-products" className="flex items-center gap-2 group">
                                <PackageX className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Orphaned Products</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/bulk-product-update")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/bulk-product-update" className="flex items-center gap-2 group">
                                <Pencil className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Bulk Update</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-settlement")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/stock-settlement" className="flex items-center gap-2 group">
                                <PackageCheck className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Stock Settlement</span>
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-sidebar-accent rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-extrabold text-[0.9375rem] uppercase tracking-wider text-sidebar-foreground group-hover:text-primary">Sales</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 text-sidebar-foreground group-hover:text-primary" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("quotation_entry")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/quotation-entry")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/quotation-entry" className="flex items-center gap-2 group">
                                <FileText className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Quotation Entry</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("quotation_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/quotation-dashboard")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/quotation-dashboard" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Quotation Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_order_entry")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-order-entry")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/sale-order-entry" className="flex items-center gap-2 group">
                                <PackageCheck className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Sale Order Entry</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_order_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-order-dashboard")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/sale-order-dashboard" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Sale Order Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("pos_sales")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/pos-sales")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/pos-sales" className="flex items-center gap-2 group">
                                <ShoppingCart className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">POS</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("pos_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/pos-dashboard")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/pos-dashboard" className="flex items-center gap-2 group">
                                <ShoppingBag className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">POS Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_invoice")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-invoice")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/sales-invoice" className="flex items-center gap-2 group">
                                <FileText className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Sales Bill</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_invoice_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-invoice-dashboard")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/sales-invoice-dashboard" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Invoice Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_return")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-return-entry")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/sale-return-entry" className="flex items-center gap-2 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Sale Return</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_return_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-returns")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/sale-returns" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Return Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("delivery_challan_entry")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/delivery-challan-entry")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/delivery-challan-entry" className="flex items-center gap-2 group">
                                <Truck className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Delivery Challan</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("delivery_challan_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/delivery-challan-dashboard")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/delivery-challan-dashboard" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Challan Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("advance_booking_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/advance-booking-dashboard")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/advance-booking-dashboard" className="flex items-center gap-2 group">
                                <Coins className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Advance Booking</span>
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

        {/* Reports */}
        {(isAdminPermissions || hasMainMenuAccess("reports")) && (
          <SidebarGroup>
            <Collapsible defaultOpen={isGroupActive(reportsPaths)} className="group/collapsible">
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-sidebar-accent rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-extrabold text-[0.9375rem] uppercase tracking-wider text-sidebar-foreground group-hover:text-primary">Reports</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 text-sidebar-foreground group-hover:text-primary" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("reports_hub")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/reports")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/reports" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-bold group-hover:text-primary">Reports Hub</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("stock_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-report")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/stock-report" className="flex items-center gap-2 group">
                                <Package className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Stock Report</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("stock_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-report?tab=sizewise")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/stock-report?tab=sizewise" className="flex items-center gap-2 group">
                                <Grid3X3 className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Size-wise Stock</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("stock_analysis")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-analysis")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/stock-analysis" className="flex items-center gap-2 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Stock Analysis</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("stock_ageing")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-ageing")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/stock-ageing" className="flex items-center gap-2 group">
                                <Clock className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Stock Ageing</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_report_customer")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-report")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/sales-report" className="flex items-center gap-2 group">
                                <TrendingUp className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Sales</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_report_supplier")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-report")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/purchase-report" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Purchase</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_tracking")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/product-tracking")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/product-tracking" className="flex items-center gap-2 group">
                                <Barcode className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Product Tracking</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("daily_cashier_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/daily-cashier-report")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/daily-cashier-report" className="flex items-center gap-2 group">
                                <Wallet className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Daily Cashier</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("daily_tally")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/daily-tally")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/daily-tally" className="flex items-center gap-2 group">
                                <Coins className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Daily Tally</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_analysis")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/daily-sale-analysis")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/daily-sale-analysis" className="flex items-center gap-2 group">
                                <ClipboardList className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Sale Analysis</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("einvoice_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/einvoice-report")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/einvoice-report" className="flex items-center gap-2 group">
                                <ClipboardList className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">E-Invoice Report</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("item_wise_sales")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/item-wise-sales")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/item-wise-sales" className="flex items-center gap-2 group">
                                <Barcode className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Item-wise Sales</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("item_wise_stock")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/item-wise-stock")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/item-wise-stock" className="flex items-center gap-2 group">
                                <Package className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Item-wise Stock</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("price_history")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/price-history")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/price-history" className="flex items-center gap-2 group">
                                <DollarSign className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Price History</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("gst_reports")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/gst-reports")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/gst-reports" className="flex items-center gap-2 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">GST Reports</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("gst_register")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/gst-register")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/gst-register" className="flex items-center gap-2 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">GST Register</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("tally_export")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/tally-export")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/tally-export" className="flex items-center gap-2 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Tally Export</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_analytics")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-analytics")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/sales-analytics" className="flex items-center gap-2 group">
                                <TrendingUp className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Sales Analytics</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounting_reports_view")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/accounting-reports")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/accounting-reports" className="flex items-center gap-2 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Accounting Reports</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounting_reports_view")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/expense-salary-report")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/expense-salary-report" className="flex items-center gap-2 group">
                                <Banknote className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Expense &amp; Salary Report</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("customer_ledger")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customer-ledger-report")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/customer-ledger-report" className="flex items-center gap-2 group">
                                <BookOpen className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Customer Ledger</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("customer_party_balances") || hasMenuAccess("customer_ledger")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customer-party-balances")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/customer-party-balances" className="flex items-center gap-2 group">
                                <Scale className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Customer Balances</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("supplier_party_balances") || hasMenuAccess("accounts_dashboard") || hasMenuAccess("purchase_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/supplier-party-balances")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/supplier-party-balances" className="flex items-center gap-2 group">
                                <Truck className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Supplier Balances</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("customer_account_statement") || hasMenuAccess("customer_ledger")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customer-account-statement")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/customer-account-statement" className="flex items-center gap-2 group">
                                <BookOpen className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Customer Account Statement</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("customer_account_statement") || hasMenuAccess("customer_ledger")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customer-account-statement-audit")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/customer-account-statement-audit" className="flex items-center gap-2 group" title="Audit register — compare with classic Customer Ledger">
                                <FileText className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Account statement (audit)</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions ||
                          hasMenuAccess("customer_balance_activity") ||
                          hasMenuAccess("customer_account_statement") ||
                          hasMenuAccess("customer_ledger")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isActive("/customer-balance-activity")}
                              className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold"
                            >
                              <NavLink to="/customer-balance-activity" className="flex items-center gap-2 group">
                                <LayoutList className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">
                                  Customer balance &amp; activity
                                </span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("customer_audit_report") || hasMenuAccess("customer_ledger")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customer-audit-report")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/customer-audit-report" className="flex items-center gap-2 group" title="Verified customer outstanding balance">
                                <ShieldCheck className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Customer Audit Report</span>
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
                <SidebarMenuButton asChild isActive={isActive("/delivery-dashboard")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                  <NavLink to="/delivery-dashboard" className="flex items-center gap-2 group">
                    <PackageCheck className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-bold text-sidebar-foreground group-hover:text-primary">Delivery Status</span>}
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-sidebar-accent rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-extrabold text-[0.9375rem] uppercase tracking-wider text-sidebar-foreground group-hover:text-primary">Accounts</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 text-sidebar-foreground group-hover:text-primary" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("accounts_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/accounts")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/accounts" className="flex items-center gap-2 group">
                                <Wallet className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Account Ledgers</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounts_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/chart-of-accounts")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/chart-of-accounts" className="flex items-center gap-2 group">
                                <BookOpen className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Chart of Accounts</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounts_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/journal-vouchers")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/journal-vouchers" className="flex items-center gap-2 group">
                                <BookOpen className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Journal Vouchers</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounts_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/manual-journal")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/manual-journal" className="flex items-center gap-2 group">
                                <BookOpen className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Manual Journal</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounts_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/ledger-opening-balances")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/ledger-opening-balances" className="flex items-center gap-2 group">
                                <Scale className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Opening Balances</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounts_payments") || hasMenuAccess("payment_recording") || hasMenuAccess("payments_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/accounts-payments")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/accounts-payments" className="flex items-center gap-2 group">
                                <Banknote className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Record Payments</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("payments_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/payments-dashboard")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                              <NavLink to="/payments-dashboard" className="flex items-center gap-2 group">
                                <DollarSign className="h-4 w-4 sidebar-icon text-primary" />
                                <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Payments</span>
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

        {/* Business Insights */}
        {(isAdminPermissions || hasMenuAccess("business_insights")) && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/insights")} tooltip="Insights">
                    <NavLink to="/insights" className="flex items-center gap-2 group">
                      <LineChart className="h-4 w-4 sidebar-icon text-primary" />
                      {open && (
                        <span className="font-extrabold text-[0.9375rem] uppercase tracking-wider text-sidebar-foreground group-hover:text-primary">
                          Insights
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Settings - always visible for admin users, can be disabled via custom permissions */}
        {(isAdmin || isAdminPermissions || hasMainMenuAccess("settings")) && (
        <SidebarGroup>
          <Collapsible defaultOpen={isGroupActive(settingsPaths)} className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-sidebar-accent rounded-md py-1 px-2 transition-all duration-200 group">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 sidebar-icon text-primary group-hover:animate-icon-spin-slow" />
                  {open && <span className="font-extrabold text-[0.9375rem] uppercase tracking-wider text-sidebar-foreground group-hover:text-primary">Settings</span>}
                </div>
                {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 text-sidebar-foreground group-hover:text-primary" />}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/profile")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                          <NavLink to="/profile" className="flex items-center gap-2 group">
                            <User className="h-4 w-4 sidebar-icon text-primary" />
                            <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Profile</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {(isAdmin || isAdminPermissions || hasMenuAccess("settings_view")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/settings")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/settings" className="flex items-center gap-2 group">
                              <Settings className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Settings</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isAdmin || isAdminPermissions || hasMenuAccess("organization_management")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/organization-management")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/organization-management" className="flex items-center gap-2 group">
                              <Building2 className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Organization</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isAdmin || isAdminPermissions || hasMenuAccess("barcode_printing_settings")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/barcode-printing")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/barcode-printing" className="flex items-center gap-2 group">
                              <Barcode className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">Barcode Printing</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isAdmin || isAdminPermissions || hasMenuAccess("whatsapp_logs")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/whatsapp-logs")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/whatsapp-logs" className="flex items-center gap-2 group">
                              <MessageSquare className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">WhatsApp Logs</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isAdmin || isAdminPermissions || hasMenuAccess("whatsapp_inbox")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/whatsapp-inbox")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                            <NavLink to="/whatsapp-inbox" className="flex items-center gap-2 group">
                              <Inbox className="h-4 w-4 sidebar-icon text-primary" />
                              <span className="text-sidebar-foreground font-semibold group-hover:text-primary">WhatsApp Inbox</span>
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

        {/* Recycle Bin */}
        {(isAdminPermissions || hasMenuAccess("recycle_bin")) && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/recycle-bin")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                  <NavLink to="/recycle-bin" className="flex items-center gap-2 group">
                    <Archive className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-bold text-sidebar-foreground group-hover:text-primary">Recycle Bin</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* AI Assistant - Check permission */}
        <AIAssistantMenuItem open={open} />

        {/* WhatsApp Inbox */}
        {(isAdminPermissions || hasMenuAccess("whatsapp_inbox") || hasSpecialPermission("whatsapp_send")) && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/whatsapp-inbox")} className="text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                  <NavLink to="/whatsapp-inbox" className="flex items-center gap-2 group">
                    <MessageSquare className="h-4 w-4 sidebar-icon text-primary" />
                    {open && <span className="font-bold text-sidebar-foreground group-hover:text-primary">WhatsApp Inbox</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
        {/* Display Settings & Lock */}
        <SidebarGroup className="mt-auto pb-2 border-t border-sidebar-border pt-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className={cn("flex items-center gap-2 px-2", !open && "justify-center w-full px-0")}>
                <UIScaleSelector />
                {open && (
                  <span className="text-sm font-semibold text-muted-foreground">Display</span>
                )}
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleToggleLock}
                className="text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                title={isLocked ? "Collapse sidebar" : "Lock sidebar open"}
              >
                <div className={cn("flex items-center gap-2", !open && "justify-center w-full")}>
                  {isLocked ? (
                    <ChevronsLeft className="h-4 w-4 sidebar-icon text-primary flex-shrink-0" />
                  ) : (
                    <ChevronsRight className="h-4 w-4 sidebar-icon text-primary flex-shrink-0" />
                  )}
                  {open && (
                    <span className="text-sm font-semibold text-sidebar-foreground">
                      {isLocked ? "Collapse" : "Lock open"}
                    </span>
                  )}
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border pt-2 pb-3 shrink-0">
        <BrandSocialIcons open={open} />
      </SidebarFooter>
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
            className="text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
          >
            <div className="flex items-center gap-2 group">
              <Bot className="h-4 w-4 sidebar-icon text-primary" />
              {open && <span className="font-bold text-sidebar-foreground group-hover:text-primary">AI Assistant</span>}
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
