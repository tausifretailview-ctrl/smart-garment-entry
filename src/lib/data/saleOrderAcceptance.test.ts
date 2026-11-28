import { describe, expect, it } from "vitest";
import { readSaleOrderAcceptance, setSaleOrderAcceptance, type SaleOrderAcceptanceDb } from "./saleOrderAcceptance";

function fakeDb(errors: Array<{ code?: string; message?: string } | null>) {
  const updates: Array<Record<string, unknown>> = [];
  let n = 0;
  const db: SaleOrderAcceptanceDb = {
    from: () => ({
      update: (values) => {
        updates.push(values);
        return { eq: () => ({ eq: () => Promise.resolve({ error: errors[n++] ?? null }) }) };
      },
    }),
  };
  return { db, updates };
}

describe("sale order acceptance", () => {
  it("shows the saved status, or Accepted for orders accepted the old way", () => {
    expect(readSaleOrderAcceptance({ acceptance_status: "hold", customer_accepted: false })).toBe("hold");
    expect(readSaleOrderAcceptance({ acceptance_status: null, customer_accepted: true })).toBe("accepted");
    expect(readSaleOrderAcceptance({ customer_accepted: false })).toBeNull();
    expect(readSaleOrderAcceptance({ acceptance_status: "weird" })).toBeNull();
  });

  it("saves the status with the old flag in step", async () => {
    const { db, updates } = fakeDb([null]);
    await setSaleOrderAcceptance(db, "o1", "so1", "rejected");
    expect(updates).toEqual([{ acceptance_status: "rejected", customer_accepted: false }]);
  });

  it("before SQL 75: Accept still saves the old flag; Hold / Reject ask for the SQL", async () => {
    const missing = { code: "PGRST204", message: "Could not find the 'acceptance_status' column" };
    const ok = fakeDb([missing, null]);
    await setSaleOrderAcceptance(ok.db, "o1", "so1", "accepted");
    expect(ok.updates[1]).toEqual({ customer_accepted: true });
    const hold = fakeDb([missing]);
    await expect(setSaleOrderAcceptance(hold.db, "o1", "so1", "hold")).rejects.toThrow(/SQL 75/);
  });
});
