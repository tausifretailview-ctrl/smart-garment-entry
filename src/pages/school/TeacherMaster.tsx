import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GraduationCap, Loader2, Search, Phone, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Teacher {
  id: string;
  employee_name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string | null;
  joining_date: string | null;
  organization_id: string;
}

const TeacherMaster = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    employee_name: "",
    designation: "Teacher",
    email: "",
    phone: "",
    address: "",
    status: "active",
    joining_date: "",
  });

  const { data: teachers, isLoading } = useQuery({
    queryKey: ["teachers", currentOrganization?.id, searchQuery],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      let query = supabase
        .from("employees")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .or("designation.ilike.%teacher%,designation.ilike.%professor%,designation.ilike.%lecturer%,designation.ilike.%instructor%,designation.ilike.%faculty%")
        .order("employee_name", { ascending: true });

      if (searchQuery) {
        query = query.or(`employee_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Teacher[];
    },
    enabled: !!currentOrganization?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("employees").insert({
        ...data,
        organization_id: currentOrganization!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      toast.success("Teacher added successfully");
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add teacher");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("employees")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      toast.success("Teacher updated successfully");
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update teacher");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("employees")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      toast.success("Teacher removed successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to remove teacher");
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingTeacher(null);
    setFormData({
      employee_name: "",
      designation: "Teacher",
      email: "",
      phone: "",
      address: "",
      status: "active",
      joining_date: "",
    });
  };

  const openCreateDialog = () => {
    setEditingTeacher(null);
    setFormData({
      employee_name: "",
      designation: "Teacher",
      email: "",
      phone: "",
      address: "",
      status: "active",
      joining_date: new Date().toISOString().split("T")[0],
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      employee_name: teacher.employee_name,
      designation: teacher.designation || "Teacher",
      email: teacher.email || "",
      phone: teacher.phone || "",
      address: teacher.address || "",
      status: teacher.status || "active",
      joining_date: teacher.joining_date || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.employee_name.trim()) {
      toast.error("Teacher name is required");
      return;
    }

    if (editingTeacher) {
      updateMutation.mutate({ id: editingTeacher.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  if (!currentOrganization) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Teachers</h1>
            <p className="text-muted-foreground">
              Manage teaching staff and faculty members
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Teacher
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Teachers</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search teachers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : teachers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No teachers found.</p>
              <p className="text-sm">Click "Add Teacher" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-sidebar">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers?.map((teacher, index) => (
                  <TableRow key={teacher.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium">{teacher.employee_name}</TableCell>
                    <TableCell>{teacher.designation || "-"}</TableCell>
                    <TableCell>
                      {teacher.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {teacher.phone}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      {teacher.email ? (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {teacher.email}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={teacher.status === "active" ? "default" : "secondary"}
                      >
                        {teacher.status || "active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(teacher)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(teacher.id, teacher.employee_name)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTeacher ? "Edit Teacher" : "Add New Teacher"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="employee_name">Full Name *</Label>
              <Input
                id="employee_name"
                value={formData.employee_name}
                onChange={(e) =>
                  setFormData({ ...formData, employee_name: e.target.value })
                }
                placeholder="Enter teacher's full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designation">Designation</Label>
              <Input
                id="designation"
                value={formData.designation}
                onChange={(e) =>
                  setFormData({ ...formData, designation: e.target.value })
                }
                placeholder="e.g., Senior Teacher, HOD"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="Email address"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="joining_date">Joining Date</Label>
              <Input
                id="joining_date"
                type="date"
                value={formData.joining_date}
                onChange={(e) =>
                  setFormData({ ...formData, joining_date: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Full address"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {editingTeacher ? "Update" : "Add Teacher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherMaster;
