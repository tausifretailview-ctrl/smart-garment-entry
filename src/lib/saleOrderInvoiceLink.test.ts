import { describe, expect, it, vi } from "vitest";
import {
  isMissingColumnError,
  linkableSaleOrderLabel,
  markSaleOrderInvoiced,
  unmarkSaleOrderInvoiced,
} from "./saleOrderInvoiceLink";
import { CLOSED_SALE_ORDER_STATUSES } from "@/utils/saleOrderReservations";

function client(errors: Array<{ code?: string; message?: string } | null>) {
  const updates: unknown[] = [];
  const from = vi.fn(() => ({
    update: (body: unknown) => {
      updates.push(body);
      const res = { error: errors.shift() ?? null };
      const chain = { eq: () => chain, then: (f: (v: typeof res) => unknown) => Promise.resolve(res).then(f) };
      return chain;
    },
  }));
  return { sb: { from } as never, updates };
}

describe("Sale Bill → Sale Order No.", () => {
  it("marks the order Invoiced with the bill's id and number", async () => {
    const { sb, updates } = client([null]);
    await expect(markSaleOrderInvoiced(sb, "o1", { id: "s1", saleNumber: "INV/26-27/88" })).resolves.toBe(true);
    expect(updates[0]).toMatchObject({ status: "invoiced", invoiced_sale_id: "s1", invoiced_sale_number: "INV/26-27/88" });
  });

  it("before SQL 56 (no columns) still sets the status", async () => {
    const { sb, updates } = client([{ code: "PGRST204", message: "Could not find the 'invoiced_at' column" }, null]);
    await expect(markSaleOrderInvoiced(sb, "o1", { id: "s1", saleNumber: "INV/1" })).resolves.toBe(true);
    expect(updates[1]).toEqual({ status: "invoiced" });
  });

  it("reports other failures", async () => {
    const { sb } = client([{ code: "42501", message: "permission denied" }]);
    await expect(markSaleOrderInvoiced(sb, "o1", { id: "s1", saleNumber: "INV/1" })).resolves.toBe(false);
  });

  it("an order unlinked on edit goes back to Pending", async () => {
    const { sb, updates } = client([null]);
    await unmarkSaleOrderInvoiced(sb, "o1");
    expect(updates[0]).toMatchObject({ status: "pending", invoiced_sale_id: null, invoiced_sale_number: null });
  });

  it("an invoiced order is closed: no stock held, not in pending items", () => {
    expect(CLOSED_SALE_ORDER_STATUSES).toContain("invoiced");
  });

  it("labels and missing-column detection", () => {
    expect(
      linkableSaleOrderLabel({ id: "o", order_number: "SO/26-27/2017", order_date: "2026-11-25", net_amount: 18450.4, salesman: "RAJU", status: "pending" }),
    ).toBe("SO/26-27/2017 · 25/11/2026 · ₹18,450 · RAJU");
    expect(isMissingColumnError({ code: "42703" })).toBe(true);
    expect(isMissingColumnError({ message: 'column "invoiced_sale_id" does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: "23505" })).toBe(false);
  });
});
