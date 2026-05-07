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
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { UIScaleSelector } from "@/components/UIScaleSelector";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useChat } from "@/contexts/ChatContext";
import { useAuth } from "@/contexts/AuthContext";
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
  const { open, setOpen } = useSidebar();
  const { user: currentUser } = useAuth();
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar_locked") === "true";
    } catch {
      return false;
    }
  });
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const locked = localStorage.getItem("sidebar_locked") === "true";
    if (locked) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, []);

  const handleMouseEnter = () => {
    if (isLocked) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    if (isLocked) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 120);
  };

  const handleToggleLock = () => {
    const newLocked = !isLocked;
    setIsLocked(newLocked);
    setOpen(newLocked);
    try {
      localStorage.setItem("sidebar_locked", String(newLocked));
    } catch {}
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
  const inventoryPaths = ["/purchase-bills", "/purchase-returns", "/purchase-entry", "/purchase-orders", "/purchase-order-entry", "/product-entry", "/products", "/bulk-product-update", "/stock-settlement"];
  const salesPaths = ["/quotation-entry", "/quotation-dashboard", "/sale-order-entry", "/sale-order-dashboard", "/pos-sales", "/pos-dashboard", "/sales-invoice", "/sales-invoice-dashboard", "/sale-return-entry", "/sale-returns", "/delivery-challan-entry", "/delivery-challan-dashboard", "/advance-booking-dashboard"];
  const reportsPaths = ["/stock-report", "/stock-analysis", "/stock-ageing", "/sales-report", "/purchase-report", "/product-tracking", "/daily-cashier-report", "/daily-tally", "/item-wise-sales", "/item-wise-stock", "/price-history", "/gst-reports", "/gst-register", "/tally-export", "/sales-analytics", "/accounting-reports", "/expense-salary-report", "/customer-ledger-report", "/customer-account-statement", "/customer-audit-report", "/daily-sale-analysis", "/einvoice-report"];
  const accountsPaths = ["/accounts", "/chart-of-accounts", "/journal-vouchers", "/payments-dashboard"];
  const settingsPaths = ["/profile", "/settings", "/organization-management", "/barcode-printing"];
  const schoolPaths = ["/students", "/student-entry", "/teachers", "/fee-collection", "/fee-heads", "/fee-structures", "/academic-years", "/classes", "/student-reports", "/student-promotion", "/student-ledger"];

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border dark:bg-[hsl(213,32%,17%)] pt-0"
      style={{ transition: 'width 0.22s ease' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <SidebarContent className="font-sans text-sm text-white pt-0 mt-0 space-y-0.5">
        {/* Organization Context Badge */}
        {currentOrganization && (
          <div className="border-b border-sidebar-border py-2 px-3 flex items-center gap-2 min-h-[40px]">
            <Building2 className="h-4 w-4 text-primary dark:text-[hsl(187,100%,42%)] flex-shrink-0" />
            {open && (
              <span className="text-xs font-semibold truncate dark:text-white text-sidebar-foreground">
                {currentOrganization.name}
              </span>
            )}
          </div>
        )}

        {/* System Health - hidden by default; enable per-user via User Rights → Special Rights → "System Health". Platform admins always see it. */}
        {(isPlatformAdmin || hasSpecialPermission('system_health')) && (
          <SidebarGroup className="pt-0 first:pt-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/admin/health")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                  <NavLink to="/admin/health" className="flex items-center gap-2 group">
                    <AlertTriangle className="h-5 w-5 text-amber-500 sidebar-icon group-hover:animate-icon-pulse" />
                    {open && <span className="font-semibold text-slate-100 dark:text-slate-100 group-hover:text-white">System Health</span>}
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
                <SidebarMenuButton asChild isActive={isActive("/platform-admin")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                  <NavLink to="/platform-admin" className="flex items-center gap-2 group">
                    <Shield className="h-5 w-5 text-primary dark:text-[hsl(187,100%,42%)] sidebar-icon group-hover:animate-icon-pulse" />
                    {open && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100 dark:text-slate-100 group-hover:text-white">Platform Admin</span>
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
                <SidebarMenuButton asChild isActive={isActive("/")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                  <NavLink to="/" className="flex items-center gap-2 group">
                    <LayoutDashboard className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-medium text-slate-200 dark:text-slate-200 group-hover:text-white">Dashboard</span>}
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-extrabold text-base uppercase tracking-wider text-white dark:text-white drop-shadow-sm group-hover:text-white">School</span>}
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
                          <SidebarMenuSubButton asChild isActive={isActive("/students")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/students" className="flex items-center gap-2 group">
                              <GraduationCap className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Students</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/teachers")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/teachers" className="flex items-center gap-2 group">
                              <Users className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Teachers</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/classes")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/classes" className="flex items-center gap-2 group">
                              <BookOpen className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Classes</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/academic-years")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/academic-years" className="flex items-center gap-2 group">
                              <Calendar className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Academic Years</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/fee-heads")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/fee-heads" className="flex items-center gap-2 group">
                              <CreditCard className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Fee Heads</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/fee-structures")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/fee-structures" className="flex items-center gap-2 group">
                              <BookOpen className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Fee Structures</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/fee-collection")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/fee-collection" className="flex items-center gap-2 group">
                              <DollarSign className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Fee Collection</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/student-reports")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/student-reports" className="flex items-center gap-2 group">
                              <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Student Reports</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/student-ledger")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/student-ledger" className="flex items-center gap-2 group">
                              <FileText className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Student Ledger</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/student-promotion")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/student-promotion" className="flex items-center gap-2 group">
                              <ArrowRight className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Promote Students</span>
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-extrabold text-base uppercase tracking-wider text-white dark:text-white drop-shadow-sm group-hover:text-white">Master</span>}
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
                            <SidebarMenuSubButton asChild isActive={isActive("/customers")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/customers" className="flex items-center gap-2 group">
                                <UserCircle className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Customer</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("supplier_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/suppliers")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/suppliers" className="flex items-center gap-2 group">
                                <Truck className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Supplier</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("employee_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/employees")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/employees" className="flex items-center gap-2 group">
                                <Users className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Employee Master</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("employee_master")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/salesman-commission")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/salesman-commission" className="flex items-center gap-2 group">
                                <Coins className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Commission</span>
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-extrabold text-base uppercase tracking-wider text-white dark:text-white drop-shadow-sm group-hover:text-white">Inventory</span>}
                  </div>
                  {open && <ChevronDown className="h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-180 group-hover:text-primary dark:text-white" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuSub>
                        {(isAdminPermissions || hasMenuAccess("purchase_order_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-orders")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/purchase-orders" className="flex items-center gap-2 group">
                                <ClipboardList className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Purchase Orders</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-bills")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/purchase-bills" className="flex items-center gap-2 group">
                                <FileText className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Purchase Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_return_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-returns")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/purchase-returns" className="flex items-center gap-2 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Purchase Returns</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_return")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-return-entry")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/purchase-return-entry" className="flex items-center gap-2 group">
                                <Plus className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Purchase Return</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_bill")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-entry")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/purchase-entry" className="flex items-center gap-2 group">
                                <ShoppingBag className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Purchase Bill</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_entry")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/product-entry")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/product-entry" className="flex items-center gap-2 group">
                                <Package className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Product Entry</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/products")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/products" className="flex items-center gap-2 group">
                                <Package className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Product Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/bulk-product-update")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/bulk-product-update" className="flex items-center gap-2 group">
                                <Pencil className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Bulk Update</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-settlement")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/stock-settlement" className="flex items-center gap-2 group">
                                <PackageCheck className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Stock Settlement</span>
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-extrabold text-base uppercase tracking-wider text-white dark:text-white drop-shadow-sm group-hover:text-white">Sales</span>}
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
                            <SidebarMenuSubButton asChild isActive={isActive("/quotation-entry")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/quotation-entry" className="flex items-center gap-2 group">
                                <FileText className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Quotation Entry</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("quotation_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/quotation-dashboard")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/quotation-dashboard" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Quotation Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_order_entry")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-order-entry")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/sale-order-entry" className="flex items-center gap-2 group">
                                <PackageCheck className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Sale Order Entry</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_order_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-order-dashboard")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/sale-order-dashboard" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Sale Order Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("pos_sales")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/pos-sales")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/pos-sales" className="flex items-center gap-2 group">
                                <ShoppingCart className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">POS</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("pos_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/pos-dashboard")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/pos-dashboard" className="flex items-center gap-2 group">
                                <ShoppingBag className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">POS Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_invoice")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-invoice")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/sales-invoice" className="flex items-center gap-2 group">
                                <FileText className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Sales Bill</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_invoice_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-invoice-dashboard")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/sales-invoice-dashboard" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Invoice Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_return")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-return-entry")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/sale-return-entry" className="flex items-center gap-2 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Sale Return</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_return_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sale-returns")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/sale-returns" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Return Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("delivery_challan")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/delivery-challan-entry")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/delivery-challan-entry" className="flex items-center gap-2 group">
                                <Truck className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Delivery Challan</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("delivery_challan_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/delivery-challan-dashboard")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/delivery-challan-dashboard" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Challan Dashboard</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/advance-booking-dashboard")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/advance-booking-dashboard" className="flex items-center gap-2 group">
                              <Coins className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Advance Booking</span>
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-extrabold text-base uppercase tracking-wider text-white dark:text-white drop-shadow-sm group-hover:text-white">Reports</span>}
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
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-report")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/stock-report" className="flex items-center gap-2 group">
                                <Package className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Stock Report</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("stock_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-report?tab=sizewise")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/stock-report?tab=sizewise" className="flex items-center gap-2 group">
                                <Grid3X3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Size-wise Stock</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("stock_analysis")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-analysis")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/stock-analysis" className="flex items-center gap-2 group">
                                <TrendingDown className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Stock Analysis</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("stock_ageing")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/stock-ageing")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/stock-ageing" className="flex items-center gap-2 group">
                                <Clock className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Stock Ageing</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_report_customer")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-report")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/sales-report" className="flex items-center gap-2 group">
                                <TrendingUp className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Sales</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("purchase_report_supplier")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/purchase-report")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/purchase-report" className="flex items-center gap-2 group">
                                <BarChart3 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Purchase</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("product_tracking")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/product-tracking")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/product-tracking" className="flex items-center gap-2 group">
                                <Barcode className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Product Tracking</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("daily_cashier_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/daily-cashier-report")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/daily-cashier-report" className="flex items-center gap-2 group">
                                <Wallet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Daily Cashier</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("daily_tally")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/daily-tally")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/daily-tally" className="flex items-center gap-2 group">
                                <Coins className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Daily Tally</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sale_analysis")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/daily-sale-analysis")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/daily-sale-analysis" className="flex items-center gap-2 group">
                                <ClipboardList className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Sale Analysis</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("einvoice_report")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/einvoice-report")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/einvoice-report" className="flex items-center gap-2 group">
                                <ClipboardList className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">E-Invoice Report</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("item_wise_sales")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/item-wise-sales")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/item-wise-sales" className="flex items-center gap-2 group">
                                <Barcode className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Item-wise Sales</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("item_wise_stock")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/item-wise-stock")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/item-wise-stock" className="flex items-center gap-2 group">
                                <Package className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Item-wise Stock</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("price_history")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/price-history")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/price-history" className="flex items-center gap-2 group">
                                <DollarSign className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Price History</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("gst_reports")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/gst-reports")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/gst-reports" className="flex items-center gap-2 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">GST Reports</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("gst_register")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/gst-register")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/gst-register" className="flex items-center gap-2 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">GST Register</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("tally_export")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/tally-export")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/tally-export" className="flex items-center gap-2 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Tally Export</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("sales_analytics")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/sales-analytics")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/sales-analytics" className="flex items-center gap-2 group">
                                <TrendingUp className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Sales Analytics</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounting_reports_view")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/accounting-reports")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/accounting-reports" className="flex items-center gap-2 group">
                                <FileSpreadsheet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Accounting Reports</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounting_reports_view")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/expense-salary-report")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/expense-salary-report" className="flex items-center gap-2 group">
                                <Banknote className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Expense &amp; Salary Report</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("customer_ledger")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customer-ledger-report")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/customer-ledger-report" className="flex items-center gap-2 group">
                                <BookOpen className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Customer Ledger</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("customer_account_statement") || hasMenuAccess("customer_ledger")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customer-account-statement")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/customer-account-statement" className="flex items-center gap-2 group">
                                <BookOpen className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Customer Account Statement</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("customer_audit_report") || hasMenuAccess("customer_ledger")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/customer-audit-report")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/customer-audit-report" className="flex items-center gap-2 group" title="Verified customer outstanding balance">
                                <ShieldCheck className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Customer Audit Report</span>
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
                <SidebarMenuButton asChild isActive={isActive("/delivery-dashboard")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                  <NavLink to="/delivery-dashboard" className="flex items-center gap-2 group">
                    <PackageCheck className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-medium text-slate-200 dark:text-slate-200 group-hover:text-white">Delivery Status</span>}
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
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md py-1 px-2 transition-all duration-200 group">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-extrabold text-base uppercase tracking-wider text-white dark:text-white drop-shadow-sm group-hover:text-white">Accounts</span>}
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
                            <SidebarMenuSubButton asChild isActive={isActive("/accounts")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/accounts" className="flex items-center gap-2 group">
                                <Wallet className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Account Ledgers</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounts_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/chart-of-accounts")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/chart-of-accounts" className="flex items-center gap-2 group">
                                <BookOpen className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Chart of Accounts</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("accounts_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/journal-vouchers")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/journal-vouchers" className="flex items-center gap-2 group">
                                <BookOpen className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Journal Vouchers</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                        {(isAdminPermissions || hasMenuAccess("payments_dashboard")) && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild isActive={isActive("/payments-dashboard")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                              <NavLink to="/payments-dashboard" className="flex items-center gap-2 group">
                                <DollarSign className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                                <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Payments</span>
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

        {/* Settings - always visible for admin users, can be disabled via custom permissions */}
        {(isAdmin || isAdminPermissions || hasMainMenuAccess("settings")) && (
        <SidebarGroup>
          <Collapsible defaultOpen={isGroupActive(settingsPaths)} className="group/collapsible">
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 dark:hover:bg-[hsl(213,32%,22%)] rounded-md py-1 px-2 transition-all duration-200 group">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)] group-hover:animate-icon-spin-slow" />
                  {open && <span className="font-extrabold text-base uppercase tracking-wider text-white dark:text-white drop-shadow-sm group-hover:text-white">Settings</span>}
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
                        <SidebarMenuSubButton asChild isActive={isActive("/profile")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                          <NavLink to="/profile" className="flex items-center gap-2 group">
                            <User className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                            <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Profile</span>
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      {(isAdmin || isAdminPermissions || hasMenuAccess("settings_view")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/settings")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/settings" className="flex items-center gap-2 group">
                              <Settings className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Settings</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isAdmin || isAdminPermissions || hasMenuAccess("organization_management")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/organization-management")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/organization-management" className="flex items-center gap-2 group">
                              <Building2 className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Organization</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isAdmin || isAdminPermissions || hasMenuAccess("barcode_printing_settings")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/barcode-printing")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/barcode-printing" className="flex items-center gap-2 group">
                              <Barcode className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">Barcode Printing</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isAdmin || isAdminPermissions || hasMenuAccess("whatsapp_logs")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/whatsapp-logs")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/whatsapp-logs" className="flex items-center gap-2 group">
                              <MessageSquare className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">WhatsApp Logs</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                      {(isAdmin || isAdminPermissions || hasMenuAccess("whatsapp_inbox")) && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={isActive("/whatsapp-inbox")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                            <NavLink to="/whatsapp-inbox" className="flex items-center gap-2 group">
                              <Inbox className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                              <span className="text-slate-300 dark:text-slate-300 group-hover:text-white">WhatsApp Inbox</span>
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
                <SidebarMenuButton asChild isActive={isActive("/recycle-bin")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                  <NavLink to="/recycle-bin" className="flex items-center gap-2 group">
                    <Archive className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-medium text-slate-200 dark:text-slate-200 group-hover:text-white">Recycle Bin</span>}
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
                <SidebarMenuButton asChild isActive={isActive("/whatsapp-inbox")} className="text-slate-300 dark:text-slate-300 hover:text-white dark:hover:text-white dark:hover:bg-[hsl(213,32%,22%)] data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold">
                  <NavLink to="/whatsapp-inbox" className="flex items-center gap-2 group">
                    <MessageSquare className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
                    {open && <span className="font-medium text-slate-200 dark:text-slate-200 group-hover:text-white">WhatsApp Inbox</span>}
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
              <div className="flex items-center gap-2 px-2">
                <UIScaleSelector />
                {open && (
                  <span className="text-xs text-muted-foreground dark:text-white/50">Display</span>
                )}
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleToggleLock}
                className="dark:text-white dark:hover:bg-[hsl(213,32%,22%)] cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                title={isLocked ? "Collapse sidebar" : "Lock sidebar open"}
              >
                <div className="flex items-center gap-2">
                  {isLocked ? (
                    <ChevronsLeft className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)] flex-shrink-0" />
                  ) : (
                    <ChevronsRight className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)] flex-shrink-0" />
                  )}
                  {open && (
                    <span className="text-xs font-normal dark:text-white">
                      {isLocked ? "Collapse" : "Lock open"}
                    </span>
                  )}
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      {/* Sidebar Footer — user info */}
      <div className="mt-auto border-t border-white/[0.06] px-3 py-2">
        <div className="text-[9px] font-700 text-white/30 uppercase tracking-wider mb-1">
          Logged In As
        </div>
        <div className="text-[11px] font-semibold text-white/60">
          {currentUser?.email?.split("@")[0] || "Admin User"}
        </div>
        <div className="text-[9px] text-white/25 mt-0.5">
          {currentOrganization?.name}
        </div>
      </div>
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
            <div className="flex items-center gap-2 group">
              <Bot className="h-4 w-4 sidebar-icon dark:text-[hsl(187,100%,42%)]" />
              {open && <span className="font-medium text-slate-200 dark:text-slate-200 group-hover:text-white">AI Assistant</span>}
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
