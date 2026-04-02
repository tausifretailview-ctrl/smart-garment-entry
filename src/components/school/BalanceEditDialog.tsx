import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface BalanceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: any;
}

export const BalanceEditDialog = ({ open, onOpenChange, student }: BalanceEditDialogProps) => {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const [balance, setBalance] = useState("");
  const [reason, setReason] = useState("");

  const handleOpenChange = (val: boolean) => {
    if (val && student) {
      setBalance(student.closing_fees_balance != null ? String(student.closing_fees_balance) : "");
      setReason("");
    }
    onOpenChange(val);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const newBalance = balance ? parseFloat(balance) : 0;
      const oldBalance = student.closing_fees_balance || 0;
      const orgId = currentOrganization?.id || student.organization_id;

      // Update students.closing_fees_balance ONLY — no student_fees ghost records
      const { error } = await supabase
        .from("students")
        .update({ closing_fees_balance: balance ? parseFloat(balance) : null })
        .eq("id", student.id);
      if (error) throw error;

      // Log the change as a voucher_entry note (NOT as student_fees — avoids ghost records)
      if (newBalance !== oldBalance && orgId) {
        try {
          await supabase.from("voucher_entries").insert({
            organization_id: orgId,
            voucher_type: "note",
            voucher_number: `BAL-ADJ-${Date.now()}`,
            voucher_date: new Date().toISOString().split("T")[0],
            total_amount: newBalance,
            description: `Opening balance set to ₹${newBalance.toLocaleString("en-IN")} (was ₹${oldBalance.toLocaleString("en-IN")})${reason ? ` — ${reason}` : ""}`,
            reference_type: "student_balance_adjustment",
            reference_id: student.id,
            payment_method: "cash",
          });
        } catch (auditErr) {
          console.error("Audit log failed (non-blocking):", auditErr);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students-fee-collection"] });
      queryClient.invalidateQueries({ queryKey: ["fee-collection-summary"] });
      queryClient.invalidateQueries({ queryKey: ["student-fee-payments-history"] });
      toast.success("Fees balance updated");
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to update"),
  });

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Fees Balance</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {student.student_name} ({student.admission_number})
          </p>
          <div className="space-y-2">
            <Label>Closing Fees Balance (₹)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="Enter balance amount"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Reason / Note (optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Previous year carry-forward, fee waiver..."
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
