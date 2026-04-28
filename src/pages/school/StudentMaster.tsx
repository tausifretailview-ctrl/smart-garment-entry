import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Search, 
  UserPlus, 
  GraduationCap,
  Phone,
  Mail,
  Edit,
  Trash2,
  Loader2,
  FileSpreadsheet,
  Upload,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StudentExcelImportDialog } from "@/components/school/StudentExcelImportDialog";
import { StudentBulkUpdateDialog } from "@/components/school/StudentBulkUpdateDialog";
import { FeesBalanceImportDialog } from "@/components/school/FeesBalanceImportDialog";
import { StudentHistoryDialog } from "@/components/school/StudentHistoryDialog";

const PAGE_SIZE = 50;

const StudentMaster = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [showFeesImport, setShowFeesImport] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [historyStudent, setHistoryStudent] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [filterNewAdmissions, setFilterNewAdmissions] = useState(false);

  // Fetch academic years
  const { data: academicYears } = useQuery({
    queryKey: ["academic-years-list", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .order("start_date", { ascending: false });
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Set default to current academic year
  useEffect(() => {
    if (academicYears && academicYears.length > 0 && !selectedYearId) {
      const current = academicYears.find((y: any) => y.is_current);
      if (current) setSelectedYearId(current.id);
      else setSelectedYearId(academicYears[0].id);
    }
  }, [academicYears, selectedYearId]);

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    setFilterNewAdmissions(false);
  };

  // Get academic start date for new admissions filter
  const selectedYear = (academicYears || []).find((y: any) => y.id === selectedYearId);
  const academicStart = selectedYear?.start_date || "2026-04-01";

  const { data: studentsResult, isLoading } = useQuery({
    queryKey: ["students", currentOrganization?.id, searchTerm, currentPage, selectedYearId, filterNewAdmissions],
    queryFn: async () => {
      if (!currentOrganization?.id || !selectedYearId) return { data: [], count: 0 };

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

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
        `, { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .eq("academic_year_id", selectedYearId)
        .is("deleted_at", null)
        .order("student_name")
        .range(from, to);

      if (searchTerm) {
        query = query.or(`student_name.ilike.%${searchTerm}%,admission_number.ilike.%${searchTerm}%,parent_phone.ilike.%${searchTerm}%`);
      }

      // Filter for new admissions
      if (filterNewAdmissions) {
        query = query.eq("is_new_admission", true);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    enabled: !!currentOrganization?.id && !!selectedYearId,
  });

  const students = studentsResult?.data || [];
  const totalCount = studentsResult?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch closing fee balance for the students currently on screen.
  // Formula mirrors FeeCollection: opening + structure_expected + adjustments − receipts
  const studentIds = students.map((s: any) => s.id);
  const classIds = [...new Set(students.map((s: any) => s.class_id).filter(Boolean))] as string[];

  const { data: balanceMap } = useQuery({
    queryKey: ["students-closing-balances", currentOrganization?.id, selectedYearId, studentIds.join(",")],
    queryFn: async () => {
      if (!currentOrganization?.id || !selectedYearId || studentIds.length === 0) return {};

      const [structuresRes, paymentsRes, adjustmentsRes] = await Promise.all([
        classIds.length > 0
          ? supabase
              .from("fee_structures")
              .select("class_id, amount, frequency")
              .eq("organization_id", currentOrganization.id)
              .eq("academic_year_id", selectedYearId)
              .in("class_id", classIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("student_fees")
          .select("student_id, paid_amount, status")
          .eq("organization_id", currentOrganization.id)
          .in("student_id", studentIds)
          .in("status", ["paid", "partial"])
          .gt("paid_amount", 0),
        (supabase.from("student_balance_audit" as any) as any)
          .select("student_id, adjustment_type, change_amount")
          .eq("organization_id", currentOrganization.id)
          .in("student_id", studentIds),
      ]);

      const structures = (structuresRes as any).data || [];
      const payments = (paymentsRes as any).data || [];
      const adjustments = (adjustmentsRes as any).data || [];

      // Per-class expected total
      const expectedByClass: Record<string, number> = {};
      for (const s of structures) {
        const mult = s.frequency === "monthly" ? 12 : s.frequency === "quarterly" ? 4 : 1;
        expectedByClass[s.class_id] = (expectedByClass[s.class_id] || 0) + (s.amount || 0) * mult;
      }

      const paidByStudent: Record<string, number> = {};
      for (const p of payments) {
        paidByStudent[p.student_id] = (paidByStudent[p.student_id] || 0) + (p.paid_amount || 0);
      }

      const adjByStudent: Record<string, number> = {};
      for (const a of adjustments) {
        const v = a.adjustment_type === "credit" ? (a.change_amount || 0)
               : a.adjustment_type === "debit" ? -(a.change_amount || 0)
               : 0;
        adjByStudent[a.student_id] = (adjByStudent[a.student_id] || 0) + v;
      }

      const map: Record<string, number> = {};
      for (const st of students) {
        const opening = st.closing_fees_balance || 0;
        const expected = expectedByClass[st.class_id] || 0;
        const paid = paidByStudent[st.id] || 0;
        const adj = adjByStudent[st.id] || 0;
        // MAX(opening, structure) — opening balance and fee structure are
        // alternative views of the same liability, not cumulative.
        const liability = Math.max(opening, expected);
        const due = Math.max(0, liability + adj - paid);
        map[st.id] = due;
      }
      return map;
    },
    enabled: !!currentOrganization?.id && !!selectedYearId && studentIds.length > 0,
  });

  const { data: stats } = useQuery({
    queryKey: ["student-stats", currentOrganization?.id, selectedYearId],
    queryFn: async () => {
      if (!currentOrganization?.id || !selectedYearId) return { total: 0, active: 0, newAdmissions: 0 };

      const { count: total } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .eq("academic_year_id", selectedYearId)
        .is("deleted_at", null);

      const { count: active } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .eq("academic_year_id", selectedYearId)
        .eq("status", "active")
        .is("deleted_at", null);

      // New admissions: students explicitly marked as new admission
      const { count: newAdmissions } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .eq("academic_year_id", selectedYearId)
        .is("deleted_at", null)
        .eq("is_new_admission", true);

      return { total: total || 0, active: active || 0, newAdmissions: newAdmissions || 0 };
    },
    enabled: !!currentOrganization?.id && !!selectedYearId,
  });

  const handleDeleteStudent = async () => {
    if (!studentToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("students")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", studentToDelete.id);
      if (error) throw error;
      toast({ title: "Success", description: "Student moved to recycle bin" });
      setStudentToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["student-stats"] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

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
            onClick={() => setShowFeesImport(true)} 
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Fees Balance
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowBulkUpdate(true)} 
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Bulk Update
          </Button>
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${filterNewAdmissions ? 'ring-2 ring-emerald-500' : ''}`}
          onClick={() => { setFilterNewAdmissions(!filterNewAdmissions); setCurrentPage(1); }}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600">
              New Admissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats?.newAdmissions || 0}</div>
            <p className="text-xs text-muted-foreground">
              {filterNewAdmissions ? "Showing filtered" : "This academic year"}
            </p>
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

      {/* Search & Year Filter */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, admission no, or phone..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedYearId || ""} onValueChange={(val) => { setSelectedYearId(val); setCurrentPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Academic Year" />
          </SelectTrigger>
          <SelectContent>
            {(academicYears || []).map((y: any) => (
              <SelectItem key={y.id} value={y.id}>
                {y.year_name} {y.is_current ? "(Current)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Sr No</TableHead>
                <TableHead>Adm. No</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Division</TableHead>
                <TableHead>Roll No</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Closing Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8">
                    Loading students...
                  </TableCell>
                </TableRow>
              ) : students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8">
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
                students.map((student: any, index: number) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {(currentPage - 1) * PAGE_SIZE + index + 1}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {student.admission_number}
                    </TableCell>
                    <TableCell>
                      <button
                        className="text-primary hover:underline font-medium text-left cursor-pointer bg-transparent border-none p-0"
                        onClick={() => { setHistoryStudent(student); setHistoryOpen(true); }}
                      >
                        {student.student_name}
                      </button>
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
                    <TableCell>{student.division || "-"}</TableCell>
                    <TableCell>{student.roll_number || "-"}</TableCell>
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
                    <TableCell className="text-right font-mono">
                      {(() => {
                        const bal = balanceMap?.[student.id];
                        if (bal === undefined) return <span className="text-muted-foreground">—</span>;
                        return (
                          <span className={bal > 0 ? "text-destructive font-semibold" : "text-emerald-600"}>
                            ₹{bal.toFixed(2)}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={student.status === "active" ? "default" : "secondary"}>
                        {student.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => orgNavigate(`/student-entry/${student.id}`)}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setStudentToDelete(student)}
                          className="text-destructive hover:text-destructive"
                          title="Delete"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-muted">
              <span className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} students
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm font-medium px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Excel Import Dialog */}
      <StudentExcelImportDialog 
        open={showExcelImport} 
        onOpenChange={setShowExcelImport} 
      />

      {/* Bulk Update Dialog */}
      <StudentBulkUpdateDialog 
        open={showBulkUpdate} 
        onOpenChange={setShowBulkUpdate} 
      />

      {/* Fees Balance Import Dialog */}
      <FeesBalanceImportDialog 
        open={showFeesImport} 
        onOpenChange={setShowFeesImport} 
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!studentToDelete} onOpenChange={(open) => !open && setStudentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{studentToDelete?.student_name}</strong> ({studentToDelete?.admission_number})? This will move the record to the recycle bin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStudent}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StudentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        student={historyStudent}
      />
    </div>
  );
};

export default StudentMaster;
