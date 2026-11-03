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
    expect(settingsPage).toContain("Direct Printing (QZ Tray)");
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
