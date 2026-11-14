// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ eqs: [] as unknown[][], result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (...args: unknown[]) => {
        db.eqs.push(args);
        return b;
      };
      b.maybeSingle = async () => db.result;
      return b;
    },
  },
}));

import { fetchCustomerInvoiceDetails } from "@/lib/data/customerInvoiceDetails";

/** Plan Phase 4, D6: one shop-scoped read of a customer's invoice details. */
describe("fetchCustomerInvoiceDetails", () => {
  beforeEach(() => {
    db.eqs = [];
    db.result = { data: { customer_name: "RAVI", gst_number: "27AAA", transport_details: "VRL" }, error: null };
  });

  it("reads the customer inside the shop", async () => {
    expect(await fetchCustomerInvoiceDetails("org-1", "c1")).toMatchObject({ customer_name: "RAVI", gst_number: "27AAA" });
    expect(db.eqs).toContainEqual(["id", "c1"]);
    expect(db.eqs).toContainEqual(["organization_id", "org-1"]);
  });

  it("a failed or empty read gives null, so the bill's own copy is used", async () => {
    db.result = { data: null, error: { message: "denied" } };
    expect(await fetchCustomerInvoiceDetails("org-1", "c1")).toBeNull();
    db.result = { data: null, error: null };
    expect(await fetchCustomerInvoiceDetails("org-1", "c1")).toBeNull();
  });

  it("Sales Invoice has no customer query of its own", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const page = readFileSync(join(root, "src/pages/SalesInvoice.tsx"), "utf8");
    expect(page).not.toMatch(/\.from\(\s*["']customers["']\s*\)/);
    expect(page.match(/fetchCustomerInvoiceDetails\(/g)).toHaveLength(3);
  });
});
