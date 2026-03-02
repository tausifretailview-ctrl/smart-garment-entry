import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, X } from "lucide-react";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";
import { SchoolFeeReceipt } from "./SchoolFeeReceipt";

interface FeeReceiptReprintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptId: string | null; // payment_receipt_id string
}

export function FeeReceiptReprintDialog({ open, onOpenChange, receiptId }: FeeReceiptReprintDialogProps) {
  const { currentOrganization } = useOrganization();
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({ contentRef: receiptRef });

  // Fetch all fee entries for this receipt number + student info
  const { data, isLoading } = useQuery({
    queryKey: ["fee-receipt-reprint", currentOrganization?.id, receiptId],
    queryFn: async () => {
      if (!receiptId || !currentOrganization?.id) return null;

      const { data: fees, error } = await supabase
        .from("student_fees")
        .select("*, students!inner(student_name, admission_number, parent_name, parent_phone, class_id, school_classes:class_id(class_name)), fee_heads(head_name), academic_years!inner(year_name)")
        .eq("organization_id", currentOrganization.id)
        .eq("payment_receipt_id", receiptId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!fees || fees.length === 0) return null;

      const first = fees[0] as any;
      const student = first.students;
      const totalPaying = fees.reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);

      // Calculate remaining balance: fetch total fees for this student
      const { data: allFees } = await supabase
        .from("student_fees")
        .select("paid_amount, amount")
        .eq("student_id", first.student_id)
        .eq("organization_id", currentOrganization.id);

      const totalAmount = (allFees || []).reduce((s: number, f: any) => s + (f.amount || 0), 0);
      const totalPaid = (allFees || []).reduce((s: number, f: any) => s + (f.paid_amount || 0), 0);

      // Get student's closing_fees_balance for imported balance scenario
      const { data: studentRecord } = await supabase
        .from("students")
        .select("closing_fees_balance")
        .eq("id", first.student_id)
        .single();

      const closingBalance = studentRecord?.closing_fees_balance || 0;
      const effectiveTotal = totalAmount > 0 ? totalAmount : closingBalance;
      const remainingBalance = Math.max(0, effectiveTotal - totalPaid);

      return {
        receiptNumber: receiptId,
        paidDate: first.paid_date,
        paymentMethod: first.payment_method || "Cash",
        transactionId: first.transaction_id,
        academicYear: first.academic_years?.year_name || "",
        student: {
          student_name: student.student_name,
          admission_number: student.admission_number,
          parent_name: student.parent_name,
          class_name: student.school_classes?.class_name || "-",
        },
        items: fees.map((f: any) => ({
          head_name: f.fee_heads?.head_name || "General",
          paying: f.paid_amount || 0,
        })),
        totalPaying,
        remainingBalance,
      };
    },
    enabled: !!open && !!receiptId && !!currentOrganization?.id,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Receipt — {receiptId || ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !data ? (
          <div className="text-center py-8 text-muted-foreground">Receipt not found.</div>
        ) : (
          <SchoolFeeReceipt
            ref={receiptRef}
            receiptNumber={data.receiptNumber}
            paidDate={data.paidDate}
            paymentMethod={data.paymentMethod}
            transactionId={data.transactionId}
            academicYear={data.academicYear}
            student={data.student}
            items={data.items}
            totalPaying={data.totalPaying}
            remainingBalance={data.remainingBalance}
          />
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" /> Close
          </Button>
          {data && (
            <Button onClick={() => handlePrint()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
