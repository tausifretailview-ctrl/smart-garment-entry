import { describe, expect, it, vi } from "vitest";
import {
  INVOICE_LINE_ITEM_SALE_TYPES,
  POS_LINE_ITEM_SALE_TYPES,
  SEARCH_INVOICE_SALE_IDS_RPC,
  SEARCH_POS_SALE_IDS_RPC,
  buildLineItemSaleSearchArgs,
  fetchLineItemMatchingSaleIds,
  lineItemSearchDateBound,
  lineItemSearchWrapperRpc,
} from "./lineItemSaleSearch";

describe("lineItemSaleSearch", () => {
  it("slices ISO timestamps to yyyy-MM-dd (same as dashboard RPC callers today)", () => {
    expect(lineItemSearchDateBound("2026-08-01T18:29:59.999Z")).toBe("2026-08-01");
    expect(lineItemSearchDateBound("2026-08-01")).toBe("2026-08-01");
    expect(lineItemSearchDateBound(null)).toBeNull();
  });

  it("POS types stay pos + delivery_challan; invoice stays invoice-only", () => {
    expect([...POS_LINE_ITEM_SALE_TYPES]).toEqual(["pos", "delivery_challan"]);
    expect([...INVOICE_LINE_ITEM_SALE_TYPES]).toEqual(["invoice"]);
  });

  it("routes invoice search to search_invoice_sale_ids and POS to search_pos_sale_ids", () => {
    expect(lineItemSearchWrapperRpc(INVOICE_LINE_ITEM_SALE_TYPES)).toBe(
      SEARCH_INVOICE_SALE_IDS_RPC,
    );
    expect(lineItemSearchWrapperRpc(POS_LINE_ITEM_SALE_TYPES)).toBe(SEARCH_POS_SALE_IDS_RPC);
  });

  it("builds the shared RPC payload without mixing sale types", () => {
    const pos = buildLineItemSaleSearchArgs({
      organizationId: "org-1",
      search: "JEANS",
      dateFrom: "2026-08-01T00:00:00.000Z",
      dateTo: "2026-08-31T23:59:59.999Z",
      limit: 500,
      saleTypes: POS_LINE_ITEM_SALE_TYPES,
    });
    expect(pos).toEqual({
      p_org_id: "org-1",
      p_search: "JEANS",
      p_date_from: "2026-08-01",
      p_date_to: "2026-08-31",
      p_limit: 500,
      p_sale_types: ["pos", "delivery_challan"],
    });

    const inv = buildLineItemSaleSearchArgs({
      organizationId: "org-1",
      search: "JEANS",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      limit: 1000,
      saleTypes: INVOICE_LINE_ITEM_SALE_TYPES,
    });
    expect(inv.p_sale_types).toEqual(["invoice"]);
    expect(inv.p_limit).toBe(1000);
  });

  it("maps RPC rows to sale ids and cap meta (identical to previous dashboard helpers)", async () => {
    const client = {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        expect(fn).toBe(SEARCH_INVOICE_SALE_IDS_RPC);
        expect(args).not.toHaveProperty("p_sale_types");
        expect(args.p_org_id).toBe("org-1");
        expect(args.p_search).toBe("silk");
        expect(args.p_limit).toBe(1000);
        return {
          data: [{ sale_id: "s1" }, { sale_id: "s2" }, { sale_id: null }],
          error: null,
        };
      }),
    } as never;

    const args = buildLineItemSaleSearchArgs({
      organizationId: "org-1",
      search: "silk",
      dateFrom: null,
      dateTo: null,
      limit: 1000,
      saleTypes: INVOICE_LINE_ITEM_SALE_TYPES,
    });
    await expect(fetchLineItemMatchingSaleIds(client, args)).resolves.toEqual({
      saleIds: ["s1", "s2"],
      meta: { lineItemCapped: false, lineItemCap: 1000, lineItemCount: 2 },
    });
  });

  it("marks the cap when the RPC returns a full page", async () => {
    const client = {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        expect(fn).toBe(SEARCH_POS_SALE_IDS_RPC);
        expect(args).not.toHaveProperty("p_sale_types");
        return {
          data: [{ sale_id: "a" }, { sale_id: "b" }],
          error: null,
        };
      }),
    } as never;
    const args = buildLineItemSaleSearchArgs({
      organizationId: "org-1",
      search: "450006800",
      limit: 2,
      saleTypes: POS_LINE_ITEM_SALE_TYPES,
    });
    const result = await fetchLineItemMatchingSaleIds(client, args);
    expect(result.meta.lineItemCapped).toBe(true);
  });
});
