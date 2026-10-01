import { forwardRef, useMemo } from "react";
import { useSettings } from "@/hooks/useSettings";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { PaymentReceiptThermal80mm } from "@/components/PaymentReceiptThermal80mm";
import type { PaymentReceiptData, PaymentReceiptSettingsSlice } from "@/components/PaymentReceiptThermal80mm";
import {
  resolvePaymentReceiptCompanyDetails,
  resolvePaymentReceiptPrintLayout,
  type OrgSettingsForPaymentReceipt,
  type PaymentReceiptCompanyDetails,
} from "@/utils/paymentReceiptPrintConfig";
import { cn } from "@/lib/utils";

export type { PaymentReceiptData, PaymentReceiptSettingsSlice };

type PaymentReceiptPrintProps = {
  receiptData: PaymentReceiptData;
  companyDetails?: PaymentReceiptCompanyDetails;
  receiptSettings?: PaymentReceiptSettingsSlice;
  /** When set (e.g. settings preview), overrides org settings for format resolution. */
  settingsOverride?: OrgSettingsForPaymentReceipt | null;
  /** Screen preview in dialog — adds padding; print ref uses bare thermal width. */
  preview?: boolean;
  className?: string;
};

export const PaymentReceiptPrint = forwardRef<HTMLDivElement, PaymentReceiptPrintProps>(
  ({ receiptData, companyDetails, receiptSettings, settingsOverride, preview, className }, ref) => {
    const { data: orgSettings } = useSettings();
    const settings = (settingsOverride ?? orgSettings) as OrgSettingsForPaymentReceipt | null;

    const layout = useMemo(() => resolvePaymentReceiptPrintLayout(settings), [settings]);
    const resolvedCompany = useMemo(
      () => companyDetails ?? resolvePaymentReceiptCompanyDetails(settings),
      [companyDetails, settings],
    );

    const mergedReceiptSettings: PaymentReceiptSettingsSlice = {
      showCompanyLogo: true,
      showSignature: true,
      signatureLabel: "Authorized Signature",
      showQrCode: !!resolvedCompany.upiId,
      ...receiptSettings,
    };

    const inner = layout.isThermal ? (
      <PaymentReceiptThermal80mm
        receiptData={receiptData}
        companyDetails={resolvedCompany}
        receiptSettings={mergedReceiptSettings}
        posInvoiceTemplate={layout.posInvoiceTemplate}
        thermalPaper={layout.thermalPaper}
        orgSettings={settings}
      />
    ) : (
      <PaymentReceipt
        receiptData={receiptData}
        companyDetails={resolvedCompany}
        receiptSettings={mergedReceiptSettings}
      />
    );

    return (
      <div
        ref={ref}
        className={cn(
          "payment-receipt-print-root",
          layout.isThermal ? "invoice-print-source-screen thermal-print-page" : "bg-white",
          layout.isThermal && layout.thermalPaper === "58mm" ? "thermal-paper-58" : null,
          preview && layout.isThermal ? "py-2" : null,
          className,
        )}
      >
        {inner}
      </div>
    );
  },
);

PaymentReceiptPrint.displayName = "PaymentReceiptPrint";
