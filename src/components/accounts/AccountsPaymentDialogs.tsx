import { format } from "date-fns";
import { CalendarIcon, Printer, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { cn } from "@/lib/utils";
import { useAccountsPaymentDialogs } from "@/hooks/useAccountsPaymentDialogs";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationBankAccounts } from "@/hooks/useOrganizationBankAccounts";
import { ReceivingBankAccountPicker } from "@/components/accounts/ReceivingBankAccountPicker";
import { paymentMethodNeedsReceivingBank } from "@/utils/organizationBankAccounts";

type AccountsPaymentDialogsApi = ReturnType<typeof useAccountsPaymentDialogs>;

interface AccountsPaymentDialogsProps {
  dialogs: AccountsPaymentDialogsApi;
  compactEdit?: boolean;
}

export function AccountsPaymentDialogs({ dialogs, compactEdit }: AccountsPaymentDialogsProps) {
  const { currentOrganization } = useOrganization();
  const { accounts: bankAccounts } = useOrganizationBankAccounts(currentOrganization?.id);
  const {
    receiptRef,
    showReceiptDialog,
    setShowReceiptDialog,
    receiptData,
    showEditPaymentDialog,
    setShowEditPaymentDialog,
    editingPayment,
    editPaymentDate,
    setEditPaymentDate,
    editPaymentAmount,
    setEditPaymentAmount,
    editPaymentMethod,
    setEditPaymentMethod,
    editChequeNumber,
    setEditChequeNumber,
    editChequeDate,
    setEditChequeDate,
    editTransactionId,
    setEditTransactionId,
    editDescription,
    setEditDescription,
    editReceivingBankAccountId,
    setEditReceivingBankAccountId,
    updatePayment,
    handlePrintReceipt,
    handleSendWhatsApp,
    companyDetails,
    receiptSettings,
  } = dialogs;

  return (
    <>
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className={cn("max-h-[90vh] overflow-y-auto", compactEdit ? "max-w-4xl" : "max-w-4xl")}>
          {receiptData ? (
            <>
              <DialogHeader>
                <DialogTitle>Payment Receipt</DialogTitle>
                <DialogDescription>Payment receipt for {receiptData.customerName}</DialogDescription>
              </DialogHeader>
              <div className="hidden">
                <PaymentReceipt
                  ref={receiptRef}
                  receiptData={receiptData}
                  companyDetails={companyDetails}
                  receiptSettings={receiptSettings}
                />
              </div>
              <div className="border rounded-lg p-4">
                <PaymentReceipt
                  receiptData={receiptData}
                  companyDetails={companyDetails}
                  receiptSettings={receiptSettings}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => handlePrintReceipt()}>
                  <Printer className="mr-2 h-4 w-4" /> Print Receipt
                </Button>
                {receiptData.customerPhone && (
                  <Button onClick={handleSendWhatsApp}>
                    <Send className="mr-2 h-4 w-4" /> Send via WhatsApp
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : (
            <div className="p-4 text-center text-muted-foreground">Loading receipt data...</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showEditPaymentDialog} onOpenChange={setShowEditPaymentDialog}>
        <DialogContent className={cn("overflow-y-auto", compactEdit ? "max-w-md max-h-[85vh]" : "max-w-md")}>
          <DialogHeader>
            <DialogTitle>Edit Payment Receipt</DialogTitle>
            <DialogDescription>Update payment details for {editingPayment?.voucher_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editPaymentDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editPaymentDate ? format(editPaymentDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={editPaymentDate}
                    onSelect={(date) => date && setEditPaymentDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Enter amount"
                value={editPaymentAmount}
                onChange={(e) => setEditPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={editPaymentMethod}
                onValueChange={(value) => {
                  setEditPaymentMethod(value);
                  if (!paymentMethodNeedsReceivingBank(value)) {
                    setEditReceivingBankAccountId(null);
                  }
                  if (value !== "cheque") {
                    setEditChequeNumber("");
                    setEditChequeDate(undefined);
                  }
                  if (
                    value !== "upi" &&
                    value !== "bank_transfer" &&
                    value !== "card" &&
                    value !== "online" &&
                    value !== "other"
                  ) {
                    setEditTransactionId("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {currentOrganization?.id && (
              <ReceivingBankAccountPicker
                organizationId={currentOrganization.id}
                paymentMethod={editPaymentMethod}
                value={editReceivingBankAccountId}
                onChange={setEditReceivingBankAccountId}
              />
            )}
            {editPaymentMethod === "cheque" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cheque Number</Label>
                  <Input
                    placeholder="Enter cheque number"
                    value={editChequeNumber}
                    onChange={(e) => setEditChequeNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cheque Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editChequeDate ? format(editChequeDate, "dd/MM/yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={editChequeDate} onSelect={setEditChequeDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
            {(editPaymentMethod === "upi" ||
              editPaymentMethod === "bank_transfer" ||
              editPaymentMethod === "card" ||
              editPaymentMethod === "online" ||
              editPaymentMethod === "other") && (
              <div className="space-y-2">
                <Label>Transaction ID</Label>
                <Input
                  placeholder="Enter transaction ID"
                  value={editTransactionId}
                  onChange={(e) => setEditTransactionId(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Payment description"
                value={editDescription.split(" | Cheque No:")[0].split(" | Transaction ID:")[0]}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPaymentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updatePayment.mutate({ bankAccounts })}
              disabled={updatePayment.isPending || !editPaymentAmount || parseFloat(editPaymentAmount) <= 0}
            >
              {updatePayment.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
