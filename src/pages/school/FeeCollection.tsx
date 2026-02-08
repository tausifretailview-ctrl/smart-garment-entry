import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Receipt, Loader2, IndianRupee, Calendar, User } from "lucide-react";
import { format } from "date-fns";

const FeeCollection = () => {
  const { currentOrganization } = useOrganization();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch students with their fee dues
  const { data: students, isLoading } = useQuery({
    queryKey: ["students-fee-collection", currentOrganization?.id, searchQuery],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      let query = supabase
        .from("students")
        .select(`
          *,
          school_classes:class_id (class_name),
          school_sections:section_id (section_name)
        `)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .order("student_name", { ascending: true });

      if (searchQuery) {
        query = query.or(`student_name.ilike.%${searchQuery}%,admission_number.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch fee heads for display
  const { data: feeHeads } = useQuery({
    queryKey: ["fee-heads", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("fee_heads")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const handleCollectFee = (studentId: string, studentName: string) => {
    toast.info(`Fee collection for ${studentName} - Coming soon!`);
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
            <p className="text-muted-foreground">
              Collect and manage student fee payments
            </p>
          </div>
        </div>
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
                <p className="text-2xl font-bold">₹0.00</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-warning/10 rounded-lg">
                <Calendar className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">₹0.00</p>
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
                <p className="text-2xl font-bold">₹0.00</p>
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
                    <TableCell className="font-medium">
                      {student.admission_number}
                    </TableCell>
                    <TableCell>{student.student_name}</TableCell>
                    <TableCell>
                      {student.school_classes?.class_name || "-"}
                      {student.school_sections?.section_name && 
                        ` - ${student.school_sections.section_name}`}
                    </TableCell>
                    <TableCell>{student.phone || student.guardian_phone || "-"}</TableCell>
                    <TableCell className="text-right font-medium">
                      ₹0.00
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">No Dues</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => handleCollectFee(student.id, student.student_name)}
                      >
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

      {/* Active Fee Heads */}
      {feeHeads && feeHeads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Fee Heads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {feeHeads.map((head: any) => (
                <Badge key={head.id} variant="outline" className="py-1 px-3">
                  {head.head_name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FeeCollection;
