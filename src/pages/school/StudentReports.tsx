import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GraduationCap, Search, Download, Users, Eye } from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { StudentHistoryDialog } from "@/components/school/StudentHistoryDialog";

const StudentReports = () => {
  const { currentOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState("details");
  const [classFilter, setClassFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [historyStudent, setHistoryStudent] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Fetch academic years
  const { data: academicYears = [] } = useQuery({
    queryKey: ["academic-years-report", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch school classes
  const { data: schoolClasses = [] } = useQuery({
    queryKey: ["school-classes-report", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_classes")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch all students with class info
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["students-report", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(`
          id, admission_number, student_name, date_of_birth, gender,
          parent_name, parent_phone, division, roll_number, status,
          admission_date, class_id, academic_year_id,
          school_classes (class_name, display_order),
          academic_years (year_name)
        `)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .eq("status", "active")
        .order("student_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Get unique divisions from data
  const divisions = useMemo(() => {
    const divSet = new Set(students.map((s: any) => s.division).filter(Boolean));
    return Array.from(divSet).sort();
  }, [students]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    return students.filter((s: any) => {
      if (classFilter !== "all" && s.class_id !== classFilter) return false;
      if (divisionFilter !== "all" && s.division !== divisionFilter) return false;
      if (yearFilter !== "all" && s.academic_year_id !== yearFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          s.student_name?.toLowerCase().includes(term) ||
          s.admission_number?.toLowerCase().includes(term) ||
          s.parent_name?.toLowerCase().includes(term) ||
          s.parent_phone?.includes(term)
        );
      }
      return true;
    });
  }, [students, classFilter, divisionFilter, yearFilter, searchTerm]);

  // Registration summary data (class + division wise)
  const summaryData = useMemo(() => {
    const map = new Map<string, { class_name: string; division: string; display_order: number; total: number; male: number; female: number }>();

    filteredStudents.forEach((s: any) => {
      const className = s.school_classes?.class_name || "Unknown";
      const division = s.division || "-";
      const key = `${className}__${division}`;
      const displayOrder = s.school_classes?.display_order || 999;

      if (!map.has(key)) {
        map.set(key, { class_name: className, division, display_order: displayOrder, total: 0, male: 0, female: 0 });
      }
      const entry = map.get(key)!;
      entry.total++;
      if (s.gender?.toLowerCase() === "male") entry.male++;
      else if (s.gender?.toLowerCase() === "female") entry.female++;
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return a.division.localeCompare(b.division);
    });
  }, [filteredStudents]);

  const grandTotal = summaryData.reduce((sum, r) => sum + r.total, 0);
  const grandMale = summaryData.reduce((sum, r) => sum + r.male, 0);
  const grandFemale = summaryData.reduce((sum, r) => sum + r.female, 0);

  // Export to Excel
  const handleExport = () => {
    if (activeTab === "details") {
      const rows = filteredStudents.map((s: any, i: number) => ({
        "Sr No": i + 1,
        "GR No": s.admission_number || "",
        "Roll No": s.roll_number || "",
        "Student Name": s.student_name,
        "Gender": s.gender || "",
        "Class": s.school_classes?.class_name || "",
        "Division": s.division || "",
        "Date of Birth": s.date_of_birth ? format(new Date(s.date_of_birth), "dd-MMM-yyyy") : "",
        "Admission Date": s.admission_date ? format(new Date(s.admission_date), "dd-MMM-yyyy") : "",
        "Academic Year": (s as any).academic_years?.year_name || "",
        "Parent Name": s.parent_name || "",
        "Phone": s.parent_phone || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Student Report");
      XLSX.writeFile(wb, `Student_Report_${format(new Date(), "yyyyMMdd")}.xlsx`);
    } else {
      const rows = summaryData.map((r) => ({
        "Class": r.class_name,
        "Division": r.division,
        "Active Students": r.total,
        "Male": r.male,
        "Female": r.female,
      }));
      rows.push({ "Class": "TOTAL", "Division": "", "Active Students": grandTotal, "Male": grandMale, "Female": grandFemale });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Registration Summary");
      XLSX.writeFile(wb, `Student_Registration_Summary_${format(new Date(), "yyyyMMdd")}.xlsx`);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Student Reports</h1>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          Export Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Academic Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {academicYears.map((y: any) => (
                  <SelectItem key={y.id} value={y.id}>{y.year_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {schoolClasses.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={divisionFilter} onValueChange={setDivisionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Division" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Divisions</SelectItem>
                {divisions.map((d: string) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="details" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Student Details
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-2">
            <Users className="h-4 w-4" />
            Registration Summary
          </TabsTrigger>
        </TabsList>

        {/* Student Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Showing {filteredStudents.length} students
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-340px)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Sr</TableHead>
                        <TableHead>GR No</TableHead>
                        <TableHead>Roll No</TableHead>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Div</TableHead>
                        <TableHead>DOB</TableHead>
                        <TableHead>Adm. Date</TableHead>
                        <TableHead>Year</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.length > 0 ? filteredStudents.map((s: any, index: number) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">{s.admission_number || "-"}</TableCell>
                          <TableCell>{s.roll_number || "-"}</TableCell>
                          <TableCell>
                            <button
                              className="text-primary hover:underline font-medium text-left cursor-pointer bg-transparent border-none p-0"
                              onClick={() => { setHistoryStudent(s); setHistoryOpen(true); }}
                            >
                              {s.student_name}
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={s.gender?.toLowerCase() === "male" ? "text-blue-600 border-blue-300" : "text-pink-600 border-pink-300"}>
                              {s.gender || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>{s.school_classes?.class_name || "-"}</TableCell>
                          <TableCell>{s.division || "-"}</TableCell>
                          <TableCell>{s.date_of_birth ? format(new Date(s.date_of_birth), "dd-MMM-yyyy") : "-"}</TableCell>
                          <TableCell>{s.admission_date ? format(new Date(s.admission_date), "dd-MMM-yyyy") : "-"}</TableCell>
                          <TableCell>{(s as any).academic_years?.year_name || "-"}</TableCell>
                          <TableCell>{s.parent_name || "-"}</TableCell>
                          <TableCell>{s.parent_phone || "-"}</TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                            No students found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Registration Summary Tab */}
        <TabsContent value="summary">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Class & Division wise student count
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-340px)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead className="text-right">Active Students</TableHead>
                        <TableHead className="text-right">Male</TableHead>
                        <TableHead className="text-right">Female</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.length > 0 ? (
                        <>
                          {summaryData.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{row.class_name}</TableCell>
                              <TableCell>{row.division}</TableCell>
                              <TableCell className="text-right">{row.total}</TableCell>
                              <TableCell className="text-right text-blue-600">{row.male}</TableCell>
                              <TableCell className="text-right text-pink-600">{row.female}</TableCell>
                              <TableCell className="text-right font-bold">{row.total}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-bold border-t-2">
                            <TableCell colSpan={2}>GRAND TOTAL</TableCell>
                            <TableCell className="text-right">{grandTotal}</TableCell>
                            <TableCell className="text-right text-blue-600">{grandMale}</TableCell>
                            <TableCell className="text-right text-pink-600">{grandFemale}</TableCell>
                            <TableCell className="text-right">{grandTotal}</TableCell>
                          </TableRow>
                        </>
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No data found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StudentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        student={historyStudent}
      />
    </div>
  );
};

export default StudentReports;
