import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Live data holds customers sharing one phone number inside a shop (review item D13: at least
 * 50 numbers). The phone lookups asked the database for "exactly one row", which fails with
 * "multiple rows returned" for those numbers, so billing or saving such a customer errored.
 */
type Row = { id: string; customer_name: string; phone: string; created_at: string };
let rows: Row[] = [];
const calls: Array<{ method: string; args: unknown[] }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    let result = [...rows];
    const api: Record<string, (...args: unknown[]) => unknown> = {};
    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === "eq" && args[0] === "phone") result = result.filter((r) => r.phone === args[1]);
      if (method === "neq" && args[0] === "id") result = result.filter((r) => r.id !== args[1]);
      if (method === "ilike") {
        const tail = String(args[1]).replace(/%/g, "");
        result = result.filter((r) => r.phone.endsWith(tail));
      }
      if (method === "order" && args[0] === "created_at") result.sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (method === "limit") result = result.slice(0, Number(args[0]));
      return api;
    };
    for (const m of ["select", "eq", "neq", "is", "ilike", "order", "limit"]) api[m] = chain(m);
    // What the old code called: PostgREST refuses when more than one row matches.
    api.maybeSingle = () =>
      Promise.resolve(
        result.length > 1
          ? { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }
          : { data: result[0] ?? null, error: null },
      );
    (api as { then?: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: result, error: null }).then(resolve);
    return api;
  };
  return { supabase: { from: () => builder() } };
});

import { findCustomerByNormalizedPhone, findExistingCustomerByNameOrPhone, pickOldestCustomer } from "./customerUtils";

const older: Row = { id: "c-old", customer_name: "SANDYA", phone: "9326664905", created_at: "2025-01-10T10:00:00Z" };
const newer: Row = { id: "c-new", customer_name: "SANDHYA G", phone: "9326664905", created_at: "2026-03-02T10:00:00Z" };
const other: Row = { id: "c-x", customer_name: "RAVI", phone: "9000000001", created_at: "2025-06-01T10:00:00Z" };

beforeEach(() => {
  rows = [newer, other, older];
  calls.length = 0;
});

describe("phone lookups when two customers share a number", () => {
  it("billing by phone uses the oldest record instead of failing", async () => {
    await expect(findCustomerByNormalizedPhone("93266 64905", "org-1")).resolves.toMatchObject({ id: "c-old" });
    expect(calls.some((c) => c.method === "maybeSingle")).toBe(false);
  });

  it("a single match and no match still work", async () => {
    await expect(findCustomerByNormalizedPhone("9000000001", "org-1")).resolves.toMatchObject({ id: "c-x" });
    await expect(findCustomerByNormalizedPhone("9111111111", "org-1")).resolves.toBeNull();
  });

  it("saving a customer with that number is refused as a duplicate, not with a database error", async () => {
    await expect(
      findExistingCustomerByNameOrPhone("org-1", { customer_name: "New Name", phone: "9326664905" }),
    ).resolves.toMatchObject({ kind: "duplicate", row: { id: "c-old" } });
  });

  it("editing one of the pair still sees the other as the duplicate", async () => {
    await expect(
      findExistingCustomerByNameOrPhone("org-1", { customer_name: "SANDYA", phone: "9326664905" }, { excludeId: "c-old" }),
    ).resolves.toMatchObject({ kind: "duplicate", row: { id: "c-new" } });
  });
});

describe("pickOldestCustomer", () => {
  it("takes the earliest created_at whatever the order, id breaking ties", () => {
    expect(pickOldestCustomer([newer, older])).toBe(older);
    expect(pickOldestCustomer([older, newer])).toBe(older);
    const twin = { ...older, id: "c-a" };
    expect(pickOldestCustomer([older, twin])).toBe(twin);
  });

  it("is null for nothing", () => {
    expect(pickOldestCustomer([])).toBeNull();
    expect(pickOldestCustomer(null)).toBeNull();
  });
});
