import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronRight, Shield, Users, Save } from "lucide-react";
import { Label } from "@/components/ui/label";
import { BackToDashboard } from "@/components/BackToDashboard";

// Define menu structure with submenus
const menuStructure = [
  {
    id: "dashboard",
    name: "Dashboard",
    submenus: [
      { id: "dashboard_view", name: "View Dashboard" },
      { id: "dashboard_customize", name: "Customize Dashboard" },
    ],
  },
  {
    id: "master",
    name: "Master",
    submenus: [
      { id: "customer_view", name: "Customer - View" },
      { id: "customer_insert", name: "Customer - Insert" },
      { id: "customer_edit", name: "Customer - Edit" },
      { id: "customer_delete", name: "Customer - Delete" },
      { id: "supplier_view", name: "Supplier - View" },
      { id: "supplier_insert", name: "Supplier - Insert" },
      { id: "supplier_edit", name: "Supplier - Edit" },
      { id: "supplier_delete", name: "Supplier - Delete" },
      { id: "employee_view", name: "Employee - View" },
      { id: "employee_insert", name: "Employee - Insert" },
      { id: "employee_edit", name: "Employee - Edit" },
      { id: "employee_delete", name: "Employee - Delete" },
    ],
  },
  {
    id: "inventory",
    name: "Inventory",
    submenus: [
      { id: "product_view", name: "Product - View" },
      { id: "product_insert", name: "Product - Insert" },
      { id: "product_edit", name: "Product - Edit" },
      { id: "product_delete", name: "Product - Delete" },
      { id: "stock_report", name: "Stock Report" },
      { id: "barcode_print", name: "Barcode Printing" },
    ],
  },
  {
    id: "purchase",
    name: "Purchase",
    submenus: [
      { id: "purchase_view", name: "Purchase Bill - View" },
      { id: "purchase_insert", name: "Purchase Bill - Insert" },
      { id: "purchase_edit", name: "Purchase Bill - Edit" },
      { id: "purchase_delete", name: "Purchase Bill - Delete" },
      { id: "purchase_return_view", name: "Purchase Return - View" },
      { id: "purchase_return_insert", name: "Purchase Return - Insert" },
    ],
  },
  {
    id: "sales",
    name: "Sales",
    submenus: [
      { id: "pos_view", name: "POS - View" },
      { id: "pos_insert", name: "POS - Insert" },
      { id: "pos_edit", name: "POS - Edit" },
      { id: "pos_delete", name: "POS - Delete" },
      { id: "invoice_view", name: "Sales Invoice - View" },
      { id: "invoice_insert", name: "Sales Invoice - Insert" },
      { id: "invoice_edit", name: "Sales Invoice - Edit" },
      { id: "invoice_delete", name: "Sales Invoice - Delete" },
      { id: "sale_return_view", name: "Sale Return - View" },
      { id: "sale_return_insert", name: "Sale Return - Insert" },
    ],
  },
  {
    id: "reports",
    name: "Reports",
    submenus: [
      { id: "sales_report", name: "Sales Report" },
      { id: "purchase_report", name: "Purchase Report" },
      { id: "stock_report_access", name: "Stock Report Access" },
      { id: "daily_cashier", name: "Daily Cashier Report" },
      { id: "product_tracking", name: "Product Tracking" },
    ],
  },
  {
    id: "accounts",
    name: "Accounts",
    submenus: [
      { id: "accounts_view", name: "Accounts - View" },
      { id: "accounts_manage", name: "Accounts - Manage" },
      { id: "customer_ledger", name: "Customer Ledger" },
      { id: "payment_recording", name: "Payment Recording" },
    ],
  },
  {
    id: "delivery",
    name: "Delivery Module",
    submenus: [
      { id: "delivery_view", name: "Delivery - View" },
      { id: "delivery_update", name: "Delivery - Update Status" },
      { id: "delivery_whatsapp", name: "Delivery - WhatsApp" },
    ],
  },
];

// Special rights that can be enabled/disabled
const specialRights = [
  { id: "modify_records", name: "Modify Records", description: "Allow editing existing records" },
  { id: "delete_records", name: "Delete Records", description: "Allow deleting records" },
  { id: "whatsapp_send", name: "WhatsApp Messaging", description: "Send messages via WhatsApp" },
  { id: "detail_accounting", name: "Detail Accounting", description: "Access detailed accounting features" },
  { id: "dashboard_customization", name: "Dashboard Customization", description: "Customize dashboard layout" },
  { id: "delivery_module", name: "Delivery Module Access", description: "Full access to delivery features" },
  { id: "export_data", name: "Export Data", description: "Export data to Excel/PDF" },
  { id: "audit_logs", name: "View Audit Logs", description: "Access audit log history" },
];

// Default basic permissions for new users
const defaultBasicPermissions: Record<string, boolean> = {
  dashboard_view: true,
  customer_view: true,
  supplier_view: true,
  product_view: true,
  pos_view: true,
  pos_insert: true,
  invoice_view: true,
  stock_report_access: true,
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
  const [specialPermissions, setSpecialPermissions] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

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
      
      // Get organization members
      const { data: orgMembers } = await supabase
        .from("organization_members")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .neq("role", "admin"); // Exclude admins
      
      // Match with user emails
      const membersWithEmail = (orgMembers || []).map((member: any) => {
        const userInfo = response.data?.find((u: any) => u.id === member.user_id);
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

  // Update permissions when user selection changes
  useEffect(() => {
    if (userPermissions?.permissions) {
      const perms = userPermissions.permissions as Record<string, any>;
      setPermissions(perms.menu || defaultBasicPermissions);
      setSpecialPermissions(perms.special || {});
    } else if (selectedUserId) {
      // Default permissions for new users
      setPermissions(defaultBasicPermissions);
      setSpecialPermissions({});
    }
  }, [userPermissions, selectedUserId]);

  // Save permissions mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id || !selectedUserId) {
        throw new Error("No user selected");
      }

      const permissionData = {
        menu: permissions,
        special: specialPermissions,
      };

      const { error } = await supabase
        .from("user_permissions")
        .upsert({
          organization_id: currentOrganization.id,
          user_id: selectedUserId,
          permissions: permissionData,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "organization_id,user_id",
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User permissions saved successfully");
      queryClient.invalidateQueries({ queryKey: ["user-permissions"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save permissions");
    },
  });

  const togglePermission = (id: string) => {
    setPermissions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSpecialPermission = (id: string) => {
    setSpecialPermissions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllInSection = (menuItem: typeof menuStructure[0]) => {
    const newPermissions = { ...permissions };
    menuItem.submenus.forEach((sub) => {
      newPermissions[sub.id] = true;
    });
    setPermissions(newPermissions);
  };

  const deselectAllInSection = (menuItem: typeof menuStructure[0]) => {
    const newPermissions = { ...permissions };
    menuItem.submenus.forEach((sub) => {
      newPermissions[sub.id] = false;
    });
    setPermissions(newPermissions);
  };

  if (!currentOrganization) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Please select an organization</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <BackToDashboard />
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              User Rights Management
            </h1>
            <p className="text-muted-foreground">Configure permissions for users in your organization</p>
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
            {/* Menu Permissions */}
            <Card>
              <CardHeader>
                <CardTitle>Menu & Feature Permissions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {permissionsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  menuStructure.map((menuItem) => (
                    <Collapsible
                      key={menuItem.id}
                      open={openSections[menuItem.id]}
                      onOpenChange={() => toggleSection(menuItem.id)}
                    >
                      <div className="border rounded-lg">
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            {openSections[menuItem.id] ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <span className="font-medium">{menuItem.name}</span>
                          </div>
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => selectAllInSection(menuItem)}
                            >
                              Select All
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deselectAllInSection(menuItem)}
                            >
                              Deselect All
                            </Button>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 pt-0">
                            {menuItem.submenus.map((sub) => (
                              <div key={sub.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={sub.id}
                                  checked={permissions[sub.id] || false}
                                  onCheckedChange={() => togglePermission(sub.id)}
                                />
                                <Label htmlFor={sub.id} className="text-sm cursor-pointer">
                                  {sub.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Special Rights */}
            <Card>
              <CardHeader>
                <CardTitle>Special Rights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {specialRights.map((right) => (
                    <div
                      key={right.id}
                      className="flex items-start space-x-3 p-3 border rounded-lg"
                    >
                      <Checkbox
                        id={right.id}
                        checked={specialPermissions[right.id] || false}
                        onCheckedChange={() => toggleSpecialPermission(right.id)}
                      />
                      <div className="space-y-1">
                        <Label htmlFor={right.id} className="font-medium cursor-pointer">
                          {right.name}
                        </Label>
                        <p className="text-sm text-muted-foreground">{right.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
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
    </Layout>
  );
};

export default UserRights;
