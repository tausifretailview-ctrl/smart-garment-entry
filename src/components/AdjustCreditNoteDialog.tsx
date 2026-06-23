import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { Loader2, IndianRupee } from "lucide-react";
import { fetchSupplierBalanceSnapshot } from "@/utils/supplierBalanceUtils";
import {
  derivePurchaseBillDisplayStatus,
  getPurchaseBillPendingAmount,
} from "@/utils/purchaseBillSettlement";

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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [adjustmentType, setAdjustmentType] = useState<"bill" | "refund" | "outstanding">("bill");
  const [selectedBillId, setSelectedBillId] = useState<string>("");
  const [refundMode, setRefundMode] = useState<"cash" | "bank">("cash");
  const [loading, setLoading] = useState(false);

  const canLoadBalance = open && !!supplierId && !!currentOrganization?.id;

  const {
    data: supplierBalance,
    isLoading: balanceLoading,
    isFetching: balanceFetching,
    isError: balanceError,
  } = useQuery({
    queryKey: ["supplier-balance-snapshot", currentOrganization?.id, supplierId, open],
    queryFn: async () => {
      if (!supplierId || !currentOrganization?.id) return null;
      return fetchSupplierBalanceSnapshot(supabase, currentOrganization.id, supplierId);
    },
    enabled: canLoadBalance,
    staleTime: 0,
  });

  const balanceDisplayLoading = canLoadBalance && (balanceLoading || balanceFetching) && !balanceError;

  // Fetch unpaid/partially paid bills for this supplier
  const { data: unpaidBills = [], isLoading: billsLoading } = useQuery({
    queryKey: ["unpaid-supplier-bills", supplierId, currentOrganization?.id],
    queryFn: async () => {
      if (!supplierId || !currentOrganization?.id) return [];

      // Get all bills for this supplier
      const { data: billsData, error: billsError } = await supabase
        .from("purchase_bills")
        .select(
          "id, software_bill_no, supplier_invoice_no, bill_date, net_amount, paid_amount, payment_status, is_cancelled"
        )
        .eq("supplier_id", supplierId)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .or("is_cancelled.is.null,is_cancelled.eq.false")
        .order("bill_date", { ascending: true });

      if (billsError) throw billsError;

      return (billsData || [])
        .filter((bill: any) => !bill.is_cancelled)
        .map((bill: any) => ({
          ...bill,
          pending_amount: getPurchaseBillPendingAmount(bill),
          display_status: derivePurchaseBillDisplayStatus(bill),
        }))
        .filter((bill: any) => bill.pending_amount > 0.01);
    },
    enabled: open && !!supplierId && !!currentOrganization?.id,
  });

  const totalPendingOnBills = unpaidBills.reduce(
    (sum: number, b: { pending_amount?: number }) => sum + (Number(b.pending_amount) || 0),
    0
  );

  const supplierOutstanding = supplierBalance?.balance ?? 0;

  useEffect(() => {
    if (!open) {
      setSelectedBillId("");
      setAdjustmentType("bill");
    }
  }, [open]);

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
        const newStatus =
          newPaidAmount >= (selectedBill.net_amount || 0) - 0.01 ? "paid" : newPaidAmount > 0.01 ? "partial" : "unpaid";
        const cnRemainder = Math.max(0, creditAmount - adjustAmount);

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
            credit_available_balance: cnRemainder,
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
              created_by: user?.id ?? null,
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
            created_by: user?.id ?? null,
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

        if (effectiveCreditNoteId) {
          // Existing credit_note voucher — just update description
          await supabase
            .from("voucher_entries")
            .update({
              description: `Credit Note adjusted to Outstanding Balance: ${creditNoteNumber}`,
            })
            .eq("id", effectiveCreditNoteId);
        } else {
          // Guard: a matching credit_note voucher may already exist
          const existing = await findExistingCreditNoteVoucher([creditNoteNumber]);
          if (existing) {
            await supabase
              .from("voucher_entries")
              .update({
                description: `Credit Note adjusted to Outstanding Balance: ${creditNoteNumber}`,
              })
              .eq("id", existing.id);
            await supabase
              .from("purchase_returns" as any)
              .update({ credit_note_id: existing.id })
              .eq("id", purchaseReturnId);
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
              created_by: user?.id ?? null,
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
        }

        toast({
          title: "Success",
          description: `Credit note adjusted to supplier outstanding balance. ₹${creditAmount.toFixed(2)} deducted.`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["supplier-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-balance"] });
      queryClient.invalidateQueries({ queryKey: ["floating-supplier-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["unpaid-supplier-bills"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-bills"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-returns"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-return-linked-bills"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-summary"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-bill-payment-voucher-drift"] });

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
          {/* Credit + supplier balance summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col items-center justify-center p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <span className="text-xs text-muted-foreground mb-1">Credit note to adjust</span>
              <div className="flex items-center">
                <IndianRupee className="h-5 w-5 mr-0.5 text-primary" />
                <span className="text-2xl font-bold text-primary tabular-nums">
                  {creditAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-muted rounded-lg border">
              <span className="text-xs text-muted-foreground mb-1">Supplier total balance (payable)</span>
              {!supplierId ? (
                <span className="text-sm text-muted-foreground text-center">Supplier not linked on this return</span>
              ) : balanceDisplayLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : balanceError ? (
                <span className="text-sm text-destructive text-center">Could not load balance</span>
              ) : (
                <div className="flex items-center">
                  <IndianRupee className="h-5 w-5 mr-0.5 text-foreground" />
                  <span className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                    {Math.abs(supplierOutstanding).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              <span className="text-[11px] text-muted-foreground mt-1 text-center">
                Same as Supplier Ledger outstanding payable
              </span>
            </div>
          </div>

          {!billsLoading && (
            <p className="text-sm text-center text-muted-foreground -mt-2">
              Pending on unpaid bills:{" "}
              <strong className="text-foreground tabular-nums">
                ₹{totalPendingOnBills.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              {unpaidBills.length > 0 ? ` (${unpaidBills.length} bill${unpaidBills.length === 1 ? "" : "s"})` : ""}
            </p>
          )}

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
                <div className="text-sm text-muted-foreground">
                  Apply to a pending purchase bill
                  {totalPendingOnBills > 0
                    ? ` (₹${totalPendingOnBills.toLocaleString("en-IN", { maximumFractionDigits: 0 })} pending)`
                    : ""}
                </div>
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
                <div className="text-sm text-muted-foreground">
                  Reduce supplier payable by ₹{creditAmount.toLocaleString("en-IN")} (not tied to one bill)
                </div>
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
          {adjustmentType === "outstanding" && canLoadBalance && !balanceDisplayLoading && !balanceError && (
            <div className="rounded-lg border bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 p-3 text-sm">
              <p className="text-violet-900 dark:text-violet-100">
                After apply: supplier balance ≈ ₹
                {Math.max(0, supplierOutstanding - creditAmount).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                payable
              </p>
            </div>
          )}

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
