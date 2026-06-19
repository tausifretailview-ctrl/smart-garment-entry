import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useAccountsPaymentDialogs } from "@/hooks/useAccountsPaymentDialogs";
import { AccountsPaymentDialogs } from "@/components/accounts/AccountsPaymentDialogs";
import { AdjustCustomerCreditNoteDialog } from "@/components/AdjustCustomerCreditNoteDialog";
import { CreditNoteHistoryDialog } from "@/components/CreditNoteHistoryDialog";
import { CustomerAccountHistoryContent } from "@/components/customer-account/CustomerAccountHistoryContent";
import { CustomerOverpaymentRefundDialog } from "@/components/customer-account/CustomerOverpaymentRefundDialog";
import {
  getReturnCnAvailable,
  invalidateCustomerAccountHistoryQueries,
  useCustomerAccountHistoryData,
} from "@/hooks/useCustomerAccountHistoryData";
import type { CustomerAccountHistoryActions } from "@/components/customer-account/customerAccountHistoryActions";

interface CustomerAccountHistoryShellProps {
  customerId: string | null;
  customerName: string;
  organizationId: string;
  queriesEnabled: boolean;
  scrollAreaClassName?: string;
  wrapperClassName?: string;
}

type ReturnForAdjust = {
  id: string;
  return_number: string | null;
  credit_note_id?: string | null;
  net_amount?: number | null;
  customer_id?: string | null;
  cn_live_remaining?: number | null;
  credit_available_balance?: number | null;
  linked_sale_id?: string | null;
};

export function CustomerAccountHistoryShell({
  customerId,
  customerName,
  organizationId,
  queriesEnabled,
  scrollAreaClassName,
  wrapperClassName,
}: CustomerAccountHistoryShellProps) {
  const queryClient = useQueryClient();
  const { orgNavigate } = useOrgNavigation();
  const { data: settings } = useSettings();
  const paymentDialogs = useAccountsPaymentDialogs(settings);
  const { refundableCreditBalance } = useCustomerAccountHistoryData({
    customerId,
    organizationId,
    queriesEnabled,
  });

  const [selectedReturnForAdjust, setSelectedReturnForAdjust] = useState<ReturnForAdjust | null>(null);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [cnHistoryTarget, setCnHistoryTarget] = useState<{ creditNoteId?: string | null; saleReturnId?: string | null } | null>(null);
  const [showOverpaymentRefund, setShowOverpaymentRefund] = useState(false);

  const refreshHistory = useCallback(async () => {
    await invalidateCustomerAccountHistoryQueries(queryClient, customerId, organizationId);
  }, [queryClient, customerId, organizationId]);

  const actions: CustomerAccountHistoryActions = useMemo(
    () => ({
      onViewInvoice: (saleId: string) => {
        orgNavigate("/sales-invoice", { state: { editInvoiceId: saleId } });
      },
      onEditPayment: (voucher) => {
        paymentDialogs.openEditPaymentDialog(voucher);
      },
      onApplyReturnCn: (ret) => {
        setSelectedReturnForAdjust(ret as ReturnForAdjust);
        setShowAdjustDialog(true);
      },
      onViewCreditNote: (cn) => {
        setCnHistoryTarget({
          creditNoteId: cn.id,
          saleReturnId: cn.saleReturnId ?? null,
        });
      },
      onApplyAdvance: () => {
        orgNavigate("/accounts");
      },
      onRefundAdvance: () => {
        orgNavigate(`/advance-booking-dashboard?search=${encodeURIComponent(customerName || "")}`);
      },
      onRefundOverpayment: () => {
        setShowOverpaymentRefund(true);
      },
    }),
    [orgNavigate, paymentDialogs, customerName],
  );

  return (
    <>
      <CustomerAccountHistoryContent
        customerId={customerId}
        customerName={customerName}
        organizationId={organizationId}
        queriesEnabled={queriesEnabled}
        scrollAreaClassName={scrollAreaClassName}
        wrapperClassName={wrapperClassName}
        actions={actions}
      />

      <AccountsPaymentDialogs dialogs={paymentDialogs} compactEdit />

      {selectedReturnForAdjust && customerId && (
        <AdjustCustomerCreditNoteDialog
          open={showAdjustDialog}
          onOpenChange={(open) => {
            setShowAdjustDialog(open);
            if (!open) setSelectedReturnForAdjust(null);
          }}
          saleReturnId={selectedReturnForAdjust.id}
          creditNoteId={selectedReturnForAdjust.credit_note_id || ""}
          returnNumber={selectedReturnForAdjust.return_number || "N/A"}
          creditAmount={getReturnCnAvailable(selectedReturnForAdjust) || Number(selectedReturnForAdjust.net_amount || 0)}
          customerId={selectedReturnForAdjust.customer_id || customerId}
          customerName={customerName}
          onSuccess={() => {
            void refreshHistory();
          }}
        />
      )}

      <CreditNoteHistoryDialog
        open={!!cnHistoryTarget}
        onOpenChange={(open) => {
          if (!open) setCnHistoryTarget(null);
        }}
        creditNoteId={cnHistoryTarget?.creditNoteId}
        saleReturnId={cnHistoryTarget?.saleReturnId}
        organizationId={organizationId}
      />

      {customerId && organizationId && (
        <CustomerOverpaymentRefundDialog
          open={showOverpaymentRefund}
          onOpenChange={setShowOverpaymentRefund}
          customerId={customerId}
          customerName={customerName}
          organizationId={organizationId}
          maxRefundable={refundableCreditBalance}
          onSuccess={() => {
            void refreshHistory();
          }}
        />
      )}
    </>
  );
}
