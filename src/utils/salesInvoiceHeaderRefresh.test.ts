import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { invalidateSalesQueriesNow } from "@/utils/deferredSalesInvalidation";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Sales Invoice header after a save (Plan Phase 4): "last invoice" strip and the navigation list. */
describe("Sales Invoice header refresh", () => {
  it("a sale save refreshes the last-invoice strip and the navigation list for that shop", () => {
    const qc = new QueryClient();
    qc.setQueryData(["last-invoice", "org-1"], { sale_number: "INV/26-27/100" });
    qc.setQueryData(["all-sale-invoice-ids", "org-1"], [{ id: "s100", sale_number: "INV/26-27/100" }]);
    qc.setQueryData(["last-invoice", "org-2"], { sale_number: "X/1" });
    invalidateSalesQueriesNow(qc, "org-1");
    expect(qc.getQueryState(["last-invoice", "org-1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["all-sale-invoice-ids", "org-1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["last-invoice", "org-2"])?.isInvalidated).toBe(false);
  });

  it("the navigation list (up to 500 invoices) is read on first use, not on every open", () => {
    const page = readFileSync(join(root, "src/pages/SalesInvoice.tsx"), "utf8");
    expect(page).toContain("enabled: !!currentOrganization?.id && navListRequested");
    const last = page.slice(page.indexOf("const handleLastInvoice"), page.indexOf("const handlePreviousInvoice"));
    expect(last).toContain("await ensureInvoiceIds()");
  });
});
