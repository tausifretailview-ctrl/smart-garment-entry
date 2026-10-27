import { describe, expect, it } from "vitest";
import {
  buildDcLineShares,
  dcOnlyShare,
  fetchDcLineShares,
  nonDcShare,
  saleRowOnlyDc,
  saleRowWithoutDc,
  saleRowsForDcView,
  saleRowsOnlyDc,
  saleRowsWithoutDc,
} from "./dcSaleShare";

describe("dcSaleShare", () => {
  it("keeps a bill with no DC line as it is", () => {
    expect(nonDcShare(undefined)).toBe(1);
    const row = { id: "a", net_amount: 1000, cash_amount: 1000, total_qty: 3 };
    expect(saleRowWithoutDc(row, undefined)).toBe(row);
  });

  it("takes the DC part out of a mixed bill", () => {
    const shares = buildDcLineShares(
      [{ sale_id: "a", net_after_discount: 250, quantity: 1 }],
      [
        { sale_id: "a", net_after_discount: 250 },
        { sale_id: "a", net_after_discount: 750 },
        { sale_id: "b", net_after_discount: 400 },
      ],
    );
    expect(shares.get("a")).toEqual({ dcNet: 250, allNet: 1000, dcQty: 1 });
    expect(shares.has("b")).toBe(false);
    const out = saleRowWithoutDc(
      { id: "a", net_amount: 1000, cash_amount: 600, upi_amount: 400, total_qty: 3, sale_number: "POS/1" },
      shares.get("a"),
    );
    expect(out).toMatchObject({ net_amount: 750, cash_amount: 450, upi_amount: 300, total_qty: 2, sale_number: "POS/1" });
  });

  it("drops a bill whose every line is DC", async () => {
    const lines: Record<string, Array<Record<string, unknown>>> = {
      dc: [{ sale_id: "a", net_after_discount: 500, line_total: 500, quantity: 2 }],
      all: [{ sale_id: "a", net_after_discount: 500, line_total: 500 }],
    };
    const client = {
      from: () => {
        let dcOnly = false;
        const q = {
          select: () => q,
          in: () => q,
          is: () => Promise.resolve({ data: dcOnly ? lines.dc : lines.all, error: null }),
          eq: () => {
            dcOnly = true;
            return q;
          },
        };
        return q;
      },
    };
    const rows = await saleRowsWithoutDc(client, [
      { id: "a", net_amount: 500 },
      { id: "c", net_amount: 300 },
    ]);
    expect(rows).toEqual([{ id: "c", net_amount: 300 }]);
  });

  it("DC User: keeps only the DC part of a mixed bill", () => {
    expect(dcOnlyShare(undefined)).toBe(0);
    expect(dcOnlyShare({ dcNet: 250, allNet: 1000, dcQty: 1 })).toBe(0.25);
    expect(dcOnlyShare({ dcNet: 0, allNet: 0, dcQty: 2 })).toBe(1);
    const out = saleRowOnlyDc(
      { id: "a", net_amount: 1000, cash_amount: 600, upi_amount: 400, total_qty: 3, sale_number: "POS/1" },
      { dcNet: 250, allNet: 1000, dcQty: 1 },
    );
    expect(out).toMatchObject({ net_amount: 250, cash_amount: 150, upi_amount: 100, total_qty: 1, sale_number: "POS/1" });
  });

  it("DC User: drops bills with no DC line", async () => {
    const lines: Record<string, Array<Record<string, unknown>>> = {
      dc: [{ sale_id: "a", net_after_discount: 500, line_total: 500, quantity: 2 }],
      all: [
        { sale_id: "a", net_after_discount: 500, line_total: 500 },
        { sale_id: "a", net_after_discount: 500, line_total: 500 },
      ],
    };
    const client = {
      from: () => {
        let dcOnly = false;
        const q = {
          select: () => q,
          in: () => q,
          is: () => Promise.resolve({ data: dcOnly ? lines.dc : lines.all, error: null }),
          eq: () => {
            dcOnly = true;
            return q;
          },
        };
        return q;
      },
    };
    const rows = await saleRowsOnlyDc(client, [
      { id: "a", net_amount: 1000, total_qty: 3 },
      { id: "c", net_amount: 300, total_qty: 1 },
    ]);
    expect(rows).toEqual([{ id: "a", net_amount: 500, total_qty: 2 }]);
    const same = [{ id: "z", net_amount: 1 }];
    expect(await saleRowsForDcView(client, same, {})).toBe(same);
  });
});

describe("fetchDcLineShares paging", () => {
  /** Fake PostgREST client: one table of rows, honours in(), eq(), range(). */
  function fakeClient(rows: Array<{ id: number; sale_id: string; is_dc_item: boolean; net_after_discount: number; line_total: number; quantity: number }>) {
    const calls: Array<{ from: number; to: number }> = [];
    const client = {
      from: () => {
        let list = rows;
        const q: any = {
          select: () => q,
          in: (_k: string, ids: string[]) => {
            list = list.filter((r) => ids.includes(r.sale_id));
            return q;
          },
          eq: (k: string, v: unknown) => {
            list = list.filter((r) => (r as any)[k] === v);
            return q;
          },
          is: () => q,
          order: () => q,
          range: (from: number, to: number) => {
            calls.push({ from, to });
            return Promise.resolve({ data: list.slice(from, to + 1), error: null });
          },
        };
        return q;
      },
    };
    return { client, calls };
  }

  it("reads past the 1,000-row cap so no bill loses lines", async () => {
    // 300 bills, 4 DC lines + 1 GST line each = 1,200 DC lines, 1,500 lines in all.
    const rows: any[] = [];
    let id = 0;
    for (let b = 0; b < 300; b++) {
      for (let l = 0; l < 4; l++) rows.push({ id: id++, sale_id: `s${b}`, is_dc_item: true, net_after_discount: 100, line_total: 100, quantity: 1 });
      rows.push({ id: id++, sale_id: `s${b}`, is_dc_item: false, net_after_discount: 400, line_total: 400, quantity: 1 });
    }
    const { client, calls } = fakeClient(rows);
    const shares = await fetchDcLineShares(client, rows.map((r) => r.sale_id));
    expect(shares.size).toBe(300);
    for (const s of shares.values()) {
      expect(s.dcNet).toBe(400);
      expect(s.allNet).toBe(800);
      expect(s.dcQty).toBe(4);
    }
    expect(calls.some((c) => c.from === 1000)).toBe(true);
  });
});
