// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ selected: "" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = (cols: string) => {
        db.selected = cols;
        return b;
      };
      b.eq = () => b;
      b.maybeSingle = async () => ({ data: { is_active: true, auto_send_invoice: true, send_provider: "existing" }, error: null });
      return b;
    },
  },
}));

import { fetchInvoiceWhatsAppSettings, INVOICE_WHATSAPP_COLUMNS } from "@/lib/data/invoiceWhatsAppSettings";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Plan Phase 4, D6: an invoice save reads only the WhatsApp columns it uses — never the tokens. */
describe("invoice WhatsApp settings", () => {
  it("reads named columns, not the access or webhook tokens", async () => {
    expect(await fetchInvoiceWhatsAppSettings("org-1")).toMatchObject({ is_active: true });
    expect(db.selected).toBe(INVOICE_WHATSAPP_COLUMNS);
    expect(INVOICE_WHATSAPP_COLUMNS).not.toMatch(/\*|access_token|webhook_verify_token/);
    // Every field the send path reads is in the list.
    for (const col of ["is_active", "auto_send_invoice", "send_provider", "send_invoice_pdf", "pdf_min_amount",
      "invoice_template_name", "use_document_header_template", "invoice_document_template_name", "wappconnect_pdf_invoice_template"]) {
      expect(INVOICE_WHATSAPP_COLUMNS.split(", ")).toContain(col);
    }
  });

  it("Sales Invoice and POS save both use the named columns", () => {
    const invoice = readFileSync(join(root, "src/pages/SalesInvoice.tsx"), "utf8");
    expect(invoice).toContain("fetchInvoiceWhatsAppSettings(currentOrganization.id)");
    expect(invoice).not.toMatch(/from\("whatsapp_api_settings"\)\s*\.select\("\*"\)/);
    expect(readFileSync(join(root, "src/hooks/useSaveSale.tsx"), "utf8")).toContain(".select(INVOICE_WHATSAPP_COLUMNS)");
  });
});
