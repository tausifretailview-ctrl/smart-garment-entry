import { describe, expect, it } from "vitest";
import {
  resolvePaymentReceiptCompanyDetails,
  resolvePaymentReceiptPrintLayout,
} from "@/utils/paymentReceiptPrintConfig";

describe("paymentReceiptPrintConfig", () => {
  it("reads logo from bill_barcode_settings like POS invoices", () => {
    const details = resolvePaymentReceiptCompanyDetails({
      business_name: "Demo Shop",
      bill_barcode_settings: { logo_url: "https://cdn.example/logo.png", upi_id: "shop@upi" },
    });
    expect(details.logoUrl).toBe("https://cdn.example/logo.png");
    expect(details.upiId).toBe("shop@upi");
  });

  it("uses thermal layout when POS bill format is thermal with vastrakala template", () => {
    const layout = resolvePaymentReceiptPrintLayout({
      sale_settings: {
        pos_bill_format: "thermal",
        pos_invoice_template: "vastrakala-80mm",
      },
      bill_barcode_settings: { direct_print_pos_paper: "58mm" },
    });
    expect(layout.isThermal).toBe(true);
    expect(layout.posInvoiceTemplate).toBe("vastrakala-80mm");
    expect(layout.thermalPaper).toBe("58mm");
  });

  it("uses A4 when POS template is A4-only", () => {
    const layout = resolvePaymentReceiptPrintLayout({
      sale_settings: {
        pos_bill_format: "thermal",
        pos_invoice_template: "klear-a4",
      },
    });
    expect(layout.isThermal).toBe(false);
    expect(layout.billFormat).toBe("a4");
  });
});
