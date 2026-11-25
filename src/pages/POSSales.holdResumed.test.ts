import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Hold → resume → add items → Hold again used to lose the added items (Nov 2026): Hold on a
 * resumed bill only opened the held-bills panel (still the old cart), and resuming another bill
 * skipped saving a resumed one. Now the resumed held bill is updated in place.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pos = readFileSync(resolve(here, "POSSales.tsx"), "utf8");
const save = readFileSync(resolve(here, "../hooks/useSaveSale.tsx"), "utf8");

describe("POS: holding a resumed held bill again", () => {
  it("Hold (button and F7) saves a resumed bill instead of only opening the panel", () => {
    expect(pos).not.toContain("if (items.length === 0 || isHeldSale) {");
    expect(pos).toContain("holdSale(saleData, isHeldSale && currentSaleId ? currentSaleId : null)");
  });

  it("resuming another bill first saves the open one, a resumed held bill in place", () => {
    const start = pos.indexOf("const handleResumeHeldBill = async");
    const fn = pos.slice(start, pos.indexOf("await loadSaleForEdit(bill.id);", start));
    expect(fn).not.toContain("items.length > 0 && !isHeldSale");
    expect(fn).toContain("holdSale(holdData, isHeldSale && currentSaleId ? currentSaleId : null)");
    expect(fn).toContain("if (!held) return;");
  });

  it("parking the open cart (resume another bill, F7, Hold button) asks the cashier first", () => {
    const start = pos.indexOf("const handleResumeHeldBill = async");
    const fn = pos.slice(start, pos.indexOf("await loadSaleForEdit(bill.id);", start));
    expect(fn.indexOf("window.confirm(")).toBeGreaterThan(-1);
    expect(fn.indexOf("window.confirm(")).toBeLessThan(fn.indexOf("holdSale(holdData"));
    // F7 and the Hold buttons go through the confirmation, not straight to handleHoldBill.
    expect(pos).not.toContain('reportIfFails(handleHoldBill(), "hold the bill");\n      }');
    expect(pos).not.toContain("onHoldBill={handleHoldBill}");
    expect(pos.match(/\{holdConfirmDialog\}/g)?.length).toBe(3);
  });

  it("holdSale updates the existing held bill (same number) and falls back to a new one", () => {
    const start = save.indexOf("const holdSale = async (saleData: SaleData, existingHeldSaleId?: string | null)");
    expect(start).toBeGreaterThan(-1);
    const fn = save.slice(start, save.indexOf("generate_hold_number_atomic", start));
    expect(fn).toContain("if (existingHeldSaleId)");
    expect(fn).toContain(".update(patch as any)");
    expect(fn).toContain(".eq('id', existingHeldSaleId)");
    expect(fn).toContain(".eq('organization_id', currentOrganization.id)");
    // sale_number is not in the patch: the bill keeps its Hold number
    expect(fn).toContain("sale_number: _keepNumber");
  });
});
