import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import * as XLSX from "xlsx";

interface StudentBulkUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "preview" | "updating" | "done";

interface MatchedStudent {
  id: string;
  student_name: string;
  current_class_name: string;
  new_class_name: string;
  new_class_id: string | null;
  current_division: string;
  new_division: string;
  current_roll: string;
  new_roll: string;
  current_phone: string;
  new_phone: string;
  current_parent_name: string;
  new_parent_name: string;
  current_address: string;
  new_address: string;
}

interface UnmatchedRow {
  name: string;
  row: number;
}

const normalizePhoneNumber = (val: any): string => {
  if (val == null || val === "") return "";
  let s = String(val);
  // Strip .0 from numeric Excel cells
  if (s.endsWith(".0")) s = s.slice(0, -2);
  // Remove non-digits
  return s.replace(/\D/g, "");
};

const normalizeName = (name: string): string => {
  if (!name) return "";
  let n = name.trim();
  // Strip common prefixes
  n = n.replace(/^(MS\.|MST\.|MR\.|MRS\.)\s*/i, "");
  // Collapse spaces, lowercase
  return n.replace(/\s+/g, " ").trim().toLowerCase();
};

const findColumn = (headers: string[], candidates: string[]): number => {
  const lower = headers.map(h => (h || "").toString().trim().toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
};

export const StudentBulkUpdateDialog = ({ open, onOpenChange }: StudentBulkUpdateDialogProps) => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("upload");
  const [matched, setMatched] = useState<MatchedStudent[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>([]);
  const [updateCount, setUpdateCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const reset = useCallback(() => {
    setStep("upload");
    setMatched([]);
    setUnmatched([]);
    setUpdateCount(0);
    setIsProcessing(false);
  }, []);

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrganization?.id) return;
    setIsProcessing(true);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rows.length < 2) throw new Error("Excel file has no data rows");

      const headers = rows[0].map((h: any) => String(h || ""));
      const nameIdx = findColumn(headers, ["CHILD NAME", "Student Name", "Name", "STUDENT NAME"]);
      const classIdx = findColumn(headers, ["CLASS", "Class Name", "Class"]);
      const divIdx = findColumn(headers, ["DIV", "Division", "DIVISION"]);
      const rollIdx = findColumn(headers, ["Roll No", "Roll Number", "ROLL NO", "Roll no"]);
      const phoneIdx = findColumn(headers, ["FATHER NO", "Parent Phone", "Father No", "FATHER NO.", "Phone"]);
      const parentIdx = findColumn(headers, ["FATHER", "Parent Name", "Father Name", "FATHER NAME"]);
      const addressIdx = findColumn(headers, ["ADDRESS", "Address"]);

      if (nameIdx === -1) throw new Error("Could not find student name column (CHILD NAME / Student Name / Name)");

      // Fetch all existing students
      const { data: students, error: studErr } = await supabase
        .from("students")
        .select("id, student_name, class_id, division, roll_number, parent_phone, parent_name, address, school_classes(class_name)")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      if (studErr) throw studErr;

      // Fetch all classes for resolving class names
      const { data: classes } = await supabase
        .from("school_classes")
        .select("id, class_name")
        .eq("organization_id", currentOrganization.id);

      const classMap = new Map<string, string>();
      (classes || []).forEach((c: any) => {
        classMap.set(c.class_name.trim().toLowerCase(), c.id);
      });

      // Build student lookup by normalized name
      const studentMap = new Map<string, any>();
      (students || []).forEach((s: any) => {
        const key = normalizeName(s.student_name);
        if (key) studentMap.set(key, s);
      });

      const matchedList: MatchedStudent[] = [];
      const unmatchedList: UnmatchedRow[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rawName = row[nameIdx] ? String(row[nameIdx]).trim() : "";
        if (!rawName) continue;

        const key = normalizeName(rawName);
        const existing = studentMap.get(key);

        if (!existing) {
          unmatchedList.push({ name: rawName, row: i + 1 });
          continue;
        }

        const newClassName = classIdx !== -1 && row[classIdx] ? String(row[classIdx]).trim() : "";
        const newClassId = newClassName ? (classMap.get(newClassName.toLowerCase()) || null) : null;
        const existingClass = existing.school_classes as any;

        matchedList.push({
          id: existing.id,
          student_name: existing.student_name,
          current_class_name: existingClass?.class_name || "-",
          new_class_name: newClassName || "-",
          new_class_id: newClassId,
          current_division: existing.division || "-",
          new_division: divIdx !== -1 && row[divIdx] ? String(row[divIdx]).trim() : existing.division || "",
          current_roll: existing.roll_number ? String(existing.roll_number) : "-",
          new_roll: rollIdx !== -1 && row[rollIdx] ? String(row[rollIdx]).replace(/\.0$/, "").trim() : "",
          current_phone: existing.parent_phone || "-",
          new_phone: phoneIdx !== -1 ? normalizePhoneNumber(row[phoneIdx]) : "",
          current_parent_name: existing.parent_name || "-",
          new_parent_name: parentIdx !== -1 && row[parentIdx] ? String(row[parentIdx]).trim() : "",
          current_address: existing.address || "-",
          new_address: addressIdx !== -1 && row[addressIdx] ? String(row[addressIdx]).trim() : "",
        });
      }

      setMatched(matchedList);
      setUnmatched(unmatchedList);
      setStep("preview");
    } catch (err: any) {
      toast({ title: "Error parsing Excel", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdate = async () => {
    if (!currentOrganization?.id) return;
    setStep("updating");
    let count = 0;

    try {
      // Process in batches of 50
      for (let i = 0; i < matched.length; i += 50) {
        const batch = matched.slice(i, i + 50);
        const promises = batch.map((m) => {
          const updates: any = {};
          if (m.new_class_id) updates.class_id = m.new_class_id;
          if (m.new_division) updates.division = m.new_division;
          if (m.new_roll) updates.roll_number = parseInt(m.new_roll) || null;
          if (m.new_phone) updates.parent_phone = m.new_phone;
          if (m.new_parent_name) updates.parent_name = m.new_parent_name;
          if (m.new_address) updates.address = m.new_address;

          if (Object.keys(updates).length === 0) return Promise.resolve();

          return supabase
            .from("students")
            .update(updates)
            .eq("id", m.id)
            .then(({ error }) => {
              if (error) throw error;
              count++;
            });
        });
        await Promise.all(promises);
      }

      setUpdateCount(count);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["student-stats"] });
      toast({ title: "Bulk Update Complete", description: `${count} students updated successfully.` });
    } catch (err: any) {
      toast({ title: "Update Error", description: err.message, variant: "destructive" });
      setStep("preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Update Students from Excel</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Upload an Excel file to update existing students' Class, Division, Roll Number, and Phone Numbers.
              Students are matched by <strong>name</strong>.
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="max-w-sm"
              />
              {isProcessing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Expected columns: CHILD NAME, CLASS, DIV, Roll No, FATHER NO, FATHER, ADDRESS</p>
              <p>Name matching strips prefixes like MS., MST., MR. and is case-insensitive.</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Badge variant="default" className="text-sm px-3 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {matched.length} Matched
              </Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                {unmatched.length} Not Found
              </Badge>
            </div>

            {matched.length > 0 && (
              <div className="border rounded-md overflow-auto max-h-[50vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Division</TableHead>
                      <TableHead>Roll No</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matched.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium text-sm">{m.student_name}</TableCell>
                        <TableCell className="text-sm">
                          <span className="text-muted-foreground">{m.current_class_name}</span>
                          {m.new_class_name !== "-" && m.new_class_name !== m.current_class_name && (
                            <span className="inline-flex items-center">
                              <ArrowRight className="h-3 w-3 mx-1" />
                              <span className="text-primary font-medium">{m.new_class_name}</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-muted-foreground">{m.current_division}</span>
                          {m.new_division && m.new_division !== m.current_division && (
                            <span className="inline-flex items-center">
                              <ArrowRight className="h-3 w-3 mx-1" />
                              <span className="text-primary font-medium">{m.new_division}</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-muted-foreground">{m.current_roll}</span>
                          {m.new_roll && m.new_roll !== m.current_roll && (
                            <span className="inline-flex items-center">
                              <ArrowRight className="h-3 w-3 mx-1" />
                              <span className="text-primary font-medium">{m.new_roll}</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-muted-foreground">{m.current_phone}</span>
                          {m.new_phone && m.new_phone !== m.current_phone && (
                            <span className="inline-flex items-center">
                              <ArrowRight className="h-3 w-3 mx-1" />
                              <span className="text-primary font-medium">{m.new_phone}</span>
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {unmatched.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  {unmatched.length} students not found in database (will be skipped)
                </summary>
                <div className="mt-2 max-h-32 overflow-auto text-xs space-y-0.5 text-muted-foreground">
                  {unmatched.map((u) => (
                    <div key={u.row}>Row {u.row}: {u.name}</div>
                  ))}
                </div>
              </details>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={matched.length === 0}>
                Update {matched.length} Students
              </Button>
            </div>
          </div>
        )}

        {step === "updating" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Updating students...</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <p className="text-lg font-semibold">{updateCount} students updated successfully!</p>
            <Button onClick={() => handleClose(false)}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
