import { supabase } from "@/integrations/supabase/client";
import { isWappConnectSendProvider } from "@/constants/whatsappSendProvider";
import type { SendMessageParams, WhatsAppSettings } from "@/hooks/useWhatsAppAPI";
import { uploadWappConnectInvoicePdfFromBase64 } from "@/utils/wappConnectPdfUrl";

/** Invoke send-whatsapp with the same client-side PDF upload path as useWhatsAppAPI. */
export async function invokeSendWhatsAppMessage(
  organizationId: string,
  sendProvider: WhatsAppSettings["send_provider"],
  params: SendMessageParams,
): Promise<unknown> {
  const useWappConnect = isWappConnectSendProvider(sendProvider);
  let documentUrl = params.documentUrl;
  let pdfBlob = params.pdfBlob;

  if (useWappConnect && pdfBlob) {
    documentUrl = await uploadWappConnectInvoicePdfFromBase64(
      pdfBlob,
      organizationId,
      params.documentFilename || "Invoice.pdf",
    );
    pdfBlob = undefined;
  }

  const { data, error } = await supabase.functions.invoke("send-whatsapp", {
    body: {
      organizationId,
      phone: params.phone,
      message: params.message,
      templateType: params.templateType,
      templateName: params.templateName,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      saleData: params.saleData,
      documentUrl,
      documentFilename: params.documentFilename,
      documentCaption: params.documentCaption,
      imageUrl: params.imageUrl,
      imageCaption: params.imageCaption,
      useDocumentHeaderTemplate: params.useDocumentHeaderTemplate,
      documentHeaderTemplateName: params.documentHeaderTemplateName,
      pdfBlob,
      useWappConnect,
    },
  });

  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || "Failed to send message");
  return data;
}
