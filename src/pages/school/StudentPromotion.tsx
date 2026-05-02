import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowRight, Loader2, Users, CheckCircle2, AlertTriangle, History, GraduationCap, UserCheck, UserX } from "lucide-react";
import { format } from "date-fns";

const StudentPromotion = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const [fromYearId, setFromYearId] = useState<string>("");
  const [toYearId, setToYearId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [carryForward, setCarryForward] = useState(true);
  const [promotionResults, setPromotionResults] = useState<{ promoted: number; failed: number; passedOut: number } | null>(null);

  // Fetch academic years
  const { data: years = [] } = useQuery({
    queryKey: ["academic-years", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .eq("organization_id", orgId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Fetch classes sorted by display_order
  const { data: classes = [] } = useQuery({
    queryKey: ["school-classes", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("school_classes")
        .select("*")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Fetch promotion history
  const { data: promotionHistoryRaw = [] } = useQuery({
    queryKey: ["promotion-history", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("promotion_history")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Cast to proper type
  const promotionHistory = promotionHistoryRaw as Array<{
    id: string;
    from_year_name: string;
    to_year_name: string;
    total_promoted: number;
    total_failed: number;
    total_passed_out: number;
    carry_forward_enabled: boolean;
    promoted_by: string | null;
    created_at: string;
  }>;

  // Summary stats from history
  const totalEverPromoted = useMemo(() => {
    return promotionHistory.reduce((sum, h) => sum + (h.total_promoted || 0), 0);
  }, [promotionHistory]);

  const totalEverPassedOut = useMemo(() => {
    return promotionHistory.reduce((sum, h) => sum + (h.total_passed_out || 0), 0);
  }, [promotionHistory]);

  const totalEverFailed = useMemo(() => {
    return promotionHistory.reduce((sum, h) => sum + (h.total_failed || 0), 0);
  }, [promotionHistory]);

  // Build class mapping: current class -> next class by display_order
  const classMapping = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (let i = 0; i < classes.length; i++) {
      map[classes[i].id] = i + 1 < classes.length ? classes[i + 1].id : null;
    }
    return map;
  }, [classes]);

  const classNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    classes.forEach((c: any) => { map[c.id] = `${c.class_name}${c.section ? ` - ${c.section}` : ""}`; });
    return map;
  }, [classes]);

  // Fetch students for fromYear
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["promotion-students", orgId, fromYearId],
    queryFn: async () => {
      if (!orgId || !fromYearId) return [];
      const { data, error } = await supabase
        .from("students")
        .select("id, student_name, admission_number, class_id, division, roll_number, status, closing_fees_balance")
        .eq("organization_id", orgId)
        .eq("academic_year_id", fromYearId)
        .is("deleted_at", null)
        .order("student_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId && !!fromYearId,
  });

  // Fetch fee structures for fromYear
  const { data: feeStructures = [] } = useQuery({
    queryKey: ["promotion-fee-structures", orgId, fromYearId],
    queryFn: async () => {
      if (!orgId || !fromYearId) return [];
      const { data, error } = await supabase
        .from("fee_structures")
        .select("class_id, amount, frequency")
        .eq("organization_id", orgId)
        .eq("academic_year_id", fromYearId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId && !!fromYearId,
  });

  // Fetch paid amounts
  const { data: paidAmounts = {} } = useQuery({
    queryKey: ["promotion-paid-amounts", orgId, fromYearId],
    queryFn: async () => {
      if (!orgId || !fromYearId) return {};
      const { data, error } = await supabase
        .from("student_fees")
        .select("student_id, paid_amount")
        .eq("organization_id", orgId)
        .eq("academic_year_id", fromYearId)
        .gt("paid_amount", 0)
        .neq("status", "deleted");
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((f: any) => {
        map[f.student_id] = (map[f.student_id] || 0) + (f.paid_amount || 0);
      });
      return map;
    },
    enabled: !!orgId && !!fromYearId,
  });

  const classFeeTotal = useMemo(() => {
    const map: Record<string, number> = {};
    feeStructures.forEach((fs: any) => {
      const mult = fs.frequency === "monthly" ? 12 : fs.frequency === "quarterly" ? 4 : 1;
      map[fs.class_id] = (map[fs.class_id] || 0) + (fs.amount || 0) * mult;
    });
    return map;
  }, [feeStructures]);

  const filteredStudents = useMemo(() => {
    if (selectedClassId === "all") return students;
    return students.filter((s: any) => s.class_id === selectedClassId);
  }, [students, selectedClassId]);

  const studentClasses = useMemo(() => {
    const classIds = new Set(students.map((s: any) => s.class_id));
    return classes.filter((c: any) => classIds.has(c.id));
  }, [students, classes]);

  const toggleStudent = (id: string) => {
    const next = new Set(selectedStudents);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedStudents(next);
  };

  const toggleAll = () => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map((s: any) => s.id)));
    }
  };

  // Promotion mutation
  const promoteMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !toYearId) throw new Error("Select target year");
      const selected = filteredStudents.filter((s: any) => selectedStudents.has(s.id));
      if (selected.length === 0) throw new Error("No students selected");

      let promoted = 0;
      let failed = 0;
      let passedOut = 0;
      const batchSize = 50;

      for (let i = 0; i < selected.length; i += batchSize) {
        const batch = selected.slice(i, i + batchSize);

        for (const student of batch) {
          const nextClassId = classMapping[student.class_id] || null;
          const isLastClass = nextClassId === null;

          let newClosingBalance = 0;
          if (carryForward) {
            const totalFee = classFeeTotal[student.class_id] || (student.closing_fees_balance || 0);
            const totalPaid = (paidAmounts as Record<string, number>)[student.id] || 0;
            newClosingBalance = Math.max(0, totalFee - totalPaid);
          }

          const updateData: any = {
            academic_year_id: toYearId,
            closing_fees_balance: newClosingBalance,
            // Carry-forward balance is already net of prior-year collections — ledger must not subtract again.
            fees_opening_is_net: carryForward,
            // Once a student is promoted, dues should follow fee structure rules.
            is_new_admission: false,
          };

          if (isLastClass) {
            updateData.status = "passed_out";
            passedOut++;
          } else {
            updateData.class_id = nextClassId;
            updateData.status = "active";
          }

          const { error } = await supabase
            .from("students")
            .update(updateData)
            .eq("id", student.id);

          if (error) {
            console.error("Failed to promote", student.student_name, error);
            failed++;
          } else {
            promoted++;
          }
        }
      }

      // Log promotion history
      const fromYear = years.find((y: any) => y.id === fromYearId);
      const toYear = years.find((y: any) => y.id === toYearId);
      await supabase.from("promotion_history").insert({
        organization_id: orgId,
        from_year_id: fromYearId,
        to_year_id: toYearId,
        from_year_name: fromYear?.year_name || "",
        to_year_name: toYear?.year_name || "",
        total_promoted: promoted,
        total_failed: failed,
        total_passed_out: passedOut,
        carry_forward_enabled: carryForward,
      } as any);

      return { promoted, failed, passedOut };
    },
    onSuccess: (result) => {
      setPromotionResults(result);
      setSelectedStudents(new Set());
      queryClient.invalidateQueries({ queryKey: ["promotion-students"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["promotion-history"] });
      toast.success(`${result.promoted} students promoted successfully${result.failed > 0 ? `, ${result.failed} failed` : ""}`);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const fromYear = years.find((y: any) => y.id === fromYearId);
  const toYear = years.find((y: any) => y.id === toYearId);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Student Promotion
        </h1>
        <p className="text-muted-foreground">
          Promote students from one academic year to the next with automatic class progression
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEverPromoted + totalEverPassedOut}</p>
                <p className="text-xs text-muted-foreground">Total Promoted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEverPromoted}</p>
                <p className="text-xs text-muted-foreground">Promoted to Next Class</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <GraduationCap className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEverPassedOut}</p>
                <p className="text-xs text-muted-foreground">Passed Out</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <UserX className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEverFailed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Year Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Year Transition</CardTitle>
          <CardDescription>Select the source and target academic years</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 min-w-[200px]">
              <Label>From Year</Label>
              <Select value={fromYearId} onValueChange={(v) => { setFromYearId(v); setSelectedStudents(new Set()); setPromotionResults(null); }}>
                <SelectTrigger><SelectValue placeholder="Select source year" /></SelectTrigger>
                <SelectContent>
                  {years.map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>{y.year_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ArrowRight className="h-5 w-5 text-muted-foreground mb-2" />

            <div className="space-y-2 min-w-[200px]">
              <Label>To Year</Label>
              <Select value={toYearId} onValueChange={(v) => { setToYearId(v); setPromotionResults(null); }}>
                <SelectTrigger><SelectValue placeholder="Select target year" /></SelectTrigger>
                <SelectContent>
                  {years.filter((y: any) => y.id !== fromYearId).map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>{y.year_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Switch checked={carryForward} onCheckedChange={setCarryForward} id="carry-forward" />
              <Label htmlFor="carry-forward" className="text-sm cursor-pointer">
                Carry forward pending dues
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Class Mapping Preview */}
      {fromYearId && toYearId && studentClasses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Class Promotion Mapping</CardTitle>
            <CardDescription>Students will be auto-promoted to the next class based on display order</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {studentClasses.map((c: any) => {
                const nextId = classMapping[c.id];
                const nextName = nextId ? classNameMap[nextId] : "Passed Out";
                return (
                  <div key={c.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <Badge variant="outline">{c.class_name}{c.section ? ` - ${c.section}` : ""}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge variant={nextId ? "default" : "destructive"}>{nextName}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Promotion Results */}
      {promotionResults && (
        <Card className="border-green-500/30 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-700 dark:text-green-400">
                  Promotion Complete: {promotionResults.promoted} students promoted
                  {promotionResults.passedOut > 0 ? `, ${promotionResults.passedOut} passed out` : ""}
                  {fromYear && toYear ? ` from ${fromYear.year_name} to ${toYear.year_name}` : ""}
                </p>
                {promotionResults.failed > 0 && (
                  <p className="text-sm text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-4 w-4" /> {promotionResults.failed} students failed - please retry
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student List */}
      {fromYearId && toYearId && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Students ({filteredStudents.length})</CardTitle>
                <CardDescription>
                  {selectedStudents.size} selected for promotion
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {studentClasses.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.class_name}{c.section ? ` - ${c.section}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => promoteMutation.mutate()}
                  disabled={selectedStudents.size === 0 || promoteMutation.isPending}
                >
                  {promoteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Promote {selectedStudents.size} Students
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Adm No</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Current Class</TableHead>
                  <TableHead>Promoted To</TableHead>
                  {carryForward && <TableHead className="text-right">Pending Dues</TableHead>}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentsLoading ? (
                  <TableRow>
                    <TableCell colSpan={carryForward ? 7 : 6} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={carryForward ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      No students found for selected year
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map((student: any) => {
                    const nextClassId = classMapping[student.class_id];
                    const isLastClass = nextClassId === null;
                    const nextClassName = nextClassId ? classNameMap[nextClassId] : "Passed Out";
                    const totalFee = classFeeTotal[student.class_id] || (student.closing_fees_balance || 0);
                    const totalPaid = (paidAmounts as Record<string, number>)[student.id] || 0;
                    const pendingDues = Math.max(0, totalFee - totalPaid);

                    return (
                      <TableRow key={student.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedStudents.has(student.id)}
                            onCheckedChange={() => toggleStudent(student.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{student.admission_number}</TableCell>
                        <TableCell className="font-medium">{student.student_name}</TableCell>
                        <TableCell>{classNameMap[student.class_id] || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={isLastClass ? "destructive" : "default"}>
                            {nextClassName}
                          </Badge>
                        </TableCell>
                        {carryForward && (
                          <TableCell className="text-right font-mono">
                            {pendingDues > 0 ? `₹${pendingDues.toLocaleString("en-IN")}` : "—"}
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant={student.status === "active" ? "outline" : "secondary"}>
                            {student.status || "active"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Promotion History */}
      {promotionHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              Promotion History
            </CardTitle>
            <CardDescription>Past promotion batches</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From Year</TableHead>
                  <TableHead>To Year</TableHead>
                  <TableHead className="text-center">Promoted</TableHead>
                  <TableHead className="text-center">Passed Out</TableHead>
                  <TableHead className="text-center">Failed</TableHead>
                  <TableHead>Carry Forward</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotionHistory.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-sm">
                      {h.created_at ? format(new Date(h.created_at), "dd MMM yyyy, hh:mm a") : "—"}
                    </TableCell>
                    <TableCell>{h.from_year_name}</TableCell>
                    <TableCell>{h.to_year_name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="default">{h.total_promoted}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{h.total_passed_out || 0}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {(h.total_failed || 0) > 0 ? (
                        <Badge variant="destructive">{h.total_failed}</Badge>
                      ) : (
                        <Badge variant="outline">0</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={h.carry_forward_enabled ? "default" : "outline"}>
                        {h.carry_forward_enabled ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StudentPromotion;
