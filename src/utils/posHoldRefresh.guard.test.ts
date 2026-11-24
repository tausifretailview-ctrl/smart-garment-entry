import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * POS Hold: a held bill completed as an invoice left the red count on the Hold button for up to
 * 5 minutes (the held-bills list was cached and refreshed only on hold/resume), and the
 * hold / resume / delete actions refreshed only the list on screen, not the badge's.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("POS held-bills list refresh", () => {
  it("every completed sale marks the held-bills lists out of date", () => {
    const hook = read("src/hooks/useSaveSale.tsx");
    const fn = hook.slice(hook.indexOf("const applyPostSaleInvalidation"), hook.indexOf("const toPosDashboardSaleSeed"));
    expect(fn).toMatch(/invalidateQueries\(\{\s*queryKey: organizationId \? \["held-bills", organizationId\] : \["held-bills"\]/);
  });

  it("an edited or completed held bill is not seeded as a new bill", () => {
    const hook = read("src/hooks/useSaveSale.tsx");
    expect(hook.match(/isNewBill: false,/g)?.length).toBe(2);
  });

  it("hold / resume / delete refresh both cached lists, not only the one on screen", () => {
    const pos = read("src/pages/POSSales.tsx");
    expect(pos).toMatch(/queryKey: \['held-bills', currentOrganization\?\.id\],/);
    expect(pos).not.toContain("await refetchHeldBills();");
    expect(pos.match(/await refreshHeldBills\(\);/g)?.length).toBe(3);
  });

  it("resume and the POS Dashboard read the held cart from either place", () => {
    expect(read("src/pages/POSSales.tsx")).toContain("heldCartFromSale(sale as");
    expect(read("src/pages/POSDashboard.tsx")).toContain(".select(\"held_cart_data, notes\")");
  });
});
