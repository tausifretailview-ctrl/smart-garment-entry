import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Search, 
  UserPlus, 
  GraduationCap,
  Phone,
  Mail,
  Edit,
  Eye,
  FileSpreadsheet
} from "lucide-react";
import { format } from "date-fns";
import { StudentExcelImportDialog } from "@/components/school/StudentExcelImportDialog";

const StudentMaster = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const [searchTerm, setSearchTerm] = useState("");
  const [showExcelImport, setShowExcelImport] = useState(false);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students", currentOrganization?.id, searchTerm],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from("students")
        .select(`
          *,
          school_classes (
            class_name,
            section
          ),
          academic_years (
            year_name
          )
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .order("student_name");

      if (searchTerm) {
        query = query.or(`student_name.ilike.%${searchTerm}%,admission_number.ilike.%${searchTerm}%,parent_phone.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: stats } = useQuery({
    queryKey: ["student-stats", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return { total: 0, active: 0 };

      const { count: total } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      const { count: active } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .eq("status", "active")
        .is("deleted_at", null);

      return { total: total || 0, active: active || 0 };
    },
    enabled: !!currentOrganization?.id,
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            Students
          </h1>
          <p className="text-muted-foreground">
            Manage student records and admissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowExcelImport(true)} 
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Button>
          <Button onClick={() => orgNavigate("/student-entry")} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Student
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.active || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Inactive/Left
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              {(stats?.total || 0) - (stats?.active || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, admission no, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adm. No</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading students...
                  </TableCell>
                </TableRow>
              ) : students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="text-muted-foreground">
                    {searchTerm ? "No students found matching your search" : "No students added yet"}
                    </div>
                    {!searchTerm && (
                      <Button 
                        variant="outline" 
                        className="mt-4 gap-2"
                        onClick={() => orgNavigate("/student-entry")}
                      >
                        <Plus className="h-4 w-4" />
                        Add First Student
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                students.map((student: any) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-mono text-sm">
                      {student.admission_number}
                    </TableCell>
                    <TableCell className="font-medium">
                      {student.student_name}
                    </TableCell>
                    <TableCell>
                      {student.school_classes ? (
                        <span>
                          {student.school_classes.class_name}
                          {student.school_classes.section && ` - ${student.school_classes.section}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{student.parent_name || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {student.parent_phone && (
                          <span className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3" />
                            {student.parent_phone}
                          </span>
                        )}
                        {student.parent_email && (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {student.parent_email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={student.status === "active" ? "default" : "secondary"}>
                        {student.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => orgNavigate(`/student-entry/${student.id}`)}
                        >
                          <Edit className="h-4 w-4" />
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

      {/* Excel Import Dialog */}
      <StudentExcelImportDialog 
        open={showExcelImport} 
        onOpenChange={setShowExcelImport} 
      />
    </div>
  );
};

export default StudentMaster;
