import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { Loader2, IndianRupee } from "lucide-react";

interface AdjustCreditNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseReturnId: string; // Added to reliably identify the purchase return
  creditNoteId: string;
  creditNoteNumber: string;
  creditAmount: number;
  supplierId: string;
  supplierName: string;
  onSuccess?: () => void;
}

export function AdjustCreditNoteDialog({
  open,
  onOpenChange,
  purchaseReturnId,
  creditNoteId,
  creditNoteNumber,
  creditAmount,
  supplierId,
  supplierName,
  onSuccess,
}: AdjustCreditNoteDialogProps) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [adjustmentType, setAdjustmentType] = useState<"bill" | "refund" | "outstanding">("bill");
  const [selectedBillId, setSelectedBillId] = useState<string>("");
  const [refundMode, setRefundMode] = useState<"cash" | "bank">("cash");
  const [loading, setLoading] = useState(false);

  // Fetch unpaid/partially paid bills for this supplier
  const { data: unpaidBills = [], isLoading: billsLoading } = useQuery({
    queryKey: ["unpaid-supplier-bills", supplierId, currentOrganization?.id],
    queryFn: async () => {
      if (!supplierId || !currentOrganization?.id) return [];

      // Get all bills for this supplier
      const { data: billsData, error: billsError } = await supabase
        .from("purchase_bills")
        .select("id, software_bill_no, supplier_invoice_no, bill_date, net_amount, paid_amount, payment_status")
        .eq("supplier_id", supplierId)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .neq("payment_status", "paid")
        .order("bill_date", { ascending: true });

      if (billsError) throw billsError;

      // Calculate pending amount for each bill
      return (billsData || []).map((bill: any) => ({
        ...bill,
        pending_amount: (bill.net_amount || 0) - (bill.paid_amount || 0),
      })).filter((bill: any) => bill.pending_amount > 0);
    },
    enabled: open && !!supplierId && !!currentOrganization?.id,
  });

  const handleApply = async () => {
    if (adjustmentType === "bill" && !selectedBillId) {
      toast({
        title: "Error",
        description: "Please select a bill to adjust against",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Re-check current credit_note_id on the purchase_return so a second click
      // (after a successful save linked a voucher) does not insert a duplicate.
      let effectiveCreditNoteId = creditNoteId;
      try {
        const { data: prRow } = await supabase
          .from("purchase_returns" as any)
          .select("credit_note_id")
          .eq("id", purchaseReturnId)
          .maybeSingle();
        if (prRow && (prRow as any).credit_note_id) {
          effectiveCreditNoteId = (prRow as any).credit_note_id;
        }
      } catch {}

      // Helper: find an existing matching credit_note voucher to avoid duplicates
      const findExistingCreditNoteVoucher = async (descNeedles: string[]) => {
        const orFilter = descNeedles
          .filter(Boolean)
          .map((s) => `description.ilike.%${s.replace(/[%,()]/g, " ")}%`)
          .join(",");
        let q = supabase
          .from("voucher_entries")
          .select("id, description")
          .eq("organization_id", currentOrganization?.id)
          .eq("voucher_type", "credit_note")
          .eq("reference_type", "supplier")
          .eq("reference_id", supplierId)
          .eq("total_amount", creditAmount)
          .is("deleted_at", null);
        if (orFilter) q = q.or(orFilter);
        const { data } = await q.limit(1).maybeSingle();
        return data as { id: string; description: string } | null;
      };

      if (adjustmentType === "bill") {
        // Adjust against bill - update bill's paid_amount and payment_status
        const selectedBill = unpaidBills.find((b: any) => b.id === selectedBillId);
        if (!selectedBill) throw new Error("Bill not found");

        const adjustAmount = Math.min(creditAmount, selectedBill.pending_amount);
        const newPaidAmount = (selectedBill.paid_amount || 0) + adjustAmount;
        const newStatus = newPaidAmount >= selectedBill.net_amount ? "paid" : "partial";

        // Update the bill
        const { error: billError } = await supabase
          .from("purchase_bills")
          .update({
            paid_amount: newPaidAmount,
            payment_status: newStatus,
          })
          .eq("id", selectedBillId);

        if (billError) throw billError;

        // Update the purchase return credit status using purchaseReturnId
        const { error: returnError } = await supabase
          .from("purchase_returns" as any)
          .update({
            credit_status: "adjusted",
            linked_bill_id: selectedBillId,
          })
          .eq("id", purchaseReturnId);

        if (returnError) throw returnError;

        if (effectiveCreditNoteId) {
          // Update existing credit note description
          await supabase
            .from("voucher_entries")
            .update({
              description: `Credit Note adjusted against Bill: ${selectedBill.supplier_invoice_no || selectedBill.software_bill_no}`,
            })
            .eq("id", effectiveCreditNoteId);
        } else {
          // Guard: a voucher might already exist (created earlier, but not linked to PR)
          const existing = await findExistingCreditNoteVoucher([
            creditNoteNumber,
            selectedBill.supplier_invoice_no,
            selectedBill.software_bill_no,
          ]);
          if (existing) {
            await supabase
              .from("voucher_entries")
              .update({
                description: `Credit Note adjusted against Bill: ${selectedBill.supplier_invoice_no || selectedBill.software_bill_no}`,
              })
              .eq("id", existing.id);
            await supabase
              .from("purchase_returns" as any)
              .update({ credit_note_id: existing.id })
              .eq("id", purchaseReturnId);
          } else {
          // Create credit_note voucher now (was not auto-created at return save time)
          const today = format(new Date(), "yyyy-MM-dd");
          const { data: lastVoucher } = await supabase
            .from("voucher_entries")
            .select("voucher_number")
            .eq("organization_id", currentOrganization?.id)
            .eq("voucher_type", "credit_note")
            .order("created_at", { ascending: false })
            .limit(1);

          const lastNum = lastVoucher?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
          const newVoucherNumber = `SCN-${String(parseInt(lastNum) + 1).padStart(5, "0")}`;

          const { data: newVoucher, error: vnError } = await supabase
            .from("voucher_entries")
            .insert({
              organization_id: currentOrganization?.id,
              voucher_number: newVoucherNumber,
              voucher_type: "credit_note",
              voucher_date: today,
              reference_type: "supplier",
              reference_id: supplierId,
              description: `Credit Note adjusted against Bill: ${selectedBill.supplier_invoice_no || selectedBill.software_bill_no}`,
              total_amount: creditAmount,
            })
            .select()
            .single();

          if (vnError) throw vnError;

          // Link new voucher to purchase return
          await supabase
            .from("purchase_returns" as any)
            .update({ credit_note_id: newVoucher.id })
            .eq("id", purchaseReturnId);
          }
        }

        toast({
          title: "Success",
          description: `Credit note adjusted against bill. ₹${adjustAmount.toFixed(2)} applied.`,
        });
      } else if (adjustmentType === "refund") {
        // Mark as refund - create a receipt voucher
        const today = format(new Date(), "yyyy-MM-dd");

        // Generate receipt voucher number
        const { data: lastVoucher } = await supabase
          .from("voucher_entries")
          .select("voucher_number")
          .eq("organization_id", currentOrganization?.id)
          .eq("voucher_type", "receipt")
          .order("created_at", { ascending: false })
          .limit(1);

        const lastNum = lastVoucher?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
        const newVoucherNumber = `RCP-${String(parseInt(lastNum) + 1).padStart(5, "0")}`;

        // Create receipt voucher
        const { error: receiptError } = await supabase
          .from("voucher_entries")
          .insert({
            organization_id: currentOrganization?.id,
            voucher_number: newVoucherNumber,
            voucher_type: "receipt",
            voucher_date: today,
            reference_type: "supplier",
            reference_id: supplierId,
            description: `Refund received for Credit Note: ${creditNoteNumber}`,
            total_amount: creditAmount,
            payment_method: refundMode,
          });

        if (receiptError) throw receiptError;

        // Update the purchase return credit status using purchaseReturnId
        const { error: returnError } = await supabase
          .from("purchase_returns" as any)
          .update({
            credit_status: "refunded",
          })
          .eq("id", purchaseReturnId);

        if (returnError) throw returnError;

        toast({
          title: "Success",
          description: `Credit note marked as refunded. Receipt voucher created.`,
        });
      } else if (adjustmentType === "outstanding") {
        // Update purchase return credit status
        const { error: returnError } = await supabase
          .from("purchase_returns" as any)
          .update({ credit_status: "adjusted_outstanding" })
          .eq("id", purchaseReturnId);

        if (returnError) throw returnError;

        if (creditNoteId) {
          // Existing credit_note voucher — just update description
          await supabase
            .from("voucher_entries")
            .update({
              description: `Credit Note adjusted to Outstanding Balance: ${creditNoteNumber}`,
            })
            .eq("id", creditNoteId);
        } else {
          // No credit_note voucher was created at save time — create one now
          const today = format(new Date(), "yyyy-MM-dd");
          const { data: lastVoucher } = await supabase
            .from("voucher_entries")
            .select("voucher_number")
            .eq("organization_id", currentOrganization?.id)
            .eq("voucher_type", "credit_note")
            .order("created_at", { ascending: false })
            .limit(1);

          const lastNum = lastVoucher?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
          const newVoucherNumber = `SCN-${String(parseInt(lastNum) + 1).padStart(5, "0")}`;

          const { data: newVoucher, error: vnError } = await supabase
            .from("voucher_entries")
            .insert({
              organization_id: currentOrganization?.id,
              voucher_number: newVoucherNumber,
              voucher_type: "credit_note",
              voucher_date: today,
              reference_type: "supplier",
              reference_id: supplierId,
              description: `Credit Note adjusted to Outstanding Balance: ${creditNoteNumber}`,
              total_amount: creditAmount,
            })
            .select()
            .single();

          if (vnError) throw vnError;

          // Link this new voucher back to the purchase return
          await supabase
            .from("purchase_returns" as any)
            .update({ credit_note_id: newVoucher.id })
            .eq("id", purchaseReturnId);
        }

        toast({
          title: "Success",
          description: `Credit note adjusted to supplier outstanding balance. ₹${creditAmount.toFixed(2)} deducted.`,
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error adjusting credit note:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to adjust credit note",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Adjust Credit Note</DialogTitle>
          <DialogDescription>
            Credit Note: <strong>{creditNoteNumber}</strong> | Supplier: <strong>{supplierName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Credit Amount Display */}
          <div className="flex items-center justify-center p-4 bg-muted rounded-lg">
            <IndianRupee className="h-5 w-5 mr-1 text-primary" />
            <span className="text-2xl font-bold text-primary">{creditAmount.toFixed(2)}</span>
          </div>

          {/* Adjustment Type */}
          <RadioGroup
            value={adjustmentType}
            onValueChange={(value) => setAdjustmentType(value as "bill" | "refund" | "outstanding")}
            className="space-y-3"
          >
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="bill" id="bill" />
              <Label htmlFor="bill" className="flex-1 cursor-pointer">
                <div className="font-medium">Adjust Against Bill</div>
                <div className="text-sm text-muted-foreground">Reduce outstanding amount on an unpaid bill</div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="refund" id="refund" />
              <Label htmlFor="refund" className="flex-1 cursor-pointer">
                <div className="font-medium">Mark as Refund</div>
                <div className="text-sm text-muted-foreground">Cash/bank refund received from supplier</div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="outstanding" id="outstanding" />
              <Label htmlFor="outstanding" className="flex-1 cursor-pointer">
                <div className="font-medium">Adjust in Outstanding Balance</div>
                <div className="text-sm text-muted-foreground">Reduce supplier's overall balance without linking to a specific bill</div>
              </Label>
            </div>
          </RadioGroup>

          {/* Bill Selection */}
          {adjustmentType === "bill" && (
            <div className="space-y-2">
              <Label>Select Bill to Adjust</Label>
              {billsLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : unpaidBills.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                  No unpaid bills found for this supplier
                </p>
              ) : (
                <Select value={selectedBillId} onValueChange={setSelectedBillId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a bill..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unpaidBills.map((bill: any) => (
                      <SelectItem key={bill.id} value={bill.id}>
                        <div className="flex justify-between items-center gap-4">
                          <span>{bill.supplier_invoice_no || bill.software_bill_no}</span>
                          <span className="text-muted-foreground text-sm">
                            Pending: ₹{bill.pending_amount.toFixed(2)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Refund Mode */}
          {adjustmentType === "refund" && (
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={refundMode} onValueChange={(value) => setRefundMode(value as "cash" | "bank")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
