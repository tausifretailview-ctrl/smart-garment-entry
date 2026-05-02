import { useState, useRef } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface FeesBalanceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  studentName: string;
  className: string;
  balance: number;
  matchedStudentId?: string;
  matchedStudentName?: string;
  matchedClassName?: string;
}

const CLASS_NAME_MAP: Record<string, string> = {
  "NURSERY": "Nursery",
  "JUNIOR": "Jr.Kg",
  "JUNIOR KG": "Jr.Kg",
  "JR KG": "Jr.Kg",
  "JR.KG": "Jr.Kg",
  "SENIOR KG": "Sr.Kg",
  "SR KG": "Sr.Kg",
  "SR.KG": "Sr.Kg",
  "1ST STD": "STD I",
  "2ND STD": "STD II",
  "3RD STD": "STD III",
  "4TH STD": "STD IV",
  "5TH STD": "STD V",
  "6TH STD": "STD VI",
  "7TH STD": "STD VII",
  "8TH STD": "STD VIII",
  "9TH STD": "STD IX",
  "10TH STD": "STD X",
};

const ALL_CLASS_HEADERS = Object.keys(CLASS_NAME_MAP);

function normalizeName(name: string): string {
  return name
    .replace(/^(MS\.?|MST\.?|MR\.?|MISS\.?|MASTER\.?)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Check if all words in the Excel name appear in the student's DB name */
function fuzzyNameMatch(excelName: string, dbName: string): boolean {
  const excelWords = normalizeName(excelName).split(" ").filter(Boolean);
  const dbWords = normalizeName(dbName).split(" ").filter(Boolean);
  // Every word from Excel must exist somewhere in the DB name
  return excelWords.length > 0 && excelWords.every(w => dbWords.includes(w));
}

function isClassHeader(value: string): boolean {
  const upper = value.trim().toUpperCase();
  return ALL_CLASS_HEADERS.includes(upper);
}

export function FeesBalanceImportDialog({ open, onOpenChange }: FeesBalanceImportDialogProps) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; failed: number } | null>(null);

  const resetState = () => {
    setStep("upload");
    setParsedRows([]);
    setImporting(false);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrganization?.id) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      // Parse rows: detect class headers, then student rows
      // Support two formats:
      // 1. Class-grouped: class header rows followed by student rows
      // 2. Flat CSV: just name,balance rows (no class headers)
      const parsed: { studentName: string; className: string; balance: number }[] = [];
      let currentClass = "";
      let hasClassHeaders = false;

      // First pass: check if any row is a class header
      for (const row of rows) {
        const firstCell = String(row[0] || "").trim();
        if (firstCell && isClassHeader(firstCell)) {
          hasClassHeaders = true;
          break;
        }
      }

      for (const row of rows) {
        const firstCell = String(row[0] || "").trim();
        if (!firstCell) continue;

        if (hasClassHeaders && isClassHeader(firstCell)) {
          currentClass = CLASS_NAME_MAP[firstCell.toUpperCase()] || firstCell;
          continue;
        }

        // Skip header row if it looks like column names
        if (firstCell.toLowerCase() === "name" || firstCell.toLowerCase() === "student name" || firstCell.toLowerCase() === "student_name") continue;

        if (hasClassHeaders && !currentClass) continue;

        const balance = parseFloat(String(row[1] || "0").replace(/[₹,]/g, "")) || 0;
        parsed.push({ studentName: firstCell, className: currentClass || "__ALL__", balance });
      }

      if (parsed.length === 0) {
        toast({ title: "No data found", description: "Could not parse any student rows from the file.", variant: "destructive" });
        return;
      }

      // Fetch classes and students for matching
      const { data: classes } = await supabase
        .from("school_classes")
        .select("id, class_name")
        .eq("organization_id", currentOrganization.id);

      const classMap = new Map((classes || []).map(c => [c.class_name, c.id]));

      const { data: students } = await supabase
        .from("students")
        .select("id, student_name, class_id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);

      // Group students by class_id for fuzzy matching
      const studentsByClass = new Map<string, { id: string; student_name: string; class_id: string }[]>();
      for (const s of students || []) {
        const list = studentsByClass.get(s.class_id) || [];
        list.push(s);
        studentsByClass.set(s.class_id, list);
      }

      // Match: first try exact normalized name, then fuzzy (all Excel words found in DB name)
      const allStudents = students || [];
      const matched: ParsedRow[] = parsed.map(p => {
        const isFlat = p.className === "__ALL__";
        const excelNorm = normalizeName(p.studentName);

        let student: typeof allStudents[0] | undefined;
        let matchedClassName = p.className;

        if (isFlat) {
          // Flat CSV: search across all students
          student = allStudents.find(s => normalizeName(s.student_name) === excelNorm);
          if (!student) {
            student = allStudents.find(s => fuzzyNameMatch(p.studentName, s.student_name));
          }
          if (student) {
            matchedClassName = (classes || []).find(c => c.id === student!.class_id)?.class_name || "";
          } else {
            matchedClassName = "";
          }
        } else {
          const classId = classMap.get(p.className);
          matchedClassName = (classes || []).find(c => c.id === classId)?.class_name || p.className;
          if (!classId) return { ...p, matchedClassName };

          const classStudents = studentsByClass.get(classId) || [];
          student = classStudents.find(s => normalizeName(s.student_name) === excelNorm);
          if (!student) {
            student = classStudents.find(s => fuzzyNameMatch(p.studentName, s.student_name));
          }
        }

        return {
          ...p,
          matchedStudentId: student?.id,
          matchedStudentName: student?.student_name,
          matchedClassName,
        };
      });

      setParsedRows(matched);
      setStep("preview");
    } catch (err: any) {
      toast({ title: "Parse error", description: err.message, variant: "destructive" });
    }
  };

  const matchedRows = parsedRows.filter(r => r.matchedStudentId);
  const unmatchedRows = parsedRows.filter(r => !r.matchedStudentId);

  const handleImport = async () => {
    if (matchedRows.length === 0) return;
    setImporting(true);
    setStep("importing");

    let updated = 0;
    let failed = 0;
    const batchSize = 50;

    for (let i = 0; i < matchedRows.length; i += batchSize) {
      const batch = matchedRows.slice(i, i + batchSize);
      const promises = batch.map(row =>
        supabase
          .from("students")
          .update({ closing_fees_balance: row.balance, fees_opening_is_net: false } as any)
          .eq("id", row.matchedStudentId!)
      );
      const results = await Promise.all(promises);
      for (const r of results) {
        if (r.error) failed++;
        else updated++;
      }
    }

    setImportResult({ updated, failed });
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["students"] });
    toast({
      title: "Import Complete",
      description: `Updated ${updated} students. ${failed > 0 ? `${failed} failed.` : ""}${unmatchedRows.length > 0 ? ` ${unmatchedRows.length} unmatched.` : ""}`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Closing Fees Balance</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file with student names and fee balances.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Select an Excel (.xlsx) or CSV file with student fee balances
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="max-w-xs mx-auto"
              />
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 py-2">
            <div className="flex gap-3">
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {matchedRows.length} Matched
              </Badge>
              {unmatchedRows.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {unmatchedRows.length} Unmatched
                </Badge>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name (Excel)</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow key={i} className={row.matchedStudentId ? "" : "bg-destructive/5"}>
                      <TableCell className="text-sm">{row.studentName}</TableCell>
                      <TableCell className="text-sm">{row.matchedClassName || row.className}</TableCell>
                      <TableCell className="text-sm text-right font-mono">₹{row.balance.toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        {row.matchedStudentId ? (
                          <Badge variant="default" className="text-xs">Matched</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Not Found</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={resetState}>Back</Button>
              <Button onClick={handleImport} disabled={matchedRows.length === 0}>
                Update {matchedRows.length} Students
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "importing" && (
          <div className="py-8 text-center space-y-4">
            {importing ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p>Updating fee balances...</p>
              </>
            ) : importResult ? (
              <>
                <CheckCircle2 className="h-8 w-8 mx-auto text-primary" />
                <p className="font-medium">{importResult.updated} students updated successfully</p>
                {importResult.failed > 0 && <p className="text-destructive">{importResult.failed} failed</p>}
                <Button onClick={handleClose}>Close</Button>
              </>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
