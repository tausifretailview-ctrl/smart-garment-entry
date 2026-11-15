import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "SalesInvoice.tsx"), "utf8");

/** Sales Invoice save path: no silent writes (Plan Phase 4, R6). */
describe("Sales Invoice save checks", () => {
  it("after an edit, paid status comes from the shared database settlement, not client math", () => {
    expect(page).toContain("await applyRecomputedSalePaymentState(editingInvoiceId, currentOrganization!.id, supabase)");
    expect(page).not.toMatch(/\.update\(\{\s*payment_status:\s*correctStatus\s*\}\)/);
    expect(page).not.toContain("const correctStatus =");
  });

  it("a failed finance-details insert is reported, not dropped", () => {
    const at = page.indexOf(".from('sale_financer_details')");
    expect(at).toBeGreaterThan(-1);
    const block = page.slice(page.lastIndexOf("if (financerDetails?.financer_name)", at), at + 1200);
    expect(block).toContain("const { error: financerErr } = await supabase");
    expect(block).toContain("if (financerErr)");
    expect(block).toContain("Finance details not saved");
  });
});
