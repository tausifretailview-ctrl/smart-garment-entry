import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSalesHeaderMatchIds,
  NO_SALE_ID,
  resetSalesHeaderSearchProbe,
  SALES_HEADER_SEARCH_ID_CAP,
  saleIdsOrFilter,
} from "./salesHeaderSearch";
import { applyResolvedInvoiceSearch, type InvoiceSearchResolution } from "./invoiceDashboardData";

const ORG = "11111111-1111-1111-1111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const opts = (search: string) => ({ organizationId: ORG, search, saleTypes: ["invoice"], dateFrom: "2026-11-01T00:00:00", dateTo: null });

function clientAnswering(answer: { data?: unknown; error?: unknown } | Error) {
  const rpc = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return { data: answer.data ?? null, error: answer.error ?? null };
  });
  return { client: { rpc } as never, rpc };
}

describe("fetchSalesHeaderMatchIds", () => {
  beforeEach(() => resetSalesHeaderSearchProbe());

  it("asks the database for one more id than it can use, with the list's own date bounds", async () => {
    const { client, rpc } = clientAnswering({ data: [{ sale_id: id(1) }, { sale_id: id(2) }, { sale_id: id(1) }] });
    expect(await fetchSalesHeaderMatchIds(client, opts("  kiran "))).toEqual([id(1), id(2)]);
    expect(rpc).toHaveBeenCalledWith("search_sales_header_ids", {
      p_org_id: ORG,
      p_search: "kiran",
      p_sale_types: ["invoice"],
      p_date_from: "2026-11-01T00:00:00",
      p_date_to: null,
      p_limit: SALES_HEADER_SEARCH_ID_CAP + 1,
      p_with_salesman: true,
    });
  });

  it("an empty answer is a real answer: nothing matches", async () => {
    const { client } = clientAnswering({ data: [] });
    expect(await fetchSalesHeaderMatchIds(client, opts("zzqqxx"))).toEqual([]);
  });

  it("text under three characters is not sent (a trigram index cannot help)", async () => {
    const { client, rpc } = clientAnswering({ data: [] });
    expect(await fetchSalesHeaderMatchIds(client, opts("ab"))).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("more matches than the cap: null, so the table search is used", async () => {
    const rows = Array.from({ length: SALES_HEADER_SEARCH_ID_CAP + 1 }, (_, i) => ({ sale_id: id(i) }));
    const { client } = clientAnswering({ data: rows });
    expect(await fetchSalesHeaderMatchIds(client, opts("INV"))).toBeNull();
  });

  it("a database without the function is asked once, then left alone", async () => {
    const { client, rpc } = clientAnswering({ error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await fetchSalesHeaderMatchIds(client, opts("kiran"))).toBeNull();
    expect(await fetchSalesHeaderMatchIds(client, opts("kumar"))).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("any other failure, or an answer that is not a list, falls back without throwing", async () => {
    expect(await fetchSalesHeaderMatchIds(clientAnswering({ error: { code: "57014", message: "timeout" } }).client, opts("kiran"))).toBeNull();
    expect(await fetchSalesHeaderMatchIds(clientAnswering({ data: null }).client, opts("kiran"))).toBeNull();
    expect(await fetchSalesHeaderMatchIds(clientAnswering(new Error("offline")).client, opts("kiran"))).toBeNull();
  });
});

describe("saleIdsOrFilter", () => {
  it("lists the ids, or an id no bill has when there are none", () => {
    expect(saleIdsOrFilter([id(1), id(2)])).toBe(`id.in.(${id(1)},${id(2)})`);
    expect(saleIdsOrFilter([])).toBe(`id.in.(${NO_SALE_ID})`);
  });
});

describe("applyResolvedInvoiceSearch", () => {
  const TEXT = "sale_number.ilike.%kiran%,customer_name.ilike.%kiran%";
  const orOf = (resolution: InvoiceSearchResolution | null) => {
    const or = vi.fn((f: string) => ({ filter: f }));
    const out = applyResolvedInvoiceSearch({ or }, resolution);
    return or.mock.calls.length ? (or.mock.calls[0][0] as string) : out;
  };

  it("header ids known: bills are listed by id, with line-item matches added once", () => {
    expect(orOf({ saleTextFilter: TEXT, lineItemSaleIds: [id(2), id(3)], headerSaleIds: [id(1), id(2)] })).toBe(
      `id.in.(${id(1)},${id(2)},${id(3)})`,
    );
  });

  it("header ids known and nothing matches anywhere: no bill is listed", () => {
    expect(orOf({ saleTextFilter: TEXT, lineItemSaleIds: [], headerSaleIds: [] })).toBe(`id.in.(${NO_SALE_ID})`);
  });

  it("header ids not available: the text filter, as before", () => {
    expect(orOf({ saleTextFilter: TEXT, lineItemSaleIds: [], headerSaleIds: null })).toBe(TEXT);
    expect(orOf({ saleTextFilter: TEXT, lineItemSaleIds: [id(9)], headerSaleIds: null })).toBe(`${TEXT},id.in.(${id(9)})`);
  });

  it("too many ids for one request: the text filter, as before", () => {
    const many = Array.from({ length: 180 }, (_, i) => id(1000 + i));
    expect(orOf({ saleTextFilter: TEXT, lineItemSaleIds: many, headerSaleIds: Array.from({ length: 30 }, (_, i) => id(i)) })).toBe(
      `${TEXT},id.in.(${many.join(",")})`,
    );
  });

  it("no search: the query is left alone", () => {
    const q = { or: vi.fn() };
    expect(applyResolvedInvoiceSearch(q, null)).toBe(q);
    expect(q.or).not.toHaveBeenCalled();
  });
});
