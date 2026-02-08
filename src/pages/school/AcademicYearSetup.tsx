import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Calendar, Star, Edit, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";

const AcademicYearSetup = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<any>(null);
  const [formData, setFormData] = useState({
    year_name: "",
    start_date: "",
    end_date: "",
  });

  const { data: academicYears = [], isLoading } = useQuery({
    queryKey: ["academic-years", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization");

      if (editingYear) {
        const { error } = await supabase
          .from("academic_years")
          .update({
            year_name: formData.year_name,
            start_date: formData.start_date,
            end_date: formData.end_date,
          })
          .eq("id", editingYear.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("academic_years").insert({
          organization_id: currentOrganization.id,
          year_name: formData.year_name,
          start_date: formData.start_date,
          end_date: formData.end_date,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success(editingYear ? "Year updated" : "Year added");
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const setCurrentMutation = useMutation({
    mutationFn: async (yearId: string) => {
      if (!currentOrganization?.id) throw new Error("No organization");

      // First, unset all current years
      await supabase
        .from("academic_years")
        .update({ is_current: false })
        .eq("organization_id", currentOrganization.id);

      // Then set the selected one as current
      const { error } = await supabase
        .from("academic_years")
        .update({ is_current: true })
        .eq("id", yearId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("Current year updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (yearId: string) => {
      const { error } = await supabase
        .from("academic_years")
        .delete()
        .eq("id", yearId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("Year deleted");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setFormData({ year_name: "", start_date: "", end_date: "" });
    setEditingYear(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (year: any) => {
    setEditingYear(year);
    setFormData({
      year_name: year.year_name,
      start_date: year.start_date,
      end_date: year.end_date,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.year_name || !formData.start_date || !formData.end_date) {
      toast.error("Please fill all fields");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Academic Years
          </h1>
          <p className="text-muted-foreground">
            Manage academic year periods
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={() => resetForm()}>
              <Plus className="h-4 w-4" />
              Add Year
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingYear ? "Edit Academic Year" : "Add Academic Year"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="year_name">Year Name *</Label>
                <Input
                  id="year_name"
                  value={formData.year_name}
                  onChange={(e) => setFormData({ ...formData, year_name: e.target.value })}
                  placeholder="e.g., 2024-25"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingYear ? "Update" : "Add"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year Name</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : academicYears.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No academic years configured
                  </TableCell>
                </TableRow>
              ) : (
                academicYears.map((year: any) => (
                  <TableRow key={year.id}>
                    <TableCell className="font-medium">{year.year_name}</TableCell>
                    <TableCell>{format(new Date(year.start_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{format(new Date(year.end_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      {year.is_current ? (
                        <Badge className="gap-1">
                          <Star className="h-3 w-3" />
                          Current
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCurrentMutation.mutate(year.id)}
                        >
                          Set as Current
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(year)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this academic year?")) {
                              deleteMutation.mutate(year.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AcademicYearSetup;
