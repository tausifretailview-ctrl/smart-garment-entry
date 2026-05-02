import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, GraduationCap } from "lucide-react";

interface StudentFormData {
  admission_number: string;
  student_name: string;
  class_id: string;
  academic_year_id: string;
  division: string;
  roll_number: string;
  date_of_birth: string;
  gender: string;
  address: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  parent_relation: string;
  emergency_contact: string;
  admission_date: string;
  status: string;
  notes: string;
  closing_fees_balance: string;
  is_new_admission: boolean;
}

const initialFormData: StudentFormData = {
  admission_number: "",
  student_name: "",
  class_id: "",
  academic_year_id: "",
  division: "",
  roll_number: "",
  date_of_birth: "",
  gender: "",
  address: "",
  parent_name: "",
  parent_phone: "",
  parent_email: "",
  parent_relation: "",
  emergency_contact: "",
  admission_date: new Date().toISOString().split("T")[0],
  status: "active",
  notes: "",
  closing_fees_balance: "",
  is_new_admission: true,
};

const StudentEntry = () => {
  const { id } = useParams();
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<StudentFormData>(initialFormData);
  const isEditing = !!id;

  // Fetch classes
  const { data: classes = [] } = useQuery({
    queryKey: ["school-classes", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("school_classes")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch academic years
  const { data: academicYears = [] } = useQuery({
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

  // Fetch existing student for edit
  const { data: existingStudent, isLoading: loadingStudent } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Generate next admission number
  const { data: nextAdmissionNumber } = useQuery({
    queryKey: ["next-admission-number", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id || isEditing) return "";
      
      const { data } = await supabase
        .from("students")
        .select("admission_number")
        .eq("organization_id", currentOrganization.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const lastNum = parseInt(data[0].admission_number.replace(/\D/g, "")) || 0;
        return `ADM${String(lastNum + 1).padStart(4, "0")}`;
      }
      return "ADM0001";
    },
    enabled: !!currentOrganization?.id && !isEditing,
  });

  // Populate form when editing
  useEffect(() => {
    if (existingStudent) {
      setFormData({
        admission_number: existingStudent.admission_number || "",
        student_name: existingStudent.student_name || "",
        class_id: existingStudent.class_id || "",
        academic_year_id: existingStudent.academic_year_id || "",
        division: existingStudent.division || "",
        roll_number: existingStudent.roll_number || "",
        date_of_birth: existingStudent.date_of_birth || "",
        gender: existingStudent.gender || "",
        address: existingStudent.address || "",
        parent_name: existingStudent.parent_name || "",
        parent_phone: existingStudent.parent_phone || "",
        parent_email: existingStudent.parent_email || "",
        parent_relation: existingStudent.parent_relation || "",
        emergency_contact: existingStudent.emergency_contact || "",
        admission_date: existingStudent.admission_date || "",
        status: existingStudent.status || "active",
        notes: existingStudent.notes || "",
        closing_fees_balance: existingStudent.closing_fees_balance != null ? String(existingStudent.closing_fees_balance) : "",
      });
    }
  }, [existingStudent]);

  // Set default admission number for new students
  useEffect(() => {
    if (!isEditing && nextAdmissionNumber && !formData.admission_number) {
      setFormData((prev) => ({ ...prev, admission_number: nextAdmissionNumber }));
    }
  }, [nextAdmissionNumber, isEditing]);

  // Set default academic year
  useEffect(() => {
    if (!isEditing && academicYears.length > 0 && !formData.academic_year_id) {
      const currentYear = academicYears.find((y: any) => y.is_current);
      if (currentYear) {
        setFormData((prev) => ({ ...prev, academic_year_id: currentYear.id }));
      }
    }
  }, [academicYears, isEditing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      const studentData: Record<string, unknown> = {
        organization_id: currentOrganization.id,
        admission_number: formData.admission_number,
        student_name: formData.student_name,
        class_id: formData.class_id || null,
        academic_year_id: formData.academic_year_id || null,
        division: formData.division || null,
        roll_number: formData.roll_number || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        address: formData.address || null,
        parent_name: formData.parent_name || null,
        parent_phone: formData.parent_phone || null,
        parent_email: formData.parent_email || null,
        parent_relation: formData.parent_relation || null,
        emergency_contact: formData.emergency_contact || null,
        admission_date: formData.admission_date || null,
        status: formData.status,
        notes: formData.notes || null,
        closing_fees_balance: formData.closing_fees_balance ? parseFloat(formData.closing_fees_balance) : null,
      };

      if (isEditing && existingStudent) {
        const newClosing = formData.closing_fees_balance ? parseFloat(formData.closing_fees_balance) : null;
        const oldClosing = existingStudent.closing_fees_balance;
        if (Number(newClosing ?? 0) !== Number(oldClosing ?? 0)) {
          studentData.fees_opening_is_net = false;
        }
      }

      if (isEditing) {
        const { error } = await supabase
          .from("students")
          .update(studentData)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("students").insert({ ...studentData, is_new_admission: true } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      toast.success(isEditing ? "Student updated successfully" : "Student added successfully");
      orgNavigate("/students");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save student");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.admission_number || !formData.student_name) {
      toast.error("Please fill in required fields");
      return;
    }
    saveMutation.mutate();
  };

  const handleChange = (field: keyof StudentFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isEditing && loadingStudent) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => orgNavigate("/students")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            {isEditing ? "Edit Student" : "New Student Admission"}
          </h1>
          <p className="text-muted-foreground">
            {isEditing ? "Update student details" : "Register a new student"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="admission_number">Admission No. *</Label>
                  <Input
                    id="admission_number"
                    value={formData.admission_number}
                    onChange={(e) => handleChange("admission_number", e.target.value)}
                    placeholder="ADM0001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admission_date">Admission Date</Label>
                  <Input
                    id="admission_date"
                    type="date"
                    value={formData.admission_date}
                    onChange={(e) => handleChange("admission_date", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="student_name">Student Name *</Label>
                <Input
                  id="student_name"
                  value={formData.student_name}
                  onChange={(e) => handleChange("student_name", e.target.value)}
                  placeholder="Enter student's full name"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="class_id">Class</Label>
                  <Select
                    value={formData.class_id}
                    onValueChange={(value) => handleChange("class_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((cls: any) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.class_name}{cls.section ? ` - ${cls.section}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="academic_year_id">Academic Year</Label>
                  <Select
                    value={formData.academic_year_id}
                    onValueChange={(value) => handleChange("academic_year_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map((year: any) => (
                        <SelectItem key={year.id} value={year.id}>
                          {year.year_name} {year.is_current ? "(Current)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="division">Division</Label>
                  <Input
                    id="division"
                    value={formData.division}
                    onChange={(e) => handleChange("division", e.target.value)}
                    placeholder="e.g. A, B, C"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roll_number">Roll Number</Label>
                  <Input
                    id="roll_number"
                    value={formData.roll_number}
                    onChange={(e) => handleChange("roll_number", e.target.value)}
                    placeholder="e.g. 1, 2, 3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date_of_birth">Date of Birth</Label>
                  <Input
                    id="date_of_birth"
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => handleChange("date_of_birth", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => handleChange("gender", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleChange("status", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="graduated">Graduated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Parent/Guardian Information */}
          <Card>
            <CardHeader>
              <CardTitle>Parent/Guardian Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="parent_name">Parent/Guardian Name</Label>
                <Input
                  id="parent_name"
                  value={formData.parent_name}
                  onChange={(e) => handleChange("parent_name", e.target.value)}
                  placeholder="Enter parent's name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_relation">Relation</Label>
                <Select
                  value={formData.parent_relation}
                  onValueChange={(value) => handleChange("parent_relation", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select relation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="father">Father</SelectItem>
                    <SelectItem value="mother">Mother</SelectItem>
                    <SelectItem value="guardian">Guardian</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_phone">Phone Number</Label>
                <Input
                  id="parent_phone"
                  value={formData.parent_phone}
                  onChange={(e) => handleChange("parent_phone", e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_email">Email</Label>
                <Input
                  id="parent_email"
                  type="email"
                  value={formData.parent_email}
                  onChange={(e) => handleChange("parent_email", e.target.value)}
                  placeholder="Enter email address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergency_contact">Emergency Contact</Label>
                <Input
                  id="emergency_contact"
                  value={formData.emergency_contact}
                  onChange={(e) => handleChange("emergency_contact", e.target.value)}
                  placeholder="Emergency contact number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="Enter full address"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="closing_fees_balance">Closing Fees Balance (₹)</Label>
                <Input
                  id="closing_fees_balance"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.closing_fees_balance}
                  onChange={(e) => handleChange("closing_fees_balance", e.target.value)}
                  placeholder="Enter pending fees balance"
                />
                <p className="text-xs text-muted-foreground">
                  Used as fallback when no fee structure is defined for this student's class.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  placeholder="Any additional notes..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => orgNavigate("/students")}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEditing ? "Update Student" : "Save Student"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default StudentEntry;
