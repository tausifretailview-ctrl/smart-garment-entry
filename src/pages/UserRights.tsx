import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronRight, Shield, Users, Save, LayoutDashboard, Package, ShoppingCart, FileText, Truck, Wallet, UserCog, Calculator, Settings, Trash2, Columns } from "lucide-react";
import { Label } from "@/components/ui/label";
import { BackToDashboard } from "@/components/BackToDashboard";
import { cn } from "@/lib/utils";

// Define menu structure with main menus and submenus
const menuStructure = [
  {
    id: "dashboard",
    name: "Dashboard",
    icon: LayoutDashboard,
    submenus: [
      { id: "main_dashboard", name: "Main Dashboard" },
      { id: "dashboard_view", name: "View Dashboard" },
      { id: "dashboard_customize", name: "Customize Dashboard" },
    ],
  },
  {
    id: "master",
    name: "Master",
    icon: UserCog,
    submenus: [
      { id: "customer_master", name: "Customer Master" },
      { id: "supplier_master", name: "Supplier Master" },
      { id: "employee_master", name: "Employee Master" },
    ],
  },
  {
    id: "inventory",
    name: "Inventory",
    icon: Package,
    submenus: [
      { id: "product_dashboard", name: "Product Dashboard" },
      { id: "product_entry", name: "Product Entry" },
      { id: "purchase_order_entry", name: "Purchase Orders" },
      { id: "purchase_order_dashboard", name: "Purchase Order Dashboard" },
      { id: "purchase_bill", name: "Purchase Bill" },
      { id: "purchase_dashboard", name: "Purchase Dashboard" },
      { id: "purchase_return", name: "Purchase Return" },
      { id: "purchase_return_dashboard", name: "Purchase Returns Dashboard" },
      { id: "stock_report", name: "Stock Report" },
      { id: "barcode_printing", name: "Barcode Printing" },
    ],
  },
  {
    id: "sales",
    name: "Sales",
    icon: ShoppingCart,
    submenus: [
      { id: "pos_sales", name: "POS Sales" },
      { id: "pos_dashboard", name: "POS Dashboard" },
      { id: "sales_invoice", name: "Sales Invoice" },
      { id: "sales_invoice_dashboard", name: "Sales Invoice Dashboard" },
      { id: "quotation_entry", name: "Quotation Entry" },
      { id: "quotation_dashboard", name: "Quotation Dashboard" },
      { id: "sale_order_entry", name: "Sale Order Entry" },
      { id: "sale_order_dashboard", name: "Sale Order Dashboard" },
      { id: "sale_return", name: "Sale Return" },
      { id: "sale_return_dashboard", name: "Sale Return Dashboard" },
      { id: "delivery_challan_entry", name: "Delivery Challan" },
      { id: "delivery_challan_dashboard", name: "Delivery Challan Dashboard" },
    ],
  },
  {
    id: "reports",
    name: "Reports",
    icon: FileText,
    submenus: [
      { id: "stock_report", name: "Stock Report" },
      { id: "stock_analysis", name: "Stock Analysis" },
      { id: "stock_ageing", name: "Stock Ageing" },
      { id: "daily_cashier_report", name: "Daily Cashier Report" },
      { id: "daily_tally", name: "Daily Tally" },
      { id: "sale_analysis", name: "Sale Analysis" },
      { id: "einvoice_report", name: "E-Invoice Report" },
      { id: "sales_report_customer", name: "Sales Report by Customer" },
      { id: "purchase_report_supplier", name: "Purchase Report by Supplier" },
      { id: "item_wise_sales", name: "Item Wise Sales Report" },
      { id: "item_wise_stock", name: "Item Wise Stock Report" },
      { id: "gst_register", name: "GST Sale/Purchase Register" },
      { id: "product_tracking", name: "Product Tracking Report" },
      { id: "price_history", name: "Price History Report" },
      { id: "gst_reports", name: "GST Reports" },
      { id: "sales_analytics", name: "Sales Analytics Dashboard" },
      { id: "tally_export", name: "Tally Export" },
      { id: "accounting_reports_view", name: "Accounting Reports" },
      { id: "net_profit_analysis", name: "Net Profit Analysis" },
      { id: "hourly_sales_analysis", name: "Hourly Sales Analysis" },
      { id: "customer_ledger", name: "Customer Ledger" },
    ],
  },
  {
    id: "delivery",
    name: "Delivery Status",
    icon: Truck,
    submenus: [
      { id: "delivery_dashboard", name: "Delivery Dashboard" },
      { id: "delivery_update", name: "Update Delivery Status" },
      { id: "delivery_whatsapp", name: "WhatsApp Notifications" },
    ],
  },
  {
    id: "accounts",
    name: "Accounts",
    icon: Wallet,
    submenus: [
      { id: "accounts_dashboard", name: "Accounts Dashboard" },
      { id: "payments_dashboard", name: "Payments Dashboard" },
      { id: "payment_recording", name: "Record Payments" },
    ],
  },
  {
    id: "settings",
    name: "Settings",
    icon: Settings,
    submenus: [
      { id: "profile_view", name: "Profile" },
      { id: "settings_view", name: "Settings" },
      { id: "organization_management", name: "Organization" },
      { id: "barcode_printing_settings", name: "Barcode Printing" },
      { id: "whatsapp_logs", name: "WhatsApp Logs" },
      { id: "whatsapp_inbox", name: "WhatsApp Inbox" },
      { id: "recycle_bin", name: "Recycle Bin" },
      { id: "user_rights", name: "User Rights" },
      { id: "stock_adjustment", name: "Stock Adjustment" },
      { id: "stock_settlement", name: "Stock Settlement" },
      { id: "bulk_product_update", name: "Bulk Product Update" },
    ],
  },
];

// Special rights that can be enabled/disabled
const specialRights = [
  { id: "modify_records", name: "Modify Records", description: "Allow editing existing records" },
  { id: "delete_records", name: "Delete Records", description: "Allow deleting records" },
  { id: "cancel_invoice", name: "Cancel Invoice", description: "Allow cancelling sales/purchase invoices (reverses stock)" },
  { id: "edit_paid_invoices", name: "Edit Paid Invoices", description: "Allow editing and deleting fully paid invoices" },
  { id: "whatsapp_send", name: "WhatsApp Messaging", description: "Send messages via WhatsApp" },
  { id: "detail_accounting", name: "Detail Accounting", description: "Access detailed accounting features" },
  { id: "export_data", name: "Export Data", description: "Export data to Excel/PDF" },
  { id: "audit_logs", name: "View Audit Logs", description: "Access audit log history" },
  { id: "view_gross_profit", name: "View Gross Profit", description: "View profit margins and cost data on dashboard" },
  { id: "ai_chatbot", name: "AI Chatbot", description: "Access AI assistant for queries" },
  { id: "fee_structure_edit", name: "Edit Fee Structure", description: "Allow editing fee amounts and saving fee structure" },
  { id: "reset_data", name: "Reset Organization Data", description: "Allow resetting all organization data" },
  { id: "system_health", name: "System Health", description: "Access System Health diagnostics page (hidden by default)" },
];

// Column visibility config for modules
const columnConfig = [
  {
    id: "sales_invoice",
    name: "Sales Invoice Columns",
    columns: [
      { id: "hsn", name: "HSN" },
      { id: "box", name: "Box" },
      { id: "color", name: "Color" },
      { id: "mrp", name: "MRP" },
      { id: "disc_percent", name: "Disc%" },
      { id: "disc_amount", name: "Disc ₹" },
      { id: "gst", name: "GST%" },
    ],
  },
  {
    id: "purchase_bill",
    name: "Purchase Bill Columns",
    columns: [
      { id: "size", name: "Size" },
      { id: "gst", name: "GST%" },
      { id: "disc_percent", name: "Disc%" },
      { id: "mrp", name: "MRP" },
    ],
  },
  {
    id: "product_entry",
    name: "Add New Product Form (Purchase)",
    columns: [
      { id: "pur_gst", name: "Purchase GST %" },
      { id: "sale_gst", name: "Sale GST %" },
      { id: "markup", name: "Markup %" },
    ],
  },
];

// Default basic permissions for new users
const defaultBasicPermissions: Record<string, boolean> = {
  main_dashboard: true,
  dashboard_view: true,
  customer_master: true,
  product_dashboard: true,
  pos_sales: true,
  pos_dashboard: true,
};

// Default permissions for managers - more comprehensive access
const defaultManagerPermissions: Record<string, boolean> = {
  main_dashboard: true,
  dashboard_view: true,
  dashboard_customize: true,
  customer_master: true,
  supplier_master: true,
  employee_master: true,
  product_dashboard: true,
  product_entry: true,
  purchase_order_entry: false,
  purchase_order_dashboard: false,
  purchase_bill: true,
  purchase_dashboard: true,
  purchase_return: true,
  purchase_return_dashboard: true,
  stock_report: true,
  barcode_printing: true,
  pos_sales: true,
  pos_dashboard: true,
  sales_invoice: true,
  sales_invoice_dashboard: true,
  quotation_entry: true,
  quotation_dashboard: true,
  sale_order_entry: true,
  sale_order_dashboard: true,
  sale_return: true,
  sale_return_dashboard: true,
  stock_analysis: true,
  stock_ageing: true,
  daily_cashier_report: true,
  daily_tally: true,
  sale_analysis: true,
  einvoice_report: true,
  sales_report_customer: true,
  purchase_report_supplier: true,
  item_wise_sales: true,
  item_wise_stock: true,
  gst_register: true,
  product_tracking: true,
  price_history: true,
  gst_reports: true,
  sales_analytics: true,
  tally_export: true,
  accounting_reports_view: true,
  net_profit_analysis: true,
  hourly_sales_analysis: true,
  customer_ledger: true,
  delivery_dashboard: true,
  delivery_update: true,
  delivery_whatsapp: true,
  accounts_dashboard: true,
  payments_dashboard: true,
  payment_recording: true,
  settings_view: true,
  recycle_bin: true,
  user_rights: true,
  stock_adjustment: true,
};

const defaultManagerMainMenu: Record<string, boolean> = {
  dashboard: true,
  master: true,
  inventory: true,
  sales: true,
  reports: true,
  delivery: true,
  accounts: true,
  settings: true,
};

const defaultManagerSpecialRights: Record<string, boolean> = {
  modify_records: true,
  delete_records: false,
  cancel_invoice: true,
  whatsapp_send: true,
  detail_accounting: true,
  export_data: true,
  audit_logs: false,
  view_gross_profit: false,
  ai_chatbot: true,
};

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  email?: string;
}

const UserRights = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [mainMenuEnabled, setMainMenuEnabled] = useState<Record<string, boolean>>({});
  const [specialPermissions, setSpecialPermissions] = useState<Record<string, boolean>>({});
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

  // Fetch organization members (excluding admins - they have full access)
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["org-members", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) return [];

      const response = await supabase.functions.invoke("get-users", {
        headers: { Authorization: `Bearer ${session.session.access_token}` },
      });

      if (response.error) throw response.error;
      
      const { data: orgMembers } = await supabase
        .from("organization_members")
        .select("*")
        .eq("organization_id", currentOrganization.id);
      
      const users = response.data?.users || response.data || [];
      const membersWithEmail = (orgMembers || []).map((member: any) => {
        const userInfo = users.find((u: any) => u.id === member.user_id);
        return {
          ...member,
          email: userInfo?.email || "Unknown",
        };
      });
      
      return membersWithEmail as OrgMember[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch user permissions
  const { data: userPermissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ["user-permissions", currentOrganization?.id, selectedUserId],
    queryFn: async () => {
      if (!currentOrganization?.id || !selectedUserId) return null;
      
      const { data, error } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("user_id", selectedUserId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id && !!selectedUserId,
  });

  // Get selected user's role
  const selectedUserRole = members.find(m => m.user_id === selectedUserId)?.role;

  // Update permissions when user selection changes
  useEffect(() => {
    if (userPermissions?.permissions) {
      const perms = userPermissions.permissions as Record<string, any>;
      const menuPerms = perms.menu || (selectedUserRole === 'manager' ? defaultManagerPermissions : defaultBasicPermissions);
      const mainMenus = perms.mainMenu || (selectedUserRole === 'manager' ? defaultManagerMainMenu : {});
      
      setPermissions(menuPerms);
      setMainMenuEnabled(mainMenus);
      setSpecialPermissions(perms.special || (selectedUserRole === 'manager' ? defaultManagerSpecialRights : {}));
      setColumnVisibility(perms.columns || {});
    } else if (selectedUserId) {
      // Use manager defaults if user is a manager, otherwise use basic defaults
      if (selectedUserRole === 'manager') {
        setPermissions(defaultManagerPermissions);
        setMainMenuEnabled(defaultManagerMainMenu);
        setSpecialPermissions(defaultManagerSpecialRights);
      } else {
        setPermissions(defaultBasicPermissions);
        setMainMenuEnabled({
          dashboard: true,
          master: true,
          sales: true,
        });
        setSpecialPermissions({ cancel_invoice: true, delete_records: false });
      }
      setColumnVisibility({});
    }
  }, [userPermissions, selectedUserId, selectedUserRole]);

  // Save permissions mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id || !selectedUserId) {
        throw new Error("No user selected");
      }

      const permissionData = {
        menu: permissions,
        mainMenu: mainMenuEnabled,
        special: specialPermissions,
        columns: columnVisibility,
      };

      // First check if permission record exists
      const { data: existing } = await supabase
        .from("user_permissions")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .eq("user_id", selectedUserId)
        .maybeSingle();

      let error;
      if (existing?.id) {
        // Update existing record
        const result = await supabase
          .from("user_permissions")
          .update({
            permissions: permissionData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        error = result.error;
      } else {
        // Insert new record
        const result = await supabase
          .from("user_permissions")
          .insert({
            organization_id: currentOrganization.id,
            user_id: selectedUserId,
            permissions: permissionData,
          });
        error = result.error;
      }

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User permissions saved successfully");
      queryClient.invalidateQueries({ queryKey: ["user-permissions"] });
    },
    onError: (error: any) => {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to save permissions");
    },
  });

  const toggleMainMenu = (menuId: string) => {
    setMainMenuEnabled((prev) => {
      const newEnabled = !prev[menuId];
      // If disabling main menu, disable all submenus
      if (!newEnabled) {
        const menu = menuStructure.find(m => m.id === menuId);
        if (menu) {
          const newPermissions = { ...permissions };
          menu.submenus.forEach(sub => {
            newPermissions[sub.id] = false;
          });
          setPermissions(newPermissions);
        }
      }
      return { ...prev, [menuId]: newEnabled };
    });
  };

  const toggleSubmenu = (submenuId: string) => {
    setPermissions((prev) => ({ ...prev, [submenuId]: !prev[submenuId] }));
  };

  const toggleSpecialPermission = (id: string) => {
    setSpecialPermissions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleColumnVisibility = (moduleId: string, columnId: string) => {
    const key = `${moduleId}.${columnId}`;
    setColumnVisibility((prev) => ({ ...prev, [key]: prev[key] === false ? true : false }));
  };

  const toggleExpanded = (menuId: string) => {
    setExpandedMenus((prev) => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  const selectAllSubmenus = (menuItem: typeof menuStructure[0]) => {
    const newPermissions = { ...permissions };
    menuItem.submenus.forEach((sub) => {
      newPermissions[sub.id] = true;
    });
    setPermissions(newPermissions);
  };

  const deselectAllSubmenus = (menuItem: typeof menuStructure[0]) => {
    const newPermissions = { ...permissions };
    menuItem.submenus.forEach((sub) => {
      newPermissions[sub.id] = false;
    });
    setPermissions(newPermissions);
  };

  if (!currentOrganization) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select an organization</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <BackToDashboard />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            User Rights Management
          </h1>
          <p className="text-muted-foreground">Configure menu and feature permissions for users</p>
        </div>
      </div>

      {/* User Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Select User
          </CardTitle>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : members.length === 0 ? (
            <p className="text-muted-foreground">No users found (admins have full access by default)</p>
          ) : (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Select a user to configure permissions" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.email} ({member.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedUserId && (
        <>
          {/* Menu Permissions - Hierarchical Structure */}
          <Card>
            <CardHeader>
              <CardTitle>Menu Access Rights</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enable main menu to allow access, then select specific sub-menus
              </p>
            </CardHeader>
            <CardContent>
              {permissionsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <div className="space-y-2">
                  {menuStructure.map((menuItem) => {
                    const Icon = menuItem.icon;
                    const isMainEnabled = mainMenuEnabled[menuItem.id] || false;
                    const isExpanded = expandedMenus[menuItem.id] || false;
                    const enabledCount = menuItem.submenus.filter(sub => permissions[sub.id]).length;
                    
                    return (
                      <div key={menuItem.id} className="border rounded-lg overflow-hidden">
                        {/* Main Menu Header */}
                        <div className="flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id={`main-${menuItem.id}`}
                              checked={isMainEnabled}
                              onCheckedChange={() => toggleMainMenu(menuItem.id)}
                            />
                            <button
                              onClick={() => toggleExpanded(menuItem.id)}
                              className="flex items-center gap-2 text-left"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <Icon className="h-4 w-4" />
                              <span className="font-medium">{menuItem.name}</span>
                            </button>
                            {isMainEnabled && (
                              <span className="text-xs text-muted-foreground bg-primary/10 px-2 py-0.5 rounded">
                                {enabledCount}/{menuItem.submenus.length} enabled
                              </span>
                            )}
                          </div>
                          {isMainEnabled && (
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => selectAllSubmenus(menuItem)}
                                className="text-xs h-7"
                              >
                                All
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deselectAllSubmenus(menuItem)}
                                className="text-xs h-7"
                              >
                                None
                              </Button>
                            </div>
                          )}
                        </div>
                        
                        {/* Submenus */}
                        {isExpanded && (
                          <div className={cn(
                            "border-t transition-all",
                            !isMainEnabled && "opacity-50 pointer-events-none"
                          )}>
                            <div className="p-3 space-y-2 bg-background">
                              {menuItem.submenus.map((sub) => (
                                <div
                                  key={sub.id}
                                  className="flex items-center gap-3 pl-8 py-1.5 hover:bg-muted/30 rounded-md transition-colors"
                                >
                                  <Checkbox
                                    id={sub.id}
                                    checked={permissions[sub.id] || false}
                                    onCheckedChange={() => toggleSubmenu(sub.id)}
                                    disabled={!isMainEnabled}
                                  />
                                  <Label
                                    htmlFor={sub.id}
                                    className={cn(
                                      "text-sm cursor-pointer",
                                      !isMainEnabled && "text-muted-foreground"
                                    )}
                                  >
                                    {sub.name}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Special Rights */}
          <Card>
            <CardHeader>
              <CardTitle>Special Rights</CardTitle>
              <p className="text-sm text-muted-foreground">
                Additional permissions for specific actions
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {specialRights.map((right) => (
                  <div
                    key={right.id}
                    className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <Checkbox
                      id={right.id}
                      checked={specialPermissions[right.id] || false}
                      onCheckedChange={() => toggleSpecialPermission(right.id)}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor={right.id} className="font-medium cursor-pointer">
                        {right.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">{right.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Column Visibility */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Columns className="h-5 w-5" />
                Column Visibility
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Show or hide specific columns in billing forms
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {columnConfig.map((module) => (
                  <div key={module.id}>
                    <h4 className="font-semibold text-sm mb-3">{module.name}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {module.columns.map((col) => {
                        const key = `${module.id}.${col.id}`;
                        const isVisible = columnVisibility[key] !== false;
                        return (
                          <div
                            key={col.id}
                            className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-muted/30 transition-colors"
                          >
                            <Checkbox
                              id={key}
                              checked={isVisible}
                              onCheckedChange={() => toggleColumnVisibility(module.id, col.id)}
                            />
                            <Label htmlFor={key} className="text-sm cursor-pointer">
                              {col.name}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              size="lg"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Permissions
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default UserRights;
