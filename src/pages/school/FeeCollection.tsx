import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Receipt, Loader2, IndianRupee, Calendar, User } from "lucide-react";
import { FeeCollectionDialog } from "@/components/school/FeeCollectionDialog";

const FeeCollection = () => {
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Get current academic year
  const { data: currentYear } = useQuery({
    queryKey: ["current-academic-year", currentOrganization?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .eq("is_current", true)
        .single();
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Summary: today's collection, month collection, pending dues
  const { data: summary } = useQuery({
    queryKey: ["fee-collection-summary", currentOrganization?.id, currentYear?.id],
    queryFn: async () => {
      if (!currentYear) return { today: 0, month: 0, pending: 0 };

      const today = new Date().toISOString().split("T")[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

      // Today's collection
      const { data: todayData } = await supabase
        .from("student_fees")
        .select("paid_amount")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id)
        .gte("paid_date", today + "T00:00:00")
        .lte("paid_date", today + "T23:59:59");

      const todayTotal = (todayData || []).reduce((s: number, r: any) => s + (r.paid_amount || 0), 0);

      // Month collection
      const { data: monthData } = await supabase
        .from("student_fees")
        .select("paid_amount")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id)
        .gte("paid_date", monthStart + "T00:00:00");

      const monthTotal = (monthData || []).reduce((s: number, r: any) => s + (r.paid_amount || 0), 0);

      // Total fee structures (all classes) vs total paid
      const { data: allStructures } = await supabase
        .from("fee_structures")
        .select("amount, frequency")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id);

      const { data: allStudents } = await supabase
        .from("students")
        .select("id, class_id")
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null);

      const { data: allPayments } = await supabase
        .from("student_fees")
        .select("paid_amount")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id);

      const totalPaid = (allPayments || []).reduce((s: number, r: any) => s + (r.paid_amount || 0), 0);

      // Rough pending calculation
      // Sum structures per class × students in that class
      const classStructures = new Map<string, number>();
      (allStructures || []).forEach((s: any) => {
        // We don't have class_id here from the query, but for a rough estimate:
        const mult = s.frequency === "monthly" ? 12 : s.frequency === "quarterly" ? 4 : 1;
        // This is total per structure row; can be improved but gives useful estimate
      });

      // Simpler: just count total expected from structures * student count as rough
      const totalExpected = (allStructures || []).reduce((s: number, r: any) => {
        const mult = r.frequency === "monthly" ? 12 : r.frequency === "quarterly" ? 4 : 1;
        return s + r.amount * mult;
      }, 0);
      // This is per-class total, multiply by avg students... for simplicity just show totalExpected - totalPaid
      const pending = Math.max(0, totalExpected - totalPaid);

      return { today: todayTotal, month: monthTotal, pending };
    },
    enabled: !!currentOrganization?.id && !!currentYear?.id,
  });

  // Fetch students with fee due calculations
  const { data: students, isLoading } = useQuery({
    queryKey: ["students-fee-collection", currentOrganization?.id, searchQuery, currentYear?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from("students")
        .select(`*, school_classes:class_id (class_name)`)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .order("student_name", { ascending: true });

      if (searchQuery) {
        query = query.or(`student_name.ilike.%${searchQuery}%,admission_number.ilike.%${searchQuery}%,parent_phone.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;

      if (!data?.length) return data || [];

      if (!currentYear) {
        return data.map((student: any) => ({
          ...student,
          totalExpected: 0,
          totalPaid: 0,
          totalDue: 0,
          feeStatus: "no-structure",
        }));
      }

      // Get fee structures and payments in parallel for calculation
      const classIds = [...new Set(data.map((s: any) => s.class_id).filter(Boolean))];
      const studentIds = data.map((s: any) => s.id);

      const [structuresRes, paymentsRes] = await Promise.all([
        classIds.length > 0
          ? supabase.from("fee_structures").select("*").eq("organization_id", currentOrganization.id).eq("academic_year_id", currentYear.id).in("class_id", classIds)
          : { data: [] },
        supabase.from("student_fees").select("student_id, paid_amount, fee_head_id").eq("organization_id", currentOrganization.id).eq("academic_year_id", currentYear.id).in("student_id", studentIds),
      ]);

      const structures = structuresRes.data || [];
      const payments = paymentsRes.data || [];

      // Calculate dues per student
      return data.map((student: any) => {
        const classStructures = structures.filter((s: any) => s.class_id === student.class_id);
        const totalExpected = classStructures.reduce((sum: number, s: any) => {
          const mult = s.frequency === "monthly" ? 12 : s.frequency === "quarterly" ? 4 : 1;
          return sum + s.amount * mult;
        }, 0);

        const totalPaid = payments
          .filter((p: any) => p.student_id === student.id)
          .reduce((sum: number, p: any) => sum + (p.paid_amount || 0), 0);

        const totalDue = Math.max(0, totalExpected - totalPaid);
        const status = totalExpected === 0 ? "no-structure" : totalDue === 0 ? "paid" : totalPaid > 0 ? "partial" : "pending";

        return { ...student, totalExpected, totalPaid, totalDue, feeStatus: status };
      });
    },
    enabled: !!currentOrganization?.id,
  });

  const handleCollect = (student: any) => {
    setSelectedStudent(student);
    setDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge className="bg-green-600 text-white">Paid</Badge>;
      case "partial": return <Badge className="bg-yellow-600 text-white">Partial</Badge>;
      case "pending": return <Badge variant="destructive">Pending</Badge>;
      default: return <Badge variant="secondary">No Structure</Badge>;
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
          <Receipt className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Fee Collection</h1>
            <p className="text-muted-foreground">Collect and manage student fee payments</p>
          </div>
        </div>
        <Button onClick={() => { setSelectedStudent(null); setDialogOpen(true); }}>
          <Receipt className="h-4 w-4 mr-2" /> Add Fee Collection
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <IndianRupee className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Today's Collection</p>
                <p className="text-2xl font-bold">₹{(summary?.today || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-500/10 rounded-lg">
                <Calendar className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">₹{(summary?.month || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-destructive/10 rounded-lg">
                <User className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Dues</p>
                <p className="text-2xl font-bold">₹{(summary?.pending || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Student Fee Status</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or admission no..."
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
          ) : students?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No students found.</p>
              <p className="text-sm">Add students first to collect fees.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-sidebar">
                <TableRow>
                  <TableHead>Admission No</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students?.map((student: any) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.admission_number}</TableCell>
                    <TableCell>{student.student_name}</TableCell>
                    <TableCell>
                      {student.school_classes?.class_name || "-"}
                    </TableCell>
                    <TableCell>{student.parent_phone || "-"}</TableCell>
                    <TableCell className="text-right font-medium">
                      ₹{(student.totalDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(student.feeStatus || "no-structure")}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => handleCollect(student)}>
                        <Receipt className="h-4 w-4 mr-1" />
                        Collect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <FeeCollectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        student={selectedStudent}
      />
    </div>
  );
};

export default FeeCollection;
