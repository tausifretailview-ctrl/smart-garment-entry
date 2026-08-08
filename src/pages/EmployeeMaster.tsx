import { useState, useMemo } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { useCreateFormDraftPersistence } from "@/hooks/useCreateFormDraftPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ERPTable } from "@/components/erp-table";
import { cn } from "@/lib/utils";
import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import { DesktopContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";

interface Employee {
  id: string;
  employee_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  designation: string | null;
  joining_date: string | null;
  status: string;
  created_at: string;
  field_sales_access: boolean;
  user_id: string | null;
  commission_percent: number;
}

interface OrgUser {
  id: string;
  email: string;
  role: string;
}

const EmployeeMaster = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({
    employee_name: "",
    phone: "",
    email: "",
    address: "",
    designation: "",
    joining_date: "",
    status: "active",
    field_sales_access: false,
    user_id: "" as string,
    commission_percent: 1,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();

  const isDesktop = useIsDesktop();
  const rowContextMenu = useContextMenu<Employee>();

  const getEmployeeContextMenuItems = (employee: Employee): ContextMenuItem[] => [
    {
      label: "Edit",
      icon: Pencil,
      onClick: () => handleEdit(employee),
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Delete",
      icon: Trash2,
      onClick: () => handleDelete(employee.id),
      destructive: true,
    },
  ];

  const handleRowContextMenu = (e: React.MouseEvent, employee: Employee) => {
    if (!isDesktop) return;
    rowContextMenu.openMenu(e, employee);
  };

  useCreateFormDraftPersistence(
    `${WINDOW_FILTER_IDS.employees}:create`,
    currentOrganization?.id,
    isDialogOpen,
    formData,
    setIsDialogOpen,
    setFormData,
    { enabled: !editingEmployee },
  );

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.employees,
    currentOrganization?.id,
    useMemo(() => ({ searchQuery }), [searchQuery]),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [["searchQuery", setSearchQuery]],
      });
    },
  );

  // Fetch organization users for dropdown
  const { data: orgUsers = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["org-users", currentOrganization?.id],
    queryFn: async (): Promise<OrgUser[]> => {
      if (!currentOrganization?.id) return [];
      try {
        const { data: members, error: membersError } = await supabase
          .from("organization_members")
          .select("user_id, role")
          .eq("organization_id", currentOrganization.id);
        if (membersError) { console.error("Error fetching members:", membersError); return []; }
        if (!members || members.length === 0) return [];
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.access_token) return [];
        const response = await supabase.functions.invoke("get-users", {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        });
        if (response.error) { console.error("Error fetching users:", response.error); return []; }
        const allUsers = response.data?.users || [];
        const memberUserIds = members.map(m => m.user_id);
        return allUsers
          .filter((u: any) => memberUserIds.includes(u.id))
          .map((u: any) => ({ id: u.id, email: u.email, role: members.find(m => m.user_id === u.id)?.role || 'user' }));
      } catch (error) { console.error("Error in orgUsers query:", error); return []; }
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const allEmployees: Employee[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("employees").select("*").eq("organization_id", currentOrganization.id)
          .order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) { allEmployees.push(...(data as Employee[])); offset += PAGE_SIZE; hasMore = data.length === PAGE_SIZE; }
        else { hasMore = false; }
      }
      return allEmployees;
    },
    enabled: !!currentOrganization?.id,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
    staleTime: 5 * 60 * 1000,
  });

  const createEmployee = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");
      const { error } = await supabase.from("employees").insert([{ ...data, user_id: data.user_id || null, organization_id: currentOrganization.id }]);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); toast({ title: "Employee created successfully" }); resetForm(); setIsDialogOpen(false); },
    onError: (error) => { toast({ title: "Error creating employee", description: error.message, variant: "destructive" }); },
  });

  const updateEmployee = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from("employees").update({ ...data, user_id: data.user_id || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); toast({ title: "Employee updated successfully" }); resetForm(); setIsDialogOpen(false); },
    onError: (error) => { toast({ title: "Error updating employee", description: error.message, variant: "destructive" }); },
  });

  const { softDelete } = useSoftDelete();

  const deleteEmployee = useMutation({
    mutationFn: async (id: string) => { const success = await softDelete("employees", id); if (!success) throw new Error("Failed to delete employee"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); toast({ title: "Employee moved to recycle bin" }); },
    onError: (error: any) => { toast({ title: "Error deleting employee", description: error.message, variant: "destructive" }); },
  });

  const resetForm = () => {
    setFormData({ employee_name: "", phone: "", email: "", address: "", designation: "", joining_date: "", status: "active", field_sales_access: false, user_id: "", commission_percent: 1 });
    setEditingEmployee(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEmployee) { updateEmployee.mutate({ id: editingEmployee.id, data: formData }); }
    else { createEmployee.mutate(formData); }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      employee_name: employee.employee_name, phone: employee.phone || "", email: employee.email || "",
      address: employee.address || "", designation: employee.designation || "", joining_date: employee.joining_date || "",
      status: employee.status, field_sales_access: employee.field_sales_access || false, user_id: employee.user_id || "",
      commission_percent: employee.commission_percent ?? 1,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this employee?")) { deleteEmployee.mutate(id); }
  };

  const filteredEmployees = employees.filter((employee) =>
    employee.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    employee.designation?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    employee.phone?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ERPTable columns
  const tableColumns = useMemo<ColumnDef<Employee, any>[]>(() => [
    {
      accessorKey: "employee_name",
      header: "Employee Name",
      cell: ({ row }) => <span className="font-semibold text-foreground">{row.original.employee_name}</span>,
      size: 220,
    },
    { accessorKey: "designation", header: "Designation", cell: ({ row }) => row.original.designation || "-", size: 160 },
    {
      accessorKey: "commission_percent",
      header: "Commission %",
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 text-center block">
          {(row.original.commission_percent ?? 1).toFixed(1)}%
        </span>
      ),
      size: 120,
    },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => row.original.phone || "-", size: 140 },
    { accessorKey: "email", header: "Email", cell: ({ row }) => row.original.email || "-", size: 200 },
    {
      accessorKey: "joining_date",
      header: "Joining Date",
      cell: ({ row }) =>
        row.original.joining_date ? new Date(row.original.joining_date).toLocaleDateString() : "-",
      size: 130,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === "active" ? "default" : "secondary"}
          className="text-sm px-2.5 py-0.5"
        >
          {row.original.status}
        </Badge>
      ),
      size: 110,
    },
    {
      id: "field_sales",
      header: "Field Sales",
      cell: ({ row }) =>
        row.original.field_sales_access ? (
          <Badge variant="default" className="bg-green-600 text-sm px-2.5 py-0.5">
            <Smartphone className="h-3.5 w-3.5 mr-1" />
            Enabled
          </Badge>
        ) : (
          <Badge variant="outline" className="text-sm text-muted-foreground px-2.5 py-0.5">
            Disabled
          </Badge>
        ),
      size: 130,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(row.original);
            }}
          >
            <Pencil className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.original.id);
            }}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      ),
      size: 110,
    },
  ], []);

  return (
    <div className="employee-master-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 px-2 py-2 sm:px-3">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2">
        <div className="shrink-0 space-y-1">
          <div className="[&_button]:mb-0">
            <BackToDashboard />
          </div>
          <h1 className="text-2xl font-bold leading-none tracking-tight text-blue-700">Employee Master</h1>
          <p className="text-sm text-muted-foreground">Manage staff, commissions, and field sales access.</p>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 p-0 shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5">
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium tabular-nums text-slate-600">
              {employees.length} records
            </span>

            <div className="relative min-w-[220px] max-w-full flex-1 sm:max-w-md md:max-w-xl">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="SEARCH EMPLOYEES..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 border-slate-200 bg-slate-50 pl-10 text-base uppercase placeholder:normal-case focus:bg-white"
              />
            </div>

            <div id="erp-toolbar-portal-employee" className="flex items-center gap-1.5" />

            <div className="ml-auto shrink-0">
              <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  if (!open) resetForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button className="h-11 px-4 text-base">
                    <Plus className="h-5 w-5 mr-2" />
                    Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl">
                      {editingEmployee ? "Edit Employee" : "Add New Employee"}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4 text-base">
                    <div>
                      <Label htmlFor="employee_name">Employee Name *</Label>
                      <Input
                        id="employee_name"
                        value={formData.employee_name}
                        onChange={(e) => setFormData({ ...formData, employee_name: e.target.value })}
                        required
                        className="h-10 text-base"
                      />
                    </div>
                    <div>
                      <Label htmlFor="designation">Designation</Label>
                      <Input
                        id="designation"
                        value={formData.designation}
                        onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                        className="h-10 text-base"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="commission_percent">
                        Commission %{" "}
                        <span className="text-sm text-muted-foreground ml-2 font-normal">
                          default 1% = ₹1 per ₹100 sale
                        </span>
                      </Label>
                      <div className="flex items-center gap-3">
                        <Input
                          id="commission_percent"
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={formData.commission_percent}
                          onChange={(e) =>
                            setFormData({ ...formData, commission_percent: parseFloat(e.target.value) || 0 })
                          }
                          className="w-28 h-10 text-base"
                          placeholder="1.0"
                        />
                        <span className="text-sm text-muted-foreground">
                          = ₹{(formData.commission_percent || 0).toFixed(2)} earned per ₹100 sale
                        </span>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="h-10 text-base"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="h-10 text-base"
                      />
                    </div>
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <Textarea
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <Label htmlFor="joining_date">Joining Date</Label>
                      <Input
                        id="joining_date"
                        type="date"
                        value={formData.joining_date}
                        onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                        className="h-10 text-base"
                      />
                    </div>
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger className="h-10 text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                      <div className="space-y-0.5">
                        <Label
                          htmlFor="field_sales_access"
                          className="text-base font-medium flex items-center gap-2"
                        >
                          <Smartphone className="h-4 w-4" />
                          Field Sales App Access
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Allow this employee to use the Field Sales mobile app
                        </p>
                      </div>
                      <Switch
                        id="field_sales_access"
                        checked={formData.field_sales_access}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, field_sales_access: checked })
                        }
                      />
                    </div>
                    {formData.field_sales_access && (
                      <div>
                        <Label htmlFor="user_id">Link User Account *</Label>
                        <Select
                          value={formData.user_id || "none"}
                          onValueChange={(value) =>
                            setFormData({ ...formData, user_id: value === "none" ? "" : value })
                          }
                        >
                          <SelectTrigger className="h-10 text-base">
                            <SelectValue placeholder="Select user account..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No account linked</SelectItem>
                            {orgUsers.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.email} ({user.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground mt-1">
                          Link this employee to a user account for Field Sales app login
                        </p>
                      </div>
                    )}
                    <Button type="submit" className="w-full h-11 text-base">
                      {editingEmployee ? "Update" : "Create"} Employee
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="employee-master-table-panel min-h-0 flex-1 overflow-y-auto overflow-x-auto tab-scroll-stable">
            <ERPTable<Employee>
              tableId="employee_master"
              columns={tableColumns}
              data={filteredEmployees}
              stickyFirstColumn={false}
              fitToContainer
              isLoading={isLoading}
              emptyMessage="No employees found"
              defaultDensity="comfortable"
              showToolbar={false}
              onRowContextMenu={handleRowContextMenu}
              className={cn(
                "employee-master-table border-0 [&_.border]:border-0",
                "[&_td]:!text-base [&_th]:!text-sm [&_th]:!font-bold [&_th]:!uppercase [&_th]:!tracking-wide",
                "[&_tbody_tr:nth-child(even)]:bg-slate-50/80 [&_tbody_tr:hover]:bg-sky-50/70",
              )}
              renderToolbar={(toolbar) => {
                const el = document.getElementById("erp-toolbar-portal-employee");
                return el ? createPortal(toolbar, el) : toolbar;
              }}
            />
          </div>
        </Card>
      </div>

      {isDesktop && (
        <DesktopContextMenu
          isOpen={rowContextMenu.isOpen}
          position={rowContextMenu.position}
          items={rowContextMenu.contextData ? getEmployeeContextMenuItems(rowContextMenu.contextData) : []}
          onClose={rowContextMenu.closeMenu}
        />
      )}
    </div>
  );
};

export default EmployeeMaster;
