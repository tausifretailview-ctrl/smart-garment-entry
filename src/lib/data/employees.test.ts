// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as { method: string; args: unknown[] }[]);
vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    };
  }
  builder.order = async (...args: unknown[]) => {
    calls.push({ method: "order", args });
    return { data: [{ id: "e1", employee_name: "AMIT", designation: null, commission_percent: 1, status: "active" }], error: null };
  };
  return { supabase: { from: (t: string) => (calls.push({ method: "from", args: [t] }), builder) } };
});

import { activeStaffQueryKey, fetchActiveStaff, staffMasterQueryKey } from "@/lib/data/employees";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** Plan Phase 4, D6: one salesman list; deleted staff never offered. */
describe("staff data module", () => {
  it("lists active staff that are not in the recycle bin, A→Z", async () => {
    calls.length = 0;
    expect(await fetchActiveStaff("org-1")).toHaveLength(1);
    expect(calls).toContainEqual({ method: "from", args: ["employees"] });
    expect(calls).toContainEqual({ method: "eq", args: ["organization_id", "org-1"] });
    expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(calls).toContainEqual({ method: "order", args: ["employee_name"] });
  });

  it("the salesman list and Employee Master no longer share a cache entry", () => {
    expect(activeStaffQueryKey("o")).not.toEqual(staffMasterQueryKey("o"));
    // Both start with "employees" so an Employee Master save refreshes both.
    expect(activeStaffQueryKey("o")[0]).toBe("employees");
    expect(staffMasterQueryKey("o")[0]).toBe("employees");
  });

  it("every salesman dropdown reads the shared list", () => {
    for (const page of [
      "src/pages/POSSales.tsx",
      "src/pages/mobile/MobilePosBilling.tsx",
      "src/pages/SalesInvoice.tsx",
      "src/pages/QuotationEntry.tsx",
      "src/pages/SaleOrderEntry.tsx",
      "src/pages/DeliveryChallanEntry.tsx",
      "src/pages/POSDashboard.tsx",
    ]) {
      const src = read(page);
      expect(src, page).toContain("useActiveStaff(");
      expect(src, page).not.toMatch(/\.from\(\s*["']employees["']\s*\)/);
    }
  });

  it("Employee Master hides staff moved to the recycle bin", () => {
    const src = read("src/pages/EmployeeMaster.tsx");
    expect(src).toContain('.is("deleted_at", null)');
    expect(src).toContain("staffMasterQueryKey(");
  });
});
