import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, BookOpen } from "lucide-react";

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
}

const FeeStructureSetup = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [feeRows, setFeeRows] = useState<FeeRow[]>([]);

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

  // Fetch existing fee structures when year+class selected
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

      // Build rows from fee heads, merging existing data
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
        };
      });
      setFeeRows(rows);
      return data;
    },
    enabled: !!currentOrganization?.id && !!selectedYear && !!selectedClass && !!feeHeads,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id || !selectedYear || !selectedClass) return;

      const rowsWithAmount = feeRows.filter(r => r.amount > 0);
      
      for (const row of rowsWithAmount) {
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

        if (row.existing_id) {
          const { error } = await supabase
            .from("fee_structures")
            .update(payload)
            .eq("id", row.existing_id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("fee_structures")
            .insert(payload);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Fee structure saved successfully!");
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
    },
    onError: (err: any) => {
      toast.error("Failed to save: " + err.message);
    },
  });

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

  if (!currentOrganization) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Fee Structure Setup</h1>
          <p className="text-muted-foreground">Define fee amounts per class for each academic year</p>
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
              <>
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
                      <TableRow key={row.fee_head_id}>
                        <TableCell className="font-medium">{row.head_name}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={row.amount || ""}
                            onChange={e => updateRow(idx, "amount", parseFloat(e.target.value) || 0)}
                            className="w-28"
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={row.frequency} onValueChange={v => updateRow(idx, "frequency", v)}>
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
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={row.late_fee_amount || ""}
                            onChange={e => updateRow(idx, "late_fee_amount", parseFloat(e.target.value) || 0)}
                            className="w-28"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={row.late_fee_after_days}
                            onChange={e => updateRow(idx, "late_fee_after_days", parseInt(e.target.value) || 0)}
                            className="w-28"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end mt-4">
                  <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Fee Structure
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FeeStructureSetup;
