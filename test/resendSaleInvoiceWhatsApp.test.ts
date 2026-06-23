import { describe, expect, it, vi } from "vitest";
import { resendSaleInvoiceWhatsApp } from "@/utils/resendSaleInvoiceWhatsApp";
import type { WhatsAppSettings } from "@/hooks/useWhatsAppAPI";

const baseSettings = {
  send_invoice_pdf: true,
  pdf_min_amount: 0,
  invoice_template_name: "invoice_tpl",
  use_document_header_template: false,
  invoice_document_template_name: null,
} as WhatsAppSettings;

const baseParams = {
  phone: "9876543210",
  saleId: "sale-1",
  saleNumber: "INV/001",
  customerName: "Test Customer",
  netAmount: 1000,
  saleData: { sale_number: "INV/001", customer_name: "Test Customer" },
  organizationId: "org-1",
  organizationName: "Test Org",
};

describe("resendSaleInvoiceWhatsApp", () => {
  it("sends WappConnect caption + PDF via sendMessageAsync", async () => {
    const sendMessageAsync = vi.fn().mockResolvedValue({ success: true });
    const capturePdfBase64 = vi.fn().mockResolvedValue("pdf-base64");

    await resendSaleInvoiceWhatsApp({
      ...baseParams,
      waSettings: { ...baseSettings, send_provider: "wappconnect" },
      sendMessageAsync,
      capturePdfBase64,
    });

    expect(capturePdfBase64).toHaveBeenCalledTimes(1);
    expect(sendMessageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "9876543210",
        templateType: "sales_invoice",
        pdfBlob: "pdf-base64",
        documentFilename: "Invoice_INV-001.pdf",
        message: expect.any(String),
      }),
    );
  });

  it("uses utility template when send_invoice_pdf is off", async () => {
    const sendMessageAsync = vi.fn().mockResolvedValue({ success: true });

    await resendSaleInvoiceWhatsApp({
      ...baseParams,
      waSettings: { ...baseSettings, send_provider: "existing", send_invoice_pdf: false },
      sendMessageAsync,
    });

    expect(sendMessageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        templateType: "sales_invoice",
        templateName: "invoice_tpl",
        message: "",
      }),
    );
  });

  it("throws when WappConnect PDF capture fails", async () => {
    const sendMessageAsync = vi.fn();
    const capturePdfBase64 = vi.fn().mockResolvedValue(null);

    await expect(
      resendSaleInvoiceWhatsApp({
        ...baseParams,
        waSettings: { ...baseSettings, send_provider: "wappconnect" },
        sendMessageAsync,
        capturePdfBase64,
      }),
    ).rejects.toThrow("Invoice PDF generation failed");

    expect(sendMessageAsync).not.toHaveBeenCalled();
  });
});
