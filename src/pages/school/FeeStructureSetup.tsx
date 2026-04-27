import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, BookOpen, Lock, History, Pencil } from "lucide-react";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { format } from "date-fns";

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "one-time", label: "One-time" },
];

interface FeeRow {
  fee_head_id: string;
  head_name: string;
  amount: number;
  frequency: string;
  due_day: number;
  late_fee_amount: number;
  late_fee_after_days: number;
  existing_id?: string;
  original_amount?: number;
  original_frequency?: string;
}

const FeeStructureSetup = () => {
  const { currentOrganization } = useOrganization();
  const { isAdmin, hasSpecialPermission } = useUserPermissions();
  const canEditFeeStructure = isAdmin || hasSpecialPermission("fee_structure_edit");
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [feeRows, setFeeRows] = useState<FeeRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const { data: academicYears } = useQuery({
    queryKey: ["academic-years", currentOrganization?.id],
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

  // Fetch a summary of how many non-zero fee structures each year has, to help auto-pick
  const { data: yearSummary } = useQuery({
    queryKey: ["fee-structures-year-summary", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_structures")
        .select("academic_year_id, amount")
        .eq("organization_id", currentOrganization!.id)
        .gt("amount", 0);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        counts[r.academic_year_id] = (counts[r.academic_year_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!currentOrganization?.id,
  });

  // Auto-select the year with most configured fees on first load
  useEffect(() => {
    if (selectedYear || !academicYears?.length || !yearSummary) return;
    let bestId = academicYears[0].id;
    let bestCount = yearSummary[bestId] || 0;
    academicYears.forEach((y: any) => {
      const c = yearSummary[y.id] || 0;
      if (c > bestCount) { bestCount = c; bestId = y.id; }
    });
    // Prefer the current year if marked, otherwise the most-populated year
    const current = academicYears.find((y: any) => y.is_current);
    if (current && (yearSummary[current.id] || 0) > 0) {
      setSelectedYear(current.id);
    } else {
      setSelectedYear(bestId);
    }
  }, [academicYears, yearSummary, selectedYear]);

  const { data: classes } = useQuery({
    queryKey: ["school-classes", currentOrganization?.id],
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

  const { data: feeHeads } = useQuery({
    queryKey: ["fee-heads", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_heads")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const { isLoading: loadingStructures } = useQuery({
    queryKey: ["fee-structures", currentOrganization?.id, selectedYear, selectedClass],
    queryFn: async () => {
      if (!selectedYear || !selectedClass || !feeHeads) return [];
      const { data, error } = await supabase
        .from("fee_structures")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", selectedYear)
        .eq("class_id", selectedClass);
      if (error) throw error;

      const rows: FeeRow[] = feeHeads.map((head: any) => {
        const existing = data?.find((fs: any) => fs.fee_head_id === head.id);
        return {
          fee_head_id: head.id,
          head_name: head.head_name,
          amount: existing?.amount || 0,
          frequency: existing?.frequency || "yearly",
          due_day: existing?.due_day || 1,
          late_fee_amount: existing?.late_fee_amount || 0,
          late_fee_after_days: existing?.late_fee_after_days || 15,
          existing_id: existing?.id,
          original_amount: existing?.amount || 0,
          original_frequency: existing?.frequency || "yearly",
        };
      });
      setFeeRows(rows);
      return data;
    },
    enabled: !!currentOrganization?.id && !!selectedYear && !!selectedClass && !!feeHeads,
  });

  // Fetch history
  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ["fee-structure-history", currentOrganization?.id, selectedYear, selectedClass],
    queryFn: async () => {
      if (!selectedYear || !selectedClass) return [];
      const { data, error } = await supabase
        .from("fee_structure_history")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", selectedYear)
        .eq("class_id", selectedClass)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id && !!selectedYear && !!selectedClass && showHistory,
  });

  // Fetch ALL fee structures for the selected year (across all classes)
  const { data: allStructures, isLoading: loadingAll } = useQuery({
    queryKey: ["fee-structures-all", currentOrganization?.id, selectedYear],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from("fee_structures")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", selectedYear);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id && !!selectedYear,
  });

  // Fetch ALL history for the selected year (across all classes)
  const { data: allHistory, isLoading: loadingAllHistory } = useQuery({
    queryKey: ["fee-structure-history-all", currentOrganization?.id, selectedYear],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from("fee_structure_history")
        .select("*")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", selectedYear)
        .order("changed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id && !!selectedYear,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id || !selectedYear || !selectedClass) return;

      // Save ALL rows that have amount > 0 OR have an existing record (to allow updating to 0)
      const rowsToSave = feeRows.filter(r => r.amount > 0 || r.existing_id);

      for (const row of rowsToSave) {
        const payload = {
          organization_id: currentOrganization.id,
          academic_year_id: selectedYear,
          class_id: selectedClass,
          fee_head_id: row.fee_head_id,
          amount: row.amount,
          frequency: row.frequency,
          due_day: row.due_day,
          late_fee_amount: row.late_fee_amount || null,
          late_fee_after_days: row.late_fee_after_days || null,
        };

        const amountChanged = row.original_amount !== row.amount;
        const frequencyChanged = row.original_frequency !== row.frequency;

        if (row.existing_id) {
          const { error } = await supabase
            .from("fee_structures")
            .update(payload)
            .eq("id", row.existing_id);
          if (error) throw error;

          // Log history if amount or frequency changed
          if (amountChanged || frequencyChanged) {
            await supabase.from("fee_structure_history" as any).insert({
              organization_id: currentOrganization.id,
              fee_structure_id: row.existing_id,
              academic_year_id: selectedYear,
              class_id: selectedClass,
              fee_head_id: row.fee_head_id,
              old_amount: row.original_amount || 0,
              new_amount: row.amount,
              old_frequency: row.original_frequency || "yearly",
              new_frequency: row.frequency,
              changed_by: (await supabase.auth.getUser()).data.user?.email || "Unknown",
            });
          }
        } else if (row.amount > 0) {
          const { data: inserted, error } = await supabase
            .from("fee_structures")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;

          // Log history for new entry
          await supabase.from("fee_structure_history" as any).insert({
            organization_id: currentOrganization.id,
            fee_structure_id: inserted.id,
            academic_year_id: selectedYear,
            class_id: selectedClass,
            fee_head_id: row.fee_head_id,
            old_amount: 0,
            new_amount: row.amount,
            old_frequency: null,
            new_frequency: row.frequency,
            changed_by: (await supabase.auth.getUser()).data.user?.email || "Unknown",
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Fee structure saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
      queryClient.invalidateQueries({ queryKey: ["fee-structure-history"] });
      queryClient.invalidateQueries({ queryKey: ["fee-structures-all"] });
      queryClient.invalidateQueries({ queryKey: ["fee-structure-history-all"] });
    },
    onError: (err: any) => {
      toast.error("Failed to save: " + err.message);
    },
  });

  const handleEditFromHistory = (historyRow: any) => {
    // Find the fee row and focus it
    const idx = feeRows.findIndex(r => r.fee_head_id === historyRow.fee_head_id);
    if (idx >= 0) {
      setShowHistory(false);
      toast.info(`Edit the "${feeRows[idx].head_name}" fee head above and save.`);
    }
  };

  const updateRow = (index: number, field: keyof FeeRow, value: any) => {
    setFeeRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const totalAnnual = feeRows.reduce((sum, r) => {
    const multiplier = r.frequency === "monthly" ? 12 : r.frequency === "quarterly" ? 4 : 1;
    return sum + r.amount * multiplier;
  }, 0);

  const hasChanges = feeRows.some(r => r.original_amount !== r.amount || r.original_frequency !== r.frequency) || feeRows.some(r => !r.existing_id && r.amount > 0);

  // Map fee_head_id to name for history display
  const feeHeadMap: Record<string, string> = {};
  feeHeads?.forEach((h: any) => { feeHeadMap[h.id] = h.head_name; });
  const classMap: Record<string, string> = {};
  classes?.forEach((c: any) => { classMap[c.id] = c.class_name; });

  // Build pivot grid: rows = classes, cols = fee heads
  const classesWithStructures = (() => {
    if (!allStructures || !classes || !feeHeads) return [];
    const byClass: Record<string, Record<string, { amount: number; frequency: string }>> = {};
    allStructures.forEach((fs: any) => {
      if (!byClass[fs.class_id]) byClass[fs.class_id] = {};
      byClass[fs.class_id][fs.fee_head_id] = { amount: Number(fs.amount) || 0, frequency: fs.frequency };
    });
    return classes
      .filter((c: any) => {
        const heads = byClass[c.id];
        if (!heads) return false;
        // Only include classes that have at least one non-zero fee
        return Object.values(heads).some(h => h.amount > 0);
      })
      .map((c: any) => {
        const heads = byClass[c.id];
        const total = feeHeads.reduce((sum: number, h: any) => {
          const cell = heads[h.id];
          if (!cell) return sum;
          const mult = cell.frequency === "monthly" ? 12 : cell.frequency === "quarterly" ? 4 : 1;
          return sum + cell.amount * mult;
        }, 0);
        return { class_id: c.id, class_name: c.class_name, heads, total };
      });
  })();

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
          <BookOpen className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Fee Structure Setup</h1>
            <p className="text-muted-foreground">Define fee amounts per class for each academic year</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedYear && selectedClass && (
            <Button variant="outline" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-4 w-4 mr-2" />
              {showHistory ? "Hide History" : "View History"}
            </Button>
          )}
          {selectedYear && selectedClass && hasChanges && canEditFeeStructure && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Fee Structure
            </Button>
          )}
          {!canEditFeeStructure && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Lock className="h-4 w-4" />
              <span>View Only – Edit rights not granted</span>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold mb-1 block">Academic Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Academic Year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYears?.map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>{y.year_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Class</label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Fee Structures Overview (year-wide) */}
      {selectedYear && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Fee Structures ({academicYears?.find((y: any) => y.id === selectedYear)?.year_name})</CardTitle>
              <p className="text-xs text-muted-foreground">
                {classesWithStructures.length} class{classesWithStructures.length === 1 ? "" : "es"} configured
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {loadingAll ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : classesWithStructures.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">
                No fee structures defined yet. Select a class below and add fees.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background">Class</TableHead>
                      {feeHeads?.map((h: any) => (
                        <TableHead key={h.id} className="text-right whitespace-nowrap">{h.head_name}</TableHead>
                      ))}
                      <TableHead className="text-right font-bold">Total Annual</TableHead>
                      <TableHead className="w-20 text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classesWithStructures.map((row: any) => (
                      <TableRow key={row.class_id} className={selectedClass === row.class_id ? "bg-accent/30" : ""}>
                        <TableCell className="font-medium sticky left-0 bg-background">{row.class_name}</TableCell>
                        {feeHeads?.map((h: any) => {
                          const cell = row.heads[h.id];
                          return (
                            <TableCell key={h.id} className="text-right tabular-nums font-mono">
                              {cell && cell.amount > 0 ? (
                                <span title={cell.frequency}>₹{cell.amount.toLocaleString("en-IN")}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right font-bold tabular-nums font-mono text-primary">
                          ₹{row.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedClass(row.class_id)}
                            title="Edit this class"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fee Structure Table */}
      {selectedYear && selectedClass && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Fee Heads & Amounts</CardTitle>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Annual Fee</p>
                <p className="text-xl font-bold text-primary">₹{totalAnnual.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingStructures ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : feeRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No fee heads found. Please add fee heads first.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fee Head</TableHead>
                    <TableHead className="w-32">Amount (₹)</TableHead>
                    <TableHead className="w-36">Frequency</TableHead>
                    <TableHead className="w-24">Due Day</TableHead>
                    <TableHead className="w-32">Late Fee (₹)</TableHead>
                    <TableHead className="w-32">Late After (days)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeRows.map((row, idx) => (
                    <TableRow key={row.fee_head_id} className={row.original_amount !== row.amount ? "bg-accent/30" : ""}>
                      <TableCell className="font-medium">{row.head_name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={row.amount || ""}
                          onChange={e => updateRow(idx, "amount", parseFloat(e.target.value) || 0)}
                          className="w-28"
                          disabled={!canEditFeeStructure}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={row.frequency} onValueChange={v => updateRow(idx, "frequency", v)} disabled={!canEditFeeStructure}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FREQUENCIES.map(f => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          max="28"
                          value={row.due_day}
                          onChange={e => updateRow(idx, "due_day", parseInt(e.target.value) || 1)}
                          className="w-20"
                          disabled={!canEditFeeStructure}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={row.late_fee_amount || ""}
                          onChange={e => updateRow(idx, "late_fee_amount", parseFloat(e.target.value) || 0)}
                          className="w-28"
                          disabled={!canEditFeeStructure}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={row.late_fee_after_days}
                          onChange={e => updateRow(idx, "late_fee_after_days", parseInt(e.target.value) || 0)}
                          className="w-28"
                          disabled={!canEditFeeStructure}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* History Section */}
      {showHistory && selectedYear && selectedClass && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Fee Structure Change History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !historyData || historyData.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No changes recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Fee Head</TableHead>
                    <TableHead>Old Amount</TableHead>
                    <TableHead>New Amount</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Changed By</TableHead>
                    <TableHead className="w-20">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.map((h: any) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">
                        {format(new Date(h.changed_at), "dd MMM yyyy, hh:mm a")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {feeHeadMap[h.fee_head_id] || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <span className={Number(h.old_amount) > 0 ? "text-destructive line-through" : "text-muted-foreground"}>
                          ₹{Number(h.old_amount).toLocaleString("en-IN")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-primary">
                          ₹{Number(h.new_amount).toLocaleString("en-IN")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {h.old_frequency !== h.new_frequency ? (
                          <span>{h.old_frequency} → {h.new_frequency}</span>
                        ) : (
                          h.new_frequency || "-"
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {h.changed_by || "-"}
                      </TableCell>
                      <TableCell>
                        {canEditFeeStructure && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditFromHistory(h)}
                            title="Edit this fee head"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* All History (year-wide, across all classes) */}
      {selectedYear && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              All Fee Structure Updates ({academicYears?.find((y: any) => y.id === selectedYear)?.year_name})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAllHistory ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !allHistory || allHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No updates recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Fee Head</TableHead>
                      <TableHead className="text-right">Old Amount</TableHead>
                      <TableHead className="text-right">New Amount</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Changed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allHistory.map((h: any) => (
                      <TableRow key={h.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(h.changed_at), "dd MMM yyyy, hh:mm a")}
                        </TableCell>
                        <TableCell className="font-medium">{classMap[h.class_id] || "-"}</TableCell>
                        <TableCell>{feeHeadMap[h.fee_head_id] || "Unknown"}</TableCell>
                        <TableCell className="text-right tabular-nums font-mono">
                          <span className={Number(h.old_amount) > 0 ? "text-destructive line-through" : "text-muted-foreground"}>
                            ₹{Number(h.old_amount).toLocaleString("en-IN")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-mono font-semibold text-primary">
                          ₹{Number(h.new_amount).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-sm capitalize">
                          {h.old_frequency && h.old_frequency !== h.new_frequency ? (
                            <span>{h.old_frequency} → {h.new_frequency}</span>
                          ) : (
                            h.new_frequency || "-"
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{h.changed_by || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FeeStructureSetup;
