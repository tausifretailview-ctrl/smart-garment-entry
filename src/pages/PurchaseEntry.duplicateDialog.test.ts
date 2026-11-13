import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * handleSave's content / date duplicate guard (same supplier, date and qty or amount) stops the
 * save on BOTH layouts and says "See warning dialog to open the existing bill or save anyway".
 * The dialog was mounted on the phone layout only (Nov 2026), so a desktop user had no way to
 * open the existing bill or save anyway.
 */
const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "PurchaseEntry.tsx"), "utf8");

describe("PurchaseEntry duplicate-bill dialog", () => {
  const mobileStart = src.indexOf("  if (isMobile) {");
  const desktopStart = src.indexOf("\n  return (\n", mobileStart + 1);

  it("the guard raises the dialog", () => {
    expect(src).toContain("setDuplicateWarning({ bill: match as ExistingDuplicateBill, reason })");
    expect(src).toContain("See warning dialog to open the existing bill or save anyway.");
  });

  it("is mounted on the phone layout and on the desktop layout", () => {
    expect(mobileStart).toBeGreaterThan(-1);
    expect(desktopStart).toBeGreaterThan(mobileStart);
    expect(src.slice(mobileStart, desktopStart)).toContain("{duplicatePurchaseBillDialog}");
    expect(src.slice(desktopStart)).toContain("{duplicatePurchaseBillDialog}");
  });

  it("Save Anyway skips the guard once and saves; Open goes to the existing bill", () => {
    const a = src.indexOf("const duplicatePurchaseBillDialog = (");
    const dialog = src.slice(a, src.indexOf("\n  );", a));
    expect(dialog).toContain("overrideDuplicateRef.current = true;");
    expect(dialog).toContain("await handleSave();");
    expect(dialog).toContain('navigate("/purchase-entry", { state: { editBillId: billId } })');
  });
});

describe("PurchaseEntry dialogs shared by both layouts", () => {
  const mobileStart = src.indexOf("  if (isMobile) {");
  const desktopStart = src.indexOf("\n  return (\n", mobileStart + 1);
  const mobile = src.slice(mobileStart, desktopStart);
  const desktop = src.slice(desktopStart);

  it("each layout mounts the one shared copy, with no hand-written second copy", () => {
    for (const d of ["{photoImportDialog}", "{productEntryDialog}", "{sizeGridDialog}", "{repurchaseDialog}", "{imeiScanDialog}"]) {
      expect(mobile, d).toContain(d);
      expect(desktop, d).toContain(d);
    }
    for (const tag of ["<SizeGridDialog", "<RepurchaseDialog", "<IMEIScanDialog", "<ProductEntryDialogGate", "<PhotoPurchaseImportDialog", "<AddSupplierDialog", "<ExcelImportDialog"]) {
      expect(src.split(tag).length - 1, tag).toBe(1);
    }
  });

  it("keeps each layout's own Excel title and the desktop-only 'Supplier Selected' message", () => {
    expect(mobile).toContain('{excelImportDialog("Import Purchase Bill")}');
    expect(desktop).toContain('{excelImportDialog("Import Purchase Bill from Excel")}');
    expect(mobile).toContain("{addSupplierDialog(false)}");
    expect(desktop).toContain("{addSupplierDialog(true)}");
  });
});
