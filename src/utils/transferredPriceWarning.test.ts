import { beforeEach, describe, expect, it, vi } from "vitest";

const toastWarning = vi.fn();
vi.mock("sonner", () => ({ toast: { warning: (...args: unknown[]) => toastWarning(...args) } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  fetchTransferredPriceGaps,
  formatTransferredPriceWarning,
  resetTransferredPriceGapsProbe,
  warnTransferredPriceGaps,
  type TransferredPriceGap,
} from "./transferredPriceWarning";

const ORG = "a0000000-0000-0000-0000-00000000000a";
const gap = (n: number, shop = "ADEEBAAREEBA"): TransferredPriceGap => ({
  variant_id: `v${n}`,
  barcode: `65000304${n}`,
  product_name: "KURTI PLAZO",
  size: "L",
  sender_sale_price: "2225.00",
  to_shop: shop,
  receiver_sale_price: "2000.00",
  receiver_stock: 1,
  transfer_number: "ST/0013",
  accepted_at: "2026-11-24T07:41:44Z",
});
const clientAnswering = (answer: { data?: unknown; error?: unknown }) => {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { client: { rpc } as never, rpc };
};

describe("formatTransferredPriceWarning", () => {
  it("names the shop, both prices and the item", () => {
    const t = formatTransferredPriceWarning([gap(6)])!;
    expect(t.title).toBe("1 item(s) were sent to ADEEBAAREEBA at the old price");
    expect(t.description).toContain("KURTI PLAZO L (650003046): ADEEBAAREEBA sells at ₹2,000, here ₹2,225");
    expect(t.description).toContain("The price there did not change.");
  });

  it("lists five items, counts the rest, and counts several shops", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((n) => gap(n, n === 7 ? "SHOP C" : "ADEEBAAREEBA"));
    const t = formatTransferredPriceWarning(rows)!;
    expect(t.title).toBe("7 item(s) were sent to 2 other shops at the old price");
    expect(t.description.split("\n")).toHaveLength(7); // 5 items + "and 2 more" + closing line
    expect(t.description).toContain("and 2 more");
  });

  it("nothing to warn about: no text", () => {
    expect(formatTransferredPriceWarning([])).toBeNull();
  });
});

describe("fetchTransferredPriceGaps / warnTransferredPriceGaps", () => {
  beforeEach(() => {
    resetTransferredPriceGapsProbe();
    toastWarning.mockClear();
  });

  it("asks once per shop with the unique saved ids, and warns", async () => {
    const { client, rpc } = clientAnswering({ data: [gap(6)] });
    expect(await warnTransferredPriceGaps(ORG, ["v6", "v6", null, "v7", undefined], client)).toBe(1);
    expect(rpc).toHaveBeenCalledWith("get_transferred_price_gaps", { p_org_id: ORG, p_variant_ids: ["v6", "v7"] });
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastWarning.mock.calls[0][0]).toContain("ADEEBAAREEBA");
  });

  it("no gaps: no warning", async () => {
    const { client } = clientAnswering({ data: [] });
    expect(await warnTransferredPriceGaps(ORG, ["v1"], client)).toBe(0);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("no ids or no shop: the database is not asked", async () => {
    const { client, rpc } = clientAnswering({ data: [gap(1)] });
    expect(await fetchTransferredPriceGaps(client, ORG, [])).toEqual([]);
    expect(await warnTransferredPriceGaps(null, ["v1"], client)).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a database without the function is asked once, then left alone; errors never throw", async () => {
    const missing = clientAnswering({ error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await fetchTransferredPriceGaps(missing.client, ORG, ["v1"])).toEqual([]);
    expect(await fetchTransferredPriceGaps(missing.client, ORG, ["v2"])).toEqual([]);
    expect(missing.rpc).toHaveBeenCalledTimes(1);
    resetTransferredPriceGapsProbe();
    const failing = { rpc: vi.fn(async () => { throw new Error("offline"); }) } as never;
    expect(await warnTransferredPriceGaps(ORG, ["v1"], failing)).toBe(0);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("more than 1000 ids are asked in parts", async () => {
    const { client, rpc } = clientAnswering({ data: [] });
    await fetchTransferredPriceGaps(client, ORG, Array.from({ length: 1500 }, (_, i) => `v${i}`));
    expect(rpc).toHaveBeenCalledTimes(2);
    expect((rpc.mock.calls[1] as unknown[])[1]).toMatchObject({ p_variant_ids: expect.arrayContaining(["v1499"]) });
  });
});
