import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, GraduationCap, IndianRupee, Receipt } from "lucide-react";
import { format } from "date-fns";

interface StudentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    student_name: string;
    admission_number: string;
    academic_year_id?: string | null;
    class_id?: string | null;
    parent_phone?: string | null;
    closing_fees_balance?: number | null;
    school_classes?: { class_name: string } | null;
    totalExpected?: number;
    totalPaid?: number;
    totalDue?: number;
    importedBalance?: number;
  } | null;
}

export function StudentHistoryDialog({ open, onOpenChange, student }: StudentHistoryDialogProps) {
  const { currentOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState<'summary' | 'heads' | 'ledger'>('summary');

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
    enabled: !!currentOrganization?.id && open,
  });

  const activeAcademicYearId = student?.academic_year_id || currentYear?.id;

  // Fetch all real fee payments for this student (exclude balance_adjustment ghost records)
  const { data: feePayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["student-fee-payments-history", student?.id, currentOrganization?.id],
    queryFn: async () => {
      if (!student?.id || !currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("student_fees")
        .select("*, fee_heads(head_name)")
        .eq("student_id", student.id)
        .eq("organization_id", currentOrganization.id)
        .in("status", ["paid", "partial"])
        .gt("paid_amount", 0)
        .order("paid_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!student?.id && !!currentOrganization?.id,
  });

  // Fetch fee structures for the student's class
  const { data: feeStructures } = useQuery({
    queryKey: ["student-fee-structures-history", student?.class_id, currentOrganization?.id, activeAcademicYearId],
    queryFn: async () => {
      if (!student?.class_id || !activeAcademicYearId) return [];
      const { data } = await supabase
        .from("fee_structures")
        .select("*, fee_heads(head_name)")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", activeAcademicYearId)
        .eq("class_id", student.class_id);
      return data || [];
    },
    enabled: open && !!student?.class_id && !!activeAcademicYearId && !!currentOrganization?.id,
  });

  // Fetch balance adjustment audit log
  const { data: adjustmentLog = [] } = useQuery({
    queryKey: ["student-balance-audit", student?.id, currentOrganization?.id],
    queryFn: async () => {
      const { data } = await (supabase.from("student_balance_audit" as any) as any)
        .select("*")
        .eq("student_id", student!.id)
        .eq("organization_id", currentOrganization!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: open && !!student?.id && !!currentOrganization?.id,
  });

  if (!student) return null;

  // Calculate structure-based expected total
  const structureTotal = (feeStructures || []).reduce((sum: number, fs: any) => {
    const mult = fs.frequency === "monthly" ? 12 : fs.frequency === "quarterly" ? 4 : 1;
    return sum + fs.amount * mult;
  }, 0);
  const hasStructures = structureTotal > 0;
  const importedBalance = student.closing_fees_balance || 0;

  // Mirror fee collection logic: use structures OR imported balance, not both
  const totalExpected = hasStructures ? structureTotal : importedBalance;
  
  // Separate real payments from balance adjustments
  const allRealPayments = (feePayments || []).filter((p: any) => p.status !== "balance_adjustment" && p.status !== "deleted");
  // For structure-based: only count payments of the student's academic year context.
  const realPayments = hasStructures && activeAcademicYearId
    ? allRealPayments.filter((p: any) => p.academic_year_id === activeAcademicYearId)
    : allRealPayments;
  const totalPaid = realPayments.reduce((sum: number, p: any) => sum + (p.paid_amount || 0), 0);

  // Calculate net adjustment impact
  const adjustmentNet = (adjustmentLog || []).reduce((sum: number, adj: any) => {
    if (adj.adjustment_type === 'credit') return sum + (adj.change_amount || 0);
    if (adj.adjustment_type === 'debit') return sum - (adj.change_amount || 0);
    return 0; // 'set' type handled differently
  }, 0);
  const totalDue = Math.max(0, totalExpected + adjustmentNet - totalPaid);

  // Head-wise summary
  const headSummary = (feeStructures || []).map((fs: any) => {
    const mult = fs.frequency === "monthly" ? 12 : fs.frequency === "quarterly" ? 4 : 1;
    const structureTotal = fs.amount * mult;
    const paid = realPayments
      .filter((p: any) => p.fee_head_id === fs.fee_head_id)
      .reduce((s: number, p: any) => s + (p.paid_amount || 0), 0);
    return {
      headName: fs.fee_heads?.head_name || "Unknown",
      total: structureTotal,
      paid,
      balance: Math.max(0, structureTotal - paid),
    };
  });

  // Build combined ledger: payments + adjustments, sorted chronologically
  const combinedEntries = [
    ...allRealPayments.map((p: any) => ({
      type: 'payment' as const,
      date: p.paid_date || p.created_at,
      data: p,
    })),
    ...(adjustmentLog || []).map((adj: any) => ({
      type: 'adjustment' as const,
      date: adj.created_at,
      data: adj,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = totalExpected;
  const ledgerEntries = combinedEntries.map((entry) => {
    if (entry.type === 'payment') {
      runningBalance -= (entry.data.paid_amount || 0);
      return { ...entry, balanceAfter: runningBalance };
    } else {
      const adj = entry.data;
      if (adj.adjustment_type === 'credit') {
        runningBalance += (adj.change_amount || 0);
      } else if (adj.adjustment_type === 'debit') {
        runningBalance -= (adj.change_amount || 0);
      } else {
        runningBalance = (adj.new_balance || 0);
      }
      return { ...entry, balanceAfter: runningBalance };
    }
  });

  const fmtINR = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <GraduationCap className="h-6 w-6 text-primary" />
            {student.student_name}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {student.admission_number} • {student.school_classes?.class_name || "-"} • {student.parent_phone || "No phone"}
          </DialogDescription>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 py-3">
          {hasStructures ? (
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Fees</p>
                <p className="text-sm sm:text-base font-bold text-blue-600 truncate">₹{fmtINR(totalExpected)}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Opening Balance</p>
                <p className="text-sm sm:text-base font-bold text-orange-600 truncate">₹{fmtINR(importedBalance)}</p>
              </CardContent>
            </Card>
          )}
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-2 sm:p-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Paid</p>
              <p className="text-sm sm:text-base font-bold text-green-600 truncate">₹{fmtINR(totalPaid)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-2 sm:p-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Pending Due</p>
              <p className="text-sm sm:text-base font-bold text-red-600 truncate">₹{fmtINR(totalDue)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-400">
            <CardContent className="p-2 sm:p-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Collection Rate</p>
              <p className="text-sm sm:text-base font-bold text-blue-600 truncate">
                {totalExpected > 0 ? `${((totalPaid / totalExpected) * 100).toFixed(1)}%` : '0%'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b mb-3">
          {(['summary', 'heads', 'ledger'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'heads' ? 'Fee Heads' : tab === 'ledger' ? 'Full Ledger' : 'Payment History'}
            </button>
          ))}
        </div>

        {/* Summary Tab - Payment History */}
        {activeTab === 'summary' && (
          <>
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Payment History ({realPayments.length})
            </h3>
            <ScrollArea className="flex-1 h-[40vh]">
              {paymentsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : realPayments.length > 0 ? (
                <Table>
                  <TableHeader className="bg-background">
                    <TableRow className="border-b-2 border-border">
                      <TableHead className="text-foreground font-bold">Receipt #</TableHead>
                      <TableHead className="text-foreground font-bold">Date</TableHead>
                      <TableHead className="text-foreground font-bold">Fee Head</TableHead>
                      <TableHead className="text-foreground font-bold">Method</TableHead>
                      <TableHead className="text-right text-foreground font-bold">Amount</TableHead>
                      <TableHead className="text-center text-foreground font-bold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {realPayments.map((payment: any) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium text-sm">{payment.payment_receipt_id || "-"}</TableCell>
                        <TableCell className="text-sm">
                          {payment.paid_date ? format(new Date(payment.paid_date), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-sm">{payment.fee_heads?.head_name || "Yearly Fees 2025-26"}</TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="outline">{payment.payment_method || "-"}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-sm">
                          ₹{fmtINR(payment.paid_amount || 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={payment.status === "paid" ? "default" : "secondary"}>
                            {payment.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No fee payments recorded yet.</p>
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {/* Fee Heads Tab */}
        {activeTab === 'heads' && (
          <>
            {headSummary.length > 0 ? (
              <div className="mb-3">
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Fee Head Breakdown</h3>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-background">
                      <TableRow className="border-b-2 border-border">
                        <TableHead className="text-foreground font-bold">Fee Head</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Total</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Paid</TableHead>
                        <TableHead className="text-right text-foreground font-bold">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {headSummary.map((h, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{h.headName}</TableCell>
                          <TableCell className="text-right tabular-nums">₹{fmtINR(h.total)}</TableCell>
                          <TableCell className="text-right tabular-nums text-green-600">₹{fmtINR(h.paid)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={h.balance > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                              ₹{fmtINR(h.balance)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No fee structures defined for this student's class.</p>
              </div>
            )}
          </>
        )}

        {/* Full Ledger Tab */}
        {activeTab === 'ledger' && (
          <ScrollArea className="flex-1 h-[40vh]">
            {paymentsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-background sticky top-0">
                  <TableRow className="border-b-2">
                    <TableHead className="font-bold">Date</TableHead>
                    <TableHead className="font-bold">Receipt #</TableHead>
                    <TableHead className="font-bold">Description</TableHead>
                    <TableHead className="font-bold">Method</TableHead>
                    <TableHead className="text-right font-bold text-red-600">Debit (Due)</TableHead>
                    <TableHead className="text-right font-bold text-green-600">Credit (Paid)</TableHead>
                    <TableHead className="text-right font-bold">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening balance row */}
                  {hasStructures && (
                    <TableRow className="bg-blue-50/50 dark:bg-blue-950/20">
                      <TableCell className="text-xs text-muted-foreground">Opening</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell className="font-medium text-sm">Fee Structure (Annual Due)</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell className="text-right font-bold text-red-600">₹{fmtINR(totalExpected)}</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right font-bold">₹{fmtINR(totalExpected)}</TableCell>
                    </TableRow>
                  )}
                  {!hasStructures && importedBalance > 0 && (
                    <TableRow className="bg-orange-50/50 dark:bg-orange-950/20">
                      <TableCell className="text-xs text-muted-foreground">Opening</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell className="font-medium text-sm">Closing Balance (Previous Year)</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell className="text-right font-bold text-orange-600">₹{fmtINR(importedBalance)}</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right font-bold text-orange-600">₹{fmtINR(importedBalance)}</TableCell>
                    </TableRow>
                  )}
                  {/* Payment / adjustment rows */}
                  {ledgerEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">
                        No payments recorded yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledgerEntries.map((entry: any, idx: number) => {
                      if (entry.type === 'payment') {
                        const p = entry.data;
                        return (
                          <TableRow key={`pay-${p.id}-${idx}`}>
                            <TableCell className="text-sm">
                              {p.paid_date ? format(new Date(p.paid_date), 'dd/MM/yyyy') : '—'}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-primary">
                              {p.payment_receipt_id || '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {p.fee_heads?.head_name || 'Fees Paid'}
                              {p.notes && <span className="text-xs text-muted-foreground ml-1">({p.notes})</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{p.payment_method || '—'}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                            <TableCell className="text-right font-semibold text-sm text-green-600">
                              ₹{fmtINR(p.paid_amount || 0)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-sm">
                              <span className={entry.balanceAfter > 0 ? 'text-red-600' : 'text-green-600'}>
                                ₹{fmtINR(entry.balanceAfter)}
                                {entry.balanceAfter === 0 && ' ✓'}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      } else {
                        const adj = entry.data;
                        return (
                          <TableRow key={`adj-${adj.id}-${idx}`} className="bg-amber-50/30 dark:bg-amber-950/10">
                            <TableCell className="text-sm">
                              {adj.created_at ? format(new Date(adj.created_at), "dd/MM/yyyy") : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-amber-600 font-mono">{adj.voucher_number}</TableCell>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700">
                                  ⚙ Adjustment
                                </Badge>
                                <span>{adj.adjustment_type === "credit" ? "Balance Added" : adj.adjustment_type === "debit" ? "Balance Reduced" : "Balance Set"}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {adj.reason_code_label || adj.reason_code}
                                {adj.reason_detail && ` — ${adj.reason_detail}`}
                              </div>
                              <div className="text-[10px] text-muted-foreground">By: {adj.adjusted_by_name || "—"}</div>
                            </TableCell>
                            <TableCell>—</TableCell>
                            <TableCell className="text-right">
                              {adj.adjustment_type === "credit" && (
                                <span className="text-red-600 font-semibold">₹{fmtINR(adj.change_amount || 0)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {adj.adjustment_type === "debit" && (
                                <span className="text-green-600 font-semibold">₹{fmtINR(adj.change_amount || 0)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-amber-700 dark:text-amber-400">
                              ₹{fmtINR(entry.balanceAfter)}
                            </TableCell>
                          </TableRow>
                        );
                      }
                    })
                  )}
                  {/* Totals row */}
                  {ledgerEntries.length > 0 && (
                    <TableRow className="bg-muted/30 font-bold border-t-2">
                      <TableCell colSpan={5} className="text-right text-sm">TOTALS</TableCell>
                      <TableCell className="text-right text-green-600">₹{fmtINR(totalPaid)}</TableCell>
                      <TableCell className="text-right">
                        <span className={totalDue > 0 ? 'text-red-600' : 'text-green-600'}>
                          ₹{fmtINR(totalDue)}
                          {totalDue === 0 ? ' (Settled)' : ' (Pending)'}
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}