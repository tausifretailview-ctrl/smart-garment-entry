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
