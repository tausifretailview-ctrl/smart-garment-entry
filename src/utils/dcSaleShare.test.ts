import { describe, expect, it } from "vitest";
import {
  buildDcLineShares,
  dcOnlyShare,
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
