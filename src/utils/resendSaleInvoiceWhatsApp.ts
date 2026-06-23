import { isWappConnectSendProvider } from "@/constants/whatsappSendProvider";
import type { SendMessageParams, WhatsAppSettings } from "@/hooks/useWhatsAppAPI";
import { buildSalesInvoiceWhatsAppCaption } from "@/utils/whatsappInvoiceCaption";

export interface ResendSaleInvoiceWhatsAppParams {
  phone: string;
  saleId: string;
  saleNumber: string;
  customerName: string;
  netAmount: number;
  saleData: Record<string, unknown>;
  waSettings: WhatsAppSettings;
  organizationId: string;
  organizationName: string;
  sendMessageAsync: (params: SendMessageParams) => Promise<unknown>;
  capturePdfBase64?: () => Promise<string | null | undefined>;
}

/**
 * Resend a saved sale invoice via WhatsApp using the same provider-aware branches
 * as POS billing (send-whatsapp / sendMessageAsync). Provider selection stays
 * server-side; callers only supply invoice data and optional PDF capture.
 */
export async function resendSaleInvoiceWhatsApp(
  params: ResendSaleInvoiceWhatsAppParams,
): Promise<void> {
  const {
    phone,
    saleId,
    saleNumber,
    customerName,
    netAmount,
    saleData,
    waSettings,
    organizationId,
    organizationName,
    sendMessageAsync,
    capturePdfBase64,
  } = params;

  const documentFilename = `Invoice_${saleNumber.replace(/\//g, "-")}.pdf`;

  if (isWappConnectSendProvider(waSettings.send_provider)) {
    if (waSettings.send_invoice_pdf === false) {
      // Match POS auto-send: WappConnect text-only is not used when PDF mode is off.
      // Fall through to the Meta-style utility template path below.
    } else {
      let pdfBase64: string | undefined;
      const shouldAttachPdf = netAmount >= (waSettings.pdf_min_amount ?? 0);

      if (shouldAttachPdf && capturePdfBase64) {
        pdfBase64 = (await capturePdfBase64()) || undefined;
      }

      if (shouldAttachPdf && !pdfBase64) {
        throw new Error("Invoice PDF generation failed. Please try again.");
      }

      const invoiceCaption = await buildSalesInvoiceWhatsAppCaption(
        organizationId,
        saleData,
        organizationName,
      );

      await sendMessageAsync({
        phone,
        message: invoiceCaption,
        templateType: "sales_invoice",
        referenceId: saleId,
        referenceType: "sale",
        saleData,
        pdfBlob: pdfBase64,
        documentFilename,
      });
      return;
    }
  }

  if (!waSettings.send_invoice_pdf) {
    await sendMessageAsync({
      phone,
      message: "",
      templateType: "sales_invoice",
      templateName: waSettings.invoice_template_name || undefined,
      referenceId: saleId,
      referenceType: "sale",
      saleData,
    });
    return;
  }

  if (waSettings.use_document_header_template && waSettings.invoice_document_template_name) {
    const pdfBase64 = capturePdfBase64 ? await capturePdfBase64() : null;
    await sendMessageAsync({
      phone,
      message: "",
      templateType: "sales_invoice",
      templateName: waSettings.invoice_document_template_name,
      referenceId: saleId,
      referenceType: "sale",
      saleData,
      useDocumentHeaderTemplate: true,
      documentHeaderTemplateName: waSettings.invoice_document_template_name,
      pdfBlob: pdfBase64 || undefined,
    });
    return;
  }

  if (waSettings.invoice_template_name) {
    await sendMessageAsync({
      phone,
      message: "",
      templateType: "sales_invoice",
      templateName: waSettings.invoice_template_name,
      referenceId: saleId,
      referenceType: "sale",
      saleData,
    });
  }

  if (capturePdfBase64) {
    const pdfBase64 = await capturePdfBase64();
    if (pdfBase64) {
      await sendMessageAsync({
        phone,
        message: `📄 Invoice ${saleNumber} — ₹${Math.round(netAmount).toLocaleString("en-IN")}`,
        templateType: "invoice_pdf",
        referenceId: saleId,
        referenceType: "sale",
        documentFilename,
        documentCaption: `Invoice ${saleNumber} — ${customerName}`,
        pdfBlob: pdfBase64,
      });
    }
  }
}
