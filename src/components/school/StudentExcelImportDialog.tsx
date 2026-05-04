import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle,
  Loader2 
} from "lucide-react";
import * as XLSX from "xlsx";
import { 
  studentMasterFields, 
  studentMasterSampleData, 
  generateSampleExcel,
  normalizePhoneNumber 
} from "@/utils/excelImportUtils";
import { toast } from "sonner";
import { formatAdmissionFromNumeric, maxAdmNumericFromRows } from "@/lib/schoolAdmissionNumber";

interface StudentExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportProgress {
  current: number;
  total: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
}

interface ParsedStudent {
  admission_number: string;
  student_name: string;
  class_name?: string;
  division?: string;
  roll_number?: string;
  date_of_birth?: string;
  gender?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  parent_relation?: string;
  address?: string;
  emergency_contact?: string;
  admission_date?: string;
  status?: string;
}

export const StudentExcelImportDialog = ({
  open,
  onOpenChange,
}: StudentExcelImportDialogProps) => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [parsedStudents, setParsedStudents] = useState<ParsedStudent[]>([]);
  const [progress, setProgress] = useState<ImportProgress>({
    current: 0,
    total: 0,
    successCount: 0,
    errorCount: 0,
    skippedCount: 0,
  });

  // Fetch classes for matching
  const { data: classes = [] } = useQuery({
    queryKey: ["school-classes", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("school_classes")
        .select("id, class_name, section")
        .eq("organization_id", currentOrganization.id)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id && open,
  });

  // Fetch current academic year
  const { data: currentAcademicYear } = useQuery({
    queryKey: ["current-academic-year", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      const { data, error } = await supabase
        .from("academic_years")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .eq("is_current", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id && open,
  });

  const handleDownloadSample = useCallback(() => {
    generateSampleExcel(studentMasterFields, "Student_Import_Sample.xlsx", studentMasterSampleData);
    toast.success("Sample file downloaded");
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      // Parse students from Excel
      const students: ParsedStudent[] = jsonData
        .filter(row => {
          const name = row["Student Name"] || row["student_name"] || row["Name"];
          return name && String(name).trim();
        })
        .map((row, idx) => {
          const rawAdm = String(row["Admission Number"] || row["admission_number"] || row["Adm No"] || row["Adm. No"] || "").trim();
          // Treat "nan", "null", "undefined", empty as no admission number
          const isEmptyAdm = !rawAdm || ["nan", "null", "undefined", "-"].includes(rawAdm.toLowerCase());
          return {
            admission_number: isEmptyAdm ? "" : rawAdm,
            student_name: String(row["Student Name"] || row["student_name"] || row["Name"] || "").trim(),
            class_name: String(row["Class Name"] || row["class_name"] || row["Class"] || "").trim() || undefined,
            division: String(row["Division"] || row["division"] || row["Div"] || "").trim() || undefined,
            roll_number: String(row["Roll Number"] || row["roll_number"] || row["Roll No"] || row["Roll"] || "").trim() || undefined,
            date_of_birth: parseDate(row["Date of Birth"] || row["date_of_birth"] || row["DOB"]),
            gender: String(row["Gender"] || row["gender"] || "").toLowerCase().trim() || undefined,
            parent_name: String(row["Parent Name"] || row["parent_name"] || row["Father Name"] || row["Guardian"] || "").trim() || undefined,
            parent_phone: normalizePhoneNumber(row["Parent Phone"] || row["parent_phone"] || row["Mobile"] || row["Phone"]),
            parent_email: String(row["Parent Email"] || row["parent_email"] || row["Email"] || "").trim() || undefined,
            parent_relation: String(row["Relation"] || row["parent_relation"] || "").toLowerCase().trim() || undefined,
            address: String(row["Address"] || row["address"] || "").trim() || undefined,
            emergency_contact: normalizePhoneNumber(row["Emergency Contact"] || row["emergency_contact"]),
            admission_date: parseDate(row["Admission Date"] || row["admission_date"]),
            status: String(row["Status"] || row["status"] || "active").toLowerCase().trim(),
          };
        });

      if (students.length === 0) {
        toast.error("No valid students found in Excel file");
        return;
      }

      setParsedStudents(students);
      setStep("preview");
      toast.success(`Found ${students.length} students to import`);
    } catch (error: any) {
      toast.error("Error parsing Excel file: " + error.message);
    }
  }, []);

  // Helper to parse date from Excel
  const parseDate = (value: any): string | undefined => {
    if (!value) return undefined;
    
    // If it's a number (Excel date serial)
    if (typeof value === "number") {
      const date = new Date((value - 25569) * 86400 * 1000);
      return date.toISOString().split("T")[0];
    }
    
    const str = String(value).trim();
    if (!str || str.toLowerCase() === "nan" || str.toLowerCase() === "null") return undefined;
    
    // Try DD/MM/YYYY format first (most common in Indian Excel files)
    const ddmmyyyy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    
    // Try YYYY-MM-DD (ISO format)
    const iso = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (iso) {
      return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    }
    
    // Fallback: try native Date parsing
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
    
    return undefined; // Return undefined instead of unparseable string
  };

  // Find class ID by name
  const findClassId = (className?: string): string | null => {
    if (!className || !classes.length) return null;
    
    const normalizedName = className.toLowerCase().trim();
    
    // Try exact match first (with section)
    const exactMatch = classes.find((c: any) => {
      const fullName = c.section 
        ? `${c.class_name}-${c.section}`.toLowerCase()
        : c.class_name.toLowerCase();
      return fullName === normalizedName;
    });
    if (exactMatch) return exactMatch.id;
    
    // Try matching just the class name
    const partialMatch = classes.find((c: any) => 
      c.class_name.toLowerCase() === normalizedName
    );
    if (partialMatch) return partialMatch.id;
    
    return null;
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error("No organization");

      setStep("importing");
      const BATCH_SIZE = 50;
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      // Check for existing admission numbers
      const { data: existingStudents } = await supabase
        .from("students")
        .select("admission_number")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      const existingAdmNumbers = new Set(
        existingStudents?.map(s => s.admission_number.toLowerCase()) || []
      );

      // Auto-generate sequential ADM numbers from max numeric suffix (active students only)
      const { data: admRows } = await supabase
        .from("students")
        .select("admission_number")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .ilike("admission_number", "ADM%");

      let nextAutoNumeric = maxAdmNumericFromRows(admRows || []) + 1;

      for (let i = 0; i < parsedStudents.length; i += BATCH_SIZE) {
        const batch = parsedStudents.slice(i, i + BATCH_SIZE);
        
        for (const student of batch) {
          // Determine admission number
          let admNumber = student.admission_number;
          if (!admNumber) {
            admNumber = formatAdmissionFromNumeric(nextAutoNumeric);
            nextAutoNumeric += 1;
          } else {
            // Skip if admission number already exists
            if (existingAdmNumbers.has(admNumber.toLowerCase())) {
              skippedCount++;
              continue;
            }
          }

          try {
            const classId = findClassId(student.class_name);
            
            const { error } = await supabase
              .from("students")
              .insert({
                organization_id: currentOrganization.id,
                admission_number: admNumber,
                student_name: student.student_name,
                class_id: classId,
                academic_year_id: currentAcademicYear?.id || null,
                division: student.division || null,
                roll_number: student.roll_number || null,
                date_of_birth: student.date_of_birth || null,
                gender: student.gender || null,
                parent_name: student.parent_name || null,
                parent_phone: student.parent_phone || null,
                parent_email: student.parent_email || null,
                parent_relation: student.parent_relation || null,
                address: student.address || null,
                emergency_contact: student.emergency_contact || null,
                admission_date: student.admission_date || new Date().toISOString().split("T")[0],
                status: student.status || "active",
              });

            if (error) {
              console.error("Insert error:", error);
              errorCount++;
            } else {
              successCount++;
              existingAdmNumbers.add(admNumber.toLowerCase());
            }
          } catch (err) {
            console.error("Error inserting student:", err);
            errorCount++;
          }
        }

        setProgress({
          current: i + batch.length,
          total: parsedStudents.length,
          successCount,
          errorCount,
          skippedCount,
        });
      }

      return { successCount, errorCount, skippedCount };
    },
    onSuccess: (result) => {
      setProgress(prev => ({
        ...prev,
        successCount: result.successCount,
        errorCount: result.errorCount,
        skippedCount: result.skippedCount,
      }));
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["student-stats"] });
    },
    onError: (error: any) => {
      toast.error("Import failed: " + error.message);
      setStep("preview");
    },
  });

  const handleClose = () => {
    setStep("upload");
    setParsedStudents([]);
    setProgress({
      current: 0,
      total: 0,
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Students from Excel
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            {/* Download Sample */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="text-sm">
                <p className="font-medium">Download Sample File</p>
                <p className="text-muted-foreground">Use this template for import</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadSample}>
                <Download className="h-4 w-4 mr-2" />
                Sample
              </Button>
            </div>

            {/* Upload Area */}
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                Upload Excel file with student data
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="student-excel-upload"
              />
              <label htmlFor="student-excel-upload">
                <Button asChild>
                  <span>Select Excel File</span>
                </Button>
              </label>
            </div>

            <p className="text-xs text-muted-foreground">
              Expected columns: Admission Number, Student Name, Class Name, Division, Roll Number, Date of Birth, Gender, Parent Name, Parent Phone, Address, Status
            </p>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-primary">{parsedStudents.length}</p>
                <p className="text-sm text-muted-foreground">Total Students</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-primary">{parsedStudents.filter(s => s.class_name && findClassId(s.class_name)).length}</p>
                <p className="text-sm text-muted-foreground">Class Matched</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{parsedStudents.filter(s => !s.class_name || !findClassId(s.class_name)).length}</p>
                <p className="text-sm text-muted-foreground">No Class Match</p>
              </div>
            </div>

            {/* Preview sample data */}
            <div className="max-h-48 overflow-y-auto border rounded p-2 text-xs">
              <p className="font-medium mb-2">Preview (first 5 students):</p>
              {parsedStudents.slice(0, 5).map((s, i) => (
                <p key={i} className="text-muted-foreground truncate">
                  {s.admission_number} - {s.student_name} ({s.class_name || "No class"})
                </p>
              ))}
              {parsedStudents.length > 5 && (
                <p className="text-muted-foreground mt-1">...and {parsedStudents.length - 5} more</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={() => importMutation.mutate()} 
                disabled={parsedStudents.length === 0}
                className="flex-1"
              >
                Import {parsedStudents.length} Students
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary mb-4" />
              <p className="text-lg font-medium mb-2">Importing students...</p>
              <p className="text-sm text-muted-foreground mb-4">
                {progress.current} / {progress.total}
              </p>
            </div>
            <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} />
            <div className="flex justify-center gap-4 text-sm">
              <span className="text-primary">✓ {progress.successCount} added</span>
              <span className="text-muted-foreground">⊘ {progress.skippedCount} skipped</span>
              <span className="text-destructive">✗ {progress.errorCount} failed</span>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-primary mb-4" />
              <p className="text-lg font-medium">Import Complete!</p>
            </div>
            
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <p className="flex justify-between">
                <span>Students added:</span>
                <span className="font-medium text-primary">{progress.successCount}</span>
              </p>
              <p className="flex justify-between">
                <span>Skipped (duplicate admission no.):</span>
                <span className="font-medium text-muted-foreground">{progress.skippedCount}</span>
              </p>
              <p className="flex justify-between">
                <span>Failed:</span>
                <span className="font-medium text-destructive">{progress.errorCount}</span>
              </p>
            </div>

            {progress.skippedCount > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Skipped students already have the same admission number
              </p>
            )}

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
