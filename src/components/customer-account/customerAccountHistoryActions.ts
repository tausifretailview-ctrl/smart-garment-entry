export type CustomerAccountHistoryActions = {
  onViewInvoice: (saleId: string) => void;
  onEditPayment: (voucher: Record<string, unknown>) => void;
  onApplyReturnCn: (ret: Record<string, unknown>) => void;
  onViewCreditNote: (cn: { id: string; saleReturnId?: string | null }) => void;
  onApplyAdvance: () => void;
  onRefundAdvance: () => void;
  onRefundOverpayment: () => void;
};
