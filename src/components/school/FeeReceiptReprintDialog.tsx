import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, X } from "lucide-react";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";

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
          <div ref={receiptRef} className="p-5 border rounded-md bg-white text-black" style={{ fontFamily: "Arial, sans-serif" }}>
            {/* Header */}
            <div className="text-center mb-3 border-b-2 border-gray-800 pb-2">
              <h2 className="text-lg font-bold">{currentOrganization?.name}</h2>
              <p className="text-xs text-gray-600">Fee Receipt</p>
            </div>

            {/* Student & Receipt Info */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
              <div><strong>Receipt #:</strong> {data.receiptNumber}</div>
              <div><strong>Date:</strong> {data.paidDate ? format(new Date(data.paidDate), "dd/MM/yyyy") : "-"}</div>
              <div><strong>Student Name:</strong> {data.student.student_name}</div>
              <div><strong>Adm. No:</strong> {data.student.admission_number}</div>
              {data.student.parent_name && <div><strong>Parent Name:</strong> {data.student.parent_name}</div>}
              <div><strong>Class:</strong> {data.student.class_name}</div>
              {data.academicYear && <div><strong>Academic Year:</strong> {data.academicYear}</div>}
              <div><strong>Payment:</strong> {data.paymentMethod}</div>
              {data.transactionId && <div className="col-span-2"><strong>Txn ID:</strong> {data.transactionId}</div>}
            </div>

            {/* Fee Details Table */}
            <table className="w-full text-xs border-collapse mb-3 border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left py-1.5 px-2 border border-gray-300 font-semibold">Fee Head</th>
                  <th className="text-right py-1.5 px-2 border border-gray-300 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-1.5 px-2 border border-gray-300">{item.head_name}</td>
                    <td className="text-right py-1.5 px-2 border border-gray-300">₹{item.paying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-gray-50">
                  <td className="py-2 px-2 border border-gray-300">Total</td>
                  <td className="text-right py-2 px-2 border border-gray-300">₹{data.totalPaying.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 border border-gray-300 font-semibold">Balance</td>
                  <td className="text-right py-1.5 px-2 border border-gray-300 font-semibold text-red-600">
                    ₹{data.remainingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Signature */}
            <div className="flex justify-between items-end mt-6 text-xs">
              <div><p className="text-gray-500">Receiver</p></div>
              <div className="text-center">
                <div className="border-t border-gray-800 pt-1 w-32">
                  <p className="text-gray-600">Auth. Signature</p>
                </div>
              </div>
            </div>
          </div>
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
