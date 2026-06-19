import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { invalidateCustomerAccountHistoryQueries } from "@/hooks/useCustomerAccountHistoryData";

interface CustomerOverpaymentRefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  organizationId: string;
  maxRefundable: number;
  onSuccess?: () => void;
}

export function CustomerOverpaymentRefundDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  organizationId,
  maxRefundable,
  onSuccess,
}: CustomerOverpaymentRefundDialogProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (open && maxRefundable > 0) {
      setAmount(maxRefundable.toFixed(2));
    }
  }, [open, maxRefundable]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setAmount("");
      setNote("");
      setMode("cash");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund Overpayment</DialogTitle>
          <DialogDescription>
            Record a refund to {customerName}. Max refundable: ₹{maxRefundable.toLocaleString("en-IN")}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Refund Amount</Label>
            <Input
              type="number"
              step="0.01"
              placeholder={maxRefundable.toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Payment Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Refund reason or reference"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isProcessing || !amount || parseFloat(amount) <= 0}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const refundAmount = parseFloat(amount);
              if (!refundAmount || refundAmount <= 0) {
                toast.error("Please enter a valid refund amount");
                return;
              }
              if (refundAmount > maxRefundable + 0.01) {
                toast.error(`Cannot refund more than ₹${maxRefundable.toLocaleString("en-IN")}`);
                return;
              }
              setIsProcessing(true);
              try {
                const {
                  data: { user },
                } = await supabase.auth.getUser();
                const voucherNum = `REFUND-${Date.now()}`;
                const { error } = await supabase.from("voucher_entries").insert({
                  organization_id: organizationId,
                  voucher_type: "payment",
                  voucher_number: voucherNum,
                  voucher_date: new Date().toISOString().split("T")[0],
                  reference_type: "customer",
                  reference_id: customerId,
                  total_amount: refundAmount,
                  payment_method: mode,
                  description: note || `Overpayment refund to ${customerName}`,
                  created_by: user?.id || null,
                });
                if (error) throw error;
                toast.success(`Refund of ₹${refundAmount.toLocaleString("en-IN")} recorded successfully`);
                await invalidateCustomerAccountHistoryQueries(queryClient, customerId, organizationId);
                onSuccess?.();
                handleOpenChange(false);
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Unknown error";
                toast.error(`Refund failed: ${message}`);
              } finally {
                setIsProcessing(false);
              }
            }}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Record Refund"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
