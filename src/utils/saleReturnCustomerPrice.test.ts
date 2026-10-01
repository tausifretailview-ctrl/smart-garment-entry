import { describe, expect, it, vi } from "vitest";
import {
  fetchCustomerLastSaleItem,
  resolveCustomerLastSaleReturnPrice,
} from "./saleReturnCustomerPrice";

function mockClient(rows: unknown[] | null, error: unknown = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    calls.push(["limit", ...args]);
    return Promise.resolve({ data: rows, error });
  };
  const from = vi.fn(() => chain);
  return { client: { from } as never, from, calls };
}

const args = { organizationId: "org-1", customerId: "cust-1", variantId: "var-1" };

const saleRow = (over: Record<string, unknown> = {}, sale: Record<string, unknown> = {}) => ({
  unit_price: 1000,
  quantity: 1,
  line_total: 900,
  per_qty_net_amount: 900,
  net_after_discount: 900,
  discount_percent: 10,
  sales: { flat_discount_amount: 0, round_off: 0, is_cancelled: false, payment_status: "completed", ...sale },
  ...over,
});

describe("fetchCustomerLastSaleItem", () => {
  it("scopes the query to the organization, customer and variant", async () => {
    const { client, from, calls } = mockClient([saleRow()]);
    await fetchCustomerLastSaleItem(client, args);
    expect(from).toHaveBeenCalledWith("sale_items");
    expect(calls).toContainEqual(["eq", "variant_id", "var-1"]);
    expect(calls).toContainEqual(["eq", "sales.organization_id", "org-1"]);
    expect(calls).toContainEqual(["eq", "sales.customer_id", "cust-1"]);
    expect(calls).toContainEqual(["is", "sales.deleted_at", null]);
    expect(calls).toContainEqual(["is", "deleted_at", null]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("skips cancelled bills and uses the next most recent one", async () => {
    const { client } = mockClient([
      saleRow({ line_total: 500 }, { is_cancelled: true }),
      saleRow({ line_total: 800 }, { payment_status: "cancelled" }),
      saleRow({ line_total: 900 }),
    ]);
    const hit = await fetchCustomerLastSaleItem(client, args);
    expect(hit?.item.line_total).toBe(900);
  });

  it("returns null when the customer never bought the variant, or the query fails", async () => {
    expect(await fetchCustomerLastSaleItem(mockClient([]).client, args)).toBeNull();
    expect(await fetchCustomerLastSaleItem(mockClient(null, { message: "boom" }).client, args)).toBeNull();
    expect(
      await fetchCustomerLastSaleItem(mockClient([saleRow({}, { is_cancelled: true })]).client, args),
    ).toBeNull();
  });

  it("carries the bill flat discount and round-off of that sale", async () => {
    const { client } = mockClient([saleRow({}, { flat_discount_amount: 50, round_off: -0.4 })]);
    const hit = await fetchCustomerLastSaleItem(client, args);
    expect(hit).toMatchObject({ billFlatDiscount: 50, billRoundOff: -0.4 });
  });

  it("accepts the joined sale as an array", async () => {
    const { client } = mockClient([
      { ...saleRow(), sales: [{ flat_discount_amount: 20, round_off: 0, is_cancelled: false }] },
    ]);
    expect((await fetchCustomerLastSaleItem(client, args))?.billFlatDiscount).toBe(20);
  });
});

describe("resolveCustomerLastSaleReturnPrice", () => {
  it("returns the discounted price the customer paid when the setting is OFF", async () => {
    const { client } = mockClient([saleRow()]);
    expect(await resolveCustomerLastSaleReturnPrice(client, args, { useOriginalPrice: false })).toBe(900);
  });

  it("returns the pre-discount price when the setting is ON", async () => {
    const { client } = mockClient([saleRow()]);
    expect(await resolveCustomerLastSaleReturnPrice(client, args, { useOriginalPrice: true })).toBe(1000);
  });

  it("uses the bill's flat-discounted per-unit amount when the bill had a flat discount", async () => {
    const { client } = mockClient([
      saleRow(
        { net_after_discount: 850, per_qty_net_amount: 850 },
        { flat_discount_amount: 50 },
      ),
    ]);
    expect(await resolveCustomerLastSaleReturnPrice(client, args, { useOriginalPrice: false })).toBe(850);
  });

  it("returns null when there is no previous purchase", async () => {
    const { client } = mockClient([]);
    expect(await resolveCustomerLastSaleReturnPrice(client, args, {})).toBeNull();
  });
});
