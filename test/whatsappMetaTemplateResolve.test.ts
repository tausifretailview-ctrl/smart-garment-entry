import { describe, expect, it } from "vitest";
import {
  missingWhatsAppTemplateError,
  pickSyncedWhatsAppMetaTemplate,
} from "../supabase/functions/_shared/whatsappMetaTemplateResolve.ts";
import { extractWhatsAppDeliveryError } from "../supabase/functions/_shared/whatsappStatusWebhook.ts";
import { getWhatsAppErrorHint } from "../src/utils/whatsappErrorHints.ts";

describe("pickSyncedWhatsAppMetaTemplate", () => {
  it("does not guess en_US when the template was never synced", () => {
    expect(pickSyncedWhatsAppMetaTemplate([])).toBeNull();
    expect(pickSyncedWhatsAppMetaTemplate(null)).toBeNull();
  });

  it("prefers APPROVED en then first remaining language", () => {
    const picked = pickSyncedWhatsAppMetaTemplate([
      { template_name: "invoice_1", template_language: "hi", template_status: "APPROVED" },
      { template_name: "invoice_1", template_language: "en", template_status: "APPROVED" },
    ]);
    expect(picked?.template_language).toBe("en");
  });
});

describe("missing WhatsApp template errors", () => {
  it("names invoice_1 in the fail-closed message", () => {
    expect(missingWhatsAppTemplateError("invoice_1")).toMatch(/invoice_1/);
    expect(missingWhatsAppTemplateError("invoice_1")).toMatch(/Sync Templates/);
  });

  it("extracts Meta Graph webhook template errors from delivery_callback", () => {
    expect(
      extractWhatsAppDeliveryError({
        delivery_callback: {
          object: "whatsapp_business_account",
          entry: [
            {
              changes: [
                {
                  value: {
                    statuses: [
                      {
                        status: "failed",
                        errors: [
                          {
                            code: 132001,
                            title: "Template name does not exist in the translation",
                            error_data: { details: "invoice_1 / en_US" },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      }),
    ).toMatch(/132001/);
  });

  it("surfaces a settings hint for invoice_1 not found", () => {
    const hint = getWhatsAppErrorHint(
      'WhatsApp template "invoice_1" was not found on this Business Account.',
      { error: { code: "TEMPLATE_NOT_SYNCED", templateName: "invoice_1" } },
      "existing",
    );
    expect(hint?.title).toMatch(/template not found/i);
    expect(hint?.action).toMatch(/Sync Templates/);
  });
});
