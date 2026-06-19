import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useReactToPrint } from "react-to-print";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { whatsappPaymentReceiptDiscountLines } from "@/utils/paymentReceiptWhatsApp";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useEntryOwnership } from "@/hooks/useEntryOwnership";
import {
  fetchSaleReceiptSplitsForInvoices,
  reconcileSaleInvoiceWithSplit,
} from "@/utils/customerBalanceUtils";
import {
  appendReceivingBankToDescription,
  paymentMethodNeedsReceivingBank,
  stripReceivingBankFromDescription,
  validateReceivingBankForSave,
  type OrganizationBankAccount,
} from "@/utils/organizationBankAccounts";

export function useAccountsPaymentDialogs(settings: any) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { canModify: canModifyEntry } = useEntryOwnership();
  const receiptRef = useRef<HTMLDivElement>(null);

  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

  const [showEditPaymentDialog, setShowEditPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [editPaymentDate, setEditPaymentDate] = useState<Date>(new Date());
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("cash");
  const [editChequeNumber, setEditChequeNumber] = useState("");
  const [editChequeDate, setEditChequeDate] = useState<Date | undefined>(undefined);
  const [editTransactionId, setEditTransactionId] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editReceivingBankAccountId, setEditReceivingBankAccountId] = useState<string | null>(null);

  const handleShowReceipt = (data: any) => {
    setReceiptData(data);
    setShowReceiptDialog(true);
  };

  const openEditPaymentDialog = (voucher: any) => {
    const own = canModifyEntry(voucher?.created_by);
    if (!own.allowed) {
      toast.error(own.reason || "Only the creator or an admin can edit this payment.");
      return;
    }
    setEditingPayment(voucher);
    setEditPaymentDate(new Date(voucher.voucher_date));
    setEditPaymentAmount(voucher.total_amount?.toString() || "");
    const desc = voucher.description || "";
    if (desc.includes("Cheque No:")) {
      setEditPaymentMethod("cheque");
      const chequeMatch = desc.match(/Cheque No: (\d+)/);
      const dateMatch = desc.match(/Date: (\d{2}\/\d{2}\/\d{4})/);
      if (chequeMatch) setEditChequeNumber(chequeMatch[1]);
      if (dateMatch) {
        const [day, month, year] = dateMatch[1].split("/");
        setEditChequeDate(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)));
      }
    } else if (desc.includes("Transaction ID:")) {
      const txMatch = desc.match(/Transaction ID: (\S+)/);
      if (txMatch) setEditTransactionId(txMatch[1]);
      setEditPaymentMethod(voucher.payment_method || "upi");
    } else {
      setEditPaymentMethod(voucher.payment_method || "cash");
      setEditChequeNumber("");
      setEditChequeDate(undefined);
      setEditTransactionId("");
    }
    setEditReceivingBankAccountId(
      (voucher as { receiving_bank_account_id?: string | null }).receiving_bank_account_id ?? null,
    );
    setEditDescription(stripReceivingBankFromDescription(desc));
    setShowEditPaymentDialog(true);
  };

  const updatePayment = useMutation({
    mutationFn: async ({
      bankAccounts = [],
    }: { bankAccounts?: OrganizationBankAccount[] } = {}) => {
      if (!editingPayment || !currentOrganization?.id) throw new Error("No payment selected");
      const ownership = canModifyEntry(editingPayment?.created_by);
      if (!ownership.allowed) {
        throw new Error(ownership.reason || "Only the creator or an admin can edit this payment.");
      }
      const newAmount = parseFloat(editPaymentAmount);
      const oldAmount = editingPayment.total_amount || 0;
      const amountDiff = newAmount - oldAmount;
      let paymentDetails = "";
      if (editPaymentMethod === "cheque" && editChequeNumber) {
        paymentDetails = ` | Cheque No: ${editChequeNumber}`;
        if (editChequeDate) paymentDetails += `, Date: ${format(editChequeDate, "dd/MM/yyyy")}`;
      } else if (
        (editPaymentMethod === "upi" ||
          editPaymentMethod === "bank_transfer" ||
          editPaymentMethod === "card" ||
          editPaymentMethod === "online" ||
          editPaymentMethod === "other") &&
        editTransactionId
      ) {
        paymentDetails = ` | Transaction ID: ${editTransactionId}`;
      }
      const bankValidation = validateReceivingBankForSave(
        editPaymentMethod,
        bankAccounts,
        editReceivingBankAccountId,
      );
      if (!bankValidation.ok) {
        throw new Error("message" in bankValidation ? bankValidation.message : "Invalid receiving bank");
      }
      const receivingBankAccountId = bankValidation.bankAccountId;
      const bankAccount = receivingBankAccountId
        ? bankAccounts.find((a) => a.id === receivingBankAccountId) ?? null
        : null;
      const baseDescription = stripReceivingBankFromDescription(
        editDescription.split(" | Cheque No:")[0].split(" | Transaction ID:")[0],
      );
      let finalDescription = baseDescription + paymentDetails;
      if (bankAccount) {
        finalDescription = appendReceivingBankToDescription(finalDescription, bankAccount);
      }
      const { error: voucherError } = await supabase
        .from("voucher_entries")
        .update({
          voucher_date: format(editPaymentDate, "yyyy-MM-dd"),
          total_amount: newAmount,
          payment_method: editPaymentMethod,
          description: finalDescription,
          receiving_bank_account_id: receivingBankAccountId,
        })
        .eq("id", editingPayment.id)
        .eq("organization_id", currentOrganization.id);
      if (voucherError) throw voucherError;
      // Re-derive the linked invoice's paid_amount/status from receipt vouchers (cash +
      // settlement discount), not naive `paid_amount + amountDiff`. The old math ignored
      // discount_amount and sale_return_adjust, so editing a payment that carried a
      // settlement discount desynced the invoice (wrong "paid"/"settled").
      if (editingPayment.reference_id && amountDiff !== 0) {
        const { data: invoice } = await supabase
          .from("sales")
          .select("id, net_amount, paid_amount, sale_return_adjust, customer_id, sale_number")
          .eq("id", editingPayment.reference_id)
          .eq("organization_id", currentOrganization.id)
          .maybeSingle();
        if (invoice) {
          const splitMap = await fetchSaleReceiptSplitsForInvoices(
            supabase,
            currentOrganization.id,
            [{ id: invoice.id, sale_number: invoice.sale_number, customer_id: invoice.customer_id }],
          );
          const split = splitMap.get(invoice.id) ?? { cash: 0, cn: 0, adv: 0, discount: 0 };
          const rec = reconcileSaleInvoiceWithSplit(invoice, split);
          await supabase
            .from("sales")
            .update({ paid_amount: rec.paid_amount, payment_status: rec.payment_status })
            .eq("id", editingPayment.reference_id)
            .eq("organization_id", currentOrganization.id);
        }
      }
      return { oldAmount, newAmount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payment-reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["customer-payment-history"] });
      queryClient.invalidateQueries({ queryKey: ["customer-sales-history"] });
      queryClient.invalidateQueries({ queryKey: ["customer-credit-notes-history"] });
      queryClient.invalidateQueries({ queryKey: ["customer-sale-returns-history"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances-history"] });
      queryClient.invalidateQueries({ queryKey: ["customer-financial-snapshot"] });
      toast.success(
        `Payment updated. Amount changed from ₹${Math.round(data.oldAmount).toLocaleString("en-IN")} to ₹${Math.round(data.newAmount).toLocaleString("en-IN")}`
      );
      setShowEditPaymentDialog(false);
      setEditingPayment(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update payment: ${error.message}`);
    },
  });

  const handlePrintReceipt = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Receipt_${receiptData?.voucherNumber}`,
  });

  const handleSendWhatsApp = () => {
    if (!receiptData?.customerPhone) {
      toast.error("Customer phone number not available");
      return;
    }
    const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
    const disc = whatsappPaymentReceiptDiscountLines(
      receiptData.discountAmount,
      receiptData.discountReason,
      fmt
    );
    const message = `*PAYMENT RECEIPT*\n\nReceipt No: ${receiptData.voucherNumber}\nDate: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), "dd/MM/yyyy") : "-"}\n\nCustomer: ${receiptData.customerName?.toUpperCase()}\nInvoice: ${receiptData.invoiceNumber}\n\nInvoice Amount: ₹${fmt(receiptData.invoiceAmount)}\nPaid Amount: ₹${fmt(receiptData.paidAmount)}${disc}\nBalance: ₹${fmt(receiptData.currentBalance)}\n\nPayment Mode: ${receiptData.paymentMethod.toUpperCase()}\n\nThank you for your payment!`;
    const phoneNumber = receiptData.customerPhone.replace(/\D/g, "");
    const waUrl = `https://wa.me/${phoneNumber.startsWith("91") ? phoneNumber : "91" + phoneNumber}?text=${encodeURIComponent(message)}`;
    const isMac = navigator.platform?.toUpperCase().indexOf("MAC") >= 0;
    const shortcut = isMac ? "Cmd+V" : "Ctrl+V";
    navigator.clipboard
      .writeText(message)
      .then(() => {
        toast.success(`✓ Message copied! Paste with ${shortcut} if it doesn't auto-fill`, {
          duration: 5000,
        });
      })
      .catch(() => {
        toast.warning("Couldn't copy to clipboard automatically");
      });
    setTimeout(() => {
      window.open(waUrl, "_blank");
    }, 300);
  };

  const companyDetails = {
    businessName: settings?.business_name,
    address: settings?.address,
    mobileNumber: settings?.mobile_number,
    emailId: settings?.email_id,
    gstNumber: settings?.gst_number,
    upiId: (settings?.sale_settings as any)?.upiId,
  };

  const receiptSettings = {
    showCompanyLogo: false,
    showQrCode: !!(settings?.sale_settings as any)?.upiId,
    showSignature: true,
    signatureLabel: "Authorized Signature",
  };

  return {
    receiptRef,
    showReceiptDialog,
    setShowReceiptDialog,
    receiptData,
    handleShowReceipt,
    showEditPaymentDialog,
    setShowEditPaymentDialog,
    editingPayment,
    openEditPaymentDialog,
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
  };
}
