import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { ColumnDef } from "@tanstack/react-table";
import { ERPTable } from "@/components/erp-table";

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
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();

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
    setFormData({ employee_name: "", phone: "", email: "", address: "", designation: "", joining_date: "", status: "active", field_sales_access: false, user_id: "" });
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
    { accessorKey: "employee_name", header: "Employee Name", cell: ({ row }) => <span className="font-medium">{row.original.employee_name}</span>, size: 200 },
    { accessorKey: "designation", header: "Designation", cell: ({ row }) => row.original.designation || "-", size: 150 },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => row.original.phone || "-", size: 130 },
    { accessorKey: "email", header: "Email", cell: ({ row }) => row.original.email || "-", size: 180 },
    {
      accessorKey: "joining_date", header: "Joining Date",
      cell: ({ row }) => row.original.joining_date ? new Date(row.original.joining_date).toLocaleDateString() : "-",
      size: 120,
    },
    {
      accessorKey: "status", header: "Status",
      cell: ({ row }) => <Badge variant={row.original.status === "active" ? "default" : "secondary"}>{row.original.status}</Badge>,
      size: 100,
    },
    {
      id: "field_sales",
      header: "Field Sales",
      cell: ({ row }) => row.original.field_sales_access
        ? <Badge variant="default" className="bg-green-600"><Smartphone className="h-3 w-3 mr-1" />Enabled</Badge>
        : <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>,
      size: 110,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(row.original); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(row.original.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      size: 100,
    },
  ], []);

  return (
    <div className="w-full px-6 py-6 space-y-6">
      <BackToDashboard />
      
      <div className="flex items-center gap-4">
        <h1 className="text-[20px] font-bold text-foreground shrink-0">Employee Master</h1>
        <span className="text-[12px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium shrink-0">
          {employees.length} records
        </span>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-sm pl-9"
          />
        </div>

        <div id="erp-toolbar-portal-employee" className="flex items-center gap-2" />

        <div className="ml-auto shrink-0">
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingEmployee ? "Edit Employee" : "Add New Employee"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="employee_name">Employee Name *</Label>
                  <Input id="employee_name" value={formData.employee_name} onChange={(e) => setFormData({ ...formData, employee_name: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="designation">Designation</Label>
                  <Input id="designation" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Textarea id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="joining_date">Joining Date</Label>
                  <Input id="joining_date" type="date" value={formData.joining_date} onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                  <div className="space-y-0.5">
                    <Label htmlFor="field_sales_access" className="text-base font-medium flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Field Sales App Access
                    </Label>
                    <p className="text-sm text-muted-foreground">Allow this employee to use the Field Sales mobile app</p>
                  </div>
                  <Switch id="field_sales_access" checked={formData.field_sales_access} onCheckedChange={(checked) => setFormData({ ...formData, field_sales_access: checked })} />
                </div>
                {formData.field_sales_access && (
                  <div>
                    <Label htmlFor="user_id">Link User Account *</Label>
                    <Select value={formData.user_id || "none"} onValueChange={(value) => setFormData({ ...formData, user_id: value === "none" ? "" : value })}>
                      <SelectTrigger><SelectValue placeholder="Select user account..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No account linked</SelectItem>
                        {orgUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>{user.email} ({user.role})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Link this employee to a user account for Field Sales app login</p>
                  </div>
                )}
                <Button type="submit" className="w-full">{editingEmployee ? "Update" : "Create"} Employee</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ERPTable<Employee>
        tableId="employee_master"
        columns={tableColumns}
        data={filteredEmployees}
        stickyFirstColumn={false}
        isLoading={isLoading}
        emptyMessage="No employees found"
        defaultDensity="compact"
        showToolbar={false}
        renderToolbar={(toolbar) => {
          const el = document.getElementById('erp-toolbar-portal-employee');
          return el ? createPortal(toolbar, el) : toolbar;
        }}
      />
    </div>
  );
};

export default EmployeeMaster;
