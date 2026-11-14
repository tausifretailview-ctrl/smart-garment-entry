// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const be = vi.hoisted(() => ({ memberReads: 0, edgeCalls: 0, edgeFails: false, edgeForbidden: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => {
          be.memberReads += 1;
          return { data: [{ user_id: "u1", role: "admin" }, { user_id: "u2", role: "user" }], error: null };
        },
      }),
    }),
    functions: {
      invoke: async () => {
        be.edgeCalls += 1;
        if (be.edgeFails) return { data: null, error: { message: "edge down" } };
        // Shape of supabase-js FunctionsHttpError for a 403 answer.
        if (be.edgeForbidden) return { data: null, error: { message: "non-2xx", context: { status: 403 } } };
        return {
          data: {
            users: [
              { id: "u1", email: "owner@shop.in" },
              { id: "u2", email: "cashier@shop.in" },
              { id: "x9", email: "other-shop@x.in" },
            ],
          },
          error: null,
        };
      },
    },
  },
}));

import {
  getShopMembers,
  getShopUsers,
  refreshShopUsersCache,
  shopMembersQueryKey,
  shopUsersQueryKey,
} from "@/lib/data/shopUsers";
import { isVolatileOrSensitiveKey } from "@/lib/queryPersister";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Plan Phase 4, D6: one member list and one user list per shop. */
describe("shop users data module", () => {
  beforeEach(() => {
    be.memberReads = 0;
    be.edgeCalls = 0;
    be.edgeFails = false;
    be.edgeForbidden = false;
  });

  it("a cashier (403 from get-users) gets an empty list that is remembered", async () => {
    const qc = new QueryClient();
    be.edgeForbidden = true;
    expect(await getShopUsers(qc, "org-1", "token")).toEqual([]);
    expect(await getShopUsers(qc, "org-1", "token")).toEqual([]);
    expect(be.edgeCalls).toBe(1); // not called again on every dashboard open
  });

  it("logins and emails are never written to the on-disk cache", () => {
    expect(isVolatileOrSensitiveKey(shopUsersQueryKey("org-1"))).toBe(true);
    expect(isVolatileOrSensitiveKey(shopMembersQueryKey("org-1"))).toBe(true);
  });

  it("joins members with emails, drops other shops' users, and is read once", async () => {
    const qc = new QueryClient();
    const users = await getShopUsers(qc, "org-1", "token");
    expect(users).toEqual([
      { id: "u1", email: "owner@shop.in", role: "admin" },
      { id: "u2", email: "cashier@shop.in", role: "user" },
    ]);
    await getShopUsers(qc, "org-1", "token");
    await getShopMembers(qc, "org-1");
    expect(be.edgeCalls).toBe(1);
    expect(be.memberReads).toBe(1);
  });

  it("an edge-function failure is not cached", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    be.edgeFails = true;
    await expect(getShopUsers(qc, "org-1", "token")).rejects.toMatchObject({ message: "edge down" });
    be.edgeFails = false;
    expect(await getShopUsers(qc, "org-1", "token")).toHaveLength(2);
  });

  it("a member change refreshes both lists", async () => {
    const qc = new QueryClient();
    await getShopUsers(qc, "org-1", "token");
    await refreshShopUsersCache(qc, "org-1");
    await getShopUsers(qc, "org-1", "token");
    expect(be.edgeCalls).toBe(2);
    expect(be.memberReads).toBe(2);
  });

  it("screens use the shared lists instead of calling get-users themselves", () => {
    for (const page of [
      "src/pages/SalesInvoiceDashboard.tsx",
      "src/pages/POSDashboard.tsx",
      "src/pages/ItemWiseSalesReport.tsx",
      "src/pages/EmployeeMaster.tsx",
      "src/pages/AuditLog.tsx",
    ]) {
      const src = readFileSync(join(root, page), "utf8");
      expect(src, page).not.toContain('"get-users"');
      expect(src, page).toMatch(/useShopUsers\(|getShopUsers\(/);
    }
  });
});
