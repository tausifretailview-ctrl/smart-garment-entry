import type { Json } from "@/integrations/supabase/types";
import { resolveCompanyUpiId, type CompanyUpiSettings } from "@/utils/companyUpi";
import {
  posThermalPageCss,
  resolvePosBillFormat,
  resolvePosInvoiceTemplate,
  resolvePosThermalPaper,
  type PosBillFormat,
  type PosThermalPaper,
} from "@/utils/invoicePrintFormat";
import {
  getThermalReceiptPageStyleFragment,
  INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS,
} from "@/utils/thermalReceiptPrintDocument";

export type PaymentReceiptCompanyDetails = {
  businessName?: string;
  address?: string;
  mobileNumber?: string;
  emailId?: string;
  gstNumber?: string;
  logoUrl?: string;
  upiId?: string;
};

type BillBarcodeSettingsShape = CompanyUpiSettings & {
  logo_url?: string | null;
  direct_print_pos_paper?: string | null;
  instagram_link?: string | null;
};

export type OrgSettingsForPaymentReceipt = {
  business_name?: string;
  address?: string;
  mobile_number?: string;
  owner_phone?: string;
  email_id?: string;
  gst_number?: string;
  // DB rows type this column as Json; callers pass the raw org settings row.
  bill_barcode_settings?: Json;
  sale_settings?: {
    pos_bill_format?: string | null;
    pos_invoice_template?: string | null;
    invoice_paper_format?: string | null;
    thermal_receipt_style?: string | null;
  };
};

export function resolvePaymentReceiptCompanyDetails(
  settings?: OrgSettingsForPaymentReceipt | null,
): PaymentReceiptCompanyDetails {
  const bill = settings?.bill_barcode_settings as BillBarcodeSettingsShape | undefined;
  const logo = (bill?.logo_url || "").trim();
  return {
    businessName: settings?.business_name,
    address: settings?.address,
    mobileNumber: settings?.mobile_number || settings?.owner_phone,
    emailId: settings?.email_id,
    gstNumber: settings?.gst_number,
    logoUrl: logo || undefined,
    upiId: resolveCompanyUpiId(bill) || undefined,
  };
}

export type PaymentReceiptPrintLayout = {
  billFormat: PosBillFormat;
  posInvoiceTemplate: string;
  isThermal: boolean;
  thermalPaper: PosThermalPaper;
  thermalStyle: string;
};

/** Matches Settings → POS bill format / POS invoice template. */
export function resolvePaymentReceiptPrintLayout(
  settings?: OrgSettingsForPaymentReceipt | null,
): PaymentReceiptPrintLayout {
  const sale = settings?.sale_settings;
  const posInvoiceTemplate = resolvePosInvoiceTemplate(sale);
  const billFormat = resolvePosBillFormat(
    posInvoiceTemplate,
    sale?.pos_bill_format || "thermal",
    sale?.invoice_paper_format ?? undefined,
  );
  const thermalPaper = resolvePosThermalPaper(
    (settings?.bill_barcode_settings as BillBarcodeSettingsShape | undefined)
      ?.direct_print_pos_paper,
  );
  return {
    billFormat,
    posInvoiceTemplate,
    isThermal: billFormat === "thermal",
    thermalPaper,
    thermalStyle: String(sale?.thermal_receipt_style || "classic").trim() || "classic",
  };
}

/** Page CSS for react-to-print on customer payment receipts. */
export function getPaymentReceiptPrintPageStyle(
  settings?: OrgSettingsForPaymentReceipt | null,
): string {
  const layout = resolvePaymentReceiptPrintLayout(settings);
  if (!layout.isThermal) {
    return `
      @page { size: A4 portrait; margin: 10mm; }
      ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
    `;
  }
  const thermalPage = posThermalPageCss(layout.thermalPaper);
  return `
    @page {
      size: ${thermalPage.pageSize};
      margin: 0;
    }
    ${getThermalReceiptPageStyleFragment(layout.thermalPaper)}
    ${INVOICE_PRINT_VISIBILITY_OVERRIDE_CSS}
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${thermalPage.sourceWidth} !important;
        max-width: ${thermalPage.sourceWidth} !important;
        height: auto !important;
        overflow: visible !important;
      }
      .payment-receipt-print-root,
      .payment-receipt-print-root * {
        visibility: visible !important;
        opacity: 1 !important;
      }
      .payment-receipt-print-root {
        width: ${thermalPage.sourceWidth} !important;
        max-width: ${thermalPage.sourceWidth} !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    }
  `;
}
