import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, Printer } from "lucide-react";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";
import { SchoolFeeReceipt } from "./SchoolFeeReceipt";

interface ModifyFeeReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fee: any;
}

const PAYMENT_METHODS = [
  { value: "Cash", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "Card", label: "Card" },
  { value: "Bank Transfer", label: "Bank Transfer" },
];

export function ModifyFeeReceiptDialog({ open, onOpenChange, fee }: ModifyFeeReceiptDialogProps) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const receiptRef = useRef<HTMLDivElement>(null);

  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [transactionId, setTransactionId] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    if (fee && open) {
      setPaidAmount(fee.paid_amount || 0);
      setPaymentMethod(fee.payment_method || "Cash");
      setTransactionId(fee.transaction_id || "");
      setPaidDate(fee.paid_date ? fee.paid_date.substring(0, 10) : format(new Date(), "yyyy-MM-dd"));
      setShowReceipt(false);
    }
  }, [fee, open]);

  const handlePrint = useReactToPrint({
    // @ts-ignore
    contentRef: receiptRef,
    documentTitle: `Fee Receipt - ${fee?.payment_receipt_id}`,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!fee?.id || !currentOrganization?.id) throw new Error("Missing data");
      if (paidAmount <= 0) throw new Error("Amount must be greater than 0");

      // Update the student_fees record
      const { error } = await supabase
        .from("student_fees")
        .update({
          paid_amount: paidAmount,
          payment_method: paymentMethod,
          transaction_id: transactionId || null,
          paid_date: paidDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fee.id)
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;

      // Also update the matching voucher_entry if exists
      if (fee.payment_receipt_id) {
        await supabase
          .from("voucher_entries")
          .update({
            amount: paidAmount,
            payment_method: paymentMethod,
            transaction_id: transactionId || null,
            voucher_date: paidDate,
          })
          .eq("voucher_number", fee.payment_receipt_id)
          .eq("organization_id", currentOrganization.id);
      }
    },
    onSuccess: () => {
      toast.success("Receipt updated successfully");
      queryClient.invalidateQueries({ queryKey: ["fees-collected"] });
      queryClient.invalidateQueries({ queryKey: ["fee-collection-summary"] });
      queryClient.invalidateQueries({ queryKey: ["students-fee-collection"] });
      queryClient.invalidateQueries({ queryKey: ["student-fee-details"] });
      setShowReceipt(true);
    },
    onError: (err: any) => {
      toast.error("Update failed: " + err.message);
    },
  });

  if (!fee) return null;

  const studentName = fee.students?.student_name || "-";
  const admissionNumber = fee.students?.admission_number || "-";
  const className = fee.students?.school_classes?.class_name || "-";
  const feeHeadName = fee.fee_heads?.head_name || "-";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            Modify Receipt — {fee.payment_receipt_id}
          </DialogTitle>
        </DialogHeader>

        {!showReceipt ? (
          <div className="space-y-4">
            {/* Read-only info */}
            <div className="grid grid-cols-2 gap-3 text-sm p-3 rounded-lg bg-muted/50">
              <div><span className="text-muted-foreground">Student:</span> <strong>{studentName}</strong></div>
              <div><span className="text-muted-foreground">Adm No:</span> <strong>{admissionNumber}</strong></div>
              <div><span className="text-muted-foreground">Class:</span> <strong>{className}</strong></div>
              <div><span className="text-muted-foreground">Fee Head:</span> <strong>{feeHeadName}</strong></div>
            </div>

            {/* Editable fields */}
            <div className="space-y-3">
              <div>
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  min={1}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Transaction ID (optional)</Label>
                <Input
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="UPI / Card reference"
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || paidAmount <= 0}
              >
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Receipt updated. You can print the corrected receipt below.</p>
            <div ref={receiptRef}>
              <SchoolFeeReceipt
                receiptNumber={fee.payment_receipt_id}
                paidDate={paidDate}
                paymentMethod={paymentMethod}
                transactionId={transactionId}
                academicYear={fee.academic_years?.year_name || ""}
                student={{
                  student_name: studentName,
                  admission_number: admissionNumber,
                  parent_name: fee.students?.parent_name,
                  class_name: className,
                }}
                items={[{
                  head_name: feeHeadName,
                  paying: paidAmount,
                }]}
                totalPaying={paidAmount}
                remainingBalance={0}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={() => handlePrint()}>
                <Printer className="h-4 w-4 mr-2" />
                Print Receipt
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
