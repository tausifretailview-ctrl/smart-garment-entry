import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/loading-button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ReassignPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: any; // voucher_entries row
  customerId: string;
  customerName: string;
  organizationId: string;
}

export function ReassignPaymentDialog({
  open,
  onOpenChange,
  payment,
  customerId,
  customerName,
  organizationId,
}: ReassignPaymentDialogProps) {
  const queryClient = useQueryClient();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const paymentAmount = Number(payment?.total_amount) || 0;

  // Fetch pending/partial invoices for this customer
  const { data: pendingInvoices, isLoading } = useQuery({
    queryKey: ["reassign-pending-invoices", customerId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, net_amount, paid_amount, payment_status")
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .in("payment_status", ["pending", "partial"])
        .is("deleted_at", null)
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customerId,
  });

  const reassignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoiceId || !payment) throw new Error("Select an invoice");

      // Get invoice details
      const { data: invoice, error: invErr } = await supabase
        .from("sales")
        .select("id, sale_number, net_amount, paid_amount")
        .eq("id", selectedInvoiceId)
        .single();
      if (invErr || !invoice) throw new Error("Invoice not found");

      const currentPaid = invoice.paid_amount || 0;
      const outstanding = invoice.net_amount - currentPaid;

      if (outstanding <= 0) throw new Error("Invoice is already fully paid");

      // If payment exceeds outstanding, warn
      if (paymentAmount > outstanding) {
        throw new Error(`Payment ₹${paymentAmount} exceeds invoice outstanding ₹${Math.round(outstanding)}. Please split the payment first.`);
      }

      const newPaidAmount = currentPaid + paymentAmount;
      const newStatus = newPaidAmount >= invoice.net_amount ? "completed" : newPaidAmount > 0 ? "partial" : "pending";

      // Update the invoice
      const { error: saleErr } = await supabase
        .from("sales")
        .update({
          paid_amount: newPaidAmount,
          payment_status: newStatus,
        })
        .eq("id", selectedInvoiceId);
      if (saleErr) throw saleErr;

      // Update the voucher entry
      const { error: voucherErr } = await supabase
        .from("voucher_entries")
        .update({
          reference_type: "sale",
          reference_id: selectedInvoiceId,
          description: `Payment for ${invoice.sale_number} (reassigned from Opening Balance)`,
        })
        .eq("id", payment.id);
      if (voucherErr) throw voucherErr;

      return { invoiceNumber: invoice.sale_number };
    },
    onSuccess: (data) => {
      toast.success(`Payment reassigned to invoice ${data.invoiceNumber}`);
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["reassign-pending-invoices"] });
      onOpenChange(false);
      setSelectedInvoiceId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const selectedInvoice = pendingInvoices?.find(inv => inv.id === selectedInvoiceId);
  const selectedOutstanding = selectedInvoice ? (selectedInvoice.net_amount - (selectedInvoice.paid_amount || 0)) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelectedInvoiceId(null); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link Payment to Invoice</DialogTitle>
          <DialogDescription>
            Reassign ₹{paymentAmount.toLocaleString("en-IN")} from {customerName}'s opening balance to a pending invoice.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading invoices...</p>
        ) : !pendingInvoices?.length ? (
          <p className="text-sm text-muted-foreground py-4">No pending invoices found for this customer.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvoices.map((inv) => {
                  const outstanding = inv.net_amount - (inv.paid_amount || 0);
                  const isSelected = selectedInvoiceId === inv.id;
                  const exceedsOutstanding = paymentAmount > outstanding;
                  return (
                    <TableRow
                      key={inv.id}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isSelected && "bg-primary/10",
                        exceedsOutstanding && "opacity-50"
                      )}
                      onClick={() => !exceedsOutstanding && setSelectedInvoiceId(isSelected ? null : inv.id)}
                    >
                      <TableCell>
                        <input
                          type="radio"
                          checked={isSelected}
                          readOnly
                          disabled={exceedsOutstanding}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{inv.sale_number}</TableCell>
                      <TableCell>{inv.sale_date ? format(new Date(inv.sale_date), "dd/MM/yyyy") : "-"}</TableCell>
                      <TableCell>₹{Math.round(inv.net_amount).toLocaleString("en-IN")}</TableCell>
                      <TableCell>₹{Math.round(inv.paid_amount || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Badge variant={exceedsOutstanding ? "secondary" : "destructive"}>
                          ₹{Math.round(outstanding).toLocaleString("en-IN")}
                        </Badge>
                        {exceedsOutstanding && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (payment exceeds)
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {selectedInvoiceId && (
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-md text-sm space-y-1">
            <div className="flex justify-between">
              <span>Payment Amount:</span>
              <span className="font-medium">₹{paymentAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between">
              <span>Invoice Outstanding:</span>
              <span className="font-medium">₹{Math.round(selectedOutstanding).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between font-medium text-primary">
              <span>Remaining After:</span>
              <span>₹{Math.round(selectedOutstanding - paymentAmount).toLocaleString("en-IN")}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton
            loading={reassignMutation.isPending}
            disabled={!selectedInvoiceId}
            onClick={() => reassignMutation.mutate()}
          >
            Reassign Payment
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
