import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { Loader2, IndianRupee } from "lucide-react";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import {
  deleteJournalEntryByReference,
  recordCustomerCreditNoteApplicationJournalEntry,
} from "@/utils/accounting/journalService";

interface AdjustCustomerCreditNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleReturnId: string;
  creditNoteId: string;
  returnNumber: string;
  creditAmount: number;
  customerId: string;
  customerName: string;
  onSuccess?: () => void;
}

export function AdjustCustomerCreditNoteDialog({
  open,
  onOpenChange,
  saleReturnId,
  creditNoteId,
  returnNumber,
  creditAmount,
  customerId,
  customerName,
  onSuccess,
}: AdjustCustomerCreditNoteDialogProps) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [adjustmentType, setAdjustmentType] = useState<"invoice" | "refund" | "outstanding">("invoice");
  const [selectedSaleId, setSelectedSaleId] = useState<string>("");
  const [refundMode, setRefundMode] = useState<"cash" | "bank">("cash");
  const [loading, setLoading] = useState(false);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);

  // Fetch unpaid/partially paid sales for this customer
  const { data: unpaidSales = [], isLoading: salesLoading } = useQuery({
    queryKey: ["unpaid-customer-sales", customerId, currentOrganization?.id],
    queryFn: async () => {
      if (!customerId || customerId === '' || !currentOrganization?.id) return [];

      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, net_amount, paid_amount, payment_status, is_cancelled")
        .eq("customer_id", customerId)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .or("payment_status.is.null,payment_status.neq.completed")
        .order("sale_date", { ascending: true });

      if (salesError) throw salesError;

      return (salesData || [])
        .filter((sale: any) => !sale.is_cancelled)
        .map((sale: any) => ({
        ...sale,
        pending_amount: (sale.net_amount || 0) - (sale.paid_amount || 0),
      })).filter((sale: any) => sale.pending_amount > 0);
    },
    enabled: open && !!customerId && customerId !== '' && !!currentOrganization?.id,
  });

  const handleApply = async () => {
    if (loading) return;
    if (adjustmentType === "invoice" && !selectedSaleId) {
      toast({
        title: "Error",
        description: "Please select an invoice to adjust against",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: currentReturn, error: currentReturnError } = await supabase
        .from("sale_returns")
        .select("credit_status")
        .eq("id", saleReturnId)
        .single();

      if (currentReturnError) throw currentReturnError;

      if (["adjusted", "adjusted_outstanding"].includes((currentReturn as any)?.credit_status || "")) {
        toast({
          title: "Already Adjusted",
          description: "This return has already been adjusted.",
          variant: "destructive",
        });
        return;
      }

      if (adjustmentType === "invoice") {
        // Adjust against invoice - update sale's paid_amount and payment_status
        const selectedSale = unpaidSales.find((s: any) => s.id === selectedSaleId);
        if (!selectedSale) throw new Error("Invoice not found");

        const adjustAmount = Math.min(creditAmount, selectedSale.pending_amount);
        const newPaidAmount = (selectedSale.paid_amount || 0) + adjustAmount;
        const newStatus = newPaidAmount >= selectedSale.net_amount ? "completed" : "partial";

        // Fetch current sale_return_adjust to accumulate
        const { data: currentSale } = await supabase
          .from("sales")
          .select("sale_return_adjust")
          .eq("id", selectedSaleId)
          .single();
        const existingAdjust = currentSale?.sale_return_adjust || 0;

        // Update the sale
        const { error: saleError } = await supabase
          .from("sales")
          .update({
            paid_amount: newPaidAmount,
            payment_status: newStatus,
            sale_return_adjust: existingAdjust + adjustAmount,
          })
          .eq("id", selectedSaleId);

        if (saleError) throw saleError;

        // Update the sale return credit status
        const { error: returnError } = await supabase
          .from("sale_returns")
          .update({
            credit_status: "adjusted",
            linked_sale_id: selectedSaleId,
          })
          .eq("id", saleReturnId);

        if (returnError) throw returnError;

        // Update the voucher entry description if creditNoteId exists
        if (creditNoteId && creditNoteId !== '') {
          const { error: voucherError } = await supabase
            .from("voucher_entries")
            .update({
              description: `Credit Note adjusted against Invoice: ${selectedSale.sale_number}`,
            })
            .eq("id", creditNoteId);

          if (voucherError) throw voucherError;
        }

        toast({
          title: "Success",
          description: `Credit note adjusted against invoice. ₹${adjustAmount.toFixed(2)} applied.`,
        });
      } else if (adjustmentType === "refund") {
        // Mark as refund - create a payment voucher
        const today = format(new Date(), "yyyy-MM-dd");

        // Generate payment voucher number
        const { data: lastVoucher } = await supabase
          .from("voucher_entries")
          .select("voucher_number")
          .eq("organization_id", currentOrganization?.id)
          .eq("voucher_type", "payment")
          .order("created_at", { ascending: false })
          .limit(1);

        const lastNum = lastVoucher?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
        const newVoucherNumber = `PAY-${String(parseInt(lastNum) + 1).padStart(5, "0")}`;

        // Create payment voucher (refund to customer)
        const insertData: any = {
          organization_id: currentOrganization?.id,
          voucher_number: newVoucherNumber,
          voucher_type: "payment",
          voucher_date: today,
          reference_type: "customer",
          description: `Refund paid for Sale Return: ${returnNumber}`,
          total_amount: creditAmount,
          payment_method: refundMode,
        };
        if (customerId && customerId !== '') {
          insertData.reference_id = customerId;
        }
        const { error: paymentError } = await supabase
          .from("voucher_entries")
          .insert(insertData);

        if (paymentError) throw paymentError;

        // Update the sale return credit status
        const { error: returnError } = await supabase
          .from("sale_returns")
          .update({
            credit_status: "refunded",
          })
          .eq("id", saleReturnId);

        if (returnError) throw returnError;

        toast({
          title: "Success",
          description: `Refund marked as paid. Payment voucher created.`,
        });
      } else if (adjustmentType === "outstanding") {
        const prevReturnCreditStatus = String((currentReturn as any)?.credit_status || "pending");
        // Adjust in Outstanding Balance - mark return + apply credit against linked invoice
        const { error: returnError } = await supabase
          .from("sale_returns")
          .update({
            credit_status: "adjusted_outstanding",
          })
          .eq("id", saleReturnId);

        if (returnError) throw returnError;

        // Find linked invoice on the sale_return so we can apply the credit to it
        const { data: srRow } = await supabase
          .from("sale_returns")
          .select("linked_sale_id")
          .eq("id", saleReturnId)
          .single();
        const linkedSaleId = (srRow as any)?.linked_sale_id || null;

        if (linkedSaleId && creditAmount > 0) {
          const { data: linkedSale } = await supabase
            .from("sales")
            .select("paid_amount, net_amount, sale_return_adjust, payment_status")
            .eq("id", linkedSaleId)
            .single();

          if (linkedSale) {
            const adjustAmount = Math.min(
              creditAmount,
              Math.max(0, (linkedSale.net_amount || 0) - (linkedSale.paid_amount || 0))
            );
            const snapPaid = Number(linkedSale.paid_amount || 0);
            const snapSr = Number((linkedSale as any).sale_return_adjust || 0);
            const snapStatus = String(linkedSale.payment_status || "pending");
            const newPaidAmount = snapPaid + adjustAmount;
            const newStatus =
              newPaidAmount >= (linkedSale.net_amount || 0) ? "completed" : "partial";

            await supabase
              .from("sales")
              .update({
                paid_amount: newPaidAmount,
                payment_status: newStatus,
                sale_return_adjust: snapSr + adjustAmount,
              })
              .eq("id", linkedSaleId);

            const today = format(new Date(), "yyyy-MM-dd");
            const { data: lastRcp } = await supabase
              .from("voucher_entries")
              .select("voucher_number")
              .eq("organization_id", currentOrganization?.id)
              .eq("voucher_type", "receipt")
              .order("created_at", { ascending: false })
              .limit(1);
            const lastNum =
              lastRcp?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
            const newVoucherNumber = `RCP-${String(parseInt(lastNum) + 1).padStart(5, "0")}`;
            const cnApplyDesc = `Credit note adjusted against invoice (Return ${returnNumber})`;

            const { data: outVoucherRow, error: outVoucherErr } = await supabase
              .from("voucher_entries")
              .insert({
                organization_id: currentOrganization?.id,
                voucher_number: newVoucherNumber,
                voucher_type: "receipt",
                voucher_date: today,
                reference_type: "sale",
                reference_id: linkedSaleId,
                total_amount: adjustAmount,
                payment_method: "credit_note_adjustment",
                description: cnApplyDesc,
              })
              .select("id")
              .single();
            if (outVoucherErr) throw outVoucherErr;
            const outVoucherId = outVoucherRow?.id as string | undefined;

            const { data: acctOut } = await supabase
              .from("settings")
              .select("accounting_engine_enabled")
              .eq("organization_id", currentOrganization?.id)
              .maybeSingle();
            if (
              outVoucherId &&
              Boolean(
                (acctOut as { accounting_engine_enabled?: boolean } | null)?.accounting_engine_enabled
              )
            ) {
              try {
                await recordCustomerCreditNoteApplicationJournalEntry(
                  outVoucherId,
                  currentOrganization!.id,
                  adjustAmount,
                  today,
                  cnApplyDesc,
                  supabase
                );
              } catch (glErr) {
                await deleteJournalEntryByReference(
                  currentOrganization!.id,
                  "CustomerCreditNoteApplication",
                  outVoucherId,
                  supabase
                );
                await supabase.from("voucher_entries").delete().eq("id", outVoucherId);
                await supabase
                  .from("sales")
                  .update({
                    paid_amount: snapPaid,
                    payment_status: snapStatus as "pending" | "partial" | "completed",
                    sale_return_adjust: snapSr,
                  })
                  .eq("id", linkedSaleId);
                await supabase
                  .from("sale_returns")
                  .update({ credit_status: prevReturnCreditStatus })
                  .eq("id", saleReturnId);
                throw glErr;
              }
            }
          }
        }

        // Update voucher description if creditNoteId exists
        if (creditNoteId && creditNoteId !== '') {
          const { error: voucherError } = await supabase
            .from("voucher_entries")
            .update({
              description: `Credit Note adjusted to Outstanding Balance: ${returnNumber}`,
            })
            .eq("id", creditNoteId);

          if (voucherError) throw voucherError;
        }

        toast({
          title: "Success",
          description: `Credit note adjusted to customer outstanding balance. ₹${creditAmount.toFixed(2)} deducted.`,
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
            Return: <strong>{returnNumber}</strong> | Customer: <button className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-bold" onClick={() => setShowCustomerHistory(true)}>{customerName}</button>
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
            onValueChange={(value) => setAdjustmentType(value as "invoice" | "refund" | "outstanding")}
            className="space-y-3"
          >
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="invoice" id="invoice" />
              <Label htmlFor="invoice" className="flex-1 cursor-pointer">
                <div className="font-medium">Adjust Against Invoice</div>
                <div className="text-sm text-muted-foreground">Reduce outstanding amount on an unpaid invoice</div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="refund" id="refund" />
              <Label htmlFor="refund" className="flex-1 cursor-pointer">
                <div className="font-medium">Mark as Refund</div>
                <div className="text-sm text-muted-foreground">Cash/bank refund paid to customer</div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="outstanding" id="outstanding" />
              <Label htmlFor="outstanding" className="flex-1 cursor-pointer">
                <div className="font-medium">Adjust in Outstanding Balance</div>
                <div className="text-sm text-muted-foreground">Reduce customer's overall balance without linking to a specific invoice</div>
              </Label>
            </div>
          </RadioGroup>

          {/* Invoice Selection */}
          {adjustmentType === "invoice" && (
            <div className="space-y-2">
              <Label>Select Invoice to Adjust</Label>
              {salesLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : unpaidSales.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                  No unpaid invoices found for this customer
                </p>
              ) : (
                <Select value={selectedSaleId} onValueChange={setSelectedSaleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an invoice..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unpaidSales.map((sale: any) => (
                      <SelectItem key={sale.id} value={sale.id}>
                        <div className="flex justify-between items-center gap-4">
                          <span>{sale.sale_number}</span>
                          <span className="text-muted-foreground text-sm">
                            Pending: ₹{sale.pending_amount.toFixed(2)}
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

        {customerId && (
          <CustomerHistoryDialog
            open={showCustomerHistory}
            onOpenChange={setShowCustomerHistory}
            customerId={customerId}
            customerName={customerName}
            organizationId={currentOrganization?.id || ""}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
