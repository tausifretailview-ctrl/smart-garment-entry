import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");
const settingsPage = read("../../pages/Settings.tsx");
const sidebar = read("../AppSidebar.tsx");

describe("Settings cleanup (Nov 2026)", () => {
  it("keeps the admin tools out of Settings", () => {
    expect(settingsPage).not.toContain("DuplicatePurchaseBillsReconciler");
    expect(settingsPage).not.toContain("Stock Adjustment Tool");
    expect(settingsPage).not.toContain("/customer-reconciliation");
    expect(settingsPage).not.toContain("Report column customization coming soon");
  });

  it("lists each tool on its own in the Inventory menu", () => {
    expect(sidebar).toContain('to="/stock-adjustment"');
    expect(sidebar).toContain('to="/duplicate-purchase-bills"');
    expect(sidebar).toContain('to="/customer-reconciliation"');
  });
});

describe("Settings cleanup step 2 (Nov 2026)", () => {
  it("has no QZ setup guide and one Direct Print block", () => {
    expect(settingsPage).not.toContain("Direct Bill Printing — Setup Guide");
    expect(settingsPage).not.toContain("Default Printer (Direct Print)");
    expect(settingsPage).not.toContain("{/* Direct Printing (QZ Tray) Settings */}");
  });

  it("hides switches no screen reads", () => {
    for (const id of ["payment_terms", "sku_format", "sales_tax_rate", "auto_apply_advance"]) {
      expect(settingsPage).not.toContain(`id="${id}"`);
    }
  });

  it("keeps POS options in the POS tab and social links in WhatsApp", () => {
    const posTab = settingsPage.slice(settingsPage.indexOf('<TabsContent value="pos"'));
    const posEnd = posTab.indexOf("</TabsContent>");
    const pos = posTab.slice(0, posEnd);
    expect(pos).toContain('id="show_purchase_code_on_pos"');
    expect(pos).toContain('id="pos_margin_indicator_for_owner"');
    expect(pos).toContain("2nd billing details");
    const waTab = settingsPage.slice(settingsPage.indexOf('<TabsContent value="whatsapp"'));
    expect(waTab.slice(0, waTab.indexOf("</TabsContent>"))).toContain('id="instagram_link"');
  });
});

describe("Settings cleanup step 3 (Nov 2026)", () => {
  const tab = (id: string) => {
    const from = settingsPage.slice(settingsPage.indexOf(`<TabsContent value="${id}"`));
    return from.slice(0, from.indexOf("</TabsContent>"));
  };

  it("drops the cross-shop label designs list", () => {
    expect(settingsPage).not.toContain("Label Designs from All Your Shops");
  });

  it("shows the stamp in Branding and customer page in Alerts", () => {
    expect(tab("branding")).toContain("Authorised Stamp / Signature");
    expect(tab("bill")).not.toContain("Authorised Stamp / Signature");
    expect(tab("reports")).toContain("<CustomerPagePanel />");
    expect(tab("whatsapp")).not.toContain("<CustomerPagePanel />");
  });

  it("only shows AI Chatbot to a shop that already has it on", () => {
    const wa = read("../WhatsAppAPISettings.tsx");
    expect(wa).toContain("{settings?.chatbot_enabled === true && (");
  });
});

describe("Settings premium layout (Nov 2026)", () => {
  const tab = (id: string) => {
    const from = settingsPage.slice(settingsPage.indexOf(`<TabsContent value="${id}"`));
    return from.slice(0, from.indexOf("</TabsContent>"));
  };

  it("lays Company, Branding and Product out in field grids", () => {
    for (const id of ["company", "branding", "product"]) {
      expect(tab(id)).toContain("<SettingsGrid");
    }
    expect(tab("company")).toContain('label="Business Name" htmlFor="business_name" required important');
    expect(tab("product")).toContain('id={`enable_${field.key}`}');
  });

  it("lays Purchase out in sections with switch cards", () => {
    const purchase = tab("purchase");
    expect(purchase).toContain("<SettingsGrid");
    expect(purchase).toContain('title="Purchase code on barcode labels"');
    expect(purchase).toContain('id="per_piece_barcode"');
    expect(purchase).toContain('id="dc_visibility_hide"');
    expect(purchase).not.toContain("<Checkbox");
  });

  it("lays Bill & Barcode out in sections", () => {
    const bill = tab("bill");
    expect(bill).toContain('title="UPI payment QR"');
    expect(bill).toContain('title="Barcode labels"');
    expect(bill).toContain('id="barcode_default_print_tab"');
    expect(bill).toContain('id="enable_cash_drawer"');
    expect(bill).toContain("<LazyChequeFormatManagement />");
  });

  it("splits Sale into titled sections and keeps the live preview", () => {
    const sale = tab("sale");
    for (const title of ["Sale bill defaults", "Billing options", "Print format", "Invoice design", "E-Invoice (PeriOne API)"]) {
      expect(sale).toContain(`title="${title}"`);
    }
    expect(sale).not.toContain('title="Sale details"');
    expect(sale).toContain("<SettingsInvoicePreview");
    expect(sale).toContain('id="allow_negative_stock_sale"');
  });

  it("lays POS out in sections with switch cards", () => {
    const posForm = read("./PosSettingsForm.tsx");
    expect(posForm).toContain('title="Cashier & billing"');
    expect(posForm).toContain("<SettingsToggle");
    expect(posForm).not.toContain("SettingsRow");
    expect(tab("pos")).toContain('title="POS screen extras"');
  });
});
