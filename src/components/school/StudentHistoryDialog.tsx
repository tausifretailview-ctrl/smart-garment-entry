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
    class_id?: string | null;
    parent_phone?: string | null;
    closing_fees_balance?: number | null;
    school_classes?: { class_name: string } | null;
    totalExpected?: number;
    totalPaid?: number;
    totalDue?: number;
  } | null;
}

export function StudentHistoryDialog({ open, onOpenChange, student }: StudentHistoryDialogProps) {
  const { currentOrganization } = useOrganization();

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

  // Fetch all fee payments for this student
  const { data: feePayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["student-fee-payments-history", student?.id, currentOrganization?.id, currentYear?.id],
    queryFn: async () => {
      if (!student?.id || !currentOrganization?.id) return [];
      let query = supabase
        .from("student_fees")
        .select("*, fee_heads(head_name)")
        .eq("student_id", student.id)
        .eq("organization_id", currentOrganization.id)
        .order("paid_date", { ascending: false });

      if (currentYear?.id) {
        query = query.eq("academic_year_id", currentYear.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!student?.id && !!currentOrganization?.id,
  });

  // Fetch fee structures for the student's class
  const { data: feeStructures } = useQuery({
    queryKey: ["student-fee-structures-history", student?.class_id, currentOrganization?.id, currentYear?.id],
    queryFn: async () => {
      if (!student?.class_id || !currentYear?.id) return [];
      const { data } = await supabase
        .from("fee_structures")
        .select("*, fee_heads(head_name)")
        .eq("organization_id", currentOrganization!.id)
        .eq("academic_year_id", currentYear.id)
        .eq("class_id", student.class_id);
      return data || [];
    },
    enabled: open && !!student?.class_id && !!currentYear?.id && !!currentOrganization?.id,
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
  // Calculate totalPaid from actual fetched fee payments (source of truth)
  const totalPaid = (feePayments || []).reduce((sum: number, p: any) => sum + (p.paid_amount || 0), 0);
  const totalDue = Math.max(0, totalExpected - totalPaid);

  // Head-wise summary
  const headSummary = (feeStructures || []).map((fs: any) => {
    const mult = fs.frequency === "monthly" ? 12 : fs.frequency === "quarterly" ? 4 : 1;
    const structureTotal = fs.amount * mult;
    const paid = (feePayments || [])
      .filter((p: any) => p.fee_head_id === fs.fee_head_id)
      .reduce((s: number, p: any) => s + (p.paid_amount || 0), 0);
    return {
      headName: fs.fee_heads?.head_name || "Unknown",
      total: structureTotal,
      paid,
      balance: Math.max(0, structureTotal - paid),
    };
  });

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
                <p className="text-sm sm:text-base font-bold text-blue-600 truncate">
                  ₹{totalExpected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-2 sm:p-3">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Opening Balance</p>
                <p className="text-sm sm:text-base font-bold text-orange-600 truncate">
                  ₹{importedBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          )}
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-2 sm:p-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total Paid</p>
              <p className="text-sm sm:text-base font-bold text-green-600 truncate">
                ₹{totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-2 sm:p-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Pending Due</p>
              <p className="text-sm sm:text-base font-bold text-red-600 truncate">
                ₹{totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
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

        {/* Head-wise Breakdown */}
        {headSummary.length > 0 && (
          <div className="mb-3">
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Fee Head Breakdown</h3>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fee Head</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headSummary.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{h.headName}</TableCell>
                      <TableCell className="text-right tabular-nums">₹{h.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">₹{h.paid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={h.balance > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                          ₹{h.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Payment History */}
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Payment History ({feePayments?.length || 0})
        </h3>
        <ScrollArea className="flex-1 h-[40vh]">
          {paymentsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : feePayments && feePayments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Fee Head</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feePayments.map((payment: any) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium text-sm">{payment.payment_receipt_id || "-"}</TableCell>
                    <TableCell className="text-sm">
                      {payment.paid_date ? format(new Date(payment.paid_date), "dd/MM/yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-sm">{payment.fee_heads?.head_name || "General"}</TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="outline">{payment.payment_method || "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-sm">
                      ₹{(payment.paid_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
      </DialogContent>
    </Dialog>
  );
}
